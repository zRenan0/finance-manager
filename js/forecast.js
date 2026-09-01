// forecast.js. PREVISÃO FINANCEIRA (motor puro, sem DOM, sem rede)  [Módulo 4]
// ------------------------------------------------------------------------------
// Responsabilidade única: dado o snapshot, dizer **quanto o usuário deve ter no
// bolso em 7, 30, 90 e 365 dias**; e em que dia o saldo fica negativo, se ficar.
//
// Duas funções públicas:
//   buildFutureEvents(data, deIso, ateIso)  → eventos futuros datados (usado
//                                             também pelo Calendário)
//   buildForecast(data, refIso)             → saldo dia a dia + horizontes
//
// ------------------------------------------------------------------------------
// O PROBLEMA DIFÍCIL DESTE MÓDULO: CONTAR O MESMO COMPROMISSO DUAS VEZES
// ------------------------------------------------------------------------------
// A mesma saída de dinheiro pode chegar por até quatro caminhos diferentes:
//   1; lançamento futuro já cadastrado (parcela do cartão, conta agendada);
//   2; gasto fixo do mês anterior, projetado para este mês;
//   3; parcela de um financiamento cadastrado em Patrimônio;
//   4; a média de gastos variáveis dos últimos meses.
// Somar os quatro produz uma previsão catastrófica e inútil. As defesas:
//   • (2) só é projetado no mês em que NÃO existe lançamento equivalente
//     (mesma categoria + mesma descrição); a mesma regra do banner de gastos fixos;
//   • (3) só entra quando não há, no mesmo mês, um fixo ou uma parcela de valor
//     equivalente (±5%); a parcela do financiamento normalmente JÁ é um dos dois;
//   • (4) exclui do cálculo tudo que é recorrente, parcelado ou aporte em meta,
//     justamente porque esses já entram por (1), (2) e (3);
//   • no mês corrente, (4) considera só o que ainda FALTA gastar da média, não a
//     média inteira; senão o mês em curso seria cobrado duas vezes.
"use strict";

const FORECAST_MAX_DAYS = 366;
const FORECAST_BASELINE_MONTHS = 3;   // janela da média de gastos variáveis
const FORECAST_DUP_TOLERANCE = 0.05;  // 5%; proximidade que caracteriza o mesmo compromisso

const FORECAST_HORIZONS = [
  { id: "7d",  days: 7,   label: "7 dias",   confidence: "alta" },
  { id: "30d", days: 30,  label: "30 dias",  confidence: "alta" },
  { id: "3m",  days: 91,  label: "3 meses",  confidence: "média" },
  { id: "12m", days: 365, label: "12 meses", confidence: "baixa" },
];

/* ==============================================================================
 * BASE DE PROJEÇÃO
 * ============================================================================== */

// Modelos de gasto fixo: o último lançamento recorrente de cada
// "categoria + descrição" nos últimos meses. É o mesmo critério de identidade
// usado por `getPendingRecurring`, para as duas telas nunca discordarem.
function recurringTemplates(data, refIso) {
  const from = addMonthsToIso(monthKeyOf(refIso) + "-01", -FORECAST_BASELINE_MONTHS);
  const byKey = new Map();
  (data.transactions || []).forEach((t) => {
    if (!t.recurring) return;
    if (t.date < from) return;
    const key = `${t.type}|${t.categoryId}|${normalizeText(t.description)}`;
    const prev = byKey.get(key);
    if (!prev || t.date > prev.date) byKey.set(key, t);
  });
  return [...byKey.entries()].map(([key, t]) => ({
    key,
    identity: `${t.categoryId}|${t.description || ""}`,
    type: t.type,
    amount: roundMoney(t.amount),
    day: Number(String(t.date).slice(8, 10)) || 1,
    categoryId: t.categoryId,
    description: t.description || "",
  }));
}

