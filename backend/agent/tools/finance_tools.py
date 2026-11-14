"""
Työkalut (Tools), joita AI-agentti voi kutsua.
Python hoitaa kaiken tarkan laskennan ja agentti selittää tulokset käyttäjälle.
"""

from finance.engine import get_financial_snapshot, simulate_purchase


def tool_get_financial_summary(customer_id: str) -> dict:
    """Palauttaa ajantasaisen käyttövaran, 3 kulutuskoria, kategoriat ja viimeisimmät kuitit."""
    return get_financial_snapshot(customer_id)


def tool_simulate_purchase(customer_id: str, item_name: str, price_eur: float) -> dict:
    """Simuloi suuremman hankinnan (esim. 1 200 € läppäri) ja palauttaa 3 vaihtoehtoa."""
    return simulate_purchase(customer_id, item_name, price_eur)


def tool_simulate_category_cut(customer_id: str, category_name: str, cut_percent: float) -> dict:
    """Laskee kuukausi- ja vuosisäästön, jos tiettyä kulukategoriaa vähennetään X %."""
    snap = get_financial_snapshot(customer_id)
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
    return {
        "category": matched_key,
        "current_monthly_eur": matched_val,
        "cut_percent": cut_percent,
        "monthly_savings_eur": monthly_save,
        "yearly_savings_eur": round(monthly_save * 12, 2),
        "weekly_gain_eur": round(monthly_save / 4.33, 2),
    }