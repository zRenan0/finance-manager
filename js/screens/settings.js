// js/screens/settings.js. Ajustes: perfil, regra de orçamento, categorias, tetos e backup.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// ==================================================================
// Feature 1; edição dos percentuais da Regra x/x/x (Necessidades/Desejos/Futuro) em Ajustes.
function renderBudgetSplitSettingsCard() {
  const bs = state.data.budgetSplit;
  const sum = BUDGET_GROUPS.reduce((s, g) => {
    const draft = state.splitDrafts[g];
    const v = draft !== undefined ? (parseInt(draft, 10) || 0) : bs[g];
    return s + v;
  }, 0);
  return `<div class="card">
    <p class="card-title">Regra de orçamento (x/x/x)</p>
    <p class="card-subtitle" data-ui-css="margin-top:0">Defina quanto da sua renda deve ir para cada grupo. Isso alimenta as barras e os alertas automáticos do Dashboard.</p>
    <div class="split-settings-grid">
      ${BUDGET_GROUPS.map((g) => {
        const draft = state.splitDrafts[g];
        const val = draft !== undefined ? draft : String(bs[g]);
        return `<div class="split-settings-field">
          <label class="field__label" for="split-${g}-input">${svgIcon(GROUP_ICONS[g], 13)} ${GROUP_LABELS[g]}</label>
          <div class="income-input-row">
            <input id="split-${g}-input" class="input input--budget" data-field="split-${g}" value="${escapeHtml(val)}" inputmode="numeric" />
            <span class="income-currency">%</span>
          </div>
        </div>`;
      }).join("")}
    </div>
    <p class="footnote" data-ui-css="margin-top:10px; text-align:left">${sum === 100 ? `Soma: ${sum}%; perfeito.` : `Soma atual: ${sum}%. O ideal é somar 100%, mas o app funciona com qualquer combinação.`}</p>
  </div>`;
}

// Configuração da reserva de emergência: qual meta representa a reserva e
// quantos meses de despesa ela deve cobrir. Alimenta o Dashboard e o Score.
function renderEmergencySettingsCard() {
  const goals = state.data.goals || [];
  const r = emergencyFund(state.data);
  return `<div class="card">
    <p class="card-title">Reserva de Emergência</p>
    <p class="card-subtitle">Escolha qual meta representa sua reserva e por quantos meses ela precisa cobrir suas despesas.</p>
    ${goals.length === 0
      ? `<p class="field-hint">Você ainda não tem metas. Crie uma meta chamada “Reserva de emergência” na aba Metas e ela aparecerá aqui.</p>`
      : `<div class="field">
          <label class="field__label" for="emergency-goal-select">Meta usada como reserva</label>
          <select class="input" id="emergency-goal-select" data-action-select="emergency-goal">
            <option value="">Detectar automaticamente pelo nome</option>
            ${goals.map((g) => `<option value="${g.id}" ${state.data.emergencyGoalId === g.id ? "selected" : ""}>${escapeHtml(g.name)}</option>`).join("")}
          </select>
        </div>`}
    <div class="field" data-ui-css="margin-top:12px">
      <label class="field__label" for="emergency-months-input">Meses de despesa que a reserva deve cobrir</label>
      <input id="emergency-months-input" class="input" data-field="emergency-months" type="number" min="1" max="24" step="1" value="${Number(state.data.emergencyMonths) || 6}" />
    </div>
    <p class="field-hint">Hoje sua despesa média é de ${fmtBRL(r.monthlyNeed)}/mês; o alvo sugerido é ${fmtBRL(mulMoney(r.monthlyNeed, r.targetMonths))}.</p>
  </div>`;
}

