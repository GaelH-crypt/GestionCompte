from rest_framework.routers import SimpleRouter
from django.urls import path
from .views import CreditViewSet, CreditDrawViewSet

router = SimpleRouter()
router.register('', CreditViewSet, basename='credits')

urlpatterns = router.urls + [
    path('<int:credit_pk>/draws/', CreditDrawViewSet.as_view({'get': 'list', 'post': 'create'}), name='credit-draws-list'),
    path('<int:credit_pk>/draws/<int:pk>/', CreditDrawViewSet.as_view({'get': 'retrieve', 'patch': 'partial_update', 'delete': 'destroy'}), name='credit-draws-detail'),
]
