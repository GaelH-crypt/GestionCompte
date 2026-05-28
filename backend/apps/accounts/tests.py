from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from .models import Account


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
