// cloud-sync.js; motor de sincronização incremental (protocolo 2)
// ------------------------------------------------------------------------------
// O QUE MUDOU, E POR QUE
//
// A versão anterior baixava a base inteira, fundia tudo em memória e devolvia a
// base inteira, a cada ciclo. Isso trazia cinco defeitos que só apareciam com o
// aplicativo em uso real:
//
//   1. Exclusão remota não valia. O envio era "a base como este aparelho a vê";
//      um aparelho com cópia antiga reenviava o registro apagado e ele voltava.
//   2. Conflito virava disputa pelo documento inteiro. Dois aparelhos mexendo em
//      campos diferentes colidiam, e o 409 vinha em rajada.
//   3. Relógio errado decidia o vencedor. Quem estivesse adiantado ganhava tudo.
//   4. Custo por ciclo proporcional ao TAMANHO DA BASE, não ao que mudou, com
//      um teto rígido de 6 MiB no servidor.
//   5. Nada sobrevivia ao fechamento da aba: o que não tinha subido, se perdia.
//
// AGORA
//
// Cada alteração local vira uma OPERAÇÃO com marca de relógio lógico, gravada
// numa fila persistente (IndexedDB). O ciclo envia a fila, recebe o que os
// outros aparelhos fizeram desde o último cursor, e aplica pela marca. Não há
// mais fusão de documentos, nem 409, nem teto.
//
// UMA ABA POR VEZ
//
// Duas abas sincronizando ao mesmo tempo enviariam a mesma fila duas vezes. O
// ciclo roda dentro de um bloqueio nomeado (Web Locks); a aba que não conseguir
// o bloqueio simplesmente espera a próxima volta, porque a outra já está
// fazendo o trabalho pelas duas.
"use strict";

const CLOUD_SYNC_DEBOUNCE_MS = 4000;      // rajada de digitação vira um envio só
const CLOUD_SYNC_RETRY_MS = 30000;        // nova tentativa após falha de rede
const CLOUD_SYNC_BATCH = 400;             // operações por requisição (servidor aceita 500)
const CLOUD_SYNC_PAGE = 500;              // operações por página na descida
const CLOUD_SYNC_MAX_PAGES = 200;         // trava de segurança contra cursor que não anda
const CLOUD_CURSOR_KEY = "cofre_sync_cursor";