// [M5] Premissas de mercado usadas por todos os simuladores.
// O app é offline: não existe cotação em tempo real, e fingir que existe seria
// pior do que não ter. Aqui o usuário revisa os números e o app carimba a data
//; todo simulador mostra de onde veio a taxa que usou.
function renderMarketRatesCard() {
  const r = marketRatesOf(state.data);
  const draft = (key) => (state.ratesDraft[key] != null ? state.ratesDraft[key] : String(r[key]).replace(".", ","));
  const rows = [
    { key: "selic", label: "Selic", hint: "Taxa básica de juros ao ano." },
    { key: "cdi", label: "CDI", hint: "Referência da renda fixa. Costuma ficar levemente abaixo da Selic." },
    { key: "ipca", label: "IPCA", hint: "Inflação anual esperada. É o que separa ganho nominal de ganho real." },
    { key: "tr", label: "TR", hint: "Entra na poupança e no rendimento do FGTS." },
  ];

  return `<div class="card">
    <div class="settings-row-header">
      <div>
        <p class="card-title" data-ui-css="margin:0">Premissas de mercado</p>
        <p class="card-subtitle" data-ui-css="margin:2px 0 0">Valores editáveis usados pelos simuladores e pela comparação da carteira.</p>
      </div>
      <button class="btn btn--ghost btn--sm" data-action="rates-reset">Restaurar</button>
    </div>
    <div class="rates-grid">
      ${rows.map((row) => `<div class="field" data-ui-css="margin:0">
        <label class="field__label" for="rate-${row.key}-input">${escapeHtml(row.label)}</label>
        <div class="sim-input">
          <input id="rate-${row.key}-input" class="input" data-field="market-rate" data-id="${row.key}"
            value="${escapeHtml(draft(row.key))}" inputmode="decimal" autocomplete="off" />
          <span class="sim-input__affix">% a.a.</span>
        </div>
        <p class="field-hint">${escapeHtml(row.hint)}</p>
      </div>`).join("")}
    </div>
    <div class="rates-derived">
      <span>Poupança (derivada da Selic pela regra oficial)</span>
      <b>${fmtNum(r.poupanca)}% a.a.</b>
    </div>
    <p class="card-subtitle" data-ui-css="margin-top:8px">${r.updatedAt
      ? `Revisadas por você em ${fmtDateFull(r.updatedAt)}.`
      : "Exemplos iniciais, não cotações atuais. Revise os quatro valores antes de usar uma simulação para decidir."}</p>
    <div class="source-links" aria-label="Fontes oficiais das premissas">
      <a href="https://www.bcb.gov.br/controleinflacao/taxaselic" target="_blank" rel="noopener noreferrer">Selic e CDI no Banco Central</a>
      <a href="https://www.ibge.gov.br/explica/inflacao.php" target="_blank" rel="noopener noreferrer">IPCA no IBGE</a>
    </div>
  </div>`;
}

// ==================================================================
// AJUSTES EM TÓPICOS
// ==================================================================
// A tela tinha onze cartões abertos ao mesmo tempo, e achar "alertas de
// orçamento" no meio disso exigia rolar passando por categorias, backup e
// premissas de mercado. Agora cada assunto é um tópico fechado, e só um fica
// aberto por vez.
//
// A linha fechada NÃO é só um título: ela mostra o valor atual do ajuste
// (a regra em vigor, quantas categorias têm teto, quando foi o último backup).
// Sem isso o usuário teria de abrir cada tópico só para lembrar como está, e a
// tela ficaria mais lenta de ler do que a lista antiga.
//
// O estado do acordeão mora em `state.settingsSection` porque `render()`
// reconstrói o DOM inteiro; um `<details>` nativo perderia o aberto/fechado a
// cada tecla digitada em qualquer campo da tela.

function renderProfileSettingsCard() {
  const nameVal = state.userNameInput !== null ? state.userNameInput : (state.data.userName || "");
  return `<div class="card">
    <p class="card-title">Seu Perfil</p>
    <div class="field">
      <label class="field__label" for="user-name-input">Como devo te chamar?</label>
      <input id="user-name-input" class="input" data-field="user-name" value="${escapeHtml(String(nameVal))}" placeholder="Seu nome" autocomplete="off" maxlength="40" />
    </div>
    <p class="card-subtitle" data-ui-css="margin-top:8px">Usado apenas na saudação do início. Fica salvo só neste aparelho.</p>
    <button class="btn btn--secondary btn--block btn--sm" data-action="onb-restart" data-ui-css="margin-top:12px">
      ${svgIcon("refresh", 15)} Refazer a configuração inicial
    </button>
    <p class="card-subtitle" data-ui-css="margin-top:8px">Revisa nome, renda, conta principal e regra de orçamento nos mesmos 4 passos do primeiro uso. Nada é apagado.</p>
  </div>`;
}

