from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    LawyerProfileViewSet, RegisterApi, LoginApi, LogoutApi, 
    UpdateProfileApi, DeleteAccountApi
)
from rest_framework import permissions
from drf_yasg.views import get_schema_view
from drf_yasg import openapi


schema_view = get_schema_view(
   openapi.Info(
      title="Legal Journey API",
      default_version='v1',
      description="API documentation for Legal Journey project",
   ),
   public=True,
   permission_classes=(permissions.AllowAny,),
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
    
  
    path('docs/', schema_view.with_ui('swagger', cache_timeout=0), name='schema-swagger-ui'),
    path('redoc/', schema_view.with_ui('redoc', cache_timeout=0), name='schema-redoc'),
]
