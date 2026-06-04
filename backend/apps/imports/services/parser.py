import io
import pandas as pd


class ParseError(Exception):
    pass


def _norm_rib(rib: str) -> str:
    """Normalise un RIB pour comparaison : sans espaces, majuscules."""
    return rib.replace(' ', '').upper()


class ColumnMappingRequired(Exception):
    def __init__(self, sheets: list[dict]):
        self.sheets = sheets


# ── Crédit Mutuel strategy ──────────────────────────────────────────────────

def _rib_from_sheet_name(sheet_name: str) -> str:
    parts = sheet_name.split(' ', 1)
    if len(parts) == 2:
        return parts[1].strip()
    return sheet_name


def _find_header_row(xl: pd.ExcelFile, sheet_name: str, keyword: str) -> int:
    """Trouve l'index de la ligne contenant keyword dans la première colonne."""
    raw = xl.parse(sheet_name, header=None, usecols=[0])
    for i, val in enumerate(raw.iloc[:, 0]):
        if isinstance(val, str) and keyword.lower() in val.lower():
            return i
    return 1


def _parse_accounts_sheet(xl: pd.ExcelFile) -> list[dict]:
    try:
        header_row = _find_header_row(xl, 'Vos comptes', 'Compte')
        df = xl.parse('Vos comptes', header=header_row, usecols=range(4))
    except Exception as e:
        raise ParseError("Feuille 'Vos comptes' introuvable. Vérifiez qu'il s'agit d'un export bancaire valide.") from e
    df.columns = ['name', 'rib', 'balance', 'currency']
    df = df.dropna(subset=['name'])
    df = df[df['name'].astype(str).str.strip() != '']
    df = df[~df['balance'].astype(str).str.lower().isin(['solde', 'balance', 'nan'])]
    accounts = []
    for _, row in df.iterrows():
        name = str(row['name']).strip()
        rib = str(row['rib']).strip() if pd.notna(row['rib']) else ''
        try:
            balance = float(row['balance']) if pd.notna(row['balance']) else 0.0
        except (ValueError, TypeError):
            balance = 0.0
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
    df = df.head(10000)
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


def _match_rib(short: str, full: str) -> bool:
    """True if short RIB is a substring of full RIB (handles IBAN vs short format)."""
    n_short = _norm_rib(short)
    n_full = _norm_rib(full)
    return n_short == n_full or n_short in n_full or n_full in n_short


def _parse_credit_mutuel(xl: pd.ExcelFile) -> dict:
    accounts = _parse_accounts_sheet(xl)
    # Transaction-sheet RIBs use a short format (bank+account, e.g. "02625 00023120602")
    # while "Vos comptes" RIBs use the full IBAN (e.g. "FR76026250002312060200").
    # Resolve each transaction-sheet RIB to the canonical account RIB via substring match.
    acc_ribs = [a['rib'] for a in accounts]

    transactions: dict = {}
    for sheet in xl.sheet_names:
        if sheet.startswith('Cpt '):
            raw_rib, txs = _parse_account_sheet(xl, sheet)
            canonical_rib = next(
                (r for r in acc_ribs if _match_rib(raw_rib, r)),
                raw_rib,
            )
            transactions.setdefault(canonical_rib, []).extend(txs)
    return {'accounts': accounts, 'transactions': transactions}


# ── Generic strategy ────────────────────────────────────────────────────────

_COLUMN_KEYWORDS: dict[str, list[str]] = {
    'date': ['date', 'datum'],
    'description': [
        'libellé', 'libelle', 'label', 'description',
        'opération', 'operation', 'motif',
        'référence', 'reference', 'intitulé', 'intitule',
    ],
    'debit': ['débit', 'debit', 'sortie', 'retrait'],
    'credit': ['crédit', 'credit', 'entrée', 'entree', 'versement'],
    'amount': ['montant', 'amount'],
}


def _to_float(v) -> float | None:
    if not pd.notna(v):
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        try:
            s = str(v).replace('\xa0', '').replace(' ', '')
            if ',' in s and '.' in s:
                if s.index(',') < s.index('.'):
                    s = s.replace(',', '')        # "1,234.56" → "1234.56"
                else:
                    s = s.replace('.', '').replace(',', '.')  # "1.234,56" → "1234.56"
            else:
                s = s.replace(',', '.')           # "1234,56" → "1234.56"
            return float(s)
        except (ValueError, TypeError):
            return None


def _score_row(row: list) -> int:
    found: set[str] = set()
    for cell in row:
        cell_str = str(cell).lower().strip() if (cell is not None and pd.notna(cell)) else ''
        for col_type, keywords in _COLUMN_KEYWORDS.items():
            if any(kw in cell_str for kw in keywords):
                found.add(col_type)
    return len(found)


def _detect_header_row(raw: pd.DataFrame) -> int | None:
    best_score = 1  # minimum threshold — must beat 1 to be considered a header
    best_idx = None
    for i in range(min(15, len(raw))):
        score = _score_row(raw.iloc[i].tolist())
        if score > best_score:
            best_score = score
            best_idx = i
    return best_idx


def _map_columns_generic(headers: list) -> dict:
    col_map: dict = {}
    for i, col in enumerate(headers):
        col_lower = str(col).lower().strip() if col else ''
        if not col_lower or col_lower == 'nan':
            continue
        if 'date_col' not in col_map and any(kw in col_lower for kw in _COLUMN_KEYWORDS['date']):
            col_map['date_col'] = i
        elif 'description_col' not in col_map and any(kw in col_lower for kw in _COLUMN_KEYWORDS['description']):
            col_map['description_col'] = i
        elif 'debit_col' not in col_map and any(kw in col_lower for kw in _COLUMN_KEYWORDS['debit']):
            col_map['debit_col'] = i
        elif 'credit_col' not in col_map and any(kw in col_lower for kw in _COLUMN_KEYWORDS['credit']):
            col_map['credit_col'] = i
        elif 'amount_col' not in col_map and any(kw in col_lower for kw in _COLUMN_KEYWORDS['amount']):
            col_map['amount_col'] = i
    return col_map


