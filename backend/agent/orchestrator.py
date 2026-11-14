from __future__ import annotations

import json
import logging
import os
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from agent.prompts import SUUNTA_SYSTEM_PROMPT
from agent.tools.finance_tools import (
    tool_find_savings_opportunities,
    tool_get_financial_summary,
    tool_simulate_category_cut,
    tool_simulate_purchase,
    tool_simulate_unexpected_expense,
)

ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=ENV_PATH)
load_dotenv()

logger = logging.getLogger(__name__)

PREFERRED_MODELS: list[str] = ["gemini-3.8-pro", "gemini-3.8-flash"]
_ACTIVE_MODEL: str | None = None
_DISCOVERED_MODELS: list[str] | None = None

AGENT_GUARDRAILS = """
EHDOTTOMAT VALMENNUS- JA MUOTOILUSÄÄNNÖT:
- Pidä vastaukset lyhyinä ja selkeinä (1–3 virkettä).
- JOS käyttäjän `weekly_safe_to_spend_eur` on negatiivinen (miinuksella) tai suunnitelma vetää arjen liian tiukalle, HUOMAUTA tästä rakentavasti heti ja ohjaa kestävämpään säästöstrategiaan (esim. kuukausisäästön maltillistaminen, pidempi tavoiteaika tai ei-tärkeiden menojen karsinta).
- KUN työkalu palauttaa toimintokortit, ÄLÄ luettele vaihtoehtoja tekstissä numeroituna listana! Kirjoita vain yksi lyhyt saatevirke (max 18 sanaa).
- Jos hankinnan hinta puuttuu tai kyseessä on suuri päätös (esim. talo/asunto/auto), älä kutsu `simulate_purchase`, vaan kysy 1–2 tarkentavaa kysymystä.
""".strip()

TOOL_DECLARATIONS_JSON: list[dict[str, Any]] = [
    {
        "name": "get_financial_summary",
        "description": "Hakee asiakkaan taloustilanteen: viikon käyttövaran, keskimääräisen kulutuksen, tulot, 3 kulutuskoria, puskurin ja prioriteetit.",
    },
    {
        "name": "find_savings_opportunities",
        "description": "Etsii säästömahdollisuudet koskematta käyttäjän prioriteetteihin.",
    },
    {
        "name": "simulate_purchase",
        "description": "Simuloi hinnaltaan tiedossa olevan hankinnan (alle 25 000 €) ja palauttaa toimintokortit. Älä kutsu tätä ilman hintaa tai asuntokaupoissa.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "item_name": {"type": "STRING", "description": "Hankinnan nimi suomeksi."},
                "price": {"type": "NUMBER", "description": "Hankinnan hinta euroina."},
            },
            "required": ["item_name", "price"],
        },
    },
    {
        "name": "simulate_category_cut",
        "description": "Laskee menokategorian vähentämisen kuukausi-, vuosi- ja viikkovaikutuksen.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "category": {"type": "STRING", "description": "Kategorian nimi, esim. 'ravintolat', 'kahvilat'."},
                "reduction_pct": {"type": "NUMBER", "description": "Vähennysprosentti 1–90."},
            },
            "required": ["category", "reduction_pct"],
        },
    },
    {
        "name": "simulate_unexpected_expense",
        "description": "Laskee yllättävän menon kattamisen puskurista ja 2 kk tasaussuunnitelman.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "description": {"type": "STRING", "description": "Kuvaus yllättävästä menosta."},
                "price": {"type": "NUMBER", "description": "Summa euroina."},
            },
            "required": ["description", "price"],
        },
    },
]


def get_active_model_name() -> str:
    return _ACTIVE_MODEL or os.getenv("GEMINI_MODEL", "gemini-3.8-flash")


def _discover_models(api_key: str) -> list[str]:
    global _DISCOVERED_MODELS
    if _DISCOVERED_MODELS is not None:
        return _DISCOVERED_MODELS
    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
    found: list[str] = []
    try:
        with urllib.request.urlopen(urllib.request.Request(url, method="GET"), timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        for m in payload.get("models") or []:
            if "generateContent" not in (m.get("supportedGenerationMethods") or []):
                continue
            name = str(m.get("name") or "").replace("models/", "").strip()
            skip_words = ("embedding", "imagen", "veo", "tts", "audio", "vision", "2.5-flash", "1.5")
            if name.startswith("gemini-") and not any(w in name for w in skip_words):
                found.append(name)
        found.sort(key=lambda s: ("3.8" in s, "pro" in s and "preview" not in s, "flash" in s, s), reverse=True)
    except Exception:
        pass
    _DISCOVERED_MODELS = found
    return found


def _candidate_models(api_key: str) -> list[str]:
    if _ACTIVE_MODEL:
        return [_ACTIVE_MODEL]
    candidates: list[str] = []
    env_model = os.getenv("GEMINI_MODEL", "").strip()
    if env_model and env_model not in ("gemini-4-hydrogen", "gemini-2.5-flash"):
        candidates.append(env_model)
    for m in PREFERRED_MODELS:
        if m not in candidates:
            candidates.append(m)
    for d in _discover_models(api_key)[:5]:
        if d not in candidates:
            candidates.append(d)
    return candidates


def _to_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).replace(" ", "").replace(",", "."))
    except (TypeError, ValueError):
        return default


