from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any
import pandas as pd

from app.database import get_profile

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
SAMPLE_TX_PATH = DATA_DIR / "sample_transactions.csv"
SAMPLE_CUST_PATH = DATA_DIR / "sample_customers.csv"

MANDATORY_REGULAR_KEYS = {
    "rent", "vuokra", "housing", "asuminen", "utilities", "sähkö",
    "telecom", "puhelin", "internet", "insurance", "vakuutus",
    "loan", "laina", "subscription", "subscriptions",
}
MANDATORY_IRREGULAR_KEYS = {
    "health", "terveys", "pharmacy", "apteekki", "repair", "huolto",
    "appliances", "kodinkone", "auto", "car_service", "dentist", "lääkäri",
    "taxes", "vero",
}
INVESTMENT_KEYS = {"investments", "investment", "sijoitus", "sijoitukset"}


def _ensure_data_files() -> None:
    if not SAMPLE_CUST_PATH.exists():
        raise FileNotFoundError(f"Tiedosto puuttuu: {SAMPLE_CUST_PATH}")
    if not SAMPLE_TX_PATH.exists():
        raise FileNotFoundError(f"Tiedosto puuttuu: {SAMPLE_TX_PATH}")


@lru_cache(maxsize=1)
def _load_all_transactions() -> pd.DataFrame:
    """Lukee sample_transactions.csv:n kerran (1. rivi otsikko, loput dataa)."""
    _ensure_data_files()
    df = pd.read_csv(SAMPLE_TX_PATH)
    df.columns = [str(c).strip() for c in df.columns]
    df["customer_id"] = df["customer_id"].astype(str).str.strip()
    df["tx_date"] = pd.to_datetime(df["tx_date"], errors="coerce")
    if "tx_timestamp" in df.columns:
        df["tx_timestamp_dt"] = pd.to_datetime(df["tx_timestamp"], errors="coerce")
    else:
        df["tx_timestamp_dt"] = df["tx_date"]
    df["tx_amount_eur"] = pd.to_numeric(df["tx_amount_eur"], errors="coerce").fillna(0.0)
    df["balance_after_eur"] = pd.to_numeric(df["balance_after_eur"], errors="coerce").fillna(0.0)
    df["category"] = df["category"].astype(str).str.strip()
    df["merchant_id"] = df["merchant_id"].astype(str).str.strip()
    return df


def _derive_role_from_transactions(cust_df: pd.DataFrame) -> str:
    """Päättelee roolin suoraan datakansion tulokategoriasta keksimättä uutta dataa."""
    income_cats = {
        str(c).strip().lower()
        for c in cust_df[cust_df["tx_amount_eur"] > 0]["category"].tolist()
    }
    if "pension" in income_cats:
        return "Eläkeläinen"
    if "salary" in income_cats and "benefits" not in income_cats:
        return "Työssäkäyvä"
    if "benefits" in income_cats:
        return "Opiskelija"
    return "Asiakas"


@lru_cache(maxsize=4)
def list_customers() -> list[dict[str, Any]]:
    """Palauttaa sample_customers.csv:n kolme asiakasta ja oikeat faktat sample_transactions.csv:stä."""
    _ensure_data_files()
    cdf = pd.read_csv(SAMPLE_CUST_PATH, dtype=str)
    cdf.columns = [str(c).strip() for c in cdf.columns]
    for col in cdf.columns:
        cdf[col] = cdf[col].fillna("").astype(str).str.strip()

    all_tx = _load_all_transactions()
    customers: list[dict[str, Any]] = []

    for row in cdf.to_dict(orient="records"):
        cid = str(row.get("customer_id", "")).strip()
        if not cid:
            continue
        csv_name = str(row.get("customer name") or row.get("customer_name") or cid).strip()
        age = str(row.get("customer_age", "")).strip()
        postal = str(row.get("customer_postal_code", "")).strip()

        cust_tx = all_tx[all_tx["customer_id"] == cid].sort_values(
            ["tx_date", "tx_timestamp_dt"], ascending=[False, False]
        )
        balance = float(cust_tx["balance_after_eur"].iloc[0]) if not cust_tx.empty else 0.0
        role_label = _derive_role_from_transactions(cust_tx) if not cust_tx.empty else csv_name

        customers.append({
            "customer_id": cid,
            "display_name": csv_name,
            "role_label": role_label,
            "customer_age": age,
            "customer_postal_code": postal,
            "account_balance_eur": round(balance, 2),
        })
    return customers


def get_customer_info(customer_id: str) -> dict[str, Any]:
    target = str(customer_id).strip()
    for cust in list_customers():
        if cust["customer_id"] == target:
            return cust
    raise ValueError(f"Asiakasta '{target}' ei löytynyt tiedostosta sample_customers.csv")


