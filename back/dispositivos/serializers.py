from rest_framework import serializers

from .models import Leitura, Dispositivo


class LeituraSerializer(serializers.ModelSerializer):
    temperatura = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        coerce_to_string=False,
    )

    umidade = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        min_value=0,
        max_value=100,
        coerce_to_string=False,
    )

    timestamp = serializers.DateTimeField(required=False)
    
    class Meta:
        model = Leitura

        fields = [
            "id",
            "temperatura",
            "umidade",
            "timestamp",
            "recebida_em",
            "ventilador_ligado",
            "umidade_baixa",
        ]

        read_only_fields = ["id", "recebida_em"]

from .models import Dispositivo


class LimitesSerializer(serializers.ModelSerializer):
    temperatura_maxima = serializers.FloatField(
        min_value=-40,
        max_value=80,
    )
    umidade_minima = serializers.FloatField(
        min_value=0,
        max_value=100,
    )

    class Meta:
        model = Dispositivo
        fields = ["temperatura_maxima", "umidade_minima"]