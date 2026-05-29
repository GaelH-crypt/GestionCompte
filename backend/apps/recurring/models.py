from django.db import models
from django.contrib.auth.models import User
from apps.accounts.models import Account
from apps.categories.models import Category


class RecurringTransaction(models.Model):
    FREQUENCIES = [
        ('weekly', 'Hebdomadaire'),
        ('monthly', 'Mensuelle'),
        ('yearly', 'Annuelle'),
    ]
    TRANSACTION_TYPES = [
        ('income', 'Revenu'),
        ('expense', 'Dépense'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='recurring_transactions')
    name = models.CharField(max_length=100)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES, default='expense')
    frequency = models.CharField(max_length=20, choices=FREQUENCIES, default='monthly')
    next_occurrence = models.DateField()
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True)
    account = models.ForeignKey(Account, on_delete=models.CASCADE)
    credit = models.ForeignKey(
        'credits.Credit',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recurring_transactions',
    )
    is_active = models.BooleanField(default=True)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['next_occurrence']

    def __str__(self):
        return self.name
