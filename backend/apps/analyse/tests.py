import datetime
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import Account
from apps.categories.models import Category
from apps.transactions.models import Transaction


BASE_URL = '/api/analyse/rapport/'


def _date(year, month, day):
    return datetime.date(year, month, day)


class RapportViewAuthTest(TestCase):
    """Authentication and basic access checks."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('analyseuser', password='p')
        self.client.force_authenticate(user=self.user)
        self.account = Account.objects.create(
            user=self.user, name='CC', account_type='checking', initial_balance=0,
        )

    def test_200_with_valid_params(self):
        resp = self.client.get(BASE_URL, {'date_from': '2024-01-01', 'date_to': '2024-01-31'})
        self.assertEqual(resp.status_code, 200)

    def test_401_unauthenticated(self):
        anon = APIClient()
        resp = anon.get(BASE_URL, {'date_from': '2024-01-01', 'date_to': '2024-01-31'})
        self.assertEqual(resp.status_code, 401)


class RapportViewValidationTest(TestCase):
    """Input validation returns 400 on bad params."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('analyseuser2', password='p')
        self.client.force_authenticate(user=self.user)

    def test_400_if_date_from_missing(self):
        resp = self.client.get(BASE_URL, {'date_to': '2024-01-31'})
        self.assertEqual(resp.status_code, 400)

    def test_400_if_date_to_missing(self):
        resp = self.client.get(BASE_URL, {'date_from': '2024-01-01'})
        self.assertEqual(resp.status_code, 400)

    def test_400_if_both_dates_missing(self):
        resp = self.client.get(BASE_URL)
        self.assertEqual(resp.status_code, 400)

    def test_400_if_date_from_invalid(self):
        resp = self.client.get(BASE_URL, {'date_from': 'not-a-date', 'date_to': '2024-01-31'})
        self.assertEqual(resp.status_code, 400)

    def test_400_if_date_to_invalid(self):
        resp = self.client.get(BASE_URL, {'date_from': '2024-01-01', 'date_to': 'bad'})
        self.assertEqual(resp.status_code, 400)


