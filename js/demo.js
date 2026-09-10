// demo.js. [M25] Conjunto fictício do modo demonstração.
//
// Arquivo PURO: monta e devolve um snapshot. Não grava, não toca no DOM, não
// olha `state`. Quem liga e desliga o modo é `app.js`.
//
// ------------------------------------------------------------------------------
// A GARANTIA QUE IMPORTA: A DEMONSTRAÇÃO NÃO ENCOSTA NO BANCO
// ------------------------------------------------------------------------------
// O snapshot daqui vive só em `state.data`. `setData` deixa de chamar
// `saveData` e de agendar a nuvem enquanto o modo está ligado, então o
// IndexedDB do usuário continua exatamente como estava e nada sobe para conta
// nenhuma. Sair da demonstração é reler o disco, que nunca mudou.
//
// Consequência aceita de propósito: recarregar a página encerra a
// demonstração. É o comportamento correto para dado fictício, e é também o que
// torna a promessa verificável em vez de depender de disciplina.
//
// ------------------------------------------------------------------------------
// POR QUE AS DATAS SÃO CONSTRUÍDAS ASSIM
// ------------------------------------------------------------------------------
// Toda data sai de `dia(mesesAtras, diaDoMes)`, com o dia limitado a 28 e, no
// mês corrente, limitado a HOJE. Duas armadilhas conhecidas do projeto:
//
//   * dia 29, 30 ou 31 não existe em todo mês, e a data inválida escorrega para
//     o mês seguinte;
//   * lançamento no futuro é corretamente ignorado pelos saldos, então uma
//     demonstração ancorada no dia 10 apareceria vazia nos dez primeiros dias
//     de cada mês. É o mesmo defeito que hoje deixa cinco suítes vermelhas.
"use strict";

const DEMO_MONTHS = 6;

// Renda e despesas de um domicílio urbano brasileiro plausível. Números
// redondos de propósito: é demonstração, não simulação de caso real.
const DEMO_INCOME = 7200;

// [M42] O MÊS CORRENTE É COMPRIMIDO, NÃO EMPILHADO.
//
// A regra antiga era `Math.min(dia, hoje)`: no dia 9, TODO lançamento do mês
// corrente com dia nominal 10, 12, 14, 16, 18 ou 20 virava dia 9. O resultado
// era "Últimos lançamentos" com seis linhas na mesma data e um mês que parecia
// ter acontecido num dia só. Pior: as estimativas de ritmo diário ("cerca de
// R$ X por dia") saíam de um mês onde nada aconteceu até hoje.
//
// Agora o calendário de 28 dias é ESCALADO para a parte do mês que já passou.
// O dia 20 de 28, visto no dia 9, cai no dia 6; o dia 5 cai no dia 2. A ordem
// relativa dos lançamentos se mantém, que é o que faz o extrato ler como
// extrato, e nada cai no futuro, que é o que os saldos exigem.
//
// No dia 1º tudo ainda converge para o dia 1. Não há como distribuir seis
// lançamentos num mês que tem um dia de idade, e inventar datas futuras seria
// pior: o app corretamente ignora o que ainda não aconteceu.
function demoIsoDay(monthsAgo, day) {
  const hoje = new Date();
  const base = new Date(hoje.getFullYear(), hoje.getMonth() - monthsAgo, 1);
  const nominal = Math.max(1, Math.min(Number(day) || 1, 28));
  const escolhido = monthsAgo === 0
    ? Math.max(1, Math.min(hoje.getDate(), Math.round((nominal * hoje.getDate()) / 28)))
    : nominal;
  return isoOfDate(new Date(base.getFullYear(), base.getMonth(), escolhido));
}

// [M42] Quita as faturas que JÁ VENCERAM, pelo motor de faturas do app.
//
// `cardLiabilityStatements` devolve, por ciclo, quanto foi comprado, quanto foi
// pago e qual é o vencimento. Aqui um pagamento é criado para cada ciclo cujo
// vencimento já passou, no valor exato do que ficou em aberto e datado no
// próprio dia do vencimento. O ciclo que ainda não venceu fica intacto: é ele
// que dá conteúdo ao cartão de fatura, e é a situação normal de quem usa
// cartão.
//
// Os ids são fixos (`demo-payment-<ciclo>`) pela mesma razão que `demoWave` não
// usa `Math.random`: a demonstração precisa ser idêntica a cada abertura.
function demoCardPayments(data, contaId, cartaoId) {
  const hoje = todayIso();
  return cardLiabilityStatements(data, cartaoId, hoje)
    .filter((fatura) => fatura.outstanding > 0 && fatura.dueDate && fatura.dueDate <= hoje)
    .map((fatura) => ({
      id: `demo-payment-${fatura.key}`,
      accountId: contaId,
      creditCardId: cartaoId,
      amount: fatura.outstanding,
      statementKey: fatura.key,
      date: fatura.dueDate,
      source: "card-payment",
    }));
}

