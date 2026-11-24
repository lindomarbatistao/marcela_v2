#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <time.h>

const char* WIFI_NOME = "WIFI_EDUC_CFP501";
const char* WIFI_SENHA = "w1f1educ@501";

const char* API_USUARIO = "marcela";
const char* API_SENHA = "123456";

const String API =
    "https://marcelaconceicaosilva74.pythonanywhere.com/api";

const unsigned long INTERVALO_MS = 2000;

const int PINO_VENTILADOR = 2;
const int PINO_UMIDADE = 26;

float temperaturaMaxima = 20;
float umidadeMinima = 30;

DHT dht(4, DHT22);
String accessToken;
unsigned long ultimoCiclo = 0;
bool relogioIniciado = false;

int enviarPost(const char* caminho, const String& corpo,
              const String& token, String& resposta) {
  WiFiClientSecure cliente;
  cliente.setInsecure();  // Para demonstração em aula.

  HTTPClient http;
  http.setConnectTimeout(10000);
  http.setTimeout(10000);

  resposta = "";

  if (!http.begin(cliente, API + caminho)) {
    Serial.println("Não foi possível iniciar o HTTPS.");
    return -1;
  }

  http.addHeader("Accept", "application/json");
  http.addHeader("Content-Type", "application/json");

  if (!token.isEmpty()) {
    http.addHeader("Authorization", String("Bearer ") + token);
  }

  int codigo = http.POST(corpo);

  if (codigo > 0) {
    resposta = http.getString();
  } else {
    Serial.println(HTTPClient::errorToString(codigo));
  }

  http.end();
  return codigo;
}

bool fazerLogin() {
  JsonDocument dados;
  dados["username"] = API_USUARIO;
  dados["password"] = API_SENHA;

  String corpo;
  serializeJson(dados, corpo);

  String resposta;
  int codigo = enviarPost("/login/", corpo, "", resposta);
  Serial.printf("Login: %d\n", codigo);

  if (codigo != 200) {
    if (codigo > 0) {
      Serial.println(resposta);
    }
    return false;
  }

  if (deserializeJson(dados, resposta)) {
    Serial.println("Resposta de login inválida.");
    return false;
  }

  accessToken = dados["access"] | "";

  if (accessToken.isEmpty()) {
    Serial.println("A API não retornou o token de acesso.");
    return false;
  }

  return true;
}

void consultarLimites() {
  WiFiClientSecure cliente;
  cliente.setInsecure();

  HTTPClient http;
  http.setConnectTimeout(5000);
  http.setTimeout(5000);

  if (!http.begin(cliente, API + "/limites/")) {
    return;
  }

  http.addHeader("Authorization", String("Bearer ") + accessToken);

  int codigo = http.GET();

  if (codigo == 200) {
    JsonDocument dados;

    if (!deserializeJson(dados, http.getString())) {
      if (dados["temperatura_maxima"].is<float>() &&
          dados["umidade_minima"].is<float>()) {
        temperaturaMaxima = dados["temperatura_maxima"].as<float>();
        umidadeMinima = dados["umidade_minima"].as<float>();
      }
    }
  }

  if (codigo == 401) {
    accessToken = "";
  }

  http.end();
}

void setup() {
  Serial.begin(115200);
  dht.begin();

  pinMode(PINO_VENTILADOR, OUTPUT);
  pinMode(PINO_UMIDADE, OUTPUT);

  digitalWrite(PINO_VENTILADOR, LOW);
  digitalWrite(PINO_UMIDADE, LOW);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_NOME, WIFI_SENHA);

  Serial.println("Conectando ao Wi-Fi...");
}

void loop() {
  if (millis() - ultimoCiclo < INTERVALO_MS) {
    delay(20);
    return;
  }

  ultimoCiclo = millis();

  // O controle local continua com os últimos limites conhecidos.
  if (WiFi.status() == WL_CONNECTED) {
    if (!relogioIniciado) {
      configTime(0, 0, "pool.ntp.org", "time.google.com");
      relogioIniciado = true;
    }

    if (accessToken.isEmpty()) {
      fazerLogin();
    }

    if (!accessToken.isEmpty()) {
      consultarLimites();
    }
  }

  float temperatura = dht.readTemperature();
  float umidade = dht.readHumidity();

  if (isnan(temperatura) || isnan(umidade)) {
    digitalWrite(PINO_VENTILADOR, LOW);
    digitalWrite(PINO_UMIDADE, LOW);
    Serial.println("Falha ao ler o DHT22. Saídas desativadas.");
    return;
  }

  bool ventiladorLigado = temperatura > temperaturaMaxima;
  bool umidadeBaixa = umidade < umidadeMinima;

  digitalWrite(PINO_VENTILADOR, ventiladorLigado ? HIGH : LOW);
  digitalWrite(PINO_UMIDADE, umidadeBaixa ? HIGH : LOW);

  Serial.printf(
      "Temperatura: %.1f | Umidade: %.1f | Ventilador: %d | Umidade baixa: %d\n",
      temperatura, umidade, ventiladorLigado, umidadeBaixa
  );

  if (WiFi.status() != WL_CONNECTED || accessToken.isEmpty()) {
    return;
  }

  struct tm horario;
  if (!getLocalTime(&horario, 100)) {
    Serial.println("Aguardando relógio para enviar a leitura.");
    return;
  }

  time_t agora = time(nullptr);
  gmtime_r(&agora, &horario);

  char timestamp[21];
  strftime(timestamp, sizeof(timestamp), "%Y-%m-%dT%H:%M:%SZ", &horario);

  String corpo = String("{\"temperatura\":") + String(temperatura, 2)
      + ",\"umidade\":" + String(umidade, 2)
      + ",\"timestamp\":\"" + timestamp + "\""
      + ",\"ventilador_ligado\":" + (ventiladorLigado ? "true" : "false")
      + ",\"umidade_baixa\":" + (umidadeBaixa ? "true" : "false")
      + "}";

  String resposta;
  int codigo = enviarPost("/leituras/", corpo, accessToken, resposta);

  Serial.printf("Envio: %d\n", codigo);

  if (codigo > 0) {
    Serial.println(resposta);
  }

  if (codigo == 401) {
    accessToken = "";
  }
}