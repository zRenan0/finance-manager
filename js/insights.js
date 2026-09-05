// insights.js; inteligência local em JS puro: simulador "E se...?",
// detector de vazamentos silenciosos e projeção preditiva de fluxo de caixa (regressão linear).
"use strict";

// ------------------------------------------------------------------
// Simulador de impacto "E se...?"
// Recalcula, sem gravar nada, o efeito de uma despesa hipotética no
// orçamento diário restante do mês e no prazo de uma meta (se escolhida).
// ------------------------------------------------------------------
// ------------------------------------------------------------------------------
// [M31] "POSSO COMPRAR?" - O QUE FALTAVA NA RESPOSTA
// ------------------------------------------------------------------------------
// O simulador já respondia em orçamento DIÁRIO, e diário é a unidade errada
// para decidir uma compra grande: ninguém pensa "posso trocar R$ 12 por dia por
// um notebook". A pergunta é mensal, e a resposta precisa das três leituras que
// mudam a decisão: quanto sobra por mês antes e depois, quanto da renda passa a
// estar comprometido com parcelas, e se a reserva é atingida.
//
// A régua da parcela existente sai do que já está cadastrado em Patrimônio como
// dívida com parcela mensal. Nada é estimado: se a pessoa não cadastrou, o
// comprometimento "antes" é zero e a tela diz de onde veio.
function monthlyDebtCommitment(data) {
  return (data.assets || [])
    .filter((a) => a.kind === "liability" && a.debtStatus !== "paid")
    .reduce((soma, a) => addMoney(soma, Math.max(0, roundMoney(a.monthlyPayment))), 0);
}

// A reserva é atingida quando pagar a compra exige encostar no dinheiro que
// está reservado para emergência. Para o parcelado, o gatilho é outro: a sobra
// mensal virar negativa significa que a parcela sai da reserva todo mês.
function reserveImpactOf(data, cashNow, monthlyAfter) {
  const fundo = typeof emergencyFund === "function" ? emergencyFund(data) : null;
  const reserva = fundo ? roundMoney(fundo.current) : 0;
  const caixa = typeof realizedBalance === "function" ? roundMoney(realizedBalance(data)) : 0;
  if (reserva <= 0) return { reserve: 0, affected: false, reason: "sem-reserva" };
  if (cashNow > 0 && subMoney(caixa, cashNow) < reserva) {
    return { reserve: reserva, affected: true, reason: "caixa" };
  }
  if (monthlyAfter != null && monthlyAfter < 0) {
    return { reserve: reserva, affected: true, reason: "sobra-negativa" };
  }
  return { reserve: reserva, affected: false, reason: "preservada" };
}

function simulateExpenseImpact(data, hypotheticalAmount, goalId) {
  const now = new Date();
  const mKey = keyOfDate(now);
  const { expense: monthExpense } = realizedMonthTotals(data, mKey);
  const income = effectiveIncome(data, mKey);
  const dayOfMonth = now.getDate();
  const dim = daysInMonthOf(now.getFullYear(), now.getMonth());
  const daysLeft = Math.max(1, dim - dayOfMonth + 1);

  const beforeRemaining = subMoney(income, monthExpense);
  const afterRemaining = subMoney(income, addMoney(monthExpense, hypotheticalAmount));
  const dailyBefore = beforeRemaining > 0 ? divMoney(beforeRemaining, daysLeft) : 0;
  const dailyAfter = afterRemaining > 0 ? divMoney(afterRemaining, daysLeft) : 0;

  let goalDelay = null;
  if (goalId) {
    const goal = data.goals.find((g) => g.id === goalId);
    if (goal && goal.target > 0) {
      // Estima o ritmo médio de aportes mensais nos últimos meses para prever atraso.
      const avgMonthlyContribution = estimateAvgMonthlySaving(data) || (goal.target - goal.current) / 6 || 1;
      const remainingToGoal = Math.max(0, subMoney(goal.target, goal.current));
      const monthsNeededBefore = avgMonthlyContribution > 0 ? remainingToGoal / avgMonthlyContribution : null;
      const reducedCapacity = subMoney(avgMonthlyContribution, hypotheticalAmount);
      if (reducedCapacity <= avgMonthlyContribution * 0.05) {
        // O gasto hipotético consome quase toda (ou toda) a capacidade mensal de poupança:
        // em vez de um número de dias sem sentido, sinalizamos que a meta ficaria travada.
        goalDelay = { goalName: goal.name, extraDays: null, stalls: true };
      } else {
        const monthsNeededAfter = remainingToGoal / reducedCapacity;
        const extraMonths = monthsNeededBefore != null ? Math.max(0, monthsNeededAfter - monthsNeededBefore) : null;
        goalDelay = { goalName: goal.name, extraDays: extraMonths != null ? Math.round(extraMonths * 30) : null, stalls: false };
      }
    }
  }

  return {
    dailyBefore, dailyAfter, daysLeft,
    dailyDrop: subMoney(dailyBefore, dailyAfter),
    willExceedIncome: afterRemaining < 0,
    goalDelay,
    // [M31] A leitura mensal, que é a unidade em que a decisão é tomada.
    income,
    monthlyBefore: beforeRemaining,
    monthlyAfter: afterRemaining,
    reserveImpact: reserveImpactOf(data, hypotheticalAmount, afterRemaining),
  };
}

