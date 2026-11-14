from __future__ import annotations

import math
from functools import lru_cache
from pathlib import Path
from typing import Any
import pandas as pd

from app.database import get_profile
from finance.suunta_engine import (
    FinancialEngine,
    categorize,
    category_label_fi,
    cents,
    cents_to_eur,
    monthly_to_weekly,
    priorities_to_protected_categories,
    proportional,
    resolve_category_alias,
)

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
SAMPLE_TX_PATH = DATA_DIR / "sample_transactions.csv"
SAMPLE_CUST_PATH = DATA_DIR / "sample_customers.csv"


def _ensure_data_files() -> None:
    if not SAMPLE_CUST_PATH.exists():
        raise FileNotFoundError(f"Tiedosto puuttuu: {SAMPLE_CUST_PATH}")
    if not SAMPLE_TX_PATH.exists():
        raise FileNotFoundError(f"Tiedosto puuttuu: {SAMPLE_TX_PATH}")


@lru_cache(maxsize=1)
def _load_all_transactions() -> pd.DataFrame:
    """Lukee sample_transactions.csv:n kerran muistiin."""
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
    """Palauttaa sample_customers.csv:n 3 asiakasprofiilia."""
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
def load_statement_transactions(statement_id: str = "CUST_STUDENT_01") -> tuple[pd.DataFrame, str]:
    target = str(statement_id).strip()
    get_customer_info(target)
    all_tx = _load_all_transactions()
    df = all_tx[all_tx["customer_id"] == target].copy()
    if df.empty:
        raise ValueError(f"Asiakkaalle '{target}' ei löytynyt tapahtumia.")
    df = df.sort_values(["tx_date", "tx_timestamp_dt"], ascending=[False, False]).reset_index(drop=True)
    return df, SAMPLE_TX_PATH.name


def _build_financial_engine(df: pd.DataFrame, profile: dict[str, Any]) -> FinancialEngine:
    max_date = df["tx_date"].max().date()
    tx_records: list[dict[str, Any]] = []
    for idx, row in df.iterrows():
        amt_cents = cents(row["tx_amount_eur"])
        desc = str(row.get("merchant_id", ""))
        raw_cat = str(row.get("category", ""))
        assigned = categorize(desc, amt_cents, raw_cat)
        tx_records.append({
            "id": f"tx-{idx}",
            "date": row["tx_date"].date(),
            "description": desc,
            "amount_cents": amt_cents,
            "provided_category": raw_cat,
            **assigned,
        })
    return FinancialEngine(tx_records, profile=profile, as_of=max_date)


