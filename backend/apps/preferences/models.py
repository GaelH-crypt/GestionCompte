from django.contrib.auth.models import User
from django.db import models


class UserPreference(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='preference')
    primary_account = models.ForeignKey(
        'accounts.Account',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='+',
    )

    def __str__(self):
        return f'Prefs({self.user})'
