from django.conf import settings
from django.db import models


class Dispositivo(models.Model):
    usuario = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE
    )
    nome = models.CharField(max_length=100, default="Meu ESP32")
    led_ligado = models.BooleanField(default=False)
    temperatura_maxima = models.FloatField(default=20)
    umidade_minima = models.FloatField(default=30)
    kp = models.FloatField(default=10)
    ki = models.FloatField(default=0.2)
    kd = models.FloatField(default=1)

    def __str__(self):
        return self.nome


class Leitura(models.Model):
    dispositivo = models.ForeignKey(
        Dispositivo,
        on_delete=models.CASCADE,
        related_name="leituras"
    )
    temperatura = models.DecimalField(max_digits=5, decimal_places=2)
    umidade = models.DecimalField(max_digits=5, decimal_places=2)
    recebida_em = models.DateTimeField(auto_now_add=True)
    timestamp = models.DateTimeField(null=True, blank=True)
    ventilador_ligado = models.BooleanField(default=False)
    umidade_baixa = models.BooleanField(default=False)
    potencia_ventilador = models.FloatField(null=True, blank=True)

    class Meta:
        ordering = ["-recebida_em"]

    def __str__(self):
        return f"{self.dispositivo.nome} — {self.temperatura} °C / {self.umidade} %"