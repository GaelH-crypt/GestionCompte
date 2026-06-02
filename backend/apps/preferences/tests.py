from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient
from apps.accounts.models import Account
from apps.preferences.models import UserPreference


class PreferencesAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('prefuser', password='p')
        self.client.force_authenticate(user=self.user)
        self.account = Account.objects.create(
            user=self.user, name='CC Test', account_type='checking', initial_balance=1000,
        )

    def test_get_creates_preference_if_missing(self):
        self.assertFalse(UserPreference.objects.filter(user=self.user).exists())
        resp = self.client.get('/api/preferences/')
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.data['primary_account'])
        self.assertTrue(UserPreference.objects.filter(user=self.user).exists())

    def test_get_returns_configured_account(self):
        UserPreference.objects.create(user=self.user, primary_account=self.account)
        resp = self.client.get('/api/preferences/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['primary_account'], self.account.id)
        self.assertEqual(resp.data['primary_account_name'], 'CC Test')

    def test_patch_sets_primary_account(self):
        resp = self.client.patch('/api/preferences/', {'primary_account': self.account.id}, format='json')
        self.assertEqual(resp.status_code, 200)
        pref = UserPreference.objects.get(user=self.user)
        self.assertEqual(pref.primary_account_id, self.account.id)

    def test_patch_rejects_other_users_account(self):
        other = User.objects.create_user('other', password='p')
        other_account = Account.objects.create(
            user=other, name='Autre CC', account_type='checking', initial_balance=0,
        )
        resp = self.client.patch('/api/preferences/', {'primary_account': other_account.id}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_patch_sets_null(self):
        UserPreference.objects.create(user=self.user, primary_account=self.account)
        resp = self.client.patch('/api/preferences/', {'primary_account': None}, format='json')
        self.assertEqual(resp.status_code, 200)
        pref = UserPreference.objects.get(user=self.user)
        self.assertIsNone(pref.primary_account)

    def test_unauthenticated_returns_401(self):
        unauth = APIClient()
        resp = unauth.get('/api/preferences/')
        self.assertEqual(resp.status_code, 401)
