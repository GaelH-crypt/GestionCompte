from django.db import models
from django.contrib.auth.models import User


class Category(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='categories')
    name = models.CharField(max_length=100)
    color = models.CharField(max_length=7, default='#6366f1')
    icon = models.CharField(max_length=50, default='Tag')
    parent = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='subcategories')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        unique_together = ('user', 'name', 'parent')

    def __str__(self):
        return self.name


class CategoryRule(models.Model):
    MATCH_CHOICES = [
        ('contains',    'Contient'),
        ('starts_with', 'Commence par'),
        ('exact',       'Exact'),
    ]
    user       = models.ForeignKey(User, on_delete=models.CASCADE, related_name='category_rules')
    pattern    = models.CharField(max_length=200)
    match_type = models.CharField(max_length=20, choices=MATCH_CHOICES, default='contains')
    category   = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='rules')
    order      = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'created_at']
        unique_together = ('user', 'pattern', 'match_type')

    def __str__(self):
        return f'{self.pattern} ({self.match_type}) → {self.category}'
