import json
from pathlib import Path
from typing import Any

# Tallennustiedosto sijaitsee backend/data/app_state.json -polussa
DB_PATH = Path(__file__).resolve().parents[1] / "data" / "app_state.json"


def _load_db() -> dict[str, Any]:
    """Lukee JSON-tietokannan levyltä. Jos tiedostoa ei ole, palauttaa tyhjän rakenteen."""
    if not DB_PATH.exists():
        return {"profiles": {}, "histories": {}}
    try:
        return json.loads(DB_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"profiles": {}, "histories": {}}


def _save_db(data: dict[str, Any]) -> None:
    """Tallentaa koko tilan takaisin JSON-tiedostoon."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    DB_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def get_profile(customer_id: str) -> dict[str, Any]:
    """Hakee asiakkaan henkilökohtaisen budjettiprofiilin (tai luo oletusprofiilin)."""
    db = _load_db()
    return db["profiles"].get(
        customer_id,
        {
            "customer_id": customer_id,
            "onboarded": False,
            "priorities": ["Laadukas arkiruoka", "Vapaa-aika"],
            "cut_from": ["Kahvilat", "Taksit"],
            "monthly_savings_target_eur": 250.0,
            "buffer_target_eur": 1500.0,
            "current_buffer_eur": 850.0,
            "everyday_adjustment_eur": 0.0,
            "active_goal": None,
        },
    )


def save_profile(customer_id: str, profile: dict[str, Any]) -> dict[str, Any]:
    """Tallentaa muokatun budjettiprofiilin (esim. kun käyttäjä hyväksyy suunnitelman)."""
    db = _load_db()
    db["profiles"][customer_id] = profile
    _save_db(db)
    return profile


def get_history(customer_id: str) -> list[dict[str, Any]]:
    """Hakee asiakkaan aiemman keskusteluhistorian."""
    db = _load_db()
    return db["histories"].get(customer_id, [])


def append_history(customer_id: str, message: dict[str, Any]) -> list[dict[str, Any]]:
    """Lisää uuden viestin historiaan ja säilyttää viimeiset 30 viestiä."""
    db = _load_db()
    history = db["histories"].setdefault(customer_id, [])
    history.append(message)
    db["histories"][customer_id] = history[-30:]
    _save_db(db)
    return db["histories"][customer_id]