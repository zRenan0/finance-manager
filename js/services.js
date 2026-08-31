// services.js. [M8] Event Bus + camada de serviços + central de notificações.
//
// O §19 do briefing pede uma separação clara entre UI, Serviços, Lógica
// Financeira e Persistência, um Event Bus e seis serviços nomeados. Este
// arquivo entrega os três; sem reescrever nada do que já funciona.
//
// A regra que organiza o arquivo
// ------------------------------
// **Nenhum cálculo financeiro novo mora aqui.** Os motores puros dos módulos
// anteriores (`metrics.js`, `budgets.js`, `portfolio.js`, `analytics.js`,
// `advisor.js`, `goals.js`, `forecast.js`, `recurring.js`, `health.js`,
// `score.js`, `achievements.js`) continuam sendo a única fonte de verdade. Os
// serviços são **fachadas**: dão um endereço estável e um vocabulário único
// para o que já existe. Duas fontes para o mesmo número seriam duas verdades
// sobre o mesmo dinheiro; o defeito que o Módulo 3 já teve de corrigir no
// patrimônio.
//
// Por que fachada e não classe com estado
// ---------------------------------------
// O app grava de forma imutável e a UI lê um snapshot síncrono. Um serviço com
// cópia interna do dado seria uma terceira verdade e um cache para invalidar à
// mão. Aqui todo método recebe `data` explicitamente: mesma entrada, mesma
// saída, testável sem DOM e sem storage.
//
// A única regra realmente NOVA do módulo é a de notificações; e mesmo ela não
// calcula dinheiro: lê os modelos prontos e decide o que merece interromper o
// usuário.
//
// Dependências: utils.js, storage.js, budgets.js, metrics.js, score.js,
// health.js, goals.js, forecast.js, calendar.js, recurring.js, analytics.js,
// insights.js, assistant.js, advisor.js, investments.js, portfolio.js,
// achievements.js.
"use strict";

/* ==============================================================================
 * 1. EVENT BUS
 * ==============================================================================
 * Comunicação entre módulos sem que um conheça o outro. Três decisões:
 *
 *   • Um handler que estoura NÃO derruba os outros. Um `emit` é uma difusão,
 *     não uma cadeia: se o cartão de notificação quebrar, o toast ainda tem de
 *     aparecer.
 *   • `on` devolve a própria função de cancelamento. Quem assina não precisa
 *     guardar a referência do handler para conseguir desassinar depois.
 *   • Há curinga (`*`) porque diagnóstico é caso de uso real; um log de
 *     eventos em desenvolvimento não deveria exigir 12 assinaturas.
 */

const APP_EVENTS = {
  DATA_CHANGED: "data:changed",
  TAB_CHANGED: "tab:changed",
  TRANSACTION_ADDED: "transaction:added",
  ACHIEVEMENT_UNLOCKED: "achievement:unlocked",
  NOTIFICATIONS_CREATED: "notifications:created",
  NOTIFICATION_READ: "notification:read",
};

const EventBus = (function createEventBus() {
  const handlers = new Map();

  function listOf(event) {
    let list = handlers.get(event);
    if (!list) { list = []; handlers.set(event, list); }
    return list;
  }

  function on(event, handler) {
    if (typeof handler !== "function" || !event) return function noop() {};
    listOf(event).push(handler);
    return function off() { EventBus.off(event, handler); };
  }

  function once(event, handler) {
    if (typeof handler !== "function" || !event) return function noop() {};
    const wrapped = function wrapped(payload) {
      EventBus.off(event, wrapped);
      handler(payload);
    };
    return on(event, wrapped);
  }

  function off(event, handler) {
    const list = handlers.get(event);
    if (!list) return;
    const i = list.indexOf(handler);
    if (i >= 0) list.splice(i, 1);
    if (list.length === 0) handlers.delete(event);
  }

  function emit(event, payload) {
    if (!event) return 0;
    let delivered = 0;
    // Cópia antes de percorrer: um handler pode assinar/cancelar durante a
    // difusão sem embaralhar o laço.
    const direct = (handlers.get(event) || []).slice();
    const wildcard = (handlers.get("*") || []).slice();
    direct.forEach((fn) => {
      delivered++;
      try { fn(payload, event); }
      catch (error) {
        if (typeof reportSafeError === "function") reportSafeError("events", error, "event_handler");
      }
    });
    wildcard.forEach((fn) => {
      delivered++;
      try { fn(payload, event); }
      catch (error) {
        if (typeof reportSafeError === "function") reportSafeError("events", error, "event_handler");
      }
    });
    return delivered;
  }

  function listenerCount(event) {
    return (handlers.get(event) || []).length;
  }

  function clear(event) {
    if (event) handlers.delete(event);
    else handlers.clear();
  }

  return { on, once, off, emit, listenerCount, clear, EVENTS: APP_EVENTS };
})();

