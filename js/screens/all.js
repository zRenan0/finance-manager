// js/screens/all.js. "Recursos": o índice do app.
// ------------------------------------------------------------------------------
// A lista de ferramentas morava dentro de um cartão de Ajustes, e isso tinha
// duas consequências: quem procurava a Central de Dívidas precisava adivinhar
// que ela estava em "Ajustes", e a tela de Ajustes ficou com quinze destinos
// espremidos entre campos de configuração.
//
// Aqui os mesmos destinos ganham tela própria, agrupada por intenção e com
// busca. A busca não é enfeite: com vinte e dois recursos, rolar procurando um
// nome é mais lento do que digitar três letras.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// `keywords` existe porque o usuário procura pelo problema, não pelo nome do
// recurso: quem digita "fatura" quer Contas e cartões, quem digita "juros" quer
// os simuladores. Sem isso a busca só encontraria o que a pessoa já sabia achar.
const ALL_SECTIONS = [
  {
    title: "Dia a dia",
    subtitle: "O que você abre com mais frequência.",
    items: [
      { tab: "add", icon: "plus", label: "Novo lançamento", desc: "Registrar um gasto ou uma receita.", keywords: "adicionar gasto receita despesa lancar" },
      { tab: "import", icon: "upload", label: "Importar extrato", desc: "Ler um arquivo OFX ou CSV do seu banco.", keywords: "ofx csv extrato banco importar arquivo" },
      { action: "open-qr", icon: "scan", label: "Ler QR Code", desc: "Pix ou nota fiscal, direto pela câmera.", keywords: "qr pix nota fiscal camera codigo" },
      { tab: "calendar", icon: "calendar", label: "Calendário e previsão", desc: "O que vence, quando, e para onde o saldo caminha.", keywords: "calendario previsao vencimento agenda planejamento anual" },
      { tab: "subscriptions", icon: "refresh", label: "Assinaturas e recorrências", desc: "Cobranças que se repetem todo mês.", keywords: "assinatura recorrente mensalidade streaming" },
      { tab: "notifications", icon: "bell", label: "Central de notificações", desc: "Histórico de avisos do app.", keywords: "avisos alertas notificacao sino" },
    ],
  },
  {
    title: "Contas e dívidas",
    subtitle: "Onde o dinheiro está e o que ele deve.",
    items: [
      { tab: "accounts", icon: "wallet", label: "Contas, cartões e faturas", desc: "Saldos, limites, transferências e conciliação.", keywords: "conta cartao fatura banco saldo transferencia conciliacao limite" },
      { tab: "debts", icon: "alertTriangle", label: "Central de dívidas", desc: "Plano de quitação por bola de neve ou avalanche.", keywords: "divida emprestimo financiamento quitar bola de neve avalanche juros" },
      { tab: "wealth", icon: "layout", label: "Patrimônio", desc: "Bens, dívidas e a evolução do seu líquido.", keywords: "patrimonio bens ativos passivos liquido imovel carro" },
    ],
  },
  {
    title: "Planejar e simular",
    subtitle: "Decidir antes de gastar.",
    items: [
      { tab: "goals", icon: "target", label: "Metas", desc: "Objetivos, aportes e prazo.", keywords: "meta objetivo reserva emergencia guardar sonho" },
      { tab: "invest", icon: "trendUp", label: "Carteira de investimentos", desc: "Aplicações, rentabilidade e proventos.", keywords: "investir carteira acoes cdb tesouro rendimento dividendo" },
      { tab: "simulators", icon: "bolt", label: "Simuladores", desc: "Renda fixa, financiamento, cartão, FGTS e mais.", keywords: "simulador juros financiamento fgts parcelamento cdb selic" },
      { tab: "simulate", icon: "sparkles", label: "Simulador “E se…?”", desc: "O impacto de um gasto antes de fazê-lo.", keywords: "e se simular gasto impacto comparar cenario" },
    ],
  },
  {
    title: "Entender os números",
    subtitle: "O que os lançamentos estão dizendo.",
    items: [
      { tab: "analytics", icon: "pie", label: "Análises e histórico", desc: "Períodos, categorias e busca no histórico.", keywords: "analise historico grafico relatorio periodo buscar filtro" },
      { tab: "insights", icon: "sparkles", label: "Central inteligente", desc: "Recomendações, padrões e comparação entre meses.", keywords: "insight recomendacao ia padrao comparar inteligente" },
      { tab: "health", icon: "shieldCheck", label: "Saúde financeira", desc: "Diagnóstico completo com os indicadores explicados.", keywords: "saude diagnostico score indicador nota" },
      { tab: "achievements", icon: "star", label: "Conquistas e nível", desc: "As medalhas que o seu histórico já desbloqueou.", keywords: "conquista medalha nivel gamificacao progresso" },
    ],
  },
  {
    title: "Ajustar o app",
    subtitle: "Como ele calcula e como ele se comporta.",
    items: [
      { tab: "account", icon: "shieldCheck", label: "Conta e acesso", desc: "Cadastro, recuperação de senha e dispositivos conectados.", keywords: "conta login senha recuperar acesso dispositivo sessao" },
      { tab: "categories", icon: "layout", label: "Categorias e tetos", desc: "Hierarquia, grupos da Regra x/x/x e limites por categoria.", keywords: "categoria subcategoria teto limite orcamento grupo necessidade desejo futuro organizar" },
      { tab: "rules", icon: "tag", label: "Regras de categorização", desc: "Ensine o app a classificar sozinho o que vem do banco.", keywords: "regra categorizar importar automatico palavra chave" },
      { tab: "settings", icon: "gear", label: "Ajustes", desc: "Perfil, renda, reserva, alertas, tema e backup.", keywords: "ajustes configuracao perfil renda backup tema reserva alerta premissa" },
      { tab: "privacy", icon: "shieldCheck", label: "Privacidade, termos e fontes", desc: "Controle de dados, IA, exclusão e diagnóstico local.", keywords: "privacidade lgpd termos dados excluir apagar ia diagnostico fontes" },
    ],
  },
];

