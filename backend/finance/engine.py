from __future__ import annotations

from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any
import os
import pandas as pd

from app.database import get_profile
from finance.excel_loader import parse_excel_statement

# Polut data-kansioon ja automaattiseen testidataan
DATA_DIR = Path(__file__).resolve().parents[1] / "data"
SAMPLE_TX_PATH = DATA_DIR / "sample_transactions.csv"
SAMPLE_CUST_PATH = DATA_DIR / "sample_customers.csv"

# Kategoriatunnisteet S-Pankin 3 pedagogiseen kulutuskoriin
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
    Luo pienen realistisen S-Pankki-muotoisen testidatasetin ensimmäisellä ajokerralla,
    jotta sovellus toimii heti, vaikka isoa CSV- tai Excel-tiedostoa ei vielä ole lisätty.
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if SAMPLE_TX_PATH.exists() and SAMPLE_CUST_PATH.exists():
        return

    customers = pd.DataFrame([
        {"customer_id": "CUST_001", "customer_postal_code": "00530", "customer_age": 26},
        {"customer_id": "CUST_002", "customer_postal_code": "33100", "customer_age": 34},
    ])
    customers.to_csv(SAMPLE_CUST_PATH, index=False)

    today = date.today()
    rows: list[dict[str, Any]] = []
    balance = 1420.50

    def add_tx(days_ago: int, cat: str, amt: float, tx_type: str, merchant: str, mcc: int):
        nonlocal balance
        d = today - timedelta(days=days_ago)
        balance = round(balance + amt, 2)
        rows.append({
            "customer_id": "CUST_001",
            "bank_account_id": "FI4239390012345678",
            "tx_date": d.isoformat(),
            "tx_timestamp": f"{d.isoformat()}T10:15:00",
            "category": cat,
            "tx_amount_eur": round(amt, 2),
            "balance_after_eur": balance,
            "transaction_type": tx_type,
            "merchant_id": merchant,
            "mcc_code": mcc,
        })

    # Kahden kuukauden palkka ja kiinteät säännölliset menot
    for month_offset in (45, 15):
        add_tx(month_offset, "salary", 2750.00, "CREDIT", "Työnantaja Oy", 0)
        add_tx(month_offset - 1, "rent", -840.00, "DEBIT", "Vuokranantaja", 6513)
        add_tx(month_offset - 2, "utilities", -54.90, "DEBIT", "Helen Oy", 4900)
        add_tx(month_offset - 3, "telecom", -29.90, "DEBIT", "Elisa Oyj", 4814)
        add_tx(month_offset - 4, "insurance", -38.00, "DEBIT", "LähiTapiola", 6300)

    # Välttämättömät epäsäännölliset menot
    add_tx(28, "pharmacy", -42.50, "DEBIT", "Yliopiston Apteekki", 5912)
    add_tx(19, "health", -89.00, "DEBIT", "Terveystalo", 8011)

    # Arjen kulutus (ruokakauppa, kahvilat, ravintolat, taksi)
    everyday_samples = [
        (27, "groceries", -64.20, "S-market Vaasanhalli", 5411),
        (24, "cafe", -6.80, "Espresso House", 5814),
        (22, "restaurant", -34.50, "Ravintola Kuu", 5812),
        (20, "groceries", -78.40, "Prisma Tripla", 5411),
        (17, "taxi", -24.60, "Taksi Helsinki", 4121),
        (14, "cafe", -5.90, "Fazer Café", 5814),
        (12, "groceries", -52.10, "S-market Hakaniemi", 5411),
        (10, "restaurant", -28.00, "Wolt / Ravintola", 5812),
        (7, "cafe", -7.40, "Robert's Coffee", 5814),
        (5, "groceries", -61.80, "Prisma Tripla", 5411),
        (3, "taxi", -19.80, "Bolt", 4121),
        (2, "restaurant", -22.50, "Friends & Brgrs", 5814),
        (0, "groceries", -2.73, "S-market Vaasanhalli", 5411),
    ]
    for days_ago, cat, amt, merch, mcc in everyday_samples:
        add_tx(days_ago, cat, amt, "DEBIT", merch, mcc)

    pd.DataFrame(rows).to_csv(SAMPLE_TX_PATH, index=False)


def _resolve_csv_paths() -> tuple[Path, Path]:
    """Selvittää, käytetäänkö isoa Junction-CSV:tä vai testidataa."""
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
    """Listaa asiakkaat CSV-tiedostosta."""
    _, cust_path = _resolve_csv_paths()
    df = pd.read_csv(cust_path, nrows=limit)
    return df.to_dict(orient="records")


