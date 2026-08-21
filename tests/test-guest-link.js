// test-guest-link.js; vínculo dos dados de visitante com a conta autenticada.
// ------------------------------------------------------------------------------
// ESTE É O TESTE DO DEFEITO RELATADO: entrar com a mesma conta em dois aparelhos
// e ver conteúdos diferentes. A causa era um banco local por escopo com um
// vínculo que nunca acontecia, e um ciclo que subia antes de descer.
//
// O que ele protege:
//
//   1. Dados criados ANTES do login entram na conta quando ela nunca foi usada.
//   2. O segundo aparelho entra na mesma conta e encontra o mesmo conteúdo.
//   3. Conta que já tem história NÃO é preenchida automaticamente.
//   4. O resumo reconhece conta, cartão e renda, mesmo sem nenhum lançamento.
//   5. Valor de fábrica não faz uma base vazia parecer preenchida.
//   6. A decisão vale pela IMPRESSÃO do conteúdo: mudar o visitante reabre.
//   7. Repetir o vínculo não duplica nem recarimba.
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
  "js/layout.js", "js/safe-errors.js", "js/storage.js", "js/cloud-sync.js"];

// Um localStorage por APARELHO. Os dois escopos (visitante e conta) convivem
// dentro dele, exatamente como no navegador real.
function fakeLocalStorage(seed) {
  const map = new Map(Object.entries(seed || {}));
  return {
    _map: map,
    getItem: (k) => (map.has(String(k)) ? map.get(String(k)) : null),
    setItem: (k, v) => { map.set(String(k), String(v)); },
    removeItem: (k) => { map.delete(String(k)); },
    key: (i) => Array.from(map.keys())[i] || null,
    get length() { return map.size; },
  };
}

