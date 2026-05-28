from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status


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
