# Cycle Start Day Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à l'utilisateur de configurer le jour de début de son mois budgétaire (ex: 25), remplaçant le 1er du mois dans tous les calculs dashboard et projections.

**Architecture:** Nouveau champ `cycle_start_day` dans `UserPreference` (défaut 1, plage 1–28). Une fonction utilitaire `get_cycle_start(today, cycle_start_day) → date` centralisée dans `apps/preferences/cycle.py` remplace les 4 occurrences de `today.replace(day=1)` dans le backend. Le frontend ajoute un sélecteur dans SettingsPage.

**Tech Stack:** Django 5, DRF, dateutil.relativedelta, React + TanStack Query, TypeScript

---

## Fichiers touchés

| Fichier | Action |
|---------|--------|
| `backend/apps/preferences/cycle.py` | Créer — utilitaire `get_cycle_start` + `get_cycle_start_nth_ago` |
| `backend/apps/preferences/models.py` | Modifier — ajouter `cycle_start_day` |
| `backend/apps/preferences/migrations/0002_userpreference_cycle_start_day.py` | Générer via `makemigrations` |
| `backend/apps/preferences/views.py` | Modifier — GET expose `cycle_start_day`, PATCH l'accepte avec validation |
| `backend/apps/preferences/tests.py` | Modifier — tests unitaires `get_cycle_start` + tests API |
| `backend/apps/dashboard/views.py` | Modifier — `dashboard_summary` + `balance_history` |
| `backend/apps/dashboard/tests.py` | Modifier — tests cycle dans dashboard |
| `backend/apps/projections/engine.py` | Modifier — `build_engine_from_user` + `build_engine_for_account` acceptent `cycle_start_day` |
| `backend/apps/projections/views.py` | Modifier — lit `cycle_start_day` et le passe aux engines |
| `frontend/src/types/index.ts` | Modifier — ajouter `cycle_start_day` à `UserPreference` |
| `frontend/src/api/preferences.ts` | Modifier — `patch()` accepte `cycle_start_day` |
| `frontend/src/pages/SettingsPage.tsx` | Modifier — nouveau sélecteur 1–28 |

---

## Task 1: Utilitaire `cycle.py` + tests unitaires

**Files:**
- Create: `backend/apps/preferences/cycle.py`
- Modify: `backend/apps/preferences/tests.py`

- [ ] **Step 1: Écrire les tests unitaires qui échouent**

Ajouter à la fin de `backend/apps/preferences/tests.py` :

```python
from datetime import date
from django.test import TestCase as DjangoTestCase


class GetCycleStartTest(DjangoTestCase):
    def _f(self, today, day):
        from apps.preferences.cycle import get_cycle_start
        return get_cycle_start(today, day)

    def test_day1_equals_first_of_month(self):
        self.assertEqual(self._f(date(2026, 6, 3), 1), date(2026, 6, 1))

    def test_day1_on_first(self):
        self.assertEqual(self._f(date(2026, 6, 1), 1), date(2026, 6, 1))

    def test_before_start_day_returns_prev_month(self):
        # today=3 juin, cycle_start=25 → 25 mai
        self.assertEqual(self._f(date(2026, 6, 3), 25), date(2026, 5, 25))

    def test_on_start_day_returns_current_month(self):
        self.assertEqual(self._f(date(2026, 6, 25), 25), date(2026, 6, 25))

    def test_after_start_day_returns_current_month(self):
        self.assertEqual(self._f(date(2026, 6, 26), 25), date(2026, 6, 25))

    def test_jan_before_start_wraps_to_dec(self):
        # today=5 jan, cycle_start=25 → 25 déc de l'année précédente
        self.assertEqual(self._f(date(2026, 1, 5), 25), date(2025, 12, 25))

    def test_short_month_clamps_day(self):
        # today=1 mars, cycle_start=31 → 28 fév (2026 non bissextile)
        self.assertEqual(self._f(date(2026, 3, 1), 31), date(2026, 2, 28))

    def test_leap_year_feb(self):
        # today=1 mars 2024, cycle_start=31 → 29 fév 2024 (bissextile)
        self.assertEqual(self._f(date(2024, 3, 1), 31), date(2024, 2, 29))


class GetCycleStartNthAgoTest(DjangoTestCase):
    def _f(self, today, day, n):
        from apps.preferences.cycle import get_cycle_start_nth_ago
        return get_cycle_start_nth_ago(today, day, n)

    def test_n0_is_current_cycle(self):
        # today=3 juin, cycle_start=25, n=0 → 25 mai
        self.assertEqual(self._f(date(2026, 6, 3), 25, 0), date(2026, 5, 25))

    def test_n1_is_previous_cycle(self):
        self.assertEqual(self._f(date(2026, 6, 3), 25, 1), date(2026, 4, 25))

    def test_n11_is_eleven_cycles_ago(self):
        self.assertEqual(self._f(date(2026, 6, 3), 25, 11), date(2025, 6, 25))
```