class RapportViewEmptyPeriodTest(TestCase):
    """KPIs are zero when there are no transactions."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('analyseuser3', password='p')
        self.client.force_authenticate(user=self.user)

    def test_kpis_zero_for_empty_period(self):
        resp = self.client.get(BASE_URL, {'date_from': '2024-01-01', 'date_to': '2024-01-31'})
        self.assertEqual(resp.status_code, 200)
        kpis = resp.data['kpis']
        self.assertEqual(kpis['total_income'], '0.00')
        self.assertEqual(kpis['total_expenses'], '0.00')
        self.assertEqual(kpis['net'], '0.00')
        self.assertEqual(kpis['savings_rate'], 0)
        self.assertEqual(kpis['avg_daily_expense'], '0.00')
        self.assertEqual(kpis['fixed_ratio'], 0)
        self.assertEqual(kpis['variable_ratio'], 1)

    def test_by_category_empty_for_empty_period(self):
        resp = self.client.get(BASE_URL, {'date_from': '2024-01-01', 'date_to': '2024-01-31'})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['by_category'], [])

    def test_monthly_trend_is_empty_list(self):
        resp = self.client.get(BASE_URL, {'date_from': '2024-01-01', 'date_to': '2024-01-31'})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['monthly_trend'], [])

    def test_comparison_is_null(self):
        resp = self.client.get(BASE_URL, {'date_from': '2024-01-01', 'date_to': '2024-01-31'})
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.data['comparison'])


class RapportViewKPITest(TestCase):
    """Core KPI calculation with real transactions."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('analyseuser4', password='p')
        self.client.force_authenticate(user=self.user)
        self.account = Account.objects.create(
            user=self.user, name='CC', account_type='checking', initial_balance=0,
        )
        # Create some transactions in January 2024
        Transaction.objects.create(
            user=self.user, account=self.account,
            transaction_type='income', amount='1500.00',
            date=_date(2024, 1, 5), description='Salaire',
        )
        Transaction.objects.create(
            user=self.user, account=self.account,
            transaction_type='expense', amount='300.00',
            date=_date(2024, 1, 10), description='Loyer',
        )
        Transaction.objects.create(
            user=self.user, account=self.account,
            transaction_type='expense', amount='200.00',
            date=_date(2024, 1, 20), description='Courses',
        )

    def test_total_income_correct(self):
        resp = self.client.get(BASE_URL, {'date_from': '2024-01-01', 'date_to': '2024-01-31'})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['kpis']['total_income'], '1500.00')

    def test_total_expenses_correct(self):
        resp = self.client.get(BASE_URL, {'date_from': '2024-01-01', 'date_to': '2024-01-31'})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['kpis']['total_expenses'], '500.00')

    def test_net_correct(self):
        resp = self.client.get(BASE_URL, {'date_from': '2024-01-01', 'date_to': '2024-01-31'})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['kpis']['net'], '1000.00')

    def test_savings_rate_correct(self):
        resp = self.client.get(BASE_URL, {'date_from': '2024-01-01', 'date_to': '2024-01-31'})
        self.assertEqual(resp.status_code, 200)
        # net=1000, income=1500 → 1000/1500 ≈ 0.6667
        self.assertAlmostEqual(resp.data['kpis']['savings_rate'], 0.6667, places=4)

    def test_savings_rate_zero_when_income_is_zero(self):
        # Create a different user with only expenses
        user2 = User.objects.create_user('analyseuser4b', password='p')
        client2 = APIClient()
        client2.force_authenticate(user=user2)
        account2 = Account.objects.create(
            user=user2, name='CC2', account_type='checking', initial_balance=0,
        )
        Transaction.objects.create(
            user=user2, account=account2,
            transaction_type='expense', amount='100.00',
            date=_date(2024, 1, 1), description='Dépense',
        )
        resp = client2.get(BASE_URL, {'date_from': '2024-01-01', 'date_to': '2024-01-31'})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['kpis']['savings_rate'], 0)

    def test_avg_daily_expense_correct(self):
        resp = self.client.get(BASE_URL, {'date_from': '2024-01-01', 'date_to': '2024-01-31'})
        self.assertEqual(resp.status_code, 200)
        # 500 / 31 ≈ 16.13
        avg = Decimal(resp.data['kpis']['avg_daily_expense'])
        self.assertAlmostEqual(float(avg), 500 / 31, places=2)

    def test_period_days_correct(self):
        resp = self.client.get(BASE_URL, {'date_from': '2024-01-01', 'date_to': '2024-01-31'})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['period']['days'], 31)

    def test_transfer_excluded_from_income_and_expenses(self):
        Transaction.objects.create(
            user=self.user, account=self.account,
            transaction_type='transfer', amount='500.00',
            date=_date(2024, 1, 15), description='Virement',
        )
        resp = self.client.get(BASE_URL, {'date_from': '2024-01-01', 'date_to': '2024-01-31'})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['kpis']['total_income'], '1500.00')
        self.assertEqual(resp.data['kpis']['total_expenses'], '500.00')


