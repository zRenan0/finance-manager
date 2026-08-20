"use strict";

// run-landing.js; a página comercial dentro de um navegador de verdade.
//
// O que só o navegador prova:
//   • que o documento não é mais largo que a janela em nenhuma das larguras
//     de referência — e, principalmente, que isso vale COM A CONTENÇÃO
//     HORIZONTAL DESLIGADA. Medir com `overflow-x: clip` ligado responde
//     sempre que está tudo bem, porque a regra impede a barra de existir;
//     o que interessa é se algum elemento de layout passa da borda;
//   • que o texto das etapas e o recorte de tela nunca se sobrepõem no
//     celular, em qualquer posição de rolagem;
//   • que nenhum recurso volta 404 (o caso das fontes que não existiam);
//   • que o menu do celular abre, fecha, devolve o foco e não vaza;
//   • que a página continua utilizável sem JavaScript e com movimento
//     reduzido.
//
// Como rodar:  npm run test:landing
// As capturas saem em tests/browser/screenshots/.

const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..", "..");
const capturas = path.join(__dirname, "screenshots");

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

// O servidor repete a regra de entrada da publicação (vercel.json) e do
// `scripts/serve.js`: "/" entrega a página comercial, "/index.html" entrega o
// aplicativo. Sem isso, o teste mediria uma rota que não existe em produção.
//
// E, ao contrário do servidor de desenvolvimento, caminho desconhecido aqui
// devolve 404 de verdade. É esse detalhe que faz uma referência quebrada
// aparecer como falha em vez de virar HTML servido como se fosse fonte.
const server = http.createServer((request, response) => {
  const urlPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relative = urlPath === "/" ? "landing.html" : urlPath.replace(/^\/+/, "");
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type": mime[path.extname(file)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(file).pipe(response);
});

const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log(`  ✓ ${name}`); }
  catch (error) { results.push({ name, ok: false, error }); console.error(`  ✗ ${name}\n    ${error.message}`); }
}
function assert(condition, message) { if (!condition) throw new Error(message); }

const LARGURAS = [
  { w: 1920, h: 1080 },
  { w: 1440, h: 900 },
  { w: 1280, h: 860 },
  { w: 1024, h: 768 },
  { w: 768, h: 1024 },
  { w: 430, h: 932 },
  { w: 390, h: 844 },
  { w: 360, h: 800 },
];

// Seções fotografadas para a revisão visual. A conferência de layout é
// automática; a de gosto continua sendo humana, e para isso precisa de imagem.
const SECOES = [
  ["hero", ".lp-hero"],
  ["confianca", ".lp-strip"],
  ["caos", ".lp-caos"],
  ["historia", ".lp-story"],
  ["recursos", ".lp-bento"],
  ["wow", ".lp-wow"],
  ["simuladores", ".lp-sim"],
  ["planilha", ".lp-vs"],
  ["seguranca", ".lp-trust"],
  ["como-funciona", ".lp-steps"],
  ["precos", ".lp-price"],
  ["faq", ".lp-faq"],
  ["fechamento", ".lp-final"],
];

/**
 * Mede o documento com a contenção horizontal DESLIGADA e devolve quem
 * estende a área rolável. A caminhada de ancestrais para em <body>: um
 * `overflow` deliberado num contêiner interno (a maquete, a faixa clara) é
 * decisão de composição; no <html> e no <body> seria a rede de segurança
 * escondendo o defeito, que é justamente o que este teste precisa enxergar.
 */
async function medirLargura(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const anterior = { html: de.style.overflowX, body: document.body.style.overflowX };
    de.style.overflowX = "visible";
    document.body.style.overflowX = "visible";

    const largura = de.clientWidth;
    const nome = (el) => el.tagName.toLowerCase()
      + (typeof el.className === "string" && el.className
        ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "");
    const contido = (el) => {
      let pai = el.parentElement;
      while (pai && pai !== document.body && pai !== de) {
        if (getComputedStyle(pai).overflowX !== "visible") return true;
        pai = pai.parentElement;
      }
      return false;
    };

    const culpados = [];
    document.querySelectorAll("body *").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      if ((r.right > largura + 1 || r.left < -1) && !contido(el)) {
        culpados.push(`${nome(el)} [${Math.round(r.left)}..${Math.round(r.right)}]`);
      }
    });

    const medida = { clientWidth: largura, scrollWidth: de.scrollWidth, culpados };
    de.style.overflowX = anterior.html;
    document.body.style.overflowX = anterior.body;
    return medida;
  });
}

