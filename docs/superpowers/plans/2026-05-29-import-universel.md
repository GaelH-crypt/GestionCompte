# Import XLSX Universel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le parser d'import universel pour tout fichier XLSX bancaire, en gardant la compat Crédit Mutuel et en ajoutant un step de mapping colonnes quand le format est inconnu.

**Architecture:** Parser multi-stratégie dans `parser.py` — essaie Crédit Mutuel d'abord, puis détection générique par score de mots-clés, puis lève `ColumnMappingRequired` avec les métadonnées brutes. Le wizard frontend insère un step optionnel `'columns'` entre upload et mapping quand le backend retourne 422.

**Tech Stack:** Python 3.12, pandas, openpyxl (backend) · React 18, TypeScript, axios (frontend)

---

## File Map

**Backend — modifiés**
- `backend/apps/imports/services/parser.py` — multi-stratégie + détection générique + `ColumnMappingRequired`
- `backend/apps/imports/views.py` — attract `ColumnMappingRequired`, retourner 422, accepter `column_hints`
- `backend/apps/imports/tests.py` — nouveaux tests format générique + API 422

**Frontend — modifiés**
- `frontend/src/types/index.ts` — ajouter `SheetMeta`, `ColumnHints`
- `frontend/src/api/imports.ts` — paramètre `columnHints?` dans `preview()`
- `frontend/src/components/ImportWizard/StepUpload.tsx` — texte générique
- `frontend/src/components/ImportWizard/ImportWizard.tsx` — step `'columns'`, stockage du `File`, gestion 422

**Frontend — créés**
- `frontend/src/components/ImportWizard/StepColumns.tsx` — nouveau composant mapping colonnes

---

### Task 1: Refactor parser.py — extraire la stratégie Crédit Mutuel

**Files:**
- Modify: `backend/apps/imports/services/parser.py`
- Test: `backend/apps/imports/tests.py` (tests existants doivent rester verts)

- [ ] **Step 1: Run existing tests — confirmer baseline verte**

```
cd backend
python manage.py test apps.imports.tests.ParserTest -v 2
```
Expected : 7 tests PASS

- [ ] **Step 2: Remplacer parser.py — extraire _parse_credit_mutuel, ajouter stub ColumnMappingRequired**

Remplacer `backend/apps/imports/services/parser.py` en entier :

```python
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
```

- [ ] **Step 3: Run existing tests — confirmer toujours verts**

