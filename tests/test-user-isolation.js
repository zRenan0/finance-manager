// test-user-isolation.js; isolamento do armazenamento por conta.
// ------------------------------------------------------------------------------
// O que este teste protege, em ordem de gravidade:
//
//   1. Vazamento entre contas. Duas contas no mesmo navegador não podem ler nem
//      gravar os mesmos registros. Este era o pior defeito do app: havia UM
//      banco por navegador, então quem entrasse depois via o extrato de quem
//      entrou antes.
//   2. Logout. Sair da conta tem de descarregar os dados dela da memória e do
//      banco ativo, não apenas trocar o rótulo da tela.
//   3. Adoção só com consentimento. Dados de visitante entram numa conta
//      apenas quando alguém pede; nunca por efeito colateral do login.
//   4. Compatibilidade. Quem já usava o app sem conta continua achando os
//      dados no lugar de sempre (o escopo visitante mantém os nomes antigos).
"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

let ok = 0;
let fail = 0;
function check(label, condition, detail) {
  if (condition) { ok++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail == null ? "" : `: ${detail}`}`); }
}

const FONTES = ["js/utils.js", "js/perf.js", "js/router.js", "js/icons.js", "js/rules.js",
  "js/layout.js", "js/safe-errors.js", "js/storage.js"];

// localStorage de mentira, com a chave visível para o teste inspecionar. Sem
// IndexedDB no contexto, o FinanceStore cai no LocalStorageAdapter, que usa
// exatamente a mesma função de escopo.
function fakeLocalStorage() {
  const map = new Map();
  return {
    _map: map,
    getItem: (k) => (map.has(String(k)) ? map.get(String(k)) : null),
    setItem: (k, v) => { map.set(String(k), String(v)); },
    removeItem: (k) => { map.delete(String(k)); },
    key: (i) => Array.from(map.keys())[i] || null,
    get length() { return map.size; },
  };
}

function carregar(storage) {
  const ctx = {
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: storage, crypto, URL,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  FONTES.forEach((file) => vm.runInContext(read(file), ctx, { filename: file }));
  ctx.run = (code) => vm.runInContext(code, ctx);
  return ctx;
}

// O FinanceStore agenda a gravação com setTimeout(80); `flush()` força.
const flush = (ctx) => ctx.run("FinanceStore.flush()");

(async () => {
  console.log("\n1. Nomes de escopo");
  {
    const ctx = carregar(fakeLocalStorage());
    check("conta vira escopo próprio", ctx.run(`storageScopeFor("11111111-2222-3333-4444-555555555555")`) === "u_11111111-2222-3333-4444-555555555555");
    check("sem conta é visitante", ctx.run(`storageScopeFor("")`) === "guest");
    check("contas diferentes, escopos diferentes", ctx.run(`storageScopeFor("aaa") !== storageScopeFor("bbb")`));
    check("caractere perigoso é removido do nome do banco", ctx.run(`storageScopeFor("../../outra")`) === "u_outra");
    check("escopo inválido cai para visitante", ctx.run(`normalizeStorageScope("u_../evil")`) === "guest");

    // Compatibilidade: quem já tinha dados abriu o banco "financas_db". Se o
    // escopo visitante mudasse de nome, esse histórico sumiria da tela.
    check("visitante mantém o nome histórico do banco", ctx.run(`scopedName("financas_db", "guest")`) === "financas_db");
    check("conta ganha banco separado", ctx.run(`scopedName("financas_db", "u_abc")`) === "financas_db__u_abc");
    check("espelho também é separado", ctx.run(`scopedName("financas_db_mirror", "u_abc")`) === "financas_db_mirror__u_abc");
  }

  console.log("\n2. Duas contas no mesmo navegador não se enxergam");
  {
    const storage = fakeLocalStorage();
    const ctx = carregar(storage);

    // Conta A grava um lançamento.
    await ctx.run(`FinanceStore.init(new LocalStorageAdapter("u_ana"), { scope: "u_ana" })`);
    ctx.run(`FinanceStore.persist({ ...FinanceStore.snapshot(), transactions: [
      { id: "tx-ana", type: "expense", amount: 100, date: "2026-08-01", categoryId: "mercado", updatedAt: "2026-08-01T10:00:00.000Z" }] })`);
    await flush(ctx);
    check("conta A gravou", ctx.run(`FinanceStore.snapshot().transactions.length`) === 1);

    // Conta B entra no mesmo navegador.
    await ctx.run(`FinanceStore.switchScope("u_bruno", new LocalStorageAdapter("u_bruno"))`);
    check("conta B não vê o lançamento de A", ctx.run(`FinanceStore.snapshot().transactions.length`) === 0);
    check("escopo ativo é o de B", ctx.run(`FinanceStore.scope()`) === "u_bruno");

    ctx.run(`FinanceStore.persist({ ...FinanceStore.snapshot(), transactions: [
      { id: "tx-bruno", type: "income", amount: 5000, date: "2026-08-05", updatedAt: "2026-08-05T10:00:00.000Z" }] })`);
    await flush(ctx);

    // A volta e encontra o que era dela, sem nada de B.
    await ctx.run(`FinanceStore.switchScope("u_ana", new LocalStorageAdapter("u_ana"))`);
    const idsDeA = ctx.run(`FinanceStore.snapshot().transactions.map((t) => t.id).join(",")`);
    check("conta A reencontra o próprio lançamento", idsDeA === "tx-ana", idsDeA);
    check("conta A não recebeu o de B", !idsDeA.includes("tx-bruno"), idsDeA);

    // As duas bases coexistem em chaves distintas.
    const chaves = Array.from(storage._map.keys());
    check("cada conta tem sua chave física", chaves.includes("financas_db_fallback__u_ana") && chaves.includes("financas_db_fallback__u_bruno"), chaves.join(" | "));
    check("espelho de A não é o de B", chaves.includes("financas_db_mirror__u_ana") && chaves.includes("financas_db_mirror__u_bruno"));
  }

  console.log("\n3. Logout descarrega os dados da conta");
  {
    const ctx = carregar(fakeLocalStorage());
    await ctx.run(`FinanceStore.init(new LocalStorageAdapter("u_ana"), { scope: "u_ana" })`);
    ctx.run(`FinanceStore.persist({ ...FinanceStore.snapshot(), transactions: [
      { id: "tx-ana", type: "expense", amount: 100, date: "2026-08-01", updatedAt: "2026-08-01T10:00:00.000Z" }] })`);
    await flush(ctx);

    await ctx.run(`FinanceStore.switchScope("guest", new LocalStorageAdapter("guest"))`);
    check("após sair, a memória não tem o lançamento da conta", ctx.run(`FinanceStore.snapshot().transactions.length`) === 0);
    check("após sair, o escopo é o de visitante", ctx.run(`FinanceStore.scope()`) === "guest");
    // O espelho é o caminho por onde um dado voltaria sozinho no boot seguinte.
    check("o espelho lido é o do visitante, não o da conta", ctx.run(`
      const m = localStorage.getItem("financas_db_mirror");
      !m || JSON.parse(m).data.transactions.length === 0`));
  }

  console.log("\n4. Dados de visitante não entram na conta sozinhos");
  {
    const storage = fakeLocalStorage();
    // Base antiga de quem usava o app sem conta.
    storage.setItem("financas_pro_v2", JSON.stringify({
      version: 22, categories: [], goals: [], assets: [],
      transactions: [{ id: "tx-visitante", type: "expense", amount: 42, date: "2026-07-10", updatedAt: "2026-07-10T10:00:00.000Z" }],
    }));
    const ctx = carregar(storage);

    // Entrar numa conta NÃO pode puxar essa base.
    await ctx.run(`FinanceStore.init(new LocalStorageAdapter("u_ana"), { scope: "u_ana" })`);
    check("login não importa o histórico de visitante", ctx.run(`FinanceStore.snapshot().transactions.length`) === 0);

    // Mas o app precisa saber que ele existe para poder perguntar.
    const espiada = await ctx.run(`FinanceStore.peekScope("guest")`);
    check("o app enxerga que há dados de visitante", espiada.exists === true && espiada.transactions === 1, JSON.stringify(espiada));
    check("espiar não trouxe nada para a conta", ctx.run(`FinanceStore.snapshot().transactions.length`) === 0);
    check("espiar não trocou o escopo ativo", ctx.run(`FinanceStore.scope()`) === "u_ana");

    // Só a adoção explícita traz.
    const adocao = await ctx.run(`FinanceStore.adoptScope("guest")`);
    check("adoção explícita funciona", adocao.ok === true, JSON.stringify(adocao));
    check("o lançamento do visitante chegou na conta", ctx.run(`FinanceStore.snapshot().transactions.some((t) => t.id === "tx-visitante")`));

    // E o visitante continua com os dados dele.
    check("a base de visitante não foi esvaziada", storage.getItem("financas_pro_v2") !== null);
  }

  console.log("\n5. Migração do blob antigo só vale para o visitante");
  {
    const storage = fakeLocalStorage();
    storage.setItem("financas_pro_v2", JSON.stringify({
      version: 22, categories: [], goals: [], assets: [],
      transactions: [{ id: "tx-legado", type: "expense", amount: 9, date: "2026-01-01", updatedAt: "2026-01-01T10:00:00.000Z" }],
    }));
    const ctx = carregar(storage);
    await ctx.run(`FinanceStore.init(new LocalStorageAdapter("guest"), { scope: "guest" })`);
    check("visitante herda a base antiga (compatibilidade)", ctx.run(`FinanceStore.snapshot().transactions.some((t) => t.id === "tx-legado")`));
  }

  console.log("\n6. Apagar os dados de uma conta não apaga os do visitante");
  {
    const storage = fakeLocalStorage();
    const ctx = carregar(storage);

    await ctx.run(`FinanceStore.init(new LocalStorageAdapter("guest"), { scope: "guest" })`);
    ctx.run(`FinanceStore.persist({ ...FinanceStore.snapshot(), transactions: [
      { id: "tx-visitante", type: "expense", amount: 7, date: "2026-02-02", updatedAt: "2026-02-02T10:00:00.000Z" }] })`);
    await flush(ctx);

    await ctx.run(`FinanceStore.switchScope("u_ana", new LocalStorageAdapter("u_ana"))`);
    ctx.run(`FinanceStore.persist({ ...FinanceStore.snapshot(), transactions: [
      { id: "tx-ana", type: "expense", amount: 8, date: "2026-03-03", updatedAt: "2026-03-03T10:00:00.000Z" }] })`);
    await flush(ctx);
    await ctx.run(`FinanceStore.purge()`);

    check("a conta ficou vazia", ctx.run(`FinanceStore.snapshot().transactions.length`) === 0);
    check("a chave da conta foi removida", storage.getItem("financas_db_fallback__u_ana") === null);
    check("a base do visitante continua intacta", storage.getItem("financas_db_fallback") !== null);

    await ctx.run(`FinanceStore.switchScope("guest", new LocalStorageAdapter("guest"))`);
    check("o visitante reencontra o próprio lançamento", ctx.run(`FinanceStore.snapshot().transactions.some((t) => t.id === "tx-visitante")`));
  }

  console.log("\n7. O aparelho lembra em qual conta estava");
  {
    const storage = fakeLocalStorage();
    const ctx = carregar(storage);
    ctx.run(`rememberStorageScope("u_ana")`);
    check("escopo lembrado sobrevive ao fechamento", ctx.run(`rememberedStorageScope()`) === "u_ana");
    ctx.run(`rememberStorageScope("guest")`);
    check("voltar a visitante limpa a lembrança", ctx.run(`rememberedStorageScope()`) === "guest" && storage.getItem("cofre_active_scope") === null);
  }

  console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"}: ${ok} ok, ${fail} falha(s)\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((error) => { console.error(error); process.exit(1); });
