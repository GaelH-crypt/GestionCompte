from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import Category
from .serializers import CategorySerializer


class CategoryViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = CategorySerializer

    def get_queryset(self):
        return Category.objects.filter(user=self.request.user, parent=None).prefetch_related('subcategories')