@lru_cache(maxsize=16)
def load_statement_transactions(statement_id: str = "CUST_STUDENT_01") -> tuple[pd.DataFrame, str, bool]:
    """Lukee vain yhden valitun customer_id:n tapahtumat sample_transactions.csv:stä."""
    target = str(statement_id).strip()
    get_customer_info(target)
    all_tx = _load_all_transactions()
    df = all_tx[all_tx["customer_id"] == target].copy()
    if df.empty:
        raise ValueError(f"Asiakkaalle '{target}' ei löytynyt tapahtumia sample_transactions.csv:stä")
    df = df.sort_values(["tx_date", "tx_timestamp_dt"], ascending=[False, False]).reset_index(drop=True)
    return df, SAMPLE_TX_PATH.name, False


def classify_basket(category: str, amount: float) -> str:
    if amount > 0:
        return "income"
    cat = str(category).strip().lower()
    if any(k in cat for k in INVESTMENT_KEYS):
        return "investments"
    if any(k in cat for k in MANDATORY_REGULAR_KEYS):
        return "mandatory_regular"
    if any(k in cat for k in MANDATORY_IRREGULAR_KEYS):
        return "mandatory_irregular"
    return "everyday_discretionary"


def get_financial_snapshot(statement_id: str = "CUST_STUDENT_01") -> dict[str, Any]:
    """Laskee kolmen korin yhteenvedon, viikkokäyttövaran ja tuoreimmat tapahtumat yhdelle ID:lle."""
    target = str(statement_id).strip()
    cust_info = get_customer_info(target)
    df, source_name, _ = load_statement_transactions(target)
    df = df.copy()

    profile = dict(get_profile(target))
    profile["statement_id"] = target
    profile["display_name"] = cust_info["display_name"]
    profile["role_label"] = cust_info["role_label"]
    profile["customer_age"] = cust_info["customer_age"]
    profile["customer_postal_code"] = cust_info["customer_postal_code"]

    df["basket"] = [
        classify_basket(cat, amt) for cat, amt in zip(df["category"], df["tx_amount_eur"])
    ]

    max_date = df["tx_date"].max()
    last_30 = df[df["tx_date"] >= (max_date - pd.Timedelta(days=30))]
    last_7 = df[df["tx_date"] >= (max_date - pd.Timedelta(days=7))]

    monthly_income = float(last_30[last_30["tx_amount_eur"] > 0]["tx_amount_eur"].sum())
    mandatory_regular = abs(float(last_30[last_30["basket"] == "mandatory_regular"]["tx_amount_eur"].sum()))
    mandatory_irregular = abs(float(last_30[last_30["basket"] == "mandatory_irregular"]["tx_amount_eur"].sum()))
    everyday_30d = abs(float(last_30[last_30["basket"] == "everyday_discretionary"]["tx_amount_eur"].sum()))
    spent_this_week = abs(float(last_7[last_7["basket"] == "everyday_discretionary"]["tx_amount_eur"].sum()))

    savings_target = float(profile.get("monthly_savings_target_eur", 200.0))
    everyday_adj = float(profile.get("everyday_adjustment_eur", 0.0))

    irregular_reserve = max(60.0, round(mandatory_irregular * 1.1, 2))
    monthly_everyday_budget = max(
        180.0,
        round(monthly_income - mandatory_regular - irregular_reserve - savings_target + everyday_adj, 2),
    )
    weekly_budget = round(monthly_everyday_budget / 4.33, 2)
    weekly_safe_to_spend = round(weekly_budget - spent_this_week, 2)
    daily_safe_to_spend = round(max(0.0, weekly_safe_to_spend) / 4.0, 2)

    account_balance = float(df["balance_after_eur"].iloc[0])

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
    for _, row in df.head(10).iterrows():
        tx_d = row["tx_date"]
        date_label = tx_d.strftime("%d.%m.%Y") if pd.notna(tx_d) else ""
        recent_receipts.append({
            "date": date_label,
            "merchant": str(row.get("merchant_id", row.get("category", "Ostos"))),
            "category": str(row.get("category", "")),
            "amount_eur": round(float(row["tx_amount_eur"]), 2),
            "basket": row["basket"],
        })

    return {
        "statement_id": target,
        "display_name": cust_info["display_name"],
        "role_label": cust_info["role_label"],
        "source_name": cust_info["display_name"],
        "data_file": source_name,
        "transaction_count": int(len(df)),
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


def build_agent_statement_context(statement_id: str = "CUST_STUDENT_01") -> dict[str, Any]:
    snap = get_financial_snapshot(statement_id)
    return {
        "customer_id": snap["statement_id"],
        "display_name": snap["display_name"],
        "role_label": snap["role_label"],
        "transaction_count": snap["transaction_count"],
        "account_balance_eur": snap["account_balance_eur"],
        "monthly_income_eur": snap["monthly_income_eur"],
        "weekly_safe_to_spend_eur": snap["weekly_safe_to_spend_eur"],
        "baskets_30d": snap["baskets_30d"],
        "everyday_categories_30d": snap["everyday_categories_30d"],
        "priorities": snap["profile"].get("priorities", []),
        "recent_transactions": snap["recent_transactions"][:8],
    }


def simulate_purchase(statement_id: str, item_name: str, price_eur: float) -> dict[str, Any]:
    snap = get_financial_snapshot(statement_id)
    savings = max(40.0, snap["baskets_30d"]["monthly_savings_target_eur"])
    buffer_eur = float(snap["profile"].get("current_buffer_eur", 850.0))

    months_normal = max(1, round(price_eur / savings))
    months_boosted = max(1, round(price_eur / (savings + 100.0)))
    buffer_use = min(buffer_eur, round(price_eur * 0.5, 2))

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
                "buffer_delta_eur": 0.0,
                "goal_name": item_name,
                "goal_target_eur": price_eur,
            },
            {
                "plan_id": f"trim_everyday_{int(price_eur)}",
                "title": f"Tavoite nopeammin ({months_boosted} kk)",
                "summary": f"Nipistät 23 €/vk (100 €/kk) ei-kriittisestä arjen kulutuksesta. Säästät kohteen ({item_name}) {months_boosted} kuukaudessa.",
                "impact_weekly_eur": -23.0,
                "impact_savings_months": months_boosted,
                "monthly_savings_delta_eur": 100.0,
                "everyday_budget_delta_eur": -100.0,
                "buffer_delta_eur": 0.0,
                "goal_name": item_name,
                "goal_target_eur": price_eur,
            },
            {
                "plan_id": f"hybrid_buffer_{int(price_eur)}",
                "title": "Käytä puskuria & täydennä takaisin",
                "summary": f"Käytät {buffer_use:.0f} € puskurista nyt ja ohjaat +75 €/kk puskurin palauttamiseen.",
                "impact_weekly_eur": -17.0,
                "impact_savings_months": 1,
                "monthly_savings_delta_eur": 75.0,
                "everyday_budget_delta_eur": -75.0,
                "buffer_delta_eur": -buffer_use,
                "goal_name": f"Puskurin palautus ({item_name})",
                "goal_target_eur": buffer_use,
            },
        ],
    }


