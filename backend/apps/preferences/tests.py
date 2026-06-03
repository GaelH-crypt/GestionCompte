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

    def test_patch_rejects_non_checking_account(self):
        savings = Account.objects.create(
            user=self.user, name='Épargne', account_type='savings', initial_balance=5000,
        )
        resp = self.client.patch('/api/preferences/', {'primary_account': savings.id}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_patch_rejects_missing_primary_account_key(self):
        resp = self.client.patch('/api/preferences/', {}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_unauthenticated_returns_401(self):
        unauth = APIClient()
        resp = unauth.get('/api/preferences/')
        self.assertEqual(resp.status_code, 401)

    def test_get_returns_cycle_start_day_default(self):
        resp = self.client.get('/api/preferences/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['cycle_start_day'], 1)

    def test_patch_cycle_start_day_valid(self):
        resp = self.client.patch('/api/preferences/', {'cycle_start_day': 25}, format='json')
        self.assertEqual(resp.status_code, 200)
        pref = UserPreference.objects.get(user=self.user)
        self.assertEqual(pref.cycle_start_day, 25)

    def test_patch_cycle_start_day_too_low(self):
        resp = self.client.patch('/api/preferences/', {'cycle_start_day': 0}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_patch_cycle_start_day_too_high(self):
        resp = self.client.patch('/api/preferences/', {'cycle_start_day': 29}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_patch_cycle_start_day_max_valid(self):
        resp = self.client.patch('/api/preferences/', {'cycle_start_day': 28}, format='json')
        self.assertEqual(resp.status_code, 200)

    def test_patch_cycle_start_day_not_integer(self):
        resp = self.client.patch('/api/preferences/', {'cycle_start_day': 'abc'}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_patch_empty_body_still_400(self):
        resp = self.client.patch('/api/preferences/', {}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_patch_primary_account_alone_still_works(self):
        resp = self.client.patch('/api/preferences/', {'primary_account': self.account.id}, format='json')
        self.assertEqual(resp.status_code, 200)


from datetime import date as _date_class
from django.test import TestCase as _DjangoTestCase


class GetCycleStartTest(_DjangoTestCase):
    def _f(self, today, day):
        from apps.preferences.cycle import get_cycle_start
        return get_cycle_start(today, day)

    def test_day1_equals_first_of_month(self):
        self.assertEqual(self._f(_date_class(2026, 6, 3), 1), _date_class(2026, 6, 1))

    def test_day1_on_first(self):
        self.assertEqual(self._f(_date_class(2026, 6, 1), 1), _date_class(2026, 6, 1))

    def test_before_start_day_returns_prev_month(self):
        self.assertEqual(self._f(_date_class(2026, 6, 3), 25), _date_class(2026, 5, 25))

    def test_on_start_day_returns_current_month(self):
        self.assertEqual(self._f(_date_class(2026, 6, 25), 25), _date_class(2026, 6, 25))

    def test_after_start_day_returns_current_month(self):
        self.assertEqual(self._f(_date_class(2026, 6, 26), 25), _date_class(2026, 6, 25))

    def test_jan_before_start_wraps_to_dec(self):
        self.assertEqual(self._f(_date_class(2026, 1, 5), 25), _date_class(2025, 12, 25))

    def test_short_month_clamps_day(self):
        # Feb 2026 has 28 days; cycle_start_day=31 → clamped to 28
        self.assertEqual(self._f(_date_class(2026, 3, 1), 31), _date_class(2026, 2, 28))

    def test_leap_year_feb(self):
        # Feb 2024 has 29 days (leap); cycle_start_day=31 → clamped to 29
        self.assertEqual(self._f(_date_class(2024, 3, 1), 31), _date_class(2024, 2, 29))


class GetCycleStartNthAgoTest(_DjangoTestCase):
    def _f(self, today, day, n):
        from apps.preferences.cycle import get_cycle_start_nth_ago
        return get_cycle_start_nth_ago(today, day, n)

    def test_n0_is_current_cycle(self):
        self.assertEqual(self._f(_date_class(2026, 6, 3), 25, 0), _date_class(2026, 5, 25))

    def test_n1_is_previous_cycle(self):
        self.assertEqual(self._f(_date_class(2026, 6, 3), 25, 1), _date_class(2026, 4, 25))

    def test_n11_is_eleven_cycles_ago(self):
        self.assertEqual(self._f(_date_class(2026, 6, 3), 25, 11), _date_class(2025, 6, 25))

    def test_clamped_day_propagation_fixed(self):
        # cycle_start_day=31, today=2026-03-05
        # n=1 must return 2026-01-31 (January has 31 days), NOT 2026-01-28
        # (old bug: subtracted from clamped Feb-28 → Jan-28)
        self.assertEqual(self._f(_date_class(2026, 3, 5), 31, 1), _date_class(2026, 1, 31))