def get_financial_snapshot(statement_id: str = "CUST_STUDENT_01") -> dict[str, Any]:
    """Laskee kolmen korin yhteenvedon, viikkokäyttövaran, säästöpotentiaalin ja 6 kk ennusteen suunta_enginellä."""
    target = str(statement_id).strip()
    cust_info = get_customer_info(target)
    df, source_name = load_statement_transactions(target)

    profile = dict(get_profile(target))
    profile["statement_id"] = target
    profile["display_name"] = cust_info["display_name"]
    profile["role_label"] = cust_info["role_label"]
    profile["customer_age"] = cust_info["customer_age"]
    profile["customer_postal_code"] = cust_info["customer_postal_code"]

    fe = _build_financial_engine(df, profile)
    as_of = fe.as_of

    # Tarkka 30 kalenteripäivän ikkuna (estää kahden kuunvaihteen vuokran osumisen samaan jaksoon)
    start_30d = as_of - pd.Timedelta(days=29)
    start_7d = as_of - pd.Timedelta(days=6)

    analysis_30d = fe.analyze_transactions(start=start_30d, end=as_of)
    analysis_7d = fe.analyze_transactions(start=start_7d, end=as_of)

    income_cents = analysis_30d["income_cents"]
    regular_cents = analysis_30d["by_bucket_cents"].get("mandatory_regular", 0)
    irregular_cents = analysis_30d["by_bucket_cents"].get("mandatory_irregular", 0)
    everyday_30d_cents = analysis_30d["by_bucket_cents"].get("everyday", 0)
    spent_week_cents = analysis_7d["by_bucket_cents"].get("everyday", 0)

    savings_target_cents = cents(profile.get("monthly_savings_target_eur", 200.0))
    everyday_adj_cents = cents(profile.get("everyday_adjustment_eur", 0.0))
    irregular_reserve_cents = max(6000, proportional(irregular_cents, 110, 100))

    raw_everyday_budget_cents = (
        income_cents - regular_cents - irregular_reserve_cents - savings_target_cents + everyday_adj_cents
    )
    monthly_everyday_budget_cents = max(18000, raw_everyday_budget_cents)
    weekly_budget_cents = monthly_to_weekly(monthly_everyday_budget_cents)
    weekly_safe_cents = weekly_budget_cents - spent_week_cents
    daily_safe_cents = proportional(max(0, weekly_safe_cents), 1, 4)

    account_balance_cents = cents(df["balance_after_eur"].iloc[0])
    current_buffer_cents = cents(profile.get("current_buffer_eur", 850.0))

    # Arjen kulutuskategoriat viimeiseltä 30 päivältä (sekä avaimina että suomeksi)
    everyday_cats_eur: dict[str, float] = {}
    everyday_cats_fi: list[dict[str, Any]] = []
    for cat_key, cat_cents in analysis_30d["by_category_cents"].items():
        sample_info = categorize("", -100, cat_key)
        if sample_info["bucket"] == "everyday" and cat_cents > 0:
            val_eur = cents_to_eur(cat_cents)
            label_fi = category_label_fi(cat_key)
            everyday_cats_eur[label_fi] = val_eur
            everyday_cats_fi.append({
                "key": cat_key,
                "label": label_fi,
                "amount_eur": val_eur,
            })

    # Prioriteetit suojaava säästöpotentiaali (suunta_engine)
    protected_cats = priorities_to_protected_categories(profile.get("priorities"))
    opportunities_data = fe.find_savings_opportunities(protected_categories=protected_cats, months=2)

    # 6 kk ennuste (suunta_engine)
    forecast_6m = fe.get_financial_forecast(
        monthly_everyday_budget_cents=monthly_everyday_budget_cents,
        monthly_savings_cents=savings_target_cents,
        months=6,
        starting_checking_cents=account_balance_cents,
        starting_buffer_cents=current_buffer_cents,
    )

    recent_receipts = []
    for _, row in df.head(12).iterrows():
        tx_d = row["tx_date"]
        date_label = tx_d.strftime("%d.%m.%Y") if pd.notna(tx_d) else ""
        amt_c = cents(row["tx_amount_eur"])
        cat_info = categorize(str(row.get("merchant_id", "")), amt_c, str(row.get("category", "")))
        recent_receipts.append({
            "date": date_label,
            "merchant": str(row.get("merchant_id", "Tapahtuma")),
            "category": category_label_fi(cat_info["category"]),
            "amount_eur": cents_to_eur(amt_c),
            "basket": cat_info["bucket"],
        })

    return {
        "statement_id": target,
        "display_name": cust_info["display_name"],
        "role_label": cust_info["role_label"],
        "source_name": cust_info["display_name"],
        "data_file": source_name,
        "transaction_count": int(len(df)),
        "account_balance_eur": cents_to_eur(account_balance_cents),
        "monthly_income_eur": cents_to_eur(income_cents),
        "weekly_budget_eur": cents_to_eur(weekly_budget_cents),
        "spent_this_week_eur": cents_to_eur(spent_week_cents),
        "weekly_safe_to_spend_eur": cents_to_eur(weekly_safe_cents),
        "daily_safe_to_spend_eur": cents_to_eur(daily_safe_cents),
        "baskets_30d": {
            "mandatory_regular_eur": cents_to_eur(regular_cents),
            "mandatory_irregular_eur": cents_to_eur(irregular_cents),
            "irregular_reserve_eur": cents_to_eur(irregular_reserve_cents),
            "everyday_spent_eur": cents_to_eur(everyday_30d_cents),
            "monthly_everyday_budget_eur": cents_to_eur(monthly_everyday_budget_cents),
            "monthly_savings_target_eur": cents_to_eur(savings_target_cents),
        },
        "everyday_categories_30d": everyday_cats_eur,
        "everyday_categories_list": everyday_cats_fi,
        "savings_opportunities": opportunities_data["opportunities"][:3],
        "forecast_6m": forecast_6m,
        "recent_transactions": recent_receipts,
        "profile": profile,
    }


