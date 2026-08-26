// cloud-sync.js; motor de sincronização incremental (protocolo 3)
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
// A ORDEM DO CICLO É PARTE DO CONTRATO
//
// Um aparelho que entrava numa conta subia a própria base ANTES de olhar o que
// a conta já tinha. Era isso que fazia o vínculo decidir errado: a conta parecia
// preenchida porque este mesmo aparelho acabara de preenchê-la. A ordem agora é
// fixa: terminar as gravações locais, descer, semear, subir, aplicar a resposta,
// confirmar a fila, descer de novo e só então declarar "sincronizado".
//
// "SINCRONIZADO" EXIGE PROVA
//
// A tela dizia "Tudo sincronizado" sempre que o ciclo não lançava exceção, mesmo
// com a fila cheia e mesmo quando a leitura da fila tinha falhado. Agora esse
// estado só aparece depois de uma leitura da fila que FUNCIONOU e voltou vazia.
//
// UMA ABA POR VEZ
//
// Duas abas sincronizando ao mesmo tempo enviariam a mesma fila duas vezes. O
// ciclo roda dentro de um bloqueio nomeado (Web Locks); a aba que não conseguir
// o bloqueio simplesmente espera a próxima volta, porque a outra já está
// fazendo o trabalho pelas duas.
"use strict";

const CLOUD_SYNC_DEBOUNCE_MS = 750;       // rajada curta, com envio iniciado em até 1 s
const CLOUD_SYNC_RETRY_MS = 30000;        // nova tentativa após falha de rede
const CLOUD_SYNC_BATCH = 400;             // operações por requisição (servidor aceita 500)
const CLOUD_SYNC_PAGE = 500;              // operações por página na descida
const CLOUD_SYNC_MAX_PAGES = 200;         // trava de segurança contra cursor que não anda
const CLOUD_SYNC_MAX_BATCHES = 200;       // trava equivalente na subida
const CLOUD_SYNC_POLL_MS = 15000;         // volta periódica enquanto o app está à vista

// Chaves antigas, no localStorage. Continuam sendo LIDAS uma única vez, para
// importar o progresso de quem já usava o app; a partir daí o cursor e o recibo
// moram no banco local, na mesma transação que grava os dados.
// As chaves do `localMeta` (META_CURSOR, META_SEED_RECEIPT, META_SEED_JOURNAL,
// META_LINK_JOURNAL e META_RECONCILE_RECEIPT) são declaradas em `js/storage.js`,
// que é quem as grava.
const CLOUD_CURSOR_KEY = "cofre_sync_cursor";

// Versão do REPARO, não do formato do recibo. Subir este número faz a
// reconciliação rodar sozinha mais uma vez em cada aparelho, e é o único jeito
// de alcançar quem já tinha reconciliado antes de o conserto existir.
//   1. releitura do zero, para o aparelho que ficou atrás do cursor.
//   2. releitura aceitando empate de marca, para reparar o registro que ficou
//      com a marca do servidor e o conteúdo mutilado pela normalização.
const RECONCILE_VERSION = 2;

