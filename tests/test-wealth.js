// test-wealth.js — harness do Módulo 3 (Patrimônio).
// Cobre: modelo de bens/dívidas, migração de schema v5→v6, reconstrução histórica
// pelo histórico próprio de cada item, e — o ponto mais arriscado do módulo — a
// ausência de dupla contagem entre lançamentos e cadastro.
// Ferramenta de dev: `node tests/test-wealth.js`.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const readSrc = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const ctx = { console, module: { exports: {} }, indexedDB: undefined, localStorage: undefined };
ctx.window = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);

["js/utils.js", "js/rules.js", "js/layout.js", "js/storage.js", "js/accounts.js", "js/budgets.js", "js/score.js", "js/metrics.js", "js/health.js", "js/wealth.js"]
  .forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));

// `const`/`function` de script não viram propriedades do contexto da VM.
const run = (code) => vm.runInContext(code, ctx);

const {
  buildWealthModel, makeAsset, updateAssetValue, assetValueAt, migrate, defaultData,
  netWorth, netWorthSeries, netWorthAtMonthEnd, assetsTotal, liabilitiesTotal,
  buildBackupEnvelope, parseBackupFile, mergeBackupInto, debtProfile,
} = ctx;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? ` → ${extra}` : ""}`); }
}
const near = (a, b, tol = 0.01) => Math.abs(a - b) < tol;
const iso = (d) => ctx.isoOfDate(d);
const monthsAgo = (n, day = 10) => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth() - n, day)); };
const mKeyAgo = (n) => ctx.keyOfDate(ctx.addMonths(new Date(), -n));
let seq = 0;
const tx = (p) => ctx.makeTransaction({ id: `t${++seq}`, ...p });

/* ------------------------------------------------------- 1. modelo básico */
console.log("\n1. Patrimônio líquido = bens − dívidas");
{
  const data = migrate({
    monthlyIncome: 6000,
    transactions: [
      tx({ type: "income", amount: 10000, categoryId: "salario", date: monthsAgo(0, 1) }),
      tx({ type: "expense", amount: 2000, categoryId: "moradia", date: monthsAgo(0, 2) }),
    ],
    assets: [
      makeAsset({ class: "imovel", name: "Apartamento", value: 400000 }),
      makeAsset({ class: "veiculo", name: "Carro", value: 60000 }),
      makeAsset({ class: "investimento", name: "Tesouro Selic", value: 50000 }),
      makeAsset({ class: "divida", name: "Financiamento", value: 220000, monthlyPayment: 2100 }),
    ],
  });

  const w = netWorth(data);
  check("total de bens = 510.000", near(assetsTotal(data), 510000), assetsTotal(data));
  check("total de dívidas = 220.000", near(liabilitiesTotal(data), 220000), liabilitiesTotal(data));
  check("caixa = 8.000 (lançamentos)", near(w.cash, 8000), w.cash);
  check("investimentos vêm do cadastro = 50.000", near(w.invested, 50000), w.invested);
  check("outros bens = 460.000", near(w.other, 460000), w.other);
  check("patrimônio líquido = 298.000", near(w.total, 298000), w.total);

  const m = buildWealthModel(data);
  check("composição bate com o líquido", near(m.composition.net, w.total), `${m.composition.net} vs ${w.total}`);
  check("grupos montados", m.groups.length === 4, m.groups.length);
  check("parcela mensal somada = 2.100", near(m.monthlyPayment, 2100), m.monthlyPayment);
  check("alocação ordenada por valor", m.allocation[0].id === "imovel", m.allocation[0] && m.allocation[0].id);
}

/* --------------------------------------------- 2. o risco central: dupla contagem */
console.log("\n2. Sem dupla contagem entre lançamentos e cadastro");
{
  // Aportes lançados em "investimento" + carteira cadastrada: só o cadastro vale.
  const withLedgerOnly = migrate({
    transactions: [
      tx({ type: "income", amount: 20000, categoryId: "salario", date: monthsAgo(2, 1) }),
      tx({ type: "expense", amount: 5000, categoryId: "investimento", date: monthsAgo(1, 5) }),
    ],
  });
  check("sem cadastro, investimento é estimado pelos lançamentos", near(netWorth(withLedgerOnly).invested, 5000), netWorth(withLedgerOnly).invested);

  const withRegistry = migrate({
    ...withLedgerOnly,
    assets: [makeAsset({ class: "investimento", name: "Carteira", value: 5400 })],
  });
  const w = netWorth(withRegistry);
  check("com cadastro, o valor cadastrado substitui a estimativa", near(w.invested, 5400), w.invested);
  check("a estimativa NÃO é somada por cima", near(w.total, 20000 - 5000 + 5400), w.total);

  // Conta corrente marcada como "já nos lançamentos" não soma.
  const withAccount = migrate({
    ...withLedgerOnly,
    assets: [makeAsset({ class: "conta", name: "Banco X", value: 15000, inLedger: true })],
  });
  const semConta = netWorth(withLedgerOnly).total;
  check("conta marcada como já-lançada não altera o patrimônio", near(netWorth(withAccount).total, semConta), `${netWorth(withAccount).total} vs ${semConta}`);
  check("mas continua listada para referência", buildWealthModel(withAccount).groups[0].items.length === 1);
}

console.log("\n2b. Fatura aberta reduz o patrimônio sem antecipar a saída do caixa");
{
  const today = ctx.todayIso();
  const monthKey = ctx.monthKeyOf(today);
  const account = { id: "card-account", name: "Conta", type: "corrente", openingBalance: 0, openingDate: today };
  const card = { id: "card", name: "Cartão", accountId: account.id, limit: 5000, closingDay: 20, dueDay: 28 };
  const purchases = ctx.makeInstallmentTransactions({
    type: "expense", amount: 1200, categoryId: "outros", date: today,
    payment: "Crédito", creditCardId: card.id, installmentGroupId: "purchase",
  }, 3);
  const baseData = migrate({
    version: run("SCHEMA_VERSION"),
    accounts: [account], creditCards: [card],
    transactions: [tx({ type: "income", amount: 5000, categoryId: "salario", date: today }), ...purchases],
  });
  const open = netWorth(baseData);
  check("compra não reduz o caixa imediatamente", near(open.cash, 5000), open.cash);
  check("fatura total aparece separada", near(open.cardLiabilities, 1200), open.cardLiabilities);
  check("fatura reduz o patrimônio", near(open.total, 3800), open.total);

  const statementKey = ctx.cardStatementKeyForDate(baseData.creditCards[0], today);
  const partial = migrate({ ...baseData, cardPayments: [{
    id: "partial", accountId: account.id, creditCardId: card.id,
    statementKey, amount: 400, date: today,
  }] });
  const afterPartial = netWorth(partial);
  check("pagamento parcial reduz caixa e passivo pelo mesmo valor", near(afterPartial.cash, 4600) && near(afterPartial.cardLiabilities, 800));
  check("pagamento parcial não altera o patrimônio", near(afterPartial.total, 3800), afterPartial.total);
  check("fechamento histórico também preserva o patrimônio", near(netWorthAtMonthEnd(partial, monthKey), 3800), netWorthAtMonthEnd(partial, monthKey));

  const paid = migrate({ ...baseData, cardPayments: baseData.transactions
    .filter((t) => t.creditCardId === card.id)
    .map((t, index) => ({
      id: `paid-${index}`, accountId: account.id, creditCardId: card.id,
      statementKey: ctx.cardStatementKeyForDate(baseData.creditCards[0], t.date), amount: t.amount, date: today,
    })) });
  const afterPaid = netWorth(paid);
  check("quitação zera a fatura", near(afterPaid.cardLiabilities, 0), afterPaid.cardLiabilities);
  check("quitação mantém o patrimônio", near(afterPaid.total, 3800), afterPaid.total);
}

/* -------------------------------- 3. reconstrução histórica pelo histórico do item */
console.log("\n3. Evolução usa o valor da época, não o de hoje");
{
  let carro = makeAsset({ class: "veiculo", name: "Carro", value: 70000, monthKey: mKeyAgo(5) });
  carro = updateAssetValue(carro, 66000, mKeyAgo(3));
  carro = updateAssetValue(carro, 60000, mKeyAgo(0));

  check("valor 5 meses atrás = 70.000", near(assetValueAt(carro, mKeyAgo(5)), 70000), assetValueAt(carro, mKeyAgo(5)));
  check("valor 4 meses atrás carrega o anterior", near(assetValueAt(carro, mKeyAgo(4)), 70000), assetValueAt(carro, mKeyAgo(4)));
  check("valor 3 meses atrás = 66.000", near(assetValueAt(carro, mKeyAgo(3)), 66000), assetValueAt(carro, mKeyAgo(3)));
  check("antes do cadastro o bem não existia (0)", near(assetValueAt(carro, mKeyAgo(9)), 0), assetValueAt(carro, mKeyAgo(9)));

  const data = migrate({ transactions: [], assets: [carro] });
  const s = netWorthSeries(data, 8);
  check("série de 8 pontos", s.length === 8, s.length);
  check("ponto anterior ao cadastro = 0", near(s[1].value, 0), s[1].value);
  check("ponto de 5 meses atrás = 70.000", near(s[3].value, 70000), s[3].value);
  check("ponto de hoje = 60.000", near(s[7].value, 60000), s[7].value);
  check("último ponto marcado como atual", s[7].isCurrent === true);
}

/* ------------------------------- 4. coerência entre o topo da tela e o gráfico */
console.log("\n4. Último ponto do gráfico bate com o patrimônio exibido");
{
  const data = migrate({
    transactions: [
      tx({ type: "income", amount: 9000, categoryId: "salario", date: monthsAgo(3, 1) }),
      tx({ type: "expense", amount: 1200, categoryId: "investimento", date: monthsAgo(2, 5), goalId: "g1" }),
      tx({ type: "expense", amount: 800, categoryId: "moradia", date: monthsAgo(1, 3) }),
    ],
    goals: [{ id: "g1", name: "Viagem", target: 5000, current: 1200, savedUpfront: 0 }],
    assets: [makeAsset({ class: "imovel", name: "Terreno", value: 90000, monthKey: mKeyAgo(4) })],
  });
  const m = buildWealthModel(data, 12);
  const last = m.series[m.series.length - 1].value;
  check("gráfico termina no patrimônio real", near(last, m.worth.total), `${last} vs ${m.worth.total}`);
  check("dinheiro em meta não some da série", m.worth.goals > 0 && near(m.worth.total, 9000 - 800 + 90000), m.worth.total);
}

/* --------------------------------------------------- 5. comparação anual */
console.log("\n5. Comparação anual");
{
  const data = migrate({
    transactions: [tx({ type: "income", amount: 5000, categoryId: "salario", date: monthsAgo(14, 1) })],
    assets: [makeAsset({ class: "investimento", name: "CDB", value: 20000, monthKey: mKeyAgo(14) })],
  });
  const m = buildWealthModel(data, 12);
  check("comparação ano a ano disponível", Array.isArray(m.annual.years) && m.annual.years.length > 0, m.annual.years.length);
  check("ano corrente marcado", m.annual.years.some((y) => y.isCurrent));
  check("variação 12m calculada", typeof m.annual.yoy.pct === "number" && Number.isFinite(m.annual.yoy.pct), m.annual.yoy.pct);
  check("nenhum valor NaN na comparação", m.annual.years.every((y) => Number.isFinite(y.value) && Number.isFinite(y.delta.pct)));
}

/* --------------------------------------- 6. migração de schema v5 → v6 */
console.log("\n6. Migração: base antiga (sem 'assets') continua íntegra");
{
  const antiga = {
    version: 5,
    transactions: [tx({ type: "income", amount: 3000, categoryId: "salario", date: monthsAgo(0, 1) })],
    goals: [{ id: "g", name: "Reserva", target: 10000, current: 2000, savedUpfront: 2000 }],
    monthlyIncome: 3000,
  };
  const m = migrate(antiga);
  // A base antiga é migrada até o schema CORRENTE, não até a v6 — o número sobe a
  // cada módulo e prender o teste a ele quebraria o harness sem nenhum bug real.
  check("versão sobe para o schema corrente", m.version === run("SCHEMA_VERSION"), m.version);
  check("coleção assets criada vazia", Array.isArray(m.assets) && m.assets.length === 0);
  check("lançamento existente preservado e contrapartida criada", m.transactions.length === 2);
  check("metas preservadas", m.goals.length === 1 && near(m.goals[0].current, 2000));
  const seed = m.transactions.find((t) => t.id === "goal-upfront:g");
  check("contrapartida usa id determinístico e o valor inicial", !!seed && seed.amount === 2000 && seed.goalId === "g", JSON.stringify(seed));
  check("valor inicial não aumenta o patrimônio", near(netWorth(m).total, 3000), netWorth(m).total);
  const again = migrate(m);
  check("repetir a migração não duplica a contrapartida", again.transactions.filter((t) => t.id === "goal-upfront:g").length === 1);

  const preV3 = migrate({
    version: 2,
    transactions: [tx({ type: "income", amount: 5000, categoryId: "salario", date: monthsAgo(0, 1) })],
    goals: [{ id: "antiga", name: "Meta antiga", target: 5000, current: 2000, savedUpfront: 2000 }],
  });
  check("base anterior à v3 mantém apenas o ajuste legado", preV3.transactions.filter((t) => t.goalId === "antiga").length === 1);
  check("ajuste legado também mantém o patrimônio inalterado", near(netWorth(preV3).total, 5000), netWorth(preV3).total);

  // Base com assets corrompidos não pode derrubar a migração.
  const suja = migrate({
    version: 5,
    assets: [null, { name: "" }, { id: "a", class: "inexistente", name: "X", value: "abc" }, { id: "a", class: "imovel", name: "Dup", value: 10 }],
  });
  check("itens inválidos são saneados, não propagados", suja.assets.every((a) => a && a.id && Number.isFinite(a.value)), JSON.stringify(suja.assets));
  check("ids duplicados removidos", new Set(suja.assets.map((a) => a.id)).size === suja.assets.length);
  check("classe desconhecida vira classe válida", suja.assets.every((a) => run("ASSET_CLASSES").some((c) => c.id === a.class)));
}

/* -------------------------------------- 7. backup carrega o patrimônio */
console.log("\n7. Backup exporta, valida e mescla os bens");
{
  const data = migrate({
    transactions: [tx({ type: "income", amount: 1000, categoryId: "salario", date: monthsAgo(0, 1) })],
    assets: [makeAsset({ id: "a1", class: "imovel", name: "Casa", value: 300000 })],
  });
  const envelope = buildBackupEnvelope(data);
  check("envelope conta os bens", envelope.counts.assets === 1, envelope.counts.assets);

  const restored = parseBackupFile(JSON.stringify(envelope));
  check("checksum confere após incluir assets", restored.meta.checksumOk === true);
  check("bens voltam na restauração", restored.data.assets.length === 1 && near(restored.data.assets[0].value, 300000));

  const outro = migrate({ assets: [makeAsset({ id: "a2", class: "veiculo", name: "Moto", value: 15000 })] });
  const merged = mergeBackupInto(outro, restored.data);
  check("mesclagem soma os dois cadastros", merged.data.assets.length === 2, merged.data.assets.length);
  check("estatística de mesclagem reportada", merged.stats.assets === 1, merged.stats.assets);
}

/* --------------------------- 8. dívida cadastrada alimenta a Saúde Financeira */
console.log("\n8. Integração com o Módulo 2 (indicador de Dívidas)");
{
  const data = migrate({
    monthlyIncome: 5000,
    transactions: [tx({ type: "income", amount: 5000, categoryId: "salario", date: monthsAgo(0, 1) })],
    assets: [makeAsset({ class: "divida", name: "Financiamento", value: 180000, monthlyPayment: 1500 })],
  });
  const d = debtProfile(data, ctx.keyOfDate(new Date()));
  check("saldo devedor cadastrado entra na dívida total", near(d.outstanding, 180000), d.outstanding);
  check("parcela mensal entra no comprometimento", near(d.monthlyBurden, 1500), d.monthlyBurden);
  check("comprometimento = 30% da renda", near(d.burdenPct, 30, 0.1), d.burdenPct);

  ctx.__data = data;
  const h = run("buildHealthModel(__data)");
  const dividas = h.indicators.find((i) => i.id === "dividas");
  check("indicador reflete o financiamento", dividas.description.includes("financiamentos cadastrados"), dividas.description);
}

/* ------------------------------------------------- 9. robustez e base vazia */
console.log("\n9. Base vazia e dados inválidos");
{
  const vazio = defaultData();
  const m = buildWealthModel(vazio);
  check("modelo é construído", !!m && m.empty === true);
  check("série sem NaN", m.series.every((p) => Number.isFinite(p.value)));
  check("sem grupos", m.groups.length === 0);
  check("insights não quebram", Array.isArray(m.insights));

  let ok = true, err = null;
  try {
    buildWealthModel(migrate({
      transactions: [{ id: "x", type: "expense", amount: "abc", date: "0000-00-00", categoryId: "outros" }],
      assets: [makeAsset({ class: "imovel", name: "X", value: NaN })],
    }), 24);
  } catch (e) { ok = false; err = e.message; }
  check("dados sujos não lançam exceção", ok, err);
}

/* ------------------------------------------------- 10. histórico de contas */
console.log("\n10. Histórico inclui abertura e conciliações de contas");
{
  const data = migrate({
    accounts: [{
      id: "conta-historica", name: "Conta histórica", type: "checking",
      openingBalance: 1000, openingDate: "2026-01-10", color: "#2563eb",
    }],
    transactions: [
      tx({ type: "expense", amount: 100, categoryId: "mercado", date: "2025-12-20", accountId: "conta-historica" }),
      tx({ type: "income", amount: 500, categoryId: "salario", date: "2026-02-05", accountId: "conta-historica" }),
    ],
    accountAdjustments: [{
      id: "ajuste-historico", accountId: "conta-historica", amount: 200,
      date: "2026-03-01", note: "Conciliação", createdAt: "2026-03-01T12:00:00.000Z",
    }],
  });
  check("antes da abertura a conta vale zero", near(netWorthAtMonthEnd(data, "2025-12"), 0), netWorthAtMonthEnd(data, "2025-12"));
  check("mês da abertura inclui o saldo inicial", near(netWorthAtMonthEnd(data, "2026-01"), 1000), netWorthAtMonthEnd(data, "2026-01"));
  check("lançamento posterior entra no mês correto", near(netWorthAtMonthEnd(data, "2026-02"), 1500), netWorthAtMonthEnd(data, "2026-02"));
  check("conciliação altera a série a partir da data", near(netWorthAtMonthEnd(data, "2026-03"), 1700), netWorthAtMonthEnd(data, "2026-03"));
}

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} — ${pass} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