def find_savings_opportunities_for_statement(statement_id: str) -> dict[str, Any]:
    snap = get_financial_snapshot(statement_id)
    return {
        "protected_priorities": snap["profile"].get("priorities", []),
        "opportunities": snap.get("savings_opportunities", []),
    }


def simulate_purchase(statement_id: str, item_name: str, price_eur: float) -> dict[str, Any]:
    snap = get_financial_snapshot(statement_id)
    price_c = max(100, cents(price_eur))
    savings_c = max(4000, cents(snap["baskets_30d"]["monthly_savings_target_eur"]))
    buffer_c = cents(snap["profile"].get("current_buffer_eur", 850.0))

    months_normal = max(1, math.ceil(price_c / savings_c))
    months_boosted = max(1, math.ceil(price_c / (savings_c + 10000)))
    buffer_use_c = min(buffer_c, proportional(price_c, 50, 100))

    trim_weekly_eur = cents_to_eur(monthly_to_weekly(10000))
    hybrid_weekly_eur = cents_to_eur(monthly_to_weekly(7500))
    buffer_use_eur = cents_to_eur(buffer_use_c)
    clean_price = cents_to_eur(price_c)

    return {
        "item_name": item_name,
        "price_eur": clean_price,
        "current_weekly_safe_to_spend": snap["weekly_safe_to_spend_eur"],
        "current_monthly_savings": cents_to_eur(savings_c),
        "current_buffer_eur": cents_to_eur(buffer_c),
        "options": [
            {
                "plan_id": f"save_steady_{int(clean_price)}",
                "title": f"Säästä rauhassa ({months_normal} kk)",
                "summary": (
                    f"Pidät nykyisen {snap['weekly_budget_eur']:.0f} €/vk käyttövaran ennallaan ja "
                    f"saavutat {clean_price:.0f} € tavoitteen {months_normal} kuukaudessa."
                ),
                "impact_weekly_eur": 0.0,
                "impact_savings_months": months_normal,
                "monthly_savings_delta_eur": 0.0,
                "everyday_budget_delta_eur": 0.0,
                "buffer_delta_eur": 0.0,
                "goal_name": item_name,
                "goal_target_eur": clean_price,
            },
            {
                "plan_id": f"trim_everyday_{int(clean_price)}",
                "title": f"Tavoite nopeammin ({months_boosted} kk)",
                "summary": (
                    f"Siirrät {trim_weekly_eur:.0f} €/vk (100 €/kk) ei-kriittisestä arjen kulutuksesta "
                    f"kohteeseen {item_name}."
                ),
                "impact_weekly_eur": -round(trim_weekly_eur, 2),
                "impact_savings_months": months_boosted,
                "monthly_savings_delta_eur": 100.0,
                "everyday_budget_delta_eur": -100.0,
                "buffer_delta_eur": 0.0,
                "goal_name": item_name,
                "goal_target_eur": clean_price,
            },
            {
                "plan_id": f"hybrid_buffer_{int(clean_price)}",
                "title": "Hyödynnä puskuria & täydennä",
                "summary": (
                    f"Käytät {buffer_use_eur:.0f} € puskurista nyt ja palautat sen ohjaamalla "
                    f"+75 €/kk ({hybrid_weekly_eur:.0f} €/vk) takaisin puskuriin."
                ),
                "impact_weekly_eur": -round(hybrid_weekly_eur, 2),
                "impact_savings_months": 1,
                "monthly_savings_delta_eur": 75.0,
                "everyday_budget_delta_eur": -75.0,
                "buffer_delta_eur": -buffer_use_eur,
                "goal_name": f"Puskurin palautus ({item_name})",
                "goal_target_eur": buffer_use_eur,
            },
        ],
    }


