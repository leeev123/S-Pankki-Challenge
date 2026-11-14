"""
Suunta-agentin orkestroija (Orchestrator).
- Kytkee Google Geminin Function Calling -silmukalla suunta_engine-laskentaohjelmaan.
- Kaikki euromäärät ja toimintokortit (action_cards) lasketaan deterministisesti Pythonissa.
- Sisältää suomenkielisen varalogiikan, jos API-avain puuttuu tai yhteys epäonnistuu.
"""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from google import genai
from google.genai import types

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

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-4-hydrogen")
FALLBACK_GEMINI_MODEL = "gemini-2.5-flash"

AGENT_GUARDRAILS = """
TÄRKEÄT SUUNTA-TOIMINTASÄÄNNÖT:
- Älä koskaan tee henkilökohtaisia talouslaskelmia päässäsi. Kutsu aina Python-työkaluja.
- Älä muuta tai pyöristä työkalujen palauttamia lukuja ristiriitaisesti.
- Älä keksi action_cards-kortteja itse; käyttöliittymä muodostaa kortit suoraan Python-työkalujen palautuksista.
- Jos käyttäjä kertoo yllättävästä menosta tai hajonneesta laitteesta (esim. pesukone, autohuolto, lääkärilasku), kutsu työkalua simulate_unexpected_expense.
- Jos käyttäjä kysyy mistä voisi säästää, kutsu find_savings_opportunities, joka suojaa käyttäjän prioriteetit automaattisesti.
- Kunnioita käyttäjän prioriteetteja (profile.priorities) äläkä ehdota niistä leikkaamista automaattisesti.
- Vastaa ytimekkäästi (2–4 virkettä), ihmisläheisesti ja ilman moralisointia. Kysy korkeintaan yksi kysymys kerrallaan.
- Älä koskaan väitä muuttaneesi budjettia automaattisesti — käyttäjä hyväksyy muutoksen itse toimintokortista.
""".strip()

TOOL_DECLARATIONS: list[types.FunctionDeclaration] = [
    types.FunctionDeclaration(
        name="get_financial_summary",
        description=(
            "Hakee asiakkaan vahvistetun taloustilanteen: tilin saldon, viikon jäljellä olevan "
            "käyttövaran, 3 kulutuskoria, kategoriatiedot suomeksi, 6 kk ennusteen, puskurin ja prioriteetit."
        ),
        parameters=types.Schema(type=types.Type.OBJECT, properties={}),
    ),
    types.FunctionDeclaration(
        name="find_savings_opportunities",
        description=(
            "Etsii suunta_engine-laskennalla realistiset 10 % ja 20 % säästömahdollisuudet "
            "koskematta käyttäjän tärkeiksi merkitsemiin prioriteettikategorioihin."
        ),
        parameters=types.Schema(type=types.Type.OBJECT, properties={}),
    ),
    types.FunctionDeclaration(
        name="simulate_purchase",
        description=(
            "Simuloi suunnitellun hankinnan (esim. 1 200 € läppäri, pyörä, lomamatka) "
            "ja palauttaa kolme kestävää toteutusvaihtoehtoa toimintokortteina."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "item_name": types.Schema(
                    type=types.Type.STRING,
                    description="Hankinnan nimi suomeksi, esim. 'läppäri' tai 'pyörä'.",
                ),
                "price": types.Schema(
                    type=types.Type.NUMBER,
                    description="Hankinnan hinta euroina.",
                ),
            },
            required=["item_name", "price"],
        ),
    ),
    types.FunctionDeclaration(
        name="simulate_category_cut",
        description=(
            "Laskee menokategorian vähentämisen (esim. ravintolat -20 %) tarkan "
            "kuukausi-, vuosi- ja viikkovaikutuksen."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "category": types.Schema(
                    type=types.Type.STRING,
                    description="Kategorian nimi suomeksi tai englanniksi, esim. 'ravintolat', 'kahvilat', 'taksit'.",
                ),
                "reduction_pct": types.Schema(
                    type=types.Type.NUMBER,
                    description="Vähennysprosentti välillä 1–90, esim. 20.",
                ),
            },
            required=["category", "reduction_pct"],
        ),
    ),
    types.FunctionDeclaration(
        name="simulate_unexpected_expense",
        description=(
            "Laskee yllättävän menon (esim. autohuolto, pesukone, lääkäri) "
            "vaikutuksen puskuriin ja 2 kuukauden tasaussuunnitelman."
        ),
        parameters=types.Schema(
            type=types.Type.OBJECT,
            properties={
                "description": types.Schema(
                    type=types.Type.STRING,
                    description="Lyhyt kuvaus yllättävästä menosta, esim. 'autohuolto'.",
                ),
                "price": types.Schema(
                    type=types.Type.NUMBER,
                    description="Yllättävän menon summa euroina.",
                ),
            },
            required=["description", "price"],
        ),
    ),
]