function renderIncomeSettingsCard() {
  const incomeVal = state.incomeInput !== null ? state.incomeInput : (state.data.monthlyIncome ? state.data.monthlyIncome.toFixed(2).replace(".", ",") : "");
  return `<div class="card">
    <p class="card-title">Renda mensal fixa</p>
    <div class="income-input-row">
      <span class="income-currency">R$</span>
      <input id="income-input" class="input income-input" data-field="income" value="${escapeHtml(String(incomeVal))}" inputmode="decimal" placeholder="0,00" autocomplete="off" />
    </div>
    <p class="card-subtitle" data-ui-css="margin-top:8px">Usada para calcular sua saúde financeira mensal. Salva automaticamente ao sair do campo.</p>
  </div>`;
}

function renderCreditLimitSettingsCard() {
  const creditLimitVal = state.creditLimitInput !== null ? state.creditLimitInput : (state.data.creditCardLimit ? state.data.creditCardLimit.toFixed(2).replace(".", ",") : "");
  return `<div class="card">
    <p class="card-title">Limite desejado para a fatura do cartão</p>
    <div class="income-input-row">
      <span class="income-currency">R$</span>
      <input id="credit-limit-input" class="input income-input" data-field="credit-limit" value="${escapeHtml(String(creditLimitVal))}" inputmode="decimal" placeholder="0,00" autocomplete="off" />
    </div>
    <p class="card-subtitle" data-ui-css="margin-top:8px">Um teto próprio (não o limite do banco) pra acompanhar no Dashboard o quanto já comprometeu no crédito este mês.</p>
  </div>`;
}

function renderAppearanceSettingsCard() {
  const escuro = state.data.theme === "dark";
  const conquistas = !!(state.data.achievements && state.data.achievements.enabled);
  return `<div class="card">
    <button class="theme-toggle" data-action="toggle-theme" role="switch" aria-checked="${escuro ? "true" : "false"}">
      ${svgIcon(escuro ? "moon" : "sun", 17)}
      <span>Modo ${escuro ? "escuro" : "claro"}</span>
      <span class="switch ${escuro ? "active" : ""}" aria-hidden="true"><span class="switch__knob"></span></span>
    </button>
    <button class="theme-toggle" data-action="toggle-gamification" role="switch" aria-checked="${conquistas ? "true" : "false"}">
      ${svgIcon("star", 17)}
      <span><b>Conquistas e níveis</b><small>Opcional. Fica fora do Início até você ativar.</small></span>
      <span class="switch ${conquistas ? "active" : ""}" aria-hidden="true"><span class="switch__knob"></span></span>
    </button>
  </div>`;
}

