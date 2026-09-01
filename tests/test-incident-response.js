"use strict";

// M20 — o plano de resposta a incidentes só vale se as alavancas que ele manda
// puxar existirem de verdade. Um runbook que cita uma rota, uma variável ou um
// código que já saiu do código é pior que nenhum runbook: ele é seguido no pior
// momento possível. Este teste amarra o documento ao sistema.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const existe = (file) => fs.existsSync(path.join(ROOT, file));

let pass = 0;
let fail = 0;
function check(label, condition, detail) {
  if (condition) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail == null ? "" : `: ${detail}`}`); }
}

const doc = read("SECURITY_INCIDENT_RESPONSE.md");
const observability = read("netlify/functions/_shared/observability.js");
const account = read("netlify/functions/account.js");
const sync = read("netlify/functions/sync.js");
const analyze = read("netlify/functions/analyze.js");
const rateLimit = read("netlify/functions/_shared/rate-limit.js");
const release = read("scripts/check-release.js");
const launch = read("docs/LEGAL-LAUNCH.md");
const pkg = JSON.parse(read("package.json"));

console.log("\n1. Estrutura do procedimento");

const fases = [
  "## 1. Detecção", "## 2. Classificação", "## 3. Contenção", "## 4. Investigação",
  "## 5. Correção", "## 6. Avaliação de impacto", "## 7. Comunicação quando aplicável",
  "## 8. Post-mortem",
];
check("as oito fases existem", fases.every((fase) => doc.includes(fase)));
check("as fases estão na ordem do fluxo",
  fases.map((fase) => doc.indexOf(fase)).every((posicao, i, lista) => i === 0 || posicao > lista[i - 1]));
check("papéis separam quem contém de quem comunica",
  /## Papéis/.test(doc) && /Responsável técnico/.test(doc) && /Controlador/.test(doc) && /Encarregado/.test(doc));
check("existe seção de prazos consolidada", /## Prazos, em um lugar só/.test(doc));
check("existe registro de incidentes, ainda que vazio", /## Registro de incidentes/.test(doc) && /Nenhum incidente registrado/.test(doc));
check("existe post-mortem com destino de arquivo", /docs\/incidentes\//.test(doc));
check("as pendências ficam explícitas", /## Pendências/.test(doc) && /Sem alerta ativo/.test(doc));

console.log("\n2. Sinais de detecção existem no backend");

const codigosCitados = (doc.match(/`([a-z][a-z0-9_]{3,})`/g) || [])
  .map((token) => token.slice(1, -1));
const declarados = new Set((observability.match(/"([a-z_]+)"/g) || []).map((t) => t.slice(1, -1)));
const codigosDeObservacao = [
  "invalid_account_scope", "account_scope_changed", "bad_jwt", "device_revoked",
  "device_authorization_failed", "reauth_failed", "forbidden_origin", "origin_denied",
  "idempotency_mismatch", "invalid_revision", "invalid_commit", "remote_changed",
  "purge_failed", "schema_missing", "upstream_unavailable", "server_error",
  "unhandled", "not_configured", "rate_limited", "rate_limit", "email_rate_limited",
  "leaked_password", "protocol_upgrade_required",
];
codigosDeObservacao.forEach((codigo) => {
  check(`código citado existe no contrato de observação: ${codigo}`,
    doc.includes(`\`${codigo}\``) && declarados.has(codigo));
});
check("o documento usa o mesmo `kind` emitido pelo backend",
  /cofre_observation/.test(doc) && /cofre_observation/.test(observability));
check("as três áreas citadas são as áreas seguras", ["account", "sync", "analyze"]
  .every((area) => doc.includes(`\`${area}\``) && observability.includes(`"${area}"`)));
check("a correlação usa o cabeçalho que o backend emite",
  /X-Request-Id/.test(doc) && /X-Request-Id/i.test(read("netlify/functions/_shared/http.js") + observability + account));