// ------------------------------------------------------------------
// Simulador de financiamento/grandes compras (Feature 4)
// Compara o custo real de comprar financiado (entrada + N parcelas) contra
// o valor do bem à vista, calcula o quanto a parcela compromete da renda
// fixa, e reaproveita simulateExpenseImpact para o impacto no saldo diário
// enquanto a parcela estiver ativa.
// ------------------------------------------------------------------
function simulateFinancingImpact(data, params, goalId) {
  const valorBem = roundMoney(params.valorBem);
  const entrada = roundMoney(params.entrada);
  const numParcelas = Math.max(1, Math.round(Number(params.numParcelas) || 0));
  const valorParcela = roundMoney(params.valorParcela);

  const totalPaid = addMoney(entrada, mulMoney(valorParcela, numParcelas));
  const interestCost = subMoney(totalPaid, valorBem);
  const interestPct = safePct(interestCost, valorBem);

  const fixedIncome = roundMoney(data.monthlyIncome || 0);
  const commitmentPct = fixedIncome > 0 ? safePct(valorParcela, fixedIncome) : null;
  const commitmentWarning = commitmentPct != null && commitmentPct > 20;

  const monthlyImpact = simulateExpenseImpact(data, valorParcela, goalId);

  // [M31] O comprometimento que interessa não é o desta parcela sozinha: é o
  // total da renda que passa a estar preso em parcela. Quem já tem R$ 900 de
  // financiamento e assume mais R$ 400 sai de 12% para 18%, e é esse salto que
  // muda a decisão.
  const commitmentNow = monthlyDebtCommitment(data);
  const commitmentBefore = fixedIncome > 0 ? safePct(commitmentNow, fixedIncome) : null;
  const commitmentAfter = fixedIncome > 0 ? safePct(addMoney(commitmentNow, valorParcela), fixedIncome) : null;

  // A entrada sai do caixa hoje; a parcela sai da sobra todo mês. As duas
  // portas de risco para a reserva, então as duas entram na conta.
  const reserveImpact = reserveImpactOf(data, entrada, monthlyImpact.monthlyAfter);

  return {
    valorBem, entrada, numParcelas, valorParcela,
    totalPaid, interestCost, interestPct,
    commitmentPct, commitmentWarning,
    commitmentNow, commitmentBefore, commitmentAfter,
    ...monthlyImpact,
    reserveImpact,
  };
}

function estimateAvgMonthlySaving(data) {
  // Aproxima o "ritmo de poupança" pela diferença média entre renda e gasto nos últimos 3 meses.
  const now = new Date();
  let totalCents = 0, count = 0;
  for (let i = 1; i <= 3; i++) {
    const key = keyOfDate(addMonths(now, -i));
    const t = realizedMonthTotals(data, key);
    const inc = effectiveIncome(data, key);
    if (inc > 0) { totalCents += Math.max(0, moneyToCents(inc) - moneyToCents(t.expense)); count++; }
  }
  return count > 0 ? moneyFromCents(Math.round(totalCents / count)) : 0;
}

// ------------------------------------------------------------------
// Detector de "vazamentos silenciosos"
// Agrupa pequenos gastos do mês (abaixo de um teto) por descrição/categoria
// normalizada e destaca os grupos com maior soma acumulada.
// ------------------------------------------------------------------
const LEAK_THRESHOLD = 40; // gastos individuais abaixo deste valor entram na varredura

