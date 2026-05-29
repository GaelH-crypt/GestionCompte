# Import XLSX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre l'import de fichiers Excel Crédit Mutuel via un wizard modal 3 étapes (upload → mapping comptes → prévisualisation + confirmation).

**Architecture:** Nouvel app Django `imports` avec deux endpoints stateless (`/preview/` parse sans écrire, `/confirm/` crée les objets). Frontend : wizard modal React avec Radix Dialog, état local, 3 composants étapes.

**Tech Stack:** Python pandas + openpyxl (parsing), Django REST Framework (API), React 18 + TypeScript + Tailwind + Radix UI Dialog/Select (frontend).

---

## File Map

**Backend — créer :**
- `backend/apps/imports/__init__.py`
- `backend/apps/imports/apps.py`
- `backend/apps/imports/urls.py`
- `backend/apps/imports/views.py`
- `backend/apps/imports/services/__init__.py`
- `backend/apps/imports/services/parser.py`
- `backend/apps/imports/services/categorizer.py`
- `backend/apps/imports/services/deduplicator.py`
- `backend/apps/imports/tests.py`

**Backend — modifier :**
- `backend/requirements.txt` (ajouter openpyxl, pandas)
- `backend/config/settings/base.py` (ajouter `apps.imports` à LOCAL_APPS)
- `backend/config/urls.py` (inclure imports.urls)

**Frontend — créer :**
- `frontend/src/api/imports.ts`
- `frontend/src/components/ImportWizard/ImportWizard.tsx`
- `frontend/src/components/ImportWizard/StepUpload.tsx`
- `frontend/src/components/ImportWizard/StepMapping.tsx`
- `frontend/src/components/ImportWizard/StepPreview.tsx`

**Frontend — modifier :**
- `frontend/src/types/index.ts` (ajouter types import)
- `frontend/src/pages/TransactionsPage.tsx` (ajouter bouton + import wizard)

---

## Task 1 : Backend scaffold (dépendances + app)

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/config/settings/base.py`
- Modify: `backend/config/urls.py`
- Create: `backend/apps/imports/__init__.py`
- Create: `backend/apps/imports/apps.py`
- Create: `backend/apps/imports/urls.py`
- Create: `backend/apps/imports/services/__init__.py`

- [ ] **Step 1 : Ajouter les dépendances Python**

Dans `backend/requirements.txt`, ajouter après `python-dateutil==2.9.0` :
```
openpyxl==3.1.5
pandas==2.2.2
```

- [ ] **Step 2 : Enregistrer l'app dans INSTALLED_APPS**

Dans `backend/config/settings/base.py`, modifier LOCAL_APPS :
```python
LOCAL_APPS = [
    'apps.authentication',
    'apps.accounts',
    'apps.categories',
    'apps.transactions',
    'apps.recurring',
    'apps.credits',
    'apps.dashboard',
    'apps.projections',
    'apps.seed',
    'apps.imports',
]
```

- [ ] **Step 3 : Brancher les URLs**

Dans `backend/config/urls.py` :
```python
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('apps.authentication.urls')),
    path('api/accounts/', include('apps.accounts.urls')),
    path('api/categories/', include('apps.categories.urls')),
    path('api/transactions/', include('apps.transactions.urls')),
    path('api/recurring/', include('apps.recurring.urls')),
    path('api/credits/', include('apps.credits.urls')),
    path('api/dashboard/', include('apps.dashboard.urls')),
    path('api/projections/', include('apps.projections.urls')),
    path('api/import/', include('apps.imports.urls')),
]
```

- [ ] **Step 4 : Créer les fichiers de l'app**

`backend/apps/imports/__init__.py` — vide.

`backend/apps/imports/apps.py` :
```python
from django.apps import AppConfig

class ImportsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.imports'
```

`backend/apps/imports/services/__init__.py` — vide.

`backend/apps/imports/urls.py` :
```python
from django.urls import path
from .views import PreviewView, ConfirmView

