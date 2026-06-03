from dateutil.relativedelta import relativedelta
from django.db.models import Sum, Count, Case, When, F, DecimalField
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Transaction
from .serializers import TransactionSerializer
from .filters import TransactionFilter


_FREQ_STEP = {
    'weekly': relativedelta(weeks=1),
    'monthly': relativedelta(months=1),
    'yearly': relativedelta(years=1),
}


class TransactionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TransactionSerializer
    filterset_class = TransactionFilter
    search_fields = ['description', 'note']
    ordering_fields = ['date', 'amount', 'created_at']
    ordering = ['-date']

    def get_queryset(self):
        return (
            Transaction.objects
            .filter(user=self.request.user)
            .select_related('account', 'category', 'recurring_transaction')
        )

    @action(detail=False, methods=['get'], url_path='detect-recurring')
    def detect_recurring(self, request):
        from .detection import detect_recurring_suggestions
        return Response(detect_recurring_suggestions(request.user))

    @action(detail=True, methods=['post'], url_path='link-recurring')
    def link_recurring(self, request, pk=None):
        from apps.recurring.models import RecurringTransaction

        tx = self.get_object()
        recurring_id = request.data.get('recurring_id')

        if recurring_id is None:
            tx.recurring_transaction = None
            tx.save(update_fields=['recurring_transaction'])
            return Response(TransactionSerializer(tx, context={'request': request}).data)

        try:
            rt = RecurringTransaction.objects.get(id=recurring_id, user=request.user, is_active=True)
        except RecurringTransaction.DoesNotExist:
            return Response({'detail': 'Flux récurrent introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        if rt.transaction_type != tx.transaction_type:
            return Response(
                {'detail': 'Le type du flux récurrent ne correspond pas à la transaction.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tx.recurring_transaction = rt
        tx.save(update_fields=['recurring_transaction'])

        if tx.date >= rt.next_occurrence:
            step = _FREQ_STEP.get(rt.frequency)
            if step:
                rt.next_occurrence = tx.date + step
                rt.save(update_fields=['next_occurrence'])

        return Response(TransactionSerializer(tx, context={'request': request}).data)

    @action(detail=False, methods=['get'], url_path='analyse')
    def analyse(self, request):
        qs = self.filter_queryset(self.get_queryset())

        signed_amount = Case(
            When(transaction_type__in=['expense', 'transfer'], then=-F('amount')),
            default=F('amount'),
            output_field=DecimalField(),
        )
        summary_qs = (
            qs.values('category__name', 'category__color')
            .annotate(count=Count('id'), total=Sum(signed_amount))
            .order_by('category__name')
        )
        summary_rows = list(summary_qs)
        total_abs = sum(abs(float(row['total'] or 0)) for row in summary_rows)

        summary = []
        for row in summary_rows:
            row_total = float(row['total'] or 0)
            pct = round(abs(row_total) / total_abs * 100, 1) if total_abs else 0
            summary.append({
                'category_name': row['category__name'] or 'Sans catégorie',
                'category_color': row['category__color'] or '#6b7280',
                'count': row['count'],
                'total': str(row['total'] or '0.00'),
                'percentage': pct,
            })

        transactions = TransactionSerializer(
            qs.order_by('-date'), many=True, context={'request': request}
        ).data

        return Response({'summary': summary, 'transactions': transactions})