function detectSilentLeaks(data, monthKey) {
  const tx = realizedTxForMonth(data, monthKey).filter((t) => isConsumptionTx(t) && t.amount <= LEAK_THRESHOLD);
  const groups = {};
  tx.forEach((t) => {
    const cat = categoryById(data, t.categoryId);
    const key = normalizeDesc(t.description) || cat.name;
    if (!groups[key]) groups[key] = { label: t.description || cat.name, color: cat.color, icon: cat.icon, total: 0, count: 0 };
    groups[key].total = addMoney(groups[key].total, t.amount);
    groups[key].count += 1;
  });
  const leaks = Object.values(groups)
    .filter((g) => g.count >= 2)
    .sort((a, b) => b.total - a.total);
  const totalLeak = sumMoney(leaks, (g) => g.total);
  return { leaks: leaks.slice(0, 6), totalLeak, count: leaks.reduce((s, g) => s + g.count, 0) };
}

// ------------------------------------------------------------------
// Projeção preditiva de fluxo de caixa; regressão linear simples (mínimos quadrados)
// sobre o saldo acumulado diário do mês corrente, projetada até o último dia.
// ------------------------------------------------------------------
function linearRegression(points) {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0] ? points[0].y : 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  points.forEach((p) => { sumX += p.x; sumY += p.y; sumXY += p.x * p.y; sumXX += p.x * p.x; });
  const denom = n * sumXX - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function projectCashFlow(data) {
  const now = new Date();
  const mKey = keyOfDate(now);
  const dayOfMonth = now.getDate();
  const dim = daysInMonthOf(now.getFullYear(), now.getMonth());
  const income = effectiveIncome(data, mKey);
  const tx = realizedTxForMonth(data, mKey);

  // saldo acumulado (renda proporcional linear - gastos) dia a dia até hoje
  const dailyExpense = new Array(dim + 1).fill(0);
  tx.forEach((t) => {
    // Ritmo de GASTO. Um aporte de R$ 500 no dia 5 não pode aparecer como
    // estouro do ritmo diário: ele foi guardado, não consumido.
    const cents = consumptionCentsOf(t);
    if (!cents) return;
    const d = Number(t.date.slice(8, 10));
    if (d >= 1 && d <= dim) dailyExpense[d] += cents;
  });

  const points = [];
  const actualSeries = [];
  let cumCents = 0;
  for (let d = 1; d <= dayOfMonth; d++) {
    cumCents += dailyExpense[d];
    const cum = moneyFromCents(cumCents);
    points.push({ x: d, y: cum });
    actualSeries.push({ day: d, value: cum });
  }

  const { slope, intercept } = linearRegression(points);
  const projectedSeries = [];
  for (let d = dayOfMonth; d <= dim; d++) {
    projectedSeries.push({ day: d, value: Math.max(0, roundMoney(slope * d + intercept)) });
  }
  const projectedTotal = Math.max(0, roundMoney(slope * dim + intercept));
  const projectedRemaining = subMoney(income, projectedTotal);

  return { actualSeries, projectedSeries, projectedTotal, projectedRemaining, income, dim, dayOfMonth };
}

// ------------------------------------------------------------------
// Alerta de raio-x comportamental (Feature 5)
// Olha só para os gastos do dia a dia do mês (não-recorrentes; os fixos/
// contas já têm vencimento certo e não entram nessa conta) e verifica se
// mais da metade desse valor está sendo pago no Crédito, sinal de que o
// dia a dia está sendo "empurrado" pra fatura em vez do orçamento do mês.
// ------------------------------------------------------------------
const CREDIT_RISK_THRESHOLD = 0.5;

function creditRiskAlert(data, monthKey) {
  const variableTx = realizedTxForMonth(data, monthKey).filter((t) => isConsumptionTx(t) && !t.recurring);
  const variableTotal = sumMoney(variableTx, (t) => t.amount);
  const creditTotal = sumMoney(variableTx.filter((t) => t.payment === "Crédito"), (t) => t.amount);
  const pct = safeRatio(creditTotal, variableTotal);
  return {
    trigger: variableTotal > 0 && pct > CREDIT_RISK_THRESHOLD,
    pct, variableTotal, creditTotal,
  };
}