// Dia do mês em que a renda costuma cair. Moda dos lançamentos de receita; sem
// histórico, dia 5 (o mais comum no país).
function incomeDayOf(data) {
  const counts = new Map();
  (data.transactions || []).forEach((t) => {
    if (t.type !== "income") return;
    const day = Number(String(t.date).slice(8, 10)) || 1;
    counts.set(day, (counts.get(day) || 0) + 1);
  });
  let best = 5, bestN = 0;
  counts.forEach((n, day) => { if (n > bestN) { bestN = n; best = day; } });
  return best;
}

// Transferência entre contas próprias não é gasto: a perna de saída tem uma
// perna de entrada do mesmo valor, e o caixa somado das contas não se move.
// Contá-la aqui inflava a média de gastos variáveis (e, por tabela, a projeção
// de fechamento) sem que a entrada correspondente compensasse, porque a
// baseline só olha a ponta de despesa. Bases antigas gravavam a transferência
// como lançamento; hoje ela é uma entidade própria (`accountTransfers`).
function isTransferTx(t) {
  if (!t) return false;
  const nature = t.nature || (typeof deriveTransactionNature === "function" ? deriveTransactionNature(t) : "");
  return nature === "transferencia";
}

// Média mensal dos gastos que NÃO chegam por outro caminho da projeção.

function variableBaseline(data, refIso) {
  const currentKey = monthKeyOf(refIso);
  const keys = [];
  for (let i = 1; i <= FORECAST_BASELINE_MONTHS; i++) keys.push(monthKeyOf(addMonthsToIso(currentKey + "-01", -i)));

  let activeMonths = 0, cents = 0;
  keys.forEach((key) => {
    const tx = txForMonth(data, key);
    if (tx.length === 0) return;
    activeMonths++;
    tx.forEach((t) => {
      if (t.type !== "expense") return;
      if (t.recurring || t.installmentGroupId || t.goalId) return;
      if (isTransferTx(t)) return;
      cents += moneyToCents(t.amount);
    });
  });
  if (activeMonths === 0) return { monthly: 0, months: 0 };
  return { monthly: moneyFromCents(Math.round(cents / activeMonths)), months: activeMonths };
}

// Quanto já foi gasto neste mês dentro do conceito "variável" acima.

function variableSpentInMonth(data, monthKey) {
  let cents = 0;
  realizedTxForMonth(data, monthKey).forEach((t) => {
    if (t.type !== "expense") return;
    if (t.recurring || t.installmentGroupId || t.goalId) return;
    if (isTransferTx(t)) return;
    cents += moneyToCents(t.amount);
  });
  return moneyFromCents(cents);
}

/* ==============================================================================
 * EVENTOS FUTUROS DATADOS
 * ============================================================================== */

function isoAtDayOf(monthKey, day) {
  const [y, m] = monthKey.split("-").map(Number);
  const dim = daysInMonthOf(y, m - 1);
  return `${monthKey}-${String(Math.min(Math.max(1, day), dim)).padStart(2, "0")}`;
}

function monthKeysBetween(fromIso, toIso) {
  const out = [];
  let key = monthKeyOf(fromIso);
  const last = monthKeyOf(toIso);
  let guard = 0;
  while (key <= last && guard++ < 400) {
    out.push(key);
    key = monthKeyOf(addMonthsToIso(key + "-01", 1));
  }
  return out;
}

// Já existe, neste mês, um compromisso de valor equivalente? É o que impede a
// parcela do financiamento de ser contada em cima do gasto fixo homônimo.
function hasEquivalentCommitment(list, amount) {
  const target = moneyToCents(amount);
  if (target <= 0) return false;
  const tolerance = Math.max(100, Math.round(target * FORECAST_DUP_TOLERANCE));
  return list.some((e) => e.type === "expense" && Math.abs(moneyToCents(e.amount) - target) <= tolerance);
}

