from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from apps.accounts.models import Account


class AccountCreditFieldsTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('u', password='p')
        self.client.force_authenticate(user=self.user)

    def _make_account(self, **kwargs):
        defaults = {'name': 'Test', 'account_type': 'checking', 'initial_balance': 0}
        defaults.update(kwargs)
        return Account.objects.create(user=self.user, **defaults)

    def test_is_import_ignored_defaults_false(self):
        acc = self._make_account()
        self.assertFalse(acc.is_import_ignored)

    def test_account_type_credit_valid(self):
        acc = self._make_account(account_type='credit')
        self.assertEqual(acc.account_type, 'credit')

    def test_linked_credit_nullable(self):
        acc = self._make_account()
        self.assertIsNone(acc.linked_credit)

    def test_patch_is_import_ignored(self):
        acc = self._make_account()
        resp = self.client.patch(f'/api/accounts/{acc.id}/', {'is_import_ignored': True}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data['is_import_ignored'])

    def test_patch_account_type_credit(self):
        acc = self._make_account()
        resp = self.client.patch(f'/api/accounts/{acc.id}/', {'account_type': 'credit'}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['account_type'], 'credit')

    def test_patch_linked_credit_other_user_rejected(self):
        """Cannot link to a credit belonging to another user."""
        from apps.credits.models import Credit
        import datetime
        other_user = User.objects.create_user('other', password='p')
        other_credit = Credit.objects.create(
            user=other_user, name='Other Credit', credit_type='consumer',
            initial_capital='5000', remaining_capital='4000', interest_rate='3',
            monthly_payment='200', insurance_monthly='0', duration_months=24,
            start_date=datetime.date(2024, 1, 1),
        )
        acc = self._make_account()
        resp = self.client.patch(f'/api/accounts/{acc.id}/', {'linked_credit': other_credit.id}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class AccountAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('testuser', password='testpass')
        self.client.force_authenticate(user=self.user)

    def test_create_account(self):
        resp = self.client.post('/api/accounts/', {
            'name': 'Compte Courant', 'account_type': 'checking',
            'initial_balance': '1500.00', 'color': '#3b82f6', 'icon': 'CreditCard'
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertAlmostEqual(float(resp.data['current_balance']), 1500.0)

    def test_balance_with_transactions(self):
        from apps.transactions.models import Transaction
        account = Account.objects.create(
            user=self.user, name='Test', account_type='checking',
            initial_balance=1000, color='#fff', icon='CreditCard'
        )
        Transaction.objects.create(
            user=self.user, account=account, transaction_type='expense',
            amount=200, description='Test', date='2026-01-01'
        )
        resp = self.client.get(f'/api/accounts/{account.id}/')
        self.assertAlmostEqual(float(resp.data['current_balance']), 800.0)
