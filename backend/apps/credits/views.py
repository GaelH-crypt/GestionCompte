from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Credit
from .serializers import CreditSerializer
from .services import generate_schedule


class CreditViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = CreditSerializer

    def get_queryset(self):
        return Credit.objects.filter(user=self.request.user)

    @action(detail=True, methods=['get'])
    def schedule(self, request, pk=None):
        credit = self.get_object()
        months = int(request.query_params.get('months', 12))
        return Response(generate_schedule(credit, max_months=months))
