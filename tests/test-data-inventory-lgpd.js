"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

let pass = 0;
let fail = 0;
function check(label, condition, detail) {
  if (condition) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail == null ? "" : `: ${detail}`}`); }
}

const ctx = {
  console, module: { exports: {} }, setTimeout, clearTimeout,
  indexedDB: undefined, localStorage: undefined,
  document: { addEventListener() {}, visibilityState: "visible" },
  navigator: { userAgent: "node" }, addEventListener() {}, removeEventListener() {},
};
ctx.window = ctx;
ctx.self = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
["js/utils.js", "js/rules.js", "js/layout.js", "js/storage.js"].forEach((file) => {
  vm.runInContext(read(file), ctx, { filename: file });
});
const run = (code) => vm.runInContext(code, ctx);
const inventory = JSON.parse(run("JSON.stringify(LEGAL_DATA_INVENTORY)"));
const byId = Object.fromEntries(inventory.map((item) => [item.id, item]));
const fields = ["data", "purpose", "storage", "retention", "access", "thirdParties", "deletion"];

console.log("\n1. Estrutura obrigatória do inventário");
check("inventário possui 14 fluxos distintos", inventory.length === 14, inventory.length);
check("todos os identificadores são únicos", new Set(inventory.map((item) => item.id)).size === inventory.length);
check("as sete dimensões estão declaradas", inventory.every((item) => fields.every((field) => typeof item[field] === "string" && item[field].trim().length >= 12)));
check("validador não encontra lacunas", run("legalDataInventoryGaps(LEGAL_DATA_INVENTORY).length") === 0, run("legalDataInventoryGaps(LEGAL_DATA_INVENTORY).join('; ')"));
check("validador encontra campo e grupo ausentes", run("legalDataInventoryGaps([{id:'teste',data:'dados suficientes'}]).length") === 7);
check("validador encontra id repetido", run("legalDataInventoryGaps([LEGAL_DATA_INVENTORY[0], LEGAL_DATA_INVENTORY[0]]).some((gap) => gap.includes('repetido'))") === true);
check("todos os grupos possuem itens", run("LEGAL_DATA_INVENTORY_GROUPS.every((group) => LEGAL_DATA_INVENTORY.some((item) => item.group === group.id))") === true);

const requiredIds = [
  "local-financial", "local-readable-copies", "synced-financial", "account-session",
  "connected-devices", "rate-limit", "privacy-choices", "local-diagnostics",
  "backend-observations", "ai-requests", "leaked-password-check", "fiscal-lookup",
  "imported-files", "exported-backups",
];
check("todos os fluxos previstos estão cobertos", requiredIds.every((id) => byId[id]), requiredIds.filter((id) => !byId[id]).join(", "));

console.log("\n2. Correspondência com os fluxos implementados");
check("cópias financeiras locais são declaradas como legíveis e sem criptografia",
  /JSON legível/i.test(byId["local-readable-copies"].storage) && /sem criptografia/i.test(byId["local-readable-copies"].storage));
check("uso local não promete envio de dados", /Nenhum no uso local/.test(byId["local-financial"].thirdParties));
check("sincronização declara lápides, checkpoints e recibos",
  /24 meses/.test(byId["synced-financial"].retention) && /5 versões/.test(byId["synced-financial"].retention) && /30 dias/.test(byId["synced-financial"].retention));
check("privacidade é corretamente descrita como sincronizável",
  /sincronização/.test(byId["privacy-choices"].storage) && /"privacy"/.test(read("netlify/functions/_shared/finance-schema.js")));
check("rate limit descreve a limpeza executada depois de um dia",
  /depois de 1 dia/.test(byId["rate-limit"].retention) && /updated_at < now\(\) - interval '1 day'/.test(read("supabase/migrations/202608180002_rate_limit.sql")));
check("diagnóstico local mantém 30 dias e 50 ocorrências",
  /30 dias/.test(byId["local-diagnostics"].retention) && /50 ocorrências/.test(byId["local-diagnostics"].retention));

const observability = read("netlify/functions/_shared/observability.js");
check("observações do backend não prometem prazo desconhecido",
  /1 hora no Hobby/.test(byId["backend-observations"].retention) && /plano efetivo/.test(byId["backend-observations"].retention));
check("inventário de observação acompanha somente o evento controlado",
  ["area", "operation", "method", "status", "code", "durationMs", "requestId"].every((field) => new RegExp(`\\b${field}\\b`).test(observability))
    && /evento controlado.{0,80}sem corpo, cabeçalhos, cookies, IP, email/.test(byId["backend-observations"].storage));
check("metadados normais da hospedagem não são escondidos", /metadados normais da conexão/.test(byId["backend-observations"].storage));

check("IA distingue descarte do app e retenção pública do provedor",
  /descarta/.test(byId["ai-requests"].retention) && /até 30 dias/.test(byId["ai-requests"].retention));
check("envio anterior para IA não é anunciado como reversível",
  /não consegue desfazer nem apagar no destino/.test(byId["ai-requests"].deletion));

const leaked = require("../netlify/functions/_shared/senha-vazada.js");
const prefix = leaked.prefixoDe("uma senha de teste");
check("consulta de senha produz prefixo de cinco caracteres", /^[A-F0-9]{5}$/.test(prefix.prefixo) && prefix.sufixo.length === 35);
check("inventário exclui senha, email e IP do usuário no HIBP",
  /não recebe email nem senha/.test(byId["leaked-password-check"].access) && /não o IP do usuário/.test(byId["leaked-password-check"].access));

const qr = read("js/qrcode.js");
check("consulta fiscal continua restrita a HTTPS governamental",
  /url\.protocol === "https:"/.test(qr) && /host\.endsWith\("\.gov\.br"\)/.test(qr));
check("consulta fiscal declara IP e metadados normais da conexão",
  /IP e metadados normais da conexão/.test(byId["fiscal-lookup"].access));

const importSources = read("js/import.js") + read("js/pdf-import.js");
check("importação não possui chamada de rede própria", !/\bfetch\s*\(/.test(importSources));
check("arquivo original é declarado como local e transitório",
  /não é enviado/.test(byId["imported-files"].storage) && /apenas durante o fluxo/.test(byId["imported-files"].retention));
check("exclusão no app não promete apagar backup exportado",
  /não apaga arquivos já exportados/.test(byId["exported-backups"].deletion));

console.log("\n3. Política, documentação e lançamento");
const privacy = read("js/screens/privacy.js");
const css = read("css/screens/legal.css");
const launch = read("docs/LEGAL-LAUNCH.md");
const doc = read("docs/INVENTARIO-DE-DADOS.md");
check("tela renderiza a fonte estruturada por contexto", /LEGAL_DATA_INVENTORY_GROUPS\.map\(renderLegalDataInventoryGroup\)/.test(privacy) && /LEGAL_DATA_INVENTORY\.filter/.test(privacy));
check("tela mostra os seis rótulos do tratamento", ["Finalidade", "Onde fica", "Retenção", "Quem acessa", "Terceiros", "Como excluir"].every((label) => privacy.includes(label)));
check("inventário expansível possui estilo próprio", /\.legal-inventory__item summary/.test(css));
check("tela avisa sobre cópias locais legíveis", /JSON legível e sem criptografia/.test(privacy));
check("documento operacional liga matriz e código", /LEGAL_DATA_INVENTORY/.test(doc) && /## Matriz/.test(doc));
check("documento registra todas as fontes externas", /Supabase/.test(doc) && /Have I Been Pwned/.test(doc) && /Sefaz/.test(doc) && /provedor de IA/.test(doc));
check("pendências de hospedagem e IA continuam abertas", /plano da Vercel/.test(launch) && /contrato efetivo da Anthropic/.test(launch));
check("controlador continua sem dados inventados", run("legalControllerGaps(LEGAL_CONTROLLER).length") === 7);
check("mudança material sobe versão e revisão juntas",
  run("LEGAL_TEXT_VERSION") === "2026-08-31.2" && run("LEGAL_REVIEW_DATE") === "2026-08-31");

console.log(`\n${fail ? "FALHAS ENCONTRADAS" : "TODOS OS TESTES PASSARAM"}: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
