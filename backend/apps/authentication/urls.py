from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import LoginView, logout_view, me_view, change_password_view

urlpatterns = [
    path('login/', LoginView.as_view(), name='auth-login'),
    path('logout/', logout_view, name='auth-logout'),
    path('refresh/', TokenRefreshView.as_view(), name='auth-refresh'),
    path('me/', me_view, name='auth-me'),
    path('change-password/', change_password_view, name='auth-change-password'),
]
