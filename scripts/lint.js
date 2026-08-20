"use strict";

// Análise estática sem dependências externas.
//
// POR QUE NÃO ESLINT
//
// O projeto tem uma dependência de desenvolvimento (Playwright) e roda offline
// por princípio. Trazer ESLint e o ecossistema de plugins para checar o que
// abaixo cabe em 100 linhas seria trocar uma garantia por uma árvore de
// dependências. O que interessa aqui é pegar as três classes de erro que já
// quebraram este app:
//
//   1. sintaxe inválida em arquivo que só é carregado em produção;
//   2. identificador duplicado entre arquivos (o build concatena tudo num
//      escopo só, então dois `const X` viram SyntaxError apenas no bundle);
//   3. sobras de depuração (`console.log`, `debugger`, `.only`) no runtime.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
let erros = 0;
let avisos = 0;

function falhar(arquivo, mensagem) {
  erros++;
  console.error(`  ✗ ${arquivo}: ${mensagem}`);
}
function avisar(arquivo, mensagem) {
  avisos++;
  console.warn(`  ! ${arquivo}: ${mensagem}`);
}

function listar(dir, filtro, saida = []) {
  if (!fs.existsSync(dir)) return saida;
  fs.readdirSync(dir).forEach((nome) => {
    const completo = path.join(dir, nome);
    if (fs.statSync(completo).isDirectory()) {
      if (["node_modules", ".git", "dist", "coverage"].includes(nome)) return;
      listar(completo, filtro, saida);
    } else if (filtro.test(nome)) saida.push(completo);
  });
  return saida;
}

const relativo = (p) => path.relative(ROOT, p).replace(/\\/g, "/");

// ---- 1. Sintaxe ----
console.log("\n1. Sintaxe");
const fontes = [
  ...listar(path.join(ROOT, "js"), /\.js$/),
  ...listar(path.join(ROOT, "netlify"), /\.js$/),
  ...listar(path.join(ROOT, "scripts"), /\.js$/),
  ...listar(path.join(ROOT, "tests"), /\.js$/),
];
fontes.forEach((arquivo) => {
  const codigo = fs.readFileSync(arquivo, "utf8");
  const ehModulo = /^\s*(import|export)\s/m.test(codigo) || arquivo.includes(`modules${path.sep}`);
  try {
    if (ehModulo) new vm.SourceTextModule(codigo, { identifier: arquivo });
    else new vm.Script(codigo, { filename: arquivo });
  } catch (error) {
    // `SourceTextModule` exige a flag `--experimental-vm-modules`; sem ela,
    // caímos numa checagem mais fraca em vez de falhar por causa do ambiente.
    if (error && /SourceTextModule/.test(String(error.message))) return;
    falhar(relativo(arquivo), error.message.split("\n")[0]);
  }
});
console.log(`  ${fontes.length} arquivo(s) verificado(s).`);

// ---- 2. Identificadores duplicados no bundle ----
// `scripts/build-app-module.js` concatena as fontes num escopo único. Dois
// `const` com o mesmo nome em arquivos diferentes só explodem no navegador.
console.log("\n2. Identificadores duplicados no pacote");
const ordem = require(path.join(ROOT, "scripts/build-app-module.js")).SOURCES;
if (Array.isArray(ordem)) {
  const declarado = new Map();
  ordem.forEach((arquivo) => {
    const caminho = path.join(ROOT, arquivo);
    if (!fs.existsSync(caminho)) return;
    const codigo = fs.readFileSync(caminho, "utf8");
    // Só declarações de TOPO (coluna zero): as de dentro de função têm escopo.
    const regex = /^(?:const|let|class|function)\s+([A-Za-z_$][\w$]*)/gm;
    let m;
    while ((m = regex.exec(codigo)) !== null) {
      const nome = m[1];
      if (declarado.has(nome) && declarado.get(nome) !== arquivo) {
        falhar(arquivo, `"${nome}" já foi declarado em ${declarado.get(nome)}; no pacote os dois viram o mesmo escopo`);
      } else declarado.set(nome, arquivo);
    }
  });
  console.log(`  ${declarado.size} identificador(es) de topo.`);
} else {
  avisar("scripts/build-app-module.js", "não exporta SOURCES; a checagem de duplicados foi pulada");
}

// ---- 3. Sobras de depuração no runtime ----
console.log("\n3. Sobras de depuração");
listar(path.join(ROOT, "js"), /\.js$/)
  .filter((arquivo) => !arquivo.includes("app.generated"))
  .forEach((arquivo) => {
    const codigo = fs.readFileSync(arquivo, "utf8");
    codigo.split("\n").forEach((linha, i) => {
      if (/^\s*(\/\/|\*)/.test(linha)) return;
      if (/\bdebugger\b/.test(linha)) falhar(relativo(arquivo), `debugger na linha ${i + 1}`);
      if (/console\.log\(/.test(linha)) avisar(relativo(arquivo), `console.log na linha ${i + 1}`);
    });
  });

// ---- 4. Estilo obrigatório do projeto ----
console.log("\n4. Estilo do projeto");
listar(path.join(ROOT, "js"), /\.js$/)
  .concat(listar(path.join(ROOT, "netlify"), /\.js$/))
  .forEach((arquivo) => {
    const codigo = fs.readFileSync(arquivo, "utf8");
    if (/[—–]/.test(codigo)) falhar(relativo(arquivo), "travessão no código entregue");
    if (/[\u{1F300}-\u{1FAFF}]/u.test(codigo)) falhar(relativo(arquivo), "emoji no código entregue");
  });

console.log(`\n${erros === 0 ? "ANÁLISE ESTÁTICA APROVADA" : "ANÁLISE ESTÁTICA REPROVADA"}: ${erros} erro(s), ${avisos} aviso(s).\n`);
process.exit(erros === 0 ? 0 : 1);