// ==================================================================
// INTEGRAÇÃO ANALÍTICA; ponte com dados agregados para a Netlify Function
// ==================================================================
// O que é enviado: valores agregados, categorias e metas.
// O que NUNCA é enviado: descrições de lançamentos, datas individuais,
// estabelecimentos, chaves de nota fiscal, ids, nomes de arquivos importados.
// ==================================================================

// O endereço é `/api/analyze` como o de conta e o de sincronização. Antes era
// `/.netlify/functions/analyze`, com o nome da plataforma cravado no cliente:
// trocar de hospedagem obrigava a mexer no aplicativo, não só na publicação.
const ANALYZE_ENDPOINT = "/api/analyze";

// A função de análise passou a exigir sessão (a chave da Anthropic é paga e o
// `Origin` sozinho não segura um `curl`). Isso significa cookie de sessão, que
// só viaja com `credentials: "include"`, e o mesmo `X-Device-Id` que o resto
// do app usa; sem ele o servidor não reconhece o aparelho e devolve 403.
function analyzeHeaders(expectedAccountId) {
  const headers = { "Content-Type": "application/json" };
  if (typeof accountDeviceId === "function") {
    try {
      headers["X-Device-Id"] = accountDeviceId();
      if (typeof accountDeviceLabel === "function") headers["X-Device-Label"] = accountDeviceLabel();
    } catch (e) { /* sem localStorage: o servidor recusa e a UI explica */ }
  }
  if (typeof accountExpectedUserId === "function") {
    try { headers["X-Account-Id"] = String(expectedAccountId == null ? accountExpectedUserId() : expectedAccountId); }
    catch (e) { headers["X-Account-Id"] = ""; }
  }
  return headers;
}

function handleAnalyzeAccountScope(code, message, expectedAccountId) {
  if (code !== "account_scope_changed" || typeof handleAccountScopeChanged !== "function") return;
  if (typeof accountExpectedUserId === "function" && expectedAccountId
    && accountExpectedUserId() !== expectedAccountId) return;
  Promise.resolve(handleAccountScopeChanged({ code, message: message || "" })).catch((error) => {
    if (typeof reportSafeError === "function") reportSafeError("sync", error, "analyze_account_scope");
  });
}

async function fetchAnalyzeWithSessionRetry(requestBody, signal, expectedAccountId, retried) {
  const res = await fetch(ANALYZE_ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: analyzeHeaders(expectedAccountId),
    body: JSON.stringify(requestBody),
    signal,
  });
  let body = null;
  try { body = await res.json(); } catch (e) { body = null; }
  const code = body && body.code;
  if (!res.ok && code === "session_refresh_required" && !retried
    && typeof refreshAccountSession === "function"
    && typeof accountExpectedUserId === "function"
    && expectedAccountId && accountExpectedUserId() === expectedAccountId) {
    const refreshed = await refreshAccountSession();
    if (refreshed && refreshed.status === "active" && accountExpectedUserId() === expectedAccountId) {
      return fetchAnalyzeWithSessionRetry(requestBody, signal, expectedAccountId, true);
    }
  }
  return { res, body };
}
const ANALYZE_TIMEOUT_MS = 30000;

class InsightError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "InsightError";
    this.code = code; // "OFFLINE" | "TIMEOUT" | "NOT_CONFIGURED" | "NOT_ENOUGH_DATA" | "SERVER" | "NETWORK" | "BAD_RESPONSE"
  }
}

const round2 = (n) => roundMoney(n);   // alias histórico; a regra vive em utils.js