def simulate_category_cut(statement_id: str, category_name: str, cut_percent: float) -> dict[str, Any]:
    snap = get_financial_snapshot(statement_id)
    cats = snap["everyday_categories_30d"]

    matched_val = 0.0
    matched_key = category_name
    for k, v in cats.items():
        if category_name.lower() in k.lower() or k.lower() in category_name.lower():
            matched_val += v
            matched_key = k

    if matched_val == 0:
        matched_val = 120.0

    monthly_save = round(matched_val * (cut_percent / 100.0), 2)
    weekly_gain = round(monthly_save / 4.33, 2)
    return {
        "category": matched_key,
        "current_monthly_eur": round(matched_val, 2),
        "cut_percent": cut_percent,
        "monthly_savings_eur": monthly_save,
        "yearly_savings_eur": round(monthly_save * 12, 2),
        "weekly_gain_eur": weekly_gain,
        "action_card": {
            "plan_id": f"cut_{matched_key}_{int(cut_percent)}",
            "title": f"Lukitse +{monthly_save:.0f} €/kk lisäsäästö",
            "summary": f"Siirretään {monthly_save:.0f} €/kk säästöön vähentämällä kategoriaa {matched_key}.",
            "impact_weekly_eur": -weekly_gain,
            "impact_savings_months": None,
            "monthly_savings_delta_eur": monthly_save,
            "everyday_budget_delta_eur": -monthly_save,
            "buffer_delta_eur": 0.0,
        },
    }


def simulate_unexpected_expense(statement_id: str, description: str, price_eur: float) -> dict[str, Any]:
    snap = get_financial_snapshot(statement_id)
    current_buffer = float(snap["profile"].get("current_buffer_eur", 850.0))
    weekly_drop = round(price_eur / 8.0, 2)
    monthly_drop = round(price_eur / 2.0, 2)
    buffer_after = round(max(0.0, current_buffer - price_eur), 2)

    card = {
        "plan_id": f"buffer_absorb_{int(price_eur)}",
        "title": "Kata puskurista & tasaa 2 kk aikana",
        "summary": (
            f"Käytät puskuria {price_eur:.0f} € ({description}) ja vähennät arjen käyttövaraa "
            f"{weekly_drop:.0f} €/vk seuraavat 2 kuukautta puskurin täydentämiseksi."
        ),
        "impact_weekly_eur": -weekly_drop,
        "impact_savings_months": 2,
        "monthly_savings_delta_eur": 0.0,
        "everyday_budget_delta_eur": -monthly_drop,
        "buffer_delta_eur": -min(current_buffer, price_eur),
        "goal_name": "Puskurin täydennys",
        "goal_target_eur": price_eur,
    }
    return {
        "description": description,
        "price_eur": price_eur,
        "current_buffer_eur": current_buffer,
        "buffer_after_eur": buffer_after,
        "weekly_recovery_drop_eur": weekly_drop,
        "action_card": card,
    }