function carregar(fetchImpl, storage) {
  const ctx = {
    console, fetch: fetchImpl, Response, AbortController, URL, crypto,
    setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: storage,
    accountDeviceId: () => "device-de-teste-0001",
    navigator: { onLine: true },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  FONTES.forEach((file) => vm.runInContext(read(file), ctx, { filename: file }));
  ctx.run = (code) => vm.runInContext(code, ctx);
  return ctx;
}

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

// Servidor de mentira com a mesma semântica do real: guarda a operação
// VENCEDORA de cada (entidade, id) e devolve por cursor o que veio depois.
function servidorFalso() {
  const linhas = new Map();
  let seq = 0;
  return {
    linhas,
    revision: () => String(seq),
    aplicar(ops) {
      let aplicados = 0;
      ops.forEach((op) => {
        const chave = `${op.entity} ${op.entityId}`;
        const atual = linhas.get(chave);
        if (atual && String(atual.rev) >= String(op.rev)) return;
        seq += 1;
        linhas.set(chave, { ...op, seq });
        aplicados += 1;
      });
      return aplicados;
    },
    desde(cursor, limite) {
      const lista = Array.from(linhas.values())
        .filter((linha) => linha.seq > Number(cursor || 0))
        .sort((a, b) => a.seq - b.seq);
      const pagina = lista.slice(0, limite);
      return {
        ops: pagina.map((linha) => ({
          seq: String(linha.seq), entity: linha.entity, entityId: linha.entityId,
          op: linha.op, rev: linha.rev, payload: linha.op === "put" ? linha.payload : undefined,
        })),
        hasMore: lista.length > pagina.length,
        cursor: pagina.length ? String(pagina[pagina.length - 1].seq) : String(cursor || "0"),
      };
    },
    handler(servidor) {
      return async (url, options) => {
        const metodo = (options && options.method) || "GET";
        const texto = String(url);
        const falado = Number(((options && options.headers) || {})["X-Sync-Protocol"] || 3) || 3;
        const envelope = { protocol: falado, serverProtocol: 3, minimumWriteProtocol: 2 };
        if (texto.includes("/health")) return json({ ...envelope, status: "ok", revision: servidor.revision() });
        if (metodo === "GET" && texto.includes("/changes")) {
          const since = (texto.match(/since=(\d+)/) || [])[1] || "0";
          return json({ ...envelope, status: "ok", revision: servidor.revision(), ...servidor.desde(since, 500) });
        }
        if (metodo === "POST" && texto.includes("/changes")) {
          const corpo = JSON.parse(options.body);
          servidor.corpos = servidor.corpos || [];
          servidor.corpos.push(corpo);
          if (corpo.expectedRemoteRevision != null && String(corpo.expectedRemoteRevision) !== servidor.revision()) {
            return json({ ...envelope, status: "error", code: "remote_changed", revision: servidor.revision() }, 409);
          }
          const aplicados = servidor.aplicar(corpo.ops || []);
          return json({
            ...envelope, status: "applied", revision: servidor.revision(), applied: aplicados,
            ...servidor.desde(corpo.since || "0", 500),
          });
        }
        return json({ ...envelope, status: "error", code: "not_found" }, 404);
      };
    },
  };
}

// Simula a sequência real de `js/auth.js`: preparar (descer sem enviar),
// inspecionar o visitante, decidir e concluir.
async function entrarNaConta(ctx, opcoes) {
  const o = opcoes || {};
  await ctx.run(`FinanceStore.init(new LocalStorageAdapter("u_ana"), { scope: "u_ana" })`);
  ctx.run(`CloudSync.configure({ applyRemote: (d) => { __ultimo = d; }, onStatus: () => {} })`);
  const preparo = await ctx.run("CloudSync.prepareAccount()");
  const visitante = await ctx.run(`FinanceStore.peekScope("guest")`);
  let adocao = null;
  const automatico = preparo.ok && String(preparo.revision) === "0";
  if (visitante.exists && (automatico || o.confirmar)) {
    ctx.__opts = automatico
      ? { userId: "ana", remoteRevision: "0", expectedRemoteRevision: "0" }
      : { userId: "ana", remoteRevision: preparo.revision };
    adocao = await ctx.run(`FinanceStore.adoptScope("guest", __opts)`);
  }
  await ctx.run("CloudSync.finishAccountBootstrap()");
  return { preparo, visitante, adocao };
}

const lancar = (ctx, tx) => ctx.run(
  `FinanceStore.persist({ ...FinanceStore.snapshot(), transactions: [...FinanceStore.snapshot().transactions, ${JSON.stringify(tx)}] })`
);

(async () => {
  console.log("\n1. Dados de visitante entram numa conta que nunca foi usada");
  const servidor = servidorFalso();
  const storageA = fakeLocalStorage({ cofre_device_id: "device-aparelho-a01" });
  {
    // O aparelho A usa o app SEM conta: é aqui que nascia o segundo banco.
    const ctx = carregar(servidor.handler(servidor), storageA);
    await ctx.run(`FinanceStore.init(new LocalStorageAdapter("guest"), { scope: "guest" })`);
    lancar(ctx, { id: "tx-visitante", type: "expense", amount: 42, date: "2026-08-15", categoryId: "lazer" });
    ctx.run(`FinanceStore.persist({ ...FinanceStore.snapshot(), monthlyIncome: 5200,
      accounts: [{ id: "acc-banco", name: "Banco", type: "corrente", openingBalance: 100, openingDate: "2026-08-01", color: "#112233" }] })`);
    await ctx.run("FinanceStore.flush()");

    const entrada = await entrarNaConta(ctx);
    check("o resumo reconhece lançamento, conta e renda",
      entrada.visitante.transactions === 1 && entrada.visitante.accounts === 1 && entrada.visitante.monthlyIncome === true,
      JSON.stringify(entrada.visitante));
    check("o resumo traz a impressão do conteúdo", /^v1:[a-f0-9]{64}$/.test(String(entrada.visitante.digest)), entrada.visitante.digest);
    check("a conta vazia é reconhecida pela revisão observada", entrada.preparo.ok && String(entrada.preparo.revision) === "0", JSON.stringify(entrada.preparo));
    check("o vínculo automático aconteceu", !!(entrada.adocao && entrada.adocao.ok && entrada.adocao.changed), JSON.stringify(entrada.adocao));
    check("o lançamento do visitante está na conta",
      ctx.run(`FinanceStore.snapshot().transactions.some((t) => t.id === "tx-visitante")`));
    check("o lançamento chegou ao servidor", servidor.linhas.has("transactions tx-visitante"));
    check("a conta cadastrada chegou ao servidor como entidade própria", servidor.linhas.has("accounts acc-banco"));
    check("a renda chegou ao servidor", servidor.linhas.has("settings monthlyIncome"));
    check("a fila esvaziou", (await ctx.run("FinanceStore.outboxRead(0)")).length === 0);
    check("a sincronização terminou como concluída", ctx.run("CloudSync.status().phase") === "synced", ctx.run("CloudSync.status().phase"));

    const recibo = await ctx.run(`FinanceStore.guestLinkReceipt()`);
    check("o recibo só nasce com confirmação do servidor", !!recibo && recibo.status === "linked", JSON.stringify(recibo));
    check("o diário foi promovido e não sobrou", (await ctx.run("FinanceStore.guestLinkJournal()")) == null);
    check("a base de visitante continua intacta",
      (await ctx.run(`FinanceStore.peekScope("guest")`)).transactions === 1);

    const corpos = servidor.corpos || [];
    check("nenhum metadado local foi enviado ao servidor",
      corpos.every((c) => (c.ops || []).every((op) => op.linkId === undefined && op.seedId === undefined && op.entryKey === undefined && op.seq === undefined)));

    console.log("\n2. Repetir o vínculo não duplica nem recarimba");
    const marca = ctx.run(`FinanceStore.syncRevOf(FinanceStore.snapshot().transactions.find((t) => t.id === "tx-visitante"))`);
    ctx.__opts2 = { userId: "ana", remoteRevision: "0" };
    const repetido = await ctx.run(`FinanceStore.adoptScope("guest", __opts2)`);
    check("a repetição não gera nova gravação", repetido.ok && repetido.changed === false, JSON.stringify(repetido));
    check("o lançamento não foi duplicado",
      ctx.run(`FinanceStore.snapshot().transactions.filter((t) => t.id === "tx-visitante").length`) === 1);
    check("a marca do registro não mudou",
      ctx.run(`FinanceStore.syncRevOf(FinanceStore.snapshot().transactions.find((t) => t.id === "tx-visitante"))`) === marca);
  }

  console.log("\n3. O segundo aparelho encontra o mesmo conteúdo");
  {
    const storageB = fakeLocalStorage({ cofre_device_id: "device-aparelho-b02" });
    const ctx = carregar(servidor.handler(servidor), storageB);
    const entrada = await entrarNaConta(ctx);
    check("a conta já tem história para o aparelho novo", String(entrada.preparo.revision) !== "0", entrada.preparo.revision);
    check("o segundo aparelho recebeu o lançamento",
      ctx.run(`FinanceStore.snapshot().transactions.some((t) => t.id === "tx-visitante")`));
    check("e recebeu a conta bancária",
      ctx.run(`FinanceStore.snapshot().accounts.some((a) => a.id === "acc-banco")`),
      ctx.run("JSON.stringify(FinanceStore.snapshot().accounts.map((a) => a.id))"));
    check("e recebeu a renda", ctx.run("FinanceStore.snapshot().monthlyIncome") === 5200, ctx.run("FinanceStore.snapshot().monthlyIncome"));
  }

  console.log("\n4. Conta com história exige confirmação");
  {
    const storageC = fakeLocalStorage({ cofre_device_id: "device-aparelho-c03" });
    const ctx = carregar(servidor.handler(servidor), storageC);
    await ctx.run(`FinanceStore.init(new LocalStorageAdapter("guest"), { scope: "guest" })`);
    lancar(ctx, { id: "tx-outro-aparelho", type: "expense", amount: 7, date: "2026-08-16", categoryId: "lazer" });
    await ctx.run("FinanceStore.flush()");

    const entrada = await entrarNaConta(ctx);
    check("nada é incorporado sem confirmação", entrada.adocao === null);
    check("o visitante não entrou na conta",
      !ctx.run(`FinanceStore.snapshot().transactions.some((t) => t.id === "tx-outro-aparelho")`));
    check("o conteúdo da conta chegou assim mesmo",
      ctx.run(`FinanceStore.snapshot().transactions.some((t) => t.id === "tx-visitante")`));

    // Agora a confirmação explícita: juntar, sem substituir nada.
    ctx.__conf = { userId: "ana", remoteRevision: entrada.preparo.revision };
    const juntou = await ctx.run(`FinanceStore.adoptScope("guest", __conf)`);
    await ctx.run("CloudSync.syncNow()");
    check("juntar traz o visitante", juntou.ok && ctx.run(`FinanceStore.snapshot().transactions.some((t) => t.id === "tx-outro-aparelho")`));
    check("e preserva o que a conta já tinha",
      ctx.run(`FinanceStore.snapshot().transactions.some((t) => t.id === "tx-visitante")`));
    check("os dois lados chegam ao servidor", servidor.linhas.has("transactions tx-outro-aparelho"));

    console.log("\n5. A decisão vale pela impressão do conteúdo");
    const visitante = await ctx.run(`FinanceStore.peekScope("guest")`);
    ctx.__digest = visitante.digest;
    await ctx.run(`FinanceStore.dismissGuestLink(__digest, "guest")`);
    const recibo = await ctx.run("FinanceStore.guestLinkReceipt()");
    check("dispensar grava a impressão escolhida", recibo.status === "dismissed" && recibo.sourceDigest === visitante.digest);

    // Mudar o visitante muda a impressão, e o aplicativo volta a reconhecer
    // trabalho pendente. Sem isto, "manter separados" valeria para sempre.
    const outro = carregar(servidor.handler(servidor), storageC);
    await outro.run(`FinanceStore.init(new LocalStorageAdapter("guest"), { scope: "guest" })`);
    lancar(outro, { id: "tx-novo-visitante", type: "expense", amount: 3, date: "2026-08-17", categoryId: "lazer" });
    await outro.run("FinanceStore.flush()");
    const depois = await ctx.run(`FinanceStore.peekScope("guest")`);
    check("mudar o visitante muda a impressão", depois.digest !== visitante.digest, depois.digest);
    check("a decisão anterior não cobre o conteúdo novo", recibo.sourceDigest !== depois.digest);
  }

  console.log("\n6. Valor de fábrica não conta como conteúdo");
  {
    const storageD = fakeLocalStorage({ cofre_device_id: "device-aparelho-d04" });
    const ctx = carregar(servidor.handler(servidor), storageD);
    await ctx.run(`FinanceStore.init(new LocalStorageAdapter("guest"), { scope: "guest" })`);
    await ctx.run("FinanceStore.flush()");
    const resumo = await ctx.run(`FinanceStore.peekScope("guest")`);
    check("base recém-criada não é significativa", resumo.exists === false, JSON.stringify(resumo));
    check("categorias de fábrica não são contadas", resumo.categories === 0, resumo.categories);

    // Só uma conta cadastrada, sem nenhum lançamento, JÁ É conteúdo de verdade.
    ctx.run(`FinanceStore.persist({ ...FinanceStore.snapshot(),
      accounts: [{ id: "acc-so", name: "Carteira", type: "dinheiro", openingBalance: 0, openingDate: "2026-08-01", color: "#445566" }] })`);
    await ctx.run("FinanceStore.flush()");
    const comConta = await ctx.run(`FinanceStore.peekScope("guest")`);
    check("uma conta cadastrada torna a base significativa", comConta.exists === true && comConta.accounts === 1, JSON.stringify(comConta));
  }

  console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"}: ${ok} ok, ${fail} falha(s)\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
