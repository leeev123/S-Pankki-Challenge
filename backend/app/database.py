import threading
from typing import Any

_LOCK = threading.RLock()
_STATE: dict[str, dict[str, Any]] = {"profiles": {}, "histories": {}}


def _load_db() -> dict[str, Any]:
    return _STATE


def _save_db(data: dict[str, Any]) -> None:
    with _LOCK:
        for key in ("profiles", "histories"):
            while len(_STATE[key]) > 500:
                oldest = next(iter(_STATE[key]))
                _STATE[key].pop(oldest, None)

def get_profile(statement_id: str) -> dict[str, Any]:
    """Hakee profiilin tai alustaa puhtaan Suunta-oletusprofiilin."""
    db = _load_db()
    if statement_id in db["profiles"]:
        return db["profiles"][statement_id]

    return {
        "statement_id": statement_id,
        "display_name": "Asiakas",
        "file_name": None,
        "suunta_enabled": False,
        "onboarded": False,
        "priorities": ["Laadukas arkiruoka", "Liikunta & harrastukset"],
        "cut_from": ["Kahvilat", "Taksit"],
        "monthly_savings_target_eur": 150.0,
        "buffer_target_eur": 1500.0,
        "current_buffer_eur": 850.0,
        "everyday_adjustment_eur": 0.0,
        "bonus_eur": 23.40,
        "bonus_next_tier_eur": 56.70,
        "active_goal": None,
    }


def save_profile(statement_id: str, profile: dict[str, Any]) -> dict[str, Any]:
    db = _load_db()
    db["profiles"][statement_id] = profile
    _save_db(db)
    return profile


def get_history(statement_id: str) -> list[dict[str, Any]]:
    db = _load_db()
    return db["histories"].get(statement_id, [])


def append_history(statement_id: str, message: dict[str, Any]) -> list[dict[str, Any]]:
    db = _load_db()
    history = db["histories"].setdefault(statement_id, [])
    history.append(message)
    db["histories"][statement_id] = history[-30:]
    _save_db(db)
    return db["histories"][statement_id]


def reset_statement_state(statement_id: str) -> None:
    """Nollaa yhden asiakasprofiilin tilan ja keskustelut."""
    db = _load_db()
    db["profiles"].pop(statement_id, None)
    db["histories"].pop(statement_id, None)
    _save_db(db)


def reset_all_state() -> None:
    """Tyhjentää koko app_state.json-tiedoston uloskirjautumisen yhteydessä."""
    _save_db({"profiles": {}, "histories": {}})