- [ ] **Step 2: Vérifier que les tests échouent**

```bash
docker compose run --rm backend python manage.py test apps.preferences.tests.GetCycleStartTest --no-input 2>&1 | tail -10
```

Résultat attendu : `ImportError` ou `ModuleNotFoundError` (cycle.py n'existe pas encore).

- [ ] **Step 3: Créer `backend/apps/preferences/cycle.py`**

```python
from datetime import date
from calendar import monthrange
from dateutil.relativedelta import relativedelta


def get_cycle_start(today: date, cycle_start_day: int) -> date:
    if today.day >= cycle_start_day:
        return today.replace(day=cycle_start_day)
    prev = today.replace(day=1) - relativedelta(months=1)
    return prev.replace(day=min(cycle_start_day, monthrange(prev.year, prev.month)[1]))


def get_cycle_start_nth_ago(today: date, cycle_start_day: int, n: int) -> date:
    current = get_cycle_start(today, cycle_start_day)
    return current - relativedelta(months=n)
```

- [ ] **Step 4: Vérifier que les tests passent**

```bash
docker compose run --rm backend python manage.py test apps.preferences.tests.GetCycleStartTest apps.preferences.tests.GetCycleStartNthAgoTest --no-input 2>&1 | tail -5
```

Résultat attendu : `Ran 11 tests ... OK`

- [ ] **Step 5: Commit**

```bash
git add backend/apps/preferences/cycle.py backend/apps/preferences/tests.py
git commit -m "feat(preferences): add cycle_start_day utility functions"
```

---

## Task 2: Modèle + migration Django

**Files:**
- Modify: `backend/apps/preferences/models.py`
- Create: `backend/apps/preferences/migrations/0002_userpreference_cycle_start_day.py` (auto-généré)

- [ ] **Step 1: Ajouter le champ au modèle**

Contenu final de `backend/apps/preferences/models.py` :

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
    cycle_start_day = models.PositiveSmallIntegerField(default=1)

    def __str__(self):
        return f'Prefs({self.user})'
```

- [ ] **Step 2: Générer la migration**

```bash
docker compose run --rm backend python manage.py makemigrations preferences --no-input 2>&1
```

Résultat attendu : `Migrations for 'preferences': apps/preferences/migrations/0002_...py`

- [ ] **Step 3: Appliquer la migration**

```bash
docker compose run --rm backend python manage.py migrate --no-input 2>&1 | tail -5
```

Résultat attendu : `Applying preferences.0002... OK`

- [ ] **Step 4: Vérifier que tous les tests preferences passent toujours**

```bash
docker compose run --rm backend python manage.py test apps.preferences --no-input 2>&1 | tail -5
```

Résultat attendu : `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/apps/preferences/models.py backend/apps/preferences/migrations/
git commit -m "feat(preferences): add cycle_start_day field to UserPreference"
```

---

## Task 3: API preferences — GET expose + PATCH valide `cycle_start_day`

**Files:**
- Modify: `backend/apps/preferences/views.py`
- Modify: `backend/apps/preferences/tests.py`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `backend/apps/preferences/tests.py` (dans la classe `PreferencesAPITest` existante) :

```python
    def test_get_returns_cycle_start_day_default(self):
        resp = self.client.get('/api/preferences/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['cycle_start_day'], 1)

    def test_patch_cycle_start_day_valid(self):
        resp = self.client.patch('/api/preferences/', {'cycle_start_day': 25}, format='json')
        self.assertEqual(resp.status_code, 200)
        pref = UserPreference.objects.get(user=self.user)
        self.assertEqual(pref.cycle_start_day, 25)

    def test_patch_cycle_start_day_too_low(self):
        resp = self.client.patch('/api/preferences/', {'cycle_start_day': 0}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_patch_cycle_start_day_too_high(self):
        resp = self.client.patch('/api/preferences/', {'cycle_start_day': 29}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_patch_cycle_start_day_max_valid(self):
        resp = self.client.patch('/api/preferences/', {'cycle_start_day': 28}, format='json')
        self.assertEqual(resp.status_code, 200)

    def test_patch_cycle_start_day_not_integer(self):
        resp = self.client.patch('/api/preferences/', {'cycle_start_day': 'abc'}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_patch_empty_body_still_400(self):
        resp = self.client.patch('/api/preferences/', {}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_patch_primary_account_alone_still_works(self):
        resp = self.client.patch('/api/preferences/', {'primary_account': self.account.id}, format='json')
        self.assertEqual(resp.status_code, 200)
```

- [ ] **Step 2: Vérifier que les nouveaux tests échouent**

```bash
docker compose run --rm backend python manage.py test apps.preferences --no-input 2>&1 | tail -10
```

Résultat attendu : plusieurs `FAIL` sur les nouveaux tests.

- [ ] **Step 3: Mettre à jour `backend/apps/preferences/views.py`**

```python
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from apps.accounts.models import Account
from .models import UserPreference


def _pref_response(pref):
    return {
        'primary_account': pref.primary_account_id,
        'primary_account_name': pref.primary_account.name if pref.primary_account else None,
        'cycle_start_day': pref.cycle_start_day,
    }


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def preferences_view(request):
    pref, _ = UserPreference.objects.get_or_create(user=request.user)

    if request.method == 'GET':
        return Response(_pref_response(pref))

    # PATCH — au moins un champ connu requis
    if 'primary_account' not in request.data and 'cycle_start_day' not in request.data:
        return Response(
            {'error': 'primary_account or cycle_start_day is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if 'cycle_start_day' in request.data:
        try:
            day = int(request.data['cycle_start_day'])
        except (ValueError, TypeError):
            return Response(
                {'error': 'cycle_start_day must be an integer.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not (1 <= day <= 28):
            return Response(
                {'error': 'cycle_start_day must be between 1 and 28.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        pref.cycle_start_day = day

    if 'primary_account' in request.data:
        account_id = request.data['primary_account']
        if account_id is None:
            pref.primary_account = None
        else:
            try:
                account = Account.objects.get(
                    pk=account_id, user=request.user,
                    is_active=True, account_type='checking',
                )
            except Account.DoesNotExist:
                return Response(
                    {'error': 'Compte introuvable, inactif ou non courant.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            pref.primary_account = account

    pref.save()
    return Response(_pref_response(pref))
```

- [ ] **Step 4: Vérifier que tous les tests preferences passent**

```bash
docker compose run --rm backend python manage.py test apps.preferences --no-input 2>&1 | tail -5
```

Résultat attendu : `OK` (tous les tests, anciens + nouveaux).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/preferences/views.py backend/apps/preferences/tests.py
git commit -m "feat(preferences): expose and validate cycle_start_day in API"
```

---

## Task 4: Dashboard — utiliser le cycle dans `dashboard_summary` et `balance_history`

**Files:**
- Modify: `backend/apps/dashboard/views.py`
- Modify: `backend/apps/dashboard/tests.py`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `backend/apps/dashboard/tests.py` :

```python
from datetime import date, timedelta
from apps.preferences.models import UserPreference
from apps.transactions.models import Transaction


class DashboardCycleStartDayTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('cycleuser', password='p')
        self.client.force_authenticate(user=self.user)
        self.account = Account.objects.create(
            user=self.user, name='CC', account_type='checking', initial_balance=1000,
        )

    def test_month_income_excludes_transaction_before_cycle_start(self):
        """Avec cycle_start_day=25, un revenu la veille du début de cycle est hors cycle."""
        from apps.preferences.cycle import get_cycle_start
        today = date.today()
        UserPreference.objects.create(user=self.user, cycle_start_day=25)
        before_cycle = get_cycle_start(today, 25) - timedelta(days=1)
        Transaction.objects.create(
            user=self.user, account=self.account,
            amount='500.00', transaction_type='income',
            date=before_cycle, description='Hors cycle',
        )
        resp = self.client.get('/api/dashboard/summary/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['month_income'], 0.0)

    def test_balance_history_default_label_no_arrow(self):
        """Avec cycle_start_day=1 (défaut), les labels n'ont pas de flèche →."""
        resp = self.client.get('/api/dashboard/balance-history/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 12)
        for entry in resp.data:
            self.assertNotIn('→', entry['month'])

    def test_balance_history_custom_cycle_label_has_arrow(self):
        """Avec cycle_start_day=25, les labels ont le format '25 Avr → 24 Mai'."""
        UserPreference.objects.create(user=self.user, cycle_start_day=25)
        resp = self.client.get('/api/dashboard/balance-history/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 12)
        for entry in resp.data:
            self.assertIn('→', entry['month'])

    def test_balance_history_returns_12_entries(self):
        UserPreference.objects.create(user=self.user, cycle_start_day=25)
        resp = self.client.get('/api/dashboard/balance-history/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 12)
```

- [ ] **Step 2: Vérifier que les tests échouent**

```bash
docker compose run --rm backend python manage.py test apps.dashboard.tests.DashboardCycleStartDayTest --no-input 2>&1 | tail -10
```

Résultat attendu : plusieurs `FAIL` ou `ERROR`.

- [ ] **Step 3: Mettre à jour `backend/apps/dashboard/views.py`**

Remplacer le contenu complet du fichier :

```python
from datetime import date, timedelta
from decimal import Decimal
from django.db.models import Sum, Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import Account
from apps.accounts.services import get_account_balance
from apps.categories.models import Category
from apps.transactions.models import Transaction
from apps.credits.models import Credit, CreditDraw
from apps.recurring.models import RecurringTransaction
from apps.preferences.models import UserPreference
from apps.preferences.cycle import get_cycle_start, get_cycle_start_nth_ago


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_summary(request):
    user = request.user
    today = date.today()

    pref = UserPreference.objects.filter(user=user).select_related('primary_account').first()
    cycle_start_day = pref.cycle_start_day if pref else 1
    first_of_month = get_cycle_start(today, cycle_start_day)

    accounts = Account.objects.filter(user=user, is_active=True).exclude(account_type='credit')
    total_balance = sum(get_account_balance(a) for a in accounts)
    accounts_data = [
        {'id': a.id, 'name': a.name, 'type': a.account_type,
         'balance': float(get_account_balance(a)), 'color': a.color, 'icon': a.icon}
        for a in accounts
    ]

    month_transactions = Transaction.objects.filter(
        user=user, date__gte=first_of_month, date__lte=today
    )
    month_income = float(month_transactions.filter(transaction_type='income').aggregate(
        t=Sum('amount'))['t'] or 0)
    month_expenses = float(month_transactions.filter(transaction_type='expense').aggregate(
        t=Sum('amount'))['t'] or 0)

    credits = Credit.objects.filter(user=user, is_active=True)
    non_revolving = credits.exclude(credit_type='revolving')
    agg = non_revolving.aggregate(p=Sum('monthly_payment'), i=Sum('insurance_monthly'))
    total_monthly_credits = float(agg['p'] or 0) + float(agg['i'] or 0)
    total_monthly_credits += float(
        CreditDraw.objects.filter(
            credit__in=credits.filter(credit_type='revolving'), is_active=True,
        ).aggregate(t=Sum('monthly_payment'))['t'] or 0
    )

    recurring = RecurringTransaction.objects.filter(user=user, is_active=True, transaction_type='expense')
    total_recurring = float(recurring.aggregate(t=Sum('amount'))['t'] or 0)

    cat_map = {c.id: c for c in Category.objects.filter(user=user).select_related('parent')}

    def get_root(cat_id: int) -> Category | None:
        seen = set()
        cat = cat_map.get(cat_id)
        while cat and cat.parent_id:
            if cat.parent_id in seen:
                return None
            seen.add(cat.parent_id)
            cat = cat_map.get(cat.parent_id)
        return cat

    by_category = month_transactions.filter(
        transaction_type='expense', category__isnull=False
    ).values('category_id').annotate(total=Sum('amount'))

    category_totals: dict[str, dict] = {}
    for r in by_category:
        root = get_root(r['category_id'])
        if root is None:
            continue
        if root.name not in category_totals:
            category_totals[root.name] = {'name': root.name, 'color': root.color, 'amount': 0.0}
        category_totals[root.name]['amount'] += float(r['total'])

    expenses_by_category = sorted(category_totals.values(), key=lambda x: x['amount'], reverse=True)

    cutoff = today + timedelta(days=30)
    upcoming_recurring = list(
        RecurringTransaction.objects.filter(
            user=user, is_active=True, next_occurrence__lte=cutoff, next_occurrence__gte=today
        ).values('name', 'amount', 'next_occurrence', 'transaction_type')[:10]
    )
    for item in upcoming_recurring:
        item['next_occurrence'] = str(item['next_occurrence'])
        item['amount'] = str(item['amount'])

    checking_account_id = None
    checking_account_balance = None
    if pref and pref.primary_account and pref.primary_account.is_active:
        checking_account_id = pref.primary_account.id
        checking_account_balance = float(get_account_balance(pref.primary_account))

    return Response({
        'total_balance': float(total_balance),
        'accounts': accounts_data,
        'month_income': month_income,
        'month_expenses': month_expenses,
        'remaining_to_live': month_income - month_expenses,
        'total_monthly_credits': total_monthly_credits,
        'total_recurring_expenses': total_recurring,
        'expenses_by_category': expenses_by_category,
        'upcoming_deadlines': upcoming_recurring,
        'checking_account_id': checking_account_id,
        'checking_account_balance': checking_account_balance,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def balance_history(request):
    """Balance evolution for the last 12 billing cycles."""
    from dateutil.relativedelta import relativedelta
    user = request.user
    today = date.today()

    pref = UserPreference.objects.filter(user=user).first()
    cycle_start_day = pref.cycle_start_day if pref else 1

    data = []
    for i in range(11, -1, -1):
        cycle_start = get_cycle_start_nth_ago(today, cycle_start_day, i)
        cycle_end = cycle_start + relativedelta(months=1)
        income = float(Transaction.objects.filter(
            user=user, date__gte=cycle_start, date__lt=cycle_end, transaction_type='income'
        ).aggregate(t=Sum('amount'))['t'] or 0)
        expenses = float(Transaction.objects.filter(
            user=user, date__gte=cycle_start, date__lt=cycle_end, transaction_type='expense'
        ).aggregate(t=Sum('amount'))['t'] or 0)

        if cycle_start_day == 1:
            label = cycle_start.strftime('%b %Y')
        else:
            cycle_end_inclusive = cycle_end - timedelta(days=1)
            label = (
                f"{cycle_start.day} {cycle_start.strftime('%b')}"
                f" → "
                f"{cycle_end_inclusive.day} {cycle_end_inclusive.strftime('%b')}"
            )

        data.append({
            'month': label,
            'income': income,
            'expenses': expenses,
            'net': income - expenses,
        })

    return Response(data)
```

- [ ] **Step 4: Vérifier que les tests dashboard passent**

```bash
docker compose run --rm backend python manage.py test apps.dashboard --no-input 2>&1 | tail -5
```

Résultat attendu : `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/apps/dashboard/views.py backend/apps/dashboard/tests.py
git commit -m "feat(dashboard): use cycle_start_day in summary and balance history"
```

---

## Task 5: Projection engine — accepter `cycle_start_day`

**Files:**
- Modify: `backend/apps/projections/engine.py`
- Modify: `backend/apps/projections/views.py`
- Modify: `backend/apps/projections/tests.py`

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à `backend/apps/projections/tests.py` :

```python
class BuildEngineWithCycleStartDayTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('engcycle', password='p')
        Account.objects.create(
            user=self.user, name='CC', account_type='checking', initial_balance=2000,
        )

    def test_build_engine_from_user_accepts_cycle_start_day(self):
        from apps.projections.engine import build_engine_from_user
        engine = build_engine_from_user(self.user, cycle_start_day=25)
        self.assertIsNotNone(engine)
        result = engine.project(months=1)
        self.assertEqual(len(result), 1)

    def test_build_engine_for_account_accepts_cycle_start_day(self):
        from apps.projections.engine import build_engine_for_account
        from apps.accounts.models import Account
        account = Account.objects.filter(user=self.user).first()
        engine = build_engine_for_account(self.user, account.id, cycle_start_day=25)
        self.assertIsNotNone(engine)
        result = engine.project(months=1)
        self.assertEqual(len(result), 1)
```

- [ ] **Step 2: Vérifier que le test échoue**

```bash
docker compose run --rm backend python manage.py test apps.projections.tests.BuildEngineWithCycleStartDayTest --no-input 2>&1 | tail -10
```

Résultat attendu : `TypeError` (argument inattendu `cycle_start_day`).

- [ ] **Step 3: Mettre à jour `build_engine_from_user` dans `backend/apps/projections/engine.py`**

Ligne 123 — changer la signature :

```python
# Avant
def build_engine_from_user(user, overrides: dict = None) -> ProjectionEngine:

# Après
def build_engine_from_user(user, overrides: dict = None, cycle_start_day: int = 1) -> ProjectionEngine:
```

Ligne 200 — remplacer `first_of_month` :

```python
# Avant
    first_of_month = today.replace(day=1)

# Après
    from apps.preferences.cycle import get_cycle_start
    first_of_month = get_cycle_start(today, cycle_start_day)
```

- [ ] **Step 4: Mettre à jour `build_engine_for_account` dans `backend/apps/projections/engine.py`**

Ligne 272 — changer la signature :

```python
# Avant
def build_engine_for_account(user, account_id: int, overrides: dict = None) -> 'ProjectionEngine':

# Après
def build_engine_for_account(user, account_id: int, overrides: dict = None, cycle_start_day: int = 1) -> 'ProjectionEngine':
```

Ligne 344 — remplacer `first_of_month` :

```python
# Avant
    first_of_month = today.replace(day=1)

# Après
    from apps.preferences.cycle import get_cycle_start
    first_of_month = get_cycle_start(today, cycle_start_day)
```

- [ ] **Step 5: Mettre à jour `backend/apps/projections/views.py`**

Remplacer le contenu complet :

```python
from datetime import date

from dateutil.relativedelta import relativedelta
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from apps.preferences.models import UserPreference
from .engine import build_engine_from_user, build_engine_for_account

VALID_HORIZONS = {1, 3, 6, 12, 60}


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def projection_view(request):
    try:
        months = int(request.query_params.get('months', 12))
    except (ValueError, TypeError):
        return Response({'error': 'months must be an integer'}, status=status.HTTP_400_BAD_REQUEST)
    if months not in VALID_HORIZONS:
        return Response({'error': 'months must be 1, 3, 6, 12 or 60'}, status=status.HTTP_400_BAD_REQUEST)

    pref = UserPreference.objects.filter(
        user=request.user
    ).select_related('primary_account').first()
    cycle_start_day = pref.cycle_start_day if pref else 1

    engine = build_engine_from_user(request.user, cycle_start_day=cycle_start_day)

    checking_engine = None
    if pref and pref.primary_account and pref.primary_account.is_active:
        checking_engine = build_engine_for_account(
            request.user, pref.primary_account_id, cycle_start_day=cycle_start_day
        )

    if months == 1:
        today = date.today()
        days = (today + relativedelta(months=1) - today).days
        result = engine.project_daily(days)
        if checking_engine:
            checking_result = checking_engine.project_daily(days)
            result[0]['checking_start_balance'] = float(checking_engine.current_balance)
            for row, crow in zip(result, checking_result):
                row['checking_balance'] = crow['balance']
        else:
            for row in result:
                row['checking_balance'] = None
        return Response(result)

    result = engine.project(months)
    if checking_engine:
        checking_result = checking_engine.project(months)
        result[0]['checking_start_balance'] = float(checking_engine.current_balance)
        for row, crow in zip(result, checking_result):
            row['checking_balance'] = crow['balance']
    else:
        for row in result:
            row['checking_balance'] = None
    return Response(result)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def simulation_view(request):
    """Sandbox simulation — does NOT modify real data."""
    try:
        months = int(request.data.get('months', 12))
    except (ValueError, TypeError):
        months = 12

    overrides = {}
    for k in ('income', 'expenses', 'credits'):
        v = request.data.get(k)
        if v is not None:
            try:
                overrides[k] = float(v)
            except (ValueError, TypeError):
                pass

    extra_expenses_list = request.data.get('extra_expenses', [])
    if isinstance(extra_expenses_list, list):
        total_extra = 0.0
        for item in extra_expenses_list:
            try:
                total_extra += float(item.get('amount', 0))
            except (ValueError, TypeError, AttributeError):
                pass
        if total_extra > 0:
            overrides['extra_expenses'] = total_extra

    pref = UserPreference.objects.filter(user=request.user).first()
    cycle_start_day = pref.cycle_start_day if pref else 1

    engine = build_engine_from_user(request.user, overrides=overrides, cycle_start_day=cycle_start_day)
    baseline_engine = build_engine_from_user(request.user, cycle_start_day=cycle_start_day)

    if months == 1:
        today = date.today()
        days = (today + relativedelta(months=1) - today).days
        result = engine.project_daily(days)
        baseline = baseline_engine.project_daily(days)
    else:
        result = engine.project(months)
        baseline = baseline_engine.project(months)

    for i, row in enumerate(result):
        row['baseline_balance'] = baseline[i]['balance']
        row['delta'] = round(row['balance'] - baseline[i]['balance'], 2)

    return Response(result)
```

- [ ] **Step 6: Vérifier que tous les tests projections passent**

```bash
docker compose run --rm backend python manage.py test apps.projections --no-input 2>&1 | tail -5
```

Résultat attendu : `OK`

- [ ] **Step 7: Lancer tous les tests backend**

```bash
docker compose run --rm backend python manage.py test --no-input 2>&1 | tail -5
```

Résultat attendu : `OK`

- [ ] **Step 8: Commit**

```bash
git add backend/apps/projections/engine.py backend/apps/projections/views.py backend/apps/projections/tests.py
git commit -m "feat(projections): pass cycle_start_day to engine for accurate cycle detection"
```

---

## Task 6: Frontend — types + API preferences

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/api/preferences.ts`

- [ ] **Step 1: Mettre à jour `UserPreference` dans `frontend/src/types/index.ts`**

Ligne 235 — remplacer le bloc `UserPreference` :

```typescript
export interface UserPreference {
  primary_account: number | null
  primary_account_name: string | null
  cycle_start_day: number
}
```

- [ ] **Step 2: Mettre à jour `frontend/src/api/preferences.ts`**

Remplacer le contenu complet :

```typescript
import client from './client'
import type { UserPreference } from '@/types'

export const preferencesApi = {
  get: () => client.get<UserPreference>('/preferences/'),
  patch: (data: { primary_account?: number | null; cycle_start_day?: number }) =>
    client.patch<UserPreference>('/preferences/', data),
}
```

- [ ] **Step 3: Vérifier que TypeScript compile sans erreur**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Résultat attendu : aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/api/preferences.ts
git commit -m "feat(frontend): add cycle_start_day to UserPreference type and preferences API"
```

---

## Task 7: Frontend — SettingsPage UI

**Files:**
- Modify: `frontend/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Remplacer le contenu de `frontend/src/pages/SettingsPage.tsx`**

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
  const [accountSaved, setAccountSaved] = useState(false)
  const [cycleSaved, setCycleSaved] = useState(false)

  const { data: prefs, isLoading: loadingPrefs } = useQuery({
    queryKey: ['preferences'],
    queryFn: () => preferencesApi.get().then((r) => r.data),
  })

  const { data: accounts, isLoading: loadingAccounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data),
  })

  const accountMutation = useMutation({
    mutationFn: (accountId: number | null) =>
      preferencesApi.patch({ primary_account: accountId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preferences'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      queryClient.invalidateQueries({ queryKey: ['projections'] })
      queryClient.invalidateQueries({ queryKey: ['projections-daily-dashboard'] })
      setAccountSaved(true)
      setTimeout(() => setAccountSaved(false), 3000)
    },
  })

  const cycleMutation = useMutation({
    mutationFn: (day: number) => preferencesApi.patch({ cycle_start_day: day }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preferences'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      queryClient.invalidateQueries({ queryKey: ['projections'] })
      queryClient.invalidateQueries({ queryKey: ['projections-daily-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['balance-history'] })
      setCycleSaved(true)
      setTimeout(() => setCycleSaved(false), 3000)
    },
  })

  if (loadingPrefs || loadingAccounts) return <PageSpinner />

  const activeAccounts = (accounts?.results ?? []).filter(
    (a) => a.is_active && a.account_type === 'checking'
  )

  function handleAccountChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    accountMutation.mutate(val === '' ? null : Number(val))
  }

  function handleCycleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    cycleMutation.mutate(Number(e.target.value))
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
          onChange={handleAccountChange}
          disabled={accountMutation.isPending}
        >
          <option value="">— Aucun —</option>
          {activeAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {accountSaved && (
          <p className="text-sm text-green-400 mt-2">Paramètre enregistré.</p>
        )}
        {accountMutation.isError && (
          <p className="text-sm text-red-400 mt-2">Erreur lors de la sauvegarde.</p>
        )}
      </Card>

      <Card>
        <CardTitle>Début de mois budgétaire</CardTitle>
        <p className="text-sm text-gray-400 mb-4">
          Jour du mois à partir duquel commence votre cycle budgétaire. Par exemple, si vous êtes payé le 25, choisissez 25 — vos revenus et dépenses seront calculés du 25 au 24 du mois suivant.
        </p>
        <select
          className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
          value={prefs?.cycle_start_day ?? 1}
          onChange={handleCycleChange}
          disabled={cycleMutation.isPending}
        >
          <option value={1}>1 (début du mois calendaire)</option>
          {Array.from({ length: 27 }, (_, i) => i + 2).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        {cycleSaved && (
          <p className="text-sm text-green-400 mt-2">Paramètre enregistré.</p>
        )}
        {cycleMutation.isError && (
          <p className="text-sm text-red-400 mt-2">Erreur lors de la sauvegarde.</p>
        )}
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Vérifier que TypeScript compile**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Résultat attendu : aucune erreur.

- [ ] **Step 3: Vérifier le build frontend**

```bash
cd frontend && npx vite build 2>&1 | tail -10
```

Résultat attendu : `✓ built in ...` sans erreur.

- [ ] **Step 4: Lancer tous les tests backend une dernière fois**

```bash
docker compose run --rm backend python manage.py test --no-input 2>&1 | tail -5
```

Résultat attendu : `OK`

- [ ] **Step 5: Commit final**

```bash
git add frontend/src/pages/SettingsPage.tsx
git commit -m "feat(settings): add cycle_start_day selector (1-28) to Settings page"
```
