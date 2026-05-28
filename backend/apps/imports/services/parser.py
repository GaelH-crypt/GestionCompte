import io
import pandas as pd


def _rib_from_sheet_name(sheet_name: str) -> str:
    """Extrait le numéro de compte depuis le nom de feuille 'Cpt 02625 00022060507'."""
    parts = sheet_name.split(' ', 1)
    if len(parts) == 2:
        return parts[1].strip()
    return sheet_name


def _parse_accounts_sheet(xl: pd.ExcelFile) -> list[dict]:
    df = xl.parse('Vos comptes', header=1)
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
    rib = _rib_from_sheet_name(sheet_name)
    df = xl.parse(sheet_name, header=3, usecols=range(7))
    df.columns = ['date', 'value_date', 'description', 'debit', 'credit', 'balance', 'currency']

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
            transactions[rib] = txs

    return {'accounts': accounts, 'transactions': transactions}