// Cada tópico traz `resumo()`, que é lido com a seção FECHADA. Deve caber numa
// linha e responder "como está isso hoje" sem abrir nada.
const SETTINGS_SECTIONS = [
  {
    id: "perfil",
    icon: "briefcase",
    label: "Perfil e renda",
    resumo() {
      const nome = String(state.data.userName || "").trim();
      const renda = Number(state.data.monthlyIncome) || 0;
      return `${nome || "Sem nome"} · ${renda > 0 ? `${fmtBRLShort(renda)} por mês` : "renda não informada"}`;
    },
    render: () => `${renderProfileSettingsCard()}${renderIncomeSettingsCard()}`,
  },
  {
    id: "orcamento",
    icon: "pie",
    label: "Orçamento e alertas",
    resumo() {
      const bs = state.data.budgetSplit;
      const alerts = state.data.budgetAlerts || defaultBudgetAlerts();
      return `Regra ${bs.necessidade}/${bs.desejo}/${bs.futuro} · aviso em ${alerts.warn}%`;
    },
    render: () => `${renderBudgetSplitSettingsCard()}${renderBudgetSettingsCard()}${renderCreditLimitSettingsCard()}`,
  },
  // Categoria NÃO é um tópico daqui. Ela ganhou tela própria (`#/categorias`),
  // e o cartão de resumo abaixo dos tópicos é o caminho para ela: enfiar um
  // destino dentro de um acordeão seria pedir dois toques para chegar onde
  // antes bastava um.
  {
    id: "reserva",
    icon: "piggy",
    label: "Reserva de emergência",
    resumo() {
      const r = emergencyFund(state.data);
      const meses = `${r.targetMonths} ${r.targetMonths === 1 ? "mês" : "meses"}`;
      if (!r.configured && r.current === 0) return `Alvo de ${meses} · nenhuma meta escolhida`;
      // Percentual em vez dos dois valores: `fmtBRLShort` abrevia acima de dez
      // mil, e "R$ 5.200,00 de R$ 20 mil" na mesma linha lê mal.
      return `${meses} · ${Math.round(r.pct)}% do alvo de ${fmtBRLShort(r.target)}`;
    },
    render: renderEmergencySettingsCard,
  },
  {
    id: "mercado",
    icon: "trendUp",
    label: "Premissas de mercado",
    resumo() {
      const r = marketRatesOf(state.data);
      return `Selic ${fmtNum(r.selic)}% · ${r.updatedAt ? `revisadas em ${fmtDateFull(r.updatedAt)}` : "ainda não revisadas"}`;
    },
    render: renderMarketRatesCard,
  },
  {
    id: "aparencia",
    icon: "sun",
    label: "Aparência",
    resumo() {
      const escuro = state.data.theme === "dark";
      const conquistas = !!(state.data.achievements && state.data.achievements.enabled);
      return `Modo ${escuro ? "escuro" : "claro"} · conquistas ${conquistas ? "ligadas" : "desligadas"}`;
    },
    render: renderAppearanceSettingsCard,
  },
  {
    id: "dados",
    icon: "archive",
    label: "Backup e dados",
    resumo() {
      const last = state.data.lastBackupAt;
      return last ? `Último backup em ${fmtDateFull(last)}` : "Nenhum backup exportado ainda";
    },
    render: renderBackupCard,
  },
];

// A prévia de importação e o erro de backup aparecem depois de o usuário
// escolher um arquivo. Se o tópico estivesse fechado, o resultado da ação dele
// ficaria escondido; então esses dois estados forçam a abertura.
function settingsOpenSection() {
  if (state.backup.preview || state.backup.error) return "dados";
  return state.settingsSection;
}

function renderSettingsTopic(section, aberto) {
  const painelId = `settings-panel-${section.id}`;
  return `<section class="settings-topic${aberto ? " settings-topic--open" : ""}">
    <h2 class="settings-topic__heading">
      <button class="settings-topic__toggle" data-action="settings-section" data-value="${section.id}"
        aria-expanded="${aberto ? "true" : "false"}" aria-controls="${painelId}">
        <span class="settings-topic__icon">${svgIcon(section.icon, 18)}</span>
        <span class="settings-topic__text">
          <span class="settings-topic__label">${escapeHtml(section.label)}</span>
          <span class="settings-topic__summary">${escapeHtml(section.resumo())}</span>
        </span>
        ${svgIcon("chevronDown", 16, "settings-topic__chevron")}
      </button>
    </h2>
    ${aberto ? `<div class="settings-topic__panel" id="${painelId}">${section.render()}</div>` : ""}
  </section>`;
}