/* ==============================================================================
 * 2. SERVIÇOS DE DOMÍNIO (fachadas finas sobre os motores existentes)
 * ============================================================================== */

// Dinheiro que entra, sai e sobra. Tudo que o Dashboard e o Score consomem.

const FinanceService = {
  month(data, monthKey) { return monthTotals(data, monthKey || keyOfDate(new Date())); },
  realizedMonth(data, monthKey) { return realizedMonthTotals(data, monthKey || keyOfDate(new Date())); },
  income(data, monthKey) { return effectiveIncome(data, monthKey || keyOfDate(new Date())); },
  balance(data) { return realizedBalance(data); },
  netWorth(data) { return netWorth(data); },
  netWorthSeries(data, months) { return netWorthSeries(data, months || 6); },
  emergency(data) { return emergencyFund(data); },
  upcomingBills(data, days) { return upcomingBills(data, days == null ? 30 : days); },
  pendingRecurring(data, monthKey) { return getPendingRecurring(data, monthKey || keyOfDate(new Date())); },
  forecast(data, refIso) { return buildForecast(data, refIso); },
  dashboard(data, refDate) { return buildDashboardModel(data, refDate || new Date()); },
  calendar(data, monthKey) { return buildCalendarMonth(data, monthKey || keyOfDate(new Date())); },
  annualPlan(data, year) { return buildAnnualPlan(data, year || new Date().getFullYear()); },
};

// Tetos por categoria, grupos 50/30/20 e o impacto de um gasto antes de salvá-lo.

const BudgetService = {
  status(data, monthKey) { return computeBudgetStatus(data, monthKey); },
  forCategory(data, categoryId, monthKey) { return budgetStatusFor(data, categoryId, monthKey); },
  impact(data, categoryId, amount, monthKey) { return evaluateBudgetImpact(data, categoryId, amount, monthKey); },
  alerts(data, monthKey) { return budgetAlerts(data, monthKey); },
  thresholds(data) { return budgetThresholds(data); },
  suggest(data, categoryId) { return suggestBudgetFor(data, categoryId); },
};

// Carteira (mesma coleção `assets`, classe investimento) e projeções.

const InvestmentService = {
  portfolio(data, opts) { return buildPortfolioModel(data, opts || {}); },
  items(data) { return portfolioItems(data); },
  rates(data) { return marketRatesOf(data); },
  wealth(data, months) { return buildWealthModel(data, months || 12); },
  compound(params) { return simulateCompoundInterest(params || {}); },
};

// Os onze indicadores do §11 e o motor de recorrências.

const AnalyticsService = {
  month(data, monthKey) { return buildAnalyticsModel(data, monthKey || keyOfDate(new Date())); },
  recurring(data, opts) { return buildRecurringModel(data, opts || {}); },
  proposals(data, monthKey) { return buildRecurringModel(data, { monthKey }).proposals; },
};

// Leitura interpretada: o que os números querem dizer.

