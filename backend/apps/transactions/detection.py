import re
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal
from statistics import median

from dateutil.relativedelta import relativedelta


def normalize_description(description: str) -> str:
    desc = description.lower()
    desc = re.sub(r'\d{4,}', '', desc)
    desc = re.sub(r'\s+', ' ', desc).strip()
    return desc[:40]


def detect_recurring_suggestions(user) -> list:
    from apps.transactions.models import Transaction
    from apps.recurring.models import RecurringTransaction

    rows = list(
        Transaction.objects
        .filter(user=user, transaction_type__in=['income', 'expense'])
        .values('description', 'amount', 'transaction_type', 'date', 'account_id')
    )

    covered = set(
        RecurringTransaction.objects
        .filter(user=user, is_active=True)
        .values_list('amount', 'transaction_type')
    )

    groups: dict = defaultdict(list)
    for row in rows:
        key = (
            normalize_description(row['description']),
            row['amount'],
            row['transaction_type'],
        )
        groups[key].append(row)

    suggestions = []
    for (norm_name, amount, tx_type), txs in groups.items():
        if len(txs) < 2:
            continue
        if (amount, tx_type) in covered:
            continue

        dates = sorted(tx['date'] for tx in txs)
        intervals = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
        if not intervals:
            continue

        med = median(intervals)

        if 5 <= med <= 10:
            frequency = 'weekly'
        elif 25 <= med <= 35:
            frequency = 'monthly'
        elif 340 <= med <= 390:
            frequency = 'yearly'
        else:
            continue

        last_date = dates[-1]
        if frequency == 'weekly':
            next_occ = last_date + timedelta(days=7)
        elif frequency == 'monthly':
            next_occ = last_date + relativedelta(months=1)
        else:
            next_occ = last_date + relativedelta(years=1)

        account_id = max(
            {tx['account_id'] for tx in txs},
            key=lambda a: sum(1 for tx in txs if tx['account_id'] == a),
        )

        suggestions.append({
            'name': norm_name.title(),
            'amount': str(amount),
            'transaction_type': tx_type,
            'frequency': frequency,
            'next_occurrence': next_occ.isoformat(),
            'occurrence_count': len(txs),
            'last_date': last_date.isoformat(),
            'account': account_id,
        })

    suggestions.sort(key=lambda s: s['occurrence_count'], reverse=True)
    return suggestions[:20]
