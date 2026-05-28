from rest_framework.routers import SimpleRouter
from .views import CreditViewSet

router = SimpleRouter()
router.register('', CreditViewSet, basename='credits')
urlpatterns = router.urls
