// router.js; endereço da tela e pilha de camadas sobrepostas
// ------------------------------------------------------------------
// Até aqui `state.tab` era a única fonte da tela aberta e ela não existia em
// lugar nenhum fora da memória. Três consequências, todas visíveis em produção:
//
//   1. No Android, com o PWA instalado, o botão voltar do aparelho FECHAVA o
//      app em vez de voltar de tela; não havia entrada de histórico para
//      desempilhar.
//   2. Nenhuma tela podia ser endereçada. Notificação, e-mail e atalho da tela
//      inicial só sabiam abrir o dashboard.
//   3. Recarregar a página perdia o lugar.
//
// O endereço vive no HASH (`#/saude`), não no caminho. É deliberado: o app é
// servido estático, sem regra de reescrita no `vercel.json`, e continua tendo
// de abrir por `file://` (o README promete duplo clique no index.html). Com
// caminho de verdade, as duas coisas quebrariam.
//
// As camadas sobrepostas (leitor de QR, resumo do mês, seletor de categoria,
// celebração) NÃO entram no hash: elas são estado efêmero, não endereço. Elas
// entram no `history.state` como uma pilha, de modo que o voltar fecha a camada
// de cima antes de sair da tela. É esse detalhe que faz o botão do aparelho se
// comportar como o usuário espera.
// ------------------------------------------------------------------
"use strict";

// Rotas válidas. Uma rota desconhecida no endereço cai no padrão em vez de
// renderizar tela em branco; endereço colado errado é caso comum, não erro.
const ROUTE_TABS = [
  "dashboard", "add", "analytics", "goals", "settings", "import", "simulate",
  "subscriptions", "health", "wealth", "calendar", "invest", "simulators",
  "achievements", "insights", "notifications", "accounts", "debts",
  "all", "rules", "categories", "privacy", "account",
];

// Nomes em português no endereço: ele é visível, compartilhável e o app é
// inteiro em português. O id interno segue em inglês para não mexer no `switch`
// de telas nem nos ~40 `data-tab` já espalhados pelo HTML.
const ROUTE_SLUGS = {
  dashboard: "inicio",
  add: "novo",
  analytics: "analises",
  goals: "metas",
  settings: "ajustes",
  privacy: "privacidade",
  account: "conta-e-acesso",
  import: "importar",
  simulate: "simular",
  subscriptions: "assinaturas",
  health: "saude",
  wealth: "patrimonio",
  calendar: "calendario",
  invest: "investir",
  simulators: "simuladores",
  achievements: "conquistas",
  insights: "central",
  notifications: "avisos",
  accounts: "contas",
  debts: "dividas",
  all: "tudo",
  rules: "regras",
  categories: "categorias",
};

const ROUTE_BY_SLUG = Object.keys(ROUTE_SLUGS).reduce((acc, tab) => {
  acc[ROUTE_SLUGS[tab]] = tab;
  return acc;
}, {});

const DEFAULT_ROUTE = "dashboard";

// Camadas conhecidas. A pilha guarda nomes desta lista e nada mais: um valor
// estranho vindo de um histórico antigo é descartado em vez de virar uma camada
// fantasma que o voltar nunca consegue fechar.
const OVERLAY_NAMES = [
  "celebration", "category", "category-editor", "qr", "wrapped", "confirmation",
  "movement-detail", "review-card-payment", "calculation", "assistant",
  "ai-preview",
];

const Router = {
  TABS: ROUTE_TABS,
  DEFAULT: DEFAULT_ROUTE,
  OVERLAYS: OVERLAY_NAMES,

  isTab(tab) {
    return ROUTE_TABS.indexOf(tab) !== -1;
  },

  slugFor(tab) {
    return ROUTE_SLUGS[tab] || ROUTE_SLUGS[DEFAULT_ROUTE];
  },

  hashFor(tab) {
    return "#/" + Router.slugFor(Router.isTab(tab) ? tab : DEFAULT_ROUTE);
  },

  // Aceita o slug em português (`#/saude`) e também o id interno (`#/health`),
  // porque links antigos e atalhos de desenvolvimento usam o segundo.
  parse(hash) {
    const raw = String(hash || "")
      .replace(/^#/, "")
      .replace(/^\/+/, "")
      .split(/[?#]/)[0]
      .split("/")[0]
      .trim()
      .toLowerCase();
    if (!raw) return null;
    if (ROUTE_BY_SLUG[raw]) return ROUTE_BY_SLUG[raw];
    if (Router.isTab(raw)) return raw;
    return null;
  },

  // A pilha vinda do `history.state`, higienizada. Limite de 4 porque é o número
  // de camadas simultâneas que o app sabe abrir; um histórico manipulado não deve conseguir
  // criar uma pilha que o app não consiga esvaziar.
  overlaysOf(histState) {
    const list = histState && Array.isArray(histState.ov) ? histState.ov : [];
    return list.filter((n) => OVERLAY_NAMES.indexOf(n) !== -1).slice(0, 8);
  },

  // `d` é a profundidade dentro do app. Ela é o que permite responder "existe
  // tela anterior MINHA para voltar?" sem chutar pelo `history.length`, que
  // conta também as páginas visitadas antes do app na mesma aba. Vive no
  // `history.state`, então sobrevive a recarregar a página.
  stateFor(tab, overlays, depth) {
    return {
      r: Router.isTab(tab) ? tab : DEFAULT_ROUTE,
      ov: (overlays || []).slice(),
      d: Math.max(0, Number(depth) || 0),
    };
  },
};

// ------------------------------------------------------------------
// Fachada sobre o History API
// ------------------------------------------------------------------
// Guardada em `supported()` por dois motivos práticos: o harness de teste roda
// num contexto de VM sem `history`, e `file://` em alguns navegadores lança
// SecurityError em `pushState`. Sem suporte, o app volta ao comportamento
// anterior (tela só na memória) em vez de quebrar.
const NavHistory = {
  supported() {
    try {
      return typeof window !== "undefined" && !!window.history && typeof window.history.pushState === "function";
    } catch (e) {
      return false;
    }
  },

  current() {
    let hash = "";
    let histState = null;
    try { hash = (window.location && window.location.hash) || ""; } catch (e) { hash = ""; }
    try { histState = window.history ? window.history.state : null; } catch (e) { histState = null; }
    const fromHash = Router.parse(hash);
    const fromState = histState && Router.isTab(histState.r) ? histState.r : null;
    return {
      tab: fromHash || fromState || DEFAULT_ROUTE,
      overlays: Router.overlaysOf(histState),
      depth: histState && Number.isFinite(histState.d) ? Math.max(0, histState.d) : 0,
      addressed: !!fromHash,
    };
  },

  replace(tab, overlays, depth) {
    if (!NavHistory.supported()) return;
    try { window.history.replaceState(Router.stateFor(tab, overlays, depth), "", Router.hashFor(tab)); } catch (e) { /* ignora */ }
  },

  push(tab, overlays) {
    if (!NavHistory.supported()) return;
    const depth = NavHistory.current().depth + 1;
    try { window.history.pushState(Router.stateFor(tab, overlays, depth), "", Router.hashFor(tab)); } catch (e) { /* ignora */ }
  },

  go(delta) {
    if (!NavHistory.supported()) return false;
    try { window.history.go(delta); return true; } catch (e) { return false; }
  },
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { Router, NavHistory, ROUTE_TABS, ROUTE_SLUGS };
}
