from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient
from apps.accounts.models import Account


class DashboardSummaryTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('dashuser', password='p')
        self.client.force_authenticate(user=self.user)
        self.account = Account.objects.create(
            user=self.user, name='Compte Courant', account_type='checking', initial_balance=1000,
        )

    def test_dashboard_returns_200(self):
        resp = self.client.get('/api/dashboard/summary/')
        self.assertEqual(resp.status_code, 200)

    def test_normal_account_appears_in_dashboard(self):
        resp = self.client.get('/api/dashboard/summary/')
        self.assertEqual(resp.status_code, 200)
        account_names = [a['name'] for a in resp.data['accounts']]
        self.assertIn('Compte Courant', account_names)

    def test_credit_account_excluded_from_dashboard(self):
        from apps.credits.models import Credit
        import datetime
        credit = Credit.objects.create(
            user=self.user, name='Test Crédit', credit_type='consumer',
            initial_capital=5000, remaining_capital=4000, interest_rate=3,
            monthly_payment=200, insurance_monthly=0, duration_months=24,
            start_date=datetime.date(2024, 1, 1),
        )
        Account.objects.create(
            user=self.user, name='Compte Crédit', account_type='credit',
            initial_balance=0, linked_credit=credit,
        )
        resp = self.client.get('/api/dashboard/summary/')
        self.assertEqual(resp.status_code, 200)
        account_names = [a['name'] for a in resp.data['accounts']]
        self.assertNotIn('Compte Crédit', account_names)


class DashboardCreditDedupTest(TestCase):
    """Le crédit est la source unique : une récurrence liée à un crédit ne doit
    jamais être comptée en double avec la mensualité du crédit."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('dedupuser', password='p')
        self.client.force_authenticate(user=self.user)
        self.account = Account.objects.create(
            user=self.user, name='CC', account_type='checking', initial_balance=1000,
        )

    def test_credit_linked_recurring_not_double_counted(self):
        from apps.credits.models import Credit
        from apps.recurring.models import RecurringTransaction
        import datetime
        credit = Credit.objects.create(
            user=self.user, name='Prêt Auto', credit_type='auto',
            initial_capital=10000, remaining_capital=8000, interest_rate=3,
            monthly_payment=350, insurance_monthly=0, duration_months=36,
            start_date=datetime.date(2024, 1, 5),
        )
        # Récurrence liée au crédit (cas qui causait le double comptage).
        RecurringTransaction.objects.create(
            user=self.user, account=self.account, name='Mensualité Prêt Auto',
            amount=350, transaction_type='expense', frequency='monthly',
            next_occurrence=datetime.date.today(), credit=credit,
        )
        resp = self.client.get('/api/dashboard/summary/')
        self.assertEqual(resp.status_code, 200)
        # La mensualité est comptée une seule fois, via le crédit.
        self.assertAlmostEqual(resp.data['total_monthly_credits'], 350.0, places=1)
        # La récurrence liée n'alimente pas les charges fixes.
        self.assertAlmostEqual(resp.data['total_recurring_expenses'], 0.0, places=1)

    def test_standalone_recurring_still_counted(self):
        from apps.recurring.models import RecurringTransaction
        import datetime
        RecurringTransaction.objects.create(
            user=self.user, account=self.account, name='Loyer',
            amount=800, transaction_type='expense', frequency='monthly',
            next_occurrence=datetime.date.today(),
        )
        resp = self.client.get('/api/dashboard/summary/')
        self.assertEqual(resp.status_code, 200)
        self.assertAlmostEqual(resp.data['total_recurring_expenses'], 800.0, places=1)


class DashboardExcludeFromTotalTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('excludeuser', password='p')
        self.client.force_authenticate(user=self.user)
        self.main = Account.objects.create(
            user=self.user, name='CC', account_type='checking', initial_balance=1000,
        )
        self.child = Account.objects.create(
            user=self.user, name='Compte Enfant', account_type='savings',
            initial_balance=5000, exclude_from_total=True,
        )

    def test_excluded_account_not_in_total(self):
        resp = self.client.get('/api/dashboard/summary/')
        self.assertEqual(resp.status_code, 200)
        # Seul le compte courant (1000) compte, pas l'enfant (5000).
        self.assertAlmostEqual(resp.data['total_balance'], 1000.0, places=1)
        account_names = [a['name'] for a in resp.data['accounts']]
        self.assertNotIn('Compte Enfant', account_names)

    def test_excluded_account_not_in_projection_balance(self):
        from apps.projections.engine import build_engine_from_user
        engine = build_engine_from_user(self.user)
        self.assertAlmostEqual(float(engine.current_balance), 1000.0, places=1)


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


class DashboardCycleStartDayTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('cycleuser', password='p')
        self.client.force_authenticate(user=self.user)
        self.account = Account.objects.create(
            user=self.user, name='CC', account_type='checking', initial_balance=1000,
        )

    def test_month_income_excludes_transaction_before_cycle_start(self):
        from apps.preferences.cycle import get_cycle_start
        from apps.preferences.models import UserPreference
        from apps.transactions.models import Transaction
        from datetime import date, timedelta
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
        resp = self.client.get('/api/dashboard/history/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 12)
        for entry in resp.data:
            self.assertNotIn('→', entry['month'])

    def test_balance_history_custom_cycle_label_has_arrow(self):
        from apps.preferences.models import UserPreference
        UserPreference.objects.create(user=self.user, cycle_start_day=25)
        resp = self.client.get('/api/dashboard/history/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 12)
        for entry in resp.data:
            self.assertIn('→', entry['month'])

    def test_balance_history_returns_12_entries(self):
        from apps.preferences.models import UserPreference
        UserPreference.objects.create(user=self.user, cycle_start_day=25)
        resp = self.client.get('/api/dashboard/history/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 12)
