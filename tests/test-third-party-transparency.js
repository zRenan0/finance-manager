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
const parties = JSON.parse(run("JSON.stringify(LEGAL_THIRD_PARTIES)"));
const byId = Object.fromEntries(parties.map((item) => [item.id, item]));
const required = ["vercel", "supabase", "anthropic", "have-i-been-pwned", "fiscal-portals", "production-smtp"];

console.log("\n1. Registro estruturado");
check("seis entradas cobrem serviços e pendência", parties.length === 6, parties.length);
check("cinco serviços comprovados estão em uso", parties.filter((item) => item.status === "used").length === 5);
check("SMTP é a única entrada pendente", parties.filter((item) => item.status === "pending").map((item) => item.id).join(",") === "production-smtp");
check("todos os identificadores previstos existem", required.every((id) => byId[id]), required.filter((id) => !byId[id]).join(", "));
check("identificadores são únicos", new Set(parties.map((item) => item.id)).size === parties.length);
check("registro válido não tem lacunas", run("legalThirdPartyGaps(LEGAL_THIRD_PARTIES).length") === 0, run("legalThirdPartyGaps(LEGAL_THIRD_PARTIES).join('; ')"));
check("todos os grupos possuem entrada", run("LEGAL_THIRD_PARTY_GROUPS.every((group) => LEGAL_THIRD_PARTIES.some((item) => item.group === group.id))") === true);
check("validador recusa id repetido", run("legalThirdPartyGaps([LEGAL_THIRD_PARTIES[0], LEGAL_THIRD_PARTIES[0]]).some((gap) => gap.includes('repetido'))") === true);
check("validador recusa estado desconhecido", run("legalThirdPartyGaps([{...LEGAL_THIRD_PARTIES[0],status:'outro'}]).some((gap) => gap.includes('status'))") === true);
check("validador recusa URL insegura em serviço ativo", run("legalThirdPartyGaps([{...LEGAL_THIRD_PARTIES[0],privacyUrl:'http://exemplo.com'}]).some((gap) => gap.includes('privacyUrl'))") === true);
check("pendência de lançamento é listada sem fornecedor inventado", run("legalThirdPartyLaunchGaps(LEGAL_THIRD_PARTIES).length") === 1 && byId["production-smtp"].privacyUrl.includes("definir"));

console.log("\n2. Correspondência com as integrações reais");
const vercel = JSON.parse(read("vercel.json"));
check("Vercel está comprovada pela publicação", vercel.outputDirectory === "dist" && !!vercel.functions["api/analyze.js"]);
check("Vercel declara conteúdo processado nas funções", /credenciais/.test(byId.vercel.data) && /registros sincronizados/.test(byId.vercel.data) && /pacote de IA/.test(byId.vercel.data));
check("Vercel distingue processamento de gravação em log", /não registra corpo/.test(byId.vercel.data) && /temporariamente/.test(byId.vercel.data));
check("retenção pública da Vercel preserva a dúvida do plano", /1 hora no plano Hobby/.test(byId.vercel.retention) && /plano efetivo/.test(byId.vercel.retention));

const supabase = read("netlify/functions/_shared/supabase-rest.js");
check("Supabase está comprovada pelas três credenciais de backend", ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"].every((name) => supabase.includes(name)));
check("Supabase enumera conta e dados sincronizados", /Email, senha/.test(byId.supabase.data) && /dados financeiros/.test(byId.supabase.data) && /códigos HMAC/.test(byId.supabase.data));
check("região da Supabase não foi presumida", /não estão no repositório/.test(byId.supabase.transfer));

const analyze = read("netlify/functions/analyze.js");
check("Anthropic está comprovada pela API de mensagens", analyze.includes('fetch("https://api.anthropic.com/v1/messages"'));
check("Anthropic enumera os dois pacotes", /totais mensais/.test(byId.anthropic.data) && /frase digitada/.test(byId.anthropic.data));
check("Anthropic declara padrão e exceções de retenção", /até 30 dias/.test(byId.anthropic.retention) && /política de uso/.test(byId.anthropic.retention) && /retenção zero/.test(byId.anthropic.retention));

const leaked = read("netlify/functions/_shared/senha-vazada.js");
check("HIBP usa range de cinco caracteres com preenchimento", /api\.pwnedpasswords\.com\/range\//.test(leaked) && /Add-Padding/.test(leaked));
check("HIBP exclui senha, hash completo, email e IP do usuário", /cinco primeiros caracteres/.test(byId["have-i-been-pwned"].data) && /Não recebe senha, hash completo, email nem IP do usuário/.test(byId["have-i-been-pwned"].data));

const qr = read("js/qrcode.js");
check("portal fiscal é chamado direto e restrito ao governo", /request\(parsed\.url/.test(qr) && /host\.endsWith\("\.gov\.br"\)/.test(qr));
check("portal fiscal declara URL, chave e metadados", /URL completa/.test(byId["fiscal-portals"].data) && /chave da nota/.test(byId["fiscal-portals"].data) && /metadados normais/.test(byId["fiscal-portals"].data));

check("SMTP não recebe nome de empresa presumido", byId["production-smtp"].name === "Provedor SMTP de produção" && /fornecedor exato ainda não está declarado/.test(byId["production-smtp"].data));
check("SMTP aponta para a exigência oficial do Supabase", /supabase\.com\/docs\/guides\/auth\/auth-smtp/.test(byId["production-smtp"].evidence));

console.log("\n3. Política, interface e publicação");
const privacy = read("js/screens/privacy.js");
const css = read("css/screens/legal.css");
const doc = read("docs/TERCEIROS-E-OPERADORES.md");
const launch = read("docs/LEGAL-LAUNCH.md");
const release = read("scripts/check-release.js");
const html = read("index.html") + read("landing.html");
check("tela renderiza a fonte estruturada por grupo", /LEGAL_THIRD_PARTY_GROUPS\.map\(renderLegalThirdPartyGroup\)/.test(privacy) && /LEGAL_THIRD_PARTIES\.filter/.test(privacy));
check("tela mostra os seis rótulos de transparência", ["Quando participa", "Finalidade", "Dados que recebe", "Retenção", "Como excluir", "Transferência internacional"].every((label) => privacy.includes(label)));
check("tela avisa que analytics e publicidade não existem", /Não há analytics, publicidade, pixels/.test(privacy));
check("nenhum script remoto contradiz a declaração", !/<script[^>]+src=["']https?:\/\//i.test(html));
check("cartões de terceiros têm foco e estado móvel", /\.legal-third-party summary:focus-visible/.test(css) && /@media \(max-width:540px\)/.test(css));
check("documento liga matriz e fonte estruturada", /LEGAL_THIRD_PARTIES/.test(doc) && /## Matriz/.test(doc));
check("documento cobre os seis registros", required.every((id) => id === "production-smtp" ? /Provedor SMTP de produção/.test(doc) : new RegExp(byId[id].name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(doc)));
check("pendências contratuais continuam no lançamento", /plano da Vercel/.test(launch) && /contrato efetivo da Anthropic/.test(launch) && /provedor SMTP/.test(launch));
check("checagem de publicação exige código, tela e documento", /LEGAL_THIRD_PARTIES/.test(release) && /Quem participa do tratamento/.test(release) && /TERCEIROS-E-OPERADORES/.test(release));
check("mudança material sobe política e cache", run("LEGAL_TEXT_VERSION") === "2026-08-31.2" && /const VERSION = "v62"/.test(read("service-worker.js")));

console.log(`\n${fail ? "FALHAS ENCONTRADAS" : "TODOS OS TESTES PASSARAM"}: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
