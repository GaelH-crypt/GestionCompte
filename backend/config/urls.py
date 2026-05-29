from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('apps.authentication.urls')),
    path('api/accounts/', include('apps.accounts.urls')),
    path('api/categories/', include('apps.categories.urls')),
    path('api/transactions/', include('apps.transactions.urls')),
    path('api/recurring/', include('apps.recurring.urls')),
    path('api/credits/', include('apps.credits.urls')),
    path('api/dashboard/', include('apps.dashboard.urls')),
    path('api/projections/', include('apps.projections.urls')),
    path('api/import/', include('apps.imports.urls')),
    path('api/bank-sync/', include('apps.bank_sync.urls')),
]
