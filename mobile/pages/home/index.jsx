import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import * as SecureStore from "expo-secure-store";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import Slider from "@react-native-community/slider";

import styles from "./styles";

const API = "https://marcelaconceicaosilva74.pythonanywhere.com/api";
const INTERVALO_MS = 3000;

function formatarValor(valor) {
  return valor.toFixed(1).replace(".", ",");
}

function Grafico({ titulo, unidade, cor, valores }) {
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
        ? 60
        : 110 - ((valor - menor) / amplitude) * 100,
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

      <Text style={styles.rotulo}>
        Mín. {formatarValor(menor)} {unidade}
        {"  ·  "}
        Máx. {formatarValor(maior)} {unidade}
      </Text>
    </View>
  );
}

function Indicador({ titulo, ativo, cor, descricao }) {
  const disponivel = typeof ativo === "boolean";

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
            backgroundColor:
              disponivel && ativo ? cor : "#94a3b8",
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
        {disponivel
          ? ativo
            ? "Acionado"
            : "Desativado"
          : "Aguardando informação do ESP32"}
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
      return fetch(`${API}${caminho}`, {
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
      const renovacao = await fetch(`${API}/refresh/`, {
        method: "POST",
        headers: {
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

      const dadosRenovacao = await renovacao.json();

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

    const dados = await resposta.json().catch(() => {
      throw new Error(
        `Resposta inválida da API. HTTP ${resposta.status}`
      );
    });

    if (!resposta.ok) {
      throw new Error(
        dados.detail ||
          dados.erro ||
          `Erro HTTP ${resposta.status}: ${JSON.stringify(dados)}`
      );
    }

    return dados;
  }

  async function atualizarLeituras() {
    const dados = await acessarAPI("/leituras/");

    if (!Array.isArray(dados)) {
      throw new Error("A API retornou um formato de leituras inválido.");
    }

    const registros = dados.map((leitura) => ({
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
      // A API retorna da mais recente para a mais antiga.
      // Os gráficos mostram da mais antiga para a mais recente.
      setLeituras(registros.slice(0, 100).reverse());
      setErroLeituras("");
    }
  }

  async function carregarLimites() {
    const dados = await acessarAPI("/limites/");

    const temperatura = Number(dados.temperatura_maxima);
    const umidade = Number(dados.umidade_minima);

    if (
      !Number.isFinite(temperatura) ||
      temperatura < -40 ||
      temperatura > 80 ||
      !Number.isFinite(umidade) ||
      umidade < 0 ||
      umidade > 100
    ) {
      throw new Error("A API retornou limites inválidos.");
    }

    if (montado.current) {
      setTemperaturaMaxima(temperatura);
      setUmidadeMinima(umidade);
      setErroLimites("");
    }
  }

  useEffect(() => {
    montado.current = true;

    async function iniciar() {
      ocupado.current = true;

      try {
        const salvo = await SecureStore.getItemAsync("tokens");
        const sessao = salvo ? JSON.parse(salvo) : null;

        if (!sessao?.access || !sessao?.refresh) {
          navigation.replace("Login");
          return;
        }

        tokens.current = sessao;

        try {
          await atualizarLeituras();
        } catch (erro) {
          if (montado.current) {
            setErroLeituras(erro.message);
          }
        }

        if (montado.current && tokens.current) {
          try {
            await carregarLimites();
          } catch (erro) {
            if (montado.current) {
              setErroLimites(erro.message);
            }
          }
        }
      } catch (erro) {
        if (montado.current) {
          Alert.alert("Falha ao iniciar", erro.message);
        }
      } finally {
        ocupado.current = false;

        if (montado.current) {
          setIniciando(false);
        }
      }
    }

    iniciar();

    const intervalo = setInterval(async () => {
      if (
        !montado.current ||
        ocupado.current ||
        !tokens.current
      ) {
        return;
      }

      ocupado.current = true;

      try {
        await atualizarLeituras();
      } catch (erro) {
        if (montado.current) {
          setErroLeituras(erro.message);
        }
      } finally {
        ocupado.current = false;
      }
    }, INTERVALO_MS);

    return () => {
      montado.current = false;
      clearInterval(intervalo);
    };
  }, [navigation]);

  async function salvarLimites() {
    if (ocupado.current) {
      Alert.alert("Aguarde", "Há uma atualização em andamento.");
      return;
    }

    ocupado.current = true;
    setSalvando(true);
    setMensagem("");

    try {
      await acessarAPI("/limites/", "POST", {
        temperatura_maxima: temperaturaMaxima,
        umidade_minima: umidadeMinima,
      });

      if (montado.current) {
        setErroLimites("");
        setMensagem(
          "Limites salvos. Aguarde a próxima leitura do ESP32."
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
      navigation.replace("Login");
    } catch (erro) {
      Alert.alert("Erro ao sair", erro.message);
    } finally {
      ocupado.current = false;

      if (montado.current) {
        setSaindo(false);
      }
    }
  }

  const ultimaLeitura = leituras[leituras.length - 1];
  const horario = ultimaLeitura?.timestamp || ultimaLeitura?.recebida_em;
  const controlesDesabilitados = iniciando || salvando || saindo;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#f1f5f9" }}
      contentContainerStyle={{
        padding: 24,
        paddingTop: 48,
        paddingBottom: 40,
      }}
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
      />

      <Grafico
        titulo="Umidade"
        unidade="%"
        cor="#2563eb"
        valores={leituras.map((leitura) => leitura.umidade)}
      />

      <View style={styles.cartao}>
        <Text style={styles.estado}>Controle automático</Text>

        <Text style={[styles.rotulo, { marginTop: 24 }]}>
          Temperatura máxima
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
          accessibilityLabel="Temperatura máxima"
        />

        <Text style={styles.rotulo}>
          Aciona o ventilador acima deste valor.
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
          Aciona a saída de umidade abaixo deste valor.
        </Text>

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
                : "Salvar limites"}
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

        <Indicador
          titulo="Ventilador"
          ativo={ultimaLeitura?.ventilador_ligado}
          cor="#dc2626"
          descricao="Temperatura acima do limite configurado."
        />

        <Indicador
          titulo="Saída de umidade baixa"
          ativo={ultimaLeitura?.umidade_baixa}
          cor="#2563eb"
          descricao="Umidade abaixo do limite configurado."
        />

        <Text style={[styles.rotulo, { marginTop: 16 }]}>
          Os indicadores mostram o estado informado pelo ESP32
          na última leitura.
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