"use strict";

const fs = require("fs");

let passed = 0;
let failed = 0;
function check(name, condition, detail) {
  if (condition) { console.log(`  OK  ${name}`); passed += 1; }
  else { console.error(`  FALHA  ${name}${detail ? `: ${detail}` : ""}`); failed += 1; }
}

const storage = fs.readFileSync("js/storage.js", "utf8");
const cloudSync = fs.readFileSync("js/cloud-sync.js", "utf8");
const app = fs.readFileSync("js/app.js", "utf8");
const auth = fs.readFileSync("js/auth.js", "utf8");
const errors = fs.readFileSync("js/safe-errors.js", "utf8");
const worker = fs.readFileSync("service-worker.js", "utf8");
const account = fs.readFileSync("netlify/functions/account.js", "utf8");
const http = fs.readFileSync("netlify/functions/_shared/http.js", "utf8");
const serverSchema = fs.readFileSync("netlify/functions/_shared/finance-schema.js", "utf8");
const readme = fs.readFileSync("README.md", "utf8");
const architecture = fs.readFileSync("docs/ARCHITECTURE.md", "utf8");
const inventory = fs.readFileSync("docs/ARMAZENAMENTO-E-PRIVACIDADE.md", "utf8");

function numberOf(source, pattern) {
  const match = source.match(pattern);
  return match ? Number(match[1]) : NaN;
}

console.log("\n1. Versões locais");
const localSchema = numberOf(storage, /const SCHEMA_VERSION = (\d+);/);
const backendSchema = numberOf(serverSchema, /const SCHEMA_VERSION = (\d+);/);
const dbVersion = numberOf(storage, /const DB_VERSION = (\d+);/);
const cacheVersion = (worker.match(/const VERSION = "v(\d+)";/) || [])[1];
check("schema lógico tem versão", Number.isInteger(localSchema));
check("cliente e servidor usam o mesmo schema", localSchema === backendSchema, `${localSchema} / ${backendSchema}`);
check("IndexedDB tem versão física separada", dbVersion === 4, dbVersion);
check("README acompanha o cache publicado", readme.includes(`cache offline na versão ${cacheVersion}`));
check("inventário registra as quatro versões", [
  `| Schema lógico dos dados | ${localSchema} |`,
  `| Estrutura física do IndexedDB | ${dbVersion} |`,
  `| Protocolo de sincronização | 3 |`,
  `| Pacote do cache offline | v${cacheVersion} |`,
].every((text) => inventory.includes(text)));

console.log("\n2. IndexedDB");
const stores = ["transactions", "categories", "goals", "settings", "assets", "outbox", "localMeta"];
stores.forEach((name) => check(`store ${name} documentado`, inventory.includes(`| \`${name}\` |`)));
check("banco visitante documentado", inventory.includes("`financas_db` para visitante"));
check("banco de conta documentado", inventory.includes("`financas_db__u_<id>` para conta"));
check("arquitetura aponta para o inventário", architecture.includes("docs/ARMAZENAMENTO-E-PRIVACIDADE.md"));

