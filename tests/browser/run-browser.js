"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { chromium, firefox, webkit } = require("playwright");
const PdfWriter = require(path.join(__dirname, "..", "..", "js", "pdf.js"));

const root = path.resolve(__dirname, "..", "..");
const browserName = String(process.env.COFRE_BROWSER || "chromium").toLowerCase();
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error(`Motor de navegador inválido: ${browserName}`);
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png" };

const server = http.createServer((request, response) => {
  const urlPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404); response.end("Not found"); return;
  }
  response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(response);
});

const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log(`  ✓ ${name}`); }
  catch (error) { results.push({ name, ok: false, error }); console.error(`  ✗ ${name}\n    ${error.message}`); }
}
function assert(condition, message) { if (!condition) throw new Error(message); }

async function completeOnboarding(page, focus = "month") {
  await page.locator('[data-action-select="onb-legal"]').check();
  await page.locator(`[data-action="onb-focus"][data-value="${focus}"]`).click();
  await page.fill("#onb-name", "Teste");
  await page.locator('[data-action="onb-next"]').click();
  await page.fill("#onb-income", "5000,00");
  await page.locator('[data-action="onb-next"]').click();
  await page.fill("#onb-acc-name", "Conta principal");
  await page.fill("#onb-acc-balance", "2000,00");
  await page.locator('[data-action="onb-next"]').click();
  await page.locator('[data-action="onb-finish"]').click();
  await page.waitForSelector(".main-content");
}

// ESCOLHER CATEGORIA É DOIS PASSOS QUANDO ELA TEM FILHOS.
//
// Tocar num chip de categoria que tem subcategorias NÃO conclui a escolha: abre
// o seletor "Escolha uma subcategoria", com "Geral (sem subcategoria)" na
// primeira posição. O teste clicava só no chip e seguia para "Salvar gasto",
// que ficava atrás do modal; o Playwright tentava clicar por 30 segundos,
// desistia, e o modal continuava aberto na página COMPARTILHADA, derrubando
// todos os testes seguintes em cascata. Uma falha, cinco vermelhos.
//
// A primeira categoria da fila é "Alimentação", que tem Mercado e Delivery.
// Concluir a escolha aqui é o que o usuário faz, e é o que faltava.
async function escolherPrimeiraCategoria(page) {
  await page.locator("#tx-category-group .chip").first().click();
  const seletor = page.locator(".cat-picker-sheet");
  if (await seletor.count() === 0) return;
  // A primeira opção é sempre o próprio pai ("Geral"), então a escolha não
  // depende de quais subcategorias existem hoje.
  await page.locator(".cat-picker-option").first().click();
  await seletor.waitFor({ state: "detached" });
}

async function openFresh(browser, viewport = { width: 390, height: 844 }, contextOptions = {}, initScript = null) {
  const context = await browser.newContext({ viewport, ...contextOptions });
  // Roteiro de partida: roda antes de qualquer script da página, que é a única
  // hora em que dá para simular um navegador SEM um recurso que este tem.
  if (initScript) await context.addInitScript(initScript);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${globalThis.baseUrl}?__test=1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[role="dialog"][aria-label="Configuração inicial"]');
  return { context, page, pageErrors };
}

async function captureOnboardingGeometryM4(page) {
  return page.evaluate(() => {
    const required = (selector) => {
      const node = document.querySelector(selector);
      if (!node) throw new Error(`elemento ausente na medição do onboarding: ${selector}`);
      return node;
    };
    const rectOf = (node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const overflowOf = (node) => Math.max(0, node.scrollWidth - node.clientWidth);
    const layer = required(".onb");
    const sheet = required(".onb__sheet");
    const head = required(".onb__head");
    const progress = required(".onb__progress");
    const body = required(".onb__body");
    const foot = required(".onb__foot");
    const cta = required("#onb-advance");
    const skip = required('[data-action="onb-skip"]');
    const footerButtons = Array.from(foot.querySelectorAll("button"));
    const progressLabels = Array.from(progress.querySelectorAll(".onb__step-label"));
    const last = body.lastElementChild;
    if (!last) throw new Error("o corpo do onboarding não tem último elemento");

    const previousScrollTop = body.scrollTop;
    body.scrollTop = body.scrollHeight;
    const bodyAtEnd = rectOf(body);
    const lastAtEnd = rectOf(last);
    const scrollTopAtEnd = body.scrollTop;
    const scrollRange = Math.max(0, body.scrollHeight - body.clientHeight);
    const geometry = {
      viewport: (() => {
        const visual = window.visualViewport;
        const left = visual ? visual.offsetLeft : 0;
        const top = visual ? visual.offsetTop : 0;
        const width = visual ? visual.width : window.innerWidth;
        const height = visual ? visual.height : window.innerHeight;
        return { left, top, right: left + width, bottom: top + height, width, height, devicePixelRatio: window.devicePixelRatio };
      })(),
      rects: {
        layer: rectOf(layer), sheet: rectOf(sheet), head: rectOf(head), progress: rectOf(progress),
        body: bodyAtEnd, foot: rectOf(foot), cta: rectOf(cta), last: lastAtEnd,
      },
      horizontalOverflow: {
        document: overflowOf(document.documentElement), layer: overflowOf(layer), sheet: overflowOf(sheet), body: overflowOf(body),
      },
      fixedVerticalRange: {
        layer: Math.max(0, layer.scrollHeight - layer.clientHeight),
        sheet: Math.max(0, sheet.scrollHeight - sheet.clientHeight),
      },
      fixedScrollTop: { layer: layer.scrollTop, sheet: sheet.scrollTop },
      controls: {
        skip: { action: "onb-skip", rect: rectOf(skip) },
        footer: footerButtons.map((button) => ({ action: button.dataset.action || "", rect: rectOf(button) })),
      },
      progressLabels: progressLabels.map((node) => ({
        text: node.textContent.trim(),
        rect: rectOf(node),
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight,
      })),
      body: {
        clientHeight: body.clientHeight,
        scrollHeight: body.scrollHeight,
        scrollRange,
        scrollTopAtEnd,
        overflowY: getComputedStyle(body).overflowY,
        lastReachable: lastAtEnd.bottom <= bodyAtEnd.bottom + 1 && lastAtEnd.bottom >= bodyAtEnd.top - 1,
      },
    };
    body.scrollTop = previousScrollTop;
    return geometry;
  });
}

async function assertOnboardingGeometryM4(page, label, options = {}) {
  const geometry = await captureOnboardingGeometryM4(page);
  const tolerance = 1;
  const withinViewport = (rect) => rect.left >= geometry.viewport.left - tolerance
    && rect.right <= geometry.viewport.right + tolerance
    && rect.top >= geometry.viewport.top - tolerance
    && rect.bottom <= geometry.viewport.bottom + tolerance;
  ["layer", "sheet", "head", "progress", "foot", "cta"].forEach((name) => {
    assert(withinViewport(geometry.rects[name]), `${label}: ${name} saiu da viewport: ${JSON.stringify(geometry)}`);
  });
  assert(geometry.rects.cta.height >= 44, `${label}: CTA tem menos de 44 px: ${geometry.rects.cta.height}`);
  assert(geometry.body.clientHeight >= 44, `${label}: o corpo tem menos de 44 px úteis: ${geometry.body.clientHeight}`);
  assert(["auto", "scroll"].includes(geometry.body.overflowY),
    `${label}: o corpo não é a região rolável: overflow-y=${geometry.body.overflowY}`);
  assert(geometry.body.scrollTopAtEnd >= geometry.body.scrollRange - tolerance,
    `${label}: o corpo não chegou ao fim: ${JSON.stringify(geometry.body)}`);
  assert(geometry.body.lastReachable, `${label}: o último filho do corpo não ficou alcançável: ${JSON.stringify(geometry)}`);
  if (options.expectBodyOverflow) {
    assert(geometry.body.scrollRange > tolerance, `${label}: o cenário longo não produziu rolagem no corpo`);
  }
  Object.entries(geometry.horizontalOverflow).forEach(([name, value]) => {
    assert(value <= tolerance, `${label}: rolagem horizontal em ${name}: ${value}px`);
  });
  Object.entries(geometry.fixedVerticalRange).forEach(([name, value]) => {
    assert(value <= tolerance, `${label}: ${name} ganhou faixa vertical de ${value}px`);
  });
  Object.entries(geometry.fixedScrollTop).forEach(([name, value]) => {
    assert(value <= tolerance, `${label}: ${name} rolou para scrollTop=${value}`);
  });
  [geometry.controls.skip, ...geometry.controls.footer].forEach((control) => {
    assert(withinViewport(control.rect), `${label}: botão ${control.action} saiu da viewport: ${JSON.stringify(control.rect)}`);
    assert(control.rect.width >= 44 && control.rect.height >= 44,
      `${label}: botão ${control.action} tem alvo menor que 44 px: ${JSON.stringify(control.rect)}`);
  });
  assert(geometry.progressLabels.length === 4, `${label}: a barra não mostrou os quatro rótulos de progresso`);
  geometry.progressLabels.forEach((item) => {
    assert(item.rect.width > 0 && item.rect.height > 0, `${label}: rótulo de progresso oculto: ${item.text}`);
    assert(item.scrollWidth <= item.clientWidth + tolerance && item.scrollHeight <= item.clientHeight + tolerance,
      `${label}: rótulo de progresso cortado: ${JSON.stringify(item)}`);
    const progress = geometry.rects.progress;
    assert(item.rect.left >= progress.left - tolerance && item.rect.right <= progress.right + tolerance
      && item.rect.top >= progress.top - tolerance && item.rect.bottom <= progress.bottom + tolerance,
    `${label}: rótulo saiu da barra de progresso: ${JSON.stringify(item)}`);
  });
  const adjacent = [["head", "progress"], ["progress", "body"], ["body", "foot"]];
  adjacent.forEach(([first, second]) => {
    const a = geometry.rects[first];
    const b = geometry.rects[second];
    const overlapWidth = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const overlapHeight = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    assert(overlapWidth <= tolerance || overlapHeight <= tolerance,
      `${label}: ${first} sobrepõe ${second}: ${JSON.stringify({ overlapWidth, overlapHeight, a, b })}`);
  });
  return geometry;
}

async function assertOnboardingScrollResetM4(page, label) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const scrollTop = await page.locator(".onb__body").evaluate((body) => body.scrollTop);
  assert(scrollTop <= 1, `${label}: o novo passo herdou scrollTop=${scrollTop}`);
}

