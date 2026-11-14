from __future__ import annotations

from pathlib import Path
from typing import Any
import re
import pandas as pd

KEYWORD_CATEGORY_MAP = {
    "salary": ["palkka", "salary", "etuus", "kela", "opintotuki", "eläke"],
    "rent": ["vuokra", "asunto", "hoas", "sato", "lumo", "vastike"],
    "utilities": ["helen", "fortum", "sähkö", "caruna", "vesi"],
    "telecom": ["elisa", "telia", "dna", "moi"],
    "insurance": ["lähitapiola", "if ", "pohjola", "fennia", "vakuutus"],
    "pharmacy": ["apteekki", "yliopiston apteekki"],
    "health": ["terveystalo", "mehiläinen", "hammas", "lääkäri"],
    "repair": ["autohuolto", "korjaamo", "gigantti", "verkkokauppa"],
    "groceries": ["s-market", "prisma", "alepa", "sale", "k-market", "k-citymarket", "lidl", "ruoka"],
    "cafe": ["espresso house", "robert's coffee", "fazer", "kahvila", "cafe", "arnolds"],
    "restaurant": ["ravintola", "wolt", "foodora", "hesburger", "mcdonald", "friends & brgrs", "pizzeria", "unicafe"],
    "taxi": ["taksi", "taxi", "bolt", "uber", "yango", "hsl"],
}


def _clean_euro_value(val: Any) -> float:
    """Muuttaa erilaiset euromuodot (esim. '-12,50 €', '1 200.00') float-luvuksi."""
    if pd.isna(val):
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    text = str(val).replace("€", "").replace("\xa0", "").replace(" ", "").replace(",", ".")
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    return float(match.group(0)) if match else 0.0


def _infer_category(merchant_or_desc: str, amount: float) -> str:
    text = str(merchant_or_desc).lower()
    if amount > 0:
        for kw in KEYWORD_CATEGORY_MAP["salary"]:
            if kw in text:
                return "salary"
        return "income"

    for category, keywords in KEYWORD_CATEGORY_MAP.items():
        if category == "salary":
            continue
        if any(kw in text for kw in keywords):
            return category
    return "other_everyday"


def _find_matching_column(columns: list[str], candidates: list[str]) -> str | None:
    lower_map = {str(c).strip().lower(): c for c in columns}
    for cand in candidates:
        if cand in lower_map:
            return lower_map[cand]
    for col_lower, orig_col in lower_map.items():
        if any(cand in col_lower for cand in candidates):
            return orig_col
    return None


def parse_statement_file(file_path: Path, statement_id: str = "DEMO_TILIOTE") -> pd.DataFrame:
    """
    Lukee tiedostomuotoisen tiliotteen (.xlsx, .xls tai .csv) ja muuntaa sen
    yhtenäiseen muotoon Suunta-laskentaohjelmaa varten.
    """
    suffix = file_path.suffix.lower()
    if suffix == ".csv":
        sample_head = file_path.read_text(encoding="utf-8", errors="ignore").splitlines()[:2]
        sep = ";" if sample_head and ";" in sample_head[0] else ","
        raw_df = pd.read_csv(file_path, sep=sep)
    else:
        raw_df = pd.read_excel(file_path, engine="openpyxl")

    raw_df = raw_df.dropna(how="all")
    if raw_df.empty:
        raise ValueError("Tiedosto on tyhjä. Lisää vähintään otsikkorivi ja yksi tapahtuma.")

    cols = list(raw_df.columns)
    date_col = _find_matching_column(cols, ["tx_date", "kirjauspäivä", "maksupäivä", "päivämäärä", "pvm", "date"])
    amount_col = _find_matching_column(cols, ["tx_amount_eur", "määrä", "summa", "amount", "veloitus/hyvitys"])
    merchant_col = _find_matching_column(cols, ["merchant_id", "saaja/maksaja", "saaja", "maksaja", "selite", "kuvaus", "merchant", "viesti"])
    category_col = _find_matching_column(cols, ["category", "kategoria", "luokka", "tapahtumalaji"])
    balance_col = _find_matching_column(cols, ["balance_after_eur", "saldo", "balance"])

    if not amount_col:
        raise ValueError("Tiliotetiedostosta ei löytynyt summa-saraketta (esim. 'Summa', 'Määrä' tai 'tx_amount_eur').")

    normalized = pd.DataFrame()
    normalized["statement_id"] = statement_id
    normalized["bank_account_id"] = "IMPORTED_STATEMENT"

    if date_col:
        normalized["tx_date"] = pd.to_datetime(raw_df[date_col], dayfirst=True, errors="coerce")
    else:
        normalized["tx_date"] = pd.Timestamp.today()

    normalized["tx_date"] = normalized["tx_date"].fillna(pd.Timestamp.today())
    normalized["tx_timestamp"] = normalized["tx_date"].dt.strftime("%Y-%m-%dT12:00:00")
    normalized["tx_amount_eur"] = raw_df[amount_col].apply(_clean_euro_value)

    if merchant_col:
        normalized["merchant_id"] = raw_df[merchant_col].fillna("Tiliotetapahtuma").astype(str)
    else:
        normalized["merchant_id"] = "Tiliotetapahtuma"

    if category_col:
        normalized["category"] = [
            str(cat).strip() if pd.notna(cat) and str(cat).strip() else _infer_category(merch, amt)
            for cat, merch, amt in zip(raw_df[category_col], normalized["merchant_id"], normalized["tx_amount_eur"])
        ]
    else:
        normalized["category"] = [
            _infer_category(merch, amt)
            for merch, amt in zip(normalized["merchant_id"], normalized["tx_amount_eur"])
        ]

    if balance_col:
        normalized["balance_after_eur"] = raw_df[balance_col].apply(_clean_euro_value)
    else:
        normalized = normalized.sort_values("tx_date", ascending=True)
        normalized["balance_after_eur"] = (1200.0 + normalized["tx_amount_eur"].cumsum()).round(2)

    normalized["transaction_type"] = normalized["tx_amount_eur"].apply(lambda x: "CREDIT" if x > 0 else "DEBIT")
    return normalized.sort_values("tx_date", ascending=False)