const InsightService = {
  advisor(data, monthKey, models) { return buildAdvisorModel(data, monthKey || keyOfDate(new Date()), models || {}); },
  assistant(data, monthKey) { return getAssistantAlerts(data, monthKey || keyOfDate(new Date())); },
  leaks(data, monthKey) { return detectSilentLeaks(data, monthKey || keyOfDate(new Date())); },
  score(data, monthKey, ctx) { return computeFinanceScore(data, monthKey || keyOfDate(new Date()), ctx); },
  health(data, monthKey, ctx) { return buildHealthModel(data, monthKey || keyOfDate(new Date()), ctx); },
  goals(data, refDate) { return buildGoalsModel(data, refDate || new Date()); },
  achievements(data, refDate) { return buildAchievementsModel(data, refDate || new Date()); },
};

/* ==============================================================================
 * 3. NOTIFICAÇÕES; a única regra nova do módulo
 * ==============================================================================
 * O app já sabia tudo isto; só não sabia AVISAR. O Dashboard mostra a conta que
 * vence, o orçamento estourado e a assinatura reajustada; mas só para quem
 * abre a tela certa no dia certo. A central de notificações é o registro do que
 * mudou desde a última visita.
 *
 * Três decisões definem o comportamento:
 *
 *   1. **Uma notificação por fato, não por render.** A identidade é a `key` :
 *      `conta:<id>:<data>`, `orcamento:<categoria>:<mês>:over`. Enquanto o fato
 *      for o mesmo, o aviso é o mesmo, mesmo que a tela seja reconstruída mil
 *      vezes. Sem isso, cada `render()` empilharia um alerta idêntico.
 *   2. **A primeira sincronização é silenciosa.** Quem já usa o app há meses
 *      receberia trinta avisos não lidos no primeiro boot; um paredão que não
 *      informa nada. O passado entra já lido; só o que acontecer daí em diante
 *      acende o badge. É a mesma decisão tomada nas conquistas do Módulo 6.
 *   3. **Silenciar é por grupo, e não apaga histórico.** Quem não quer ser
 *      lembrado de assinaturas silencia o grupo; os avisos param de nascer, mas
 *      os lançamentos e os modelos continuam intactos.
 */

const NOTIF_MAX_ITEMS = 80;          // teto do histórico guardado
const NOTIF_RETENTION_DAYS = 60;     // aviso velho vira ruído
const NOTIF_BILL_DAYS = 3;           // "vence em até 3 dias" é acionável; 30 não é
const NOTIF_NETWORTH_DROP_PCT = 5;   // queda patrimonial que merece aviso
const NOTIF_BACKUP_MIN_TX = 15;      // abaixo disso, perder os dados custa pouco
const NOTIF_BACKUP_STALE_DAYS = 45;  // intervalo entre lembretes de backup

const NOTIF_GROUPS = [
  { id: "contas", label: "Contas e vencimentos", icon: "calendar" },
  { id: "dividas", label: "Dívidas", icon: "alertTriangle" },
  { id: "orcamento", label: "Orçamentos", icon: "pie" },
  { id: "assinaturas", label: "Assinaturas e recorrências", icon: "refresh" },
  { id: "metas", label: "Metas", icon: "target" },
  { id: "saldo", label: "Saldo e previsão", icon: "wallet" },
  { id: "patrimonio", label: "Patrimônio e reserva", icon: "shieldCheck" },
  { id: "conquistas", label: "Conquistas", icon: "star" },
  { id: "backup", label: "Backup e segurança dos dados", icon: "shieldCheck" },
];

const NOTIF_TONE_ORDER = { danger: 0, warn: 1, info: 2, positive: 3 };

function notifGroupMeta(id) {
  return NOTIF_GROUPS.find((g) => g.id === id) || { id, label: "Avisos", icon: "bell" };
}

function notifCandidate(o) {
  return {
    key: String(o.key).slice(0, 140),
    group: o.group,
    tone: o.tone || "info",
    icon: o.icon || "bell",
    title: o.title,
    message: o.message,
    tab: o.tab || "dashboard",
    amount: o.amount == null ? null : roundMoney(o.amount),
  };
}

