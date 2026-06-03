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


from decimal import Decimal
from datetime import date


class LinkRecurringViewTest(TestCase):
    def setUp(self):
        from apps.accounts.models import Account
        from apps.recurring.models import RecurringTransaction
        from apps.transactions.models import Transaction

        self.client = APIClient()
        self.user = User.objects.create_user(username='u', password='pw')
        self.client.force_authenticate(self.user)

        self.account = Account.objects.create(
            user=self.user, name='CCP', account_type='checking', initial_balance=Decimal('0'),
        )
        self.rt = RecurringTransaction.objects.create(
            user=self.user, account=self.account, name='Loyer',
            amount=Decimal('915'), transaction_type='expense',
            frequency='monthly', next_occurrence=date(2026, 5, 2),
        )
        self.tx = Transaction.objects.create(
            user=self.user, account=self.account, transaction_type='expense',
            amount=Decimal('915'), description='Loyer juin', date=date(2026, 6, 1),
        )

    def _url(self, tx_id):
        return f'/api/transactions/{tx_id}/link-recurring/'

    def test_link_sets_fk_and_advances_next_occurrence(self):
        resp = self.client.post(self._url(self.tx.id), {'recurring_id': self.rt.id}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.tx.refresh_from_db()
        self.rt.refresh_from_db()
        self.assertEqual(self.tx.recurring_transaction_id, self.rt.id)
        # tx.date (2026-06-01) + 1 month = 2026-07-01
        self.assertEqual(self.rt.next_occurrence, date(2026, 7, 1))

    def test_link_null_removes_fk(self):
        self.tx.recurring_transaction = self.rt
        self.tx.save()
        resp = self.client.post(self._url(self.tx.id), {'recurring_id': None}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.tx.refresh_from_db()
        self.assertIsNone(self.tx.recurring_transaction_id)

    def test_type_mismatch_returns_400(self):
        from apps.recurring.models import RecurringTransaction
        rt_income = RecurringTransaction.objects.create(
            user=self.user, account=self.account, name='Salaire',
            amount=Decimal('2000'), transaction_type='income',
            frequency='monthly', next_occurrence=date(2026, 6, 27),
        )
        resp = self.client.post(self._url(self.tx.id), {'recurring_id': rt_income.id}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_link_other_user_recurring_returns_404(self):
        other = User.objects.create_user(username='other', password='pw')
        from apps.accounts.models import Account
        from apps.recurring.models import RecurringTransaction
        other_account = Account.objects.create(
            user=other, name='Autre', account_type='checking', initial_balance=Decimal('0'),
        )
        other_rt = RecurringTransaction.objects.create(
            user=other, account=other_account, name='Loyer autre',
            amount=Decimal('500'), transaction_type='expense',
            frequency='monthly', next_occurrence=date(2026, 6, 1),
        )
        resp = self.client.post(self._url(self.tx.id), {'recurring_id': other_rt.id}, format='json')
        self.assertEqual(resp.status_code, 404)

    def test_next_occurrence_not_advanced_when_tx_before_next_occ(self):
        from apps.recurring.models import RecurringTransaction
        rt = RecurringTransaction.objects.create(
            user=self.user, account=self.account, name='Futur',
            amount=Decimal('200'), transaction_type='expense',
            frequency='monthly', next_occurrence=date(2026, 7, 1),
        )
        from apps.transactions.models import Transaction
        tx_early = Transaction.objects.create(
            user=self.user, account=self.account, transaction_type='expense',
            amount=Decimal('200'), description='Paiement anticipé', date=date(2026, 6, 15),
        )
        resp = self.client.post(self._url(tx_early.id), {'recurring_id': rt.id}, format='json')
        self.assertEqual(resp.status_code, 200)
        rt.refresh_from_db()
        # tx.date (2026-06-15) < rt.next_occurrence (2026-07-01) → no advance
        self.assertEqual(rt.next_occurrence, date(2026, 7, 1))


class AnalyseViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('analyseuser', password='pass')
        self.client.force_authenticate(user=self.user)
        self.account = Account.objects.create(
            user=self.user, name='Main', account_type='checking',
            initial_balance=0, color='#fff', icon='CreditCard'
        )
        from apps.categories.models import Category
        self.cat = Category.objects.create(
            user=self.user, name='Alimentation', color='#f00', icon='ShoppingCart'
        )

    def _tx(self, description, amount, tx_type, date_str, category=None):
        from apps.transactions.models import Transaction
        return Transaction.objects.create(
            user=self.user, account=self.account,
            transaction_type=tx_type, amount=amount,
            description=description, date=date_str,
            category=category,
        )

    def test_analyse_returns_summary_and_transactions(self):
        self._tx('Lidl', '32.50', 'expense', '2026-06-01', self.cat)
        self._tx('Lidl 2', '15.00', 'expense', '2026-06-03', self.cat)
        resp = self.client.get('/api/transactions/analyse/', {
            'date_from': '2026-06-01', 'date_to': '2026-06-03'
        })
        self.assertEqual(resp.status_code, 200)
        self.assertIn('summary', resp.data)
        self.assertIn('transactions', resp.data)
        self.assertEqual(len(resp.data['summary']), 1)
        self.assertEqual(resp.data['summary'][0]['category_name'], 'Alimentation')
        self.assertEqual(resp.data['summary'][0]['count'], 2)
        self.assertEqual(len(resp.data['transactions']), 2)

    def test_analyse_filters_by_type(self):
        self._tx('Salaire', '2000.00', 'income', '2026-06-01')
        self._tx('Loyer', '800.00', 'expense', '2026-06-01')
        resp = self.client.get('/api/transactions/analyse/', {'transaction_type': 'income'})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['transactions']), 1)
        self.assertEqual(resp.data['transactions'][0]['description'], 'Salaire')

    def test_analyse_no_auth(self):
        unauthenticated = APIClient()
        resp = unauthenticated.get('/api/transactions/analyse/')
        self.assertEqual(resp.status_code, 401)

    def test_analyse_groups_uncategorised(self):
        self._tx('Divers', '10.00', 'expense', '2026-06-01', None)
        resp = self.client.get('/api/transactions/analyse/')
        self.assertEqual(resp.status_code, 200)
        names = [row['category_name'] for row in resp.data['summary']]
        self.assertIn('Sans catégorie', names)
