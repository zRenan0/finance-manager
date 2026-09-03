// app.js; estado, renderização (via strings HTML) e eventos delegados
"use strict";

const COLOR_VARS = { positive: "var(--positive)", goal: "var(--goal)", negative: "var(--negative)", brand: "var(--brand)" };

const INCOME_SOURCES = ["Salário", "Freelance", "Investimentos", "Presente", "Reembolso", "Outro"];

function freshTxForm() {
  const firstAccount = (state.data.accounts || []).find((a) => !a.archived);
  const firstCard = (state.data.creditCards || []).find((c) => !c.archived);
  return {
    type: "expense", amount: "", categoryId: state.data.categories[0].id, date: todayIso(),
    nature: "",
    payment: PAYMENT_METHODS[0], description: "", recurring: false, installments: "1",
    source: "manual", origin: null,
    accountId: firstAccount ? firstAccount.id : "",
    creditCardId: firstCard ? firstCard.id : "",
    // Só têm uso na conversão de um lançamento já gravado em transferência,
    // mas nascem aqui para o formulário ter sempre a mesma forma.
    transferFromAccountId: "", transferToAccountId: "", transferCounterpartId: "",
  };
}

function freshAccountForm() {
  return { id: null, name: "", type: "corrente", openingBalance: "", openingDate: todayIso(), color: "#0B6B5C" };
}

function freshCardForm() {
  const first = (state.data.accounts || []).find((a) => !a.archived);
  return { id: null, name: "", accountId: first ? first.id : "", limit: "", closingDay: "20", dueDay: "28", color: "#3C6E8F" };
}

function freshDebtForm() {
  return {
    id: null, name: "", value: "", debtType: "outro", creditor: "", originalPrincipal: "",
    monthlyPayment: "", ratePct: "", ratePeriod: "unknown", cetAnnualPct: "",
    remainingInstallments: "", amortizationSystem: "unknown", nextDueDate: "",
    debtStatus: "active", balanceCheckedAt: todayIso(), note: "",
  };
}

function freshDebtPayment(debtId) {
  const account = (state.data.accounts || []).find((a) => !a.archived);
  return { debtId, accountId: account ? account.id : "", amount: "", date: todayIso(), categoryId: "outros", newBalance: "", duplicateConfirmed: false };
}

function defaultCashAccountId() {
  const account = (state.data.accounts || []).find((a) => !a.archived);
  return account ? account.id : null;
}

function defaultImportDestinationId(documentKind) {
  const list = documentKind === "card"
    ? (state.data.creditCards || []).filter((card) => !card.archived)
    : (state.data.accounts || []).filter((account) => !account.archived);
  return list[0] ? list[0].id : "";
}

// [M4] Estado inicial do formulário de meta. Vira fábrica porque agora o mesmo
// componente cria, edita e é pré-preenchido por modelo; três caminhos que
// precisam voltar exatamente ao mesmo ponto de partida ao serem cancelados.
function freshGoalForm() {
  return { show: false, name: "", target: "", savedUpfront: "", deadline: "", icon: "piggy", monthlyPlan: "" };
}

// Feature 1; verifica, ao vivo enquanto o usuário preenche o formulário, se o
// gasto que ele está prestes a lançar faz o grupo (Necessidades/Desejos/Futuro)
// da categoria escolhida ultrapassar o percentual combinado da renda. Não
// bloqueia nada; é só um aviso informativo antes de salvar.
function computeSplitWarning(categoryId, amount) {
  if (!categoryId) return null;
  const mKey = keyOfCurrentMonth();
  const income = effectiveIncome(state.data, mKey);
  if (income <= 0) return null;
  const group = categoryGroup(state.data, categoryId);
  const pct = state.data.budgetSplit[group];
  const allocated = mulMoney(income, pct / 100);
  if (allocated <= 0) return null;
  const currentSpent = monthGroupSpend(state.data, mKey)[group];
  const newSpent = addMoney(currentSpent, amount);
  if (moneyCompare(newSpent, allocated) <= 0) return null;
  return { groupLabel: GROUP_LABELS[group], pct, allocated, newSpent, over: subMoney(newSpent, allocated) };
}

// Tamanho do lote da revisão de importação. Ver `importVisible` abaixo.
const IMPORT_PAGE_SIZE = 60;

let state = {
  data: loadData(),
  storageOk: isStorageAvailable(),
  storageWarningDismissed: false,
  // [M26] Dispensa do aviso de dados locais. De sessão, como o aviso de
  // armazenamento logo acima: o risco não deixa de existir porque a pessoa
  // fechou o aviso, e gravar a dispensa exigiria campo novo no schema para
  // resolver um incômodo que a própria condição já limita.
  localOnlyDismissed: false,
  // [M25] Modo demonstração. Vive SÓ na memória: não é lido nem gravado no
  // banco, então recarregar a página encerra a demonstração e devolve os dados
  // reais. Ver js/demo.js.
  demo: { active: false },
  tab: "dashboard",
  monthOffset: 0,
  toast: null,
  toastTone: null,
  confirmation: null,
  privacyDeleteText: "",
  account: typeof freshAccountState === "function" ? freshAccountState() : { loading: true, configured: false, authenticated: false, knownAccount: false, sessionStatus: "unknown", email: "", mode: "login", busy: false, error: "", message: "", form: { email: "", password: "", newPassword: "", deletePassword: "", deleteText: "" }, devices: [] },
  calculationDetail: null,
  contextualAssistant: { open: false, responseId: null },
  form: null,
  editingTxId: null,
  editingTxReturnTab: "dashboard",
  goalForm: { show: false, name: "", target: "", savedUpfront: "", deadline: "", icon: "piggy", monthlyPlan: "" },
  expandedGoalId: null,
  goalActionMode: "aportar", // "aportar" | "resgatar"
  goalContribution: "",
  analyticsPeriod: "mes",
  analyticsCustomStart: todayIso(),
  analyticsCustomEnd: todayIso(),
  analyticsSearch: "",
  analyticsLimit: 30,
  analyticsView: "movements",
  movementFilters: { type: "all", categoryId: "", accountId: "", source: "" },
  movementFiltersOpen: false,
  movementReviewOpen: false,
  movementSelectedIds: [],
  movementBulkCategoryId: "",
  movementDetailId: null,
  movementReviewCard: { accountId: "", creditCardId: "" },
  aiInsight: { loading: false, text: null, error: null, analise: null },
  // Prévia do envio para a IA. `hide` começa na preferência salva e é editável
  // ali mesmo; `showJson` guarda se o usuário abriu o pacote inteiro.
  aiPreview: { monthKey: null, hide: [], showJson: false },
  categoryBudgetDrafts: {},
  // ---- Central de categorias (tela própria; ver js/screens/categories.js) ----
  categoriesUi: {
    view: "tree",          // "tree" | "groups" | "budgets"
    search: "",
    collapsed: [],         // ids das categorias-mãe recolhidas na Estrutura
    editor: null,          // rascunho do editor em folha (null = fechado)
  },
  incomeInput: null,
  creditLimitInput: null,
  // Tópico aberto em Ajustes (um por vez; null = todos fechados). Mora no
  // estado, e não num `<details>`, porque `render()` reconstrói o DOM inteiro:
  // o aberto/fechado nativo se perderia a cada tecla digitada na própria tela.
  settingsSection: null,
  // Campo "tipo de movimento" recolhido por padrão: a dedução acerta o caso
  // comum, e só quem precisa corrigir precisa vê-lo.
  natureFieldOpen: false,
  // Bloco "Apagar conta e dados", em Conta e acesso. Mora aqui pelo mesmo
  // motivo de `settingsSection`: era um `<details>` nativo, e `render()`
  // reconstrói o DOM inteiro. Como o cartão de sincronização redesenha a tela
  // sozinho (a volta periódica, a lista de aparelhos, qualquer aviso), o painel
  // se fechava enquanto a pessoa digitava a senha, e a exclusão passava a
  // impressão de estar quebrada.
  accountDangerOpen: false,
  // ---- novos recursos ----
  importRows: null,        // linhas parseadas de OFX/CSV/PDF aguardando revisão
  // Quantas linhas da revisão estão desenhadas. Um extrato de doze meses tem
  // ~1.500 linhas, e cada uma traz onze botões de categoria: desenhar tudo de
  // uma vez passava de 30 mil nós no DOM, o que num Android mediano trava a
  // tela antes de a pessoa conseguir conferir a primeira linha. A conferência é
  // sequencial de qualquer jeito; o resto entra sob demanda.
  importVisible: IMPORT_PAGE_SIZE,
  importFilename: null,
  // [M14] Recibo da última importação (só identificadores), hidratado do
  // `localMeta` no boot. É o que permite oferecer "desfazer importação".
  importUndo: null,
  importDocumentKind: "account",
  importDestinationId: "",
  importPendingFile: null,
  importPassword: "",
  importDragOver: false,
  importError: null,       // { title, detail }; erro visual da importação
  importLoading: false,
  qr: { open: false, scanning: false, error: null, checking: false, draft: null },
  // ---- Feature 4: lançamento em linguagem natural ----
  nlp: { text: "", drafts: [], error: null, loading: false, touched: false },
  // ---- Feature 2: backup (exportar / importar) ----
  // `locked` guarda o TEXTO de um arquivo protegido enquanto a senha não vem;
  // nada dele é interpretado antes de decifrar. As senhas moram só aqui, em
  // memória, e são apagadas assim que o arquivo abre ou o usuário desiste.
  backup: { preview: null, error: null, mode: "merge", busy: false, undoAvailable: false, encryptOpen: false, password: "", passwordConfirm: "", locked: null, unlockPassword: "" },
  // ---- Feature 3: painel de orçamentos ----
  budgetsExpanded: false,
  simulate: { mode: "vista", amount: "", label: "", goalId: "", finance: { valorBem: "", entrada: "", numParcelas: "", valorParcela: "" } },
  wrapped: { open: false },
  categoryPickerFor: null, // id da categoria principal cujo seletor de subcategoria está aberto
  // ---- Máquina do tempo dos juros compostos (Feature 3) ----
  invest: { inicial: "0", aporte: "300", anos: "10", taxa: "10" },
  // ---- Motor What-If: comparação cenário real x cenário simulado ----
  whatIf: {
    open: false,
    mode: "aporte",              // "aporte" | "financiamento"
    anos: "10",
    taxa: "10",
    aporteExtra: "200",
    valorBem: "60000",
    entrada: "10000",
    meses: "48",
    jurosFin: "22",
  },
  // ---- Ajustes da Regra x/x/x (Feature 1) ----
  splitDrafts: {},
  // ---- Módulo 1: dashboard premium ----
  scoreExpanded: false,      // detalhamento dos pilares do Score no dashboard
  // ---- Módulo 2: saúde financeira ----
  healthDetailId: null,      // indicador com o "como é calculado" aberto (acordeão)
  // ---- Módulo 3: patrimônio ----
  wealth: {
    months: 12,              // janela do gráfico de evolução (6 | 12 | 24)
    form: null,              // rascunho de cadastro/edição (null = fechado)
    updatingId: null,        // item com o campo "atualizar valor" aberto
    updateValue: "",
    confirmDeleteId: null,   // exclusão em duas etapas (o histórico some junto)
  },
  // ---- Módulo 5: central de investimentos e simuladores ----
  portfolio: {
    months: 12,              // janela do gráfico de evolução (6 | 12 | 24)
    form: null,              // rascunho de cadastro/edição (null = fechado)
    expandedId: null,        // aplicação com o detalhe aberto
    updatingId: null,        // item com o campo "atualizar valor" aberto
    updateValue: "",
    dividendId: null,        // item com o campo "registrar provento" aberto
    dividendValue: "",
    confirmDeleteId: null,   // exclusão em duas etapas (o histórico some junto)
  },
  sim: { id: "juros", values: {} },   // simulador aberto + rascunhos por campo
  ratesDraft: {},            // rascunho das premissas de mercado em Ajustes
  userNameInput: null,       // rascunho do nome em Ajustes (confirma no blur)
  // ---- Módulo 4: metas, calendário e previsão ----
  calendar: {
    monthOffset: 0,          // mês visualizado, relativo ao atual
    selectedDay: null,       // ISO do dia aberto no painel de detalhe
    annualOpen: false,       // planejamento anual expandido
  },
  forecastHorizon: "30d",    // 7d | 30d | 3m | 12m
  editingGoalId: null,       // meta em edição (o mesmo formulário serve para criar)
  // ---- Módulo 6: gamificação ----
  gamification: {
    filter: "all",           // "all" | "unlocked" | "locked" | id de grupo
    detailId: null,          // conquista com a explicação aberta
    celebrating: [],         // conquistas recém-desbloqueadas aguardando celebração
  },
  // ---- Módulo 7: assinaturas, recorrências e inteligência ----
  insights: {
    view: "ia",              // "ia" | "padroes" | "comparar"
    monthOffset: 0,          // mês analisado, relativo ao atual
    detailId: null,          // recomendação com o detalhamento aberto
    heatDay: null,           // dia selecionado no mapa de calor
  },
  subs: {
    view: "assinaturas",     // "assinaturas" | "variaveis" | "ignoradas"
    expandedKey: null,       // compromisso com o detalhe aberto
    reviewKey: null,         // [M33] ficha de revisão aberta (memória de tela; não é persistida)
  },
  // ---- Módulo 8: central de notificações ----
  notif: {
    filter: "all",           // "all" | "unread" | id de grupo
    settingsOpen: false,     // painel de silenciar grupos
  },
  accountsUi: {
    view: "accounts",
    accountForm: null,
    cardForm: null,
    transferForm: null,
    reconcileId: null,
    reconcileValue: "",
    payment: null,
  },
  debtsUi: {
    form: null,
    payment: null,
    expandedId: null,
    confirmDeleteId: null,
    extraDraft: null,
  },
  // ---- Personalização do Início e regras de categorização (M11) ----
  // `dashboardEditing` é modo de tela, não dado: sai do ar ao recarregar, e é
  // isso que se espera de um painel de configuração aberto por engano.
  dashboardEditing: false,
  allSearch: "",
  rules: {
    form: null,              // rascunho de criação/edição (null = fechado)
    testText: "",            // laboratório: descrição de exemplo
    showBuiltins: false,     // acordeão das regras de fábrica
    confirmDeleteId: null,   // exclusão em duas etapas
    applyPreview: null,      // prévia da recategorização em massa
  },
  // Bloco que precisa aparecer para a pessoa DEPOIS do próximo render (id do
  // elemento). Só vale uma vez: `afterRender` consome e zera. Ver revealAfterRender.
  revealTarget: null,
  booting: true,             // primeiro paint: esqueleto no lugar dos dados
  // A pessoa já encostou no aplicativo (clique ou tecla). A partir daí a tela é
  // dela: nenhuma promessa de rede que resolve tarde pode tomá-la. Ver
  // refreshOnboardingGate em screens/onboarding.js.
  appEmUso: false,
  // ---- Configuração inicial em 4 passos (screens/onboarding.js) ----
  // Rascunho volátil: só vira dado real na conclusão. Ver freshOnboarding().
  onboarding: freshOnboarding(),
  // ---- Roteamento: pilha de camadas sobrepostas abertas, na ordem ----
  // Espelha o `history.state.ov`. Existe para que o voltar do aparelho feche a
  // camada de cima antes de sair da tela (ver applyHistoryRoute).
  overlayStack: [],
};
state.form = freshTxForm();

let toastTimer = null;

// ------------------------------------------------------------------
// [M6] Modelos de leitura memoizados
// ------------------------------------------------------------------
// `render()` reconstrói a tela inteira a cada evento e cada tela pedia seu
// modelo do zero; varreduras completas de transações/ativos repetidas várias
// vezes por quadro. `memoByData` (perf.js) guarda o resultado pela IDENTIDADE
// do snapshot: como as gravações são imutáveis, um snapshot novo invalida tudo
// sozinho. A chave inclui as dimensões que alteram o cálculo (mês, janela).
function dashboardModel(refDate) {
  return memoByData("dashboard", state.data, keyOfDate(refDate), () => buildDashboardModel(state.data, refDate));
}

function healthModel(monthKey) {
  return memoByData("health", state.data, monthKey, () => buildHealthModel(state.data, monthKey));
}

function goalsModel() {
  return memoByData("goals", state.data, keyOfCurrentMonth(), () => buildGoalsModel(state.data, new Date()));
}

function wealthModel(months) {
  return memoByData("wealth", state.data, String(months), () => buildWealthModel(state.data, months));
}

function portfolioModel(months) {
  return memoByData("portfolio", state.data, String(months), () => buildPortfolioModel(state.data, { months }));
}

function forecastModel() {
  return memoByData("forecast", state.data, todayIso(), () => buildForecast(state.data));
}

// [M7] Os três motores novos entram na mesma memoização por identidade do
// snapshot. `buildAdvisorModel` consome os outros dois, então recebe-os prontos
// em vez de recalculá-los; sem isso um render de dashboard varreria as
// transações três vezes só para montar um cartão.
function analyticsModel(monthKey) {
  return memoByData("analytics", state.data, monthKey, () => buildAnalyticsModel(state.data, monthKey));
}

function recurringModel(monthKey) {
  return memoByData("recurring", state.data, monthKey, () => buildRecurringModel(state.data, { monthKey }));
}

function advisorModel(monthKey) {
  return memoByData("advisor", state.data, monthKey, () => buildAdvisorModel(state.data, monthKey, {
    analytics: analyticsModel(monthKey),
    recurring: recurringModel(monthKey),
  }));
}

