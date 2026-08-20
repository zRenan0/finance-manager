// portfolio.js. [M5] Motor da Central de Investimentos (puro, sem DOM)
// ------------------------------------------------------------------------------
// Recebe `data` e devolve um modelo de leitura pronto para a tela. Nenhuma função
// aqui toca no DOM, no `state` da UI ou no armazenamento.
//
// DECISÕES QUE VALEM EXPLICAÇÃO
//
// 1. A carteira NÃO tem coleção própria. Um investimento é um asset de classe
//    "investimento"; o mesmo registro do Módulo 3. Duas coleções significariam
//    duas verdades sobre o mesmo dinheiro, e o patrimônio passaria a somar a
//    carteira duas vezes. Aqui só lemos o detalhe que a v8 acrescentou.
//
// 2. `value` é o valor de MERCADO hoje; `invested` é o CUSTO. É a diferença
//    entre os dois que produz lucro; e é por isso que o app pede os dois
//    números em vez de inferir um do outro.
//
// 3. Dividendos não entram no patrimônio. O provento, quando cai na conta, já é
//    um lançamento de receita; somá-lo de novo aqui seria contar duas vezes. Ele
//    entra apenas no RETORNO, que é uma pergunta diferente de "quanto eu tenho".
//
// 4. Rentabilidade só é anualizada com pelo menos 3 meses de aplicação. Anualizar
//    2% em 20 dias devolve "43% ao ano", um número que não significa nada e que
//    induz a decisão errada. Sem prazo suficiente, o modelo devolve `null` e a
//    tela mostra o retorno absoluto.
"use strict";

const PORTFOLIO_MIN_MONTHS_TO_ANNUALIZE = 3;
const PORTFOLIO_CONCENTRATION_ALERT_PCT = 40;   // um único ativo dominando a carteira
const PORTFOLIO_CRYPTO_ALERT_PCT = 10;          // fatia de cripto considerada alta

/* ------------------------------------------------------------------ helpers */

function portfolioItems(data) {
  return (typeof countedAssets === "function" ? countedAssets(data) : (data.assets || []))
    .filter((a) => a.class === "investimento");
}

// Meses decorridos desde o início da aplicação. Sem data informada, cai para o
// primeiro ponto do histórico; que é o mês em que o item foi cadastrado.
function monthsHeldOf(asset, todayIso_) {
  const today = todayIso_ || todayIso();
  let startIso = asset.startedAt || "";
  if (!startIso) {
    const h = Array.isArray(asset.history) ? asset.history : [];
    if (h.length > 0) startIso = `${h[0].monthKey}-01`;
  }
  if (!startIso) return 0;
  const days = portfolioDaysBetween(startIso, today);
  if (!Number.isFinite(days) || days <= 0) return 0;
  return days / 30.44;
}

// Taxa equivalente ao ano a partir de um retorno acumulado num prazo qualquer.

function annualizeReturn(totalReturnPct, months) {
  if (months < PORTFOLIO_MIN_MONTHS_TO_ANNUALIZE) return null;
  const growth = 1 + totalReturnPct / 100;
  if (growth <= 0) return -100;
  return (Math.pow(growth, 12 / months) - 1) * 100;
}

// Retorno real = retorno nominal descontada a inflação do mesmo período.
// (1+nominal)/(1+inflação) − 1; não é a subtração simples, que superestima.
function realReturn(nominalPct, inflationPct) {
  if (nominalPct == null) return null;
  return ((1 + nominalPct / 100) / (1 + (Number(inflationPct) || 0) / 100) - 1) * 100;
}

function marketRatesOf(data) {
  const r = typeof normalizeMarketRates === "function"
    ? normalizeMarketRates(data && data.marketRates)
    : { selic: 15, cdi: 14.9, ipca: 4.5, tr: 0.2, updatedAt: null };
  return { ...r, poupanca: poupancaRateFrom(r.selic, r.tr) };
}

/* ------------------------------------------------------- item a item */

