"use strict";

// Gera `dist/`: só o que o navegador precisa.
//
// POR QUE
//
// A publicação já apontou para a raiz do repositório inteira. Isso põe no ar,
// acessível por URL direta:
//
//   * `tests/` inteiro, com os cenários e os dados de teste;
//   * `docs/`, incluindo as especificações internas;
//   * `supabase/migrations/`, que descreve o schema, as políticas de RLS e o
//     nome de cada função `security definer`;
//   * `scripts/`, `package.json`, `.github/`.
//
// Nada disso é segredo por si só, mas entregar o desenho do backend de bandeja
// é um presente para quem estiver procurando por onde começar. E ainda faz o
// deploy carregar arquivos que nenhum usuário vai buscar.
//
// A lista abaixo é de INCLUSÃO: o que não estiver nela não vai para o ar.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const securityTxt = require("./security-txt");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");

// `landing.html` e a pagina comercial; ela vive no mesmo dominio do app,
// usa a propria folha (css/landing.css, copiada junto com a pasta css/) e os
// dois scripts abaixo. Sem ela na lista, o deploy publicaria so o aplicativo.
//
// O APLICATIVO SAI COM OUTRO NOME DE ARQUIVO, E ISSO E O QUE FAZ A RAIZ
// ENTREGAR A PAGINA COMERCIAL.
//
// A Vercel consulta o sistema de arquivos ANTES das reescritas. Enquanto
// existir um `index.html` na raiz da publicacao, "/" serve esse arquivo e a
// reescrita de "/" para "/landing.html" nunca chega a ser avaliada: o dominio
// abriria no aplicativo e o funil de marketing deixaria de existir.
//
// Publicando o aplicativo como `app.html`, os dois enderecos viram falha de
// sistema de arquivos, e as duas reescritas de `vercel.json` passam a valer:
//
//     "/"            -> /landing.html
//     "/index.html"  -> /app.html
//
// A segunda e uma REESCRITA, nao um desvio: o endereco continua sendo
// `/index.html` e os bytes entregues sao os do `index.html` do repositorio.
// Por isso nada do aplicativo precisou mudar. O `start_url` do manifesto
// (`./index.html`) continua valendo para quem ja instalou, a chave
// "index.html" do cache do service worker continua apontando para o shell, e
// todo link `index.html#/rota` continua chegando onde chegava.
//
// O nome do arquivo publicado nao aparece em endereco nenhum: e detalhe de
// dentro da pasta `dist/`.
// `reportar-vulnerabilidade.html` é página pública estática (M21): sem script,
// sem formulário, sem chamada de rede. Ela entra aqui como qualquer outro
// documento; a reescrita de "/reportar-vulnerabilidade" está no vercel.json.
const ARQUIVOS = ["landing.html", "reportar-vulnerabilidade.html", "manifest.webmanifest", "service-worker.js"];
const RENOMEADOS = { "index.html": "app.html" };
const PASTAS = ["css", "icons", "fonts", "vendor"];
// De `js/`, só o que o `index.html` carrega. O resto são as fontes que o build
// concatena em `app.generated.js`.
const JS_PUBLICADOS = ["js/boot.js", "js/landing-boot.js", "js/landing.js", "js/modules"];
const EXTENSOES_TEXTO = new Set([".css", ".html", ".js", ".json", ".map", ".svg", ".txt", ".webmanifest", ".xml"]);

function normalizarLf(texto) {
  return String(texto).replace(/\r\n?/g, "\n");
}

// O ATRIBUTO "SOMENTE LEITURA" DO WINDOWS DERRUBA A LIMPEZA.
//
// Pasta dentro de área sincronizada (OneDrive, no caso) volta a nascer com o
// atributo `R`, e `fs.rmSync` responde `EPERM` antes de o build começar. A
// mensagem não fala em atributo nenhum: fala em permissão, num diretório que a
// pessoa acabou de criar. No Windows `chmod` é justamente o interruptor desse
// atributo, então destravar a árvore inteira e só então remover resolve. Nos
// outros sistemas o laço não muda nada, porque lá o atributo não existe e a
// permissão de escrita já é a que o dono tem.
function destravar(alvo) {
  let stat;
  try { stat = fs.lstatSync(alvo); } catch (_) { return; }
  try { fs.chmodSync(alvo, 0o700); } catch (_) { /* se importava, o rm reclama */ }
  if (stat.isDirectory()) fs.readdirSync(alvo).forEach((nome) => destravar(path.join(alvo, nome)));
}