urlpatterns = [
    path('preview/', PreviewView.as_view(), name='import-preview'),
    path('confirm/', ConfirmView.as_view(), name='import-confirm'),
]
```

- [ ] **Step 5 : Commit**
```bash
git add backend/requirements.txt backend/config/ backend/apps/imports/
git commit -m "feat(imports): scaffold django app + deps"
```

---

## Task 2 : Service parser

**Files:**
- Create: `backend/apps/imports/services/parser.py`
- Create: `backend/apps/imports/tests.py` (tests parser uniquement pour cette tâche)

Le parser lit un fichier `.xlsx` Crédit Mutuel et retourne une structure Python.
Structure attendue du fichier :
- Feuille `"Vos comptes"` : row 0 = NaN, row 1 = headers (Compte / R.I.B. / Solde / Dev), row 2+ = données
- Feuilles `"Cpt XXXXX"` : row 0-2 = meta, row 3 = headers (Date / Valeur / Libellé / Débit / Crédit / Solde / Dev), row 4+ = données

- [ ] **Step 1 : Écrire les tests du parser**

`backend/apps/imports/tests.py` :
```python
import io
import datetime
import openpyxl
from django.test import TestCase
from apps.imports.services.parser import parse_excel


def _make_excel():
    wb = openpyxl.Workbook()

    # Feuille "Vos comptes"
    ws = wb.active
    ws.title = 'Vos comptes'
    ws.append([None])
    ws.append(['Compte', 'R.I.B.', 'Solde', 'Dev'])
    ws.append(['C/C EUROCOMPTE CONFORT', '10278 02625 00022060507', 156.22, 'EUR'])
    ws.append(['LIVRET BLEU', '10278 02625 00023120602', 10.0, 'EUR'])

    # Feuille compte courant
    wc = wb.create_sheet('Cpt 02625 00022060507')
    wc.append(['R.I.B. : 10278 02625 00022060507'] + [None] * 6)
    wc.append([None, None, None, 'Solde initial :', 'Solde initial :', None, 'EUR'])
    wc.append(['Liste de vos comptes'] * 6 + [None])
    wc.append(['Date', 'Valeur', 'Libellé', 'Débit', 'Crédit', 'Solde', 'Dev'])
    wc.append([datetime.datetime(2026, 5, 1), datetime.datetime(2026, 5, 1), 'CARREFOUR MARKET', -42.5, None, None, 'EUR'])
    wc.append([datetime.datetime(2026, 5, 2), datetime.datetime(2026, 5, 2), 'SALAIRE MAI', None, 2500.0, None, 'EUR'])
    wc.append([None, None, None, 'Solde au 28/05/2026 :', 'Solde au 28/05/2026 :', 156.22, 'EUR'])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


class ParserTest(TestCase):
    def setUp(self):
        self.file = _make_excel()

    def test_accounts_extracted(self):
        result = parse_excel(self.file)
        self.assertEqual(len(result['accounts']), 2)
        acc = result['accounts'][0]
        self.assertEqual(acc['name'], 'C/C EUROCOMPTE CONFORT')
        self.assertEqual(acc['rib'], '10278 02625 00022060507')
        self.assertAlmostEqual(float(acc['balance']), 156.22)

    def test_transactions_extracted(self):
        result = parse_excel(self.file)
        txs = result['transactions']['10278 02625 00022060507']
        self.assertEqual(len(txs), 2)

    def test_debit_transaction(self):
        result = parse_excel(self.file)
        txs = result['transactions']['10278 02625 00022060507']
        debit = next(t for t in txs if t['transaction_type'] == 'expense')
        self.assertEqual(debit['description'], 'CARREFOUR MARKET')
        self.assertAlmostEqual(float(debit['amount']), 42.5)
        self.assertEqual(debit['date'], '2026-05-01')

    def test_credit_transaction(self):
        result = parse_excel(self.file)
        txs = result['transactions']['10278 02625 00022060507']
        credit = next(t for t in txs if t['transaction_type'] == 'income')
        self.assertAlmostEqual(float(credit['amount']), 2500.0)

    def test_footer_rows_skipped(self):
        result = parse_excel(self.file)
        txs = result['transactions']['10278 02625 00022060507']
        # La ligne "Solde au ..." ne doit pas apparaître
        self.assertFalse(any('Solde au' in t['description'] for t in txs))
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**
```bash
cd backend && python manage.py test apps.imports.tests.ParserTest -v 2
```
Attendu : ImportError ou AttributeError (module parser absent).

- [ ] **Step 3 : Implémenter le parser**

`backend/apps/imports/services/parser.py` :
```python
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
```

- [ ] **Step 4 : Lancer les tests**
```bash
cd backend && python manage.py test apps.imports.tests.ParserTest -v 2
```
Attendu : 5 tests PASS.