/* ==============================================================================
 * RENTABILIDADE: XIRR E TWR
 * ==============================================================================
 * O cálculo anterior era `(valor - custo + proventos) / custo`. Ele responde
 * "quanto o dinheiro cresceu", mas ignora QUANDO cada real entrou, e com isso:
 *
 *   * quem aportou R$ 10.000 há cinco anos e quem aportou ontem apareciam com a
 *     mesma rentabilidade;
 *   * a anualização dividia esse número pelo tempo do PRIMEIRO aporte, o que
 *     inventava rentabilidade anual para dinheiro que estava aplicado há um mês.
 *
 * Duas medidas resolvem, e elas respondem a perguntas diferentes:
 *
 *   XIRR (money-weighted): o retorno do DINHEIRO do investidor, considerando as
 *   datas. É o que ele de fato ganhou.
 *
 *   TWR (time-weighted): o retorno da ESCOLHA, isolando o efeito do momento dos
 *   aportes. É a medida comparável com um índice, e é a que a CVM usa para
 *   comparação de fundos.
 */

const XIRR_MAX_ITER = 200;
const DAYS_PER_YEAR = 365;

function portfolioDaysBetween(a, b) {
  const t1 = Date.parse(`${a}T00:00:00Z`);
  const t2 = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return 0;
  return (t2 - t1) / 86400000;
}

// TIR de fluxos DATADOS. `flows` = [{ date, amount }], negativo quando sai do
// bolso do investidor. Devolve taxa ANUAL efetiva, ou null quando o fluxo não
// tem solução (sem troca de sinal, por exemplo).
function xirr(flows) {
  const list = (flows || []).filter((f) => f && f.date && Number.isFinite(f.amount) && f.amount !== 0);
  if (list.length < 2) return null;
  const temPositivo = list.some((f) => f.amount > 0);
  const temNegativo = list.some((f) => f.amount < 0);
  if (!temPositivo || !temNegativo) return null;

  const base = list.reduce((min, f) => (f.date < min ? f.date : min), list[0].date);
  const npv = (rate) => list.reduce((s, f) => {
    const anos = portfolioDaysBetween(base, f.date) / DAYS_PER_YEAR;
    return s + f.amount / Math.pow(1 + rate, anos);
  }, 0);

  // Bisseção: robusta e suficiente. Newton diverge com fluxos irregulares, que
  // é o caso comum de quem aporta quando sobra.
  let lo = -0.9999;
  let hi = 10;
  let fLo = npv(lo);
  let fHi = npv(hi);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) return null;
  for (let k = 0; k < XIRR_MAX_ITER; k++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (!Number.isFinite(fMid)) return null;
    if (fLo * fMid <= 0) { hi = mid; fHi = fMid; } else { lo = mid; fLo = fMid; }
  }
  return (lo + hi) / 2;
}

// Retorno tempo-ponderado. Encadeia o retorno de cada subperíodo entre pontos de
// valor conhecidos, retirando o efeito dos aportes e resgates.
//
// `points` = [{ date, value }] em ordem; `events` = aportes/resgates datados.
function twr(points, events) {
  const marcos = (points || []).filter((p) => p && p.date && Number.isFinite(p.value)).slice();
  if (marcos.length < 2) return null;
  const fluxos = (events || []).filter((e) => e && e.date && e.type !== "provento");

  let fator = 1;
  let subperiodos = 0;
  for (let i = 1; i < marcos.length; i++) {
    const ini = marcos[i - 1];
    const fim = marcos[i];
    // Aportes e resgates DENTRO do subperíodo entram no capital base, não no
    // resultado: é isso que separa o retorno da escolha do retorno do timing.
    const fluxo = fluxos
      .filter((e) => e.date > ini.date && e.date <= fim.date)
      .reduce((s, e) => s + (e.type === "resgate" ? -e.amount : e.amount), 0);
    const capital = ini.value + fluxo;
    if (!(capital > 0)) continue;
    fator *= fim.value / capital;
    subperiodos++;
  }
  if (!subperiodos) return null;
  return fator - 1;
}

