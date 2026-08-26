// test-sync-reconcile.js; convergência entre aparelhos da MESMA conta.
// ------------------------------------------------------------------------------
// ESTE É O TESTE DO DEFEITO RELATADO NO BETA: a mesma conta, aberta em três
// navegadores, mostrando saldos diferentes, e nenhum deles acusando erro. Os
// três diziam "Tudo sincronizado", porque para cada um deles isso era verdade.
//
// A causa é estrutural, e não um erro pontual: o ciclo é incremental e se apoia
// em duas promessas que ele não tem como reavaliar sozinho.
//
//   - O CURSOR promete "já apliquei tudo até aqui". O servidor nunca reenvia o
//     que ficou atrás dele.
//   - O RECIBO DE SEMEADURA promete "já ofereci minha base inteira". A fila
//     nunca reapresenta o que já foi confirmado.
//
// Basta uma operação escapar UMA vez para as duas passarem a mentir, e nada no
// funcionamento normal desfaz isso.
//
// O que este arquivo protege:
//
//   1. O defeito é real: com o cursor à frente de uma operação não aplicada, o
//      ciclo comum não a recupera e ainda declara "sincronizado".
//   2. A reconciliação recupera o que desceu e nunca foi aplicado.
//   3. A reconciliação leva o que existe só no aparelho e nunca subiu.
//   4. Reconciliar não duplica, não apaga e não vira rotina de todo ciclo.
//   5. O lote gravado na fila enquanto um ciclo já está em curso SOBE. Era o
//      "juntei os valores e não atualizou em nenhum outro aparelho".
"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const TEST_ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";

