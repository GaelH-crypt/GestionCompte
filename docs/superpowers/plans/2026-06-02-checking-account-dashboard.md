# Solde Compte Courant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une tuile "Solde compte courant" sur le dashboard, une page Paramètres pour désigner le compte principal, et deux lignes de balance (globale + compte courant) sur les graphiques d'évolution et de projection.

**Architecture:** Nouveau modèle Django `UserPreference` stockant le compte courant désigné. Le moteur de projection tourne une deuxième passe filtrée par compte pour retourner `checking_balance` dans chaque `ProjectionPoint`. Le frontend affiche la 2e courbe sur `EvolutionChart` et `ProjectionChart` quand la donnée est présente.

**Tech Stack:** Django (DRF, APIView), React + TypeScript, Recharts (AreaChart), React Query, Tailwind CSS, Lucide React.

---

## File Map

### Backend — créer
- `backend/apps/preferences/__init__.py` — vide
- `backend/apps/preferences/apps.py` — AppConfig
- `backend/apps/preferences/models.py` — UserPreference (OneToOne User, FK Account nullable)
- `backend/apps/preferences/views.py` — GET/PATCH /api/preferences/
- `backend/apps/preferences/urls.py` — urlpatterns
- `backend/apps/preferences/migrations/0001_initial.py` — générée par makemigrations

### Backend — modifier
- `backend/config/settings/base.py` — ajouter `'apps.preferences'` dans LOCAL_APPS
- `backend/config/urls.py` — ajouter `path('api/preferences/', include('apps.preferences.urls'))`
- `backend/apps/dashboard/views.py` — ajouter `checking_account_id` et `checking_account_balance` dans la réponse
- `backend/apps/projections/engine.py` — ajouter `build_engine_for_account(user, account_id, overrides)`
- `backend/apps/projections/views.py` — ajouter `checking_balance` dans chaque point si compte configuré
- `backend/apps/projections/tests.py` — tests pour `build_engine_for_account`
- `backend/apps/dashboard/tests.py` — tests pour les nouveaux champs dashboard

### Frontend — créer
- `frontend/src/api/preferences.ts` — preferencesApi (get, patch)
- `frontend/src/pages/SettingsPage.tsx` — sélecteur compte courant

### Frontend — modifier
- `frontend/src/types/index.ts` — UserPreference, DashboardSummary, ProjectionPoint
- `frontend/src/App.tsx` — route `/settings`
- `frontend/src/components/layout/AppLayout.tsx` — PAGE_TITLES entry
- `frontend/src/components/layout/Sidebar.tsx` — entrée nav Paramètres
- `frontend/src/components/layout/BottomNav.tsx` — entrée dans MORE_ITEMS
- `frontend/src/pages/DashboardPage.tsx` — 7e tuile + passe les données à EvolutionChart
- `frontend/src/components/dashboard/EvolutionChart.tsx` — 2e Area checking_balance
- `frontend/src/pages/ProjectionsPage.tsx` — KPI cards CC + showChecking prop
- `frontend/src/components/projections/ProjectionChart.tsx` — 3e Area checking_balance

---

## Task 1 : App Django `preferences` — modèle et enregistrement

**Files:**
- Create: `backend/apps/preferences/__init__.py`
- Create: `backend/apps/preferences/apps.py`
- Create: `backend/apps/preferences/models.py`
- Modify: `backend/config/settings/base.py`

- [ ] **Créer `backend/apps/preferences/__init__.py`** (fichier vide)

- [ ] **Créer `backend/apps/preferences/apps.py`**

```python
from django.apps import AppConfig


class PreferencesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.preferences'
```

- [ ] **Créer `backend/apps/preferences/models.py`**

```python
from django.contrib.auth.models import User
from django.db import models


class UserPreference(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='preference')
    primary_account = models.ForeignKey(
        'accounts.Account',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='+',
    )

    def __str__(self):
        return f'Prefs({self.user})'
```

- [ ] **Modifier `backend/config/settings/base.py`** — ajouter `'apps.preferences'` dans `LOCAL_APPS` :

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
    'apps.bank_sync',
    'apps.preferences',   # ← ajouter
]
```

- [ ] **Générer la migration**

```bash
cd /DATA/AppData/gestioncompte/backend
python manage.py makemigrations preferences
```

Résultat attendu : `Migrations for 'preferences': apps/preferences/migrations/0001_initial.py`

- [ ] **Appliquer la migration**

```bash
python manage.py migrate
```

Résultat attendu : `Applying preferences.0001_initial... OK`

- [ ] **Commit**

```bash
git add backend/apps/preferences/ backend/config/settings/base.py
git commit -m "feat(preferences): add UserPreference model with primary_account FK"
```

---

## Task 2 : API endpoint GET/PATCH /api/preferences/ + tests

**Files:**
- Create: `backend/apps/preferences/views.py`
- Create: `backend/apps/preferences/urls.py`
- Modify: `backend/config/urls.py`

- [ ] **Écrire les tests en premier** — créer `backend/apps/preferences/tests.py`

```python
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient
from apps.accounts.models import Account
from apps.preferences.models import UserPreference


class PreferencesAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('prefuser', password='p')
        self.client.force_authenticate(user=self.user)
        self.account = Account.objects.create(
            user=self.user, name='CC Test', account_type='checking', initial_balance=1000,
        )

    def test_get_creates_preference_if_missing(self):
        self.assertFalse(UserPreference.objects.filter(user=self.user).exists())
        resp = self.client.get('/api/preferences/')
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.data['primary_account'])
        self.assertTrue(UserPreference.objects.filter(user=self.user).exists())

    def test_get_returns_configured_account(self):
        UserPreference.objects.create(user=self.user, primary_account=self.account)
        resp = self.client.get('/api/preferences/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['primary_account'], self.account.id)
        self.assertEqual(resp.data['primary_account_name'], 'CC Test')

    def test_patch_sets_primary_account(self):
        resp = self.client.patch('/api/preferences/', {'primary_account': self.account.id}, format='json')
        self.assertEqual(resp.status_code, 200)
        pref = UserPreference.objects.get(user=self.user)
        self.assertEqual(pref.primary_account_id, self.account.id)

    def test_patch_rejects_other_users_account(self):
        other = User.objects.create_user('other', password='p')
        other_account = Account.objects.create(
            user=other, name='Autre CC', account_type='checking', initial_balance=0,
        )
        resp = self.client.patch('/api/preferences/', {'primary_account': other_account.id}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_patch_sets_null(self):
        UserPreference.objects.create(user=self.user, primary_account=self.account)
        resp = self.client.patch('/api/preferences/', {'primary_account': None}, format='json')
        self.assertEqual(resp.status_code, 200)
        pref = UserPreference.objects.get(user=self.user)
        self.assertIsNone(pref.primary_account)

    def test_unauthenticated_returns_401(self):
        unauth = APIClient()
        resp = unauth.get('/api/preferences/')
        self.assertEqual(resp.status_code, 401)
```

- [ ] **Lancer les tests — vérifier qu'ils échouent**

```bash
cd /DATA/AppData/gestioncompte/backend
python manage.py test apps.preferences.tests -v 2
```

Résultat attendu : erreurs (urls non définies)

- [ ] **Créer `backend/apps/preferences/views.py`**

```python
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from apps.accounts.models import Account
from .models import UserPreference


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def preferences_view(request):
    pref, _ = UserPreference.objects.get_or_create(user=request.user)

    if request.method == 'GET':
        return Response({
            'primary_account': pref.primary_account_id,
            'primary_account_name': pref.primary_account.name if pref.primary_account else None,
        })

    # PATCH
    account_id = request.data.get('primary_account')
    if account_id is None:
        pref.primary_account = None
        pref.save()
        return Response({'primary_account': None, 'primary_account_name': None})

    try:
        account = Account.objects.get(pk=account_id, user=request.user, is_active=True)
    except Account.DoesNotExist:
        return Response({'error': 'Compte introuvable ou accès refusé.'}, status=status.HTTP_400_BAD_REQUEST)

    pref.primary_account = account
    pref.save()
    return Response({
        'primary_account': account.id,
        'primary_account_name': account.name,
    })
```

- [ ] **Créer `backend/apps/preferences/urls.py`**

```python
from django.urls import path
from .views import preferences_view

urlpatterns = [
    path('', preferences_view, name='preferences'),
]
```

- [ ] **Modifier `backend/config/urls.py`** — ajouter la route :

```python
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
    path('api/bank-sync/', include('apps.bank_sync.urls')),
    path('api/preferences/', include('apps.preferences.urls')),  # ← ajouter
]
```

- [ ] **Relancer les tests — vérifier qu'ils passent**

```bash
python manage.py test apps.preferences.tests -v 2
```

Résultat attendu : 6 tests OK

- [ ] **Commit**

```bash
git add backend/apps/preferences/ backend/config/urls.py
git commit -m "feat(preferences): add GET/PATCH /api/preferences/ endpoint"
```

---

## Task 3 : Enrichissement dashboard summary

**Files:**
- Modify: `backend/apps/dashboard/views.py`
- Modify: `backend/apps/dashboard/tests.py`

- [ ] **Écrire les tests en premier** — ajouter à `backend/apps/dashboard/tests.py` :

```python
class DashboardCheckingAccountTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('checkinguser', password='p')
        self.client.force_authenticate(user=self.user)
        self.account = Account.objects.create(
            user=self.user, name='CC Principal', account_type='checking', initial_balance=2500,
        )

    def test_no_preference_returns_null_checking_fields(self):
        resp = self.client.get('/api/dashboard/summary/')
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.data['checking_account_id'])
        self.assertIsNone(resp.data['checking_account_balance'])

    def test_preference_returns_checking_balance(self):
        from apps.preferences.models import UserPreference
        UserPreference.objects.create(user=self.user, primary_account=self.account)
        resp = self.client.get('/api/dashboard/summary/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['checking_account_id'], self.account.id)
        self.assertAlmostEqual(resp.data['checking_account_balance'], 2500.0, places=1)
```

- [ ] **Lancer les tests — vérifier qu'ils échouent**

```bash
python manage.py test apps.dashboard.tests.DashboardCheckingAccountTest -v 2
```

Résultat attendu : KeyError ou AssertionError sur les champs manquants

- [ ] **Modifier `backend/apps/dashboard/views.py`** — ajouter l'import et enrichir la réponse :

En haut du fichier, ajouter l'import :
```python
from apps.preferences.models import UserPreference
```

Dans la vue `dashboard_summary`, juste avant le `return Response(...)`, ajouter :
```python
    pref = UserPreference.objects.filter(user=user).select_related('primary_account').first()
    checking_account_id = None
    checking_account_balance = None
    if pref and pref.primary_account and pref.primary_account.is_active:
        checking_account_id = pref.primary_account.id
        checking_account_balance = float(get_account_balance(pref.primary_account))
```

Et dans le `return Response({...})`, ajouter les deux champs :
```python
        'checking_account_id': checking_account_id,
        'checking_account_balance': checking_account_balance,
```

- [ ] **Lancer les tests — vérifier qu'ils passent**

```bash
python manage.py test apps.dashboard.tests -v 2
```

Résultat attendu : tous les tests dashboard OK

- [ ] **Commit**

```bash
git add backend/apps/dashboard/views.py backend/apps/dashboard/tests.py
git commit -m "feat(dashboard): add checking_account_id and checking_account_balance to summary"
```

---

## Task 4 : Projection par compte — build_engine_for_account

**Files:**
- Modify: `backend/apps/projections/engine.py`
- Modify: `backend/apps/projections/views.py`
- Modify: `backend/apps/projections/tests.py`

- [ ] **Écrire les tests en premier** — ajouter à `backend/apps/projections/tests.py` :

```python
class BuildEngineForAccountTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('enguser', password='p')
        self.account = Account.objects.create(
            user=self.user, name='CC', account_type='checking', initial_balance=3000,
        )
        self.other = Account.objects.create(
            user=self.user, name='Épargne', account_type='savings', initial_balance=10000,
        )

    def test_engine_starts_with_single_account_balance(self):
        from apps.projections.engine import build_engine_for_account
        engine = build_engine_for_account(self.user, self.account.id)
        self.assertAlmostEqual(float(engine.current_balance), 3000.0, places=1)

    def test_engine_only_counts_account_recurring(self):
        from apps.recurring.models import RecurringTransaction
        import datetime
        RecurringTransaction.objects.create(
            user=self.user, name='Salaire', amount=2000, transaction_type='income',
            frequency='monthly', next_occurrence=datetime.date.today(), account=self.account,
        )
        RecurringTransaction.objects.create(
            user=self.user, name='Virement épargne', amount=500, transaction_type='income',
            frequency='monthly', next_occurrence=datetime.date.today(), account=self.other,
        )
        from apps.projections.engine import build_engine_for_account
        engine = build_engine_for_account(self.user, self.account.id)
        self.assertAlmostEqual(float(engine.monthly_income), 2000.0, places=1)

    def test_projection_view_includes_checking_balance_when_configured(self):
        from apps.preferences.models import UserPreference
        UserPreference.objects.create(user=self.user, primary_account=self.account)
        client = APIClient()
        client.force_authenticate(user=self.user)
        resp = client.get('/api/projections/?months=3')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('checking_balance', resp.data[0])
        self.assertIsNotNone(resp.data[0]['checking_balance'])

    def test_projection_view_no_checking_balance_when_not_configured(self):
        client = APIClient()
        client.force_authenticate(user=self.user)
        resp = client.get('/api/projections/?months=3')
        self.assertEqual(resp.status_code, 200)
        # checking_balance absent ou null
        self.assertIsNone(resp.data[0].get('checking_balance'))
```

- [ ] **Lancer les tests — vérifier qu'ils échouent**

```bash
python manage.py test apps.projections.tests.BuildEngineForAccountTest -v 2
```

Résultat attendu : ImportError ou AttributeError (fonction non définie)

- [ ] **Ajouter `build_engine_for_account` dans `backend/apps/projections/engine.py`**

Ajouter après `build_engine_from_user` :

```python
def build_engine_for_account(user, account_id: int, overrides: dict = None) -> 'ProjectionEngine':
    """Build ProjectionEngine scoped to a single account (for checking account projection)."""
    from decimal import Decimal
    from datetime import date, timedelta
    from dateutil.relativedelta import relativedelta
    from django.db.models import Sum
    from apps.accounts.models import Account
    from apps.accounts.services import get_account_balance
    from apps.credits.models import Credit, CreditDraw
    from apps.recurring.models import RecurringTransaction

    try:
        account = Account.objects.get(pk=account_id, user=user, is_active=True)
    except Account.DoesNotExist:
        return ProjectionEngine(current_balance=Decimal('0'), monthly_income=Decimal('0'),
                                monthly_expenses=Decimal('0'), monthly_credits=Decimal('0'))

    current_balance = get_account_balance(account)

    freq_multipliers = {
        'monthly': Decimal('1'),
        'weekly': Decimal('52') / Decimal('12'),
    }

    def monthly_sum_for_account(transaction_type: str) -> Decimal:
        total = Decimal('0')
        for freq, multiplier in freq_multipliers.items():
            agg = RecurringTransaction.objects.filter(
                user=user, is_active=True, transaction_type=transaction_type,
                frequency=freq, account_id=account_id,
            ).aggregate(t=Sum('amount'))['t']
            if agg:
                total += agg * multiplier
        return total

    monthly_income = monthly_sum_for_account('income')
    monthly_expenses = monthly_sum_for_account('expense')

    # Yearly recurring for this account only
    today = date.today()
    end_date = today + relativedelta(months=_MAX_HORIZON_MONTHS)
    yearly_events = []
    for rt in RecurringTransaction.objects.filter(
        user=user, is_active=True, frequency='yearly', account_id=account_id
    ):
        occ = rt.next_occurrence
        while occ <= end_date:
            yearly_events.append({
                'year': occ.year, 'month': occ.month,
                'amount': rt.amount, 'type': rt.transaction_type,
            })
            occ = occ + relativedelta(years=1)

    # Credits: include uncovered credits (assumed paid from checking account)
    covered_credit_ids = list(
        RecurringTransaction.objects.filter(
            user=user, is_active=True, credit__isnull=False,
            transaction_type='expense', frequency__in=('monthly', 'weekly'),
            account_id=account_id,
        ).values_list('credit_id', flat=True).distinct()
    )
    uncovered = Credit.objects.filter(user=user, is_active=True).exclude(id__in=covered_credit_ids)
    credit_agg = uncovered.exclude(credit_type='revolving').aggregate(
        p=Sum('monthly_payment'), ins=Sum('insurance_monthly')
    )
    monthly_credits = (credit_agg['p'] or Decimal('0')) + (credit_agg['ins'] or Decimal('0'))
    revolving_draws = CreditDraw.objects.filter(
        credit__in=uncovered.filter(credit_type='revolving'), is_active=True,
    ).aggregate(t=Sum('monthly_payment'))['t']
    monthly_credits += (revolving_draws or Decimal('0'))

    # Daily events: recurring filtered by account_id + credit charges (uncovered)
    daily_end = today + timedelta(days=62)
    daily_events = []

    from apps.transactions.models import Transaction as _Tx
    first_of_month = today.replace(day=1)
    _month_rows = list(
        _Tx.objects.filter(user=user, date__gte=first_of_month, date__lte=today, account_id=account_id)
        .values('amount', 'transaction_type', 'account_id', 'recurring_transaction_id')
    )
    _linked_this_month = {r['recurring_transaction_id'] for r in _month_rows if r['recurring_transaction_id']}
    _paid_this_month = {(r['amount'], r['transaction_type'], r['account_id']) for r in _month_rows}

    _freq_step = {
        'weekly': relativedelta(weeks=1),
        'monthly': relativedelta(months=1),
        'yearly': relativedelta(years=1),
    }
    for rt in RecurringTransaction.objects.filter(user=user, is_active=True, account_id=account_id):
        step = _freq_step.get(rt.frequency)
        if step is None:
            continue
        kind = 'income' if rt.transaction_type == 'income' else 'expenses'
        occ = rt.next_occurrence
        while occ <= today:
            occ = occ + step
        if occ.year == today.year and occ.month == today.month:
            if rt.id in _linked_this_month or (
                rt.frequency in ('monthly', 'yearly')
                and (rt.amount, rt.transaction_type, rt.account_id) in _paid_this_month
            ):
                occ = occ + step
        while occ <= daily_end:
            daily_events.append({'date': occ, 'amount': rt.amount, 'kind': kind, 'label': rt.name})
            occ = occ + step

    for credit in uncovered.exclude(credit_type='revolving'):
        amount = (credit.monthly_payment or Decimal('0')) + (credit.insurance_monthly or Decimal('0'))
        if amount == 0:
            continue
        for pay_date in _monthly_charge_dates(credit.start_date.day, today, daily_end):
            daily_events.append({'date': pay_date, 'amount': amount, 'kind': 'credits', 'label': credit.name})

    for credit in uncovered.filter(credit_type='revolving').prefetch_related('draws'):
        amount = sum(d.monthly_payment for d in credit.draws.all() if d.is_active)
        if not amount:
            continue
        for pay_date in _monthly_charge_dates(credit.start_date.day, today, daily_end):
            daily_events.append({'date': pay_date, 'amount': Decimal(str(amount)), 'kind': 'credits', 'label': credit.name})

    decimal_overrides = {}
    if overrides:
        for k, v in overrides.items():
            if k in ('income', 'expenses', 'credits', 'extra_expenses') and v is not None:
                decimal_overrides[k] = Decimal(str(v))

    return ProjectionEngine(
        current_balance=current_balance,
        monthly_income=monthly_income,
        monthly_expenses=monthly_expenses,
        monthly_credits=monthly_credits,
        yearly_events=yearly_events,
        overrides=decimal_overrides,
        daily_events=daily_events,
    )
```

- [ ] **Modifier `backend/apps/projections/views.py`** — enrichir `projection_view` avec `checking_balance`

Ajouter l'import en haut :
```python
from apps.preferences.models import UserPreference
from .engine import build_engine_from_user, build_engine_for_account
```

Remplacer la fonction `projection_view` entière :
```python
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def projection_view(request):
    try:
        months = int(request.query_params.get('months', 12))
    except (ValueError, TypeError):
        return Response({'error': 'months must be an integer'}, status=status.HTTP_400_BAD_REQUEST)
    if months not in VALID_HORIZONS:
        return Response({'error': 'months must be 1, 3, 6, 12 or 60'}, status=status.HTTP_400_BAD_REQUEST)

    engine = build_engine_from_user(request.user)

    pref = UserPreference.objects.filter(
        user=request.user, primary_account__isnull=False, primary_account__is_active=True
    ).select_related('primary_account').first()
    checking_engine = build_engine_for_account(request.user, pref.primary_account_id) if pref else None

    if months == 1:
        today = date.today()
        days = (today + relativedelta(months=1) - today).days
        result = engine.project_daily(days)
        if checking_engine:
            checking_result = checking_engine.project_daily(days)
            for i, row in enumerate(result):
                row['checking_balance'] = checking_result[i]['balance']
        else:
            for row in result:
                row['checking_balance'] = None
        return Response(result)

    result = engine.project(months)
    if checking_engine:
        checking_result = checking_engine.project(months)
        for i, row in enumerate(result):
            row['checking_balance'] = checking_result[i]['balance']
    else:
        for row in result:
            row['checking_balance'] = None
    return Response(result)
```

- [ ] **Lancer les tests — vérifier qu'ils passent**

```bash
python manage.py test apps.projections.tests -v 2
```

Résultat attendu : tous les tests projections OK

- [ ] **Commit**

```bash
git add backend/apps/projections/engine.py backend/apps/projections/views.py backend/apps/projections/tests.py
git commit -m "feat(projections): add build_engine_for_account and checking_balance per projection point"
```

---

## Task 5 : Types frontend + API preferences.ts

**Files:**
- Modify: `frontend/src/types/index.ts`
- Create: `frontend/src/api/preferences.ts`

- [ ] **Modifier `frontend/src/types/index.ts`** — ajouter `UserPreference`, enrichir `DashboardSummary` et `ProjectionPoint`

Ajouter après la section `// ─── API ───` (ou en bas du fichier) :
```typescript
// ─── Preferences ───────────────────────────────────────────────────────────

export interface UserPreference {
  primary_account: number | null
  primary_account_name: string | null
}
```

Dans `DashboardSummary`, ajouter deux champs :
```typescript
export interface DashboardSummary {
  total_balance: number
  accounts: AccountBalance[]
  month_income: number
  month_expenses: number
  remaining_to_live: number
  total_monthly_credits: number
  total_recurring_expenses: number
  expenses_by_category: ExpenseByCategory[]
  upcoming_deadlines: UpcomingDeadline[]
  checking_account_id: number | null        // ← ajouter
  checking_account_balance: number | null   // ← ajouter
}
```

Dans `ProjectionPoint`, ajouter un champ :
```typescript
export interface ProjectionPoint {
  month: string
  date: string
  income: number
  expenses: number
  credits: number
  net: number
  balance: number
  checking_balance?: number | null   // ← ajouter
  baseline_balance?: number
  delta?: number
  events?: { label: string; amount: number; kind: string }[]
}
```

- [ ] **Créer `frontend/src/api/preferences.ts`**

```typescript
import client from './client'
import type { UserPreference } from '@/types'

export const preferencesApi = {
  get: () => client.get<UserPreference>('/preferences/'),
  patch: (data: { primary_account: number | null }) =>
    client.patch<UserPreference>('/preferences/', data),
}
```

- [ ] **Commit**

```bash
cd /DATA/AppData/gestioncompte
git add frontend/src/types/index.ts frontend/src/api/preferences.ts
git commit -m "feat(frontend): add UserPreference type and preferencesApi"
```

---

## Task 6 : Page Paramètres + navigation

**Files:**
- Create: `frontend/src/pages/SettingsPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/layout/AppLayout.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/src/components/layout/BottomNav.tsx`

- [ ] **Créer `frontend/src/pages/SettingsPage.tsx`**

```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings } from 'lucide-react'
import { accountsApi } from '@/api/accounts'
import { preferencesApi } from '@/api/preferences'
import { Card, CardTitle } from '@/components/ui/Card'
import { PageSpinner } from '@/components/ui/Spinner'

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [saved, setSaved] = useState(false)

  const { data: prefs, isLoading: loadingPrefs } = useQuery({
    queryKey: ['preferences'],
    queryFn: () => preferencesApi.get().then((r) => r.data),
  })

  const { data: accounts, isLoading: loadingAccounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data),
  })

  const mutation = useMutation({
    mutationFn: (accountId: number | null) =>
      preferencesApi.patch({ primary_account: accountId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preferences'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      queryClient.invalidateQueries({ queryKey: ['projections'] })
      queryClient.invalidateQueries({ queryKey: ['projections-daily-dashboard'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  if (loadingPrefs || loadingAccounts) return <PageSpinner />

  const activeAccounts = (accounts?.results ?? []).filter(
    (a) => a.is_active && a.account_type !== 'credit'
  )

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    mutation.mutate(val === '' ? null : Number(val))
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-brand-500/20">
          <Settings className="h-5 w-5 text-brand-400" />
        </div>
        <h1 className="text-xl font-bold text-white">Paramètres</h1>
      </div>

      <Card>
        <CardTitle>Compte courant principal</CardTitle>
        <p className="text-sm text-gray-400 mb-4">
          Sélectionnez le compte dont le solde sera affiché séparément sur le tableau de bord et les projections.
        </p>
        <select
          className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
          value={prefs?.primary_account ?? ''}
          onChange={handleChange}
          disabled={mutation.isPending}
        >
          <option value="">— Aucun —</option>
          {activeAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {saved && (
          <p className="text-sm text-green-400 mt-2">Paramètre enregistré.</p>
        )}
        {mutation.isError && (
          <p className="text-sm text-red-400 mt-2">Erreur lors de la sauvegarde.</p>
        )}
      </Card>
    </div>
  )
}
```

- [ ] **Modifier `frontend/src/App.tsx`** — ajouter l'import lazy et la route `/settings`

Ajouter l'import lazy avec les autres (ligne ~18) :
```tsx
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
```

Ajouter la route dans `<Routes>` après la route `bank-sync/callback` :
```tsx
<Route
  path="settings"
  element={
    <Suspense fallback={<PageSpinner />}>
      <SettingsPage />
    </Suspense>
  }
/>
```

- [ ] **Modifier `frontend/src/components/layout/AppLayout.tsx`** — ajouter le titre de page

```tsx
const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Tableau de bord',
  '/accounts': 'Comptes',
  '/transactions': 'Transactions',
  '/categories': 'Catégories',
  '/credits': 'Crédits',
  '/recurring': 'Charges fixes',
  '/projections': 'Projections financières',
  '/simulations': 'Simulations',
  '/bank-sync': 'Synchronisation bancaire',
  '/bank-sync/callback': 'Connexion bancaire',
  '/settings': 'Paramètres',   // ← ajouter
}
```

- [ ] **Modifier `frontend/src/components/layout/Sidebar.tsx`** — ajouter l'entrée nav

Ajouter `Settings` dans l'import Lucide :
```tsx
import {
  LayoutDashboard, CreditCard, ArrowLeftRight, Tag, RefreshCw,
  TrendingUp, Beaker, LogOut, ChevronLeft, PiggyBank, CalendarDays,
  Building2, Settings,
} from 'lucide-react'
```

Ajouter à la fin de `NAV_ITEMS` :
```tsx
  { to: '/settings', icon: Settings, label: 'Paramètres' },
```

- [ ] **Modifier `frontend/src/components/layout/BottomNav.tsx`** — ajouter dans `MORE_ITEMS`

Ajouter `Settings` dans l'import :
```tsx
import {
  LayoutDashboard, ArrowLeftRight, CreditCard, TrendingUp, MoreHorizontal,
  Tag, PiggyBank, RefreshCw, CalendarDays, Beaker, Building2, Settings,
} from 'lucide-react'
```

Ajouter à la fin de `MORE_ITEMS` :
```tsx
  { to: '/settings', icon: Settings, label: 'Paramètres' },
```

- [ ] **Commit**

```bash
git add frontend/src/pages/SettingsPage.tsx frontend/src/App.tsx \
  frontend/src/components/layout/AppLayout.tsx \
  frontend/src/components/layout/Sidebar.tsx \
  frontend/src/components/layout/BottomNav.tsx
git commit -m "feat(settings): add SettingsPage and nav entry for primary account selection"
```

---

## Task 7 : Dashboard — tuile CC + EvolutionChart dual-line

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/components/dashboard/EvolutionChart.tsx`

- [ ] **Modifier `frontend/src/pages/DashboardPage.tsx`**

Ajouter `Link` à l'import react-router-dom et `Building2` à l'import lucide :
```tsx
import { Link } from 'react-router-dom'
import {
  Wallet, TrendingUp, TrendingDown, Heart,
  CreditCard, RefreshCw, AlertTriangle, ArrowUpCircle, Building2,
} from 'lucide-react'
```

Remplacer la grille KPI (le `<div className="grid ...">`) entière :
```tsx
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        <StatCard
          title="Solde global"
          value={formatEur(summary.total_balance)}
          icon={Wallet}
          iconBg="bg-brand-500/20"
          iconColor="text-brand-400"
        />
        <StatCard
          title="Revenus du mois"
          value={formatEur(summary.month_income)}
          icon={TrendingUp}
          iconBg="bg-green-500/20"
          iconColor="text-green-400"
        />
        <StatCard
          title="Dépenses du mois"
          value={formatEur(summary.month_expenses)}
          icon={TrendingDown}
          iconBg="bg-red-500/20"
          iconColor="text-red-400"
        />
        <StatCard
          title="Reste à vivre"
          value={formatEur(summary.remaining_to_live)}
          icon={Heart}
          iconBg={summary.remaining_to_live >= 0 ? 'bg-emerald-500/20' : 'bg-red-500/20'}
          iconColor={summary.remaining_to_live >= 0 ? 'text-emerald-400' : 'text-red-400'}
        />
        <StatCard
          title="Total crédits"
          value={formatEur(summary.total_monthly_credits)}
          icon={CreditCard}
          iconBg="bg-orange-500/20"
          iconColor="text-orange-400"
        />
        <StatCard
          title="Charges fixes"
          value={formatEur(summary.total_recurring_expenses)}
          icon={RefreshCw}
          iconBg="bg-purple-500/20"
          iconColor="text-purple-400"
        />
        {/* Tuile compte courant */}
        {summary.checking_account_balance !== null ? (
          <StatCard
            title="Solde compte courant"
            value={formatEur(summary.checking_account_balance)}
            icon={Building2}
            iconBg="bg-emerald-500/20"
            iconColor="text-emerald-400"
          />
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Solde compte courant</span>
              <div className="p-2 rounded-lg bg-emerald-500/20">
                <Building2 className="h-5 w-5 text-emerald-400" />
              </div>
            </div>
            <p className="text-sm text-gray-500">
              Non configuré —{' '}
              <Link to="/settings" className="text-brand-400 underline hover:text-brand-300">
                Configurer
              </Link>
            </p>
          </div>
        )}
      </div>
```

- [ ] **Modifier `frontend/src/components/dashboard/EvolutionChart.tsx`** — ajouter la 2e Area

Remplacer le contenu entier du fichier :
```tsx
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import type { TooltipProps } from 'recharts'
import { Card, CardTitle } from '@/components/ui/Card'
import type { ProjectionPoint } from '@/types'

interface EvolutionChartProps {
  data: ProjectionPoint[]
}

const tooltipStyle = {
  backgroundColor: '#111827',
  border: '1px solid #374151',
  borderRadius: '8px',
  padding: '10px 12px',
  fontSize: '12px',
}

const formatEur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.[0]) return null
  const point = payload[0].payload as ProjectionPoint
  return (
    <div style={tooltipStyle}>
      <p style={{ color: '#9ca3af', marginBottom: '4px' }}>Jour : {label}</p>
      <p style={{ color: '#fff', fontWeight: 600 }}>Global : {formatEur(point.balance)}</p>
      {point.checking_balance != null && (
        <p style={{ color: '#10b981', fontWeight: 500 }}>
          CC : {formatEur(point.checking_balance)}
        </p>
      )}
      {point.events && point.events.length > 0 && (
        <>
          <hr style={{ borderColor: '#374151', margin: '6px 0' }} />
          {point.events.map((e, i) => (
            <p key={i} style={{ color: e.kind === 'income' ? '#4ade80' : '#f87171', margin: '2px 0' }}>
              {e.label} : {e.kind === 'income' ? '+' : '-'}{formatEur(e.amount)}
            </p>
          ))}
        </>
      )}
    </div>
  )
}

