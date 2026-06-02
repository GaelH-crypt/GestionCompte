from decimal import Decimal
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
from django.test import TestCase
from django.contrib.auth.models import User


class ProjectionEngineTest(TestCase):
    def test_simple_projection(self):
        from apps.projections.engine import ProjectionEngine
        engine = ProjectionEngine(
            current_balance=Decimal('5000'),
            monthly_income=Decimal('3000'),
            monthly_expenses=Decimal('2000'),
            monthly_credits=Decimal('400'),
        )
        result = engine.project(months=3)
        self.assertEqual(len(result), 3)
        # After month 1: 5000 + (3000 - 2000 - 400) = 5600
        self.assertAlmostEqual(result[0]['balance'], 5600.0, places=1)
        # After month 2: 5600 + 600 = 6200
        self.assertAlmostEqual(result[1]['balance'], 6200.0, places=1)

    def test_override_income(self):
        from apps.projections.engine import ProjectionEngine
        engine = ProjectionEngine(
            current_balance=Decimal('1000'),
            monthly_income=Decimal('2000'),
            monthly_expenses=Decimal('1000'),
            monthly_credits=Decimal('0'),
            overrides={'income': Decimal('3000')},
        )
        result = engine.project(months=1)
        # 1000 + (3000 - 1000 - 0) = 3000
        self.assertAlmostEqual(result[0]['balance'], 3000.0, places=1)

    def test_daily_projection_places_events_on_real_dates(self):
        from apps.projections.engine import ProjectionEngine
        today = date.today()
        events = [
            {'date': today + timedelta(days=2), 'amount': Decimal('2000'), 'kind': 'income', 'label': 'Salaire'},
            {'date': today + timedelta(days=4), 'amount': Decimal('800'), 'kind': 'expenses', 'label': 'Loyer'},
            {'date': today + timedelta(days=4), 'amount': Decimal('400'), 'kind': 'credits', 'label': 'Crédit auto'},
        ]
        engine = ProjectionEngine(
            current_balance=Decimal('1000'),
            monthly_income=Decimal('0'),
            monthly_expenses=Decimal('0'),
            monthly_credits=Decimal('0'),
            daily_events=events,
        )
        result = engine.project_daily(days=5)
        self.assertEqual(len(result), 5)
        # Day 1: no event yet → unchanged.
        self.assertAlmostEqual(result[0]['balance'], 1000.0, places=1)
        # Day 2: +2000 income.
        self.assertAlmostEqual(result[1]['balance'], 3000.0, places=1)
        # Day 4: -800 expense -400 credit.
        self.assertAlmostEqual(result[3]['balance'], 1800.0, places=1)
        self.assertAlmostEqual(result[3]['net'], -1200.0, places=1)

    def test_daily_projection_events_field_contains_named_events(self):
        from apps.projections.engine import ProjectionEngine
        today = date.today()
        events = [
            {'date': today + timedelta(days=1), 'amount': Decimal('2500'), 'kind': 'income', 'label': 'Salaire'},
            {'date': today + timedelta(days=3), 'amount': Decimal('850'), 'kind': 'expenses', 'label': 'Loyer'},
            {'date': today + timedelta(days=3), 'amount': Decimal('200'), 'kind': 'credits', 'label': 'Crédit voiture'},
        ]
        engine = ProjectionEngine(
            current_balance=Decimal('1000'),
            monthly_income=Decimal('0'),
            monthly_expenses=Decimal('0'),
            monthly_credits=Decimal('0'),
            daily_events=events,
        )
        result = engine.project_daily(days=5)
        # Day 1 has one income event
        self.assertEqual(len(result[0]['events']), 1)
        self.assertEqual(result[0]['events'][0]['label'], 'Salaire')
        self.assertAlmostEqual(result[0]['events'][0]['amount'], 2500.0, places=1)
        self.assertEqual(result[0]['events'][0]['kind'], 'income')
        # Day 3 has two events
        self.assertEqual(len(result[2]['events']), 2)
        labels = {e['label'] for e in result[2]['events']}
        self.assertEqual(labels, {'Loyer', 'Crédit voiture'})
        # Days without events have empty list
        self.assertEqual(result[1]['events'], [])
        self.assertEqual(result[4]['events'], [])

    def test_daily_projection_override_days_have_no_events(self):
        from apps.projections.engine import ProjectionEngine
        engine = ProjectionEngine(
            current_balance=Decimal('1000'),
            monthly_income=Decimal('0'),
            monthly_expenses=Decimal('0'),
            monthly_credits=Decimal('0'),
            daily_events=[],
            overrides={'income': Decimal('300')},
        )
        result = engine.project_daily(days=3)
        for point in result:
            self.assertEqual(point['events'], [])

    def test_extra_expenses_override_reduces_balance(self):
        from apps.projections.engine import ProjectionEngine
        engine = ProjectionEngine(
            current_balance=Decimal('1000'),
            monthly_income=Decimal('2000'),
            monthly_expenses=Decimal('1000'),
            monthly_credits=Decimal('0'),
            overrides={'extra_expenses': Decimal('200')},
        )
        result = engine.project(months=1)
        # 1000 + (2000 - 1000 - 200 - 0) = 1800
        self.assertAlmostEqual(result[0]['balance'], 1800.0, places=1)

    def test_daily_projection_applies_income_override(self):
        from apps.projections.engine import ProjectionEngine
        # monthly_income = 0, override income = 600 → delta = 600/2 = 300/day
        engine = ProjectionEngine(
            current_balance=Decimal('1000'),
            monthly_income=Decimal('0'),
            monthly_expenses=Decimal('0'),
            monthly_credits=Decimal('0'),
            daily_events=[],
            overrides={'income': Decimal('600')},
        )
        result = engine.project_daily(days=2)
        self.assertAlmostEqual(result[0]['balance'], 1300.0, places=1)
        self.assertAlmostEqual(result[1]['balance'], 1600.0, places=1)

    def test_daily_projection_applies_extra_expenses_override(self):
        from apps.projections.engine import ProjectionEngine
        # extra_expenses = 60 → 60/2 = 30/day additional expense
        engine = ProjectionEngine(
            current_balance=Decimal('1000'),
            monthly_income=Decimal('0'),
            monthly_expenses=Decimal('0'),
            monthly_credits=Decimal('0'),
            daily_events=[],
            overrides={'extra_expenses': Decimal('60')},
        )
        result = engine.project_daily(days=2)
        self.assertAlmostEqual(result[0]['balance'], 970.0, places=1)
        self.assertAlmostEqual(result[1]['balance'], 940.0, places=1)

    def test_daily_projection_applies_expenses_override(self):
        from apps.projections.engine import ProjectionEngine
        # monthly_expenses = 0, override expenses = 100 → delta = 100/2 = 50/day
        engine = ProjectionEngine(
            current_balance=Decimal('1000'),
            monthly_income=Decimal('0'),
            monthly_expenses=Decimal('0'),
            monthly_credits=Decimal('0'),
            daily_events=[],
            overrides={'expenses': Decimal('100')},
        )
        result = engine.project_daily(days=2)
        self.assertAlmostEqual(result[0]['balance'], 950.0, places=1)
        self.assertAlmostEqual(result[1]['balance'], 900.0, places=1)