def _extract_optional_euro(text: str) -> float | None:
    cleaned = text.replace(" ", "")
    match = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:€|eur|euroa|e\b|tonni)?", cleaned, re.IGNORECASE)
    if not match:
        return None
    val = _to_float(match.group(1), 0.0)
    if "tonni" in text.lower():
        val *= 1000.0
    return val if val > 0 else None


def _strip_redundant_list_when_cards(text: str, has_cards: bool) -> str:
    if not has_cards or not text:
        return text
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    kept = [ln for ln in lines if not re.match(r"^(\d+[\.\)]|[-•*])\s+", ln)]
    compact = " ".join(kept).strip()
    if not compact:
        return "Valitse alta sopivin vaihtoehto tai säädä tahtia liukusäätimellä:"
    sentences = re.split(r"(?<=[.!?])\s+", compact)
    return " ".join(sentences[:2]).strip()


def _build_rest_contents(history: list[dict[str, Any]], user_message: str) -> list[dict[str, Any]]:
    contents: list[dict[str, Any]] = []
    for msg in (history[-14:] if history else []):
        role = "model" if str(msg.get("role") or "").lower() in ("assistant", "model") else "user"
        text = str(msg.get("content") or msg.get("text") or "").strip()
        if not text:
            continue
        if contents and contents[-1]["role"] == role:
            if contents[-1]["parts"][0]["text"] != text:
                contents[-1]["parts"][0]["text"] += f"\n{text}"
        else:
            contents.append({"role": role, "parts": [{"text": text}]})
    clean_message = user_message.strip()
    if clean_message:
        if not contents or contents[-1]["role"] != "user":
            contents.append({"role": "user", "parts": [{"text": clean_message}]})
        elif contents[-1]["parts"][0]["text"] != clean_message:
            contents[-1]["parts"][0]["text"] += f"\n{clean_message}"
    return contents


def _execute_tool(statement_id: str, tool_name: str, args: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]] | None]:
    if tool_name == "get_financial_summary":
        return tool_get_financial_summary(statement_id), None
    if tool_name == "find_savings_opportunities":
        return tool_find_savings_opportunities(statement_id), None
    if tool_name == "simulate_purchase":
        item_name = str(args.get("item_name") or "").strip()
        price = _to_float(args.get("price"), 0.0)
        housing_words = ("talo", "asunto", "omakotitalo", "kaksio", "yksiö", "kolmio", "kiinteistö")
        if price <= 0 or price > 25000 or any(w in item_name.lower() for w in housing_words):
            snap = tool_get_financial_summary(statement_id)
            return {"note": "Kysy tarkentava kysymys hintaluokasta, säästöistä ja aikataulusta.", "financial_summary": snap}, []
        sim = tool_simulate_purchase(statement_id, item_name or "hankinta", price)
        return sim, list(sim.get("options", []))
    if tool_name == "simulate_category_cut":
        category = str(args.get("category") or "ravintolat").strip() or "ravintolat"
        pct = max(1.0, min(90.0, _to_float(args.get("reduction_pct"), 20.0)))
        cut_res = tool_simulate_category_cut(statement_id, category, pct)
        card = cut_res.get("action_card")
        cards = [card] if isinstance(card, dict) and cut_res.get("monthly_savings_eur", 0) > 0 else []
        return cut_res, cards
    if tool_name == "simulate_unexpected_expense":
        desc = str(args.get("description") or "yllättävä meno").strip() or "yllättävä meno"
        price = max(0.0, _to_float(args.get("price"), 0.0))
        if price <= 0:
            return {"error": "Kysy käyttäjältä menon summa."}, []
        exp_res = tool_simulate_unexpected_expense(statement_id, desc, price)
        card = exp_res.get("action_card")
        return exp_res, ([card] if isinstance(card, dict) else None)
    return {"error": f"Tuntematon työkalu: {tool_name}"}, None