export function EvolutionChart({ data }: EvolutionChartProps) {
  const minBalance = Math.min(...data.map((d) => d.balance))
  const isNegative = minBalance < 0
  const hasChecking = data.some((d) => d.checking_balance != null)

  return (
    <Card>
      <CardTitle>Évolution sur les 30 prochains jours</CardTitle>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={isNegative ? '#ef4444' : '#6366f1'} stopOpacity={0.3} />
              <stop offset="95%" stopColor={isNegative ? '#ef4444' : '#6366f1'} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="checkingGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} interval={4} />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k€`}
          />
          <Tooltip content={<ChartTooltip />} />
          {hasChecking && (
            <Area
              type="monotone"
              dataKey="checking_balance"
              name="Compte courant"
              stroke="#10b981"
              fill="url(#checkingGrad)"
              strokeWidth={1.5}
              dot={false}
            />
          )}
          <Area
            type="monotone"
            dataKey="balance"
            name="Solde global"
            stroke={isNegative ? '#ef4444' : '#6366f1'}
            fill="url(#balanceGrad)"
            strokeWidth={2}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  )
}
```

- [ ] **Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx \
  frontend/src/components/dashboard/EvolutionChart.tsx
git commit -m "feat(dashboard): add checking account tile and dual-line EvolutionChart"
```

