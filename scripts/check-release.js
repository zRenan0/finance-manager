"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const pkg = JSON.parse(read("package.json"));
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const buildDist = read("scripts/build-dist.js");
const checkDeploy = read("scripts/check-deploy.js");
const appSource = read("js/app.js");

check(/^\d+\.\d+\.\d+$/.test(pkg.version), "package.json precisa de versão semântica");
check(read("CHANGELOG.md").includes(`## ${pkg.version}`), "CHANGELOG.md não contém a versão atual");
check(/const VERSION = "v\d+";/.test(read("service-worker.js")), "cache do service worker não tem versão explícita");
const workerVersion = Number((read("service-worker.js").match(/const VERSION = "v(\d+)";/) || [])[1]);
check(workerVersion >= 53, "cache do service worker não foi promovido para o pacote com hash");
check(/const BUILD_ID = VERSION;/.test(read("service-worker.js")) && /GET_BUILD/.test(read("service-worker.js")),
  "service worker não informa qual pacote assumiu o controle");
check(/const SCHEMA_VERSION = \d+;/.test(read("js/storage.js")), "schema de dados não tem versão explícita");
check(read("js/safe-errors.js").includes(`const SAFE_ERROR_APP_VERSION = "${pkg.version}";`), "versão do diagnóstico não acompanha o aplicativo");
check(fs.existsSync(path.join(root, "js/screens/privacy.js")), "central de privacidade ausente");
check(fs.existsSync(path.join(root, "docs/LEGAL-LAUNCH.md")), "pendências jurídicas de lançamento não estão documentadas");
check(fs.existsSync(path.join(root, ".github/workflows/ci.yml")), "fluxo de integração contínua ausente");
check(fs.existsSync(path.join(root, "docs/RELEASE.md")), "procedimento de publicação ausente");
check((read("index.html").match(/<script\b/g) || []).length > 0, "index.html não carrega os scripts do app");
check(/type="module" src="js\/modules\/bootstrap\.js"/.test(read("index.html")), "bootstrap modular não está carregado");
check((read("index.html").match(/<script\b/g) || []).length === 2, "index.html voltou a carregar scripts clássicos do aplicativo");
check(/import\('\.\/app\.generated\.js'\)/.test(read("js/modules/bootstrap.js")), "módulo gerado não está ligado ao bootstrap");
check(fs.existsSync(path.join(root, "js/modules/app.generated.js")), "módulo ES gerado ausente");
check(!/\sstyle\s*=/.test(read("index.html")), "index.html contém estilo inline");
check(fs.existsSync(path.join(root, "tests/browser/run-browser.js")), "suíte de navegador ausente");
check(Object.prototype.hasOwnProperty.call(pkg.scripts || {}, "test:browser"), "comando de teste de navegador ausente");
check(/createHash\("sha256"\)/.test(buildDist) && /versionarModulos/.test(buildDist) && /nomeComHash/.test(buildDist),
  "build de dist não publica módulos identificados pelo SHA-256");
check(/meta name=\"cofre-build\"/.test(buildDist) && /const BUILD_ID = \"\$\{buildId\}\";/.test(buildDist),
  "HTML e service worker não recebem o mesmo identificador de pacote");
