"use strict";

// M21 — divulgação responsável.
//
// Duas coisas precisam ser verdade ao mesmo tempo, e nenhuma delas se sustenta
// sozinha: o canal precisa EXISTIR (página alcançável, security.txt válido pela
// RFC 9116, política no repositório) e precisa ser HONESTO (nada de endereço
// inventado enquanto os campos do controlador forem marcadores). Um canal falso
// é pior que canal nenhum: o pesquisador escreve e ninguém lê.

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

const securityTxt = require("../scripts/security-txt");
const pagina = read("reportar-vulnerabilidade.html");
const politica = read("SECURITY.md");
const vercel = JSON.parse(read("vercel.json"));
const build = read("scripts/build-dist.js");
const serve = read("scripts/serve.js");
const release = read("scripts/check-release.js");
const deploy = read("scripts/check-deploy.js");

console.log("\n1. A página existe e é inerte");

check("a página de relato existe", pagina !== "");
check("não carrega nenhum script", !/<script\b/i.test(pagina));
check("não tem formulário", !/<form\b/i.test(pagina));
check("não tem manipulador embutido", !/\son(?:click|load|error|submit|focus)\s*=/i.test(pagina));
check("não tem estilo embutido", !/\sstyle\s*=/i.test(pagina));
check("não busca recurso de outra origem",
  !/(?:src|href)=["']https?:\/\//i.test(pagina.replace(/href=["']https:\/\/github\.com[^"']*["']/gi, "")));
check("declara idioma e título próprios",
  /<html lang="pt-BR">/.test(pagina) && /<title>Reportar vulnerabilidade \| Cofre<\/title>/.test(pagina));
check("pede indexação, para ser encontrada", /name="robots" content="index, follow"/.test(pagina));
check("tem atalho para o conteúdo", /class="lp-skip"/.test(pagina) && /id="conteudo"/.test(pagina));
check("reaproveita o tema da landing", /css\/landing\.css/.test(pagina) && existe("css/landing.css"));
check("o estilo próprio existe", /css\/reportar\.css/.test(pagina) && existe("css/reportar.css"));

console.log("\n2. O conteúdo cumpre o que o módulo pede");

const secoes = ["Como reportar", "O que enviar", "Escopo", "Regras do teste", "O que esperar",
  "Divulgação coordenada", "Sobre o que você nos envia"];
secoes.forEach((secao) => check(`seção presente: ${secao}`, pagina.includes(secao)));
check("indica canal privado, não issue pública",
  /security\/advisories\/new/.test(pagina) && /Não abra issue pública/.test(pagina));
check("desencoraja publicação antes da correção",
  /antes da correção/.test(pagina) && /Não publique/.test(pagina));
check("explica o motivo real do offline-first na divulgação",
  /funciona offline/.test(pagina) && /ainda não teve como se atualizar/.test(pagina));
check("separa escopo de dentro e de fora", /Dentro/.test(pagina) && /Fora/.test(pagina));
check("proíbe tocar em dado de terceiro", /Não acesse, copie, altere nem apague dado de outra pessoa/.test(pagina));
check("pede que o relato não anexe dado alheio", /Não envie dado de outra pessoa/.test(pagina));
check("declara prazos de resposta", /72 horas/.test(pagina) && /7 dias/.test(pagina));
check("não promete recompensa em dinheiro", /Não há recompensa em dinheiro/.test(pagina));
check("liga ao procedimento interno de incidentes",
  /SECURITY_INCIDENT_RESPONSE\.md/.test(pagina) && existe("SECURITY_INCIDENT_RESPONSE.md"));
check("as rotas citadas no escopo existem",
  ["/api/account", "/api/sync", "/api/analyze"].every((rota) => pagina.includes(rota))
  && existe("netlify/functions/account.js") && existe("netlify/functions/sync.js")
  && existe("netlify/functions/analyze.js"));

console.log("\n3. O security.txt segue a RFC 9116");

const gerado = securityTxt.gerarSecurityTxt("https://exemplo.test", new Date("2026-09-01T12:00:00Z"));
check("gera conteúdo a partir de uma base", gerado !== "");
["Contact:", "Expires:", "Preferred-Languages:", "Canonical:", "Policy:"].forEach((campo) => {
  check(`declara ${campo}`, gerado.includes(campo));
});
check("Expires é ISO 8601 em UTC", /Expires: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/.test(gerado));
const expira = Date.parse((gerado.match(/Expires: (\S+)/) || [])[1]);
const referencia = Date.parse("2026-09-01T12:00:00Z");
check("Expires fica no futuro", expira > referencia, new Date(expira).toISOString());
check("Expires cabe na janela de um ano", expira - referencia < 366 * 24 * 60 * 60 * 1000,
  `${Math.round((expira - referencia) / 86400000)} dias`);
check("Canonical usa o endereço absoluto do próprio arquivo",
  gerado.includes("Canonical: https://exemplo.test/.well-known/security.txt"));
check("Policy aponta para a página publicada",
  gerado.includes(`Policy: https://exemplo.test${securityTxt.CAMINHO_PAGINA}`));
check("todo Contact é URI absoluta",
  (gerado.match(/^Contact: (.+)$/gm) || []).every((linha) => /^Contact: (https?:|mailto:)/.test(linha)));
check("sem base resolvida não gera arquivo inválido", securityTxt.gerarSecurityTxt("") === "");
check("a barra final da base não duplica no caminho",
  securityTxt.gerarSecurityTxt("https://exemplo.test/", new Date("2026-09-01T12:00:00Z"))
    .includes("https://exemplo.test/.well-known/security.txt"));

console.log("\n4. Honestidade do canal");

const dados = securityTxt.controlador();
const email = securityTxt.emailPublicavel(dados);
check("o marcador do controlador nunca vira Contact",
  !gerado.includes(dados.marcador) && !/mailto:\[/.test(gerado));
check("email só entra quando é endereço de verdade",
  email === "" ? !/mailto:/.test(gerado) : gerado.includes(`Contact: mailto:${email}`),
  email || "ainda pendente");
check("a página declara o email como não publicado quando ele é marcador",
  email === "" ? /ainda não publicado/.test(pagina) : true);
check("a página não publica endereço inventado",
  !/mailto:/i.test(pagina) || pagina.includes(email));
check("a pendência do email continua registrada no lançamento",
  /LEGAL-LAUNCH|docs\/LEGAL-LAUNCH\.md/.test(politica) || /incidentEmail/.test(read("docs/LEGAL-LAUNCH.md")));

console.log("\n5. Publicação e roteamento");

const fontes = vercel.rewrites.map((r) => r.source);
check("a reescrita da página está declarada", fontes.includes("/reportar-vulnerabilidade"));
check("o atalho /security.txt existe", fontes.includes("/security.txt"));
check("o security.txt é servido como texto",
  vercel.headers.some((h) => h.source === "/.well-known/security.txt"
    && h.headers.some((c) => c.key === "Content-Type" && /text\/plain/.test(c.value))));
check("a reescrita não cria index.html na raiz", !fontes.includes("/index.html.html"));
check("o build publica a página", /"reportar-vulnerabilidade\.html"/.test(build));
check("o build gera o security.txt em vez de copiá-lo",
  /securityTxt\.escreverEmDist/.test(build) && !existe(".well-known/security.txt"));
check("o servidor local espelha as mesmas reescritas",
  /"\/reportar-vulnerabilidade": "reportar-vulnerabilidade\.html"/.test(serve) && /REESCRITAS/.test(serve));
check("a landing leva ao canal", /href="reportar-vulnerabilidade"/.test(read("landing.html")));
check("a política do repositório existe e aponta para a página",
  politica !== "" && /reportar-vulnerabilidade/.test(politica));
check("a política do repositório não promete recompensa",
  /Não há recompensa em dinheiro/.test(politica));
check("a publicação verifica página, política e gerador",
  /reportar-vulnerabilidade\.html/.test(release) && /SECURITY\.md/.test(release)
  && /security-txt/.test(release));
check("a conferência de produção alcança o canal",
  /\/\.well-known\/security\.txt/.test(deploy) && /reportar-vulnerabilidade/.test(deploy));

console.log("\n6. Nada foi ampliado por acidente");

check("a CSP continua sem permitir formulário",
  /form-action 'none'/.test(read("vercel.json")));
check("a página respeita a CSP: sem inline, sem origem externa de script ou estilo",
  !/<style\b/i.test(pagina) && !/<script\b/i.test(pagina));
check("o service worker não precisou mudar para a página nova",
  /const VERSION = "v62";/.test(read("service-worker.js")));
check("nenhum arquivo do aplicativo entrou no módulo",
  !/reportar/i.test(read("js/app.js")));

console.log(`\n${fail ? "FALHAS ENCONTRADAS" : "TODOS OS TESTES PASSARAM"}: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
