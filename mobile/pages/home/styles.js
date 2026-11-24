import { StyleSheet } from "react-native";

export default StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f1f5f9",
  },

  titulo: {
    fontSize: 30,
    fontWeight: "bold",
    color: "#0f172a",
    textAlign: "center",
  },

  subtitulo: {
    fontSize: 16,
    color: "#64748b",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
  },

  cartao: {
    backgroundColor: "#ffffff",
    padding: 24,
    borderRadius: 16,
  },

  led: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignSelf: "center",
    marginBottom: 20,
  },

  ledLigado: {
    backgroundColor: "#22c55e",
  },

  ledDesligado: {
    backgroundColor: "#64748b",
  },

  ledDesconhecido: {
    backgroundColor: "#cbd5e1",
  },

  rotulo: {
    textAlign: "center",
    color: "#64748b",
    fontSize: 14,
  },

  estado: {
    textAlign: "center",
    fontSize: 22,
    fontWeight: "bold",
    color: "#0f172a",
    marginTop: 8,
  },

  aviso: {
    textAlign: "center",
    color: "#64748b",
    lineHeight: 20,
    marginTop: 12,
    marginBottom: 24,
  },

  botao: {
    padding: 16,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 12,
  },

  botaoLigar: {
    backgroundColor: "#15803d",
  },

  botaoDesligar: {
    backgroundColor: "#b91c1c",
  },

  botaoConsultar: {
    backgroundColor: "#2563eb",
  },

  textoBotao: {
    color: "#ffffff",
    fontWeight: "bold",
    fontSize: 16,
  },

  desabilitado: {
    opacity: 0.5,
  },

  carregando: {
    marginTop: 12,
  },

  botaoSair: {
    padding: 16,
    alignItems: "center",
    marginTop: 12,
  },

  textoSair: {
    color: "#b91c1c",
    fontSize: 16,
    fontWeight: "bold",
  },
});