async function scrollOnboardingBodyToEndM4(page) {
  await page.locator(".onb__body").evaluate((body) => { body.scrollTop = body.scrollHeight; });
}

async function assertOnboardingFocusRingM4(page, selector, label) {
  const control = page.locator(selector);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await control.focus();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const measurement = await control.evaluate((node) => {
    const body = node.closest(".onb__body");
    if (!body) throw new Error("controle focado fora do corpo do onboarding");
    const rect = (element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    };
    return { active: document.activeElement === node, control: rect(node), body: rect(body) };
  });
  const ring = 3;
  const tolerance = 1;
  assert(measurement.active, `${label}: ${selector} não recebeu foco`);
  assert(measurement.control.left - ring >= measurement.body.left - tolerance
    && measurement.control.right + ring <= measurement.body.right + tolerance
    && measurement.control.top - ring >= measurement.body.top - tolerance
    && measurement.control.bottom + ring <= measurement.body.bottom + tolerance,
  `${label}: o anel de foco de ${selector} saiu do corpo: ${JSON.stringify(measurement)}`);
}

async function advanceOnboardingM4(page, label) {
  const button = page.locator("#onb-advance");
  try {
    const status = await button.evaluate((node) => ({
      disabled: node.disabled,
      reason: document.getElementById("onb-block-reason")?.textContent.trim() || "",
    }));
    assert(!status.disabled, `Continuar desabilitado${status.reason ? `: ${status.reason}` : ""}`);
    await button.click({ timeout: 5000 });
  } catch (error) {
    // Se uma navegação trocar o botão entre a leitura e o clique, o estado da
    // nova página explica qual requisito voltou a bloquear o passo.
    const state = await page.evaluate(() => ({
      progress: document.querySelector(".onb__progress")?.getAttribute("aria-label") || "ausente",
      disabled: document.getElementById("onb-advance")?.disabled ?? null,
      reason: document.getElementById("onb-block-reason")?.textContent.trim() || "",
      legal: document.querySelector('[data-action-select="onb-legal"]')?.checked ?? null,
      income: document.getElementById("onb-income")?.value ?? null,
      accountName: document.getElementById("onb-acc-name")?.value ?? null,
      accountBalance: document.getElementById("onb-acc-balance")?.value ?? null,
      controller: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
      reloadGuard: sessionStorage.getItem("cofre_build_reload") || "",
      navigation: performance.getEntriesByType("navigation")[0]?.type || "desconhecida",
    })).catch((diagnosticError) => ({ diagnosticError: diagnosticError.message }));
    throw new Error(`${label}: ${error.message.split("\n")[0]}; estado=${JSON.stringify(state)}`);
  }
}