function insightsMonthKey() {
  return keyOfDate(addMonths(new Date(), state.insights.monthOffset));
}

function achievementsModel() {
  return memoByData("achievements", state.data, keyOfCurrentMonth(), () => buildAchievementsModel(state.data, new Date()));
}

// [M8] O modelo de notificações depende do snapshot E do filtro de tela, então
// o filtro entra na chave da memoização; sem isso, trocar de aba devolveria a
// lista anterior.
function notificationsModel() {
  return memoByData("notifications", state.data, state.notif.filter, () => (
    NotificationService.model(state.data.notifications, { filter: state.notif.filter })
  ));
}

function debtsModel() {
  const extra = state.debtsUi.extraDraft == null ? state.data.debtPlan.extraMonthly : moneyOrZero(state.debtsUi.extraDraft);
  return memoByData("debts", state.data, `${state.data.debtPlan.strategy}|${extra}`, () => buildDebtModel(state.data, { extraMonthly: extra }));
}

function notificationCountsNow() {
  return memoByData("notif-counts", state.data, "", () => NotificationService.counts(state.data.notifications));
}

// Toda troca de tela passa por aqui; são onze pontos diferentes no arquivo
// (`case "nav"`, cancelamentos de formulário, atalhos de card). Interceptar em
// `setState` em vez de em cada um deles é o que garante que nenhuma navegação
// escape do histórico: uma tela alcançável sem entrada de histórico é uma tela
// da qual o botão voltar do aparelho sai do app.
let __applyingRoute = false;

function setState(patch) {
  const tabChanging = Object.prototype.hasOwnProperty.call(patch, "tab") && patch.tab !== state.tab;
  Object.assign(state, patch);
  if (tabChanging && !__applyingRoute) pushRouteForCurrentTab();
  render();
}

// ------------------------------------------------------------------
// Roteamento; endereço da tela e camadas sobrepostas
// ------------------------------------------------------------------

// Camada sobreposta é estado efêmero, não endereço: ela não entra no hash, só
// na pilha do `history.state`. Assim o voltar fecha o modal antes de trocar de
// tela, que é o comportamento esperado em qualquer app nativo.
function pushRouteForCurrentTab() {
  // Trocar de tela com um modal aberto deixaria a pilha do histórico
  // descrevendo camadas que não existem mais. O estado real já é fechado pelos
  // fluxos que navegam; aqui zeramos a contabilidade.
  state.overlayStack = [];
  NavHistory.push(state.tab, []);
}

function openOverlay(name) {
  if (state.overlayStack.indexOf(name) !== -1) return;
  state.overlayStack.push(name);
  NavHistory.push(state.tab, state.overlayStack);
}

// Ids alcançados por uma sugestão da caixa de revisão. `data-ids` traz o grupo
// (as parcelas de uma compra); `data-id` é o fallback de item único.
function reviewIssueIds(el) {
  const brutos = String((el && el.dataset && el.dataset.ids) || "").split(/\s+/).filter(Boolean);
  if (brutos.length) return new Set(brutos);
  const unico = el && el.dataset ? el.dataset.id : null;
  return new Set(unico ? [unico] : []);
}

// ------------------------------------------------------------------------------
// [M26] "PROTEGER MEUS DADOS"
// ------------------------------------------------------------------------------
// O aviso da tela inicial é uma linha; o que fazer a respeito não cabe nela. As
// duas saídas reais do produto são backup e conta, e as duas aparecem aqui, com
// o risco dito uma vez, sem alarme: quem limpa o site no navegador ou desinstala
// o app perde o que está só no aparelho.
function openProtectDataDialog() {
  requestConfirmation({
    title: "Proteger seus dados",
    message: "Hoje eles existem só neste aparelho. Baixar um backup guarda uma cópia onde você escolher; ligar uma conta mantém tudo em dia entre aparelhos. Sem uma das duas, limpar os dados do site no navegador ou desinstalar o app leva junto o que está aqui.",
    icon: "shieldCheck",
    confirmLabel: "Baixar backup completo",
    alternateLabel: "Criar conta e sincronizar",
    alternateIcon: "refresh",
    cancelLabel: "Agora não",
    onConfirm: () => { exportBackupJson(); },
    onAlternate: () => { setState({ tab: "account" }); },
  });
}

// A CONDIÇÃO É O QUE MANTÉM O AVISO DISCRETO.
//
// Ele não aparece para quem não tem o que perder, nem para quem já resolveu, e
// some sozinho quando o problema deixa de existir. Um aviso que aparece sempre
// é um aviso que ninguém lê.
function shouldWarnLocalOnly() {
  if (isDemoMode()) return false;
  if (state.localOnlyDismissed) return false;
  if (state.booting) return false;
  // Com conta ligada, os dados não estão só aqui.
  if (state.account && state.account.authenticated) return false;
  // Sem nada lançado não há perda possível, e o começo da tela já é outro.
  const total = (state.data.transactions || []).length;
  if (total === 0) return false;
  // Backup recente conta como resolvido. É a mesma régua de renderLastBackupLine.
  const last = state.data.lastBackupAt;
  if (last) {
    const dias = Math.floor((Date.parse(`${todayIso()}T12:00:00`) - Date.parse(`${last}T12:00:00`)) / 86400000);
    if (Number.isFinite(dias) && dias < 30) return false;
  }
  return true;
}

function renderLocalOnlyNotice() {
  const last = state.data.lastBackupAt;
  const detalhe = last
    ? "O último backup foi há mais de 30 dias."
    : "Ainda não há backup.";
  return `<p class="local-only" role="status">
    ${svgIcon("info", 14)}
    <span class="local-only__text">Seus dados estão salvos somente neste dispositivo. ${detalhe}</span>
    <button type="button" class="link-btn local-only__action" data-action="protect-data">Proteger meus dados</button>
    <button type="button" class="icon-btn local-only__close" data-action="local-only-dismiss" aria-label="Dispensar aviso por esta sessão">${svgIcon("x", 13)}</button>
  </p>`;
}

function requestConfirmation(options) {
  const o = options && typeof options === "object" ? options : {};
  state.confirmation = {
    title: String(o.title || "Confirmar ação"),
    message: String(o.message || "Deseja continuar?"),
    confirmLabel: String(o.confirmLabel || "Confirmar"),
    cancelLabel: String(o.cancelLabel || "Cancelar"),
    tone: o.tone === "danger" ? "danger" : "default",
    icon: String(o.icon || (o.tone === "danger" ? "trash" : "alertTriangle")),
    onConfirm: typeof o.onConfirm === "function" ? o.onConfirm : function () {},
    alternateLabel: o.alternateLabel ? String(o.alternateLabel) : null,
    alternateIcon: String(o.alternateIcon || "archive"),
    onAlternate: typeof o.onAlternate === "function" ? o.onAlternate : function () {},
    accepted: false,
    choice: null,
    requiredText: o.requiredText ? String(o.requiredText) : null,
    typedText: "",
  };
  openOverlay("confirmation");
  render();
}

// Fecha só o ESTADO da camada. Não mexe no histórico; quem chama decide isso.

function closeOverlayState(name) {
  switch (name) {
    case "celebration": state.gamification.celebrating = []; break;
    case "category": state.categoryPickerFor = null; break;
    case "category-editor": state.categoriesUi.editor = null; break;
    // `QrScanner.stop()` libera a câmera. Guardado pelo `open` porque o voltar
    // e o botão de fechar podem chegar aqui na mesma sequência.
    case "qr": if (state.qr.open) { try { QrScanner.stop(); } catch (e) { /* ignora */ } } state.qr.open = false; break;
    case "wrapped": state.wrapped.open = false; break;
    case "movement-detail": state.movementDetailId = null; break;
    case "review-card-payment": state.movementReviewCard = { accountId:"", creditCardId:"" }; break;
    case "calculation": state.calculationDetail = null; break;
    case "assistant": state.contextualAssistant = { open:false, responseId:null }; break;
    // Fechar a prévia zera a escolha da sessão. A preferência salva continua em
    // `privacy.aiHide`; o que morre aqui é o rascunho, para a próxima abertura
    // não herdar uma marcação que o usuário abandonou sem enviar.
    case "ai-preview": state.aiPreview = { monthKey: null, hide: [], showJson: false }; break;
    case "confirmation": {
      const pending = state.confirmation;
      state.confirmation = null;
      const callback = pending && pending.choice === "alternate"
        ? pending.onAlternate
        : (pending && pending.accepted ? pending.onConfirm : null);
      // O callback NÃO pode rodar dentro da reconciliação do histórico.
      // `dismissOverlay` chega aqui por `applyHistoryRoute`, que logo em
      // seguida compara `route.tab` com `state.tab` para restaurar a rota. Quem
      // confirma quase sempre navega (excluir um lançamento tem de voltar para
      // a tela de onde ele foi aberto), e essa navegação era desfeita na mesma
      // passada: o usuário confirmava a exclusão em Movimentações e caía no
      // formulário "Novo gasto" em branco. Uma volta ao laço de eventos separa
      // "fechar a camada" de "reagir à confirmação".
      if (callback) {
        setTimeout(() => {
          try {
            Promise.resolve(callback()).catch(() => notify("Não foi possível concluir esta ação", "danger"));
          } catch (err) {
            notify("Não foi possível concluir esta ação", "danger");
          }
        }, 0);
      }
      break;
    }
    default: break;
  }
}

// Fechar pelo X, pelo Esc ou pelo clique fora é a MESMA operação que o voltar do
// aparelho. Delegar ao histórico mantém uma única sequência: sem isso, fechar
// pelo X deixaria uma entrada órfã e o voltar seguinte não faria nada visível.
function dismissOverlay(name) {
  const i = state.overlayStack.lastIndexOf(name);
  if (i === -1 || !NavHistory.supported()) {
    closeOverlayState(name);
    state.overlayStack = state.overlayStack.filter((n) => n !== name);
    render();
    return;
  }
  NavHistory.go(-(state.overlayStack.length - i));
}

function closeTopOverlay() {
  if (state.overlayStack.length === 0) return false;
  dismissOverlay(state.overlayStack[state.overlayStack.length - 1]);
  return true;
}

// Reconciliação depois de um `popstate`: o histórico é a verdade, o estado se
// ajusta a ele. Camadas acima do alvo são fechadas de cima para baixo.
function applyHistoryRoute() {
  const route = NavHistory.current();
  __applyingRoute = true;
  try {
    while (state.overlayStack.length > route.overlays.length) {
      closeOverlayState(state.overlayStack.pop());
    }
    if (route.tab !== state.tab) {
      state.overlayStack = [];
      state.backup.error = null;
      if (route.tab === "add" && !state.editingTxId && !state.form.origin) state.form = freshTxForm();
      state.tab = route.tab;
      EventBus.emit(APP_EVENTS.TAB_CHANGED, { tab: route.tab });
    }
  } finally {
    __applyingRoute = false;
  }
  render();
}

// [M25] A DEMONSTRAÇÃO NÃO GRAVA E NÃO SOBE. AS DUAS GUARDAS SÃO AQUI.
//
// `setData` é "o ponto por onde TODA alteração passa" (ver o comentário do
// agendamento de nuvem, abaixo). Guardar o modo aqui, em vez de espalhar
// verificações por cada tela, é o que torna a promessa verificável: enquanto
// `state.demo.active` for verdadeiro, nem `saveData` nem `CloudSync.schedule`
// são chamados, e o banco do usuário continua exatamente como estava.
function isDemoMode() {
  return !!(state.demo && state.demo.active);
}

function setData(updater) {
  state.data = typeof updater === "function" ? updater(state.data) : updater;
  const ok = isDemoMode() ? true : saveData(state.data);
  if (!ok) notify("Não foi possível salvar os dados neste navegador");
  render();
  // [M6] A verificação de conquistas é reavaliação completa (metas, reserva,
  // orçamentos, patrimônio). Roda no tempo ocioso para não entrar no caminho
  // crítico do quadro que o usuário acabou de provocar.
  idleTask(syncAchievements);
  // [M8] O Event Bus é o ponto de extensão do §19: quem quiser reagir a uma
  // gravação assina o evento em vez de ser chamado explicitamente daqui.
  EventBus.emit(APP_EVENTS.DATA_CHANGED, { data: state.data });
  idleTask(syncNotifications);
  // Envio para a nuvem, quando há conta conectada. É debounced lá dentro e
  // ignora a gravação que a própria sincronização acabou de aplicar, então
  // chamar aqui (o ponto por onde TODA alteração passa) não cria realimentação.
  // O `typeof` é o mesmo cuidado usado com `reportSafeError` e `NavHistory`:
  // gravar é a operação mais crítica do app e não pode depender de um módulo
  // opcional ter sido carregado.
  if (typeof CloudSync !== "undefined" && !isDemoMode()) CloudSync.schedule();
}

// ------------------------------------------------------------------------------
// [M25] ENTRAR E SAIR DA DEMONSTRAÇÃO
// ------------------------------------------------------------------------------
// Entrar troca `state.data` por um conjunto fictício e desliga a sincronização.
// Sair não "desfaz" nada: relê o disco, que nunca foi tocado. É por isso que não
// existe caminho em que a demonstração possa vazar para a conta ou para o banco
// local; não há o que vazar.
function enterDemoMode() {
  if (isDemoMode()) return;
  // Desligar ANTES de trocar os dados: uma resposta remota em voo aplicaria
  // conteúdo da conta por cima da demonstração, ou o contrário.
  if (typeof CloudSync !== "undefined") CloudSync.disable();
  // Guardar se o assistente estava aberto é o que devolve o aceite da política
  // ao lugar dele quando a demonstração termina. Sem isto, olhar a
  // demonstração viraria um caminho para entrar no app sem passar pelo aceite,
  // que é justamente a porta que o assistente existe para segurar.
  state.demo = { active: true, startedAt: new Date().toISOString(), onboardingWasOpen: !!state.onboarding.open };
  state.onboarding.open = false;
  state.form = freshTxForm();
  state.data = buildDemoData();
  setState({ tab: "dashboard", monthOffset: 0 });
  notify("Você está na demonstração. Nada aqui é salvo nem sincronizado.");
}

function exitDemoMode(options) {
  if (!isDemoMode()) return;
  const opts = options || {};
  const voltarAoAssistente = !!state.demo.onboardingWasOpen;
  state.demo = { active: false };
  // O snapshot do disco, intacto desde antes de a demonstração começar.
  state.data = loadData();
  // O assistente volta exatamente como estava, inclusive com o aceite pendente.
  if (voltarAoAssistente && !(state.data.onboarding && state.data.onboarding.done)) {
    state.onboarding.open = true;
  }
  state.form = freshTxForm();
  state.storageOk = isStorageAvailable();
  if (typeof refreshOnboardingGate === "function") refreshOnboardingGate();
  // A conta volta a sincronizar sozinha; sem conta, `enable` não faz nada.
  if (typeof CloudSync !== "undefined" && state.account && state.account.authenticated) CloudSync.enable();
  setState({ tab: opts.tab || "dashboard", monthOffset: 0 });
  notify(opts.quiet ? "" : "Demonstração encerrada. Estes são os seus dados.");
}

// Alteração que veio de FORA (outro aparelho ou outra aba). Grava e redesenha
// como qualquer outra, mas NÃO agenda envio: não há nada deste aparelho para
// mandar, e agendar faria cada alteração recebida provocar uma volta de rede.
//
// A gravação em si é segura contra laço porque o registro já chega marcado por
// quem o alterou; `stampChangeSet` só reivindica o que foi alterado aqui.
// O que chegou de fora JÁ ESTÁ GRAVADO quando esta função roda: quem persiste é
// `FinanceStore.applyRemoteOps`, na mesma transação que confirma a operação
// remota. Regravar aqui reabriria a janela em que o cursor avançava sem o dado
// ter chegado ao disco, e ainda faria o aparelho reivindicar a alteração alheia.
function setDataFromRemote(next) {
  state.data = next;
  // Conteúdo que desceu da conta é prova de que a configuração inicial já foi
  // feita. Sem esta linha, o assistente aberto por um banco local vazio
  // continuava na frente da tela mesmo depois de os dados chegarem, e quem o
  // respondia cadastrava a conta do banco uma segunda vez.
  if (typeof refreshOnboardingGate === "function") refreshOnboardingGate();
  render();
  idleTask(syncAchievements);
  EventBus.emit(APP_EVENTS.DATA_CHANGED, { data: state.data, origin: "remote" });
  idleTask(syncNotifications);
}

// ------------------------------------------------------------------
// [M6] Sincronização das conquistas
// ------------------------------------------------------------------
// Compara o que o dado de HOJE satisfaz com o que já está registrado e grava
// apenas a diferença. Duas salvaguardas importantes:
//   • reentrância; gravar o desbloqueio dispara `setData`, que agendaria outra
//     verificação; o guard corta o laço;
//   • primeiro boot; quem já usa o app há meses desbloquearia 20 medalhas de
//     uma vez. Nesse caso registramos tudo em silêncio (sem celebração) e só
//     comemoramos daí em diante. Ver `silent` abaixo.
let __achSyncing = false;

function syncAchievements(opts) {
  if (__achSyncing) return;
  const record = state.data.achievements || defaultAchievements();
  if (!record.enabled) return;
  const silent = !!(opts && opts.silent);
  const model = achievementsModel();
  const pending = model.items.filter((i) => i.isNew);
  const initializing = !record.initialized;
  if (pending.length === 0 && !initializing) return;

  __achSyncing = true;
  try {
    const ids = pending.map((i) => i.id);
    setData((d) => ({
      ...d,
      achievements: { ...withUnlockedAchievements(d.achievements, ids), enabled: true, initialized: true },
    }));
    if (!silent && !initializing && pending.length > 0) {
      state.gamification.celebrating = pending
        .slice()
        .sort((a, b) => ACH_TIERS[b.tier].weight - ACH_TIERS[a.tier].weight);
      openOverlay("celebration");
      render();
    }
  } finally {
    __achSyncing = false;
  }
}