// Todos os eventos previstos entre duas datas (exclusive `fromIso`, inclusive `toIso`).
// `fromIso` é normalmente hoje: o que já aconteceu não é previsão, é fato.
function buildFutureEvents(data, fromIso, toIso) {
  if (!fromIso || !toIso || toIso <= fromIso) return [];
  const events = [];
  const push = (e) => { events.push(e); return e; };

  // ---- 1. Lançamentos já cadastrados com data futura (fato, não estimativa) ----
  (data.transactions || []).forEach((t) => {
    if (t.date <= fromIso || t.date > toIso) return;
    const cat = categoryById(data, t.categoryId);
    push({
      id: `tx-${t.id}`,
      iso: t.date,
      type: t.type,
      amount: roundMoney(t.amount),
      label: t.description || cat.name,
      categoryName: cat.name,
      color: cat.color,
      icon: cat.icon,
      kind: t.installmentTotal ? "installment" : (t.goalId ? "goal" : "scheduled"),
      installment: t.installmentTotal ? `${t.installmentIndex}/${t.installmentTotal}` : null,
      certain: true,
      // Compra no crédito é consumo nesta data, mas o dinheiro sai no
      // vencimento da fatura; buildForecast adiciona essa saída separadamente.
      cashEffect: !t.creditCardId,
    });
  });

  const months = monthKeysBetween(fromIso, toIso);

  // Identidades já lançadas em cada mês; um fixo não é projetado onde já existe.

  const loggedIdentities = new Map();
  (data.transactions || []).forEach((t) => {
    const key = t.monthKey || monthKeyOf(t.date);
    let set = loggedIdentities.get(key);
    if (!set) { set = new Set(); loggedIdentities.set(key, set); }
    set.add(`${t.categoryId}|${t.description || ""}`);
  });

  // ---- 2. Gastos e receitas fixas projetados ----
  const templates = recurringTemplates(data, fromIso);
  months.forEach((key) => {
    const logged = loggedIdentities.get(key) || new Set();
    templates.forEach((tpl) => {
      if (logged.has(tpl.identity)) return;
      const iso = isoAtDayOf(key, tpl.day);
      if (iso <= fromIso || iso > toIso) return;
      const cat = categoryById(data, tpl.categoryId);
      push({
        id: `rec-${key}-${tpl.key}`,
        iso,
        type: tpl.type,
        amount: tpl.amount,
        label: tpl.description || cat.name,
        categoryName: cat.name,
        color: cat.color,
        icon: cat.icon,
        kind: "recurring",
        installment: null,
        certain: false,
      });
    });
  });

  // ---- 3. Renda fixa nos meses que ainda não têm receita lançada ----
  const monthlyIncome = roundMoney(data.monthlyIncome || 0);
  if (monthlyIncome > 0) {
    const day = incomeDayOf(data);
    const incomeMonths = new Set();
    (data.transactions || []).forEach((t) => {
      if (t.type === "income" && !t.goalId) incomeMonths.add(t.monthKey || monthKeyOf(t.date));
    });
    months.forEach((key) => {
      if (incomeMonths.has(key)) return;                    // já recebeu (ou já lançou) neste mês
      if (templates.some((tpl) => tpl.type === "income")) return;  // já projetado como receita fixa
      const iso = isoAtDayOf(key, day);
      if (iso <= fromIso || iso > toIso) return;
      push({
        id: `inc-${key}`,
        iso,
        type: "income",
        amount: monthlyIncome,
        label: "Renda mensal",
        categoryName: "Renda",
        color: "var(--positive)",
        icon: "briefcase",
        kind: "income",
        installment: null,
        certain: false,
      });
    });
  }

  // ---- 4. Parcelas de dívidas cadastradas (só com dia informado e sem sósia) ----
  const liabilities = typeof countedLiabilities === "function" ? countedLiabilities(data) : [];
  liabilities.forEach((a) => {
    if (!(a.monthlyPayment > 0) || !a.dueDay) return;
    months.forEach((key) => {
      const iso = isoAtDayOf(key, a.dueDay);
      if (iso <= fromIso || iso > toIso) return;
      const sameMonth = events.filter((e) => monthKeyOf(e.iso) === key);
      if (hasEquivalentCommitment(sameMonth, a.monthlyPayment)) return;   // já contado por outro caminho
      push({
        id: `liab-${a.id}-${key}`,
        iso,
        type: "expense",
        amount: roundMoney(a.monthlyPayment),
        label: a.name,
        categoryName: "Dívidas",
        color: "var(--negative)",
        icon: "alertTriangle",
        kind: "liability",
        installment: null,
        certain: false,
      });
    });
  });

  // ---- 5. Prazos de metas (marcador, sem valor no fluxo) ----
  (data.goals || []).forEach((g) => {
    if (!g.deadline || g.deadline <= fromIso || g.deadline > toIso) return;
    push({
      id: `goal-${g.id}`,
      iso: g.deadline,
      type: "marker",
      amount: 0,
      label: `Prazo: ${g.name}`,
      categoryName: "Meta",
      color: "var(--goal)",
      icon: g.icon || "target",
      kind: "goal-deadline",
      installment: null,
      certain: true,
      meta: { goalId: g.id, remaining: Math.max(0, subMoney(g.target, g.current)) },
    });
  });

  events.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
  return events;
}

