// test-coverage.js: combinação correta dos relatórios V8 de vários processos.
"use strict";

const { unirIntervalos, intersectarIntervalos } = require("../scripts/coverage.js");

let passed = 0;
let failed = 0;
function check(label, condition, extra) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}${extra === undefined ? "" : ` -> ${JSON.stringify(extra)}`}`);
  }
}

console.log("\n1. União dentro de uma execução");
{
  const result = unirIntervalos([[10, 20], [15, 30], [40, 50], [50, 60], [8, 8]]);
  check("sobreposições e vizinhos viram faixas únicas",
    JSON.stringify(result) === JSON.stringify([[10, 30], [40, 60]]), result);
}

console.log("\n2. Interseção entre execuções do mesmo arquivo");
{
  const first = [[0, 30], [50, 90]];
  const second = [[10, 20], [40, 70], [80, 100]];
  const result = intersectarIntervalos(first, second);
  check("fica morto somente o trecho não coberto nas duas execuções",
    JSON.stringify(result) === JSON.stringify([[10, 20], [50, 70], [80, 90]]), result);
  check("uma execução totalmente coberta limpa os trechos mortos",
    intersectarIntervalos(first, []).length === 0);
}

console.log(`\n${failed === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS"}: ${passed} ok, ${failed} falha(s)`);
process.exit(failed === 0 ? 0 : 1);
