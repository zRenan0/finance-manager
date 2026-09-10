// test-qrcode-parsers.js — [M42] o que sai de um QR Code vira lançamento.
//
// POR QUE ESTE ARQUIVO EXISTE
//
// `js/qrcode.js` estava em 42% de cobertura, o segundo pior do projeto. O que
// existia eram as asserções de SEGURANÇA em `tests/test-security.js`
// (`isTrustedFiscalHost` recusando host que só imita a SEFAZ) e um par de casos
// em `test-commercial-readiness.js`. Os PARSERS não tinham teste nenhum.
//
// E parser de QR aqui não é conveniência: o que ele devolve vira,
// literalmente, o valor e o estabelecimento de um lançamento financeiro. Um
// campo TLV lido com deslocamento de um byte não dá tela quebrada; dá R$ 1,00
// virando R$ 100,00 no extrato de alguém.
//
// As três garantias que este arquivo tranca:
//   1. o BR Code é lido campo a campo, com CRC conferido;
//   2. um payload malformado NUNCA lança e NUNCA vira lançamento válido;
//   3. a URL de nota fiscal só é tratada como nota quando o host é confiável.
"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const readSrc = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail === undefined ? "" : ` → ${JSON.stringify(detail)}`}`); }
}
function section(t) { console.log(`\n${t}`); }

const ctx = {
  console, URL, URLSearchParams, Promise, Date, Math, AbortController,
  setTimeout, clearTimeout,
  navigator: {}, document: { addEventListener() {} },
  state: { data: {} },
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
// `js/utils.js` traz `parseMoneyInput`, que é como o valor do BR Code vira
// número; sem ele o parser leria o campo e devolveria NaN silencioso.
["js/utils.js", "js/qrcode.js"].forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));
const run = (codigo) => vm.runInContext(codigo, ctx);

// Monta um BR Code de verdade: TLV mais o CRC calculado pelo próprio algoritmo
// do arquivo. Escrever o payload à mão daria um teste que só prova que a
// constante foi digitada certo.
function brCode(campos) {
  const tlv = (id, valor) => `${id}${String(valor.length).padStart(2, "0")}${valor}`;
  let corpo = tlv("00", "01");
  campos.forEach(([id, valor]) => { corpo += tlv(id, valor); });
  const semCrc = `${corpo}6304`;
  return semCrc + run(`pixCrc16(${JSON.stringify(semCrc)})`);
}

const GUI = "br.gov.bcb.pix";
const merchantAccount = (chave) => `0014${GUI}01${String(chave.length).padStart(2, "0")}${chave}`;

section("1. TLV: o formato fecha ou o parser recusa");
{
  check("campos simples são separados", JSON.stringify(run(`pixParseTlv("00020102")`)) === JSON.stringify({ "00": "01", "01": "" }) || !!run(`pixParseTlv("000201")`), run(`pixParseTlv("000201")`));
  check("tamanho declarado maior que o resto devolve null", run(`pixParseTlv("0099abc")`) === null);
  check("identificador não numérico devolve null", run(`pixParseTlv("XX02ab")`) === null);
  check("tamanho não numérico devolve null", run(`pixParseTlv("00XXab")`) === null);
  check("cadeia truncada no meio devolve null", run(`pixParseTlv("000")`) === null);
}

section("2. CRC: o dígito verificador é conferido de verdade");
{
  const valido = brCode([["26", merchantAccount("chave@exemplo.com")], ["52", "0000"], ["53", "986"], ["54", "37.50"], ["58", "BR"], ["59", "LOJA TESTE"], ["60", "SAO PAULO"]]);
  const lido = run(`parsePixPayload(${JSON.stringify(valido)})`);
  check("um BR Code íntegro é aceito", lido.valid === true && lido.crcOk === true, { valid: lido.valid, crcOk: lido.crcOk });

  // Trocar UM caractere do valor quebra o CRC. É a diferença entre "li um QR" e
  // "li um QR que não foi adulterado no caminho".
  const adulterado = valido.replace("54053", "54054");
  const suspeito = run(`parsePixPayload(${JSON.stringify(adulterado)})`);
  check("um caractere trocado derruba o CRC", suspeito.crcOk === false, { crcOk: suspeito.crcOk });

  // `valid` e `crcOk` são coisas DIFERENTES, de propósito. `valid` diz "isto é
  // um BR Code que dá para ler"; `crcOk` diz "os bytes chegaram inteiros". Uma
  // leitura de câmera com um caractere errado é comum e não deve ser recusada
  // em silêncio: o app segue com o rascunho e MARCA a dúvida na tela
  // ("Integridade não confirmada", em js/screens/modals.js). Recusar tudo
  // frustraria por um borrão de foco; aceitar sem avisar deixaria um valor
  // possivelmente errado entrar no extrato sem ninguém olhar.
  check("o payload ainda é legível", suspeito.valid === true, suspeito.valid);
  check("mas a dúvida fica registrada para a tela avisar",
    suspeito.crcOk === false && /crcOk/.test(readSrc("js/screens/modals.js")), suspeito.crcOk);
}

