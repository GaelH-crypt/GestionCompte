from rest_framework.routers import SimpleRouter
from .views import CategoryViewSet, CategoryRuleViewSet

router = SimpleRouter()
router.register('rules', CategoryRuleViewSet, basename='category-rules')
router.register('', CategoryViewSet, basename='categories')
urlpatterns = router.urls
