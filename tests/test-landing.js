"use strict";

// test-landing.js; a página comercial e a rota de entrada do domínio.
//
// ESTE ARQUIVO NÃO ABRE NAVEGADOR. Ele guarda o que dá para provar lendo o
// projeto: que a landing não referencia arquivo inexistente, que não sobrou
// marcador de conteúdo por preencher, que todo CTA aponta para uma rota que
// existe de verdade no aplicativo, e — o mais importante — que a entrada do
// domínio está montada de um jeito que não contamina o cache do aplicativo.
//
// O comportamento (rolagem, menu, sobreposição, ausência de estouro
// horizontal) fica em tests/browser/run-landing.js, que precisa de navegador.
//
// Nota sobre expressões regulares neste arquivo: os fontes do projeto estão
// com fim de linha CRLF. Toda travessia de mais de uma linha usa `\s+` em vez
// de `\n`, e todo fim de linha usa `\s*$`, para que a suíte não dependa do
// jeito como o git resolveu a checagem de saída.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const existe = (file) => fs.existsSync(path.join(root, file));

let ok = 0;
let fail = 0;
const check = (label, condition, extra) => {
  if (condition) { ok++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${extra == null ? "" : `: ${extra}`}`); }
};

const landing = read("landing.html");
const folha = read("css/landing.css");
// Verificação de AUSÊNCIA precisa olhar só as regras: os comentários desta
// folha descrevem, de propósito, o que foi removido e por quê. Sem esta
// limpeza, a documentação da correção reprovaria a própria correção.
const folhaRegras = folha.replace(/\/\*[\s\S]*?\*\//g, "");
const script = read("js/landing.js");
const boot = read("js/landing-boot.js");
const sw = read("service-worker.js");
const vercel = JSON.parse(read("vercel.json"));
const serve = read("scripts/serve.js");
const build = read("scripts/build-dist.js");
const router = read("js/router.js");

/* ================================================================== *
 * 1. NENHUM ARQUIVO REFERENCIADO PODE FALTAR
 * ================================================================== */
console.log("\n1. Todo recurso referenciado existe");

// Endereço sem extensão que a plataforma resolve por reescrita não é arquivo:
// "/reportar-vulnerabilidade" existe como rota, não como caminho no disco. A
// lista sai do próprio vercel.json, então tirar a reescrita de lá volta a
// reprovar aqui em vez de publicar um link quebrado.
const fontesReescritas = new Set(
  (vercel.rewrites || []).map((regra) => String(regra.source || "").replace(/^\//, ""))
);
const ehReescrito = (destino) => fontesReescritas.has(String(destino).replace(/^\//, ""));

const referencias = Array.from(landing.matchAll(/(?:src|href)="([^"#][^"]*)"/g))
  .map((m) => m[1])
  .filter((valor) => !/^(https?:)?\/\//.test(valor) && !valor.startsWith("mailto:") && !valor.startsWith("/"))
  .map((valor) => valor.split("#")[0])
  .filter(Boolean);

const ausentes = [...new Set(referencias)].filter((arquivo) => !existe(arquivo) && !ehReescrito(arquivo));
check("landing.html não aponta para arquivo inexistente", ausentes.length === 0, ausentes.join(", "));

// A REGRA DAS FONTES.
// A folha declarava @font-face para `fonts/inter-400.woff2` e
// `fonts/space-grotesk-500.woff2`, que nunca existiram no repositório. Em
// produção isso vira uma requisição por família devolvendo HTML de 404 que o
// navegador tenta ler como WOFF2; no servidor de desenvolvimento, devolvendo
// `index.html` com status 200. Ou o arquivo existe, ou a referência sai.
const fontesCss = Array.from(folhaRegras.matchAll(/url\(["']?([^"')]+\.(?:woff2?|ttf|otf))["']?\)/g)).map((m) => m[1]);
const fontesQuebradas = fontesCss.filter((ref) => !existe(path.posix.join("css", ref)));
check("css/landing.css não referencia arquivo de fonte inexistente", fontesQuebradas.length === 0, fontesQuebradas.join(", "));
check("a folha define uma pilha tipográfica explícita", /--lp-font-body:\s*ui-sans-serif/.test(folhaRegras));

/* ================================================================== *
 * 2. NENHUM MARCADOR DE CONTEÚDO POR PREENCHER NA INTERFACE PÚBLICA
 * ================================================================== */
console.log("\n2. Sem placeholder na interface pública");

// O conteúdo de <template> não é renderizado: ele fica num fragmento fora do
// documento. Para medir o que a pessoa VÊ, o corpo do template sai antes.
const semTemplates = landing.replace(/<template[\s\S]*?<\/template>/g, "");
// Comentário HTML também não aparece na tela.
const visivel = semTemplates.replace(/<!--[\s\S]*?-->/g, "");

[
  ["preço reservado", /XX,XX/],
  ["plano marcado como espaço reservado", /Espaço reservado/i],
  ["depoimento de exemplo", /Depoimento de cliente/i],
  ["nome de cliente genérico", /Nome do cliente/i],
  ["marcador de edição", /SUBSTITUIR/],
  ["texto Lorem", /lorem ipsum/i],
].forEach(([nome, padrao]) => {
  check(`não aparece ${nome}`, !padrao.test(visivel));
});

// A promessa de "2 minutos" não tem medição por trás. Enquanto não houver,
// ela não pode voltar em lugar nenhum da página.
check("não promete tempo de configuração sem medição", !/\b(dois|2)\s+minutos?\b/i.test(visivel));

check("a prova social fica dentro de um <template> desligado",
  /<template[^>]*data-lp-social-proof/.test(landing) && !/lp-social/.test(visivel));

/* ================================================================== *
 * 3. TODO CTA APONTA PARA UMA ROTA QUE EXISTE
 * ================================================================== */
console.log("\n3. Destinos válidos");

// As rotas do aplicativo vivem no hash e têm nome em português. A lista sai
// do próprio js/router.js: se um slug for renomeado lá, este teste reprova
// aqui em vez de a landing levar a pessoa para uma tela em branco.
const slugs = new Set(
  Array.from(router.matchAll(/^\s{2}\w+:\s*"([a-z0-9-]+)",\s*$/gm)).map((m) => m[1])
);
check("a lista de rotas do aplicativo foi lida", slugs.size > 10, `${slugs.size} rota(s)`);

const ancoras = new Set(Array.from(landing.matchAll(/\sid="([^"]+)"/g)).map((m) => m[1]));
const destinos = Array.from(landing.matchAll(/href="([^"]+)"/g)).map((m) => m[1]);
const invalidos = destinos.filter((destino) => {
  if (destino === "/") return false;                       // raiz: a própria landing
  if (destino.startsWith("#")) return !ancoras.has(destino.slice(1));
  if (destino === "index.html") return false;              // aplicativo
  if (ehReescrito(destino)) return false;                  // rota da plataforma
  const rota = destino.match(/^index\.html#\/([a-z0-9-]+)$/);
  if (rota) return !slugs.has(rota[1]);
  return !existe(destino.split("#")[0]);
});
check("nenhum link aponta para rota ou âncora inexistente", invalidos.length === 0, invalidos.join(", "));

const cta = destinos.filter((d) => d === "index.html").length;
check("existe mais de um caminho para o aplicativo", cta >= 3, `${cta} link(s)`);
check("o 'Entrar' leva à tela real de conta e acesso", /href="index\.html#\/conta-e-acesso"/.test(landing));

/* ================================================================== *
 * 4. CSP: NADA DE ESTILO NEM SCRIPT EM ATRIBUTO
 * ================================================================== */
console.log("\n4. Compatível com a política de segurança de conteúdo");

check("landing.html não tem atributo style", !/\sstyle\s*=/.test(landing));
check("landing.html não tem manipulador em atributo", !/\son[a-z]+\s*=\s*"/i.test(landing));
check("landing.html não tem <script> em linha",
  !/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>/.test(landing));
check("os scripts da página são locais",
  Array.from(landing.matchAll(/<script[^>]*src="([^"]+)"/g)).every((m) => m[1].startsWith("js/")));

/* ================================================================== *
 * 5. CABEÇALHO DE BUSCA E COMPARTILHAMENTO
 * ================================================================== */
console.log("\n5. Busca e compartilhamento");

const meta = (nome) => new RegExp(`<meta\\s+(?:name|property)="${nome}"\\s+content="([^"]*)"`).exec(landing);
check("tem título", /<title>[^<]{10,70}<\/title>/.test(landing));
const descricao = meta("description");
check("tem descrição de tamanho utilizável", !!descricao && descricao[1].length >= 80 && descricao[1].length <= 165,
  descricao ? `${descricao[1].length} caracteres` : "ausente");
