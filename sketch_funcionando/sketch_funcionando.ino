#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <time.h>

// ======================================================
// CONFIGURAÇÕES
// ======================================================

const char* WIFI_NOME = "WIFI_EDUC_CFP501";
const char* WIFI_SENHA = "w1f1educ@501";

const char* API_USUARIO = "marcela";
const char* API_SENHA = "123456";

const String API =
    "https://marcelaconceicaosilva74.pythonanywhere.com/api";

const int PINO_DHT = 4;
const int PINO_VENTILADOR = 2;
const int PINO_UMIDADE = 26;

const unsigned long INTERVALO_MS = 2000;

DHT dht(PINO_DHT, DHT22);

float temperaturaDesejada = 20;
float umidadeMinima = 30;

float kp = 10;
float ki = 0.2;
float kd = 1;

String accessToken;

unsigned long ultimoCiclo = 0;
bool relogioIniciado = false;

// ======================================================
// ESTADO DO PID
// ======================================================

float integralPID = 0;
float temperaturaAnterior = 0;
float derivadaFiltrada = 0;

unsigned long instantePID = 0;
bool pidIniciado = false;

void reiniciarPID() {
  integralPID = 0;
  derivadaFiltrada = 0;
  pidIniciado = false;
}

float calcularPID(float temperatura) {
  unsigned long agora = millis();

  float dt = 0;
  float derivada = 0;

  if (pidIniciado) {
    dt = (agora - instantePID) / 1000.0f;

    if (dt > 0) {
      derivada = (temperatura - temperaturaAnterior) / dt;
    }
  }

  instantePID = agora;
  temperaturaAnterior = temperatura;
  pidIniciado = true;

  // Para resfriamento, temperatura acima do alvo gera erro positivo.
  float erro = temperatura - temperaturaDesejada;

  derivadaFiltrada =
      0.8f * derivadaFiltrada + 0.2f * derivada;

  float proporcional = kp * erro;
  float derivativo = kd * derivadaFiltrada;

  float integralCandidata =
      integralPID + ki * erro * dt;

  float saidaCandidata =
      proporcional + integralCandidata + derivativo;

  // Evita acumular integral no sentido da saturação.
  bool saturandoAcima =
      saidaCandidata > 100 && erro > 0;

  bool saturandoAbaixo =
      saidaCandidata < 0 && erro < 0;

  if (!saturandoAcima && !saturandoAbaixo) {
    integralPID = integralCandidata;
  }

  float saida = proporcional + integralPID + derivativo;

  return constrain(saida, 0.0f, 100.0f);
}

// ======================================================
// REQUISIÇÕES HTTPS
// ======================================================

int requisicao(
    const char* caminho,
    const char* metodo,
    const String& corpo,
    const String& token,
    String& resposta
) {
  WiFiClientSecure cliente;

  // Para demonstração em aula.
  // Desativa a verificação da identidade do servidor.
  cliente.setInsecure();

  HTTPClient http;
  http.setConnectTimeout(5000);
  http.setTimeout(5000);

  resposta = "";

  if (!http.begin(cliente, API + caminho)) {
    Serial.println("Não foi possível iniciar o HTTPS.");
    return -1;
  }

  http.addHeader("Accept", "application/json");

  if (!token.isEmpty()) {
    http.addHeader(
        "Authorization",
        String("Bearer ") + token
    );
  }

  int codigo;

  if (strcmp(metodo, "POST") == 0) {
    http.addHeader("Content-Type", "application/json");
    codigo = http.POST(corpo);
  } else {
    codigo = http.GET();
  }

  if (codigo > 0) {
    resposta = http.getString();
  } else {
    Serial.print("Falha de conexão: ");
    Serial.println(HTTPClient::errorToString(codigo));
  }

  http.end();
  return codigo;
}

// ======================================================
// LOGIN
// ======================================================

