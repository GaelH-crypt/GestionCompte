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
