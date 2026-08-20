// investments.js. Máquina do Tempo dos Juros Compostos (Feature 3)
// Cálculo mês a mês de uma simulação de aportes recorrentes com juros
// compostos, sem nenhuma dependência externa (nada de Chart.js/CDN; só
// matemática simples + o próprio SVG desenhado na hora, no mesmo estilo dos
// outros gráficos do app).
"use strict";

// Atalhos derivados das premissas do aparelho. Nenhum retorno de mercado fica
// congelado no código, e renda variável não recebe uma promessa disfarçada de
// média histórica sem período, índice ou fonte.
function investmentRatePresets(data) {
  const rates = typeof marketRatesOf === "function"
    ? marketRatesOf(data || {})
    : { selic: 0, cdi: 0, ipca: 0, tr: 0, poupanca: 0 };
  const ipcaPlusSix = ((1 + (Number(rates.ipca) || 0) / 100) * 1.06 - 1) * 100;
  return [
    { id: "poupanca", label: "Poupança", ratePct: Number(rates.poupanca) || 0 },
    { id: "cdi", label: "CDI (110%)", ratePct: (Number(rates.cdi) || 0) * 1.1 },
    { id: "ipca", label: "IPCA + 6%", ratePct: ipcaPlusSix },
  ].map((p) => ({ ...p, ratePct: Math.round(p.ratePct * 100) / 100 }));
}

// Simula aportes mensais com juros compostos, mês a mês.
// annualRatePct: taxa de juros ao ano, em %. Convertida para taxa mensal equivalente.
function simulateCompoundInterest({ initial = 0, monthlyContribution = 0, years = 10, annualRatePct = 10 }) {
  const months = Math.max(1, Math.round(years * 12));
  const monthlyRate = Math.pow(1 + Math.max(-99, annualRatePct) / 100, 1 / 12) - 1;

  // Projeção monetária: cada mês é arredondado para centavos, exatamente como o
  // dinheiro se comporta na conta real. Sem isso, 480 iterações de float fazem o
  // total final divergir alguns centavos do que o usuário calcula na planilha.
  const series = [{ month: 0, total: roundMoney(initial), contributed: roundMoney(initial), interest: 0 }];
  let total = roundMoney(initial);
  let contributed = roundMoney(initial);
  for (let m = 1; m <= months; m++) {
    total = addMoney(mulMoney(total, 1 + monthlyRate), monthlyContribution);
    contributed = addMoney(contributed, monthlyContribution);
    series.push({ month: m, total, contributed, interest: Math.max(0, subMoney(total, contributed)) });
  }
  const last = series[series.length - 1];
  return {
    months, monthlyRate, series,
    totalFinal: last.total,
    totalContributed: last.contributed,
    totalInterest: last.interest,
  };
}

// Reamostragem para o SVG não desenhar centenas de segmentos em prazos longos.
// A implementação única mora em utils.js (resampleSeries); antes este arquivo e
// charts.js carregavam duas cópias idênticas com nomes diferentes.
function downsampleSeries(series, targetPoints = 60) {
  return resampleSeries(series, targetPoints);
}
