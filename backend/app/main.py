from pathlib import Path
import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from agent.orchestrator import GEMINI_MODEL, run_agent
from app.database import append_history, get_history, get_profile, save_profile
from app.schemas import ApplyPlanRequest, ChatRequest, ChatResponse, OnboardingRequest
from finance.engine import (
    SAMPLE_CUST_PATH,
    SAMPLE_TX_PATH,
    get_financial_snapshot,
    list_customers,
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
        "sample_db_exists": SAMPLE_TX_PATH.exists() and SAMPLE_CUST_PATH.exists(),
    }


@app.get("/api/customers")
def api_customers():
    """Palauttaa datakansion 3 profiilia: Opiskelija, Työssäkäyvä, Eläkeläinen."""
    try:
        return {"customers": list_customers()}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/state/{statement_id}")
def api_state(statement_id: str):
    try:
        return {
            "snapshot": get_financial_snapshot(statement_id),
            "history": get_history(statement_id),
        }
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/onboarding")
def api_onboarding(payload: OnboardingRequest):
    """Tallentaa käyttäjän henkilökohtaiset arvot sekä tavoitteen ja aktivoi Suunnan."""
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
    """Vaihtaa perinteisen S-mobiilin ja Suunta-näkymän välillä ilman pop-upia."""
    profile = get_profile(statement_id)
    profile["suunta_enabled"] = enabled
    save_profile(statement_id, profile)
    return {"snapshot": get_financial_snapshot(statement_id)}


@app.post("/api/chat", response_model=ChatResponse)
def api_chat(payload: ChatRequest):
    append_history(payload.statement_id, {"role": "user", "content": payload.message, "action_cards": []})
    history = get_history(payload.statement_id)

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