from pathlib import Path
import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from agent.orchestrator import get_active_model_name, run_agent
from app.database import (
    _load_db,
    _save_db,
    append_history,
    get_history,
    get_profile,
    reset_all_state,
    reset_statement_state,
    save_profile,
)
from app.schemas import ApplyPlanRequest, ChatRequest, ChatResponse, OnboardingRequest
from finance.engine import SAMPLE_CUST_PATH, SAMPLE_TX_PATH, get_financial_snapshot, list_customers

ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=ENV_PATH)

app = FastAPI(title="Suunta API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def disable_static_cache(request: Request, call_next):
    response = await call_next(request)
    if not request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
    return response


@app.get("/api/health")
def api_health():
    key = os.getenv("GEMINI_API_KEY", "").strip()
    return {
        "ok": True,
        "agent_ready": bool(key and key != "your_api_key_here"),
        "model": get_active_model_name(),
        "sample_db_exists": SAMPLE_TX_PATH.exists() and SAMPLE_CUST_PATH.exists(),
    }


@app.get("/api/customers")
def api_customers():
    try:
        return {"customers": list_customers()}
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/state/{statement_id}")
def api_state(statement_id: str):
    try:
        return {"snapshot": get_financial_snapshot(statement_id), "history": get_history(statement_id)}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/onboarding")
def api_onboarding(payload: OnboardingRequest):
    profile = get_profile(payload.statement_id)
    existing_goal = profile.get("active_goal")
    target_eur = existing_goal.get("target_eur", 1200.0) if isinstance(existing_goal, dict) else 1200.0

    updates = {
        "suunta_enabled": payload.suunta_enabled,
        "onboarded": True,
        "priorities": payload.priorities,
        "cut_from": payload.cut_from,
        "monthly_savings_target_eur": payload.savings_goal_monthly_eur,
        "everyday_adjustment_eur": 0.0,
        "active_goal": {"name": payload.savings_goal_name, "target_eur": target_eur},
    }
    if payload.monthly_income_eur is not None and payload.monthly_income_eur >= 0:
        updates["custom_monthly_income_eur"] = payload.monthly_income_eur
    if payload.mandatory_regular_eur is not None and payload.mandatory_regular_eur >= 0:
        updates["custom_mandatory_regular_eur"] = payload.mandatory_regular_eur
    if payload.everyday_monthly_eur is not None and payload.everyday_monthly_eur >= 0:
        updates["custom_everyday_monthly_eur"] = payload.everyday_monthly_eur

    profile.update(updates)
    save_profile(payload.statement_id, profile)
    snap = get_financial_snapshot(payload.statement_id)

    history = get_history(payload.statement_id)
    if snap.get("is_monthly_deficit") and not history:
        if payload.lang == "en":
            deficit_msg = (
                f"Based on your numbers, your monthly expenses (**{snap['total_monthly_expenses_eur']:.0f} €/mo**) "
                f"exceed your regular income (**{snap['monthly_income_eur']:.0f} €/mo**) by about **{snap['monthly_deficit_eur']:.0f} €** per month. "
                f"Your initial weekly budget (**{snap['weekly_budget_eur']:.0f} €/wk**) is backed by your available account funds.\n\n"
                f"Could you briefly tell me about your life situation and how you cover this gap (e.g. savings, student loan, or other support) "
                f"so we can build a realistic, sustainable budget?"
            )
        else:
            deficit_msg = (
                f"Huomasin lukujesi perusteella, että kuukausittaiset menot (**{snap['total_monthly_expenses_eur']:.0f} €/kk**) "
                f"ylittävät säännölliset tulot (**{snap['monthly_income_eur']:.0f} €/kk**) noin **{snap['monthly_deficit_eur']:.0f} eurolla** kuukaudessa. "
                f"Alustava viikkobudjettisi (**{snap['weekly_budget_eur']:.0f} €/vk**) on laskettu tilillä olevien varojen turvin.\n\n"
                f"Kerrotko lyhyesti elämäntilanteestasi ja miten rahoitat tämän erotuksen (esim. säästöt, opintolaina tai muu tuki), "
                f"niin rakennetaan sinulle realistinen ja kestävä budjetti?"
            )
        append_history(payload.statement_id, {"role": "assistant", "content": deficit_msg, "action_cards": []})

    return {"snapshot": snap, "history": get_history(payload.statement_id)}


@app.post("/api/deficit-help/{statement_id}")
def api_deficit_help(statement_id: str, lang: str = "fi"):
    prompt_msg = (
        "Your weekly budget is currently in deficit. How can I help – would you like to adjust your savings pace, extend your goal timeline, or review your expenses?"
        if lang == "en"
        else "Viikkobudjettisi on tällä hetkellä alijäämäinen. Missä tarvitset apua – haluatko muokata säästötahtiasi, pidentää tavoitteen aikataulua vai käydä läpi arjen menoja?"
    )
    hist = get_history(statement_id)
    if not hist or hist[-1].get("content") != prompt_msg:
        append_history(statement_id, {"role": "assistant", "content": prompt_msg, "action_cards": []})
    return {"snapshot": get_financial_snapshot(statement_id), "history": get_history(statement_id)}


@app.post("/api/toggle-suunta/{statement_id}")
def api_toggle_suunta(statement_id: str, enabled: bool = True):
    profile = get_profile(statement_id)
    profile["suunta_enabled"] = enabled
    save_profile(statement_id, profile)
    return {"snapshot": get_financial_snapshot(statement_id)}


@app.post("/api/reset/{statement_id}")
def api_reset_statement(statement_id: str):
    reset_statement_state(statement_id)
    return {"snapshot": get_financial_snapshot(statement_id), "history": get_history(statement_id)}


@app.post("/api/reset-all")
def api_reset_all():
    reset_all_state()
    return {"ok": True}


@app.post("/api/chat", response_model=ChatResponse)
def api_chat(payload: ChatRequest):
    append_history(payload.statement_id, {"role": "user", "content": payload.message, "action_cards": []})
    history = get_history(payload.statement_id)
    result = run_agent(payload.statement_id, payload.message, history, lang=payload.lang)
    append_history(payload.statement_id, {"role": "assistant", "content": result["reply"], "action_cards": result["action_cards"]})
    return ChatResponse(
        reply=result["reply"],
        action_cards=result["action_cards"],
        updated_state=get_financial_snapshot(payload.statement_id),
    )


def _mark_plan_selected_in_history(statement_id: str, plan_id: str) -> None:
    db = _load_db()
    hist = db.get("histories", {}).get(statement_id, [])
    for msg in reversed(hist):
        if msg.get("action_cards") and not msg.get("selected_plan_id"):
            msg["selected_plan_id"] = plan_id
            break
    _save_db(db)


@app.post("/api/apply-plan")
def api_apply_plan(payload: ApplyPlanRequest):
    profile = get_profile(payload.statement_id)
    snap = get_financial_snapshot(payload.statement_id)
    base_savings = float(snap["baskets_30d"]["monthly_savings_target_eur"])
    profile["onboarded"] = True

    if payload.plan_id == "__CLEAR_GOAL__":
        profile["active_goal"] = None
        profile["everyday_adjustment_eur"] = 0.0
        profile["monthly_savings_target_eur"] = 0.0
        save_profile(payload.statement_id, profile)
        return {"snapshot": get_financial_snapshot(payload.statement_id), "history": get_history(payload.statement_id)}

    if payload.plan_id.startswith("__EDIT_GOAL__"):
        profile["monthly_savings_target_eur"] = max(0.0, payload.monthly_savings_delta_eur)
        profile["everyday_adjustment_eur"] = 0.0
        if payload.goal_name:
            profile["active_goal"] = {"name": payload.goal_name, "target_eur": payload.goal_target_eur or 1200.0}
        save_profile(payload.statement_id, profile)
        return {"snapshot": get_financial_snapshot(payload.statement_id), "history": get_history(payload.statement_id)}

    if payload.plan_id.startswith("deficit_plan_") and payload.goal_name and payload.goal_target_eur:
        profile["deficit_funding_source"] = payload.goal_name
        profile["deficit_monthly_funding_eur"] = float(payload.goal_target_eur)
        profile["everyday_adjustment_eur"] = 0.0
    else:
        if payload.goal_name:
            profile["active_goal"] = {"name": payload.goal_name, "target_eur": payload.goal_target_eur or 1200.0}
        profile["monthly_savings_target_eur"] = max(0.0, base_savings + payload.monthly_savings_delta_eur)
        # Jos muutos ei johdu säästötavoitteen lisäyksestä (esim. yllättävä meno puskurista), viedään erilliseen säätöön
        if abs(payload.monthly_savings_delta_eur) < 0.01 and abs(payload.everyday_budget_delta_eur) > 0.01:
            profile["everyday_adjustment_eur"] = float(profile.get("everyday_adjustment_eur", 0.0)) + payload.everyday_budget_delta_eur

    profile["current_buffer_eur"] = max(0.0, float(profile.get("current_buffer_eur", 850.0)) + payload.buffer_delta_eur)
    save_profile(payload.statement_id, profile)

    _mark_plan_selected_in_history(payload.statement_id, payload.plan_id)
    confirm_msg = f"Plan **{payload.title}** applied." if payload.lang == "en" else f"Suunnitelma **{payload.title}** otettu käyttöön."
    append_history(payload.statement_id, {"role": "assistant", "content": confirm_msg, "status_type": "plan_confirmed", "action_cards": []})
    return {"snapshot": get_financial_snapshot(payload.statement_id), "history": get_history(payload.statement_id)}


FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")