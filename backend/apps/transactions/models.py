from django.db import models
from django.contrib.auth.models import User
from apps.accounts.models import Account
from apps.categories.models import Category


class Transaction(models.Model):
    TRANSACTION_TYPES = [
        ('income', 'Revenu'),
        ('expense', 'Dépense'),
        ('transfer', 'Virement'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='transactions')
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='transactions')
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True)
    description = models.CharField(max_length=255)
    date = models.DateField()
    is_recurring = models.BooleanField(default=False)
    note = models.TextField(blank=True)
    tags = models.JSONField(default=list, blank=True)
    transfer_to_account = models.ForeignKey(
        Account, on_delete=models.SET_NULL, null=True, blank=True, related_name='incoming_transfers'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.description} ({self.amount})"
