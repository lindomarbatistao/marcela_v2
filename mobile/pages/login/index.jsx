import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";

import * as SecureStore from "expo-secure-store";

import styles from "./styles.js";

const URL_LOGIN =
  "https://marcelaconceicaosilva74.pythonanywhere.com/api/login/";

export default function Login({ navigation }) {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function entrar() {
    if (carregando) {
      return;
    }

    if (!usuario.trim() || !senha.trim()) {
      Alert.alert("Atenção", "Preencha o usuário e a senha.");
      return;
    }

    setCarregando(true);

    try {
      // Envia as credenciais para a API.
      const resposta = await fetch(URL_LOGIN, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          username: usuario.trim(),
          password: senha,
        }),
      });

      // Verifica se a API retornou um JSON válido.
      let dados;

      try {
        dados = await resposta.json();
      } catch {
        throw new Error(
          `A API retornou uma resposta inválida (HTTP ${resposta.status}).`
        );
      }

      // Trata erros de autenticação ou do servidor.
      if (!resposta.ok) {
        const mensagem =
          typeof dados?.detail === "string"
            ? dados.detail
            : resposta.status === 400 || resposta.status === 401
              ? "Verifique o usuário e a senha."
              : `Não foi possível entrar (HTTP ${resposta.status}).`;

        throw new Error(mensagem);
      }

      // Captura os dois tokens retornados pela API.
      const { access, refresh } = dados ?? {};

      if (
        typeof access !== "string" ||
        !access ||
        typeof refresh !== "string" ||
        !refresh
      ) {
        throw new Error(
          "A API não retornou os tokens access e refresh esperados."
        );
      }

      // Guarda os tokens juntos no celular.
      await SecureStore.setItemAsync(
        "tokens",
        JSON.stringify({ access, refresh })
      );

      // Abre a Home após salvar os tokens.
      navigation.replace("Home");
    } catch (erro) {
      Alert.alert(
        "Erro ao entrar",
        erro instanceof Error
          ? erro.message
          : "Não foi possível conectar à API."
      );
    } finally {
      setCarregando(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.formulario}>
        <Text style={styles.titulo}>Bem-vindo!</Text>

        <Text style={styles.subtitulo}>
          Informe seus dados para entrar.
        </Text>

        <Text style={styles.label}>Usuário</Text>

        <TextInput
          style={styles.input}
          placeholder="Digite seu usuário"
          placeholderTextColor="#888"
          value={usuario}
          onChangeText={setUsuario}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!carregando}
        />

        <Text style={styles.label}>Senha</Text>

        <TextInput
          style={styles.input}
          placeholder="Digite sua senha"
          placeholderTextColor="#888"
          value={senha}
          onChangeText={setSenha}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!carregando}
          onSubmitEditing={entrar}
          returnKeyType="go"
        />

        <TouchableOpacity
          style={[
            styles.botao,
            carregando && { opacity: 0.6 },
          ]}
          onPress={entrar}
          activeOpacity={0.8}
          disabled={carregando}
        >
          <Text style={styles.textoBotao}>
            {carregando ? "Entrando..." : "Entrar"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}