```
python manage.py test apps.imports.tests.ParserTest -v 2
```
Expected : 7 tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/apps/imports/services/parser.py
git commit -m "refactor(imports): extract _parse_credit_mutuel, stub ColumnMappingRequired"
```

---

### Task 2: Implémentation du parser générique

**Files:**
- Modify: `backend/apps/imports/services/parser.py`
- Modify: `backend/apps/imports/tests.py`

- [ ] **Step 1: Ajouter les helpers de test dans tests.py**

Ajouter après la classe `CategorizerTest` existante dans `backend/apps/imports/tests.py` :

```python
def _make_generic_single_amount_excel() -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Compte Courant'
    ws.append(['Date', 'Libellé', 'Montant'])
    ws.append([datetime.datetime(2026, 5, 1), 'LIDL SUPERMARCHE', -25.50])
    ws.append([datetime.datetime(2026, 5, 2), 'VIREMENT SALAIRE', 2000.0])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _make_generic_debit_credit_excel() -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Mouvements'
    ws.append(['Date', 'Description', 'Débit', 'Crédit'])
    ws.append([datetime.datetime(2026, 5, 1), 'LOYER MAI', 800.0, None])
    ws.append([datetime.datetime(2026, 5, 3), 'SALAIRE', None, 2500.0])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _make_unknown_format_excel() -> bytes:
    """Fichier sans aucune colonne reconnue."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Sheet1'
    ws.append(['Foo', 'Bar', 'Baz'])
    ws.append(['x', 'y', 'z'])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


class GenericParserTest(TestCase):
    def test_single_amount_column(self):
        result = parse_excel(_make_generic_single_amount_excel())
        self.assertIn('Compte Courant', result['transactions'])
        txs = result['transactions']['Compte Courant']
        self.assertEqual(len(txs), 2)
        expense = next(t for t in txs if t['transaction_type'] == 'expense')
        self.assertAlmostEqual(expense['amount'], 25.50)
        income = next(t for t in txs if t['transaction_type'] == 'income')
        self.assertAlmostEqual(income['amount'], 2000.0)

    def test_debit_credit_columns(self):
        result = parse_excel(_make_generic_debit_credit_excel())
        self.assertIn('Mouvements', result['transactions'])
        txs = result['transactions']['Mouvements']
        self.assertEqual(len(txs), 2)
        loyer = next(t for t in txs if 'LOYER' in t['description'])
        self.assertEqual(loyer['transaction_type'], 'expense')
        salaire = next(t for t in txs if 'SALAIRE' in t['description'])
        self.assertEqual(salaire['transaction_type'], 'income')

    def test_unknown_format_raises_column_mapping_required(self):
        with self.assertRaises(ColumnMappingRequired) as ctx:
            parse_excel(_make_unknown_format_excel())
        self.assertGreater(len(ctx.exception.sheets), 0)
        sheet = ctx.exception.sheets[0]
        self.assertIn('name', sheet)
        self.assertIn('columns', sheet)
        self.assertIn('sample_rows', sheet)

    def test_column_hints_parse_transactions(self):
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Data'
        ws.append(['Timestamp', 'Note', 'Valeur'])
        ws.append([datetime.datetime(2026, 5, 1), 'Paiement CB', -50.0])
        ws.append([datetime.datetime(2026, 5, 2), 'Virement', 1000.0])
        buf = io.BytesIO()
        wb.save(buf)
        hints = {'sheet_name': 'Data', 'date_col': 0, 'description_col': 1, 'amount_col': 2}
        result = parse_excel(buf.getvalue(), column_hints=hints)
        self.assertIn('Data', result['transactions'])
        self.assertEqual(len(result['transactions']['Data']), 2)

    def test_credit_mutuel_still_works(self):
        from apps.imports.tests import _make_excel
        result = parse_excel(_make_excel())
        self.assertEqual(len(result['accounts']), 2)
```

- [ ] **Step 2: Run tests — confirmer qu'ils échouent**

```
python manage.py test apps.imports.tests.GenericParserTest -v 2
```
Expected : 5 FAIL

- [ ] **Step 3: Remplacer parser.py avec l'implémentation complète**

Remplacer `backend/apps/imports/services/parser.py` en entier :

```python
import io
import pandas as pd


class ParseError(Exception):
    pass


class ColumnMappingRequired(Exception):
    def __init__(self, sheets: list[dict]):
        self.sheets = sheets


# ── Crédit Mutuel strategy ──────────────────────────────────────────────────

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


def _score_row(row: list) -> int:
    found: set[str] = set()
    for cell in row:
        cell_str = str(cell).lower().strip() if cell is not None else ''
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
            amount_val = float(v) if pd.notna(v) else None
        else:
            deb_idx = col_map.get('debit_col')
            cre_idx = col_map.get('credit_col')
            if deb_idx is not None and deb_idx < len(row_list):
                v = row_list[deb_idx]
                debit = float(v) if pd.notna(v) else None
            if cre_idx is not None and cre_idx < len(row_list):
                v = row_list[cre_idx]
                credit = float(v) if pd.notna(v) else None

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

    for sheet_name in xl.sheet_names:
        raw = xl.parse(sheet_name, header=None)
        if raw.empty or len(raw) < 2:
            continue

        hints_apply = column_hints is not None and (
            column_hints.get('sheet_name') == sheet_name
            or column_hints.get('sheet_name') is None
        )

        if hints_apply:
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
        if column_hints is not None:
            # Hints provided but produced 0 transactions — return empty rather than asking again
            return {'accounts': [], 'transactions': {}}
        sheets_meta = []
        for sheet_name in xl.sheet_names:
            raw = xl.parse(sheet_name, header=None)
            if raw.empty:
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

    return _parse_generic_excel(xl, column_hints)
```

- [ ] **Step 4: Run tous les tests parser**

```
python manage.py test apps.imports.tests.ParserTest apps.imports.tests.GenericParserTest -v 2
```
Expected : 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/apps/imports/services/parser.py backend/apps/imports/tests.py
git commit -m "feat(imports): generic XLSX parser with auto-detect + ColumnMappingRequired"
```

---

### Task 3: views.py — gérer ColumnMappingRequired + accepter column_hints

**Files:**
- Modify: `backend/apps/imports/views.py`
- Modify: `backend/apps/imports/tests.py`

- [ ] **Step 1: Ajouter les tests API pour 422 et format générique**

Ajouter à `backend/apps/imports/tests.py` (après la classe `PreviewAPITest`) :

```python
class PreviewColumnMappingAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('colmap_user', password='pass')
        self.client.force_authenticate(user=self.user)

    def test_unknown_format_returns_422(self):
        resp = self.client.post(
            '/api/import/preview/',
            {'file': io.BytesIO(_make_unknown_format_excel())},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 422)
        data = resp.json()
        self.assertEqual(data['error'], 'column_mapping_required')
        self.assertIn('sheets', data)
        self.assertGreater(len(data['sheets']), 0)
        sheet = data['sheets'][0]
        self.assertIn('name', sheet)
        self.assertIn('columns', sheet)
        self.assertIn('sample_rows', sheet)

    def test_generic_format_returns_200(self):
        resp = self.client.post(
            '/api/import/preview/',
            {'file': io.BytesIO(_make_generic_single_amount_excel())},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn('accounts', data)
        self.assertIn('transactions', data)
        self.assertEqual(len(data['accounts']), 1)

    def test_column_hints_accepted(self):
        import json
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Data'
        ws.append(['Timestamp', 'Note', 'Valeur'])
        ws.append([datetime.datetime(2026, 5, 1), 'Paiement CB', -50.0])
        ws.append([datetime.datetime(2026, 5, 2), 'Virement', 1000.0])
        buf = io.BytesIO()
        wb.save(buf)
        excel_bytes = buf.getvalue()

        hints = json.dumps({'sheet_name': 'Data', 'date_col': 0, 'description_col': 1, 'amount_col': 2})
        resp = self.client.post(
            '/api/import/preview/',
            {'file': io.BytesIO(excel_bytes), 'column_hints': hints},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data['accounts']), 1)
        self.assertEqual(len(data['transactions']['Data']), 2)
```

- [ ] **Step 2: Run failing tests**

```
python manage.py test apps.imports.tests.PreviewColumnMappingAPITest -v 2
```
Expected : 3 FAIL

- [ ] **Step 3: Remplacer views.py**

Remplacer `backend/apps/imports/views.py` en entier :

```python
from decimal import Decimal
import datetime
import json

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from apps.imports.services.parser import parse_excel, ParseError, ColumnMappingRequired
from apps.imports.services.categorizer import suggest_category
from apps.imports.services.deduplicator import filter_duplicates
from apps.accounts.models import Account
from apps.transactions.models import Transaction
from apps.categories.models import Category


class PreviewView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'Aucun fichier fourni.'}, status=status.HTTP_400_BAD_REQUEST)

        column_hints = None
        raw_hints = request.data.get('column_hints')
        if raw_hints:
            try:
                column_hints = json.loads(raw_hints)
            except (json.JSONDecodeError, TypeError):
                pass

        try:
            parsed = parse_excel(file, column_hints)
        except ColumnMappingRequired as e:
            return Response(
                {'error': 'column_mapping_required', 'sheets': e.sheets},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        except ParseError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return Response({'error': 'Format de fichier non reconnu.'}, status=status.HTTP_400_BAD_REQUEST)

        user_accounts = list(Account.objects.filter(user=request.user))
        existing_accounts = [
            {'id': a.id, 'name': a.name, 'account_type': a.account_type}
            for a in user_accounts
        ]

        transactions_out = {}
        duplicate_counts = {}

        for rib, txs in parsed['transactions'].items():
            matching_account = next(
                (a for a in user_accounts if rib in a.name or a.name in rib),
                None,
            )
            account_id = matching_account.id if matching_account else None

            enriched = [
                {**tx, 'suggested_category': suggest_category(tx['description']), 'category_id': None}
                for tx in txs
            ]

            dup_count = 0
            if account_id:
                _, dup_count = filter_duplicates(txs, account_id)

            transactions_out[rib] = enriched
            duplicate_counts[rib] = dup_count

        return Response({
            'accounts': parsed['accounts'],
            'existing_accounts': existing_accounts,
            'transactions': transactions_out,
            'duplicate_counts': duplicate_counts,
        })


class ConfirmView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        mapping = request.data.get('mapping', {})
        transactions_payload = request.data.get('transactions', {})

        created_accounts = 0
        created_transactions = 0

        for rib, account_config in mapping.items():
            if account_config.get('create'):
                acc = Account.objects.create(
                    user=request.user,
                    name=account_config['name'],
                    account_type=account_config.get('account_type', 'checking'),
                    initial_balance=0,
                    color='#6366f1',
                    icon='CreditCard',
                )
                account_config['id'] = acc.id
                created_accounts += 1

        categories_by_id = {c.id: c for c in Category.objects.filter(user=request.user)}

        for rib, txs in transactions_payload.items():
            account_config = mapping.get(rib, {})
            account_id = account_config.get('id')
            if not account_id:
                continue

            try:
                account = Account.objects.get(id=account_id, user=request.user)
            except Account.DoesNotExist:
                return Response(
                    {'error': f'Compte {account_id} introuvable.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            existing_txs = set()
            for date_val, amount_val, desc in Transaction.objects.filter(account=account).values_list(
                'date', 'amount', 'description'
            ):
                date_str = date_val.strftime('%Y-%m-%d') if isinstance(date_val, datetime.date) else str(date_val)
                existing_txs.add((date_str, Decimal(str(amount_val)).quantize(Decimal('0.01')), desc))

            for tx in txs:
                amount = Decimal(str(tx['amount'])).quantize(Decimal('0.01'))
                key = (str(tx['date']), amount, tx['description'])
                if key in existing_txs:
                    continue
                Transaction.objects.create(
                    user=request.user,
                    account=account,
                    transaction_type=tx['transaction_type'],
                    amount=amount,
                    description=tx['description'],
                    date=tx['date'],
                    category=categories_by_id.get(tx.get('category_id')),
                    note='',
                    tags=[],
                )
                created_transactions += 1

        return Response({
            'created_accounts': created_accounts,
            'created_transactions': created_transactions,
        })
```

- [ ] **Step 4: Run tous les tests imports**

```
python manage.py test apps.imports -v 2
```
Expected : tous les tests PASS (ParserTest×7, GenericParserTest×5, DeduplicatorTest×2, CategorizerTest×6, PreviewAPITest×4, PreviewColumnMappingAPITest×3)

- [ ] **Step 5: Commit**

```bash
git add backend/apps/imports/views.py backend/apps/imports/tests.py
git commit -m "feat(imports): 422 column_mapping_required + column_hints support in PreviewView"
```

---

### Task 4: Types TypeScript

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Ajouter SheetMeta et ColumnHints après PreviewResponse**

Dans `frontend/src/types/index.ts`, après la ligne `export interface PreviewResponse {` et sa fermeture `}` (environ ligne 218), ajouter :

```typescript
export interface SheetMeta {
  name: string
  columns: string[]
  sample_rows: string[][]
}

export interface ColumnHints {
  sheet_name: string
  date_col: number
  description_col: number
  amount_col?: number
  debit_col?: number
  credit_col?: number
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(imports): add SheetMeta and ColumnHints TypeScript types"
```

---

### Task 5: Mettre à jour imports.ts

**Files:**
- Modify: `frontend/src/api/imports.ts`

- [ ] **Step 1: Remplacer imports.ts**

Remplacer `frontend/src/api/imports.ts` :

```typescript
import client from './client'
import type { PreviewResponse, ConfirmPayload, ConfirmResponse, ColumnHints } from '@/types'

export const importsApi = {
  preview: (file: File, columnHints?: ColumnHints) => {
    const form = new FormData()
    form.append('file', file)
    if (columnHints) form.append('column_hints', JSON.stringify(columnHints))
    return client.post<PreviewResponse>('/import/preview/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  confirm: (payload: ConfirmPayload) =>
    client.post<ConfirmResponse>('/import/confirm/', payload),
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/imports.ts
git commit -m "feat(imports): add optional columnHints param to preview API call"
```

---

### Task 6: StepUpload — supprimer les références Crédit Mutuel

**Files:**
- Modify: `frontend/src/components/ImportWizard/StepUpload.tsx`

- [ ] **Step 1: Remplacer StepUpload.tsx**

Remplacer `frontend/src/components/ImportWizard/StepUpload.tsx` :

```tsx
import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { clsx } from 'clsx'
import { Button } from '@/components/ui/Button'

interface Props {
  onFile: (file: File) => void
  loading: boolean
  error: string | null
}

export function StepUpload({ onFile, loading, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handle = (file: File | undefined) => {
    if (!file) return
    if (!file.name.endsWith('.xlsx')) return
    onFile(file)
  }

  return (
    <div className="space-y-4">
      <div
        className={clsx(
          'border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors',
          dragging ? 'border-brand-500 bg-brand-500/10' : 'border-gray-700 hover:border-gray-500',
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handle(e.dataTransfer.files[0])
        }}
      >
        <Upload className="h-8 w-8 text-gray-500" />
        <p className="text-sm text-gray-400">
          Glisser un fichier <span className="font-medium text-gray-200">.xlsx</span> ou cliquer pour sélectionner
        </p>
        <p className="text-xs text-gray-600">Fichier bancaire Excel</p>
        <Button size="sm" variant="secondary" type="button" loading={loading}>
          Choisir un fichier
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ImportWizard/StepUpload.tsx
git commit -m "feat(imports): remove Crédit Mutuel restriction from upload step"
```

---

### Task 7: Créer StepColumns

**Files:**
- Create: `frontend/src/components/ImportWizard/StepColumns.tsx`

- [ ] **Step 1: Créer StepColumns.tsx**

Créer `frontend/src/components/ImportWizard/StepColumns.tsx` :

```tsx
import { useState } from 'react'
import type { SheetMeta, ColumnHints } from '@/types'

interface Props {
  sheets: SheetMeta[]
  onSubmit: (hints: ColumnHints) => void
  loading: boolean
}

interface ColSelectProps {
  label: string
  columns: string[]
  value: number | null
  onChange: (v: number | null) => void
}

function ColSelect({ label, columns, value, onChange }: ColSelectProps) {
  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1">{label}</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand-500"
      >
        <option value="">— Choisir —</option>
        {columns.map((col, i) => (
          <option key={i} value={i}>{col || `Colonne ${i + 1}`}</option>
        ))}
      </select>
    </div>
  )
}

export function StepColumns({ sheets, onSubmit, loading }: Props) {
  const [activeSheet, setActiveSheet] = useState(0)
  const [dateCol, setDateCol] = useState<number | null>(null)
  const [descCol, setDescCol] = useState<number | null>(null)
  const [amountMode, setAmountMode] = useState<'single' | 'split'>('single')
  const [amountCol, setAmountCol] = useState<number | null>(null)
  const [debitCol, setDebitCol] = useState<number | null>(null)
  const [creditCol, setCreditCol] = useState<number | null>(null)

  const sheet = sheets[activeSheet]

  const canSubmit =
    dateCol !== null &&
    descCol !== null &&
    (amountMode === 'single' ? amountCol !== null : debitCol !== null || creditCol !== null)

  const handleSubmit = () => {
    if (!canSubmit) return
    const hints: ColumnHints = {
      sheet_name: sheet.name,
      date_col: dateCol!,
      description_col: descCol!,
      ...(amountMode === 'single'
        ? { amount_col: amountCol! }
        : {
            ...(debitCol !== null ? { debit_col: debitCol } : {}),
            ...(creditCol !== null ? { credit_col: creditCol } : {}),
          }),
    }
    onSubmit(hints)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        Le format de ce fichier n'a pas été reconnu automatiquement. Indiquez quelle colonne correspond à chaque champ.
      </p>

      {sheets.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setActiveSheet(i)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                i === activeSheet
                  ? 'border-brand-500 text-brand-400 bg-brand-500/10'
                  : 'border-gray-700 text-gray-500 hover:border-gray-500'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="text-xs w-full">
          <thead>
            <tr className="bg-gray-800">
              {sheet.columns.map((col, i) => (
                <th key={i} className="px-3 py-2 text-left text-gray-400 whitespace-nowrap font-medium">
                  {col || `Col ${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.sample_rows.map((row, ri) => (
              <tr key={ri} className="border-t border-gray-800">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-1.5 text-gray-300 whitespace-nowrap">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ColSelect label="Colonne Date *" columns={sheet.columns} value={dateCol} onChange={setDateCol} />
        <ColSelect label="Colonne Libellé *" columns={sheet.columns} value={descCol} onChange={setDescCol} />
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-400">Montant :</span>
        {(['single', 'split'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setAmountMode(mode)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              amountMode === mode
                ? 'border-brand-500 text-brand-400 bg-brand-500/10'
                : 'border-gray-700 text-gray-500 hover:border-gray-500'
            }`}
          >
            {mode === 'single' ? 'Colonne unique' : 'Débit + Crédit séparés'}
          </button>
        ))}
      </div>

      {amountMode === 'single' ? (
        <ColSelect label="Colonne Montant *" columns={sheet.columns} value={amountCol} onChange={setAmountCol} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <ColSelect label="Colonne Débit" columns={sheet.columns} value={debitCol} onChange={setDebitCol} />
          <ColSelect label="Colonne Crédit" columns={sheet.columns} value={creditCol} onChange={setCreditCol} />
        </div>
      )}

      <button
        type="button"
        disabled={!canSubmit || loading}
        onClick={handleSubmit}
        className="w-full py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? 'Analyse en cours…' : 'Suivant'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ImportWizard/StepColumns.tsx
git commit -m "feat(imports): StepColumns component for manual column mapping"
```

---

### Task 8: ImportWizard — orchestration du step colonnes

**Files:**
- Modify: `frontend/src/components/ImportWizard/ImportWizard.tsx`

- [ ] **Step 1: Remplacer ImportWizard.tsx**

Remplacer `frontend/src/components/ImportWizard/ImportWizard.tsx` :

```tsx
import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { importsApi } from '@/api/imports'
import { StepUpload } from './StepUpload'
import { StepColumns } from './StepColumns'
import { StepMapping } from './StepMapping'
import { StepPreview } from './StepPreview'
import { Button } from '@/components/ui/Button'
import type {
  PreviewResponse, AccountMapping, ImportedTransaction, Category,
  SheetMeta, ColumnHints,
} from '@/types'

type Step = 'upload' | 'columns' | 'mapping' | 'preview'

const STEP_NAMES: Record<Step, string> = {
  upload: 'Fichier',
  columns: 'Colonnes',
  mapping: 'Comptes',
  preview: 'Confirmation',
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  categories: Category[]
}

export function ImportWizard({ open, onOpenChange, categories }: Props) {
  const qc = useQueryClient()
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [columnSheets, setColumnSheets] = useState<SheetMeta[] | null>(null)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [mapping, setMapping] = useState<Record<string, AccountMapping>>({})
  const [transactions, setTransactions] = useState<Record<string, ImportedTransaction[]>>({})
  const [confirming, setConfirming] = useState(false)

  const reset = () => {
    setStep('upload')
    setFile(null)
    setUploading(false)
    setUploadError(null)
    setColumnSheets(null)
    setPreview(null)
    setMapping({})
    setTransactions({})
  }

  const handleFile = async (f: File, columnHints?: ColumnHints) => {
    setFile(f)
    setUploading(true)
    setUploadError(null)
    try {
      const { data } = await importsApi.preview(f, columnHints)
      setPreview(data)
      const initMapping: Record<string, AccountMapping> = {}
      for (const acc of data.accounts) {
        initMapping[acc.rib] = {
          rib: acc.rib,
          create: true,
          name: acc.name,
          account_type: 'checking',
        }
      }
      setMapping(initMapping)
      setTransactions(data.transactions)
      setStep('mapping')
    } catch (err: any) {
      if (err?.response?.status === 422 && err?.response?.data?.error === 'column_mapping_required') {
        setColumnSheets(err.response.data.sheets)
        setStep('columns')
      } else {
        setUploadError("Erreur lors de la lecture du fichier. Vérifiez qu'il s'agit d'un export bancaire valide (.xlsx).")
      }
    } finally {
      setUploading(false)
    }
  }

  const handleColumnsSubmit = (hints: ColumnHints) => {
    if (file) handleFile(file, hints)
  }

  const steps: Step[] = columnSheets !== null
    ? ['upload', 'columns', 'mapping', 'preview']
    : ['upload', 'mapping', 'preview']

  const stepLabels = steps.reduce<Record<Step, string>>(
    (acc, s, i) => ({ ...acc, [s]: `${i + 1}. ${STEP_NAMES[s]}` }),
    {} as Record<Step, string>,
  )

  const canProceedMapping =
    preview !== null &&
    Object.values(mapping).every((m) => (m.create ? m.name.trim().length > 0 : Boolean(m.id)))

  const handleCategoryChange = (rib: string, index: number, categoryId: number | null) => {
    setTransactions((prev) => {
      const updated = [...(prev[rib] ?? [])]
      updated[index] = { ...updated[index], category_id: categoryId }
      return { ...prev, [rib]: updated }
    })
  }

  const handleConfirm = async () => {
    setConfirming(true)
    try {
      await importsApi.confirm({ mapping, transactions })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      onOpenChange(false)
      reset()
    } finally {
      setConfirming(false)
    }
  }

  const handleBack = () => {
    const idx = steps.indexOf(step)
    const prev = idx > 0 ? steps[idx - 1] : 'upload'
    if (prev === 'upload') {
      setColumnSheets(null)
      setFile(null)
    }
    setStep(prev)
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-2xl max-h-[90vh] flex flex-col bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
            <div>
              <Dialog.Title className="text-base font-semibold text-gray-100">
                Importer un fichier
              </Dialog.Title>
              <div className="flex gap-3 mt-1">
                {steps.map((s) => (
                  <span
                    key={s}
                    className={`text-xs ${s === step ? 'text-brand-400 font-medium' : 'text-gray-600'}`}
                  >
                    {stepLabels[s]}
                  </span>
                ))}
              </div>
            </div>
            <Dialog.Close asChild>
              <button className="text-gray-500 hover:text-gray-300 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {step === 'upload' && (
              <StepUpload onFile={handleFile} loading={uploading} error={uploadError} />
            )}
            {step === 'columns' && columnSheets && (
              <StepColumns sheets={columnSheets} onSubmit={handleColumnsSubmit} loading={uploading} />
            )}
            {step === 'mapping' && preview && (
              <StepMapping
                importedAccounts={preview.accounts}
                existingAccounts={preview.existing_accounts}
                mapping={mapping}
                onChange={setMapping}
              />
            )}
            {step === 'preview' && preview && (
              <StepPreview
                transactions={transactions}
                mapping={mapping}
                duplicateCounts={preview.duplicate_counts}
                categories={categories}
                onChange={handleCategoryChange}
              />
            )}
          </div>

          {step !== 'upload' && (
            <div className="flex justify-between items-center px-6 py-4 border-t border-gray-800">
              <Button variant="secondary" size="sm" onClick={handleBack}>
                Retour
              </Button>
              {step === 'mapping' && (
                <Button disabled={!canProceedMapping} onClick={() => setStep('preview')}>
                  Suivant
                </Button>
              )}
              {step === 'preview' && (
                <Button onClick={handleConfirm} loading={confirming}>
                  Importer
                </Button>
              )}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ImportWizard/ImportWizard.tsx
git commit -m "feat(imports): columns step, 422 handling, dynamic stepper in ImportWizard"
```

---

### Task 9: Vérification finale

- [ ] **Step 1: Run tous les tests backend**

```
cd backend
python manage.py test apps.imports -v 2
```
Expected : tous PASS (27 tests environ)

- [ ] **Step 2: Build TypeScript frontend**

```
cd frontend
npm run build
```
Expected : aucune erreur de compilation TypeScript

- [ ] **Step 3: Vérifier le flux Crédit Mutuel (compat)**

Démarrer le serveur et importer un fichier Crédit Mutuel. Le wizard doit passer directement de "Fichier" à "Comptes" sans afficher l'étape "Colonnes". Stepper : `1. Fichier · 2. Comptes · 3. Confirmation`.

- [ ] **Step 4: Vérifier le flux format inconnu**

Importer un `.xlsx` avec des colonnes sans noms reconnus. Le wizard doit passer à l'étape "Colonnes" (`1. Fichier · 2. Colonnes · 3. Comptes · 4. Confirmation`). Assigner les colonnes → le wizard passe à l'étape "Comptes".