def _is_confident(col_map: dict) -> bool:
    has_date = 'date_col' in col_map
    has_amount = 'amount_col' in col_map or 'debit_col' in col_map or 'credit_col' in col_map
    return has_date and has_amount


def _parse_generic_sheet(xl: pd.ExcelFile, sheet_name: str, col_map: dict) -> list[dict]:
    raw = xl.parse(sheet_name, header=None)
    raw = raw.head(10000)
    transactions = []
    for _, row in raw.iterrows():
        row_list = row.tolist()

        date_idx = col_map.get('date_col')
        date_val = row_list[date_idx] if date_idx is not None and date_idx < len(row_list) else None
        parsed_date = pd.to_datetime(date_val, errors='coerce')
        if pd.isna(parsed_date):
            continue

        desc_idx = col_map.get('description_col')
        desc = str(row_list[desc_idx]).strip() if desc_idx is not None and desc_idx < len(row_list) else ''
        if not desc or desc == 'nan':
            continue

        amount_val = debit = credit = None
        amt_idx = col_map.get('amount_col')
        if amt_idx is not None and amt_idx < len(row_list):
            v = row_list[amt_idx]
            amount_val = _to_float(v)
        else:
            deb_idx = col_map.get('debit_col')
            cre_idx = col_map.get('credit_col')
            if deb_idx is not None and deb_idx < len(row_list):
                v = row_list[deb_idx]
                debit = _to_float(v)
            if cre_idx is not None and cre_idx < len(row_list):
                v = row_list[cre_idx]
                credit = _to_float(v)

        if amount_val is not None:
            if amount_val < 0:
                tx_type, tx_amount = 'expense', abs(amount_val)
            elif amount_val > 0:
                tx_type, tx_amount = 'income', amount_val
            else:
                continue
        elif debit is not None and debit != 0:
            tx_type, tx_amount = 'expense', abs(debit)
        elif credit is not None and credit != 0:
            tx_type, tx_amount = 'income', abs(credit)
        else:
            continue

        transactions.append({
            'date': parsed_date.strftime('%Y-%m-%d'),
            'description': desc,
            'amount': round(tx_amount, 2),
            'transaction_type': tx_type,
        })
    return transactions


def _parse_generic_excel(xl: pd.ExcelFile, column_hints: dict | None = None) -> dict:
    accounts: list[dict] = []
    transactions: dict = {}
    hints_matched_sheet = False

    for sheet_name in xl.sheet_names:
        raw = xl.parse(sheet_name, header=None)
        raw = raw.head(10000)
        if raw.empty or len(raw) < 2:
            continue

        hints_apply = column_hints is not None and (
            column_hints.get('sheet_name') == sheet_name
            or column_hints.get('sheet_name') is None
        )

        if hints_apply:
            hints_matched_sheet = True
            col_map = {k: v for k, v in column_hints.items() if k.endswith('_col') and v is not None}
        else:
            header_idx = _detect_header_row(raw)
            if header_idx is None:
                continue
            headers = [str(c) if pd.notna(c) else '' for c in raw.iloc[header_idx].tolist()]
            col_map = _map_columns_generic(headers)
            if not _is_confident(col_map):
                continue

        txs = _parse_generic_sheet(xl, sheet_name, col_map)
        if txs:
            accounts.append({'name': sheet_name, 'rib': sheet_name, 'balance': 0.0})
            transactions[sheet_name] = txs

    if not accounts:
        if column_hints is not None and hints_matched_sheet:
            # Hints matched a sheet but produced 0 valid transactions — return empty rather than asking again
            return {'accounts': [], 'transactions': {}}
        # Either no hints or hints didn't match any sheet — ask for manual mapping
        sheets_meta = []
        for sheet_name in xl.sheet_names:
            raw = xl.parse(sheet_name, header=None)
            if raw.empty or len(raw) < 2:
                continue
            header_idx = _detect_header_row(raw) or 0
            columns = [str(c) if pd.notna(c) else '' for c in raw.iloc[header_idx].tolist()]
            sample_rows = [
                [str(v) if pd.notna(v) else '' for v in raw.iloc[i].tolist()]
                for i in range(header_idx + 1, min(header_idx + 6, len(raw)))
            ]
            sheets_meta.append({'name': sheet_name, 'columns': columns, 'sample_rows': sample_rows})
        raise ColumnMappingRequired(sheets_meta)

    return {'accounts': accounts, 'transactions': transactions}


# ── Entry point ─────────────────────────────────────────────────────────────

def parse_excel(file, column_hints: dict | None = None) -> dict:
    _MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
    if isinstance(file, bytes):
        if len(file) > _MAX_FILE_SIZE:
            raise ValueError("File too large (max 10MB)")
        buf = io.BytesIO(file)
    else:
        file.seek(0, 2)
        size = file.tell()
        file.seek(0)
        if size > _MAX_FILE_SIZE:
            raise ValueError("File too large (max 10MB)")
        buf = file

    xl = pd.ExcelFile(buf, engine='openpyxl')
    if len(xl.sheet_names) > 20:
        raise ValueError("Too many sheets (max 20)")

    if 'Vos comptes' in xl.sheet_names and any(s.startswith('Cpt ') for s in xl.sheet_names):
        try:
            return _parse_credit_mutuel(xl)
        except ParseError:
            pass

    return _parse_generic_excel(xl, column_hints)
