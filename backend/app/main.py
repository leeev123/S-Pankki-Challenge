from pathlib import Path
import os
import shutil
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from agent.orchestrator import GEMINI_MODEL, run_agent
from app.database import append_history, get_history, get_profile, reset_statement_state, save_profile
from app.schemas import ApplyPlanRequest, ChatRequest, ChatResponse, OnboardingRequest
from finance.engine import (
    DATA_DIR,
    SAMPLE_TX_PATH,
    build_agent_statement_context,
    find_uploaded_statement_path,
    get_financial_snapshot,
    load_statement_transactions,
)

ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=ENV_PATH)

app = FastAPI(title="Suunta API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def api_health():
    key = os.getenv("GEMINI_API_KEY", "").strip()
    return {
        "ok": True,
        "agent_ready": bool(key and key != "your_api_key_here"),
        "model": GEMINI_MODEL,
        "sample_db_exists": SAMPLE_TX_PATH.exists(),
    }


@app.get("/api/sample-statement")
def api_download_sample():
    """Tarjoaa sample_transactions.csv-mallitiedoston helposti ladattavaksi myös puhelimella."""
    if not SAMPLE_TX_PATH.exists():
        raise HTTPException(status_code=404, detail="sample_transactions.csv puuttuu backend/data-kansiosta.")
    return FileResponse(
        path=str(SAMPLE_TX_PATH),
        filename="mallitiliote.csv",
        media_type="text/csv; charset=utf-8",
    )


@app.get("/api/state/{statement_id}")
def api_state(statement_id: str):
    return {
        "snapshot": get_financial_snapshot(statement_id),
        "history": get_history(statement_id),
    }


@app.post("/api/upload-statement/{statement_id}")
async def api_upload_statement(statement_id: str, file: UploadFile = File(...)):
    """Tallentaa käyttäjän tuoman tiedostomuotoisen tiliotteen (.xlsx, .xls, .csv) ja päivittää luvut."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Valitse tiedosto.")

    ext = Path(file.filename).suffix.lower()
    if ext not in (".xlsx", ".xls", ".csv"):
        raise HTTPException(status_code=400, detail="Lataa .xlsx-, .xls- tai .csv-muotoinen tiliote.")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    # Poistetaan saman istunnon mahdolliset aiemmat ladatut tiedostot
    for old_ext in (".xlsx", ".xls", ".csv"):
        (DATA_DIR / f"uploaded_{statement_id}{old_ext}").unlink(missing_ok=True)

    target_path = DATA_DIR / f"uploaded_{statement_id}{ext}"
    with target_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    load_statement_transactions.cache_clear()

    try:
        snapshot = get_financial_snapshot(statement_id)
    except Exception as exc:
        target_path.unlink(missing_ok=True)
        load_statement_transactions.cache_clear()
        raise HTTPException(status_code=400, detail=f"Tiedoston luku epäonnistui: {exc}") from exc

    profile = get_profile(statement_id)
    profile["file_name"] = file.filename
    save_profile(statement_id, profile)

    append_history(
        statement_id,
        {
            "role": "assistant",
            "content": f"Tiliote **{file.filename}** ladattu! Analysoin kolme kulutuskoria ja viikoittaisen käyttövarasi.",
            "action_cards": [],
        },
    )
    return {"snapshot": get_financial_snapshot(statement_id), "history": get_history(statement_id)}


@app.post("/api/reset/{statement_id}")
def api_reset(statement_id: str):
    """Nollaa tuodun tiliotteen ja keskustelun demotilan alusta."""
    uploaded = find_uploaded_statement_path(statement_id)
    if uploaded is not None:
        uploaded.unlink(missing_ok=True)
    load_statement_transactions.cache_clear()
    reset_statement_state(statement_id)
    return {
        "snapshot": get_financial_snapshot(statement_id),
        "history": get_history(statement_id),
    }


@app.post("/api/onboarding")
def api_onboarding(payload: OnboardingRequest):
    """Aktivoi Suunnan ja tallentaa käyttäjän henkilökohtaiset arvot sekä tavoitteen."""
    profile = get_profile(payload.statement_id)
    profile.update({
        "suunta_enabled": payload.suunta_enabled,
        "onboarded": True,
        "priorities": payload.priorities,
        "cut_from": payload.cut_from,
        "monthly_savings_target_eur": payload.savings_goal_monthly_eur,
        "active_goal": {
            "name": payload.savings_goal_name,
            "target_eur": 1200.0,
        },
    })
    save_profile(payload.statement_id, profile)
    return {"snapshot": get_financial_snapshot(payload.statement_id)}


@app.post("/api/toggle-suunta/{statement_id}")
def api_toggle_suunta(statement_id: str, enabled: bool = True):
    """Vaihtaa perinteisen pankkinäkymän ja Suunta-näkymän välillä."""
    profile = get_profile(statement_id)
    profile["suunta_enabled"] = enabled
    save_profile(statement_id, profile)
    return {"snapshot": get_financial_snapshot(statement_id)}


@app.post("/api/chat", response_model=ChatResponse)
def api_chat(payload: ChatRequest):
    # 1. Pääkoodi hakee tiliotetiedot tietokannasta (sample_transactions.csv / ladattu tiedosto)
    statement_context = build_agent_statement_context(payload.statement_id)

    append_history(payload.statement_id, {"role": "user", "content": payload.message, "action_cards": []})
    history = get_history(payload.statement_id)

    # 2. Pääkoodi antaa tiedot tekoälyagentille, joka kutsuu laskentaohjelmaa (engine.py)
    result = run_agent(payload.statement_id, payload.message, history)

    append_history(
        payload.statement_id,
        {"role": "assistant", "content": result["reply"], "action_cards": result["action_cards"]},
    )

    return ChatResponse(
        reply=result["reply"],
        action_cards=result["action_cards"],
        updated_state=get_financial_snapshot(payload.statement_id),
    )


@app.post("/api/apply-plan")
def api_apply_plan(payload: ApplyPlanRequest):
    profile = get_profile(payload.statement_id)
    profile["monthly_savings_target_eur"] = max(
        0.0, float(profile.get("monthly_savings_target_eur", 200.0)) + payload.monthly_savings_delta_eur
    )
    profile["everyday_adjustment_eur"] = (
        float(profile.get("everyday_adjustment_eur", 0.0)) + payload.everyday_budget_delta_eur
    )
    profile["current_buffer_eur"] = max(
        0.0, float(profile.get("current_buffer_eur", 850.0)) + payload.buffer_delta_eur
    )
    if payload.goal_name:
        profile["active_goal"] = {
            "name": payload.goal_name,
            "target_eur": payload.goal_target_eur or 1200.0,
        }
    save_profile(payload.statement_id, profile)

    confirm_msg = f"Suunnitelma **{payload.title}** hyväksytty! Päivitin viikoittaisen käyttövarasi ja tavoitteesi."
    append_history(payload.statement_id, {"role": "assistant", "content": confirm_msg, "action_cards": []})
    return {"snapshot": get_financial_snapshot(payload.statement_id), "history": get_history(payload.statement_id)}


FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")