/* ------------------------------------------------------------------ as regras */
// Cada regra recebe o mesmo contexto e devolve uma lista (possivelmente vazia).
// Assinatura uniforme para que a lista possa crescer sem tocar no orquestrador,
// e cada uma é isolada por try/catch no orquestrador: uma regra que estoure
// vira silêncio, não uma central quebrada.
const NOTIF_RULES = [
  // ---- Contas a vencer e contas atrasadas ----------------------------------
  {
    id: "contas",
    run({ data, today }) {
      const bills = upcomingBills(data, 30);
      const out = [];
      bills.items.forEach((b) => {
        if (b.kind === "late") {
          out.push(notifCandidate({
            key: `conta-atrasada:${b.id}:${b.date}`,
            group: "contas",
            tone: "danger",
            icon: "alertTriangle",
            title: "Conta em atraso",
            message: `${b.label} venceu em ${fmtDateShort(b.date)} e ainda não foi lançada. ${fmtBRL(b.amount)}.`,
            tab: "calendar",
            amount: b.amount,
          }));
          return;
        }
        if (b.daysLeft > NOTIF_BILL_DAYS) return;
        const quando = b.daysLeft <= 0 ? "hoje" : (b.daysLeft === 1 ? "amanhã" : `em ${b.daysLeft} dias`);
        out.push(notifCandidate({
          key: `conta:${b.id}:${b.date}`,
          group: "contas",
          tone: b.daysLeft <= 1 ? "warn" : "info",
          icon: "calendar",
          title: `Vence ${quando}`,
          message: `${b.label}. ${fmtBRL(b.amount)} em ${fmtDateShort(b.date)}.`,
          tab: "calendar",
          amount: b.amount,
        }));
      });
      // Evita que um mês cheio de parcelas gere vinte avisos de uma vez: os
      // mais próximos primeiro, teto de 5.
      return out
        .sort((a, b) => NOTIF_TONE_ORDER[a.tone] - NOTIF_TONE_ORDER[b.tone])
        .slice(0, 5)
        .map((c) => ({ ...c, createdAt: today }));
    },
  },

  // ---- Dívidas cadastradas: saldo desatualizado e parcela insuficiente ----
  {
    id: "dividas",
    run({ data, today }) {
      if (typeof buildDebtModel !== "function") return [];
      const model = buildDebtModel(data);
      const out = [];
      model.debts.forEach((debt) => {
        if (model.staleIds.includes(debt.id)) out.push(notifCandidate({
          key:`divida-saldo:${debt.id}:${today.slice(0,7)}`, group:"dividas", tone:"warn", icon:"refresh",
          title:"Saldo de dívida precisa ser conferido", message:`Confira o saldo atual de ${debt.name} no credor antes de confiar na projeção.`, tab:"debts", amount:debt.value,
        }));
        if (model.simulation.negativeAmortizationIds.includes(debt.id)) out.push(notifCandidate({
          key:`divida-amortizacao:${debt.id}:${today.slice(0,7)}`, group:"dividas", tone:"danger", icon:"alertTriangle",
          title:"Parcela pode não reduzir a dívida", message:`A parcela de ${debt.name} pode ser menor ou igual aos juros do mês.`, tab:"debts", amount:debt.monthlyPayment,
        }));
      });
      return out.slice(0,4);
    },
  },

  // ---- Orçamento estourado / em risco -------------------------------------
  {
    id: "orcamento",
    run({ data, monthKey }) {
      const status = computeBudgetStatus(data, monthKey);
      const out = [];
      status.items.forEach((it) => {
        if (it.level === "over") {
          out.push(notifCandidate({
            key: `orcamento:${it.id}:${monthKey}:over`,
            group: "orcamento",
            tone: "danger",
            icon: "alertTriangle",
            title: `Orçamento estourado em ${it.name}`,
            message: `${fmtBRL(it.spent)} de ${fmtBRL(it.budget)}. ${Math.round(it.pct)}% do teto do mês.`,
            tab: "settings",
            amount: it.spent,
          }));
        } else if (it.willExceed) {
          out.push(notifCandidate({
            key: `orcamento:${it.id}:${monthKey}:risco`,
            group: "orcamento",
            tone: "warn",
            icon: "trendUp",
            title: `${it.name} deve estourar o teto`,
            message: `No ritmo atual o mês fecha em ${fmtBRL(it.projected)}, acima dos ${fmtBRL(it.budget)} combinados.`,
            tab: "settings",
            amount: it.projected,
          }));
        }
      });
      return out.slice(0, 4);
    },
  },

  // ---- Assinaturas: reajuste, cobrança que parou e proposta de cadastro ----
  {
    id: "assinaturas",
    run({ data, monthKey, models }) {
      const rec = models.recurring || buildRecurringModel(data, { monthKey });
      const out = [];

      rec.increases.slice(0, 3).forEach((s) => {
        out.push(notifCandidate({
          key: `assinatura-reajuste:${s.key}:${monthKey}`,
          group: "assinaturas",
          tone: "warn",
          icon: "trendUp",
          title: `${s.name} ficou mais cara`,
          message: `Aumento de ${fmtNum(s.increasePct)}%. ${fmtBRL(s.increaseAnnualImpact)} a mais por ano se o preço se mantiver.`,
          tab: "subscriptions",
          amount: s.increaseAnnualImpact,
        }));
      });

      rec.ended.slice(0, 3).forEach((s) => {
        out.push(notifCandidate({
          key: `assinatura-parou:${s.key}`,
          group: "assinaturas",
          tone: "info",
          icon: "checkCircle",
          title: `${s.name} parou de cobrar`,
          message: `Sem cobrança desde ${fmtDateShort(s.lastDate)}. Saiu do total do mês; se voltar a aparecer, volta sozinha.`,
          tab: "subscriptions",
          amount: s.monthlyEquivalent,
        }));
      });

      (rec.proposals || []).slice(0, 2).forEach((p) => {
        out.push(notifCandidate({
          key: `recorrente-proposta:${p.key}`,
          group: "assinaturas",
          tone: "info",
          icon: "refresh",
          title: "Gasto recorrente detectado",
          message: `${p.pattern} · ${p.name}. ${fmtBRL(p.amount)}. Deseja cadastrar como gasto recorrente?`,
          tab: "subscriptions",
          amount: p.amount,
        }));
      });

      return out;
    },
  },

  // ---- Metas: atraso e conclusão ------------------------------------------
  {
    id: "metas",
    run({ data, monthKey, refDate }) {
      const gm = buildGoalsModel(data, refDate);
      const out = [];
      gm.goals.forEach((g) => {
        if (g.done) {
          out.push(notifCandidate({
            key: `meta-concluida:${g.id}`,
            group: "metas",
            tone: "positive",
            icon: "target",
            title: `Meta concluída: ${g.goal.name}`,
            message: `Você chegou aos ${fmtBRL(g.target)}. É o tipo de coisa que merece ser lembrada.`,
            tab: "goals",
            amount: g.target,
          }));
        } else if (g.status === "late") {
          out.push(notifCandidate({
            key: `meta-atrasada:${g.id}:${monthKey}`,
            group: "metas",
            tone: "warn",
            icon: "alertTriangle",
            title: `${g.goal.name} passou do prazo`,
            message: `Faltam ${fmtBRL(g.remaining)}. Vale rever o prazo ou o aporte mensal em vez de deixar a meta vencida.`,
            tab: "goals",
            amount: g.remaining,
          }));
        }
      });
      return out.slice(0, 4);
    },
  },

  // ---- Saldo projetado negativo -------------------------------------------
  {
    id: "saldo",
    run({ data, models }) {
      const fc = models.forecast || buildForecast(data);
      if (!fc.negativeDayIso) return [];
      const days = daysBetweenIso(fc.today, fc.negativeDayIso);
      if (days > 30) return [];   // além de 30 dias a previsão é média, não fato
      return [notifCandidate({
        key: `saldo-negativo:${fc.negativeDayIso}`,
        group: "saldo",
        tone: "danger",
        icon: "alertTriangle",
        title: "Saldo pode ficar negativo",
        message: `Pela previsão, o saldo cruza o zero em ${fmtDateFull(fc.negativeDayIso)}; daqui a ${days} ${days === 1 ? "dia" : "dias"}.`,
        tab: "calendar",
        amount: fc.lowest ? fc.lowest.value : null,
      })];
    },
  },

  // ---- Patrimônio e reserva -----------------------------------------------
  {
    id: "patrimonio",
    run({ data, monthKey }) {
      const out = [];
      const fund = emergencyFund(data);
      if (fund.target > 0 && moneyCompare(fund.current, fund.target) >= 0) {
        out.push(notifCandidate({
          key: `reserva-completa:${monthKey}`,
          group: "patrimonio",
          tone: "positive",
          icon: "shieldCheck",
          title: "Reserva de emergência completa",
          message: `Você alcançou ${fmtBRL(fund.current)}; os ${fund.targetMonths} ${fund.targetMonths === 1 ? "mês" : "meses"} de despesa que definiu como alvo.`,
          tab: "health",
          amount: fund.current,
        }));
      }

      const series = netWorthSeries(data, 3);
      if (series.length >= 2) {
        const last = series[series.length - 1];
        const prev = series[series.length - 2];
        if (prev.value > 0) {
          const dropPct = safePct(subMoney(prev.value, last.value), prev.value);
          if (moneyCompare(last.value, prev.value) < 0 && dropPct >= NOTIF_NETWORTH_DROP_PCT) {
            out.push(notifCandidate({
              key: `patrimonio-queda:${monthKey}`,
              group: "patrimonio",
              tone: "warn",
              icon: "arrowDownRight",
              title: "Patrimônio caiu no mês",
              message: `Queda de ${fmtNum(dropPct)}% em relação ao mês anterior (${fmtBRL(subMoney(prev.value, last.value))}).`,
              tab: "wealth",
              amount: subMoney(prev.value, last.value),
            }));
          }
        }
      }
      return out;
    },
  },

  // ---- Conquistas desbloqueadas hoje --------------------------------------
  // A fonte é o próprio registro gravado pelo Módulo 6 (`achievements.unlocked`
  // = { id: data }). A central não reavalia nenhuma regra de conquista: ela só
  // conta o que já foi desbloqueado.
  {
    id: "conquistas",
    run({ data, today }) {
      const unlocked = (data.achievements && data.achievements.unlocked) || {};
      const out = [];
      Object.keys(unlocked).forEach((id) => {
        if (unlocked[id] !== today) return;
        const def = typeof ACHIEVEMENTS !== "undefined"
          ? ACHIEVEMENTS.find((a) => a.id === id)
          : null;
        out.push(notifCandidate({
          key: `conquista:${id}`,
          group: "conquistas",
          tone: "positive",
          icon: def && def.icon ? def.icon : "star",
          title: `Conquista desbloqueada: ${def ? def.name : id}`,
          message: def && def.desc ? def.desc : "Uma nova medalha entrou na sua coleção.",
          tab: "achievements",
        }));
      });
      return out.slice(0, 5);
    },
  },

  // ---- Backup: o dado só existe neste aparelho ------------------------------
  // É o único aviso da central que não fala de dinheiro, e é o mais caro de
  // ignorar. Todo o resto do app é reconstituível a partir dos lançamentos; os
  // lançamentos, não. Limpar os dados do site, trocar de celular ou reinstalar
  // o navegador apaga tudo, e até aqui o único socorro era o usuário ter
  // lembrado sozinho de exportar.
  //
  // Dois portões para o aviso não virar ruído: só nasce quando há histórico que
  // valha a pena perder, e a chave carrega o mês, então ele se repete no
  // máximo uma vez por mês em vez de uma vez por render.
  {
    id: "backup",
    run({ data, today, monthKey }) {
      const txs = data.transactions || [];
      const temPatrimonio = (data.assets || []).length > 0 || (data.goals || []).length > 0;
      if (txs.length < NOTIF_BACKUP_MIN_TX && !temPatrimonio) return [];

      const last = data.lastBackupAt || null;

      if (!last) {
        return [notifCandidate({
          key: `backup:nunca:${monthKey}`,
          group: "backup",
          tone: "warn",
          icon: "shieldCheck",
          title: "Seus dados só existem neste aparelho",
          message: `${plural(txs.length, "lançamento", "lançamentos")} sem cópia. Trocar de celular ou limpar os dados do navegador apaga tudo. Exporte o backup em Ajustes.`,
          tab: "settings",
        })];
      }

      const dias = Math.floor((Date.parse(`${today}T12:00:00`) - Date.parse(`${last}T12:00:00`)) / 86400000);
      if (!Number.isFinite(dias) || dias < NOTIF_BACKUP_STALE_DAYS) return [];

      // Backup velho só incomoda se houve movimento depois dele. Quem parou de
      // usar o app não precisa de lembrete mensal para exportar o mesmo arquivo.
      const novos = txs.filter((t) => (t.createdAt || "").slice(0, 10) > last).length;
      if (novos === 0) return [];

      return [notifCandidate({
        key: `backup:desatualizado:${monthKey}`,
        group: "backup",
        tone: "info",
        icon: "shieldCheck",
        title: "Backup desatualizado",
        message: `Seu último backup é de ${dias} dias atrás e ${plural(novos, "lançamento entrou", "lançamentos entraram")} depois dele.`,
        tab: "settings",
      })];
    },
  },
];