- [ ] **Step 5 : Commit**
```bash
git add backend/apps/imports/services/parser.py backend/apps/imports/tests.py
git commit -m "feat(imports): parser service for Crédit Mutuel xlsx"
```

---

## Task 3 : Service categorizer

**Files:**
- Create: `backend/apps/imports/services/categorizer.py`
- Modify: `backend/apps/imports/tests.py` (ajouter CategorizerTest)

- [ ] **Step 1 : Ajouter les tests du categorizer**

Ajouter à `backend/apps/imports/tests.py` :
```python
from apps.imports.services.categorizer import suggest_category


class CategorizerTest(TestCase):
    def test_supermarket(self):
        self.assertEqual(suggest_category('PAIEMENT CARREFOUR MARKET CARTE'), 'Alimentation')

    def test_rent(self):
        self.assertEqual(suggest_category('PRLV SEPA OPH DE CALAIS CREANCES LOCATIVES'), 'Logement')

    def test_energy(self):
        self.assertEqual(suggest_category('PRELEVEMENT EDF PARTICULIERS'), 'Factures')

    def test_transport(self):
        self.assertEqual(suggest_category('PAIEMENT SNCF BILLETS'), 'Transport')

    def test_salary(self):
        self.assertEqual(suggest_category('VIREMENT SALAIRE MARS'), 'Revenus')

    def test_no_match(self):
        self.assertIsNone(suggest_category('OPERATION DIVERSE'))
```

- [ ] **Step 2 : Vérifier que les tests échouent**
```bash
cd backend && python manage.py test apps.imports.tests.CategorizerTest -v 2
```
Attendu : ImportError.

- [ ] **Step 3 : Implémenter le categorizer**

`backend/apps/imports/services/categorizer.py` :
```python
import re

RULES: list[tuple[list[str], str]] = [
    (['CARREFOUR', 'LECLERC', 'LIDL', 'ALDI', 'INTERMARCHE', 'MONOPRIX', 'CASINO', 'SUPERMARCHE', 'EPICERIE', 'FRANPRIX'], 'Alimentation'),
    (['LOYER', 'OPH', 'BAIL', 'HABITAT', 'FONCIER', 'LOCATIF', 'LOCATIVES'], 'Logement'),
    (['EDF', 'ENGIE', 'VEOLIA', 'SUEZ', 'SOSH', 'ORANGE', 'SFR', 'FREE', 'BOUYGUES', 'TELECOM', 'ELECTRICITE', 'GAZ'], 'Factures'),
    (['SNCF', 'RATP', 'UBER', 'TAXI', 'TOTAL', 'BP', 'SHELL', 'ESSENCE', 'AUTOROUTE', 'PARKING'], 'Transport'),
    (['PHARMACIE', 'MEDECIN', 'DOCTEUR', 'CLINIQUE', 'HOPITAL', 'SECU', 'CPAM', 'MUTUELLE'], 'Santé'),
    (['RESTAURANT', 'BRASSERIE', 'CAFE ', 'MCDO', 'MCDONALD', 'BURGER', 'PIZZA', 'KEBAB'], 'Restauration'),
    (['SALAIRE', 'PAIE', 'REMUNERATION'], 'Revenus'),
    (['VIR SEPA', 'VIREMENT'], 'Virement'),
]


def suggest_category(description: str) -> str | None:
    upper = description.upper()
    for keywords, category in RULES:
        for kw in keywords:
            if kw in upper:
                return category
    return None
```

- [ ] **Step 4 : Lancer les tests**
```bash
cd backend && python manage.py test apps.imports.tests.CategorizerTest -v 2
```
Attendu : 6 tests PASS.

- [ ] **Step 5 : Commit**
```bash
git add backend/apps/imports/services/categorizer.py backend/apps/imports/tests.py
git commit -m "feat(imports): keyword categorizer service"
```

---

## Task 4 : Service deduplicator

**Files:**
- Create: `backend/apps/imports/services/deduplicator.py`
- Modify: `backend/apps/imports/tests.py` (ajouter DeduplicatorTest)

- [ ] **Step 1 : Ajouter les tests**

