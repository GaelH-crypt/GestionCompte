from decimal import Decimal, InvalidOperation
from datetime import date, timedelta

from django.db.models import Sum, Count, Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from apps.transactions.models import Transaction


def _compute_kpis(qs, extra_income, extra_expenses):
    """Compute KPI dict from a queryset + simulation extras."""
    income_agg = qs.filter(transaction_type='income').aggregate(total=Sum('amount'))
    expense_agg = qs.filter(transaction_type='expense').aggregate(total=Sum('amount'))

    total_income = (income_agg['total'] or Decimal('0.00')) + extra_income
    total_expenses = (expense_agg['total'] or Decimal('0.00')) + extra_expenses

    net = total_income - total_expenses

    if total_income > 0:
        savings_rate = round(float(net / total_income), 4)
    else:
        savings_rate = 0

    date_from = qs.order_by('date').values_list('date', flat=True).first()
    date_to = qs.order_by('-date').values_list('date', flat=True).first()
    # days is passed separately; compute avg_daily_expense with the qs span
    # but callers will override with their own days value
    avg_daily_expense = Decimal('0.00')

    fixed_agg = qs.filter(
        transaction_type='expense',
        recurring_transaction__isnull=False,
    ).aggregate(total=Sum('amount'))
    fixed_expenses = fixed_agg['total'] or Decimal('0.00')

    if total_expenses > 0:
        fixed_ratio = round(float(fixed_expenses / total_expenses), 4)
        variable_ratio = round(1 - fixed_ratio, 4)
    else:
        fixed_ratio = 0
        variable_ratio = 0

    return {
        'total_income': total_income,
        'total_expenses': total_expenses,
        'net': net,
        'savings_rate': savings_rate,
        'fixed_ratio': fixed_ratio,
        'variable_ratio': variable_ratio,
    }


def _compute_by_category(qs, total_expenses, include_vs_previous=False):
    """Return by_category list from expense queryset."""
    expense_qs = qs.filter(transaction_type='expense')

    category_data = (
        expense_qs
        .filter(category__isnull=False)
        .values('category__id', 'category__name', 'category__color')
        .annotate(total=Sum('amount'), count=Count('id'))
        .order_by('-total')
    )

    no_category_agg = expense_qs.filter(category__isnull=True).aggregate(
        total=Sum('amount'), count=Count('id')
    )

    by_category = []
    for row in category_data:
        cat_total = row['total'] or Decimal('0.00')
        percentage = (
            round(float(cat_total / total_expenses * 100), 1)
            if total_expenses > 0
            else 0
        )
        entry = {
            'category': row['category__name'],
            'color': row['category__color'],
            'total': f'{cat_total:.2f}',
            'count': row['count'],
            'percentage': percentage,
        }
        if include_vs_previous:
            entry['vs_previous'] = None
        by_category.append(entry)

    no_cat_total = no_category_agg['total'] or Decimal('0.00')
    no_cat_count = no_category_agg['count'] or 0
    if no_cat_count > 0:
        percentage = (
            round(float(no_cat_total / total_expenses * 100), 1)
            if total_expenses > 0
            else 0
        )
        entry = {
            'category': 'Sans catégorie',
            'color': '#9CA3AF',
            'total': f'{no_cat_total:.2f}',
            'count': no_cat_count,
            'percentage': percentage,
        }
        if include_vs_previous:
            entry['vs_previous'] = None
        by_category.append(entry)

    by_category.sort(key=lambda x: Decimal(x['total']), reverse=True)
    return by_category


class RapportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # --- Parse and validate required date parameters ---
        date_from_str = request.query_params.get('date_from')
        date_to_str = request.query_params.get('date_to')

        if not date_from_str or not date_to_str:
            return Response(
                {'error': 'date_from and date_to are required'},
                status=400,
            )

        try:
            date_from = date.fromisoformat(date_from_str)
            date_to = date.fromisoformat(date_to_str)
        except ValueError:
            return Response(
                {'error': 'date_from and date_to must be valid YYYY-MM-DD dates'},
                status=400,
            )

        if date_from > date_to:
            return Response(
                {'error': 'date_from must be before or equal to date_to'},
                status=400,
            )

        # --- Optional parameters ---
        account_id = request.query_params.get('account')
        include_simulated = request.query_params.get('include_simulated', 'false').lower() == 'true'
        compare_with = request.query_params.get('compare_with')

        extra_income = Decimal('0.00')
        extra_expenses = Decimal('0.00')
        if include_simulated:
            try:
                extra_income = Decimal(request.query_params.get('extra_income', '0') or '0')
                extra_expenses = Decimal(request.query_params.get('extra_expenses', '0') or '0')
            except InvalidOperation:
                return Response(
                    {'error': 'extra_income and extra_expenses must be valid decimal numbers'},
                    status=400,
                )

        # --- Base queryset ---
        qs = Transaction.objects.filter(
            user=request.user,
            date__gte=date_from,
            date__lte=date_to,
        )
        if account_id:
            try:
                account_id = int(account_id)
            except (ValueError, TypeError):
                return Response(
                    {'error': 'account must be a valid integer'},
                    status=400,
                )
            qs = qs.filter(account_id=account_id)

        # --- KPI aggregations ---
        income_agg = qs.filter(transaction_type='income').aggregate(total=Sum('amount'))
        expense_agg = qs.filter(transaction_type='expense').aggregate(total=Sum('amount'))

        total_income = (income_agg['total'] or Decimal('0.00')) + extra_income
        total_expenses = (expense_agg['total'] or Decimal('0.00')) + extra_expenses

        net = total_income - total_expenses

        if total_income > 0:
            savings_rate = round(float(net / total_income), 4)
        else:
            savings_rate = 0

        days = (date_to - date_from).days + 1
        avg_daily_expense = total_expenses / days if days > 0 else Decimal('0.00')

        # Fixed vs variable ratio (fixed = has a recurring_transaction FK)
        fixed_agg = qs.filter(
            transaction_type='expense',
            recurring_transaction__isnull=False,
        ).aggregate(total=Sum('amount'))
        fixed_expenses = fixed_agg['total'] or Decimal('0.00')

        if total_expenses > 0:
            # Note: fixed_expenses only counts DB transactions, not simulated extra_expenses
            # which are considered variable by default
            fixed_ratio = round(float(fixed_expenses / total_expenses), 4)
            variable_ratio = round(1 - fixed_ratio, 4)
        else:
            fixed_ratio = 0
            variable_ratio = 0

        # --- Comparison period ---
        comparison_data = None
        comp_by_category_map = {}  # category_name -> Decimal total

        if compare_with:
            if compare_with == 'auto':
                compare_to = date_from - timedelta(days=1)
                compare_from = compare_to - timedelta(days=days - 1)
            elif compare_with == 'custom':
                compare_from_str = request.query_params.get('compare_from')
                compare_to_str = request.query_params.get('compare_to')
                if not compare_from_str or not compare_to_str:
                    return Response(
                        {'error': 'compare_from and compare_to are required for compare_with=custom'},
                        status=400,
                    )
                try:
                    compare_from = date.fromisoformat(compare_from_str)
                    compare_to = date.fromisoformat(compare_to_str)
                except ValueError:
                    return Response(
                        {'error': 'compare_from and compare_to must be valid YYYY-MM-DD dates'},
                        status=400,
                    )
            else:
                return Response(
                    {'error': 'compare_with must be "auto" or "custom"'},
                    status=400,
                )

            comp_days = (compare_to - compare_from).days + 1

            comp_base_qs = Transaction.objects.filter(
                user=request.user,
                date__gte=compare_from,
                date__lte=compare_to,
            )
            if account_id:
                comp_base_qs = comp_base_qs.filter(account_id=account_id)

            comp_income_agg = comp_base_qs.filter(transaction_type='income').aggregate(total=Sum('amount'))
            comp_expense_agg = comp_base_qs.filter(transaction_type='expense').aggregate(total=Sum('amount'))

            comp_total_income = (comp_income_agg['total'] or Decimal('0.00')) + extra_income
            comp_total_expenses = (comp_expense_agg['total'] or Decimal('0.00')) + extra_expenses
            comp_net = comp_total_income - comp_total_expenses

            if comp_total_income > 0:
                comp_savings_rate = round(float(comp_net / comp_total_income), 4)
            else:
                comp_savings_rate = 0

            comp_avg_daily_expense = comp_total_expenses / comp_days if comp_days > 0 else Decimal('0.00')

            comp_fixed_agg = comp_base_qs.filter(
                transaction_type='expense',
                recurring_transaction__isnull=False,
            ).aggregate(total=Sum('amount'))
            comp_fixed_expenses = comp_fixed_agg['total'] or Decimal('0.00')

            if comp_total_expenses > 0:
                comp_fixed_ratio = round(float(comp_fixed_expenses / comp_total_expenses), 4)
                comp_variable_ratio = round(1 - comp_fixed_ratio, 4)
            else:
                comp_fixed_ratio = 0
                comp_variable_ratio = 0

            # Build comparison by_category (without vs_previous field)
            comp_by_category = _compute_by_category(comp_base_qs, comp_total_expenses, include_vs_previous=False)

            # Build lookup map for vs_previous computation
            for row in comp_by_category:
                comp_by_category_map[row['category']] = Decimal(row['total'])

            comparison_data = {
                'period': {
                    'from': compare_from.isoformat(),
                    'to': compare_to.isoformat(),
                    'days': comp_days,
                },
                'kpis': {
                    'total_income': f'{comp_total_income:.2f}',
                    'total_expenses': f'{comp_total_expenses:.2f}',
                    'net': f'{comp_net:.2f}',
                    'savings_rate': comp_savings_rate,
                    'avg_daily_expense': f'{comp_avg_daily_expense:.2f}',
                    'fixed_ratio': comp_fixed_ratio,
                    'variable_ratio': comp_variable_ratio,
                },
                'by_category': comp_by_category,
            }

        # --- By category breakdown (expenses only) ---
        expense_qs = qs.filter(transaction_type='expense')

        # Transactions with a category
        category_data = (
            expense_qs
            .filter(category__isnull=False)
            .values('category__id', 'category__name', 'category__color')
            .annotate(total=Sum('amount'), count=Count('id'))
            .order_by('-total')
        )

        # Transactions without a category
        no_category_agg = expense_qs.filter(category__isnull=True).aggregate(
            total=Sum('amount'), count=Count('id')
        )

        by_category = []

        for row in category_data:
            cat_total = row['total'] or Decimal('0.00')
            percentage = (
                round(float(cat_total / total_expenses * 100), 1)
                if total_expenses > 0
                else 0
            )
            vs_previous = None
            if compare_with and row['category__name'] in comp_by_category_map:
                comp_total = comp_by_category_map[row['category__name']]
                if comp_total > 0:
                    vs_previous = round(float((cat_total - comp_total) / comp_total * 100), 1)
            by_category.append({
                'category': row['category__name'],
                'color': row['category__color'],
                'total': f'{cat_total:.2f}',
                'count': row['count'],
                'percentage': percentage,
                'vs_previous': vs_previous,
            })

        # Append "Sans catégorie" if there are uncategorised expenses
        no_cat_total = no_category_agg['total'] or Decimal('0.00')
        no_cat_count = no_category_agg['count'] or 0
        if no_cat_count > 0:
            percentage = (
                round(float(no_cat_total / total_expenses * 100), 1)
                if total_expenses > 0
                else 0
            )
            vs_previous = None
            if compare_with and 'Sans catégorie' in comp_by_category_map:
                comp_total = comp_by_category_map['Sans catégorie']
                if comp_total > 0:
                    vs_previous = round(float((no_cat_total - comp_total) / comp_total * 100), 1)
            by_category.append({
                'category': 'Sans catégorie',
                'color': '#9CA3AF',
                'total': f'{no_cat_total:.2f}',
                'count': no_cat_count,
                'percentage': percentage,
                'vs_previous': vs_previous,
            })

        # Sort full list by total descending (category_data is already sorted,
        # but we may need to insert "Sans catégorie" in the right position)
        by_category.sort(key=lambda x: Decimal(x['total']), reverse=True)

        # --- Monthly trend (last 12 months ending at month of date_to) ---
        monthly_trend = []
        # Compute the first month: date_to month minus 11 months
        trend_year = date_to.year
        trend_month = date_to.month
        # Go back 11 months to find start
        start_year = trend_year - (11 - (trend_month - 1)) // 12
        start_month = ((trend_month - 1 - 11) % 12) + 1
        # Simpler: subtract 11 months
        m = trend_month - 11
        y = trend_year
        while m <= 0:
            m += 12
            y -= 1
        start_year, start_month = y, m

        trend_qs_base = Transaction.objects.filter(user=request.user)

        for i in range(12):
            month_year = start_year
            month_month = start_month + i
            while month_month > 12:
                month_month -= 12
                month_year += 1

            month_first = date(month_year, month_month, 1)
            # Last day of the month
            if month_month == 12:
                month_last = date(month_year + 1, 1, 1) - timedelta(days=1)
            else:
                month_last = date(month_year, month_month + 1, 1) - timedelta(days=1)

            month_qs = trend_qs_base.filter(date__gte=month_first, date__lte=month_last)

            m_income_agg = month_qs.filter(transaction_type='income').aggregate(total=Sum('amount'))
            m_expense_agg = month_qs.filter(transaction_type='expense').aggregate(total=Sum('amount'))

            m_income = m_income_agg['total'] or Decimal('0.00')
            m_expenses = m_expense_agg['total'] or Decimal('0.00')
            m_net = m_income - m_expenses

            monthly_trend.append({
                'month': f'{month_year:04d}-{month_month:02d}',
                'income': f'{m_income:.2f}',
                'expenses': f'{m_expenses:.2f}',
                'net': f'{m_net:.2f}',
            })

        # --- Build response ---
        return Response({
            'period': {
                'from': date_from.isoformat(),
                'to': date_to.isoformat(),
                'days': days,
            },
            'kpis': {
                'total_income': f'{total_income:.2f}',
                'total_expenses': f'{total_expenses:.2f}',
                'net': f'{net:.2f}',
                'savings_rate': savings_rate,
                'avg_daily_expense': f'{avg_daily_expense:.2f}',
                'fixed_ratio': fixed_ratio,
                'variable_ratio': variable_ratio,
            },
            'by_category': by_category,
            'monthly_trend': monthly_trend,
            'comparison': comparison_data,
        })
