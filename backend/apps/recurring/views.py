from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import RecurringTransaction
from .serializers import RecurringTransactionSerializer


class RecurringTransactionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = RecurringTransactionSerializer

    def get_queryset(self):
        return RecurringTransaction.objects.filter(user=self.request.user).select_related('account', 'category')