Ajouter à `backend/apps/imports/tests.py` :
```python
from django.contrib.auth.models import User
from apps.accounts.models import Account
from apps.transactions.models import Transaction as TxModel
from apps.imports.services.deduplicator import filter_duplicates


class DeduplicatorTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('dup_user', password='pass')
        self.account = Account.objects.create(
            user=self.user, name='Test', account_type='checking',
            initial_balance=0, color='#fff', icon='CreditCard'
        )
        TxModel.objects.create(
            user=self.user, account=self.account,
            transaction_type='expense', amount='42.50',
            description='CARREFOUR MARKET', date='2026-05-01'
        )

    def test_existing_transaction_detected(self):
        candidates = [
            {'date': '2026-05-01', 'description': 'CARREFOUR MARKET', 'amount': 42.50, 'transaction_type': 'expense'},
            {'date': '2026-05-02', 'description': 'SALAIRE MAI', 'amount': 2500.0, 'transaction_type': 'income'},
        ]
        new_txs, dup_count = filter_duplicates(candidates, self.account.id)
        self.assertEqual(dup_count, 1)
        self.assertEqual(len(new_txs), 1)
        self.assertEqual(new_txs[0]['description'], 'SALAIRE MAI')

    def test_no_duplicates(self):
        candidates = [
            {'date': '2026-06-01', 'description': 'LIDL', 'amount': 15.0, 'transaction_type': 'expense'},
        ]
        new_txs, dup_count = filter_duplicates(candidates, self.account.id)
        self.assertEqual(dup_count, 0)
        self.assertEqual(len(new_txs), 1)
```

- [ ] **Step 2 : Vérifier l'échec**
```bash
cd backend && python manage.py test apps.imports.tests.DeduplicatorTest -v 2
```

- [ ] **Step 3 : Implémenter le deduplicator**

`backend/apps/imports/services/deduplicator.py` :
```python
from decimal import Decimal
from apps.transactions.models import Transaction


def filter_duplicates(candidates: list[dict], account_id: int) -> tuple[list[dict], int]:
    """
    Filtre les doublons parmi `candidates` par rapport aux transactions existantes.
    Critère : même account + même date + même amount + même description.
    Retourne (nouvelles_transactions, nb_doublons).
    """
    existing = set(
        Transaction.objects.filter(account_id=account_id).values_list(
            'date', 'amount', 'description'
        )
    )

    new_txs = []
    dup_count = 0
    for tx in candidates:
        key = (tx['date'], Decimal(str(tx['amount'])).quantize(Decimal('0.01')), tx['description'])
        if key in existing:
            dup_count += 1
        else:
            new_txs.append(tx)
    return new_txs, dup_count
```

- [ ] **Step 4 : Lancer les tests**
```bash
cd backend && python manage.py test apps.imports.tests.DeduplicatorTest -v 2
```
Attendu : 2 tests PASS.

- [ ] **Step 5 : Commit**
```bash
git add backend/apps/imports/services/deduplicator.py backend/apps/imports/tests.py
git commit -m "feat(imports): deduplicator service"
```

---

## Task 5 : Endpoint /api/import/preview/

**Files:**
- Create: `backend/apps/imports/views.py`
- Modify: `backend/apps/imports/tests.py` (ajouter PreviewAPITest)

- [ ] **Step 1 : Ajouter les tests de l'endpoint preview**

Ajouter à `backend/apps/imports/tests.py` :
```python
import io
import openpyxl
import datetime
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status


def _make_minimal_excel() -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Vos comptes'
    ws.append([None])
    ws.append(['Compte', 'R.I.B.', 'Solde', 'Dev'])
    ws.append(['C/C TEST', '10278 00000 00000000001', 100.0, 'EUR'])

    wc = wb.create_sheet('Cpt 00000 00000000001')
    wc.append(['R.I.B. : 10278 00000 00000000001'] + [None] * 6)
    wc.append([None] * 7)
    wc.append(['Liste de vos comptes'] * 6 + [None])
    wc.append(['Date', 'Valeur', 'Libellé', 'Débit', 'Crédit', 'Solde', 'Dev'])
    wc.append([datetime.datetime(2026, 4, 1), datetime.datetime(2026, 4, 1), 'LIDL', -15.0, None, None, 'EUR'])

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


class PreviewAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('prev_user', password='pass')
        self.client.force_authenticate(user=self.user)

    def test_preview_returns_accounts_and_transactions(self):
        excel_bytes = _make_minimal_excel()
        resp = self.client.post(
            '/api/import/preview/',
            {'file': io.BytesIO(excel_bytes)},
            format='multipart'
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertIn('accounts', data)
        self.assertIn('transactions', data)
        self.assertEqual(len(data['accounts']), 1)
        self.assertEqual(data['accounts'][0]['name'], 'C/C TEST')

    def test_preview_suggests_category(self):
        excel_bytes = _make_minimal_excel()
        resp = self.client.post(
            '/api/import/preview/',
            {'file': io.BytesIO(excel_bytes)},
            format='multipart'
        )
        txs = resp.json()['transactions']['10278 00000 00000000001']
        self.assertEqual(txs[0]['suggested_category'], 'Alimentation')

    def test_preview_requires_auth(self):
        client = APIClient()
        resp = client.post('/api/import/preview/', {}, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_preview_rejects_non_xlsx(self):
        resp = self.client.post(
            '/api/import/preview/',
            {'file': io.BytesIO(b'not excel')},
            format='multipart'
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
```