/* ==============================================================================
 * SALDO DIA A DIA
 * ============================================================================== */

function buildForecast(data, refIso) {
  const today = refIso || todayIso();
  const start = roundMoney(realizedBalance(data));
  const endIso = isoOfDate(new Date(dateFromIso(today).getTime() + FORECAST_MAX_DAYS * 86400000));
  const events = buildFutureEvents(data, today, endIso);

  // Faturas conhecidas entram no caixa no vencimento. Se já venceram, entram
  // no primeiro dia da projeção, pois seguem como compromisso em aberto.
  if (typeof cardStatements === "function") {
    const tomorrow = isoOfDate(new Date(dateFromIso(today).getTime() + 86400000));
    (data.creditCards || []).forEach((card) => {
      cardStatements(data, card.id).forEach((statement) => {
        if (!(statement.outstanding > 0)) return;
        const overdue = statement.dueDate <= today;
        const iso = overdue ? tomorrow : statement.dueDate;
        if (iso > endIso) return;
        events.push({
          id: `card-statement-${card.id}-${statement.key}`,
          iso,
          type: "expense",
          amount: statement.outstanding,
          label: `Fatura ${card.name}`,
          categoryName: "Cartões",
          color: "var(--negative)",
          icon: "creditCard",
          kind: "card-statement",
          installment: null,
          certain: true,
          cashEffect: true,
          meta: { creditCardId: card.id, statementKey: statement.key, dueDate: statement.dueDate, overdue },
        });
      });
    });
    events.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
  }

  const byDay = new Map();
  events.forEach((e) => {
    if (e.type === "marker" || e.cashEffect === false) return;
    let row = byDay.get(e.iso);
    if (!row) { row = { income: 0, expense: 0 }; byDay.set(e.iso, row); }
    if (e.type === "income") row.income += moneyToCents(e.amount);
    else row.expense += moneyToCents(e.amount);
  });

  // Média de gastos variáveis, diluída por dia. No mês corrente só o que falta.

  const baseline = variableBaseline(data, today);
  const currentKey = monthKeyOf(today);
  const spentSoFar = variableSpentInMonth(data, currentKey);
  const remainingCurrent = Math.max(0, moneyToCents(baseline.monthly) - moneyToCents(spentSoFar));
  const [cy, cm] = currentKey.split("-").map(Number);
  const daysLeftInMonth = Math.max(1, daysInMonthOf(cy, cm - 1) - Number(today.slice(8, 10)));
  const dailyCurrent = Math.round(remainingCurrent / daysLeftInMonth);

  const days = [];
  let balanceC = moneyToCents(start);
  let lowest = { iso: today, value: start };
  let negativeDayIso = null;
  const cursor = dateFromIso(today);

  for (let i = 1; i <= FORECAST_MAX_DAYS; i++) {
    cursor.setDate(cursor.getDate() + 1);
    const iso = isoOfDate(cursor);
    const key = monthKeyOf(iso);
    const row = byDay.get(iso) || { income: 0, expense: 0 };

    const dim = daysInMonthOf(cursor.getFullYear(), cursor.getMonth());
    const variableC = key === currentKey ? dailyCurrent : Math.round(moneyToCents(baseline.monthly) / dim);

    const deltaC = row.income - row.expense - variableC;
    balanceC += deltaC;
    const balance = moneyFromCents(balanceC);
    days.push({ iso, income: moneyFromCents(row.income), expense: moneyFromCents(row.expense + variableC), balance });
    if (balanceC < moneyToCents(lowest.value)) lowest = { iso, value: balance };
    if (balanceC < 0 && !negativeDayIso) negativeDayIso = iso;
  }

  const horizons = FORECAST_HORIZONS.map((h) => {
    const slice = days.slice(0, h.days);
    const last = slice[slice.length - 1];
    const income = sumMoney(slice, (d) => d.income);
    const expense = sumMoney(slice, (d) => d.expense);
    const projected = last ? last.balance : start;
    return {
      ...h,
      endIso: last ? last.iso : today,
      income, expense,
      net: subMoney(income, expense),
      projected,
      delta: subMoney(projected, start),
      tone: projected < 0 ? "danger" : (moneyCompare(projected, start) >= 0 ? "positive" : "warn"),
    };
  });

  return {
    today,
    balance: start,
    days,
    events,
    horizons,
    lowest,
    negativeDayIso,
    baseline: { monthly: baseline.monthly, months: baseline.months, remainingCurrentMonth: moneyFromCents(remainingCurrent) },
    assumptions: forecastAssumptions(data, baseline, events),
  };
}

