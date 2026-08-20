"use strict";

// Adaptador entre o formato de função da Vercel e os handlers do backend.
//
// POR QUE O BACKEND NAO FOI REESCRITO
//
// As tres funcoes (`account`, `sync`, `analyze`) somam mais de 50 KB de codigo
// exercitado por seis arquivos de teste, incluindo `tests/test-account-backend.js`,
// que executa os handlers de verdade com o formato de evento que eles esperam.
// Reescrever a assinatura de cada uma para o formato da Vercel jogaria fora
// essa cobertura toda em troca de nada: o que muda entre uma plataforma e
// outra e a casca, nao a regra.
//
// Entao a casca fica aqui, num lugar so. Os handlers continuam recebendo
// `{ httpMethod, headers, queryStringParameters, body, isBase64Encoded }` e
// continuam devolvendo `{ statusCode, headers, multiValueHeaders, body }`,
// que e o contrato que `netlify/functions/_shared/http.js` implementa e que
// os testes verificam.
//
// A pasta `netlify/functions/` manteve o nome de proposito: renomear obrigaria
// a mexer nos seis arquivos de teste que apontam para la, e o ganho seria
// apenas cosmetico. O que ela guarda hoje e o backend do produto, sem amarra
// com plataforma nenhuma; esta pasta `api/` e que fala Vercel.

const MAX_BODY_BYTES = 6 * 1024 * 1024;

// O CORPO PRECISA CHEGAR COMO TEXTO.
//
// `readJson` no `_shared/http.js` faz `JSON.parse` de uma string. A Vercel,
// dependendo da versao do runtime, ja entrega `req.body` desserializado. Em
// vez de depender de qual dos dois comportamentos esta valendo (e de a flag
// `config.api.bodyParser` continuar existindo), o adaptador aceita os dois:
// se o corpo ja veio pronto, ele volta a ser texto; se nao veio, lemos o
// fluxo. Nenhum handler assina o corpo bruto, entao serializar de novo nao
// muda resultado: `sync.js` calcula o hash em cima de `JSON.stringify(ops)`,
// depois do parse, nao antes.
async function corpoBruto(req) {
  const pronto = req && req.body;
  if (typeof pronto === "string") return pronto;
  if (Buffer.isBuffer(pronto)) return pronto.toString("utf8");
  if (pronto && typeof pronto === "object") return JSON.stringify(pronto);

  // Sem corpo pronto, resta o fluxo. Se nem fluxo houver, o corpo e vazio:
  // um GET sem corpo nao pode virar erro 500 so porque o objeto de
  // requisicao nao era iteravel.
  if (!req || typeof req[Symbol.asyncIterator] !== "function") return "";

  const partes = [];
  let total = 0;
  for await (const parte of req) {
    total += parte.length;
    // O limite tambem existe no `readJson`, mas la ele so age depois de o
    // corpo inteiro estar na memoria. Cortar aqui evita carregar o excesso.
    if (total > MAX_BODY_BYTES) {
      const erro = new Error("Corpo acima do limite");
      erro.statusCode = 413;
      erro.code = "body_too_large";
      throw erro;
    }
    partes.push(parte);
  }
  return Buffer.concat(partes).toString("utf8");
}

// `req.query` existe no runtime da Vercel, mas a origem confiavel e a propria
// URL: e ela que carrega o `?action=` que as reescritas de `vercel.json`
// montam a partir do caminho (`/api/sync/push` vira `/api/sync?action=push`).
function consultaDe(req) {
  const saida = {};
  try {
    const url = new URL(req.url, "http://localhost");
    url.searchParams.forEach((valor, chave) => { saida[chave] = valor; });
  } catch (_) {
    Object.assign(saida, (req && req.query) || {});
  }
  return saida;
}

function adaptar(handler) {
  return async function (req, res) {
    let resposta;
    try {
      const evento = {
        httpMethod: String((req && req.method) || "GET").toUpperCase(),
        headers: (req && req.headers) || {},
        queryStringParameters: consultaDe(req),
        body: await corpoBruto(req),
        isBase64Encoded: false,
      };
      resposta = await handler(evento);
    } catch (erro) {
      // Handler que estoura sem tratar nao pode vazar rastro de pilha para a
      // rede. O corpo aqui repete a forma de `safeFailure`, para o cliente
      // nao precisar distinguir de onde veio a falha.
      const statusCode = Number(erro && erro.statusCode) || 500;
      resposta = {
        statusCode,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
        body: JSON.stringify({
          ok: false,
          code: (erro && erro.code) || "server_error",
          message: statusCode >= 500 ? "Nao foi possivel concluir a operacao." : String((erro && erro.message) || "Requisicao invalida."),
        }),
      };
    }

    const { statusCode = 200, headers = {}, multiValueHeaders = {}, body = "" } = resposta || {};
    res.statusCode = statusCode;
    Object.entries(headers).forEach(([chave, valor]) => { res.setHeader(chave, valor); });
    // `Set-Cookie` e o unico cabecalho que os handlers emitem repetido: o
    // fluxo de sessao devolve acesso, atualizacao e segredo do dispositivo de
    // uma vez. O Node aceita um array e escreve uma linha por item.
    Object.entries(multiValueHeaders).forEach(([chave, valores]) => {
      if (Array.isArray(valores) && valores.length) res.setHeader(chave, valores);
    });
    res.end(body);
  };
}

module.exports = { adaptar, MAX_BODY_BYTES };
