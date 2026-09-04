// fixed-clock.js — relógio congelado para as fixtures dos testes.
//
// POR QUE ISTO EXISTE
//
// Vários cenários montam lançamentos em dias fixos do mês ("dia 10", "dia 4") e
// depois cobram um resultado. Só que o app só considera REALIZADO o que já
// aconteceu: um gasto lançado no dia 10 é futuro quando hoje é dia 3, some do
// total do mês, e o teste reprova sem que exista defeito nenhum no aplicativo.
// A suíte passava do dia 11 em diante e reprovava nos dez primeiros dias de todo
// mês — o pior tipo de teste, o que falha por calendário e ensina a ignorar
// falha.
//
// A correção é dar aos testes um "hoje" estável. `congelar(ctx)` troca o `Date`
// do contexto por uma subclasse que responde sempre a mesma data para
// `new Date()` e `Date.now()`, sem mexer em `new Date(iso)` nem em
// `new Date(ano, mes, dia)`. Assim `todayIso()`, `keyOfDate(new Date())` e
// qualquer `new Date()` dentro do app concordam entre si.
//
// PADRÃO: dia 15 do mês corrente, meio-dia. Mantém o mês e o ano reais (as
// fixtures falam em "mês passado", "há 3 meses") e remove a única dimensão que
// quebrava, que é o dia do mês.
//
// `TEST_TODAY=AAAA-MM-DD` força outra data. Serve para provar que a suíte passa
// em qualquer dia do mês:
//
//   TEST_TODAY=2026-02-01 node tests/test-health.js
//   TEST_TODAY=2026-02-28 node tests/test-health.js
"use strict";

function dataCongelada() {
  const env = String(process.env.TEST_TODAY || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(env)) {
    const [y, m, d] = env.split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }
  const agora = new Date();
  return new Date(agora.getFullYear(), agora.getMonth(), 15, 12, 0, 0, 0);
}

// A subclasse preserva tudo o que o app usa: `new Date(iso)`, `new Date(y, m, d)`,
// `Date.parse`, `Date.UTC` e os métodos de instância. Só o "agora" é fixo.
function classeCongelada(base) {
  const instante = base.getTime();
  class DataFixa extends Date {
    constructor(...args) {
      if (args.length === 0) super(instante);
      else super(...args);
    }
    static now() { return instante; }
  }
  return DataFixa;
}

/**
 * Congela o relógio de um contexto de VM. Chame ANTES de carregar as fontes.
 * Devolve { now, iso, DataFixa } para o próprio teste usar o mesmo "hoje".
 */
function congelar(ctx) {
  const base = dataCongelada();
  const DataFixa = classeCongelada(base);
  if (ctx) ctx.Date = DataFixa;
  const pad = (n) => String(n).padStart(2, "0");
  return {
    DataFixa,
    now: () => new DataFixa(),
    iso: `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`,
    monthKey: `${base.getFullYear()}-${pad(base.getMonth() + 1)}`,
  };
}

module.exports = { congelar, dataCongelada };
