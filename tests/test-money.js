// test-money.js; núcleo de matemática financeira.
// ------------------------------------------------------------------------------
// É o teste mais importante da suíte e era o que faltava. Um teste de render que
// falha produz uma tela feia; `splitMoney` errado produz um saldo errado, em
// silêncio, por meses. Todas as funções aqui são puras, sem DOM e sem estado,
// então o custo de cobri-las é o menor do projeto.
//
// Regra do projeto sob teste: dinheiro NUNCA é somado como float. Tudo vira
// centavo inteiro antes de qualquer operação e só volta para reais na fronteira
// de exibição.
"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

let ok = 0;
let fail = 0;
function check(label, condition, detail) {
  if (condition) { ok++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail == null ? "" : `: ${detail}`}`); }
}
function eq(label, actual, expected) {
  check(label, Object.is(actual, expected) || actual === expected, `esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`);
}

// `crypto` entra no contexto de propósito: sem ele, `uid()` cairia sempre no
// caminho reserva e o formato UUID nunca seria exercitado.
const ctx = { console, module: { exports: {} }, crypto: globalThis.crypto };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(read("js/utils.js"), ctx, { filename: "js/utils.js" });
const run = (code) => vm.runInContext(code, ctx);

console.log("\n1. Conversão para centavos");
eq("0,1 + 0,2 não vaza o erro de ponto flutuante", run(`addMoney(0.1, 0.2)`), 0.3);
eq("meio centavo arredonda para cima", run(`roundMoney(1.005)`), 1.01);
eq("meio centavo negativo arredonda simetricamente", run(`roundMoney(-1.005)`), -1.01);
eq("conversão é idempotente", run(`roundMoney(roundMoney(19.99))`), 19.99);
eq("texto vira centavo sem drift", run(`moneyToCents("19.99")`), 1999);
eq("valor não finito vira zero", run(`moneyToCents(Infinity)`), 0);
eq("NaN vira zero", run(`moneyToCents(NaN)`), 0);

console.log("\n2. Operações básicas");
eq("subtração", run(`subMoney(0.3, 0.1)`), 0.2);
eq("multiplicação por fator", run(`mulMoney(100, 0.075)`), 7.5);
eq("multiplicação arredonda o centavo", run(`mulMoney(0.1, 0.5)`), 0.05);
eq("divisão", run(`divMoney(10, 3)`), 3.33);
eq("divisão por zero não explode", run(`divMoney(10, 0)`), 0);
eq("fator inválido devolve zero", run(`mulMoney(10, NaN)`), 0);

console.log("\n3. Somatório acumulado");
// É o cenário que motivou a arquitetura em centavos: cem lançamentos de R$ 0,10
// somados como float dão 9.99999999999998.
eq("cem parcelas de dez centavos somam exatamente dez reais",
  run(`sumMoney(Array.from({ length: 100 }, () => 0.1))`), 10);
eq("somatório aceita seletor", run(`sumMoney([{ v: 1.1 }, { v: 2.2 }], (x) => x.v)`), 3.3);
eq("somatório de lista vazia é zero", run(`sumMoney([])`), 0);
eq("somatório ignora entrada não numérica", run(`sumMoney([1.5, "x", null])`), 1.5);

console.log("\n4. Rateio de parcelas (maior resto)");
// A propriedade que importa não é "as parcelas são iguais"; é "a soma das
// parcelas é EXATAMENTE o total". Sem isso, parcelar R$ 100 em 3 perde ou cria
// um centavo em cada compra parcelada do app.
const casosSplit = [[100, 3], [0.05, 3], [10, 7], [1234.56, 12], [0.01, 5], [999.99, 48], [-10, 3]];
casosSplit.forEach(([total, n]) => {
  const parcelas = run(`splitMoney(${total}, ${n})`);
  const soma = run(`sumMoney(${JSON.stringify(parcelas)})`);
  check(`${n} parcelas de ${total} somam o total`, soma === total, `somou ${soma}`);
  check(`${n} parcelas de ${total} têm a contagem certa`, parcelas.length === n, `gerou ${parcelas.length}`);
});
eq("rateio de 100 em 3 põe o centavo extra na primeira", run(`splitMoney(100, 3)`)[0], 33.34);
eq("rateio com zero partes não divide por zero", run(`splitMoney(10, 0)`).length, 1);

console.log("\n4b. Rateio ponderado (semeadura de tetos)");
// Mesma propriedade do rateio igualitário, agora com pesos: a soma das fatias
// tem de ser EXATAMENTE o total. É o que impede a prévia dos tetos de mostrar
// linhas que não somam a cota do grupo que a própria tela acabou de exibir.
const casosPeso = [
  [3000, [40, 30, 15, 10, 5]],
  [1500, [50, 25, 25]],
  [0.05, [1, 1, 1]],
  [1234.56, [7, 3]],
  [999.99, [1, 1, 1, 1, 1, 1, 1]],
  [-600, [2, 1]],
];
casosPeso.forEach(([total, pesos]) => {
  const fatias = run(`splitMoneyByWeights(${total}, ${JSON.stringify(pesos)})`);
  const soma = run(`sumMoney(${JSON.stringify(fatias)})`);
  check(`${pesos.length} fatias de ${total} somam o total`, soma === total, `somou ${soma}`);
  check(`${pesos.length} fatias de ${total} têm a contagem certa`, fatias.length === pesos.length, `gerou ${fatias.length}`);
});

eq("peso maior recebe fatia maior", run(`splitMoneyByWeights(1000, [75, 25])`)[0], 750);
eq("peso menor recebe o resto", run(`splitMoneyByWeights(1000, [75, 25])`)[1], 250);
eq("pesos iguais rateiam igual", JSON.stringify(run(`splitMoneyByWeights(90, [1, 1, 1])`)), JSON.stringify([30, 30, 30]));
// Determinismo: dois aparelhos sincronizados não podem divergir um centavo por
// causa da ordem de desempate.
eq("mesma entrada devolve sempre a mesma saída",
  JSON.stringify(run(`splitMoneyByWeights(100, [1, 1, 1])`)),
  JSON.stringify(run(`splitMoneyByWeights(100, [1, 1, 1])`)));
eq("centavo do desempate vai para o primeiro maior resto",
  JSON.stringify(run(`splitMoneyByWeights(100, [1, 1, 1])`)), JSON.stringify([33.34, 33.33, 33.33]));
eq("lista de pesos vazia devolve lista vazia", run(`splitMoneyByWeights(100, []).length`), 0);
eq("pesos todos zerados caem no rateio igualitário",
  run(`sumMoney(splitMoneyByWeights(100, [0, 0]))`), 100);
eq("peso negativo é tratado como zero",
  JSON.stringify(run(`splitMoneyByWeights(100, [-5, 1])`)), JSON.stringify([0, 100]));
eq("peso não numérico não produz NaN",
  run(`sumMoney(splitMoneyByWeights(50, ["x", 1]))`), 50);
eq("entrada que não é lista devolve lista vazia", run(`splitMoneyByWeights(100, null).length`), 0);

console.log("\n5. Leitura de valor digitado e importado");
// A tabela abaixo É a especificação de `parseMoneyInput`. Os dois últimos casos
// da lista de "casas decimais" são a regressão do defeito de assimetria:
// "1,5000" devolvia 15000 enquanto "1.5000" devolvia 1,5.
const casosParse = [
  ["1234.56", 1234.56, "ponto decimal simples"],
  ["1.234,56", 1234.56, "formato brasileiro"],
  ["1,234.56", 1234.56, "formato americano"],
  ["R$ 1.234,56", 1234.56, "com símbolo da moeda"],
  ["R$ 30", 30, "sem decimais"],
  ["30", 30, "número puro"],
  ["1,5", 1.5, "uma casa com vírgula"],
  ["1.5", 1.5, "uma casa com ponto"],
  ["1,50", 1.5, "duas casas com vírgula"],
  ["1.50", 1.5, "duas casas com ponto"],
  ["1,500", 1500, "três casas com vírgula é milhar"],
  ["1.500", 1500, "três casas com ponto é milhar"],
  ["1,5000", 1.5, "quatro casas com vírgula é decimal"],
  ["1.5000", 1.5, "quatro casas com ponto é decimal"],
  ["1.234.567", 1234567, "milhar repetido com ponto"],
  ["1,234,567", 1234567, "milhar repetido com vírgula"],
  ["(12,00)", -12, "parênteses indicam negativo"],
  ["-12", -12, "sinal à esquerda"],
  ["12-", -12, "sinal à direita"],
  ["1 234,56", 1234.56, "espaço como separador de milhar"],
];
casosParse.forEach(([entrada, esperado, rotulo]) => {
  eq(`${rotulo}: ${JSON.stringify(entrada)}`, run(`parseMoneyInput(${JSON.stringify(entrada)})`), esperado);
});
check("texto sem número devolve NaN", Number.isNaN(run(`parseMoneyInput("abc")`)));
check("string vazia devolve NaN", Number.isNaN(run(`parseMoneyInput("")`)));
check("nulo devolve NaN", Number.isNaN(run(`parseMoneyInput(null)`)));
eq("número passa direto", run(`parseMoneyInput(12.5)`), 12.5);
eq("versão tolerante devolve zero em vez de NaN", run(`moneyOrZero("abc")`), 0);

console.log("\n6. Simetria entre vírgula e ponto");
// Invariante permanente: trocar o separador decimal não pode mudar o valor.
// É esta verificação que impede o defeito de assimetria de voltar.
[["1,5", "1.5"], ["1,50", "1.50"], ["1,500", "1.500"], ["1,5000", "1.5000"], ["1,50000", "1.50000"]]
  .forEach(([comVirgula, comPonto]) => {
    const a = run(`parseMoneyInput(${JSON.stringify(comVirgula)})`);
    const b = run(`parseMoneyInput(${JSON.stringify(comPonto)})`);
    check(`${comVirgula} e ${comPonto} têm o mesmo valor`, a === b, `${a} != ${b}`);
  });

console.log("\n7. Comparação e percentual");
check("igualdade compara centavos, não floats", run(`moneyEquals(0.1 + 0.2, 0.3)`));
check("comparação devolve sinal", run(`moneyCompare(10, 3)`) > 0 && run(`moneyCompare(3, 10)`) < 0);
eq("percentual com denominador zero é zero", run(`safePct(10, 0)`), 0);
eq("percentual comum", run(`safePct(25, 200)`), 12.5);
eq("razão com denominador zero é zero", run(`safeRatio(10, 0)`), 0);

console.log("\n8. Identificador de registro");
// Depois que dois aparelhos passam a fundir snapshots, uma colisão de id não dá
// erro: ela sobrescreve um lançamento silenciosamente. Daí o UUID.
const SAFE_ID = new RegExp(read("netlify/functions/_shared/finance-schema.js").match(/const SAFE_ID = (\/.+\/);/)[1].slice(1, -1));
const ids = run(`Array.from({ length: 20000 }, () => uid())`);
check("id novo passa no SAFE_ID do servidor", ids.every((id) => SAFE_ID.test(id)), ids[0]);
check("id novo cabe no limite de 80 caracteres", ids.every((id) => id.length <= 80), `maior: ${Math.max(...ids.map((i) => i.length))}`);
check("20 mil ids seguidos sem colisão", new Set(ids).size === ids.length, `${ids.length - new Set(ids).size} colisões`);
check("com Web Crypto o id sai em formato UUID v4",
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ids[0]), ids[0]);
check("a fonte prefere Web Crypto ao Math.random",
  /crypto\.randomUUID/.test(read("js/utils.js")), "uid() não menciona crypto.randomUUID");

// O caminho reserva (navegador sem Web Crypto) precisa continuar válido.
const semCrypto = { console, module: { exports: {} } };
semCrypto.globalThis = semCrypto;
vm.createContext(semCrypto);
vm.runInContext(read("js/utils.js"), semCrypto, { filename: "js/utils.js" });
const idsReserva = vm.runInContext(`Array.from({ length: 5000 }, () => uid())`, semCrypto);
check("reserva sem Web Crypto ainda gera id válido", idsReserva.every((id) => SAFE_ID.test(id)), idsReserva[0]);
check("reserva sem Web Crypto não colide em 5 mil", new Set(idsReserva).size === idsReserva.length);

/* ==============================================================================
 * [M38] O CAMINHO RÁPIDO DE `moneyToCents` DEVOLVE O MESMO INTEIRO
 * ==============================================================================
 * O M38 acrescentou um atalho: longe da borda de meio centavo, `Math.round` no
 * lugar da releitura decimal. O atalho vale 23 vezes menos trabalho na função
 * mais chamada do aplicativo, e um erro dele não apareceria como tela quebrada,
 * apareceria como um centavo errado num saldo, em silêncio, meses depois.
 *
 * Por isso a equivalência não é argumentada, é medida: a implementação ANTERIOR
 * é reproduzida aqui (`referenciaDecimal`) e as duas são comparadas em milhões
 * de casos, incluindo o domínio inteiro do dinheiro de verdade. Qualquer
 * divergência reprova.
 *
 * Se um dia o atalho precisar mudar, este bloco é o que diz se ele pode.
 */
console.log("\n17. Caminho rápido x releitura decimal (M38)");
{
  const referenciaDecimal = (value) => {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return 0;
    const sign = n < 0 ? -1 : 1;
    const abs = Math.abs(n);
    const asText = String(abs);
    let scaled;
    if (asText.includes("e") || asText.includes("E")) scaled = abs * 100;
    else {
      scaled = Number(`${asText}e2`);
      if (!Number.isFinite(scaled)) scaled = abs * 100;
    }
    return sign * Math.round(scaled);
  };

  const divergentes = [];
  const conferir = (v) => {
    if (divergentes.length > 8) return;
    const esperado = referenciaDecimal(v);
    const obtido = ctx.moneyToCents(v);
    if (obtido !== esperado) divergentes.push(`${JSON.stringify(v)}: ${obtido} != ${esperado}`);
  };

  // Todo valor de dois decimais de R$ 0,00 a R$ 50.000,00. É o domínio inteiro
  // do dinheiro que passa por este aplicativo, conferido um a um.
  for (let k = 0; k <= 5000000; k++) conferir(k / 100);
  check("5 milhões de valores de 2 casas concordam", divergentes.length === 0, divergentes[0]);

  // A família do 1,005: três decimais são exatamente onde o erro binário decide
  // o arredondamento para o lado errado, e a razão de a releitura decimal existir.
  for (let k = 0; k <= 2000000; k++) conferir(k / 1000);
  check("2 milhões de valores de 3 casas concordam", divergentes.length === 0, divergentes[0]);

  for (let k = 0; k <= 500000; k++) conferir(-k / 100);
  check("meio milhão de negativos concordam", divergentes.length === 0, divergentes[0]);

  [
    1.005, 2.675, 8.165, 1.015, 1.025, 1.045, 0.615, 0.575, 10.235,
    0, -0, 0.001, 0.005, 0.004999999, 1e-8, 1e-7, 0.5, -0.5,
    1e7, 1e7 - 0.005, 1e7 + 0.005, 1e9, 1e12, 1e12 + 0.5, 9007199254740991,
    1e21, 1e-21, 123456789.987, 0.1 + 0.2, 1 / 3, 2 / 3,
    "1.005", "0,50", "", null, undefined, NaN, Infinity, -Infinity, "abc", true, false, [], {},
  ].forEach(conferir);
  check("adversários conhecidos, bordas e entradas inválidas concordam", divergentes.length === 0, divergentes[0]);

  for (let i = 0; i < 300000; i++) conferir(Math.random() * 1e6);
  for (let i = 0; i < 300000; i++) conferir(Math.round((Math.random() - 0.5) * 2e8) / 100);
  // Acima do teto do atalho a releitura decimal continua sendo o caminho; este
  // trecho prova que o teto está no lugar certo.
  for (let i = 0; i < 100000; i++) conferir(Math.random() * 1e12);
  check("700 mil aleatórios, dentro e fora do teto, concordam", divergentes.length === 0, divergentes[0]);

  eq("o teto do atalho continua declarado", run("MONEY_FAST_MAX"), 1e7);
}

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"}: ${ok} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