class BuildEngineFromUserTest(TestCase):
    """Integration tests for build_engine_from_user using a real DB."""

    def setUp(self):
        from apps.accounts.models import Account
        from apps.recurring.models import RecurringTransaction
        from apps.transactions.models import Transaction

        self.user = User.objects.create_user(username='testuser', password='pw')
        self.account = Account.objects.create(
            user=self.user, name='Compte courant', account_type='checking',
            initial_balance=Decimal('5000'),
        )
        today = date.today()
        # Stale next_occurrence: last month's 2nd → will advance to this month's 2nd.
        last_month_2nd = (today.replace(day=1) - relativedelta(months=1)).replace(day=2)
        self.loyer_recurring = RecurringTransaction.objects.create(
            user=self.user,
            account=self.account,
            name='VIR SEPA LOYER',
            amount=Decimal('915.00'),
            transaction_type='expense',
            frequency='monthly',
            next_occurrence=last_month_2nd,
        )
        # Imported transaction for this month (day 1, before the stale occurrence).
        Transaction.objects.create(
            user=self.user,
            account=self.account,
            transaction_type='expense',
            amount=Decimal('915.00'),
            description='VIR SEPA LOYER 14 RUE HAUTE',
            date=today.replace(day=1),
        )

    def test_stale_recurring_not_double_counted_in_daily_events(self):
        """When an imported transaction covers the current month's recurring charge,
        build_engine_from_user must not emit an occurrence within the same calendar
        month — the payment was already captured in current_balance."""
        from apps.projections.engine import build_engine_from_user
        today = date.today()
        engine = build_engine_from_user(self.user)

        # The next loyer occurrence in daily_events must NOT be in the current month.
        loyer_events = [
            e for e in engine.daily_events
            if e['amount'] == Decimal('915.00') and e['kind'] == 'expenses'
        ]
        for e in loyer_events:
            self.assertFalse(
                e['date'].year == today.year and e['date'].month == today.month,
                f"Loyer occurrence {e['date']} is in the current month — double-counting detected",
            )

    def test_explicit_link_takes_priority_over_heuristic(self):
        """An explicitly linked transaction must prevent double-counting
        even when amounts differ (variable childcare payments)."""
        from apps.transactions.models import Transaction
        today = date.today()
        from apps.recurring.models import RecurringTransaction
        rt_nounou = RecurringTransaction.objects.create(
            user=self.user,
            account=self.account,
            name='Nounou',
            amount=Decimal('300.00'),
            transaction_type='expense',
            frequency='monthly',
            next_occurrence=(today.replace(day=1) - relativedelta(months=1)).replace(day=5),
        )
        tx_nounou = Transaction.objects.create(
            user=self.user,
            account=self.account,
            transaction_type='expense',
            amount=Decimal('285.00'),  # different amount — heuristic would miss this
            description='Paiement nounou juin',
            date=today.replace(day=1),
        )
        tx_nounou.recurring_transaction = rt_nounou
        tx_nounou.save()

        from apps.projections.engine import build_engine_from_user
        engine = build_engine_from_user(self.user)

        nounou_events_this_month = [
            e for e in engine.daily_events
            if e['amount'] == Decimal('300.00')
            and e['date'].year == today.year
            and e['date'].month == today.month
        ]
        self.assertEqual(
            len(nounou_events_this_month), 0,
            "Nounou must not appear in current month via explicit link",
        )


class BuildEngineForAccountTest(TestCase):
    def setUp(self):
        from apps.accounts.models import Account
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
        from rest_framework.test import APIClient
        UserPreference.objects.create(user=self.user, primary_account=self.account)
        client = APIClient()
        client.force_authenticate(user=self.user)
        resp = client.get('/api/projections/?months=3')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('checking_balance', resp.data[0])
        self.assertIsNotNone(resp.data[0]['checking_balance'])

    def test_projection_view_no_checking_balance_when_not_configured(self):
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.user)
        resp = client.get('/api/projections/?months=3')
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.data[0].get('checking_balance'))
