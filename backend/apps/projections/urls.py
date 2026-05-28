from django.urls import path
from .views import projection_view, simulation_view

urlpatterns = [
    path('', projection_view, name='projection'),
    path('simulate/', simulation_view, name='simulation'),
]
