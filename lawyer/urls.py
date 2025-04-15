from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    LawyerProfileViewSet, RegisterApi, LoginApi, LogoutApi, 
    UpdateProfileApi, DeleteAccountApi
)

router = DefaultRouter()
router.register(r'lawyers', LawyerProfileViewSet, basename='lawyer')

urlpatterns = [
    path('lawyer-api/', include(router.urls)),
    path('lawyer-api/register/', RegisterApi.as_view(), name='register'),
    path('lawyer-api/login/', LoginApi.as_view(), name='login'),
    path('lawyer-api/logout/', LogoutApi.as_view(), name='logout'),
    path('lawyer-api/update-profile/', UpdateProfileApi.as_view(), name='update-profile'),
    path('lawyer-api/delete-account/', DeleteAccountApi.as_view(), name='delete-account'),
]