check("tem canonical", /<link rel="canonical"/.test(landing));
check("tem robots", /<meta name="robots"/.test(landing));
["og:type", "og:title", "og:description", "og:image", "og:site_name", "og:locale"].forEach((p) => {
  check(`tem ${p}`, new RegExp(`property="${p}"`).test(landing));
});
check("tem cartão do Twitter", /name="twitter:card"/.test(landing));
check("declara o idioma", /<html lang="pt-BR">/.test(landing));
check("aponta o manifesto do aplicativo", /<link rel="manifest" href="manifest\.webmanifest"/.test(landing));

// Endereço absoluto é responsabilidade do build, e o build precisa saber
// quais marcas reescrever.
const marcadas = (landing.match(/data-lp-absolute/g) || []).length;
check("os endereços de compartilhamento estão marcados para o build", marcadas >= 3, `${marcadas} marca(s)`);
check("o build sabe reescrever esses endereços", /data-lp-absolute/.test(build) && /SITE_URL/.test(build));

/* ================================================================== *
 * 6. A LANDING É A ENTRADA DO DOMÍNIO
 * ================================================================== */
console.log("\n6. Entrada do domínio");

// A ENTRADA DEPENDE DE DUAS REESCRITAS, E DE O `index.html` NÃO SER
// PUBLICADO COM ESSE NOME.
//
// A Vercel consulta o sistema de arquivos antes das reescritas: bastaria
// um `index.html` na raiz da publicação para "/" servir o aplicativo e a
// regra da landing nunca ser avaliada. Por isso o build publica o
// aplicativo como `app.html` e as duas reescritas trabalham juntas.
const reescritas = vercel.rewrites || [];
const reescrita = (origem) => (reescritas.find((r) => r.source === origem) || {}).destination;
check("a publicação reescreve a raiz para a página comercial",
  reescrita("/") === "/landing.html", reescrita("/") || "ausente");
