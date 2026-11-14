from __future__ import annotations

from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any
import os
import pandas as pd

from app.database import get_profile
from finance.excel_loader import parse_excel_statement

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
SAMPLE_TX_PATH = DATA_DIR / "sample_transactions.csv"
SAMPLE_CUST_PATH = DATA_DIR / "sample_customers.csv"

MANDATORY_REGULAR_KEYS = {
    "rent", "vuokra", "housing", "asuminen", "utilities", "sähkö",
    "telecom", "puhelin", "internet", "insurance", "vakuutus", "loan", "laina", "subscription"
}
MANDATORY_IRREGULAR_KEYS = {
    "health", "terveys", "pharmacy", "apteekki", "repair", "huolto",
    "appliances", "kodinkone", "auto", "car_service", "dentist", "lääkäri"
}


def ensure_sample_dataset() -> None:
    """
    Luo realistisen 60 päivän synteettisen S-Pankki-datasetin kaikille kolmelle
    asiakasluokalle: Onni Opiskelija, Enni Eläkeläinen ja Anni Asiantuntija.
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # Päivitetään testidata automaattisesti, jos vanhassa tiedostossa ei vielä ole Onnia/Enniä/Annia
    if SAMPLE_TX_PATH.exists() and SAMPLE_CUST_PATH.exists():
        existing_custs = pd.read_csv(SAMPLE_CUST_PATH)
        if "CUST_ONNI" in set(existing_custs["customer_id"].astype(str)):
            return

    customers = pd.DataFrame([
        {"customer_id": "CUST_ONNI", "customer_postal_code": "00530", "customer_age": 23},
        {"customer_id": "CUST_ENNI", "customer_postal_code": "33100", "customer_age": 71},
        {"customer_id": "CUST_ANNI", "customer_postal_code": "00100", "customer_age": 31},
    ])
    customers.to_csv(SAMPLE_CUST_PATH, index=False)

    today = date.today()
    rows: list[dict[str, Any]] = []

    def build_person(cust_id: str, start_bal: float, monthly_tx: list[tuple[int, str, float, str, str, int]], extra_tx: list[tuple[int, str, float, str, str, int]]):
        bal = start_bal
        all_events = []
        for offset in (45, 15):
            for day_delta, cat, amt, ttype, merch, mcc in monthly_tx:
                all_events.append((offset - day_delta, cat, amt, ttype, merch, mcc))
        all_events.extend(extra_tx)
        # Järjestetään vanhimmasta uusimpaan juoksevaa saldoa varten
        all_events.sort(key=lambda x: x[0], reverse=True)
        for days_ago, cat, amt, ttype, merch, mcc in all_events:
            d = today - timedelta(days=days_ago)
            bal = round(bal + amt, 2)
            rows.append({
                "customer_id": cust_id,
                "bank_account_id": f"FI42393900{cust_id[-4:]}",
                "tx_date": d.isoformat(),
                "tx_timestamp": f"{d.isoformat()}T07:20:00",
                "category": cat,
                "tx_amount_eur": round(amt, 2),
                "balance_after_eur": bal,
                "transaction_type": ttype,
                "merchant_id": merch,
                "mcc_code": mcc,
            })

    # 1. ONNI OPISKELIJA (tulot ~1 190 €, opiskelijavuokra, ruokakauppa, kahvilat)
    build_person(
        "CUST_ONNI",
        180.00,
        monthly_tx=[
            (0, "salary", 620.00, "CREDIT", "Osa-aikatyö Oy", 0),
            (1, "salary", 570.00, "CREDIT", "Kela Opintotuki", 0),
            (2, "rent", -445.00, "DEBIT", "HOAS Asunnot", 6513),
            (3, "telecom", -21.90, "DEBIT", "Moi Mobiili", 4814),
            (4, "utilities", -18.50, "DEBIT", "Helen Oy", 4900),
            (5, "insurance", -14.00, "DEBIT", "LähiTapiola", 6300),
        ],
        extra_tx=[
            (26, "groceries", -38.40, "DEBIT", "Alepa Kallio", 5411),
            (23, "cafe", -5.40, "DEBIT", "Unicafe", 5814),
            (20, "restaurant", -18.90, "DEBIT", "Wolt / Kotipizza", 5812),
            (17, "pharmacy", -19.50, "DEBIT", "Yliopiston Apteekki", 5912),
            (14, "groceries", -42.10, "DEBIT", "S-market Vaasanhalli", 5411),
            (10, "cafe", -6.20, "DEBIT", "Espresso House", 5814),
            (6, "groceries", -35.80, "DEBIT", "Prisma Tripla", 5411),
            (3, "restaurant", -16.50, "DEBIT", "Friends & Brgrs", 5814),
            (0, "groceries", -2.73, "DEBIT", "S-market Vaasanhalli", 5411),
        ],
    )

    # 2. ENNI ELÄKELÄINEN (eläke 1 920 €, vastike, terveys/apteekki, ruokakauppa)
    build_person(
        "CUST_ENNI",
        1850.00,
        monthly_tx=[
            (0, "salary", 1920.00, "CREDIT", "Keva / Työeläke", 0),
            (2, "rent", -520.00, "DEBIT", "As Oy Tammela Vastike", 6513),
            (3, "utilities", -48.00, "DEBIT", "Tampereen Sähkölaitos", 4900),
            (4, "telecom", -24.90, "DEBIT", "Elisa Oyj", 4814),
            (5, "insurance", -44.00, "DEBIT", "Turva Vakuutus", 6300),
        ],
        extra_tx=[
            (25, "pharmacy", -56.80, "DEBIT", "Tammelan Apteekki", 5912),
            (21, "groceries", -72.30, "DEBIT", "Prisma Kaleva", 5411),
            (18, "health", -115.00, "DEBIT", "Mehiläinen Tampere", 8011),
            (14, "cafe", -9.80, "DEBIT", "Pyynikin Munkkikahvila", 5814),
            (9, "groceries", -68.40, "DEBIT", "S-market Pendoliino", 5411),
            (4, "groceries", -54.20, "DEBIT", "Prisma Kaleva", 5411),
            (0, "groceries", -14.60, "DEBIT", "S-market Pendoliino", 5411),
        ],
    )

    # 3. ANNI ASIANTUNTIJA (palkka 3 450 €, asunto 920 €, aktiivinen arki)
    build_person(
        "CUST_ANNI",
        980.00,
        monthly_tx=[
            (0, "salary", 3450.00, "CREDIT", "Tech Finland Oy", 0),
            (1, "rent", -920.00, "DEBIT", "Asunto Oy Krunika", 6513),
            (2, "utilities", -58.90, "DEBIT", "Helen Oy", 4900),
            (3, "telecom", -32.90, "DEBIT", "Telia Finland", 4814),
            (4, "insurance", -42.00, "DEBIT", "If Vahinkovakuutus", 6300),
        ],
        extra_tx=[
            (27, "groceries", -74.20, "DEBIT", "S-market Vaasanhalli", 5411),
            (24, "cafe", -7.20, "DEBIT", "Espresso House", 5814),
            (22, "restaurant", -48.50, "DEBIT", "Ravintola Kuu", 5812),
            (19, "health", -89.00, "DEBIT", "Terveystalo", 8011),
            (17, "taxi", -26.40, "DEBIT", "Taksi Helsinki", 4121),
            (14, "groceries", -86.90, "DEBIT", "Prisma Tripla", 5411),
            (11, "cafe", -6.50, "DEBIT", "Fazer Café", 5814),
            (8, "restaurant", -36.00, "DEBIT", "Wolt / Ravintola", 5812),
            (5, "groceries", -69.40, "DEBIT", "S-market Hakaniemi", 5411),
            (3, "taxi", -21.80, "DEBIT", "Bolt", 4121),
            (2, "restaurant", -29.50, "DEBIT", "Friends & Brgrs", 5814),
            (0, "groceries", -2.73, "DEBIT", "S-market Vaasanhalli", 5411),
        ],
    )

    pd.DataFrame(rows).to_csv(SAMPLE_TX_PATH, index=False)


def _resolve_csv_paths() -> tuple[Path, Path]:
    ensure_sample_dataset()
    tx_env = Path(os.getenv("SBANK_TX_CSV", str(DATA_DIR / "tx_junction_transactions.csv")))
    cust_env = Path(os.getenv("SBANK_CUSTOMERS_CSV", str(DATA_DIR / "tx_customers_junction.csv")))
    if not tx_env.is_absolute():
        tx_env = Path(__file__).resolve().parents[1] / tx_env
    if not cust_env.is_absolute():
        cust_env = Path(__file__).resolve().parents[1] / cust_env

    tx_path = tx_env if tx_env.exists() else SAMPLE_TX_PATH
    cust_path = cust_env if cust_env.exists() else SAMPLE_CUST_PATH
    return tx_path, cust_path


@lru_cache(maxsize=8)
def list_customers(limit: int = 20) -> list[dict[str, Any]]:
    _, cust_path = _resolve_csv_paths()
    df = pd.read_csv(cust_path, nrows=limit)
    return df.to_dict(orient="records") # type: ignore


@lru_cache(maxsize=16)
def load_customer_transactions(customer_id: str) -> pd.DataFrame:
    """
    Hakee asiakkaan tapahtumat:
    - Jos valittuna on oma ladattu Excel (uploaded_<customer_id>.xlsx), luetaan se.
    - Muuten luetaan S-Pankin CSV (tai valmiit Onni/Enni/Anni-profiilit).
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    custom_excel = DATA_DIR / f"uploaded_{customer_id}.xlsx"

    if custom_excel.exists():
        df = parse_excel_statement(custom_excel, customer_id=customer_id)
        return df

    # Jos kansiossa on muu yksittäinen .xlsx ja asiakas on CUST_CUSTOM
    if customer_id == "CUST_CUSTOM":
        other_excels = [p for p in sorted(DATA_DIR.glob("*.xlsx")) if not p.name.startswith("uploaded_")]
        if other_excels:
            return parse_excel_statement(other_excels[0], customer_id=customer_id)

    tx_path, _ = _resolve_csv_paths()
    chunks = []
    for chunk in pd.read_csv(tx_path, chunksize=100_000):
        matched = chunk[chunk["customer_id"].astype(str) == str(customer_id)]
        if not matched.empty:
            chunks.append(matched)

    if not chunks:
        first_chunk = pd.read_csv(tx_path, nrows=2000)
        first_id = str(first_chunk["customer_id"].iloc[0])
        df = first_chunk[first_chunk["customer_id"].astype(str) == first_id].copy()
    else:
        df = pd.concat(chunks, ignore_index=True)

    df["tx_date"] = pd.to_datetime(df["tx_date"], errors="coerce")
    df["tx_amount_eur"] = pd.to_numeric(df["tx_amount_eur"], errors="coerce").fillna(0.0)
    return df.sort_values("tx_date", ascending=False)


