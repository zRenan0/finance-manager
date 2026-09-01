"use strict";

// GERADOR DO /.well-known/security.txt (RFC 9116) — M21.
//
// POR QUE GERADO, E NÃO UM ARQUIVO COMMITADO
//
// O campo `Expires` é obrigatório e a norma manda que ele fique a menos de um
// ano no futuro; um arquivo estático no repositório vira inválido sozinho, em
// silêncio, e um pesquisador que o encontrar expirado tem motivo para tratar o
// canal como abandonado. Gerando no build, cada publicação renova o prazo.
//
// POR QUE O `Contact` APONTA PARA UMA PÁGINA, E NÃO PARA UM EMAIL
//
// A RFC aceita qualquer URI em `Contact`, inclusive uma página. Aqui isso não é
// preferência: os sete campos de `LEGAL_CONTROLLER` ainda são marcadores (ver
// docs/LEGAL-LAUNCH.md) e não existe endereço de incidentes publicado. Inventar
// um seria pior que não ter — o relato cairia no vazio. A página existe, diz por
// onde falar e continua correta quando o email for definido.
//
// Quando `incidentEmail` deixar de ser marcador, ele entra como `Contact:
// mailto:` ANTES da página, sem mudar mais nada aqui.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

const CAMINHO_PAGINA = "/reportar-vulnerabilidade";
const CAMINHO_ARQUIVO = ".well-known/security.txt";
const REPOSITORIO = "https://github.com/zRenan0/finance-manager";
const AVISO_GITHUB = `${REPOSITORIO}/security/advisories/new`;
const IDIOMAS = "pt-BR, en";
const VALIDADE_DIAS = 180;

// Lê `LEGAL_CONTROLLER` do mesmo lugar que a tela de Privacidade usa, em vez de
// repetir o endereço aqui. Uma cópia a mais seria mais uma coisa para divergir.
function controlador() {
  const ctx = {
    console, module: { exports: {} }, setTimeout, clearTimeout,
    indexedDB: undefined, localStorage: undefined,
    document: { addEventListener() {}, visibilityState: "visible" },
    navigator: { userAgent: "node" }, addEventListener() {}, removeEventListener() {},
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  ["js/utils.js", "js/rules.js", "js/layout.js", "js/storage.js"].forEach((arquivo) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, arquivo), "utf8"), ctx, { filename: arquivo });
  });
  return {
    incidentEmail: vm.runInContext("LEGAL_CONTROLLER.incidentEmail", ctx),
    marcador: vm.runInContext("LEGAL_PENDING", ctx),
  };
}

function emailPublicavel(dados) {
  const valor = String(dados.incidentEmail || "").trim();
  if (!valor || valor === dados.marcador) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor) ? valor : "";
}

// `base` é a origem do site (build-dist já resolve SITE_URL / VERCEL_*).
// `agora` entra por parâmetro para o teste poder fixar a data.
function gerarSecurityTxt(base, agora = new Date()) {
  const origem = String(base || "").replace(/\/+$/, "");
  if (!origem) return "";

  const expira = new Date(agora.getTime() + VALIDADE_DIAS * 24 * 60 * 60 * 1000);
  const email = emailPublicavel(controlador());

  const linhas = [
    "# Cofre / FinanceManager — divulgação responsável de vulnerabilidades.",
    "# Gerado no build. Não edite à mão: veja scripts/security-txt.js.",
    "",
  ];
  if (email) linhas.push(`Contact: mailto:${email}`);
  linhas.push(`Contact: ${origem}${CAMINHO_PAGINA}`);
  linhas.push(`Contact: ${AVISO_GITHUB}`);
  linhas.push(`Expires: ${expira.toISOString().replace(/\.\d{3}Z$/, "Z")}`);
  linhas.push(`Preferred-Languages: ${IDIOMAS}`);
  linhas.push(`Canonical: ${origem}/${CAMINHO_ARQUIVO}`);
  linhas.push(`Policy: ${origem}${CAMINHO_PAGINA}`);
  linhas.push("");
  return linhas.join("\n");
}

// Escreve dentro de `dist/`. Sem base resolvida não escreve nada: um
// security.txt com URI relativa é inválido pela norma, e publicar inválido é
// pior que não publicar.
function escreverEmDist(dist, base, agora = new Date()) {
  const conteudo = gerarSecurityTxt(base, agora);
  if (!conteudo) return { escrito: false, motivo: "base do site não resolvida" };
  const alvo = path.join(dist, CAMINHO_ARQUIVO);
  fs.mkdirSync(path.dirname(alvo), { recursive: true });
  fs.writeFileSync(alvo, conteudo);
  return { escrito: true, caminho: CAMINHO_ARQUIVO, expira: /Expires: (.+)/.exec(conteudo)[1] };
}

module.exports = {
  gerarSecurityTxt,
  escreverEmDist,
  emailPublicavel,
  controlador,
  CAMINHO_PAGINA,
  CAMINHO_ARQUIVO,
  AVISO_GITHUB,
  REPOSITORIO,
  VALIDADE_DIAS,
};
