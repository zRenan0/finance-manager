// service-worker.js; cache do app shell para uso offline
//
// Estratégias por tipo de requisição:
//   • Tudo sob `/api/` nunca toca no cache.
//   • Navegação (HTML)  → rede primeiro COM tempo limite, cache como rede reserva.
//   • Estáticos do app  → stale-while-revalidate (responde do cache na hora,
//                         atualiza em segundo plano dentro de waitUntil).
//
// Não há mais estratégia para fonte externa: o app não busca fonte de terceiro.
// O caminho continua no código, desativado por `FONT_HOSTS` vazio, para que um
// eventual retorno seja uma decisão explícita e não um efeito colateral.
"use strict";

// v51: o `js/landing-boot.js` passou a reencaminhar para o aplicativo os links
// de confirmacao de conta que apontam para a raiz (ver o comentario la, e
// tests/test-account-callback.js). Ele e um estatico servido por
// stale-while-revalidate, entao, sem promover a versao, quem ja tinha a landing
// em cache receberia o arquivo ANTIGO na primeira visita depois da publicacao,
// e so o novo na seguinte. Essa primeira visita e exatamente a que importa: e a
// do clique no link do email. Promover a versao troca o balde inteiro de uma
// vez, e a rede de seguranca vale desde o primeiro acesso.
// v53: os módulos publicados agora levam o SHA-256 no nome. A troca de
// controller pode identificar o pacote novo antes de pedir a recarga da aba.
// v54: a primeira tomada de controle deixou de recarregar o onboarding. O
// pacote do aplicativo mudou e precisa substituir o app.generated.js em cache.
// v55: conta, sincronização automática e extrato de acessos mudaram. A promoção
// garante que instalações existentes recebam o cliente e os estilos juntos.
// v56: o portão da subida deixou de ficar preso, e é o aparelho JÁ INSTALADO
// que está travado nesse estado. Sem promover a versão, ele continuaria
// servindo o pacote antigo do cache e nunca voltaria a enviar. Vêm no mesmo
// balde o painel de apagar conta e os consertos de tela do celular: atalho de
// pular preso no alto, data da meta quebrada no meio, caixa de marcar
// deformada, valor solto na lista, ações de avisos sem estilo e a grade do
// cartão de exclusão que o Safari ignorava.
// v57: o importador aprendeu a ler fatura de cartão (o "Pagamento recebido"
// que entrava como receita), o extrato passou a sair em PDF e agora faturas e
// extratos em PDF com texto também podem entrar. A leitura depende dos arquivos
// locais do PDF.js, incluídos no mesmo balde de cache.
// v59: a instalação só assume o controle depois de guardar o pacote inteiro.
// Uma falha em CSS, módulo, ícone ou página mantém a versão anterior ativa.
// v60: falhas fechadas do pacote e da leitura chegam ao diagnóstico local sem
// levar URL, requisição ou resposta na mensagem enviada à página.
// v61: publica o inventário de dados e a política revisada do M18.
// v63: a landing ganhou a seção dos três pilares, e com ela regras novas em
// css/landing.css. A folha é estático servido por stale-while-revalidate, o
// mesmo caso do v51: sem promover a versão, quem já tinha a landing em cache
// receberia o HTML novo (navegação vai à rede primeiro) com a folha ANTIGA, e
// veria a seção sem estilo nenhum. Conferido no navegador antes de promover.
// v64: o assistente ganhou o passo de gastos fixos. Muda o pacote do
// aplicativo (app.generated.js) e a folha do assistente; sem promover, a
// instalação existente continuaria servindo os dois do cache antigo.
// v65: o modo demonstração entrou no pacote do aplicativo e nos estilos.
// Sem promover, a instalação existente serviria o app.generated.js antigo, sem
// a faixa e sem as guardas que impedem a demonstração de gravar.
// v66: o aviso de dados somente locais entrou no pacote e nos estilos da
// tela inicial. Sem promover, a instalação existente continuaria sem ele.
const VERSION = "v66";
const BUILD_ID = VERSION;
const CACHE_NAME = "financas-cache-" + VERSION;
// A PÁGINA COMERCIAL TEM CACHE PRÓPRIO.
//
// Desde que a landing passou a ser a entrada do domínio ("/" a serve; ver
// vercel.json), as duas páginas convivem no mesmo escopo do service worker.
// Guardar navegação de marketing no mesmo balde do aplicativo é o começo do
// pior defeito possível deste arquivo: o app abrir offline mostrando o
// folheto, sem que a rede possa corrigir, porque quem responde é o cache.
//
// Separar em dois nomes torna a garantia ESTRUTURAL em vez de disciplinada:
// `CACHE_NAME` não recebe navegação que não seja o shell, ponto. Ver
// `handleNavigate` e `isAppShell`, e o teste em tests/test-landing.js.
const PAGE_CACHE = "financas-pages-" + VERSION;
const FONT_CACHE = "financas-fonts-" + VERSION;
const NAV_TIMEOUT_MS = 3500;