def classify_basket(category: str, amount: float) -> str:
    if amount > 0:
        return "income"
    cat = str(category).strip().lower()
    if any(k in cat for k in MANDATORY_REGULAR_KEYS):
        return "mandatory_regular"
    if any(k in cat for k in MANDATORY_IRREGULAR_KEYS):
        return "mandatory_irregular"
    return "everyday_discretionary"


def get_financial_snapshot(customer_id: str = "CUST_ANNI") -> dict[str, Any]:
    df = load_customer_transactions(customer_id).copy()
    profile = get_profile(customer_id)

    df["basket"] = [
        classify_basket(cat, amt) for cat, amt in zip(df["category"], df["tx_amount_eur"])
    ]

    max_date = df["tx_date"].max()
    last_30 = df[df["tx_date"] >= (max_date - pd.Timedelta(days=30))]
    last_7 = df[df["tx_date"] >= (max_date - pd.Timedelta(days=7))]

    monthly_income = float(last_30[last_30["tx_amount_eur"] > 0]["tx_amount_eur"].sum())
    if monthly_income <= 0:
        monthly_income = 2500.0

    mandatory_regular = abs(float(last_30[last_30["basket"] == "mandatory_regular"]["tx_amount_eur"].sum()))
    mandatory_irregular = abs(float(last_30[last_30["basket"] == "mandatory_irregular"]["tx_amount_eur"].sum()))
    everyday_30d = abs(float(last_30[last_30["basket"] == "everyday_discretionary"]["tx_amount_eur"].sum()))
    spent_this_week = abs(float(last_7[last_7["basket"] == "everyday_discretionary"]["tx_amount_eur"].sum()))

    savings_target = float(profile.get("monthly_savings_target_eur", 250.0))
    everyday_adj = float(profile.get("everyday_adjustment_eur", 0.0))

    irregular_reserve = max(60.0, round(mandatory_irregular * 1.1, 2))
    monthly_everyday_budget = max(
        180.0,
        round(monthly_income - mandatory_regular - irregular_reserve - savings_target + everyday_adj, 2),
    )
    weekly_budget = round(monthly_everyday_budget / 4.33, 2)
    weekly_safe_to_spend = round(weekly_budget - spent_this_week, 2)
    daily_safe_to_spend = round(max(0.0, weekly_safe_to_spend) / 4.0, 2)

    account_balance = float(df["balance_after_eur"].iloc[0]) if "balance_after_eur" in df.columns else 853.34

    everyday_df = last_30[last_30["basket"] == "everyday_discretionary"]
    by_category = (
        everyday_df.groupby("category")["tx_amount_eur"]
        .sum()
        .abs()
        .sort_values(ascending=False)
        .round(2)
        .to_dict()
    )

    recent_receipts = []
    for _, row in df.head(6).iterrows():
        tx_d = row["tx_date"]
        date_label = "Tänään 07:20" if pd.notna(tx_d) and tx_d.date() == max_date.date() else (
            tx_d.strftime("%d.%m.%Y") if pd.notna(tx_d) else ""
        )
        recent_receipts.append({
            "date": date_label,
            "merchant": str(row.get("merchant_id", row.get("category", "Ostos"))),
            "category": str(row.get("category", "")),
            "amount_eur": round(float(row["tx_amount_eur"]), 2),
            "basket": row["basket"],
        })

    return {
        "customer_id": customer_id,
        "account_balance_eur": round(account_balance, 2),
        "monthly_income_eur": round(monthly_income, 2),
        "weekly_budget_eur": weekly_budget,
        "spent_this_week_eur": round(spent_this_week, 2),
        "weekly_safe_to_spend_eur": weekly_safe_to_spend,
        "daily_safe_to_spend_eur": daily_safe_to_spend,
        "baskets_30d": {
            "mandatory_regular_eur": round(mandatory_regular, 2),
            "mandatory_irregular_eur": round(mandatory_irregular, 2),
            "irregular_reserve_eur": round(irregular_reserve, 2),
            "everyday_spent_eur": round(everyday_30d, 2),
            "monthly_everyday_budget_eur": monthly_everyday_budget,
            "monthly_savings_target_eur": round(savings_target, 2),
        },
        "everyday_categories_30d": by_category,
        "recent_transactions": recent_receipts,
        "profile": profile,
    }