const CloudSync = (() => {
  let adapter = null;
  let pendingTimer = null;
  let retryTimer = null;
  let running = false;
  let scope = "guest";
  let hooks = { applyRemote: null, readLocal: null };
  const listeners = [];

  let state = {
    enabled: false,
    phase: "disabled",      // disabled | idle | syncing | synced | offline | error
    lastSyncAt: null,
    error: null,
    errorCode: null,
    pending: false,
    queued: 0,              // operações ainda não enviadas
  };

  function setState(patch) {
    state = { ...state, ...patch };
    listeners.forEach((fn) => { try { fn(state); } catch (e) { /* ouvinte quebrado não derruba o ciclo */ } });
  }

  function offline() {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  }

  // ---------------------------------------------------------------------------
  // Cursor: até onde este aparelho já leu o log do servidor
  // ---------------------------------------------------------------------------
  // Por escopo, porque duas contas no mesmo navegador têm logs independentes.
  function cursorKey() { return scope === "guest" ? CLOUD_CURSOR_KEY : `${CLOUD_CURSOR_KEY}__${scope}`; }

  function readCursor() {
    try {
      const raw = localStorage.getItem(cursorKey());
      return /^\d{1,18}$/.test(String(raw || "")) ? String(raw) : "0";
    } catch (e) { return "0"; }
  }

  function writeCursor(value) {
    if (!/^\d{1,18}$/.test(String(value || ""))) return;
    try { localStorage.setItem(cursorKey(), String(value)); } catch (e) { /* cota cheia */ }
  }

  // ---------------------------------------------------------------------------
  // Fila de saída
  // ---------------------------------------------------------------------------
  // Compacta antes de enviar: cinco edições seguidas no mesmo lançamento viram
  // uma operação só, a de marca maior. Sem isso, uma tarde de ajustes viraria
  // centenas de requisições para um resultado idêntico.
  function compactOutbox(entries) {
    const byKey = new Map();
    entries.forEach((entry) => {
      if (!entry || !entry.entity || !entry.rev) return;
      const key = `${entry.entity} ${entry.entityId}`;
      const current = byKey.get(key);
      if (!current || String(entry.rev) > String(current.rev)) byKey.set(key, entry);
    });
    // Ordem de envio pela marca: o servidor guarda a vencedora de cada registro,
    // e enviar fora de ordem só faria trabalho perdido.
    return Array.from(byKey.values()).sort((a, b) => (String(a.rev) < String(b.rev) ? -1 : 1));
  }

  function toWireOp(entry) {
    const op = { entity: entry.entity, entityId: entry.entityId, op: entry.op, rev: entry.rev };
    if (entry.op === "put") op.payload = entry.payload;
    return op;
  }

  // ---------------------------------------------------------------------------
  // Ciclo
  // ---------------------------------------------------------------------------

  async function applyIncoming(ops) {
    if (!ops.length) return false;
    const result = FinanceStore.applyRemoteOps(ops);
    if (!result.changed) return false;
    // `applyRemote` grava, redesenha e reavalia conquistas e avisos, como se o
    // próprio usuário tivesse feito a alteração; porque, em outro aparelho, foi.
    hooks.applyRemote(result.data);
    return true;
  }

  async function cycle() {
    let cursor = readCursor();

    // ---- Subida: esvazia a fila em lotes ----
    let guard = 0;
    for (;;) {
      const queued = await FinanceStore.outboxRead(0);
      setState({ queued: queued.length });
      if (!queued.length) break;
      if (++guard > CLOUD_SYNC_MAX_PAGES) break;

      const compact = compactOutbox(queued);
      const batch = compact.slice(0, CLOUD_SYNC_BATCH);
      const result = await adapter.push(batch.map(toWireOp), cursor);

      // Só remove da fila DEPOIS da confirmação do servidor. Se a rede cair no
      // meio, a operação continua lá e sobe na próxima volta; o `mutationId`
      // garante que reenviar não duplica nada.
      //
      // Saem também as versões ANTERIORES do mesmo registro, que a compactação
      // substituiu: a marca já enviada é maior que a delas.
      const enviado = new Map(batch.map((entry) => [`${entry.entity} ${entry.entityId}`, String(entry.rev)]));
      const seqs = queued
        .filter((entry) => {
          const rev = enviado.get(`${entry.entity} ${entry.entityId}`);
          return rev !== undefined && String(entry.rev) <= rev;
        })
        .map((entry) => entry.seq);
      await FinanceStore.outboxDrop(seqs);

      await applyIncoming(result.ops);
      cursor = result.cursor;
      writeCursor(cursor);
      if (batch.length >= compact.length && !result.hasMore) break;
    }

    // ---- Descida: páginas até alcançar o servidor ----
    for (let page = 0; page < CLOUD_SYNC_MAX_PAGES; page++) {
      const result = await adapter.pull(cursor, CLOUD_SYNC_PAGE);
      await applyIncoming(result.ops);
      const advanced = String(result.cursor) !== String(cursor);
      cursor = result.cursor;
      writeCursor(cursor);
      if (!result.hasMore || !advanced) break;
    }
  }

  // Um ciclo por vez, e uma ABA por vez. `ifAvailable` faz a aba desistir na
  // hora em vez de enfileirar: a outra aba já está enviando a mesma fila.
  async function withLock(fn) {
    const locks = typeof navigator !== "undefined" && navigator.locks;
    if (!locks || typeof locks.request !== "function") return fn();
    let ran = false;
    await locks.request(`cofre-sync-${scope}`, { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      ran = true;
      await fn();
    });
    return ran;
  }

  async function runSync() {
    if (!adapter || running || !hooks.readLocal || !hooks.applyRemote) return false;
    if (offline()) { setState({ phase: "offline", pending: true }); return false; }

    running = true;
    setState({ phase: "syncing", error: null, errorCode: null });
    try {
      const ran = await withLock(cycle);
      if (ran === false) { setState({ phase: "idle", pending: true }); return false; }
      const queued = await FinanceStore.outboxRead(0);
      setState({
        phase: "synced", lastSyncAt: new Date().toISOString(),
        pending: queued.length > 0, queued: queued.length, error: null, errorCode: null,
      });
      return true;
    } catch (error) {
      return handleFailure(error);
    } finally {
      running = false;
    }
  }

  function handleFailure(error) {
    const code = (error && error.code) || "server_error";
    if (code === "session_expired" || code === "device_revoked") {
      // Sessão morta ou aparelho revogado: parar é o certo. Insistir só produz
      // uma fila de 401 e um aviso repetido na tela. A fila local fica intacta;
      // ao entrar de novo, ela sobe.
      disable();
      setState({ phase: "error", error: "A sessão terminou. Entre novamente para voltar a sincronizar.", errorCode: code });
      return false;
    }
    if (code === "protocol_upgrade_required") {
      disable();
      setState({ phase: "error", error: "Atualize o aplicativo para voltar a sincronizar.", errorCode: code });
      return false;
    }
    // Problema de INSTALAÇÃO não se resolve sozinho em 30 segundos. Tentar de
    // novo em laço só esconde a causa e gasta bateria; a mensagem do servidor
    // já diz o que falta fazer, e o botão da tela refaz a tentativa na hora em
    // que a pessoa quiser.
    if (code === "schema_missing" || code === "not_configured" || code === "origin_denied") {
      disable();
      setState({ phase: "error", error: (error && error.message) || "A sincronização não está configurada neste servidor.", errorCode: code });
      return false;
    }
    if (code === "network_error" || code === "timeout" || code === "upstream_unavailable") {
      setState({ phase: "offline", pending: true, error: null, errorCode: code });
      scheduleRetry();
      return false;
    }
    if (typeof reportSafeError === "function") reportSafeError("sync", error, "sync_cycle");
    setState({
      phase: "error",
      pending: true,
      error: "Não foi possível sincronizar agora. O aparelho continua com todos os dados.",
      errorCode: code,
    });
    scheduleRetry();
    return false;
  }

  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { if (state.enabled) runSync(); }, CLOUD_SYNC_RETRY_MS);
  }

  // ---------------------------------------------------------------------------
  // Gatilhos
  // ---------------------------------------------------------------------------

  function schedule() {
    if (!state.enabled) return;
    setState({ pending: true });
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => runSync(), CLOUD_SYNC_DEBOUNCE_MS);
  }

  function syncNow() {
    if (!state.enabled) return Promise.resolve(false);
    clearTimeout(pendingTimer);
    return runSync();
  }

  // O botão "tentar de novo" da tela de conta. Quando o motor está ligado, é um
  // ciclo. Quando ele PAROU por erro (sessão morta, migração faltando), é uma
  // nova tentativa de ligar; era exatamente aí que a tela não oferecia botão
  // nenhum e a única saída conhecida era recarregar a página.
  function retry() {
    if (state.enabled) return syncNow();
    return enable();
  }

  // ---------------------------------------------------------------------------
  // Apagar tudo na conta
  // ---------------------------------------------------------------------------
  // Precisa virar lápide no servidor, e não sumiço: sumiço faz o próximo
  // aparelho a sincronizar devolver a base inteira de volta.
  async function resetRemote() {
    if (!state.enabled || !adapter) return false;
    const rev = FinanceStore.mintRev();
    const result = await adapter.resetRemote(rev);
    writeCursor(String(result.revision || "0"));
    await FinanceStore.outboxClear();
    return true;
  }



  async function createCheckpoint(label) {
    if (!state.enabled || !adapter) return null;
    try { return await adapter.createCheckpoint(label); }
    catch (error) { handleFailure(error); return null; }
  }

  async function listCheckpoints() {
    if (!state.enabled || !adapter) return [];
    try { return await adapter.listCheckpoints(); }
    catch (error) { return []; }
  }

  // ---------------------------------------------------------------------------
  // Restaurar uma versão
  // ---------------------------------------------------------------------------
  // Restaurar NÃO é "reescrever o passado": é declarar, agora, que o estado
  // atual passa a ser aquele. Por isso cada registro da versão recebe uma marca
  // NOVA, e o que existe hoje mas não existia lá vira lápide nova. Assim a
  // restauração propaga para os outros aparelhos como qualquer outra alteração,
  // em vez de ser desfeita por eles na volta seguinte.
  async function restoreCheckpoint(checkpointId) {
    if (!state.enabled || !adapter) return { ok: false, reason: "disabled" };

    // Rede de segurança: quem restaura por engano precisa de caminho de volta.
    await createCheckpoint("Antes de restaurar");

    const ops = [];
    let after = "";
    for (let page = 0; page < CLOUD_SYNC_MAX_PAGES; page++) {
      const result = await adapter.readCheckpoint(checkpointId, after);
      result.ops.forEach((row) => {
        if (row.op !== "put" || !row.payload) return;
        ops.push({ entity: row.entity, entityId: row.entityId, op: "put", rev: FinanceStore.mintRev(), payload: row.payload });
      });
      if (!result.hasMore || result.after === after) break;
      after = result.after;
    }

    const naVersao = new Set(ops.map((op) => `${op.entity} ${op.entityId}`));
    const atual = FinanceStore.snapshot();
    ["transactions", "categories", "goals", "assets"].forEach((field) => {
      (atual[field] || []).forEach((rec) => {
        if (!naVersao.has(`${field} ${rec.id}`)) {
          ops.push({ entity: field, entityId: rec.id, op: "delete", rev: FinanceStore.mintRev() });
        }
      });
    });

    const aplicado = FinanceStore.applyRemoteOps(ops);
    if (aplicado.changed) hooks.applyRemote(aplicado.data);
    // As operações da restauração precisam SUBIR: `applyRemoteOps` não
    // enfileira nada, porque normalmente o que ele aplica veio de fora.
    await FinanceStore.outboxAppend(ops.map((op) => ({ ...op, queuedAt: Date.now() })));
    await syncNow();
    return { ok: true, applied: ops.length };
  }

  // ---------------------------------------------------------------------------
  // Ligar e desligar
  // ---------------------------------------------------------------------------

  async function enable() {
    if (state.enabled) return true;
    if (!hooks.readLocal || !hooks.applyRemote) return false;
    scope = FinanceStore.scope();
    try {
      adapter = new CloudAdapter({
        enabled: true,
        baseUrl: "/api/sync",
        authMode: "cookie",              // a sessão vive em cookie HttpOnly
        deviceId: accountDeviceId(),
        allowDestructive: true,          // usado só por resetRemote(), que grava lápides
      });
      await adapter.init();
    } catch (error) {
      adapter = null;
      const code = (error && error.code) || "unavailable";
      // Site publicado sem o backend configurado não é erro do usuário; é só
      // um recurso que não existe naquela instalação.
      //
      // Nos DEMAIS casos a mensagem do servidor é guardada. Ela era descartada
      // (`error: null`), e por isso a tela dizia "Sincronização com falha" e
      // parava por aí: quem estava vendo não tinha como saber se era a sessão,
      // a rede ou uma migração que faltou rodar no banco.
      setState({
        enabled: false,
        phase: code === "not_configured" ? "disabled" : "error",
        errorCode: code,
        error: code === "not_configured" ? null : ((error && error.message) || "Não foi possível ligar a sincronização."),
      });
      return false;
    }
    FinanceStore.setOutboxEnabled(true);
    setState({ enabled: true, phase: "idle", error: null, errorCode: null });
    await runSync();
    return true;
  }

  function disable() {
    clearTimeout(pendingTimer);
    clearTimeout(retryTimer);
    adapter = null;
    // A fila NÃO é apagada: ela é o que ainda não chegou ao servidor. Apagar
    // aqui perderia lançamentos feitos offline logo antes de sair.
    FinanceStore.setOutboxEnabled(false);
    setState({ enabled: false, phase: "disabled", pending: false, error: null, errorCode: null });
  }

  function configure(options) {
    const o = options || {};
    if (typeof o.readLocal === "function") hooks.readLocal = o.readLocal;
    if (typeof o.applyRemote === "function") hooks.applyRemote = o.applyRemote;
    if (typeof o.onStatus === "function") listeners.push(o.onStatus);
  }

  // Voltar a ter rede e voltar para o aplicativo são os dois momentos em que o
  // usuário mais espera ver os dados em dia.
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => { if (state.enabled) syncNow(); });
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (state.enabled && document.visibilityState === "visible" && state.pending) syncNow();
      });
    }
  }

  return {
    configure,
    enable,
    disable,
    schedule,
    syncNow,
    retry,
    resetRemote,
    createCheckpoint,
    listCheckpoints,
    restoreCheckpoint,
    status: () => state,
    isEnabled: () => state.enabled,
  };
})();
