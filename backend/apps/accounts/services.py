from decimal import Decimal
from django.db.models import Sum, Q


def get_account_balance(account, user=None) -> Decimal:
    """Compute current balance = initial_balance + incomes - expenses - transfer_out + transfer_in."""
    if user is not None and account.user_id != user.id:
        raise PermissionError("Account does not belong to user")
    from apps.transactions.models import Transaction

    agg = Transaction.objects.filter(account=account).aggregate(
        income=Sum('amount', filter=Q(transaction_type='income')),
        expense=Sum('amount', filter=Q(transaction_type='expense')),
        transfer_out=Sum('amount', filter=Q(transaction_type='transfer')),
    )

    # Transfers into this account (from another account's perspective)
    transfer_in = Transaction.objects.filter(
        transfer_to_account=account, transaction_type='transfer'
    ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

    balance = account.initial_balance
    balance += agg['income'] or Decimal('0')
    balance -= agg['expense'] or Decimal('0')
    balance -= agg['transfer_out'] or Decimal('0')
    balance += transfer_in
    return balance
