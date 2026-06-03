from django.urls import path
from .views import dashboard_summary, balance_history

urlpatterns = [
    path('summary/', dashboard_summary, name='dashboard-summary'),
    path('history/', balance_history, name='dashboard-history'),
    path('balance-history/', balance_history, name='dashboard-balance-history'),
]
