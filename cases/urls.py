from django.urls import path
from . import views

urlpatterns = [
    # Case 
    path('cases/', views.CaseListCreateAPIView.as_view(), name='case-list-create'),
    path('cases/<int:pk>/', views.CaseDetailAPIView.as_view(), name='case-detail'),

    # Status
    path('case-status/', views.CaseStatusListCreateAPIView.as_view(), name='case-status-list-create'),
    path('case-status/<int:pk>/', views.CaseStatusDetailAPIView.as_view(), name='case-status-detail'),

    # Type
    path('case-types/', views.CaseTypeListCreateAPIView.as_view(), name='case-type-list-create'),
    path('case-types/<int:pk>/', views.CaseTypeDetailAPIView.as_view(), name='case-type-detail'),

    # Payment 
    path('payment-status/', views.PaymentStatusListCreateAPIView.as_view(), name='payment-status-list-create'),
    path('payment-status/<int:pk>/', views.PaymentStatusDetailAPIView.as_view(), name='payment-status-detail'),

    # Opposing 
    path('opposing-parties/', views.OpposingPartyListCreateAPIView.as_view(), name='opposing-party-list-create'),
    path('opposing-parties/<int:pk>/', views.OpposingPartyDetailAPIView.as_view(), name='opposing-party-detail'),

    # Court 
    path('courts/', views.CourtListCreateAPIView.as_view(), name='court-list-create'),
    path('courts/<int:pk>/', views.CourtDetailAPIView.as_view(), name='court-detail'),

    # Judge 
    path('judges/', views.JudgeListCreateAPIView.as_view(), name='judge-list-create'),
    path('judges/<int:pk>/', views.JudgeDetailAPIView.as_view(), name='judge-detail'),
]
