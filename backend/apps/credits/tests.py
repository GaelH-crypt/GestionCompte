import datetime
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from apps.credits.models import Credit, CreditDraw


class CreditAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('testuser', password='testpass')
        self.client.force_authenticate(user=self.user)

    def test_create_credit(self):
        resp = self.client.post('/api/credits/', {
            'name': 'Crédit Auto', 'credit_type': 'auto',
            'initial_capital': '15000.00', 'remaining_capital': '12000.00',
            'interest_rate': '4.50', 'monthly_payment': '280.00',
            'insurance_monthly': '15.00', 'duration_months': 60,
            'start_date': '2024-01-01',
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIn('total_cost', resp.data)
        self.assertIn('remaining_months', resp.data)
        self.assertGreater(resp.data['remaining_months'], 0)

    def test_schedule_endpoint(self):
        credit_resp = self.client.post('/api/credits/', {
            'name': 'Test', 'credit_type': 'consumer',
            'initial_capital': '5000.00', 'remaining_capital': '4000.00',
            'interest_rate': '5.00', 'monthly_payment': '200.00',
            'insurance_monthly': '0.00', 'duration_months': 24, 'start_date': '2025-01-01',
        })
        cid = credit_resp.data['id']
        resp = self.client.get(f'/api/credits/{cid}/schedule/?months=3')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 3)


class RevolvingCreditTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('rev_user', password='p')
        self.client.force_authenticate(user=self.user)

    def _make_revolving(self):
        return Credit.objects.create(
            user=self.user,
            name='ETALIS',
            credit_type='revolving',
            max_amount='1000.00',
            start_date=datetime.date(2024, 1, 1),
        )

    def test_create_revolving_credit_via_api(self):
        resp = self.client.post('/api/credits/', {
            'name': 'ETALIS', 'credit_type': 'revolving',
            'max_amount': '1000.00', 'start_date': '2024-01-01',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data['credit_type'], 'revolving')
        self.assertEqual(resp.data['max_amount'], '1000.00')

    def test_create_draw_via_api(self):
        credit = self._make_revolving()
        resp = self.client.post(f'/api/credits/{credit.id}/draws/', {
            'amount': '300.00',
            'monthly_payment': '52.50',
            'duration_months': 6,
            'start_date': '2024-02-01',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data['amount'], '300.00')

    def test_revolving_serializer_exposes_draws_and_capacity(self):
        credit = self._make_revolving()
        CreditDraw.objects.create(
            credit=credit, amount='300.00', monthly_payment='52.50',
            duration_months=6, start_date=datetime.date(2024, 2, 1),
        )
        resp = self.client.get(f'/api/credits/{credit.id}/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data['draws']), 1)
        self.assertAlmostEqual(float(resp.data['available_capacity']), 700.0)

    def test_delete_draw(self):
        credit = self._make_revolving()
        draw = CreditDraw.objects.create(
            credit=credit, amount='300.00', monthly_payment='52.50',
            duration_months=6, start_date=datetime.date(2024, 2, 1),
        )
        resp = self.client.delete(f'/api/credits/{credit.id}/draws/{draw.id}/')
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)

    def test_create_draw_on_other_user_credit_returns_404(self):
        other_user = User.objects.create_user('other_rev', password='p')
        other_credit = Credit.objects.create(
            user=other_user, name='Other Revolving', credit_type='revolving',
            max_amount='500.00', start_date=datetime.date(2024, 1, 1),
        )
        resp = self.client.post(f'/api/credits/{other_credit.id}/draws/', {
            'amount': '100.00', 'monthly_payment': '20.00',
            'duration_months': 5, 'start_date': '2024-02-01',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_create_draw_exceeding_max_amount_rejected(self):
        credit = self._make_revolving()
        CreditDraw.objects.create(
            credit=credit, amount='800.00', monthly_payment='140.00',
            duration_months=6, start_date=datetime.date(2024, 2, 1),
        )
        resp = self.client.post(f'/api/credits/{credit.id}/draws/', {
            'amount': '300.00', 'monthly_payment': '52.50',
            'duration_months': 6, 'start_date': '2024-03-01',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('amount', resp.data)

    def test_revolving_total_monthly_charge_sums_active_draws(self):
        credit = self._make_revolving()
        CreditDraw.objects.create(
            credit=credit, amount='300.00', monthly_payment='52.50',
            duration_months=6, start_date=datetime.date(2024, 2, 1),
        )
        CreditDraw.objects.create(
            credit=credit, amount='200.00', monthly_payment='35.00',
            duration_months=6, start_date=datetime.date(2024, 3, 1),
        )
        resp = self.client.get(f'/api/credits/{credit.id}/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertAlmostEqual(float(resp.data['total_monthly_charge']), 87.50)


from apps.credits.services import sync_recurring_transaction
from apps.accounts.models import Account
from apps.recurring.models import RecurringTransaction
from decimal import Decimal


class SyncRecurringTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('syncuser', password='p')
        self.account = Account.objects.create(
            user=self.user, name='Compte courant', account_type='checking', initial_balance=0
        )

    def _make_credit(self, **kwargs):
        defaults = dict(
            user=self.user,
            name='Prêt auto',
            credit_type='auto',
            monthly_payment=300,
            insurance_monthly=20,
            start_date=datetime.date(2026, 6, 1),
            payment_day=5,
            payment_account=self.account,
        )
        defaults.update(kwargs)
        return Credit.objects.create(**defaults)

    def test_creates_recurring_on_eligible_credit(self):
        credit = self._make_credit()
        sync_recurring_transaction(credit)
        rt = RecurringTransaction.objects.get(credit=credit)
        self.assertEqual(rt.amount, 320)          # 300 + 20
        self.assertEqual(rt.frequency, 'monthly')
        self.assertEqual(rt.transaction_type, 'expense')
        self.assertEqual(rt.account, self.account)
        self.assertEqual(rt.name, 'Prêt auto')

    def test_next_occurrence_uses_payment_day(self):
        credit = self._make_credit(
            start_date=datetime.date(2026, 1, 1),
            payment_day=15,
        )
        sync_recurring_transaction(credit)
        rt = RecurringTransaction.objects.get(credit=credit)
        # next_occurrence doit être >= aujourd'hui et avoir day=15
        self.assertEqual(rt.next_occurrence.day, 15)
        self.assertGreaterEqual(rt.next_occurrence, datetime.date.today())

    def test_no_recurring_for_revolving(self):
        credit = self._make_credit(credit_type='revolving', monthly_payment=None)
        sync_recurring_transaction(credit)
        self.assertFalse(RecurringTransaction.objects.filter(credit=credit).exists())

    def test_no_recurring_without_payment_account(self):
        credit = self._make_credit(payment_account=None)
        sync_recurring_transaction(credit)
        self.assertFalse(RecurringTransaction.objects.filter(credit=credit).exists())

    def test_no_recurring_without_monthly_payment(self):
        credit = self._make_credit(monthly_payment=None)
        sync_recurring_transaction(credit)
        self.assertFalse(RecurringTransaction.objects.filter(credit=credit).exists())

    def test_update_existing_recurring(self):
        credit = self._make_credit()
        sync_recurring_transaction(credit)
        credit.monthly_payment = 350
        credit.save()
        sync_recurring_transaction(credit)
        rts = RecurringTransaction.objects.filter(credit=credit)
        self.assertEqual(rts.count(), 1)           # toujours 1 seul flux
        self.assertEqual(rts.first().amount, 370)  # 350 + 20

    def test_deletes_recurring_when_account_removed(self):
        credit = self._make_credit()
        sync_recurring_transaction(credit)
        self.assertTrue(RecurringTransaction.objects.filter(credit=credit).exists())
        credit.payment_account = None
        credit.save()
        sync_recurring_transaction(credit)
        self.assertFalse(RecurringTransaction.objects.filter(credit=credit).exists())
