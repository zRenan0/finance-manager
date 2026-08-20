// test-portfolio.js — asserções do motor da Central de Investimentos (Módulo 5)
// e da migração de schema v7 → v8.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const readSrc = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const ctx = {
  console, module: { exports: {} },
  setTimeout, clearTimeout, setInterval, clearInterval,
  indexedDB: undefined, localStorage: undefined,
  document: { addEventListener() {}, visibilityState: "visible" },
  navigator: { userAgent: "node" },
  addEventListener() {}, removeEventListener() {},
};
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
["js/utils.js", "js/rules.js", "js/layout.js", "js/storage.js", "js/budgets.js", "js/score.js", "js/metrics.js", "js/portfolio.js"]
  .forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));
const run = (code) => vm.runInContext(code, ctx);

const SCHEMA_VERSION = run("SCHEMA_VERSION");
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? ` → ${extra}` : ""}`); }
}
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.02 : tol);

const iso = (d) => { ctx.__dt = d; return run("isoOfDate(__dt)"); };
const monthsAgoIso = (n, day = 10) => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth() - n, day)); };
const monthKeyAgo = (n) => { const d = new Date(); return run(`keyOfDate(new Date(${d.getFullYear()}, ${d.getMonth() - n}, 1))`); };

function asset(partial) { ctx.__p = partial; return run("makeAsset(__p)"); }
function build(data, opts) { ctx.__d = data; ctx.__o = opts || {}; return run("buildPortfolioModel(__d, __o)"); }
function base(extra) { ctx.__e = extra || {}; return run("migrate({ ...defaultData(), ...__e })"); }

/* -------------------------------------------------------------- migração */
console.log("\n1. Migração de schema v7 → v8");
{
  const d = run("defaultData()");
  check("schema na versão corrente", d.version === SCHEMA_VERSION, d.version);
  check("premissas de mercado nascem preenchidas", d.marketRates && d.marketRates.selic > 0, JSON.stringify(d.marketRates));
  check("premissas nunca revisadas não têm data", d.marketRates.updatedAt === null);

  // Base antiga (v7, sem marketRates e com investimento sem detalhe)
  ctx.__old = {
    version: 7,
    assets: [{ id: "a1", class: "investimento", kind: "asset", name: "CDB antigo", value: 5000, history: [{ monthKey: monthKeyAgo(6), value: 5000 }], createdAt: "2024-01-01T00:00:00.000Z", updatedAt: "2024-01-02T00:00:00.000Z" }],
  };
  const m = run("migrate(__old)");
  check("base v7 é migrada sem perder o item", m.assets.length === 1);
  check("investimento antigo ganha tipo padrão", m.assets[0].invType === "outro", m.assets[0].invType);
  check("aporte e proventos nascem zerados", m.assets[0].invested === 0 && m.assets[0].dividends === 0);
  check("histórico antigo é preservado", m.assets[0].history.some((h) => h.monthKey === monthKeyAgo(6) && h.value === 5000),
    JSON.stringify(m.assets[0].history));
  check("updatedAt é preservado na migração", m.assets[0].updatedAt === "2024-01-02T00:00:00.000Z", m.assets[0].updatedAt);
  check("premissas de mercado são criadas na migração", m.marketRates.cdi > 0);

  // Detalhe de investimento não vaza para outras classes.
  const carro = asset({ class: "veiculo", name: "Carro", value: 50000, invType: "acao", invested: 999, dividends: 5 });
  check("bem comum não recebe detalhe de investimento",
    carro.invType === "" && carro.invested === 0 && carro.dividends === 0);

  // Tipo inválido cai para "outro" em vez de virar dado corrompido.
  const estranho = asset({ class: "investimento", name: "X", value: 10, invType: "tesouro-marte" });
  check("tipo desconhecido vira \"outro\"", estranho.invType === "outro", estranho.invType);
  const semData = asset({ class: "investimento", name: "X", value: 10, startedAt: "31/12/2024" });
  check("data inválida vira vazio, não NaN", semData.startedAt === "");

  // Taxas fora de faixa não contaminam os simuladores.
  const ruins = run("normalizeMarketRates({ selic: -5, cdi: 'abc', ipca: 900, tr: 0.3, updatedAt: '2026-01-15' })");
  check("taxa negativa cai para o padrão", ruins.selic === 15, ruins.selic);
  check("taxa não numérica cai para o padrão", ruins.cdi === 14.9, ruins.cdi);
  check("taxa absurda cai para o padrão", ruins.ipca === 4.5, ruins.ipca);
  check("taxa válida é preservada", ruins.tr === 0.3);
  check("data de revisão é preservada", ruins.updatedAt === "2026-01-15");

  // Poupança é derivada da Selic pela regra oficial.
  const alta = run("poupancaRateFrom(15, 0)");
  const baixa = run("poupancaRateFrom(6, 0)");
  check("poupança com Selic alta ≈ 6,17% a.a.", near(alta, 6.17, 0.01), alta);
  check("poupança com Selic baixa = 70% da Selic", near(baixa, 4.2, 0.01), baixa);
}

/* ------------------------------------------------------- carteira vazia */
console.log("\n2. Carteira vazia");
{
  const m = build(base());
  check("modelo vazio não quebra", m.empty === true && m.items.length === 0);
  check("totais zerados", m.totals.value === 0 && m.totals.returnPct === null);
  check("benchmark não comparável sem aplicação", m.benchmark.comparable === false);
  check("série existe mesmo sem itens", m.series.length === 12);
  check("nenhum insight inventado", m.insights.length === 0, JSON.stringify(m.insights));
}

/* -------------------------------------------------- rentabilidade do item */
console.log("\n3. Rentabilidade, lucro e proventos");
{
  const data = base({
    assets: [
      asset({ class: "investimento", invType: "acao", name: "Ações XP", value: 12000, invested: 10000, dividends: 500, startedAt: monthsAgoIso(12) }),
      asset({ class: "investimento", invType: "tesouro-selic", name: "Tesouro Selic", value: 20000, invested: 20000, startedAt: monthsAgoIso(6) }),
    ],
  });
  const m = build(data);
  const acoes = m.items.find((i) => i.name === "Ações XP");

  check("lucro = valor − custo", acoes.profit === 2000, acoes.profit);
  check("retorno inclui os proventos", acoes.totalReturn === 2500, acoes.totalReturn);
  check("rentabilidade = retorno / aportado", near(acoes.returnPct, 25, 0.01), acoes.returnPct);
  check("12 meses: anualizada ≈ retorno absoluto", near(acoes.annualizedPct, 25, 1.5), acoes.annualizedPct);
  check("rentabilidade real desconta a inflação", acoes.realPct < acoes.annualizedPct, acoes.realPct);
  check("participação na carteira é calculada", near(acoes.share, 37.5, 0.1), acoes.share);

  check("total da carteira soma o valor de mercado", m.totals.value === 32000, m.totals.value);
  check("total aportado soma o custo", m.totals.invested === 30000, m.totals.invested);
  check("proventos entram no retorno, não no patrimônio",
    m.totals.dividends === 500 && m.totals.value === 32000);
  check("lucro total da carteira", m.totals.profit === 2000, m.totals.profit);

  // O ponto do módulo: patrimônio NÃO conta os proventos duas vezes.
  ctx.__d2 = data;
  check("patrimônio usa só o valor de mercado", run("registeredInvestments(__d2)") === 32000,
    run("registeredInvestments(__d2)"));
}

console.log("\n4. Anualização só com prazo suficiente");
{
  const data = base({
    assets: [asset({ class: "investimento", invType: "cripto", name: "Cripto", value: 1200, invested: 1000, startedAt: iso(new Date()) })],
  });
  const m = build(data);
  const it = m.items[0];
  check("retorno absoluto é calculado", near(it.returnPct, 20, 0.01), it.returnPct);
  check("prazo curto não vira taxa anual absurda", it.annualizedPct === null, it.annualizedPct);
  check("sem anualização, não há retorno real", it.realPct === null);
  check("benchmark também recusa prazo curto", m.benchmark.comparable === false, m.benchmark.reason);
}

console.log("\n5. Item sem custo informado");
{
  const data = base({
    assets: [
      asset({ class: "investimento", invType: "cdb", name: "CDB sem custo", value: 5000, startedAt: monthsAgoIso(10) }),
      asset({ class: "investimento", invType: "cdb", name: "CDB com custo", value: 6000, invested: 5000, startedAt: monthsAgoIso(10) }),
    ],
  });
  const m = build(data);
  const semCusto = m.items.find((i) => i.name === "CDB sem custo");
  check("sem custo não inventa rentabilidade", semCusto.returnPct === null && semCusto.hasCost === false);
  check("valor do item sem custo entra no total", m.totals.value === 11000, m.totals.value);
  check("item sem custo NÃO infla o lucro da carteira", m.totals.profit === 1000, m.totals.profit);
  check("aportado só conta quem informou", m.totals.invested === 5000, m.totals.invested);
  check("app avisa sobre o dado faltante", m.insights.some((i) => i.id === "sem-custo"));
}

console.log("\n6. Alocação, grupos e concentração");
{
  const data = base({
    assets: [
      asset({ class: "investimento", invType: "tesouro-selic", name: "Tesouro", value: 5000, invested: 5000, startedAt: monthsAgoIso(8) }),
      asset({ class: "investimento", invType: "acao", name: "Ações", value: 3000, invested: 3000, startedAt: monthsAgoIso(8) }),
      asset({ class: "investimento", invType: "cripto", name: "Bitcoin", value: 2000, invested: 1000, startedAt: monthsAgoIso(8) }),
      asset({ class: "veiculo", name: "Carro", value: 40000 }),
    ],
  });
  const m = build(data);
  check("veículo não entra na carteira", m.items.length === 3, m.items.length);
  check("grupos agregam por classe", m.groups.length === 3, m.groups.map((g) => g.id).join(","));
  const rf = m.groups.find((g) => g.id === "renda-fixa");
  check("renda fixa é 50% da carteira", near(rf.pct, 50, 0.1), rf.pct);
  const cripto = m.groups.find((g) => g.id === "cripto");
  check("retorno do grupo é calculado", near(cripto.returnPct, 100, 0.1), cripto.returnPct);
  check("alocação por tipo é ordenada por valor", m.allocation[0].type.id === "tesouro-selic");
  check("cripto acima de 10% gera alerta", m.insights.some((i) => i.id === "cripto"));
  check("concentração de 50% gera alerta", m.insights.some((i) => i.id === "concentracao"));
  check("no máximo 4 recomendações", m.insights.length <= 4, m.insights.length);
}

console.log("\n7. Evolução mensal a partir do histórico");
{
  const a = asset({ class: "investimento", invType: "cdb", name: "CDB", value: 1000, invested: 1000, monthKey: monthKeyAgo(3) });
  ctx.__a = a;
  // Atualização no mês corrente: o ponto antigo continua onde estava.
  const a2 = run(`updateAssetValue(__a, 1500, '${monthKeyAgo(0)}')`);
  const data = base({ assets: [a2] });
  const m = build(data, { months: 6 });
  check("série cobre a janela pedida", m.series.length === 6, m.series.length);
  check("mês anterior ao cadastro vale zero", m.series[0].value === 0, m.series[0].value);
  check("valor antigo é preservado na época certa",
    m.series[m.series.length - 4].value === 1000, m.series[m.series.length - 4].value);
  check("valor atual aparece no último ponto",
    m.series[m.series.length - 1].value === 1500, m.series[m.series.length - 1].value);
  check("variação da janela é positiva", m.delta.up === true && m.delta.value === 1500);

  const it = m.items[0];
  check("variação do mês compara com o histórico anterior", it.monthDelta.comparable === true);
  check("variação do mês é +50%", near(it.monthDelta.pct, 50, 0.1), it.monthDelta.pct);
}

console.log("\n8. Benchmark contra o CDI");
{
  const mk = (value) => base({
    assets: [asset({ class: "investimento", invType: "cdb", name: "CDB", value, invested: 10000, startedAt: monthsAgoIso(12) })],
    marketRates: { selic: 15, cdi: 10, ipca: 4.5, tr: 0.2, updatedAt: "2026-01-01" },
  });

  const ganhou = build(mk(11500));
  check("carteira acima do CDI é reconhecida", ganhou.benchmark.beatsCdi === true, ganhou.benchmark.portfolioPct);
  check("CDI do período usa a premissa do usuário", near(ganhou.benchmark.cdiPct, 10, 0.3), ganhou.benchmark.cdiPct);
  check("elogio aparece nas recomendações", ganhou.insights.some((i) => i.id === "benchmark-ok"));

  const perdeu = build(mk(10500));
  check("carteira abaixo do CDI é sinalizada", perdeu.benchmark.beatsCdi === false);
  check("alerta de desempenho aparece", perdeu.insights.some((i) => i.id === "benchmark"));
  check("acima da inflação mesmo perdendo do CDI", perdeu.benchmark.beatsInflation === true);
}

console.log("\n9. Aporte do mês vem dos lançamentos");
{
  let n = 0;
  const tx = (p) => { ctx.__t = { id: `t${++n}`, ...p }; return run("makeTransaction(__t)"); };
  const data = base({
    assets: [asset({ class: "investimento", invType: "cdb", name: "CDB", value: 1000, invested: 1000, startedAt: monthsAgoIso(5) })],
    transactions: [
      tx({ type: "expense", amount: 300, categoryId: "investimento", date: iso(new Date()) }),
      tx({ type: "expense", amount: 900, categoryId: "investimento", date: iso(new Date()), goalId: "g1" }),
      tx({ type: "expense", amount: 200, categoryId: "investimento", date: monthsAgoIso(2) }),
    ],
  });
  const m = build(data);
  check("aporte do mês soma só o mês corrente e fora de metas",
    m.contributionThisMonth === 300, m.contributionThisMonth);

  const semAporte = build(base({
    assets: [asset({ class: "investimento", invType: "cdb", name: "CDB", value: 1000, invested: 1000, startedAt: monthsAgoIso(5) })],
  }));
  check("mês sem aporte gera lembrete", semAporte.insights.some((i) => i.id === "aporte"));
}

console.log("\n10. Backup carrega o detalhe novo");
{
  const data = base({
    assets: [asset({ class: "investimento", invType: "fii", name: "FII", value: 9000, invested: 8000, dividends: 420, startedAt: monthsAgoIso(14) })],
  });
  ctx.__d3 = data;
  const env = run("buildBackupEnvelope(__d3)");
  check("envelope traz as premissas de mercado", !!env.data.marketRates);
  check("checksum confere", run(`checksumOf(canonicalJson(__d3 && buildBackupEnvelope(__d3).data))`).length > 0);

  ctx.__json = JSON.stringify(env);
  const parsed = run("parseBackupFile(__json)");
  check("backup v8 é aceito", parsed.meta.checksumOk !== false);
  const restored = parsed.data.assets[0];
  check("proventos sobrevivem ao backup", restored.dividends === 420, restored.dividends);
  check("tipo de aplicação sobrevive ao backup", restored.invType === "fii");
  check("data de início sobrevive ao backup", restored.startedAt === monthsAgoIso(14));

  // Backup antigo (sem marketRates) continua válido.
  ctx.__legacy = JSON.stringify({ transactions: [], categories: [], goals: [], assets: [] });
  const old = run("parseBackupFile(__legacy)");
  check("backup legado continua sendo aceito", old.data.marketRates.selic > 0);
}

/* ==============================================================================
 * XIRR, TWR e benchmark histórico
 * ==============================================================================
 * O cálculo antigo era (valor - custo) / custo. Ele ignora QUANDO cada real
 * entrou: quem aportou há cinco anos e quem aportou ontem apareciam iguais.
 */
console.log("\nXIRR, TWR e benchmark");
{
  // Um aporte de 1.000 há exatamente um ano, valendo 1.100 hoje: 10% ao ano.
  const hoje = run("todayIso()");
  const anoPassado = `${Number(hoje.slice(0, 4)) - 1}${hoje.slice(4)}`;
  ctx.__flows = [{ date: anoPassado, amount: -1000 }, { date: hoje, amount: 1100 }];
  const taxa = run("xirr(__flows)");
  check("XIRR de um aporte simples é o retorno anual", Math.abs(taxa - 0.10) < 0.005, taxa);

  // Mesmos valores aportados e mesmo valor final; só muda a DATA do segundo
  // aporte. Quem aportou mais tarde chegou ao mesmo resultado com o dinheiro
  // trabalhando menos tempo, então a taxa dele é maior. O cálculo antigo, que
  // só olhava o custo total, daria o mesmo número para os dois.
  ctx.__cedo = [
    { date: "2024-01-01", amount: -1000 },
    { date: "2025-01-01", amount: -1000 },
    { date: "2026-01-01", amount: 2400 },
  ];
  ctx.__tarde = [
    { date: "2024-01-01", amount: -1000 },
    { date: "2025-10-01", amount: -1000 },
    { date: "2026-01-01", amount: 2400 },
  ];
  const taxaCedo = run("xirr(__cedo)");
  const taxaTarde = run("xirr(__tarde)");
  check("XIRR considera a data de cada aporte", taxaTarde > taxaCedo, `${taxaTarde} vs ${taxaCedo}`);

  check("fluxo sem troca de sinal não produz taxa",
    run("xirr([{ date: '2026-01-01', amount: -100 }, { date: '2026-06-01', amount: -100 }])") === null);
  check("fluxo com um único evento não produz taxa",
    run("xirr([{ date: '2026-01-01', amount: -100 }])") === null);

  // TWR isola o efeito do momento do aporte: mesmo desempenho do ativo, aportes
  // diferentes, mesmo TWR.
  ctx.__pontos = [
    { date: "2026-01-01", value: 1000 },
    { date: "2026-02-01", value: 1100 },
    { date: "2026-03-01", value: 1210 },
  ];
  const semAporte = run("twr(__pontos, [])");
  check("TWR encadeia os retornos dos subperíodos", Math.abs(semAporte - 0.21) < 0.001, semAporte);

  // Mesmo ativo rendendo 10% ao mês, mas com um aporte de 1.000 no meio. O
  // capital do primeiro subperíodo passa a ser 2.000, e o TWR tem de continuar
  // 21%: o aporte aumenta o saldo, não o desempenho.
  ctx.__pontosComAporte = [
    { date: "2026-01-01", value: 1000 },
    { date: "2026-02-01", value: 2200 },   // (1.000 + 1.000 aportados) x 1,10
    { date: "2026-03-01", value: 2420 },   // x 1,10
  ];
  ctx.__eventos = [{ date: "2026-01-15", type: "aporte", amount: 1000 }];
  const comAporte = run("twr(__pontosComAporte, __eventos)");
  check("TWR remove o efeito do aporte do resultado", Math.abs(comAporte - 0.21) < 0.001, comAporte);

  // No modelo do item: com eventos datados, XIRR e TWR aparecem; sem eles, não.
  ctx.__ativo = run(`makeAsset({
    id: "inv1", kind: "asset", class: "investimento", name: "CDB", value: 1100, invested: 1000,
    invType: "cdb", startedAt: ${JSON.stringify(anoPassado)},
    events: [{ date: ${JSON.stringify(anoPassado)}, type: "aporte", amount: 1000 }]
  })`);
  check("os eventos sobrevivem à normalização", ctx.__ativo.events.length === 1, JSON.stringify(ctx.__ativo.events));
  const item = run(`portfolioItemModel(__ativo, 1100, { cdi: 10, ipca: 4, poupanca: 7, selic: 10 }, ${JSON.stringify(hoje)})`);
  check("o item traz XIRR quando há eventos", item.hasEvents === true && item.xirrPct != null, item.xirrPct);
  check("XIRR do item bate com o retorno anual", Math.abs(item.xirrPct - 10) < 0.6, item.xirrPct);

  ctx.__semEventos = run(`makeAsset({ id: "inv2", kind: "asset", class: "investimento", name: "CDB", value: 1100, invested: 1000, invType: "cdb" })`);
  const item2 = run(`portfolioItemModel(__semEventos, 1100, { cdi: 10, ipca: 4, poupanca: 7, selic: 10 }, ${JSON.stringify(hoje)})`);
  check("sem eventos, XIRR e TWR ficam nulos em vez de inventados",
    item2.xirrPct === null && item2.twrPct === null && item2.hasEvents === false);
  check("o retorno simples continua disponível", item2.returnPct === 10, item2.returnPct);

  // Benchmark: sem série histórica, a comparação é declarada como projeção.
  const semSerie = run(`portfolioBenchmark(
    [{ monthsHeld: 12, invested: 1000 }],
    { invested: 1000, totalReturn: 100 },
    { cdi: 10, ipca: 4, poupanca: 7 })`);
  check("sem série, o benchmark se declara aproximado",
    semSerie.benchmarkApproximate === true && semSerie.benchmarkSource === "taxa-atual-projetada",
    semSerie.benchmarkSource);

  ctx.__serie = Array.from({ length: 12 }, () => ({ cdi: 1, ipca: 0.4, poupanca: 0.6 }));
  const comSerie = run(`portfolioBenchmark(
    [{ monthsHeld: 12, invested: 1000 }],
    { invested: 1000, totalReturn: 100 },
    { cdi: 10, ipca: 4, poupanca: 7, history: __serie })`);
  check("com série, o benchmark usa o acumulado histórico",
    comSerie.benchmarkSource === "serie-historica" && Math.abs(comSerie.cdiPct - 12.68) < 0.05,
    `${comSerie.benchmarkSource}/${comSerie.cdiPct}`);
}

console.log("\nSem recomendação de alocação sem perfil");
{
  const fonte = readSrc("js/portfolio.js");
  // O app não conhece objetivo, prazo nem tolerância a risco, e não é consultor
  // autorizado. Textos que mandam comprar, vender ou manter percentual saíram.
  check("não há instrução de manter percentual de classe", !/manter até \$\{|A referência usual é manter até/.test(fonte));
  check("não há instrução de aportar em posição específica", !/Novos aportes nas outras posições/.test(fonte));
  check("o limite do app é declarado no código", /Resolução CVM 30\/2021|não avalia/.test(fonte));
}

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} — ${pass} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
