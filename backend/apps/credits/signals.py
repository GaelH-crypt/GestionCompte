from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import Credit
from .services import sync_recurring_transaction


@receiver(post_save, sender=Credit)
def on_credit_save(sender, instance, **kwargs):
    sync_recurring_transaction(instance)


@receiver(post_delete, sender=Credit)
def on_credit_delete(sender, instance, **kwargs):
    from apps.recurring.models import RecurringTransaction
    RecurringTransaction.objects.filter(credit=instance).delete()