check("o aplicativo continua respondendo em /index.html",
  existe("index.html") && reescrita("/index.html") === "/app.html", reescrita("/index.html") || "ausente");
check("o build não publica um index.html que roubaria a raiz",
  /RENOMEADOS = \{ "index\.html": "app\.html" \}/.test(build)
  && /dist\/index\.html não pode existir/.test(build));
check("o servidor de desenvolvimento faz a mesma coisa",
  /function ehRaiz/.test(serve) && /path\.join\(base, "landing\.html"\)/.test(serve));
check("o build publica a página comercial e os arquivos dela",
  /"landing\.html"/.test(build) && /js\/landing-boot\.js/.test(build) && /js\/landing\.js/.test(build));

/* ================================================================== *
 * 7. O CACHE DO APLICATIVO NÃO PODE SER CONTAMINADO PELA LANDING
 * ================================================================== *
 * Esta é a parte que justifica o teste existir. Enquanto "/" servia o
 * aplicativo, tratá-la como shell era correto. Com a raiz entregando a página
 * comercial, a mesma regra faria o service worker guardar o folheto sob a
 * chave "index.html" — e o aplicativo passaria a abrir offline na página de
 * marketing, sem que a rede pudesse corrigir.
 *
 * `isAppShell` é extraída do arquivo e executada de verdade: assim o teste
 * mede a função, não a intenção de quem a escreveu.
 */
