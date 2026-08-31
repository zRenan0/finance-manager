"use strict";

// Cobertura de testes usando o coletor nativo do V8.
//
// POR QUE ASSIM
//
// `--experimental-test-coverage` só cobre processos que usam `node:test`, e a
// suíte deste projeto é de scripts próprios. `NODE_V8_COVERAGE` funciona com
// qualquer processo Node e não adiciona dependência nenhuma.
//
// A suíte carrega o código do app dentro de um `vm` (é assim que ela testa
// arquivos que, no navegador, são scripts globais). O V8 registra esses scripts
// com o `filename` passado ao `runInContext`, então a cobertura sai por arquivo
// de origem, que é o que interessa.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "coverage");
const TMP = path.join(OUT, "tmp");

// PISO DE COBERTURA: é uma CATRACA, não uma meta.
//
// O valor está abaixo do nível medido no M15 (79,0% global). Ele
// não existe para dizer que a cobertura é boa; existe para impedir que ela caia.
// Colocar aqui um número aspiracional (90%, 100%) só faria a CI ficar vermelha
// desde o primeiro dia, e uma CI cronicamente vermelha deixa de ser lida.
//
// A distribuição é conhecida: motores e telas carregados por mais de um teste
// agora combinam cobertura entre processos, e arquivos críticos podem ter um
// piso próprio quando a média global esconder uma regressão localizada.
const MINIMO_GLOBAL = Number(process.env.COVERAGE_MIN) || 75;
const MINIMOS_POR_ARQUIVO = Object.freeze({
  "js/actions.js": Number(process.env.COVERAGE_ACTIONS_MIN) || 35,
});

function limpar() {
  if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
}

function rodarSuite() {
  const resultado = spawnSync(process.execPath, [path.join(ROOT, "tests/run-all.js")], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, NODE_V8_COVERAGE: TMP },
  });
  return resultado.status === 0;
}

function unirIntervalos(intervalos) {
  const ordenados = (intervalos || []).slice().sort((a, b) => a[0] - b[0]);
  const unidos = [];
  ordenados.forEach(([inicio, fim]) => {
    if (!(fim > inicio)) return;
    const ultimo = unidos[unidos.length - 1];
    if (!ultimo || inicio > ultimo[1]) unidos.push([inicio, fim]);
    else ultimo[1] = Math.max(ultimo[1], fim);
  });
  return unidos;
}

// Um byte só permanece não coberto quando TODAS as execuções do mesmo arquivo
// deixaram de alcançá-lo. A implementação anterior juntava os intervalos mortos
// de processos diferentes. Bastava um teste carregar `actions.js` sem clicar
// para apagar do relatório a cobertura obtida por outro teste.
function intersectarIntervalos(esquerda, direita) {
  const a = unirIntervalos(esquerda);
  const b = unirIntervalos(direita);
  const resultado = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const inicio = Math.max(a[i][0], b[j][0]);
    const fim = Math.min(a[i][1], b[j][1]);
    if (fim > inicio) resultado.push([inicio, fim]);
    if (a[i][1] < b[j][1]) i += 1;
    else j += 1;
  }
  return resultado;
}