// ------------------------------------------------------------------------------
// [M37] LIMITE DO CONTEÚDO DA IA, DO LADO DO NAVEGADOR
// ------------------------------------------------------------------------------
// Esta lista é a CÓPIA ESPELHADA de `netlify/functions/_shared/ai-boundaries.js`,
// onde estão o raciocínio inteiro e a explicação de cada padrão. Ela existe aqui
// pelo mesmo motivo que a whitelist de `situacao`/`nivel` já é repetida em
// `js/screens/analytics.js`: a resposta é entrada não confiável mesmo vindo do
// nosso backend. Uma função publicada numa versão anterior, um proxy no meio ou
// um Service Worker devolvendo resposta guardada furariam um filtro que só
// existisse no servidor.
//
// O navegador não carrega código de `netlify/`, então a duplicação é inevitável.
// O que NÃO é inevitável é a divergência: `tests/test-ai-boundaries.js` compara
// as duas listas termo a termo e reprova se uma andar sem a outra.
const AI_ADVICE_PATTERNS = [
  ["ticker", "\\b[A-Z]{4}\\d{1,2}\\b"],
  ["acao-nomeada", "\\b[AaÁá](?:ç|c)(?:(?:õ|o)es|(?:ã|a)o)\\s+(?:d[aeo]s?\\s+)?[A-ZÀ-Þ][\\wÀ-ÿ]{2,}"],
  ["fundo-produto", "\\bfundos?\\s+(?:de\\s+investimento|imobili(?:á|a)ri[oa]s?|cambia(?:l|is)|multimercado|de\\s+(?:a(?:ç|c)(?:õ|o)es|renda\\s+fixa)|DI\\b)"],
  ["sigla-produto", "\\b(?:ETF|FII|CDB|RDB|LCI|LCA|LCD|CRI|CRA|COE|PGBL|VGBL|BDR)s?\\b"],
  ["renda-fixa-nomeada", "\\b(?:tesouro\\s+(?:direto|selic|ipca|prefixado)|deb(?:ê|e)ntures?|previd(?:ê|e)ncia\\s+privada)\\b"],
  ["cripto", "\\b(?:bitcoin|ethereum|criptomoedas?|cripto\\b|stablecoins?)"],
  ["intermediario", "\\b(?:corretoras?|home\\s+broker|day\\s+trade|banco\\s+de\\s+investimento)\\b"],
  ["alocacao-percentual", "\\d{1,3}\\s*%\\s+(?:em|n[oa]s?|para)\\s+(?!necessidades|desejos|futuro|nenhum)[\\wÀ-ÿ]"],
  ["ordem-de-mercado", "\\b(?:compre|venda|invista|aplique|aloque|realoque|migre)\\s+(?:\\S+\\s+){0,3}?(?:a(?:ç|c)(?:õ|o)es|fundos?|cripto|bitcoin|tesouro|CDB|ETF|FII)\\b"],
];

// O rótulo de natureza local. O servidor manda o dele, mas a tela nunca depende
// disso: resposta antiga sem o campo continuaria aparecendo sem aviso nenhum, e
// é justamente a resposta antiga que este arquivo não confia.
const AI_NATURE = Object.freeze({
  tipo: "educacional",
  texto: "Conteúdo educativo gerado por IA a partir dos números que você enviou. Não é recomendação de investimento nem consultoria financeira, e todo valor futuro citado é estimativa, não previsão.",
});

// Espelho de `AI_CASE_SENSITIVE`: "PETR4" é ativo e "casa4" não é; "ações da
// Vale" é empresa e "ações que você pode tomar" é o sentido comum da palavra.
// Nos dois casos é a maiúscula que separa um do outro.
const AI_CASE_SENSITIVE = ["ticker", "acao-nomeada"];

function aiAdviceViolation(text) {
  const value = String(text == null ? "" : text);
  if (!value.trim()) return null;
  for (let i = 0; i < AI_ADVICE_PATTERNS.length; i++) {
    const [id, source] = AI_ADVICE_PATTERNS[i];
    const re = new RegExp(source, AI_CASE_SENSITIVE.indexOf(id) === -1 ? "iu" : "u");
    if (re.test(value)) return id;
  }
  return null;
}

function aiViolatesBoundaries(text) { return aiAdviceViolation(text) !== null; }

// Sobrou alguma coisa depois do filtro? Uma análise em que todo campo saiu vazio
// e toda lista ficou zerada não é uma análise; é um cartão em branco.
function aiAnalysisIsEmpty(a) {
  if (!a || typeof a !== "object") return true;
  const temTexto = [a.diagnostico, a.fluxoCaixa && a.fluxoCaixa.comentario, a.metasComentario]
    .some((t) => String(t || "").trim());
  const temLista = (Array.isArray(a.riscos) && a.riscos.length > 0)
    || (Array.isArray(a.recomendacoes) && a.recomendacoes.length > 0);
  return !temTexto && !temLista;
}