check(/replace\(\/\\r\\n\?\/g, \"\\n\"\)/.test(buildDist), "build de dist não normaliza texto para LF");
check(/path\.join\(DIST, \"app\.html\"\)/.test(checkDeploy) && /referenciasDeModulo/.test(checkDeploy) && /digestNoNome/.test(checkDeploy),
  "check-deploy não confere dist/app.html e seus módulos com hash");
check(/controllerchange/.test(appSource) && /FinanceStore\.flush\(\)/.test(appSource)
  && /sessionStorage/.test(appSource) && /Atualização pendente/.test(appSource),
  "js/app.js não protege a recarga do novo service worker com flush e guarda por pacote");

// A PÁGINA COMERCIAL É A PORTA DE ENTRADA DO DOMÍNIO.
//
// Estas quatro linhas guardam o que quebra silenciosamente numa publicação:
// a reescrita da raiz sumir do vercel.json (o domínio volta a abrir no
// aplicativo e o funil de marketing deixa de existir), e o service worker
// voltar a tratar "/" como shell do aplicativo — que faria o app abrir
// offline mostrando a landing, sem a rede poder corrigir.
const landing = read("landing.html");
const swArquivo = read("service-worker.js");
check(fs.existsSync(path.join(root, "landing.html")), "página comercial ausente");
check(fs.existsSync(path.join(root, "tests/browser/run-landing.js")), "suíte de navegador da landing ausente");
check(Object.prototype.hasOwnProperty.call(pkg.scripts || {}, "test:landing"), "comando de teste da landing ausente");
const vercel = JSON.parse(read("vercel.json"));
const reescrita = (origem) => ((vercel.rewrites || []).find((r) => r.source === origem) || {}).destination;
check(reescrita("/") === "/landing.html", "a raiz do domínio não está reescrita para a página comercial");
check(reescrita("/index.html") === "/app.html", "o aplicativo não está reescrito de /index.html para /app.html");
check(/RENOMEADOS = \{ "index\.html": "app\.html" \}/.test(read("scripts/build-dist.js")),
  "o build voltaria a publicar index.html, e a raiz deixaria de servir a página comercial");
check(/return url\.pathname\.endsWith\("\/index\.html"\);/.test(swArquivo),
  "o service worker voltou a tratar a raiz como shell do aplicativo");
check(/const PAGE_CACHE = "financas-pages-"/.test(swArquivo),
  "o cache de páginas separado do shell desapareceu");
check(!/\sstyle\s*=/.test(landing), "landing.html contém estilo inline");
check(!/XX,XX|Espaço reservado|Depoimento de cliente/.test(landing.replace(/<template[\s\S]*?<\/template>/g, "")),
  "landing.html ainda mostra conteúdo de espaço reservado");

// A política precisa CONTER as partes obrigatórias. Faltar qualquer uma delas
// é defeito da publicação, não pendência de negócio, e por isso reprova.
const storage = read("js/storage.js");
const privacyScreen = read("js/screens/privacy.js");
check(/const LEGAL_CONTROLLER = \{/.test(storage), "identificação do controlador não está declarada em js/storage.js");
check(/const LEGAL_RETENTION = \[/.test(storage), "prazos de retenção não estão declarados em js/storage.js");
check(/const LEGAL_SUBJECT_RIGHTS = \[/.test(storage), "direitos do titular não estão declarados em js/storage.js");
check(/const LEGAL_DATA_INVENTORY = \[/.test(storage), "inventário de dados não está declarado em js/storage.js");
check(/Quem responde por estes dados/.test(privacyScreen), "a tela de privacidade não identifica o controlador");
check(/Por quanto tempo cada coisa fica/.test(privacyScreen), "a tela de privacidade não informa prazo de retenção");
check(/Seus direitos/.test(privacyScreen) && /art\. 18/.test(privacyScreen), "a tela de privacidade não lista os direitos do art. 18");
check(/incidente de segurança/i.test(privacyScreen) && /art\. 48/.test(privacyScreen), "a tela de privacidade não traz canal de comunicação de incidentes");
check(/Inventário dos dados/.test(privacyScreen) && /LEGAL_DATA_INVENTORY/.test(privacyScreen), "a tela de privacidade não renderiza o inventário de dados");
check(fs.existsSync(path.join(root, "docs/INVENTARIO-DE-DADOS.md")), "documento operacional do inventário de dados ausente");

// Já os campos que só o dono do app conhece são AVISO, não falha: eles não
// impedem publicar o beta, impedem oferecer ao público. Reprovar aqui travaria
// a própria esteira que precisa rodar até esses dados existirem.
const pendentes = (storage.match(/^\s{2}\w+: LEGAL_PENDING,$/gm) || []).length;
if (pendentes) {
  console.warn(`AVISO: ${pendentes} campo(s) do controlador ainda com marcador. Ver docs/LEGAL-LAUNCH.md; sem eles a instalação não pode ser oferecida ao público.`);
}

if (failures.length) {
  failures.forEach((failure) => console.error(`FALHA: ${failure}`));
  process.exit(1);
}

console.log(`Publicação ${pkg.version} verificada.`);