function portfolioItemModel(asset, totalValue, rates, today) {
  const type = investmentTypeOf(asset.invType);
  const group = investmentGroupOf(type.group);
  const value = roundMoney(asset.value);
  const invested = roundMoney(asset.invested);
  const dividends = roundMoney(asset.dividends);
  const profit = subMoney(value, invested);
  const totalReturn = addMoney(profit, dividends);
  const months = monthsHeldOf(asset, today);

  // Sem custo informado não existe rentabilidade; e inventar um custo a partir
  // do valor atual produziria sempre 0%, escondendo a falta do dado.
  const hasCost = invested > 0;
  const returnPct = hasCost ? (totalReturn / invested) * 100 : null;
  const annualizedPct = hasCost && returnPct != null ? annualizeReturn(returnPct, months) : null;
  const realPct = realReturn(annualizedPct, rates.ipca);

  // Variação do mês: valor de hoje contra o último ponto de histórico anterior
  // ao mês corrente. É o que o usuário chama de "quanto rendeu este mês".
  const history = Array.isArray(asset.history) ? asset.history : [];
  const currentKey = keyOfDate(new Date());
  const past = history.filter((h) => h.monthKey < currentKey);
  const prevValue = past.length > 0 ? past[past.length - 1].value : null;
  const monthDelta = prevValue != null && prevValue > 0
    ? { comparable: true, value: subMoney(value, prevValue), pct: ((value - prevValue) / prevValue) * 100 }
    : { comparable: false, value: 0, pct: 0 };

  // ---- XIRR e TWR quando há eventos datados ----
  const events = Array.isArray(asset.events) ? asset.events : [];
  const hoje = today || todayIso();
  let xirrPct = null;
  let twrPct = null;
  if (events.length) {
    const flows = events.map((e) => ({
      date: e.date,
      // Aporte sai do bolso (negativo); resgate e provento voltam (positivo).
      amount: e.type === "aporte" ? -e.amount : e.amount,
    }));
    // O valor de hoje é a posição final: o investidor "receberia" isso se
    // vendesse agora.
    flows.push({ date: hoje, amount: value });
    const taxa = xirr(flows);
    xirrPct = taxa == null ? null : taxa * 100;

    const pontos = (Array.isArray(asset.history) ? asset.history : [])
      .map((h) => ({ date: `${h.monthKey}-01`, value: h.value }))
      .filter((p) => Number.isFinite(p.value));
    if (pontos.length && pontos[pontos.length - 1].date < hoje) pontos.push({ date: hoje, value });
    const t = twr(pontos, events);
    twrPct = t == null ? null : t * 100;
  }

  return {
    id: asset.id,
    name: asset.name,
    note: asset.note || "",
    type, group,
    value, invested, dividends, profit, totalReturn,
    hasCost,
    returnPct, annualizedPct, realPct,
    // Retorno do dinheiro do investidor (considera as datas dos aportes) e
    // retorno da escolha (isola o momento dos aportes). `null` quando não há
    // eventos datados: nesse caso só existe o retorno simples acima.
    xirrPct, twrPct,
    hasEvents: events.length > 0,
    events,
    monthsHeld: months,
    startedAt: asset.startedAt || "",
    share: totalValue > 0 ? safePct(value, totalValue) : 0,
    monthDelta,
    up: totalReturn >= 0,
  };
}

/* ---------------------------------------------------- agregações da carteira */

function portfolioAllocation(items, totalValue) {
  const byType = new Map();
  items.forEach((it) => {
    const cur = byType.get(it.type.id) || { type: it.type, value: 0, invested: 0, count: 0 };
    cur.value = addMoney(cur.value, it.value);
    cur.invested = addMoney(cur.invested, it.invested);
    cur.count += 1;
    byType.set(it.type.id, cur);
  });
  return Array.from(byType.values())
    .map((row) => ({ ...row, pct: totalValue > 0 ? safePct(row.value, totalValue) : 0 }))
    .sort((a, b) => b.value - a.value);
}

