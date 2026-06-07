from decimal import Decimal, InvalidOperation
from datetime import date

from django.db.models import Sum, Count, Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from apps.transactions.models import Transaction


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

        # --- Optional parameters ---
        account_id = request.query_params.get('account')
        include_simulated = request.query_params.get('include_simulated', 'false').lower() == 'true'

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
        else:
            fixed_ratio = 0
        variable_ratio = round(1 - fixed_ratio, 4)

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
            by_category.append({
                'category': row['category__name'],
                'color': row['category__color'],
                'total': f'{cat_total:.2f}',
                'count': row['count'],
                'percentage': percentage,
                'vs_previous': None,
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
            by_category.append({
                'category': 'Sans catégorie',
                'color': '#9CA3AF',
                'total': f'{no_cat_total:.2f}',
                'count': no_cat_count,
                'percentage': percentage,
                'vs_previous': None,
            })

        # Sort full list by total descending (category_data is already sorted,
        # but we may need to insert "Sans catégorie" in the right position)
        by_category.sort(key=lambda x: Decimal(x['total']), reverse=True)

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
            'monthly_trend': [],
            'comparison': None,
        })