def simulate_category_cut(statement_id: str, category_name: str, cut_percent: float) -> dict[str, Any]:
    snap = get_financial_snapshot(statement_id)
    canonical_query = resolve_category_alias(category_name)
    label_query = category_label_fi(canonical_query or category_name)

    matched_cents = 0
    matched_label = label_query

    for item in snap.get("everyday_categories_list", []):
        if (
            (canonical_query and item["key"] == canonical_query)
            or category_name.lower() in item["label"].lower()
            or category_name.lower() in item["key"].lower()
        ):
            matched_cents += cents(item["amount_eur"])
            matched_label = item["label"]

    if matched_cents == 0:
        for opp in snap.get("savings_opportunities", []):
            if canonical_query and opp["category"] == canonical_query:
                matched_cents = opp["monthly_average_cents"]
                matched_label = opp["category_fi"]
                break

    pct_int = max(1, min(90, round(cut_percent)))
    monthly_save_c = proportional(matched_cents, pct_int, 100)
    weekly_gain_c = monthly_to_weekly(monthly_save_c)

    monthly_save_eur = cents_to_eur(monthly_save_c)
    weekly_gain_eur = cents_to_eur(weekly_gain_c)
    current_monthly_eur = cents_to_eur(matched_cents)

    return {
        "category": matched_label,
        "current_monthly_eur": current_monthly_eur,
        "cut_percent": float(pct_int),
        "monthly_savings_eur": monthly_save_eur,
        "yearly_savings_eur": cents_to_eur(monthly_save_c * 12),
        "weekly_gain_eur": weekly_gain_eur,
        "action_card": {
            "plan_id": f"cut_{canonical_query or 'arki'}_{pct_int}",
            "title": f"Lukitse +{monthly_save_eur:.0f} €/kk säästö ({matched_label})",
            "summary": (
                f"Vähennät kategoriaa {matched_label.lower()} {pct_int} % ja siirrät "
                f"{monthly_save_eur:.2f} €/kk säästöön."
            ),
            "impact_weekly_eur": -weekly_gain_eur,
            "impact_savings_months": None,
            "monthly_savings_delta_eur": monthly_save_eur,
            "everyday_budget_delta_eur": -monthly_save_eur,
            "buffer_delta_eur": 0.0,
            "goal_name": None,
            "goal_target_eur": None,
        },
    }


def simulate_unexpected_expense(statement_id: str, description: str, price_eur: float) -> dict[str, Any]:
    snap = get_financial_snapshot(statement_id)
    price_c = max(100, cents(price_eur))
    current_buffer_c = cents(snap["profile"].get("current_buffer_eur", 850.0))

    monthly_drop_c = proportional(price_c, 1, 2)
    weekly_drop_c = monthly_to_weekly(monthly_drop_c)
    buffer_used_c = min(current_buffer_c, price_c)
    buffer_after_c = max(0, current_buffer_c - price_c)

    clean_price = cents_to_eur(price_c)
    weekly_drop_eur = cents_to_eur(weekly_drop_c)
    monthly_drop_eur = cents_to_eur(monthly_drop_c)

    card = {
        "plan_id": f"buffer_absorb_{int(clean_price)}",
        "title": "Kata puskurista & tasaa 2 kk aikana",
        "summary": (
            f"Katat menon ({description}, {clean_price:.0f} €) puskurista ja tasaat arjen "
            f"käyttövaraa {weekly_drop_eur:.0f} €/vk kahden kuukauden ajan."
        ),
        "impact_weekly_eur": -weekly_drop_eur,
        "impact_savings_months": 2,
        "monthly_savings_delta_eur": 0.0,
        "everyday_budget_delta_eur": -monthly_drop_eur,
        "buffer_delta_eur": -cents_to_eur(buffer_used_c),
        "goal_name": "Puskurin täydennys",
        "goal_target_eur": clean_price,
    }
    return {
        "description": description,
        "price_eur": clean_price,
        "current_buffer_eur": cents_to_eur(current_buffer_c),
        "buffer_after_eur": cents_to_eur(buffer_after_c),
        "weekly_recovery_drop_eur": weekly_drop_eur,
        "action_card": card,
    }