// Espelho de `stripAdvicePatterns`: campo que atravessa a linha sai vazio, item
// que atravessa some da lista. Nada é reescrito.
function stripAiAdvice(analise) {
  if (!analise || typeof analise !== "object") return analise;
  const limpa = (t) => (aiViolatesBoundaries(t) ? "" : t);
  const filtra = (lista, campos) => (Array.isArray(lista) ? lista : [])
    .filter((item) => !campos.some((c) => aiViolatesBoundaries(item && item[c])));
  return {
    ...analise,
    diagnostico: limpa(analise.diagnostico),
    fluxoCaixa: { ...(analise.fluxoCaixa || {}), comentario: limpa(analise.fluxoCaixa && analise.fluxoCaixa.comentario) },
    riscos: filtra(analise.riscos, ["titulo", "descricao"]),
    recomendacoes: filtra(analise.recomendacoes, ["acao", "impacto"]),
    metasComentario: limpa(analise.metasComentario),
  };
}

// ------------------------------------------------------------------------------
// PACOTE ENVIADO À IA
// ------------------------------------------------------------------------------
// Esta função se chamava `buildAnonymousPayload` e o comentário dizia "JSON
// anônimo". Não é, e o nome errado é perigoso porque vira texto de tela e
// decisão de produto: o pacote leva NOMES escolhidos pelo usuário (categorias
// e metas). "Reserva para a cirurgia da minha mãe" é agregado, mas não é
// anônimo. O que dá para prometer com honestidade é: sem descrições de
// lançamento, sem valores individuais, sem datas, sem identificadores.
//
// `options.hide` permite ao usuário tirar partes do pacote antes de enviar.
const AI_HIDEABLE_FIELDS = Object.freeze({
  categorias: "Nomes das categorias",
  metas: "Nomes e valores das metas",
  historico: "Histórico de meses anteriores",
  orcamento: "Regras de orçamento",
});

function buildAiPayload(data, monthKey, options) {
  const opts = options || {};
  const esconder = new Set(Array.isArray(opts.hide) ? opts.hide : []);
  const pacote = buildAiPayloadFull(data, monthKey);

  // A ocultação acontece DEPOIS de montar: assim a prévia e o envio saem da
  // mesma função e não podem divergir.
  if (esconder.has("categorias")) {
    pacote.categorias = (pacote.categorias || []).map((c, i) => ({ ...c, nome: `Categoria ${i + 1}` }));
  }
  if (esconder.has("metas")) delete pacote.metas;
  if (esconder.has("historico")) delete pacote.historico;
  if (esconder.has("orcamento")) delete pacote.orcamento;
  return pacote;
}

// Prévia do que será enviado: o MESMO objeto do envio, mais o resumo do que
// está incluído. Sem isto, "consinto com o envio" é consentimento sobre algo
// que o usuário nunca viu.
function buildAiPayloadPreview(data, monthKey, options) {
  const pacote = buildAiPayload(data, monthKey, options);
  const json = JSON.stringify(pacote, null, 2);
  return {
    payload: pacote,
    json,
    bytes: json.length,
    campos: Object.keys(pacote),
    ocultaveis: AI_HIDEABLE_FIELDS,
    // Frase única, para a tela não precisar montar a sua e acabar dizendo algo
    // diferente do que o código faz.
    resumo: "O pacote leva totais do mês, nomes de categorias e metas, e o histórico dos últimos meses. Não leva descrições de lançamentos, valores individuais, datas nem identificadores.",
  };
}

// Compatibilidade: o nome antigo continua funcionando durante a transição, mas
// aponta para a função com o nome honesto.
function buildAnonymousPayload(data, monthKey) {
  return buildAiPayload(data, monthKey);
}

