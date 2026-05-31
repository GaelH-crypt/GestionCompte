from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from .models import Category


class CategoryAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('testuser', password='testpass')
        self.client.force_authenticate(user=self.user)

    def test_create_category(self):
        resp = self.client.post('/api/categories/', {'name': 'Alimentation', 'color': '#22c55e', 'icon': 'ShoppingCart'})
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data['name'], 'Alimentation')

    def test_list_only_own_categories(self):
        other_user = User.objects.create_user('other', password='pass')
        Category.objects.create(user=other_user, name='Other cat', color='#fff', icon='Tag')
        Category.objects.create(user=self.user, name='My cat', color='#fff', icon='Tag')
        resp = self.client.get('/api/categories/')
        self.assertEqual(len(resp.data['results']), 1)
        self.assertEqual(resp.data['results'][0]['name'], 'My cat')

    def test_subcategories_nested(self):
        parent = Category.objects.create(user=self.user, name='Parent', color='#fff', icon='Tag')
        Category.objects.create(user=self.user, name='Child', color='#fff', icon='Tag', parent=parent)
        resp = self.client.get(f'/api/categories/{parent.id}/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data['subcategories']), 1)


class MatchRuleTest(TestCase):
    def test_contains_match(self):
        from apps.categories.rules import match_rule
        self.assertTrue(match_rule('TOTAL CARBURANT 75', 'carburant', 'contains'))

    def test_contains_no_match(self):
        from apps.categories.rules import match_rule
        self.assertFalse(match_rule('LOYER JANVIER', 'carburant', 'contains'))

    def test_starts_with_match(self):
        from apps.categories.rules import match_rule
        self.assertTrue(match_rule('VIR SEPA SALAIRE', 'vir sepa', 'starts_with'))

    def test_starts_with_no_match(self):
        from apps.categories.rules import match_rule
        self.assertFalse(match_rule('PAIEMENT VIR SEPA', 'vir sepa', 'starts_with'))

    def test_exact_match(self):
        from apps.categories.rules import match_rule
        self.assertTrue(match_rule('CARBURANT', 'carburant', 'exact'))

    def test_exact_no_match(self):
        from apps.categories.rules import match_rule
        self.assertFalse(match_rule('TOTAL CARBURANT', 'carburant', 'exact'))

    def test_case_insensitive(self):
        from apps.categories.rules import match_rule
        self.assertTrue(match_rule('Carburant Shell', 'CARBURANT', 'contains'))


class ApplyRulesTest(TestCase):
    def setUp(self):
        from apps.accounts.models import Account
        self.user = User.objects.create_user('ruleuser', password='pass')
        self.cat = Category.objects.create(user=self.user, name='Transport', color='#f00', icon='Tag')
        self.account = Account.objects.create(
            user=self.user, name='Compte', account_type='checking',
            initial_balance=0, color='#000', icon='CreditCard',
        )

    def _make_tx(self, description, category=None):
        from apps.transactions.models import Transaction
        return Transaction.objects.create(
            user=self.user,
            account=self.account,
            transaction_type='expense',
            amount='50.00',
            description=description,
            date='2026-05-01',
            category=category,
        )

    def test_apply_rules_categorizes_matching_transaction(self):
        from apps.categories.models import CategoryRule
        from apps.categories.rules import apply_rules
        from apps.transactions.models import Transaction
        CategoryRule.objects.create(
            user=self.user, pattern='CARBURANT', match_type='contains',
            category=self.cat, order=0,
        )
        tx = self._make_tx('TOTAL CARBURANT 75')
        count = apply_rules(self.user, Transaction.objects.filter(id=tx.id))
        self.assertEqual(count, 1)
        tx.refresh_from_db()
        self.assertEqual(tx.category, self.cat)

    def test_apply_rules_skips_already_categorized(self):
        from apps.categories.models import CategoryRule
        from apps.categories.rules import apply_rules
        from apps.transactions.models import Transaction
        other_cat = Category.objects.create(user=self.user, name='Autre', color='#0f0', icon='Tag')
        CategoryRule.objects.create(
            user=self.user, pattern='CARBURANT', match_type='contains',
            category=self.cat, order=0,
        )
        tx = self._make_tx('TOTAL CARBURANT 75', category=other_cat)
        count = apply_rules(self.user, Transaction.objects.filter(id=tx.id))
        self.assertEqual(count, 0)
        tx.refresh_from_db()
        self.assertEqual(tx.category, other_cat)

    def test_apply_rules_returns_zero_when_no_match_and_no_static(self):
        from apps.categories.rules import apply_rules
        from apps.transactions.models import Transaction
        tx = self._make_tx('XYZABCDEF INCONNU')
        count = apply_rules(self.user, Transaction.objects.filter(id=tx.id))
        self.assertEqual(count, 0)
        tx.refresh_from_db()
        self.assertIsNone(tx.category)


class CategoryRuleAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('ruleapi', password='pass')
        self.client.force_authenticate(user=self.user)
        self.cat = Category.objects.create(user=self.user, name='Transport', color='#f00', icon='Tag')

    def test_create_rule(self):
        resp = self.client.post('/api/categories/rules/', {
            'pattern': 'CARBURANT',
            'match_type': 'contains',
            'category': self.cat.id,
            'order': 0,
        })
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['pattern'], 'CARBURANT')
        self.assertEqual(resp.data['category_name'], 'Transport')

    def test_list_rules_own_only(self):
        other = User.objects.create_user('other2', password='pass')
        other_cat = Category.objects.create(user=other, name='Other', color='#fff', icon='Tag')
        from apps.categories.models import CategoryRule
        CategoryRule.objects.create(user=other, pattern='XXX', match_type='contains', category=other_cat, order=0)
        CategoryRule.objects.create(user=self.user, pattern='YYY', match_type='contains', category=self.cat, order=0)
        resp = self.client.get('/api/categories/rules/')
        self.assertEqual(resp.status_code, 200)
        patterns = [r['pattern'] for r in resp.data]
        self.assertIn('YYY', patterns)
        self.assertNotIn('XXX', patterns)

    def test_delete_rule(self):
        from apps.categories.models import CategoryRule
        rule = CategoryRule.objects.create(user=self.user, pattern='DEL', match_type='exact', category=self.cat, order=0)
        resp = self.client.delete(f'/api/categories/rules/{rule.id}/')
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(CategoryRule.objects.filter(id=rule.id).exists())

    def test_apply_endpoint(self):
        from apps.accounts.models import Account
        from apps.transactions.models import Transaction
        from apps.categories.models import CategoryRule
        acc = Account.objects.create(
            user=self.user, name='Compte', account_type='checking',
            initial_balance=0, color='#000', icon='CreditCard',
        )
        CategoryRule.objects.create(user=self.user, pattern='SHELL', match_type='contains', category=self.cat, order=0)
        tx = Transaction.objects.create(
            user=self.user, account=acc, transaction_type='expense',
            amount='30.00', description='SHELL STATION', date='2026-05-01',
        )
        resp = self.client.post('/api/categories/rules/apply/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['applied'], 1)
        tx.refresh_from_db()
        self.assertEqual(tx.category, self.cat)