const APP_SHELL = [
  // "./" saiu daqui de propósito: a raiz do domínio agora entrega a página
  // comercial, e o shell do aplicativo mora em "index.html".
  "index.html",
  "manifest.webmanifest",
  "css/style.css",
  "css/dynamic.css",
  "css/base.css",
  "css/layout.css",
  "css/components.css",
  "css/utilities.css",
  "css/screens/dashboard.css",
  "css/screens/health.css",
  "css/screens/wealth.css",
  "css/screens/planning.css",
  "css/screens/investments.css",
  "css/screens/intelligence.css",
  "css/screens/notifications-onboarding.css",
  "css/screens/personalization.css",
  "css/screens/categories.css",
  "css/screens/movements.css",
  "css/screens/transparency-assistant-sources.css",
  "css/screens/legal.css",
  "css/screens/account.css",
  "js/boot.js",
  "js/modules/bootstrap.js",
  "js/modules/dialog-controller.js",
  "js/modules/form-errors.js",
  "js/modules/dynamic-styles.js",
  "js/modules/test-bridge.js",
  "js/modules/app.generated.js",
  "vendor/pdfjs/pdf.min.mjs",
  "vendor/pdfjs/pdf.worker.min.mjs",
  "vendor/pdfjs/LICENSE",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

// Os estáticos da página comercial entram no cache normal, cada um sob a
// própria URL: eles são arquivos como quaisquer outros e não disputam chave
// com nada do aplicativo. Não são críticos: se falharem, o aplicativo
// continua instalando e a landing volta na primeira visita com rede.
const LANDING_ASSETS = [
  "css/landing.css",
  "js/landing-boot.js",
  "js/landing.js",
];

// A landing em si é NAVEGAÇÃO, então vai para `PAGE_CACHE`. As duas entradas
// existem porque as duas URLs são válidas: "/" é a canônica, "landing.html" é
// o arquivo e continua respondendo para quem tiver o link antigo.
const LANDING_PAGES = ["./", "landing.html"];

// A promoção é atômica para tudo que prometemos abrir offline. Não basta o
// bootstrap existir: um CSS, um módulo carregado dinamicamente ou a landing
// ausente ainda produziria uma versão ativa pela metade. As listas continuam
// separadas porque cada grupo vai para o próprio cache.
const REQUIRED_PRECACHE = [...APP_SHELL, ...LANDING_ASSETS, ...LANDING_PAGES];

// O cache de fontes de terceiros deixou de existir junto com a requisição a
// `fonts.googleapis.com`. As fontes agora são locais (ver fonts/README.md) e
// entram no cache do shell como qualquer outro arquivo do próprio site.
const FONT_HOSTS = [];

/* ------------------------------------------------------------------ *
 * Instalação
 * Buscamos um a um para identificar todas as falhas e limpar o pacote parcial.
 * A nova versão só assume quando cada item declarado acima foi armazenado.
 * ------------------------------------------------------------------ */
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const paginas = await caches.open(PAGE_CACHE);
      const falhas = [];

      const guardar = async (destino, path) => {
        try {
          // cache: "reload" evita reaproveitar uma versão velha do cache HTTP
          // do navegador na hora de popular o cache do service worker.
          const res = await fetch(new Request(path, { cache: "reload" }));
          if (isCacheable(res)) await destino.put(path, res);
          else falhas.push(path);
        } catch (error) { falhas.push(path); }
      };

      await Promise.all([
        ...APP_SHELL.map((path) => guardar(cache, path)),
        ...LANDING_ASSETS.map((path) => guardar(cache, path)),
        ...LANDING_PAGES.map((path) => guardar(paginas, path)),
      ]);

      const obrigatoriosQuebrados = falhas.filter((p) => REQUIRED_PRECACHE.indexOf(p) !== -1);
      if (obrigatoriosQuebrados.length) {
        // Uma instalação reprovada não deixa um cache com nome atual e
        // conteúdo parcial para a próxima tentativa encontrar.
        await Promise.all([caches.delete(CACHE_NAME), caches.delete(PAGE_CACHE)]);
        await notifyClients("sw_install_failed");
        throw new Error(`Pacote offline não armazenado: ${obrigatoriosQuebrados.join(", ")}`);
      }

      await self.skipWaiting();
    })()
  );
});