- [ ] **Step 2 : Vérifier l'échec**
```bash
cd backend && python manage.py test apps.imports.tests.PreviewAPITest -v 2
```

- [ ] **Step 3 : Implémenter la view Preview**

`backend/apps/imports/views.py` :
```python
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from apps.imports.services.parser import parse_excel
from apps.imports.services.categorizer import suggest_category
from apps.imports.services.deduplicator import filter_duplicates
from apps.accounts.models import Account


class PreviewView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'Aucun fichier fourni.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            parsed = parse_excel(file)
        except Exception:
            return Response({'error': 'Format de fichier non reconnu.'}, status=status.HTTP_400_BAD_REQUEST)

        user_accounts = {a.id: a for a in Account.objects.filter(user=request.user)}
        existing_accounts = [
            {'id': a.id, 'name': a.name, 'account_type': a.account_type}
            for a in user_accounts.values()
        ]

        transactions_with_meta = {}
        for rib, txs in parsed['transactions'].items():
            matching_account = next(
                (a for a in user_accounts.values() if rib in a.name or a.name in rib),
                None
            )
            account_id = matching_account.id if matching_account else None

            enriched = []
            for tx in txs:
                enriched.append({
                    **tx,
                    'suggested_category': suggest_category(tx['description']),
                    'category_id': None,
                })

            dup_count = 0
            if account_id:
                _, dup_count = filter_duplicates(txs, account_id)

            transactions_with_meta[rib] = {
                'transactions': enriched,
                'duplicate_count': dup_count,
            }

        return Response({
            'accounts': parsed['accounts'],
            'existing_accounts': existing_accounts,
            'transactions': {
                rib: data['transactions']
                for rib, data in transactions_with_meta.items()
            },
            'duplicate_counts': {
                rib: data['duplicate_count']
                for rib, data in transactions_with_meta.items()
            },
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

        from apps.transactions.models import Transaction
        from apps.categories.models import Category

        for rib, txs in transactions_payload.items():
            account_config = mapping.get(rib, {})
            account_id = account_config.get('id')
            if not account_id:
                continue

            try:
                account = Account.objects.get(id=account_id, user=request.user)
            except Account.DoesNotExist:
                return Response({'error': f'Compte {account_id} introuvable.'}, status=status.HTTP_400_BAD_REQUEST)

            existing_txs = set(
                Transaction.objects.filter(account=account).values_list('date', 'amount', 'description')
            )

            from decimal import Decimal
            for tx in txs:
                amount = Decimal(str(tx['amount'])).quantize(Decimal('0.01'))
                key = (tx['date'], amount, tx['description'])
                if key in existing_txs:
                    continue

                category = None
                if tx.get('category_id'):
                    try:
                        category = Category.objects.get(id=tx['category_id'], user=request.user)
                    except Category.DoesNotExist:
                        pass

                Transaction.objects.create(
                    user=request.user,
                    account=account,
                    transaction_type=tx['transaction_type'],
                    amount=amount,
                    description=tx['description'],
                    date=tx['date'],
                    category=category,
                    note='',
                    tags=[],
                )
                created_transactions += 1

        return Response({
            'created_accounts': created_accounts,
            'created_transactions': created_transactions,
        })
```

- [ ] **Step 4 : Lancer tous les tests imports**
```bash
cd backend && python manage.py test apps.imports -v 2
```
Attendu : tous PASS.

- [ ] **Step 5 : Commit**
```bash
git add backend/apps/imports/views.py backend/apps/imports/tests.py
git commit -m "feat(imports): preview + confirm API endpoints"
```

