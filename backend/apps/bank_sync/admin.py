from django.contrib import admin
from .models import BankAccount, BankRequisition, GoCardlessToken, SyncLog

admin.site.register(GoCardlessToken)
admin.site.register(BankRequisition)
admin.site.register(BankAccount)
admin.site.register(SyncLog)
