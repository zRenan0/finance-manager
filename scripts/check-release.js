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
check(/const LEGAL_THIRD_PARTIES = \[/.test(storage), "registro de terceiros não está declarado em js/storage.js");
check(/Quem responde por estes dados/.test(privacyScreen), "a tela de privacidade não identifica o controlador");
check(/Por quanto tempo cada coisa fica/.test(privacyScreen), "a tela de privacidade não informa prazo de retenção");
check(/Seus direitos/.test(privacyScreen) && /art\. 18/.test(privacyScreen), "a tela de privacidade não lista os direitos do art. 18");
check(/incidente de segurança/i.test(privacyScreen) && /art\. 48/.test(privacyScreen), "a tela de privacidade não traz canal de comunicação de incidentes");
check(/Inventário dos dados/.test(privacyScreen) && /LEGAL_DATA_INVENTORY/.test(privacyScreen), "a tela de privacidade não renderiza o inventário de dados");
check(/Quem participa do tratamento/.test(privacyScreen) && /LEGAL_THIRD_PARTIES/.test(privacyScreen), "a tela de privacidade não renderiza o registro de terceiros");
check(fs.existsSync(path.join(root, "docs/INVENTARIO-DE-DADOS.md")), "documento operacional do inventário de dados ausente");
check(fs.existsSync(path.join(root, "docs/TERCEIROS-E-OPERADORES.md")), "documento operacional de terceiros ausente");

// M20: o plano de resposta a incidentes precisa existir E manter as oito fases.
// Um arquivo presente porém esvaziado seria pior que ausente: passaria batido
// justamente na hora em que alguém for procurá-lo.
const incidentes = fs.existsSync(path.join(root, "SECURITY_INCIDENT_RESPONSE.md"))
  ? read("SECURITY_INCIDENT_RESPONSE.md")
  : "";
check(incidentes !== "", "plano de resposta a incidentes ausente");
check(["## 1. Detecção", "## 2. Classificação", "## 3. Contenção", "## 4. Investigação",
  "## 5. Correção", "## 6. Avaliação de impacto", "## 7. Comunicação quando aplicável",
  "## 8. Post-mortem"].every((fase) => incidentes.includes(fase)),
  "plano de resposta a incidentes não cobre as oito fases");
check(/## Papéis/.test(incidentes) && /## Registro de incidentes/.test(incidentes),
  "plano de resposta a incidentes não define papéis nem onde fica o registro");

// M21: o canal de divulgação responsável. A página é estática de propósito —
// quem chega nela pode estar investigando o site, e ela não deve ser mais uma
// superfície para investigar.
const relato = fs.existsSync(path.join(root, "reportar-vulnerabilidade.html"))
  ? read("reportar-vulnerabilidade.html")
  : "";
check(relato !== "", "página de relato de vulnerabilidade ausente");
check(!/<script\b/i.test(relato) && !/<form\b/i.test(relato) && !/\son\w+=/i.test(relato),
  "a página de relato não pode carregar script, formulário ou manipulador embutido");
check(/security\/advisories\/new/.test(relato), "a página de relato não indica canal privado de recebimento");
check(["Escopo", "Regras do teste", "O que esperar", "Divulgação coordenada"].every((secao) => relato.includes(secao)),
  "a página de relato não cobre escopo, regras, prazos e divulgação coordenada");
check(/Não publique nem compartilhe antes da correção|antes da correção/.test(relato),
  "a página de relato não pede divulgação coordenada");
check(fs.existsSync(path.join(root, "SECURITY.md")) && /reportar-vulnerabilidade/.test(read("SECURITY.md")),
  "política de segurança do repositório ausente ou desligada da página publicada");
check(read("vercel.json").includes("/reportar-vulnerabilidade"),
  "a reescrita de /reportar-vulnerabilidade não está declarada");
check(read("scripts/build-dist.js").includes("reportar-vulnerabilidade.html")
  && /securityTxt\.escreverEmDist/.test(read("scripts/build-dist.js")),
  "o build não publica a página de relato nem gera o security.txt");

// O security.txt sai do build, então o que dá para conferir aqui é o gerador:
// se ele produz um arquivo válido pela RFC 9116 a partir de uma base qualquer.
const amostra = require("./security-txt").gerarSecurityTxt("https://exemplo.test");
check(["Contact:", "Expires:", "Canonical:", "Policy:", "Preferred-Languages:"]
  .every((campo) => amostra.includes(campo)), "o security.txt gerado não traz os campos da RFC 9116");
check(!/\[definir antes/.test(amostra), "o security.txt gerado publicou um marcador no lugar de um canal real");

// M22: um nome público só, e os identificadores congelados intactos. O segundo
// é o que importa: `cofre_*`, `financas_*` e o `kind` do backup parecem
// inconsistência de marca e são contrato com dado já gravado.
const marca = fs.existsSync(path.join(root, "docs/MARCA.md")) ? read("docs/MARCA.md") : "";
check(marca !== "", "decisão de arquitetura de marca não está documentada");
check(!/FinanceManager/.test(read("index.html") + read("landing.html") + read("manifest.webmanifest")),
  "o domínio voltou a ser tratado como nome de produto na interface");
check(/const BACKUP_KIND = "organizador-financeiro\/backup";/.test(storage)
  && /["']financas_db["']/.test(storage),
  "identificador congelado foi renomeado: backup antigo e banco local do usuário param de abrir");
const manifesto = JSON.parse(read("manifest.webmanifest"));
check(manifesto.short_name === "Cofre" && manifesto.start_url === "./index.html" && manifesto.scope === "./",
  "o manifesto mudou identidade de instalação (short_name, start_url ou scope)");
check(/<meta name="robots" content="noindex, follow" \/>/.test(read("index.html")),
  "o aplicativo voltou a ser indexável e disputa a busca com a landing pelo mesmo título");

// Já os campos que só o dono do app conhece são AVISO, não falha: eles não
// impedem publicar o beta, impedem oferecer ao público. Reprovar aqui travaria
// a própria esteira que precisa rodar até esses dados existirem.
const pendentes = (storage.match(/^\s{2}\w+: LEGAL_PENDING,$/gm) || []).length;
if (pendentes) {
  console.warn(`AVISO: ${pendentes} campo(s) do controlador ainda com marcador. Ver docs/LEGAL-LAUNCH.md; sem eles a instalação não pode ser oferecida ao público.`);
}
const terceirosPendentes = (storage.match(/^\s{4}status: "pending",$/gm) || []).length;
if (terceirosPendentes) {
  console.warn(`AVISO: ${terceirosPendentes} serviço(s) externo(s) ainda sem fornecedor definido. Ver docs/TERCEIROS-E-OPERADORES.md.`);
}

if (failures.length) {
  failures.forEach((failure) => console.error(`FALHA: ${failure}`));
  process.exit(1);
}

console.log(`Publicação ${pkg.version} verificada.`);
