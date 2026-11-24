from django.urls import path
from rest_framework.authtoken.views import obtain_auth_token
from dispositivos.views import controlar_led, leituras, limites

from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

urlpatterns = [
    path("led/", controlar_led),
    path("login/", TokenObtainPairView.as_view(), name="login",),
    path("refresh/",TokenRefreshView.as_view(),name="token_refresh",),
    path("leituras/", leituras),
    path("limites/", limites),
]