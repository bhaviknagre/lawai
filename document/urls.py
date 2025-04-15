from django.urls import path
from .views import (
    DocumentTypeListCreateAPIView, DocumentTypeDetailAPIView,
    DocumentListCreateAPIView, DocumentDetailAPIView
)

urlpatterns = [
   
    path('types/', DocumentTypeListCreateAPIView.as_view(), name='documenttype-list-create'),
    path('types/<int:pk>/', DocumentTypeDetailAPIView.as_view(), name='documenttype-detail'),

  
    path('', DocumentListCreateAPIView.as_view(), name='document-list-create'),
    path('<int:pk>/', DocumentDetailAPIView.as_view(), name='document-detail'),
]