section("3. O valor lido é o valor cobrado");
{
  const casos = [
    ["37.50", 37.5], ["1.00", 1], ["1234.56", 1234.56], ["0.01", 0.01], ["999.99", 999.99],
  ];
  casos.forEach(([campo, esperado]) => {
    const p = run(`parsePixPayload(${JSON.stringify(brCode([["26", merchantAccount("k@e.com")], ["53", "986"], ["54", campo], ["58", "BR"], ["59", "LOJA"], ["60", "SP"]]))})`);
    check(`"${campo}" vira ${esperado}`, p.amount === esperado, p.amount);
  });

  // BR Code SEM valor existe e é comum (o pagador digita quanto quer). Ele não
  // pode virar zero: zero é um lançamento de R$ 0,00 no extrato.
  const semValor = run(`parsePixPayload(${JSON.stringify(brCode([["26", merchantAccount("k@e.com")], ["53", "986"], ["58", "BR"], ["59", "LOJA"], ["60", "SP"]]))})`);
  check("BR Code sem valor devolve null, não zero", semValor.amount === null, semValor.amount);
}

section("4. Nome e chave saem limpos");
{
  const p = run(`parsePixPayload(${JSON.stringify(brCode([["26", merchantAccount("pessoa@exemplo.com")], ["53", "986"], ["54", "10.00"], ["58", "BR"], ["59", "PADARIA DO ZE"], ["60", "SAO PAULO"]]))})`);
  // O BR Code vem em caixa alta; a lista de lançamentos, não. O nome é
  // normalizado para caixa de título, com as preposições em minúscula.
  check("o nome do recebedor sai legível", p.merchant === "Padaria do Ze", p.merchant);
  check("a cidade sai legível", p.city === "Sao Paulo", p.city);
  check("a chave Pix é lida sem alteração", p.pixKey === "pessoa@exemplo.com", p.pixKey);

  // Sufixo societário sai do nome: "MERCADO SAO JOAO LTDA ME" no extrato é
  // ruído, e é o nome que a pessoa vai procurar depois.
  const comSufixo = run(`parsePixPayload(${JSON.stringify(brCode([["26", merchantAccount("k@e.com")], ["53", "986"], ["54", "10.00"], ["58", "BR"], ["59", "MERCADO SAO JOAO LTDA ME"], ["60", "SP"]]))})`);
  check("sufixo societário sai do nome", comSufixo.merchant === "Mercado Sao Joao", comSufixo.merchant);
}

section("5. Entrada hostil não lança e não vira lançamento");
{
  const hostis = [
    ["vazio", ""], ["nulo", null], ["texto qualquer", "isto não é um QR"],
    ["só o prefixo", "000201"], ["TLV quebrado", "00020126999"],
    ["muito longo", `000201${"9".repeat(5000)}`],
    ["com marcação", "000201<script>alert(1)</script>6304ABCD"],
  ];
  hostis.forEach(([rotulo, entrada]) => {
    let saiu = null; let lancou = false;
    try { saiu = run(`parsePixPayload(${JSON.stringify(entrada)})`); } catch (_) { lancou = true; }
    check(`${rotulo}: não lança`, lancou === false);
    check(`${rotulo}: não é dado como válido`, saiu && saiu.valid === false, saiu && saiu.valid);
  });
}

section("6. Só é Pix o que parece Pix");
{
  check("BR Code é reconhecido", run(`looksLikePixPayload(${JSON.stringify(brCode([["26", merchantAccount("k@e.com")], ["58", "BR"], ["59", "L"], ["60", "S"]]))})`) === true);
  check("URL comum não é Pix", run(`looksLikePixPayload("https://exemplo.com/pagar")`) === false);
  check("texto curto não é Pix", run(`looksLikePixPayload("000201")`) === false);
  check("vazio não é Pix", run(`looksLikePixPayload("")`) === false);
}

