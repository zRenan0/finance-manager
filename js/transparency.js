// transparency.js. Explicações comuns para números financeiros importantes.
"use strict";

const CALCULATION_KIND = Object.freeze({
  realized: { id: "realized", label: "Realizado", icon: "checkCircle", note: "Usa valores que já foram registrados." },
  forecast: { id: "forecast", label: "Previsto", icon: "calendar", note: "Usa compromissos futuros já conhecidos." },
  estimated: { id: "estimated", label: "Estimado", icon: "trendUp", note: "Usa médias, taxas ou outras hipóteses." },
});

function latestCalculationUpdate(data, extra) {
  const candidates = [];
  const collect = (item) => {
    if (!item) return;
    const value = item.updatedAt || item.createdAt || item.reconciledAt || item.balanceCheckedAt || item.openingDate;
    if (value) candidates.push(String(value));
  };
  ["transactions", "accounts", "creditCards", "accountTransfers", "cardPayments", "accountAdjustments", "assets", "goals"]
    .forEach((key) => (data[key] || []).forEach(collect));
  (extra || []).filter(Boolean).forEach((value) => candidates.push(String(value)));
  return candidates.sort().pop() || null;
}

function calculationExplanation(data, id, context) {
  const ctx = context || {};
  const worth = typeof netWorth === "function" ? netWorth(data) : null;
  const accounts = typeof accountsSummary === "function" ? accountsSummary(data, todayIso()) : null;
  const forecast = ctx.forecast || (typeof buildForecast === "function" ? buildForecast(data) : null);
  const goals = ctx.goals || (typeof buildGoalsModel === "function" ? buildGoalsModel(data, new Date()) : null);
  const debts = ctx.debts || (typeof buildDebtModel === "function" ? buildDebtModel(data) : null);
  const common = { id, updatedAt: latestCalculationUpdate(data) };

  const registry = {
    "accounts-balance": () => ({
      ...common, title: "Saldo em contas", kinds: ["realized"],
      summary: accounts ? `O saldo calculado agora é ${fmtBRL(accounts.cash)}.` : "O saldo usa as movimentações registradas.",
      formula: "Saldos iniciais + receitas − despesas − transferências enviadas + transferências recebidas − pagamentos de fatura + ajustes.",
      premises: [
        // A premissa genérica não bastava: ela dizia a REGRA sem dizer o
        // EFEITO. Quando existe algo de fora, a frase passa a trazer o número,
        // que é o que permite conferir em vez de acreditar.
        accounts && accounts.preOpening && accounts.preOpening.count
          ? `Cada conta considera apenas movimentos a partir da data de abertura informada. Hoje ${accounts.preOpening.count === 1 ? "há 1 lançamento anterior" : `há ${accounts.preOpening.count} lançamentos anteriores`} a essas datas, somando ${fmtBRL(accounts.preOpening.amount)}, fora deste saldo: o saldo inicial informado já deveria contê-los.`
          : "Cada conta considera apenas movimentos a partir da data de abertura informada.",
        "Compras ligadas a um cartão reduzem o caixa somente quando a fatura é paga.",
        "Lançamentos antigos sem conta permanecem no histórico para não apagar dinheiro já registrado.",
      ],
    }),
    "net-worth": () => ({
      ...common, title: "Patrimônio líquido", kinds: ["realized"],
      summary: worth ? `O patrimônio líquido calculado é ${fmtBRL(worth.total)}.` : "O patrimônio combina ativos e obrigações registrados.",
      formula: "Caixa + investimentos + metas + outros bens − dívidas − faturas abertas.",
      premises: [
        "Aportes em metas saem do caixa e entram na meta, sem aumentar o total.",
        "Bens e dívidas cadastrados usam o último valor informado.",
        "Investimentos refletidos no livro caixa não são contados duas vezes.",
      ],
    }),
    forecast: () => ({
      ...common, title: "Previsão de saldo", kinds: ["realized", "forecast", "estimated"],
      updatedAt: latestCalculationUpdate(data, forecast ? [forecast.today] : []),
      summary: forecast ? `A projeção parte de ${fmtBRL(forecast.balance)} e combina eventos conhecidos com uma média de gastos variáveis.` : "A projeção combina saldo atual e eventos futuros.",
      formula: "Saldo de hoje + entradas previstas − saídas previstas − média diária de gastos variáveis.",
      premises: forecast && forecast.assumptions ? forecast.assumptions : ["Quanto maior o prazo, maior a dependência de médias."],
    }),
    health: () => ({
      ...common, title: "Saúde financeira", kinds: ["realized", "estimated"],
      summary: "O diagnóstico reúne indicadores independentes. Falta de dado não vira nota ruim.",
      formula: "Cada indicador compara um valor observado com uma faixa própria; o score considera apenas pilares aplicáveis.",
      premises: [
        "Receitas, despesas, dívidas, reserva e patrimônio vêm dos dados registrados.",
        "Médias ignoram meses sem movimento para não tratar ausência de dados como zero.",
        "As faixas são referências educativas e não uma avaliação de crédito.",
      ],
    }),
    goals: () => ({
      ...common, title: "Metas financeiras", kinds: ["realized", "estimated"],
      summary: goals ? `${fmtBRL(goals.totals.saved)} estão guardados em ${goals.counts.total} meta${goals.counts.total === 1 ? "" : "s"}.` : "O progresso vem dos aportes e resgates registrados.",
      formula: "Saldo da meta = aportes vinculados − resgates. Ritmo = média mensal dos aportes recentes.",
      premises: [
        "Criar uma meta sem valor inicial não movimenta dinheiro.",
        "Valor anterior informado na criação representa dinheiro que já estava guardado antes do acompanhamento.",
        "A data estimada depende do ritmo real ou do aporte planejado e pode mudar.",
      ],
    }),
    debts: () => ({
      ...common, title: "Plano de dívidas", kinds: ["realized", "estimated"],
      summary: debts ? `O plano usa ${fmtBRL(debts.totalBalance)} de saldo devedor informado.` : "O plano usa os saldos e condições cadastrados.",
      formula: "Todo mês paga as parcelas mínimas e direciona o valor extra conforme a estratégia escolhida.",
      premises: [
        "Avalanche prioriza o maior custo; bola de neve prioriza o menor saldo.",
        "Taxas desconhecidas usam queda linear sem juros e reduzem a confiança da estimativa.",
        "O saldo oficial do credor prevalece sobre a projeção do aplicativo.",
      ],
    }),
    simulator: () => ({
      ...common, title: ctx.title || "Resultado do simulador", kinds: ["estimated"],
      updatedAt: latestCalculationUpdate(data, data.marketRates ? [data.marketRates.updatedAt] : []),
      summary: "O resultado muda imediatamente quando uma premissa é alterada.",
      formula: ctx.formula || "O cálculo usa os valores preenchidos no simulador e a matemática financeira indicada no resultado.",
      premises: (ctx.premises || []).concat([
        "Taxas, prazos e custos devem ser conferidos na proposta ou contrato.",
        "O resultado é uma estimativa educativa e não garante oferta ou rendimento.",
      ]),
    }),
  };
  return (registry[id] || registry["net-worth"])();
}