// Monta as candidatas do momento. `opts.models` permite injetar modelos já
// calculados (o app memoiza forecast e recorrências por identidade do snapshot);
// sem injeção, cada regra calcula o seu.
function buildNotificationCandidates(data, opts) {
  const options = opts || {};
  const today = options.today || todayIso();
  const monthKey = options.monthKey || monthKeyOf(today);
  const refDate = options.refDate || new Date();
  const muted = (options.muted && typeof options.muted === "object") ? options.muted : {};
  const ctx = { data, today, monthKey, refDate, models: options.models || {} };

  const out = [];
  NOTIF_RULES.forEach((rule) => {
    if (muted[rule.id]) return;
    let list = [];
    try { list = rule.run(ctx) || []; }
    catch (error) {
      if (typeof reportSafeError === "function") reportSafeError("app", error, "notification_rule");
      list = [];
    }
    list.forEach((c) => { if (c && c.key && c.title) out.push(c); });
  });

  return out.sort((a, b) => NOTIF_TONE_ORDER[a.tone] - NOTIF_TONE_ORDER[b.tone]);
}

// Funde as candidatas ao estado guardado. PURA: devolve um estado novo e a
// lista do que nasceu agora; quem grava é o app.
//
// `silent` (primeiro boot) registra tudo já lido.
function syncNotificationState(current, candidates, opts) {
  const options = opts || {};
  const today = options.today || todayIso();
  const state = normalizeNotifications(current);
  const known = new Set(state.items.map((n) => n.key));

  const created = [];
  (candidates || []).forEach((c) => {
    if (!c || !c.key || known.has(c.key)) return;
    known.add(c.key);
    created.push({
      id: uid(),
      key: c.key,
      group: c.group || "contas",
      tone: c.tone || "info",
      icon: c.icon || "bell",
      title: String(c.title).slice(0, 120),
      message: String(c.message || "").slice(0, 300),
      tab: c.tab || "dashboard",
      amount: c.amount == null ? null : roundMoney(c.amount),
      createdAt: c.createdAt || today,
      readAt: options.silent ? today : null,
    });
  });

  const cutoff = isoOfDate(new Date(dateFromIso(today).getTime() - NOTIF_RETENTION_DAYS * 86400000));
  const items = created.concat(state.items)
    .filter((n) => n.createdAt >= cutoff)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : NOTIF_TONE_ORDER[a.tone] - NOTIF_TONE_ORDER[b.tone]))
    .slice(0, NOTIF_MAX_ITEMS);

  return {
    state: { items, muted: { ...state.muted }, lastSyncAt: today, initialized: true },
    created: created.filter((n) => !n.readAt),
  };
}

