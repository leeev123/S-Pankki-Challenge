import json
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).resolve().parents[1] / "data" / "app_state.json"

# Esimääritellyt oletusprofiilit kolmelle asiakasluokalle
PERSONA_DEFAULTS: dict[str, dict[str, Any]] = {
    "CUST_ONNI": {
        "display_name": "Onni Opiskelija",
        "role_label": "Opiskelija, 23 v",
        "priorities": ["Edullinen kotiruoka", "Opiskelijatapahtumat"],
        "cut_from": ["Kahvilat", "Pikaruoka"],
        "monthly_savings_target_eur": 80.0,
        "buffer_target_eur": 500.0,
        "current_buffer_eur": 240.0,
        "bonus_eur": 3.42,
        "bonus_next_tier_eur": 82.10,
    },
    "CUST_ENNI": {
        "display_name": "Enni Eläkeläinen",
        "role_label": "Eläkeläinen, 71 v",
        "priorities": ["Terveys & hyvinvointi", "Kotimainen ruoka"],
        "cut_from": ["Heräteostokset", "Lehdet & tilaukset"],
        "monthly_savings_target_eur": 180.0,
        "buffer_target_eur": 2500.0,
        "current_buffer_eur": 1950.0,
        "bonus_eur": 8.95,
        "bonus_next_tier_eur": 34.50,
    },
    "CUST_ANNI": {
        "display_name": "Anni Asiantuntija",
        "role_label": "Työssäkäyvä, 31 v",
        "priorities": ["Laadukas arkiruoka", "Liikunta & harrastukset"],
        "cut_from": ["Kahvilat", "Taksit"],
        "monthly_savings_target_eur": 300.0,
        "buffer_target_eur": 2000.0,
        "current_buffer_eur": 1150.0,
        "bonus_eur": 6.84,
        "bonus_next_tier_eur": 58.08,
    },
}


def _load_db() -> dict[str, Any]:
    if not DB_PATH.exists():
        return {"profiles": {}, "histories": {}}
    try:
        return json.loads(DB_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"profiles": {}, "histories": {}}


def _save_db(data: dict[str, Any]) -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    DB_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def get_profile(customer_id: str) -> dict[str, Any]:
    """Hakee profiilin tai alustaa sen asiakasluokan (Onni, Enni, Anni, Oma) mukaan."""
    db = _load_db()
    if customer_id in db["profiles"]:
        return db["profiles"][customer_id]

    preset = PERSONA_DEFAULTS.get(customer_id, {
        "display_name": "Oma tiliote",
        "role_label": "Tuotu Excel-tiliote",
        "priorities": ["Laadukas arkiruoka", "Säästäminen"],
        "cut_from": ["Kahvilat", "Taksit"],
        "monthly_savings_target_eur": 200.0,
        "buffer_target_eur": 1500.0,
        "current_buffer_eur": 850.0,
        "bonus_eur": 6.84,
        "bonus_next_tier_eur": 58.08,
    })

    return {
        "customer_id": customer_id,
        "s_ai_enabled": False,  # Alkaa aina perinteisenä S-mobiilina ennen aktivointia
        "onboarded": False,
        "everyday_adjustment_eur": 0.0,
        "active_goal": None,
        **preset,
    }


def save_profile(customer_id: str, profile: dict[str, Any]) -> dict[str, Any]:
    db = _load_db()
    db["profiles"][customer_id] = profile
    _save_db(db)
    return profile


def get_history(customer_id: str) -> list[dict[str, Any]]:
    db = _load_db()
    return db["histories"].get(customer_id, [])


def append_history(customer_id: str, message: dict[str, Any]) -> list[dict[str, Any]]:
    db = _load_db()
    history = db["histories"].setdefault(customer_id, [])
    history.append(message)
    db["histories"][customer_id] = history[-30:]
    _save_db(db)
    return db["histories"][customer_id]