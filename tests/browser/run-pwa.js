"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawnSync } = require("child_process");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..", "..");
const dist = path.join(root, "dist");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildDist() {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "build-dist.js")], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "build de dist falhou").trim());
}

function safeFile(urlPath) {
  const relative = urlPath.replace(/^\/+/, "");
  const file = path.resolve(dist, relative);
  return file.startsWith(dist + path.sep) ? file : null;
}

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  if (pathname.startsWith("/api/")) {
    response.writeHead(404, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end('{"error":"local_backend_unavailable"}');
    return;
  }
  if (pathname === "/__pwa_seed.html") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end("<!doctype html><title>seed</title>");
    return;
  }
  const mapped = pathname === "/" ? "/landing.html" : (pathname === "/index.html" ? "/app.html" : pathname);
  const file = safeFile(mapped);
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("Not found");
    return;
  }
  const headers = {
    "Content-Type": mime[path.extname(file).toLowerCase()] || "application/octet-stream",
    "Cache-Control": pathname === "/service-worker.js" ? "no-cache" : "no-store",
  };
  response.writeHead(200, headers);
  fs.createReadStream(file).pipe(response);
});

async function completeOnboarding(page) {
  await page.locator('[data-action-select="onb-legal"]').check();
  await page.locator('[data-action="onb-focus"][data-value="month"]').click();
  await page.fill("#onb-name", "Offline");
  await page.locator('[data-action="onb-next"]').click();
  await page.fill("#onb-income", "5000,00");
  await page.locator('[data-action="onb-next"]').click();
  await page.fill("#onb-acc-name", "Conta offline");
  await page.fill("#onb-acc-balance", "2000,00");
  await page.locator('[data-action="onb-next"]').click();
  await page.locator('[data-action="onb-finish"]').click();
  await page.waitForSelector(".main-content");
}

(async () => {
  buildDist();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await page.goto(`${baseUrl}/__pwa_seed.html`);
    await page.evaluate(async () => {
      await caches.open("financas-cache-v0");
      await caches.open("cache-externo-preservado");
    });

    await page.goto(`${baseUrl}/index.html?__test=1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[role="dialog"][aria-label="Configuração inicial"]');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);

    const onlineCaches = await page.evaluate(async () => {
      const names = await caches.keys();
      const entries = {};
      for (const name of names) {
        const cache = await caches.open(name);
        entries[name] = (await cache.keys()).map((request) => new URL(request.url).pathname);
      }
      return { names, entries };
    });
    const shellName = onlineCaches.names.find((name) => name.startsWith("financas-cache-v59-"));
    const pageName = onlineCaches.names.find((name) => name.startsWith("financas-pages-v59-"));
    assert(shellName && pageName, `caches versionados ausentes: ${onlineCaches.names.join(", ")}`);
    assert(!onlineCaches.names.includes("financas-cache-v0"), "cache antigo não foi removido na ativação");
    assert(onlineCaches.names.includes("cache-externo-preservado"), "cache sem prefixo do Cofre foi removido");
    assert(onlineCaches.entries[shellName].includes("/index.html"), "shell não guardou /index.html");
    assert(!onlineCaches.entries[shellName].includes("/"), "landing contaminou o cache do app");
    assert(onlineCaches.entries[pageName].includes("/"), "cache de páginas não guardou a landing");

    await page.evaluate(() => fetch("/api/account/session").catch(() => null));
    const apiCached = await page.evaluate(async () => {
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        if ((await cache.keys()).some((request) => new URL(request.url).pathname.startsWith("/api/"))) return true;
      }
      return false;
    });
    assert(!apiCached, "uma resposta de /api/ entrou no CacheStorage");

    await completeOnboarding(page);
    await context.setOffline(true);
    await page.goto(`${baseUrl}/index.html?__test=1#/privacidade`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.getAttribute("data-module-boot") === "ready");
    await page.waitForFunction(() => document.querySelector("h1")?.textContent.includes("Privacidade"));
    const restored = await page.evaluate(() => CofreUI.test.snapshot());
    assert(restored.monthlyIncome === 5000 && restored.accountCount === 1,
      `dados locais não voltaram offline: ${JSON.stringify(restored)}`);

    await page.goto(`${baseUrl}/?utm_source=offline`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("body.lp");
    assert(await page.locator('a[href="index.html"]').count() >= 1, "landing offline perdeu o acesso ao aplicativo");

    assert(pageErrors.length === 0, `erros de página: ${pageErrors.join("; ")}`);
    console.log("\nPWA real aprovado: shell, landing, dados locais, limpeza e API fora do cache.");
  } finally {
    await context.setOffline(false).catch(() => {});
    await context.close();
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  server.close();
  process.exit(1);
});