---

## Task 6 : Types TypeScript pour l'import

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1 : Ajouter les types**

Dans `frontend/src/types/index.ts`, ajouter à la fin du fichier :
```typescript
// ─── Import XLSX ───────────────────────────────────────────────────────────

export interface ImportedAccount {
  name: string
  rib: string
  balance: number
}

export interface ImportedTransaction {
  date: string
  description: string
  amount: number
  transaction_type: TransactionType
  suggested_category: string | null
  category_id: number | null
}

export interface AccountMapping {
  rib: string
  create: boolean
  id?: number
  name: string
  account_type: AccountType
}

export interface PreviewResponse {
  accounts: ImportedAccount[]
  existing_accounts: { id: number; name: string; account_type: AccountType }[]
  transactions: Record<string, ImportedTransaction[]>
  duplicate_counts: Record<string, number>
}

export interface ConfirmPayload {
  mapping: Record<string, AccountMapping>
  transactions: Record<string, ImportedTransaction[]>
}

export interface ConfirmResponse {
  created_accounts: number
  created_transactions: number
}
```

- [ ] **Step 2 : Commit**
```bash
git add frontend/src/types/index.ts
git commit -m "feat(imports): add TypeScript types for import wizard"
```

---

## Task 7 : Module API frontend

**Files:**
- Create: `frontend/src/api/imports.ts`

- [ ] **Step 1 : Créer le module API**

`frontend/src/api/imports.ts` :
```typescript
import client from './client'
import type { PreviewResponse, ConfirmPayload, ConfirmResponse } from '@/types'

export const importsApi = {
  preview: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return client.post<PreviewResponse>('/import/preview/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  confirm: (payload: ConfirmPayload) =>
    client.post<ConfirmResponse>('/import/confirm/', payload),
}
```

- [ ] **Step 2 : Commit**
```bash
git add frontend/src/api/imports.ts
git commit -m "feat(imports): frontend API module"
```

---

## Task 8 : StepUpload component

**Files:**
- Create: `frontend/src/components/ImportWizard/StepUpload.tsx`

- [ ] **Step 1 : Créer le composant**

`frontend/src/components/ImportWizard/StepUpload.tsx` :
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
        <p className="text-sm text-gray-400">Glisser un fichier <span className="font-medium text-gray-200">.xlsx</span> ou cliquer pour sélectionner</p>
        <p className="text-xs text-gray-600">Export Crédit Mutuel uniquement</p>
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

- [ ] **Step 2 : Commit**
```bash
git add frontend/src/components/ImportWizard/StepUpload.tsx
git commit -m "feat(imports): StepUpload component"
```

---

## Task 9 : StepMapping component

**Files:**
- Create: `frontend/src/components/ImportWizard/StepMapping.tsx`

- [ ] **Step 1 : Créer le composant**

`frontend/src/components/ImportWizard/StepMapping.tsx` :
```tsx
import type { ImportedAccount, AccountMapping, AccountType } from '@/types'

interface ExistingAccount {
  id: number
  name: string
  account_type: AccountType
}

interface Props {
  importedAccounts: ImportedAccount[]
  existingAccounts: ExistingAccount[]
  mapping: Record<string, AccountMapping>
  onChange: (mapping: Record<string, AccountMapping>) => void
}

const TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Courant',
  savings: 'Épargne',
  cash: 'Espèces',
  other: 'Autre',
}

function guessType(name: string): AccountType {
  const u = name.toUpperCase()
  if (u.includes('LIVRET') || u.includes('LDDS') || u.includes('EPARGNE')) return 'savings'
  if (u.includes('PRET') || u.includes('CREDIT') || u.includes('PASSEPORT')) return 'other'
  return 'checking'
}

const sel = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full'

export function StepMapping({ importedAccounts, existingAccounts, mapping, onChange }: Props) {
  const update = (rib: string, patch: Partial<AccountMapping>) => {
    onChange({ ...mapping, [rib]: { ...mapping[rib], ...patch } })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">Pour chaque compte détecté dans le fichier, choisissez un compte existant ou créez-en un nouveau.</p>
      {importedAccounts.map((acc) => {
        const m = mapping[acc.rib]
        return (
          <div key={acc.rib} className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-200">{acc.name}</p>
              <p className="text-xs text-gray-500">{acc.rib} · solde : {acc.balance.toFixed(2)} €</p>
            </div>
            <select
              className={sel}
              value={m?.create ? '__new__' : String(m?.id ?? '')}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  update(acc.rib, { create: true, name: acc.name, account_type: guessType(acc.name), id: undefined })
                } else {
                  const found = existingAccounts.find((a) => a.id === Number(e.target.value))
                  update(acc.rib, { create: false, id: Number(e.target.value), name: found?.name ?? '', account_type: found?.account_type ?? 'checking' })
                }
              }}
            >
              <option value="">— Sélectionner —</option>
              {existingAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({TYPE_LABELS[a.account_type]})</option>
              ))}
              <option value="__new__">+ Créer un nouveau compte</option>
            </select>
            {m?.create && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Nom du compte</label>
                  <input
                    className={sel}
                    value={m.name}
                    onChange={(e) => update(acc.rib, { name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Type</label>
                  <select
                    className={sel}
                    value={m.account_type}
                    onChange={(e) => update(acc.rib, { account_type: e.target.value as AccountType })}
                  >
                    {(Object.entries(TYPE_LABELS) as [AccountType, string][]).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2 : Commit**
```bash
git add frontend/src/components/ImportWizard/StepMapping.tsx
git commit -m "feat(imports): StepMapping component"
```

---

## Task 10 : StepPreview component

**Files:**
- Create: `frontend/src/components/ImportWizard/StepPreview.tsx`

- [ ] **Step 1 : Créer le composant**

`frontend/src/components/ImportWizard/StepPreview.tsx` :
```tsx
import type { ImportedTransaction, AccountMapping, Category } from '@/types'