// ------------------------------------------------------------------
// [M8] Sincronização das notificações
// ------------------------------------------------------------------
// Mesmo contrato da sincronização de conquistas: o motor devolve as candidatas
// do momento, a fusão descarta o que já existe (identidade = `key`) e só a
// diferença é gravada. As mesmas duas salvaguardas valem aqui:
//
//   • reentrância; gravar dispara `setData`, que agendaria outra verificação;
//   • primeiro boot; quem já usa o app teria dezenas de avisos não lidos de
//     uma vez. O passado entra já lido (`silent`).
let __notifSyncing = false;

function syncNotifications(opts) {
  if (__notifSyncing) return;
  const current = normalizeNotifications(state.data.notifications);
  const silent = !!(opts && opts.silent) || !current.initialized;

  let result;
  try {
    const monthKey = keyOfCurrentMonth();
    const candidates = NotificationService.build(state.data, {
      monthKey,
      muted: current.muted,
      // Modelos já memoizados por identidade do snapshot: a central não paga de
      // novo por uma varredura que o dashboard já fez neste mesmo quadro.
      models: { recurring: recurringModel(monthKey), forecast: forecastModel() },
    });
    result = NotificationService.sync(current, candidates, { silent });
  } catch (e) {
    if (typeof reportSafeError === "function") reportSafeError("app", e, "notification_sync");
    return;
  }

  const changed = result.created.length > 0 || result.state.lastSyncAt !== current.lastSyncAt || silent;
  if (!changed) return;

  __notifSyncing = true;
  try {
    setData((d) => ({ ...d, notifications: result.state }));
    if (result.created.length > 0) {
      EventBus.emit(APP_EVENTS.NOTIFICATIONS_CREATED, { items: result.created });
    }
  } finally {
    __notifSyncing = false;
  }
}

function notify(msg, tone) {
  state.toast = msg;
  state.toastTone = tone || null;
  render();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { state.toast = null; state.toastTone = null; render(); }, 2400);
}

// ---------------- Render root with focus preservation ----------------
// `render()` reconstrói o DOM inteiro, então o campo que estava sendo digitado
// deixa de existir. Reencontrá-lo SÓ pelo `id` era frágil: um input sem `id`
// (havia quatro na máquina do tempo e no What-If) perdia o foco na primeira
// tecla; e, ao tocar de novo, o cursor voltava para o começo, fazendo os
// números saírem fora de ordem. A chave de foco agora tem plano B: o par
// `data-field` + `data-id`, que todo campo delegado já possui.
function attrSelectorValue(v) {
  return String(v).replace(/["\\]/g, "\\$&");
}

// A CHAVE PRECISA COBRIR BOTÃO, NÃO SÓ CAMPO.
//
// `render()` refaz o DOM inteiro a cada interação, e o elemento que tinha o
// foco deixa de existir. Esta função descreve QUAL era ele de um jeito que
// sobreviva à reconstrução.
//
// Antes ela só sabia responder por `id` e por `data-field`, ou seja, só por
// campo de formulário. Todo o resto da interface é botão com `data-action` e
// nenhum dos dois: chip de categoria, forma de pagamento, preset de orçamento,
// navegação, ícones de linha. Para todos eles a função devolvia `null`,
// `restoreFocus` saía na primeira linha e o foco caía no `<body>`. Quem usa
// teclado voltava para o topo da página a cada escolha e precisava tabular a
// tela inteira de novo.
// O ATALHO DE PULAR SÓ EXISTE ENQUANTO TEM O FOCO, E ISSO O TIRAVA DA TELA.
//
// `.skip-link` fica escondido acima da borda e desce quando recebe foco. No
// celular, tocar num link dá foco a ele; a partir daí TODO render devolvia o
// foco pelo seletor `[data-action="skip-to-content"]`, e a pilha verde "Ir para
// o conteúdo" ficava colada no alto da tela, por cima do relógio e do conteúdo,
// atravessando telas e minutos, sem jeito de fechar. Um controle que só serve
// de trampolim para o conteúdo não deve ser reencontrado depois do render: se
// ele ainda tiver o foco de verdade, o navegador o mantém sozinho.
const FOCO_NAO_RESTAURAVEL = new Set(["skip-to-content"]);

function focusKeyOf(el) {
  if (!el) return null;
  if (el.dataset && FOCO_NAO_RESTAURAVEL.has(el.dataset.action)) return null;
  if (el.id) return { by: "id", id: el.id };
  const ds = el.dataset || {};
  if (ds.field) {
    const sel = `[data-field="${attrSelectorValue(ds.field)}"]` +
      (ds.id ? `[data-id="${attrSelectorValue(ds.id)}"]` : "");
    return { by: "selector", sel };
  }

  const action = ds.action || ds.actionSelect;
  if (!action) return null;
  const atributo = ds.action ? "data-action" : "data-action-select";
  let sel = `[${atributo}="${attrSelectorValue(action)}"]`;
  // `id`, `value` e `tab` são o que distingue dois botões da mesma ação: a
  // categoria escolhida, o preset, a aba de destino.
  if (ds.id) sel += `[data-id="${attrSelectorValue(ds.id)}"]`;
  if (ds.value) sel += `[data-value="${attrSelectorValue(ds.value)}"]`;
  if (ds.tab) sel += `[data-tab="${attrSelectorValue(ds.tab)}"]`;

  // Mesmo assim sobram repetidos (vários "Remover" numa lista, por exemplo).
  // Guardar a posição evita devolver o foco para o irmão errado, que seria
  // pior do que perdê-lo: o próximo Enter agiria sobre outra linha.
  let nth = 0;
  try { nth = document.querySelectorAll(sel).length > 1 ? [...document.querySelectorAll(sel)].indexOf(el) : 0; } catch (e) { nth = 0; }
  return { by: "selector", sel, nth: nth > 0 ? nth : 0 };
}

function restoreFocus(key, selStart, selEnd) {
  if (!key) return;
  let el = null;
  try {
    if (key.by === "id") el = document.getElementById(key.id);
    else if (key.nth) el = document.querySelectorAll(key.sel)[key.nth] || document.querySelector(key.sel);
    else el = document.querySelector(key.sel);
  } catch (e) { el = null; }
  // O elemento pode simplesmente não existir mais: apagar uma linha remove o
  // próprio botão que foi acionado. Aí não há para onde voltar, e insistir num
  // vizinho seria pior do que deixar o navegador seguir a ordem natural.
  if (!el || typeof el.focus !== "function") return;
  // O FOCO ERA O QUE JOGAVA A TELA PARA CIMA.
  //
  // `render()` recria o campo e devolve o foco a ele. Sem `preventScroll`, o
  // navegador leva a janela (e a folha modal) até o elemento recém-criado, que
  // no DOM novo está em outra posição: a pessoa digitava uma letra no editor de
  // categoria e a tela saltava. Navegador antigo ignora o objeto de opções e
  // lança; nesse caso o foco comum ainda vale, e a rolagem guardada é reposta
  // logo depois, em render().
  try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
  // `setSelectionRange` lança em input[type=number]; o try/catch mantém o foco
  // mesmo quando o cursor não pode ser reposicionado.
  if (selStart != null && el.setSelectionRange) {
    try { el.setSelectionRange(selStart, selEnd); } catch (e) {}
  }
}

// O tema é escrito também numa chave própria e pequena do localStorage, lida
// por js/boot.js no <head>. É isso que evita o flash branco em quem usa o
// aparelho no escuro: o atributo passa a existir antes da primeira pintura, e
// não só quando o app.js executa, no fim de trinta scripts.
const THEME_KEY = "financas_theme";

function applyTheme(theme) {
  const t = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", t);
  // A faixa da barra de status do app instalado é pintada por esta etiqueta, e
  // o tema é escolha da pessoa, não do sistema (ver js/boot.js, que a escreve
  // antes da primeira pintura). Aqui a folha já existe, então a cor vem do
  // próprio `--paper` em vez de um segundo lugar para esquecer de atualizar.
  const meta = document.querySelector('meta[name="theme-color"]');
  // `getComputedStyle` é conferido porque o DOM mínimo dos testes em Node não o
  // tem, e uma cor de barra de status não vale derrubar a suíte inteira.
  if (meta && typeof getComputedStyle === "function") {
    const paper = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim();
    if (paper) meta.setAttribute("content", paper);
  }
  try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* modo anônimo: sem persistência */ }
}

// "O usuário nunca escolheu tema" tem de ser capturado AGORA, na carga do
// script, e não dentro do init(): o próprio `applyTheme` grava a chave, então
// qualquer leitura posterior encontraria um valor escrito pelo app e concluiria
// que houve escolha. Era exatamente esse o defeito; o app abria em claro para
// quem usa o aparelho no escuro.
const __themeNeverChosen = (function () {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v !== "dark" && v !== "light";
  } catch (e) {
    return false;   // sem localStorage não há como distinguir; não força nada
  }
})();

// Preferência do sistema, só no primeiro uso. A partir do primeiro toque no
// interruptor, a escolha do usuário manda.
function systemThemePreference() {
  if (!__themeNeverChosen) return null;
  try {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  } catch (e) { return null; }
  return null;
}

// A MESMA TELA REDESENHADA NÃO PODE VOLTAR PARA O TOPO.
//
// Um redesenho só tem direito de herdar a rolagem quando continua sendo A MESMA
// coisa na tela: mesma aba, mesma camada aberta, mesmo passo do assistente,
// mesmo editor. Trocar de aba, abrir ou fechar uma folha e avançar o onboarding
// são justamente os momentos em que começar do topo é o certo, e por isso cada
// um deles entra nesta chave.
function renderSurfaceKey() {
  const onboarding = state.onboarding && state.onboarding.open ? `onb:${state.onboarding.step}` : "";
  const editor = state.categoriesUi && state.categoriesUi.editor
    ? `cat-editor:${state.categoriesUi.editor.id || "novo"}`
    : "";
  return [
    state.booting ? "booting" : "app",
    onboarding || `tab:${state.tab}`,
    `ov:${(state.overlayStack || []).join(">")}`,
    state.confirmation ? "confirm" : "",
    state.categoryPickerFor ? `cat-picker:${state.categoryPickerFor}` : "",
    editor,
    state.calculationDetail ? "calc" : "",
    state.editingTxId ? `tx:${state.editingTxId}` : "",
  ].join("|");
}

// Chave do que está DESENHADO agora. O estado já mudou quando `render()` roda
// (quem tratou o clique mexeu nele antes de pedir o desenho), então comparar o
// estado com ele mesmo diria sempre "é a mesma tela".
let __superficieDesenhada = null;

// NÃO É SÓ A JANELA QUE ROLA.
//
// Preservar só a rolagem da página deixava o defeito de pé onde ele mais
// incomoda: a grade de ícones do editor de categoria rola por conta própria, e
// escolher um ícone da última fila a jogava de volta para o topo, levando junto
// o ícone que a pessoa acabou de escolher. O mesmo vale para a folha modal, a
// lista da revisão de extrato e o seletor de subcategoria.
//
// A lista é explícita porque a alternativa (ler o estilo calculado de cada
// elemento a cada quadro) custaria um cálculo de layout por render. Um teste
// confere esta lista contra o CSS, então um contêiner rolável novo não passa
// despercebido; `[data-scroll-keep]` cobre quem preferir marcar no HTML.
const SCROLL_CONTAINERS = ".modal-sheet, .cat-icon-grid, .cat-picker-list, .import-list, .ai-preview__body, .ai-preview__json pre, .onb__body, .side-nav, [data-scroll-keep]";

function scrollContainerNodes() {
  if (typeof document.querySelectorAll !== "function") return [];
  try { return document.querySelectorAll(SCROLL_CONTAINERS); } catch (e) { return []; }
}

function captureScrollSnapshot() {
  const nodes = scrollContainerNodes();
  const containers = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    const top = node && typeof node.scrollTop === "number" ? node.scrollTop : 0;
    // Só o que está fora do topo precisa voltar; guardar zeros faria a reposição
    // brigar com quem nasce no lugar certo.
    if (top) containers.push([i, top]);
  }
  return {
    x: typeof window.scrollX === "number" ? window.scrollX : 0,
    y: typeof window.scrollY === "number" ? window.scrollY : 0,
    containers,
  };
}

// A posição na lista serve de chave: com a mesma tela desenhada, o mesmo
// conjunto de contêineres aparece na mesma ordem. É o que evita depender de um
// id que a maioria deles não tem.
function restoreScrollSnapshot(snapshot) {
  if (!snapshot) return;
  if ((snapshot.x || snapshot.y) && typeof window.scrollTo === "function") {
    try { window.scrollTo(snapshot.x, snapshot.y); } catch (e) { /* navegador sem scrollTo programático */ }
  }
  if (!snapshot.containers.length) return;
  const nodes = scrollContainerNodes();
  snapshot.containers.forEach((item) => {
    const node = nodes[item[0]];
    if (node && typeof node.scrollTop === "number") node.scrollTop = item[1];
  });
}

function render() {
  const root = document.getElementById("app");
  const active = document.activeElement;
  const focusKey = focusKeyOf(active);
  const selStart = active && "selectionStart" in active ? active.selectionStart : null;
  const selEnd = active && "selectionStart" in active ? active.selectionEnd : null;
  const surfaceKey = renderSurfaceKey();
  // `revealTarget` é rolagem pedida de propósito (o formulário que abre longe do
  // botão). Herdar a posição antiga desfaria exatamente o que ela existe para
  // fazer.
  const snapshot = __superficieDesenhada === surfaceKey && !state.revealTarget
    ? captureScrollSnapshot()
    : null;
  applyTheme(state.data.theme);
  root.innerHTML = renderShell();
  restoreScrollSnapshot(snapshot);
  restoreFocus(focusKey, selStart, selEnd);
  // De novo depois do foco: num navegador sem `preventScroll` o `catch` acima
  // rola a página até o campo, e é esta segunda reposição que segura a tela.
  restoreScrollSnapshot(snapshot);
  __superficieDesenhada = surfaceKey;
  afterRender();
}

// ---------------- Animação de entrada, controlada por mudança real ----------------
// `render()` reconstrói o DOM inteiro a cada evento (inclusive `change` de
// campo). Se a animação morasse só no CSS, ela reiniciaria a cada tecla. Por
// isso a classe só é aplicada quando a aba (ou o modal) realmente muda.
let __enterTab = null;

let __enterModal = null;

function markEnterAnimations() {
  const screenEl = document.querySelector(".main-content .screen");
  if (screenEl) {
    if (__enterTab !== state.tab) screenEl.classList.add("screen--enter");
    __enterTab = state.tab;
  } else {
    __enterTab = null;
  }

  const modalKey = state.calculationDetail ? "calculation" : (state.contextualAssistant.open ? "assistant" : (state.qr.open ? "qr" : (state.wrapped.open ? "wrapped" : (state.categoryPickerFor ? "cat" : (state.categoriesUi.editor ? "cat-editor" : null)))));
  const overlay = document.querySelector(".modal-overlay");
  if (overlay && modalKey !== __enterModal) overlay.classList.add("modal-overlay--enter");
  __enterModal = modalKey;
}

// O FORMULÁRIO QUE ABRE FORA DA TELA PARECE BOTÃO QUEBRADO.
//
// Vários cadastros (patrimônio, investimentos) desenham o formulário no TOPO da
// tela, enquanto o botão que o abre está lá embaixo; no patrimônio, "Cadastrar
// o primeiro item" fica depois de gráficos, comparação anual e leitura do
// período. `render()` reconstrói o DOM e o navegador mantém a rolagem onde
// estava: a pessoa clica, nada se move, e a conclusão razoável é que o botão
// não funciona. Ela clica de novo, e de novo.
//
// Quem abre o formulário marca `state.revealTarget` com o id do bloco; aqui a
// tela vai até ele e põe o cursor no primeiro campo. Vale uma vez só, porque
// `render()` roda a cada tecla digitada e rolar a tela a cada letra seria pior
// que o defeito original.
function revealAfterRender() {
  const id = state.revealTarget;
  if (!id) return;
  state.revealTarget = null;
  const target = document.getElementById(id);
  if (!target || typeof target.scrollIntoView !== "function") return;
  try { target.scrollIntoView({ behavior: "smooth", block: "start" }); }
  catch (e) { target.scrollIntoView(); }
  const field = typeof target.querySelector === "function"
    ? target.querySelector("input:not([type=hidden]), select, textarea")
    : null;
  // `preventScroll` evita que o foco desfaça a rolagem suave que acabou de
  // começar; onde o navegador não conhece a opção, o foco simplesmente rola.
  if (field && typeof field.focus === "function") {
    try { field.focus({ preventScroll: true }); } catch (e) { field.focus(); }
  }
}

function afterRender() {
  markEnterAnimations();
  revealAfterRender();
  if (window.CofreUI) {
    window.CofreUI.dialogs.sync();
    window.CofreUI.forms.sync({ focus: false });
  }
  if (state.qr.open && !state.qr.draft && QrScanner.isSupported()) {
    const video = document.getElementById("qr-video");
    if (video && !QrScanner.stream) startQrFlow(video);
  }
  if (state.wrapped.open) {
    const canvas = document.getElementById("wrapped-canvas");
    if (canvas) drawWrappedCard(canvas, buildWrappedData(state.data));
  }
}