async function runOnboardingViewportM4(browser, scenario) {
  const fresh = await openFresh(browser, scenario.viewport, { hasTouch: true, reducedMotion: "reduce", ...scenario.contextOptions });
  const page = fresh.page;
  const step = (number) => page.locator(`.onb__progress[aria-label="Passo ${number} de 4"]`);
  try {
    const first = await assertOnboardingGeometryM4(page, `${scenario.label}, passo 1`);
    assert(Math.abs(first.viewport.devicePixelRatio - scenario.devicePixelRatio) < 0.01,
      `${scenario.label}: devicePixelRatio inesperado: ${first.viewport.devicePixelRatio}`);

    await page.locator(".onb-legal-summary > summary").click();
    assert(await page.locator(".onb-legal-summary").getAttribute("open") !== null,
      `${scenario.label}: o resumo legal não abriu`);
    await assertOnboardingGeometryM4(page, `${scenario.label}, passo 1 com resumo legal`, { expectBodyOverflow: true });
    const legal = page.locator('[data-action-select="onb-legal"]');
    await legal.check();
    // O primeiro clients.claim() controla a aba sem trocar o pacote carregado.
    // Esperar por ele aqui prova que essa aquisição não apaga o aceite em curso.
    await page.waitForFunction(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller));
    assert(await legal.isChecked(), `${scenario.label}, passo 1: o primeiro controle do service worker apagou o aceite`);
    await assertOnboardingFocusRingM4(page, '[data-action-select="onb-legal"]', `${scenario.label}, passo 1`);
    await page.locator('[data-action="onb-focus"][data-value="debt"]').click();
    await page.fill("#onb-name", "Teste M4");
    await assertOnboardingFocusRingM4(page, "#onb-name", `${scenario.label}, passo 1`);
    await scrollOnboardingBodyToEndM4(page);
    await advanceOnboardingM4(page, `${scenario.label}, passo 1`);

    await step(2).waitFor();
    await assertOnboardingScrollResetM4(page, `${scenario.label}, Próximo para o passo 2`);
    await assertOnboardingGeometryM4(page, `${scenario.label}, passo 2`);
    await page.fill("#onb-income", "5000,00");
    await assertOnboardingFocusRingM4(page, "#onb-income", `${scenario.label}, passo 2`);
    await scrollOnboardingBodyToEndM4(page);
    await advanceOnboardingM4(page, `${scenario.label}, passo 2`);

    await step(3).waitFor();
    await assertOnboardingScrollResetM4(page, `${scenario.label}, Próximo para o passo 3`);
    await assertOnboardingGeometryM4(page, `${scenario.label}, passo 3`);
    await page.fill("#onb-acc-name", "Conta principal");
    await assertOnboardingFocusRingM4(page, "#onb-acc-name", `${scenario.label}, passo 3`);
    await page.fill("#onb-acc-balance", "2000,00");
    await assertOnboardingFocusRingM4(page, "#onb-acc-balance", `${scenario.label}, passo 3`);
    await scrollOnboardingBodyToEndM4(page);
    await advanceOnboardingM4(page, `${scenario.label}, passo 3`);

    await step(4).waitFor();
    await assertOnboardingScrollResetM4(page, `${scenario.label}, Próximo para o passo 4`);
    assert(await page.locator(".onb__preview").count() === 1, `${scenario.label}: o passo 4 não mostrou a prévia da renda`);
    await assertOnboardingGeometryM4(page, `${scenario.label}, passo 4`, { expectBodyOverflow: true });
    await scrollOnboardingBodyToEndM4(page);
    await page.locator('[data-action="onb-back"]').click();

    await step(3).waitFor();
    await assertOnboardingScrollResetM4(page, `${scenario.label}, Voltar para o passo 3`);
    await assertOnboardingGeometryM4(page, `${scenario.label}, passo 3 após Voltar`);
    await scrollOnboardingBodyToEndM4(page);
    await advanceOnboardingM4(page, `${scenario.label}, passo 3 após Voltar`);

    await step(4).waitFor();
    await assertOnboardingScrollResetM4(page, `${scenario.label}, novo Próximo para o passo 4`);
    await assertOnboardingGeometryM4(page, `${scenario.label}, passo 4 final`, { expectBodyOverflow: true });
    await page.locator('[data-action="onb-finish"]').click();
    await page.waitForSelector(".main-content");

    const saved = await page.evaluate(() => CofreUI.test.snapshot());
    assert(saved.dashboardFocus === "debt", `${scenario.label}: o objetivo não foi gravado`);
    assert(saved.monthlyIncome === 5000 && saved.accountCount === 1,
      `${scenario.label}: renda ou conta não foi gravada no fluxo real`);
    assert(fresh.pageErrors.length === 0, `${scenario.label}: erros no navegador: ${fresh.pageErrors.join("; ")}`);
  } finally {
    await fresh.context.close();
  }
}

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  globalThis.baseUrl = `http://127.0.0.1:${server.address().port}/`;
  console.log(`\nMotor: ${browserName}`);
  const browser = await browserType.launch({ headless: true });
  let shared;

  await test("onboarding grava objetivo, renda e conta", async () => {
    shared = await openFresh(browser);
    await completeOnboarding(shared.page, "debt");
    const data = await shared.page.evaluate(() => CofreUI.test.snapshot());
    assert(data.dashboardFocus === "debt", "o objetivo escolhido não foi gravado");
    assert(data.monthlyIncome === 5000 && data.accountCount === 1, "renda ou conta não foi gravada");
  });

  await test("onboarding mantém ações alcançáveis em tela baixa e viewport CSS de zoom de 200%", async () => {
    const scenarios = [
      { label: "320x480 touch", viewport: { width: 320, height: 480 }, contextOptions: {}, devicePixelRatio: 1 },
      // O DPR 2 cobre densidade. O espaço reduzido de 390x450 CSS é o que
      // representa a área disponível numa janela ampliada em 200%.
      { label: "390x450 CSS com DPR 2", viewport: { width: 390, height: 450 }, contextOptions: { deviceScaleFactor: 2 }, devicePixelRatio: 2 },
    ];
    for (const scenario of scenarios) await runOnboardingViewportM4(browser, scenario);
  });

  await test("lançamento mostra erro no campo e limita centavos", async () => {
    const page = shared.page;
    await page.locator('[data-action="nav"][data-tab="add"]').last().click();
    await page.locator('[data-action="submit-tx"]').click();
    assert(await page.locator("#tx-amount-input").getAttribute("aria-invalid") === "true", "valor inválido não recebeu aria-invalid");
    assert(await page.evaluate(() => document.activeElement && document.activeElement.id) === "tx-amount-input", "o primeiro erro não recebeu foco");
    await page.fill("#tx-amount-input", "123,456");
    assert(await page.inputValue("#tx-amount-input") === "123,45", "o valor manteve mais de duas casas");
    await escolherPrimeiraCategoria(page);
    await page.locator('[data-action="submit-tx"]').click();
    await page.waitForFunction(() => CofreUI.test.snapshot().transactionCount === 1);
  });

  await test("compra parcelada e pagamento da fatura percorrem a interface", async () => {
    const page = shared.page;
    await page.evaluate(() => CofreUI.test.navigate("accounts"));
    await page.locator('[data-action="card-new"]').click();
    await page.fill("#card-name-input", "Cartão teste");
    await page.fill("#card-limit-input", "3000,00");
    await page.fill("#card-closing-input", "20");
    await page.fill("#card-due-input", "28");
    await page.locator('[data-action="card-save"]').click();
    await page.evaluate(() => CofreUI.test.navigate("add"));
    // Depois do fechamento, uma compra com a data atual cai na fatura seguinte,
    // que corretamente não oferece pagamento. O dia 1 mantém este fluxo pagável
    // em qualquer data de execução sem mudar a regra do produto.
    const txDate = await page.inputValue("#tx-date-input");
    await page.fill("#tx-date-input", `${txDate.slice(0, 7)}-01`);
    await page.fill("#tx-amount-input", "300,00");
    await escolherPrimeiraCategoria(page);
    await page.locator('[data-action="select-payment"][data-value="Crédito"]').click();
    await page.selectOption("#tx-card-select", { index: 1 });
    await page.locator('[data-action="select-installments"][data-value="3"]').click();
    await page.locator('[data-action="submit-tx"]').click();
    await page.waitForFunction(() => CofreUI.test.snapshot().installmentCount === 3);
    await page.evaluate(() => CofreUI.test.navigate("accounts"));
    const pay = page.locator('[data-action="card-pay-open"]').first();
    assert(await pay.count() === 1, "a fatura aberta não ofereceu pagamento");
    await pay.click();
    await page.locator('[data-action="card-pay-save"]').click();
    await page.waitForFunction(() => CofreUI.test.snapshot().cardPaymentCount === 1);
  });

  await test("meta, aporte e confirmação por teclado funcionam", async () => {
    const page = shared.page;
    await page.evaluate(() => CofreUI.test.navigate("goals"));
    await page.locator('[data-action="toggle-goal-form"]').click();
    await page.fill("#goal-name-input", "Reserva teste");
    await page.fill("#goal-target-input", "1000,00");
    await page.locator('[data-action="submit-goal"]').click();
    await page.waitForFunction(() => CofreUI.test.snapshot().goalCount === 1);
    await page.locator('[data-action="expand-goal"][data-value="aportar"]').click();
    await page.fill("#goal-contribution-input", "100,00");
    await page.locator('[data-action="submit-goal-action"]').click();
    await page.waitForFunction(() => CofreUI.test.snapshot().goalCurrent === 100);

    await page.locator('[data-action="toggle-goal-form"]').click();
    await page.fill("#goal-name-input", "Compra teste");
    await page.fill("#goal-target-input", "2000,00");
    await page.fill("#goal-saved-input", "200,00");
    const submit = page.locator('[data-action="submit-goal"]');
    await submit.click();
    const dialog = page.locator('[role="alertdialog"]');
    await dialog.waitFor();
    assert(await page.locator(".main-content").getAttribute("inert") !== null, "o fundo não foi isolado");
    await page.keyboard.press("Shift+Tab");
    assert(await dialog.evaluate((node) => node.contains(document.activeElement)), "Shift+Tab saiu do diálogo");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert(await page.evaluate(() => document.activeElement && document.activeElement.dataset.action) === "submit-goal", "o foco não voltou ao botão de origem");
  });

  await test("central filtra, revisa e mostra a origem", async () => {
    const page = shared.page;
    await page.evaluate(() => CofreUI.test.navigate("analytics"));
    await page.waitForSelector(".movement-row");
    assert(await page.locator("h1").first().textContent() === "Movimentações", "a rota não abriu a central");
    await page.locator(".movement-row__main").first().click();
    await page.waitForSelector('[data-action="cancel-edit"]');
    await page.locator('[data-action="cancel-edit"]').click();
    await page.waitForSelector(".movement-row");
    assert(await page.locator("h1").first().textContent() === "Movimentações", "cancelar a edição não voltou para a central");
    await page.locator('[data-action="movement-detail"]').first().click();
    const detail = page.locator(".movement-detail");
    await detail.waitFor();
    assert((await detail.textContent()).includes("Origem") && (await detail.textContent()).includes("Alterações"), "o popup não mostrou procedência e histórico");
    await detail.locator('[data-action="movement-detail-close"]').click();
    await detail.waitFor({ state:"detached" });
    await page.locator('[data-action-select="movement-select"]').first().check();
    await page.waitForSelector(".movement-bulk");
    await page.selectOption("#movement-bulk-category", { index:1 });
    await page.locator('[data-action="movement-bulk-apply"]').click();
    await page.locator('[data-action="movement-review-toggle"]').click();
    assert(await page.locator(".review-issue").count() >= 1, "a conta sem conferência não entrou na caixa de revisão");
    await page.locator('[data-action="movement-filters-toggle"]').click();
    await page.selectOption("#movement-type", "expense");
    assert(await page.locator(".movement-row").count() >= 1, "o filtro removeu saídas válidas");
  });

  await test("explicações, Assistente financeiro e fontes funcionam juntos", async () => {
    const page = shared.page;
    await page.evaluate(() => CofreUI.test.navigate("accounts"));
    await page.locator('[data-action="accounts-view"][data-value="sources"]').click();
    await page.waitForSelector(".sources-center");
    const sourcesText = await page.locator(".sources-center").textContent();
    assert(sourcesText.includes("Sem conexão bancária") && sourcesText.includes("Origens encontradas"), "a central não explicou a situação e as origens");

    await page.locator('[data-action="accounts-view"][data-value="accounts"]').click();
    await page.locator('[data-action="calculation-open"][data-id="accounts-balance"]').first().click();
    const calculation = page.locator(".calculation-dialog");
    await calculation.waitFor();
    const calculationText = await calculation.textContent();
    assert(calculationText.includes("Realizado") && calculationText.includes("Premissas utilizadas"), "o popup não separou natureza e premissas");
    await calculation.locator('[data-action="calculation-close"]').click();
    await calculation.waitFor({ state:"detached" });

    await page.locator('[data-action="assistant-open"]').click();
    const assistant = page.locator(".assistant-dialog");
    await assistant.waitFor();
    await assistant.locator('[data-action="assistant-question"][data-id="accounts-purchase"]').click();
    await assistant.locator('[data-action="assistant-action"][data-id="accounts-purchase"]').click();
    await page.waitForSelector("#sim-entrada-amortizacao-dinheiro-input");
    assert((await page.inputValue("#sim-entrada-amortizacao-dinheiro-input")) !== "", "o assistente não preencheu o simulador");
  });

  await test("backup atual e arquivo antigo passam pela restauração", async () => {
    const page = shared.page;
    await page.evaluate(() => CofreUI.test.navigate("settings"));
    // Ajustes virou acordeao: backup mora no topico "dados" e o painel so
    // existe no DOM depois de abrir. O estado fica em `state.settingsSection`,
    // entao um clique basta para o resto deste teste.
    await page.locator('[data-action="settings-section"][data-value="dados"]').click();
    await page.waitForSelector('[data-action="export-json"]');
    const downloadPromise = page.waitForEvent("download");
    await page.locator('[data-action="export-json"]').click();
    const download = await downloadPromise;
    const backupPath = path.join(os.tmpdir(), `cofre-browser-${Date.now()}.json`);
    await download.saveAs(backupPath);
    await page.setInputFiles("#import-file-input", backupPath);
    await page.waitForSelector('[data-action="backup-confirm"]');
    await page.locator('[data-action="backup-set-mode"][data-value="replace"]').click();
    await page.locator('[data-action="backup-confirm"]').click();
    await page.waitForFunction(() => !CofreUI.test.snapshot().backupPreviewOpen);
    assert((await page.evaluate(() => CofreUI.test.snapshot().transactionCount)) >= 4, "o backup atual não restaurou os lançamentos");

    const oldPath = path.join(os.tmpdir(), `cofre-old-${Date.now()}.json`);
    fs.writeFileSync(oldPath, JSON.stringify({ version: 6, monthlyIncome: 1200, transactions: [], categories: [], goals: [], assets: [] }));
    await page.setInputFiles("#import-file-input", oldPath);
    await page.waitForSelector('[data-action="backup-confirm"]');
    assert((await page.locator("body").textContent()).toLowerCase().includes("formato antigo"), "o arquivo antigo não foi reconhecido");
    await page.locator('[data-action="backup-confirm"]').click();
    await page.waitForFunction(() => CofreUI.test.snapshot().version === 23);
    fs.unlinkSync(backupPath); fs.unlinkSync(oldPath);
  });

  await test("conta preserva o modo local quando o backend não está configurado", async () => {
    const page = shared.page;
    await page.evaluate(() => CofreUI.test.navigate("account"));
    await page.waitForSelector(".account-status");
    const text = await page.locator(".main-content").textContent();
    assert(text.includes("Modo local ativo") && text.includes("sem enviar seus dados"), "a tela não explicou o modo local");
    assert(await page.locator("#account-password").count() === 0, "o formulário apareceu mesmo sem backend configurado");
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert(overflow <= 2, `a tela de conta criou rolagem horizontal em ${width}px`);
    }
  });

  // A TELA SUBIA SOZINHA ENQUANTO A PESSOA MEXIA NELA.
  //
  // Só o navegador de verdade prova este conserto: em Node não existe rolagem,
  // e o defeito nascia justamente do que o navegador faz sozinho (levar a
  // janela até o campo que recebeu foco, e recriar a folha modal no topo).
  // Os cliques aqui são disparados por `element.click()` de propósito: o clique
  // do Playwright rolaria o elemento para dentro da tela antes de acionar,
  // apagando a medição.
  await test("mexer na mesma tela não joga a rolagem para o topo", async () => {
    const page = shared.page;

    await page.evaluate(() => CofreUI.test.navigate("add"));
    await page.waitForSelector("#tx-amount-input");
    await page.evaluate(() => window.scrollTo(0, 240));
    const antesDaTela = await page.evaluate(() => Math.round(window.scrollY));
    assert(antesDaTela > 0, "a tela de lançamento não rolou; a medição não valeria nada");
    await page.evaluate(() => document.querySelector('[data-action="select-payment"][data-value="Pix"]').click());
    const depoisDaTela = await page.evaluate(() => Math.round(window.scrollY));
    assert(Math.abs(depoisDaTela - antesDaTela) <= 2,
      `a página voltou para ${depoisDaTela} depois de escolher a forma de pagamento (estava em ${antesDaTela})`);

    // Editor de categoria: a folha é rolável por si, e era ela que voltava ao
    // topo a cada escolha de ícone, cor ou grupo. O `finally` existe porque uma
    // falha aqui deixaria a folha aberta na página compartilhada e derrubaria
    // os testes seguintes por tabela.
    await page.evaluate(() => CofreUI.test.navigate("categories"));
    await page.waitForSelector("#cat-search-input");
    await page.evaluate(() => document.querySelector('[data-action="cat-editor-open"]').click());
    await page.waitForSelector(".modal-sheet.cat-editor");
    try {
      const rolou = await page.evaluate(() => {
        const folha = document.querySelector(".modal-sheet.cat-editor");
        folha.scrollTop = folha.scrollHeight;
        return Math.round(folha.scrollTop);
      });
      assert(rolou > 0, "a folha do editor de categoria não rolou; a medição não valeria nada");
      await page.evaluate(() => {
        const icones = document.querySelectorAll(".cat-icon-option");
        icones[icones.length - 1].click();
      });
      // A conferência espera um quadro: a âncora de rolagem do navegador (desligada
      // em `.modal-sheet`) agia depois da troca do DOM, não durante.
      await page.waitForTimeout(120);
      const depoisDaFolha = await page.evaluate(() => Math.round(document.querySelector(".modal-sheet.cat-editor").scrollTop));
      assert(Math.abs(depoisDaFolha - rolou) <= 2,
        `a folha do editor voltou para ${depoisDaFolha} depois de escolher o ícone (estava em ${rolou})`);
    } finally {
      // Fechar a folha passa pelo histórico do navegador, que responde no
      // proximo quadro. Navegar antes disso desfaria o fechamento.
      await page.evaluate(() => {
        const fechar = document.querySelector('[data-action="cat-editor-close"]');
        if (fechar) fechar.click();
      });
      await page.waitForSelector(".modal-sheet.cat-editor", { state: "detached" });
      await page.evaluate(() => { CofreUI.test.navigate("dashboard"); window.scrollTo(0, 0); });
    }
    assert(shared.pageErrors.length === 0, `erros no navegador: ${shared.pageErrors.join("; ")}`);
  });

  // REVISAR SESSENTA LINHAS ERA UM CAMPO MINADO.
  //
  // Cada caixa marcada chamava `render()`, que reconstrói o aplicativo inteiro:
  // a tela tremia, a lista voltava ao topo e o seletor em uso deixava de existir
  // no meio da escolha. Só o navegador de verdade prova o conserto, porque o que
  // importa é o DOM sobreviver e a rolagem interna ficar onde estava.
  await test("revisar um extrato longo não redesenha nem rola a lista", async () => {
    const page = shared.page;

    // A escolha "transferência entre minhas contas" só existe com duas contas
    // ativas, e é um dos caminhos remendados; sem a segunda conta o teste
    // passaria sem exercitá-lo.
    await page.evaluate(() => CofreUI.test.navigate("accounts"));
    await page.waitForSelector('[data-action="account-new"]');
    await page.evaluate(() => {
      if (document.querySelectorAll('[data-action="account-edit"]').length > 1) return;
      document.querySelector('[data-action="account-new"]').click();
      const preencher = (campo, valor) => {
        const el = document.querySelector(`[data-field="${campo}"]`);
        el.value = valor;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };
      preencher("account-name", "Conta B");
      preencher("account-opening-balance", "500,00");
      document.querySelector('[data-action="account-save"]').click();
    });

    await page.evaluate(() => CofreUI.test.navigate("import"));
    // O campo de arquivo fica escondido atrás da área de soltar, então esperar
    // por visibilidade nunca terminaria; "attached" é o estado que existe.
    await page.waitForSelector("#statement-file-input", { state: "attached" });
    await page.setInputFiles("#statement-file-input", {
      name: "extrato-longo.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(["data;descricao;valor"].concat(
        Array.from({ length: 60 }, (_, i) => `${String((i % 28) + 1).padStart(2, "0")}/08/2026;COMPRA ${i + 1} MERCADO LTDA;-${10 + i},00`),
      ).join("\n"), "utf8"),
    });
    await page.waitForSelector(".import-row");
    const linhas = await page.locator(".import-row").count();
    assert(linhas === 60, `o extrato deveria abrir com 60 linhas, veio com ${linhas}`);

    const medida = await page.evaluate(() => {
      const raiz = document.getElementById("app");
      let redesenhos = 0;
      const observador = new MutationObserver((registros) => {
        registros.forEach((r) => { if (r.target === raiz && r.type === "childList") redesenhos += 1; });
      });
      observador.observe(raiz, { childList: true });

      const lista = () => document.querySelector(".import-list");
      lista().scrollTop = 900;
      const rolagemAntes = Math.round(lista().scrollTop);
      ["30", "31", "32"].forEach((id) => document.querySelector(`[data-action="import-toggle"][data-id="${id}"]`).click());
      const seletor = document.querySelector('[data-action-select="import-record-type"][data-id="33"]');
      const tinhaSeletor = !!seletor;
      if (seletor) {
        seletor.value = "transfer";
        seletor.dispatchEvent(new Event("change", { bubbles: true }));
      }
      observador.disconnect();
      const marcadas = document.querySelectorAll(".import-row .checkbox.checked").length;
      return {
        redesenhos,
        rolagemAntes,
        rolagemDepois: Math.round(lista().scrollTop),
        linhasNaTela: document.querySelectorAll(".import-row").length,
        botao: ((document.getElementById("import-confirm-btn") || {}).textContent || "").replace(/\s+/g, " ").trim(),
        tinhaSeletor,
        virouTransferencia: !!document.querySelector('[data-action-select="import-transfer-account"][data-id="33"]'),
        marcadas,
      };
    });

    assert(medida.redesenhos === 0, `mexer nas linhas redesenhou o aplicativo ${medida.redesenhos} vez(es)`);
    assert(medida.rolagemDepois === medida.rolagemAntes,
      `a lista saiu de ${medida.rolagemAntes} para ${medida.rolagemDepois}`);
    assert(medida.linhasNaTela === 60, "a lista perdeu linhas durante o remendo");
    assert(medida.tinhaSeletor, "a escolha do tipo de registro não apareceu; faltou a segunda conta ativa");
    assert(medida.virouTransferencia, "a linha não virou transferência ao trocar o tipo");
    // Uma das linhas marcadas virou transferência, então ela sai da contagem de
    // lançamentos e entra na de transferências.
    const esperado = `Importar ${medida.marcadas - 1} lançamentos e 1 transferência`;
    assert(medida.botao === esperado, `o botão diz "${medida.botao}" e deveria dizer "${esperado}"`);

    await page.evaluate(() => document.querySelector('[data-action="import-cancel"]').click());
    await page.waitForSelector(".import-row", { state: "detached" });
    await page.evaluate(() => CofreUI.test.navigate("dashboard"));
    assert(shared.pageErrors.length === 0, `erros no navegador: ${shared.pageErrors.join("; ")}`);
  });

  // O EXTRATO PRECISA ENTRAR MESMO QUE O APP REDESENHE COM O SELETOR ABERTO.
  //
  // No iPhone o Safari congela temporizadores e sincronização enquanto o app
  // Arquivos está na frente e solta tudo de uma vez na volta. Se o `<input>`
  // morar dentro de `#app`, esse redesenho o destrói e o `change` chega num nó
  // solto: dava para escolher o extrato e a tela não mudava. Só o navegador de
  // verdade prova o conserto, porque o que importa é o campo ser o MESMO nó
  // antes e depois do redesenho.
  await test("o extrato entra mesmo com o app redesenhando durante a escolha", async () => {
    const page = shared.page;
    await page.evaluate(() => CofreUI.test.navigate("import"));
    await page.waitForSelector("#statement-file-input", { state: "attached" });

    const campo = await page.evaluate(async () => {
      const antes = document.getElementById("statement-file-input");
      const foraDoApp = !!antes && !antes.closest("#app");
      // A rajada de redesenhos que a volta do seletor provoca no iPhone.
      CofreUI.test.navigate("dashboard");
      CofreUI.test.navigate("analytics");
      CofreUI.test.navigate("import");
      await new Promise((resolve) => setTimeout(resolve, 60));
      const depois = document.getElementById("statement-file-input");
      return { foraDoApp, mesmoNo: antes === depois && antes.isConnected };
    });
    assert(campo.foraDoApp, "o campo de arquivo voltou para dentro de #app e será destruído por render()");
    assert(campo.mesmoNo, "o campo de arquivo não sobreviveu ao redesenho; o change chegaria num nó solto");

    await page.setInputFiles("#statement-file-input", {
      name: "extrato-volta.csv",
      mimeType: "text/csv",
      buffer: Buffer.from([
        "data;descricao;valor",
        "02/08/2026;PIX ENVIADO JOAO DA SILVA;-150,00",
        "05/08/2026;SALARIO AGOSTO;3200,00",
      ].join("\n"), "utf8"),
    });
    await page.waitForSelector(".import-row");
    const linhas = await page.locator(".import-row").count();
    assert(linhas === 2, `o extrato deveria abrir com 2 linhas, veio com ${linhas}`);

    await page.evaluate(() => document.querySelector('[data-action="import-cancel"]').click());
    await page.waitForSelector(".import-row", { state: "detached" });
    await page.evaluate(() => CofreUI.test.navigate("dashboard"));
    assert(shared.pageErrors.length === 0, `erros no navegador: ${shared.pageErrors.join("; ")}`);
  });

  // O ARQUIVO ESCOLHIDO NÃO PODE SER SOLTO ANTES DE TER SIDO LIDO.
  //
  // No iPhone o `File` não é o arquivo: é um ponteiro para a cópia temporária
  // que o app Arquivos deixou na área do Safari, e ela morre junto com a
  // `FileList`. Limpar o campo logo depois de disparar a leitura (o gesto que
  // permite escolher o MESMO arquivo de novo) soltava essa lista com a leitura
  // ainda em curso, e o extrato batia sempre em "Não foi possível ler o
  // arquivo. Tente selecioná-lo novamente." — no aparelho, todas as vezes.
  //
  // O teste encena a regra do iPhone: a leitura só termina no próximo ciclo e
  // falha se o campo tiver sido limpo nesse meio-tempo. Com a limpeza no lugar
  // antigo o extrato não abre; com ela depois da leitura, abre.
  await test("o extrato é lido antes de o campo ser limpo", async () => {
    const page = shared.page;
    await page.evaluate(() => CofreUI.test.navigate("import"));
    await page.waitForSelector("#statement-file-input", { state: "attached" });

    await page.evaluate(() => {
      const campo = document.getElementById("statement-file-input");
      const arrayBufferOriginal = Blob.prototype.arrayBuffer;
      const readAsOriginal = FileReader.prototype.readAsArrayBuffer;
      const arquivoSumiu = () => campo.value === "";
      Blob.prototype.arrayBuffer = function () {
        const bytes = arrayBufferOriginal.call(this);
        return new Promise((resolve, reject) => setTimeout(() => {
          if (arquivoSumiu()) reject(new DOMException("The operation could not be completed", "NotReadableError"));
          else bytes.then(resolve, reject);
        }, 0));
      };
      FileReader.prototype.readAsArrayBuffer = function (blob) {
        setTimeout(() => {
          if (arquivoSumiu()) this.dispatchEvent(new Event("error"));
          else readAsOriginal.call(this, blob);
        }, 0);
      };
      window.__devolveLeituraNormal = () => {
        Blob.prototype.arrayBuffer = arrayBufferOriginal;
        FileReader.prototype.readAsArrayBuffer = readAsOriginal;
        delete window.__devolveLeituraNormal;
      };
    });

    try {
      await page.setInputFiles("#statement-file-input", {
        name: "extrato-iphone.csv",
        mimeType: "text/csv",
        buffer: Buffer.from([
          "data;descricao;valor",
          "03/08/2026;MERC BOM JESUS;-84,90",
          "07/08/2026;SALARIO AGOSTO;3200,00",
        ].join("\n"), "utf8"),
      });
      await page.waitForSelector(".import-row", { timeout: 5000 });
      const linhas = await page.locator(".import-row").count();
      assert(linhas === 2, `o extrato deveria abrir com 2 linhas, veio com ${linhas}`);
      const erro = await page.locator(".inline-error").count();
      assert(erro === 0, "a importação mostrou erro de leitura com o arquivo em mãos");
      // E o campo TEM de acabar limpo, ou escolher o mesmo arquivo de novo não
      // dispara `change` nenhum e a tela fica muda na segunda tentativa.
      const limpo = await page.evaluate(() => document.getElementById("statement-file-input").value === "");
      assert(limpo, "o campo de arquivo ficou preso no extrato anterior");
    } finally {
      await page.evaluate(() => { if (window.__devolveLeituraNormal) window.__devolveLeituraNormal(); });
    }

    await page.evaluate(() => document.querySelector('[data-action="import-cancel"]').click());
    await page.waitForSelector(".import-row", { state: "detached" });
    await page.evaluate(() => CofreUI.test.navigate("dashboard"));
    assert(shared.pageErrors.length === 0, `erros no navegador: ${shared.pageErrors.join("; ")}`);
  });

  // O PDF PRECISA SER LIDO EM SAFARI SEM ITERAÇÃO ASSÍNCRONA DE FLUXO.
  //
  // `page.getTextContent()` do PDF.js junta os pedaços do texto com
  // `for await (const pedaco of fluxo)`, e iterar um `ReadableStream` assim só
  // existe no Safari a partir da versão 18.4. No iPhone de quem não atualizou, a
  // fatura morria em "undefined is not a function" e a tela só sabia dizer que
  // não foi possível ler o arquivo. Chrome, Firefox e o Safari novo têm o
  // recurso, então o defeito não aparecia em teste nenhum: é preciso TIRAR o
  // recurso do navegador para que ele apareça.
  //
  // O importador passou a ler pelo `getReader()`, que é a interface de sempre do
  // `ReadableStream`. Com o código antigo este teste reprova.
  await test("a fatura em PDF abre em navegador sem iteração assíncrona de fluxo", async () => {
    const semIterador = await openFresh(browser, { width: 390, height: 844 }, {}, () => {
      try { delete ReadableStream.prototype[Symbol.asyncIterator]; } catch (erro) { /* já não existia */ }
    });
    try {
      const tinha = await semIterador.page.evaluate(
        () => typeof ReadableStream.prototype[Symbol.asyncIterator] === "function");
      assert(!tinha, "o recurso não foi removido; o teste não estaria exercitando nada");

      await completeOnboarding(semIterador.page);
      await semIterador.page.evaluate(() => CofreUI.test.navigate("import"));
      await semIterador.page.waitForSelector("#statement-file-input", { state: "attached" });

      const fatura = PdfWriter.createPdfDocument({ title: "Fatura Santander" });
      fatura.text("Santander", 40, 60, { size: 12, bold: true });
      fatura.text("Fatura do cartao", 40, 80, { size: 10 });
      fatura.text("Vencimento 10/09/2026", 40, 100, { size: 10 });
      fatura.text("18/08 MERCADO SAO JOSE 123,45", 40, 130, { size: 10 });
      fatura.text("19/08 Estorno LOJA TESTE -20,00", 40, 150, { size: 10 });
      await semIterador.page.setInputFiles("#statement-file-input", {
        name: "fatura.pdf", mimeType: "application/pdf", buffer: Buffer.from(fatura.build()),
      });

      await semIterador.page.waitForSelector(".import-row", { timeout: 20000 });
      const linhas = await semIterador.page.locator(".import-row").count();
      assert(linhas === 2, `a fatura deveria abrir com 2 linhas, veio com ${linhas}`);
      // O aviso de destino ("cadastre um cartão") é esperado nesta base; o que
      // não pode aparecer é a falha de leitura.
      const falhouALeitura = await semIterador.page.evaluate(
        () => document.body.innerText.includes("Não foi possível ler o arquivo"));
      assert(!falhouALeitura, "a leitura do PDF falhou onde o fluxo não se deixa iterar");
      assert(semIterador.pageErrors.length === 0, `erros no navegador: ${semIterador.pageErrors.join("; ")}`);
    } finally {
      await semIterador.context.close();
    }
  });

  // O APP INSTALADO NA TELA DE INÍCIO RECEBE A TELA INTEIRA.
  //
  // No Safari o navegador ocupa o entalhe, a barra de status e a faixa do risco
  // de arrastar com a barra dele, e `env(safe-area-inset-*)` chega quase sempre
  // zerado. Instalado, não há barra nenhuma: o aplicativo é o único responsável
  // por não escrever embaixo do relógio nem atrás do entalhe. Um recuo esquecido
  // só aparece no aparelho de alguém, e foi assim que apareceu.
  //
  // Os quatro recuos passam por `--sa-*` (css/base.css) justamente para poderem
  // ser trocados aqui: `env()` não se sobrescreve, e sem isso este teste não
  // existiria.
  await test("app instalado respeita entalhe, barra de status e risco de arrastar", async () => {
    const page = shared.page;
    const simular = (t, b, l, r) => page.evaluate(([top, bottom, left, right]) => {
      let el = document.getElementById("sim-standalone");
      if (!el) { el = document.createElement("style"); el.id = "sim-standalone"; document.head.appendChild(el); }
      el.textContent = `:root{--sa-top:${top}px;--sa-bottom:${bottom}px;--sa-left:${left}px;--sa-right:${right}px;}`;
    }, [t, b, l, r]);

    const invasores = (ladoTop, ladoBottom, ladoLeft, ladoRight) => page.evaluate(([sTop, sBottom, sLeft, sRight]) => {
      const H = window.innerHeight, W = window.innerWidth;
      const fora = [];
      document.querySelectorAll("#app *").forEach((node) => {
        if (getComputedStyle(node).position !== "fixed") return;
        const r = node.getBoundingClientRect();
        if (r.height === 0 || r.width === 0) return;
        // O atalho de pular fica estacionado ACIMA da tela até o teclado revelá-lo
        // (`translateY(-260%)`), deixando uma sobra de poucos pixels assomando no
        // topo. Quem está quase todo fora da viewport não disputa borda com
        // ninguém, e medi-lo aqui só produziria falso positivo. A posição do
        // atalho revelado é conferida logo abaixo, que é quando ela existe.
        const visivel = Math.min(r.bottom, H) - Math.max(r.top, 0);
        if (visivel < r.height / 2) return;
        if (r.bottom > H - sBottom || r.top < sTop || r.left < sLeft - 1 || W - r.right < sRight - 1) {
          fora.push(String(node.className || node.tagName).slice(0, 40));
        }
      });
      const tela = document.querySelector(".main-content .screen");
      const caixa = tela ? tela.getBoundingClientRect() : null;
      return {
        fixos: fora,
        telaEsquerda: caixa ? Math.round(caixa.left) : null,
        telaDireita: caixa ? Math.round(W - caixa.right) : null,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    }, [ladoTop, ladoBottom, ladoLeft, ladoRight]);

    // Em pé: barra de status em cima, risco de arrastar embaixo.
    await page.setViewportSize({ width: 393, height: 852 });
    await simular(59, 34, 0, 0);
    for (const aba of ["dashboard", "analytics", "add", "settings", "import"]) {
      await page.evaluate((destino) => CofreUI.test.navigate(destino), aba);
      await page.evaluate(() => window.scrollTo(0, 0));
      const m = await invasores(59, 34, 0, 0);
      assert(m.fixos.length === 0, `em pé, "${aba}" deixa elemento fixo na borda insegura: ${m.fixos.join(", ")}`);
      assert(m.overflowX <= 2, `em pé, "${aba}" ganhou rolagem horizontal de ${m.overflowX}px`);
    }

    // Deitado: o entalhe come uma lateral inteira. O iOS ignora o `orientation`
    // do manifesto para app de tela de início, então esta orientação acontece.
    await page.setViewportSize({ width: 852, height: 393 });
    await simular(0, 21, 59, 59);
    for (const aba of ["dashboard", "analytics", "settings"]) {
      await page.evaluate((destino) => CofreUI.test.navigate(destino), aba);
      await page.evaluate(() => window.scrollTo(0, 0));
      const m = await invasores(0, 21, 59, 59);
      assert(m.fixos.length === 0, `deitado, "${aba}" deixa elemento fixo embaixo do entalhe: ${m.fixos.join(", ")}`);
      assert(m.telaEsquerda === null || m.telaEsquerda >= 58, `deitado, "${aba}" começa em ${m.telaEsquerda}px e o entalhe ocupa 59px`);
      assert(m.telaDireita === null || m.telaDireita >= 58, `deitado, "${aba}" encosta na faixa direita (${m.telaDireita}px)`);
    }

    // O atalho de pular é o primeiro elemento que o teclado revela, e ele é
    // fixo no alto: sem recuo, aparecia por cima do relógio no app instalado.
    await page.setViewportSize({ width: 393, height: 852 });
    await simular(59, 34, 0, 0);
    await page.evaluate(() => CofreUI.test.navigate("dashboard"));
    // Tab de verdade, e não `.focus()`: o atalho só desce em `:focus-visible`
    // (ver css/utilities.css), justamente para que encostar na tela não o revele.
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press("Tab");
    // O atalho desce por transição (`transition: transform`, css/utilities.css).
    // Medir no mesmo quadro da Tab pega o retângulo de ANTES do movimento, que é
    // o de fora da tela: a espera aqui é o fim da descida, não o foco. Se ele não
    // descer, a espera estoura e a asserção seguinte é que reprova.
    await page.waitForFunction(() => {
      const link = document.querySelector(".skip-link");
      if (!link) return false;
      // A descida terminou quando o deslocamento volta a zero. Esperar pela
      // POSIÇÃO seria esperar pelo que a asserção mede; esperar pelo fim do
      // movimento deixa a medida acontecer com o atalho parado.
      const t = getComputedStyle(link).transform;
      return t === "none" || t === "matrix(1, 0, 0, 1, 0, 0)";
    }, null, { timeout: 2000 }).catch(() => {});
    const atalho = await page.evaluate(() => {
      const link = document.querySelector(".skip-link");
      if (!link) return null;
      const r = link.getBoundingClientRect();
      return { top: Math.round(r.top), left: Math.round(r.left), revelado: r.top >= 0 };
    });
    assert(atalho && atalho.revelado, "a primeira Tab não revelou o atalho de pular");
    assert(atalho && atalho.top >= 59, `o atalho de pular aparece em ${atalho && atalho.top}px, por cima da barra de status`);

    // A faixa da barra de status do app instalado é pintada pela etiqueta
    // `theme-color`, e o tema é escolha da pessoa, não do sistema.
    const cores = await page.evaluate(async () => {
      const ler = () => document.querySelector('meta[name="theme-color"]').getAttribute("content");
      const espera = () => new Promise((r) => setTimeout(r, 60));
      CofreUI.test.theme("light"); await espera();
      const claro = ler();
      CofreUI.test.theme("dark"); await espera();
      const escuro = ler();
      CofreUI.test.theme("light"); await espera();
      return { claro, escuro, etiquetas: document.querySelectorAll('meta[name="theme-color"]').length };
    });
    assert(cores.etiquetas === 1, `deve haver uma etiqueta theme-color, há ${cores.etiquetas}`);
    assert(cores.claro !== cores.escuro, `a cor da barra não acompanhou o tema (${cores.claro} nos dois)`);

    await page.evaluate(() => document.getElementById("sim-standalone")?.remove());
    await page.setViewportSize({ width: 390, height: 900 });
    await page.evaluate(() => CofreUI.test.navigate("dashboard"));
    assert(shared.pageErrors.length === 0, `erros no navegador: ${shared.pageErrors.join("; ")}`);
  });

  await test("320, 390, 768, 1440, zoom de 200% e temas não quebram a página", async () => {
    const page = shared.page;
    await page.evaluate(() => CofreUI.test.navigate("dashboard"));
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert(overflow <= 2, `houve rolagem horizontal em ${width}px`);
    }
    // Em 200% de zoom, uma janela física de 780 px entrega cerca de 390 CSS px
    // ao layout. Repetimos essa largura e dobramos o texto para também cobrir
    // o redimensionamento exigido pela WCAG, sem usar a propriedade CSS `zoom`,
    // que amplia a página sem recalcular o viewport e não simula o navegador.
    await page.setViewportSize({ width: 390, height: 900 });
    await page.evaluate(() => { document.body.style.fontSize = "32px"; });
    const zoomOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const overflowSources = zoomOverflow > 2 ? await page.evaluate(() => Array.from(document.querySelectorAll("body *")).map((node) => {
      const rect = node.getBoundingClientRect();
      return { tag: node.tagName, cls: node.className || "", right: Math.round(rect.right), width: Math.round(rect.width) };
    }).filter((item) => item.right > document.documentElement.clientWidth + 2).sort((a, b) => b.right - a.right).slice(0, 5)) : [];
    assert(zoomOverflow <= 2, `houve rolagem horizontal com zoom de 200%: ${JSON.stringify(overflowSources)}`);
    await page.evaluate(() => { document.body.style.fontSize = ""; CofreUI.test.theme("dark"); });
    assert(await page.locator("html").getAttribute("data-theme") === "dark", "tema escuro não foi aplicado");
    await page.evaluate(() => CofreUI.test.theme("light"));
    assert(await page.locator("html").getAttribute("data-theme") === "light", "tema claro não foi aplicado");
    const styleProblems = await page.evaluate(() => ({
      inline: document.querySelectorAll("#app [style]").length,
      pending: document.querySelectorAll("#app [data-ui-css]").length,
      rejected: document.querySelectorAll("#app [data-ui-style-rejected]").length,
    }));
    assert(styleProblems.inline === 0 && styleProblems.pending === 0 && styleProblems.rejected === 0, `estilos calculados não foram consolidados: ${JSON.stringify(styleProblems)}`);
    assert(shared.pageErrors.length === 0, `erros no navegador: ${shared.pageErrors.join("; ")}`);
  });

  await test("320 px mantém doca, assistente e controles sem corte nem sobreposição", async () => {
    const touch = await openFresh(browser, { width: 320, height: 844 }, { hasTouch: true });
    const page = touch.page;
    const intersection = (a, b) => ({
      width: Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)),
      height: Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)),
    });

    try {
      await completeOnboarding(page);
      const shell = await page.evaluate(() => {
        const rect = (node) => {
          const box = node.getBoundingClientRect();
          return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
        };
        const labels = Array.from(document.querySelectorAll(".bottom-nav__item span, .bottom-nav__fab-label"));
        return {
          documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          clipped: labels.filter((node) => node.scrollWidth > node.clientWidth + 1).map((node) => ({
            text: node.textContent.trim(), clientWidth: node.clientWidth, scrollWidth: node.scrollWidth,
          })),
          nav: rect(document.querySelector(".bottom-nav")),
          launcher: rect(document.querySelector(".assistant-launcher")),
        };
      });
      assert(shell.documentOverflow === 0, `houve rolagem horizontal em 320px: ${shell.documentOverflow}px`);
      assert(shell.clipped.length === 0, `a doca cortou rótulos: ${JSON.stringify(shell.clipped)}`);
      const navOverlap = intersection(shell.nav, shell.launcher);
      assert(navOverlap.width === 0 || navOverlap.height === 0,
        `o assistente cobriu a doca: ${JSON.stringify(navOverlap)}`);

      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const end = await page.evaluate(() => {
        const rect = (node) => {
          const box = node.getBoundingClientRect();
          return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
        };
        return {
          launcher: rect(document.querySelector(".assistant-launcher")),
          content: rect(document.querySelector(".screen > :last-child")),
        };
      });
      const contentOverlap = intersection(end.launcher, end.content);
      assert(contentOverlap.width === 0 || contentOverlap.height === 0,
        `o assistente cobriu o último conteúdo: ${JSON.stringify(contentOverlap)}`);

      await page.evaluate(() => CofreUI.test.navigate("privacy"));
      await page.waitForSelector(".tool-links");
      const privacyLayout = await page.evaluate(() => ({
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        toolLinksOverflow: Array.from(document.querySelectorAll(".tool-links")).map((links) => {
          const parent = links.getBoundingClientRect();
          const children = Array.from(links.children).map((node) => {
            const child = node.getBoundingClientRect();
            return { left: child.left, right: child.right };
          });
          return {
            clientWidth: links.clientWidth,
            scrollWidth: links.scrollWidth,
            childOutside: children.some((child) => child.left < parent.left - 1 || child.right > parent.right + 1),
          };
        }).filter((item) => item.scrollWidth > item.clientWidth + 1 || item.childOutside),
      }));
      assert(privacyLayout.documentOverflow === 0,
        `Privacidade criou rolagem horizontal: ${privacyLayout.documentOverflow}px`);
      assert(privacyLayout.toolLinksOverflow.length === 0,
        `os controles excederam .tool-links: ${JSON.stringify(privacyLayout.toolLinksOverflow)}`);
      assert(touch.pageErrors.length === 0, `erros no navegador móvel: ${touch.pageErrors.join("; ")}`);
    } finally {
      await touch.context.close();
    }
  });

  await test("privacidade bloqueia IA e exclusão exige APAGAR", async () => {
    const page = shared.page;
    await page.evaluate(() => CofreUI.test.navigate("privacy"));
    await page.waitForSelector('[data-action="privacy-ai-mode"][data-value="blocked"]');
    assert((await page.locator("h1").textContent()).includes("Privacidade"), "a central de privacidade não abriu");

    const inventory = page.locator(".legal-inventory");
    assert(await inventory.locator(".legal-inventory__group").count() === 3, "o inventário não separou aparelho, conta e serviços externos");
    assert(await inventory.locator(".legal-inventory__item").count() === 14, "o inventário não mostrou os 14 fluxos");
    const firstInventoryItem = inventory.locator(".legal-inventory__item").first();
    await firstInventoryItem.locator("summary").click();
    assert(await firstInventoryItem.getAttribute("open") !== null, "o item do inventário não abriu");
    assert(await firstInventoryItem.locator("dt").count() === 6, "o item não mostrou as seis dimensões do tratamento");

    const thirdParties = page.locator(".legal-third-parties");
    assert(await thirdParties.locator(".legal-third-parties__group").count() === 3, "o registro não separou infraestrutura, serviços acionados e pendência");
    assert(await thirdParties.locator(".legal-third-party").count() === 6, "o registro não mostrou os cinco serviços e o SMTP pendente");
    assert(await thirdParties.locator(".legal-third-party--pending").count() === 1, "o fornecedor de email não apareceu como única pendência");
    const anthropic = thirdParties.locator(".legal-third-party").filter({ hasText: "Anthropic" }).first();
    await anthropic.locator("summary").click();
    assert(await anthropic.getAttribute("open") !== null, "o detalhe da Anthropic não abriu");
    assert(await anthropic.locator("dt").count() === 6, "o serviço não mostrou uso, dados, retenção, exclusão e transferência");
    assert(await anthropic.locator(".source-links a").count() === 2, "o serviço não mostrou política e fonte oficial");

    const blocked = page.locator('[data-action="privacy-ai-mode"][data-value="blocked"]');
    await blocked.click();
    assert(await blocked.getAttribute("aria-checked") === "true", "o bloqueio da IA não foi gravado");

    await page.locator('[data-action="privacy-delete-all"]').click();
    const dialog = page.locator('[role="alertdialog"]');
    await dialog.waitFor();
    const confirm = dialog.locator('[data-action="confirmation-accept"]');
    assert(await confirm.isDisabled(), "a exclusão ficou disponível sem a frase de segurança");
    await dialog.locator("#confirmation-required-input").fill("apagar");
    assert(await confirm.isDisabled(), "a confirmação aceitou texto com caixa incorreta");
    await dialog.locator("#confirmation-required-input").fill("APAGAR");
    assert(await confirm.isEnabled(), "a frase APAGAR não liberou a exclusão");
    await confirm.click();
    await page.waitForSelector('[role="dialog"][aria-label="Configuração inicial"]');
    const snapshot = await page.evaluate(() => CofreUI.test.snapshot());
    assert(snapshot.transactionCount === 0 && snapshot.accountCount === 0 && snapshot.goalCount === 0, "a exclusão não limpou os dados financeiros");
  });

  await shared.context.close();
  await browser.close();
  server.close();
  const failures = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failures.length} passaram, ${failures.length} falharam.`);
  process.exit(failures.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  server.close();
  process.exit(1);
});
