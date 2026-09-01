"use strict";

// M22 — arquitetura de marca.
//
// Este teste tem dois trabalhos, e o SEGUNDO é o que importa de verdade.
//
// O primeiro é o óbvio: garantir que o produto se apresente com um nome só.
//
// O segundo é proteger o projeto de si mesmo. Existe um conjunto de nomes que
// PARECE inconsistência de marca — tabelas `cofre_*`, chaves `financas_*`, o
// `kind` do backup em "organizador-financeiro/backup" — e não é: são contratos
// com dado já gravado. Uma faxina de marca bem-intencionada, feita por busca e
// substituição, apagaria os dados de quem já usa o aplicativo. Aqui esses nomes
// ficam travados, com o motivo escrito ao lado.
//
// Ver docs/MARCA.md.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const existe = (file) => fs.existsSync(path.join(ROOT, file));

let pass = 0;
let fail = 0;
function check(label, condition, detail) {
  if (condition) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail == null ? "" : `: ${detail}`}`); }
}

const app = read("index.html");
const landing = read("landing.html");
const relato = read("reportar-vulnerabilidade.html");
const manifest = JSON.parse(read("manifest.webmanifest"));
const doc = read("docs/MARCA.md");
const storage = read("js/storage.js");
const sw = read("service-worker.js");

const tituloDe = (html) => (html.match(/<title>([^<]+)<\/title>/) || [])[1] || "";

console.log("\n1. Um nome público só");

check("o documento da decisão existe", existe("docs/MARCA.md"));
check("a decisão está escrita sem rodeio",
  /O produto se chama Cofre\. `financemanager\.dev\.br` é o endereço dele\./.test(doc));
check("o título da landing é Cofre", /^Cofre\b/.test(tituloDe(landing)), tituloDe(landing));
check("o título do aplicativo é Cofre", /^Cofre\b/.test(tituloDe(app)), tituloDe(app));
check("a página de relato é Cofre", /\| Cofre<\/title>/.test(relato), tituloDe(relato));
check("o manifesto instala como Cofre",
  manifest.short_name === "Cofre" && /^Cofre\b/.test(manifest.name), [manifest.name, manifest.short_name].join(" / "));
check("o manifesto não usa barra vertical no nome de instalação",
  !manifest.name.includes("|"), manifest.name);
check("a origem do compartilhamento é Cofre", /og:site_name" content="Cofre"/.test(landing));

// A marca do domínio não pode virar nome de produto em texto entregue ao
// usuário. Endereço é endereço: aparece como `financemanager.dev.br`.
const superficies = {
  "index.html": app,
  "landing.html": landing,
  "reportar-vulnerabilidade.html": relato,
  "manifest.webmanifest": JSON.stringify(manifest),
  "js/app.js": read("js/app.js"),
  "js/screens/onboarding.js": read("js/screens/onboarding.js"),
  "js/storage.js": storage,
};
Object.entries(superficies).forEach(([nome, conteudo]) => {
  check(`${nome} não trata o domínio como nome de produto`,
    !/FinanceManager/.test(conteudo));
});

console.log("\n2. As superfícies estão padronizadas");

[["index.html", app], ["landing.html", landing], ["reportar-vulnerabilidade.html", relato]]
  .forEach(([nome, html]) => {
    check(`${nome} usa o mesmo favicon`, /<link rel="icon" href="icons\/icon-192\.png" \/>/.test(html));
    check(`${nome} usa o mesmo ícone de toque`, /<link rel="apple-touch-icon" href="icons\/icon-192\.png" \/>/.test(html));
    check(`${nome} declara idioma`, /<html lang="pt-BR">/.test(html));
  });
check("o atalho iOS nasce como Cofre no aplicativo",
  /apple-mobile-web-app-title" content="Cofre"/.test(app));
check("e também na landing, que igualmente linka o manifesto",
  /apple-mobile-web-app-title" content="Cofre"/.test(landing)
  && /<link rel="manifest"/.test(landing));
check("a página de relato NÃO oferece instalação", !/<link rel="manifest"/.test(relato));
check("a navegação do aplicativo diz Cofre",
  /side-nav__brand[\s\S]{0,140}<span>Cofre<\/span>/.test(read("js/app.js")));
check("o onboarding diz Cofre", /onb__brand[^`]*<span>Cofre<\/span>/.test(read("js/screens/onboarding.js")));
check("o PDF exportado assina como Cofre", /author: data\.brand \|\| "Cofre"/.test(read("js/pdf.js")));
check("a retrospectiva assina como Cofre", /Cofre; meu app financeiro/.test(read("js/wrapped.js")));

