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

let state = {
  data: loadData(),
  storageOk: isStorageAvailable(),
  storageWarningDismissed: false,
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
  // ---- novos recursos ----
  importRows: null,        // linhas parseadas de OFX/CSV aguardando revisão
  importFilename: null,
  importDragOver: false,
  importError: null,       // { title, detail }; erro visual da importação
  importLoading: false,
  qr: { open: false, scanning: false, error: null, checking: false, draft: null },
  // ---- Feature 4: lançamento em linguagem natural ----
  nlp: { text: "", drafts: [], error: null, loading: false, touched: false },
  // ---- Feature 2: backup (exportar / importar) ----
  backup: { preview: null, error: null, mode: "merge", busy: false, undoAvailable: false },
  // ---- Feature 3: painel de orçamentos ----
  budgetsExpanded: false,
  simulate: { mode: "vista", amount: "", goalId: "", finance: { valorBem: "", entrada: "", numParcelas: "", valorParcela: "" } },
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
      if (callback) {
        try {
          Promise.resolve(callback()).catch(() => notify("Não foi possível concluir esta ação", "danger"));
        } catch (err) {
          notify("Não foi possível concluir esta ação", "danger");
        }
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

function setData(updater) {
  state.data = typeof updater === "function" ? updater(state.data) : updater;
  const ok = saveData(state.data);
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
  if (typeof CloudSync !== "undefined") CloudSync.schedule();
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
    console.warn("[M8] Falha ao sincronizar notificações:", e);
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
function focusKeyOf(el) {
  if (!el) return null;
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
  el.focus();
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

function render() {
  const root = document.getElementById("app");
  const active = document.activeElement;
  const focusKey = focusKeyOf(active);
  const selStart = active && "selectionStart" in active ? active.selectionStart : null;
  const selEnd = active && "selectionStart" in active ? active.selectionEnd : null;
  applyTheme(state.data.theme);
  root.innerHTML = renderShell();
  restoreFocus(focusKey, selStart, selEnd);
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

function afterRender() {
  markEnterAnimations();
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

// Importação 100% offline: lê, decodifica, parseia e categoriza no navegador.
// Qualquer falha vira um erro visual explicativo na própria tela de importação.
async function handleStatementFile(file) {
  state.importError = null;
  state.importLoading = true;
  state.importRows = null;
  render();

  try {
    const text = await readStatementFile(file);
    const rows = prepareImportRows(text, file.name, state.data);
    state.importRows = rows;
    state.importFilename = file.name;
    state.importLoading = false;
    render();
    const meta = rows.meta || {};
    notify(`${rows.length} lançamento${rows.length === 1 ? "" : "s"} lido${rows.length === 1 ? "" : "s"} do ${(meta.format || "arquivo").toUpperCase()}`);
  } catch (err) {
    state.importLoading = false;
    if (typeof reportSafeError === "function") reportSafeError("import", err, "import_read");
    state.importRows = null;
    state.importError = {
      title: (err && err.message) || "Não foi possível ler o arquivo.",
      detail: err && err.code === "UNKNOWN_FORMAT"
        ? "Formatos aceitos: .OFX e .CSV. No app do seu banco, procure por “Exportar extrato”."
        : (err && err.code === "NO_ROWS"
          ? "Confira se o período exportado realmente contém movimentações."
          : "Nenhum dado foi enviado para a internet; tudo acontece no seu navegador."),
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
  { id: "calendar", label: "Planejar", ariaLabel: "Planejar, abrir Planejamento", icon: "calendar" },
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
    <a class="skip-link" href="#conteudo" data-action="skip-to-content">Ir para o conteúdo</a>
    ${renderSideNav()}
    <main class="main-content" id="conteudo" tabindex="-1">
      ${(!state.booting && !state.storageOk && !state.storageWarningDismissed) ? renderStorageWarning() : ""}
      ${state.booting ? renderDashboardSkeleton() : renderScreen()}
    </main>
    ${renderBottomNav()}
    ${renderCelebrationOverlay()}
    <div class="sr-live" role="status" aria-live="polite" aria-atomic="true">${state.toast ? escapeHtml(state.toast) : ""}</div>
    ${state.toast ? `<div class="toast ${state.toastTone ? `toast--${state.toastTone}` : ""}" aria-hidden="true">${svgIcon(state.toastTone === "danger" || state.toastTone === "warn" ? "alertTriangle" : "checkCircle", 16)}<span>${escapeHtml(state.toast)}</span></div>` : ""}
    <input type="file" id="import-file-input" accept="application/json,.json" data-ui-css="display:none" />
    <input type="file" id="statement-file-input" accept=".ofx,.csv,.txt,text/csv,application/x-ofx" data-ui-css="display:none" />
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

// Lê o arquivo escolhido e monta a PRÉVIA; nada é gravado antes do usuário
// confirmar e escolher entre mesclar ou substituir.
async function handleBackupFile(file) {
  state.backup.busy = true;
  state.backup.error = null;
  state.backup.preview = null;
  render();
  try {
    const text = await readFileAsText(file);
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
    state.backup = { preview: null, error: null, mode: "merge", busy: false, undoAvailable: true };
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
    case "confirmation-required":
      if (state.confirmation) { state.confirmation.typedText = val; render(); }
      break;
    case "onb-income": state.onboarding.income = val; patchOnboardingFooter(); break;
    case "onb-acc-name": state.onboarding.account.name = val; patchOnboardingFooter(); break;
    case "onb-acc-balance": state.onboarding.account.balance = val; patchOnboardingFooter(); break;
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
    case "auth-delete-password": state.account.form.deletePassword = val.slice(0, 128); break;
    case "auth-delete-text": state.account.form.deleteText = val.toUpperCase().slice(0, 20); if (e.target.value !== state.account.form.deleteText) e.target.value = state.account.form.deleteText; break;
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
    case "sim-finance-valorbem": state.simulate.finance.valorBem = val; render(); break;
    case "sim-finance-entrada": state.simulate.finance.entrada = val; render(); break;
    case "sim-finance-numparcelas": state.simulate.finance.numParcelas = val.replace(/[^0-9]/g, ""); render(); break;
    case "sim-finance-valorparcela": state.simulate.finance.valorParcela = val; render(); break;
    // QR e lançamento inteligente: patch pontual, sem re-render (o campo perderia
    // o foco do teclado no meio da digitação).
    case "qr-amount": if (state.qr.draft) { state.qr.draft.amount = val; patchQrSaveButton(); } break;
    case "qr-estab": if (state.qr.draft) state.qr.draft.description = val; break;
    case "nlp-text": state.nlp.text = val; state.nlp.touched = true; patchNlpButton(); break;
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
    handleStatementFile(e.target.files[0]);
    e.target.value = "";
    return;
  }
  if (actionSelect === "import-category") {
    const idx = Number(e.target.dataset.id);
    if (state.importRows && state.importRows[idx]) state.importRows[idx].categoryId = e.target.value;
    return;
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
    const txId = e.target.dataset.id;
    const categoryId = e.target.value;
    if (!categoryId) return;
    setData((d) => ({ ...d, transactions:d.transactions.map((tx) => tx.id === txId ? markTransactionIssueReviewed(updateTransaction(tx, { categoryId }), e.target.dataset.key) : tx) }));
    notify("Categoria atualizada"); return;
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
    handleBackupFile(e.target.files[0]);
    e.target.value = "";
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
  }
}

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
    console.error("Falha ao inicializar o armazenamento:", e);
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

  root.addEventListener("click", onClick);
  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  root.addEventListener("focusout", onFocusOut);
  root.addEventListener("keydown", onKeydown);

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

  // [M6] Primeira sincronização SILENCIOSA. Quem já usava o app tem meses de
  // histórico e desbloquearia dezenas de medalhas de uma vez; um paredão de
  // celebrações que não celebra nada. Registramos o passado sem alarde; a
  // comemoração fica reservada para o que for conquistado daqui em diante.
  try {
    await bootstrapAccount();
  } catch (error) {
    if (typeof reportSafeError === "function") reportSafeError("sync", error, "account_bootstrap");
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

  if ("serviceWorker" in navigator) {
    // ESTE TRECHO RODA DEPOIS DO `load`, NÃO ANTES.
    //
    // `init()` é `async` e espera o IndexedDB abrir (`await initStorage()`) antes
    // de chegar aqui. Quando a linha executa, o evento `load` já disparou, e um
    // listener registrado depois do evento NUNCA roda. O resultado silencioso era
    // o pior possível: nenhum service worker registrado, nenhum cache criado, e o
    // aplicativo que se anuncia como offline abrindo em branco sem rede.
    // O mesmo guard de `readyState` que a inicialização usa mais abaixo resolve.
    // O `catch` vazio de antes era cúmplice do defeito: mesmo depois de
    // corrigido o momento da chamada, uma falha de registro continuaria
    // invisível e o aplicativo seguiria anunciando um modo offline que não
    // existe. O diagnóstico local já tem lugar para isso.
    const registrarServiceWorker = () => {
      navigator.serviceWorker.register("service-worker.js").catch((error) => {
        if (typeof reportSafeError === "function") reportSafeError("storage", error, "sw_register_failed");
        console.error("Falha ao registrar o service worker:", error);
      });
    };
    if (document.readyState === "complete") registrarServiceWorker();
    else window.addEventListener("load", registrarServiceWorker, { once: true });
    // DOIS PACOTES NA MESMA ABA É O PIOR CENÁRIO DA ATUALIZAÇÃO.
    //
    // Quando o service worker novo assume, o HTML que já está na tela continua
    // pedindo módulos do pacote antigo, que o cache novo já não guarda. A
    // aba passa a rodar metade de cada versão, e uma gravação em andamento pode
    // terminar no meio da troca. Ao ver `controllerchange`, perguntamos ao
    // worker QUAL pacote ele é, terminamos o que estava sendo salvo e só então
    // recarregamos, uma única vez por pacote.
    observeServiceWorkerControllerChanges(navigator.serviceWorker);
  }
}

const APP_RELOAD_GUARD_KEY = "cofre_build_reload";

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

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