// ------------------------------------------------------------------------------
// [M29] O FECHAMENTO DO MÊS, EM QUATRO PARCELAS
// ------------------------------------------------------------------------------
// `buildForecast` já produz o saldo dia a dia até o fim do horizonte, e a tela
// mostrava o resultado. O que faltava era a CONTA: de onde sai o saldo do dia
// 30. Um número projetado que ninguém consegue reconstruir é um palpite com
// tipografia bonita.
//
// A cadeia é a do roteiro:
//
//   saldo atual
//   + receitas previstas do que falta do mês
//   - contas previstas (fixas, parcelas, faturas)
//   - gastos variáveis ainda esperados
//   = saldo projetado no fim do mês
//
// AS PARTES SÃO LIDAS DO MESMO LUGAR QUE PRODUZ O RESULTADO. Nada é recalculado
// por outro caminho: as três primeiras vêm dos eventos com efeito de caixa até
// o último dia do mês, e a quarta é `baseline.remainingCurrentMonth`, que já
// exclui recorrente, parcelado e aporte justamente para não contar duas vezes.
// Por isso a soma das partes bate com o saldo do último dia; o teste do M29
// trava essa igualdade, que é a única forma de a explicação não mentir.
function monthCloseForecast(forecast) {
  if (!forecast || !Array.isArray(forecast.days) || forecast.days.length === 0) return null;
  const hoje = forecast.today;
  const mKey = String(hoje).slice(0, 7);
  const doMes = forecast.days.filter((d) => String(d.iso).slice(0, 7) === mKey);
  if (doMes.length === 0) return null;
  const ultimo = doMes[doMes.length - 1];

  const ateOFim = (forecast.events || []).filter((e) => e.cashEffect !== false && e.iso <= ultimo.iso);
  const receitas = sumMoney(ateOFim.filter((e) => e.type === "income"), (e) => e.amount);
  const contas = sumMoney(ateOFim.filter((e) => e.type !== "income"), (e) => e.amount);
  const variaveis = roundMoney((forecast.baseline && forecast.baseline.remainingCurrentMonth) || 0);

  const saldoAtual = roundMoney(forecast.balance);

  // O NÚMERO MOSTRADO É O DA PRÓPRIA CONTA, NÃO O DA CAMINHADA DIÁRIA.
  //
  // As duas rotas chegam ao mesmo lugar, mas não ao mesmo centavo: a caminhada
  // dia a dia arredonda a cada passo e a soma das parcelas arredonda uma vez.
  // No conjunto da demonstração a diferença é de três centavos.
  //
  // Três centavos não mudam decisão nenhuma, mas uma conta escrita na tela que
  // não fecha destrói a confiança no resto do cartão. Então o card exibe o
  // resultado da SOMA que ele mostra, e a caminhada fica ao lado como
  // conferência: `divergencia` existe para o teste travar que as duas rotas
  // continuam concordando, e não para aparecer na tela.
  const projetado = roundMoney(subMoney(subMoney(addMoney(saldoAtual, receitas), contas), variaveis));
  const projetadoDiario = roundMoney(ultimo.balance);

  // O PIOR DIA, NÃO O ÚLTIMO. Fechar o mês positivo não ajuda quem fica no
  // vermelho no dia 18 e volta ao azul quando o salário cai no dia 30. A margem
  // de segurança é a distância do fundo do poço até zero.
  const fundo = doMes.reduce((min, d) => (moneyCompare(d.balance, min.balance) < 0 ? d : min), doMes[0]);
  // Quando o pior dia É o último, a margem e o saldo projetado são a mesma
  // coisa e precisam ser o MESMO número na tela. Vindo de rotas diferentes,
  // eles diferem por centavos de arredondamento, e dois valores quase iguais
  // lado a lado leem como erro de cálculo.
  const margem = fundo.iso === ultimo.iso ? projetado : roundMoney(fundo.balance);
  const diaNegativo = doMes.find((d) => d.balance < 0) || null;

  return {
    monthKey: mKey,
    endIso: ultimo.iso,
    saldoAtual,
    receitas,
    contas,
    variaveis,
    projetado,
    projetadoDiario,
    divergencia: roundMoney(subMoney(projetado, projetadoDiario)),
    // Quanto sobra de folga no pior momento do mês. Negativa = falta caixa.
    margem,
    fundoIso: fundo.iso,
    risco: !!diaNegativo,
    riscoIso: diaNegativo ? diaNegativo.iso : null,
    // Só as duas primeiras parcelas são compromissos conhecidos; a terceira é
    // estimativa por média. A tela precisa dizer isso.
    estimado: variaveis,
  };
}