function limpar(dir) {
  if (fs.existsSync(dir)) {
    destravar(dir);
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
  }
  fs.mkdirSync(dir, { recursive: true });
}

function copiar(origem, destino) {
  const stat = fs.statSync(origem);
  if (stat.isDirectory()) {
    fs.mkdirSync(destino, { recursive: true });
    let total = 0;
    fs.readdirSync(origem).forEach((nome) => {
      // O README da pasta de fontes é instrução para quem desenvolve.
      if (nome === "README.md") return;
      total += copiar(path.join(origem, nome), path.join(destino, nome));
    });
    return total;
  }
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  if (EXTENSOES_TEXTO.has(path.extname(origem).toLowerCase())) {
    fs.writeFileSync(destino, normalizarLf(fs.readFileSync(origem, "utf8")), "utf8");
  } else {
    fs.copyFileSync(origem, destino);
  }
  return 1;
}

function listarArquivos(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const absoluto = path.join(dir, entrada.name);
    if (entrada.isDirectory()) return listarArquivos(absoluto, base);
    return [path.relative(base, absoluto).replace(/\\/g, "/")];
  });
}

function sha256(conteudo) {
  return crypto.createHash("sha256").update(conteudo).digest("hex");
}

function nomeComHash(arquivo, digest) {
  const extensao = path.posix.extname(arquivo);
  return `${arquivo.slice(0, -extensao.length)}.${digest}${extensao}`;
}

// A identidade cobre o pacote publicado inteiro, não só o módulo de entrada.
// O worker entra antes de receber a própria identidade, evitando uma referência
// circular. Assim qualquer mudança de arquivo cria outro conjunto de caches.
function identidadeDoPacote() {
  const arquivos = listarArquivos(DIST).sort();
  const hash = crypto.createHash("sha256");
  arquivos.forEach((arquivo) => {
    let conteudo = fs.readFileSync(path.join(DIST, ...arquivo.split("/")));
    if (arquivo === "app.html") {
      conteudo = Buffer.from(
        conteudo.toString("utf8").replace(/<meta\s+name="cofre-build"\s+content="sha256-[a-f0-9]{64}"\s*\/>\n?/g, ""),
        "utf8"
      );
    }
    hash.update(arquivo, "utf8");
    hash.update("\0", "utf8");
    hash.update(sha256(conteudo), "utf8");
    hash.update("\n", "utf8");
  });
  return hash.digest("hex");
}

