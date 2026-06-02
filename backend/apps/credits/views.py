from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Credit, CreditDraw
from .serializers import CreditSerializer, CreditDrawSerializer
from .services import generate_schedule


class CreditViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = CreditSerializer

    def get_queryset(self):
        return Credit.objects.filter(user=self.request.user).prefetch_related('draws', 'accounts')

    @action(detail=True, methods=['get'])
    def schedule(self, request, pk=None):
        credit = self.get_object()
        months = int(request.query_params.get('months', 12))
        return Response(generate_schedule(credit, max_months=months))


class CreditDrawViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = CreditDrawSerializer

    def get_queryset(self):
        return CreditDraw.objects.filter(
            credit__user=self.request.user,
            credit_id=self.kwargs['credit_pk'],
        )

    def perform_create(self, serializer):
        credit = Credit.objects.get(pk=self.kwargs['credit_pk'], user=self.request.user)
        serializer.save(credit=credit)
