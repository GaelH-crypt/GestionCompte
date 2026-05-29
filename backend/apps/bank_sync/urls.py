from django.urls import path
from rest_framework.routers import SimpleRouter
from .views import BankAccountViewSet, InstitutionListView, RequisitionViewSet

router = SimpleRouter()
router.register('requisitions', RequisitionViewSet, basename='bank-requisitions')
router.register('accounts', BankAccountViewSet, basename='bank-accounts')

urlpatterns = [
    path('institutions/', InstitutionListView.as_view(), name='bank-institutions'),
] + router.urls