def _to_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    try:
        cleaned = str(value).replace(" ", "").replace(",", ".")
        return float(cleaned)
    except (TypeError, ValueError):
        return default


def _extract_euro_amount(text: str, default: float = 1200.0) -> float:
    cleaned = text.replace(" ", "")
    match = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:€|eur|euroa|e\b)?", cleaned, re.IGNORECASE)
    if match:
        return _to_float(match.group(1), default)
    return default


def _first_part_text(content: types.Content) -> str:
    """Lukee Content-olion ensimmäisen tekstiosan tyyppiturvallisesti."""
    parts = content.parts
    if parts and len(parts) > 0:
        txt = parts[0].text
        if isinstance(txt, str):
            return txt
    return ""


def _build_gemini_contents(history: list[dict[str, Any]], user_message: str) -> list[types.Content]:
    """Muuntaa keskusteluhistorian vuorotteleviksi user/model-viesteiksi ilman duplikaatteja."""
    contents: list[types.Content] = []
    recent = history[-12:] if history else []

    for msg in recent:
        raw_role = str(msg.get("role") or "user").lower()
        role = "model" if raw_role in ("assistant", "model") else "user"
        text = str(msg.get("content") or msg.get("text") or "").strip()
        if not text:
            continue

        if contents and contents[-1].role == role:
            prev_text = _first_part_text(contents[-1])
            if prev_text != text:
                combined = f"{prev_text}\n{text}" if prev_text else text
                contents[-1] = types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=combined)],
                )
        else:
            contents.append(types.Content(role=role, parts=[types.Part.from_text(text=text)]))

    clean_message = user_message.strip()
    if clean_message:
        if not contents or contents[-1].role != "user":
            contents.append(types.Content(role="user", parts=[types.Part.from_text(text=clean_message)]))
        else:
            prev_user_text = _first_part_text(contents[-1])
            if prev_user_text != clean_message:
                combined = f"{prev_user_text}\n{clean_message}" if prev_user_text else clean_message
                contents[-1] = types.Content(
                    role="user",
                    parts=[types.Part.from_text(text=combined)],
                )

    return contents


def _execute_tool(
    statement_id: str,
    tool_name: str,
    args: dict[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]] | None]:
    if tool_name == "get_financial_summary":
        return tool_get_financial_summary(statement_id), None

    if tool_name == "find_savings_opportunities":
        return tool_find_savings_opportunities(statement_id), None

    if tool_name == "simulate_purchase":
        item_name = str(args.get("item_name") or "hankinta").strip() or "hankinta"
        price = max(0.0, _to_float(args.get("price"), 0.0))
        sim = tool_simulate_purchase(statement_id, item_name, price)
        options = sim.get("options") if isinstance(sim, dict) else None
        return sim, (list(options) if isinstance(options, list) else None)

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
        exp_res = tool_simulate_unexpected_expense(statement_id, desc, price)
        card = exp_res.get("action_card") if isinstance(exp_res, dict) else None
        return exp_res, ([card] if isinstance(card, dict) else None)

    return {"error": f"Tuntematon työkalu: {tool_name}"}, None