class RapportViewFixedRatioTest(TestCase):
    """fixed_ratio uses the recurring_transaction FK."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('analyseuser5', password='p')
        self.client.force_authenticate(user=self.user)
        self.account = Account.objects.create(
            user=self.user, name='CC', account_type='checking', initial_balance=0,
        )

    def _make_recurring(self):
        from apps.recurring.models import RecurringTransaction
        return RecurringTransaction.objects.create(
            user=self.user,
            account=self.account,
            name='Loyer',
            amount=Decimal('600.00'),
            transaction_type='expense',
            frequency='monthly',
            next_occurrence=_date(2024, 2, 1),
        )

    def test_fixed_ratio_with_recurring_transaction(self):
        recurring = self._make_recurring()
        # Fixed expense (linked to recurring)
        Transaction.objects.create(
            user=self.user, account=self.account,
            transaction_type='expense', amount='600.00',
            date=_date(2024, 1, 1), description='Loyer',
            recurring_transaction=recurring,
        )
        # Variable expense (no recurring link)
        Transaction.objects.create(
            user=self.user, account=self.account,
            transaction_type='expense', amount='400.00',
            date=_date(2024, 1, 15), description='Courses',
        )
        resp = self.client.get(BASE_URL, {'date_from': '2024-01-01', 'date_to': '2024-01-31'})
        self.assertEqual(resp.status_code, 200)
        kpis = resp.data['kpis']
        # total_expenses = 1000, fixed = 600 → fixed_ratio = 0.6
        self.assertAlmostEqual(kpis['fixed_ratio'], 0.6, places=4)
        self.assertAlmostEqual(kpis['variable_ratio'], 0.4, places=4)

    def test_all_variable_when_no_recurring(self):
        Transaction.objects.create(
            user=self.user, account=self.account,
            transaction_type='expense', amount='300.00',
            date=_date(2024, 1, 5), description='Variable',
        )
        resp = self.client.get(BASE_URL, {'date_from': '2024-01-01', 'date_to': '2024-01-31'})
        self.assertEqual(resp.status_code, 200)
        kpis = resp.data['kpis']
        self.assertEqual(kpis['fixed_ratio'], 0)
        self.assertEqual(kpis['variable_ratio'], 1)


class RapportViewByCategoryTest(TestCase):
    """by_category groups expenses correctly."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('analyseuser6', password='p')
        self.client.force_authenticate(user=self.user)
        self.account = Account.objects.create(
            user=self.user, name='CC', account_type='checking', initial_balance=0,
        )
        self.cat_food = Category.objects.create(
            user=self.user, name='Alimentation', color='#FF6384',
        )
        self.cat_transport = Category.objects.create(
            user=self.user, name='Transport', color='#36A2EB',
        )

    def test_by_category_groups_correctly(self):
        Transaction.objects.create(
            user=self.user, account=self.account,
            transaction_type='expense', amount='100.00',
            date=_date(2024, 1, 5), description='Supermarché',
            category=self.cat_food,
        )
        Transaction.objects.create(
            user=self.user, account=self.account,
            transaction_type='expense', amount='50.00',
            date=_date(2024, 1, 10), description='Épicerie',
            category=self.cat_food,
        )
        Transaction.objects.create(
            user=self.user, account=self.account,
            transaction_type='expense', amount='30.00',
            date=_date(2024, 1, 15), description='Metro',
            category=self.cat_transport,
        )

        resp = self.client.get(BASE_URL, {'date_from': '2024-01-01', 'date_to': '2024-01-31'})
        self.assertEqual(resp.status_code, 200)

        by_cat = resp.data['by_category']
        # Should have 2 categories, sorted by total desc: Alimentation (150) then Transport (30)
        self.assertEqual(len(by_cat), 2)
        self.assertEqual(by_cat[0]['category'], 'Alimentation')
        self.assertEqual(by_cat[0]['total'], '150.00')
        self.assertEqual(by_cat[0]['count'], 2)
        self.assertEqual(by_cat[1]['category'], 'Transport')
        self.assertEqual(by_cat[1]['total'], '30.00')

    def test_percentage_correct(self):
        Transaction.objects.create(
            user=self.user, account=self.account,
            transaction_type='expense', amount='200.00',
            date=_date(2024, 1, 5), description='A',
            category=self.cat_food,
        )
        Transaction.objects.create(
            user=self.user, account=self.account,
            transaction_type='expense', amount='800.00',
            date=_date(2024, 1, 10), description='B',
            category=self.cat_transport,
        )

        resp = self.client.get(BASE_URL, {'date_from': '2024-01-01', 'date_to': '2024-01-31'})
        self.assertEqual(resp.status_code, 200)

        by_cat = {row['category']: row for row in resp.data['by_category']}
        self.assertAlmostEqual(by_cat['Alimentation']['percentage'], 20.0, places=1)
        self.assertAlmostEqual(by_cat['Transport']['percentage'], 80.0, places=1)

    def test_sans_categorie_for_uncategorised_expenses(self):
        Transaction.objects.create(
            user=self.user, account=self.account,
            transaction_type='expense', amount='75.00',
            date=_date(2024, 1, 5), description='Divers',
            category=None,
        )

        resp = self.client.get(BASE_URL, {'date_from': '2024-01-01', 'date_to': '2024-01-31'})
        self.assertEqual(resp.status_code, 200)

        categories = [row['category'] for row in resp.data['by_category']]
        self.assertIn('Sans catégorie', categories)

    def test_income_excluded_from_by_category(self):
        Transaction.objects.create(
            user=self.user, account=self.account,
            transaction_type='income', amount='2000.00',
            date=_date(2024, 1, 1), description='Salaire',
            category=self.cat_food,
        )

        resp = self.client.get(BASE_URL, {'date_from': '2024-01-01', 'date_to': '2024-01-31'})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['by_category'], [])

    def test_vs_previous_is_null(self):
        Transaction.objects.create(
            user=self.user, account=self.account,
            transaction_type='expense', amount='100.00',
            date=_date(2024, 1, 5), description='X',
            category=self.cat_food,
        )

        resp = self.client.get(BASE_URL, {'date_from': '2024-01-01', 'date_to': '2024-01-31'})
        self.assertEqual(resp.status_code, 200)
        for row in resp.data['by_category']:
            self.assertIsNone(row['vs_previous'])