bool fazerLogin() {
  JsonDocument envio;
  envio["username"] = API_USUARIO;
  envio["password"] = API_SENHA;

  String corpo;
  serializeJson(envio, corpo);

  String resposta;

  int codigo = requisicao(
      "/login/",
      "POST",
      corpo,
      "",
      resposta
  );

  Serial.printf("Login: %d\n", codigo);

  if (codigo != 200) {
    if (codigo > 0) {
      Serial.println(resposta);
    }

    return false;
  }

  JsonDocument dados;

  if (deserializeJson(dados, resposta)) {
    Serial.println("Resposta de login inválida.");
    return false;
  }

  accessToken = dados["access"] | "";

  if (accessToken.isEmpty()) {
    Serial.println("A API não retornou o token access.");
    return false;
  }

  return true;
}

// ======================================================
// CONFIGURAÇÃO SALVA PELO MOBILE
// ======================================================

void consultarConfiguracao() {
  String resposta;

  int codigo = requisicao(
      "/limites/",
      "GET",
      "",
      accessToken,
      resposta
  );

  if (codigo == 401) {
    accessToken = "";
    return;
  }

  if (codigo != 200) {
    Serial.printf("Consulta de configuração: %d\n", codigo);

    if (codigo > 0) {
      Serial.println(resposta);
    }

    return;
  }

  JsonDocument dados;
  DeserializationError erro = deserializeJson(dados, resposta);

  bool camposValidos =
      !erro &&
      dados["temperatura_maxima"].is<float>() &&
      dados["umidade_minima"].is<float>() &&
      dados["kp"].is<float>() &&
      dados["ki"].is<float>() &&
      dados["kd"].is<float>();

  if (!camposValidos) {
    Serial.println(
        "Configuração inválida. A API deve retornar "
        "temperatura_maxima, umidade_minima, kp, ki e kd."
    );
    return;
  }

  float novaTemperatura =
      dados["temperatura_maxima"].as<float>();

  float novaUmidade =
      dados["umidade_minima"].as<float>();

  float novoKp = dados["kp"].as<float>();
  float novoKi = dados["ki"].as<float>();
  float novoKd = dados["kd"].as<float>();

  bool valoresValidos =
      isfinite(novaTemperatura) &&
      novaTemperatura >= -40 && novaTemperatura <= 80 &&
      isfinite(novaUmidade) &&
      novaUmidade >= 0 && novaUmidade <= 100 &&
      isfinite(novoKp) && novoKp >= 0 && novoKp <= 100 &&
      isfinite(novoKi) && novoKi >= 0 && novoKi <= 100 &&
      isfinite(novoKd) && novoKd >= 0 && novoKd <= 100;

  if (!valoresValidos) {
    Serial.println("Configuração fora dos limites permitidos.");
    return;
  }

  bool mudouPID =
      novaTemperatura != temperaturaDesejada ||
      novoKp != kp ||
      novoKi != ki ||
      novoKd != kd;

  temperaturaDesejada = novaTemperatura;
  umidadeMinima = novaUmidade;

  kp = novoKp;
  ki = novoKi;
  kd = novoKd;

  if (mudouPID) {
    reiniciarPID();

    Serial.printf(
        "Novo PID: alvo %.1f | Kp %.2f | Ki %.2f | Kd %.2f\n",
        temperaturaDesejada, kp, ki, kd
    );
  }
}

// ======================================================
// ENVIO DAS LEITURAS
// ======================================================