def _generate_with_model_fallback(
    client: genai.Client,
    contents: list[types.Content],
    config: types.GenerateContentConfig,
) -> Any:
    try:
        return client.models.generate_content(model=GEMINI_MODEL, contents=contents, config=config)
    except Exception as primary_exc:
        if GEMINI_MODEL != FALLBACK_GEMINI_MODEL:
            logger.info("Kokeillaan varamallia %s (%s)", FALLBACK_GEMINI_MODEL, primary_exc)
            return client.models.generate_content(model=FALLBACK_GEMINI_MODEL, contents=contents, config=config)
        raise


def _run_gemini_agent(
    statement_id: str,
    user_message: str,
    history: list[dict[str, Any]],
) -> dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key or api_key in ("MY_GEMINI_API_KEY", "your_api_key_here"):
        raise RuntimeError("GEMINI_API_KEY puuttuu.")

    client = genai.Client(api_key=api_key)
    contents = _build_gemini_contents(history, user_message)
    system_instruction = f"{SUUNTA_SYSTEM_PROMPT.strip()}\n\n{AGENT_GUARDRAILS}"
    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        tools=[types.Tool(function_declarations=TOOL_DECLARATIONS)],
    )

    action_cards: list[dict[str, Any]] = []
    final_reply = ""

    for _step in range(5):
        response = _generate_with_model_fallback(client, contents, config)

        function_calls = response.function_calls or []
        if not function_calls:
            raw_text = response.text
            final_reply = raw_text.strip() if isinstance(raw_text, str) else ""
            break

        candidates = response.candidates
        if candidates and len(candidates) > 0:
            candidate_content = candidates[0].content
            if candidate_content is not None:
                contents.append(candidate_content)

        function_response_parts: list[types.Part] = []
        for fc in function_calls:
            fc_name = fc.name
            tool_name = fc_name.strip() if isinstance(fc_name, str) else ""
            if not tool_name:
                continue
            fc_args = fc.args
            args: dict[str, Any] = dict(fc_args) if isinstance(fc_args, dict) else {}
            result, new_cards = _execute_tool(statement_id, tool_name, args)
            if new_cards is not None:
                action_cards = new_cards
            function_response_parts.append(
                types.Part.from_function_response(name=tool_name, response={"result": result})
            )

        if not function_response_parts:
            break
        contents.append(types.Content(role="user", parts=function_response_parts))

    if not final_reply:
        final_reply = "Laskin ajantasaiset vaihtoehdot taloustilanteeseesi. Mikä näistä tuntuu sopivimmalta?"

    return {"reply": final_reply, "action_cards": action_cards}


