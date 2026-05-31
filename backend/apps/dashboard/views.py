from datetime import date, timedelta
from decimal import Decimal
from django.db.models import Sum, Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import Account
from apps.accounts.services import get_account_balance
from apps.transactions.models import Transaction
from apps.credits.models import Credit
from apps.recurring.models import RecurringTransaction


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_summary(request):
    user = request.user
    today = date.today()
    first_of_month = today.replace(day=1)

    accounts = Account.objects.filter(user=user, is_active=True)
    total_balance = sum(get_account_balance(a) for a in accounts)
    accounts_data = [
        {'id': a.id, 'name': a.name, 'type': a.account_type,
         'balance': float(get_account_balance(a)), 'color': a.color, 'icon': a.icon}
        for a in accounts
    ]

    month_transactions = Transaction.objects.filter(
        user=user, date__gte=first_of_month, date__lte=today
    )
    month_income = float(month_transactions.filter(transaction_type='income').aggregate(
        t=Sum('amount'))['t'] or 0)
    month_expenses = float(month_transactions.filter(transaction_type='expense').aggregate(
        t=Sum('amount'))['t'] or 0)

    credits = Credit.objects.filter(user=user, is_active=True)
    total_monthly_credits = float(
        credits.aggregate(p=Sum('monthly_payment'))['p'] or 0
    ) + float(credits.aggregate(i=Sum('insurance_monthly'))['i'] or 0)

    recurring = RecurringTransaction.objects.filter(user=user, is_active=True, transaction_type='expense')
    total_recurring = float(recurring.aggregate(t=Sum('amount'))['t'] or 0)

    by_category = month_transactions.filter(
        transaction_type='expense', category__isnull=False
    ).values(
        'category__name', 'category__color',
        'category__parent__name', 'category__parent__color',
    ).annotate(total=Sum('amount'))

    category_totals: dict[str, dict] = {}
    for r in by_category:
        if r['category__parent__name']:
            name = r['category__parent__name']
            color = r['category__parent__color']
        else:
            name = r['category__name']
            color = r['category__color']
        if name not in category_totals:
            category_totals[name] = {'name': name, 'color': color, 'amount': 0.0}
        category_totals[name]['amount'] += float(r['total'])

    expenses_by_category = sorted(category_totals.values(), key=lambda x: x['amount'], reverse=True)

    cutoff = today + timedelta(days=30)
    upcoming_recurring = list(
        RecurringTransaction.objects.filter(
            user=user, is_active=True, next_occurrence__lte=cutoff, next_occurrence__gte=today
        ).values('name', 'amount', 'next_occurrence', 'transaction_type')[:10]
    )
    # Serialize date to string for JSON
    for item in upcoming_recurring:
        item['next_occurrence'] = str(item['next_occurrence'])
        item['amount'] = str(item['amount'])

    return Response({
        'total_balance': float(total_balance),
        'accounts': accounts_data,
        'month_income': month_income,
        'month_expenses': month_expenses,
        'remaining_to_live': month_income - month_expenses,
        'total_monthly_credits': total_monthly_credits,
        'total_recurring_expenses': total_recurring,
        'expenses_by_category': expenses_by_category,
        'upcoming_deadlines': upcoming_recurring,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def balance_history(request):
    """Monthly balance evolution for the last 12 months."""
    from dateutil.relativedelta import relativedelta
    user = request.user
    today = date.today()
    data = []

    for i in range(11, -1, -1):
        month_start = today.replace(day=1) - relativedelta(months=i)
        month_end = month_start + relativedelta(months=1)
        income = float(Transaction.objects.filter(
            user=user, date__gte=month_start, date__lt=month_end, transaction_type='income'
        ).aggregate(t=Sum('amount'))['t'] or 0)
        expenses = float(Transaction.objects.filter(
            user=user, date__gte=month_start, date__lt=month_end, transaction_type='expense'
        ).aggregate(t=Sum('amount'))['t'] or 0)
        data.append({
            'month': month_start.strftime('%b %Y'),
            'income': income,
            'expenses': expenses,
            'net': income - expenses,
        })

    return Response(data)