function markNotificationRead(current, id, todayIsoStr) {
  const state = normalizeNotifications(current);
  const today = todayIsoStr || todayIso();
  return {
    ...state,
    items: state.items.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: today } : n)),
  };
}

function markAllNotificationsRead(current, todayIsoStr) {
  const state = normalizeNotifications(current);
  const today = todayIsoStr || todayIso();
  return { ...state, items: state.items.map((n) => (n.readAt ? n : { ...n, readAt: today })) };
}

function removeNotification(current, id) {
  const state = normalizeNotifications(current);
  return { ...state, items: state.items.filter((n) => n.id !== id) };
}

// Limpa só o que já foi lido: o não lido é justamente o que o usuário ainda não
// viu, e apagá-lo junto seria esconder informação em vez de organizar.
function clearReadNotifications(current) {
  const state = normalizeNotifications(current);
  return { ...state, items: state.items.filter((n) => !n.readAt) };
}

function setNotificationGroupMuted(current, group, muted) {
  const state = normalizeNotifications(current);
  const next = { ...state.muted };
  if (muted) next[group] = todayIso();
  else delete next[group];
  return { ...state, muted: next };
}

function notificationCounts(current) {
  const state = normalizeNotifications(current);
  const byGroup = {};
  let unread = 0;
  let urgent = 0;
  state.items.forEach((n) => {
    byGroup[n.group] = (byGroup[n.group] || 0) + 1;
    if (!n.readAt) {
      unread++;
      if (n.tone === "danger") urgent++;
    }
  });
  return { total: state.items.length, unread, urgent, byGroup };
}