async function startQrFlow(video) {
  try {
    await QrScanner.start(video, onQrDetected);
  } catch (e) {
    if (typeof reportSafeError === "function") reportSafeError("qr", e, "qr_camera");
    state.qr.error = "Não foi possível acessar a câmera. Verifique as permissões do navegador.";
    render();
  }
}

// Um único ponto de entrada para qualquer QR lido. A classificação (PIX x nota
// fiscal x desconhecido) mora em qrcode.js; aqui só cuidamos do fluxo de tela.
async function onQrDetected(raw) {
  state.qr.checking = true;
  state.qr.error = null;
  render();

  let parsed = classifyQrPayload(raw);

  // PIX resolve tudo offline. Nota fiscal só tem a URL: tentamos enriquecer com
  // o portal da SEFAZ (quase sempre bloqueado por CORS) antes de desistir.
  if (parsed.kind === "nfce" && parsed.amount == null) {
    let details = null;
    try { details = await tryFetchNfceDetails(raw); }
    catch (error) { if (typeof reportSafeError === "function") reportSafeError("qr", error, "qr_lookup"); }
    if (details) {
      parsed = { ...parsed, amount: details.valor != null ? details.valor : null, merchant: details.estabelecimento || null };
    }
  }

  state.qr.checking = false;

  if (!parsed.valid) {
    state.qr.error = parsed.kind === "url"
      ? "O endereço do QR não pertence a um portal fiscal reconhecido. Por segurança, a página não foi consultada."
      : "Esse QR Code não parece ser um PIX nem uma nota fiscal. Você pode lançar o gasto manualmente.";
    state.qr.draft = null;
    render();
    return;
  }
  if (parsed.kind === "pix" && parsed.crcOk === false) {
    // CRC é o que separa "li um QR" de "li o QR certo". Avisamos e deixamos o
    // usuário conferir o valor em vez de gravar um número possivelmente errado.
    state.qr.error = "O código foi lido, mas a verificação de integridade falhou. Confira o valor antes de salvar.";
  }

  state.qr.draft = draftFromQr(parsed, state.data);
  render();
}

// Joga o resultado do QR dentro do formulário de novo gasto (é isto que o
// usuário espera: revisar antes de gravar).
function applyQrDraftToForm(draft) {
  state.form = {
    type: "expense",
    amount: draft.amount || "",
    categoryId: draft.categoryId || state.data.categories[0].id,
    date: todayIso(),
    payment: draft.payment || "Outro",
    description: draft.description || "",
    recurring: false,
    installments: "1",
    source: draft.source || "manual",
    origin: draft.kind === "pix" ? "Pix lido por QR Code" : "Nota fiscal lida por QR Code",
  };
  state.editingTxId = null;
}

// OS DOIS CAMPOS DE ARQUIVO NÃO PODEM MORAR DENTRO DE `#app`.
//
// `render()` refaz `#app` inteiro por `innerHTML`, e enquanto o seletor de
// arquivos está aberto o aplicativo continua vivo. No iPhone isso é regra, não
// exceção: o Safari congela temporizadores e sincronização ao abrir o app
// Arquivos e solta tudo de uma vez quando a pessoa volta com o extrato
// escolhido: o toast que ia sumir, o relógio da nuvem, a revalidação da
// sessão. Qualquer um deles redesenha, e o `<input>` que abriu o seletor deixa
// de existir. O `change` então chega num nó solto, não sobe até `#app`, e a
// tela não muda: dá para escolher o extrato e não acontece absolutamente nada,
// que é o defeito relatado.
//
// Fora de `#app` o campo é criado uma vez e nenhum `render()` o alcança. O
// `change` é ouvido no próprio grupo em vez de por delegação, pelo mesmo
// motivo. Continuam invisíveis e fora da leitura de tela: quem tem rótulo de
// verdade é o botão de restaurar backup e a área de soltar do importador.
let __fileInputsHost = null;

function ensureFileInputs() {
  if (__fileInputsHost && __fileInputsHost.isConnected) return __fileInputsHost;
  const host = document.createElement("div");
  host.id = "file-inputs";
  host.innerHTML = `
    <input type="file" id="import-file-input" class="file-input-offscreen" tabindex="-1" aria-hidden="true" accept="application/json,.json" />
    <input type="file" id="statement-file-input" class="file-input-offscreen" tabindex="-1" aria-hidden="true"${statementAcceptAttr()} />`;
  document.body.appendChild(host);
  host.addEventListener("change", onChange);
  __fileInputsHost = host;
  return host;
}

// Ponto único para abrir um dos dois seletores. Garantir o campo aqui, e não só
// na partida, evita o `TypeError` de clicar em `null` se a ordem de carga mudar.
function openFilePicker(id) {
  const host = ensureFileInputs();
  const input = host.querySelector(`#${id}`);
  if (input) input.click();
}

// O CAMPO DE ARQUIVO SÓ É LIMPO DEPOIS QUE A LEITURA TERMINA.
//
// Limpar antes (`input.value = ""` logo após disparar a leitura) solta a
// `FileList`, e no iPhone é ela que segura o arquivo escolhido: a leitura em
// curso morre no meio e vira "Não foi possível ler o arquivo. Tente
// selecioná-lo novamente.", sempre, por mais vezes que a pessoa escolha o
// extrato, porque a corrida é ganha pela limpeza todas as vezes.
//
// A limpeza continua sendo necessária, para que escolher o MESMO arquivo de novo
// dispare um novo `change`; só mudou o momento. O manipulador é chamado de forma
// síncrona, dentro do próprio `change`, para que a cópia dos bytes comece antes
// de qualquer outra coisa.
function consumeFileInput(input, handler) {
  let started;
  try { started = handler(input.files[0]); } catch (err) { started = Promise.reject(err); }
  Promise.resolve(started).catch(() => {}).then(() => { input.value = ""; });
}

// A ajuda de cada falha da importação. Saiu de dentro da função porque a lista
// cresceu mais do que o encadeamento de ternários que a guardava.
const IMPORT_ERROR_HELP = {
  UNKNOWN_FORMAT: "Formatos aceitos: .OFX, .CSV e .PDF. No app do banco, procure por exportar extrato ou baixar fatura.",
  PDF_NO_TEXT: "Baixe a versão digital no app do banco. PDF escaneado ou fotografado não tem texto para selecionar.",
  PDF_DATE_YEAR: "O arquivo precisa mostrar o ano ou o período completo para evitar lançamentos no mês errado.",
  NO_ROWS: "Confira se o arquivo contém movimentações e se foi baixado diretamente do banco.",
  READ_FAIL: "Se o arquivo está no iCloud, abra-o uma vez no app Arquivos para baixá-lo e escolha de novo.",
};

// Importação 100% offline: lê, decodifica, parseia e categoriza no navegador.
// Qualquer falha vira um erro visual explicativo na própria tela de importação.
async function handleStatementFile(file, password) {
  // A cópia dos bytes começa ANTES do primeiro redesenho: no iPhone o arquivo
  // escolhido é uma cópia temporária de vida curta (ver `readFileBytes`), e o
  // que garante a leitura é começá-la no mesmo instante em que ele chega.
  const pending = snapshotStatementFile(file);
  pending.catch(() => {});
  state.importError = null;
  state.importLoading = true;
  state.importRows = null;
  // Arquivo novo, conferência do zero: a janela volta ao primeiro lote.
  state.importVisible = IMPORT_PAGE_SIZE;
  state.importPendingFile = null;
  render();

  try {
    const source = await pending;
    // Um PDF pode pedir senha, e a segunda tentativa relê o instantâneo, nunca
    // o `File`, que a essa altura já pode não existir mais no aparelho.
    state.importPendingFile = typeof isPdfStatementFile === "function" && isPdfStatementFile(source) ? source : null;
    const content = await readStatementFile(source, { password: password || "" });
    const rows = prepareImportRows(content, source.name, state.data);
    const meta = rows.meta || {};
    state.importFilename = source.name;
    state.importDocumentKind = meta.documentKind === "card" ? "card" : "account";
    state.importDestinationId = defaultImportDestinationId(state.importDocumentKind);
    state.importRows = state.importDocumentKind === "account"
      ? applyRecordedTransferMatches(rows, state.data, state.importDestinationId)
      : rows;
    state.importPendingFile = null;
    state.importPassword = "";
    state.importLoading = false;
    render();
    notify(`${rows.length} lançamento${rows.length === 1 ? "" : "s"} lido${rows.length === 1 ? "" : "s"} do ${(meta.format || "arquivo").toUpperCase()}`);
  } catch (err) {
    state.importLoading = false;
    if (typeof reportSafeError === "function") reportSafeError("import", err, "import_read");
    state.importRows = null;
    const code = err && err.code;
    const needsPassword = code === "PDF_PASSWORD_REQUIRED" || code === "PDF_PASSWORD_INCORRECT";
    if (!needsPassword) {
      state.importPendingFile = null;
      state.importPassword = "";
    }
    const help = needsPassword
      ? "Digite a senha abaixo. Ela será usada apenas na memória deste aparelho."
      : (IMPORT_ERROR_HELP[code] || "Nenhum dado foi enviado para a internet; tudo acontece no seu navegador.");
    // Só no READ_FAIL a causa técnica aparece na tela: é ela que distingue "o
    // arquivo sumiu no meio da leitura" de "o arquivo ainda está na nuvem", e sem
    // ela quem tenta ajudar a distância fica adivinhando. O detalhe vem do
    // navegador; o conteúdo do extrato continua sem sair daqui.
    state.importError = {
      title: (err && err.message) || "Não foi possível ler o arquivo.",
      code,
      detail: code === "READ_FAIL" && err && err.detail ? `${help} (${err.detail})` : help,
    };
    render();
  }
}

// A barra tem seis lugares e o app reúne mais destinos do que cabem nela.
// "Investir" saiu daqui e virou um item de "Recursos": é importante para quem
// investe e invisível para quem ainda está organizando o mês, enquanto o índice
// serve aos dois. Para reverter, basta trocar a linha de `all` pela de `invest`;
// nada mais depende desta lista.
const NAV = [
  { id: "dashboard", label: "Início", icon: "layout" },
  { id: "analytics", label: "Movimentações", icon: "pie" },
  { id: "add", label: "Adicionar", icon: "plus" },
  { id: "all", label: "Recursos", icon: "search" },
  { id: "goals", label: "Metas", icon: "target" },
  { id: "settings", label: "Ajustes", icon: "gear" },
];

const MOBILE_NAV = [
  { id: "dashboard", label: "Início", icon: "layout" },
  { id: "analytics", label: "Movimentos", ariaLabel: "Movimentos, abrir Movimentações", icon: "pie" },
  { id: "add", label: "Adicionar", icon: "plus" },
  // O nome anunciado tem de ser o da tela em que a pessoa cai. "Planejamento"
  // não é o título de tela nenhuma: o destino é o Calendário, e quem navega por
  // leitor de tela ouvia um nome que não existe do outro lado. O rótulo visível
  // segue curto por causa da largura da barra (cinco itens em 375px).
  { id: "calendar", label: "Planejar", ariaLabel: "Planejar, abrir Calendário", icon: "calendar" },
  { id: "all", label: "Recursos", icon: "search" },
];

function renderShell() {
  // A configuração inicial toma a tela inteira: sem navegação, sem cartões
  // atrás. Um app de dinheiro vazio não tem o que mostrar, e um menu completo no
  // primeiro segundo é convite para se perder antes de começar.
  if (state.onboarding.open && !state.booting) {
    return `
    ${renderOnboardingLayer()}
    <div class="sr-live" role="status" aria-live="polite" aria-atomic="true">${state.toast ? escapeHtml(state.toast) : ""}</div>
    ${state.toast ? `<div class="toast ${state.toastTone ? `toast--${state.toastTone}` : ""}" aria-hidden="true">${svgIcon(state.toastTone === "danger" || state.toastTone === "warn" ? "alertTriangle" : "checkCircle", 16)}<span>${escapeHtml(state.toast)}</span></div>` : ""}
  `;
  }
  return `
    <a class="skip-link" href="#conteudo" data-action="skip-to-content" tabindex="0">Ir para o conteúdo</a>
    ${renderSideNav()}
    <main class="main-content" id="conteudo" tabindex="-1">
      ${isDemoMode() ? renderDemoBanner() : ""}
      ${(!state.booting && !state.storageOk && !state.storageWarningDismissed) ? renderStorageWarning() : ""}
      ${state.booting ? renderDashboardSkeleton() : renderScreen()}
    </main>
    ${renderBottomNav()}
    ${renderCelebrationOverlay()}
    <div class="sr-live" role="status" aria-live="polite" aria-atomic="true">${state.toast ? escapeHtml(state.toast) : ""}</div>
    ${state.toast ? `<div class="toast ${state.toastTone ? `toast--${state.toastTone}` : ""}" aria-hidden="true">${svgIcon(state.toastTone === "danger" || state.toastTone === "warn" ? "alertTriangle" : "checkCircle", 16)}<span>${escapeHtml(state.toast)}</span></div>` : ""}
    ${state.qr.open ? renderQrModal() : ""}
    ${state.wrapped.open ? renderWrappedModal() : ""}
    ${state.categoryPickerFor ? renderCategoryPickerModal() : ""}
    ${state.categoriesUi.editor ? renderCategoryEditorModal() : ""}
    ${state.movementDetailId ? renderMovementDetailModal() : ""}
    ${state.movementReviewCard && state.movementReviewCard.txId ? renderReviewCardPaymentModal() : ""}
    ${state.contextualAssistant.open ? renderContextualAssistantModal() : ""}
    ${state.calculationDetail ? renderCalculationModal() : ""}
    ${state.aiPreview.monthKey ? renderAiPreviewModal() : ""}
    ${state.confirmation ? renderConfirmationModal() : ""}
    ${!state.booting ? renderAssistantLauncher() : ""}
  `;
}

// [M6] Esqueleto do primeiro paint. Substitui o spinner solto por uma silhueta
// com a MESMA geometria do dashboard: o olho já se posiciona antes do dado
// chegar e a troca não sacode a página (nada de salto de layout).
function renderDashboardSkeleton() {
  const block = (cls) => `<div class="sk ${cls}"></div>`;
  return `<div class="screen" aria-busy="true" aria-label="Carregando seus dados">
    <div class="screen-header">
      <div class="dash-greeting">
        ${block("sk--line sk--w120")}
        ${block("sk--title")}
      </div>
    </div>
    <div class="grid-dashboard">
      <div class="card card--hero span-3 sk-card">
        ${block("sk--line sk--w90")}
        ${block("sk--hero")}
        <div class="sk-row">${block("sk--chip")}${block("sk--chip")}${block("sk--chip")}</div>
      </div>
      <div class="card span-1 sk-card">${block("sk--line sk--w120")}${block("sk--ring")}</div>
      <div class="card span-2 sk-card">${block("sk--line sk--w120")}${block("sk--line")}${block("sk--line sk--w70")}${block("sk--bar")}</div>
      <div class="card span-1 sk-card">${block("sk--line sk--w90")}${block("sk--line")}${block("sk--line sk--w70")}</div>
      <div class="card span-2 sk-card">${block("sk--line sk--w120")}${block("sk--line")}${block("sk--line")}${block("sk--line sk--w70")}</div>
    </div>
  </div>`;
}

// A faixa não tem botão de fechar, de propósito: ela é a única coisa que
// separa "os números do app" de "números inventados". Um aviso que some é um
// aviso que não estava lá quando a pessoa tirou a conclusão errada.
function renderDemoBanner() {
  return `<div class="demo-banner" role="status">
    ${svgIcon("info", 18)}
    <div class="demo-banner__text">
      <strong>Dados de demonstração.</strong>
      <span>Nada aqui é seu, nada é salvo no aparelho e nada sobe para conta nenhuma. Recarregar a página já encerra.</span>
    </div>
    <button class="btn btn--secondary btn--sm" data-action="demo-exit">Começar com meus dados</button>
  </div>`;
}

function renderStorageWarning() {
  return `<div class="storage-warning">
    ${svgIcon("alertTriangle", 18)}
    <div class="storage-warning__text">
      <strong>Seus dados não estão sendo salvos neste navegador.</strong>
      <span>O navegador fechou o banco local. Recarregue a página; se o aviso voltar, feche as outras abas do app. Em janela anônima ou com armazenamento bloqueado nada é gravado mesmo.</span>
    </div>
    <button class="icon-btn" data-action="dismiss-storage-warning" aria-label="Fechar aviso de armazenamento">${svgIcon("x", 16)}</button>
  </div>`;
}

function renderScreen() {
  switch (state.tab) {
    case "add": return renderAddScreen();
    case "analytics": return renderAnalyticsScreen();
    case "goals": return renderGoalsScreen();
    case "settings": return renderSettingsScreen();
    case "privacy": return renderPrivacyScreen();
    case "account": return renderAccountScreen();
    case "import": return renderImportScreen();
    case "simulate": return renderSimulateScreen();
    case "subscriptions": return renderSubscriptionsScreen();
    case "health": return renderHealthScreen();
    case "wealth": return renderWealthScreen();
    case "calendar": return renderCalendarScreen();
    case "invest": return renderPortfolioScreen();
    case "simulators": return renderSimulatorsScreen();
    case "achievements": return renderAchievementsScreen();
    case "insights": return renderInsightsScreen();
    case "notifications": return renderNotificationsScreen();
    case "accounts": return renderAccountsScreen();
    case "debts": return renderDebtsScreen();
    case "all": return renderAllScreen();
    case "rules": return renderRulesScreen();
    case "categories": return renderCategoriesScreen();
    default: return renderDashboardScreen();
  }
}

