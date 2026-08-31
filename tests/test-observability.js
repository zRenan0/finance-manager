"use strict";

const fs = require("fs");
const path = require("path");
const { observeHandler, requestIdOf, responseCode } = require("../netlify/functions/_shared/observability");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
let pass = 0;
let fail = 0;

function check(label, condition, detail) {
  if (condition) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail == null ? "" : `: ${detail}`}`); }
}

(async () => {
  console.log("\n1. Evento estruturado sem conteúdo sensível");
  const entries = [];
  const ticks = [1000, 1011, 1012];
  const wrapped = observeHandler(
    { area: "account", operation: () => "login" },
    async () => ({
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "UPSTREAM_ERROR",
        email: "renan@example.com",
        token: "segredo-123",
        amount: "R$ 12.345,67",
      }),
    }),
    { emit: (entry) => entries.push(entry), now: () => ticks.shift(), requestId: () => "req_test_1" },
  );
  const response = await wrapped({
    httpMethod: "POST",
    headers: { authorization: "Bearer segredo-123" },
    body: JSON.stringify({ password: "minha-senha", amount: 12345.67 }),
  });
  const serialized = JSON.stringify(entries);
  check("devolve identificador de requisição", response.headers["X-Request-Id"] === "req_test_1");
  check("classifica falha e duração", entries[0].level === "error" && entries[0].status === 502 && entries[0].durationMs === 11);
  check("normaliza o código controlado", entries[0].code === "upstream_error");
  check("não grava corpo, credencial, email ou valor", !/renan|segredo|minha-senha|12\.345|12345/.test(serialized), serialized);
  check("código externo ao contrato não entra no log", responseCode({ body: '{"code":"renansecret"}' }, 500) === "response_error");
  check("identificador enviado pelo cliente é ignorado", requestIdOf({ headers: { "x-nf-request-id": "email_pessoal" } }) !== "email_pessoal");
  check("evento tem somente campos permitidos", Object.keys(entries[0]).sort().join(",") === [
    "area", "at", "code", "durationMs", "kind", "level", "method", "operation", "requestId", "status", "version",
  ].sort().join(","), Object.keys(entries[0]).join(","));

  console.log("\n2. Exceção e entrada externa");
  const failures = [];
  const secret = new Error("Token abc123 e conta Nubank");
  secret.stack = "pilha-secreta";
  const throwing = observeHandler(
    { area: "fora", operation: () => "renan@example.com" },
    async () => { throw secret; },
    { emit: (entry) => failures.push(entry), now: () => 2000, requestId: () => "req_test_2" },
  );
  let thrown = null;
  try { await throwing({ httpMethod: "TRACE" }); } catch (error) { thrown = error; }
  check("relança a exceção original", thrown === secret);
  check("reduz área, operação e método externos", failures[0].area === "unknown" && failures[0].operation === "unknown" && failures[0].method === "OTHER");
  check("exceção vira apenas código unhandled", failures[0].code === "unhandled" && !/abc123|Nubank|pilha-secreta/.test(JSON.stringify(failures[0])));

  console.log("\n3. Cobertura das funções e do cliente");
  const account = require("../netlify/functions/account");
  const sync = require("../netlify/functions/sync");
  const analyze = require("../netlify/functions/analyze");
  const accountResponse = await account.handler({ httpMethod: "GET", path: "/api/account/session", headers: {} });
  const syncResponse = await sync.handler({ httpMethod: "GET", path: "/api/sync/health", headers: { "x-sync-protocol": "3" } });
  const analyzeResponse = await analyze.handler({ httpMethod: "OPTIONS", headers: {} });
  check("conta devolve correlação", /^[-A-Za-z0-9:._]+$/.test(accountResponse.headers["X-Request-Id"] || ""));
  check("sincronização devolve correlação", /^[-A-Za-z0-9:._]+$/.test(syncResponse.headers["X-Request-Id"] || ""));
  check("análise devolve correlação", /^[-A-Za-z0-9:._]+$/.test(analyzeResponse.headers["X-Request-Id"] || ""));

  const safeErrors = read("js/safe-errors.js");
  const auth = read("js/auth.js");
  const app = read("js/app.js");
  const worker = read("service-worker.js");
  check("diagnóstico aceita autenticação, API e Service Worker", /"auth", "api", "service_worker"/.test(safeErrors));
  check("API de conta registra somente falha operacional", /ACCOUNT_OPERATIONAL_ERROR_CODES[\s\S]*reportSafeError\("auth", error, "auth_request"\)/.test(auth));
  check("boot da conta usa a área de autenticação", /reportSafeError\("auth", error, "account_bootstrap"\)/.test(app));
  check("página valida observações do Service Worker", /data\.type !== "COFRE_OBSERVATION"[\s\S]*data\.area !== "service_worker"/.test(app));
  check("Service Worker envia apenas área e código", /postMessage\(\{[\s\S]{0,180}type: "COFRE_OBSERVATION",[\s\S]{0,180}area: "service_worker",[\s\S]{0,180}code,[\s\S]{0,40}\}\)/.test(worker));

  console.log(`\n${fail ? "FALHAS ENCONTRADAS" : "TODOS OS TESTES PASSARAM"}: ${pass} ok, ${fail} falha(s)`);
  process.exit(fail ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