let ok = 0;
let fail = 0;
function check(label, condition, detail) {
  if (condition) { ok++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail == null ? "" : `: ${detail}`}`); }
}

const FONTES = ["js/utils.js", "js/perf.js", "js/router.js", "js/icons.js", "js/rules.js",
  "js/layout.js", "js/safe-errors.js", "js/storage.js", "js/cloud-sync.js"];

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
  ctx.__accountId = TEST_ACCOUNT_ID;
  ctx.run("CloudSync.configure({ getExpectedAccountId: () => __accountId })");
  return ctx;
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Servidor de mentira com a semântica do real: guarda a operação VENCEDORA de
// cada (entidade, id) e devolve por cursor o que veio depois.
function servidorFalso() {
  const linhas = new Map();
  const recebidos = [];
  let seq = 0;
  return {
    linhas, recebidos,
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
        const envelope = { protocol: 3, serverProtocol: 3, minimumWriteProtocol: 2 };
        if (texto.includes("/health")) return json({ ...envelope, status: "ok", revision: servidor.revision() });
        if (metodo === "GET" && texto.includes("/changes")) {
          const since = (texto.match(/since=(\d+)/) || [])[1] || "0";
          return json({ ...envelope, status: "ok", revision: servidor.revision(), ...servidor.desde(since, 500) });
        }
        if (metodo === "POST" && texto.includes("/changes")) {
          const corpo = JSON.parse(options.body);
          servidor.recebidos.push(corpo);
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

async function ligarAparelho(servidor, deviceId) {
  const storage = fakeLocalStorage({ cofre_device_id: deviceId });
  const ctx = carregar(servidor.handler(servidor), storage);
  ctx.run(`accountDeviceId = () => ${JSON.stringify(deviceId)};`);
  await ctx.run(`FinanceStore.init(new LocalStorageAdapter("u_ana"), { scope: "u_ana" })`);
  ctx.run(`
    CloudSync.configure({
      readLocal: () => FinanceStore.snapshot(),
      applyRemote: (data) => { __ultimo = data; },
      onStatus: () => {},
    });
  `);
  await ctx.run("CloudSync.enable()");
  return { ctx, storage, run: ctx.run };
}

const flush = (a) => a.run("FinanceStore.flush()");
const lancar = (a, tx) => a.run(
  `FinanceStore.persist({ ...FinanceStore.snapshot(), transactions: [...FinanceStore.snapshot().transactions, ${JSON.stringify(tx)}] })`
);
const tem = (a, id) => a.run(`FinanceStore.snapshot().transactions.some((t) => t.id === ${JSON.stringify(id)})`);
const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  console.log("\n1. O aparelho que ficou para trás não se repara sozinho");
  {
    const servidor = servidorFalso();
    const a = await ligarAparelho(servidor, "device-aparelho-a01");
    check("o aparelho entrou sincronizado", a.run("CloudSync.status().phase") === "synced",
      a.run("CloudSync.status().phase"));
    check("a reconciliação de reparo deixou recibo",
      !!(await a.run("FinanceStore.localMetaGet(META_RECONCILE_RECEIPT)")));

    // O outro aparelho grava. Este avança o cursor SEM aplicar: é exatamente o
    // estado que uma marca recusada, uma gravação desfeita pela cota ou uma aba
    // fechada entre a resposta e o disco deixam para trás.
    servidor.aplicar([{
      entity: "transactions", entityId: "tx-perdida", op: "put",
      rev: "000001760000000.000001.device-aparelho-b02",
      payload: { id: "tx-perdida", type: "expense", amount: 118045, date: "2026-08-20", categoryId: "lazer" },
    }]);
    a.run("CloudSync.disable()");
    await a.run(`FinanceStore.localMetaPut(META_CURSOR, ${JSON.stringify(servidor.revision())})`);
    await a.run("CloudSync.enable()");

    check("o ciclo comum NÃO recupera a operação que ficou atrás do cursor", !tem(a, "tx-perdida"));
    check("e mesmo assim declara tudo sincronizado", a.run("CloudSync.status().phase") === "synced",
      a.run("CloudSync.status().phase"));

    console.log("\n2. A reconciliação traz o que desceu e nunca foi aplicado");
    await a.run("CloudSync.reconcile()");
    check("a operação perdida chegou", tem(a, "tx-perdida"));
    check("o aparelho continua sincronizado", a.run("CloudSync.status().phase") === "synced",
      a.run("CloudSync.status().phase"));
    a.run("CloudSync.disable()");
  }

  console.log("\n3. A reconciliação leva o que existe só no aparelho");
  {
    const servidor = servidorFalso();
    const a = await ligarAparelho(servidor, "device-aparelho-a01");

    // Gravar com a fila desligada reproduz o outro sentido do mesmo defeito: o
    // registro fica no aparelho sem nunca ter virado operação.
    a.run("FinanceStore.setOutboxEnabled(false)");
    lancar(a, { id: "tx-so-aqui", type: "expense", amount: 55, date: "2026-08-21", categoryId: "lazer" });
    await flush(a);
    a.run("FinanceStore.setOutboxEnabled(true)");

    await a.run("CloudSync.syncNow()");
    check("o ciclo comum NÃO reapresenta a base já semeada", !servidor.linhas.has("transactions tx-so-aqui"));

    await a.run("CloudSync.reconcile()");
    check("a reconciliação leva o registro para a conta", servidor.linhas.has("transactions tx-so-aqui"));

    const b = await ligarAparelho(servidor, "device-aparelho-b02");
    check("e o outro aparelho passa a ver o mesmo conteúdo", tem(b, "tx-so-aqui"));
    a.run("CloudSync.disable()");
    b.run("CloudSync.disable()");
  }

  console.log("\n4. Reconciliar não duplica, não apaga e não vira rotina");
  {
    const servidor = servidorFalso();
    const a = await ligarAparelho(servidor, "device-aparelho-a01");
    lancar(a, { id: "tx-um", type: "expense", amount: 10, date: "2026-08-01", categoryId: "lazer" });
    await flush(a);
    await a.run("CloudSync.syncNow()");

    const antes = a.run("FinanceStore.snapshot().transactions.length");
    await a.run("CloudSync.reconcile()");
    check("nada foi duplicado", a.run("FinanceStore.snapshot().transactions.length") === antes,
      `${antes} -> ${a.run("FinanceStore.snapshot().transactions.length")}`);
    check("nada foi apagado", tem(a, "tx-um"));

    // O recibo fica gravado: a volta seguinte é um ciclo incremental comum, e
    // não uma releitura da conta inteira a cada quinze segundos.
    const enviosAntes = servidor.recebidos.length;
    await a.run("CloudSync.syncNow()");
    const ultimo = servidor.recebidos[servidor.recebidos.length - 1];
    check("a volta seguinte não reoferece a base",
      servidor.recebidos.length === enviosAntes || ((ultimo && ultimo.ops) || []).length === 0,
      JSON.stringify(((ultimo && ultimo.ops) || []).map((o) => o.entityId)).slice(0, 160));
    a.run("CloudSync.disable()");
  }

  console.log("\n5. O lote gravado durante um ciclo em curso sobe assim mesmo");
  {
    // O caso de "Juntar dados": o vínculo grava o lote na fila e libera o
    // portão da subida. Se nesse instante já houver um ciclo em curso PASSADO
    // da subida, acompanhar esse ciclo deixa o lote parado — o saldo soma só
    // neste aparelho e nos outros não aparece nada.
    const servidor = servidorFalso();
    const a = await ligarAparelho(servidor, "device-aparelho-a01");
    const baseFetch = servidor.handler(servidor);
    let liberar = null;
    let segurarNoGet = 0;
    let getsVistos = 0;
    a.ctx.fetch = (url, options) => {
      const ehGet = String(url).includes("/changes") && (!options || !options.method || options.method === "GET");
      if (segurarNoGet && ehGet && ++getsVistos === segurarNoGet) {
        segurarNoGet = 0;
        return new Promise((resolve) => { liberar = () => baseFetch(url, options).then(resolve); });
      }
      return baseFetch(url, options);
    };

    // A SEGUNDA descida é a que fecha a volta, depois da subida. É ali que a
    // corrida existe.
    segurarNoGet = 2;
    getsVistos = 0;
    const cicloPreso = a.run("CloudSync.syncNow()");
    await espera(30);

    lancar(a, { id: "tx-juntada", type: "expense", amount: 77, date: "2026-08-22", categoryId: "lazer" });
    await flush(a);
    const liberacao = a.run("CloudSync.finishAccountBootstrap()");
    await espera(30);
    check("o ciclo em curso foi mesmo interceptado depois da subida", typeof liberar === "function");
    if (liberar) liberar();
    await cicloPreso;
    await liberacao;

    check("o lote chegou ao servidor", servidor.linhas.has("transactions tx-juntada"));
    check("a fila local esvaziou", (await a.run("FinanceStore.outboxRead(0)")).length === 0);
    check("e o estado final é sincronizado", a.run("CloudSync.status().phase") === "synced",
      a.run("CloudSync.status().phase"));
    a.run("CloudSync.disable()");
  }

  await espera(10);
  console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"}: ${ok} ok, ${fail} falha(s)\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((error) => { console.error(error); process.exit(1); });