function portfolioGroups(items, totalValue) {
  return INVESTMENT_GROUPS.map((g) => {
    const list = items.filter((it) => it.group.id === g.id).sort((a, b) => b.value - a.value);
    const value = sumMoney(list, (it) => it.value);
    const invested = sumMoney(list, (it) => it.invested);
    const totalReturn = sumMoney(list, (it) => it.totalReturn);
    return {
      ...g, items: list, value, invested, totalReturn,
      count: list.length,
      pct: totalValue > 0 ? safePct(value, totalValue) : 0,
      returnPct: invested > 0 ? (totalReturn / invested) * 100 : null,
    };
  }).filter((g) => g.count > 0);
}

// Série mensal do valor da carteira, reconstruída a partir do histórico de cada
// item; o mesmo mecanismo do Módulo 3, restrito à classe investimento.
function portfolioSeries(data, months) {
  const n = Math.max(3, Number(months) || 12);
  const assets = portfolioItems(data);
  const base = new Date();
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = addMonths(base, -i);
    const key = keyOfDate(d);
    let cents = 0;
    assets.forEach((a) => { cents += moneyToCents(assetValueAt(a, key)); });
    out.push({
      monthKey: key,
      label: MONTH_ABBR[d.getMonth()],
      value: moneyFromCents(cents),
      isCurrent: i === 0,
    });
  }
  return out;
}

// Aportes lançados no mês corrente (categoria Investimentos, fora de metas).
// Serve para responder "eu aportei este mês?" sem depender do cadastro manual.
function monthlyContribution(data, monthKey) {
  const key = monthKey || keyOfDate(new Date());
  const ids = typeof categoryWithDescendants === "function"
    ? new Set(categoryWithDescendants(data, "investimento"))
    : new Set(["investimento"]);
  let cents = 0;
  (data.transactions || []).forEach((t) => {
    if (t.goalId) return;                        // aporte de meta é outro bolso
    if (monthKeyOf(t.date) !== key) return;
    if (!ids.has(t.categoryId)) return;
    cents += t.type === "expense" ? moneyToCents(t.amount) : -moneyToCents(t.amount);
  });
  return moneyFromCents(Math.max(0, cents));
}

/* --------------------------------------------------------------- benchmark */

// Compara a carteira com o CDI no MESMO prazo. O prazo é a média de permanência
// ponderada pelo valor aplicado; comparar uma carteira de 4 meses com o CDI de
// 12 meses seria uma comparação enviesada a favor do CDI.
function portfolioBenchmark(items, totals, rates) {
  const invested = totals.invested;
  if (invested <= 0) return { comparable: false };
  const weighted = items.reduce((s, it) => s + it.monthsHeld * it.invested, 0);
  const months = weighted > 0 ? weighted / invested : 0;
  if (months < PORTFOLIO_MIN_MONTHS_TO_ANNUALIZE) {
    return { comparable: false, months, reason: "prazo-curto" };
  }
  // O acumulado do índice sai da SÉRIE HISTÓRICA quando ela existe. Projetar a
  // taxa de hoje para trás, como era feito antes, compara a carteira com um CDI
  // que nunca existiu: a Selic mudou várias vezes no período.
  const serie = (rates && rates.history) || null;
  const acumuladoHistorico = (campo) => {
    if (!Array.isArray(serie) || serie.length === 0) return null;
    const usados = serie.slice(-Math.max(1, Math.round(months)));
    if (usados.length < Math.round(months)) return null;   // série incompleta não serve
    const fator = usados.reduce((f, ponto) => {
      const mensal = Number(ponto && ponto[campo]);
      return Number.isFinite(mensal) ? f * (1 + mensal / 100) : f;
    }, 1);
    return (fator - 1) * 100;
  };

  const period = (m, annualPct) => (Math.pow(1 + annualPct / 100, m / 12) - 1) * 100;
  const portfolioPct = (totals.totalReturn / invested) * 100;

  const cdiHist = acumuladoHistorico("cdi");
  const ipcaHist = acumuladoHistorico("ipca");
  const poupancaHist = acumuladoHistorico("poupanca");
  const historico = cdiHist != null && ipcaHist != null;

  const cdiPct = historico ? cdiHist : period(months, rates.cdi);
  const ipcaPct = historico ? ipcaHist : period(months, rates.ipca);
  const poupancaPct = historico && poupancaHist != null ? poupancaHist : period(months, rates.poupanca);

  return {
    comparable: true,
    months,
    portfolioPct,
    annualizedPct: annualizeReturn(portfolioPct, months),
    cdiPct, poupancaPct, ipcaPct,
    beatsCdi: portfolioPct >= cdiPct,
    beatsInflation: portfolioPct >= ipcaPct,
    diffCdi: portfolioPct - cdiPct,
    // A tela precisa poder dizer de onde veio a comparação. Sem série
    // histórica, o índice é uma PROJEÇÃO da taxa atual, e isso muda a leitura.
    benchmarkSource: historico ? "serie-historica" : "taxa-atual-projetada",
    benchmarkApproximate: !historico,
  };
}