const CloudSync = (() => {
  let adapter = null;
  let pendingTimer = null;
  let retryTimer = null;
  let pollTimer = null;
  let cicloMexeu = false;          // esta volta enviou ou aplicou alguma coisa
  let running = false;
  let activeRunPromise = null;
  let rerunPromise = null;
  let rerunGeneration = -1;
  let rerunRequest = null;
  let syncGeneration = 0;
  let enablePromise = null;
  let enableKey = "";
  let sessionRefreshAccountId = "";
  let resetPromise = null;
  let resetting = false;
  let scope = "guest";
  let hooks = {
    applyRemote: null,
    onAuthInvalid: null,
    onAccountScopeChanged: null,
    onSessionRefreshRequired: null,
    getExpectedAccountId: null,
  };
  const listeners = [];

  // Segura a subida e a semeadura até a decisão de vínculo. Sem isto, entrar
  // numa conta vazia num aparelho que já tinha dados subiria a base local antes
  // de alguém perguntar se ela pertence àquela conta.
  let bootstrapHeld = false;
  // Revisão da conta OBSERVADA antes de qualquer envio deste aparelho. É ela
  // que decide "conta vazia" no vínculo automático; usar a revisão de depois
  // faria o próprio aparelho responder à própria pergunta.
  let observedRevision = null;
  let cursorCache = null;
  let cursorScope = null;
  // Reconciliação completa: escopo cujo recibo já foi conferido nesta sessão, e
  // pedido manual vindo da tela de conta. Ver o bloco "RECONCILIAÇÃO COMPLETA".
  let reconcileScope = null;
  let reconcileRequested = false;

  let state = {
    enabled: false,
    phase: "disabled",      // disabled | idle | syncing | synced | offline | error
    lastSyncAt: null,
    error: null,
    errorCode: null,
    pending: false,
    queued: 0,              // operações ainda não enviadas
    remoteRevision: null,   // revisão observada na primeira descida
    bootstrapHeld: false,   // aguardando a decisão de vínculo
  };

  // `silencioso` existe por causa da volta periódica: `onStatus` redesenha o
  // aplicativo inteiro, e uma volta que não encontrou nada não pode reconstruir
  // a tela do usuário a cada consulta de 15 segundos. O estado é atualizado do
  // mesmo jeito; só o aviso é poupado.
  function setState(patch, silencioso) {
    state = { ...state, ...patch };
    if (silencioso) return;
    listeners.forEach((fn) => { try { fn(state); } catch (e) { /* ouvinte quebrado não derruba o ciclo */ } });
  }

  function offline() {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  }

  function syncError(message, code) {
    if (typeof CloudSyncError === "function") return new CloudSyncError(message, code);
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function cancelledError() {
    return syncError("O ciclo pertencia a outro escopo.", "sync_cancelled");
  }

  function expectedAccountId() {
    if (typeof hooks.getExpectedAccountId !== "function") return "";
    try { return String(hooks.getExpectedAccountId() || "").trim().toLowerCase(); }
    catch (_) { return ""; }
  }

  function contextIsCurrent(context, requireEnabled) {
    if (!context
      || context.generation !== syncGeneration
      || context.scope !== scope
      || context.scope !== FinanceStore.scope()
      || context.expectedAccountId !== expectedAccountId()) return false;
    // O contexto de um ciclo ou de uma ação manual sempre captura o adaptador.
    // O contexto de `performEnable` ainda está preparando o candidato e, por
    // isso, só pode ser invalidado pela geração, escopo ou identidade.
    if (Object.prototype.hasOwnProperty.call(context, "adapter") && context.adapter !== adapter) return false;
    if (requireEnabled && !state.enabled) return false;
    return true;
  }

  function assertCurrentCycle(context) {
    if (!contextIsCurrent(context, true)) throw cancelledError();
  }

  function nextGeneration() {
    syncGeneration += 1;
    // Promessas antigas continuam resolvendo para seus chamadores, mas deixam
    // de ser a promessa compartilhada da geração nova.
    rerunRequest = null;
    rerunPromise = null;
    rerunGeneration = -1;
    return syncGeneration;
  }

  function captureCurrentContext() {
    if (!state.enabled || !adapter) return null;
    const context = {
      generation: syncGeneration,
      scope,
      adapter,
      expectedAccountId: expectedAccountId(),
    };
    assertCurrentCycle(context);
    return context;
  }

  // ---------------------------------------------------------------------------
  // Cursor: até onde este aparelho já leu o log do servidor
  // ---------------------------------------------------------------------------
  // Ele mora no BANCO, e não mais no localStorage, por um motivo específico: o
  // cursor só pode avançar depois que a operação correspondente chegou ao disco.
  // Guardado fora do banco, ele avançava mesmo quando a gravação falhava, e o
  // aparelho passava a pular para sempre uma alteração que nunca aplicou.
  function legacyCursorKey() { return scope === "guest" ? CLOUD_CURSOR_KEY : `${CLOUD_CURSOR_KEY}__${scope}`; }

  function legacyCursor() {
    try {
      const raw = localStorage.getItem(legacyCursorKey());
      return /^\d{1,18}$/.test(String(raw || "")) ? String(raw) : "0";
    } catch (e) { return "0"; }
  }

  async function readCursor(context) {
    if (context) assertCurrentCycle(context);
    if (cursorScope === scope && cursorCache !== null) return cursorCache;
    const stored = await FinanceStore.localMetaGet(META_CURSOR, context && context.scope);
    if (context) assertCurrentCycle(context);
    let value = /^\d{1,18}$/.test(String(stored == null ? "" : stored)) ? String(stored) : "";
    if (!value) {
      // Importação única do cursor antigo. Quem já sincronizava não volta a
      // baixar o log inteiro só porque o lugar de guardar mudou.
      value = legacyCursor();
      await FinanceStore.localMetaPut(META_CURSOR, value, context && context.scope);
      if (context) assertCurrentCycle(context);
    }
    cursorScope = scope;
    cursorCache = value;
    return value;
  }

  async function writeCursor(value, context) {
    if (!/^\d{1,18}$/.test(String(value || ""))) return;
    if (context) assertCurrentCycle(context);
    await FinanceStore.localMetaPut(META_CURSOR, String(value), context && context.scope);
    if (context) assertCurrentCycle(context);
    cursorScope = scope;
    cursorCache = String(value);
  }

  // ---------------------------------------------------------------------------
  // RECONCILIAÇÃO COMPLETA
  // ---------------------------------------------------------------------------
  // O DEFEITO QUE ISTO CORRIGE
  //
  // A MESMA conta, aberta em dois navegadores, mostrando saldos diferentes; e
  // nenhum dos dois acusando erro. Os dois dizem "Tudo sincronizado", porque
  // para cada um deles isso é verdade: as duas afirmações do protocolo estão
  // cumpridas do lado de quem responde.
  //
  //   - O CURSOR é a promessa "já apliquei tudo até aqui". O servidor nunca
  //     reenvia o que ficou atrás dele.
  //   - O RECIBO DE SEMEADURA é a promessa "já ofereci minha base inteira". A
  //     fila nunca reapresenta o que já foi confirmado.
  //
  // Basta uma operação escapar uma vez para as duas promessas passarem a
  // mentir, e nada no funcionamento normal desfaz isso: a descida não volta
  // atrás e a subida não recomeça. Escapar acontece por caminhos que o app não
  // consegue observar depois: uma comparação de marcas que recusou a operação
  // (registro local com marca maior, gravado por um relógio adiantado), uma
  // gravação que o navegador desfez por cota, uma aba fechada entre a resposta
  // do servidor e a gravação. O aparelho fica atrasado para sempre, e a única
  // saída conhecida era apagar os dados do site.
  //
  // A reconciliação retira as duas promessas ao mesmo tempo: zera o cursor e
  // apaga o recibo de semeadura. O ciclo seguinte relê a conta inteira e
  // reoferece a base inteira.
  //
  // ISTO NÃO É CARO. O log do servidor é COMPACTADO: uma linha por registro,
  // com a operação vencedora, e não o histórico de alterações. Reler do zero
  // custa o tamanho da base, uma vez.
  //
  // ISTO NÃO SOBRESCREVE NADA ÀS CEGAS. Nos dois sentidos quem decide continua
  // sendo a marca do relógio lógico, exatamente como num ciclo comum. O efeito
  // é só um: os dois lados voltam a CONHECER tudo o que o outro tem. A partir
  // daí a mesma regra produz o mesmo resultado nos dois, que é a definição de
  // convergir.
  //
  // Roda sozinha uma vez por conta em cada aparelho (é o reparo de quem já
  // divergiu antes desta versão) e sob demanda, pelo botão da tela de conta.
  async function prepareReconcile(context) {
    await FinanceStore.localMetaPut(META_CURSOR, "0", context.scope);
    assertCurrentCycle(context);
    cursorScope = context.scope;
    cursorCache = "0";
    await FinanceStore.localMetaDelete(META_SEED_RECEIPT, context.scope);
    assertCurrentCycle(context);
    // O recibo nasce DEPOIS das duas remoções. Se a sessão parar no meio, a
    // próxima volta refaz o preparo em vez de considerá-lo feito.
    await FinanceStore.localMetaPut(META_RECONCILE_RECEIPT, {
      version: RECONCILE_VERSION, at: new Date().toISOString(),
    }, context.scope);
    assertCurrentCycle(context);
  }

  // Conferência no começo do ciclo. O recibo é lido uma vez por escopo e por
  // sessão: relê-lo a cada volta de 15 segundos seria uma consulta ao banco
  // local para uma resposta que não muda.
  async function reconcileIfNeeded(context) {
    if (!reconcileRequested && reconcileScope === context.scope) return;
    const pedido = reconcileRequested;
    reconcileRequested = false;
    const recibo = pedido
      ? null
      : await FinanceStore.localMetaGet(META_RECONCILE_RECEIPT, context.scope);
    assertCurrentCycle(context);
    // Recibo de uma versão anterior NÃO conta. É assim que um reparo novo
    // alcança quem já reconciliou uma vez: sem isto, o aparelho que rodou a
    // versão 1 nunca mais rodaria sozinho, e justamente ele é o que precisa.
    if (pedido || !recibo || Number(recibo.version) < RECONCILE_VERSION) {
      await prepareReconcile(context);
      // Marca só ESTE ciclo. A confiança no empate de marca não pode vazar para
      // as voltas seguintes: fora da releitura do zero, empate é eco.
      context.reconciling = true;
    }
    reconcileScope = context.scope;
  }

  // ---------------------------------------------------------------------------
  // Semeadura: a base que já estava no aparelho antes do primeiro ciclo
  // ---------------------------------------------------------------------------
  // A fila só recebe o que MUDA depois que a conta liga. Quem usou o app antes
  // de criar a conta, restaurou um backup, ou usou enquanto o servidor estava
  // fora do ar, tinha uma base inteira que nunca virou operação: o aparelho
  // ficava cheio, o servidor vazio, e o segundo aparelho entrava na conta e via
  // tudo zerado. Pior, sem sinal de erro: a fila estava mesmo vazia, então a
  // tela dizia "Tudo sincronizado".
  //
  // A semeadura roda DEPOIS da primeira descida completa, e é considerada
  // concluída somente quando o servidor confirma o lote e a fila daquele
  // `seedId` fica vazia. O marcador booleano antigo ("já semeei") não conta como
  // recibo: era ele que impedia a reparação de quem sincronizou antes de as
  // tabelas existirem no banco.
  // "Base significativa" não é só lançamento. Quem cadastrou apenas a conta do
  // banco, ou apenas a renda, tem conteúdo de verdade para levar para a conta.
  function baseTemConteudo() {
    const data = FinanceStore.snapshot();
    const listas = ["transactions", "goals", "assets", "accounts", "creditCards",
      "accountTransfers", "cardPayments", "accountAdjustments"];
    if (listas.some((campo) => (data[campo] || []).length > 0)) return true;
    if (Number(data.monthlyIncome) > 0) return true;
    // Categoria de fábrica não é conteúdo; categoria criada pelo usuário é.
    return (data.categories || []).some((c) => c && c.custom === true);
  }

  async function precisaSemear(cursor, context) {
    const recibo = await FinanceStore.localMetaGet(META_SEED_RECEIPT, context && context.scope);
    if (context) assertCurrentCycle(context);
    // Sem recibo confirmado, ou com um diário interrompido pendurado, semear é
    // o certo: reapresentar registros com a marca que eles já têm é inofensivo,
    // porque o servidor guarda a versão de marca maior.
    if (!recibo || recibo.status !== "confirmed") return true;
    const diario = await FinanceStore.localMetaGet(META_SEED_JOURNAL, context && context.scope);
    if (context) assertCurrentCycle(context);
    if (diario) return true;
    // Rede de segurança: cursor zerado depois de uma descida completa significa
    // servidor sem NENHUMA operação. Se este aparelho tem base e o servidor não
    // tem nada, semear de novo é o certo, mesmo com recibo.
    return String(cursor) === "0" && baseTemConteudo();
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

  // O corpo que vai para o servidor tem SOMENTE o que o protocolo define.
  // `linkId`, `seedId`, `entryKey`, `seq` e `queuedAt` são contabilidade local:
  // enviá-los vazaria o funcionamento interno do aparelho para dentro da conta.
  function toWireOp(entry) {
    const op = { entity: entry.entity, entityId: entry.entityId, op: entry.op, rev: entry.rev };
    if (entry.op === "put") op.payload = entry.payload;
    return op;
  }

  // ---------------------------------------------------------------------------
  // Ciclo
  // ---------------------------------------------------------------------------

  async function applyIncoming(ops, context) {
    if (!ops || !ops.length) return false;
    assertCurrentCycle(context);
    // `applyRemoteOps` agora GRAVA antes de devolver. É esta promessa que o
    // cursor espera: enquanto ela não resolve, o aparelho não pode declarar que
    // já leu aquele trecho do log.
    //
    // `trustRemoteOnTie` vale SÓ dentro de uma reconciliação, e é o que a torna
    // capaz de reparar. O defeito que ela conserta produz registros com a MESMA
    // marca e conteúdos diferentes em dois aparelhos; entre marcas iguais o
    // ciclo comum não tem como escolher, e não deve mesmo — ali um empate é o
    // eco do que este aparelho acabou de enviar. Numa releitura explícita do
    // zero a resposta é outra: para uma marca que este aparelho não autorou,
    // quem tem a versão boa é o servidor.
    const result = await FinanceStore.applyRemoteOps(ops, context.scope,
      context.reconciling ? { trustRemoteOnTie: true } : undefined);
    assertCurrentCycle(context);
    if (!result.changed) return false;
    cicloMexeu = true;
    // `applyRemote` redesenha e reavalia conquistas e avisos, como se o próprio
    // usuário tivesse feito a alteração; porque, em outro aparelho, foi.
    hooks.applyRemote(result.data);
    return true;
  }

  // ---- Subida: esvazia a fila em lotes ----
  async function upload(from, context) {
    let cursor = from;
    let guard = 0;
    for (;;) {
      assertCurrentCycle(context);
      const queued = await FinanceStore.outboxRead(0, context.scope);
      assertCurrentCycle(context);
      const diarioVinculo = await FinanceStore.localMetaGet(META_LINK_JOURNAL, context.scope);
      assertCurrentCycle(context);
      // Vínculo bloqueado por mudança remota espera decisão explícita. As
      // entradas continuam na fila; elas só não são REENVIADAS às cegas.
      const bloqueado = diarioVinculo && diarioVinculo.status === "blocked" ? String(diarioVinculo.linkId) : "";
      const enviaveis = bloqueado ? queued.filter((entry) => String(entry.linkId || "") !== bloqueado) : queued;
      setState({ queued: queued.length });
      if (!enviaveis.length) break;
      if (++guard > CLOUD_SYNC_MAX_BATCHES) {
        throw syncError("A fila de sincronização não terminou dentro do limite de lotes.", "batch_limit");
      }

      const compact = compactOutbox(enviaveis);
      const batch = compact.slice(0, CLOUD_SYNC_BATCH);
      if (batch.length) cicloMexeu = true;
      const result = await context.adapter.push(batch.map(toWireOp), cursor, pushOptions(batch, diarioVinculo));
      // O servidor valida a conta antes de devolver operações. Mesmo assim, a
      // aba pode ter trocado de escopo enquanto a resposta viajava.
      assertCurrentCycle(context);

      // A resposta é APLICADA antes de a fila ser confirmada. Se a gravação da
      // resposta falhar, a fila continua inteira e o lote volta na próxima
      // volta; o `mutationId` garante que reenviar não duplica nada.
      await applyIncoming(result.ops, context);

      // Saem também as versões ANTERIORES do mesmo registro, que a compactação
      // substituiu: a marca já enviada é maior que a delas.
      const enviado = new Map(batch.map((entry) => [`${entry.entity} ${entry.entityId}`, String(entry.rev)]));
      const seqs = enviaveis
        .filter((entry) => {
          const rev = enviado.get(`${entry.entity} ${entry.entityId}`);
          return rev !== undefined && String(entry.rev) <= rev;
        })
        .map((entry) => entry.seq);
      // Confirmar é gravar: a remoção da fila e a promoção do recibo de vínculo
      // ou de semeadura acontecem na mesma transação.
      assertCurrentCycle(context);
      await FinanceStore.acknowledgeOutbox(seqs, { revision: result.revision }, context.scope);
      assertCurrentCycle(context);

      // O cursor só avança depois de tudo acima ter chegado ao disco.
      cursor = result.cursor;
      await writeCursor(cursor, context);
      if (batch.length >= compact.length && !result.hasMore) break;
    }
    return cursor;
  }

  // Só o PRIMEIRO lote automático do vínculo declara a revisão esperada. É essa
  // declaração que faz o servidor recusar a adoção se a conta tiver recebido
  // qualquer coisa entre a leitura e a confirmação.
  function pushOptions(batch, diarioVinculo) {
    if (!diarioVinculo || diarioVinculo.expectedRemoteRevision == null) return null;
    if (diarioVinculo.status === "blocked") return null;
    const linkId = String(diarioVinculo.linkId || "");
    if (!linkId || !batch.length) return null;
    if (!batch.every((entry) => String(entry.linkId || "") === linkId)) return null;
    return { expectedRemoteRevision: String(diarioVinculo.expectedRemoteRevision) };
  }

  // ---- Descida: páginas até alcançar o servidor ----
  async function download(from, context) {
    let cursor = from;
    for (let page = 0; page < CLOUD_SYNC_MAX_PAGES; page++) {
      assertCurrentCycle(context);
      const result = await context.adapter.pull(cursor, CLOUD_SYNC_PAGE);
      // Nenhum payload toca o armazenamento antes desta conferência.
      assertCurrentCycle(context);
      await applyIncoming(result.ops, context);
      const advanced = String(result.cursor) !== String(cursor);
      cursor = result.cursor;
      await writeCursor(cursor, context);
      if (!result.hasMore) return cursor;
      // Servidor dizendo "tem mais" sem mover o cursor é laço infinito
      // disfarçado de sucesso. Parar em silêncio deixaria o aparelho com meia
      // conta e a tela dizendo que estava tudo em dia.
      if (!advanced) throw syncError("O servidor não avançou a leitura da conta.", "cursor_stalled");
    }
    throw syncError("A leitura da conta excedeu o limite de páginas.", "page_limit");
  }

  async function cycle(context) {
    // 1. Gravação local em curso termina ANTES de qualquer decisão. Uma
    //    alteração ainda no debounce não pode ficar de fora do primeiro envio,
    //    nem ser sobrescrita pela primeira descida.
    const gravou = await FinanceStore.flush();
    if (gravou === false) throw syncError("O aparelho não conseguiu salvar antes de sincronizar.", "local_write_failed");
    assertCurrentCycle(context);

    // 1b. Reconciliação, quando ela é devida. Precisa vir ANTES da leitura do
    //     cursor, porque é justamente o cursor que ela zera.
    await reconcileIfNeeded(context);
    assertCurrentCycle(context);

    let cursor = await readCursor(context);

    // 2. Descida primeiro. O vínculo e a semeadura precisam saber o que a conta
    //    JÁ TEM antes de este aparelho empurrar qualquer coisa.
    cursor = await download(cursor, context);
    assertCurrentCycle(context);
    if (observedRevision === null) {
      observedRevision = String(context.adapter.revision == null ? cursor : context.adapter.revision);
      setState({ remoteRevision: observedRevision }, true);
    }

    // 3. Enquanto a decisão de vínculo não sai, nada sobe e nada é semeado.
    if (bootstrapHeld) return;

    if (await precisaSemear(cursor, context)) {
      assertCurrentCycle(context);
      await FinanceStore.seedOutbox(context.scope);
      assertCurrentCycle(context);
    }

    // 4. Subida, com aplicação da resposta e confirmação da fila por dentro.
    cursor = await upload(cursor, context);

    // 5. Descida final: fecha a volta com o que outros aparelhos escreveram
    //    enquanto este enviava.
    await download(cursor, context);
  }

  // Um ciclo por vez, e uma ABA por vez. `ifAvailable` faz a aba desistir na
  // hora em vez de enfileirar: a outra aba já está enviando a mesma fila.
  async function withLock(context, fn, waitForLock) {
    const locks = typeof navigator !== "undefined" && navigator.locks;
    if (!locks || typeof locks.request !== "function") return fn();
    let ran = false;
    const options = waitForLock ? {} : { ifAvailable: true };
    await locks.request(`cofre-sync-${context.scope}`, options, async (lock) => {
      if (!lock) return;
      assertCurrentCycle(context);
      ran = true;
      await fn();
    });
    return ran;
  }

  function queueRerun(quieto) {
    const requestedGeneration = syncGeneration;
    if (!rerunRequest || rerunRequest.generation !== requestedGeneration) {
      rerunRequest = { generation: requestedGeneration, quieto: !!quieto };
    } else {
      // Se ao menos um chamador pediu uma volta visível, ela não pode ser
      // rebaixada para silenciosa por outro gatilho.
      rerunRequest.quieto = rerunRequest.quieto && !!quieto;
    }
    if (rerunPromise && rerunGeneration === requestedGeneration) return rerunPromise;
    const current = activeRunPromise || Promise.resolve(false);
    let promise;
    promise = Promise.resolve(current).catch(() => false).then(() => {
      const request = rerunRequest;
      if (!request || request.generation !== requestedGeneration
        || !state.enabled || requestedGeneration !== syncGeneration) return false;
      rerunRequest = null;
      return runSync(request.quieto);
    }).finally(() => {
      if (rerunPromise === promise) {
        rerunPromise = null;
        rerunGeneration = -1;
      }
    });
    rerunPromise = promise;
    rerunGeneration = requestedGeneration;
    return promise;
  }

  function runSync(quieto) {
    if (!adapter || !hooks.applyRemote) return Promise.resolve(false);
    if (resetting) return resetPromise ? resetPromise.then(() => false, () => false) : Promise.resolve(false);
    if (running) return queueRerun(quieto);
    if (offline()) { setState({ phase: "offline", pending: true }); return Promise.resolve(false); }

    const context = captureCurrentContext();
    running = true;
    cicloMexeu = false;
    const eraSincronizado = state.phase === "synced";
    if (!quieto) setState({ phase: "syncing", error: null, errorCode: null });
    const raw = performRun(context, quieto, eraSincronizado);
    const tracked = raw.finally(() => {
      if (activeRunPromise === tracked) {
        activeRunPromise = null;
        running = false;
      }
    });
    activeRunPromise = tracked;
    return tracked;
  }

  async function performRun(context, quieto, eraSincronizado) {
    try {
      assertCurrentCycle(context);
      const ran = await withLock(context, () => cycle(context));
      assertCurrentCycle(context);
      if (ran === false) { setState({ phase: "idle", pending: true }); return false; }
      // A LEITURA FINAL DA FILA É A PROVA. Se ela falhar, o `catch` assume: o
      // aplicativo não tem como afirmar que não sobrou nada por enviar.
      const queued = await FinanceStore.outboxRead(0, context.scope);
      assertCurrentCycle(context);
      // O PORTÃO FECHADO NÃO É "TUDO SINCRONIZADO".
      //
      // Com `bootstrapHeld`, o ciclo desce e para: não sobe e não semeia. A
      // fila pode estar vazia só porque a semeadura ainda não rodou, e dizer
      // "sincronizado" nesse estado era como o aparelho anunciava que tinha
      // levado para a conta uma base que nunca saiu daqui.
      const pendente = queued.length > 0 || bootstrapHeld;
      // Volta periódica que não achou nada e não mudou nada visível não avisa
      // ninguém: para o usuário, a tela continua exatamente como estava.
      const semNovidade = !!quieto && !cicloMexeu && eraSincronizado && !pendente;
      if (sessionRefreshAccountId === context.expectedAccountId) sessionRefreshAccountId = "";
      setState({
        phase: pendente ? "idle" : "synced", lastSyncAt: new Date().toISOString(),
        pending: pendente, queued: queued.length, error: null, errorCode: null,
        bootstrapHeld,
      }, semNovidade);
      return !pendente;
    } catch (error) {
      return await handleFailure(error, context);
    }
  }

  async function handleFailure(error, context) {
    const code = (error && error.code) || "server_error";
    if (code === "sync_cancelled") return false;
    // Uma resposta do motor antigo não pode desligar, alterar mensagens nem
    // chamar os hooks da conta que entrou depois dela.
    if (!contextIsCurrent(context, Object.prototype.hasOwnProperty.call(context || {}, "adapter"))) return false;
    if (code === "session_refresh_required") {
      const accountId = context.expectedAccountId;
      if (sessionRefreshAccountId === accountId) {
        disable();
        setState({
          phase: "error", pending: true, errorCode: code,
          error: "Não foi possível renovar a sessão para sincronizar. Tente novamente.",
        });
        return false;
      }
      sessionRefreshAccountId = accountId;
      disable();
      setState({ phase: "idle", pending: true, error: null, errorCode: code });
      // A consulta de sessão usa o lock de cookies. Ela começa fora da promessa
      // do ciclo antigo, e a própria camada de conta religa o motor somente se a
      // identidade confirmada continuar sendo esta.
      if (typeof hooks.onSessionRefreshRequired === "function") {
        Promise.resolve().then(() => hooks.onSessionRefreshRequired({
          code,
          message: error && error.message || "",
          expectedAccountId: accountId,
        })).catch((hookError) => {
          if (typeof reportSafeError === "function") reportSafeError("sync", hookError, "sync_session_refresh_hook");
        });
      }
      return false;
    }
    if (code === "account_scope_changed") {
      disable();
      setState({
        phase: "disabled", pending: true, error: null,
        errorCode: code,
      });
      // A consulta de sessão pode ligar um motor novo. Ela precisa começar fora
      // da promessa deste ciclo para não esperar por si mesma.
      if (typeof hooks.onAccountScopeChanged === "function") {
        Promise.resolve().then(() => hooks.onAccountScopeChanged({
          code,
          message: error && error.message || "",
          expectedAccountId: context && context.expectedAccountId || expectedAccountId(),
        })).catch((hookError) => {
          if (typeof reportSafeError === "function") reportSafeError("sync", hookError, "sync_account_scope_hook");
        });
      }
      return false;
    }
    if (code === "invalid_account_scope") {
      disable();
      setState({
        phase: "error", pending: true,
        error: "Não foi possível confirmar a identidade da conta para sincronizar.",
        errorCode: code,
      });
      return false;
    }
    if (code === "session_expired" || code === "device_revoked" || code === "device_unknown") {
      // Sessão morta ou aparelho revogado: parar é o certo. Insistir só produz
      // uma fila de 401 e um aviso repetido na tela. A fila local fica intacta;
      // ao entrar de novo, ela sobe.
      disable();
      setState({ phase: "error", error: "A sessão terminou. Entre novamente para voltar a sincronizar.", errorCode: code });
      if (typeof hooks.onAuthInvalid === "function") {
        try { await hooks.onAuthInvalid({ code, message: error && error.message || "" }); }
        catch (hookError) {
          if (typeof reportSafeError === "function") reportSafeError("sync", hookError, "sync_auth_invalid_hook");
        }
      }
      return false;
    }
    if (code === "protocol_upgrade_required") {
      // A fila NÃO é descartada: ela sobe assim que o aplicativo atualizar.
      disable();
      setState({ phase: "error", pending: true, error: "Atualize o aplicativo para voltar a sincronizar.", errorCode: code });
      return false;
    }
    if (code === "remote_changed") {
      // A conta recebeu algo entre a leitura e a confirmação do vínculo. Nada é
      // descartado: o diário e a fila continuam, e a decisão volta para o
      // usuário como confirmação de mesclagem.
      FinanceStore.blockGuestLink(error && error.revision, context.scope).catch((journalError) => {
        if (typeof reportSafeError === "function") reportSafeError("storage", journalError, "guest_link_block");
      });
      setState({
        phase: "idle", pending: true,
        error: "A conta mudou em outro aparelho. Confirme como juntar os dados.",
        errorCode: code,
      });
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
      scheduleRetry(context);
      return false;
    }
    if (typeof reportSafeError === "function") reportSafeError("sync", error, "sync_cycle");
    setState({
      phase: "error",
      pending: true,
      error: "Não foi possível sincronizar agora. O aparelho continua com todos os dados.",
      errorCode: code,
    });
    scheduleRetry(context);
    return false;
  }

  function scheduleRetry(context) {
    clearTimeout(retryTimer);
    const retryAccountId = String(context && context.expectedAccountId || expectedAccountId());
    const retryScope = String(context && context.scope || FinanceStore.scope());
    if (!retryAccountId || retryScope === "guest") return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (expectedAccountId() !== retryAccountId || FinanceStore.scope() !== retryScope) return;
      if (state.enabled) runSync();
      else enable();
    }, CLOUD_SYNC_RETRY_MS);
  }

  // ---------------------------------------------------------------------------
  // Volta periódica
  // ---------------------------------------------------------------------------
  // O motor só tinha gatilho de SAÍDA: alteração local, volta da rede, retorno
  // à aba com fila pendente. Faltava o de ENTRADA, e a falta aparecia na
  // situação mais comum de todas: com o app aberto nos dois aparelhos, quem
  // lançava no celular não via nada mudar no computador. A tela do computador
  // já estava "sincronizada" - não tinha nada para mandar - e ninguém ia
  // buscar o que havia chegado. Só recarregar a página resolvia.
  //
  // Uma consulta a cada 15 segundos, e só com o app à vista, cobre isso sem
  // gastar bateria em segundo plano nem somar requisição com a aba escondida.
  function appVisivel() {
    return typeof document === "undefined" || document.visibilityState !== "hidden";
  }

  function startPolling() {
    stopPolling();
    if (typeof setInterval !== "function") return;
    pollTimer = setInterval(() => {
      if (!state.enabled || running || offline() || !appVisivel()) return;
      runSync(true);
    }, CLOUD_SYNC_POLL_MS);
  }

  function stopPolling() {
    if (pollTimer !== null) { clearInterval(pollTimer); pollTimer = null; }
  }

  // VOLTAR PARA O APLICATIVO PRECISA BUSCAR NA HORA.
  //
  // O intervalo de 15 s só age com a aba à vista, e é o certo: navegador
  // nenhum mantém `setInterval` andando numa aba escondida, e no celular ele
  // congela de vez. O problema é a VOLTA. Quem deixou o app aberto no celular,
  // usou o computador e voltou ficava esperando o primeiro disparo do
  // intervalo, e nesse meio tempo a tela mostrava números velhos como se
  // fossem os atuais.
  //
  // A camada de conta já tentava cobrir isso pelo `focus`, mas por um caminho
  // que pode ser engolido: ela dedupla por 750 ms, compartilha promessa com a
  // recuperação de sessão e exige `sessionStatus === "active"`. O motor não
  // pode depender disso para uma coisa que é responsabilidade dele. Aqui o
  // gatilho é direto, e `runSync` sozinho já resolve a corrida: um ciclo em
  // andamento vira reexecução em vez de segunda volta simultânea.
  // A visibilidade NÃO é conferida aqui de propósito. `pageshow` restaurado do
  // cache de retorno chega com a aba ainda marcada como escondida em alguns
  // navegadores, e `online` vale mesmo com o app em segundo plano: nos dois
  // casos exigir "visível" cancelaria justamente a volta que precisa acontecer.
  // O intervalo religado continua conferindo, disparo a disparo.
  function acordarComAApp() {
    if (!state.enabled || offline()) return;
    startPolling();          // rearma o relógio, que pode ter sido congelado
    runSync(true);
  }

  function watchVisibility() {
    if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") acordarComAApp();
      });
    }
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      // `pageshow` cobre a volta pelo cache de retorno (bfcache), em que a
      // página inteira é restaurada sem passar por `visibilitychange`.
      window.addEventListener("pageshow", () => acordarComAApp());
      window.addEventListener("online", () => acordarComAApp());
      // Foco sem troca de visibilidade acontece o tempo todo no computador:
      // duas janelas lado a lado, ou a aba do app atrás do navegador inteiro.
      window.addEventListener("focus", () => acordarComAApp());
    }
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

  // O navegador pode interromper esta promessa assim que a aba some. Ainda
  // assim iniciamos a gravação e o envio imediatamente; se ele for cortado, a
  // fila persistente continua inteira para o próximo pageshow, foco ou online.
  async function flushOnHide() {
    clearTimeout(pendingTimer);
    const gravou = await FinanceStore.flush();
    if (gravou === false || !state.enabled) return false;
    return runSync(true);
  }

  // O botão "tentar de novo" da tela de conta. Quando o motor está ligado, é um
  // ciclo. Quando ele PAROU por erro (sessão morta, migração faltando), é uma
  // nova tentativa de ligar; era exatamente aí que a tela não oferecia botão
  // nenhum e a única saída conhecida era recarregar a página.
  function retry() {
    if (sessionRefreshAccountId === expectedAccountId()) sessionRefreshAccountId = "";
    if (state.enabled) return syncNow();
    return enable();
  }

  // O botão "Conferir a conta inteira" da tela de conta. Marca o pedido e deixa
  // o próprio ciclo executá-lo: assim ele acontece dentro do bloqueio de aba e
  // com as mesmas conferências de escopo e geração de qualquer outra volta.
  function reconcile() {
    reconcileRequested = true;
    if (sessionRefreshAccountId === expectedAccountId()) sessionRefreshAccountId = "";
    if (!state.enabled) return enable();
    return syncNow();
  }

  // ---------------------------------------------------------------------------
  // Apagar tudo na conta
  // ---------------------------------------------------------------------------
  // Precisa virar lápide no servidor, e não sumiço: sumiço faz o próximo
  // aparelho a sincronizar devolver a base inteira de volta.
  function resetRemote() {
    if (resetPromise) return resetPromise;
    let captured;
    try { captured = captureCurrentContext(); }
    catch (error) {
      if (state.phase === "syncing") {
        setState({ phase: state.enabled ? "idle" : "disabled", pending: !!state.enabled });
      }
      return Promise.resolve({
        ok: false, remoteDeleted: false, localPrepared: false,
        reason: (error && error.code) || "sync_cancelled", resetRev: null,
      });
    }
    if (!captured) {
      if (state.phase === "syncing") {
        setState({ phase: state.enabled ? "idle" : "disabled", pending: !!state.enabled });
      }
      return Promise.resolve({ ok: false, remoteDeleted: false, localPrepared: false, reason: "disabled", resetRev: null });
    }
    const previousRun = activeRunPromise;
    const generation = nextGeneration();
    const context = { ...captured, generation };
    resetting = true;
    clearTimeout(pendingTimer);
    clearTimeout(retryTimer);
    setState({ phase: "syncing", error: null, errorCode: null });

    let promise;
    promise = performReset(context, previousRun).finally(() => {
      if (resetPromise === promise) {
        // Todo caminho normal escolhe um estado antes de chegar aqui. Este
        // último anteparo cobre cancelamentos lançados pelo adaptador sem
        // deixar a conta aparentando sincronizar para sempre.
        if (contextIsCurrent(context, true) && state.phase === "syncing") {
          setState({ phase: "idle", pending: true, error: null, errorCode: null });
        }
        resetPromise = null;
        resetting = false;
      }
    });
    resetPromise = promise;
    return promise;
  }

  async function performReset(context, previousRun) {
    let remoteDeleted = false;
    let resetRev = null;
    try {
      // A geração já mudou, então a resposta do ciclo anterior não pode mais
      // tocar na base. Aguardá-lo garante também que uma escrita local que já
      // tinha começado termine antes da operação destrutiva.
      if (previousRun) await previousRun.catch(() => false);
      assertCurrentCycle(context);
      const ran = await withLock(context, async () => {
        assertCurrentCycle(context);
        const flushed = await FinanceStore.flush();
        if (flushed === false) throw syncError("O aparelho não conseguiu salvar antes de apagar.", "local_write_failed");
        assertCurrentCycle(context);
        const rev = FinanceStore.mintRev();
        const result = await context.adapter.resetRemote(rev);
        resetRev = result.resetRev;
        // O adaptador só resolve depois da confirmação do servidor. Marcar
        // antes de conferir de novo o contexto preserva essa verdade mesmo se
        // a sessão mudar exatamente enquanto a resposta volta.
        remoteDeleted = true;
        assertCurrentCycle(context);
        // `observeResetRev`, não `observeRemoteRev`: a marca do reset nasce acima
        // de toda a conta e pode passar do teto de 24h do caminho comum.
        if (FinanceStore.observeResetRev(result.resetRev) !== true) {
          throw syncError("O aparelho não conseguiu registrar a versão da exclusão remota.", "reset_rev_observe_failed");
        }
        try { await FinanceStore.outboxClear(context.scope); }
        catch (error) {
          const failure = syncError("A fila local não pôde ser limpa depois da exclusão remota.", "outbox_clear_failed");
          failure.cause = error;
          throw failure;
        }
        assertCurrentCycle(context);
        try { await writeCursor(String(result.revision || "0"), context); }
        catch (error) {
          const failure = syncError("O cursor local não pôde ser atualizado depois da exclusão remota.", "cursor_write_failed");
          failure.cause = error;
          throw failure;
        }
        return true;
      }, true);
      assertCurrentCycle(context);
      if (ran !== true) throw syncError("Não foi possível reservar este aparelho para apagar os dados.", "lock_unavailable");
      setState({
        phase: "synced", lastSyncAt: new Date().toISOString(), pending: false,
        queued: 0, error: null, errorCode: null,
      });
      return { ok: true, remoteDeleted: true, localPrepared: true, reason: null, resetRev };
    } catch (error) {
      const reason = (error && error.code) || "server_error";
      if (remoteDeleted) {
        if (contextIsCurrent(context, true)) {
          if (typeof reportSafeError === "function") {
            reportSafeError("storage", error && error.cause || error, reason);
          }
          setState({
            phase: "error", pending: true, errorCode: reason,
            error: "Os dados foram apagados da conta, mas o aparelho não concluiu a limpeza local.",
          });
        }
        return { ok: false, remoteDeleted: true, localPrepared: false, reason, resetRev };
      }
      await handleFailure(error, context);
      return { ok: false, remoteDeleted: false, localPrepared: false, reason, resetRev: null };
    }
  }

  async function createCheckpoint(label) {
    const context = captureCurrentContext();
    if (!context) return null;
    try {
      const checkpoint = await context.adapter.createCheckpoint(label);
      assertCurrentCycle(context);
      return checkpoint;
    } catch (error) { await handleFailure(error, context); return null; }
  }

  async function listCheckpoints() {
    const context = captureCurrentContext();
    if (!context) return [];
    try {
      const checkpoints = await context.adapter.listCheckpoints();
      assertCurrentCycle(context);
      return checkpoints;
    } catch (error) { await handleFailure(error, context); return []; }
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
    const context = captureCurrentContext();
    if (!context) return { ok: false, reason: "disabled" };

    try {
      // Rede de segurança: quem restaura por engano precisa de caminho de volta.
      const safetyCheckpoint = await context.adapter.createCheckpoint("Antes de restaurar");
      assertCurrentCycle(context);
      if (!safetyCheckpoint || !safetyCheckpoint.id) {
        throw syncError("Não foi possível criar a versão de segurança antes da restauração.", "checkpoint_failed");
      }

      const ops = [];
      let after = "";
      let checkpointComplete = false;
      for (let page = 0; page < CLOUD_SYNC_MAX_PAGES; page++) {
        const result = await context.adapter.readCheckpoint(checkpointId, after);
        assertCurrentCycle(context);
        result.ops.forEach((row) => {
          if (row.op !== "put" || !row.payload) return;
          ops.push({ entity: row.entity, entityId: row.entityId, op: "put", rev: FinanceStore.mintRev(), payload: row.payload });
        });
        if (!result.hasMore) {
          checkpointComplete = true;
          break;
        }
        const nextAfter = String(result.after || "");
        if (!nextAfter || nextAfter === after) {
          throw syncError("A versão parou de avançar durante a leitura. Nada foi restaurado.", "cursor_stalled");
        }
        after = nextAfter;
      }
      if (!checkpointComplete) {
        throw syncError("A versão excedeu o limite seguro de páginas. Nada foi restaurado.", "page_limit");
      }

      assertCurrentCycle(context);
      const naVersao = new Set(ops.map((op) => `${op.entity} ${op.entityId}`));
      const atual = FinanceStore.snapshot();
      FinanceStore.syncEntityFields().forEach((field) => {
        (atual[field] || []).forEach((rec) => {
          if (!naVersao.has(`${field} ${rec.id}`)) {
            ops.push({ entity: field, entityId: rec.id, op: "delete", rev: FinanceStore.mintRev() });
          }
        });
      });

      assertCurrentCycle(context);
      const queued = ops.map((op) => ({ ...op, queuedAt: Date.now() }));
      // A base restaurada e as operações que a propagam são uma única gravação
      // local. Se a sessão parar neste await, nunca sobra uma restauração sem
      // fila, nem uma fila sem a respectiva restauração.
      const aplicado = await FinanceStore.applyRemoteOps(ops, context.scope, { outboxAdds: queued });
      assertCurrentCycle(context);
      if (aplicado.changed) hooks.applyRemote(aplicado.data);
      await syncNow();
      assertCurrentCycle(context);
      return { ok: true, applied: ops.length };
    } catch (error) {
      await handleFailure(error, context);
      return { ok: false, reason: (error && error.code) || "failed" };
    }
  }

  // ---------------------------------------------------------------------------
  // Entrada numa conta: preparar, decidir, concluir
  // ---------------------------------------------------------------------------
  // `prepareAccount` liga o motor e BAIXA, sem enviar e sem semear. É o que
  // permite ao vínculo perguntar "esta conta já tem alguma coisa?" antes de
  // este aparelho ter escrito qualquer coisa nela.
  async function prepareAccount() {
    bootstrapHeld = true;
    observedRevision = null;
    setState({ bootstrapHeld: true, remoteRevision: null }, true);
    if (state.enabled) await runSync();
    else await enable();
    return {
      ok: observedRevision !== null,
      revision: observedRevision,
      phase: state.phase,
      error: state.error,
      errorCode: state.errorCode,
    };
  }

  // Libera a fila e a semeadura depois da decisão de vínculo, e devolve o
  // resultado real do ciclo que roda em seguida.
  //
  // CHAMAR DUAS VEZES PRECISA SER BARATO, MAS NUNCA À CUSTA DO LOTE.
  //
  // A camada de conta libera o portão também numa rede de segurança, no
  // `finally` do vínculo, porque deixar `bootstrapHeld` preso era o defeito que
  // fazia um aparelho BAIXAR para sempre e nunca ENVIAR.
  //
  // A versão anterior economizava uma volta de rede: com o portão já aberto e
  // um ciclo em curso, ela DEVOLVIA a promessa desse ciclo em vez de pedir
  // outro. Só que quem chama isto depois de "Juntar dados" acabou de GRAVAR na
  // fila, e o ciclo em curso pode já ter passado da subida. O lote do vínculo
  // ficava parado no aparelho: a tela mostrava "Vínculo pendente", o saldo
  // subia só aqui, e nos outros aparelhos não aparecia nada. Era exatamente o
  // relato de "juntei os valores e não atualizou em lugar nenhum".
  //
  // `syncNow` já resolve a corrida sozinho: com um ciclo em curso ele agenda UMA
  // reexecução, compartilhada por todos os chamadores da mesma geração, em vez
  // de uma segunda volta simultânea. Continua barato, e agora sempre envia.
  async function finishAccountBootstrap() {
    bootstrapHeld = false;
    setState({ bootstrapHeld: false }, true);
    if (!state.enabled) return enable();
    return syncNow();
  }

  // ---------------------------------------------------------------------------
  // Ligar e desligar
  // ---------------------------------------------------------------------------

  function enable() {
    if (state.enabled) return runSync();
    if (!hooks.applyRemote) return Promise.resolve(false);
    const nextScope = FinanceStore.scope();
    const accountId = expectedAccountId();
    if (sessionRefreshAccountId && sessionRefreshAccountId !== accountId) sessionRefreshAccountId = "";
    const key = `${nextScope} ${accountId}`;
    if (enablePromise && enableKey === key) return enablePromise;

    // Entrar no escopo da conta já autoriza a marcação local. A saúde remota
    // pode falhar; isso não pode transformar edições feitas nesse intervalo em
    // mudanças sem relógio e sem fila.
    FinanceStore.setOutboxEnabled(nextScope !== "guest" && !!accountId);
    const generation = nextGeneration();
    scope = nextScope;
    adapter = null;
    cursorCache = null;
    cursorScope = null;
    // O recibo de reconciliação é POR CONTA. Entrar noutra conta precisa
    // conferir o recibo dela, e não herdar a resposta da anterior.
    if (reconcileScope !== nextScope) reconcileScope = null;
    const promise = performEnable({ generation, scope: nextScope, expectedAccountId: accountId });
    enablePromise = promise;
    enableKey = key;
    return promise.finally(() => {
      if (enablePromise === promise) {
        enablePromise = null;
        enableKey = "";
      }
    });
  }

  async function performEnable(context) {
    let candidate = null;
    try {
      candidate = new CloudAdapter({
        enabled: true,
        baseUrl: "/api/sync",
        authMode: "cookie",              // a sessão vive em cookie HttpOnly
        deviceId: accountDeviceId(),
        deviceLabel: typeof accountDeviceLabel === "function" ? accountDeviceLabel() : "Este navegador",
        deviceType: typeof accountCurrentDeviceType === "function" ? accountCurrentDeviceType() : "unknown",
        accountId: context.expectedAccountId,
        allowDestructive: true,          // usado só por resetRemote(), que grava lápides
      });
      await candidate.init();
    } catch (error) {
      if (context.generation !== syncGeneration
        || context.scope !== FinanceStore.scope()
        || context.expectedAccountId !== expectedAccountId()) return false;
      const code = (error && error.code) || "unavailable";
      if (code === "account_scope_changed" || code === "invalid_account_scope"
        || code === "session_expired" || code === "device_revoked" || code === "device_unknown"
        || code === "protocol_upgrade_required" || code === "schema_missing"
        || code === "not_configured" || code === "origin_denied") {
        await handleFailure(error, context);
        return false;
      }
      setState({ enabled: false });
      await handleFailure(error, context);
      return false;
    }
    if (context.generation !== syncGeneration
      || context.scope !== FinanceStore.scope()
      || context.expectedAccountId !== expectedAccountId()) return false;
    adapter = candidate;
    FinanceStore.setOutboxEnabled(true);
    setState({ enabled: true, phase: "idle", error: null, errorCode: null });
    startPolling();
    // O resultado do PRIMEIRO ciclo é o resultado de ligar. Devolver `true` sem
    // olhar era o que deixava a tela dizer "sincronizado" com a fila cheia.
    return runSync();
  }

  function disable() {
    nextGeneration();
    clearTimeout(pendingTimer);
    clearTimeout(retryTimer);
    stopPolling();
    enablePromise = null;
    enableKey = "";
    adapter = null;
    bootstrapHeld = false;
    observedRevision = null;
    cursorCache = null;
    cursorScope = null;
    reconcileScope = null;
    // Um pedido manual de reconciliação que não chegou a rodar não sobrevive ao
    // desligamento: quem pediu vai pedir de novo, e aplicá-lo à conta seguinte
    // seria fazer trabalho que ninguém mandou fazer.
    reconcileRequested = false;
    // A fila NÃO é apagada: ela é o que ainda não chegou ao servidor. Apagar
    // aqui perderia lançamentos feitos offline logo antes de sair.
    // O motor pode parar por rede, atualização ou configuração incompleta sem
    // a conta deixar de ser o escopo atual. Continuamos enfileirando nesse banco;
    // a troca efetiva para visitante reinicializa a flag no FinanceStore.
    setState({
      enabled: false, phase: "disabled", pending: false, error: null, errorCode: null,
      remoteRevision: null, bootstrapHeld: false,
    });
    return activeRunPromise ? activeRunPromise.catch(() => false) : Promise.resolve(true);
  }

  let ouvindoVisibilidade = false;

  function configure(options) {
    const o = options || {};
    // Um registro só, na primeira configuração: `configure` é chamada uma vez
    // pelo aplicativo, mas os testes a chamam várias, e ouvinte repetido
    // multiplicaria requisições a cada volta para a aba.
    if (!ouvindoVisibilidade) { ouvindoVisibilidade = true; watchVisibility(); }
    if (typeof o.applyRemote === "function") hooks.applyRemote = o.applyRemote;
    if (typeof o.onAuthInvalid === "function") hooks.onAuthInvalid = o.onAuthInvalid;
    if (typeof o.onAccountScopeChanged === "function") hooks.onAccountScopeChanged = o.onAccountScopeChanged;
    if (typeof o.onSessionRefreshRequired === "function") hooks.onSessionRefreshRequired = o.onSessionRefreshRequired;
    if (typeof o.getExpectedAccountId === "function") hooks.getExpectedAccountId = o.getExpectedAccountId;
    if (typeof o.onStatus === "function") listeners.push(o.onStatus);
  }

  return {
    configure,
    enable,
    disable,
    schedule,
    syncNow,
    flushOnHide,
    retry,
    reconcile,
    resetRemote,
    createCheckpoint,
    listCheckpoints,
    restoreCheckpoint,
    prepareAccount,
    finishAccountBootstrap,
    observedRevision: () => observedRevision,
    status: () => state,
    isEnabled: () => state.enabled,
  };
})();