check("a rota de saúde citada existe", /\/api\/sync\/health/.test(doc) && /route === "health"/.test(sync));

console.log("\n3. Alavancas de contenção existem");

check("revogar aparelho e sair dos outros são ações reais",
  /revoke-others/.test(doc) && /revoke-device/.test(doc)
  && /action === "revoke-others"/.test(account) && /action === "revoke-device"/.test(account));
check("o bloqueio de cliente usa a configuração real do protocolo",
  /minimum_write_protocol/.test(doc) && /cofre_sync_config/.test(doc)
  && /minimum_write_protocol/.test(sync) && /cofre_sync_config/.test(sync));
check("o bloqueio devolve 426 e não descarta a fila",
  /\*\*426\*\*/.test(doc) && /mantém a fila local/.test(doc)
  && /statusCode: 426, code: "protocol_upgrade_required"/.test(sync));
check("desligar a IA tem o efeito descrito",
  /NO_API_KEY/.test(doc) && /ANTHROPIC_API_KEY/.test(analyze) && /code: "NO_API_KEY"/.test(analyze));
check("as variáveis de rotação existem no backend",
  ["SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY", "RATE_LIMIT_SECRET", "ALLOWED_ORIGIN"]
    .every((chave) => doc.includes(chave)
      && (account + sync + analyze + rateLimit).includes(`process.env.${chave}`)));
check("as RPCs privilegiadas citadas existem",
  ["cofre_purge_account", "cofre_reset_data", "cofre_apply_ops"]
    .every((rpc) => doc.includes(rpc) && (account + sync).includes(rpc)));
check("o retorno de publicação aponta para o procedimento existente",
  /docs\/RELEASE\.md/.test(doc) && existe("docs/RELEASE.md") && /Promote to Production/.test(read("docs/RELEASE.md")));
check("o documento avisa que rollback de servidor não alcança o cliente",
  /Não reverte o cliente/.test(doc) && /service-worker\.js/.test(doc)
  && /const VERSION = "v\d+";/.test(read("service-worker.js")));

console.log("\n4. O que nunca é contenção");

check("proíbe afrouxar RLS, policy e grant", /Desabilitar RLS, apagar policy ou afrouxar grant/.test(doc));
check("proíbe purgar ou resetar dado de terceiro", /sem pedido do titular/.test(doc));
check("protege o dado local do visitante", /o aparelho é a única cópia/.test(doc));
check("proíbe editar migration histórica e baixar versão",
  /Editar migration histórica/.test(doc) && /SCHEMA_VERSION/.test(doc));
check("proíbe expor service_role e versionar segredo", /Expor `service_role` no frontend/.test(doc));
check("nenhum segredo real vazou para o documento",
  !/eyJ[A-Za-z0-9_-]{10,}/.test(doc) && !/sk-ant-[A-Za-z0-9_-]{6,}/.test(doc) && !/service_role[^\n]{0,20}=/.test(doc));

console.log("\n5. Investigação e correção usam o que já existe");

check("preservar evidência vem antes de conter", doc.indexOf("Preserve a evidência") < doc.indexOf("Correlacione por"));
check("a janela curta de log está declarada", /1 hora/.test(doc) && /TERCEIROS-E-OPERADORES\.md/.test(doc));
check("o contrato SQL citado existe e é de staging",
  /verify_security_boundary\.sql/.test(doc) && existe("supabase/tests/verify_security_boundary.sql")
  && /staging, não em produção/.test(doc));
check("o molde de teste adversarial citado existe",
  /test-security-adversarial\.js/.test(doc) && existe("tests/test-security-adversarial.js"));
check("as portas obrigatórias são scripts que existem",
  ["lint", "test", "check:build", "check:release", "build:dist", "test:browser", "test:pwa", "check:deploy"]
    .every((script) => doc.includes(`npm run ${script}`) || (script === "test" && doc.includes("`npm test`"))
      ? Object.prototype.hasOwnProperty.call(pkg.scripts, script) : false));
