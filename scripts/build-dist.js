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
const ARQUIVOS = ["landing.html", "manifest.webmanifest", "service-worker.js"];
const RENOMEADOS = { "index.html": "app.html" };
const PASTAS = ["css", "icons", "fonts"];
// De `js/`, só o que o `index.html` carrega. O resto são as fontes que o build
// concatena em `app.generated.js`.
const JS_PUBLICADOS = ["js/boot.js", "js/landing-boot.js", "js/landing.js", "js/modules"];

function limpar(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
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
  fs.copyFileSync(origem, destino);
  return 1;
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

  absolutizar("landing.html");

  console.log(`dist/ gerado com ${total} arquivo(s).`);
}

main();