function renderSettingsScreen() {
  const aberto = settingsOpenSection();
  return `<div class="screen screen--narrow">
    <h1 class="page-title" data-ui-css="margin-bottom:16px">Ajustes</h1>

    <div class="settings-topics">
      ${SETTINGS_SECTIONS.map((section) => renderSettingsTopic(section, section.id === aberto)).join("")}
    </div>

    ${renderCategoriesSettingsCard()}

    <div class="card">
      <p class="card-title">Ir para outras telas</p>
      <p class="card-subtitle">Navegação, não configuração. Fica sempre visível.</p>
      <div class="tool-links">
        <button class="tool-link tool-link--rich" data-action="nav" data-tab="account">
          <span class="tool-link__icon">${svgIcon("shieldCheck", 17)}</span>
          <span class="tool-link__text"><span class="tool-link__label">Conta e acesso</span><span class="tool-link__desc">Entrar, sincronizar e revisar dispositivos conectados.</span></span>
          ${svgIcon("chevronRight", 15, "tool-link__chevron")}
        </button>
        <button class="tool-link tool-link--rich" data-action="nav" data-tab="all">
          <span class="tool-link__icon">${svgIcon("search", 17)}</span>
          <span class="tool-link__text">
            <span class="tool-link__label">Abrir “Recursos”</span>
            <span class="tool-link__desc">Contas, dívidas, metas, simuladores, importação, patrimônio e o resto.</span>
          </span>
          ${svgIcon("chevronRight", 15, "tool-link__chevron")}
        </button>
        <button class="tool-link tool-link--rich" data-action="nav" data-tab="rules">
          <span class="tool-link__icon">${svgIcon("tag", 17)}</span>
          <span class="tool-link__text">
            <span class="tool-link__label">Regras de categorização</span>
            <span class="tool-link__desc">Ensine o app a classificar sozinho o que vem do extrato.</span>
          </span>
          ${svgIcon("chevronRight", 15, "tool-link__chevron")}
        </button>
        <button class="tool-link tool-link--rich" data-action="nav" data-tab="privacy">
          <span class="tool-link__icon">${svgIcon("shieldCheck", 17)}</span>
          <span class="tool-link__text">
            <span class="tool-link__label">Privacidade, termos e fontes</span>
            <span class="tool-link__desc">Envios para IA, exportação, exclusão, limites financeiros e diagnóstico local.</span>
          </span>
          ${svgIcon("chevronRight", 15, "tool-link__chevron")}
        </button>
      </div>
    </div>

    <p class="footnote">Seus dados ficam salvos neste navegador/dispositivo (${escapeHtml(FinanceStore.adapterName())}). Use o backup em JSON para levá-los para outro aparelho.</p>
  </div>`;
}

// Ajustes não edita mais categoria; ele resume o estado atual e entrega a tela
// que edita. Manter as duas coisas era o que fazia esta tela crescer sem parar.
//
// O cartão é um botão inteiro, não um cartão com um link dentro. Ele não tem
// nada para configurar aqui: só anuncia um destino. Pedir um segundo toque num
// alvo pequeno depois de já ter lido o resumo era desenho de página de índice,
// não de app. A moldura e o medalhão são os mesmos do tópico logo acima, para
// que a coisa pertença à pilha em vez de flutuar solta no meio dela.
function renderCategoriesSettingsCard() {
  const cats = state.data.categories || [];
  const parents = topLevelCategories(state.data).length;
  const subs = Math.max(0, cats.length - parents);
  // Mesma leitura do cartão de alertas logo acima: uma varredura do mês, sobre
  // o índice já montado por `dataIndex`. Barata o bastante para uma tela de
  // configuração, e evita repetir aqui a regra de quem estourou.
  const status = computeBudgetStatus(state.data, keyOfCurrentMonth());
  const comTeto = status.counts.total;
  const estouradas = status.counts.over;
  const bs = state.data.budgetSplit;

  const stat = (label, valor, alerta) => `<span class="settings-destination__stat${alerta ? " settings-destination__stat--alert" : ""}">
        <span class="settings-destination__stat-label">${label}</span>
        <b class="settings-destination__stat-value">${valor}</b>
      </span>`;

  // O rodapé responde "e daí?": a linha muda conforme o estado, porque
  // "0 estouradas" quer dizer coisas opostas com e sem teto definido.
  const rodape = estouradas > 0
    ? `${plural(estouradas, "categoria passou", "categorias passaram")} do teto neste mês.`
    : comTeto > 0
      ? "Nenhum teto estourado neste mês."
      : "Nenhum teto definido ainda; a central é onde se cria o primeiro.";

  return `<button class="settings-destination" data-action="nav" data-tab="categories">
    <span class="settings-destination__head">
      <span class="settings-destination__icon">${svgIcon("tag", 18)}</span>
      <span class="settings-destination__text">
        <span class="settings-destination__title">Categorias e Tetos</span>
        <span class="settings-destination__sub">Hierarquia, grupos da Regra ${bs.necessidade}/${bs.desejo}/${bs.futuro} e tetos numa tela só.</span>
      </span>
      ${svgIcon("chevronRight", 16, "settings-destination__chevron")}
    </span>
    <span class="settings-destination__stats">
      ${stat("Principais", parents, false)}
      ${stat("Subcategorias", subs, false)}
      ${stat("Com teto", `${comTeto}<small> de ${cats.length}</small>`, false)}
      ${stat("Estouradas", estouradas, estouradas > 0)}
    </span>
    <span class="settings-destination__foot">${rodape}</span>
  </button>`;
}