console.log("\n3. Web Storage");
const documentedKeys = [
  "financas_theme", "cofre_device_id", "cofre_active_scope", "financas_safe_errors_v1",
  "financas_pro_v2", "financas_pro_v2_backup", "financas_db_fallback", "financas_db_mirror",
  "financas_db_undo", "financas_db_outbox", "financas_db_meta", "financas_db_recovery",
  "financas_db_clock", "financas_db_reset_barrier", "cofre_sync_cursor", "cofre_sync_seeded",
  "__financas_test__", "cofre_build_reload",
];
documentedKeys.forEach((key) => check(`chave ${key} documentada`, inventory.includes(`\`${key}`)));
check("chave de tema existe no código", /financas_theme/.test(app));
check("id do aparelho existe no código", auth.includes('const ACCOUNT_DEVICE_KEY = "cofre_device_id"'));
check("diagnóstico local existe no código", errors.includes('const SAFE_ERROR_STORAGE_KEY = "financas_safe_errors_v1"'));
check("cursor legado existe no código", cloudSync.includes('const CLOUD_CURSOR_KEY = "cofre_sync_cursor"'));
check("sessionStorage não é classificado como localStorage", inventory.includes("O `sessionStorage` contém apenas `cofre_build_reload`"));
check("cópias financeiras legíveis são declaradas", inventory.includes("dados financeiros em JSON legível") && inventory.includes("não são criptografados no aparelho"));
check("tokens de sessão ficam fora do Web Storage", !/cofre_(access|refresh|pkce|recovery)"/.test(storage + cloudSync + app + auth + errors));

console.log("\n4. CacheStorage");
check("cache do shell documentado", inventory.includes(`\`financas-cache-v${cacheVersion}\``));
check("cache de páginas documentado", inventory.includes(`\`financas-pages-v${cacheVersion}\``));
check("cache de fontes documentado", inventory.includes(`\`financas-fonts-v${cacheVersion}\``));
check("API sai antes do cache", /if \(url\.pathname\.indexOf\("\/api\/"\) === 0\) return;/.test(worker));
check("backend marca JSON como no-store", http.includes('"Cache-Control": "no-store"'));
check("inventário afirma que resposta de API não entra no cache", inventory.includes("sessão, sincronização e respostas\nde IA não são gravadas no CacheStorage"));

console.log("\n5. Cookies");
const cookieNames = {
  cofre_access: "ACCESS",
  cofre_refresh: "REFRESH",
  cofre_pkce: "VERIFIER",
  cofre_device: "DEVICE_SECRET",
  cofre_recovery: "RECOVERY",
};
Object.entries(cookieNames).forEach(([name, constant]) => {
  check(`cookie ${name} existe`, new RegExp(`const ${constant} = "${name}"`).test(account));
  check(`cookie ${name} documentado`, inventory.includes(`| \`${name}\` |`));
});
check("cookies são HttpOnly e SameSite Lax", http.includes('"HttpOnly", "SameSite=Lax"'));
check("cookies usam Secure em produção", http.includes('if (secureCookie(event)) parts.push("Secure")'));
check("cookies não definem Domain", !/parts\.push\(`?Domain/.test(http));
check("cookie de recuperação dura 30 minutos", /const RECOVERY_MAX_AGE = 30 \* 60;/.test(account));
check("PKCE dura 24 horas", /const VERIFIER_MAX_AGE = 60 \* 60 \* 24;/.test(account));
check("refresh dura 30 dias", /maxAge: 60 \* 60 \* 24 \* 30/.test(account));
check("segredo do aparelho dura 365 dias", /maxAge: 60 \* 60 \* 24 \* 365/.test(account));

console.log("\n6. Fluxo e exclusão");
check("README não chama pacote da IA de anônimo", !/JSON \*\*anonimizado\*\*|resumo agregado e\s+anônimo/.test(readme));
check("README explica sincronização com conta", readme.includes("Com conta ligada, os registros passam a ser sincronizados"));
check("inventário separa uso local, conta, IA e Sefaz", [
  "| Usar sem conta |", "| Ligar uma conta |", "| Pedir análise por IA |", "| Consultar QR de nota fiscal |",
].every((text) => inventory.includes(text)));
check("purge remove backup legado", storage.includes('LEGACY_KEY + "_backup"'));
check("purge remove espelho e undo do escopo", /scopedName\(LS_MIRROR_KEY, targetScope\)[\s\S]*scopedName\(LS_UNDO_KEY, targetScope\)/.test(storage));
check("purge preserva a barreira de reset", inventory.includes("A barreira\nde reset fica, de propósito") && !/const keys = \[[\s\S]{0,1000}scopedName\("financas_db_reset_barrier"/.test(storage));

console.log(`\nResultado: ${passed} ok, ${failed} falhas`);
if (failed) process.exit(1);
