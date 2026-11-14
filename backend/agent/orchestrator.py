"""
Agentin "aivot" (Orchestrator).
- Kaverisi kytkevät oikean LLM-agentin (esim. Gemini tai LangGraph) run_agent()-funktioon.
- Alla oleva suomenkielinen varalogiikka huolehtii, että demo toimii täysin myös ilman API-avainta.
"""

import os
import re
from typing import Any

from agent.prompts import SYSTEM_PROMPT
from agent.tools.finance_tools import (
    tool_get_financial_summary,
    tool_simulate_category_cut,
    tool_simulate_purchase,
)


def _extract_euro_amount(text: str, default: float = 1200.0) -> float:
    """Poimii käyttäjän viestistä ensimmäisen euromäärän (esim. '1 200 €' -> 1200.0)."""
    cleaned = text.replace(" ", "")
    match = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:€|eur|euroa)?", cleaned, re.IGNORECASE)
    if match:
        return float(match.group(1).replace(",", "."))
    return default


def run_agent(customer_id: str, user_message: str, history: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Kutsutaan aina kun käyttäjä lähettää viestin chatissa.
    Palauttaa tekstivastauksen ja klikattavat toimintokortit.
    """
    snap = tool_get_financial_summary(customer_id)
    msg = user_message.lower()

    # =========================================================================
    # KAVERIT LISÄÄVÄT AI-AGENTIN TÄHÄN:
    # 1. Tarkista .env:stä GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    # 2. Kutsu mallia SYSTEM_PROMPT:lla ja anna sille työkalut:
    #    [tool_get_financial_summary, tool_simulate_purchase, tool_simulate_category_cut]
    # 3. Palauta {"reply": "...", "action_cards": [...]}.
    # =========================================================================

    # --- SKENAARIO 1: Hankinta tai yllättävä lasku ---
    if any(w in msg for w in ("ostaa", "läppäri", "hankinta", "puhelin", "pyörä", "matka", "€")):
        price = _extract_euro_amount(user_message, 1200.0)
        item = "läppäri" if "läppär" in msg else "suurempi hankinta"
        if "matka" in msg or "loma" in msg:
            item = "lomamatka"
        elif "puhelin" in msg:
            item = "puhelin"

        # Yllättävä meno (esim. autohuolto tai hajonnut pesukone)
        if any(w in msg for w in ("yllättävä", "lasku", "rikki", "huolto", "pesukone")):
            weekly_drop = round(price / 8.0, 2)
            reply = (
                f"Ymmärrän — {price:.0f} € yllättävä meno kuuluu **välttämättömiin epäsäännöllisiin menoihin**.\n\n"
                f"Sinulla on tällä hetkellä {snap['profile'].get('current_buffer_eur', 850):.0f} € puskuri. "
                f"Näin sopeutamme suunnitelmaasi ilman että arki menee sekaisin:"
            )
            cards = [
                {
                    "plan_id": f"buffer_absorb_{int(price)}",
                    "title": "Kata puskurista & tasaa 2 kk aikana",
                    "summary": (
                        f"Käytät puskuria {price:.0f} € ja vähennät arjen käyttövaraa vain "
                        f"{weekly_drop:.0f} €/vk seuraavat 2 kuukautta puskurin täydentämiseksi."
                    ),
                    "impact_weekly_eur": -weekly_drop,
                    "impact_savings_months": 2,
                    "monthly_savings_delta_eur": 0.0,
                    "everyday_budget_delta_eur": -round(price / 2.0, 2),
                    "buffer_delta_eur": -price,
                    "goal_name": "Puskurin täydennys",
                    "goal_target_eur": price,
                }
            ]
            return {"reply": reply, "action_cards": cards}

        # Suunniteltu hankinta (esim. 1 200 € läppäri)
        sim = tool_simulate_purchase(customer_id, item, price)
        reply = (
            f"Analysoin hankinnan **{item} ({price:.0f} €)** suhteessa S-Tilisi saldoon "
            f"({snap['account_balance_eur']:.2f} €) ja tämän viikon käyttövaraasi "
            f"({snap['weekly_safe_to_spend_eur']:.2f} €).\n\n"
            f"Koska arvostat asioita **{', '.join(snap['profile'].get('priorities', []))}**, "
            f"en leikkaa niistä. Valitse alta sinulle sopivin tapa:"
        )
        return {"reply": reply, "action_cards": sim["options"]}

    # --- SKENAARIO 2: "Mitä jos" -vähennys (esim. ravintolat -20 %) ---
    if any(w in msg for w in ("vähen", "säästä", "20%", "ravintol", "kahvi", "taks")):
        pct = _extract_euro_amount(user_message, 20.0)
        if pct > 90:
            pct = 20.0
        cat = "cafe" if "kahv" in msg else ("taxi" if "taks" in msg else "restaurant")
        res = tool_simulate_category_cut(customer_id, cat, pct)

        reply = (
            f"Hyvä laskelma! Viimeisen 30 päivän aikana kategoriaan **{res['category']}** "
            f"meni **{res['current_monthly_eur']:.2f} €**.\n\n"
            f"Jos vähennät sitä **{pct:.0f} %**, vapautat **{res['monthly_savings_eur']:.2f} €/kk** "
            f"(**{res['yearly_savings_eur']:.0f} €/vuosi**) eli vaihtoehtokustannuksena saat "
            f"+{res['weekly_gain_eur']:.2f} €/vk lisää liikkumavaraa muihin tavoitteisiisi."
        )
        cards = [
            {
                "plan_id": f"cut_{cat}_{int(pct)}",
                "title": f"Lukitse +{res['monthly_savings_eur']:.0f} €/kk lisäsäästö",
                "summary": f"Siirretään {res['monthly_savings_eur']:.0f} €/kk säästöön vähentämällä kategoriaa {res['category']}.",
                "impact_weekly_eur": -res["weekly_gain_eur"],
                "impact_savings_months": None,
                "monthly_savings_delta_eur": res["monthly_savings_eur"],
                "everyday_budget_delta_eur": -res["monthly_savings_eur"],
            }
        ]
        return {"reply": reply, "action_cards": cards}

    # --- SKENAARIO 3: Kuluttajaprofiili ja 3 koria ---
    if any(w in msg for w in ("millainen kuluttaja", "minne rahani", "korit", "analysoi", "profiili")):
        b = snap["baskets_30d"]
        cats = snap["everyday_categories_30d"]
        top_cat = next(iter(cats.items()), ("ruoka", 0))
        reply = (
            f"Viimeisen 30 päivän tilitapahtumasi jakautuvat kolmeen koriin:\n"
            f"1. **Välttämättömät säännölliset:** {b['mandatory_regular_eur']:.0f} € (vuokra, sähkö, vakuutus)\n"
            f"2. **Välttämättömät epäsäännölliset:** {b['mandatory_irregular_eur']:.0f} € (terveys, apteekki, korjaukset)\n"
            f"3. **Arjen kulutus:** {b['everyday_spent_eur']:.0f} € — suurin menoerä on **{top_cat[0]} ({top_cat[1]:.0f} €)**.\n\n"
            f"Kun kiinteät kulut ja {b['monthly_savings_target_eur']:.0f} € säästö on huomioitu, "
            f"tämän viikon käyttövarasi on **{snap['weekly_safe_to_spend_eur']:.2f} €**."
        )
        return {"reply": reply, "action_cards": []}

    # --- OLETUSVASTAUS ---
    reply = (
        f"Tämän viikon jäljellä oleva käyttövarasi on **{snap['weekly_safe_to_spend_eur']:.2f} €** "
        f"(noin **{snap['daily_safe_to_spend_eur']:.2f} €/pv**).\n\n"
        f"Kokeile kysyä esimerkiksi:\n"
        f"• *\"Haluan ostaa 1 200 € läppärin\"*\n"
        f"• *\"Millainen kuluttaja olen?\"*\n"
        f"• *\"Paljonko säästän jos vähennän ravintoloita 20 %?\"*"
    )
    return {"reply": reply, "action_cards": []}