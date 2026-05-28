from rest_framework.routers import SimpleRouter
from .views import TransactionViewSet

router = SimpleRouter()
router.register('', TransactionViewSet, basename='transactions')
urlpatterns = router.urls
