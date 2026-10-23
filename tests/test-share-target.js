// test-share-target.js — "Compartilhar com o Cofre" (Web Share Target).
// O comprovante do Pix, a notificação do cartão e a fatura chegam pelo menu
// Compartilhar do Android; aqui se confere o leitor de texto e o contrato
// entre manifesto, service worker e app.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const readSrc = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const ctx = { console, module: { exports: {} }, indexedDB: undefined, localStorage: undefined };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
["js/utils.js", "js/rules.js", "js/layout.js", "js/storage.js", "js/import.js", "js/nlp.js"]
  .forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));
const run = (code) => vm.runInContext(code, ctx);

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? ` → ${JSON.stringify(extra)}` : ""}`); }
}
const data = run("migrate(defaultData())");
ctx.__d = data;
const parse = (text) => { ctx.__t = text; return run("parseSharedText(__t, __d)"); };
const hoje = run("todayIso()");

console.log("\n1. Comprovante de Pix");
{
  const r = parse(`Comprovante de transferência Pix
Valor: R$ 150,00
Data: 20/10/2026 14:32
Para
Supermercado Pão Quente
CNPJ ***.123.456/0001-**
De
Renan Monteiro
ID da transação: E1234567`);
  check("valor lido do rótulo", r.amount === 150, r.amount);
  check("é gasto", r.type === "expense", r.type);
  check("meio de pagamento é Pix", r.payment === "Pix", r.payment);
  check("quem recebeu vira descrição", r.description === "Supermercado Pão Quente", r.description);
  check("a data do comprovante é usada", r.date === "2026-10-20" && r.dateExplicit === true, r.date);
  check("rascunho pronto", r.ok === true && r.kind === "pix");
  check("a categoria vem do dicionário quando o nome ajuda", r.categoryId !== "outros", r.categoryId);
}

console.log("\n2. Notificação de compra no cartão");
{
  const r = parse("Compra aprovada no cartão final 1234: R$ 87,90 em IFOOD *SAO PAULO. 22/10/2026 às 20:15.");
  check("valor da compra", r.amount === 87.9, r.amount);
  check("estabelecimento depois de 'em'", /^IFOOD/.test(r.description), r.description);
  check("meio é crédito", r.payment === "Crédito", r.payment);
  check("data da notificação", r.date === "2026-10-22", r.date);
  check("tipo cartão", r.kind === "cartao");
}

console.log("\n3. Pix recebido vira receita com o pagador na descrição");
{
  const r = parse(`Você recebeu um Pix
R$ 1.200,00
De: Empresa XYZ Ltda
Para: Renan
25/10/2026`);
  check("é receita", r.type === "income", r.type);
  check("milhar com ponto é lido", r.amount === 1200, r.amount);
  check("quem pagou vira descrição", r.description === "Empresa XYZ Ltda", r.description);
  check("data futura não é usada", r.date === hoje || r.date <= hoje, r.date);
}

console.log("\n4. Valor com rótulo vence saldo e tarifa");
{
  const r = parse(`Saldo disponível: R$ 5.432,10
Tarifa: R$ 0,00
Valor pago: R$ 64,30
Estabelecimento: Farmácia Central`);
  check("o rótulo 'valor pago' manda", r.amount === 64.3, r.amount);
  check("descrição pelo rótulo na mesma linha", r.description === "Farmácia Central", r.description);
}

console.log("\n5. Sem valor, cai na frase livre ou avisa");
{
  const frase = parse("gastei 45 no mercado ontem");
  check("frase comum é lida pelo leitor de frase", frase.amount === 45 && frase.kind === "frase", frase);
  const nada = parse("Olha esse link legal");
  check("texto sem número não inventa valor", nada.ok === false && nada.amount === null, nada.amount);
  check("texto vazio é inofensivo", parse("").ok === false);
}

console.log("\n6. Contrato entre manifesto, service worker e app");
{
  const manifest = JSON.parse(readSrc("manifest.webmanifest"));
  const st = manifest.share_target || {};
  check("o manifesto declara o destino de compartilhamento", st.method === "POST" && st.enctype === "multipart/form-data" && /compartilhar=1/.test(st.action), st);
  check("texto, título, endereço e arquivos são aceitos", st.params && st.params.text === "texto" && st.params.title === "titulo" && st.params.url === "endereco" && Array.isArray(st.params.files) && st.params.files[0].name === "arquivos");
  check("PDF, imagem, OFX e CSV entram pelo compartilhamento", st.params.files[0].accept.join(",").includes("application/pdf") && st.params.files[0].accept.join(",").includes("image/*") && st.params.files[0].accept.join(",").includes(".ofx"));
  const sw = readSrc("service-worker.js");
  check("o worker intercepta o POST antes de recusar métodos", sw.indexOf("if (isShareTarget(req))") < sw.indexOf('if (req.method !== "GET") return;'));
  check("o pacote fica num cache próprio, preservado na ativação", /const SHARE_CACHE = "financas-share-" \+ VERSION;/.test(sw) && /manter = \[CACHE_NAME, PAGE_CACHE, FONT_CACHE, SHARE_CACHE\]/.test(sw));
  check("o worker devolve o app com o sinal de compartilhado", /Response\.redirect\("\.\/index\.html\?compartilhado=1", 303\)/.test(sw));
  const app = readSrc("js/app.js");
  check("o app consome o pacote na abertura e apaga depois de ler", /query\.get\("compartilhado"\) === "1"/.test(app) && /consumeSharedPayload\(\)/.test(app) && /cache\.delete\("\.\/__compartilhado\/meta"\)/.test(app));
  check("imagem passa pelo QR sem abrir a câmera antes do rascunho", /await onQrDetected\(raw\);\s*state\.qr\.open = true;/.test(app));
  check("extrato e fatura vão para a importação", /setState\(\{ tab: "import" \}\);\s*await handleStatementFile\(file\);/.test(app));
  const doc = readSrc("docs/ARMAZENAMENTO-E-PRIVACIDADE.md");
  const versao = (sw.match(/const VERSION = "(v\d+)";/) || [])[1];
  check("o cache de compartilhamento está documentado", doc.includes(`\`financas-share-${versao}\``));
}

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} — ${pass} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