---

## Task 8 : ProjectionsPage KPI CC + ProjectionChart dual-line

**Files:**
- Modify: `frontend/src/pages/ProjectionsPage.tsx`
- Modify: `frontend/src/components/projections/ProjectionChart.tsx`

- [ ] **Modifier `frontend/src/components/projections/ProjectionChart.tsx`** — ajouter la 3e Area

Remplacer le contenu entier du fichier :
```tsx
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { TooltipProps } from 'recharts'
import type { ProjectionPoint } from '@/types'

const formatEur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

const tooltipStyle = {
  backgroundColor: '#111827',
  border: '1px solid #374151',
  borderRadius: '8px',
  padding: '10px 12px',
  fontSize: '12px',
}

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.[0]) return null
  const point = payload[0].payload as ProjectionPoint
  return (
    <div style={tooltipStyle}>
      <p style={{ color: '#9ca3af', marginBottom: '4px' }}>
        {label}
      </p>
      <p style={{ color: '#fff', fontWeight: 600 }}>Global : {formatEur(point.balance)}</p>
      {point.checking_balance != null && (
        <p style={{ color: '#10b981', fontWeight: 500 }}>
          CC : {formatEur(point.checking_balance)}
        </p>
      )}
      {point.baseline_balance !== undefined && (
        <p style={{ color: '#6b7280', fontSize: '11px', marginTop: '2px' }}>
          Sans simulation : {formatEur(point.baseline_balance)}
        </p>
      )}
      {point.events && point.events.length > 0 && (
        <>
          <hr style={{ borderColor: '#374151', margin: '6px 0' }} />
          {point.events.map((e, i) => (
            <p key={i} style={{ color: e.kind === 'income' ? '#4ade80' : '#f87171', margin: '2px 0' }}>
              {e.label} : {e.kind === 'income' ? '+' : '-'}{formatEur(e.amount)}
            </p>
          ))}
        </>
      )}
    </div>
  )
}

interface ProjectionChartProps {
  data: ProjectionPoint[]
  showBaseline?: boolean
  showChecking?: boolean
}

export function ProjectionChart({ data, showBaseline = false, showChecking = false }: ProjectionChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="baseGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6b7280" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#6b7280" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="checkingGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis
          dataKey="month"
          tick={{ fill: '#6b7280', fontSize: 11 }}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 11 }}
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k€`}
        />
        <Tooltip content={<ChartTooltip />} />
        <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1} />
        {showBaseline && (
          <Area
            type="monotone"
            dataKey="baseline_balance"
            name="Sans simulation"
            stroke="#6b7280"
            fill="url(#baseGrad)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
        )}
        {showChecking && (
          <Area
            type="monotone"
            dataKey="checking_balance"
            name="Compte courant"
            stroke="#10b981"
            fill="url(#checkingGrad)"
            strokeWidth={1.5}
            dot={false}
          />
        )}
        <Area
          type="monotone"
          dataKey="balance"
          name="Solde global"
          stroke="#6366f1"
          fill="url(#balGrad)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Modifier `frontend/src/pages/ProjectionsPage.tsx`** — KPI cards CC + showChecking

