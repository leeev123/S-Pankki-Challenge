from finance.engine import (
    build_deficit_budget_plan,
    find_savings_opportunities_for_statement,
    get_financial_snapshot,
    simulate_category_cut,
    simulate_purchase,
    simulate_unexpected_expense,
)


def tool_get_financial_summary(statement_id: str) -> dict:
    return get_financial_snapshot(statement_id)


def tool_find_savings_opportunities(statement_id: str) -> dict:
    return find_savings_opportunities_for_statement(statement_id)


def tool_simulate_purchase(statement_id: str, item_name: str, price_eur: float) -> dict:
    return simulate_purchase(statement_id, item_name, price_eur)


def tool_simulate_category_cut(statement_id: str, category_name: str, cut_percent: float) -> dict:
    return simulate_category_cut(statement_id, category_name, cut_percent)


def tool_simulate_unexpected_expense(statement_id: str, description: str, price_eur: float) -> dict:
    return simulate_unexpected_expense(statement_id, description, price_eur)


def tool_propose_deficit_budget(
    statement_id: str,
    funding_source: str,
    monthly_funding_eur: float,
    everyday_trim_eur: float = 0.0,
) -> dict:
    return build_deficit_budget_plan(statement_id, funding_source, monthly_funding_eur, everyday_trim_eur)