function renderBackHeader(title) {
  return `<div class="screen-header">
    <div class="back-header">
      <button class="icon-btn" data-action="back" data-tab="dashboard" aria-label="Voltar">${svgIcon("chevronLeft", 19)}</button>
      <h1 class="page-title">${title}</h1>
    </div>
  </div>`;
}

function renderSideNav() {
  return `<nav class="side-nav" aria-label="Navegação principal">
    <div class="side-nav__brand">
      <div class="brand-mark">${svgIcon("wallet", 19)}</div>
      <span>Cofre</span>
    </div>
    ${NAV.map((item) => `
      <button class="side-nav__item ${state.tab === item.id ? "active" : ""}" data-action="nav" data-tab="${item.id}" ${state.tab === item.id ? 'aria-current="page"' : ""}>
        ${svgIcon(item.icon, 19)}<span>${item.label}</span>
      </button>`).join("")}
  </nav>`;
}

function renderBottomNav() {
  return `<nav class="bottom-nav" aria-label="Navegação principal">
    ${MOBILE_NAV.map((item) => {
      if (item.id === "add") {
        return `<div class="bottom-nav__fab-wrap">
          <button class="bottom-nav__fab" data-action="nav" data-tab="add" aria-label="Adicionar lançamento" ${state.tab === "add" ? 'aria-current="page"' : ""}>${svgIcon("plus", 24)}</button>
          <span class="bottom-nav__fab-label" aria-hidden="true">Adicionar</span>
        </div>`;
      }
      return `<button class="bottom-nav__item ${state.tab === item.id ? "active" : ""}" data-action="nav" data-tab="${item.id}" aria-label="${item.ariaLabel || item.label}" ${state.tab === item.id ? 'aria-current="page"' : ""}>
        ${svgIcon(item.icon, 21)}<span>${item.label}</span>
      </button>`;
    }).join("")}
  </nav>`;
}

// ==================================================================
// FEATURE 3. ORÇAMENTOS: painel do dashboard e ajustes
// ==================================================================

// Avisa (uma vez, via toast) quando um lançamento acabou de cruzar 80% ou 100%
// de algum teto. O aviso vem DEPOIS do toast de confirmação para não competir
// com ele, e só sai quando houve mudança real de faixa.
function announceBudgetCrossings(impact) {
  if (!impact || !impact.crossings || impact.crossings.length === 0) return;
  const worst = impact.crossings[0];
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    state.toast = budgetCrossingMessage(worst, impact.thresholds);
    state.toastTone = worst.levelAfter === "over" ? "danger" : "warn";
    render();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { state.toast = null; state.toastTone = null; render(); }, 4200);
  }, 1500);
}

// ==================================================================
// EVENTS
// ==================================================================
function keyOfCurrentMonth() { return keyOfDate(new Date()); }


// ==================================================================
// FEATURE 2. BACKUP: exportar e importar o banco local
// ==================================================================
// A montagem dos arquivos vive em storage.js (buildBackupEnvelope /
// buildTransactionsCsv / buildBudgetsCsv). Aqui é só a camada de UI.
function exportTransactionsCsv() {
  if (!state.data.transactions.length) { notify("Nenhum lançamento para exportar"); return; }
  downloadFile(backupFilename("csv").replace("backup", "lancamentos"), buildTransactionsCsv(state.data), "text/csv;charset=utf-8;");
  notify(`${plural(state.data.transactions.length, "lançamento exportado", "lançamentos exportados")} em CSV`);
}

function exportBudgetsCsv() {
  const status = computeBudgetStatus(state.data, keyOfCurrentMonth());
  if (status.items.length === 0) { notify("Nenhum orçamento definido ainda"); return; }
  downloadFile(`orcamentos-${keyOfCurrentMonth()}.csv`, buildBudgetsCsv(state.data, keyOfCurrentMonth()), "text/csv;charset=utf-8;");
  notify("Orçamentos exportados em CSV");
}

// ------------------------------------------------------------------
// EXTRATO EM PDF
// ------------------------------------------------------------------
// O CSV serve para recalcular; o PDF serve para MOSTRAR. É o arquivo que se
// manda para o contador, para o banco, para o processo de aluguel; e nenhum
// deles abre uma planilha de 400 linhas para entender o mês da pessoa.
//
// Sai exatamente o que está na tela de Movimentações: mesmo período, mesma
// busca, mesmos filtros. Exportar algo diferente do que a pessoa acabou de
// conferir seria a forma mais rápida de tornar o arquivo pouco confiável.
function statementPeriodLabel(filters) {
  if (filters.period === "semana") return "Últimos 7 dias";
  if (filters.period === "mes") return `${MONTH_NAMES[new Date().getMonth()]} de ${new Date().getFullYear()}`;
  if (filters.period === "ano") return `Ano de ${new Date().getFullYear()}`;
  if (filters.period === "custom") return `De ${fmtDateFull(filters.start)} até ${fmtDateFull(filters.end)}`;
  return "Todo o histórico";
}

function statementFiltersLabel(filters) {
  const parts = [];
  const typeLabels = { income: "só entradas", expense: "só saídas", transfer: "só transferências", "card-payment": "só pagamentos de fatura" };
  if (filters.type && typeLabels[filters.type]) parts.push(typeLabels[filters.type]);
  if (filters.categoryId) parts.push(`categoria: ${categoryById(state.data, filters.categoryId).name}`);
  if (filters.accountId) {
    const account = accountById(state.data, filters.accountId);
    const card = creditCardById(state.data, filters.accountId);
    parts.push(`conta: ${(account && account.name) || (card && card.name) || filters.accountId}`);
  }
  if (filters.source) parts.push(`origem: ${movementSourceMeta(filters.source, null).label}`);
  if (String(filters.search || "").trim()) parts.push(`busca: “${String(filters.search).trim()}”`);
  return parts.length ? `Filtros aplicados: ${parts.join(" · ")}.` : "Sem filtros: todos os movimentos do período.";
}

