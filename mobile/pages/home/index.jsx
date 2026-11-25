import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import * as SecureStore from "expo-secure-store";
import Slider from "@react-native-community/slider";

import Svg, {
  Circle,
  Line,
  Polyline,
  Text as SvgText,
} from "react-native-svg";

import styles from "./styles";

const API = "https://marcelaconceicaosilva74.pythonanywhere.com/api";
const INTERVALO_MS = 3000;
const TEMPO_LIMITE_MS = 15000;

function formatarValor(valor) {
  return valor.toFixed(1).replace(".", ",");
}

function validarConfiguracao(dados) {
  return (
    Number.isFinite(dados.temperatura_maxima) &&
    dados.temperatura_maxima >= -40 &&
    dados.temperatura_maxima <= 80 &&
    Number.isFinite(dados.umidade_minima) &&
    dados.umidade_minima >= 0 &&
    dados.umidade_minima <= 100 &&
    [dados.kp, dados.ki, dados.kd].every(
      (valor) =>
        Number.isFinite(valor) &&
        valor >= 0 &&
        valor <= 100
    )
  );
}

async function requisicao(url, opcoes) {
  const controlador = new AbortController();

  const temporizador = setTimeout(() => {
    controlador.abort();
  }, TEMPO_LIMITE_MS);

  try {
    const resposta = await fetch(url, {
      ...opcoes,
      signal: controlador.signal,
    });

    // Lê o corpo ainda dentro do prazo da requisição.
    const texto = await resposta.text();

    return {
      ok: resposta.ok,
      status: resposta.status,
      texto,
    };
  } catch (erro) {
    if (erro.name === "AbortError") {
      throw new Error("O servidor demorou para responder. Tente novamente.");
    }

    throw erro;
  } finally {
    clearTimeout(temporizador);
  }
}

function interpretarJSON(resposta, caminho) {
  try {
    return JSON.parse(resposta.texto);
  } catch {
    throw new Error(
      `Resposta inválida em ${caminho}. HTTP ${resposta.status}`
    );
  }
}

function Grafico({ titulo, unidade, cor, valores, limite }) {
  if (valores.length === 0) {
    return (
      <View style={[styles.cartao, { marginBottom: 16 }]}>
        <Text style={styles.rotulo}>{titulo}</Text>
        <Text style={styles.estado}>Sem leituras</Text>
      </View>
    );
  }

  const ultimo = valores[valores.length - 1];
  const menor = Math.min(...valores);
  const maior = Math.max(...valores);
  const amplitude = maior - menor;

  const pontos = valores.map((valor, indice) => ({
    x:
      valores.length === 1
        ? 150
        : 10 + (indice * 280) / (valores.length - 1),

    y:
      amplitude === 0
        ? 70
        : 110 - ((valor - menor) / amplitude) * 80,
  }));

  const linha = pontos.map(({ x, y }) => `${x},${y}`).join(" ");
  const pontoFinal = pontos[pontos.length - 1];

  return (
    <View style={[styles.cartao, { marginBottom: 16 }]}>
      <Text style={styles.rotulo}>{titulo} atual</Text>

      <Text style={[styles.estado, { color: cor }]}>
        {formatarValor(ultimo)} {unidade}
      </Text>

      <Svg width="100%" height={120} viewBox="0 0 300 120">
        <SvgText
          x={290}
          y={13}
          textAnchor="end"
          fontSize={9}
          fill="#64748b"
        >
          {limite}
        </SvgText>

        <Line
          x1={10}
          y1={110}
          x2={290}
          y2={110}
          stroke="#cbd5e1"
        />

        {pontos.length > 1 && (
          <Polyline
            points={linha}
            fill="none"
            stroke={cor}
            strokeWidth={2.5}
          />
        )}

        <Circle
          cx={pontoFinal.x}
          cy={pontoFinal.y}
          r={4}
          fill={cor}
        />
      </Svg>

      <Text style={[styles.rotulo, { fontSize: 11 }]}>
        Mín. {formatarValor(menor)} {unidade}
      </Text>
    </View>
  );
}