console.log("\n7. Separação entre o cache do aplicativo e o da landing");

const trecho = sw.match(/function isAppShell\(request\)[\s\S]*?\r?\n\}/);
check("a função de identificação do shell foi encontrada", !!trecho);

if (trecho) {
  const caixa = { self: { location: { origin: "https://cofre.exemplo" } }, URL };
  vm.createContext(caixa);
  vm.runInContext(trecho[0], caixa);
  const shell = (url) => vm.runInContext(`isAppShell({ url: ${JSON.stringify(url)} })`, caixa);

  check("a raiz NÃO é o shell do aplicativo", shell("https://cofre.exemplo/") === false);
  check("a raiz com parâmetro de campanha NÃO é o shell", shell("https://cofre.exemplo/?utm_source=x") === false);
  check("a página comercial NÃO é o shell", shell("https://cofre.exemplo/landing.html") === false);
  check("index.html É o shell", shell("https://cofre.exemplo/index.html") === true);
  check("index.html com hash de rota É o shell", shell("https://cofre.exemplo/index.html#/metas") === true);
  check("outra origem nunca é o shell", shell("https://outro.exemplo/index.html") === false);
}

// As duas listas são lidas SEM os comentários que moram dentro delas: a nota
// que explica por que `"./"` saiu do shell contém justamente o texto que a
// verificação procura, e documentar a correção não pode reprová-la.
const semNota = (trechoJs) => trechoJs.replace(/\/\/[^\r\n]*/g, "");
const listaShell = semNota(sw.slice(sw.indexOf("const APP_SHELL"), sw.indexOf("];", sw.indexOf("const APP_SHELL"))));

check("existe um cache separado para páginas que não são o shell", /const PAGE_CACHE = "financas-pages-"/.test(sw));
check("a navegação escolhe o balde pelo tipo de página",
  /caches\.open\(shell \? CACHE_NAME : PAGE_CACHE\)/.test(sw));
check("só o shell escreve na chave do shell",
  /const chave = shell \? "index\.html" : chaveDePagina\(event\.request\)/.test(sw));
check("a raiz saiu da lista de pré-carga do aplicativo", !/"\.\/"/.test(listaShell));
check("o shell do aplicativo não inclui arquivo da landing", !/landing/.test(listaShell));
check("a página comercial é pré-carregada no balde de páginas",
  /const LANDING_PAGES = \["\.\/", "landing\.html"\]/.test(sw));
