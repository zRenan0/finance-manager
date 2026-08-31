// test-versioning.js — AS VERSÕES DO PROJETO E A MATRIZ DE COMPATIBILIDADE (M13).
// ------------------------------------------------------------------------------
// Duas coisas são protegidas aqui, e a segunda é a que costuma faltar:
//
//   1. As versões não podem divergir entre si. A do aplicativo aparece em dois
//      arquivos; a do protocolo, no cliente e no backend. Divergência silenciosa
//      entre elas é a classe de defeito que só aparece em produção.
//   2. `docs/VERSIONAMENTO.md` não pode envelhecer em silêncio. O documento
//      declara os números; este teste confere cada um contra o código. Um
//      documento que mente é pior do que documento nenhum, porque alguém decide
//      com base nele.
//
// Além disso, a matriz promete comportamentos. Os que dão para exercitar em
// Node são exercitados aqui: backup de schema antigo, backup de schema futuro e
// o carimbo da versão no snapshot.
//
// Ferramenta de dev: `node tests/test-versioning.js`.
"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const readSrc = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const ctx = { console, module: { exports: {} }, indexedDB: undefined, localStorage: undefined };
ctx.window = ctx;
ctx.globalThis = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);
["js/utils.js", "js/perf.js", "js/rules.js", "js/layout.js", "js/safe-errors.js", "js/storage.js"]
  .forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));
const run = (code) => vm.runInContext(code, ctx);

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? ` -> ${extra}` : ""}`); }
}

const pkg = JSON.parse(readSrc("package.json"));
const safeErrors = readSrc("js/safe-errors.js");
const storage = readSrc("js/storage.js");
const syncBackend = readSrc("netlify/functions/sync.js");
const worker = readSrc("service-worker.js");
const doc = readSrc("docs/VERSIONAMENTO.md");

const numeroDe = (fonte, re, nome) => {
  const achado = fonte.match(re);
  if (!achado) throw new Error(`constante não encontrada: ${nome}`);
  return Number(achado[1]);
};

const APP_VERSION = pkg.version;
const SCHEMA_VERSION = run("SCHEMA_VERSION");
const DB_VERSION = numeroDe(storage, /const DB_VERSION = (\d+);/, "DB_VERSION");
const CLIENTE_PROTOCOLO = numeroDe(storage, /const CLOUD_SYNC_PROTOCOL = (\d+);/, "CLOUD_SYNC_PROTOCOL");
const BACKEND_PROTOCOLO = numeroDe(syncBackend, /const PROTOCOL = (\d+);/, "PROTOCOL");
const MINIMO_ESCRITA = numeroDe(syncBackend, /const MINIMUM_WRITE_PROTOCOL = (\d+);/, "MINIMUM_WRITE_PROTOCOL");
const LEGADO = numeroDe(syncBackend, /const LEGACY_PROTOCOL = (\d+);/, "LEGACY_PROTOCOL");
const SW_VERSION = (worker.match(/const VERSION = "(v\d+)";/) || [])[1];

/* ============================================================== 1 */
console.log("\n1. A versão do aplicativo é uma só");
{
  check("package.json tem versão semântica", /^\d+\.\d+\.\d+$/.test(APP_VERSION), APP_VERSION);
  check("o diagnóstico local usa a mesma versão",
    safeErrors.includes(`const SAFE_ERROR_APP_VERSION = "${APP_VERSION}";`), APP_VERSION);
  check("o CHANGELOG cita a versão atual", readSrc("CHANGELOG.md").includes(`## ${APP_VERSION}`));
}

/* ============================================================== 2 */
console.log("\n2. Cliente e backend falam o mesmo protocolo");
{
  check("o protocolo do cliente é igual ao do backend",
    CLIENTE_PROTOCOLO === BACKEND_PROTOCOLO, `${CLIENTE_PROTOCOLO} vs ${BACKEND_PROTOCOLO}`);
  check("o mínimo de escrita não passa do protocolo do servidor",
    MINIMO_ESCRITA >= LEGADO && MINIMO_ESCRITA <= BACKEND_PROTOCOLO, MINIMO_ESCRITA);
  check("o cliente fala uma versão que o servidor aceita",
    CLIENTE_PROTOCOLO >= MINIMO_ESCRITA, `${CLIENTE_PROTOCOLO} < ${MINIMO_ESCRITA}`);
  check("o cabeçalho do protocolo é enviado pelo cliente",
    storage.includes('"X-Sync-Protocol": String(CLOUD_SYNC_PROTOCOL)'));
  check("o backend recusa cabeçalho e corpo divergentes",
    /Cabeçalho e corpo falam protocolos diferentes/.test(syncBackend));
  check("o backend responde 426 a cliente abaixo do mínimo",
    /statusCode: 426, code: "protocol_upgrade_required"/.test(syncBackend));
  check("o cliente não tenta escrever quando o mínimo está acima do que fala",
    storage.includes("this.minimumWriteProtocol > CLOUD_SYNC_PROTOCOL"));
}