def _call_gemini_rest(api_key: str, payload: dict[str, Any]) -> dict[str, Any]:
    global _ACTIVE_MODEL
    body_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    last_error = ""
    for model_name in _candidate_models(api_key):
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        req = urllib.request.Request(url, data=body_bytes, headers={"Content-Type": "application/json; charset=utf-8"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=28) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            if _ACTIVE_MODEL != model_name:
                _ACTIVE_MODEL = model_name
                logger.warning("Suunta AI kayttaa kielimallia: %s", model_name)
            return data
        except urllib.error.HTTPError as http_exc:
            err_body = http_exc.read().decode("utf-8", errors="replace")
            last_error = f"{model_name} -> HTTP {http_exc.code}: {err_body[:200]}"
            if http_exc.code in (404, 400) and _ACTIVE_MODEL == model_name:
                _ACTIVE_MODEL = None
            continue
        except Exception as exc:
            last_error = f"{model_name} -> {exc}"
            continue
    raise RuntimeError(f"Gemini REST -kutsu epaonnistui: {last_error}")


def _run_gemini_agent(statement_id: str, user_message: str, history: list[dict[str, Any]]) -> dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key or api_key in ("MY_GEMINI_API_KEY", "your_api_key_here"):
        raise RuntimeError("GEMINI_API_KEY puuttuu.")

    contents = _build_rest_contents(history, user_message)
    system_instruction = f"{SUUNTA_SYSTEM_PROMPT.strip()}\n\n{AGENT_GUARDRAILS}"
    action_cards: list[dict[str, Any]] = []
    final_reply = ""

    for _step in range(5):
        payload = {
            "systemInstruction": {"parts": [{"text": system_instruction}]},
            "contents": contents,
            "tools": [{"functionDeclarations": TOOL_DECLARATIONS_JSON}],
            "generationConfig": {"temperature": 0.3},
        }
        data = _call_gemini_rest(api_key, payload)
        candidates = data.get("candidates") or []
        if not candidates:
            break
        model_content = candidates[0].get("content") or {}
        parts = model_content.get("parts") or []
        fcalls = [p["functionCall"] for p in parts if isinstance(p, dict) and "functionCall" in p]
        if not fcalls:
            visible_texts = [
                str(p.get("text", "")).strip()
                for p in parts
                if isinstance(p, dict) and not p.get("thought") and str(p.get("text", "")).strip()
            ]
            final_reply = "\n\n".join(visible_texts).strip()
            break

        contents.append(model_content)
        fn_responses: list[dict[str, Any]] = []
        for fc in fcalls:
            tool_name = str(fc.get("name") or "").strip()
            if not tool_name:
                continue
            args = fc.get("args") if isinstance(fc.get("args"), dict) else {}
            result, new_cards = _execute_tool(statement_id, tool_name, args)
            if new_cards is not None:
                action_cards = new_cards
            fn_responses.append({"functionResponse": {"name": tool_name, "response": {"result": result}}})
        if not fn_responses:
            break
        contents.append({"role": "user", "parts": fn_responses})

    final_reply = _strip_redundant_list_when_cards(final_reply, bool(action_cards))
    if not final_reply:
        final_reply = "Valitse alta sopivin vaihtoehto tai säädä oma tahti liukusäätimellä:" if action_cards else "Kerrotko hieman tarkemmin tavoitteestasi?"
    return {"reply": final_reply, "action_cards": action_cards}


def _run_fallback_agent(statement_id: str, user_message: str) -> dict[str, Any]:
    snap = tool_get_financial_summary(statement_id)
    msg = user_message.lower()
    price = _extract_optional_euro(user_message)
    safe = snap["weekly_safe_to_spend_eur"]

    if any(w in msg for w in ("talo", "asunto", "omakotitalo", "asuntolaina")):
        return {
            "reply": f"Tulosi ovat keskimäärin **{snap['monthly_income_eur']:.0f} €/kk** ja puskurisi **{snap['profile'].get('current_buffer_eur', 850):.0f} €**. Minkä hintaluokan asuntoa tai taloa mietit ja millä aikataululla?",
            "action_cards": [],
        }
    if any(w in msg for w in ("ostaa", "ostan", "pyörä", "läppäri", "puhelin", "hankinta")):
        if price is None:
            return {"reply": "Minkä hintaista hankintaa suunnittelet?", "action_cards": []}
        sim = tool_simulate_purchase(statement_id, "hankinta", price)
        prefix = "Huomaa, että tämän viikon käyttövarasi on jo miinuksella — suosittelen rauhallista säästötahtia:" if safe < 0 else "Valitse alta sopivin vaihtoehto tai säädä oma tahti liukusäätimellä:"
        return {"reply": prefix, "action_cards": list(sim.get("options", []))}

    if safe < 0:
        return {
            "reply": f"Huomio: Tämän viikon käyttövarasi on **{safe:.0f} €** miinuksella. Suosittelen keventämään kuukausisäästöä *Säädä*-painikkeesta, jotta arki pysyy kestävällä pohjalla.",
            "action_cards": [],
        }
    return {"reply": f"Viikon käyttövarasi on **{safe:.0f} €** (budjetti {snap['weekly_budget_eur']:.0f} €/vk). Miten voin auttaa?", "action_cards": []}


def run_agent(statement_id: str, user_message: str, history: list[dict[str, Any]]) -> dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if api_key and api_key not in ("MY_GEMINI_API_KEY", "your_api_key_here"):
        try:
            return _run_gemini_agent(statement_id, user_message, history)
        except Exception as exc:
            logger.warning("Gemini-kutsu epaonnistui, kaytetaan varalogiikkaa: %s", exc)
    return _run_fallback_agent(statement_id, user_message)