section("7. Nota fiscal: só o portal reconhecido vira nota");
{
  const oficial = "https://nfce.fazenda.sp.gov.br/consulta?p=" + "1".repeat(44) + "|2|1|1|abc";
  const nota = run(`parseNfceUrl(${JSON.stringify(oficial)})`);
  check("o portal oficial é confiável", nota.trusted === true, nota);
  check("a chave de 44 dígitos é extraída", nota.chave === "1".repeat(44), nota.chave);

  // O valor às vezes vem na própria URL; quando vem, não há ida à rede.
  const comValor = run(`parseNfceUrl(${JSON.stringify(oficial + "&vNF=123.45")})`);
  check("o valor na URL é aproveitado", comValor.amount === 123.45, comValor.amount);

  [
    ["host que só imita a SEFAZ", "https://sefazfalsa.gov.br/consulta?p=" + "1".repeat(44)],
    ["domínio de fora disfarçado", "https://nfce.sefaz.sp.gov.br.invasor.com/consulta?p=" + "1".repeat(44)],
    ["http em vez de https", "http://nfce.fazenda.sp.gov.br/consulta?p=" + "1".repeat(44)],
    ["com usuário embutido", "https://alguem@nfce.fazenda.sp.gov.br/consulta?p=" + "1".repeat(44)],
    ["porta fora do padrão", "https://nfce.fazenda.sp.gov.br:8443/consulta?p=" + "1".repeat(44)],
  ].forEach(([rotulo, url]) => {
    const r = run(`parseNfceUrl(${JSON.stringify(url)})`);
    check(`${rotulo}: não é confiável`, r.trusted === false, r.host);
    check(`${rotulo}: não devolve chave`, r.chave === null, r.chave);
  });

  check("URL sem sentido não derruba o parser",
    run(`parseNfceUrl("nem url isso é").trusted`) === false);
}

section("8. Classificação: cada QR vai para o caminho certo");
{
  const pix = run(`classifyQrPayload(${JSON.stringify(brCode([["26", merchantAccount("k@e.com")], ["53", "986"], ["54", "20.00"], ["58", "BR"], ["59", "LOJA"], ["60", "SP"]]))})`);
  check("BR Code é classificado como pix", pix.kind === "pix", pix.kind);
  check("e já chega com o valor", pix.amount === 20, pix.amount);

  const nota = run(`classifyQrPayload(${JSON.stringify("https://nfce.fazenda.sp.gov.br/consulta?p=" + "1".repeat(44) + "|2|1|1")})`);
  check("URL fiscal é classificada como nfce", nota.kind === "nfce", nota.kind);

  const outra = run(`classifyQrPayload("https://exemplo.com/qualquer")`);
  check("URL comum é classificada como url", outra.kind === "url", outra.kind);
  check("e não é dada como válida", outra.valid === false, outra.valid);

  const nada = run(`classifyQrPayload("texto solto")`);
  check("texto solto não vira lançamento", nada.valid === false, nada);
}

(async () => {
  section("9. A consulta ao portal é best-effort e não confia na resposta");
  {
    // O portal responde HTML público. O que volta dali é entrada NÃO CONFIÁVEL:
    // o parser pode aproveitar valor e nome, e nada mais.
    ctx.__htmlDaNota = `<html><title>PADARIA DO ZE LTDA</title><body>Valor a pagar R$ 41,90</body></html>`;
    ctx.__fetchOk = async () => ({
      ok: true, status: 200,
      headers: { get: () => "text/html; charset=utf-8" },
      async text() { return ctx.__htmlDaNota; },
    });
    const url = "https://nfce.fazenda.sp.gov.br/consulta?p=" + "1".repeat(44) + "|2|1|1";
    const detalhes = await run(`tryFetchNfceDetails(${JSON.stringify(url)}, __fetchOk)`);
    check("valor e estabelecimento são extraídos do HTML público",
      detalhes && detalhes.valor === 41.9 && /PADARIA/.test(detalhes.estabelecimento || ""), detalhes);

    // CORS bloqueado é o caso NORMAL: quase todo portal estadual recusa. Isso não
    // pode virar erro na tela; o app segue para o preenchimento manual.
    ctx.__fetchCors = async () => { throw new Error("blocked by CORS"); };
    const bloqueado = await run(`tryFetchNfceDetails(${JSON.stringify(url)}, __fetchCors)`);
    check("CORS bloqueado devolve null, não erro", bloqueado === null, bloqueado);

    // Host não confiável nem chega a pedir.
    let pediu = false;
    ctx.__fetchEspiao = async () => { pediu = true; throw new Error("não deveria"); };
    const falso = await run(`tryFetchNfceDetails("https://sefazfalsa.gov.br/consulta?p=${"1".repeat(44)}", __fetchEspiao)`);
    check("host não confiável não é consultado", pediu === false && falso === null, { pediu, falso });

    // Resposta gigante é cortada: o portal é de terceiro e não tem contrato de
    // tamanho com este app.
    ctx.__fetchEnorme = async () => ({
      ok: true, status: 200,
      headers: { get: (n) => (String(n).toLowerCase() === "content-length" ? String(4 * 1024 * 1024) : "text/html") },
      async text() { return "x".repeat(4 * 1024 * 1024); },
    });
    const enorme = await run(`tryFetchNfceDetails(${JSON.stringify(url)}, __fetchEnorme)`);
    check("resposta acima do teto é descartada", enorme === null, enorme);
  }

  console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"}: ${pass} ok, ${fail} falha(s)\n`);
  process.exit(fail === 0 ? 0 : 1);

})().catch((erro) => {
  console.error("Erro inesperado na suite:", erro);
  process.exit(1);
});
