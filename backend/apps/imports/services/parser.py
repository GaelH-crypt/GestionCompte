import io
import pandas as pd


class ParseError(Exception):
    pass


class ColumnMappingRequired(Exception):
    def __init__(self, sheets: list[dict]):
        self.sheets = sheets


def _rib_from_sheet_name(sheet_name: str) -> str:
    parts = sheet_name.split(' ', 1)
    if len(parts) == 2:
        return parts[1].strip()
    return sheet_name


def _parse_accounts_sheet(xl: pd.ExcelFile) -> list[dict]:
    try:
        df = xl.parse('Vos comptes', header=1, usecols=range(4))
    except Exception as e:
        raise ParseError("Sheet 'Vos comptes' not found.") from e
    df.columns = ['name', 'rib', 'balance', 'currency']
    df = df.dropna(subset=['name'])
    df = df[df['name'].astype(str).str.strip() != '']
    accounts = []
    for _, row in df.iterrows():
        name = str(row['name']).strip()
        rib = str(row['rib']).strip() if pd.notna(row['rib']) else ''
        balance = float(row['balance']) if pd.notna(row['balance']) else 0.0
        accounts.append({'name': name, 'rib': rib, 'balance': balance})
    return accounts


def _parse_account_sheet(xl: pd.ExcelFile, sheet_name: str) -> tuple[str, list[dict]]:
    raw = xl.parse(sheet_name, header=None)
    rib = _rib_from_sheet_name(sheet_name)
    if not raw.empty:
        cell = str(raw.iloc[0, 0])
        if 'R.I.B.' in cell or 'R.I.B' in cell:
            parts = cell.split(':')
            if len(parts) >= 2:
                rib = parts[-1].strip()

    df = xl.parse(sheet_name, header=3)
    if df.shape[1] < 5:
        return rib, []
    df = df.iloc[:, :7]
    col_names = ['date', 'value_date', 'description', 'debit', 'credit', 'balance', 'currency']
    df.columns = col_names[:df.shape[1]]
    for col in col_names:
        if col not in df.columns:
            df[col] = None

    df = df[pd.to_datetime(df['date'], errors='coerce').notna()]
    skip_patterns = ['Solde au', 'Solde initial', 'Liste de vos comptes']
    for pat in skip_patterns:
        df = df[~df['description'].astype(str).str.contains(pat, na=False)]

    transactions = []
    for _, row in df.iterrows():
        desc = str(row['description']).strip()
        if not desc or desc == 'nan':
            continue
        debit = float(row['debit']) if pd.notna(row['debit']) else None
        credit = float(row['credit']) if pd.notna(row['credit']) else None
        if debit is not None and debit < 0:
            tx_type, amount = 'expense', abs(debit)
        elif debit is not None and debit > 0:
            tx_type, amount = 'expense', debit
        elif credit is not None:
            tx_type, amount = 'income', abs(credit)
        else:
            continue
        date_str = pd.to_datetime(row['date']).strftime('%Y-%m-%d')
        transactions.append({
            'date': date_str,
            'description': desc,
            'amount': round(amount, 2),
            'transaction_type': tx_type,
        })
    return rib, transactions


def _parse_credit_mutuel(xl: pd.ExcelFile) -> dict:
    accounts = _parse_accounts_sheet(xl)
    transactions: dict = {}
    for sheet in xl.sheet_names:
        if sheet.startswith('Cpt '):
            rib, txs = _parse_account_sheet(xl, sheet)
            transactions.setdefault(rib, []).extend(txs)
    return {'accounts': accounts, 'transactions': transactions}


def parse_excel(file, column_hints: dict | None = None) -> dict:
    if isinstance(file, bytes):
        buf = io.BytesIO(file)
    else:
        buf = file

    xl = pd.ExcelFile(buf, engine='openpyxl')

    if 'Vos comptes' in xl.sheet_names and any(s.startswith('Cpt ') for s in xl.sheet_names):
        try:
            return _parse_credit_mutuel(xl)
        except ParseError:
            pass

    raise ColumnMappingRequired([])  # remplacé à la Task 2
