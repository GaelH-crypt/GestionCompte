from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.transactions.models import Transaction
from .models import Category, CategoryRule
from .rules import apply_rules
from .serializers import CategorySerializer, CategoryRuleSerializer


class CategoryViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = CategorySerializer

    def get_queryset(self):
        return Category.objects.filter(user=self.request.user)

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset().filter(parent=None).prefetch_related('subcategories')
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)


class CategoryRuleViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = CategoryRuleSerializer
    http_method_names = ['get', 'post', 'delete', 'head', 'options']
    pagination_class = None

    def get_queryset(self):
        return CategoryRule.objects.filter(user=self.request.user).select_related('category')

    @action(detail=False, methods=['post'])
    def apply(self, request):
        qs = Transaction.objects.filter(user=request.user, category=None)
        count = apply_rules(request.user, qs)
        return Response({'applied': count})
