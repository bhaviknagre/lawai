from django.urls import path
from .views import ClientListCreateAPIView, ClientDetailAPIView

urlpatterns = [
    path('clients/', ClientListCreateAPIView.as_view(), name='client-list-create'),
    path('clients/<int:pk>/', ClientDetailAPIView.as_view(), name='client-detail'),
]
