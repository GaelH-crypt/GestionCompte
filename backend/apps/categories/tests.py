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