def simulate_purchase(customer_id: str, item_name: str, price_eur: float) -> dict[str, Any]:
    snap = get_financial_snapshot(customer_id)
    savings = max(40.0, snap["baskets_30d"]["monthly_savings_target_eur"])
    buffer_eur = float(snap["profile"].get("current_buffer_eur", 850.0))

    months_normal = max(1, round(price_eur / savings))
    months_boosted = max(1, round(price_eur / (savings + 100.0)))

    return {
        "item_name": item_name,
        "price_eur": round(price_eur, 2),
        "current_weekly_safe_to_spend": snap["weekly_safe_to_spend_eur"],
        "current_monthly_savings": savings,
        "current_buffer_eur": buffer_eur,
        "options": [
            {
                "plan_id": f"save_steady_{int(price_eur)}",
                "title": f"Säästä rauhassa ({months_normal} kk)",
                "summary": f"Pidät nykyisen {snap['weekly_budget_eur']:.0f} €/vk käyttövaran ennallaan ja saavutat {price_eur:.0f} € tavoitteen {months_normal} kuukaudessa.",
                "impact_weekly_eur": 0.0,
                "impact_savings_months": months_normal,
                "monthly_savings_delta_eur": 0.0,
                "everyday_budget_delta_eur": 0.0,
                "goal_name": item_name,
                "goal_target_eur": price_eur,
            },
            {
                "plan_id": f"trim_everyday_{int(price_eur)}",
                "title": f"Tavoite nopeammin ({months_boosted} kk)",
                "summary": f"Nipistät 23 €/vk (100 €/kk) ei-kriittisestä arjen kulutuksesta. Säästät {item_name}n {months_boosted} kuukaudessa.",
                "impact_weekly_eur": -23.0,
                "impact_savings_months": months_boosted,
                "monthly_savings_delta_eur": 100.0,
                "everyday_budget_delta_eur": -100.0,
                "goal_name": item_name,
                "goal_target_eur": price_eur,
            },
            {
                "plan_id": f"hybrid_buffer_{int(price_eur)}",
                "title": "Käytä puskuria & täydennä takaisin",
                "summary": f"Käytät {min(buffer_eur, price_eur * 0.5):.0f} € puskurista nyt ja ohjaat +75 €/kk puskurin palauttamiseen.",
                "impact_weekly_eur": -17.0,
                "impact_savings_months": 1,
                "monthly_savings_delta_eur": 75.0,
                "everyday_budget_delta_eur": -75.0,
                "buffer_delta_eur": -min(buffer_eur, round(price_eur * 0.5, 2)),
                "goal_name": f"Puskurin palautus ({item_name})",
                "goal_target_eur": round(price_eur * 0.5, 2),
            },
        ],
    }