// Modelo de leitura da tela: agrupado por período, já com o rótulo pronto.

function buildNotificationsModel(current, opts) {
  const options = opts || {};
  const state = normalizeNotifications(current);
  const today = options.today || todayIso();
  const filter = options.filter || "all";

  const visible = state.items.filter((n) => {
    if (filter === "unread") return !n.readAt;
    if (filter === "all") return true;
    return n.group === filter;
  });

  const yesterday = isoOfDate(new Date(dateFromIso(today).getTime() - 86400000));
  const buckets = [
    { id: "hoje", label: "Hoje", items: [] },
    { id: "ontem", label: "Ontem", items: [] },
    { id: "antes", label: "Anteriores", items: [] },
  ];
  visible.forEach((n) => {
    const b = n.createdAt >= today ? buckets[0] : (n.createdAt === yesterday ? buckets[1] : buckets[2]);
    b.items.push({ ...n, groupLabel: notifGroupMeta(n.group).label, dateLabel: fmtDateShort(n.createdAt) });
  });

  return {
    filter,
    counts: notificationCounts(state),
    groups: NOTIF_GROUPS.map((g) => ({
      ...g,
      muted: !!state.muted[g.id],
      count: state.items.filter((n) => n.group === g.id).length,
    })),
    buckets: buckets.filter((b) => b.items.length > 0),
    hasAny: state.items.length > 0,
    visibleCount: visible.length,
    lastSyncAt: state.lastSyncAt,
  };
}