interface Props {
  transactions: Record<string, ImportedTransaction[]>
  mapping: Record<string, AccountMapping>
  duplicateCounts: Record<string, number>
  categories: Category[]
  onChange: (rib: string, index: number, categoryId: number | null) => void
}

const formatEur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

const sel = 'bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500'

export function StepPreview({ transactions, mapping, duplicateCounts, categories, onChange }: Props) {
  const totalNew = Object.values(transactions).reduce((s, txs) => s + txs.length, 0)
  const totalDup = Object.values(duplicateCounts).reduce((s, n) => s + n, 0)

  return (
    <div className="space-y-4">
      <div className="bg-brand-500/10 border border-brand-500/30 rounded-lg px-4 py-3 text-sm">
        <span className="text-brand-300 font-medium">{totalNew} nouvelles transactions</span>
        {totalDup > 0 && <span className="text-gray-400 ml-2">· {totalDup} doublons ignorés</span>}
      </div>

      {Object.entries(transactions).map(([rib, txs]) => {
        const accName = mapping[rib]?.name ?? rib
        if (txs.length === 0) return null
        return (
          <div key={rib} className="space-y-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{accName}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Date', 'Libellé', 'Montant', 'Catégorie'].map((h) => (
                      <th key={h} className="text-left text-gray-500 px-2 py-2 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {txs.map((tx, i) => (
                    <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="px-2 py-2 text-gray-400 whitespace-nowrap">{tx.date}</td>
                      <td className="px-2 py-2 text-gray-200 max-w-xs truncate">{tx.description}</td>
                      <td className={`px-2 py-2 font-medium whitespace-nowrap ${tx.transaction_type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                        {tx.transaction_type === 'expense' ? '-' : '+'}{formatEur(tx.amount)}
                      </td>
                      <td className="px-2 py-2">
                        <select
                          className={sel}
                          value={tx.category_id ?? ''}
                          onChange={(e) => onChange(rib, i, e.target.value ? Number(e.target.value) : null)}
                        >
                          <option value="">Sans catégorie</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2 : Commit**
```bash
git add frontend/src/components/ImportWizard/StepPreview.tsx
git commit -m "feat(imports): StepPreview component"
```

---

## Task 11 : ImportWizard shell + intégration TransactionsPage

**Files:**
- Create: `frontend/src/components/ImportWizard/ImportWizard.tsx`
- Modify: `frontend/src/pages/TransactionsPage.tsx`

- [ ] **Step 1 : Créer le shell wizard**

`frontend/src/components/ImportWizard/ImportWizard.tsx` :
```tsx
import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { importsApi } from '@/api/imports'
import { StepUpload } from './StepUpload'
import { StepMapping } from './StepMapping'
import { StepPreview } from './StepPreview'
import { Button } from '@/components/ui/Button'
import type {
  PreviewResponse, AccountMapping, ImportedTransaction, Category
} from '@/types'

type Step = 'upload' | 'mapping' | 'preview'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  categories: Category[]
}

const STEP_LABELS: Record<Step, string> = {
  upload: '1. Fichier',
  mapping: '2. Comptes',
  preview: '3. Confirmation',
}

export function ImportWizard({ open, onOpenChange, categories }: Props) {
  const qc = useQueryClient()
  const [step, setStep] = useState<Step>('upload')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [mapping, setMapping] = useState<Record<string, AccountMapping>>({})
  const [transactions, setTransactions] = useState<Record<string, ImportedTransaction[]>>({})
  const [confirming, setConfirming] = useState(false)

  const reset = () => {
    setStep('upload')
    setUploading(false)
    setUploadError(null)
    setPreview(null)
    setMapping({})
    setTransactions({})
  }

  const handleFile = async (file: File) => {
    setUploading(true)
    setUploadError(null)
    try {
      const { data } = await importsApi.preview(file)
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
    } catch {
      setUploadError('Erreur lors de la lecture du fichier. Vérifiez qu\'il s\'agit d\'un export Crédit Mutuel.')
    } finally {
      setUploading(false)
    }
  }

  const canProceedMapping = Object.values(mapping).every(
    (m) => m.create ? m.name.trim().length > 0 : Boolean(m.id)
  )

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

  const steps: Step[] = ['upload', 'mapping', 'preview']

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-2xl max-h-[90vh] flex flex-col bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
            <div>
              <Dialog.Title className="text-base font-semibold text-gray-100">Importer un fichier</Dialog.Title>
              <div className="flex gap-3 mt-1">
                {steps.map((s) => (
                  <span key={s} className={`text-xs ${s === step ? 'text-brand-400 font-medium' : 'text-gray-600'}`}>
                    {STEP_LABELS[s]}
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

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {step === 'upload' && (
              <StepUpload onFile={handleFile} loading={uploading} error={uploadError} />
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

          {/* Footer */}
          {step !== 'upload' && (
            <div className="flex justify-between items-center px-6 py-4 border-t border-gray-800">
              <Button variant="secondary" size="sm" onClick={() => setStep(step === 'preview' ? 'mapping' : 'upload')}>
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

- [ ] **Step 2 : Ajouter le bouton dans TransactionsPage**

Dans `frontend/src/pages/TransactionsPage.tsx`, modifier les imports et le composant :

Ajouter aux imports en haut :
```tsx
import { Upload } from 'lucide-react'
import { ImportWizard } from '@/components/ImportWizard/ImportWizard'
```

Dans le composant, ajouter le state :
```tsx
const [showImport, setShowImport] = useState(false)
```

Dans la requête categories (après `useQuery` pour les transactions), ajouter :
```tsx
const { data: categoriesData } = useQuery({
  queryKey: ['categories'],
  queryFn: () => categoriesApi.list().then((r) => r.data),
})
```

Remplacer la ligne avec `<Button onClick={() => { setEditing(null); setShowForm(true) }}>` par :
```tsx
<div className="flex gap-2">
  <Button variant="secondary" onClick={() => setShowImport(true)}>
    <Upload className="h-4 w-4" /> Importer
  </Button>
  <Button onClick={() => { setEditing(null); setShowForm(true) }}>
    <Plus className="h-4 w-4" /> Nouvelle transaction
  </Button>
</div>
```

Ajouter avant le `return` final (ou juste avant le JSX `</div>` de fermeture) :
```tsx
<ImportWizard
  open={showImport}
  onOpenChange={setShowImport}
  categories={categoriesData ?? []}
/>
```

- [ ] **Step 3 : Commit**
```bash
git add frontend/src/components/ImportWizard/ frontend/src/pages/TransactionsPage.tsx
git commit -m "feat(imports): wizard modal + import button on TransactionsPage"
```

---

## Task 12 : Vérification finale

- [ ] **Step 1 : Lancer tous les tests backend**
```bash
cd backend && python manage.py test apps.imports -v 2
```
Attendu : tous PASS.

- [ ] **Step 2 : Vérifier le build TypeScript frontend**
```bash
cd frontend && npm run build
```
Attendu : 0 erreurs TypeScript.

- [ ] **Step 3 : Commit final si modifications nécessaires**
```bash
git add -A && git commit -m "fix(imports): address build issues"
```
