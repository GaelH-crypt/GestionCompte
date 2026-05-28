from django.db import models
from django.contrib.auth.models import User


class Account(models.Model):
    ACCOUNT_TYPES = [
        ('checking', 'Courant'),
        ('savings', 'Épargne'),
        ('cash', 'Espèces'),
        ('other', 'Autre'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='accounts')
    name = models.CharField(max_length=100)
    account_type = models.CharField(max_length=20, choices=ACCOUNT_TYPES, default='checking')
    initial_balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    color = models.CharField(max_length=7, default='#6366f1')
    icon = models.CharField(max_length=50, default='CreditCard')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name
