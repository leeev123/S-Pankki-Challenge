from pathlib import Path
import shutil
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from agent.orchestrator import run_agent
from app.database import append_history, get_history, get_profile, save_profile
from app.schemas import ApplyPlanRequest, ChatRequest, ChatResponse, OnboardingRequest
from finance.engine import DATA_DIR, get_financial_snapshot, list_customers, load_customer_transactions

load_dotenv()

app = FastAPI(title="S-AI / Urho API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/customers")
def api_customers():
    return {"customers": list_customers()}


@app.get("/api/state/{customer_id}")
def api_state(customer_id: str):
    return {
        "snapshot": get_financial_snapshot(customer_id),
        "history": get_history(customer_id),
    }


@app.post("/api/upload-excel/{customer_id}")
async def api_upload_excel(customer_id: str, file: UploadFile = File(...)):
    """Tallentaa käyttäjän lataaman Excel-tiliotteen (.xlsx) ja päivittää luvut heti."""
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Lataa .xlsx-muotoinen Excel-tiedosto.")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    target_path = DATA_DIR / f"uploaded_{customer_id}.xlsx"

    with target_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    load_customer_transactions.cache_clear()

    try:
        snapshot = get_financial_snapshot(customer_id)
    except Exception as exc:
        target_path.unlink(missing_ok=True)
        load_customer_transactions.cache_clear()
        raise HTTPException(status_code=400, detail=f"Excelin luku epäonnistui: {exc}") from exc

    append_history(
        customer_id,
        {
            "role": "assistant",
            "content": f"Uusi Excel-tiliote **{file.filename}** ladattu! Analysoin kolme kulutuskoria ja viikoittaisen käyttövarasi.",
            "action_cards": [],
        },
    )
    return {"snapshot": snapshot, "history": get_history(customer_id)}


@app.post("/api/onboarding")
def api_onboarding(payload: OnboardingRequest):
    """Aktivoi S-AI:n ja tallentaa käyttäjän henkilökohtaiset arvot sekä tavoitteen."""
    profile = get_profile(payload.customer_id)
    profile.update({
        "s_ai_enabled": payload.s_ai_enabled,
        "onboarded": True,
        "priorities": payload.priorities,
        "cut_from": payload.cut_from,
        "monthly_savings_target_eur": payload.savings_goal_monthly_eur,
        "active_goal": {
            "name": payload.savings_goal_name,
            "target_eur": 1200.0,
        },
    })
    save_profile(payload.customer_id, profile)
    return {"snapshot": get_financial_snapshot(payload.customer_id)}


@app.post("/api/toggle-sai/{customer_id}")
def api_toggle_sai(customer_id: str, enabled: bool = True):
    """Vaihtaa perinteisen S-mobiilin ja S-AI-näkymän välillä."""
    profile = get_profile(customer_id)
    profile["s_ai_enabled"] = enabled
    save_profile(customer_id, profile)
    return {"snapshot": get_financial_snapshot(customer_id)}


@app.post("/api/chat", response_model=ChatResponse)
def api_chat(payload: ChatRequest):
    append_history(payload.customer_id, {"role": "user", "content": payload.message, "action_cards": []})
    history = get_history(payload.customer_id)

    result = run_agent(payload.customer_id, payload.message, history)
    append_history(
        payload.customer_id,
        {"role": "assistant", "content": result["reply"], "action_cards": result["action_cards"]},
    )

    return ChatResponse(
        reply=result["reply"],
        action_cards=result["action_cards"],
        updated_state=get_financial_snapshot(payload.customer_id),
    )


@app.post("/api/apply-plan")
def api_apply_plan(payload: ApplyPlanRequest):
    profile = get_profile(payload.customer_id)
    profile["monthly_savings_target_eur"] = max(
        0.0, float(profile.get("monthly_savings_target_eur", 250.0)) + payload.monthly_savings_delta_eur
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
    save_profile(payload.customer_id, profile)

    confirm_msg = f"Suunnitelma **{payload.title}** hyväksytty! Päivitin viikoittaisen käyttövarasi ja tavoitteesi."
    append_history(payload.customer_id, {"role": "assistant", "content": confirm_msg, "action_cards": []})
    return {"snapshot": get_financial_snapshot(payload.customer_id), "history": get_history(payload.customer_id)}


FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")