function reescreverImportacoes(conteudo, resolver) {
  const regras = [
    /(\bimport\s*\(\s*)(["'])(\.{1,2}\/[^"']+\.js)\2(\s*\))/g,
    /(\b(?:import|export)\s+[^"';\r\n]*?\bfrom\s*)(["'])(\.{1,2}\/[^"']+\.js)\2/g,
    /(\bimport\s*)(["'])(\.{1,2}\/[^"']+\.js)\2/g,
  ];
  return regras.reduce((atual, regra) => atual.replace(
    regra,
    (trecho, antes, aspas, referencia, depois = "") => `${antes}${aspas}${resolver(referencia)}${aspas}${depois}`
  ), conteudo);
}

function versionarModulos() {
  const diretorio = path.join(DIST, "js", "modules");
  const fontes = listarArquivos(diretorio).filter((arquivo) => arquivo.endsWith(".js"));
  const conhecidos = new Set(fontes);
  const prontos = new Map();
  const processando = new Set();

  function gerar(arquivo) {
    if (prontos.has(arquivo)) return prontos.get(arquivo);
    if (processando.has(arquivo)) {
      throw new Error(`Ciclo entre módulos impede nome por conteúdo: ${arquivo}`);
    }
    processando.add(arquivo);

    const absoluto = path.join(diretorio, ...arquivo.split("/"));
    let conteudo = normalizarLf(fs.readFileSync(absoluto, "utf8"));
    conteudo = reescreverImportacoes(conteudo, (referencia) => {
      const destino = path.posix.normalize(path.posix.join(path.posix.dirname(arquivo), referencia));
      if (!conhecidos.has(destino)) {
        throw new Error(`Importação ausente em ${arquivo}: ${referencia}`);
      }
      const gerado = gerar(destino);
      let relativa = path.posix.relative(path.posix.dirname(arquivo), gerado.arquivo);
      if (!relativa.startsWith(".")) relativa = `./${relativa}`;
      return relativa;
    });

    const digest = sha256(Buffer.from(conteudo, "utf8"));
    const publicado = nomeComHash(arquivo, digest);
    const destino = path.join(diretorio, ...publicado.split("/"));
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, conteudo, "utf8");
    const resultado = { arquivo: publicado, digest };
    prontos.set(arquivo, resultado);
    processando.delete(arquivo);
    return resultado;
  }

  fontes.forEach(gerar);
  fontes.forEach((arquivo) => fs.rmSync(path.join(diretorio, ...arquivo.split("/")), { force: true }));
  return prontos;
}

function reescreverPacoteVersionado(modulos) {
  const bootstrap = modulos.get("bootstrap.js");
  if (!bootstrap) throw new Error("Módulo obrigatório ausente: js/modules/bootstrap.js");

  const htmlPath = path.join(DIST, "app.html");
  let html = normalizarLf(fs.readFileSync(htmlPath, "utf8"));
  const bootstrapFonte = "js/modules/bootstrap.js";
  const bootstrapPublicado = `js/modules/${bootstrap.arquivo}`;
  if (!html.includes(`src="${bootstrapFonte}"`)) {
    throw new Error(`app.html não carrega ${bootstrapFonte}`);
  }
  html = html.replace(`src="${bootstrapFonte}"`, `src="${bootstrapPublicado}"`);
  fs.writeFileSync(htmlPath, normalizarLf(html), "utf8");

  const pacoteDigest = identidadeDoPacote();
  const buildId = `sha256-${pacoteDigest}`;
  if (!/<meta\s+name="cofre-build"\s/.test(html)) {
    html = html.replace("</head>", `<meta name="cofre-build" content="${buildId}" />\n</head>`);
  }
  fs.writeFileSync(htmlPath, normalizarLf(html), "utf8");

  const workerPath = path.join(DIST, "service-worker.js");
  let worker = normalizarLf(fs.readFileSync(workerPath, "utf8"));
  modulos.forEach((gerado, fonte) => {
    const anterior = `js/modules/${fonte}`;
    const proximo = `js/modules/${gerado.arquivo}`;
    worker = worker.replaceAll(`"${anterior}"`, `"${proximo}"`);
    worker = worker.replaceAll(`'${anterior}'`, `'${proximo}'`);
  });
  if (!worker.includes("const BUILD_ID = VERSION;")) {
    throw new Error("service-worker.js não declara BUILD_ID a partir de VERSION");
  }
  worker = worker.replace("const BUILD_ID = VERSION;", `const BUILD_ID = "${buildId}";`);
  const versaoFonte = (worker.match(/const VERSION = "(v\d+)";/) || [])[1];
  if (!versaoFonte) throw new Error("service-worker.js não possui uma versão de cache válida");
  worker = worker.replace(
    `const VERSION = "${versaoFonte}";`,
    `const VERSION = "${versaoFonte}-${pacoteDigest}";`
  );

  const semHash = Array.from(modulos.keys()).filter((fonte) => {
    const referencia = `js/modules/${fonte}`;
    return worker.includes(`"${referencia}"`) || worker.includes(`'${referencia}'`);
  });
  if (semHash.length) {
    throw new Error(`service worker ainda aponta para módulo sem hash: ${semHash.join(", ")}`);
  }
  const cacheados = new Set(Array.from(worker.matchAll(/["'](js\/modules\/[^"']+\.js)["']/g)).map((resultado) => resultado[1]));
  const publicados = new Set(Array.from(modulos.values()).map((gerado) => `js/modules/${gerado.arquivo}`));
  const faltandoNoCache = Array.from(publicados).filter((arquivo) => !cacheados.has(arquivo));
  const sobrandoNoCache = Array.from(cacheados).filter((arquivo) => !publicados.has(arquivo));
  if (faltandoNoCache.length || sobrandoNoCache.length) {
    throw new Error(`Lista de módulos do service worker diverge do pacote: faltam [${faltandoNoCache.join(", ")}], sobram [${sobrandoNoCache.join(", ")}]`);
  }
  fs.writeFileSync(workerPath, normalizarLf(worker), "utf8");
  return { buildId, bootstrap: bootstrapPublicado };
}

/* ------------------------------------------------------------------ *
 * ENDEREÇO ABSOLUTO NA PÁGINA COMERCIAL
 *
 * `canonical`, `og:url` e `og:image` só funcionam de verdade absolutos: o
 * WhatsApp, o LinkedIn e o buscador não têm como resolver "/" fora do
 * contexto da página. Mas o domínio não está fixado no repositório, e
 * chutar um seria pior do que não ter — endereço errado quebra o
 * compartilhamento em vez de melhorá-lo.
 *
 * Solução: o código-fonte fica com o caminho relativo, marcado com
 * `data-lp-absolute`, e o BUILD reescreve quando a publicação sabe o
 * endereço. Na Vercel, `VERCEL_PROJECT_PRODUCTION_URL` traz o domínio estável
 * do projeto e `VERCEL_URL` o endereço daquela publicação; as duas vêm SEM
 * esquema, então o `https://` entra aqui. Fora dela,
 * `SITE_URL=https://exemplo npm run build:dist`.
 *
 * A ordem não é arbitrária: `SITE_URL` primeiro, porque é a única definida à
 * mão e serve justamente para mandar em cima das outras; depois o domínio de
 * produção, que é o que deve aparecer em `canonical` mesmo numa
 * pré-visualização, para uma prévia não disputar indexação com a página real.
 *
 * Sem nenhuma das variáveis o build não falha: o arquivo sai relativo,
 * exatamente como está no repositório, e o aviso explica o que ficou de
 * fora. É a diferença entre uma pendência declarada e um erro silencioso.
 * ------------------------------------------------------------------ */
function baseDoSite() {
  const bruto = process.env.SITE_URL
    || process.env.VERCEL_PROJECT_PRODUCTION_URL
    || process.env.VERCEL_URL
    || "";
  if (!bruto) return "";
  const comEsquema = /^https?:\/\//i.test(bruto) ? bruto : `https://${bruto}`;
  try {
    const url = new URL(comEsquema);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.origin;
  } catch (_) {
    return "";
  }
}

function absolutizar(arquivo) {
  const base = baseDoSite();
  const alvo = path.join(DIST, arquivo);
  if (!fs.existsSync(alvo)) return;

  const original = fs.readFileSync(alvo, "utf8");
  const marcas = original.match(/content="[^"]*"[^>]*data-lp-absolute|href="[^"]*"[^>]*data-lp-absolute/g) || [];

  if (!base) {
    if (marcas.length) {
      console.warn(
        `AVISO: ${marcas.length} endereço(s) de compartilhamento em ${arquivo} continuam relativos. `
        + "Defina SITE_URL (na Vercel, VERCEL_PROJECT_PRODUCTION_URL já vem no ambiente) "
        + "para gerar canonical, og:url e og:image absolutos."
      );
    }
    return;
  }

  // Só os atributos marcados são tocados, e só quando o valor é relativo.
  const reescrito = original.replace(
    /(href|content)="(\/[^"]*|[^":]+)"(\s[^>]*)?\sdata-lp-absolute/g,
    (trecho, atributo, valor, meio) => {
      const caminho = valor.startsWith("/") ? valor : `/${valor}`;
      return `${atributo}="${base}${caminho}"${meio || ""} data-lp-absolute`;
    }
  );

  fs.writeFileSync(alvo, reescrito);
  console.log(`Endereços de compartilhamento de ${arquivo} apontados para ${base}.`);
}

function main() {
  limpar(DIST);
  let total = 0;

  ARQUIVOS.forEach((arquivo) => {
    const origem = path.join(ROOT, arquivo);
    if (!fs.existsSync(origem)) throw new Error(`Arquivo obrigatório ausente: ${arquivo}`);
    total += copiar(origem, path.join(DIST, arquivo));
  });

  Object.entries(RENOMEADOS).forEach(([arquivo, nomePublicado]) => {
    const origem = path.join(ROOT, arquivo);
    if (!fs.existsSync(origem)) throw new Error(`Arquivo obrigatório ausente: ${arquivo}`);
    total += copiar(origem, path.join(DIST, nomePublicado));
  });

  PASTAS.concat(JS_PUBLICADOS).forEach((pasta) => {
    const origem = path.join(ROOT, pasta);
    if (!fs.existsSync(origem)) return;      // `fonts/` pode estar vazia
    total += copiar(origem, path.join(DIST, pasta));
  });

  // Guarda de segurança: se algum dia alguém copiar demais, o build falha aqui
  // em vez de publicar.
  const proibidos = ["tests", "docs", "supabase", "scripts", "package.json", ".github", "netlify", "api"];
  const vazados = proibidos.filter((nome) => fs.existsSync(path.join(DIST, nome)));
  if (vazados.length) throw new Error(`dist/ não pode conter: ${vazados.join(", ")}`);

  // A REGRA QUE FAZ A RAIZ SER A PÁGINA COMERCIAL.
  //
  // Se um `index.html` reaparecer na raiz da publicação, a Vercel passa a
  // servi-lo em "/" pelo sistema de arquivos e a reescrita para a landing
  // deixa de ser consultada, sem erro nenhum: o domínio simplesmente volta a
  // abrir no aplicativo. Falhar aqui é a única forma de isso não passar
  // despercebido até alguém reparar no site publicado.
  if (fs.existsSync(path.join(DIST, "index.html"))) {
    throw new Error(
      "dist/index.html não pode existir: a Vercel serviria esse arquivo em \"/\" "
      + "e a reescrita para a página comercial nunca seria avaliada. "
      + "O aplicativo é publicado como app.html (ver RENOMEADOS)."
    );
  }

  // O módulo gerado precisa estar atualizado, senão o dist sai com a versão
  // anterior do aplicativo.
  const gerado = path.join(DIST, "js/modules/app.generated.js");
  if (!fs.existsSync(gerado)) throw new Error("Rode `npm run build` antes: js/modules/app.generated.js não existe.");

  const modulos = versionarModulos();
  absolutizar("landing.html");
  const pacote = reescreverPacoteVersionado(modulos);

  // O security.txt é gerado, não copiado: `Expires` precisa ser renovado a cada
  // publicação, senão o canal aparece expirado para quem o consultar. Ver
  // scripts/security-txt.js.
  const seguranca = securityTxt.escreverEmDist(DIST, baseDoSite());
  if (seguranca.escrito) {
    console.log(`${seguranca.caminho} gerado, válido até ${seguranca.expira}.`);
  } else {
    console.warn(
      `AVISO: ${securityTxt.CAMINHO_ARQUIVO} não foi gerado (${seguranca.motivo}). `
      + "Defina SITE_URL para publicar o canal de divulgação responsável."
    );
  }

  console.log(`Pacote ${pacote.buildId} inicia em ${pacote.bootstrap}.`);
  console.log(`dist/ gerado com ${total} arquivo(s).`);
}

main();
