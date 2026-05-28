from rest_framework.routers import SimpleRouter
from .views import RecurringTransactionViewSet

router = SimpleRouter()
router.register('', RecurringTransactionViewSet, basename='recurring')
urlpatterns = router.urls