console.log("\n3. Títulos iguais, e o motivo tratado");

check("landing e aplicativo compartilham o título, como o F-11 exige",
  tituloDe(app) === tituloDe(landing), [tituloDe(app), tituloDe(landing)].join(" / "));
check("o aplicativo é noindex, para o título repetido não virar busca duplicada",
  /<meta name="robots" content="noindex, follow" \/>/.test(app));
check("a landing continua indexável", /<meta name="robots" content="index, follow/.test(landing));
check("a página de relato continua indexável", /<meta name="robots" content="index, follow"/.test(relato));
check("o motivo do noindex está escrito no próprio arquivo",
  /esqueleto de carregamento/.test(app) && /docs\/MARCA\.md/.test(app));
check("o documento explica a coincidência de títulos", /F-11/.test(doc));

console.log("\n4. Identificadores congelados (o que uma faxina de marca quebraria)");

const congelados = [
  ["prefixo das tabelas no Postgres", () => /cofre_sync_config/.test(read("netlify/functions/sync.js"))
    && /cofre_purge_account/.test(read("netlify/functions/account.js"))],
  ["banco local financas_db", () => /["']financas_db["']/.test(storage)],
  ["chave do diagnóstico financas_safe_errors_v1", () => /financas_safe_errors_v1/.test(read("js/safe-errors.js"))],
  ["kind do backup organizador-financeiro/backup",
    () => /const BACKUP_KIND = "organizador-financeiro\/backup";/.test(storage)],
  ["global de runtime window.CofreUI", () => /['"]CofreUI['"]/.test(read("js/modules/bootstrap.js"))],
  ["name do package.json", () => JSON.parse(read("package.json")).name === "cofre-organizador-financeiro"],
  ["prefixos de cache do Service Worker",
    () => /"financas-cache-"/.test(sw) && /"financas-pages-"/.test(sw) && /"financas-fonts-"/.test(sw)],
];
congelados.forEach(([nome, teste]) => check(`intacto: ${nome}`, teste()));

check("todos os congelados estão listados no documento",
  ["cofre_*", "financas_db", "financas_safe_errors_v1", "organizador-financeiro/backup",
    "window.CofreUI", "cofre-organizador-financeiro", "financas-cache-"]
    .every((id) => doc.includes(id)));
check("o documento diz por que não se renomeia nenhum deles",
  /Renomear qualquer um deles quebra dado gravado/.test(doc));
check("o arquivo de auditoria mantém o nome, e isso está justificado",
  existe("FINANCEMANAGER_AUDIT_PROGRESS.md") && /FINANCEMANAGER_AUDIT_PROGRESS\.md.*mantém o nome|mantém o nome/.test(doc));

console.log("\n5. Nada de marca quebrou contrato");

check("o start_url do manifesto não mudou", manifest.start_url === "./index.html", manifest.start_url);
check("o scope do manifesto não mudou", manifest.scope === "./", manifest.scope);
check("o campo descritivo do backup pode acompanhar a marca, o kind não",
  /app: "Cofre\. Organizador financeiro pessoal"/.test(storage)
  && /kind: BACKUP_KIND/.test(storage));
// O M22 não promoveu o cache, porque mudança de texto de marca não precisa
// disso. Fixar "v62" aqui, porém, transformaria qualquer promoção legítima
// futura em falha de marca (foi o que aconteceu no M23, com a folha da
// landing). O invariante que interessa é outro: a versão existe e nunca anda
// para trás, porque a limpeza da instalação antiga se apoia nela.
const versaoSw = Number((sw.match(/const VERSION = "v(\d+)";/) || [])[1]);
check("o service worker declara versão e ela não regrediu",
  Number.isInteger(versaoSw) && versaoSw >= 62, versaoSw);
check("o domínio segue sendo tratado como endereço nos documentos de segurança",
  /publicado em `financemanager\.dev\.br`/.test(read("SECURITY.md"))
  && /Procedimento operacional do Cofre \(`financemanager\.dev\.br`\)/.test(read("SECURITY_INCIDENT_RESPONSE.md")));

console.log(`\n${fail ? "FALHAS ENCONTRADAS" : "TODOS OS TESTES PASSARAM"}: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