void enviarLeitura(
    float temperatura,
    float umidade,
    float potencia,
    bool ventiladorLigado,
    bool umidadeBaixa
) {
  String corpo = String("{\"temperatura\":")
      + String(temperatura, 2)
      + ",\"umidade\":" + String(umidade, 2)
      + ",\"ventilador_ligado\":"
      + (ventiladorLigado ? "true" : "false")
      + ",\"umidade_baixa\":"
      + (umidadeBaixa ? "true" : "false")
      + ",\"potencia_ventilador\":" + String(potencia, 2);

  struct tm horario;

  if (getLocalTime(&horario, 100)) {
    time_t agora = time(nullptr);
    gmtime_r(&agora, &horario);

    char timestamp[21];

    strftime(
        timestamp,
        sizeof(timestamp),
        "%Y-%m-%dT%H:%M:%SZ",
        &horario
    );

    corpo += String(",\"timestamp\":\"") + timestamp + "\"";
  } else {
    Serial.println(
        "Relógio sem sincronização. "
        "O servidor registrará o horário de recebimento."
    );
  }

  corpo += "}";

  String resposta;

  int codigo = requisicao(
      "/leituras/",
      "POST",
      corpo,
      accessToken,
      resposta
  );

  Serial.printf("Envio: %d\n", codigo);

  if (codigo > 0 && codigo != 201) {
    Serial.println(resposta);
  }

  if (codigo == 401) {
    accessToken = "";
  }
}

// ======================================================
// INICIALIZAÇÃO
// ======================================================

void setup() {
  Serial.begin(115200);

  pinMode(PINO_VENTILADOR, OUTPUT);
  pinMode(PINO_UMIDADE, OUTPUT);

  analogWrite(PINO_VENTILADOR, 0);
  digitalWrite(PINO_UMIDADE, LOW);

  dht.begin();

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_NOME, WIFI_SENHA);

  Serial.println("Conectando ao Wi-Fi...");
}

// ======================================================
// EXECUÇÃO
// ======================================================

void loop() {
  if (millis() - ultimoCiclo < INTERVALO_MS) {
    delay(20);
    return;
  }

  ultimoCiclo = millis();

  if (WiFi.status() == WL_CONNECTED) {
    if (!relogioIniciado) {
      configTime(0, 0, "pool.ntp.org", "time.google.com");
      relogioIniciado = true;

      Serial.println("Wi-Fi conectado.");
      Serial.println("Sincronização do relógio iniciada.");
    }

    if (accessToken.isEmpty()) {
      fazerLogin();
    }

    if (!accessToken.isEmpty()) {
      consultarConfiguracao();
    }
  } else {
    Serial.println("Wi-Fi desconectado. Mantendo controle local.");
  }

  // Marca o início da captura para respeitar o intervalo do DHT22.
  ultimoCiclo = millis();

  float temperatura = dht.readTemperature();
  float umidade = dht.readHumidity();

  if (isnan(temperatura) || isnan(umidade)) {
    analogWrite(PINO_VENTILADOR, 0);
    digitalWrite(PINO_UMIDADE, LOW);

    reiniciarPID();

    Serial.println("Falha no DHT22. Saídas desativadas.");
    return;
  }

  float potenciaCalculada = calcularPID(temperatura);

  int pwm = (int)roundf(
      potenciaCalculada * 255.0f / 100.0f
  );

  float potenciaAplicada = pwm * 100.0f / 255.0f;

  bool ventiladorLigado = pwm > 0;
  bool umidadeBaixa = umidade < umidadeMinima;

  analogWrite(PINO_VENTILADOR, pwm);

  digitalWrite(
      PINO_UMIDADE,
      umidadeBaixa ? HIGH : LOW
  );

  Serial.printf(
      "Temp: %.1f C | Alvo: %.1f C | PID: %.1f%% | "
      "Umidade: %.1f%% | Minima: %.1f%% | Saida umidade: %d\n",
      temperatura,
      temperaturaDesejada,
      potenciaAplicada,
      umidade,
      umidadeMinima,
      umidadeBaixa
  );

  if (WiFi.status() == WL_CONNECTED &&
      !accessToken.isEmpty()) {
    enviarLeitura(
        temperatura,
        umidade,
        potenciaAplicada,
        ventiladorLigado,
        umidadeBaixa
    );
  }
}