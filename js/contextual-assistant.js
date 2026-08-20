// contextual-assistant.js. Perguntas e respostas locais conforme a tela aberta.
"use strict";

const ASSISTANT_SCREEN_LABELS = Object.freeze({
  dashboard: "Início", analytics: "Movimentações", accounts: "Contas", debts: "Dívidas",
  goals: "Metas", calendar: "Planejamento", simulators: "Simuladores", health: "Saúde financeira",
  wealth: "Patrimônio", invest: "Investimentos", add: "Novo lançamento", settings: "Ajustes",
});

function assistantMoneyDraft(value) {
  return roundMoney(Math.max(0, Number(value) || 0)).toFixed(2).replace(".", ",");
}

function buildContextualAssistant(data, tab, context) {
  const ctx = context || {};
  const accounts = typeof accountsSummary === "function" ? accountsSummary(data, todayIso()) : null;
  const review = typeof buildTransactionReviewModel === "function" ? buildTransactionReviewModel(data) : { issues: [] };
  const forecast = typeof buildForecast === "function" ? buildForecast(data) : null;
  const debts = typeof buildDebtModel === "function" ? buildDebtModel(data) : null;
  const goals = typeof buildGoalsModel === "function" ? buildGoalsModel(data, new Date()) : null;
  const items = [];
  const add = (item) => { if (item && items.length < 3) items.push(item); };
  const firstActiveGoal = goals && goals.goals.find((item) => !item.done);
  const firstDebt = debts && debts.ordered[0];

  if (tab === "accounts") {
    add({ id: "accounts-update", question: "Meus saldos estão atualizados?", answer: review.issues.some((i) => i.type === "account") ? "Há contas sem conferência recente. A conciliação compara o saldo calculado com o saldo visto no banco e registra somente a diferença." : "As contas ativas foram conferidas nos últimos 30 dias." });
    add({ id: "accounts-cards", question: "Quanto sobra após as faturas?", answer: accounts ? `Você tem ${fmtBRL(accounts.cash)} em contas e ${fmtBRL(accounts.cardDue)} em faturas abertas. Depois delas, restam ${fmtBRL(accounts.availableAfterCards)}.` : "Cadastre uma conta para fazer esta conta.", action: { kind: "navigate", tab: "accounts", label: "Ver contas" } });
    add({ id: "accounts-purchase", question: "Vale usar meu dinheiro como entrada?", answer: "Compare a entrada agora com financiar tudo e amortizar depois. O simulador abre com seu saldo disponível preenchido.", action: { kind: "simulator", simId: "entrada-amortizacao", values: { dinheiro: assistantMoneyDraft(accounts ? Math.max(0, accounts.cash) : 0) }, label: "Abrir comparação" } });
  } else if (tab === "debts") {
    add({ id: "debt-priority", question: "Qual dívida vem primeiro?", answer: firstDebt ? `${firstDebt.name} está no topo da estratégia atual. O plano mantém as parcelas mínimas das demais e concentra o valor livre nela.` : "Cadastre saldo, parcela e taxa para ordenar suas dívidas.", action: { kind: "navigate", tab: "debts", label: "Ver plano" } });
    add({ id: "debt-date", question: "Quando termino de pagar?", answer: debts && debts.estimatedDebtFreeAt ? `Com as premissas atuais, a quitação é estimada para ${fmtDateFull(debts.estimatedDebtFreeAt)}. Taxas ou parcelas desconhecidas deixam essa data menos confiável.` : "Ainda não há dados suficientes para estimar uma data de quitação." });
    add({ id: "debt-card", question: "Quero comparar o custo do cartão", answer: "O simulador coloca rotativo, parcelamento da fatura e crédito alternativo lado a lado.", action: { kind: "simulator", simId: "cartao", values: { divida: assistantMoneyDraft(accounts ? accounts.cardDue : 0) }, label: "Simular cartão" } });
  } else if (tab === "goals") {
    add({ id: "goal-monthly", question: "Quanto preciso guardar por mês?", answer: firstActiveGoal ? (firstActiveGoal.requiredMonthly != null ? `${firstActiveGoal.goal.name} precisa de cerca de ${fmtBRL(firstActiveGoal.requiredMonthly)} por mês para alcançar o prazo informado.` : `${firstActiveGoal.goal.name} não tem prazo suficiente para calcular um aporte mensal necessário.`) : "Crie uma meta com valor e prazo para calcular o aporte mensal." });
    add({ id: "goal-budget", question: "Meu plano cabe no orçamento?", answer: goals && goals.plan.feasible != null ? (goals.plan.feasible ? `O compromisso de ${fmtBRL(goals.plan.commitment)} cabe na sobra estimada de ${fmtBRL(goals.plan.capacity)}.` : `O compromisso supera sua sobra estimada em ${fmtBRL(goals.plan.gap)} por mês.`) : "Ainda falta histórico ou renda para comparar metas com sua capacidade mensal." });
    add({ id: "goal-add", question: "Quero registrar um aporte", answer: "O aporte será uma movimentação real e reduzirá o saldo da conta escolhida.", action: { kind: "navigate", tab: "goals", label: "Abrir metas" } });
  } else if (tab === "calendar") {
    const h30 = forecast && forecast.horizons.find((h) => h.id === "30d");
    add({ id: "forecast-30", question: "Quanto devo ter em 30 dias?", answer: h30 ? `A projeção é ${fmtBRL(h30.projected)}. Ela mistura compromissos conhecidos e média de gastos variáveis.` : "Ainda não foi possível montar a previsão." });
    add({ id: "forecast-negative", question: "Meu saldo pode ficar negativo?", answer: forecast && forecast.negativeDayIso ? `Sim. Pelos dados atuais, o primeiro dia negativo é ${fmtDateFull(forecast.negativeDayIso)}.` : "A projeção atual não encontra saldo negativo nos próximos 12 meses." });
    add({ id: "forecast-details", question: "Quero revisar as premissas", answer: "A explicação separa saldo realizado, compromissos previstos e médias estimadas.", action: { kind: "calculation", calculationId: "forecast", label: "Como foi calculado" } });
  } else if (tab === "analytics") {
    add({ id: "review-pending", question: "O que precisa de revisão?", answer: review.issues.length ? `Há ${review.issues.length} ${review.issues.length === 1 ? "item" : "itens"} na caixa de revisão, incluindo categorias, possíveis duplicidades, transferências ou saldos sem conferência.` : "A caixa de revisão não encontrou pendências agora.", action: { kind: "navigate", tab: "analytics", label: "Abrir revisão" } });
    add({ id: "movement-source", question: "De onde vieram meus dados?", answer: "A central de fontes mostra lançamentos manuais, arquivos importados, QR Codes e movimentos internos separadamente.", action: { kind: "accounts-sources", tab: "accounts", label: "Ver fontes" } });
  } else if (tab === "simulators") {
    add({ id: "sim-assumptions", question: "Quais premissas estou usando?", answer: "O resultado usa os campos visíveis e, quando necessário, as taxas cadastradas em Ajustes.", action: { kind: "calculation", calculationId: "simulator", label: "Como foi calculado" } });
    add({ id: "sim-purchase", question: "Comparar entrada com amortização", answer: "A comparação considera duas propostas de taxa, rendimento líquido, reserva intocada e o momento da amortização.", action: { kind: "simulator", simId: "entrada-amortizacao", values: { dinheiro: assistantMoneyDraft(accounts ? Math.max(0, accounts.cash) : 0) }, label: "Abrir comparação" } });
  } else {
    add({ id: "general-review", question: "O que merece atenção agora?", answer: review.issues.length ? `Comece pelos ${review.issues.length} itens da caixa de revisão para confiar nos saldos e relatórios.` : (firstDebt ? `A prioridade atual é acompanhar ${firstDebt.name}, que lidera seu plano de dívidas.` : "Não há pendências críticas identificadas nos dados atuais."), action: review.issues.length ? { kind: "navigate", tab: "analytics", label: "Abrir revisão" } : null });
    add({ id: "general-forecast", question: "Como fica meu saldo no próximo mês?", answer: forecast ? `Em 30 dias, a projeção indica ${fmtBRL(forecast.horizons.find((h) => h.id === "30d").projected)}.` : "Cadastre movimentações para montar a previsão.", action: { kind: "navigate", tab: "calendar", label: "Ver planejamento" } });
    add({ id: "general-purchase", question: "Quero testar uma compra maior", answer: "Compare usar dinheiro na entrada com financiar tudo e amortizar depois.", action: { kind: "simulator", simId: "entrada-amortizacao", values: { dinheiro: assistantMoneyDraft(accounts ? Math.max(0, accounts.cash) : 0) }, label: "Abrir simulador" } });
  }

  return { screenLabel: ASSISTANT_SCREEN_LABELS[tab] || "esta tela", items, local: true, simId: ctx.simId || null };
}

if (typeof module !== "undefined" && module.exports) module.exports = { ASSISTANT_SCREEN_LABELS, assistantMoneyDraft, buildContextualAssistant };