/* ------------------------------------------------------------------ *
 * Ativação: remove versões antigas e liga o navigation preload
 * ------------------------------------------------------------------ */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const manter = [CACHE_NAME, PAGE_CACHE, FONT_CACHE];
      await Promise.all(
        keys
          .filter((k) => k.startsWith("financas-") && manter.indexOf(k) === -1)
          .map((k) => caches.delete(k))
      );
      if (self.registration.navigationPreload) {
        try { await self.registration.navigationPreload.enable(); } catch (_) {}
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (!event.data) return;
  if (event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (event.data.type === "GET_BUILD") {
    const resposta = { type: "COFRE_BUILD", build: BUILD_ID };
    if (event.ports && event.ports[0]) event.ports[0].postMessage(resposta);
    else if (event.source && typeof event.source.postMessage === "function") event.source.postMessage(resposta);
  }
});

/* ------------------------------------------------------------------ *
 * Auxiliares
 * ------------------------------------------------------------------ */

// Só guardamos respostas próprias e íntegras. Respostas opacas (no-cors) têm
// status 0 e podem ser um erro de rede disfarçado: se cacheadas, o app
// passaria a servir um arquivo vazio para sempre.
function isCacheable(res) {
  return !!res && res.status === 200 && (res.type === "basic" || res.type === "default");
}

function isFontRequest(url) {
  return FONT_HOSTS.indexOf(url.hostname) !== -1;
}

async function notifyClients(code) {
  if (code !== "sw_install_failed" && code !== "sw_fetch_failed") return;
  if (!self.clients || typeof self.clients.matchAll !== "function") return;
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clients.forEach((client) => client.postMessage({
    type: "COFRE_OBSERVATION",
    area: "service_worker",
    code,
  }));
}

// Corrida entre a rede e um relógio. Sem isto, uma conexão que aceita a
// conexão mas nunca responde (portal cativo de wi-fi, 3G instável) deixa o
// app numa tela em branco em vez de cair para o cache.
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(request).then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// O SHELL DO APLICATIVO É APENAS O `index.html`.
//
// Esta distinção passou a existir quando a página comercial entrou no mesmo
// escopo. Antes, TODA navegação era guardada sob a chave "index.html":
// bastava alguém abrir a landing uma vez para o aplicativo offline virar a
// página de marketing, e o próprio service worker impediria a rede de
// corrigir isso, porque responderia do cache.
//
// A RAIZ SAIU DA DEFINIÇÃO. Enquanto "/" servia o aplicativo, tratá-la como
// shell era correto. Agora "/" entrega a página comercial (vercel.json), e
// mantê-la aqui reintroduziria exatamente o defeito descrito acima, só que
// pela porta da frente, que é a mais visitada de todas.
//
// Hoje: só "index.html" é shell, e só o shell escreve em `CACHE_NAME`. Todas
// as outras páginas do site vão para `PAGE_CACHE`, sob a própria URL. Elas
// ganham uso offline igual e não têm como se misturar.
function isAppShell(request) {
  let url;
  try { url = new URL(request.url); } catch (_) { return false; }
  if (url.origin !== self.location.origin) return false;
  return url.pathname.endsWith("/index.html");
}

