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


from apps.credits.models import Credit
import datetime


class RecurringCreditLinkTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('credituser', password='testpass')
        self.client.force_authenticate(user=self.user)
        self.account = Account.objects.create(
            user=self.user, name='Main', account_type='checking',
            initial_balance=1000, color='#fff', icon='CreditCard'
        )
        self.credit = Credit.objects.create(
            user=self.user, name='Prêt immo', credit_type='mortgage',
            initial_capital='200000', remaining_capital='180000',
            interest_rate='1.5', monthly_payment='850', insurance_monthly='50',
            duration_months=240, start_date=datetime.date(2022, 1, 1),
            early_repayment_possible=True
        )

    def test_create_recurring_with_credit_returns_credit_name(self):
        resp = self.client.post('/api/recurring/', {
            'name': 'Mensualité prêt', 'amount': '900.00',
            'transaction_type': 'expense', 'frequency': 'monthly',
            'next_occurrence': '2026-06-01', 'account': self.account.id,
            'credit': self.credit.id,
        })
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['credit'], self.credit.id)
        self.assertEqual(resp.data['credit_name'], 'Prêt immo')

    def test_create_recurring_without_credit_returns_null(self):
        resp = self.client.post('/api/recurring/', {
            'name': 'Loyer', 'amount': '800.00',
            'transaction_type': 'expense', 'frequency': 'monthly',
            'next_occurrence': '2026-06-01', 'account': self.account.id,
        })
        self.assertEqual(resp.status_code, 201)
        self.assertIsNone(resp.data['credit'])
        self.assertIsNone(resp.data['credit_name'])