function buildAiPayloadFull(data, monthKey) {
  const src = data || FinanceStore.snapshot();
  const now = new Date();
  const mKey = monthKey || keyOfDate(now);

  const { fixed, variable, income: loggedIncome } = realizedMonthTotals(src, mKey);
  const income = effectiveIncome(src, mKey);

  // Gastos por categoria; só nome, grupo, valor e orçamento. Sem descrições.

  const byCategory = {};
  realizedTxForMonth(src, mKey).forEach((t) => {
    const cents = consumptionCentsOf(t);
    if (!cents) return;
    byCategory[t.categoryId] = (byCategory[t.categoryId] || 0) + cents;
  });
  const categorias = Object.entries(byCategory)
    .map(([id, value]) => {
      const c = categoryById(src, id);
      return {
        nome: c.name,
        grupo: GROUP_LABELS[categoryGroup(src, id)] || "Necessidades",
        gasto: moneyFromCents(value),
        orcamento: typeof c.budget === "number" ? round2(c.budget) : null,
      };
    })
    .sort((a, b) => b.gasto - a.gasto);

  // Metas; nome, quanto já tem, quanto falta. Sem prazos nem ids.

  const metas = (src.goals || []).map((g) => ({
    nome: g.name,
    atual: round2(g.current),
    meta: round2(g.target),
  }));

  // Histórico de 6 meses (só totais mensais agregados).

  const historico = last6MonthsSummary(src).map((m) => ({
    mes: m.label,
    entradas: round2(m.income),
    saidas: round2(m.expense),
  }));

  const totalExpense = addMoney(fixed, variable);
  const taxaPoupanca = income > 0 ? round2(safePct(subMoney(income, totalExpense), income)) : 0;
  const parcelasFuturas = sumMoney(
    (src.transactions || []).filter((t) => t.installmentGroupId && t.type === "expense" && t.date > todayIso()),
    (t) => t.amount
  );
  const creditoMes = creditSpentInMonth(src, mKey);

  return {
    mes: `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`,
    rendaMensal: round2(income),
    gastosFixos: round2(fixed),
    gastosVariaveis: round2(variable),
    saldoAtual: round2(realizedBalance(src)),
    taxaPoupanca,
    comprometimentoCredito: income > 0 ? round2(safePct(creditoMes, income)) : 0,
    parcelasFuturas: round2(parcelasFuturas),
    regraOrcamento: {
      necessidades: (src.budgetSplit && src.budgetSplit.necessidade) || 50,
      desejos: (src.budgetSplit && src.budgetSplit.desejo) || 30,
      futuro: (src.budgetSplit && src.budgetSplit.futuro) || 20,
    },
    historico,
    categorias,
    metas,
    _rendaLancada: undefined, // nunca enviado; mantido fora do JSON
  };
}

// Chama o proxy Netlify e devolve a análise estruturada.
// Todos os caminhos de erro viram um InsightError com mensagem pronta para a UI.
// `options` chega da tela de prévia e carrega a ocultação escolhida pelo
// usuário. Ele precisa atravessar até aqui: a prévia mostrar um pacote e o
// envio mandar outro seria pior do que não ter prévia nenhuma.
async function requestStructuredAnalysis(data, monthKey, options) {
  if (normalizePrivacy(data && data.privacy).aiSharing === "blocked") {
    throw new InsightError("BLOCKED", "Os envios para IA estão bloqueados em Privacidade.");
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new InsightError("OFFLINE", "Você está offline. A análise com IA precisa de conexão; o resto do app continua funcionando normalmente.");
  }

  const payload = buildAiPayload(data, monthKey, options);
  if (payload.rendaMensal === 0 && payload.categorias.length === 0) {
    throw new InsightError("NOT_ENOUGH_DATA", "Lance alguns gastos ou informe sua renda para a IA ter o que analisar.");
  }
  // Remove chaves internas antes de sair do navegador.
  delete payload._rendaLancada;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);
  const expectedAccountId = typeof accountExpectedUserId === "function" ? accountExpectedUserId() : "";

  try {
    const { res, body } = await fetchAnalyzeWithSessionRetry(payload, controller.signal, expectedAccountId, false);
    if (expectedAccountId && typeof accountExpectedUserId === "function"
      && accountExpectedUserId() !== expectedAccountId) {
      throw new InsightError("account_scope_changed", "A análise pertencia à conta anterior.");
    }

    if (!res.ok) {
      const code = (body && body.code) || "SERVER";
      handleAnalyzeAccountScope(code, body && body.message, expectedAccountId);
      throw new InsightError(code, messageForCode(code, res.status));
    }
    if (!body) throw new InsightError("BAD_RESPONSE", "A resposta da IA veio em um formato inesperado.");

    // [M37] O filtro roda de novo aqui, sobre o que chegou. O servidor já
    // filtrou; esta passagem é o que garante o limite mesmo quando a resposta
    // não veio do servidor de hoje. O texto corrido não tem campo a preservar:
    // se violar, some inteiro.
    const textoBruto = body.insight || "";
    return {
      estruturado: !!body.estruturado,
      analise: body.analise ? stripAiAdvice(body.analise) : null,
      texto: aiViolatesBoundaries(textoBruto) ? "" : textoBruto,
      natureza: AI_NATURE,
      modelo: body.modelo || null,
    };
  } catch (err) {
    if (err instanceof InsightError) throw err;
    if (err && err.name === "AbortError") {
      throw new InsightError("TIMEOUT", "A análise demorou demais para responder. Tente de novo em instantes.");
    }
    throw new InsightError("NETWORK", "Não foi possível falar com o serviço de análise. Verifique sua conexão e se a função foi publicada.");
  } finally {
    clearTimeout(timer);
  }
}