/* ------------------------------------------------------------- diagnóstico */
// Ordem de consultor: risco estrutural primeiro (concentração, liquidez da
// reserva), depois eficiência (retorno abaixo do CDI), depois hábito (aporte).
// No máximo 4 itens; uma lista de sete prioridades não é uma lista.
function portfolioInsights(data, model) {
  const out = [];
  const t = model.totals;

  if (t.value > 0) {
    const top = model.items[0];
    // ATENÇÃO AO ESCOPO DESTES TEXTOS.
    //
    // O app não conhece o perfil do investidor (objetivo, prazo, tolerância a
    // risco, situação financeira) e não é consultor de valores mobiliários
    // autorizado pela CVM. Recomendar alocação sem perfil é justamente o que a
    // Resolução CVM 19/2021 e o dever de adequação (Resolução CVM 30/2021)
    // impedem. Os textos abaixo, por isso, DESCREVEM a carteira; não dizem o
    // que comprar, vender ou manter.
    if (top && top.share >= PORTFOLIO_CONCENTRATION_ALERT_PCT && model.items.length > 1) {
      out.push({
        id: "concentracao", tone: "warn", icon: "alertTriangle",
        title: `${top.name} concentra ${fmtNum(top.share)}% da carteira`,
        text: "Com essa fatia, o resultado da carteira acompanha de perto o desempenho de um único ativo. É uma constatação sobre a composição atual, não uma orientação de compra ou venda.",
      });
    }

    const crypto = model.groups.find((g) => g.id === "cripto");
    if (crypto && crypto.pct > PORTFOLIO_CRYPTO_ALERT_PCT) {
      out.push({
        id: "cripto", tone: "warn", icon: "alertTriangle",
        title: `Cripto é ${fmtNum(crypto.pct)}% da sua carteira`,
        text: `São ${fmtBRL(crypto.value)} numa classe de alta volatilidade, sem garantia do FGC e sem emissor. O percentual adequado depende do seu objetivo e da sua tolerância a risco, que este aplicativo não avalia.`,
      });
    }

    // Reserva de emergência precisa de liquidez diária. Renda variável e ativos
    // com carência não servem; e este é o erro mais caro da lista.
    const liquid = model.items.filter((it) => it.type.liquidity === "diaria");
    const liquidValue = sumMoney(liquid, (it) => it.value);
    const reserveNeed = model.emergency ? model.emergency.target : 0;
    if (reserveNeed > 0 && liquidValue < reserveNeed && t.value >= reserveNeed) {
      out.push({
        id: "liquidez", tone: "warn", icon: "drop",
        title: "Sua reserva não está em aplicação de liquidez diária",
        text: `Você tem ${fmtBRL(t.value)} aplicados, mas só ${fmtBRL(liquidValue)} com resgate no mesmo dia; e a reserva pedida é de ${fmtBRL(reserveNeed)}. Emergência não espera cotização.`,
      });
    }
  }

  const b = model.benchmark;
  if (b && b.comparable && !b.beatsCdi) {
    out.push({
      id: "benchmark", tone: "warn", icon: "trendUp",
      title: `A carteira rendeu ${fmtNum(b.portfolioPct)}% contra ${fmtNum(b.cdiPct)}% do CDI no mesmo prazo`,
      text: "Ficar abaixo do CDI num período curto é normal em renda variável. Se isso se repetir por anos, o problema é de custo (taxa de administração) ou de escolha de produto.",
    });
  } else if (b && b.comparable && b.beatsCdi) {
    out.push({
      id: "benchmark-ok", tone: "ok", icon: "checkCircle",
      title: `Sua carteira está ${fmtNum(Math.abs(b.diffCdi))} p.p. acima do CDI no período`,
      text: `Rendeu ${fmtNum(b.portfolioPct)}% enquanto o CDI entregou ${fmtNum(b.cdiPct)}%; e ${fmtNum(b.ipcaPct)}% teriam sido só para empatar com a inflação.`,
    });
  }

  if (t.value > 0 && model.contributionThisMonth <= 0) {
    out.push({
      id: "aporte", tone: "info", icon: "piggy",
      title: "Nenhum aporte lançado neste mês",
      text: "O retorno de longo prazo vem muito mais da regularidade do aporte do que da escolha do produto. Um valor pequeno todo mês vence um valor grande de vez em quando.",
    });
  }

  const semCusto = model.items.filter((it) => !it.hasCost).length;
  if (semCusto > 0) {
    out.push({
      id: "sem-custo", tone: "info", icon: "info",
      title: `${semCusto} ${semCusto === 1 ? "aplicação está" : "aplicações estão"} sem o total aportado`,
      text: "Informando quanto saiu do seu bolso, o app passa a calcular lucro, rentabilidade e comparação com o CDI para esses itens.",
    });
  }

  return out.slice(0, 4);
}

