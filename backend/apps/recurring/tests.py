from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from apps.accounts.models import Account


class RecurringAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('testuser', password='testpass')
        self.client.force_authenticate(user=self.user)
        self.account = Account.objects.create(
            user=self.user, name='Main', account_type='checking',
            initial_balance=1000, color='#fff', icon='CreditCard'
        )

    def test_create_recurring(self):
        resp = self.client.post('/api/recurring/', {
            'name': 'Loyer', 'amount': '900.00', 'transaction_type': 'expense',
            'frequency': 'monthly', 'next_occurrence': '2026-06-01', 'account': self.account.id
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data['name'], 'Loyer')