check("exige teste de regressão em S1 e S2", /falha antes da\s*\n?\s*correção/.test(doc));
check("exige migration nova em vez de editar a aplicada", /\*\*migration nova\*\*/.test(doc));

console.log("\n6. Impacto e comunicação");

const ctx = {
  console, module: { exports: {} }, setTimeout, clearTimeout,
  indexedDB: undefined, localStorage: undefined,
  document: { addEventListener() {}, visibilityState: "visible" },
  navigator: { userAgent: "node" }, addEventListener() {}, removeEventListener() {},
};
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
["js/utils.js", "js/rules.js", "js/layout.js", "js/storage.js"].forEach((file) => {
  vm.runInContext(read(file), ctx, { filename: file });
});
const controller = JSON.parse(vm.runInContext("JSON.stringify(LEGAL_CONTROLLER)", ctx));
const inventario = JSON.parse(vm.runInContext("JSON.stringify(LEGAL_DATA_INVENTORY)", ctx));

check("a avaliação de impacto se apoia no inventário do M18",
  /LEGAL_DATA_INVENTORY/.test(doc) && Array.isArray(inventario) && inventario.length >= 14);
check("o impacto separa o que não foi alcançado", /Registre também o que \*\*não\*\* foi alcançado/.test(doc));
check("os campos do controlador citados existem",
  ["dpoName", "dpoEmail", "incidentEmail", "responseDays"]
    .every((campo) => doc.includes(campo) && Object.prototype.hasOwnProperty.call(controller, campo)));
check("o prazo ao titular bate com o código", /15 dias/.test(doc) && controller.responseDays === 15);
check("o marcador pendente do canal de incidente está declarado, não inventado",
  /ainda é um marcador/.test(doc) && controller.incidentEmail === vm.runInContext("LEGAL_PENDING", ctx));
check("o prazo à ANPD vem com ressalva de conferência",
  /3 dias úteis/.test(doc) && /Confira a redação vigente/.test(doc));
check("a comunicação ao titular não expõe detalhe explorável antes da correção",
  /detalhe\s*\n?\s*explorável antes de a correção estar publicada/.test(doc));
check("o post-mortem proíbe dado pessoal e segredo",
  /O post-mortem não guarda dado pessoal/.test(doc));

console.log("\n7. Amarração com o restante do projeto");

check("a publicação exige o procedimento", /SECURITY_INCIDENT_RESPONSE\.md/.test(release));
check("o item 8 do lançamento aponta para o procedimento",
  /SECURITY_INCIDENT_RESPONSE\.md/.test(launch));
check("o README indica onde está o procedimento", /SECURITY_INCIDENT_RESPONSE\.md/.test(read("README.md")));
check("os documentos citados existem",
  ["docs/LEGAL-LAUNCH.md", "docs/INVENTARIO-DE-DADOS.md", "docs/TERCEIROS-E-OPERADORES.md",
    "docs/VERSIONAMENTO.md", "docs/RELEASE.md", "FINANCEMANAGER_AUDIT_PROGRESS.md", "AUDIT_FIX_PROGRESS.md"]
    .every((arquivo) => doc.includes(path.basename(arquivo)) && existe(arquivo)));
check("o canal de divulgação responsável do M21 está ligado ao procedimento",
  /reportar-vulnerabilidade/.test(doc) && /security\.txt/.test(doc)
  && existe("reportar-vulnerabilidade.html") && existe("SECURITY.md"));
check("nenhum código citado ficou fora do contrato de observação",
  codigosCitados.filter((codigo) => codigosDeObservacao.includes(codigo)).every((codigo) => declarados.has(codigo)));

console.log(`\n${fail ? "FALHAS ENCONTRADAS" : "TODOS OS TESTES PASSARAM"}: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