function Indicador({ titulo, ativo, cor, descricao }) {
  const disponivel = typeof ativo === "boolean";

  let estado = "Aguardando informação do ESP32";

  if (disponivel) {
    estado = ativo ? "Acionado" : "Desativado";
  }

  return (
    <View
      style={{
        padding: 16,
        borderRadius: 12,
        backgroundColor: "#f1f5f9",
        marginTop: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            marginRight: 10,
            backgroundColor: ativo === true ? cor : "#94a3b8",
          }}
        />

        <Text
          style={{
            flex: 1,
            fontSize: 16,
            fontWeight: "bold",
            color: "#0f172a",
          }}
        >
          {titulo}
        </Text>
      </View>

      <Text style={{ color: "#475569", marginTop: 8 }}>
        {estado}
      </Text>

      <Text style={{ color: "#64748b", marginTop: 4 }}>
        {descricao}
      </Text>
    </View>
  );
}

export default function Home({ navigation }) {
  const tokens = useRef(null);
  const ocupado = useRef(false);
  const montado = useRef(false);

  const [leituras, setLeituras] = useState([]);

  const [temperaturaMaxima, setTemperaturaMaxima] = useState(20);
  const [umidadeMinima, setUmidadeMinima] = useState(30);

  const [kp, setKp] = useState("10");
  const [ki, setKi] = useState("0.2");
  const [kd, setKd] = useState("1");

  const [iniciando, setIniciando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [saindo, setSaindo] = useState(false);

  const [erroLeituras, setErroLeituras] = useState("");
  const [erroLimites, setErroLimites] = useState("");
  const [mensagem, setMensagem] = useState("");

  async function acessarAPI(caminho, method = "GET", body) {
    const sessao = tokens.current;

    if (!sessao?.access || !sessao?.refresh) {
      throw new Error("Sessão indisponível. Entre novamente.");
    }

    function enviar(access) {
      return requisicao(`${API}${caminho}`, {
        method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${access}`,
        },
        ...(body !== undefined && {
          body: JSON.stringify(body),
        }),
      });
    }

    let resposta = await enviar(sessao.access);

    if (resposta.status === 401) {
      const renovacao = await requisicao(`${API}/refresh/`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          refresh: sessao.refresh,
        }),
      });

      if (renovacao.status === 400 || renovacao.status === 401) {
        await SecureStore.deleteItemAsync("tokens");
        tokens.current = null;

        if (montado.current) {
          navigation.replace("Login");
        }

        throw new Error("Sessão expirada. Entre novamente.");
      }

      if (!renovacao.ok) {
        throw new Error(
          `Falha ao renovar a sessão. HTTP ${renovacao.status}`
        );
      }

      const dadosRenovacao = interpretarJSON(
        renovacao,
        "/refresh/"
      );

      if (
        typeof dadosRenovacao.access !== "string" ||
        !dadosRenovacao.access
      ) {
        throw new Error("A API não retornou um novo token de acesso.");
      }

      const novosTokens = {
        access: dadosRenovacao.access,
        refresh: dadosRenovacao.refresh || sessao.refresh,
      };

      await SecureStore.setItemAsync(
        "tokens",
        JSON.stringify(novosTokens)
      );

      tokens.current = novosTokens;
      resposta = await enviar(novosTokens.access);
    }

    const dados = interpretarJSON(resposta, caminho);

    if (!resposta.ok) {
      throw new Error(
        dados?.detail ||
          dados?.erro ||
          `Erro em ${caminho}. HTTP ${resposta.status}: ${JSON.stringify(dados)}`
      );
    }

    return dados;
  }

  async function atualizarLeituras() {
    const dados = await acessarAPI("/leituras/");

    if (!Array.isArray(dados)) {
      throw new Error("A API retornou um formato de leituras inválido.");
    }

    const registros = dados.slice(0, 100).map((leitura) => ({
      ...leitura,
      temperatura: Number(leitura.temperatura),
      umidade: Number(leitura.umidade),
    }));

    const valoresValidos = registros.every(
      (leitura) =>
        Number.isFinite(leitura.temperatura) &&
        Number.isFinite(leitura.umidade)
    );

    if (!valoresValidos) {
      throw new Error("A API retornou valores de leitura inválidos.");
    }

    if (montado.current) {
      // A API envia da mais recente para a mais antiga.
      // O gráfico apresenta da mais antiga para a mais recente.
      setLeituras(registros.reverse());
      setErroLeituras("");
    }
  }

  function aplicarConfiguracao(dados) {
    setTemperaturaMaxima(dados.temperatura_maxima);
    setUmidadeMinima(dados.umidade_minima);

    setKp(String(dados.kp));
    setKi(String(dados.ki));
    setKd(String(dados.kd));
  }

  async function carregarLimites() {
    const dados = await acessarAPI("/limites/");

    if (!validarConfiguracao(dados)) {
      throw new Error(
        "A API precisa retornar temperatura_maxima, umidade_minima, kp, ki e kd válidos."
      );
    }

    if (montado.current) {
      aplicarConfiguracao(dados);
      setErroLimites("");
    }
  }

  useEffect(() => {
    montado.current = true;
    let ativo = true;

    async function iniciar() {
      ocupado.current = true;

      try {
        const salvo = await SecureStore.getItemAsync("tokens");

        if (!ativo) {
          return;
        }

        const sessao = salvo ? JSON.parse(salvo) : null;

        if (!sessao?.access || !sessao?.refresh) {
          navigation.replace("Login");
          return;
        }

        tokens.current = sessao;

        try {
          await atualizarLeituras();
        } catch (erro) {
          if (ativo) {
            setErroLeituras(erro.message);
          }
        }

        if (ativo && tokens.current) {
          try {
            await carregarLimites();
          } catch (erro) {
            if (ativo) {
              setErroLimites(erro.message);
            }
          }
        }
      } catch (erro) {
        if (ativo) {
          Alert.alert("Falha ao iniciar", erro.message);
        }
      } finally {
        if (ativo) {
          ocupado.current = false;
          setIniciando(false);
        }
      }
    }

    iniciar();

    const intervalo = setInterval(async () => {
      if (!ativo || ocupado.current || !tokens.current) {
        return;
      }

      ocupado.current = true;

      try {
        await atualizarLeituras();
      } catch (erro) {
        if (ativo) {
          setErroLeituras(erro.message);
        }
      } finally {
        if (ativo) {
          ocupado.current = false;
        }
      }
    }, INTERVALO_MS);

    return () => {
      ativo = false;
      montado.current = false;
      clearInterval(intervalo);
    };
  }, [navigation]);

  async function salvarLimites() {
    if (ocupado.current) {
      Alert.alert("Aguarde", "Há uma atualização em andamento.");
      return;
    }

    const textos = [kp, ki, kd];

    const ganhos = textos.map((texto) =>
      Number(texto.trim().replace(",", "."))
    );

    const camposPreenchidos = textos.every(
      (texto) => texto.trim() !== ""
    );

    const configuracao = {
      temperatura_maxima: temperaturaMaxima,
      umidade_minima: umidadeMinima,
      kp: ganhos[0],
      ki: ganhos[1],
      kd: ganhos[2],
    };

    if (!camposPreenchidos || !validarConfiguracao(configuracao)) {
      Alert.alert(
        "Configuração inválida",
        "Preencha Kp, Ki e Kd com números entre 0 e 100."
      );
      return;
    }

    ocupado.current = true;
    setSalvando(true);
    setMensagem("");

    try {
      const dados = await acessarAPI(
        "/limites/",
        "POST",
        configuracao
      );

      if (!validarConfiguracao(dados)) {
        throw new Error(
          "A API não confirmou todos os parâmetros do PID. Confira o back-end."
        );
      }

      if (montado.current) {
        aplicarConfiguracao(dados);
        setErroLimites("");
        setMensagem(
          "Configuração salva. Aguarde a próxima leitura do ESP32."
        );
      }
    } catch (erro) {
      if (montado.current) {
        setErroLimites(erro.message);
      }
    } finally {
      ocupado.current = false;

      if (montado.current) {
        setSalvando(false);
      }
    }
  }

  async function sair() {
    if (ocupado.current) {
      Alert.alert("Aguarde", "Há uma atualização em andamento.");
      return;
    }

    ocupado.current = true;
    setSaindo(true);

    try {
      await SecureStore.deleteItemAsync("tokens");
      tokens.current = null;

      if (montado.current) {
        navigation.replace("Login");
      }
    } catch (erro) {
      if (montado.current) {
        Alert.alert("Erro ao sair", erro.message);
      }
    } finally {
      ocupado.current = false;

      if (montado.current) {
        setSaindo(false);
      }
    }
  }

  const ultimaLeitura = leituras[leituras.length - 1];

  const horario =
    ultimaLeitura?.timestamp || ultimaLeitura?.recebida_em;

  const potencia = ultimaLeitura?.potencia_ventilador;

  const potenciaDisponivel =
    typeof potencia === "number" &&
    Number.isFinite(potencia) &&
    potencia >= 0 &&
    potencia <= 100;

  const controlesDesabilitados = iniciando || salvando || saindo;

  const camposPID = [
    { nome: "Kp", valor: kp, alterar: setKp },
    { nome: "Ki", valor: ki, alterar: setKi },
    { nome: "Kd", valor: kd, alterar: setKd },
  ];

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: "#f1f5f9",
      }}
      contentContainerStyle={{
        padding: 24,
        paddingTop: 48,
        paddingBottom: 40,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Image
        source={require("../../assets/senai.png")}
        style={{
          width: "100%",
          height: 80,
          alignSelf: "center",
          marginBottom: 16,
        }}
        resizeMode="contain"
        accessibilityLabel="SENAI"
      />

      <Text style={styles.titulo}>Meu ESP32</Text>

      <Text style={styles.subtitulo}>
        {horario
          ? `Última leitura: ${new Date(horario).toLocaleString("pt-BR")}`
          : iniciando
            ? "Carregando leituras..."
            : "Aguardando leituras do ESP32"}
      </Text>

      {erroLeituras !== "" && (
        <Text style={styles.aviso}>
          Falha ao atualizar: {erroLeituras}
        </Text>
      )}

      <Grafico
        titulo="Temperatura"
        unidade="°C"
        cor="#b91c1c"
        valores={leituras.map((leitura) => leitura.temperatura)}
        limite={`Máx. ${formatarValor(temperaturaMaxima)} °C`}
      />

      <Grafico
        titulo="Umidade"
        unidade="%"
        cor="#2563eb"
        valores={leituras.map((leitura) => leitura.umidade)}
        limite={`Mín. ${formatarValor(umidadeMinima)}%`}
      />

      <View style={styles.cartao}>
        <Text style={styles.estado}>Controle automático</Text>

        <Text style={[styles.rotulo, { marginTop: 24 }]}>
          Temperatura desejada
        </Text>

        <Text style={[styles.estado, { color: "#b91c1c" }]}>
          {formatarValor(temperaturaMaxima)} °C
        </Text>

        <Slider
          minimumValue={-40}
          maximumValue={80}
          step={1}
          value={temperaturaMaxima}
          disabled={controlesDesabilitados}
          onValueChange={(valor) => {
            setTemperaturaMaxima(valor);
            setMensagem("");
          }}
          minimumTrackTintColor="#b91c1c"
          maximumTrackTintColor="#cbd5e1"
          thumbTintColor="#b91c1c"
          accessibilityLabel="Temperatura desejada"
        />

        <Text style={styles.rotulo}>
          O PID ajusta a potência da saída de resfriamento.
        </Text>

        <Text style={[styles.rotulo, { marginTop: 24 }]}>
          Umidade mínima
        </Text>

        <Text style={[styles.estado, { color: "#2563eb" }]}>
          {formatarValor(umidadeMinima)}%
        </Text>

        <Slider
          minimumValue={0}
          maximumValue={100}
          step={1}
          value={umidadeMinima}
          disabled={controlesDesabilitados}
          onValueChange={(valor) => {
            setUmidadeMinima(valor);
            setMensagem("");
          }}
          minimumTrackTintColor="#2563eb"
          maximumTrackTintColor="#cbd5e1"
          thumbTintColor="#2563eb"
          accessibilityLabel="Umidade mínima"
        />

        <Text style={styles.rotulo}>
          A saída de umidade é acionada abaixo deste valor.
        </Text>

        <Text style={[styles.estado, { marginTop: 24 }]}>
          Ajustes do PID
        </Text>

        <View
          style={{
            flexDirection: "row",
            marginTop: 12,
          }}
        >
          {camposPID.map((campo) => (
            <View
              key={campo.nome}
              style={{
                flex: 1,
                marginHorizontal: 4,
              }}
            >
              <Text style={styles.rotulo}>{campo.nome}</Text>

              <TextInput
                value={campo.valor}
                onChangeText={(texto) => {
                  campo.alterar(texto);
                  setMensagem("");
                }}
                keyboardType="decimal-pad"
                editable={!controlesDesabilitados}
                accessibilityLabel={`Ganho ${campo.nome}`}
                style={{
                  borderWidth: 1,
                  borderColor: "#cbd5e1",
                  borderRadius: 8,
                  paddingHorizontal: 6,
                  paddingVertical: 12,
                  marginTop: 6,
                  textAlign: "center",
                  color: "#0f172a",
                  backgroundColor: "#fff",
                  fontSize: 16,
                }}
              />
            </View>
          ))}
        </View>

        <TouchableOpacity
          onPress={salvarLimites}
          disabled={controlesDesabilitados}
          accessibilityRole="button"
          style={{
            backgroundColor: "#2563eb",
            padding: 16,
            borderRadius: 10,
            marginTop: 24,
            opacity: controlesDesabilitados ? 0.5 : 1,
          }}
        >
          <Text
            style={{
              color: "#fff",
              textAlign: "center",
              fontWeight: "bold",
              fontSize: 16,
            }}
          >
            {iniciando
              ? "Carregando..."
              : salvando
                ? "Salvando..."
                : "Salvar configuração"}
          </Text>
        </TouchableOpacity>

        {erroLimites !== "" && (
          <Text style={{ color: "#b91c1c", marginTop: 12 }}>
            {erroLimites}
          </Text>
        )}

        {mensagem !== "" && (
          <Text style={{ color: "#475569", marginTop: 12 }}>
            {mensagem}
          </Text>
        )}

        <View style={{ marginTop: 24 }}>
          <Text style={styles.rotulo}>
            Potência aplicada pelo PID
          </Text>

          <Text style={[styles.estado, { color: "#b91c1c" }]}>
            {potenciaDisponivel
              ? `${formatarValor(potencia)}%`
              : "Aguardando ESP32"}
          </Text>

          <View
            style={{
              height: 12,
              backgroundColor: "#e2e8f0",
              borderRadius: 6,
              overflow: "hidden",
              marginTop: 10,
            }}
          >
            <View
              style={{
                width: `${potenciaDisponivel ? potencia : 0}%`,
                height: "100%",
                backgroundColor: "#dc2626",
              }}
            />
          </View>
        </View>

        <Indicador
          titulo="Ventilador"
          ativo={ultimaLeitura?.ventilador_ligado}
          cor="#dc2626"
          descricao="Saída PWM do PID de temperatura."
        />

        <Indicador
          titulo="Saída de umidade baixa"
          ativo={ultimaLeitura?.umidade_baixa}
          cor="#2563eb"
          descricao="Controle pelo limite mínimo de umidade."
        />

        <Text style={[styles.rotulo, { marginTop: 16 }]}>
          Os indicadores e a potência correspondem à última leitura
          recebida do ESP32.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.botaoSair}
        onPress={sair}
        disabled={controlesDesabilitados}
        accessibilityRole="button"
      >
        <Text style={styles.textoSair}>
          {saindo ? "Saindo..." : "Sair"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}