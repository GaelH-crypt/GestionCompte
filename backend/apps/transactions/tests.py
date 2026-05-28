from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from apps.accounts.models import Account


class TransactionAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('testuser', password='testpass')
        self.client.force_authenticate(user=self.user)
        self.account = Account.objects.create(
            user=self.user, name='Main', account_type='checking',
            initial_balance=1000, color='#fff', icon='CreditCard'
        )

    def test_create_expense(self):
        resp = self.client.post('/api/transactions/', {
            'account': self.account.id, 'transaction_type': 'expense',
            'amount': '50.00', 'description': 'Courses', 'date': '2026-05-01'
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_filter_by_type(self):
        from apps.transactions.models import Transaction
        Transaction.objects.create(user=self.user, account=self.account,
            transaction_type='expense', amount=50, description='A', date='2026-05-01')
        Transaction.objects.create(user=self.user, account=self.account,
            transaction_type='income', amount=2000, description='B', date='2026-05-01')
        resp = self.client.get('/api/transactions/?transaction_type=expense')
        self.assertEqual(len(resp.data['results']), 1)

    def test_negative_amount_rejected(self):
        resp = self.client.post('/api/transactions/', {
            'account': self.account.id, 'transaction_type': 'expense',
            'amount': '-10.00', 'description': 'Bad', 'date': '2026-05-01'
        })
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
