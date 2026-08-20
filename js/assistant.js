// assistant.js. Assistente financeiro (Feature 2)
// Motor de regras 100% local: um "dicionário" de gatilhos que olha para os
// dados do mês e devolve alertas/dicas em linguagem simples. Nada sai do
// aparelho, nada depende de rede; é só JS analisando o objeto `data`.
"use strict";

// Cada regra recebe (data, monthKey) e devolve `null` (sem alerta) ou um
// objeto { severity, title, message }. "severity" define a cor do card:
// "danger" (vermelho), "warn" (âmbar) ou "info" (neutro/marca).
const ASSISTANT_RULES = [
  {
    id: "lazer-alto",
    icon: "leisure",
    check(data, mKey) {
      const income = effectiveIncome(data, mKey);
      if (income <= 0) return null;
      const spent = realizedTxForMonth(data, mKey)
        .filter((t) => t.type === "expense" && t.categoryId === "lazer")
        .reduce((s, t) => s + t.amount, 0);
      if (spent <= 0) return null;
      const pct = spent / income;
      if (pct <= 0.3) return null;
      return {
        severity: "warn",
        title: "Seu lazer está consumindo grande parte do seu orçamento",
        message: `Os gastos com Lazer já somam ${fmtBRL(spent)} este mês. ${(pct * 100).toFixed(0)}% da sua renda.`,
      };
    },
  },
  {
    id: "grupo-desejos",
    icon: "gift",
    check(data, mKey) {
      const income = effectiveIncome(data, mKey);
      if (income <= 0) return null;
      const allocated = groupAllocated(data, mKey, "desejo");
      const spent = monthGroupSpend(data, mKey).desejo;
      if (spent <= allocated || allocated <= 0) return null;
      const over = spent - allocated;
      return {
        severity: "warn",
        title: `Grupo "Desejos" passou dos ${data.budgetSplit.desejo}% planejados`,
        message: `Você já gastou ${fmtBRL(spent)} em Desejos, ${fmtBRL(over)} acima do combinado (${fmtBRL(allocated)}).`,
      };
    },
  },
  {
    id: "grupo-necessidades",
    icon: "shieldCheck",
    check(data, mKey) {
      const income = effectiveIncome(data, mKey);
      if (income <= 0) return null;
      const allocated = groupAllocated(data, mKey, "necessidade");
      const spent = monthGroupSpend(data, mKey).necessidade;
      if (spent <= allocated || allocated <= 0) return null;
      const over = spent - allocated;
      return {
        severity: "danger",
        title: `Grupo "Necessidades" passou dos ${data.budgetSplit.necessidade}% planejados`,
        message: `Os gastos essenciais já somam ${fmtBRL(spent)}, ${fmtBRL(over)} acima do previsto. Vale revisar contas fixas.`,
      };
    },
  },
  {
    id: "grupo-futuro-baixo",
    icon: "piggy",
    check(data, mKey) {
      const income = effectiveIncome(data, mKey);
      if (income <= 0) return null;
      const now = new Date();
      const isCurrent = keyOfDate(now) === mKey;
      if (!isCurrent || now.getDate() < 20) return null; // só avisa perto do fim do mês
      const allocated = groupAllocated(data, mKey, "futuro");
      if (allocated <= 0) return null;
      const spent = monthGroupSpend(data, mKey).futuro;
      if (spent >= allocated * 0.5) return null;
      return {
        severity: "info",
        title: "O mês está acabando e o Futuro ficou de lado",
        message: `Só ${fmtBRL(spent)} de ${fmtBRL(allocated)} planejados para poupança/investimentos foram guardados até agora.`,
      };
    },
  },
];

// Retorna a lista de alertas ativos para o mês informado (mais graves primeiro).
// Os alertas de ORÇAMENTO POR CATEGORIA (Feature 3) vêm prontos de budgets.js :
// manter a regra aqui duplicaria o cálculo de faixas 80%/100% em dois lugares.
function getAssistantAlerts(data, monthKey) {
  const order = { danger: 0, warn: 1, info: 2 };
  const fromRules = ASSISTANT_RULES
    .map((rule) => {
      const res = rule.check(data, monthKey);
      return res ? { id: rule.id, icon: rule.icon, ...res } : null;
    })
    .filter(Boolean);

  const fromBudgets = typeof budgetAlerts === "function" ? budgetAlerts(data, monthKey) : [];

  return fromRules
    .concat(fromBudgets)
    .sort((a, b) => order[a.severity] - order[b.severity])
    .slice(0, 6);   // teto de itens: um painel com 15 avisos não é lido por ninguém
}
