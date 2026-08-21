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
function carregar(fetchImpl, storage) {
  const ctx = {
    console, fetch: fetchImpl, Response, AbortController, URL, crypto,
    setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: storage || fakeLocalStorage({ cofre_device_id: "device-de-teste-0001" }),
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

const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Servidor de mentira que se comporta como o real: guarda a operação VENCEDORA
// de cada (entidade, id) e devolve por cursor o que veio depois.
function servidorFalso(opcoes) {
  const linhas = new Map();     // chave -> { seq, entity, entityId, op, rev, payload }
  let seq = 0;
  const recebidos = [];
  return {
    linhas, recebidos,
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
        const falado = Number(cabecalhos["X-Sync-Protocol"] || 3) || 3;
        const envelope = {
          protocol: falado,
          serverProtocol: servidor.serverProtocol,
          minimumWriteProtocol: servidor.minimumWriteProtocol,
        };
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
    ctx.run(`CloudSync.configure({ readLocal: () => FinanceStore.snapshot(), applyRemote: (d) => { __ultimo = d; }, onStatus: () => {} })`);
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
    ctx.run(`CloudSync.configure({ readLocal: () => FinanceStore.snapshot(), applyRemote: (d) => { __ultimo = d; }, onStatus: () => {} })`);
    await ctx.run("CloudSync.enable()");
    expirar = true;
    ctx.run(`FinanceStore.persist({ ...FinanceStore.snapshot(), transactions: [{ id: "tx-sessao", type: "expense", amount: 1, date: "2026-08-07", categoryId: "lazer" }] })`);
    await ctx.run("FinanceStore.flush()");
    await ctx.run("CloudSync.syncNow()");

    check("a sincronização parou", ctx.run("CloudSync.isEnabled()") === false);
    check("a mensagem pede para entrar de novo", /Entre novamente/.test(ctx.run("CloudSync.status().error") || ""));
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
    // semeadura precisa cunhar uma, mandar, e GRAVAR: se a marca ficasse só na
    // memória, o carregamento seguinte traria o registro sem marca de novo e
    // ele perderia uma disputa que deveria vencer.
    const servidor = servidorFalso();
    const storage = fakeLocalStorage({ cofre_device_id: "device-aparelho-a01" });
    const ctx = carregar(servidor.handler(servidor), storage);
    ctx.run(`accountDeviceId = () => "device-aparelho-a01";`);
    await ctx.run(`FinanceStore.init(new LocalStorageAdapter("u_ana"), { scope: "u_ana" })`);
    await ctx.run(`FinanceStore.replaceAll({ ...FinanceStore.snapshot(),
      transactions: [{ id: "tx-sem-marca", type: "expense", amount: 33, date: "2026-08-12", categoryId: "lazer" }] })`);
    check("o registro entrou sem marca", ctx.run(`FinanceStore.syncRevOf(FinanceStore.snapshot().transactions[0])`) === "",
      ctx.run(`FinanceStore.syncRevOf(FinanceStore.snapshot().transactions[0])`));

    ctx.run(`CloudSync.configure({ readLocal: () => FinanceStore.snapshot(),
      applyRemote: (d) => { __ultimo = d; FinanceStore.persist(d); }, onStatus: () => {} })`);
    await ctx.run("CloudSync.enable()");

    check("o registro sem marca chegou ao servidor", servidor.linhas.has("transactions tx-sem-marca"));
    check("e ganhou marca deste aparelho",
      /^\d{15}\.\d{6}\.device-aparelho-a01$/.test(ctx.run(`FinanceStore.syncRevOf(FinanceStore.snapshot().transactions[0])`)),
      ctx.run(`FinanceStore.syncRevOf(FinanceStore.snapshot().transactions[0])`));

    // O que importa: a marca tem de estar no BANCO, nao so no snapshot em memoria.
    const gravado = await ctx.run(`FinanceStore.reload().then((d) => FinanceStore.syncRevOf(d.transactions[0]))`);
    check("a marca foi gravada no banco", /^\d{15}\.\d{6}\./.test(String(gravado)), String(gravado));
  }

  await espera(10);
  console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"}: ${ok} ok, ${fail} falha(s)\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((error) => { console.error(error); process.exit(1); });
