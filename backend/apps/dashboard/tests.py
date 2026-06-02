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