// Variação suave e DETERMINÍSTICA. Sem `Math.random`: a demonstração precisa
// ser a mesma a cada abertura, senão dois prints da mesma tela discordam e
// qualquer teste sobre ela vira loteria.
function demoWave(index, amplitude) {
  return roundMoney(Math.sin(index * 1.7) * amplitude);
}

function demoTransactions(contaId, cartaoId) {
  const list = [];
  const push = (partial) => list.push(makeTransaction({ ...partial, source: "demo" }));

  for (let m = DEMO_MONTHS - 1; m >= 0; m--) {
    const i = DEMO_MONTHS - m;

    push({ type: "income", amount: DEMO_INCOME, categoryId: "outros", date: demoIsoDay(m, 5),
      description: "Salário", payment: "Transferência", accountId: contaId, recurring: true, nature: "income" });

    push({ type: "expense", amount: 1850, categoryId: "moradia", date: demoIsoDay(m, 8),
      description: "Aluguel", payment: "Transferência", accountId: contaId, recurring: true });
    push({ type: "expense", amount: roundMoney(210 + demoWave(i, 45)), categoryId: "moradia", date: demoIsoDay(m, 12),
      description: "Energia elétrica", payment: "Débito", accountId: contaId, recurring: true });
    push({ type: "expense", amount: 129.9, categoryId: "assinaturas", date: demoIsoDay(m, 14),
      description: "Internet", payment: "Débito", accountId: contaId, recurring: true });
    push({ type: "expense", amount: 55.9, categoryId: "assinaturas", date: demoIsoDay(m, 18),
      description: "Streaming de vídeo", payment: "Crédito", creditCardId: cartaoId, recurring: true });
    push({ type: "expense", amount: 21.9, categoryId: "assinaturas", date: demoIsoDay(m, 18),
      description: "Streaming de música", payment: "Crédito", creditCardId: cartaoId, recurring: true });
    push({ type: "expense", amount: 119, categoryId: "saude", date: demoIsoDay(m, 10),
      description: "Academia", payment: "Débito", accountId: contaId, recurring: true });

    push({ type: "expense", amount: roundMoney(640 + demoWave(i, 120)), categoryId: "mercado", date: demoIsoDay(m, 6),
      description: "Mercado do mês", payment: "Crédito", creditCardId: cartaoId });
    push({ type: "expense", amount: roundMoney(190 + demoWave(i + 2, 70)), categoryId: "mercado", date: demoIsoDay(m, 20),
      description: "Feira", payment: "Débito", accountId: contaId });
    push({ type: "expense", amount: roundMoney(240 + demoWave(i + 1, 110)), categoryId: "delivery", date: demoIsoDay(m, 16),
      description: "Restaurantes e delivery", payment: "Crédito", creditCardId: cartaoId });
    push({ type: "expense", amount: roundMoney(310 + demoWave(i + 3, 80)), categoryId: "transporte", date: demoIsoDay(m, 9),
      description: "Combustível", payment: "Crédito", creditCardId: cartaoId });
    push({ type: "expense", amount: roundMoney(160 + demoWave(i + 4, 90)), categoryId: "lazer", date: demoIsoDay(m, 22),
      description: "Lazer", payment: "Crédito", creditCardId: cartaoId });

    // Aporte na reserva: é a linha que faz a taxa de poupança e a evolução do
    // patrimônio existirem na demonstração.
    push({ type: "expense", amount: 600, categoryId: "investimento", date: demoIsoDay(m, 6),
      description: "Aporte na reserva", payment: "Transferência", accountId: contaId, goalId: "demo-goal-reserva" });
  }

  return list;
}