// CHAVE DE PÁGINA SEM A QUERY.
//
// A landing recebe endereço de campanha: "/?utm_source=...", "/?ref=...".
// Guardar cada variante sob a própria chave encheria o cache de cópias
// idênticas do mesmo HTML e faria a consulta offline falhar justamente para
// quem chegou por um link de divulgação. O documento é o mesmo; a chave
// também deve ser.
function chaveDePagina(request) {
  try {
    const url = new URL(request.url);
    return url.origin + url.pathname;
  } catch (_) { return request.url; }
}

async function handleNavigate(event) {
  const shell = isAppShell(event.request);
  const cache = await caches.open(shell ? CACHE_NAME : PAGE_CACHE);
  const chave = shell ? "index.html" : chaveDePagina(event.request);
  try {
    const preloaded = event.preloadResponse ? await event.preloadResponse : null;
    const res = preloaded || (await fetchWithTimeout(event.request, NAV_TIMEOUT_MS));
    // A gravação faz parte da resposta. Sem `await`, o navegador podia encerrar
    // o worker depois de entregar o HTML e antes de concluir o cache.
    if (isCacheable(res)) await cache.put(chave, res.clone());
    return res;
  } catch (_) {
    const guardada = await cache.match(chave);
    if (guardada) return guardada;
    // Fora do shell, a raiz é a melhor reserva possível para um caminho que
    // nunca foi visitado: é a página que apresenta o produto e leva ao
    // aplicativo.
    if (!shell) {
      const raiz = await cache.match("./");
      if (raiz) return raiz;
    }
    await notifyClients("sw_fetch_failed");
    return new Response(
      "<!doctype html><meta charset='utf-8'><p>Página indisponível offline. Abra novamente com conexão.</p>",
      { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 }
    );
  }
}

async function handleFont(request) {
  const cache = await caches.open(FONT_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    // Fontes vêm de outra origem: aqui a resposta opaca é esperada e útil.
    if (res && (res.ok || res.type === "opaque")) cache.put(request, res.clone());
    return res;
  } catch (_) {
    return cached || Response.error();
  }
}

/**
 * Stale-while-revalidate.
 * Diferença central em relação à versão anterior: a revalidação entra em
 * `event.waitUntil`. Antes, a gravação no cache era uma promise solta; se o
 * service worker fosse encerrado logo após responder (o que o Chrome faz
 * agressivamente), a escrita era interrompida no meio e o cache podia ficar
 * com um recurso truncado.
 */
async function handleAsset(event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(event.request);

  const network = fetch(event.request)
    .then((res) => {
      if (isCacheable(res)) return cache.put(event.request, res.clone()).then(() => res);
      return res;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  const res = await network;
  if (res) return res;
  await notifyClients("sw_fetch_failed");
  return Response.error();
}

/* ------------------------------------------------------------------ *
 * Roteamento
 * ------------------------------------------------------------------ */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // Chamadas de IA nunca são cacheadas: respostas antigas induziriam o
  // usuário a decisões financeiras com base em dados vencidos. As três
  // funções do backend moram sob `/api/`; não há mais endereço com nome de
  // plataforma para tratar à parte.
  if (url.pathname.indexOf("/api/") === 0) return;
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  if (req.mode === "navigate") { event.respondWith(handleNavigate(event)); return; }
  if (isFontRequest(url)) { event.respondWith(handleFont(req)); return; }
  if (url.origin !== self.location.origin) return;

  event.respondWith(handleAsset(event));
});