function allScreenMatches(item, query) {
  if (!query) return true;
  const haystack = normalizeText(`${item.label} ${item.desc} ${item.keywords || ""}`);
  // Todos os termos precisam casar. Buscar "conta cartao" deve estreitar o
  // resultado, não ampliá-lo; o contrário transformaria a busca em ruído.
  return normalizeText(query).split(" ").filter(Boolean).every((term) => haystack.indexOf(term) !== -1);
}

function renderAllScreen() {
  const query = state.allSearch || "";
  const sections = ALL_SECTIONS
    .map((sec) => ({ ...sec, items: sec.items.filter((it) => allScreenMatches(it, query)) }))
    .filter((sec) => sec.items.length > 0);
  const total = sections.reduce((n, sec) => n + sec.items.length, 0);

  return `<div class="screen screen--narrow">
    <div class="screen-header">
      <div class="back-header">
        <button class="icon-btn" data-action="back" data-tab="dashboard" aria-label="Voltar">${svgIcon("chevronLeft", 19)}</button>
        <h1 class="page-title">Recursos</h1>
      </div>
    </div>

    <div class="card">
      <div class="all-search">
        ${svgIcon("search", 17, "all-search__icon")}
        <input id="all-search-input" class="input" data-field="all-search" value="${escapeHtml(query)}"
          placeholder="Buscar recurso (ex: fatura, juros, meta)" autocomplete="off" />
        ${query ? `<button class="icon-btn icon-btn--muted" data-action="all-search-clear" aria-label="Limpar busca">${svgIcon("x", 15)}</button>` : ""}
      </div>
      ${query ? `<p class="field-hint" data-ui-css="margin-top:8px">${total} resultado(s) para “${escapeHtml(query)}”.</p>` : ""}
    </div>

    ${total === 0 ? `<div class="card">
      ${renderEmptyState("search", "Nada encontrado.", "Tente uma palavra mais curta, como “cartão”, “meta” ou “juros”.")}
    </div>` : sections.map((sec) => `<div class="card">
      <p class="card-title">${escapeHtml(sec.title)}</p>
      <p class="card-subtitle" data-ui-css="margin-top:0">${escapeHtml(sec.subtitle)}</p>
      <div class="tool-links">
        ${sec.items.map((it) => `<button class="tool-link tool-link--rich" ${it.tab ? `data-action="nav" data-tab="${it.tab}"` : `data-action="${it.action}"`}>
          <span class="tool-link__icon">${svgIcon(it.icon, 17)}</span>
          <span class="tool-link__text">
            <span class="tool-link__label">${escapeHtml(it.label)}</span>
            <span class="tool-link__desc">${escapeHtml(it.desc)}</span>
          </span>
          ${svgIcon("chevronRight", 15, "tool-link__chevron")}
        </button>`).join("")}
      </div>
    </div>`).join("")}

    <p class="footnote">Recursos marcados como IA precisam de conexão e enviam somente os dados descritos antes da confirmação. Todo o resto funciona sem internet.</p>
  </div>`;
}