// ------------------------------------------------------------------------------
// [M30] LIMITE DIÁRIO, A PARTIR DE UMA META E NÃO DA RENDA
// ------------------------------------------------------------------------------
// O app já tinha um teto diário: renda menos gasto, dividido pelos dias que
// faltam. Ele responde "quanto ainda cabe na renda", que é pergunta diferente e
// mais frouxa: gastar tudo o que cabe na renda é terminar o mês em zero, com a
// meta de guardar sacrificada por último.
//
// Este parte do outro lado. Fixa quanto a pessoa QUER que sobre, tira isso do
// caixa junto com os compromissos já conhecidos, e divide o que resta pelos
// dias que faltam. É a conta do roteiro: "para terminar o mês com R$ 800
// disponíveis, o variável restante dá cerca de R$ 47 por dia".
//
// DE ONDE SAI A META, e por que não é campo novo:
//   1. a soma do aporte mensal planejado das metas, compromisso que a pessoa já
//      escreveu no app;
//   2. sem metas com plano, a fatia "futuro" da regra de orçamento dela.
// Pedir mais um número seria pedir de novo o que já foi dito.
//
// E é REFERÊNCIA, não obrigação: quem gastar acima num dia continua com o app
// funcionando, e a tela diz isso.
function savingTargetOf(data) {
  const metas = (data.goals || []).reduce((soma, g) => addMoney(soma, Math.max(0, roundMoney(g.monthlyPlan))), 0);
  if (metas > 0) return { value: metas, source: "metas" };
  const renda = roundMoney((data && data.monthlyIncome) || 0);
  const pct = Number((data && data.budgetSplit && data.budgetSplit.futuro) || 0);
  if (renda > 0 && pct > 0) return { value: mulMoney(renda, pct / 100), source: "regra" };
  return { value: 0, source: "nenhuma" };
}