// Converte os intervalos de bytes do V8 em bytes cobertos por arquivo.
function resumir() {
  const arquivos = fs.existsSync(TMP) ? fs.readdirSync(TMP).filter((n) => n.endsWith(".json")) : [];
  const porArquivo = new Map();

  arquivos.forEach((nome) => {
    let bruto;
    try { bruto = JSON.parse(fs.readFileSync(path.join(TMP, nome), "utf8")); }
    catch (e) { return; }

    (bruto.result || []).forEach((script) => {
      const url = String(script.url || "");
      // Só o código do aplicativo. Testes, scripts de build e internos do Node
      // ficam de fora: cobrir o próprio teste não diz nada.
      const relativo = url.startsWith("file://") ? path.relative(ROOT, url.replace(/^file:\/\/\/?/, "")) : url;
      const limpo = relativo.replace(/\\/g, "/");
      if (!/^js\//.test(limpo)) return;
      if (limpo.includes("app.generated")) return;

      // COMO O V8 REPORTA
      //
      // Cada função traz `ranges`. O PRIMEIRO é a extensão inteira dela; os
      // seguintes são sub-intervalos que SOBRESCREVEM o pai, e é neles que
      // aparece `count: 0` para os blocos que não executaram.
      //
      // Somar os intervalos com `count > 0` dá 100% em qualquer arquivo que
      // tenha sido carregado, porque a extensão da função de topo cobre o
      // arquivo todo. O que mede de fato é o contrário: total menos a união
      // dos intervalos com `count === 0`.
      const intervalosDaExecucao = [];
      let totalDaExecucao = 0;
      (script.functions || []).forEach((fn) => {
        (fn.ranges || []).forEach((r) => {
          totalDaExecucao = Math.max(totalDaExecucao, r.endOffset);
          if (r.count === 0) intervalosDaExecucao.push([r.startOffset, r.endOffset]);
        });
      });
      const mortosDaExecucao = unirIntervalos(intervalosDaExecucao);
      const atual = porArquivo.get(limpo);
      if (!atual) {
        porArquivo.set(limpo, { naoCobertos: mortosDaExecucao, total: totalDaExecucao });
        return;
      }
      atual.total = Math.max(atual.total, totalDaExecucao);
      atual.naoCobertos = intersectarIntervalos(atual.naoCobertos, mortosDaExecucao);
      porArquivo.set(limpo, atual);
    });
  });

  const linhas = [];
  let somaCoberta = 0;
  let somaTotal = 0;

  Array.from(porArquivo.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([arquivo, dados]) => {
    // União dos intervalos NÃO cobertos, para não contar duas vezes um bloco
    // que aparece dentro de outro bloco morto.
    const intervalos = unirIntervalos(dados.naoCobertos);
    const morto = intervalos.reduce((total, [inicio, fim]) => total + (fim - inicio), 0);
    const total = dados.total || 0;
    if (!total) return;
    const coberto = Math.max(0, total - morto);
    const pct = (coberto / total) * 100;
    somaCoberta += coberto;
    somaTotal += total;
    linhas.push({ arquivo, pct, coberto, total });
  });

  return { linhas, global: somaTotal > 0 ? (somaCoberta / somaTotal) * 100 : 0 };
}

function main() {
  limpar();
  const passou = rodarSuite();
  const resumo = resumir();

  console.log("\n=============== COBERTURA ===============");
  resumo.linhas.forEach(({ arquivo, pct }) => {
    const piso = MINIMOS_POR_ARQUIVO[arquivo];
    const marca = pct >= (piso == null ? MINIMO_GLOBAL : piso) ? " " : "!";
    const detalhe = piso == null ? "" : ` (piso próprio: ${piso}%)`;
    console.log(`${marca} ${pct.toFixed(1).padStart(6)}%  ${arquivo}${detalhe}`);
  });
  console.log("-----------------------------------------");
  console.log(`  ${resumo.global.toFixed(1).padStart(6)}%  GLOBAL (piso: ${MINIMO_GLOBAL}%)`);
  console.log("=========================================\n");

  fs.writeFileSync(path.join(OUT, "resumo.json"), JSON.stringify(resumo, null, 2));

  if (!passou) {
    console.error("A suíte falhou; a cobertura acima é apenas informativa.");
    process.exit(1);
  }
  if (resumo.global < MINIMO_GLOBAL) {
    console.error(`Cobertura global ${resumo.global.toFixed(1)}% abaixo do piso de ${MINIMO_GLOBAL}%.`);
    process.exit(1);
  }
  const abaixoDoPiso = resumo.linhas.filter(({ arquivo, pct }) => (
    MINIMOS_POR_ARQUIVO[arquivo] != null && pct < MINIMOS_POR_ARQUIVO[arquivo]
  ));
  if (abaixoDoPiso.length) {
    abaixoDoPiso.forEach(({ arquivo, pct }) => {
      console.error(`Cobertura de ${arquivo} em ${pct.toFixed(1)}%, abaixo do piso de ${MINIMOS_POR_ARQUIVO[arquivo]}%.`);
    });
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { unirIntervalos, intersectarIntervalos };
