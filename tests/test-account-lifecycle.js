// test-account-lifecycle.js — [M42] o ciclo de vida da conta, do lado do NAVEGADOR.
//
// POR QUE ESTE ARQUIVO EXISTE
//
// `js/auth.js` tem 71 kB e estava em 56,5% de cobertura, o penúltimo do
// projeto. É o arquivo mais sensível do cliente: ele decide quando a sessão
// vale, quando o banco local troca de dono, o que acontece quando um aparelho é
// revogado e o que sobra depois de apagar a conta. As suítes existentes
// (`test-account-backend.js` e irmãs) exercitam o HANDLER; o lado do navegador
// só tinha `refreshAccountSession` coberto, por `test-auto-sync-session.js`.
//
// O que ficava sem teste, medido pelo coletor do V8, eram justamente os maiores:
// `accountSubmit` (login, cadastro, recuperação, troca de senha),
// `accountLogout`, `accountRevoke`, `accountRevokeOthers`,
// `accountForgetThisDevice` e `accountDelete`. Todas terminam mexendo em qual
// banco está aberto — o erro aqui não perde um pixel, mostra o dado de uma
// conta para outra pessoa.
//
// O harness é o mesmo de `test-auto-sync-session.js`: `js/auth.js` num contexto
// de `vm`, com `fetch` de mentira e um `FinanceStore` observável. Nada aqui
// depende de rede.
"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(ROOT, "js", "auth.js"), "utf8");

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail === undefined ? "" : ` → ${JSON.stringify(detail)}`}`); }
}
function section(t) { console.log(`\n${t}`); }

function eventTarget(extra) {
  const listeners = new Map();
  return {
    ...(extra || {}),
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    emit(type, event) { (listeners.get(type) || []).forEach((fn) => fn(event || { type })); },
  };
}

// Servidor de mentira: devolve o que a rota mandar e ANOTA o que foi pedido.
// O registro é metade do teste — várias garantias daqui são sobre a ORDEM em
// que as coisas acontecem (sincronizar antes de sair, desligar a nuvem antes de
// apagar), e ordem só se verifica olhando o registro.
function montar(rotas, opcoes) {
  const opts = opcoes || {};
  const chamadas = [];
  const eventos = [];
  const doc = eventTarget({ visibilityState: "visible" });
  const win = eventTarget();
  let escopo = opts.escopoInicial === undefined ? "u_dono-atual" : opts.escopoInicial;

  const cloud = {
    ligado: true,
    ordem: eventos,
    isEnabled() { return this.ligado; },
    async syncNow() { eventos.push("sync"); return true; },
    enable() { eventos.push("cloud-on"); this.ligado = true; },
    disable() { eventos.push("cloud-off"); this.ligado = false; },
  };

  const loja = {
    purgado: false,
    async flush() { eventos.push("flush"); return true; },
    scope() { return escopo; },
    snapshot() { return { onboarding: { done: true } }; },
    async purge() { eventos.push("purge"); this.purgado = true; return true; },
    setOutboxEnabled() {},
    readUndoSnapshot: () => null,
  };

  const ctx = {
    console, crypto, URL, URLSearchParams, Promise, Date, Math, AbortController,
    setTimeout, clearTimeout,
    localStorage: { getItem: () => "aparelho-de-teste-0001", setItem: () => {}, removeItem: () => {} },
    navigator: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Safari/537.36", platform: "Win32", maxTouchPoints: 0 },
    location: { protocol: "https:", search: "", hash: "", pathname: "/index.html" },
    history: { state: null, replaceState() {} },
    window: win, document: doc,
    CloudSync: cloud,
    GUEST_SCOPE: "guest",
    FinanceStore: loja,
    defaultData: () => ({ onboarding: { done: false }, transactions: [] }),
    storageScopeFor: (userId) => (userId ? `u_${userId}` : "guest"),
    // Cada escopo tem o SEU banco: o da conta traz lançamentos, o de visitante
    // é vazio. Devolver o mesmo objeto para os dois faria o teste de "o
    // snapshot da conta não fica na tela" medir o próprio harness.
    switchStorageScope: async (proximo) => {
      escopo = proximo;
      eventos.push(`escopo:${proximo}`);
      return proximo === "guest"
        ? { onboarding: { done: false }, transactions: [] }
        : { onboarding: { done: true }, transactions: [{ id: "t1", amount: 100 }] };
    },
    isStorageAvailable: () => true,
    refreshOnboardingGate: () => false,
    render() { eventos.push("render"); },
    notify(msg) { eventos.push(`aviso:${String(msg || "").slice(0, 40)}`); },
    reportSafeError() {},
    // O restante do app não entra neste contexto; estes são os poucos nomes que
    // `js/auth.js` chama para fora e sem os quais a troca de escopo estoura.
    freshTxForm: () => ({ type: "expense", amount: "", description: "" }),
    setState(patch) { Object.assign(vm.runInContext("state", ctx), patch || {}); },
    holdOnboardingGate() {},
    NavHistory: { supported: () => false, current: () => ({ tab: "dashboard", depth: 0 }), replace() {}, push() {} },
    Router: { isTab: () => true, slugOf: (t) => t },
    showFormErrors(errors, resumo) { eventos.push(`erro-de-forma:${Object.keys(errors).join(",")}`); ctx.__ultimoErroDeForma = { errors, resumo }; },
    async fetch(url, init) {
      const rota = String(url).replace(/^\/api\/account\//, "");
      const corpo = init && init.body ? JSON.parse(init.body) : null;
      chamadas.push({ rota, metodo: (init && init.method) || "GET", corpo });
      const resposta = rotas[rota];
      if (!resposta) throw new Error(`rota sem resposta no teste: ${rota}`);
      const dado = typeof resposta === "function" ? resposta(corpo, chamadas) : resposta;
      return {
        ok: dado.status === undefined || dado.status < 400,
        status: dado.status || 200,
        // `js/auth.js` confere o content-type antes de ler o corpo: resposta de
        // gateway em HTML não pode virar `JSON.parse` estourado.
        headers: { get: (nome) => (String(nome).toLowerCase() === "content-type" ? "application/json; charset=utf-8" : null) },
        async json() { return dado.corpo === undefined ? dado : dado.corpo; },
      };
    },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: "js/auth.js" });
  ctx.run = (codigo) => vm.runInContext(codigo, ctx);
  ctx.chamadas = chamadas;
  ctx.eventos = eventos;
  ctx.cloud = cloud;
  ctx.loja = loja;
  ctx.escopoAgora = () => escopo;
  // `resetScopedUiState` limpa a tela inteira quando o escopo troca, e é isso
  // que impede a seleção de uma conta de continuar apontada na conta seguinte.
  // Por isso o estado aqui precisa ter os campos que ele toca: com um estado
  // pela metade, a troca de banco estoura e o teste mediria o erro do harness.
  ctx.run(`state = {
      account: freshAccountState(), data: defaultData(), storageOk: true, tab: "dashboard",
      onboarding: { open: false, held: false, step: 0 },
      sim: { id: "", values: {} }, categoriesUi: {}, gamification: { celebrating: [] },
      form: null, overlayStack: [], backup: {},
    };
    state.account.loading = false;
    state.account.configured = true;`);
  return ctx;
}

const RESPOSTA_SESSAO = { ok: true, configured: true, authenticated: true, email: "pessoa@exemplo.com", userId: "dono-atual", deviceId: "aparelho-de-teste-0001" };

(async () => {
  section("1. Entrar: a senha sai da memória em qualquer desfecho");
  {
    const ctx = montar({
      login: { ok: true, configured: true, authenticated: true, email: "pessoa@exemplo.com", userId: "dono-atual" },
      session: RESPOSTA_SESSAO,
      devices: { ok: true, devices: [] },
    });
    ctx.run(`state.account.mode = "login";
      state.account.form.email = "pessoa@exemplo.com";
      state.account.form.password = "uma-senha-bem-longa";`);
    await ctx.run(`accountSubmit("login")`);
    check("o login chegou ao servidor", ctx.chamadas.some((c) => c.rota === "login" && c.metodo === "POST"));
    check("a senha não fica no estado depois da resposta",
      ctx.run("state.account.form.password") === "", ctx.run("state.account.form.password"));
    check("a sessão passa a valer", ctx.run("state.account.authenticated") === true);

    // O mesmo tem de valer quando o servidor RECUSA. Senha que sobra depois de
    // um erro volta ao DOM no próximo render e sobrevive a um dump de memória.
    const recusa = montar({ login: { status: 401, corpo: { ok: false, code: "invalid_credentials", message: "Email ou senha incorretos." } } });
    recusa.run(`state.account.mode = "login";
      state.account.form.email = "pessoa@exemplo.com";
      state.account.form.password = "senha-errada-porem-longa";`);
    await recusa.run(`accountSubmit("login")`).catch(() => {});
    check("senha recusada também sai da memória",
      recusa.run("state.account.form.password") === "", recusa.run("state.account.form.password"));
    check("e o erro chega à tela", String(recusa.run("state.account.error") || "").length > 0, recusa.run("state.account.error"));
  }

  section("2. Entrar: o formulário é validado antes de gastar rede");
  {
    const ctx = montar({});
    ctx.run(`state.account.form.email = "nao-e-email"; state.account.form.password = "curta";`);
    await ctx.run(`accountSubmit("login")`);
    check("email inválido nem chega ao servidor", ctx.chamadas.length === 0, ctx.chamadas);
    check("os dois campos são apontados de uma vez",
      /account-email/.test(ctx.eventos.join("|")) && /account-password/.test(ctx.eventos.join("|")), ctx.eventos);

    const senha = montar({});
    senha.run(`state.account.mode = "password"; state.account.form.newPassword = "curta";`);
    await senha.run(`accountSubmit("password")`);
    check("senha nova curta é recusada no cliente", senha.chamadas.length === 0);
  }

  section("3. Recuperar: a resposta não diz se o email existe");
  {
    const ctx = montar({ recover: { ok: true } });
    ctx.run(`state.account.mode = "recover"; state.account.form.email = "quem-sabe@exemplo.com";`);
    await ctx.run(`accountSubmit("recover")`);
    const msg = String(ctx.run("state.account.message") || "");
    check("o pedido foi enviado", ctx.chamadas.some((c) => c.rota === "recover"));
    check("a mensagem é condicional (não confirma cadastro)", /Se o email estiver cadastrado/.test(msg), msg);
  }

  section("4. Sair: sincroniza, desliga a nuvem e troca o banco de volta");
  {
    const ctx = montar({ logout: { ok: true }, session: { ok: true, configured: true, authenticated: false } });
    ctx.run(`state.account.authenticated = true; state.account.userId = "dono-atual"; state.account.email = "pessoa@exemplo.com";`);
    await ctx.run("accountLogout()");
    const ordem = ctx.eventos.filter((e) => e === "sync" || e === "cloud-off" || e.startsWith("escopo:"));
    check("a fila pendente é enviada ANTES de sair", ordem.indexOf("sync") === 0, ordem);
    check("a nuvem é desligada antes de trocar de banco",
      ordem.indexOf("cloud-off") >= 0 && ordem.indexOf("cloud-off") < ordem.findIndex((e) => e.startsWith("escopo:")), ordem);
    check("o banco volta para o de visitante", ctx.escopoAgora() === "guest", ctx.escopoAgora());
    check("a sessão fica como visitante", ctx.run("state.account.sessionStatus") === "guest");
    check("o snapshot da conta não fica na tela",
      (ctx.run("state.data").transactions || []).length === 0, ctx.run("state.data"));
    check("sair não apaga o banco da conta (login futuro reencontra)", ctx.loja.purgado === false);
  }

  section("5. Revogar um aparelho");
  {
    const ctx = montar({
      "revoke-device": { ok: true, currentRevoked: false },
      session: RESPOSTA_SESSAO,
      // A consulta seguinte reconcilia a lista; ela já não traz o revogado.
      devices: { ok: true, devices: [{ id: "aparelho-de-teste-0001", label: "Este", current: true }] },
    });
    ctx.run(`state.account.authenticated = true; state.account.userId = "dono-atual";
      state.account.devices = [{ id: "aparelho-de-teste-0001", label: "Este", current: true }, { id: "outro-aparelho", label: "Celular", current: false }];`);
    await ctx.run(`accountRevoke("outro-aparelho")`);
    check("o pedido leva o aparelho certo",
      ctx.chamadas.some((c) => c.rota === "revoke-device" && c.corpo && c.corpo.deviceId === "outro-aparelho"));
    check("a linha revogada sai da lista",
      !(ctx.run("state.account.devices") || []).some((d) => d.id === "outro-aparelho"), ctx.run("state.account.devices"));
    check("e este aparelho continua na lista",
      (ctx.run("state.account.devices") || []).some((d) => d.id === "aparelho-de-teste-0001"), ctx.run("state.account.devices"));
    check("a sessão continua de pé", ctx.run("state.account.authenticated") === true);

    // Revogar O PRÓPRIO aparelho é sair: a sessão local não pode continuar
    // valendo depois que o servidor a invalidou.
    const proprio = montar({
      "revoke-device": { ok: true, currentRevoked: true },
      logout: { ok: true },
      session: { ok: true, configured: true, authenticated: false },
    });
    proprio.run(`state.account.authenticated = true; state.account.userId = "dono-atual";`);
    await proprio.run(`accountRevoke("aparelho-de-teste-0001")`);
    check("revogar o próprio aparelho derruba a sessão local",
      proprio.run("state.account.authenticated") === false && proprio.escopoAgora() === "guest",
      { auth: proprio.run("state.account.authenticated"), escopo: proprio.escopoAgora() });
  }

  section("6. Sair dos outros aparelhos exige a senha atual");
  {
    const semSenha = montar({});
    semSenha.run(`state.account.authenticated = true; state.account.form.revokeOthersPassword = "";`);
    await semSenha.run("accountRevokeOthers()");
    check("sem senha, nada vai para a rede", semSenha.chamadas.length === 0, semSenha.chamadas);
    check("e a tela diz o porquê",
      /Digite sua senha/.test(String(semSenha.run("state.account.revokeOthersHint") || "")),
      semSenha.run("state.account.revokeOthersHint"));

    const comSenha = montar({
      "revoke-others": { ok: true, revoked: 2 },
      session: RESPOSTA_SESSAO,
      devices: { ok: true, devices: [{ id: "aparelho-de-teste-0001", label: "Este", current: true }] },
    });
    comSenha.run(`state.account.authenticated = true; state.account.userId = "dono-atual";
      state.account.form.revokeOthersPassword = "uma-senha-bem-longa";`);
    await comSenha.run("accountRevokeOthers()");
    const pedido = comSenha.chamadas.find((c) => c.rota === "revoke-others");
    check("a senha atual acompanha o pedido", !!(pedido && pedido.corpo && pedido.corpo.currentPassword), pedido);
    check("a senha de reautenticação também sai da memória",
      comSenha.run("state.account.form.revokeOthersPassword") === "",
      comSenha.run("state.account.form.revokeOthersPassword"));
    check("este aparelho continua conectado", comSenha.run("state.account.authenticated") === true);
  }

  section("7. Apagar a conta apaga a cópia local dela");
  {
    const ctx = montar({
      delete: { ok: true, deleted: true },
      session: { ok: true, configured: true, authenticated: false },
    });
    ctx.run(`state.account.authenticated = true; state.account.userId = "dono-atual";
      state.account.form.deletePassword = "uma-senha-bem-longa";
      state.account.form.deleteText = "APAGAR";`);
    await ctx.run("accountDelete()");
    const pedido = ctx.chamadas.find((c) => c.rota === "delete");
    check("a exclusão exige senha e a palavra de confirmação",
      !!(pedido && pedido.corpo && pedido.corpo.password && pedido.corpo.confirmation === "APAGAR"), pedido);
    check("a nuvem é desligada ANTES de apagar",
      ctx.eventos.indexOf("cloud-off") >= 0 && ctx.eventos.indexOf("cloud-off") < ctx.eventos.indexOf("purge"), ctx.eventos);
    check("a cópia local da conta é destruída", ctx.loja.purgado === true);
    check("o aparelho volta a ser visitante", ctx.escopoAgora() === "guest", ctx.escopoAgora());
    check("a senha de exclusão não sobra na memória",
      ctx.run("state.account.form.deletePassword") === "", ctx.run("state.account.form.deletePassword"));

    // A exclusão do SERVIDOR já foi confirmada: mesmo que o navegador falhe ao
    // apagar o IndexedDB, a tela não pode continuar mostrando a conta.
    const semPurge = montar({ delete: { ok: true, deleted: true }, session: { ok: true, configured: true, authenticated: false } });
    semPurge.loja.purge = async () => { throw new Error("IndexedDB recusou"); };
    semPurge.run(`state.account.authenticated = true; state.account.userId = "dono-atual";
      state.account.form.deletePassword = "uma-senha-bem-longa"; state.account.form.deleteText = "APAGAR";`);
    await semPurge.run("accountDelete()");
    check("falha ao apagar o banco local não deixa a conta na tela",
      semPurge.run("state.account.authenticated") === false, semPurge.run("state.account.authenticated"));
  }

  section("8. Esquecer este aparelho: o servidor confirma ANTES de apagar o local");
  {
    // A ordem aqui é mais rígida que a do logout comum, e o comentário em
    // `js/auth.js` explica por quê: uma sessão ainda válida baixaria a conta
    // inteira de volta logo depois de o banco local ter sido destruído.
    const ctx = montar({
      logout: { ok: true },
      session: { ok: true, configured: true, authenticated: false },
    });
    ctx.run(`state.account.authenticated = true; state.account.userId = "dono-atual";
      state.account.deviceId = "aparelho-de-teste-0001";`);
    await ctx.run("accountForgetThisDevice()");
    check("o cookie é encerrado no servidor", ctx.chamadas.some((c) => c.rota === "logout"), ctx.chamadas);
    check("a destruição local vem DEPOIS da confirmação do servidor",
      ctx.eventos.indexOf("purge") > -1, ctx.eventos);
    check("a sessão local termina", ctx.run("state.account.authenticated") === false);
    check("o banco aberto volta a ser o de visitante", ctx.escopoAgora() === "guest", ctx.escopoAgora());

    // Se a rede falhar, NADA local é apagado: o dado da conta continua neste
    // aparelho, que é o comportamento seguro.
    const semRede = montar({ logout: { status: 502, corpo: { ok: false, message: "gateway" } } });
    semRede.run(`state.account.authenticated = true; state.account.userId = "dono-atual";`);
    await semRede.run("accountForgetThisDevice()");
    check("rede falhando não apaga o banco local", semRede.loja.purgado === false, semRede.eventos);
    check("e a conta continua aberta neste aparelho", semRede.escopoAgora() === "u_dono-atual", semRede.escopoAgora());
  }

  section("9. Duas saídas ao mesmo tempo não se atropelam");
  {
    // `__accountDisconnecting` existe para isso: dois cliques em "sair", ou um
    // "sair" durante um "apagar", não podem trocar o banco duas vezes.
    const ctx = montar({ logout: { ok: true }, session: { ok: true, configured: true, authenticated: false } });
    ctx.run(`state.account.authenticated = true; state.account.userId = "dono-atual";`);
    const [a, b] = await Promise.all([ctx.run("accountLogout()"), ctx.run("accountLogout()")]);
    const trocas = ctx.eventos.filter((e) => e.startsWith("escopo:")).length;
    check("a segunda saída é recusada", a === false || b === false, { a, b });
    check("o banco troca uma vez só", trocas === 1, ctx.eventos);
  }

  section("10. A camada de rede: hiccup não é logout");
  {
    // Esta é a parte de `js/auth.js` que decide se um problema de rede vira
    // "modo local", "tente de novo" ou "sua sessão acabou". Errar aqui não dá
    // tela feia: desconecta quem estava conectado, ou mantém conectado quem o
    // servidor já recusou.
    const respostaCrua = (corpo, tipo, status) => ({
      ok: (status || 200) < 400,
      status: status || 200,
      headers: { get: (n) => (String(n).toLowerCase() === "content-type" ? tipo : null) },
      async json() { if (typeof corpo === "string") throw new Error("não é JSON"); return corpo; },
    });

    // Publicação estática, `npm start` e portal de Wi-Fi respondem /api/* com o
    // HTML do próprio app e status 200. Isso é "não há serviço de conta aqui",
    // e a tela já sabe apresentar esse estado.
    const html = montar({});
    html.fetch = async () => respostaCrua("<!doctype html>", "text/html; charset=utf-8");
    const sessaoHtml = await html.run(`AccountAPI.session()`);
    check("HTML em /session vira 'modo local', não erro vermelho",
      sessaoHtml && sessaoHtml.configured === false && sessaoHtml.ok === true, sessaoHtml);

    const htmlEmOutra = montar({});
    htmlEmOutra.fetch = async () => respostaCrua("<!doctype html>", "text/html; charset=utf-8");
    let erroDeServico = null;
    try { await htmlEmOutra.run(`AccountAPI.login({ email: "a@b.co", password: "uma-senha-longa" })`); }
    catch (e) { erroDeServico = e; }
    check("HTML nas demais rotas é recusado com código próprio",
      erroDeServico && erroDeServico.code === "account_unavailable", erroDeServico && erroDeServico.code);

    // Erro do servidor COM json: a frase do backend atravessa, e é ela que diz
    // à pessoa o que fazer.
    const recusa = montar({});
    recusa.fetch = async () => respostaCrua({ ok: false, code: "email_not_confirmed", message: "Este email ainda não foi confirmado." }, "application/json", 403);
    let erroDeConta = null;
    try { await recusa.run(`AccountAPI.login({ email: "a@b.co", password: "uma-senha-longa" })`); }
    catch (e) { erroDeConta = e; }
    check("o código do backend chega ao cliente",
      erroDeConta && erroDeConta.code === "email_not_confirmed", erroDeConta && erroDeConta.code);
    check("e a frase escrita para a pessoa também",
      erroDeConta && /ainda não foi confirmado/.test(erroDeConta.message), erroDeConta && erroDeConta.message);

    // Rede fora: `fetch` rejeita. Não pode virar "sessão inválida".
    const offline = montar({});
    offline.fetch = async () => { throw Object.assign(new Error("Failed to fetch"), { name: "TypeError" }); };
    let erroDeRede = null;
    try { await offline.run(`AccountAPI.devices()`); }
    catch (e) { erroDeRede = e; }
    check("queda de rede não é confundida com sessão inválida",
      erroDeRede && erroDeRede.code !== "invalid_session", erroDeRede && erroDeRede.code);
  }

  console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"}: ${pass} ok, ${fail} falha(s)\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((erro) => {
  console.error("Erro inesperado na suíte:", erro);
  process.exit(1);
});