// Devolve um snapshot COMPLETO e já normalizado. `migrate` roda por último para
// a demonstração passar pelas mesmas regras de qualquer base carregada do
// disco; se algum campo daqui estiver fora do schema, ele é corrigido no mesmo
// lugar em que um backup antigo seria.
function buildDemoData() {
  const contaId = "demo-conta-corrente";
  const cartaoId = "demo-cartao";

  const base = defaultData();
  const conta = makeAccount({
    id: contaId, name: "Conta corrente", type: "corrente",
    openingBalance: 2400, openingDate: demoIsoDay(DEMO_MONTHS, 1), color: "#0B6B5C",
  });
  const cartao = makeCreditCard({
    id: cartaoId, name: "Cartão principal", limit: 6000, closingDay: 22, dueDay: 1,
    accountId: contaId, color: "#7A5AF8",
  }, [conta]);

  const metas = [
    { id: "demo-goal-reserva", name: "Reserva de emergência", target: 21600, current: 8400,
      deadline: demoIsoDay(-12, 20), icon: "shield", monthlyPlan: 600 },
    { id: "demo-goal-viagem", name: "Viagem em família", target: 9000, current: 2150,
      deadline: demoIsoDay(-9, 15), icon: "plane", monthlyPlan: 350 },
  ];

  const patrimonio = [
    makeAsset({ id: "demo-asset-reserva", class: "investimento", name: "Reserva em renda fixa", value: 8400, inLedger: true }),
    makeAsset({ id: "demo-asset-previdencia", class: "investimento", name: "Previdência", value: 15200 }),
    makeAsset({ id: "demo-asset-veiculo", class: "veiculo", name: "Carro", value: 42000 }),
    makeAsset({
      id: "demo-debt-carro", class: "divida", name: "Financiamento do carro",
      value: 18600, monthlyPayment: 890, dueDay: 15, debtType: "veiculo", creditor: "Banco",
      originalPrincipal: 36000, ratePct: 1.49, ratePeriod: "monthly", cetAnnualPct: 21.4,
      remainingInstallments: 24, amortizationSystem: "price",
    }),
  ];

  const data = {
    ...base,
    // [M42] SEM NOME, DE PROPÓSITO.
    //
    // Era "Convidada", e a saudação saía "Boa noite, Convidada" para todo mundo
    // que abrisse a demonstração. Gênero fixo numa tela que nem sabe quem está
    // olhando. `displayFirstName` devolve null quando o campo está vazio e a
    // saudação cai em "Boa noite" limpo, que é o certo: quem está de visita
    // ainda não disse como quer ser chamado.
    userName: "",
    monthlyIncome: DEMO_INCOME,
    creditCardLimit: 6000,
    accounts: [conta],
    creditCards: [cartao],
    goals: metas,
    assets: patrimonio,
    emergencyGoalId: "demo-goal-reserva",
    transactions: demoTransactions(contaId, cartaoId),
    dashboardFocus: "month",
    onboarding: { done: true, skipped: false, completedAt: demoIsoDay(DEMO_MONTHS, 1) },
  };

  // [M42] AS FATURAS VENCIDAS SÃO PAGAS: A DEMONSTRAÇÃO NÃO NASCE INADIMPLENTE.
  //
  // Não havia `cardPayments` nenhum. Como o conjunto tem seis meses de compras
  // no cartão, TODA fatura fechada continuava em aberto, e o primeiro contato de
  // um visitante com o produto era o painel dizendo "5 vencidas · R$ 11.805,80",
  // com R$ 7.339,56 (mais de uma renda mensal) descontados do saldo. Um
  // domicílio que paga aluguel, guarda R$ 8.400 de reserva e tem R$ 15.200
  // investidos não deixa cinco faturas vencerem; a demonstração descrevia uma
  // situação que ela mesma não recomenda.
  //
  // As faturas são pagas pelo MOTOR do app (`cardLiabilityStatements`), e não
  // por valores escritos à mão aqui: o ciclo de fechamento e vencimento é regra
  // de `js/accounts.js`, e uma segunda cópia dela nesta fixture divergiria do
  // produto na primeira vez que alguém mexesse em um dos dois.
  //
  // O que fica em aberto, de propósito, é a fatura que AINDA NÃO VENCEU. Ela é
  // o que faz o cartão "Fatura do cartão de crédito" ter o que mostrar, e é a
  // situação normal de quem usa cartão.
  data.cardPayments = demoCardPayments(data, contaId, cartaoId);

  // Tetos por categoria a partir da regra padrão, pelo mesmo motor do
  // assistente: a demonstração precisa mostrar orçamento com barra cheia, e
  // duplicar a tabela de pesos aqui a faria divergir do produto na primeira
  // vez que alguém mexesse em um dos dois.
  const seeds = seedBudgetsFromSplit(data, DEMO_INCOME, data.budgetSplit);
  data.categories = categoriesWithSeededBudgets(data.categories, seeds);

  return migrate(withBudgetSnapshot(data));
}