/* -------------------------------------------------------- modelo de leitura */

function buildPortfolioModel(data, opts) {
  const months = (opts && opts.months) || 12;
  const rates = marketRatesOf(data);
  const today = todayIso();
  const assets = portfolioItems(data);
  const totalValue = sumMoney(assets, (a) => a.value);

  const items = assets
    .map((a) => portfolioItemModel(a, totalValue, rates, today))
    .sort((a, b) => b.value - a.value);

  const invested = sumMoney(items, (it) => (it.hasCost ? it.invested : 0));
  const dividends = sumMoney(items, (it) => it.dividends);
  // Só entram no lucro os itens com custo informado: misturar um item sem custo
  // faria o "lucro" da carteira ser o valor cheio da aplicação.
  const profit = sumMoney(items.filter((it) => it.hasCost), (it) => it.profit);
  const totalReturn = addMoney(profit, dividends);

  const totals = {
    count: items.length,
    value: totalValue,
    invested,
    dividends,
    profit,
    totalReturn,
    returnPct: invested > 0 ? (totalReturn / invested) * 100 : null,
    up: totalReturn >= 0,
  };

  const benchmark = portfolioBenchmark(items, totals, rates);
  totals.annualizedPct = benchmark.comparable ? benchmark.annualizedPct : null;
  totals.realPct = realReturn(totals.annualizedPct, rates.ipca);

  const series = portfolioSeries(data, months);
  const first = series[0] ? series[0].value : 0;
  const last = series[series.length - 1] ? series[series.length - 1].value : 0;

  const model = {
    rates,
    months,
    items,
    totals,
    benchmark,
    series,
    allocation: portfolioAllocation(items, totalValue),
    groups: portfolioGroups(items, totalValue),
    delta: {
      comparable: first > 0,
      value: subMoney(last, first),
      pct: first > 0 ? ((last - first) / first) * 100 : 0,
      up: last >= first,
    },
    contributionThisMonth: monthlyContribution(data),
    emergency: typeof emergencyFund === "function" ? emergencyFund(data) : null,
    hasItems: items.length > 0,
    empty: items.length === 0,
  };
  model.insights = portfolioInsights(data, model);
  return model;
}

/* Exportação para o harness de teste em Node (ignorada no navegador). */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    buildPortfolioModel, portfolioItemModel, portfolioSeries, portfolioBenchmark,
    annualizeReturn, realReturn, monthsHeldOf, monthlyContribution,
  };
}