function messageForCode(code, status) {
  switch (code) {
    case "NO_API_KEY": return "A chave da IA ainda não foi configurada na hospedagem (variável ANTHROPIC_API_KEY).";
    case "BAD_KEY": return "A chave da IA foi recusada. Confira a variável ANTHROPIC_API_KEY no painel da hospedagem.";
    case "RATE_LIMIT": return "Muitas análises em pouco tempo. Espere alguns instantes e tente de novo.";
    case "TIMEOUT": return "A análise demorou demais para responder. Tente de novo em instantes.";
    case "NOT_ENOUGH_DATA": return "Ainda não há dados suficientes neste mês para gerar uma análise.";
    case "BLOCKED": return "Os envios para IA estão bloqueados em Privacidade.";
    case "AUTH_REQUIRED": return "Entre na sua conta em Ajustes para usar as análises com IA.";
    case "DEVICE_REVOKED": return "O acesso deste aparelho foi revogado. Entre na conta novamente.";
    case "DEVICE_INVALID": return "Não foi possível identificar este aparelho. Recarregue a página e tente de novo.";
    case "ACCOUNT_UNAVAILABLE": return "As análises com IA exigem conta, e o serviço de contas não está configurado neste site.";
    case "account_scope_changed": return "A conta desta sessão mudou. Aguarde a atualização e tente novamente.";
    case "invalid_account_scope": return "Não foi possível confirmar qual conta deve receber esta análise.";
    case "session_refresh_required": return "Não foi possível renovar a sessão para concluir a análise. Tente novamente.";
    case "BAD_JSON": return "Houve um problema ao montar os dados da análise.";
    default: return `Não foi possível gerar a análise agora (erro ${status || "desconhecido"}).`;
  }
}


// ==================================================================
// FEATURE 4 (fallback); refinamento de lançamento por IA
// ==================================================================
// O parser local (nlp.js) resolve a esmagadora maioria das frases, offline e
// instantaneamente. Quando ele fica em dúvida (confiança baixa) e há rede, o
// usuário pode pedir uma segunda opinião: mandamos APENAS a frase digitada e a
// lista de nomes de categoria; nenhum dado financeiro, nenhum histórico.
async function requestNaturalEntryParse(text, categories) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new InsightError("OFFLINE", "Sem conexão; o entendimento avançado precisa de internet. O lançamento manual continua funcionando.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const expectedAccountId = typeof accountExpectedUserId === "function" ? accountExpectedUserId() : "";
  try {
    const requestBody = {
      modo: "lancamento",
      texto: String(text || "").slice(0, 240),
      hoje: todayIso(),
      categorias: (categories || []).map((c) => ({ id: c.id, nome: c.name })).slice(0, 40),
    };
    const { res, body } = await fetchAnalyzeWithSessionRetry(requestBody, controller.signal, expectedAccountId, false);
    if (expectedAccountId && typeof accountExpectedUserId === "function"
      && accountExpectedUserId() !== expectedAccountId) {
      throw new InsightError("account_scope_changed", "A análise pertencia à conta anterior.");
    }
    if (!res.ok) {
      const code = (body && body.code) || "SERVER";
      handleAnalyzeAccountScope(code, body && body.message, expectedAccountId);
      throw new InsightError(code, messageForCode(code, res.status));
    }
    if (!body || !body.lancamento) throw new InsightError("BAD_RESPONSE", "Não consegui entender essa frase.");
    return body.lancamento;
  } catch (err) {
    if (err instanceof InsightError) throw err;
    if (err && err.name === "AbortError") throw new InsightError("TIMEOUT", "Demorou demais para responder. Tente escrever de forma mais direta.");
    throw new InsightError("NETWORK", "Não foi possível usar o entendimento avançado agora.");
  } finally {
    clearTimeout(timer);
  }
}