Ajouter `Link` à l'import react-router-dom. Remplacer le fichier entier :
```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { projectionsApi } from '@/api/projections'
import { ProjectionChart } from '@/components/projections/ProjectionChart'
import { Card, CardTitle } from '@/components/ui/Card'
import { PageSpinner } from '@/components/ui/Spinner'

const formatEur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

const HORIZONS = [
  { label: '1 mois', value: 1 },
  { label: '3 mois', value: 3 },
  { label: '6 mois', value: 6 },
  { label: '1 an', value: 12 },
  { label: '5 ans', value: 60 },
]

export default function ProjectionsPage() {
  const [months, setMonths] = useState(12)

  const { data, isLoading } = useQuery({
    queryKey: ['projections', months],
    queryFn: () => projectionsApi.project(months).then((r) => r.data),
  })

  if (isLoading || !data) return <PageSpinner />

  const isDaily = months === 1
  const first = data[0]
  const last = data[data.length - 1]
  const startBalance = first.balance - first.net
  const negativeCount = data.filter((d) => d.balance < 0).length
  const minBalance = Math.min(...data.map((d) => d.balance))

  const hasChecking = data.some((d) => d.checking_balance != null)
  // first.checking_balance est le solde après le 1er point (approximation du solde actuel)
  const checkingStart = hasChecking ? (first.checking_balance ?? 0) : null
  const checkingEnd = hasChecking ? (last.checking_balance ?? 0) : null

  const horizonLabel = months === 1 ? '1 mois' : months < 12 ? `${months} mois` : months === 12 ? '1 an' : '5 ans'

  return (
    <div className="space-y-6">
      {/* Horizon selector */}
      <div className="flex gap-2 flex-wrap">
        {HORIZONS.map((h) => (
          <button
            key={h.value}
            onClick={() => setMonths(h.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              months === h.value
                ? 'bg-brand-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {h.label}
          </button>
        ))}
      </div>

      {/* Invite si pas de compte courant configuré */}
      {!hasChecking && (
        <div className="flex items-center gap-3 bg-gray-800/60 border border-gray-700 rounded-xl px-4 py-3">
          <p className="text-sm text-gray-400">
            Configurez un{' '}
            <Link to="/settings" className="text-brand-400 underline hover:text-brand-300">
              compte courant principal
            </Link>{' '}
            pour afficher sa projection séparément.
          </p>
        </div>
      )}

      {/* Alert solde négatif */}
      {negativeCount > 0 && (
        <div className="flex items-start gap-3 bg-red-900/20 border border-red-800 rounded-xl p-4">
          <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">
            Attention : votre solde deviendra négatif pendant{' '}
            <strong>{negativeCount} {isDaily ? 'jour' : 'mois'}{isDaily && negativeCount > 1 ? 's' : ''}</strong>{' '}
            sur cette période. Solde minimum prévu :{' '}
            <strong>{formatEur(minBalance)}</strong>.
          </p>
        </div>
      )}

      {/* KPI cards — Solde global */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 px-1">Solde global</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <p className="text-sm text-gray-400">Solde de départ</p>
            <p className="text-2xl font-bold text-white mt-1">{formatEur(startBalance)}</p>
          </Card>
          <Card>
            <p className="text-sm text-gray-400">Solde prévu dans {horizonLabel}</p>
            <p className={`text-2xl font-bold mt-1 ${last.balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatEur(last.balance)}
            </p>
          </Card>
          <Card>
            <div className="flex items-center gap-2 mb-1">
              {last.balance > startBalance ? (
                <TrendingUp className="h-4 w-4 text-green-400" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-400" />
              )}
              <p className="text-sm text-gray-400">Évolution</p>
            </div>
            <p className={`text-2xl font-bold ${last.balance >= startBalance ? 'text-green-400' : 'text-red-400'}`}>
              {last.balance >= startBalance ? '+' : ''}
              {formatEur(last.balance - startBalance)}
            </p>
          </Card>
        </div>
      </div>

      {/* KPI cards — Compte courant */}
      {hasChecking && checkingStart !== null && checkingEnd !== null && (
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 px-1">Compte courant</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <p className="text-sm text-gray-400">Solde de départ CC</p>
              <p className="text-2xl font-bold text-white mt-1">{formatEur(checkingStart)}</p>
            </Card>
            <Card>
              <p className="text-sm text-gray-400">Solde prévu CC dans {horizonLabel}</p>
              <p className={`text-2xl font-bold mt-1 ${checkingEnd >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatEur(checkingEnd)}
              </p>
            </Card>
            <Card>
              <div className="flex items-center gap-2 mb-1">
                {checkingEnd > checkingStart ? (
                  <TrendingUp className="h-4 w-4 text-green-400" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-400" />
                )}
                <p className="text-sm text-gray-400">Évolution CC</p>
              </div>
              <p className={`text-2xl font-bold ${checkingEnd >= checkingStart ? 'text-green-400' : 'text-red-400'}`}>
                {checkingEnd >= checkingStart ? '+' : ''}
                {formatEur(checkingEnd - checkingStart)}
              </p>
            </Card>
          </div>
        </div>
      )}

      {/* Chart */}
      <Card>
        <CardTitle>Projection du solde</CardTitle>
        <ProjectionChart data={data} showChecking={hasChecking} />
      </Card>

      {/* Monthly table */}
      <Card padding={false}>
        <div className="p-6 border-b border-gray-800">
          <h3 className="text-base font-semibold text-gray-100">
            {isDaily ? 'Détail journalier' : 'Détail mensuel'}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                {[isDaily ? 'Jour' : 'Mois', 'Revenus', 'Dépenses', 'Crédits', isDaily ? 'Net du jour' : 'Net mensuel', 'Solde cumulé'].map((h) => (
                  <th key={h} className="text-left text-xs text-gray-500 font-medium px-6 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr
                  key={i}
                  className={`border-b border-gray-800/50 ${row.balance < 0 ? 'bg-red-900/10' : ''}`}
                >
                  <td className="px-6 py-3 text-sm text-gray-300 font-medium">{row.month}</td>
                  <td className="px-6 py-3 text-sm text-green-400">
                    {row.income ? `+${formatEur(row.income)}` : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-6 py-3 text-sm text-red-400">
                    {row.expenses ? `-${formatEur(row.expenses)}` : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-6 py-3 text-sm text-orange-400">
                    {row.credits ? `-${formatEur(row.credits)}` : <span className="text-gray-600">—</span>}
                  </td>
                  <td className={`px-6 py-3 text-sm font-medium ${row.net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {row.net ? `${row.net >= 0 ? '+' : ''}${formatEur(row.net)}` : <span className="text-gray-600">—</span>}
                  </td>
                  <td className={`px-6 py-3 text-sm font-bold ${row.balance >= 0 ? 'text-white' : 'text-red-400'}`}>
                    {formatEur(row.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
```

- [ ] **Commit**

```bash
git add frontend/src/pages/ProjectionsPage.tsx \
  frontend/src/components/projections/ProjectionChart.tsx
git commit -m "feat(projections): add checking account KPI cards and dual-line ProjectionChart"
```

---

## Task 9 : Tests backend finaux + validation manuelle

**Files:**
- Modify: `backend/apps/dashboard/tests.py` (run complet)
- Modify: `backend/apps/projections/tests.py` (run complet)
- Modify: `backend/apps/preferences/tests.py` (run complet)

- [ ] **Lancer tous les tests backend**

```bash
cd /DATA/AppData/gestioncompte/backend
python manage.py test apps.preferences apps.dashboard apps.projections -v 2
```

Résultat attendu : tous les tests passent (0 failures, 0 errors)

- [ ] **Validation manuelle** — démarrer le serveur et vérifier :

```bash
# Terminal 1
cd /DATA/AppData/gestioncompte/backend && python manage.py runserver

# Terminal 2
cd /DATA/AppData/gestioncompte/frontend && npm run dev
```

Checklist de validation :
1. Aller sur `/settings` → le sélecteur liste les comptes actifs
2. Sélectionner un compte → message "Paramètre enregistré" s'affiche
3. Aller sur `/dashboard` → 7e tuile "Solde compte courant" affiche le solde
4. L'`EvolutionChart` montre deux courbes (violette = global, verte = CC)
5. Aller sur `/projections` → 2 groupes de KPI cards (Global + CC)
6. Le graphique montre deux courbes sur tous les horizons
7. Désélectionner le compte dans Settings → tuile affiche "Configurer", graphiques reviennent à une courbe

- [ ] **Commit final**

```bash
git add -A
git commit -m "feat: checking account balance on dashboard and projections"
```