async function abrir(browser, viewport, opcoes = {}) {
  const context = await browser.newContext({
    viewport: { width: viewport.w, height: viewport.h },
    // O padrão do Chromium sem cabeça é `reduce`, e com ele metade do
    // comportamento da página nem chega a ser criada. Aqui a preferência é
    // explícita em cada cenário, para que os dois caminhos sejam medidos.
    reducedMotion: opcoes.reducedMotion || "no-preference",
    deviceScaleFactor: viewport.w <= 560 ? 2 : 1,
    isMobile: viewport.w <= 560,
    hasTouch: viewport.w <= 560,
    javaScriptEnabled: opcoes.javaScriptEnabled !== false,
  });
  const page = await context.newPage();
  const erros = [];
  const console_ = [];
  const falhasDeRede = [];
  page.on("pageerror", (e) => erros.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") console_.push(m.text()); });
  page.on("response", (res) => {
    if (res.status() >= 400) falhasDeRede.push(`${res.status()} ${res.url()}`);
  });
  page.on("requestfailed", (req) => falhasDeRede.push(`falhou ${req.url()}`));
  await page.goto(`${globalThis.baseUrl}`, { waitUntil: "load" });
  return { context, page, erros, console_, falhasDeRede };
}

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  globalThis.baseUrl = `http://127.0.0.1:${server.address().port}/`;
  fs.mkdirSync(capturas, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  /* ---------------------------------------------------------------- *
   * 1. ENTRADA DO DOMÍNIO
   * ---------------------------------------------------------------- */
  await test("a raiz do domínio entrega a página comercial e /index.html o aplicativo", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(globalThis.baseUrl, { waitUntil: "domcontentloaded" });
      assert(await page.locator("body.lp").count() === 1, "a raiz não entregou a landing");
      assert((await page.title()).includes("Cofre"), "título inesperado na raiz");
      assert(await page.locator("h1").innerText() !== "", "a raiz não tem manchete");

      await page.goto(`${globalThis.baseUrl}index.html`, { waitUntil: "domcontentloaded" });
      assert(await page.locator("#app").count() === 1, "/index.html não entregou o aplicativo");
      assert(await page.locator("body.lp").count() === 0, "/index.html entregou a landing");

      // O link antigo continua respondendo, para não quebrar o que já foi
      // compartilhado.
      await page.goto(`${globalThis.baseUrl}landing.html`, { waitUntil: "domcontentloaded" });
      assert(await page.locator("body.lp").count() === 1, "landing.html deixou de responder");
    } finally { await context.close(); }
  });

  /* ---------------------------------------------------------------- *
   * 1b. O LINK DE CONFIRMAÇÃO DE CONTA QUE CAIU NA RAIZ
   * ---------------------------------------------------------------- *
   * Os emails de cadastro e de recuperação apontavam o retorno para a raiz,
   * que hoje é a página comercial. O servidor já foi corrigido, mas os links
   * JÁ ENVIADOS continuam apontando para cá, e não há como reescrever email
   * que saiu. O `js/landing-boot.js` reencaminha esses links.
   *
   * A lógica é medida sem navegador em tests/test-account-callback.js. O que
   * só o navegador prova é a cadeia inteira: o script do `<head>` executa
   * antes da primeira pintura, o `location.replace` de fato navega, e quem
   * recebe é o aplicativo, com a query intacta.
   * ---------------------------------------------------------------- */
  await test("o link de confirmação que caiu na raiz é devolvido ao aplicativo", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      // O aplicativo limpa `code` e `auth_callback` da barra de endereço assim
      // que termina de processá-los (`bootstrapAccount` em js/auth.js). Por
      // isso a query é conferida na NAVEGAÇÃO, e não no endereço final: senão
      // o teste disputaria uma corrida com a própria limpeza.
      const visitadas = [];
      page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) visitadas.push(frame.url());
      });

      // O formato real de um link já enviado: `auth_callback` vem do
      // `redirect_to` antigo e `code` foi acrescentado pelo Supabase.
      await page.goto(`${globalThis.baseUrl}?auth_callback=signup&code=abc123def`, { waitUntil: "domcontentloaded" });
      await page.waitForURL(/\/index\.html/, { timeout: 8000 });

      const comQuery = visitadas.find((u) => /\/index\.html\?/.test(u));
      assert(!!comQuery, `nenhuma navegação para /index.html com query: ${visitadas.join(" | ")}`);
      const encaminhada = new URL(comQuery);
      assert(encaminhada.pathname === "/index.html", `caminho ${encaminhada.pathname}`);
      assert(encaminhada.searchParams.get("code") === "abc123def", `código perdido: ${encaminhada.search}`);
      assert(encaminhada.searchParams.get("auth_callback") === "signup", `propósito perdido: ${encaminhada.search}`);

      assert(await page.locator("#app").count() === 1, "o reencaminhamento não chegou ao aplicativo");
      assert(await page.locator("body.lp").count() === 0, "a página comercial continuou na tela");

      // `replace` e não `assign`: a landing não pode ter ficado no histórico.
      // Se tivesse, o botão Voltar devolveria a pessoa para cá, e o
      // reencaminhamento a jogaria de novo para o aplicativo: um laço do qual
      // ela não sairia sem fechar a aba.
      //
      // O que se mede é para ONDE o Voltar leva, e não o tamanho do histórico:
      // o aplicativo empilha estado próprio ao iniciar (`NavHistory`), então
      // `history.length` responde sobre o app, não sobre a landing.
      for (let i = 1; i <= 3; i += 1) {
        await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => null);
        await page.waitForTimeout(150);
        assert(await page.locator("body.lp").count() === 0,
          `o botão Voltar devolveu a página comercial no passo ${i}`);
      }

      // O outro lado: visita normal não pode ser arrastada para o aplicativo.
      await page.goto(`${globalThis.baseUrl}?utm_source=instagram&ref_code=promo10`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(400);
      assert(await page.locator("body.lp").count() === 1, "uma visita de campanha saiu da página comercial");
      assert(new URL(page.url()).pathname === "/", `campanha terminou em ${new URL(page.url()).pathname}`);
    } finally { await context.close(); }
  });

  /* ---------------------------------------------------------------- *
   * 2. LARGURA, ERROS E RECURSOS EM CADA FAIXA
   * ---------------------------------------------------------------- */
  for (const viewport of LARGURAS) {
    await test(`${viewport.w}px: sem estouro horizontal, sem erro e sem recurso ausente`, async () => {
      const sessao = await abrir(browser, viewport);
      try {
        const { page, erros, console_, falhasDeRede } = sessao;
        await page.waitForTimeout(400);

        const medida = await medirLargura(page);
        assert(medida.culpados.length === 0,
          `${viewport.w}px: elemento(s) além da borda: ${medida.culpados.join(" | ")}`);
        assert(medida.scrollWidth <= medida.clientWidth,
          `${viewport.w}px: scrollWidth ${medida.scrollWidth} > clientWidth ${medida.clientWidth}`);

        assert(erros.length === 0, `${viewport.w}px: erro de JavaScript: ${erros.join("; ")}`);
        assert(console_.length === 0, `${viewport.w}px: erro no console: ${console_.join("; ")}`);
        assert(falhasDeRede.length === 0, `${viewport.w}px: recurso ausente: ${falhasDeRede.join("; ")}`);

        // Rolagem completa: o estouro pode nascer de um estado que só existe
        // depois que a página anda (doca de CTA, painel fixo, convergência).
        const altura = await page.evaluate(() => document.documentElement.scrollHeight);
        for (let i = 1; i <= 12; i += 1) {
          await page.evaluate((y) => window.scrollTo(0, y), Math.round((altura - viewport.h) * i / 12));
          await page.waitForTimeout(90);
          const durante = await medirLargura(page);
          assert(durante.culpados.length === 0,
            `${viewport.w}px, rolagem ${i}/12: ${durante.culpados.join(" | ")}`);
        }
      } finally { await sessao.context.close(); }
    });
  }

  /* ---------------------------------------------------------------- *
   * 3. O TEXTO DA HISTÓRIA NUNCA FICA ATRÁS DO MOCKUP
   * ---------------------------------------------------------------- */
  for (const viewport of [{ w: 430, h: 932 }, { w: 390, h: 844 }, { w: 360, h: 800 }]) {
    await test(`${viewport.w}px: texto e recorte de tela da história não se sobrepõem`, async () => {
      const sessao = await abrir(browser, viewport);
      try {
        const { page } = sessao;
        await page.waitForTimeout(500);

        // No estreito o painel fixo do desktop simplesmente não existe.
        const palcoVisivel = await page.evaluate(() => {
          const palco = document.querySelector(".lp-story__stage");
          return !!palco && getComputedStyle(palco).display !== "none";
        });
        assert(!palcoVisivel, `${viewport.w}px: o painel fixo do desktop continua em cena no celular`);

        const geometria = await page.evaluate(() => {
          return [...document.querySelectorAll(".lp-step")].map((etapa) => {
            const texto = etapa.querySelector(":scope > p").getBoundingClientRect();
            const titulo = etapa.querySelector(".lp-step__title").getBoundingClientRect();
            const arte = etapa.querySelector(".lp-step__art").getBoundingClientRect();
            return {
              n: etapa.dataset.step,
              arteVisivel: getComputedStyle(etapa.querySelector(".lp-step__art")).display !== "none",
              folgaTexto: arte.top - texto.bottom,
              folgaTitulo: arte.top - titulo.bottom,
              largura: arte.width,
            };
          });
        });

        assert(geometria.length === 4, "as quatro etapas precisam existir");
        geometria.forEach((etapa) => {
          assert(etapa.arteVisivel, `etapa ${etapa.n}: o recorte de tela não aparece no celular`);
          assert(etapa.folgaTexto > 0, `etapa ${etapa.n}: o recorte cobre o parágrafo (folga ${Math.round(etapa.folgaTexto)}px)`);
          assert(etapa.folgaTitulo > 0, `etapa ${etapa.n}: o recorte cobre o título`);
          assert(etapa.largura > viewport.w * 0.7, `etapa ${etapa.n}: o recorte ficou estreito demais`);
        });

        // E o mesmo, agora rolando: nenhuma posição pode produzir cruzamento
        // entre um texto de etapa e um recorte de outra.
        const cruzamentos = await page.evaluate(async () => {
          const espera = (ms) => new Promise((r) => setTimeout(r, ms));
          const secao = document.querySelector(".lp-story");
          const topo = secao.getBoundingClientRect().top + window.scrollY;
          const alt = secao.getBoundingClientRect().height;
          const achados = [];
          for (let i = 0; i <= 12; i += 1) {
            window.scrollTo(0, topo - 100 + (alt * i) / 12);
            await espera(60);
            // SÓ A PROSA DA ETAPA, NÃO O TEXTO DE DENTRO DA ARTE.
            // `.lp-step p` também casava com as legendas do próprio recorte
            // (`.lp-panel__title`, `.lp-panel__big`, `.lp-panel__alert`), que são
            // filhas de `.lp-step__art`. Um parágrafo DENTRO da arte cruza a
            // caixa da arte por definição, e a medida acusava sobreposição onde
            // não existe defeito nenhum. O que precisa ficar livre é o texto que
            // a pessoa lê: o título e o parágrafo filhos diretos da etapa.
            const textos = [...document.querySelectorAll(".lp-step__title, .lp-step > p")];
            const artes = [...document.querySelectorAll(".lp-step__art")];
            textos.forEach((t) => {
              const rt = t.getBoundingClientRect();
              artes.forEach((a) => {
                const ra = a.getBoundingClientRect();
                if (rt.left < ra.right && rt.right > ra.left && rt.top < ra.bottom && rt.bottom > ra.top) {
                  achados.push(t.textContent.trim().slice(0, 30));
                }
              });
            });
          }
          window.scrollTo(0, 0);
          return achados;
        });
        assert(cruzamentos.length === 0, `sobreposição durante a rolagem: ${cruzamentos.join(" | ")}`);
      } finally { await sessao.context.close(); }
    });
  }

  /* ---------------------------------------------------------------- *
   * 4. MENU DO CELULAR
   * ---------------------------------------------------------------- */
  await test("menu do celular abre, prende o foco, fecha pelo Escape e por um link", async () => {
    const sessao = await abrir(browser, { w: 390, h: 844 });
    try {
      const { page } = sessao;
      const botao = page.locator("[data-menu-toggle]");
      const painel = page.locator("[data-menu]");

      assert(await botao.isVisible(), "o botão do menu não aparece no celular");
      const caixa = await botao.boundingBox();
      assert(caixa.width >= 44 && caixa.height >= 44, `alvo do menu abaixo de 44px: ${JSON.stringify(caixa)}`);

      await botao.click();
      assert(await painel.isVisible(), "o menu não abriu");
      assert(await botao.getAttribute("aria-expanded") === "true", "aria-expanded não acompanhou a abertura");
      assert(await page.evaluate(() => document.documentElement.classList.contains("lp-locked")),
        "o corpo continuou rolando por baixo do menu aberto");
      assert(await page.evaluate(() => document.activeElement.closest("[data-menu]") !== null),
        "o foco não entrou no menu");

      const alvos = await page.evaluate(() =>
        [...document.querySelectorAll("[data-menu] a")].map((a) => a.getBoundingClientRect().height));
      assert(alvos.length > 0 && alvos.every((h) => h >= 44), `link do menu abaixo de 44px: ${alvos.join(", ")}`);

      const medida = await medirLargura(page);
      assert(medida.culpados.length === 0, `menu aberto vaza para o lado: ${medida.culpados.join(" | ")}`);

      await page.keyboard.press("Escape");
      assert(await painel.isHidden(), "Escape não fechou o menu");
      assert(await page.evaluate(() => document.activeElement.hasAttribute("data-menu-toggle")),
        "o foco não voltou para o botão");
      assert(!(await page.evaluate(() => document.documentElement.classList.contains("lp-locked"))),
        "o corpo continuou travado depois de fechar");

      await botao.click();
      await page.locator('[data-menu] a[href="#recursos"]').click();
      assert(await painel.isHidden(), "clicar num link não fechou o menu");
    } finally { await sessao.context.close(); }
  });

  /* ---------------------------------------------------------------- *
   * 5. CTA
   * ---------------------------------------------------------------- */
  await test("todo CTA principal chega a uma página que existe", async () => {
    const sessao = await abrir(browser, { w: 1280, h: 860 });
    try {
      const { page } = sessao;
      const destinos = await page.evaluate(() =>
        [...document.querySelectorAll("main a[href], header a[href], footer a[href], .lp-dock a[href]")]
          .map((a) => a.getAttribute("href"))
          .filter((h) => !h.startsWith("#")));
      const unicos = [...new Set(destinos)];
      assert(unicos.length > 0, "nenhum destino externo à âncora foi encontrado");

      for (const destino of unicos) {
        const resposta = await page.request.get(new URL(destino.split("#")[0] || "/", globalThis.baseUrl).href);
        assert(resposta.status() === 200, `${destino} respondeu ${resposta.status()}`);
      }

      // O botão principal precisa levar ao aplicativo, e não a uma âncora.
      const principal = await page.locator(".lp-hero__actions .lp-btn--primary").getAttribute("href");
      assert(principal === "index.html", `o CTA do hero aponta para ${principal}`);
    } finally { await sessao.context.close(); }
  });

  /* ---------------------------------------------------------------- *
   * 6. MOVIMENTO REDUZIDO E AUSÊNCIA DE JAVASCRIPT
   * ---------------------------------------------------------------- */
  await test("com movimento reduzido a página continua inteira e utilizável", async () => {
    const sessao = await abrir(browser, { w: 390, h: 844 }, { reducedMotion: "reduce" });
    try {
      const { page, erros } = sessao;
      await page.waitForTimeout(400);
      assert(erros.length === 0, `erro com movimento reduzido: ${erros.join("; ")}`);
      assert(await page.evaluate(() => document.documentElement.getAttribute("data-lp-motion")) === null,
        "o atributo de movimento foi escrito mesmo com a preferência reduzida");

      const invisiveis = await page.evaluate(() =>
        [...document.querySelectorAll("h1, h2, .lp-step__title, .lp-plan__value, .lp-faq__item summary")]
          .filter((el) => {
            const cs = getComputedStyle(el);
            return cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.9;
          }).length);
      assert(invisiveis === 0, `${invisiveis} elemento(s) de conteúdo escondidos com movimento reduzido`);

      const medida = await medirLargura(page);
      assert(medida.culpados.length === 0, `estouro com movimento reduzido: ${medida.culpados.join(" | ")}`);

      // O simulador é interação, não animação: precisa continuar respondendo.
      // `fill` não serve em <input type="range">; o valor entra direto e o
      // evento é disparado à mão, que é o que o controle deslizante faz.
      await page.locator("#sim-anos").evaluate((el) => {
        el.value = "20";
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
      assert((await page.locator('[data-sim-out="prazo"]').innerText()).includes("20"),
        "o simulador parou de responder com movimento reduzido");
    } finally { await sessao.context.close(); }
  });

  await test("sem JavaScript o conteúdo essencial continua na tela", async () => {
    const sessao = await abrir(browser, { w: 390, h: 844 }, { javaScriptEnabled: false });
    try {
      const { page } = sessao;
      // Sem JavaScript no mundo principal, `page.evaluate` não roda. Tudo
      // aqui usa a API de localizadores, que o Playwright executa num mundo
      // isolado e continua funcionando.
      const essenciais = [
        "h1",
        ".lp-hero__lead",
        ".lp-strip__item",
        ".lp-step__title",
        ".lp-step__art",
        ".lp-bx h3",
        ".lp-plan__value",
        ".lp-faq__item summary",
        ".lp-final__title",
      ];
      for (const seletor of essenciais) {
        const visivel = await page.locator(seletor).first().isVisible();
        assert(visivel, `sem JavaScript, ${seletor} não está visível`);
      }

      // ESTA É A GARANTIA ESTRUTURAL, e ela vale mais do que medir opacidade:
      // o estado escondido de `.lp-anim` e `.lp-reveal` só existe dentro de
      // `[data-lp-motion="on"]`, e esse atributo é escrito por JavaScript.
      // Sem script, ele não aparece, e não existe bloco esperando um `.is-in`
      // que nunca viria.
      assert(await page.locator("html").getAttribute("data-lp-motion") === null,
        "sem JavaScript o atributo de movimento apareceu, e com ele conteúdo escondido");

      // O acordeão é <details>: abre sem script nenhum.
      await page.locator(".lp-faq__item summary").first().click();
      assert(await page.locator(".lp-faq__item").first().getAttribute("open") !== null,
        "o FAQ não abriu sem JavaScript");
    } finally { await sessao.context.close(); }
  });

  /* ---------------------------------------------------------------- *
   * 7. CAPTURAS PARA A REVISÃO VISUAL
   * ---------------------------------------------------------------- */
  await test("capturas geradas para revisão visual", async () => {
    for (const viewport of [{ w: 1440, h: 900 }, { w: 768, h: 1024 }, { w: 390, h: 844 }]) {
      const sessao = await abrir(browser, viewport);
      try {
        const { page } = sessao;
        await page.waitForTimeout(900);
        const prefixo = path.join(capturas, `${viewport.w}`);
        fs.mkdirSync(prefixo, { recursive: true });
        await page.screenshot({ path: path.join(prefixo, "00-pagina-inteira.png"), fullPage: true });
        for (const [nome, seletor] of SECOES) {
          const alvo = page.locator(seletor).first();
          if (await alvo.count() === 0) continue;
          await alvo.scrollIntoViewIfNeeded();
          // A coreografia mais longa da página (a linha projetada da previsão
          // de saldo) só termina em 1900ms: 900 de espera mais 1000 de traço.
          // Fotografar antes disso rende uma imagem de meio caminho, e uma
          // revisão visual feita em cima dela reprova o que está certo ou
          // aprova o que está errado. A conferência de layout não depende
          // desta espera; a de gosto depende inteira.
          await page.waitForTimeout(2100);
          await page.screenshot({ path: path.join(prefixo, `${nome}.png`) });
        }
      } finally { await sessao.context.close(); }
    }
    assert(fs.readdirSync(capturas).length > 0, "nenhuma captura foi gerada");
    console.log(`    capturas em ${capturas}`);
  });

  await browser.close();
  server.close();
  const failures = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failures.length} passaram, ${failures.length} falharam.`);
  process.exit(failures.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  server.close();
  process.exit(1);
});
