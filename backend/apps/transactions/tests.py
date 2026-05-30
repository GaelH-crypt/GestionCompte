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


from datetime import date as dt
from apps.transactions.detection import detect_recurring_suggestions


class DetectRecurringTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('detectuser', password='pass')
        self.account = Account.objects.create(
            user=self.user, name='Main', account_type='checking',
            initial_balance=0, color='#fff', icon='CreditCard'
        )

    def _tx(self, description, amount, tx_type, date_str):
        from apps.transactions.models import Transaction
        return Transaction.objects.create(
            user=self.user, account=self.account,
            transaction_type=tx_type, amount=amount,
            description=description, date=date_str,
        )

    def test_monthly_pattern_detected(self):
        for d in ['2026-01-15', '2026-02-15', '2026-03-15']:
            self._tx('PRLV SEPA ORANGE SA ABONNEMENT', '24.99', 'expense', d)
        suggestions = detect_recurring_suggestions(self.user)
        self.assertEqual(len(suggestions), 1)
        self.assertEqual(suggestions[0]['frequency'], 'monthly')
        self.assertEqual(suggestions[0]['occurrence_count'], 3)
        self.assertEqual(suggestions[0]['transaction_type'], 'expense')

    def test_weekly_pattern_detected(self):
        for d in ['2026-01-07', '2026-01-14', '2026-01-21']:
            self._tx('COURSES LIDL', '45.00', 'expense', d)
        suggestions = detect_recurring_suggestions(self.user)
        self.assertEqual(len(suggestions), 1)
        self.assertEqual(suggestions[0]['frequency'], 'weekly')

    def test_irregular_interval_excluded(self):
        # 50-day interval — no frequency match
        self._tx('RANDOM CHARGE', '50.00', 'expense', '2026-01-01')
        self._tx('RANDOM CHARGE', '50.00', 'expense', '2026-02-20')
        suggestions = detect_recurring_suggestions(self.user)
        self.assertEqual(len(suggestions), 0)

    def test_single_occurrence_excluded(self):
        self._tx('ONLY ONCE', '10.00', 'expense', '2026-01-15')
        suggestions = detect_recurring_suggestions(self.user)
        self.assertEqual(len(suggestions), 0)

    def test_already_covered_excluded(self):
        from apps.recurring.models import RecurringTransaction
        RecurringTransaction.objects.create(
            user=self.user, account=self.account, name='Orange',
            amount='24.99', transaction_type='expense',
            frequency='monthly', next_occurrence='2026-06-15',
        )
        for d in ['2026-01-15', '2026-02-15', '2026-03-15']:
            self._tx('PRLV SEPA ORANGE SA', '24.99', 'expense', d)
        suggestions = detect_recurring_suggestions(self.user)
        self.assertEqual(len(suggestions), 0)

    def test_variable_description_groups_together(self):
        # Trailing reference numbers should not prevent grouping
        self._tx('VIR SALAIRE ENTREPRISE REF20260115', '2000.00', 'income', '2026-01-15')
        self._tx('VIR SALAIRE ENTREPRISE REF20260215', '2000.00', 'income', '2026-02-15')
        self._tx('VIR SALAIRE ENTREPRISE REF20260315', '2000.00', 'income', '2026-03-15')
        suggestions = detect_recurring_suggestions(self.user)
        self.assertEqual(len(suggestions), 1)
        self.assertEqual(suggestions[0]['frequency'], 'monthly')

    def test_transfer_type_excluded(self):
        for d in ['2026-01-15', '2026-02-15', '2026-03-15']:
            self._tx('VIR INTERNE', '500.00', 'transfer', d)
        suggestions = detect_recurring_suggestions(self.user)
        self.assertEqual(len(suggestions), 0)

    def test_sorted_by_occurrence_count(self):
        for d in ['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15']:
            self._tx('FREQUENT CHARGE', '10.00', 'expense', d)
        for d in ['2026-01-20', '2026-02-20', '2026-03-20']:
            self._tx('LESS FREQUENT', '20.00', 'expense', d)
        suggestions = detect_recurring_suggestions(self.user)
        self.assertGreaterEqual(suggestions[0]['occurrence_count'], suggestions[1]['occurrence_count'])


class DetectRecurringEndpointTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('endpointuser', password='pass')
        self.client.force_authenticate(user=self.user)
        self.account = Account.objects.create(
            user=self.user, name='Main', account_type='checking',
            initial_balance=0, color='#fff', icon='CreditCard'
        )

    def _tx(self, description, amount, tx_type, date_str):
        from apps.transactions.models import Transaction
        return Transaction.objects.create(
            user=self.user, account=self.account,
            transaction_type=tx_type, amount=amount,
            description=description, date=date_str,
        )

    def test_endpoint_returns_suggestions(self):
        for d in ['2026-01-15', '2026-02-15', '2026-03-15']:
            self._tx('PRLV SEPA ORANGE', '24.99', 'expense', d)
        resp = self.client.get('/api/transactions/detect-recurring/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['frequency'], 'monthly')

    def test_endpoint_requires_authentication(self):
        unauth = APIClient()
        resp = unauth.get('/api/transactions/detect-recurring/')
        self.assertEqual(resp.status_code, 401)

    def test_endpoint_isolates_by_user(self):
        other = User.objects.create_user('otheruser2', password='pass')
        other_account = Account.objects.create(
            user=other, name='Other', account_type='checking',
            initial_balance=0, color='#fff', icon='CreditCard'
        )
        from apps.transactions.models import Transaction
        for d in ['2026-01-15', '2026-02-15', '2026-03-15']:
            Transaction.objects.create(
                user=other, account=other_account,
                transaction_type='expense', amount='99.99',
                description='OTHER USER TX', date=d,
            )
        resp = self.client.get('/api/transactions/detect-recurring/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 0)
