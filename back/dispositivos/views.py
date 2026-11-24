from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import Dispositivo
from .serializers import LeituraSerializer, LimitesSerializer

from django.db import transaction

@api_view(["GET", "POST"])
@authentication_classes([JWTAuthentication, TokenAuthentication])
@permission_classes([IsAuthenticated])
def controlar_led(request):
    dispositivo, _ = Dispositivo.objects.get_or_create(
        usuario=request.user,
    )

    if request.method == "POST":
        ligado = request.data.get("ligado")

        # Aceita somente os booleanos JSON true ou false.
        if type(ligado) is not bool:
            return Response(
                {"erro": "Envie 'ligado' como true ou false."},
                status=400,
            )

        dispositivo.led_ligado = ligado
        dispositivo.save(update_fields=["led_ligado"])

    return Response({
        "nome": dispositivo.nome,
        "ligado": dispositivo.led_ligado,
    })

@api_view(["GET", "POST"])
@authentication_classes([JWTAuthentication, TokenAuthentication])
@permission_classes([IsAuthenticated])
def leituras(request):
    dispositivo, _ = Dispositivo.objects.get_or_create(
        usuario=request.user,
    )

    registros = dispositivo.leituras.order_by("-recebida_em", "-id")

    if request.method == "POST":
        serializer = LeituraSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            serializer.save(dispositivo=dispositivo)

            ids_para_manter = registros.values_list("id", flat=True)[:100]
            dispositivo.leituras.exclude(id__in=ids_para_manter).delete()

        return Response(serializer.data, status=201)

    serializer = LeituraSerializer(registros[:100], many=True)
    return Response(serializer.data)

@api_view(["GET", "POST"])
@authentication_classes([JWTAuthentication, TokenAuthentication])
@permission_classes([IsAuthenticated])
def limites(request):
    dispositivo, _ = Dispositivo.objects.get_or_create(
        usuario=request.user,
    )

    if request.method == "POST":
        serializer = LimitesSerializer(
            dispositivo,
            data=request.data,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response(serializer.data)

    return Response(LimitesSerializer(dispositivo).data)