// Ajustes: faixas de alerta + visão geral do mês.

function renderBudgetSettingsCard() {
  const status = computeBudgetStatus(state.data, keyOfCurrentMonth());
  const alerts = state.data.budgetAlerts || defaultBudgetAlerts();
  return `<div class="card">
    <p class="card-title">Alertas de orçamento</p>
    <p class="card-subtitle" data-ui-css="margin-top:0">Em que ponto do teto de cada categoria eu devo te avisar. O primeiro aviso é preventivo; o segundo marca o estouro.</p>
    <div class="split-settings-grid">
      <div class="split-settings-field">
        <label class="field__label" for="budget-warn-input">${svgIcon("alertTriangle", 13)} Atenção</label>
        <div class="income-input-row">
          <input id="budget-warn-input" type="number" min="1" max="200" class="input input--budget" data-field="budget-warn" value="${alerts.warn}" inputmode="numeric" />
          <span class="income-currency">%</span>
        </div>
      </div>
      <div class="split-settings-field">
        <label class="field__label" for="budget-over-input">${svgIcon("x", 13)} Estouro</label>
        <div class="income-input-row">
          <input id="budget-over-input" type="number" min="1" max="300" class="input input--budget" data-field="budget-over" value="${alerts.over}" inputmode="numeric" />
          <span class="income-currency">%</span>
        </div>
      </div>
    </div>
    ${status.items.length > 0 ? `<p class="footnote" data-ui-css="text-align:left; margin-top:10px">
      ${plural(status.counts.total, "Categoria com Teto", "Categorias com Teto")} · ${status.counts.warn} em atenção · ${status.counts.over} ${pluralWord(status.counts.over, "estourada", "estouradas")} neste mês.
    </p>` : `<p class="footnote" data-ui-css="text-align:left; margin-top:10px">Nenhum teto definido ainda; abra a central de categorias, logo abaixo, para criar o primeiro.</p>`}
  </div>`;
}

