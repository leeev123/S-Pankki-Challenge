"""Suunta Financial Engine.

Deterministic integer-cent financial calculations for the Suunta AI coach.
All internal currency calculations use exact integer euro cents via Decimal.
"""
from __future__ import annotations

import calendar
import csv
import json
import math
import re
import unicodedata
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any


class FinancialError(ValueError):
    """Invalid input, missing financial information or impossible plan."""


def cents(value: Any) -> int:
    """Parse an EUR amount into exact integer cents."""
    if isinstance(value, bool) or value is None or str(value).strip() == "":
        raise FinancialError("Rahamäärä puuttuu tai on virheellinen")
    raw = str(value).strip().replace("\u00a0", "").replace(" ", "").replace("€", "")
    if raw.count(",") and raw.count("."):
        decimal_mark = "," if raw.rfind(",") > raw.rfind(".") else "."
        grouping_mark = "." if decimal_mark == "," else ","
        raw = raw.replace(grouping_mark, "").replace(decimal_mark, ".")
    elif "," in raw:
        raw = raw.replace(",", ".")
    try:
        number = Decimal(raw)
        if not number.is_finite():
            raise InvalidOperation
        return int((number * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    except (InvalidOperation, ValueError) as exc:
        raise FinancialError(f"Virheellinen rahamäärä: {value!r}") from exc


def eur(amount_cents: int) -> str:
    """Format integer cents into '0.00' string."""
    sign = "-" if amount_cents < 0 else ""
    val = abs(amount_cents)
    return f"{sign}{val // 100}.{val % 100:02d}"


def cents_to_eur(amount_cents: int) -> float:
    """Convert integer cents to a clean 2-decimal EUR float for JSON responses."""
    return round(amount_cents / 100.0, 2)


def proportional(value: int, numerator: int, denominator: int) -> int:
    if denominator == 0:
        raise FinancialError("Nollalla ei voi jakaa")
    return int((Decimal(value) * numerator / denominator).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def monthly_to_weekly(value: int) -> int:
    return proportional(value, 12, 52)


def parse_date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if not value:
        raise FinancialError("Tapahtuman päivämäärä puuttuu")
    raw = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%Y/%m/%d", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(raw[:19], fmt).date()
        except ValueError:
            pass
    raise FinancialError(f"Päivämäärä ei kelpaa: {value!r}")


def add_months(day: date, months: int) -> date:
    new_month_index = day.year * 12 + day.month - 1 + months
    year, remainder = divmod(new_month_index, 12)
    month = remainder + 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def _key(value: str) -> str:
    value = unicodedata.normalize("NFKD", str(value))
    value = "".join(char for char in value if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", "_", value.casefold()).strip("_")


CATEGORY_ALIASES = {
    # Tulot
    "palkka": "salary", "salary": "salary",
    "elake": "pension", "pension": "pension",
    "tuet": "benefits", "etuudet": "benefits", "benefits": "benefits",
    "income": "other_income", "other_income": "other_income",
    # Kori 1: Välttämättömät säännölliset
    "vuokra": "rent", "asuminen": "rent", "housing": "rent", "rent": "rent",
    "sahko": "electricity", "electricity": "electricity", "utilities": "electricity",
    "vakuutus": "insurance", "insurance": "insurance",
    "puhelin": "phone_internet", "internet": "phone_internet", "telecom": "phone_internet", "phone_internet": "phone_internet",
    "joukkoliikenteen_kausilippu": "transport_pass", "transport_pass": "transport_pass",
    "lainalyhennys": "loan_payment", "laina": "loan_payment", "loan": "loan_payment", "loan_payment": "loan_payment",
    "other_mandatory_regular": "other_mandatory_regular",
    # Kori 2: Välttämättömät epäsäännölliset
    "terveys": "healthcare", "terveydenhuolto": "healthcare", "health": "healthcare", "healthcare": "healthcare",
    "apteekki": "healthcare", "pharmacy": "healthcare", "dentist": "healthcare", "laakari": "healthcare",
    "korjaukset": "home_repair", "huolto": "home_repair", "repair": "home_repair", "home_repair": "home_repair",
    "auto": "home_repair", "car_service": "home_repair",
    "kodinkone": "essential_replacement", "appliances": "essential_replacement", "essential_replacement": "essential_replacement",
    "vero": "other_mandatory_irregular", "taxes": "other_mandatory_irregular", "other_mandatory_irregular": "other_mandatory_irregular",
    # Kori 3: Arjen kulutus
    "ruoka": "groceries", "ruokaostokset": "groceries", "ruokakaupat": "groceries", "ruokakauppa": "groceries", "groceries": "groceries",
    "kotitalous": "household", "household": "household",
    "ravintola": "restaurants", "ravintolat": "restaurants", "restaurant": "restaurants", "restaurants": "restaurants", "noutoruoka": "restaurants",
    "kahvila": "cafes", "kahvilat": "cafes", "cafe": "cafes", "cafes": "cafes", "kahvi": "cafes",
    "liikenne": "transport", "liikkuminen": "transport", "transport": "transport",
    "tilaukset": "subscriptions", "subscription": "subscriptions", "subscriptions": "subscriptions", "suoratoisto": "subscriptions",
    "ostokset": "shopping", "vaatteet": "shopping", "shopping": "shopping",
    "vapaa_aika": "leisure", "harrastukset": "leisure", "hobbies": "leisure", "leisure": "leisure",
    "taksi": "taxis", "taksit": "taxis", "taxi": "taxis", "taxis": "taxis",
    "other_everyday": "other_everyday",
    # Siirrot ja sijoitukset
    "internal_transfer": "internal_transfer", "sisainen_siirto": "internal_transfer",
    "investment_transfer": "investment_transfer", "sijoitussiirto": "investment_transfer",
    "investments": "investment_transfer", "investment": "investment_transfer", "sijoitus": "investment_transfer", "sijoitukset": "investment_transfer",
    "unclassified": "unclassified", "luokittelematon": "unclassified",
}

CATEGORY_LABELS_FI = {
    "groceries": "Ruokakauppa",
    "household": "Kotitalous",
    "restaurants": "Ravintolat",
    "cafes": "Kahvilat",
    "transport": "Liikkuminen",
    "subscriptions": "Tilaukset",
    "shopping": "Ostokset",
    "leisure": "Vapaa-aika & harrastukset",
    "taxis": "Taksit",
    "other_everyday": "Muu arki",
    "rent": "Asuminen & vuokra",
    "electricity": "Sähkö & vesi",
    "insurance": "Vakuutukset",
    "phone_internet": "Puhelin & netti",
    "transport_pass": "Kausilippu",
    "loan_payment": "Lainat",
    "healthcare": "Terveys & apteekki",
    "home_repair": "Huollot & korjaukset",
    "essential_replacement": "Kodinkoneet",
}

PRIORITY_TO_CATEGORIES = {
    "laadukas_arkiruoka": {"groceries"},
    "liikunta_harrastukset": {"leisure"},
    "matkustaminen": {"transport"},
    "ravintolat": {"restaurants"},
    "kahvilat": {"cafes"},
}

INCOME = {"salary", "pension", "benefits", "other_income"}
REGULAR = {"rent", "electricity", "insurance", "phone_internet", "transport_pass", "loan_payment", "other_mandatory_regular"}
IRREGULAR = {"healthcare", "home_repair", "essential_replacement", "other_mandatory_irregular"}
EVERYDAY = {"groceries", "household", "restaurants", "cafes", "transport", "subscriptions", "shopping", "leisure", "taxis", "other_everyday"}
TRANSFERS = {"internal_transfer", "investment_transfer"}
SAVINGS_CANDIDATES = {"restaurants", "cafes", "subscriptions", "shopping", "leisure", "taxis"}

MERCHANT_RULES = [
    (r"\b(s[ -]?market|alepa|sale|lidl|k[ -]?market|k[ -]?supermarket)\b", "groceries", 0.90),
    (r"\b(prisma|citymarket)\b", "groceries", 0.75),
    (r"ravintola|restaurant|pizza|burger|wolt|foodora|unicafe|friends", "restaurants", 0.85),
    (r"kahvila|coffee|cafe|espresso|fazer", "cafes", 0.88),
    (r"\btaksi\b|\btaxi\b|\buber\b|\bbolt\b|\byango\b", "taxis", 0.88),
    (r"\bhsl\b|\bvr\b", "transport", 0.90),
    (r"netflix|spotify|disney|viaplay", "subscriptions", 0.88),
    (r"apteekki|pharmacy|laakari|terveystalo|mehilainen|yths", "healthcare", 0.88),
    (r"\bvuokra\b|rent|kojamo|lumo|sato|hoas", "rent", 0.94),
    (r"\bsahko\b|electricity|helen|fortum|caruna", "electricity", 0.90),
    (r"elisa|dna|telia|moi", "phone_internet", 0.88),
    (r"vakuutus|insurance|lahitapiola|pohjola|fennia", "insurance", 0.90),
]


def resolve_category_alias(raw_category: str) -> str | None:
    return CATEGORY_ALIASES.get(_key(raw_category or ""))


def category_label_fi(category_key: str) -> str:
    canonical = resolve_category_alias(category_key) or category_key
    return CATEGORY_LABELS_FI.get(canonical, str(category_key).capitalize())


def priorities_to_protected_categories(priorities: list[str] | None) -> list[str]:
    protected: set[str] = set()
    for p in priorities or []:
        norm = _key(p)
        if norm in PRIORITY_TO_CATEGORIES:
            protected |= PRIORITY_TO_CATEGORIES[norm]
        elif "ruoka" in norm:
            protected.add("groceries")
        elif "liikunta" in norm or "harrast" in norm:
            protected.add("leisure")
    return sorted(protected & EVERYDAY)


def categorize(description: str, amount_cents: int, provided_category: str | None = None) -> dict[str, Any]:
    provided = _key(provided_category or "")
    category = CATEGORY_ALIASES.get(provided)
    source = "provided" if category else "unclassified"
    confidence = 1.0 if category else 0.0
    if not category:
        norm_desc = _key(description).replace("_", " ")
        for pattern, candidate, score in MERCHANT_RULES:
            if re.search(pattern, norm_desc):
                category, confidence, source = candidate, score, "merchant_rule"
                break
    if not category:
        category = "other_income" if amount_cents > 0 else "other_everyday"
        confidence = 0.5
        source = "sign_only"
    if category in TRANSFERS:
        bucket = "excluded_transfer"
    elif amount_cents > 0:
        bucket = "income"
        if category not in INCOME:
            category, confidence, source = "other_income", 0.5, "sign_only"
    elif category in INCOME:
        bucket = "income_reversal"
    elif category in REGULAR:
        bucket = "mandatory_regular"
    elif category in IRREGULAR:
        bucket = "mandatory_irregular"
    elif category in EVERYDAY:
        bucket = "everyday"
    else:
        bucket = "unclassified"
    return {
        "category": category,
        "bucket": bucket,
        "classification_confidence": confidence,
        "classification_source": source,
        "needs_review": confidence < 0.75,
    }


class FinancialEngine:
    """Pure deterministic finance calculations powered by integer cents."""

    def __init__(self, transactions: list[dict[str, Any]], profile: dict[str, Any] | None = None, *, as_of: str | date | None = None):
        self.transactions = list(transactions)
        self.profile = dict(profile or {})
        self.as_of = parse_date(as_of) if as_of else date.today()
        self.corrections: dict[str, str] = {}

    def _tx(self, start: date | None = None, end: date | None = None) -> list[dict[str, Any]]:
        output = []
        for tx in self.transactions:
            if tx["date"] > self.as_of or (start and tx["date"] < start) or (end and tx["date"] > end):
                continue
            item = dict(tx)
            if tx["id"] in self.corrections:
                updated = categorize(tx["description"], tx["amount_cents"], self.corrections[tx["id"]])
                item.update(updated)
                item["classification_source"] = "user_correction"
                item["needs_review"] = False
            output.append(item)
        return output

    def analyze_transactions(self, *, start: str | date | None = None, end: str | date | None = None) -> dict[str, Any]:
        start_d = parse_date(start) if start else None
        end_d = parse_date(end) if end else self.as_of
        if start_d and start_d > end_d:
            raise FinancialError("Alkupäivä on loppupäivän jälkeen")
        transactions = self._tx(start_d, end_d)
        by_cat: dict[str, int] = defaultdict(int)
        by_bucket: dict[str, int] = defaultdict(int)
        income, expenses, transfers, unclassified = 0, 0, 0, 0
        for tx in transactions:
            amount = tx["amount_cents"]
            if tx["bucket"] == "excluded_transfer":
                transfers += abs(amount)
            elif tx["bucket"] == "income_reversal":
                income += amount
            elif amount > 0:
                income += amount
            elif amount < 0:
                expenses += -amount
                by_cat[tx["category"]] += -amount
                by_bucket[tx["bucket"]] += -amount
                if tx["bucket"] == "unclassified":
                    unclassified += -amount
        return {
            "currency": "EUR",
            "period": {"start": start_d.isoformat() if start_d else None, "end": end_d.isoformat()},
            "income_cents": income,
            "expenses_cents": expenses,
            "net_cents": income - expenses,
            "excluded_transfers_cents": transfers,
            "unclassified_expenses_cents": unclassified,
            "by_category_cents": dict(sorted(by_cat.items(), key=lambda x: -x[1])),
            "by_bucket_cents": dict(sorted(by_bucket.items())),
            "transaction_count": len(transactions),
        }

    def _monthly_history(self, months: int = 3) -> dict[str, Any]:
        first_this_month = date(self.as_of.year, self.as_of.month, 1)
        start = add_months(first_this_month, -months)
        end = first_this_month - timedelta(days=1)
        filtered = self._tx(start, end)
        covered = sorted({t["date"].strftime("%Y-%m") for t in filtered})
        effective_months = max(1, len(covered))

        if not filtered:
            start = self.as_of - timedelta(days=29)
            end = self.as_of
            filtered = self._tx(start, end)
            covered = sorted({t["date"].strftime("%Y-%m") for t in filtered})
            effective_months = 1

        by_bucket: dict[str, int] = defaultdict(int)
        by_category: dict[str, int] = defaultdict(int)
        for tx in filtered:
            if tx["amount_cents"] < 0 and tx["bucket"] not in {"excluded_transfer", "income_reversal"}:
                by_bucket[tx["bucket"]] += -tx["amount_cents"]
                by_category[tx["category"]] += -tx["amount_cents"]
            elif tx["amount_cents"] > 0 and tx["bucket"] != "excluded_transfer":
                by_bucket["income"] += tx["amount_cents"]

        return {
            "months": effective_months,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "months_with_transactions": covered,
            "by_bucket_average_cents": {k: proportional(v, 1, effective_months) for k, v in by_bucket.items()},
            "by_category_average_cents": {k: proportional(v, 1, effective_months) for k, v in by_category.items()},
        }

    def find_savings_opportunities(
        self,
        *,
        protected_categories: list[str] | None = None,
        months: int = 3,
        percentages: tuple[int, ...] = (10, 20),
    ) -> dict[str, Any]:
        protected = set(protected_categories or [])
        history = self._monthly_history(months)
        averages = history["by_category_average_cents"]
        opportunities = []
        for category, average in sorted(averages.items(), key=lambda x: -x[1]):
            if category not in SAVINGS_CANDIDATES or category in protected or average <= 0:
                continue
            options = []
            for pct in percentages:
                saved = proportional(average, pct, 100)
                options.append({
                    "reduction_percent": pct,
                    "monthly_saving_cents": saved,
                    "monthly_saving_eur": cents_to_eur(saved),
                    "annual_saving_cents": saved * 12,
                    "annual_saving_eur": cents_to_eur(saved * 12),
                })
            opportunities.append({
                "category": category,
                "category_fi": category_label_fi(category),
                "monthly_average_cents": average,
                "monthly_average_eur": cents_to_eur(average),
                "scenarios": options,
            })
        return {
            "currency": "EUR",
            "protected_categories": sorted(protected),
            "opportunities": opportunities,
        }

    def get_financial_forecast(
        self,
        *,
        monthly_everyday_budget_cents: int,
        monthly_savings_cents: int,
        months: int = 6,
        starting_checking_cents: int = 0,
        starting_buffer_cents: int = 0,
    ) -> list[dict[str, Any]]:
        records = []
        checking = starting_checking_cents
        buffer_bal = starting_buffer_cents
        goal_fund = 0
        half_save = proportional(monthly_savings_cents, 1, 2)
        other_half = monthly_savings_cents - half_save

        for idx in range(1, months + 1):
            buffer_bal += half_save
            goal_fund += other_half
            target_month = add_months(date(self.as_of.year, self.as_of.month, 1), idx).strftime("%Y-%m")
            records.append({
                "month": target_month,
                "checking_eur": cents_to_eur(checking),
                "buffer_eur": cents_to_eur(buffer_bal),
                "goal_fund_eur": cents_to_eur(goal_fund),
                "weekly_everyday_eur": cents_to_eur(monthly_to_weekly(monthly_everyday_budget_cents)),
            })
        return records