def _run_fallback_agent(statement_id: str, user_message: str) -> dict[str, Any]:
    snap = tool_get_financial_summary(statement_id)
    msg = user_message.lower()

    if any(w in msg for w in ("yllättävä", "lasku", "rikki", "huolto", "pesukone", "korjaus", "lääkäri")):
        price = _extract_euro_amount(user_message, 350.0)
        desc = "autohuolto" if "auto" in msg or "huolto" in msg else "yllättävä meno"
        exp = tool_simulate_unexpected_expense(statement_id, desc, price)
        reply = (
            f"Yllättävä {price:.0f} € meno ({desc}) mahtuu nykyiseen **{exp['current_buffer_eur']:.0f} €** puskuriisi, "
            f"ja puskuriin jää sen jälkeen {exp['buffer_after_eur']:.0f} €.\n\n"
            f"Voit palauttaa puskurin ennalleen 2 kuukaudessa tasaamalla arjen käyttövaraa **{exp['weekly_recovery_drop_eur']:.0f} €/vk**."
        )
        return {"reply": reply, "action_cards": [exp["action_card"]]}

    if any(w in msg for w in ("ostaa", "ostan", "läppäri", "hankinta", "puhelin", "pyörä", "matka", "kone")):
        price = _extract_euro_amount(user_message, 1200.0)
        item = "läppäri" if "läppär" in msg else ("pyörä" if "pyör" in msg else "hankinta")
        sim = tool_simulate_purchase(statement_id, item, price)
        priorities = ", ".join(snap.get("profile", {}).get("priorities", [])) or "omat prioriteettisi"
        reply = (
            f"Simuloin kohteen **{item} ({price:.0f} €)** suhteessa S-Tilisi saldoon ({snap['account_balance_eur']:.2f} €) "
            f"ja viikon käyttövaraasi ({snap['weekly_safe_to_spend_eur']:.2f} €).\n\n"
            f"Pidän sinulle tärkeät asiat (**{priorities}**) suojattuina. Valitse alta sopivin toteutustapa:"
        )
        return {"reply": reply, "action_cards": list(sim.get("options", []))}

    if any(w in msg for w in ("vähen", "säästä", "20", "ravintol", "kahvi", "taks")):
        pct = _extract_euro_amount(user_message, 20.0)
        if pct > 90.0:
            pct = 20.0
        cat = "kahvilat" if "kahv" in msg else ("taksit" if "taks" in msg else "ravintolat")
        res = tool_simulate_category_cut(statement_id, cat, pct)
        cards = [res["action_card"]] if res["monthly_savings_eur"] > 0 else []
        reply = (
            f"Viimeisen 30 päivän aikana kategoriaan **{res['category']}** kului **{res['current_monthly_eur']:.2f} €**.\n\n"
            f"Vähentämällä sitä **{pct:.0f} %** vapautat **{res['monthly_savings_eur']:.2f} €/kk** "
            f"(**{res['yearly_savings_eur']:.0f} €/vuosi**)."
        )
        return {"reply": reply, "action_cards": cards}

    if any(w in msg for w in ("millainen kuluttaja", "minne rahani", "korit", "analysoi", "profiili")):
        b = snap["baskets_30d"]
        cats = snap["everyday_categories_30d"]
        top_cat = next(iter(cats.items()), ("Ruokakauppa", 0.0))
        reply = (
            f"Viimeisen 30 päivän menot jakautuvat kolmeen koriin:\n"
            f"• **Välttämättömät säännölliset:** {b['mandatory_regular_eur']:.0f} €\n"
            f"• **Välttämättömät epäsäännölliset:** {b['mandatory_irregular_eur']:.0f} €\n"
            f"• **Arjen kulutus:** {b['everyday_spent_eur']:.0f} € (suurin erä: **{top_cat[0]} {top_cat[1]:.0f} €**)\n\n"
            f"Viikon jäljellä oleva käyttövarasi on **{snap['weekly_safe_to_spend_eur']:.2f} €**."
        )
        return {"reply": reply, "action_cards": []}

    reply = (
        f"Tämän viikon jäljellä oleva käyttövarasi on **{snap['weekly_safe_to_spend_eur']:.2f} €** "
        f"(noin **{snap['daily_safe_to_spend_eur']:.2f} €/pv**), ja puskurissasi on **{snap['profile'].get('current_buffer_eur', 850):.0f} €**.\n\n"
        f"Voit kysyä esimerkiksi hankinnan suunnittelusta, säästöpotentiaalista tai kulutusprofiilistasi."
    )
    return {"reply": reply, "action_cards": []}


def run_agent(
    statement_id: str,
    user_message: str,
    history: list[dict[str, Any]],
) -> dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if api_key and api_key not in ("MY_GEMINI_API_KEY", "your_api_key_here"):
        try:
            return _run_gemini_agent(statement_id, user_message, history)
        except Exception as exc:
            logger.warning("Gemini-kutsu epäonnistui, käytetään varalogiikkaa: %s", exc)

    return _run_fallback_agent(statement_id, user_message)