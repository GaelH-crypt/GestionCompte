from django.urls import path
from .views import PreviewView, ConfirmView

urlpatterns = [
    path('preview/', PreviewView.as_view(), name='import-preview'),
    path('confirm/', ConfirmView.as_view(), name='import-confirm'),
]