@lru_cache(maxsize=16)
def load_customer_transactions(customer_id: str) -> pd.DataFrame:
    """
    Hakee asiakkaan tilitapahtumat seuraavassa järjestyksessä:
    1. Ladattu tai backend/data/-kansioon lisätty Excel-tiliote (.xlsx)
    2. Junctionin S-Pankki CSV (luetaan paloissa muistin säästämiseksi)
    3. Automaattisesti luotu suomalainen testidata
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Tarkistetaan ensin Excel-tiliotteet
    custom_excel = DATA_DIR / f"uploaded_{customer_id}.xlsx"
    any_excels = sorted(DATA_DIR.glob("*.xlsx"))
    excel_to_use = custom_excel if custom_excel.exists() else (any_excels[0] if any_excels else None)

    if excel_to_use is not None:
        df = parse_excel_statement(excel_to_use, customer_id=customer_id)
        if "customer_id" in df.columns and (df["customer_id"].astype(str) == str(customer_id)).any():
            df = df[df["customer_id"].astype(str) == str(customer_id)].copy()
        return df

    # 2 & 3. CSV-luku paloissa (toimii myös 346 MB tiedostolla)
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
    """Luokittelee tapahtuman joko tuloksi tai johonkin S-Pankin kolmesta kulutuskorista."""
    if amount > 0:
        return "income"
    cat = str(category).strip().lower()
    if any(k in cat for k in MANDATORY_REGULAR_KEYS):
        return "mandatory_regular"
    if any(k in cat for k in MANDATORY_IRREGULAR_KEYS):
        return "mandatory_irregular"
    return "everyday_discretionary"


def get_financial_snapshot(customer_id: str = "CUST_001") -> dict[str, Any]:
    """Laskee etusivun ja tekoälyagentin tarvitsemat tarkat tunnusluvut."""
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
        monthly_income = 2750.0

    # Lasketaan 3 korin toteutunut kulutus viimeisen 30 päivän ajalta
    mandatory_regular = abs(float(last_30[last_30["basket"] == "mandatory_regular"]["tx_amount_eur"].sum()))
    mandatory_irregular = abs(float(last_30[last_30["basket"] == "mandatory_irregular"]["tx_amount_eur"].sum()))
    everyday_30d = abs(float(last_30[last_30["basket"] == "everyday_discretionary"]["tx_amount_eur"].sum()))
    spent_this_week = abs(float(last_7[last_7["basket"] == "everyday_discretionary"]["tx_amount_eur"].sum()))

    savings_target = float(profile.get("monthly_savings_target_eur", 250.0))
    everyday_adj = float(profile.get("everyday_adjustment_eur", 0.0))

    # Puskurivaraus + kuukauden ja viikon käyttövara
    irregular_reserve = max(120.0, round(mandatory_irregular * 1.1, 2))
    monthly_everyday_budget = max(
        200.0,
        round(monthly_income - mandatory_regular - irregular_reserve - savings_target + everyday_adj, 2),
    )
    weekly_budget = round(monthly_everyday_budget / 4.33, 2)
    weekly_safe_to_spend = round(weekly_budget - spent_this_week, 2)
    daily_safe_to_spend = round(max(0.0, weekly_safe_to_spend) / 4.0, 2)

    account_balance = float(df["balance_after_eur"].iloc[0]) if "balance_after_eur" in df.columns else 853.34

    # Arjen suurimmat kategoriat
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
        recent_receipts.append({
            "date": row["tx_date"].strftime("%d.%m.%Y") if pd.notna(row["tx_date"]) else "",
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
    """Laskee kolme konkreettista vaihtoehtoa ison hankinnan (esim. 1 200 € läppärin) toteuttamiseen."""
    snap = get_financial_snapshot(customer_id)
    savings = max(50.0, snap["baskets_30d"]["monthly_savings_target_eur"])
    buffer_eur = float(snap["profile"].get("current_buffer_eur", 850.0))

    months_normal = max(1, round(price_eur / savings))
    months_boosted = max(1, round(price_eur / (savings + 100.0)))
    can_buy_now_with_buffer = (buffer_eur + snap["account_balance_eur"]) >= price_eur

    return {
        "item_name": item_name,
        "price_eur": round(price_eur, 2),
        "current_weekly_safe_to_spend": snap["weekly_safe_to_spend_eur"],
        "current_monthly_savings": savings,
        "current_buffer_eur": buffer_eur,
        "can_buy_now_without_debt": can_buy_now_with_buffer,
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
                "summary": f"Nipistät 23 €/vk (100 €/kk) ei-kriittisestä arjen kulutuksesta (esim. kahvilat/taksit). Säästät {item_name}n {months_boosted} kuukaudessa.",
                "impact_weekly_eur": -23.0,
                "impact_savings_months": months_boosted,
                "monthly_savings_delta_eur": 100.0,
                "everyday_budget_delta_eur": -100.0,
                "goal_name": item_name,
                "goal_target_eur": price_eur,
            },
            {
                "plan_id": f"hybrid_buffer_{int(price_eur)}",
                "title": "Osta heti puskurista & palauta puskuri",
                "summary": f"Käytät {min(buffer_eur, price_eur * 0.5):.0f} € puskurista nyt ja kohdistat seuraavat kuukaudet puskurin täydentämiseen (+75 €/kk).",
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