function renderFinancialNotice(topic) {
  const notices = {
    emprestimo: { text: "Estimativa educativa. Compare propostas pelo CET informado pela instituição, incluindo juros, tarifas, impostos, seguros e outras despesas.", links: [["Banco Central sobre CET", "https://www.bcb.gov.br/meubc/faqs/p/cuidados-na-hora-de-contratar-uma-operacao-de-credito"]] },
    financiamento: { text: "Estimativa educativa. O contrato e o CET da instituição prevalecem sobre a projeção. Confira seguros, tarifas, datas e regras de amortização.", links: [["Banco Central sobre crédito", "https://www.bcb.gov.br/meubc/faqs/s/emprestimos-e-financiamentos"]] },
    "entrada-amortizacao": { text: "A comparação usa as premissas digitadas e não verifica aprovação, CET contratual ou liquidez necessária para emergências.", links: [["Banco Central sobre crédito", "https://www.bcb.gov.br/meubc/faqs/s/emprestimos-e-financiamentos"]] },
    cartao: { text: "A opção de menor custo na simulação não é uma oferta. Confirme CET, prazo, parcela e custo total de cada proposta antes de trocar a dívida.", links: [["Banco Central sobre CET", "https://www.bcb.gov.br/meubc/faqs/p/cuidados-na-hora-de-contratar-uma-operacao-de-credito"]] },
    aposentadoria: { text: "Este cálculo planeja patrimônio privado. Não estima concessão nem valor de benefício do INSS. A simulação oficial também é apenas uma projeção.", links: [["Simular aposentadoria no Meu INSS", "https://www.gov.br/pt-br/servicos/simular-aposentadoria"]] },
    rendafixa: { text: "Estimativa educativa. Rentabilidade, tributação, liquidez, risco, custódia e proteção variam por produto e data. Confira a oferta e os documentos antes de investir.", links: [["Educação do investidor na CVM", "https://www.gov.br/cvm/pt-br/assuntos/educacao/"]] },
    consorcio: { text: "Estimativa educativa. A contemplação, os reajustes, o fundo de reserva e os custos seguem o regulamento e o contrato do grupo.", links: [["Banco Central sobre consórcios", "https://www.bcb.gov.br/meubc/faqs/s/consorcios"]] },
    fgts: { text: "Estimativa educativa. Regras de saque, retorno de modalidade e remuneração podem mudar. Confirme as condições vigentes nos canais oficiais.", links: [["FGTS na Caixa", "https://www.caixa.gov.br/beneficios-trabalhador/fgts/Paginas/default.aspx"]] },
    juros: { text: "Projeção matemática, sem garantia de rendimento. Taxas, impostos, custos e inflação alteram o resultado real.", links: [["Educação do investidor na CVM", "https://www.gov.br/cvm/pt-br/assuntos/educacao/"]] },
    // [M37] Natureza do texto gerado por IA. Ele fica ao lado das outras
    // ressalvas de propósito: a análise da IA é do mesmo tipo de conteúdo que a
    // simulação de juros (educativa, com premissa, sem garantia) e merece a
    // mesma moldura em vez de um rodapé próprio, menor e mais fácil de ignorar.
    ia: { text: "Conteúdo educativo gerado por IA a partir dos números que você enviou. Não é recomendação de investimento nem consultoria financeira: o app não indica ativo, produto, instituição nem percentual de carteira. Todo valor futuro citado é estimativa, não previsão.", links: [["Educação do investidor na CVM", "https://www.gov.br/cvm/pt-br/assuntos/educacao/"]] },
  };
  const notice = notices[topic] || notices.juros;
  return `<aside class="financial-notice" aria-label="Limites da simulação">${svgIcon("info", 16)}<div><p>${escapeHtml(notice.text)}</p><div class="source-links">${notice.links.map(([label, url]) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`).join("")}</div><small>Referências revisadas em ${fmtDateFull(LEGAL_REVIEW_DATE)}.</small></div></aside>`;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { CALCULATION_KIND, latestCalculationUpdate, calculationExplanation, renderFinancialNotice };
}