const NotificationService = {
  groups: NOTIF_GROUPS,
  build: buildNotificationCandidates,
  sync: syncNotificationState,
  model: buildNotificationsModel,
  counts: notificationCounts,
  markRead: markNotificationRead,
  markAllRead: markAllNotificationsRead,
  remove: removeNotification,
  clearRead: clearReadNotifications,
  setMuted: setNotificationGroupMuted,
};

/* ==============================================================================
 * 4. REGISTRO
 * ==============================================================================
 * Um endereço único para a camada de serviços. A UI conversa com `Services.x`;
 * os motores continuam acessíveis diretamente para quem já os usava; nada foi
 * removido nem renomeado.
 */
const Services = {
  bus: EventBus,
  finance: FinanceService,
  budget: BudgetService,
  investment: InvestmentService,
  analytics: AnalyticsService,
  insight: InsightService,
  notification: NotificationService,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    EventBus, APP_EVENTS, Services,
    FinanceService, BudgetService, InvestmentService, AnalyticsService, InsightService, NotificationService,
    buildNotificationCandidates, syncNotificationState, buildNotificationsModel,
    notificationCounts, markNotificationRead, markAllNotificationsRead,
    removeNotification, clearReadNotifications, setNotificationGroupMuted,
    NOTIF_GROUPS,
  };
}
