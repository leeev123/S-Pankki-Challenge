from __future__ import annotations

from pathlib import Path
from typing import Any
import re
import pandas as pd

# Avainsanat, joilla päätellään kategoria automaattisesti, jos Excel-tiliotteessa ei ole Kategoria-saraketta
KEYWORD_CATEGORY_MAP = {
    "salary": ["palkka", "salary", "etuus", "kela", "opintotuki"],
    "rent": ["vuokra", "asunto", "hoas", "sato", "lumo", "vastike"],
    "utilities": ["helen", "fortum", "sähkö", "caruna", "vesi"],
    "telecom": ["elisa", "telia", "dna", "moi"],
    "insurance": ["lähitapiola", "if ", "pohjola", "fennia", "vakuutus"],
    "pharmacy": ["apteekki", "yliopiston apteekki"],
    "health": ["terveystalo", "mehiläinen", "hammas", "lääkäri"],
    "repair": ["autohuolto", "korjaamo", "gigantti", "verkkokauppa"],
    "groceries": ["s-market", "prisma", "alepa", "sale", "k-market", "k-citymarket", "lidl", "ruoka"],
    "cafe": ["espresso house", "robert's coffee", "fazer", "kahvila", "cafe", "arnolds"],
    "restaurant": ["ravintola", "wolt", "foodora", "hesburger", "mcdonald", "friends & brgrs", "pizzeria"],
    "taxi": ["taksi", "taxi", "bolt", "uber", "yang"],
}


def _clean_euro_value(val: Any) -> float:
    """Muuttaa erilaiset euromuodot (esim. '-12,50 €', '1 200.00') Pythonin float-luvuksi."""
    if pd.isna(val):
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    text = str(val).replace("€", "").replace("\xa0", "").replace(" ", "").replace(",", ".")
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    return float(match.group(0)) if match else 0.0


def _infer_category(merchant_or_desc: str, amount: float) -> str:
    """Päättelee kategorian saajan/maksajan tai selitteen perusteella."""
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
    """Etsii DataFramesta ensimmäisen sarakkeen, joka vastaa jotain yleistä suomi/englanti-nimeä."""
    lower_map = {str(c).strip().lower(): c for c in columns}
    for cand in candidates:
        if cand in lower_map:
            return lower_map[cand]
    # Osittainen osuma (esim. 'Määrä EUR' sisältää sanan 'määrä')
    for col_lower, orig_col in lower_map.items():
        if any(cand in col_lower for cand in candidates):
            return orig_col
    return None


def parse_excel_statement(file_path: Path, customer_id: str = "CUST_001") -> pd.DataFrame:
    """
    Lukee Excel-tiliotteen (.xlsx / .xls) ja muuntaa sen samaan muotoon
    kuin S-Pankin synteettinen CSV-data.
    """
    # Luetaan Excel-tiedoston ensimmäinen välilehti
    raw_df = pd.read_excel(file_path, engine="openpyxl")
    raw_df = raw_df.dropna(how="all")  # Poistetaan täysin tyhjät rivit

    cols = list(raw_df.columns)

    # Etsitään joustavasti yleisimmät sarakkeet (S-Pankki, Nordea, OP tai oma synteettinen Excel)
    date_col = _find_matching_column(cols, ["tx_date", "kirjauspäivä", "maksupäivä", "päivämäärä", "pvm", "date"])
    amount_col = _find_matching_column(cols, ["tx_amount_eur", "määrä", "summa", "amount", "veloitus/hyvitys"])
    merchant_col = _find_matching_column(cols, ["merchant_id", "saaja/maksaja", "saaja", "maksaja", "selite", "kuvaus", "merchant", "viesti"])
    category_col = _find_matching_column(cols, ["category", "kategoria", "luokka", "tapahtumalaji"])
    balance_col = _find_matching_column(cols, ["balance_after_eur", "saldo", "balance"])
    cust_col = _find_matching_column(cols, ["customer_id", "asiakasnumero"])

    if not amount_col:
        raise ValueError("Excel-tiedostosta ei löytynyt summa-saraketta (esim. 'Summa', 'Määrä' tai 'tx_amount_eur').")

    normalized = pd.DataFrame()
    normalized["customer_id"] = raw_df[cust_col].astype(str) if cust_col else customer_id
    normalized["bank_account_id"] = "EXCEL_IMPORT"

    # Päivämäärän parsiminen (tukee myös suomalaista muotoa dd.mm.yyyy)
    if date_col:
        normalized["tx_date"] = pd.to_datetime(raw_df[date_col], dayfirst=True, errors="coerce")
    else:
        normalized["tx_date"] = pd.Timestamp.today()

    normalized["tx_timestamp"] = normalized["tx_date"].dt.strftime("%Y-%m-%dT12:00:00")
    normalized["tx_amount_eur"] = raw_df[amount_col].apply(_clean_euro_value)

    if merchant_col:
        normalized["merchant_id"] = raw_df[merchant_col].fillna("Tuntematon kauppias").astype(str)
    else:
        normalized["merchant_id"] = "Tiliotetapahtuma"

    # Jos Excelissä on valmis kategoria, käytetään sitä; muuten päätellään
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

    # Jos saldo puuttuu Excelistä, simuloidaan juokseva saldo järjestyksessä
    if balance_col:
        normalized["balance_after_eur"] = raw_df[balance_col].apply(_clean_euro_value)
    else:
        normalized = normalized.sort_values("tx_date", ascending=True)
        normalized["balance_after_eur"] = (1200.0 + normalized["tx_amount_eur"].cumsum()).round(2)

    normalized["transaction_type"] = normalized["tx_amount_eur"].apply(lambda x: "CREDIT" if x > 0 else "DEBIT")
    normalized["mcc_code"] = 0

    return normalized.dropna(subset=["tx_date"]).sort_values("tx_date", ascending=False)