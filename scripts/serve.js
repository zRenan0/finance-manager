"use strict";

// Servidor estático de desenvolvimento (`npm start`).
//
// POR QUE ELE EXISTE
//
// O README mandava abrir o `index.html` com duplo clique. Isso nunca funcionou
// de verdade nesta versão do app, e a promessa custava caro em suporte:
//
//   * módulos ES (`<script type="module">`) são bloqueados em `file://` por
//     política de origem; o app não inicia;
//   * `service worker` exige origem segura (`https:` ou `localhost`);
//   * `IndexedDB` em `file://` cai numa origem opaca em vários navegadores, e
//     os dados somem entre aberturas;
//   * `/api/*` não existe sem servidor.
//
// Sem dependências: só o `http` do Node. Um `npm install` a mais para servir
// arquivo estático seria superfície desnecessária num projeto que se propõe a
// rodar offline.

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || "127.0.0.1";

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

// Resolve o caminho DENTRO da raiz. Sem esta checagem, `GET /../../.env`
// entregaria arquivos de fora do projeto para qualquer um na mesma rede.
function resolverSeguro(base, urlPath) {
  const limpo = decodeURIComponent(String(urlPath || "/").split("?")[0].split("#")[0]);
  const alvo = path.resolve(base, `.${path.posix.normalize(limpo)}`);
  const raiz = path.resolve(base);
  if (alvo !== raiz && !alvo.startsWith(raiz + path.sep)) return null;
  return alvo;
}

// A RAIZ ENTREGA A PÁGINA COMERCIAL, IGUAL À PUBLICAÇÃO.
//
// O `vercel.json` reescreve "/" para "/landing.html" e "/index.html" para
// "/app.html", que é o nome com que o aplicativo é publicado. Se o servidor de
// desenvolvimento não fizer o mesmo, a diferença aparece só depois do deploy,
// que é o pior lugar para descobrir qual página abre no domínio.
function ehRaiz(urlPath) {
  const caminho = String(urlPath || "/").split("?")[0].split("#")[0];
  return caminho === "" || caminho === "/";
}

// O aplicativo mora em `index.html` no repositório e sai como `app.html` na
// publicação (ver scripts/build-dist.js). Servindo o repositório, o arquivo
// está onde o endereço diz; servindo `dist/`, é aqui que a reescrita de
// `/index.html` acontece.
function caminhoDoApp(base) {
  const publicado = path.join(base, "app.html");
  return fs.existsSync(publicado) ? publicado : path.join(base, "index.html");
}

function servir(base) {
  return (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Método não permitido");
      return;
    }

    // `/api/*` NÃO PODE CAIR NO FALLBACK DO APLICATIVO.
    //
    // Sem `vercel dev` as funções não existem aqui. Devolver o `index.html` com
    // status 200 fazia o cliente receber HTML onde esperava JSON e transformava
    // "não há backend nesta máquina" em erro genérico na cara de quem abria a
    // tela de conta. Um 404 em JSON descreve a realidade, e o cliente já sabe
    // tratá-lo como modo local.
    const caminhoUrl = String(req.url || "").split("?")[0];
    if (caminhoUrl.indexOf("/api/") === 0) {
      const corpo = JSON.stringify({ ok: false, configured: false, code: "api_indisponivel",
        message: "As funções em /api/* exigem `vercel dev`." });
      res.writeHead(404, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : corpo);
      return;
    }

    let alvo = ehRaiz(req.url)
      ? path.join(base, "landing.html")
      : resolverSeguro(base, req.url);
    if (!alvo) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Caminho fora da raiz");
      return;
    }

    try {
      if (fs.existsSync(alvo) && fs.statSync(alvo).isDirectory()) alvo = caminhoDoApp(base);
      if (!fs.existsSync(alvo)) {
        // O roteamento do app vive no hash, então qualquer caminho desconhecido
        // volta para o aplicativo em vez de 404. É também o que resolve
        // `/index.html` quando se está servindo `dist/`, onde o arquivo
        // publicado chama `app.html`.
        alvo = caminhoDoApp(base);
      }
      const corpo = fs.readFileSync(alvo);
      const tipo = TIPOS[path.extname(alvo).toLowerCase()] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": tipo,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        // Mesmos cabeçalhos da publicação, para que um problema de CSP apareça
        // aqui e não só em produção. A exceção é o HSTS, que só vale sobre
        // HTTPS e, gravado a partir de localhost, prenderia o navegador do
        // desenvolvedor a um esquema que o servidor local não fala.
        //
        // `connect-src` não é mais "qualquer HTTPS". A única saída para fora
        // do site é a consulta da NFC-e nos portais estaduais (js/qrcode.js),
        // que já tem lista própria de hosts; o que a política faz é repetir
        // esse limite onde o navegador consegue impor. Sem isso, qualquer
        // script injetado teria a rede inteira como destino de exfiltração.
        "Content-Security-Policy": "default-src 'self'; script-src 'self'; script-src-attr 'none'; "
          + "style-src 'self'; style-src-attr 'none'; font-src 'self'; img-src 'self' data: blob:; "
          + "connect-src 'self' https://*.gov.br; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; "
          + "form-action 'none'; object-src 'none'",
      });
      res.end(req.method === "HEAD" ? undefined : corpo);
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Erro ao ler o arquivo");
    }
  };
}

const base = process.argv.includes("--dist") ? path.join(ROOT, "dist") : ROOT;
if (!fs.existsSync(caminhoDoApp(base))) {
  console.error(`Nada para servir em ${base}. Rode "npm run build:dist" antes de usar --dist.`);
  process.exit(1);
}

http.createServer(servir(base)).listen(PORT, HOST, () => {
  console.log(`\nPágina comercial em http://${HOST}:${PORT}/`);
  console.log(`Aplicativo      em http://${HOST}:${PORT}/index.html`);
  console.log(`Servindo: ${base}`);
  console.log("As funções em /api/* exigem `vercel dev`; sem elas, a conta e a sincronização ficam indisponíveis.\n");
});