function statementPdfInput(filters, model) {
  const expenses = model.entries.filter((entry) => entry.type === "expense");
  const totalExpense = sumMoney(expenses, (entry) => entry.amount);
  const byCategory = {};
  expenses.forEach((entry) => {
    const key = entry.categoryId || "outros";
    byCategory[key] = (byCategory[key] || 0) + moneyToCents(entry.amount);
  });
  const breakdown = Object.entries(byCategory)
    .map(([id, cents]) => {
      const category = categoryById(state.data, id);
      const value = moneyFromCents(cents);
      return { label: category.name, color: category.color, value: fmtBRL(value), pct: safePct(value, totalExpense), raw: value };
    })
    .sort((a, b) => b.raw - a.raw)
    .slice(0, 12);

  const now = new Date();
  return {
    title: "Extrato de movimentações",
    brand: "Cofre",
    subtitle: statementPeriodLabel(filters),
    filtersLabel: statementFiltersLabel(filters),
    generatedLabel: `Gerado em ${fmtDateFull(todayIso())} às ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    date: now,
    summary: [
      { label: "Entradas", value: fmtBRL(model.income), tone: "income" },
      { label: "Saídas", value: fmtBRL(model.expense), tone: "expense" },
      { label: "Saldo do período", value: fmtBRL(model.balance), tone: model.balance < 0 ? "expense" : "income" },
      { label: "Movimentos", value: String(model.count), tone: "ink" },
    ],
    rows: model.entries.map((entry) => ({
      date: fmtDateFull(entry.date),
      description: entry.description,
      category: entry.categoryName,
      account: entry.accountName || entry.cardName || "",
      amount: `${entry.type === "income" ? "+" : entry.type === "expense" ? "-" : ""}${fmtBRL(entry.amount)}`,
      tone: entry.type === "income" ? "income" : entry.type === "expense" ? "expense" : "neutral",
    })),
    totalLabel: `Saldo do período (${plural(model.count, "movimento", "movimentos")})`,
    totalValue: fmtBRL(model.balance),
    totalTone: model.balance < 0 ? "expense" : "income",
    breakdownTitle: "Saídas por categoria",
    breakdown,
    emptyLabel: "Nenhum movimento no período e nos filtros escolhidos.",
    note: "Gerado pelo Cofre no seu próprio aparelho.",
    notes: [
      "Documento de conferência gerado a partir dos lançamentos deste aparelho. Não tem valor fiscal e não substitui o extrato oficial do banco nem a fatura do cartão.",
      "Transferências entre contas e pagamentos de fatura aparecem na lista para a conferência ficar completa, mas não entram nas somas de entradas e saídas: o dinheiro só mudou de lugar.",
    ],
  };
}

function exportStatementPdf() {
  const filters = movementFiltersSnapshot();
  const model = buildMovementCenterModel(state.data, filters);
  if (!model.entries.length) { notify("Nenhum movimento no período para exportar", "info"); return; }
  const stamp = filters.period === "custom" ? `${filters.start}-a-${filters.end}` : todayIso();
  downloadFile(`extrato-${stamp}.pdf`, buildStatementPdf(statementPdfInput(filters, model)), "application/pdf");
  notify(`${plural(model.entries.length, "movimento exportado", "movimentos exportados")} em PDF`);
}

// Estado do backup em uma linha. Sem isso, o único jeito de saber se havia
// cópia dos dados era lembrar de ter feito; que é justamente o que ninguém faz.
function renderLastBackupLine() {
  const last = state.data.lastBackupAt;
  const total = (state.data.transactions || []).length;
  if (!last) {
    if (total === 0) return "";
    return `<p class="field-hint" data-ui-css="color:var(--negative)">
      ${svgIcon("alertTriangle", 12)} Você ainda não exportou nenhum backup. ${total === 1 ? "Este" : "Estes"} ${plural(total, "lançamento existe", "lançamentos existem")} só neste aparelho.
    </p>`;
  }
  const dias = Math.max(0, Math.floor((Date.parse(`${todayIso()}T12:00:00`) - Date.parse(`${last}T12:00:00`)) / 86400000));
  const quando = dias === 0 ? "hoje" : dias === 1 ? "ontem" : `há ${dias} dias`;
  const velho = dias >= 45;
  return `<p class="field-hint" ${velho ? 'style="color:var(--goal)"' : ""}>
    ${svgIcon(velho ? "alertTriangle" : "checkCircle", 12)} Último backup ${quando} (${fmtDateFull(last)}).
  </p>`;
}

function exportBackupJson() {
  const envelope = buildBackupEnvelope(state.data);
  downloadFile(backupFilename("json"), JSON.stringify(envelope, null, 2), "application/json");
  // Carimba a data para o lembrete de backup saber que houve cópia. Fica DEPOIS
  // do download: se o navegador bloquear a gravação do arquivo, o app não deve
  // registrar um backup que não existe.
  setData((d) => ({ ...d, lastBackupAt: todayIso() }));
  notify(`Backup com ${plural(envelope.counts.transactions, "lançamento", "lançamentos")} exportado`);
}

// [M14] Recibo da última importação, para o botão de desfazer. Mora no
// `localMeta`: pertence a este aparelho, não sai no backup e não sobe na
// sincronização. Guarda só identificadores, data e nome do arquivo.
//
// As duas funções engolem falha de propósito. Não conseguir anotar (ou ler) o
// recibo é perder o atalho de desfazer, e isso não pode derrubar a importação
// nem o boot do aplicativo.
function saveImportUndo(entry) {
  try {
    const salvar = entry
      ? FinanceStore.localMetaPut(META_IMPORT_UNDO, entry)
      : FinanceStore.localMetaDelete(META_IMPORT_UNDO);
    if (salvar && typeof salvar.catch === "function") salvar.catch(() => {});
  } catch (e) { /* sem recibo; a importação em si já aconteceu */ }
}

function hydrateImportUndo() {
  try {
    const leitura = FinanceStore.localMetaGet(META_IMPORT_UNDO);
    if (!leitura || typeof leitura.then !== "function") return;
    leitura.then((entry) => {
      if (!entry || typeof entry !== "object") return;
      const transactionIds = Array.isArray(entry.transactionIds) ? entry.transactionIds : [];
      const transferIds = Array.isArray(entry.transferIds) ? entry.transferIds : [];
      if (!transactionIds.length && !transferIds.length) return;
      state.importUndo = { at: entry.at || null, filename: String(entry.filename || ""), transactionIds, transferIds };
      if (state.tab === "import") render();
    }).catch(() => {});
  } catch (e) { /* nada a restaurar */ }
}

// Estado limpo do cartão de backup. Existe em função porque agora são oito
// campos, e cada lugar que "zerava o backup" à mão esquecia um deles.
function freshBackupState() {
  return { preview: null, error: null, mode: "merge", busy: false, undoAvailable: false, encryptOpen: false, password: "", passwordConfirm: "", locked: null, unlockPassword: "" };
}

// [M12] Mesmo backup, dentro de um envelope cifrado com a senha escolhida aqui.
// O arquivo comum continua disponível e continua sendo o padrão.
async function exportBackupEncrypted() {
  const problema = backupPasswordIssue(state.backup.password, state.backup.passwordConfirm);
  if (problema) { state.backup.error = problema; render(); return; }
  state.backup.busy = true;
  state.backup.error = null;
  render();
  try {
    const envelope = buildBackupEnvelope(state.data);
    const protegido = await encryptBackupText(JSON.stringify(envelope), state.backup.password);
    downloadFile(backupFilename("json").replace(/\.json$/, "-protegido.json"), JSON.stringify(protegido, null, 2), "application/json");
    // A senha some da memória assim que o arquivo é gerado.
    state.backup = { ...freshBackupState(), undoAvailable: state.backup.undoAvailable };
    setData((d) => ({ ...d, lastBackupAt: todayIso() }));
    notify(`Backup protegido com ${plural(envelope.counts.transactions, "lançamento", "lançamentos")} exportado`);
  } catch (err) {
    state.backup.busy = false;
    if (typeof reportSafeError === "function") reportSafeError("backup", err, "backup_read");
    state.backup.error = err && err.message ? err.message : "Não foi possível proteger o backup com senha.";
    render();
  }
}

// Decifra o arquivo que está esperando senha e segue pelo MESMO caminho de
// prévia do backup comum: depois de aberto, o conteúdo é idêntico.
async function unlockBackupFile() {
  const locked = state.backup.locked;
  if (!locked) return;
  state.backup.busy = true;
  state.backup.error = null;
  render();
  try {
    const texto = await decryptBackupText(locked.text, state.backup.unlockPassword);
    const { data, meta } = parseBackupFile(texto);
    if (meta.checksumOk === false) {
      throw new BackupError("CHECKSUM", "O arquivo parece ter sido alterado depois de exportado (verificação de integridade falhou).");
    }
    state.backup.locked = null;
    state.backup.unlockPassword = "";
    state.backup.busy = false;
    state.backup.preview = { data, meta: { ...meta, encrypted: true }, filename: locked.filename };
    render();
  } catch (err) {
    state.backup.busy = false;
    if (typeof reportSafeError === "function") reportSafeError("backup", err, "backup_read");
    state.backup.error = err && err.message ? err.message : "Não foi possível abrir o backup protegido.";
    render();
  }
}

// Lê o arquivo escolhido e monta a PRÉVIA; nada é gravado antes do usuário
// confirmar e escolher entre mesclar ou substituir.
async function handleBackupFile(file) {
  // Leitura disparada antes do redesenho, pelo mesmo motivo do importador de
  // extratos: no iPhone o arquivo escolhido não espera.
  const pending = readFileAsText(file);
  pending.catch(() => {});
  state.backup.busy = true;
  state.backup.error = null;
  state.backup.preview = null;
  state.backup.locked = null;
  state.backup.unlockPassword = "";
  render();
  try {
    const text = await pending;
    // [M12] Arquivo protegido: pede a senha antes de qualquer interpretação do
    // conteúdo. O texto cifrado fica em memória só até a senha chegar.
    if (isEncryptedBackupText(text)) {
      state.backup.locked = { filename: file.name, text };
      state.backup.unlockPassword = "";
      state.backup.busy = false;
      render();
      return;
    }
    const { data, meta } = parseBackupFile(text);
    if (meta.checksumOk === false) {
      throw new BackupError("CHECKSUM", "O arquivo parece ter sido alterado depois de exportado (verificação de integridade falhou).");
    }
    state.backup.preview = { data, meta, filename: file.name };
    state.backup.busy = false;
    render();
  } catch (err) {
    state.backup.busy = false;
    if (typeof reportSafeError === "function") reportSafeError("backup", err, "backup_read");
    state.backup.error = err && err.message ? err.message : "Não foi possível ler o arquivo de backup.";
    render();
  }
}

async function confirmBackupRestore() {
  const preview = state.backup.preview;
  if (!preview) return;
  state.backup.busy = true;
  render();

  try {
    let ok;
    let message;
    if (state.backup.mode === "replace") {
      ok = await FinanceStore.replaceAll(preview.data);
      message = ok ? `Backup restaurado: ${plural(preview.meta.counts.transactions, "lançamento", "lançamentos")}` : "Backup carregado, mas não foi possível gravá-lo";
    } else {
      const { data, stats } = mergeBackupInto(state.data, preview.data);
      ok = await FinanceStore.replaceAll(data);
      message = ok
        ? `Mesclado: ${plural(stats.added, "novo", "novos")}, ${plural(stats.updated, "atualizado", "atualizados")}, ${stats.skipped} já ${pluralWord(stats.skipped, "existia", "existiam")}`
        : "Mesclagem feita em memória, mas não foi possível gravá-la";
    }
    state.data = FinanceStore.snapshot();
    state.backup = { ...freshBackupState(), undoAvailable: true };
    render();
    notify(message);
  } catch (err) {
    state.backup.busy = false;
    if (typeof reportSafeError === "function") reportSafeError("backup", err, "backup_restore");
    state.backup.error = "Falha ao aplicar o backup. Seus dados atuais não foram alterados.";
    render();
  }
}

// Desfaz o último restore/mesclagem usando o snapshot que o FinanceStore guarda
// automaticamente antes de qualquer operação destrutiva.
async function undoBackupRestore() {
  const undo = FinanceStore.readUndoSnapshot();
  if (!undo) { notify("Não há nada para desfazer"); return; }
  const ok = await FinanceStore.replaceAll(undo.data);
  state.data = FinanceStore.snapshot();
  state.backup.undoAvailable = false;
  render();
  notify(ok ? "Restauração desfeita" : "Não foi possível desfazer");
}

// ---- 'input' handler: só atualiza estado em memória, SEM re-renderizar a tela toda.
// Isso evita que o campo perca o foco no meio da digitação (a causa do bug de "renda sumindo").
const SIGNED_NUMERIC_FIELDS = new Set(["onb-acc-balance", "account-opening-balance", "reconcile-value"]);

function sanitizeInputElement(el) {
  if (!el || typeof el.value !== "string") return "";
  const inputMode = String(el.getAttribute && el.getAttribute("inputmode") || el.inputMode || "").toLowerCase();
  const explicit = String(el.dataset && el.dataset.validate || "").toLowerCase();
  const type = String(el.type || "text").toLowerCase();
  const field = el.dataset && el.dataset.field;
  const allowNegative = SIGNED_NUMERIC_FIELDS.has(field) || (el.dataset && el.dataset.allowNegative === "true");
  let kind = explicit;
  if (!kind && inputMode === "numeric") kind = "integer";
  if (!kind && (inputMode === "decimal" || type === "number")) kind = "decimal";
  if (!kind && (type === "text" || type === "search" || el.tagName === "TEXTAREA")) kind = "text";
  let clean = el.value;
  if (kind === "integer") clean = sanitizeIntegerInput(clean, { allowNegative });
  else if (kind === "decimal" || kind === "money") clean = sanitizeDecimalInput(clean, { allowNegative });
  else if (kind === "text") clean = sanitizeTextInput(clean, { multiline: el.tagName === "TEXTAREA", maxLength: el.maxLength >= 0 ? el.maxLength : undefined });
  if (clean !== el.value) {
    const end = typeof el.selectionStart === "number" ? el.selectionStart : clean.length;
    el.value = clean;
    try { el.setSelectionRange(Math.min(end, clean.length), Math.min(end, clean.length)); } catch (err) { /* tipo sem seleção */ }
  }
  if (typeof el.setCustomValidity === "function") el.setCustomValidity("");
  if (el.removeAttribute) el.removeAttribute("aria-invalid");
  return clean;
}

function onInput(e) {
  // Mesmo registro do onClick: digitar também é tomar a tela para si.
  if (typeof marcarAppEmUso === "function") marcarAppEmUso();
  const field = e.target.dataset.field;
  if (!field) return;
  const val = sanitizeInputElement(e.target);
  if (window.CofreUI) window.CofreUI.forms.clearField(e.target.id || field);
  const id = e.target.dataset.id;
  switch (field) {
    case "onb-name": state.onboarding.name = val; break;
    // A CAIXA CONTINUA IMPORTANDO AQUI, DE PROPÓSITO.
    //
    // A frase exigida ("APAGAR CONTA", "APAGAR") é a última trava antes de uma
    // exclusão irreversível, e digitá-la exatamente é parte da trava; converter
    // sozinho a tornaria mais fraca, e `tests/browser/run-browser.js` fixa esse
    // comportamento. O que faltava não era tolerância, era EXPLICAÇÃO: o botão
    // ficava desligado sem uma linha dizendo o que faltava. A linha agora existe
    // logo abaixo do campo (ver `renderConfirmationModal`).
    case "confirmation-required":
      if (state.confirmation) { state.confirmation.typedText = val; render(); }
      break;
    case "onb-income": state.onboarding.income = val; patchOnboardingFooter(); break;
    case "onb-acc-name": state.onboarding.account.name = val; patchOnboardingFooter(); break;
    case "onb-acc-balance": state.onboarding.account.balance = val; patchOnboardingFooter(); break;
    case "onb-acc-date": state.onboarding.account.openingDate = val; patchOnboardingFooter(); break;
    // Um caso para as cinco linhas do passo 4: a categoria vem em `data-id`.
    // Sem isso seriam cinco `case` idênticos, e cada preset novo exigiria um.
    case "onb-fixed":
      if (id) { state.onboarding.fixed = { ...(state.onboarding.fixed || {}), [id]: val }; patchOnbFixedSummary(); patchOnboardingFooter(); }
      break;
    case "tx-amount": state.form.amount = val; patchSubmitButton(); patchFormWarnings(); break;
    case "tx-description": state.form.description = val; break;
    case "tx-date": state.form.date = val; break;
    case "account-name": if (state.accountsUi.accountForm) state.accountsUi.accountForm.name = val; break;
    case "account-opening-balance": if (state.accountsUi.accountForm) state.accountsUi.accountForm.openingBalance = val; break;
    case "account-opening-date": if (state.accountsUi.accountForm) state.accountsUi.accountForm.openingDate = val; break;
    case "card-name": if (state.accountsUi.cardForm) state.accountsUi.cardForm.name = val; break;
    case "card-limit": if (state.accountsUi.cardForm) state.accountsUi.cardForm.limit = val; break;
    case "card-closing": if (state.accountsUi.cardForm) state.accountsUi.cardForm.closingDay = val.replace(/[^0-9]/g,"").slice(0,2); break;
    case "card-due": if (state.accountsUi.cardForm) state.accountsUi.cardForm.dueDay = val.replace(/[^0-9]/g,"").slice(0,2); break;
    case "transfer-amount": if (state.accountsUi.transferForm) state.accountsUi.transferForm.amount = val; break;
    case "transfer-date": if (state.accountsUi.transferForm) state.accountsUi.transferForm.date = val; break;
    case "transfer-description": if (state.accountsUi.transferForm) state.accountsUi.transferForm.description = val; break;
    case "reconcile-value": state.accountsUi.reconcileValue = val; break;
    case "payment-amount": if (state.accountsUi.payment) state.accountsUi.payment.amount = val; break;
    case "payment-date": if (state.accountsUi.payment) state.accountsUi.payment.date = val; break;
    case "debt-name": if (state.debtsUi.form) state.debtsUi.form.name = val; break;
    case "debt-value": if (state.debtsUi.form) state.debtsUi.form.value = val; break;
    case "debt-creditor": if (state.debtsUi.form) state.debtsUi.form.creditor = val; break;
    case "debt-payment": if (state.debtsUi.form) state.debtsUi.form.monthlyPayment = val; break;
    case "debt-next-due": if (state.debtsUi.form) state.debtsUi.form.nextDueDate = val; break;
    case "debt-cet": if (state.debtsUi.form) state.debtsUi.form.cetAnnualPct = val; break;
    case "debt-rate": if (state.debtsUi.form) state.debtsUi.form.ratePct = val; break;
    case "debt-original": if (state.debtsUi.form) state.debtsUi.form.originalPrincipal = val; break;
    case "debt-installments": if (state.debtsUi.form) state.debtsUi.form.remainingInstallments = val.replace(/[^0-9]/g, "").slice(0,4); break;
    case "debt-note": if (state.debtsUi.form) state.debtsUi.form.note = val; break;
    case "debt-pay-amount": if (state.debtsUi.payment) { state.debtsUi.payment.amount = val; state.debtsUi.payment.duplicateConfirmed = false; } break;
    case "debt-pay-date": if (state.debtsUi.payment) { state.debtsUi.payment.date = val; state.debtsUi.payment.duplicateConfirmed = false; } break;
    case "debt-new-balance": if (state.debtsUi.payment) state.debtsUi.payment.newBalance = val; break;
    case "debt-extra": state.debtsUi.extraDraft = val; break;
    case "tx-installments": state.form.installments = val.replace(/[^0-9]/g, ""); break;
    case "goal-name": state.goalForm.name = val; break;
    case "goal-target": state.goalForm.target = val; break;
    case "goal-saved-upfront": state.goalForm.savedUpfront = val; break;
    case "goal-deadline": state.goalForm.deadline = val; break;
    case "goal-monthly-plan": state.goalForm.monthlyPlan = val; break;
    case "contribution-amount": state.goalContribution = val; break;
    // Editor de categoria: patch pontual, sem re-render. O nome é longo de
    // digitar e o rascunho já é o que alimenta a folha na próxima pintura.
    case "cat-editor-name": if (state.categoriesUi.editor) state.categoriesUi.editor.name = val.slice(0, 60); break;
    case "cat-editor-budget": if (state.categoriesUi.editor) state.categoriesUi.editor.budget = val; break;
    case "auth-email": state.account.form.email = val.trim().slice(0, 254); break;
    case "auth-password": state.account.form.password = val.slice(0, 128); break;
    case "auth-new-password": state.account.form.newPassword = val.slice(0, 128); break;
    // O aviso do painel de exclusão some assim que a pessoa volta a digitar:
    // ele descreve o que faltava, e o que faltava está sendo preenchido agora.
    case "auth-delete-password": state.account.form.deletePassword = val.slice(0, 128); state.account.deleteHint = ""; break;
    case "auth-revoke-others-password": state.account.form.revokeOthersPassword = val.slice(0, 128); break;
    case "auth-delete-text": state.account.form.deleteText = val.toUpperCase().slice(0, 20); state.account.deleteHint = ""; if (e.target.value !== state.account.form.deleteText) e.target.value = state.account.form.deleteText; break;
    // Busca da tela "Recursos" e laboratório de regras: re-render a cada tecla é
    // aceitável porque as duas telas são listas curtas, e `restoreFocus` devolve
    // foco e caret pelo id do campo.
    case "all-search": state.allSearch = val; render(); break;
    case "cat-search": state.categoriesUi.search = val; render(); break;
    case "rule-test": state.rules.testText = val; render(); break;
    case "rule-pattern": if (state.rules.form) { state.rules.form.pattern = val; render(); } break;
    case "rule-weight": if (state.rules.form) { state.rules.form.weight = val.replace(/[^0-9]/g, "").slice(0, 2); } break;
    case "income": state.incomeInput = val; break;
    case "user-name": state.userNameInput = val; break;
    case "credit-limit": state.creditLimitInput = val; break;
    case "category-budget": state.categoryBudgetDrafts[id] = val; break;
    case "search":
      state.analyticsSearch = val; state.analyticsLimit = 30;
      render();
      break;
    case "sim-amount": state.simulate.amount = val; render(); break;
    case "sim-label": state.simulate.label = val; break;
    case "sim-finance-valorbem": state.simulate.finance.valorBem = val; render(); break;
    case "sim-finance-entrada": state.simulate.finance.entrada = val; render(); break;
    case "sim-finance-numparcelas": state.simulate.finance.numParcelas = val.replace(/[^0-9]/g, ""); render(); break;
    case "sim-finance-valorparcela": state.simulate.finance.valorParcela = val; render(); break;
    // QR e lançamento inteligente: patch pontual, sem re-render (o campo perderia
    // o foco do teclado no meio da digitação).
    case "qr-amount": if (state.qr.draft) { state.qr.draft.amount = val; patchQrSaveButton(); } break;
    case "qr-estab": if (state.qr.draft) state.qr.draft.description = val; break;
    case "nlp-text": state.nlp.text = val; state.nlp.touched = true; patchNlpButton(); break;
    case "import-password": state.importPassword = val; break;
    // [M12] Senhas do backup protegido. Patch pontual, sem re-render: o mesmo
    // tratamento das senhas da conta, para o campo não perder o teclado no meio
    // da digitação. O medidor de força acompanha a próxima pintura.
    case "backup-password": state.backup.password = val.slice(0, 128); break;
    case "backup-password-confirm": state.backup.passwordConfirm = val.slice(0, 128); break;
    case "backup-unlock-password": state.backup.unlockPassword = val.slice(0, 128); break;
    // O formulário pode ter sido fechado entre o keypress e o evento; guardas
    // baratas evitam um TypeError que derrubaria toda a delegação de eventos.
    case "wealth-name": if (state.wealth.form) state.wealth.form.name = val; break;
    case "wealth-value": if (state.wealth.form) state.wealth.form.value = val; break;
    case "wealth-payment": if (state.wealth.form) state.wealth.form.monthlyPayment = val; break;
    case "wealth-dueday": if (state.wealth.form) state.wealth.form.dueDay = val.replace(/[^0-9]/g, "").slice(0, 2); break;
    case "wealth-note": if (state.wealth.form) state.wealth.form.note = val; break;
    case "wealth-update": state.wealth.updateValue = val; break;
    // ---- Módulo 5 ----
    case "pf-name": if (state.portfolio.form) state.portfolio.form.name = val; break;
    case "pf-value": if (state.portfolio.form) state.portfolio.form.value = val; break;
    case "pf-invested": if (state.portfolio.form) state.portfolio.form.invested = val; break;
    case "pf-dividends": if (state.portfolio.form) state.portfolio.form.dividends = val; break;
    case "pf-started": if (state.portfolio.form) state.portfolio.form.startedAt = val; break;
    case "pf-note": if (state.portfolio.form) state.portfolio.form.note = val; break;
    case "pf-update": state.portfolio.updateValue = val; break;
    case "pf-dividend": state.portfolio.dividendValue = val; break;
    // Campo de simulador: o resultado recalcula a cada tecla, e o foco/caret
    // são restaurados por `render()` a partir do id do elemento.
    case "sim-field":
      state.sim.values = { ...state.sim.values, [id]: val };
      render();
      break;
    case "market-rate": state.ratesDraft[id] = val; break;
    case "invest-inicial": state.invest.inicial = val; render(); break;
    // Campos numéricos (antigos sliders): atualizam só o estado enquanto digita.
    // A reprojeção/re-render acontece no 'change' (blur/Enter), preservando o que
    // está sendo digitado; inclusive decimais como "12." e o campo vazio.
    case "invest-aporte-range": state.invest.aporte = val; break;
    case "invest-anos-range": state.invest.anos = val; break;
    case "invest-taxa-range": state.invest.taxa = val; break;
    case "whatif-aporte": state.whatIf.aporteExtra = val; break;
    case "whatif-anos": state.whatIf.anos = val; break;
    case "whatif-taxa": state.whatIf.taxa = val; break;
    case "whatif-valorbem": state.whatIf.valorBem = val; render(); break;
    case "whatif-entrada": state.whatIf.entrada = val; render(); break;
    case "whatif-meses": state.whatIf.meses = val; break;
    case "whatif-jurosfin": state.whatIf.jurosFin = val; break;
    case "split-necessidade": case "split-desejo": case "split-futuro":
      state.splitDrafts[field.replace("split-", "")] = val.replace(/[^0-9]/g, "");
      render();
      break;
  }
}

// ---- 'change' handler: para campos de data e o input de arquivo (ações discretas, não digitação contínua)
function onChange(e) {
  if (window.CofreUI && e.target) window.CofreUI.forms.clearField(e.target.id || e.target.dataset.field || "");
  const field = e.target.dataset.field;
  const actionSelect = e.target.dataset.actionSelect;
  if (e.target.id === "statement-file-input" && e.target.files && e.target.files[0]) {
    consumeFileInput(e.target, handleStatementFile);
    return;
  }
  if (actionSelect === "import-category") {
    const idx = Number(e.target.dataset.id);
    if (state.importRows && state.importRows[idx]) state.importRows[idx].categoryId = e.target.value;
    // Nada mais na tela depende da categoria de uma linha: o `<select>` já
    // mostra a escolha, e redesenhar aqui só tiraria o foco de quem está
    // corrigindo várias linhas seguidas.
    return;
  }
  if (actionSelect === "import-record-type") {
    const idx = Number(e.target.dataset.id);
    const row = state.importRows && state.importRows[idx];
    const activeAccounts = (state.data.accounts || []).filter((account) => !account.archived);
    if (!row) return;
    const canTransfer = state.importDocumentKind === "account" && activeAccounts.length > 1;
    row.importAs = e.target.value === "transfer" && canTransfer ? "transfer" : "transaction";
    row.otherAccountId = row.importAs === "transfer" && activeAccounts.some((account) => account.id === row.otherAccountId && account.id !== state.importDestinationId)
      ? row.otherAccountId
      : "";
    if (row.importAs === "transfer") {
      row.include = true;
      row.includeTouched = true;
    }
    // Só esta linha muda de forma (a categoria dá lugar à outra conta), e é
    // nela que está o seletor que a pessoa acabou de usar.
    patchImportRow(idx);
    patchImportSummary();
    return;
  }
  if (actionSelect === "import-transfer-account") {
    const idx = Number(e.target.dataset.id);
    const row = state.importRows && state.importRows[idx];
    if (row) row.otherAccountId = e.target.value;
    patchImportRow(idx);
    patchImportSummary();
    return;
  }
  if (actionSelect === "import-document-kind") {
    state.importDocumentKind = e.target.value === "card" ? "card" : "account";
    state.importDestinationId = defaultImportDestinationId(state.importDocumentKind);
    if (state.importRows) {
      state.importRows.forEach((row) => {
        row.importAs = "transaction";
        row.otherAccountId = "";
      });
      state.importRows = state.importDocumentKind === "account"
        ? applyRecordedTransferMatches(state.importRows, state.data, state.importDestinationId)
        : applyRecordedTransferMatches(state.importRows, state.data, "");
    }
    render();
    return;
  }
  if (actionSelect === "import-destination") {
    state.importDestinationId = e.target.value;
    if (state.importRows) {
      state.importRows.forEach((row) => {
        if (row.importAs === "transfer" && row.otherAccountId === state.importDestinationId) row.otherAccountId = "";
      });
      state.importRows = state.importDocumentKind === "account"
        ? applyRecordedTransferMatches(state.importRows, state.data, state.importDestinationId)
        : state.importRows;
    }
    render(); return;
  }
  if (actionSelect === "movement-type") { state.movementFilters.type = e.target.value; state.analyticsLimit = 30; render(); return; }
  if (actionSelect === "movement-category") { state.movementFilters.categoryId = e.target.value; state.analyticsLimit = 30; render(); return; }
  if (actionSelect === "movement-account") { state.movementFilters.accountId = e.target.value; state.analyticsLimit = 30; render(); return; }
  if (actionSelect === "movement-source") { state.movementFilters.source = e.target.value; state.analyticsLimit = 30; render(); return; }
  if (actionSelect === "movement-select") {
    const txId = e.target.dataset.id;
    state.movementSelectedIds = e.target.checked ? Array.from(new Set([...state.movementSelectedIds, txId])) : state.movementSelectedIds.filter((item) => item !== txId);
    render(); return;
  }
  if (actionSelect === "movement-bulk-category") { state.movementBulkCategoryId = e.target.value; render(); return; }
  if (actionSelect === "review-category") {
    const categoryId = e.target.value;
    if (!categoryId) return;
    // Uma compra parcelada chega aqui como um item só, com as N parcelas em
    // `data-ids`. Escolher a categoria uma vez tem de valer para todas.
    const alvos = reviewIssueIds(e.target);
    const chave = e.target.dataset.key;
    setData((d) => ({ ...d, transactions:d.transactions.map((tx) => alvos.has(tx.id)
      ? markTransactionIssueReviewed(updateTransaction(tx, { categoryId }), chave)
      : tx) }));
    notify(alvos.size > 1 ? `Categoria atualizada em ${alvos.size} parcelas` : "Categoria atualizada"); return;
  }
  if (actionSelect === "review-payment-account") { state.movementReviewCard.accountId = e.target.value; return; }
  if (actionSelect === "review-payment-card") { state.movementReviewCard.creditCardId = e.target.value; return; }
  if (actionSelect === "onb-acc-type") { state.onboarding.account.type = e.target.value; return; }
  if (actionSelect === "onb-legal") { state.onboarding.legalAccepted = !!e.target.checked; render(); return; }
  if (actionSelect === "ai-preview-field") { toggleAiPreviewField(e.target.dataset.value, !!e.target.checked); return; }
  if (actionSelect === "privacy-ai-field") {
    const campo = e.target.dataset.value;
    const incluido = !!e.target.checked;
    setData((d) => {
      const p = normalizePrivacy(d.privacy);
      const lista = new Set(p.aiHide);
      if (incluido) lista.delete(campo); else lista.add(campo);
      return { ...d, privacy: { ...p, aiHide: normalizeAiHide(Array.from(lista)) } };
    });
    return;
  }
  if (actionSelect === "sim-goal") { state.simulate.goalId = e.target.value; render(); return; }
  if (actionSelect === "rule-type" && state.rules.form) { state.rules.form.matchType = e.target.value; render(); return; }
  if (actionSelect === "rule-category" && state.rules.form) { state.rules.form.categoryId = e.target.value; render(); return; }
  if (actionSelect === "rule-builtin-category") {
    const ruleId = e.target.dataset.id;
    const categoryId = e.target.value;
    setData((d) => {
      const cfg = normalizeCategoryRules(d.categoryRules);
      const cur = cfg.builtin[ruleId] || {};
      const builtin = { ...cfg.builtin, [ruleId]: { enabled: cur.enabled !== false, categoryId } };
      return { ...d, categoryRules: normalizeCategoryRules({ ...cfg, builtin }) };
    });
    state.rules.applyPreview = null;
    notify("Regra de fábrica redirecionada");
    return;
  }
  if (actionSelect === "tx-account") { state.form.accountId = e.target.value; patchSubmitButton(); return; }
  // Trocar uma das pontas invalida a outra ponta escolhida antes: a candidata
  // de agora pode nem existir mais entre as contas novas, e manter a escolha
  // antiga faria a tela prometer substituir um lançamento que não corresponde.
  if (actionSelect === "tx-transfer-from") {
    state.form.transferFromAccountId = e.target.value;
    if (state.form.transferToAccountId === e.target.value) state.form.transferToAccountId = "";
    state.form.transferCounterpartId = "";
    render();
    return;
  }
  if (actionSelect === "tx-transfer-to") {
    state.form.transferToAccountId = e.target.value;
    if (state.form.transferFromAccountId === e.target.value) state.form.transferFromAccountId = "";
    state.form.transferCounterpartId = "";
    render();
    return;
  }
  if (actionSelect === "tx-transfer-counterpart") { state.form.transferCounterpartId = e.target.value; render(); return; }
  if (actionSelect === "tx-card") { state.form.creditCardId = e.target.value; patchSubmitButton(); return; }
  if (actionSelect === "account-type" && state.accountsUi.accountForm) { state.accountsUi.accountForm.type = e.target.value; return; }
  if (actionSelect === "card-account" && state.accountsUi.cardForm) { state.accountsUi.cardForm.accountId = e.target.value; return; }
  if (actionSelect === "transfer-from" && state.accountsUi.transferForm) { state.accountsUi.transferForm.fromAccountId = e.target.value; return; }
  if (actionSelect === "transfer-to" && state.accountsUi.transferForm) { state.accountsUi.transferForm.toAccountId = e.target.value; return; }
  if (actionSelect === "payment-account" && state.accountsUi.payment) { state.accountsUi.payment.accountId = e.target.value; return; }
  if (actionSelect === "debt-type" && state.debtsUi.form) { state.debtsUi.form.debtType = e.target.value; return; }
  if (actionSelect === "debt-rate-period" && state.debtsUi.form) { state.debtsUi.form.ratePeriod = e.target.value; return; }
  if (actionSelect === "debt-system" && state.debtsUi.form) { state.debtsUi.form.amortizationSystem = e.target.value; return; }
  if (actionSelect === "debt-status" && state.debtsUi.form) { state.debtsUi.form.debtStatus = e.target.value; return; }
  if (actionSelect === "debt-pay-account" && state.debtsUi.payment) { state.debtsUi.payment.accountId = e.target.value; return; }
  if (actionSelect === "debt-pay-category" && state.debtsUi.payment) { state.debtsUi.payment.categoryId = e.target.value; return; }
  if (actionSelect === "emergency-goal") {
    const goalId = e.target.value || null;
    setData((d) => ({ ...d, emergencyGoalId: goalId }));
    notify("Reserva de emergência atualizada");
    return;
  }
  if (e.target.id === "import-file-input" && e.target.files && e.target.files[0]) {
    consumeFileInput(e.target, handleBackupFile);
    return;
  }
  if (field === "period-custom-start") { state.analyticsCustomStart = e.target.value; render(); }
  if (field === "period-custom-end") { state.analyticsCustomEnd = e.target.value; render(); }
  if (field === "tx-date") { state.form.date = e.target.value; }
  if (field === "goal-deadline") { state.goalForm.deadline = e.target.value; }

  // Campos numéricos das simulações (ex-sliders): recalcula a projeção ao confirmar.

  const STEPPER_FIELDS = [
    "invest-aporte-range", "invest-anos-range", "invest-taxa-range",
    "whatif-aporte", "whatif-anos", "whatif-taxa", "whatif-meses", "whatif-jurosfin",
  ];
  if (STEPPER_FIELDS.includes(field)) { render(); }
}

// ---- 'focusout': aqui sim confirmamos (persistimos) os campos que usam edição "rascunho"
function onFocusOut(e) {
  const field = e.target.dataset.field;
  if (field === "income") {
    if (state.incomeInput !== null) {
      const n = moneyOrZero(state.incomeInput);
      setData((d) => ({ ...d, monthlyIncome: Math.max(0, n) }));
      state.incomeInput = null;
      notify("Renda atualizada");
    }
  }
  if (field === "user-name") {
    if (state.userNameInput !== null) {
      const name = state.userNameInput.trim().slice(0, 40);
      const changed = name !== (state.data.userName || "");
      state.userNameInput = null;
      if (changed) { setData((d) => ({ ...d, userName: name })); notify(name ? `Prazer, ${name.split(/\s+/)[0]}!` : "Nome removido"); }
      else render();
    }
  }
  if (field === "emergency-months") {
    const n = clamp(parseInt(e.target.value, 10) || 6, 1, 24);
    if (n !== Number(state.data.emergencyMonths)) {
      setData((d) => ({ ...d, emergencyMonths: n }));
      notify(`Reserva alvo: ${n} ${n === 1 ? "mês" : "meses"} de despesa`);
    }
  }
  // [M5] Premissas de mercado: confirmam no blur, como renda e limite do cartão.
  // Guardar a data da revisão é o que permite o app dizer "premissas de 12/03"
  // em vez de fingir que o número veio de uma cotação em tempo real.
  if (field === "market-rate") {
    const key = e.target.dataset.id;
    if (Object.prototype.hasOwnProperty.call(state.ratesDraft, key)) {
      const raw = state.ratesDraft[key];
      delete state.ratesDraft[key];
      const current = marketRatesOf(state.data);
      const next = normalizeMarketRates({ ...current, [key]: moneyOrZero(raw), updatedAt: todayIso() });
      if (Math.abs(next[key] - current[key]) > 0.0001) {
        setData((d) => ({ ...d, marketRates: next }));
        notify("Premissas atualizadas");
      } else {
        render();
      }
    }
  }
  if (field === "credit-limit") {
    if (state.creditLimitInput !== null) {
      const n = moneyOrZero(state.creditLimitInput);
      setData((d) => ({ ...d, creditCardLimit: Math.max(0, n) }));
      state.creditLimitInput = null;
      notify("Limite da fatura atualizado");
    }
  }
  if (field === "category-budget") {
    const id = e.target.dataset.id;
    if (Object.prototype.hasOwnProperty.call(state.categoryBudgetDrafts, id)) {
      const raw = state.categoryBudgetDrafts[id];
      const value = normalizeBudgetValue(raw);      // null = sem limite
      const previous = categoryById(state.data, id).budget;
      delete state.categoryBudgetDrafts[id];
      if (moneyToCents(previous) !== moneyToCents(value)) {
        setData((d) => withBudgetSnapshot({ ...d, categories: d.categories.map((c) => c.id === id ? { ...c, budget: value } : c) }));
        notify(value == null ? "Limite removido" : `Teto de ${fmtBRL(value)} definido`);
      } else {
        render();
      }
    }
  }
  if (field === "budget-warn" || field === "budget-over") {
    const key = field === "budget-warn" ? "warn" : "over";
    const n = clamp(parseInt(e.target.value, 10) || (key === "warn" ? 80 : 100), 1, 300);
    setData((d) => withBudgetSnapshot({ ...d, budgetAlerts: { ...d.budgetAlerts, [key]: n } }));
    notify("Faixas de alerta atualizadas");
  }
  if (field === "split-necessidade" || field === "split-desejo" || field === "split-futuro") {
    const group = field.replace("split-", "");
    if (Object.prototype.hasOwnProperty.call(state.splitDrafts, group)) {
      const n = clamp(parseInt(state.splitDrafts[group], 10) || 0, 0, 100);
      setData((d) => withBudgetSnapshot({ ...d, budgetSplit: { ...d.budgetSplit, [group]: n } }));
      delete state.splitDrafts[group];
      notify("Percentuais da Regra x/x/x atualizados");
    }
  }
  formatarDinheiroAoSair(e.target);
}

// VALOR CONFIRMADO É VALOR FORMATADO.
//
// Digitar "5000" e sair do campo deixava "5000" na tela enquanto o resto do
// app fala "R$ 5.000,00". Num app de dinheiro isso é ambíguo na hora de
// conferir: "5000" pode ser lido como cinco mil ou como cinquenta reais mal
// digitados. Ao sair, o campo passa a mostrar as duas casas decimais.
//
// A grafia é a de `moneyDraft` (sem separador de milhar) porque é a que o
// próprio app já usa nos campos de Ajustes e Categorias, e porque
// `sanitizeDecimalInput` remove o ponto de milhar na próxima digitação: exibir
// "5.000,00" faria o valor mudar sozinho ao voltar ao campo.
//
// Taxa não é dinheiro, e controle deslizante não é campo de digitação: os dois
// ficam de fora para "15" de juros não virar "15,00" nem o passo do slider ser
// reescrito no meio do arraste.
const CAMPO_NAO_MONETARIO = /(taxa|rate|cet|juros|-range$)/;

function formatarDinheiroAoSair(el) {
  if (!el || !el.dataset || typeof el.value !== "string") return;
  const field = String(el.dataset.field || "");
  if (!field || CAMPO_NAO_MONETARIO.test(field)) return;
  const inputMode = String((el.getAttribute && el.getAttribute("inputmode")) || el.inputMode || "").toLowerCase();
  if (inputMode !== "decimal") return;
  const bruto = el.value.trim();
  if (!bruto) return;
  const n = parseMoneyInput(bruto);
  // Zero fica como está: `moneyDraft(0)` devolve string vazia, e apagar o que a
  // pessoa digitou seria pior do que não formatar.
  if (!Number.isFinite(n) || n === 0) return;
  const formatado = moneyDraft(n);
  if (!formatado || formatado === bruto) return;
  el.value = formatado;
  // O estado guarda o rascunho digitado; sem avisar o `onInput` a tela voltaria
  // ao texto antigo no próximo desenho.
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function onKeydown(e) {
  // [M6] Acessibilidade: Esc fecha o que estiver por cima, na ordem em que foi
  // empilhado. Antes só o clique fora fechava; inalcançável por teclado.
  if (e.key === "Escape") {
    // Esc, X, clique fora e o voltar do aparelho são a MESMA operação. Passam
    // todos pelo histórico para não sobrar entrada órfã na pilha.
    if (closeTopOverlay()) return;
  }
  const field = e.target.dataset.field;
  // Enter nos campos da configuração inicial avança, como em qualquer
  // formulário de várias etapas; teclado do celular fecha e o passo muda.
  if (e.key === "Enter" && state.onboarding.open && String(field || "").indexOf("onb-") === 0) {
    e.preventDefault();
    e.target.blur();
    if (onbCanAdvance(state.onboarding.step)) {
      if (state.onboarding.step === 4) finishOnboarding();
      else { state.onboarding.step += 1; render(); }
    }
    return;
  }
  if (e.key === "Enter" && field === "nlp-text") {
    e.preventDefault();
    runNaturalEntryParse();
    return;
  }
  if (e.key === "Enter" && field === "import-password") {
    e.preventDefault();
    if (state.importPendingFile) handleStatementFile(state.importPendingFile, state.importPassword);
    return;
  }
  // [M12] Enter abre o backup protegido, como em qualquer campo de senha.
  if (e.key === "Enter" && field === "backup-unlock-password") {
    e.preventDefault();
    e.target.blur();
    if (state.backup.locked && !state.backup.busy) unlockBackupFile();
    return;
  }
  if (e.key === "Enter" && (field === "backup-password" || field === "backup-password-confirm")) {
    e.preventDefault();
    e.target.blur();
    if (state.backup.encryptOpen && !state.backup.busy) exportBackupEncrypted();
    return;
  }
  // No editor de categoria o Enter confirma, como em qualquer formulário curto.
  // Vai pelo próprio botão para não duplicar a validação que mora na ação.
  if (e.key === "Enter" && (field === "cat-editor-name" || field === "cat-editor-budget")) {
    e.preventDefault();
    const save = document.querySelector('[data-action="cat-editor-save"]');
    if (save) save.click();
    return;
  }
  if (e.key === "Enter" && (field === "income" || field === "credit-limit" ||
      field === "category-budget" || field === "budget-warn" || field === "budget-over" ||
      field === "split-necessidade" || field === "split-desejo" || field === "split-futuro")) {
    e.preventDefault();
    e.target.blur();
    return;
  }

  // ENTER PRECISA ENVIAR O FORMULÁRIO.
  //
  // O app não tem nenhum elemento `<form>`: as telas são montadas como HTML
  // solto e o envio mora sempre num botão com `data-action`. Isso custa o
  // comportamento que todo mundo espera de um formulário; apertar Enter depois
  // de digitar a senha, o valor da meta ou o nome da conta não fazia nada, e no
  // celular a tecla "Ir" do teclado ficava inerte. Os casos acima foram sendo
  // resolvidos um a um, por nome de campo, e a lista nunca alcançou o login nem
  // os cadastros.
  //
  // Aqui a regra passa a ser geral: Enter num campo de uma linha aciona o botão
  // de enviar da MESMA camada em que o campo está (a de cima, se houver camada
  // aberta; senão a tela). A lista de ações é explícita de propósito - clicar
  // no primeiro `.btn--primary` que aparecesse acertaria "Excluir" com a mesma
  // facilidade com que acertaria "Salvar".
  // Campo dentro de `<form>` fica de fora: o navegador já faz o envio implícito
  // e o listener de `submit` cuida dele. Entrar aqui também dispararia o botão
  // duas vezes.
  if (e.key === "Enter" && !e.shiftKey && e.target.tagName === "INPUT" && !e.target.form
      && !ENTER_EXEMPT_TYPES.has(e.target.type)) {
    const escopo = e.target.closest("[role=dialog], [role=alertdialog], .modal-sheet") || document.querySelector("main");
    const enviar = escopo && escopo.querySelector(SUBMIT_ACTION_SELECTOR);
    if (enviar && !enviar.disabled) {
      e.preventDefault();
      // O `blur` primeiro: campos com máscara gravam no `change`, e enviar com
      // o cursor ainda dentro perderia o que acabou de ser digitado.
      e.target.blur();
      enviar.click();
    }
  }
}

// Tipos em que Enter tem significado próprio (ou nenhum) e não deve enviar.
const ENTER_EXEMPT_TYPES = new Set(["checkbox", "radio", "button", "submit", "reset", "file", "range"]);

// Ações que representam "enviar este formulário". Explícitas para que Enter
// nunca caia num botão destrutivo que por acaso esteja na mesma camada.
const SUBMIT_ACTIONS = [
  "submit-tx", "submit-goal", "submit-goal-action", "account-save", "account-submit",
  "account-reconcile-save", "card-save", "card-pay-save", "cat-editor-save", "debt-save",
  "debt-extra-save", "debt-payment-save", "pf-save", "pf-update-save", "pf-dividend-save",
  "qr-save", "rule-save", "transfer-save", "wealth-save", "wealth-update-save",
];
const SUBMIT_ACTION_SELECTOR = SUBMIT_ACTIONS.map((a) => `[data-action="${a}"]`).join(",");

// ---------------- AI insight ----------------
// O envio passa pela tela de prévia: antes, a confirmação descrevia o pacote
// em prosa, e prosa não é o pacote. Consentir sobre uma descrição não é
// consentir sobre o conteúdo, ainda mais quando ele leva nomes escolhidos pelo
// usuário. A prévia mostra o JSON que vai sair e deixa tirar partes dele.
function requestAiInsight() {
  if (normalizePrivacy(state.data.privacy).aiSharing === "blocked") {
    notify("Envios para IA estão bloqueados em Privacidade", "warn");
    return;
  }
  const salvo = normalizePrivacy(state.data.privacy).aiHide;
  state.aiPreview = { monthKey: keyOfCurrentMonth(), hide: salvo.slice(), showJson: false };
  openOverlay("ai-preview");
  render();
}

// Liga e desliga um campo ocultável. Marcado = o campo VAI junto, então marcar
// remove da lista de ocultos. A caixa fala do dado, não da ocultação.
function toggleAiPreviewField(field, included) {
  const atual = new Set(state.aiPreview.hide);
  if (included) atual.delete(field);
  else atual.add(field);
  state.aiPreview = { ...state.aiPreview, hide: Array.from(atual).sort() };
  render();
}

// A escolha vira preferência: quem tirou os nomes das metas uma vez não deveria
// precisar tirar de novo a cada análise.
async function confirmAiPreview() {
  const opcoes = { hide: state.aiPreview.hide.slice() };
  const mKey = state.aiPreview.monthKey || keyOfCurrentMonth();
  dismissOverlay("ai-preview");
  setData((d) => ({ ...d, privacy: { ...normalizePrivacy(d.privacy), aiHide: normalizeAiHide(opcoes.hide) } }));
  setState({ aiInsight: { loading: true, text: null, error: null, analise: null } });
  try {
    const result = await requestStructuredAnalysis(state.data, mKey, opcoes);
    setState({
      aiInsight: {
        loading: false,
        text: result.texto || null,
        analise: result.estruturado ? result.analise : null,
        error: null,
      },
    });
  } catch (err) {
    if (typeof reportSafeError === "function") reportSafeError("ai", err, "ai_request");
    setState({
      aiInsight: {
        loading: false, text: null, analise: null,
        error: (err && err.message) || "Não foi possível gerar a análise agora.",
      },
    });
  }
}

// ---------------- Init ----------------
async function init() {
  const root = document.getElementById("app");

  // ---- Boot Local-First: espera o IndexedDB abrir antes do primeiro render ----
  // O snapshot é carregado uma única vez para a memória; daí em diante a UI lê
  // de forma síncrona e as gravações vão para o banco em background.
  // [M6] Esqueleto em vez de spinner: mesma geometria da tela real, então o
  // conteúdo "preenche" a silhueta em vez de empurrá-la.
  //
  // Tema do sistema no primeiro uso, resolvido antes de qualquer pintura: o
  // esqueleto já nasce na cor certa em vez de piscar claro e virar escuro.
  const __systemTheme = systemThemePreference();
  if (__systemTheme) state.data = { ...state.data, theme: __systemTheme };
  applyTheme(state.data.theme);
  root.innerHTML = renderShell();
  try {
    state.data = await initStorage();
  } catch (e) {
    if (typeof reportSafeError === "function") reportSafeError("storage", e, "storage_init");
    state.data = loadData();
  }
  state.booting = false;
  state.storageOk = isStorageAvailable();
  // O escopo lembrado é uma conta conhecida, mesmo quando a rede ainda não
  // confirmou o cookie nesta abertura. Alterações feitas offline precisam virar
  // fila desde já; uma resposta guest troca o banco e reinicializa esta flag.
  if (FinanceStore.scope() !== GUEST_SCOPE) {
    FinanceStore.setOutboxEnabled(true);
    state.account.knownAccount = true;
  }
  state.form = freshTxForm();
  // Primeiro uso: a configuração de 4 passos assume a tela. Quem já usava o app
  // nunca cai aqui. `migrate` marca o onboarding como concluído para qualquer
  // base que já tenha lançamento, conta, meta ou renda (ver normalizeOnboarding).
  // Abrir já dentro de uma conta segue a mesma regra do login: o banco daquela
  // conta pode estar vazio neste aparelho só porque a descida ainda não veio, e
  // um assistente na frente da tela nesse instante pede um cadastro que a conta
  // já tem. `bootstrapAccountLink` libera o portão quando a descida termina.
  if (FinanceStore.scope() !== GUEST_SCOPE) holdOnboardingGate();
  else state.onboarding.open = !(state.data.onboarding && state.data.onboarding.done);
  state.backup.undoAvailable = !!FinanceStore.readUndoSnapshot();
  hydrateImportUndo();
  FinanceStore.onError(() => {
    state.storageOk = false;
    notify("Não foi possível salvar os dados neste navegador");
  });
  // ...e o caminho de volta. Sem ele, um único erro passageiro deixava o alarme
  // aceso pelo resto da sessão, mesmo com as gravações já normalizadas.
  FinanceStore.onRecover(() => {
    const ok = isStorageAvailable();
    if (ok === state.storageOk) return;
    state.storageOk = ok;
    render();
  });

  // ---- Roteamento ----
  // A rota inicial vem do endereço, então `#/saude` colado numa aba nova abre a
  // tela de saúde. `replace` (e não `push`) porque a primeira entrada é a raiz:
  // voltar a partir dela tem de sair do app, não empilhar uma tela fantasma.
  // O snapshot do banco chegou depois do primeiro paint e traz o `theme`
  // gravado. No primeiro uso a preferência do sistema vira a escolha
  // registrada; nos seguintes vale o que estava no banco.
  if (__systemTheme && state.data.theme !== __systemTheme) setData((d) => ({ ...d, theme: __systemTheme }));
  else applyTheme(state.data.theme);

  {
    const boot = NavHistory.current();
    if (Router.isTab(boot.tab)) state.tab = boot.tab;
    if (state.tab === "add") state.form = freshTxForm();
    NavHistory.replace(state.tab, [], boot.addressed ? boot.depth : 0);
  }
  window.addEventListener("popstate", applyHistoryRoute);

  // ---- Sincronização em nuvem ----
  // O módulo não conhece o estado do aplicativo; recebe as duas pontas aqui.
  // `applyRemote` passa por `setData` de propósito: é o caminho que grava no
  // IndexedDB, redesenha a tela e reavalia conquistas e avisos, exatamente
  // como se o próprio usuário tivesse feito a alteração; porque, em outro
  // aparelho, foi ele quem fez.
  if (typeof CloudSync !== "undefined") {
    CloudSync.configure({
      applyRemote: (merged) => setDataFromRemote(merged),
      onStatus: () => scheduleRender(render),
      onAuthInvalid: (details) => invalidateAccountSession(details),
      onAccountScopeChanged: (details) => handleAccountScopeChanged(details),
      onSessionRefreshRequired: (details) => handleSessionRefreshRequired(details),
      getExpectedAccountId: () => state.account.authenticated ? state.account.userId : "",
    });
  }
  if (typeof startAccountRecoveryListeners === "function") startAccountRecoveryListeners();

  // Outra aba do mesmo navegador gravou: esta aqui releu o banco e agora
  // precisa redesenhar com o que chegou. Sem isto, a aba parada continuaria
  // mostrando (e regravando) uma base que já não existe.
  FinanceStore.onOtherTabWrite((data) => { setDataFromRemote(data); });

  // Os campos de arquivo ficam FORA de `#app` e ouvem o próprio `change`; ver
  // `ensureFileInputs`. Criá-los aqui deixa a árvore pronta antes do primeiro
  // desenho, inclusive para os testes de navegador, que os procuram por id.
  ensureFileInputs();

  root.addEventListener("click", onClick);
  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  root.addEventListener("focusout", onFocusOut);
  root.addEventListener("keydown", onKeydown);
  // Um `<form>` de verdade (hoje só o de login) envia sozinho no Enter e
  // recarregaria a página, que num app local-first significa perder a tela e
  // reabrir do zero. O envio continua sendo o `data-action` do botão; aqui só
  // trocamos a navegação nativa por um clique nele.
  root.addEventListener("submit", (e) => {
    const form = e.target.closest("form");
    if (!form) return;
    e.preventDefault();
    const enviar = form.querySelector('button[type="submit"][data-action]');
    if (enviar && !enviar.disabled) enviar.click();
  });

  root.addEventListener("dragover", (e) => {
    if (e.target.closest("#statement-dropzone")) { e.preventDefault(); if (!state.importDragOver) { state.importDragOver = true; render(); } }
  });
  root.addEventListener("dragleave", (e) => {
    if (e.target.closest("#statement-dropzone") && state.importDragOver) { state.importDragOver = false; render(); }
  });
  root.addEventListener("drop", (e) => {
    const dz = e.target.closest("#statement-dropzone");
    if (!dz) return;
    e.preventDefault();
    state.importDragOver = false;
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleStatementFile(file); else render();
  });

  render();
  // Se a troca de worker aconteceu antes de o módulo conseguir assinar
  // `controllerchange`, a identidade do HTML denuncia a mistura de pacotes.
  // A conferência roda depois de o armazenamento abrir, para o flush poder
  // concluir uma gravação real antes da eventual recarga.
  if (typeof navigator !== "undefined" && navigator.serviceWorker) {
    reconcileActiveServiceWorkerBuild(navigator.serviceWorker).catch(() => {});
  }

  // [M6] Primeira sincronização SILENCIOSA. Quem já usava o app tem meses de
  // histórico e desbloquearia dezenas de medalhas de uma vez; um paredão de
  // celebrações que não celebra nada. Registramos o passado sem alarde; a
  // comemoração fica reservada para o que for conquistado daqui em diante.
  try {
    await bootstrapAccount();
  } catch (error) {
    if (typeof reportSafeError === "function") reportSafeError("auth", error, "account_bootstrap");
    state.account.loading = !!state.account.knownAccount && !state.account.authenticated;
    state.account.sessionStatus = "unknown";
    render();
  }
  idleTask(() => syncAchievements({ silent: true }));
  // [M8] Mesma decisão para as notificações: o histórico antigo entra já lido.
  idleTask(() => syncNotifications({ silent: !normalizeNotifications(state.data.notifications).initialized }));

  // Um aviso urgente que nasce enquanto o app está aberto merece um toast :
  // ninguém fica olhando para o sino esperando o badge mudar.
  EventBus.on(APP_EVENTS.NOTIFICATIONS_CREATED, ({ items }) => {
    const urgent = items.filter((n) => n.tone === "danger");
    if (urgent.length === 0) return;
    notify(urgent.length === 1 ? urgent[0].title : `${urgent.length} avisos precisam de atenção`, "danger");
  });

}

const APP_RELOAD_GUARD_KEY = "cofre_build_reload";

// O observador precisa existir antes dos `await` de armazenamento e conta.
// Caso contrário uma atualização rápida pode assumir o controle durante o
// boot, antes de o app começar a ouvir `controllerchange`.
function setupServiceWorker() {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
  const serviceWorker = navigator.serviceWorker;
  observeServiceWorkerControllerChanges(serviceWorker);
  serviceWorker.addEventListener("message", (event) => {
    const data = event && event.data;
    if (!data || data.type !== "COFRE_OBSERVATION" || data.area !== "service_worker") return;
    if (data.code !== "sw_install_failed" && data.code !== "sw_fetch_failed") return;
    if (typeof reportSafeError === "function") reportSafeError("service_worker", null, data.code);
  });

  const registrar = () => {
    serviceWorker.register("service-worker.js")
      .then((registration) => registration.update().catch((error) => {
        if (typeof reportSafeError === "function") reportSafeError("service_worker", error, "sw_update_failed");
      }))
      .catch((error) => {
        if (typeof reportSafeError === "function") reportSafeError("service_worker", error, "sw_register_failed");
      });
  };
  if (document.readyState === "complete") registrar();
  else window.addEventListener("load", registrar, { once: true });
}

// A PRIMEIRA TOMADA DE CONTROLE NÃO É UMA ATUALIZAÇÃO.
//
// Na primeira visita, a página inteira já veio do pacote atual e começou sem
// controller. O clients.claim() do worker dispara controllerchange mesmo assim.
// Recarregar nesse momento apagava o rascunho do onboarding enquanto a pessoa
// ainda preenchia o primeiro passo. Só uma troca que substitui um controller já
// existente precisa terminar gravações e recarregar o pacote.
function observeServiceWorkerControllerChanges(serviceWorker) {
  let controllerAnterior = serviceWorker.controller;
  serviceWorker.addEventListener("controllerchange", () => {
    const anterior = controllerAnterior;
    controllerAnterior = serviceWorker.controller;
    if (!anterior) return;
    handleControllerChange();
  });
}

// O worker responde pelo canal que enviamos, e não pelo `postMessage` da
// janela: assim a resposta não se confunde com nenhuma outra mensagem, e uma
// versão antiga que não conheça `GET_BUILD` simplesmente não responde.
function activeBuildId(worker) {
  return new Promise((resolve) => {
    if (!worker || typeof MessageChannel !== "function") { resolve(""); return; }
    let respondido = false;
    const concluir = (valor) => { if (!respondido) { respondido = true; resolve(valor); } };
    try {
      const canal = new MessageChannel();
      canal.port1.onmessage = (event) => {
        const dados = event && event.data;
        concluir(dados && dados.type === "COFRE_BUILD" ? String(dados.build || "") : "");
      };
      worker.postMessage({ type: "GET_BUILD" }, [canal.port2]);
    } catch (e) { concluir(""); }
    setTimeout(() => concluir(""), 3000);
  });
}

function documentBuildId() {
  const meta = document.querySelector('meta[name="cofre-build"]');
  return meta ? String(meta.getAttribute("content") || "") : "";
}

async function reconcileActiveServiceWorkerBuild(serviceWorker) {
  const documento = documentBuildId();
  if (!documento || !serviceWorker || !serviceWorker.controller) return;
  const ativo = await activeBuildId(serviceWorker.controller);
  if (ativo && ativo !== documento) await handleControllerChange();
}

async function handleControllerChange() {
  const build = await activeBuildId(navigator.serviceWorker.controller);
  // A guarda é POR PACOTE. Uma guarda booleana impediria a recarga da próxima
  // atualização; nenhuma guarda deixaria a aba recarregar em laço.
  let guarda = "";
  try { guarda = sessionStorage.getItem(APP_RELOAD_GUARD_KEY) || ""; } catch (e) { guarda = ""; }
  const marca = build || "sem-identidade";
  if (guarda === marca) return;

  let gravou = false;
  try { gravou = await FinanceStore.flush(); } catch (e) { gravou = false; }
  if (!gravou) {
    // Recarregar agora perderia a gravação que o navegador não confirmou. A
    // página fica onde está, e o aviso diz o que está pendente.
    notify("Atualização pendente: os dados ainda estão sendo salvos", "danger");
    return;
  }
  try { sessionStorage.setItem(APP_RELOAD_GUARD_KEY, marca); } catch (e) { /* modo privado */ }
  location.reload();
}

if (window.CofreUI && window.CofreUI.test && window.CofreUI.test.enabled) {
  window.CofreUI.test.register({
    snapshot: () => ({
      dashboardFocus: state.data.dashboardFocus,
      monthlyIncome: state.data.monthlyIncome,
      accountCount: state.data.accounts.length,
      transactionCount: state.data.transactions.length,
      installmentCount: state.data.transactions.filter((tx) => tx.installmentGroupId).length,
      cardPaymentCount: state.data.cardPayments.length,
      goalCount: state.data.goals.length,
      goalCurrent: state.data.goals[0] ? state.data.goals[0].current : null,
      version: state.data.version,
      backupPreviewOpen: !!state.backup.preview,
    }),
    navigate: (tab) => {
      if (!Router.isTab(tab)) throw new TypeError("Destino de teste inválido");
      setState({ tab });
    },
    theme: (value) => {
      if (value !== "dark" && value !== "light") throw new TypeError("Tema de teste inválido");
      applyTheme(value);
    },
  });
}

setupServiceWorker();
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
