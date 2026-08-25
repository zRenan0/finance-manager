// test-cloud-sync.js; ciclo de sincronização incremental (protocolo 2).
// ------------------------------------------------------------------------------
// O que este teste protege, em ordem de gravidade:
//
//   1. Exclusão remota vale. Apagar num aparelho tem de apagar no outro, e o
//      registro não pode voltar na volta seguinte. No protocolo anterior ele
//      voltava, porque o envio era "a base como este aparelho a vê".
//   2. Duplicata legítima sobrevive. Dois gastos iguais no mesmo dia são
//      normais; nenhum dos dois pode sumir por "parecer" com o outro.
//   3. Relógio divergente não decide nada. O aparelho com a hora adiantada não
//      ganha as disputas; quem escreveu DEPOIS de ver a alteração alheia ganha.
//   4. Fila persistente. O que não subiu continua na fila e sobe depois, sem
//      duplicar quando a rede falha no meio.
//   5. Parada em sessão morta. Sem isso o app entra em fila infinita de 401.
//   6. Uma aba por vez. Duas abas não podem enviar a mesma fila duas vezes.
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

// `const` e `function` de topo em `vm` ficam no escopo do SCRIPT, não viram
// propriedade do objeto de contexto: todo acesso passa por avaliação.
function carregar(fetchImpl, storage, extras) {
  const ctx = {
    console, fetch: fetchImpl, Response, AbortController, URL, crypto,
    setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: storage || fakeLocalStorage({ cofre_device_id: "device-de-teste-0001" }),
    accountDeviceId: () => "device-de-teste-0001",
    navigator: { onLine: true },
    ...(extras || {}),
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  FONTES.forEach((file) => vm.runInContext(read(file), ctx, { filename: file }));
  ctx.run = (code) => vm.runInContext(code, ctx);
  ctx.__accountId = TEST_ACCOUNT_ID;
  ctx.run("CloudSync.configure({ getExpectedAccountId: () => __accountId })");
  return ctx;
}

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Servidor de mentira que se comporta como o real: guarda a operação VENCEDORA
// de cada (entidade, id) e devolve por cursor o que veio depois.
function servidorFalso(opcoes) {
  const linhas = new Map();     // chave -> { seq, entity, entityId, op, rev, payload }
  let seq = 0;
  const recebidos = [];
  const cabecalhosRecebidos = [];
  return {
    linhas, recebidos, cabecalhosRecebidos,
    activeAccountId: (opcoes && opcoes.accountId) || TEST_ACCOUNT_ID,
    serverProtocol: (opcoes && opcoes.serverProtocol) || 3,
    minimumWriteProtocol: (opcoes && opcoes.minimumWriteProtocol) || 2,
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
    // O servidor real fala 3 e ECOA a versão do cliente, para que um aparelho
    // ainda no protocolo 2 continue funcionando durante a janela de atualização.
    handler(servidor) {
      return async (url, options) => {
        const metodo = (options && options.method) || "GET";
        const texto = String(url);
        const cabecalhos = (options && options.headers) || {};
        servidor.cabecalhosRecebidos.push(cabecalhos);
        const falado = Number(cabecalhos["X-Sync-Protocol"] || 3) || 3;
        const envelope = {
          protocol: falado,
          serverProtocol: servidor.serverProtocol,
          minimumWriteProtocol: servidor.minimumWriteProtocol,
        };
        if (cabecalhos["X-Account-Id"] !== servidor.activeAccountId) {
          return json({ ...envelope, status: "error", code: "account_scope_changed", message: "A conta mudou." }, 409);
        }
        if (texto.includes("/health")) return json({ ...envelope, status: "ok", revision: servidor.revision() });
        if (metodo === "GET" && texto.includes("/changes")) {
          const since = (texto.match(/since=(\d+)/) || [])[1] || "0";
          const page = servidor.desde(since, 500);
          return json({ ...envelope, status: "ok", revision: servidor.revision(), ...page });
        }
        if (metodo === "POST" && texto.includes("/changes")) {
          const corpo = JSON.parse(options.body);
          servidor.recebidos.push(corpo);
          if (falado < servidor.minimumWriteProtocol) {
            return json({ ...envelope, status: "error", code: "protocol_upgrade_required", message: "Atualize o aplicativo." }, 426);
          }
          // A conta pode ter avançado entre a leitura e a confirmação do
          // vínculo; quem declarou a revisão esperada precisa saber disso.
          if (corpo.expectedRemoteRevision != null && String(corpo.expectedRemoteRevision) !== servidor.revision()) {
            return json({ ...envelope, status: "error", code: "remote_changed", revision: servidor.revision() }, 409);
          }
          const aplicados = servidor.aplicar(corpo.ops || []);
          const page = servidor.desde(corpo.since || "0", 500);
          return json({ ...envelope, status: "applied", revision: servidor.revision(), applied: aplicados, ...page });
        }
        return json({ ...envelope, status: "error", code: "not_found" }, 404);
      };
    },
  };
}

// Liga um "aparelho": storage próprio, mesmo servidor.
async function ligarAparelho(servidor, deviceId, storageSeed) {
  const storage = fakeLocalStorage({ cofre_device_id: deviceId, ...(storageSeed || {}) });
  const ctx = carregar(servidor.handler(servidor), storage);
  ctx.run(`accountDeviceId = () => ${JSON.stringify(deviceId)};`);
  await ctx.run(`FinanceStore.init(new LocalStorageAdapter("u_ana"), { scope: "u_ana" })`);
  const aplicados = [];
  ctx.__aplicar = (data) => { aplicados.push(data); ctx.run("FinanceStore.persist(__ultimo)"); };
  ctx.run(`
    CloudSync.configure({
      readLocal: () => FinanceStore.snapshot(),
      applyRemote: (data) => { __ultimo = data; __aplicar(data); },
      onStatus: () => {},
    });
  `);
  await ctx.run("CloudSync.enable()");
  return { ctx, storage, aplicados, run: ctx.run };
}

const flush = (a) => a.run("FinanceStore.flush()");
const lancar = (a, tx) => a.run(`FinanceStore.persist({ ...FinanceStore.snapshot(), transactions: [...FinanceStore.snapshot().transactions, ${JSON.stringify(tx)}] })`);

(async () => {
  console.log("\n1. Envio incremental e chegada no outro aparelho");
  {
    const servidor = servidorFalso();
    const a = await ligarAparelho(servidor, "device-aparelho-a01");
    lancar(a, { id: "tx-a", type: "expense", amount: 20, date: "2026-08-02", categoryId: "lazer" });
    await flush(a);
    await a.run("CloudSync.syncNow()");

    const corpo = servidor.recebidos[servidor.recebidos.length - 1];
    check("o envio contém operações, não a base inteira", Array.isArray(corpo.ops) && corpo.ops.length > 0, JSON.stringify(corpo).slice(0, 120));
    check("a operação carrega marca do relógio lógico", corpo.ops.every((op) => /^\d{15}\.\d{6}\./.test(op.rev)));
    check("o servidor guardou o lançamento", servidor.linhas.has("transactions tx-a"));
    const headers = servidor.cabecalhosRecebidos[0] || {};
    check("a sincronização envia o rótulo do aparelho", typeof headers["X-Device-Label"] === "string" && headers["X-Device-Label"].length > 0,
      JSON.stringify(headers));
    check("a sincronização envia o tipo do aparelho", ["desktop", "phone", "tablet", "unknown"].includes(headers["X-Device-Type"]),
      JSON.stringify(headers));
    check("a sincronização envia a identidade esperada da conta", headers["X-Account-Id"] === TEST_ACCOUNT_ID,
      JSON.stringify(headers));

    const b = await ligarAparelho(servidor, "device-aparelho-b02");
    check("o segundo aparelho recebeu o lançamento", b.run(`FinanceStore.snapshot().transactions.some((t) => t.id === "tx-a")`));
    check("a fila do segundo aparelho está vazia", (await b.run("FinanceStore.outboxRead(0)")).length === 0);
  }

  console.log("\n2. Exclusão remota vale e não ressuscita");
  {
    const servidor = servidorFalso();
    const a = await ligarAparelho(servidor, "device-aparelho-a01");
    lancar(a, { id: "tx-x", type: "expense", amount: 30, date: "2026-08-03", categoryId: "lazer" });
    await flush(a);
    await a.run("CloudSync.syncNow()");

    const b = await ligarAparelho(servidor, "device-aparelho-b02");
    check("B recebeu antes de apagar", b.run(`FinanceStore.snapshot().transactions.some((t) => t.id === "tx-x")`));

    // A apaga, com lápide, como o app faz.
    a.run(`FinanceStore.persist({ ...FinanceStore.snapshot(),
      transactions: FinanceStore.snapshot().transactions.filter((t) => t.id !== "tx-x"),
      graveyard: withTombstones(FinanceStore.snapshot().graveyard, "transactions", "tx-x") })`);
    await flush(a);
    await a.run("CloudSync.syncNow()");
    check("a exclusão virou operação própria", servidor.linhas.get("transactions tx-x").op === "delete");

    await b.run("CloudSync.syncNow()");
    check("B apagou o lançamento", !b.run(`FinanceStore.snapshot().transactions.some((t) => t.id === "tx-x")`));

    // E o ponto crítico: B sincronizando de novo não pode devolver o registro.
    await b.run("CloudSync.syncNow()");
    await a.run("CloudSync.syncNow()");
    check("o lançamento não ressuscita na volta seguinte", !a.run(`FinanceStore.snapshot().transactions.some((t) => t.id === "tx-x")`));
    check("o servidor continua com a lápide", servidor.linhas.get("transactions tx-x").op === "delete");
  }

  console.log("\n3. Duplicata legítima não é descartada");
  {
    const servidor = servidorFalso();
    const a = await ligarAparelho(servidor, "device-aparelho-a01");
    // Dois cafés de R$ 8 no mesmo dia, mesma categoria, mesma descrição.
    lancar(a, { id: "tx-cafe-1", type: "expense", amount: 8, date: "2026-08-04", categoryId: "lazer", description: "Café" });
    await flush(a);
    lancar(a, { id: "tx-cafe-2", type: "expense", amount: 8, date: "2026-08-04", categoryId: "lazer", description: "Café" });
    await flush(a);
    await a.run("CloudSync.syncNow()");

    const b = await ligarAparelho(servidor, "device-aparelho-b02");
    const ids = b.run(`FinanceStore.snapshot().transactions.map((t) => t.id).sort().join(",")`);
    check("os dois gastos iguais sobreviveram", ids.includes("tx-cafe-1") && ids.includes("tx-cafe-2"), ids);
    check("a soma bate com o que foi lançado", b.run(`FinanceStore.snapshot().transactions.reduce((s, t) => s + t.amount, 0)`) === 16);
  }

  console.log("\n4. Relógio divergente não decide o conflito");
  {
    const servidor = servidorFalso();
    const a = await ligarAparelho(servidor, "device-aparelho-a01");
    lancar(a, { id: "tx-c", type: "expense", amount: 10, date: "2026-08-05", categoryId: "lazer", description: "original" });
    await flush(a);
    await a.run("CloudSync.syncNow()");

    const b = await ligarAparelho(servidor, "device-aparelho-b02");
    // B edita DEPOIS de ver a versão de A. O relógio de B está atrasado uma
    // hora; mesmo assim a edição dele tem de vencer, porque ele viu a de A.
    b.run(`
      const antigo = Date.now;
      Date.now = () => antigo() - 3600 * 1000;
      FinanceStore.persist({ ...FinanceStore.snapshot(),
        transactions: FinanceStore.snapshot().transactions.map((t) => t.id === "tx-c" ? { ...t, description: "editado no atrasado" } : t) });
    `);
    await flush(b);
    await b.run("CloudSync.syncNow()");
    await a.run("CloudSync.syncNow()");

    const descricao = a.run(`(FinanceStore.snapshot().transactions.find((t) => t.id === "tx-c") || {}).description`);
    check("a edição feita depois vence, mesmo com relógio atrasado", descricao === "editado no atrasado", descricao);
  }

  console.log("\n5. Fila persistente sobrevive à falha de rede");
  {
    const servidor = servidorFalso();
    let cair = false;
    const original = servidor.handler(servidor);
    const storage = fakeLocalStorage({ cofre_device_id: "device-aparelho-a01" });
    const ctx = carregar(async (url, options) => {
      if (cair && (options && options.method) === "POST") throw new TypeError("failed to fetch");
      return original(url, options);
    }, storage);
    ctx.run(`accountDeviceId = () => "device-aparelho-a01";`);
    await ctx.run(`FinanceStore.init(new LocalStorageAdapter("u_ana"), { scope: "u_ana" })`);
    ctx.run(`
      __invalidacoes = [];
      CloudSync.configure({
        readLocal: () => FinanceStore.snapshot(),
        applyRemote: (d) => { __ultimo = d; },
        onStatus: () => {},
        onAuthInvalid: (details) => { __invalidacoes.push(details); },
      });
    `);
    await ctx.run("CloudSync.enable()");

    cair = true;
    ctx.run(`FinanceStore.persist({ ...FinanceStore.snapshot(), transactions: [{ id: "tx-offline", type: "expense", amount: 12, date: "2026-08-06", categoryId: "lazer" }] })`);
    await ctx.run("FinanceStore.flush()");
    await ctx.run("CloudSync.syncNow()");

    const fila = await ctx.run("FinanceStore.outboxRead(0)");
    check("o que não subiu continua na fila", fila.some((entrada) => entrada.entityId === "tx-offline"), JSON.stringify(fila).slice(0, 120));
    check("o estado avisa que está offline ou com pendência", ["offline", "error"].includes(ctx.run("CloudSync.status().phase")), ctx.run("CloudSync.status().phase"));

    cair = false;
    await ctx.run("CloudSync.syncNow()");
    check("ao voltar a rede, a fila sobe", servidor.linhas.has("transactions tx-offline"));
    const filaDepois = await ctx.run("FinanceStore.outboxRead(0)");
    check("a fila fica vazia depois do envio", filaDepois.length === 0, JSON.stringify(filaDepois).slice(0, 120));
    check("o lançamento não foi duplicado no servidor", Array.from(servidor.linhas.keys()).filter((k) => k.includes("tx-offline")).length === 1);
  }

  console.log("\n6. Sessão morta interrompe o ciclo");
  {
    const servidor = servidorFalso();
    const original = servidor.handler(servidor);
    const storage = fakeLocalStorage({ cofre_device_id: "device-aparelho-a01" });
    let expirar = false;
    const ctx = carregar(async (url, options) => {
      if (expirar && !String(url).includes("/health")) return json({ protocol: 2, status: "error", code: "session_expired" }, 401);
      return original(url, options);
    }, storage);
    ctx.run(`accountDeviceId = () => "device-aparelho-a01";`);
    await ctx.run(`FinanceStore.init(new LocalStorageAdapter("u_ana"), { scope: "u_ana" })`);
    ctx.run(`
      __invalidacoes = [];
      CloudSync.configure({
        readLocal: () => FinanceStore.snapshot(),
        applyRemote: (d) => { __ultimo = d; },
        onStatus: () => {},
        onAuthInvalid: (details) => { __invalidacoes.push(details); },
      });
    `);
    await ctx.run("CloudSync.enable()");
    expirar = true;
    ctx.run(`FinanceStore.persist({ ...FinanceStore.snapshot(), transactions: [{ id: "tx-sessao", type: "expense", amount: 1, date: "2026-08-07", categoryId: "lazer" }] })`);
    await ctx.run("FinanceStore.flush()");
    await ctx.run("CloudSync.syncNow()");

    check("a sincronização parou", ctx.run("CloudSync.isEnabled()") === false);
    check("a mensagem pede para entrar de novo", /Entre novamente/.test(ctx.run("CloudSync.status().error") || ""));
    check("a camada de conta é avisada da sessão inválida", ctx.run("__invalidacoes.length") === 1
      && ctx.run("__invalidacoes[0].code") === "session_expired", ctx.run("JSON.stringify(__invalidacoes)"));
    const fila = await ctx.run("FinanceStore.outboxRead(0)");
    check("a fila NÃO é apagada ao desligar", fila.length > 0, JSON.stringify(fila).slice(0, 100));
  }

  console.log("\n7. Uma aba por vez");
  {
    const servidor = servidorFalso();
    const storage = fakeLocalStorage({ cofre_device_id: "device-aparelho-a01" });
    const ctx = carregar(servidor.handler(servidor), storage);
    ctx.run(`accountDeviceId = () => "device-aparelho-a01";`);
    // Bloqueio já tomado por "outra aba": `ifAvailable` entrega null.
    ctx.navigator = { onLine: true, locks: { request: async (_name, _options, cb) => cb(null) } };
    await ctx.run(`FinanceStore.init(new LocalStorageAdapter("u_ana"), { scope: "u_ana" })`);
    ctx.run(`CloudSync.configure({ readLocal: () => FinanceStore.snapshot(), applyRemote: (d) => { __ultimo = d; }, onStatus: () => {} })`);
    await ctx.run("CloudSync.enable()");
    ctx.run(`FinanceStore.persist({ ...FinanceStore.snapshot(), transactions: [{ id: "tx-aba", type: "expense", amount: 3, date: "2026-08-08", categoryId: "lazer" }] })`);
    await ctx.run("FinanceStore.flush()");
    const enviadosAntes = servidor.recebidos.length;
    await ctx.run("CloudSync.syncNow()");
    check("a aba sem o bloqueio não envia nada", servidor.recebidos.length === enviadosAntes, `${enviadosAntes} -> ${servidor.recebidos.length}`);
    const fila = await ctx.run("FinanceStore.outboxRead(0)");
    check("e a fila continua intacta para a outra aba", fila.length > 0);
  }

  console.log("\n8. Sem conta ligada, nada é enfileirado");
  {
    const storage = fakeLocalStorage({ cofre_device_id: "device-aparelho-a01" });
    const ctx = carregar(async () => json({ protocol: 2, status: "ok", revision: "0" }), storage);
    await ctx.run(`FinanceStore.init(new LocalStorageAdapter("guest"), { scope: "guest" })`);
    ctx.run(`FinanceStore.persist({ ...FinanceStore.snapshot(), transactions: [{ id: "tx-local", type: "expense", amount: 5, date: "2026-08-09", categoryId: "lazer" }] })`);
    await ctx.run("FinanceStore.flush()");
    const fila = await ctx.run("FinanceStore.outboxRead(0)");
    check("uso sem conta não gera fila de envio", fila.length === 0, JSON.stringify(fila).slice(0, 100));
  }

  console.log("\n9. A base anterior à conta sobe na primeira volta");
  {
    // O caso que fazia o segundo aparelho ver a conta vazia: quem já usava o
    // app antes de entrar na conta (ou usou enquanto o servidor estava fora do
    // ar) nunca gerou operação, porque a fila só recebe DIFERENÇA.
    const servidor = servidorFalso();
    const storage = fakeLocalStorage({ cofre_device_id: "device-aparelho-a01" });
    const ctx = carregar(servidor.handler(servidor), storage);
    ctx.run(`accountDeviceId = () => "device-aparelho-a01";`);
    await ctx.run(`FinanceStore.init(new LocalStorageAdapter("u_ana"), { scope: "u_ana" })`);
    ctx.run(`FinanceStore.persist({ ...FinanceStore.snapshot(), monthlyIncome: 4200,
      transactions: [{ id: "tx-antigo", type: "expense", amount: 55, date: "2026-07-10", categoryId: "lazer" }] })`);
    await ctx.run("FinanceStore.flush()");
    check("antes da conta, nada é enfileirado", (await ctx.run("FinanceStore.outboxRead(0)")).length === 0);

    ctx.run(`CloudSync.configure({ readLocal: () => FinanceStore.snapshot(),
      applyRemote: (d) => { __ultimo = d; FinanceStore.persist(d); }, onStatus: () => {} })`);
    await ctx.run("CloudSync.enable()");

    check("o lançamento anterior à conta chegou ao servidor", servidor.linhas.has("transactions tx-antigo"));
    check("a renda anterior à conta também subiu", servidor.linhas.has("settings monthlyIncome"));
    const fila = await ctx.run("FinanceStore.outboxRead(0)");
    check("a fila esvazia depois de semear", fila.length === 0, JSON.stringify(fila).slice(0, 120));

    const b = await ligarAparelho(servidor, "device-aparelho-b02");
    check("o segundo aparelho vê o lançamento antigo", b.run(`FinanceStore.snapshot().transactions.some((t) => t.id === "tx-antigo")`));
    check("e vê a mesma renda", b.run("FinanceStore.snapshot().monthlyIncome") === 4200, b.run("FinanceStore.snapshot().monthlyIncome"));

    // Semear é uma vez só: a volta seguinte não pode reenviar a base inteira.
    const ultimoAntes = servidor.recebidos.length;
    await ctx.run("CloudSync.syncNow()");
    const ultimo = servidor.recebidos[servidor.recebidos.length - 1];
    check("a volta seguinte não reenvia a base",
      servidor.recebidos.length === ultimoAntes || ((ultimo && ultimo.ops) || []).length === 0,
      JSON.stringify(((ultimo && ultimo.ops) || [])).slice(0, 160));
  }

  console.log("\n10. Aparelho novo e vazio não apaga o que o outro tem");
  {
    // A semeadura de um aparelho recém-conectado não pode anunciar o padrão de
    // fábrica como notícia: com marca nova ele venceria, e zeraria a renda e a
    // categoria renomeada do outro aparelho.
    const servidor = servidorFalso();
    const a = await ligarAparelho(servidor, "device-aparelho-a01");
    a.run(`FinanceStore.persist({ ...FinanceStore.snapshot(), monthlyIncome: 7300,
      categories: FinanceStore.snapshot().categories.map((c) => c.id === "lazer" ? { ...c, name: "Diversão" } : c) })`);
    await flush(a);
    await a.run("CloudSync.syncNow()");

    const b = await ligarAparelho(servidor, "device-aparelho-b02");
    check("o aparelho novo recebeu a renda", b.run("FinanceStore.snapshot().monthlyIncome") === 7300, b.run("FinanceStore.snapshot().monthlyIncome"));
    check("e recebeu a categoria renomeada",
      b.run(`(FinanceStore.snapshot().categories.find((c) => c.id === "lazer") || {}).name`) === "Diversão");

    await a.run("CloudSync.syncNow()");
    check("o primeiro aparelho continua com a renda", a.run("FinanceStore.snapshot().monthlyIncome") === 7300, a.run("FinanceStore.snapshot().monthlyIncome"));
    check("e continua com a categoria renomeada",
      a.run(`(FinanceStore.snapshot().categories.find((c) => c.id === "lazer") || {}).name`) === "Diversão",
      a.run(`(FinanceStore.snapshot().categories.find((c) => c.id === "lazer") || {}).name`));
  }

  console.log("\n11. Restaurar backup propaga para os outros aparelhos");
  {
    // `replaceAll` troca a base inteira sem passar pelo diff. Sem enfileirar
    // nada, a restauração valia só no aparelho que a fez, e a descida seguinte
    // podia até desfazê-la.
    const servidor = servidorFalso();
    const a = await ligarAparelho(servidor, "device-aparelho-a01");
    lancar(a, { id: "tx-fica", type: "expense", amount: 10, date: "2026-08-10", categoryId: "lazer" });
    await flush(a);
    lancar(a, { id: "tx-sai", type: "expense", amount: 90, date: "2026-08-11", categoryId: "lazer" });
    await flush(a);
    await a.run("CloudSync.syncNow()");

    const b = await ligarAparelho(servidor, "device-aparelho-b02");
    check("B recebeu os dois lançamentos", b.run("FinanceStore.snapshot().transactions.length") === 2, b.run("FinanceStore.snapshot().transactions.length"));

    // Restauração de um backup que só tem o primeiro lançamento.
    await a.run(`FinanceStore.replaceAll({ ...FinanceStore.snapshot(),
      transactions: FinanceStore.snapshot().transactions.filter((t) => t.id === "tx-fica") })`);
    await a.run("CloudSync.syncNow()");
    check("a restauração virou exclusão no servidor", (servidor.linhas.get("transactions tx-sai") || {}).op === "delete",
      JSON.stringify(servidor.linhas.get("transactions tx-sai") || {}).slice(0, 120));

    await b.run("CloudSync.syncNow()");
    check("B ficou com o mesmo conteúdo de A",
      b.run(`FinanceStore.snapshot().transactions.map((t) => t.id).join(",")`) === "tx-fica",
      b.run(`FinanceStore.snapshot().transactions.map((t) => t.id).join(",")`));

    await a.run("CloudSync.syncNow()");
    check("e o lançamento restaurado não volta", a.run("FinanceStore.snapshot().transactions.length") === 1, a.run("FinanceStore.snapshot().transactions.length"));
  }

  console.log("\n12. Registro sem marca ganha uma, e ela vai para o disco");
  {
    // Backup restaurado antes de existir conta chega sem marca de relógio. A
    // restauração dentro do escopo da conta precisa cunhar uma, enfileirar e
    // GRAVAR imediatamente. Esperar o motor ligar abriria uma janela em que a
    // base restaurada existiria sem a operação que deve levá-la ao servidor.
    const servidor = servidorFalso();
    const storage = fakeLocalStorage({ cofre_device_id: "device-aparelho-a01" });
    const ctx = carregar(servidor.handler(servidor), storage);
    ctx.run(`accountDeviceId = () => "device-aparelho-a01";`);
    await ctx.run(`FinanceStore.init(new LocalStorageAdapter("u_ana"), { scope: "u_ana" })`);
    await ctx.run(`FinanceStore.replaceAll({ ...FinanceStore.snapshot(),
      transactions: [{ id: "tx-sem-marca", type: "expense", amount: 33, date: "2026-08-12", categoryId: "lazer" }] })`);
    check("o registro restaurado já entrou com marca",
      /^\d{15}\.\d{6}\.device-aparelho-a01:tab_[A-Za-z0-9]{12}$/.test(ctx.run(`FinanceStore.syncRevOf(FinanceStore.snapshot().transactions[0])`)),
      ctx.run(`FinanceStore.syncRevOf(FinanceStore.snapshot().transactions[0])`));

    ctx.run(`CloudSync.configure({ readLocal: () => FinanceStore.snapshot(),
      applyRemote: (d) => { __ultimo = d; FinanceStore.persist(d); }, onStatus: () => {} })`);
    await ctx.run("CloudSync.enable()");

    check("o registro sem marca chegou ao servidor", servidor.linhas.has("transactions tx-sem-marca"));
    check("e ganhou marca deste aparelho",
      /^\d{15}\.\d{6}\.device-aparelho-a01:tab_[A-Za-z0-9]{12}$/.test(ctx.run(`FinanceStore.syncRevOf(FinanceStore.snapshot().transactions[0])`)),
      ctx.run(`FinanceStore.syncRevOf(FinanceStore.snapshot().transactions[0])`));

    // O que importa: a marca tem de estar no BANCO, nao so no snapshot em memoria.
    const gravado = await ctx.run(`FinanceStore.reload().then((d) => FinanceStore.syncRevOf(d.transactions[0]))`);
    check("a marca foi gravada no banco", /^\d{15}\.\d{6}\./.test(String(gravado)), String(gravado));
  }

  console.log("\n13. Ocultar a página tenta enviar sem perder a fila");
  {
    const servidor = servidorFalso();
    const a = await ligarAparelho(servidor, "device-aparelho-a01");
    lancar(a, { id: "tx-ocultar", type: "expense", amount: 18, date: "2026-08-13", categoryId: "lazer" });
    a.run("CloudSync.schedule()");
    await a.run("CloudSync.flushOnHide()");
    check("o envio começa durante a ocultação", servidor.linhas.has("transactions tx-ocultar"));
    check("a fila fica vazia quando a tentativa conclui", (await a.run("FinanceStore.outboxRead(0)")).length === 0);
  }

  console.log("\n14. Gravação agenda envio em menos de um segundo");
  {
    const servidor = servidorFalso();
    const a = await ligarAparelho(servidor, "device-aparelho-a01");
    lancar(a, { id: "tx-debounce", type: "expense", amount: 7, date: "2026-08-14", categoryId: "lazer" });
    a.run("CloudSync.schedule()");
    await espera(900);
    check("o debounce envia sem botão manual", servidor.linhas.has("transactions tx-debounce"));
    const debounce = Number((read("js/cloud-sync.js").match(/CLOUD_SYNC_DEBOUNCE_MS\s*=\s*(\d+)/) || [])[1]);
    const poll = Number((read("js/cloud-sync.js").match(/CLOUD_SYNC_POLL_MS\s*=\s*(\d+)/) || [])[1]);
    check("o prazo configurado não passa de 1 segundo", debounce > 0 && debounce <= 1000, debounce);
    check("o polling visível não passa de 15 segundos", poll > 0 && poll <= 15000, poll);
  }

  console.log("\n15. Troca de identidade nunca aplica payload no escopo antigo");
  {
    const servidor = servidorFalso();
    const a = await ligarAparelho(servidor, "device-aparelho-a01");
    a.run(`__scopeChanged = 0; CloudSync.configure({
      onAccountScopeChanged: () => { __scopeChanged += 1; },
    })`);
    servidor.activeAccountId = "00000000-0000-4000-8000-000000000002";
    await a.run("CloudSync.syncNow()");
    await Promise.resolve();
    check("o erro de escopo chama a recuperação de identidade", a.run("__scopeChanged") === 1, a.run("__scopeChanged"));
    check("o motor antigo para sem declarar logout", a.run("CloudSync.isEnabled()") === false
      && a.run("CloudSync.status().errorCode") === "account_scope_changed", JSON.stringify(a.run("CloudSync.status()")));
    check("nenhum payload de outra conta entrou no banco", a.run("FinanceStore.snapshot().transactions.length") === 0);
  }

  console.log("\n16. Ciclo em voo é cancelado antes de tocar no novo escopo");
  {
    const servidor = servidorFalso();
    const a = await ligarAparelho(servidor, "device-aparelho-a01");
    servidor.aplicar([{
      entity: "transactions", entityId: "tx-antiga", op: "put",
      rev: "000000000000010.000001.device-remoto-a",
      payload: { id: "tx-antiga", type: "expense", amount: 99, date: "2026-08-15", categoryId: "lazer" },
    }]);
    const baseFetch = servidor.handler(servidor);
    let liberar;
    let iniciou;
    const iniciouPromise = new Promise((resolve) => { iniciou = resolve; });
    let segurar = true;
    a.ctx.fetch = (url, options) => {
      if (segurar && String(url).includes("/changes") && (!options || !options.method || options.method === "GET")) {
        segurar = false;
        iniciou();
        return new Promise((resolve) => { liberar = () => baseFetch(url, options).then(resolve); });
      }
      return baseFetch(url, options);
    };
    const ciclo = a.run("CloudSync.syncNow()");
    await iniciouPromise;
    a.run("CloudSync.disable()");
    await a.run("FinanceStore.switchScope('u_outra-conta')");
    liberar();
    await ciclo;
    check("a resposta antiga não foi aplicada no banco novo",
      !a.run("FinanceStore.snapshot().transactions.some((t) => t.id === 'tx-antiga')"));
    check("o cursor do banco novo não avançou", await a.run("FinanceStore.localMetaGet(META_CURSOR)") == null,
      await a.run("FinanceStore.localMetaGet(META_CURSOR)"));
  }

  console.log("\n17. Restauração nunca aceita checkpoint parcial");
  {
    const servidor = servidorFalso();
    const a = await ligarAparelho(servidor, "device-aparelho-a01");
    lancar(a, { id: "tx-preservado", type: "expense", amount: 25, date: "2026-08-16", categoryId: "lazer" });
    await flush(a);
    await a.run("CloudSync.syncNow()");
    a.run(`
      __restoreApplyCalls = 0;
      __restoreOutboxCalls = 0;
      __checkpointReads = 0;
      __originalApplyRemoteOps = FinanceStore.applyRemoteOps;
      __originalOutboxAppend = FinanceStore.outboxAppend;
      FinanceStore.applyRemoteOps = async (...args) => {
        __restoreApplyCalls += 1;
        return __originalApplyRemoteOps(...args);
      };
      FinanceStore.outboxAppend = async (...args) => {
        __restoreOutboxCalls += 1;
        return __originalOutboxAppend(...args);
      };
      CloudAdapter.prototype.createCheckpoint = async () => ({ id: "checkpoint-seguranca" });
      CloudAdapter.prototype.readCheckpoint = async (_id, after) => {
        __checkpointReads += 1;
        return {
          ops: [{ entity: "transactions", entityId: "tx-parcial", op: "put", payload: {
            id: "tx-parcial", type: "expense", amount: 1, date: "2026-08-01", categoryId: "lazer"
          } }],
          hasMore: true,
          after: String(after || ""),
        };
      };
    `);
    const stalled = await a.run(`CloudSync.restoreCheckpoint("checkpoint-travado")`);
    check("cursor parado cancela a restauração", stalled.ok === false && stalled.reason === "cursor_stalled", JSON.stringify(stalled));
    check("checkpoint parcial não toca na base nem na fila", a.run("__restoreApplyCalls") === 0
      && a.run("__restoreOutboxCalls") === 0
      && a.run(`FinanceStore.snapshot().transactions.some((t) => t.id === "tx-preservado")`));

    a.run(`
      __restoreApplyCalls = 0;
      __restoreOutboxCalls = 0;
      __checkpointReads = 0;
      CloudAdapter.prototype.readCheckpoint = async () => {
        __checkpointReads += 1;
        return { ops: [], hasMore: true, after: String(__checkpointReads) };
      };
    `);
    const limited = await a.run(`CloudSync.restoreCheckpoint("checkpoint-sem-fim")`);
    check("limite de páginas cancela a restauração", limited.ok === false && limited.reason === "page_limit"
      && a.run("__checkpointReads") === 200, JSON.stringify({ limited, reads: a.run("__checkpointReads") }));
    check("limite nunca transforma leitura parcial em exclusões", a.run("__restoreApplyCalls") === 0
      && a.run("__restoreOutboxCalls") === 0
      && a.run(`FinanceStore.snapshot().transactions.some((t) => t.id === "tx-preservado")`));
    await a.run("CloudSync.disable()");
  }

  console.log("\n18. Restauração e fila sobrevivem juntas ao cancelamento da sessão");
  {
    const servidor = servidorFalso();
    const a = await ligarAparelho(servidor, "device-aparelho-a01");
    let enterWrite;
    let releaseWrite;
    const writeEntered = new Promise((resolve) => { enterWrite = resolve; });
    const writeReleased = new Promise((resolve) => { releaseWrite = resolve; });
    a.ctx.__waitRestoreWrite = () => {
      enterWrite();
      return writeReleased;
    };
    a.run(`
      __atomicRestoreCommit = null;
      __blockRestoreWrite = true;
      __originalRestoreWrite = LocalStorageAdapter.prototype.writeChanges;
      LocalStorageAdapter.prototype.writeChanges = async function(changeSet, commit) {
        if (__blockRestoreWrite && changeSet && commit && Array.isArray(commit.outboxAdds)
          && commit.outboxAdds.some((entry) => entry.entityId === "tx-restaurado")) {
          __blockRestoreWrite = false;
          __atomicRestoreCommit = { queued: commit.outboxAdds.length };
          await __waitRestoreWrite();
        }
        return __originalRestoreWrite.call(this, changeSet, commit);
      };
      CloudAdapter.prototype.createCheckpoint = async () => ({ id: "checkpoint-seguranca" });
      CloudAdapter.prototype.readCheckpoint = async () => ({
        ops: [{ entity: "transactions", entityId: "tx-restaurado", op: "put", payload: {
          id: "tx-restaurado", type: "expense", amount: 77, date: "2026-08-20", categoryId: "lazer"
        } }],
        hasMore: false,
        after: "",
      });
    `);

    const restoring = a.run(`CloudSync.restoreCheckpoint("checkpoint-atomico")`);
    await writeEntered;
    a.run("CloudSync.disable()");
    releaseWrite();
    const result = await restoring;
    const queue = await a.run("FinanceStore.outboxRead(0)");
    const restoredInMemory = a.run(`FinanceStore.snapshot().transactions.some((item) => item.id === "tx-restaurado")`);
    const atomicCommit = a.run("__atomicRestoreCommit");

    check("o ciclo interrompido informa cancelamento", result.ok === false && result.reason === "sync_cancelled", JSON.stringify(result));
    check("a restauração foi gravada com a fila na mesma operação", atomicCommit && atomicCommit.queued > 0
      && queue.some((entry) => entry.entityId === "tx-restaurado"), JSON.stringify({ atomicCommit, queue }));
    check("não existe restauração local sem operação pendente para subir", restoredInMemory
      && queue.some((entry) => entry.entityId === "tx-restaurado"));
  }

  console.log("\n19. Voltar a um valor remoto depois de editar continua sendo alteração local");
  {
    const servidor = servidorFalso();
    servidor.aplicar([{
      entity: "settings", entityId: "monthlyIncome", op: "put",
      rev: "000000000000030.000001.device-remoto-a", payload: 1000,
    }]);
    const a = await ligarAparelho(servidor, "device-aparelho-a01");
    check("o valor remoto chegou", a.run("FinanceStore.snapshot().monthlyIncome") === 1000);
    a.run(`FinanceStore.persist({ ...FinanceStore.snapshot(), monthlyIncome: 2000 })`);
    await flush(a);
    a.run(`FinanceStore.persist({ ...FinanceStore.snapshot(), monthlyIncome: 1000 })`);
    await flush(a);
    const values = (await a.run("FinanceStore.outboxRead(0)"))
      .filter((entry) => entry.entity === "settings" && entry.entityId === "monthlyIncome")
      .map((entry) => entry.payload);
    check("editar e depois voltar gera as duas operações", values.join(",") === "2000,1000", JSON.stringify(values));
  }

  console.log("\n20. Apagar tudo exclui uma resposta capturada antes do reset");
  {
    const servidor = servidorFalso();
    const a = await ligarAparelho(servidor, "device-aparelho-a01");
    servidor.aplicar([{
      entity: "transactions", entityId: "tx-antes-do-reset", op: "put",
      rev: "000000000000090.000001.device-remoto-a",
      payload: { id: "tx-antes-do-reset", type: "expense", amount: 44, date: "2026-08-24", categoryId: "lazer" },
    }]);

    const baseFetch = servidor.handler(servidor);
    let releaseResponse;
    let markStarted;
    const started = new Promise((resolve) => { markStarted = resolve; });
    let holdFirstPull = true;
    a.ctx.fetch = (url, options) => {
      const method = (options && options.method) || "GET";
      if (holdFirstPull && method === "GET" && String(url).includes("/changes")) {
        holdFirstPull = false;
        markStarted();
        return new Promise((resolve) => {
          releaseResponse = () => baseFetch(url, options).then(resolve);
        });
      }
      return baseFetch(url, options);
    };
    a.run(`
      __resetLockCalls = [];
      __resetPurged = false;
      __resetCalls = 0;
      navigator.locks = {
        request: async (name, options, callback) => {
          __resetLockCalls.push({ name, wait: !Object.prototype.hasOwnProperty.call(options || {}, "ifAvailable") });
          return callback({ name });
        },
      };
      CloudAdapter.prototype.resetRemote = async () => {
        __resetCalls += 1;
        return { revision: "1", resetRev: "001787000000000.000900.server_reset:test1", applied: 1 };
      };
    `);

    const oldCycle = a.run("CloudSync.syncNow()");
    await started;
    const deleting = a.run(`(async () => {
      const reset = await CloudSync.resetRemote();
      if (reset && reset.remoteDeleted) {
        await FinanceStore.purge();
        __resetPurged = true;
      }
      return reset;
    })()`);

    // Sem exclusão mútua, o reset antigo terminava nestas microtarefas e o
    // purge acontecia enquanto a resposta velha ainda estava presa na rede.
    for (let turn = 0; turn < 20; turn++) await Promise.resolve();
    const purgedBeforeRelease = a.run("__resetPurged");
    releaseResponse();
    const [cycleResult, resetResult] = await Promise.all([oldCycle, deleting]);
    const lockCalls = a.run("__resetLockCalls.slice()");

    check("o purge espera o ciclo capturado terminar", purgedBeforeRelease === false, String(purgedBeforeRelease));
    check("o ciclo velho é cancelado e o reset conclui", cycleResult === false
      && resetResult && resetResult.ok === true && resetResult.remoteDeleted === true
      && resetResult.localPrepared === true && resetResult.reason === null
      && a.run("__resetCalls") === 1, JSON.stringify({ cycleResult, resetResult, resetCalls: a.run("__resetCalls") }));
    check("o reset aguarda o lock exclusivo do escopo", lockCalls.length >= 2 && lockCalls[lockCalls.length - 1].wait === true,
      JSON.stringify(lockCalls));
    check("o reset concluído não deixa a conta em sincronização infinita",
      a.run(`CloudSync.status().phase`) !== "syncing", JSON.stringify(a.run(`CloudSync.status()`)));
    check("a resposta anterior nunca reaparece depois do purge",
      !a.run(`FinanceStore.snapshot().transactions.some((item) => item.id === "tx-antes-do-reset")`)
      && !a.aplicados.some((data) => (data.transactions || []).some((item) => item.id === "tx-antes-do-reset")));
  }

  console.log("\n21. Confirmação remota sobrevive a falhas na preparação local");
  {
    const servidor = servidorFalso();
    const a = await ligarAparelho(servidor, "device-aparelho-a01");
    a.run(`
      __resetCalls = 0;
      __originalOutboxClear = FinanceStore.outboxClear;
      CloudAdapter.prototype.resetRemote = async () => {
        __resetCalls += 1;
        return { revision: "31", resetRev: "001787000000000.000901.server_reset:test2", applied: 1 };
      };
      FinanceStore.outboxClear = async () => {
        const error = new Error("falha simulada na fila");
        error.code = "storage_test_failure";
        throw error;
      };
    `);
    const result = await a.run("CloudSync.resetRemote()");
    const status = a.run(`({ ...CloudSync.status() })`);
    a.run("FinanceStore.outboxClear = __originalOutboxClear");

    check("falha ao limpar a fila preserva a confirmação do servidor",
      result.ok === false && result.remoteDeleted === true && result.localPrepared === false
        && result.reason === "outbox_clear_failed" && a.run("__resetCalls") === 1,
      JSON.stringify({ result, status }));
    check("falha ao limpar a fila termina fora de syncing",
      status.phase === "error" && status.errorCode === "outbox_clear_failed", JSON.stringify(status));
  }
  {
    const servidor = servidorFalso();
    const a = await ligarAparelho(servidor, "device-aparelho-a02");
    a.run(`
      __resetCalls = 0;
      __originalLocalMetaPut = FinanceStore.localMetaPut;
      CloudAdapter.prototype.resetRemote = async () => {
        __resetCalls += 1;
        return { revision: "47", resetRev: "001787000000000.000902.server_reset:test3", applied: 1 };
      };
      FinanceStore.localMetaPut = async (key, value, targetScope) => {
        if (key === META_CURSOR) {
          const error = new Error("falha simulada no cursor");
          error.code = "storage_test_failure";
          throw error;
        }
        return __originalLocalMetaPut(key, value, targetScope);
      };
    `);
    const result = await a.run("CloudSync.resetRemote()");
    const status = a.run(`({ ...CloudSync.status() })`);
    a.run("FinanceStore.localMetaPut = __originalLocalMetaPut");

    check("falha ao gravar o cursor preserva a confirmação do servidor",
      result.ok === false && result.remoteDeleted === true && result.localPrepared === false
        && result.reason === "cursor_write_failed" && a.run("__resetCalls") === 1,
      JSON.stringify({ result, status }));
    check("falha ao gravar o cursor termina fora de syncing",
      status.phase === "error" && status.errorCode === "cursor_write_failed", JSON.stringify(status));
  }

  console.log("\n22. Timeout continua ativo enquanto o corpo da resposta é lido");
  {
    let nextTimerId = 0;
    let latestTimerId = 0;
    const timerCallbacks = new Map();
    const activeTimers = new Set();
    let markBodyStarted;
    const bodyStarted = new Promise((resolve) => { markBodyStarted = resolve; });
    const fakeTimers = {
      setTimeout: (callback) => {
        const id = ++nextTimerId;
        latestTimerId = id;
        timerCallbacks.set(id, callback);
        activeTimers.add(id);
        return id;
      },
      clearTimeout: (id) => { activeTimers.delete(id); },
    };
    const hangingBodyFetch = async (_url, options) => ({
      ok: true,
      status: 200,
      headers: {
        get: (name) => String(name).toLowerCase() === "content-type" ? "application/json" : null,
      },
      text: () => {
        markBodyStarted();
        return new Promise((_resolve, reject) => {
          const abort = () => {
            const error = new Error("leitura abortada");
            error.name = "AbortError";
            reject(error);
          };
          if (options.signal.aborted) abort();
          else options.signal.addEventListener("abort", abort, { once: true });
        });
      },
    });
    const ctx = carregar(hangingBodyFetch, null, fakeTimers);
    const pending = ctx.run(`(async () => {
      try {
        const cloud = new CloudAdapter({
          enabled: true, baseUrl: "/api/sync", token: "token-teste",
          deviceId: "device-timeout", accountId: __accountId, timeoutMs: 1000,
        });
        await cloud.init();
        return { ok: true };
      } catch (error) {
        return { ok: false, code: error && error.code, name: error && error.name };
      }
    })()`);
    await bodyStarted;
    const activeWhileReading = activeTimers.has(latestTimerId);
    timerCallbacks.get(latestTimerId)();
    const result = await Promise.race([
      pending,
      new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 1000)),
    ]);

    check("o timer não é limpo quando chegam apenas os cabeçalhos", activeWhileReading === true,
      JSON.stringify({ activeWhileReading, latestTimerId }));
    check("abortar a leitura do corpo vira timeout de sincronização",
      !result.timeout && result.ok === false && result.code === "timeout", JSON.stringify(result));
    check("o timer é limpo quando a chamada inteira termina", activeTimers.has(latestTimerId) === false,
      JSON.stringify(Array.from(activeTimers)));
  }

  console.log("\n23. Troca de conta durante a exclusão não apaga o escopo novo");
  {
    const actionCtx = {
      console, Promise,
      GUEST_SCOPE: "guest",
      state: {},
      __scope: "u_conta_a",
      __generation: 10,
      __purgeCalls: 0,
      __notifications: [],
      marcarAppEmUso() {},
      render() {},
      clearSafeErrors() {},
      applyTheme() {},
      freshOnboarding: () => ({}),
      freshTxForm: () => ({}),
      accountForgetThisDevice: async () => true,
      reportSafeError() {},
    };
    actionCtx.notify = (message, tone) => actionCtx.__notifications.push({ message, tone: tone || "" });
    actionCtx.requestConfirmation = (options) => { actionCtx.__confirmation = options; };
    actionCtx.FinanceStore = {
      scope: () => actionCtx.__scope,
      generation: () => actionCtx.__generation,
      purge: async () => { actionCtx.__purgeCalls += 1; return true; },
      snapshot: () => ({}),
    };
    let resolveReset;
    actionCtx.CloudSync = {
      resetRemote: () => new Promise((resolve) => { resolveReset = resolve; }),
    };
    actionCtx.globalThis = actionCtx;
    vm.createContext(actionCtx);
    vm.runInContext(read("js/actions.js"), actionCtx, { filename: "js/actions.js" });
    const openConfirmation = () => vm.runInContext(`onClick({ target: { closest: () => ({
      dataset: { action: "privacy-delete-all", id: "", value: "" },
      classList: { contains: () => false }
    }) } })`, actionCtx);

    openConfirmation();
    const deleting = actionCtx.__confirmation.onConfirm();
    actionCtx.__scope = "u_conta_b";
    actionCtx.__generation = 11;
    resolveReset({ ok: true, remoteDeleted: true, localPrepared: true, reason: null });
    await deleting;

    check("a confirmação da conta A não apaga o banco aberto da conta B", actionCtx.__purgeCalls === 0,
      String(actionCtx.__purgeCalls));
    check("a mensagem distingue a conta remota apagada da conta atual preservada",
      actionCtx.__notifications.some((item) => /conta anterior no servidor/.test(item.message)
        && /conta aberta agora não foi alterada/.test(item.message)), JSON.stringify(actionCtx.__notifications));

    actionCtx.__notifications = [];
    actionCtx.CloudSync.resetRemote = async () => ({
      ok: false, remoteDeleted: false, localPrepared: false, reason: "timeout",
    });
    openConfirmation();
    await actionCtx.__confirmation.onConfirm();
    check("resultado remoto desconhecido preserva a cópia local", actionCtx.__purgeCalls === 0,
      String(actionCtx.__purgeCalls));
    check("timeout não afirma que o servidor deixou tudo intacto",
      actionCtx.__notifications.some((item) => /Não foi possível confirmar a exclusão na conta/.test(item.message)
        && /cópia deste aparelho não foi apagada/.test(item.message)
        && !/Nada foi apagado/.test(item.message)), JSON.stringify(actionCtx.__notifications));
  }

  await espera(10);
  console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"}: ${ok} ok, ${fail} falha(s)\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((error) => { console.error(error); process.exit(1); });