// ==================================================================
// FEATURE 2. BACKUP: cartão de Ajustes
// ==================================================================
function renderBackupCard() {
  const b = state.backup;
  const counts = {
    tx: state.data.transactions.length,
    cat: state.data.categories.length,
    goals: state.data.goals.length,
  };

  if (b.preview) return renderBackupPreview(b);

  return `<div class="card">
    <p class="card-title">Backup e restauração</p>
    <p class="card-subtitle">Seus dados vivem só neste aparelho. Exporte de tempos em tempos; é a única cópia que existe.</p>

    <div class="backup-summary">
      <div><span>Lançamentos</span><b>${counts.tx}</b></div>
      <div><span>Categorias</span><b>${counts.cat}</b></div>
      <div><span>Metas</span><b>${counts.goals}</b></div>
    </div>

    <p class="field__label" data-ui-css="margin-top:14px">Exportar</p>
    <div class="settings-actions">
      <button class="btn btn--primary btn--sm" data-action="export-json">${svgIcon("download", 15)} Backup completo (JSON)</button>
      <button class="btn btn--secondary btn--sm" data-action="export-csv">${svgIcon("download", 15)} Lançamentos (CSV)</button>
      <button class="btn btn--secondary btn--sm" data-action="export-budgets-csv">${svgIcon("download", 15)} Orçamentos (CSV)</button>
    </div>
    <p class="field-hint">O JSON guarda tudo (lançamentos, categorias, tetos, metas e ajustes) e é o que restaura o app por completo. O CSV serve para abrir no Excel ou no Google Sheets.</p>
    ${renderLastBackupLine()}

    <p class="field__label" data-ui-css="margin-top:14px">Importar</p>
    ${b.error ? `<div class="inline-error">
      ${svgIcon("alertTriangle", 16)}
      <div><p class="inline-error__title">${escapeHtml(b.error)}</p><p class="inline-error__detail">Seus dados atuais continuam intactos.</p></div>
      <button class="icon-btn icon-btn--muted" data-action="backup-cancel" aria-label="Fechar erro de backup">${svgIcon("x", 14)}</button>
    </div>` : ""}
    <div class="settings-actions">
      <button class="btn btn--secondary btn--sm" data-action="import-json-trigger" ${b.busy ? "disabled" : ""}>
        ${b.busy ? `<span class="spinner"></span>` : svgIcon("upload", 15)} Escolher arquivo de backup
      </button>
      ${b.undoAvailable ? `<button class="btn btn--ghost btn--sm" data-action="backup-undo">${svgIcon("refresh", 15)} Desfazer última restauração</button>` : ""}
    </div>
  </div>`;
}

function renderBackupPreview(b) {
  const p = b.preview;
  const current = state.data.transactions.length;
  const merge = b.mode === "merge";
  // Prévia do resultado da mesclagem; o usuário vê o número final ANTES de decidir.
  const mergedPreview = merge ? mergeBackupInto(state.data, p.data) : null;

  return `<div class="card card--elevated">
    <div class="settings-row-header modal-header">
      <p class="card-title" data-ui-css="margin:0">Confirmar importação</p>
      <button class="icon-btn" data-action="backup-cancel" aria-label="Cancelar importação do backup">${svgIcon("x", 16)}</button>
    </div>
    <p class="card-subtitle">${escapeHtml(p.filename)}${p.meta.exportedAt ? ` · exportado em ${fmtDateFull(p.meta.exportedAt.slice(0, 10))}` : ""}${p.meta.legacy ? " · formato antigo (será convertido)" : ""}</p>

    <div class="backup-summary">
      <div><span>No arquivo</span><b>${p.meta.counts.transactions}</b></div>
      <div><span>Neste aparelho</span><b>${current}</b></div>
      <div><span>Depois</span><b>${merge ? mergedPreview.data.transactions.length : p.meta.counts.transactions}</b></div>
    </div>

    <div class="segmented" data-ui-css="margin-top:14px">
      <button class="segmented__option ${merge ? "active" : ""}" data-action="backup-set-mode" data-value="merge">Mesclar</button>
      <button class="segmented__option ${!merge ? "active" : ""}" data-action="backup-set-mode" data-value="replace">Substituir</button>
    </div>

    <p class="field-hint" data-ui-css="margin-top:10px">${merge
      ? `Mantém tudo o que já existe aqui e acrescenta o que faltar. Lançamentos repetidos são detectados por conteúdo e ignorados. ${plural(mergedPreview.stats.added, "novo", "novos")}, ${mergedPreview.stats.skipped} já ${pluralWord(mergedPreview.stats.skipped, "existente", "existentes")}.`
      : `<b data-ui-css="color:var(--negative)">Apaga tudo o que está neste aparelho</b> e deixa apenas o conteúdo do arquivo. Use quando estiver migrando para um celular novo.`}</p>

    <div class="settings-actions" data-ui-css="margin-top:12px">
      <button class="btn btn--ghost btn--sm" data-action="backup-cancel">Cancelar</button>
      <button class="btn ${merge ? "btn--primary" : "btn--danger"} btn--sm" data-action="backup-confirm" ${b.busy ? "disabled" : ""}>
        ${b.busy ? `<span class="spinner"></span>` : svgIcon("check", 15)} ${merge ? "Mesclar agora" : "Substituir tudo"}
      </button>
    </div>
  </div>`;
}