check("os estáticos da landing entram no cache normal",
  /const LANDING_ASSETS = \[/.test(sw) && /"css\/landing\.css"/.test(sw));
check("a promoção exige todo o pacote declarado",
  /const REQUIRED_PRECACHE = \[\.\.\.APP_SHELL, \.\.\.LANDING_ASSETS, \.\.\.LANDING_PAGES\]/.test(sw)
  && /obrigatoriosQuebrados/.test(sw) && /caches\.delete\(CACHE_NAME\)/.test(sw));
check("a limpeza da ativação preserva os três baldes",
  /const manter = \[CACHE_NAME, PAGE_CACHE, FONT_CACHE\]/.test(sw));
check("a versão do cache foi promovida",
  /const VERSION = "v(\d+)"/.test(sw) && Number(sw.match(/const VERSION = "v(\d+)"/)[1]) >= 49);

/* ================================================================== *
 * 8. NADA DE CONTEÚDO DEPENDE DE ANIMAÇÃO
 * ================================================================== */
console.log("\n8. Conteúdo independente de animação");

check("o estado escondido só existe sob data-lp-motion",
  /\[data-lp-motion="on"\] \.lp-anim/.test(folhaRegras)
  && /\[data-lp-motion="on"\] \.lp-anim\.is-in/.test(folhaRegras));
// O BOOT É EXECUTADO, NÃO LIDO.
//
// Esta verificação já foi um casamento de texto contra `if (!movimentoReduzido)`.
// Ela media a linha, não a regra: bastou o boot ganhar uma segunda condição
// (o reencaminhamento do link de confirmação de conta, ver
// tests/test-account-callback.js) para a suíte reprovar uma mudança que
// preservava inteiro o comportamento sob `prefers-reduced-motion`. É o mesmo
// raciocínio da seção 7, onde `isAppShell` é extraída e executada.
function rodarBoot(preferReduzido) {
  const atributos = {};
  const raiz = {
    setAttribute(nome, valor) { atributos[nome] = String(valor); },
    getAttribute(nome) { return Object.prototype.hasOwnProperty.call(atributos, nome) ? atributos[nome] : null; },
    removeAttribute(nome) { delete atributos[nome]; },
  };
  const location = { search: "", hash: "", replace() {} };
  const janela = {
    location,
    matchMedia: (consulta) => ({ matches: /prefers-reduced-motion:\s*reduce/.test(consulta) && preferReduzido }),
    setTimeout: () => 0,
  };
  const caixa = { window: janela, document: { documentElement: raiz }, location };
  vm.createContext(caixa);
  vm.runInContext(boot, caixa, { filename: "landing-boot.js" });
  return raiz.getAttribute("data-lp-motion");
}

check("o boot consulta a preferência de movimento reduzido", /prefers-reduced-motion: reduce/.test(boot));
check("o boot não marca movimento com preferência reduzida", rodarBoot(true) === null, String(rodarBoot(true)));
check("o boot marca movimento quando não há preferência reduzida", rodarBoot(false) === "on", String(rodarBoot(false)));
check("existe trinco para o caso de só o landing.js falhar",
  /data-lp-ready/.test(boot) && /removeAttribute\("data-lp-motion"\)/.test(boot));
check("o landing.js declara prontidão logo no início",
  script.indexOf('raiz.setAttribute("data-lp-ready", "on")') > -1
  && script.indexOf('raiz.setAttribute("data-lp-ready", "on")') < script.indexOf("var animar"));
check("há rede de segurança se o observador nunca responder",
  /observadorRespondeu/.test(script) && /2500/.test(script));
check("os laços decorativos só são congelados quando há como religá-los",
  /if \(lacos\.length && temObservador\)/.test(script)
  && /\[data-lp-loops="on"\] \[data-loop\] \{ animation-play-state: paused; \}/.test(folhaRegras));

/* ================================================================== *
 * 9. HIGIENE DA COMPOSIÇÃO
 * ================================================================== */
console.log("\n9. Higiene da composição");

check("a contenção horizontal usa clip, não hidden com rolagem",
  /html, body\.lp \{ overflow-x: hidden; overflow-x: clip; \}/.test(folhaRegras));
check("a regra de empilhamento não sobrescreve position de filhos do body",
  !/body\.lp > \*:not\(\.lp-atmos\)/.test(folhaRegras)
  && /body\.lp > main,\s+body\.lp > \.lp-foot \{ position: relative; z-index: 1; \}/.test(folhaRegras));
check("o painel fixo do storytelling sai de cena no estreito",
  /\.lp-story__stage \{ display: none; \}/.test(folhaRegras));
check("cada etapa tem o próprio recorte de tela para o estreito",
  (landing.match(/class="lp-step__art lp-reveal"/g) || []).length === 4);
check("a doca de CTA é fixa e presa às duas bordas",
  /\.lp-dock \{\s+position: fixed;\s+left: max\(12px/.test(folhaRegras));
check("há tratamento de custo de pintura para ponteiro grosso",
  /@media \(pointer: coarse\) \{\s*\.lp-atmos__noise \{ mix-blend-mode: normal/.test(folhaRegras));
check("o campo de etiquetas do caos é reduzido antes de encostar na borda",
  /\.lp-caos__field \{ --k: 0\.82; \}/.test(folhaRegras) && /\.lp-caos__field \{ --k: 0\.72; \}/.test(folhaRegras));

console.log(`\n${fail ? "FALHAS ENCONTRADAS" : "TODOS OS TESTES PASSARAM"}: ${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
