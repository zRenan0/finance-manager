// test-storage-scope-races.js; operações antigas não podem tocar na conta nova.
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const FONTES = ["js/utils.js", "js/perf.js", "js/router.js", "js/icons.js", "js/rules.js",
  "js/layout.js", "js/safe-errors.js", "js/storage.js"];

let ok = 0;
let fail = 0;
function check(label, condition, detail) {
  if (condition) { ok++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail == null ? "" : `: ${detail}`}`); }
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function settle(promise) {
  return Promise.resolve(promise).then(
    (value) => ({ status: "fulfilled", value }),
    (error) => ({ status: "rejected", error }),
  );
}

function fakeLocalStorage() {
  const map = new Map();
  return {
    getItem: (key) => map.has(String(key)) ? map.get(String(key)) : null,
    setItem: (key, value) => { map.set(String(key), String(value)); },
    removeItem: (key) => { map.delete(String(key)); },
    key: (index) => Array.from(map.keys())[index] || null,
    get length() { return map.size; },
  };
}

function fakeLockManager() {
  const tails = new Map();
  const active = new Map();
  const manager = {
    violations: 0,
    request(name, _options, callback) {
      const key = String(name);
      const previous = tails.get(key) || Promise.resolve();
      const running = previous.catch(() => {}).then(async () => {
        const count = active.get(key) || 0;
        if (count) manager.violations += 1;
        active.set(key, count + 1);
        try { return await callback({ name: key, mode: "exclusive" }); }
        finally {
          const next = (active.get(key) || 1) - 1;
          if (next > 0) active.set(key, next);
          else active.delete(key);
        }
      });
      const tail = running.catch(() => {});
      tails.set(key, tail);
      tail.then(() => { if (tails.get(key) === tail) tails.delete(key); });
      return running;
    },
  };
  return manager;
}

function rawData(transactionId) {
  return {
    transactions: [{
      id: transactionId,
      type: "expense",
      amount: 10,
      date: "2026-08-24",
      categoryId: "lazer",
      updatedAt: "2026-08-24T10:00:00.000Z",
    }],
    categories: [],
    goals: [],
    assets: [],
    settings: {},
  };
}

function emptyRaw() {
  return { transactions: [], categories: [], goals: [], assets: [], settings: {} };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class ControlledAdapter {
  constructor(name, data) {
    this.label = name;
    this.data = clone(data);
    this.nextInitGate = null;
    this.nextReadGate = null;
    this.nextClearGate = null;
    this.nextWriteGate = null;
    this.nextReplaceGate = null;
    this.outbox = [{ seq: 1, entryKey: `${name}-entry` }];
    this.meta = { cursor: `${name}-cursor` };
    this.calls = {
      replaceAll: 0, outboxClear: 0, outboxDrop: 0,
      localMetaClear: 0, localMetaDelete: 0, close: 0,
    };
  }
  get name() { return this.label; }
  async init() {
    const gate = this.nextInitGate;
    this.nextInitGate = null;
    if (gate) { gate.entered.resolve(); await gate.release.promise; }
    return true;
  }
  async readAll() {
    const result = clone(this.data);
    const gate = this.nextReadGate;
    this.nextReadGate = null;
    if (gate) { gate.entered.resolve(); await gate.release.promise; }
    return result;
  }
  _applyCommit(commit) {
    const options = commit || {};
    const drops = new Set((options.outboxDrops || []).map(Number));
    this.outbox = this.outbox.filter((entry) => !drops.has(Number(entry.seq)));
    let nextSeq = this.outbox.reduce((highest, entry) => Math.max(highest, Number(entry.seq) || 0), 0);
    (options.outboxAdds || []).forEach((entry) => {
      this.outbox.push({ ...clone(entry), seq: ++nextSeq });
    });
    (options.metaDeletes || []).forEach((key) => { delete this.meta[String(key)]; });
    Object.entries(options.metaPuts || {}).forEach(([key, value]) => { this.meta[String(key)] = clone(value); });
  }
  async writeChanges(changeSet, commit) {
    const gate = this.nextWriteGate;
    this.nextWriteGate = null;
    if (gate) { gate.entered.resolve(); await gate.release.promise; }
    if (changeSet) Object.entries(changeSet.puts || {}).forEach(([store, records]) => {
      const field = store === "transactions" ? "transactions"
        : store === "categories" ? "categories"
          : store === "goals" ? "goals"
            : store === "assets" ? "assets" : null;
      if (!field) return;
      const byId = new Map((this.data[field] || []).map((record) => [record.id, record]));
      (records || []).forEach((record) => byId.set(record.id, clone(record)));
      (changeSet.deletes && changeSet.deletes[store] || []).forEach((id) => byId.delete(id));
      this.data[field] = Array.from(byId.values());
    });
    if (changeSet) Object.assign(this.data.settings, clone(changeSet.settings || {}));
    this._applyCommit(commit);
    return true;
  }
  async replaceAll(data, commit) {
    const gate = this.nextReplaceGate;
    this.nextReplaceGate = null;
    if (gate) { gate.entered.resolve(); await gate.release.promise; }
    this.calls.replaceAll += 1;
    const settings = {};
    Object.entries(data || {}).forEach(([key, value]) => {
      if (["transactions", "categories", "goals", "assets"].includes(key)) return;
      settings[key] = value === undefined ? undefined : clone(value);
    });
    this.data = {
      transactions: clone(data.transactions || []),
      categories: clone(data.categories || []),
      goals: clone(data.goals || []),
      assets: clone(data.assets || []),
      settings,
    };
    this._applyCommit(commit);
    return true;
  }
  async clearAll() {
    const gate = this.nextClearGate;
    this.nextClearGate = null;
    if (gate) { gate.entered.resolve(); await gate.release.promise; }
    this.data = emptyRaw();
    return true;
  }
  async outboxRead() { return clone(this.outbox); }
  async outboxClear() { this.calls.outboxClear += 1; return true; }
  async outboxDrop(seqs) {
    this.calls.outboxDrop += 1;
    const drop = new Set(seqs.map(Number));
    this.outbox = this.outbox.filter((entry) => !drop.has(Number(entry.seq)));
    return true;
  }
  async localMetaGet(key) {
    return Object.prototype.hasOwnProperty.call(this.meta, String(key)) ? this.meta[String(key)] : null;
  }
  async localMetaDelete(key) {
    this.calls.localMetaDelete += 1;
    delete this.meta[String(key)];
    return true;
  }
  async localMetaClear() { this.calls.localMetaClear += 1; return true; }
  close() { this.calls.close += 1; }
  blockNextRead() {
    this.nextReadGate = { entered: deferred(), release: deferred() };
    return this.nextReadGate;
  }
  blockNextInit() {
    this.nextInitGate = { entered: deferred(), release: deferred() };
    return this.nextInitGate;
  }
  blockNextClear() {
    this.nextClearGate = { entered: deferred(), release: deferred() };
    return this.nextClearGate;
  }
  blockNextWrite() {
    this.nextWriteGate = { entered: deferred(), release: deferred() };
    return this.nextWriteGate;
  }
  blockNextReplace() {
    this.nextReplaceGate = { entered: deferred(), release: deferred() };
    return this.nextReplaceGate;
  }
}

function context(sharedLocalStorage, sharedLocks) {
  const ctx = {
    console, crypto, URL,
    setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: sharedLocalStorage || fakeLocalStorage(),
    ...(sharedLocks ? { navigator: { onLine: true, locks: sharedLocks } } : {}),
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  FONTES.forEach((file) => vm.runInContext(read(file), ctx, { filename: file }));
  ctx.run = (code) => vm.runInContext(code, ctx);
  return ctx;
}

(async () => {
  console.log("\n1. Reload antigo não substitui o snapshot da conta nova");
  {
    const ctx = context();
    const adapterA = new ControlledAdapter("adapter-a", rawData("tx-a"));
    const adapterB = new ControlledAdapter("adapter-b", rawData("tx-b"));
    ctx.adapterA = adapterA;
    ctx.adapterB = adapterB;
    await ctx.run(`FinanceStore.init(adapterA, { scope: "u_a" })`);

    const gate = adapterA.blockNextRead();
    const staleReload = settle(ctx.run("FinanceStore.reload()"));
    await gate.entered.promise;
    await ctx.run(`FinanceStore.switchScope("u_b", adapterB)`);
    gate.release.resolve();
    const reloadSettled = await staleReload;

    const result = ctx.run(`({
      scope: FinanceStore.scope(),
      adapter: FinanceStore.adapterName(),
      ids: FinanceStore.snapshot().transactions.map((item) => item.id)
    })`);
    check("o escopo e o adaptador continuam sendo os de B", result.scope === "u_b" && result.adapter === "adapter-b", JSON.stringify(result));
    check("a resposta atrasada de A foi descartada", result.ids.join(",") === "tx-b", JSON.stringify(result));
    check("o chamador antigo recebe cancelamento, não dados de B", reloadSettled.status === "rejected"
      && reloadSettled.error && reloadSettled.error.code === "sync_cancelled", String(reloadSettled.error));
    check("o cancelamento não cria alerta de armazenamento em B", ctx.run("FinanceStore.isHealthy()") === true);
  }

  console.log("\n2. Purge antigo para antes de qualquer etapa na conta nova");
  {
    const ctx = context();
    const adapterA = new ControlledAdapter("adapter-a", rawData("tx-a"));
    const adapterB = new ControlledAdapter("adapter-b", rawData("tx-b"));
    ctx.adapterA = adapterA;
    ctx.adapterB = adapterB;
    await ctx.run(`FinanceStore.init(adapterA, { scope: "u_a" })`);

    const gate = adapterA.blockNextClear();
    const stalePurge = ctx.run("FinanceStore.purge()");
    await gate.entered.promise;
    await ctx.run(`FinanceStore.switchScope("u_b", adapterB)`);
    const before = clone(adapterB.calls);
    gate.release.resolve();
    const purgeResult = await stalePurge;

    const result = ctx.run(`({
      scope: FinanceStore.scope(),
      adapter: FinanceStore.adapterName(),
      ids: FinanceStore.snapshot().transactions.map((item) => item.id)
    })`);
    check("a limpeza obsoleta informa cancelamento", purgeResult === false, String(purgeResult));
    check("a conta B continua carregada e intacta", result.scope === "u_b" && result.adapter === "adapter-b"
      && result.ids.join(",") === "tx-b", JSON.stringify(result));
    check("nenhuma etapa destrutiva foi desviada para B", JSON.stringify(adapterB.calls) === JSON.stringify(before),
      JSON.stringify({ before, after: adapterB.calls }));
    check("o armazenamento físico de B preserva o lançamento", adapterB.data.transactions.map((item) => item.id).join(",") === "tx-b");
    check("a conta B continua marcada como saudável", ctx.run("FinanceStore.isHealthy()") === true);
  }

  console.log("\n3. Inicialização antiga não reassume depois da mais nova");
  {
    const ctx = context();
    const adapterA = new ControlledAdapter("adapter-a", rawData("tx-a"));
    const adapterB = new ControlledAdapter("adapter-b", rawData("tx-b"));
    ctx.adapterA = adapterA;
    ctx.adapterB = adapterB;
    const gate = adapterA.blockNextInit();
    const staleInit = settle(ctx.run(`FinanceStore.init(adapterA, { scope: "u_a" })`));
    await gate.entered.promise;
    await ctx.run(`FinanceStore.init(adapterB, { scope: "u_b" })`);
    gate.release.resolve();
    const initSettled = await staleInit;

    const result = ctx.run(`({
      scope: FinanceStore.scope(),
      adapter: FinanceStore.adapterName(),
      ids: FinanceStore.snapshot().transactions.map((item) => item.id),
      healthy: FinanceStore.isHealthy()
    })`);
    check("a inicialização mais recente mantém escopo e adaptador", result.scope === "u_b" && result.adapter === "adapter-b", JSON.stringify(result));
    check("o snapshot mais recente não é substituído", result.ids.join(",") === "tx-b" && result.healthy, JSON.stringify(result));
    check("a inicialização antiga termina como cancelada", initSettled.status === "rejected"
      && initSettled.error && initSettled.error.code === "sync_cancelled", String(initSettled.error));
  }

  console.log("\n4. Restore interrompe quando o flush pertence ao escopo antigo");
  {
    const ctx = context();
    const adapterA = new ControlledAdapter("adapter-a", rawData("tx-a"));
    const adapterB = new ControlledAdapter("adapter-b", rawData("tx-b"));
    ctx.adapterA = adapterA;
    ctx.adapterB = adapterB;
    await ctx.run(`FinanceStore.init(adapterA, { scope: "u_a" })`);
    const gate = adapterA.blockNextWrite();
    const pendingPersist = ctx.run(`FinanceStore.persist({
      ...FinanceStore.snapshot(),
      monthlyIncome: 4321
    })`);
    const staleRestore = ctx.run(`FinanceStore.replaceAll({
      ...FinanceStore.snapshot(),
      transactions: []
    })`);
    await gate.entered.promise;
    await ctx.run(`FinanceStore.switchScope("u_b", adapterB)`);
    gate.release.resolve();
    const [persistResult, restoreResult] = await Promise.all([pendingPersist, staleRestore]);

    const result = ctx.run(`({
      scope: FinanceStore.scope(),
      adapter: FinanceStore.adapterName(),
      ids: FinanceStore.snapshot().transactions.map((item) => item.id),
      healthy: FinanceStore.isHealthy()
    })`);
    check("flush e restore antigos informam cancelamento", persistResult === false && restoreResult === false,
      JSON.stringify({ persistResult, restoreResult }));
    check("o restore não substitui a conta B", result.scope === "u_b" && result.adapter === "adapter-b"
      && result.ids.join(",") === "tx-b" && result.healthy, JSON.stringify(result));
  }

  console.log("\n5. Clear antigo não continua no adaptador novo");
  {
    const ctx = context();
    const adapterA = new ControlledAdapter("adapter-a", rawData("tx-a"));
    const adapterB = new ControlledAdapter("adapter-b", rawData("tx-b"));
    ctx.adapterA = adapterA;
    ctx.adapterB = adapterB;
    await ctx.run(`FinanceStore.init(adapterA, { scope: "u_a" })`);
    const gate = adapterA.blockNextClear();
    const staleClear = ctx.run("FinanceStore.clear()");
    await gate.entered.promise;
    await ctx.run(`FinanceStore.switchScope("u_b", adapterB)`);
    const before = clone(adapterB.calls);
    gate.release.resolve();
    const clearResult = await staleClear;

    const result = ctx.run(`({
      scope: FinanceStore.scope(),
      adapter: FinanceStore.adapterName(),
      ids: FinanceStore.snapshot().transactions.map((item) => item.id),
      healthy: FinanceStore.isHealthy()
    })`);
    check("a limpeza simples obsoleta é cancelada", clearResult === false, String(clearResult));
    check("clear não continua nem altera B", result.scope === "u_b" && result.adapter === "adapter-b"
      && result.ids.join(",") === "tx-b" && result.healthy
      && JSON.stringify(adapterB.calls) === JSON.stringify(before), JSON.stringify({ result, before, after: adapterB.calls }));
  }

  console.log("\n6. Inicialização antiga não fecha o mesmo adaptador já assumido");
  {
    const ctx = context();
    const shared = new ControlledAdapter("adapter-compartilhado", rawData("tx-compartilhado"));
    ctx.shared = shared;
    const gate = shared.blockNextInit();
    const first = settle(ctx.run(`FinanceStore.init(shared, { scope: "u_mesma" })`));
    await gate.entered.promise;
    await ctx.run(`FinanceStore.init(shared, { scope: "u_mesma" })`);
    gate.release.resolve();
    const firstSettled = await first;

    const result = ctx.run(`({
      scope: FinanceStore.scope(),
      adapter: FinanceStore.adapterName(),
      ids: FinanceStore.snapshot().transactions.map((item) => item.id)
    })`);
    check("a conclusão obsoleta não fecha o adaptador atual", shared.calls.close === 0, JSON.stringify(shared.calls));
    check("a primeira inicialização informa cancelamento", firstSettled.status === "rejected"
      && firstSettled.error && firstSettled.error.code === "sync_cancelled", String(firstSettled.error));
    check("o mesmo adaptador continua carregado", result.scope === "u_mesma" && result.adapter === "adapter-compartilhado"
      && result.ids.join(",") === "tx-compartilhado", JSON.stringify(result));
  }

  console.log("\n7. Edição feita durante restore continua no armazenamento físico");
  {
    const ctx = context();
    const adapter = new ControlledAdapter("adapter-a", rawData("tx-original"));
    ctx.adapter = adapter;
    await ctx.run(`FinanceStore.init(adapter, { scope: "u_a" })`);
    const gate = adapter.blockNextReplace();
    const restore = ctx.run(`FinanceStore.replaceAll({
      ...FinanceStore.snapshot(),
      transactions: [{
        id: "tx-restaurado", type: "expense", amount: 20,
        date: "2026-08-23", categoryId: "lazer", updatedAt: "2026-08-23T10:00:00.000Z"
      }]
    })`);
    await gate.entered.promise;
    const concurrentPersist = ctx.run(`FinanceStore.persist({
      ...FinanceStore.snapshot(),
      transactions: [{
        id: "tx-concorrente", type: "expense", amount: 30,
        date: "2026-08-24", categoryId: "lazer", updatedAt: "2026-08-24T10:00:00.000Z"
      }]
    })`);
    await new Promise((resolve) => setTimeout(resolve, 120));
    gate.release.resolve();
    const [restoreResult, persistResult] = await Promise.all([restore, concurrentPersist]);
    await ctx.run("FinanceStore.reload()");

    const result = ctx.run(`({
      memory: FinanceStore.snapshot().transactions.map((item) => item.id),
      healthy: FinanceStore.isHealthy()
    })`);
    check("restore e edição concorrente confirmam as próprias gravações", restoreResult === true && persistResult === true,
      JSON.stringify({ restoreResult, persistResult }));
    check("a edição mais nova sobrevive à recarga", result.memory.join(",") === "tx-concorrente"
      && adapter.data.transactions.map((item) => item.id).join(",") === "tx-concorrente" && result.healthy,
    JSON.stringify({ result, physical: adapter.data.transactions.map((item) => item.id) }));
  }

  console.log("\n8. Reload no mesmo escopo não apaga uma edição feita durante a leitura");
  {
    const ctx = context();
    const adapter = new ControlledAdapter("adapter-a", rawData("tx-old"));
    ctx.adapter = adapter;
    await ctx.run(`FinanceStore.init(adapter, { scope: "u_a" })`);
    const gate = adapter.blockNextRead();
    const reload = ctx.run("FinanceStore.reload()");
    await gate.entered.promise;
    const persistResult = await ctx.run(`FinanceStore.persist({
      ...FinanceStore.snapshot(),
      transactions: [{
        id: "tx-new", type: "expense", amount: 40,
        date: "2026-08-24", categoryId: "lazer", updatedAt: "2026-08-24T11:00:00.000Z"
      }]
    })`);
    gate.release.resolve();
    const reloadResult = await reload;

    const memoryIds = Array.from(reloadResult.transactions || []).map((item) => item.id);
    const physicalIds = adapter.data.transactions.map((item) => item.id);
    check("a edição concorrente é confirmada", persistResult === true, String(persistResult));
    check("a leitura antiga é descartada em memória e no adaptador", memoryIds.join(",") === "tx-new"
      && physicalIds.join(",") === "tx-new", JSON.stringify({ memoryIds, physicalIds }));
  }

  console.log("\n9. Exclusões enfileiradas no escopo antigo nunca atingem a conta nova");
  {
    const ctx = context();
    const adapterA = new ControlledAdapter("adapter-a", rawData("tx-a"));
    const adapterB = new ControlledAdapter("adapter-b", rawData("tx-b"));
    ctx.adapterA = adapterA;
    ctx.adapterB = adapterB;
    await ctx.run(`FinanceStore.init(adapterA, { scope: "u_a" })`);
    const gate = adapterA.blockNextWrite();
    const pendingPersist = ctx.run(`FinanceStore.persist({ ...FinanceStore.snapshot(), monthlyIncome: 999 })`);
    await gate.entered.promise;
    const staleDrop = settle(ctx.run("FinanceStore.outboxDrop([1])"));
    const staleMetaDelete = settle(ctx.run(`FinanceStore.localMetaDelete("cursor")`));
    await ctx.run(`FinanceStore.switchScope("u_b", adapterB)`);
    const before = clone({ calls: adapterB.calls, outbox: adapterB.outbox, meta: adapterB.meta });
    gate.release.resolve();
    const [persistResult, dropSettled, metaSettled] = await Promise.all([pendingPersist, staleDrop, staleMetaDelete]);

    check("os três trabalhos antigos são cancelados", persistResult === false
      && dropSettled.status === "rejected" && dropSettled.error && dropSettled.error.code === "sync_cancelled"
      && metaSettled.status === "rejected" && metaSettled.error && metaSettled.error.code === "sync_cancelled",
    JSON.stringify({ persistResult, drop: dropSettled.error && dropSettled.error.code, meta: metaSettled.error && metaSettled.error.code }));
    check("fila e metadados de B não são tocados", JSON.stringify(before) === JSON.stringify({
      calls: adapterB.calls, outbox: adapterB.outbox, meta: adapterB.meta,
    }), JSON.stringify({ before, after: { calls: adapterB.calls, outbox: adapterB.outbox, meta: adapterB.meta } }));
    check("o cancelamento não marca a conta B como corrompida", ctx.run("FinanceStore.isHealthy()") === true);
  }

  console.log("\n10. Edição local feita durante uma descida remota preserva os dois lados");
  {
    const ctx = context();
    const adapter = new ControlledAdapter("adapter-a", rawData("tx-old"));
    ctx.adapter = adapter;
    await ctx.run(`FinanceStore.init(adapter, { scope: "u_a" })`);
    const gate = adapter.blockNextWrite();
    const remoteApply = ctx.run(`FinanceStore.applyRemoteOps([{
      entity: "transactions", entityId: "tx-remote", op: "put",
      rev: "000000000000010.000001.device-remoto-a",
      payload: {
        id: "tx-remote", type: "expense", amount: 50,
        date: "2026-08-24", categoryId: "lazer", updatedAt: "2026-08-24T12:00:00.000Z"
      }
    }], "u_a")`);
    await gate.entered.promise;
    const localPersist = ctx.run(`FinanceStore.persist({
      ...FinanceStore.snapshot(),
      transactions: [...FinanceStore.snapshot().transactions, {
        id: "tx-local", type: "expense", amount: 60,
        date: "2026-08-24", categoryId: "lazer", updatedAt: "2026-08-24T12:01:00.000Z"
      }]
    })`);
    await new Promise((resolve) => setTimeout(resolve, 120));
    gate.release.resolve();
    const [remoteResult, localResult] = await Promise.all([remoteApply, localPersist]);
    const memoryIds = ctx.run("FinanceStore.snapshot().transactions.map((item) => item.id).sort() ");
    const physicalIds = adapter.data.transactions.map((item) => item.id).sort();

    check("a descida e a edição local são confirmadas", remoteResult.changed === true && localResult === true,
      JSON.stringify({ remoteResult, localResult }));
    check("base anterior, remoto e edição concorrente sobrevivem juntos", Array.from(memoryIds).join(",") === "tx-local,tx-old,tx-remote"
      && physicalIds.join(",") === "tx-local,tx-old,tx-remote", JSON.stringify({ memoryIds, physicalIds }));
  }

  console.log("\n11. Edição concorrente do mesmo registro e ajuste vence a descida que ela observou");
  {
    const ctx = context();
    const adapter = new ControlledAdapter("adapter-a", rawData("tx-shared"));
    ctx.adapter = adapter;
    await ctx.run(`FinanceStore.init(adapter, { scope: "u_a" })`);
    const gate = adapter.blockNextWrite();
    const remoteApply = ctx.run(`FinanceStore.applyRemoteOps([{
      entity: "transactions", entityId: "tx-shared", op: "put",
      rev: "000000000000020.000001.device-remoto-a",
      payload: {
        id: "tx-shared", type: "expense", amount: 50,
        date: "2026-08-24", categoryId: "lazer", updatedAt: "2026-08-24T13:00:00.000Z"
      }
    }, {
      entity: "settings", entityId: "monthlyIncome", op: "put",
      rev: "000000000000020.000002.device-remoto-a", payload: 5000
    }], "u_a")`);
    await gate.entered.promise;
    const localPersist = ctx.run(`FinanceStore.persist({
      ...FinanceStore.snapshot(),
      monthlyIncome: 6000,
      transactions: FinanceStore.snapshot().transactions.map((item) => (
        item.id === "tx-shared" ? { ...item, amount: 60, updatedAt: "2026-08-24T13:01:00.000Z" } : item
      ))
    })`);
    await new Promise((resolve) => setTimeout(resolve, 120));
    gate.release.resolve();
    const [remoteResult, localResult] = await Promise.all([remoteApply, localPersist]);
    const memory = ctx.run(`({
      amount: FinanceStore.snapshot().transactions.find((item) => item.id === "tx-shared").amount,
      income: FinanceStore.snapshot().monthlyIncome
    })`);
    const physical = {
      amount: adapter.data.transactions.find((item) => item.id === "tx-shared").amount,
      income: adapter.data.settings.monthlyIncome,
    };

    check("as duas operações terminam sem perda", remoteResult.changed === true && localResult === true,
      JSON.stringify({ remoteResult, localResult }));
    check("a edição feita depois preserva registro e ajuste em memória e no disco", memory.amount === 60
      && memory.income === 6000 && physical.amount === 60 && physical.income === 6000,
    JSON.stringify({ memory, physical }));
  }

  console.log("\n12. Semeadura não declara uma edição concorrente como já persistida");
  {
    const ctx = context();
    const adapter = new ControlledAdapter("adapter-a", rawData("tx-old"));
    ctx.adapter = adapter;
    await ctx.run(`FinanceStore.init(adapter, { scope: "u_a" })`);
    ctx.run("FinanceStore.setOutboxEnabled(true)");
    const gate = adapter.blockNextWrite();
    const seeding = ctx.run(`FinanceStore.seedOutbox("u_a")`);
    await gate.entered.promise;
    const localPersist = ctx.run(`FinanceStore.persist({
      ...FinanceStore.snapshot(),
      transactions: [...FinanceStore.snapshot().transactions, {
        id: "tx-concurrent", type: "expense", amount: 70,
        date: "2026-08-24", categoryId: "lazer", updatedAt: "2026-08-24T14:00:00.000Z"
      }]
    })`);
    gate.release.resolve();
    const [seedResult, localResult] = await Promise.all([seeding, localPersist]);
    const memoryIds = ctx.run("FinanceStore.snapshot().transactions.map((item) => item.id).sort() ");
    const physicalIds = adapter.data.transactions.map((item) => item.id).sort();

    check("semeadura e edição informam sucesso", seedResult.queued > 0 && localResult === true,
      JSON.stringify({ seedResult, localResult }));
    check("a edição que chegou durante a semeadura foi realmente gravada", Array.from(memoryIds).join(",") === "tx-concurrent,tx-old"
      && physicalIds.join(",") === "tx-concurrent,tx-old", JSON.stringify({ memoryIds, physicalIds }));
  }

  console.log("\n13. Vínculo do visitante preserva edição feita durante a mesclagem");
  {
    const ctx = context();
    await ctx.run(`(async () => {
      const source = new LocalStorageAdapter("guest");
      await source.init();
      const data = defaultData();
      data.transactions = [{
        id: "tx-guest", type: "expense", amount: 80,
        date: "2026-08-23", categoryId: "lazer", updatedAt: "2026-08-23T14:00:00.000Z"
      }];
      await source.replaceAll(data);
    })()`);
    const adapter = new ControlledAdapter("adapter-account", rawData("tx-account"));
    ctx.adapter = adapter;
    await ctx.run(`FinanceStore.init(adapter, { scope: "u_account" })`);
    ctx.run("FinanceStore.setOutboxEnabled(true)");
    const gate = adapter.blockNextWrite();
    const adopting = ctx.run(`FinanceStore.adoptScope("guest", { userId: "account-id" })`);
    await gate.entered.promise;
    const localPersist = ctx.run(`FinanceStore.persist({
      ...FinanceStore.snapshot(),
      transactions: [...FinanceStore.snapshot().transactions, {
        id: "tx-concurrent", type: "expense", amount: 90,
        date: "2026-08-24", categoryId: "lazer", updatedAt: "2026-08-24T14:01:00.000Z"
      }]
    })`);
    gate.release.resolve();
    const [adoptResult, localResult] = await Promise.all([adopting, localPersist]);
    const memoryIds = ctx.run("FinanceStore.snapshot().transactions.map((item) => item.id).sort() ");
    const physicalIds = adapter.data.transactions.map((item) => item.id).sort();

    check("vínculo e edição informam sucesso", adoptResult.ok === true && adoptResult.changed === true && localResult === true,
      JSON.stringify({ adoptResult, localResult }));
    check("conta, visitante e edição concorrente ficam juntos", Array.from(memoryIds).join(",") === "tx-account,tx-concurrent,tx-guest"
      && physicalIds.join(",") === "tx-account,tx-concurrent,tx-guest", JSON.stringify({ memoryIds, physicalIds }));
  }

  console.log("\n14. Ação da tela antiga é recusada enquanto o novo escopo abre");
  {
    const ctx = context();
    const adapterA = new ControlledAdapter("adapter-a", rawData("tx-a"));
    const adapterB = new ControlledAdapter("adapter-b", emptyRaw());
    ctx.adapterA = adapterA;
    ctx.adapterB = adapterB;
    await ctx.run(`FinanceStore.init(adapterA, { scope: "u_a" })`);
    ctx.staleData = ctx.run("FinanceStore.snapshot()");
    const gate = adapterB.blockNextInit();
    const switching = ctx.run(`FinanceStore.switchScope("u_b", adapterB)`);
    await gate.entered.promise;
    const stalePersist = await ctx.run(`FinanceStore.persist({
      ...staleData,
      transactions: [...staleData.transactions, {
        id: "tx-during", type: "expense", amount: 100,
        date: "2026-08-24", categoryId: "lazer", updatedAt: "2026-08-24T15:00:00.000Z"
      }]
    })`);
    gate.release.resolve();
    await switching;
    const result = ctx.run(`({
      scope: FinanceStore.scope(), ready: FinanceStore.isReady(),
      ids: FinanceStore.snapshot().transactions.map((item) => item.id)
    })`);

    check("a gravação da tela antiga informa recusa", stalePersist === false, String(stalePersist));
    check("a conta B termina vazia e pronta", result.scope === "u_b" && result.ready === true
      && result.ids.length === 0 && adapterB.data.transactions.length === 0,
    JSON.stringify({ result, physical: adapterB.data.transactions }));
  }

  console.log("\n15. Exclusão feita durante descida recebe revisão posterior à edição remota");
  {
    const ctx = context();
    const adapter = new ControlledAdapter("adapter-a", rawData("tx-same"));
    ctx.adapter = adapter;
    await ctx.run(`FinanceStore.init(adapter, { scope: "u_a" })`);
    ctx.run("FinanceStore.setOutboxEnabled(true)");
    const futureMillis = String(Date.now() + 10000).padStart(15, "0");
    ctx.remoteOp = {
      entity: "transactions", entityId: "tx-same", op: "put",
      rev: `${futureMillis}.000001.device-remoto-a`,
      payload: {
        id: "tx-same", type: "expense", amount: 110,
        date: "2026-08-24", categoryId: "lazer", updatedAt: "2026-08-24T16:00:00.000Z",
      },
    };
    const gate = adapter.blockNextWrite();
    const remoteApply = ctx.run(`FinanceStore.applyRemoteOps([remoteOp], "u_a")`);
    await gate.entered.promise;
    const localDelete = ctx.run(`FinanceStore.persist({
      ...FinanceStore.snapshot(),
      transactions: FinanceStore.snapshot().transactions.filter((item) => item.id !== "tx-same"),
      graveyard: withTombstones(FinanceStore.snapshot().graveyard, "transactions", "tx-same")
    })`);
    await new Promise((resolve) => setTimeout(resolve, 120));
    gate.release.resolve();
    const [firstRemote, deleteResult] = await Promise.all([remoteApply, localDelete]);
    const secondRemote = await ctx.run(`FinanceStore.applyRemoteOps([remoteOp], "u_a")`);
    const existsAfterReplay = ctx.run(`FinanceStore.snapshot().transactions.some((item) => item.id === "tx-same")`);
    const graveRev = ctx.run(`FinanceStore.snapshot().graveyard.transactions["tx-same"].rev`);

    check("a primeira descida e a exclusão terminam", firstRemote.changed === true && deleteResult === true,
      JSON.stringify({ firstRemote, deleteResult }));
    check("a operação remota antiga não ressuscita o registro", secondRemote.changed === false && existsAfterReplay === false,
      JSON.stringify({ secondRemote, existsAfterReplay }));
    check("a lápide local ficou acima da revisão observada", String(graveRev) > String(ctx.remoteOp.rev),
      JSON.stringify({ graveRev, remoteRev: ctx.remoteOp.rev }));
  }

  console.log("\n16. Reload entre abas faz a próxima edição superar a revisão que leu");
  {
    const ctx = context();
    const adapter = new ControlledAdapter("adapter-a", rawData("tx-shared"));
    ctx.adapter = adapter;
    await ctx.run(`FinanceStore.init(adapter, { scope: "u_a" })`);
    const futureMillis = String(Date.now() + 10000).padStart(15, "0");
    const remoteRev = `${futureMillis}.000001.device-outra-aba`;
    adapter.data.transactions = [{
      id: "tx-shared", type: "expense", amount: 120,
      date: "2026-08-24", categoryId: "lazer", updatedAt: "2026-08-24T17:00:00.000Z",
      syncRev: remoteRev,
    }];
    await ctx.run("FinanceStore.reload()");
    ctx.run("FinanceStore.setOutboxEnabled(true)");
    const persistResult = await ctx.run(`FinanceStore.persist({
      ...FinanceStore.snapshot(),
      transactions: FinanceStore.snapshot().transactions.map((item) => ({
        ...item, amount: 130, updatedAt: "2026-08-24T17:01:00.000Z"
      }))
    })`);
    const localRev = adapter.data.transactions[0].syncRev;

    check("a edição depois do reload foi gravada", persistResult === true && adapter.data.transactions[0].amount === 130,
      JSON.stringify(adapter.data.transactions[0]));
    check("a revisão local ficou acima da revisão lida", String(localRev) > remoteRev,
      JSON.stringify({ localRev, remoteRev }));
  }

  console.log("\n17. Duas abas no mesmo milissegundo recebem revisões distintas");
  {
    const sharedStorage = fakeLocalStorage();
    sharedStorage.setItem("cofre_device_id", "device-shared-1234");
    const first = context(sharedStorage);
    const second = context(sharedStorage);
    const adapterA = new ControlledAdapter("adapter-a", rawData("tx-shared"));
    const adapterB = new ControlledAdapter("adapter-b", rawData("tx-shared"));
    first.adapter = adapterA;
    second.adapter = adapterB;
    first.run("Date.now = () => 1800000000000");
    second.run("Date.now = () => 1800000000000");
    await Promise.all([
      first.run(`FinanceStore.init(adapter, { scope: "u_shared" })`),
      second.run(`FinanceStore.init(adapter, { scope: "u_shared" })`),
    ]);
    first.run("FinanceStore.setOutboxEnabled(true)");
    second.run("FinanceStore.setOutboxEnabled(true)");

    const [savedA, savedB] = await Promise.all([
      first.run(`FinanceStore.persist({
        ...FinanceStore.snapshot(),
        transactions: FinanceStore.snapshot().transactions.map((item) => ({ ...item, amount: 140 }))
      })`),
      second.run(`FinanceStore.persist({
        ...FinanceStore.snapshot(),
        transactions: FinanceStore.snapshot().transactions.map((item) => ({ ...item, amount: 150 }))
      })`),
    ]);
    const revA = adapterA.data.transactions[0].syncRev;
    const revB = adapterB.data.transactions[0].syncRev;
    const partsA = String(revA).split(".");
    const partsB = String(revB).split(".");

    check("as duas abas gravam no mesmo instante lógico", savedA === true && savedB === true
      && partsA[0] === partsB[0] && partsA[1] === partsB[1], JSON.stringify({ revA, revB }));
    check("o desempate por aba impede revisão duplicada", revA !== revB
      && partsA.slice(2).join(".") !== partsB.slice(2).join("."), JSON.stringify({ revA, revB }));
    check("revisão antiga e revisão por aba continuam pertencendo ao aparelho",
      first.run(`isLocalSyncWriter("device-shared-1234") && isLocalSyncWriter(SyncClock.device())`) === true);
  }

  console.log("\n18. Restore em aba atrasada substitui put pendente da outra aba por lápide");
  {
    const sharedStorage = fakeLocalStorage();
    sharedStorage.setItem("cofre_device_id", "device-shared-restore");
    const first = context(sharedStorage);
    const second = context(sharedStorage);
    const sharedAdapter = new ControlledAdapter("adapter-shared", rawData("tx-old"));
    first.adapter = sharedAdapter;
    second.adapter = sharedAdapter;
    await first.run(`FinanceStore.init(adapter, { scope: "u_shared" })`);
    await second.run(`FinanceStore.init(adapter, { scope: "u_shared" })`);
    first.run("FinanceStore.setOutboxEnabled(true)");
    second.run("FinanceStore.setOutboxEnabled(true)");

    const created = await first.run(`FinanceStore.persist({
      ...FinanceStore.snapshot(),
      transactions: [...FinanceStore.snapshot().transactions, {
        id: "tx-new", type: "expense", amount: 160,
        date: "2026-08-24", categoryId: "lazer", updatedAt: "2026-08-24T18:00:00.000Z"
      }]
    })`);
    const pendingPut = sharedAdapter.outbox.find((entry) => entry.entity === "transactions"
      && entry.entityId === "tx-new" && entry.op === "put");

    // A segunda aba ainda conserva o snapshot anterior, sem tx-new.
    const restored = await second.run(`FinanceStore.replaceAll({
      ...FinanceStore.snapshot(),
      transactions: FinanceStore.snapshot().transactions.filter((item) => item.id !== "tx-new")
    })`);
    const queuedForNew = sharedAdapter.outbox.filter((entry) => entry.entity === "transactions"
      && entry.entityId === "tx-new");
    const deleteForNew = queuedForNew.find((entry) => entry.op === "delete");

    check("a criação da primeira aba e o restore da segunda terminam", created === true && restored === true,
      JSON.stringify({ created, restored }));
    check("a base física restaurada não conserva o registro desconhecido",
      sharedAdapter.data.transactions.every((item) => item.id !== "tx-new"),
      JSON.stringify(sharedAdapter.data.transactions.map((item) => item.id)));
    check("o put compartilhado foi substituído por uma exclusão mais nova", !!pendingPut && !!deleteForNew
      && queuedForNew.length === 1 && String(deleteForNew.rev) > String(pendingPut.rev),
    JSON.stringify({ pendingPut, queuedForNew }));
  }

  console.log("\n19. Apply remoto iniciado durante restore relê a lápide antes de gravar");
  {
    const sharedStorage = fakeLocalStorage();
    const sharedLocks = fakeLockManager();
    sharedStorage.setItem("cofre_device_id", "device-shared-apply-restore");
    const first = context(sharedStorage, sharedLocks);
    const second = context(sharedStorage, sharedLocks);
    const sharedAdapter = new ControlledAdapter("adapter-shared-lock", rawData("tx-race"));
    first.adapter = sharedAdapter;
    second.adapter = sharedAdapter;
    await first.run(`FinanceStore.init(adapter, { scope: "u_shared" })`);
    await second.run(`FinanceStore.init(adapter, { scope: "u_shared" })`);
    first.run("FinanceStore.setOutboxEnabled(true)");
    second.run("FinanceStore.setOutboxEnabled(true)");

    const remoteMillis = String(Date.now() - 60000).padStart(15, "0");
    first.remoteOp = {
      entity: "transactions", entityId: "tx-race", op: "put",
      rev: `${remoteMillis}.000001.device-remoto-antigo`,
      payload: {
        id: "tx-race", type: "expense", amount: 170,
        date: "2026-08-24", categoryId: "lazer", updatedAt: "2026-08-24T19:00:00.000Z",
      },
    };

    // O restore segura o bloqueio depois de entrar na leitura física. O apply
    // já calculou a intenção na aba antiga, mas só pode validar e escrever
    // depois que a substituição e sua lápide forem confirmadas.
    const gate = sharedAdapter.blockNextRead();
    const restoring = second.run(`FinanceStore.replaceAll({
      ...FinanceStore.snapshot(),
      transactions: FinanceStore.snapshot().transactions.filter((item) => item.id !== "tx-race")
    })`);
    await gate.entered.promise;
    const applying = first.run(`FinanceStore.applyRemoteOps([remoteOp], "u_shared")`);
    gate.release.resolve();

    const completed = await Promise.race([
      Promise.all([restoring, applying]).then(([restoreResult, applyResult]) => ({ restoreResult, applyResult })),
      new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 2000)),
    ]);
    const deleteForRace = sharedAdapter.outbox.find((entry) => entry.entity === "transactions"
      && entry.entityId === "tx-race" && entry.op === "delete");

    check("restore e apply terminam sem bloqueio aninhado", !completed.timeout
      && completed.restoreResult === true, JSON.stringify(completed));
    check("o apply atrasado relê o restore e não ressuscita o registro", !completed.timeout
      && completed.applyResult.changed === false
      && sharedAdapter.data.transactions.every((item) => item.id !== "tx-race"),
    JSON.stringify({ completed, physical: sharedAdapter.data.transactions }));
    check("a lápide preservada vence a operação remota que estava esperando", !!deleteForRace
      && String(deleteForRace.rev) > String(first.remoteOp.rev),
    JSON.stringify({ deleteForRace, remote: first.remoteOp }));
    check("o gerenciador nunca executou duas mutações do escopo juntas", sharedLocks.violations === 0,
      String(sharedLocks.violations));
  }

  console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"}: ${ok} ok, ${fail} falha(s)\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((error) => { console.error(error); process.exit(1); });