function dailyAllowance(data, forecast) {
  const close = monthCloseForecast(forecast);
  if (!close) return null;

  const hoje = dateFromIso(forecast.today);
  const fim = dateFromIso(close.endIso);
  const diasRestantes = Math.max(1, Math.round((fim - hoje) / 86400000) + 1);

  const alvo = savingTargetOf(data);
  // O que sobra para gasto variável depois de honrar compromissos e a meta.
  // `contas` já traz fixas, parcelas e faturas com data; nada é contado duas
  // vezes porque a ESTIMATIVA de variável não entra aqui: ela é justamente o
  // que este número substitui por uma decisão.
  const disponivel = subMoney(subMoney(addMoney(close.saldoAtual, close.receitas), close.contas), alvo.value);
  const porDia = disponivel > 0 ? divMoney(disponivel, diasRestantes) : 0;

  return {
    endIso: close.endIso,
    diasRestantes,
    alvo: alvo.value,
    alvoFonte: alvo.source,
    disponivel: roundMoney(disponivel),
    porDia: roundMoney(porDia),
    // Sem folga o número vira zero, e dizer "R$ 0,00 por dia" sem explicar por
    // que seria pior que não dizer nada.
    apertado: disponivel <= 0,
    // Para a frase não sair no vácuo: dá para comparar com o que vinha sendo
    // gasto em variável.
    estimativaVariavel: close.variaveis,
  };
}

// Um número projetado sem a premissa ao lado é chute. Estas frases são a
// prestação de contas do cálculo acima.
function forecastAssumptions(data, baseline, events) {
  const out = [];
  const recurring = events.filter((e) => e.kind === "recurring").length;
  const scheduled = events.filter((e) => e.kind === "scheduled" || e.kind === "installment").length;
  const statements = events.filter((e) => e.kind === "card-statement").length;

  if (scheduled > 0) out.push(`${scheduled} ${scheduled === 1 ? "lançamento futuro já cadastrado" : "lançamentos futuros já cadastrados"} (parcelas e contas agendadas).`);
  if (statements > 0) out.push(`${statements} ${statements === 1 ? "fatura conhecida descontada" : "faturas conhecidas descontadas"} na data de vencimento, sem repetir as compras.`);
  if (recurring > 0) out.push(`Gastos fixos repetidos nos meses em que ainda não foram lançados.`);
  if (baseline.monthly > 0) out.push(`Gastos variáveis pela média de ${baseline.months} ${baseline.months === 1 ? "mês" : "meses"}: ${fmtBRL(baseline.monthly)}/mês.`);
  else out.push("Sem histórico suficiente para estimar gastos variáveis; a projeção considera só o que está cadastrado.");
  if (roundMoney(data.monthlyIncome || 0) > 0) out.push(`Renda mensal de ${fmtBRL(data.monthlyIncome)} nos meses ainda não recebidos.`);
  else out.push("Renda mensal não informada em Ajustes; entradas futuras contam só o que estiver lançado.");
  out.push("Parcela de dívida cadastrada só entra quando não há um gasto fixo de valor equivalente no mesmo mês.");
  return out;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildForecast, buildFutureEvents, recurringTemplates, variableBaseline, FORECAST_HORIZONS };
}