class RapportViewAccountFilterTest(TestCase):
    """account query param filters correctly."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('analyseuser7', password='p')
        self.client.force_authenticate(user=self.user)
        self.account1 = Account.objects.create(
            user=self.user, name='CC1', account_type='checking', initial_balance=0,
        )
        self.account2 = Account.objects.create(
            user=self.user, name='CC2', account_type='checking', initial_balance=0,
        )
        Transaction.objects.create(
            user=self.user, account=self.account1,
            transaction_type='income', amount='1000.00',
            date=_date(2024, 1, 5), description='A1 income',
        )
        Transaction.objects.create(
            user=self.user, account=self.account2,
            transaction_type='income', amount='500.00',
            date=_date(2024, 1, 5), description='A2 income',
        )

    def test_account_filter_restricts_transactions(self):
        resp = self.client.get(BASE_URL, {
            'date_from': '2024-01-01',
            'date_to': '2024-01-31',
            'account': self.account1.id,
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['kpis']['total_income'], '1000.00')

    def test_no_account_filter_shows_all(self):
        resp = self.client.get(BASE_URL, {
            'date_from': '2024-01-01',
            'date_to': '2024-01-31',
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['kpis']['total_income'], '1500.00')

    def test_user_isolation(self):
        """Transactions from another user are never visible."""
        other_user = User.objects.create_user('other_analyseuser', password='p')
        other_account = Account.objects.create(
            user=other_user, name='Other', account_type='checking', initial_balance=0,
        )
        Transaction.objects.create(
            user=other_user, account=other_account,
            transaction_type='income', amount='9999.00',
            date=_date(2024, 1, 5), description='Other income',
        )

        resp = self.client.get(BASE_URL, {'date_from': '2024-01-01', 'date_to': '2024-01-31'})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['kpis']['total_income'], '1500.00')


class RapportViewSimulatedTest(TestCase):
    """include_simulated adds extra_income and extra_expenses to totals."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('analyseuser8', password='p')
        self.client.force_authenticate(user=self.user)
        self.account = Account.objects.create(
            user=self.user, name='CC', account_type='checking', initial_balance=0,
        )
        Transaction.objects.create(
            user=self.user, account=self.account,
            transaction_type='income', amount='1000.00',
            date=_date(2024, 1, 5), description='Salaire',
        )
        Transaction.objects.create(
            user=self.user, account=self.account,
            transaction_type='expense', amount='400.00',
            date=_date(2024, 1, 10), description='Courses',
        )

    def test_simulated_adds_to_totals(self):
        resp = self.client.get(BASE_URL, {
            'date_from': '2024-01-01',
            'date_to': '2024-01-31',
            'include_simulated': 'true',
            'extra_income': '500.00',
            'extra_expenses': '200.00',
        })
        self.assertEqual(resp.status_code, 200)
        kpis = resp.data['kpis']
        self.assertEqual(kpis['total_income'], '1500.00')
        self.assertEqual(kpis['total_expenses'], '600.00')

    def test_simulated_false_ignores_extras(self):
        resp = self.client.get(BASE_URL, {
            'date_from': '2024-01-01',
            'date_to': '2024-01-31',
            'include_simulated': 'false',
            'extra_income': '500.00',
            'extra_expenses': '200.00',
        })
        self.assertEqual(resp.status_code, 200)
        kpis = resp.data['kpis']
        self.assertEqual(kpis['total_income'], '1000.00')
        self.assertEqual(kpis['total_expenses'], '400.00')
