from django.urls import path
from .views import RapportView

urlpatterns = [
    path('rapport/', RapportView.as_view(), name='analyse-rapport'),
]
