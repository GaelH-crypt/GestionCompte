from decimal import Decimal
import datetime
from apps.transactions.models import Transaction


def filter_duplicates(candidates: list[dict], account_id: int) -> tuple[list[dict], int]:
    """
    Filtre les doublons parmi `candidates` par rapport aux transactions existantes.
    Critère : même account + même date + même amount + même description.
    Retourne (nouvelles_transactions, nb_doublons).
    """
    # Determine the earliest candidate date for a lower-bound filter
    min_date: datetime.date | None = None
    for tx in candidates:
        try:
            d = tx['date']
            if isinstance(d, str):
                d = datetime.date.fromisoformat(d)
            if min_date is None or d < min_date:
                min_date = d
        except (ValueError, KeyError, TypeError):
            pass

    qs = Transaction.objects.filter(account_id=account_id)
    if min_date is not None:
        qs = qs.filter(date__gte=min_date)

    # Build existing set with normalized types: (date string, Decimal, str)
    existing = set()
    for date_val, amount_val, desc in qs.values_list(
        'date', 'amount', 'description'
    ):
        if isinstance(date_val, datetime.date):
            date_str = date_val.strftime('%Y-%m-%d')
        else:
            date_str = str(date_val)
        existing.add((date_str, Decimal(str(amount_val)).quantize(Decimal('0.01')), desc))

    new_txs = []
    dup_count = 0
    for tx in candidates:
        key = (tx['date'], Decimal(str(tx['amount'])).quantize(Decimal('0.01')), tx['description'])
        if key in existing:
            dup_count += 1
        else:
            new_txs.append(tx)
    return new_txs, dup_count
