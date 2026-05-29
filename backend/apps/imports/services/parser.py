import io
import pandas as pd


class ParseError(Exception):
    pass


def _rib_from_sheet_name(sheet_name: str) -> str:
    """Extrait le numéro de compte depuis le nom de feuille 'Cpt 02625 00022060507'."""
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
    # Read raw to extract full RIB from row 0
    raw = xl.parse(sheet_name, header=None)
    rib = _rib_from_sheet_name(sheet_name)  # fallback
    if not raw.empty:
        cell = str(raw.iloc[0, 0])
        if 'R.I.B.' in cell or 'R.I.B' in cell:
            # Format: "R.I.B. : 10278 02625 00022060507"
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

    # Filtrer les lignes sans date valide ou avec libellé de pied de page
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
            tx_type = 'expense'
            amount = abs(debit)
        elif debit is not None and debit > 0:
            tx_type = 'expense'
            amount = debit
        elif credit is not None:
            tx_type = 'income'
            amount = abs(credit)
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


def parse_excel(file) -> dict:
    """
    Parse un fichier Excel Crédit Mutuel.
    Retourne {'accounts': [...], 'transactions': {rib: [...]}}
    """
    if isinstance(file, (str, bytes)):
        buf = io.BytesIO(file) if isinstance(file, bytes) else file
    else:
        buf = file

    xl = pd.ExcelFile(buf, engine='openpyxl')

    accounts = _parse_accounts_sheet(xl)
    transactions = {}

    for sheet in xl.sheet_names:
        if sheet.startswith('Cpt '):
            rib, txs = _parse_account_sheet(xl, sheet)
            if rib in transactions:
                transactions[rib].extend(txs)
            else:
                transactions[rib] = txs

    return {'accounts': accounts, 'transactions': transactions}