/* ============================================================== 3 */
console.log("\n3. A versão do banco é declarada e não é um portão");
{
  const migracao = "supabase/migrations/20260831120000_database_schema_version.sql";
  check("a migração da versão do banco existe", fs.existsSync(path.join(ROOT, migracao)));
  const sql = readSrc(migracao);
  check("a coluna é adicionada de forma idempotente", /add column if not exists database_schema_version/.test(sql));
  check("a migração declara como reverter", /drop column if exists database_schema_version/.test(sql));
  check("o backend lê a linha inteira, e não a coluna pelo nome",
    syncBackend.includes("cofre_sync_config?select=*&id=eq.1&limit=1"),
    "pedir a coluna pelo nome quebraria bancos sem a migração");
  check("a ausência da coluna vira null, não erro", /databaseSchema: null|databaseSchema = Number.isInteger/.test(syncBackend)
    || /const databaseSchema = /.test(syncBackend));
  check("a versão do banco é publicada em health", /databaseSchema: config.databaseSchema/.test(syncBackend));
  check("a versão do banco NÃO recusa atendimento",
    !/databaseSchema[^\n]*statusCode/.test(syncBackend));
}

/* ============================================================== 4 */
console.log("\n4. Backup de schema antigo continua abrindo");
{
  const antigo = { version: 5, monthlyIncome: 4000, transactions: [{ id: "t1", type: "expense", amount: 50, categoryId: "mercado", date: "2025-02-10" }], categories: [], goals: [] };
  const lido = ctx.parseBackupFile(JSON.stringify(antigo));
  check("o arquivo antigo abre", lido.data.transactions.length === 1);
  check("o schema declarado é reportado", lido.meta.schema === 5, lido.meta.schema);
  check("não é marcado como futuro", !lido.meta.future, lido.meta.future);
  check("a leitura carimba o schema atual", lido.data.version === SCHEMA_VERSION, lido.data.version);
}

/* ============================================================== 5 */
console.log("\n5. Backup de schema FUTURO abre com aviso, em vez de ser recusado");
{
  const futuro = {
    version: SCHEMA_VERSION + 7,
    monthlyIncome: 5000,
    transactions: [{ id: "t1", type: "expense", amount: 80, categoryId: "mercado", date: "2026-05-02", campoQueAindaNaoExiste: "x" }],
    categories: [], goals: [{ id: "g1", name: "Reserva", target: 9000, current: 500 }],
  };
  const lido = ctx.parseBackupFile(JSON.stringify(futuro));
  check("o arquivo do futuro NÃO é recusado", lido.data.transactions.length === 1);
  check("a versão futura é reportada para a tela avisar",
    lido.meta.future === SCHEMA_VERSION + 7, lido.meta.future);
  check("o que esta versão entende entra inteiro",
    lido.data.transactions[0].amount === 80 && lido.data.goals.length === 1);
  check("a tela de restauração mostra o aviso",
    readSrc("js/screens/settings.js").includes("p.meta.future"));
}

/* ============================================================== 6 */
console.log("\n6. O snapshot sempre carrega a versão do schema");
{
  ctx.__vazio = {};
  check("migrate carimba a versão", run("migrate(__vazio).version") === SCHEMA_VERSION);
  check("o backup leva a versão junto", storage.includes("version: SCHEMA_VERSION"));
  check("o espelho local também leva", /version: SCHEMA_VERSION, data/.test(storage));
}

/* ============================================================== 7 */
console.log("\n7. docs/VERSIONAMENTO.md não pode envelhecer em silêncio");
{
  const declara = (rotulo, valor) => {
    const linha = doc.split("\n").find((l) => l.includes(`\`${rotulo}\``) && l.startsWith("|"));
    check(`${rotulo} está na tabela do documento`, !!linha, "linha não encontrada");
    if (linha) {
      check(`${rotulo} declara o valor real (${valor})`, linha.includes(`\`${valor}\``), linha.trim().slice(0, 120));
    }
  };
  declara("APP_VERSION", APP_VERSION);
  declara("LOCAL_SCHEMA_VERSION", SCHEMA_VERSION);
  declara("INDEXEDDB_VERSION", DB_VERSION);
  declara("SYNC_PROTOCOL_VERSION", BACKEND_PROTOCOLO);
  declara("SERVICE_WORKER_VERSION", SW_VERSION);
  check("o documento cita a coluna da versão do banco", doc.includes("cofre_sync_config.database_schema_version"));
  check("o documento tem a matriz de compatibilidade", /## Matriz de compatibilidade/.test(doc));
  check("o documento registra a limitação de sincronização entre schemas",
    /Limitações conhecidas/.test(doc) && /não trafega|trafega registros/.test(doc));
}

/* ============================================================== 8 */
console.log("\n8. O Service Worker recebe a identidade do pacote na publicação");
{
  const build = readSrc("scripts/build-dist.js");
  check("o worker declara BUILD_ID a partir de VERSION", worker.includes("const BUILD_ID = VERSION;"));
  check("a publicação injeta o digest do pacote na versão", /VERSION = "\$\{versaoFonte\}-\$\{pacoteDigest\}"/.test(build));
  check("a versão do worker segue o formato vNN", /^v\d+$/.test(SW_VERSION || ""), SW_VERSION);
}

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS"} - ${pass} ok, ${fail} falha(s)`);
process.exit(fail === 0 ? 0 : 1);
