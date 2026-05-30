from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Transaction
from .serializers import TransactionSerializer
from .filters import TransactionFilter


class TransactionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = TransactionSerializer
    filterset_class = TransactionFilter
    search_fields = ['description', 'note']
    ordering_fields = ['date', 'amount', 'created_at']
    ordering = ['-date']

    def get_queryset(self):
        return Transaction.objects.filter(user=self.request.user).select_related('account', 'category')

    @action(detail=False, methods=['get'], url_path='detect-recurring')
    def detect_recurring(self, request):
        from .detection import detect_recurring_suggestions
        return Response(detect_recurring_suggestions(request.user))
