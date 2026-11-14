"""
Työkalut (Tools), joita tekoälyagentti kutsuu.
Kaikki matemaattinen laskenta tehdään engine.py-laskentaohjelmassa.
"""

from finance.engine import (
    get_financial_snapshot,
    simulate_category_cut,
    simulate_purchase,
    simulate_unexpected_expense,
)


def tool_get_financial_summary(statement_id: str) -> dict:
    return get_financial_snapshot(statement_id)


def tool_simulate_purchase(statement_id: str, item_name: str, price_eur: float) -> dict:
    return simulate_purchase(statement_id, item_name, price_eur)


def tool_simulate_category_cut(statement_id: str, category_name: str, cut_percent: float) -> dict:
    return simulate_category_cut(statement_id, category_name, cut_percent)


def tool_simulate_unexpected_expense(statement_id: str, description: str, price_eur: float) -> dict:
    return simulate_unexpected_expense(statement_id, description, price_eur)