// js/screens/simulators.js. Catálogo de simuladores financeiros. Motores em simulators.js.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

// ==================================================================
// MÓDULO 5. SIMULADORES
// ------------------------------------------------------------------
// Nove simuladores compartilhando UM renderizador de formulário. Cada um
// declara os próprios campos em SIM_CATALOG; a tela monta os inputs a partir
// da declaração e só o bloco de resultado é específico. Sem isso, seriam oito
// formulários copiados; e oito lugares para esquecer de corrigir um bug.
//
// Toda a matemática mora em simulators.js. Nenhuma conta acontece aqui.
// ==================================================================

const SIM_CATALOG = [
  {
    id: "juros", label: "Juros compostos", icon: "trendUp",
    subtitle: "A máquina do tempo: quanto um aporte mensal vira em N anos.",
    fields: [],
  },
  {
    id: "rendafixa", label: "Renda fixa", icon: "piggy",
    subtitle: "Compara produtos com as premissas informadas e estima tributos e custos aplicáveis ao cenário.",
    options: [{
      key: "produto", label: "Produto",
      choices: [
        { value: "cdi", label: "CDB / RDB (% do CDI)" },
        { value: "selic", label: "Tesouro Selic" },
        { value: "ipca", label: "Tesouro IPCA+" },
        { value: "pre", label: "Prefixado" },
        { value: "lci", label: "LCI / LCA (isento)" },
        { value: "poupanca", label: "Poupança" },
      ],
      def: "cdi",
    }],
    fields: [
      { key: "principal", label: "Valor inicial", type: "money", def: "10000", prefix: "R$" },
      { key: "aporte", label: "Aporte mensal", type: "money", def: "500", prefix: "R$" },
      { key: "meses", label: "Prazo", type: "int", def: "24", suffix: "meses" },
      // Rótulo, unidade e padrão destes dois campos dependem do produto
      // escolhido (ver RENDAFIXA_RATE_BY_PRODUCT e simFieldSpec): "110" é
      // uma taxa razoável para CDB em % do CDI e um absurdo como spread sobre
      // a Selic. Antes o mesmo "110" valia para os seis produtos.
      { key: "taxa", label: "Taxa contratada", type: "pct", def: "110", suffix: "%", dynamic: true },
      { key: "custodia", label: "Taxa anual de custódia/administração", type: "pct", def: "0", suffix: "% a.a.", dynamic: true, hint: "Fundos cobram taxa de administração; CDB, LCI e poupança em geral não cobram nada." },
    ],
  },
  {
    id: "emprestimo", label: "Empréstimo", icon: "creditCard",
    subtitle: "Quanto custa de verdade, com tarifa e seguro dentro do CET.",
    options: [{ key: "sistema", label: "Sistema de amortização", choices: [{ value: "price", label: "Price (parcela fixa)" }, { value: "sac", label: "SAC (parcela decrescente)" }], def: "price" }],
    fields: [
      { key: "valor", label: "Valor emprestado", type: "money", def: "20000", prefix: "R$" },
      { key: "parcelas", label: "Parcelas", type: "int", def: "36", suffix: "x" },
      { key: "juros", label: "Juros ao mês", type: "pct", def: "2,5", suffix: "% a.m.", hint: "É assim que o banco anuncia. O app converte para a taxa anual equivalente (composta, não multiplicada por 12)." },
      { key: "tarifa", label: "Tarifa mensal", type: "money", def: "0", prefix: "R$" },
      { key: "seguro", label: "Seguro mensal", type: "money", def: "0", prefix: "R$" },
      { key: "iof", label: "Tarifas e IOF cobrados na contratação", type: "money", def: "0", prefix: "R$" },
    ],
  },
  {
    id: "financiamento", label: "Financiamento", icon: "home",
    subtitle: "Imóvel ou veículo: parcela, juros totais e quanto o bem fica mais caro que à vista.",
    options: [{ key: "sistema", label: "Sistema de amortização", choices: [{ value: "price", label: "Price (parcela fixa)" }, { value: "sac", label: "SAC (parcela decrescente)" }], def: "sac" }],
    fields: [
      { key: "bem", label: "Valor do bem", type: "money", def: "300000", prefix: "R$" },
      { key: "entrada", label: "Entrada", type: "money", def: "60000", prefix: "R$" },
      { key: "parcelas", label: "Prazo", type: "int", def: "360", suffix: "meses" },
      { key: "juros", label: "Juros ao ano", type: "pct", def: "11", suffix: "% a.a." },
      { key: "seguro", label: "Seguro mensal (MIP/DFI)", type: "money", def: "80", prefix: "R$" },
      { key: "tarifa", label: "Taxa de administração mensal", type: "money", def: "25", prefix: "R$" },
    ],
  },
  {
    id: "entrada-amortizacao", label: "Entrada ou amortizar?", icon: "wallet",
    subtitle: "Compara usar o dinheiro na entrada com financiar tudo, deixar o valor rendendo e amortizar depois.",
    options: [
      { key: "sistema", label: "Sistema do financiamento", choices: [{ value: "price", label: "Price (parcela fixa)" }, { value: "sac", label: "SAC (parcela decrescente)" }], def: "price" },
      { key: "efeito", label: "Ao amortizar, você quer", choices: [{ value: "term", label: "Reduzir o prazo" }, { value: "payment", label: "Reduzir a parcela" }], def: "term" },
    ],
    fields: [
      { key: "bem", label: "Valor do bem", type: "money", def: "50000", prefix: "R$" },
      { key: "dinheiro", label: "Dinheiro disponível hoje", type: "money", def: "20000", prefix: "R$" },
      { key: "reserva", label: "Reserva que ficará intocada", type: "money", def: "0", prefix: "R$", hint: "O simulador não usa este valor nem na entrada nem na amortização." },
      { key: "parcelas", label: "Prazo do financiamento", type: "int", def: "48", suffix: "meses" },
      { key: "mesamort", label: "Amortizar depois de", type: "int", def: "12", suffix: "meses" },
      { key: "taxaentrada", label: "Taxa da proposta com entrada", type: "pct", def: "18", suffix: "% a.a." },
      { key: "taxatotal", label: "Taxa financiando tudo", type: "pct", def: "22", suffix: "% a.a.", hint: "Use as duas propostas reais: financiar 100% pode ter taxa maior ou nem ser oferecido." },
      { key: "rendimento", label: "Rendimento líquido do dinheiro", type: "pct", def: "10", suffix: "% a.a.", hint: "Já descontado de imposto e taxas até o mês da amortização." },
      { key: "seguro", label: "Seguro mensal", type: "money", def: "0", prefix: "R$" },
      { key: "tarifa", label: "Tarifa mensal", type: "money", def: "0", prefix: "R$" },
    ],
  },
  {
    id: "cartao", label: "Cartão de crédito", icon: "creditCard",
    subtitle: "Rotativo, parcelamento da fatura e a troca por um crédito mais barato, lado a lado.",
    fields: [
      { key: "divida", label: "Valor da fatura em aberto", type: "money", def: "5000", prefix: "R$" },
      { key: "juros", label: "Juros do rotativo", type: "pct", def: "14", suffix: "% a.m." },
      { key: "pagamento", label: "Quanto você paga por mês", type: "pct", def: "15", suffix: "% da fatura" },
      { key: "parcelas", label: "Se parcelar, em quantas vezes", type: "int", def: "12", suffix: "x" },
      { key: "jurosparc", label: "Juros do parcelamento", type: "pct", def: "7", suffix: "% a.m." },
      { key: "alternativa", label: "Juros de um crédito alternativo", type: "pct", def: "30", suffix: "% a.a.", hint: "Use uma proposta real de consignado, crédito com garantia ou empréstimo pessoal e compare pelo CET." },
    ],
  },
  {
    id: "consorcio", label: "Consórcio", icon: "briefcase",
    subtitle: "Não tem juros, tem taxa de administração. O simulador mostra o custo efetivo e compara com financiar.",
    fields: [
      { key: "credito", label: "Valor da carta de crédito", type: "money", def: "100000", prefix: "R$" },
      { key: "prazo", label: "Prazo", type: "int", def: "60", suffix: "meses" },
      { key: "admin", label: "Taxa de administração total", type: "pct", def: "18", suffix: "%" },
      { key: "reserva", label: "Fundo de reserva", type: "pct", def: "2", suffix: "%" },
      { key: "lance", label: "Lance que você pretende dar", type: "pct", def: "0", suffix: "% da carta" },
      { key: "contemplacao", label: "Mês estimado da contemplação", type: "int", def: "30", suffix: "º mês", hint: "Sem lance, a contemplação depende de sorteio. É esse tempo de espera que separa consórcio de financiamento." },
      { key: "reajuste", label: "Reajuste anual da carta", type: "pct", def: "0", suffix: "% a.a.", hint: "A carta é corrigida todo ano pelo índice do grupo (INCC em imóveis, preço do bem ou IPCA em veículos), e as parcelas sobem junto. Zero mostra o contrato sem correção." },
      { key: "jurosfin", label: "Juros do financiamento equivalente", type: "pct", def: "22", suffix: "% a.a." },
    ],
  },
  {
    id: "fgts", label: "FGTS", icon: "shieldCheck",
    subtitle: "Compara manter no FGTS com o saque-aniversário, considerando a remuneração anual e a perda de liquidez na demissão.",
    fields: [
      { key: "saldo", label: "Saldo atual do FGTS", type: "money", def: "20000", prefix: "R$" },
      { key: "salario", label: "Seu salário bruto", type: "money", def: "5000", prefix: "R$", hint: "O empregador deposita 8% do salário todo mês." },
      { key: "anos", label: "Horizonte", type: "int", def: "5", suffix: "anos" },
      { key: "rendimento", label: "Rendimento anual estimado do FGTS", type: "pct", def: "", suffix: "% a.a.", hint: "Inclua TR, 3% ao ano e a distribuição de resultados. Se ficar abaixo do IPCA informado, o simulador aplica o piso anual." },
      { key: "alternativa", label: "Rendimento líquido de onde você investiria", type: "pct", def: "", suffix: "% a.a." },
    ],
  },
  {
    id: "aposentadoria", label: "Aposentadoria", icon: "sun",
    subtitle: "Em valores de hoje: quanto você acumula, quanta renda isso sustenta e o aporte que falta.",
    fields: [
      { key: "idade", label: "Sua idade", type: "int", def: "30", suffix: "anos" },
      { key: "idadeapos", label: "Idade em que quer parar", type: "int", def: "60", suffix: "anos" },
      { key: "expectativa", label: "Planejar até os", type: "int", def: "90", suffix: "anos" },
      { key: "guardado", label: "Já acumulado hoje", type: "money", def: "50000", prefix: "R$" },
      { key: "aporte", label: "Aporte mensal", type: "money", def: "1000", prefix: "R$" },
      { key: "renda", label: "Renda mensal desejada", type: "money", def: "8000", prefix: "R$", hint: "No poder de compra de hoje. Toda a projeção usa taxa real, descontada a inflação." },
      { key: "taxa", label: "Rendimento nominal esperado", type: "pct", def: "11", suffix: "% a.a." },
    ],
  },
];

function simSpecOf(id) { return SIM_CATALOG.find((s) => s.id === id) || SIM_CATALOG[0]; }

// O campo "taxa" da renda fixa muda de significado com o produto. Cada entrada
// diz como a taxa é anunciada no mercado para aquele papel e um padrão
// plausível; `null` em `taxa` esconde o campo (poupança tem regra, não taxa).
const RENDAFIXA_RATE_BY_PRODUCT = {
  cdi: { label: "Percentual do CDI", suffix: "% do CDI", def: "110", hint: "CDB e RDB são anunciados como percentual do CDI: 110 quer dizer 110% do CDI.", custodia: "0" },
  lci: { label: "Percentual do CDI", suffix: "% do CDI", def: "90", hint: "LCI e LCA pagam menos % do CDI porque são isentas de IR; o simulador mostra abaixo o CDB que empataria.", custodia: "0" },
  selic: { label: "Ágio ou deságio sobre a Selic", suffix: "% a.a.", def: "0,05", hint: "Tesouro Selic rende Selic + uma pequena taxa fixa, em geral entre 0 e 0,2 ponto ao ano. Use a da oferta do dia.", custodia: "0,2" },
  ipca: { label: "Juro real contratado (IPCA +)", suffix: "% a.a.", def: "6", hint: "Tesouro IPCA+ 6 rende IPCA mais 6% ao ano, compostos. O IPCA vem das premissas de mercado abaixo.", custodia: "0,2" },
  pre: { label: "Taxa prefixada", suffix: "% a.a.", def: "13", hint: "A taxa fixa anunciada, ao ano. Vale até o vencimento independentemente do que a Selic fizer.", custodia: "0" },
  poupanca: { label: null, custodia: "0" },
};

// A declaração do campo já ajustada ao contexto atual do simulador. Para a
// renda fixa, o produto escolhido troca rótulo, unidade, dica e padrão da
// taxa e da custódia; devolve `null` quando o campo não existe no produto.
function simFieldSpec(simId, field) {
  if (!field || !field.dynamic || simId !== "rendafixa") return field;
  const produto = RENDAFIXA_RATE_BY_PRODUCT[simRaw("rendafixa", "produto")] || RENDAFIXA_RATE_BY_PRODUCT.cdi;
  if (field.key === "taxa") {
    if (!produto.label) return null;
    return { ...field, label: produto.label, suffix: produto.suffix, def: produto.def, hint: produto.hint };
  }
  if (field.key === "custodia") {
    const tesouro = produto.custodia !== "0";
    return {
      ...field, def: produto.custodia,
      hint: tesouro
        ? "A B3 cobra 0,20% ao ano de custódia no Tesouro Direto (o Tesouro Selic é isento até R$ 10 mil). Corretoras podem cobrar taxa própria."
        : field.hint,
    };
  }
  return field;
}

// Valor de um campo: rascunho do usuário ou o padrão declarado.

function simFieldDefault(simId, field) {
  if (simId === "fgts" && field && field.key === "rendimento") {
    const rates = marketRatesOf(state.data);
    return String(Math.max(Number(rates.ipca) || 0, 3 + (Number(rates.tr) || 0))).replace(".", ",");
  }
  if (simId === "fgts" && field && field.key === "alternativa") {
    const rates = marketRatesOf(state.data);
    return String(Math.round((Number(rates.cdi) || 0) * 90) / 100).replace(".", ",");
  }
  return field ? field.def : "";
}

function simRaw(simId, key) {
  const stored = state.sim.values[`${simId}.${key}`];
  if (stored != null) return stored;
  const spec = simSpecOf(simId);
  const field = (spec.fields || []).find((f) => f.key === key);
  const option = (spec.options || []).find((o) => o.key === key);
  if (field && field.dynamic) {
    const ajustado = simFieldSpec(simId, field);
    return ajustado ? String(simFieldDefault(simId, ajustado)) : "0";
  }
  return field ? String(simFieldDefault(simId, field)) : (option ? String(option.def) : "");
}

function simMoney(simId, key) { return Math.max(0, moneyOrZero(simRaw(simId, key))); }

function simInt(simId, key, min, max) {
  const n = parseInt(String(simRaw(simId, key)).replace(/[^0-9]/g, ""), 10);
  return clamp(Number.isFinite(n) ? n : 0, min == null ? 0 : min, max == null ? 999999 : max);
}

function renderSimulatorsScreen() {
  const id = state.sim.id;
  const spec = simSpecOf(id);

  return `<div class="screen">
    <div class="screen-header">
      <div class="back-header">
        <button class="icon-btn" data-action="nav" data-tab="invest" aria-label="Voltar para investimentos">${svgIcon("chevronLeft", 19)}</button>
        <div>
          <p class="eyebrow">Central de investimentos</p>
          <h1 class="page-title">Simuladores</h1>
        </div>
      </div>
    </div>

    <div class="sim-picker">
      ${SIM_CATALOG.map((s) => `<button class="sim-chip ${s.id === id ? "active" : ""}" data-action="sim-select" data-value="${s.id}">
        ${svgIcon(s.icon, 15)}<span>${escapeHtml(s.label)}</span>
      </button>`).join("")}
    </div>

    <div class="sim-transparency"><p class="card-subtitle sim-subtitle">${escapeHtml(spec.subtitle)}</p>${renderCalculationButton("simulator")}</div>

    ${id === "juros" ? `<div class="grid-2">${renderCompoundSimCards()}</div>${renderWhatIfCard()}` : `
      <div class="grid-2">
        <div class="card">
          <p class="card-title">Premissas</p>
          ${(spec.options || []).map((o) => renderSimOption(id, o)).join("")}
          ${(spec.fields || []).map((f) => simFieldSpec(id, f)).filter(Boolean).map((f) => renderSimField(id, f)).join("")}
          ${renderSimRatesNote()}
        </div>
        ${renderSimResult(id)}
      </div>
    `}
    ${renderFinancialNotice(id)}
  </div>`;
}

function renderSimOption(simId, o) {
  const current = simRaw(simId, o.key);
  return `<div class="field">
    <p class="field__label">${escapeHtml(o.label)}</p>
    <div class="sim-options">
      ${o.choices.map((c) => `<button class="payment-chip ${current === c.value ? "active" : ""}" data-action="sim-set" data-id="${simId}.${o.key}" data-value="${c.value}">${escapeHtml(c.label)}</button>`).join("")}
    </div>
  </div>`;
}

function renderSimField(simId, f) {
  const inputId = `sim-${simId}-${f.key}-input`;
  return `<div class="field">
    <label class="field__label" for="${inputId}">${escapeHtml(f.label)}</label>
    <div class="sim-input">
      ${f.prefix ? `<span class="sim-input__affix">${escapeHtml(f.prefix)}</span>` : ""}
      <input id="${inputId}" class="input" data-field="sim-field" data-id="${simId}.${f.key}"
        value="${escapeHtml(simRaw(simId, f.key))}" inputmode="${f.type === "int" ? "numeric" : "decimal"}"
        placeholder="${escapeHtml(String(simFieldDefault(simId, f)))}" autocomplete="off" />
      ${f.suffix ? `<span class="sim-input__affix">${escapeHtml(f.suffix)}</span>` : ""}
    </div>
    ${f.hint ? `<p class="field-hint">${escapeHtml(f.hint)}</p>` : ""}
  </div>`;
}

// De onde vêm CDI, Selic e IPCA: premissas do usuário, com a data da revisão.
// Um simulador que esconde a premissa está vendendo o resultado.
function renderSimRatesNote() {
  const r = marketRatesOf(state.data);
  return `<div class="sim-rates">
    <span>${r.updatedAt ? "Premissas" : "Exemplos não revisados"}: CDI ${fmtNum(r.cdi)}% · Selic ${fmtNum(r.selic)}% · IPCA ${fmtNum(r.ipca)}% · Poupança ${fmtNum(r.poupanca)}%</span>
    <button class="link-btn" data-action="nav" data-tab="settings">${r.updatedAt ? `Revisadas em ${fmtDateFull(r.updatedAt)} · editar` : "Revisar antes de decidir"}</button>
  </div>`;
}

function simStat(label, value, opts) {
  const o = opts || {};
  return `<div class="invest-stat ${o.highlight ? "invest-stat--total" : ""} ${o.interest ? "invest-stat--interest" : ""}">
    <span>${escapeHtml(label)}</span>
    <b${o.color ? ` data-ui-css="color:${o.color}"` : ""}>${value}</b>
  </div>`;
}

function renderSimResult(id) {
  switch (id) {
    case "rendafixa": return renderSimFixedIncome();
    case "emprestimo": return renderSimLoan();
    case "financiamento": return renderSimFinancing();
    case "entrada-amortizacao": return renderSimDownPaymentComparison();
    case "cartao": return renderSimCard();
    case "consorcio": return renderSimConsortium();
    case "fgts": return renderSimFgts();
    case "aposentadoria": return renderSimRetirement();
    default: return "";
  }
}

/* ---------------------------------------------------------- renda fixa */
function renderSimFixedIncome() {
  const rates = marketRatesOf(state.data);
  const produto = simRaw("rendafixa", "produto");
  const map = {
    cdi: { indexer: "cdi", exempt: false },
    selic: { indexer: "selic", exempt: false },
    ipca: { indexer: "ipca", exempt: false },
    pre: { indexer: "pre", exempt: false },
    lci: { indexer: "cdi", exempt: true },
    poupanca: { indexer: "poupanca", exempt: true },
  };
  const cfg = map[produto] || map.cdi;
  const meses = simInt("rendafixa", "meses", 1, 600);
  const taxaInformada = moneyOrZero(simRaw("rendafixa", "taxa"));
  const base = {
    principal: simMoney("rendafixa", "principal"),
    monthlyContribution: simMoney("rendafixa", "aporte"),
    months: meses,
    feeAnnualPct: moneyOrZero(simRaw("rendafixa", "custodia")),
    rates,
  };
  if (!(base.principal > 0) && !(base.monthlyContribution > 0)) {
    return `<div class="card">${renderEmptyState("piggy", "Informe um valor inicial ou um aporte mensal para ver o resultado líquido.")}</div>`;
  }

  const r = simFixedIncome({ ...base, indexer: cfg.indexer, ratePct: taxaInformada, taxExempt: cfg.exempt });

  // Referência de comparação: a mesma aplicação na poupança, no mesmo prazo.
  const poup = simFixedIncome({ ...base, feeAnnualPct: 0, indexer: "poupanca", taxExempt: true });
  const ganhoVsPoupanca = subMoney(r.netFinal, poup.netFinal);

  // A pergunta que decide entre produtos ("CDB de 110% ou LCI de 90%?") não
  // se responde pela taxa anunciada, porque o IR depende do prazo. A
  // equivalência leva os dois ao líquido no mesmo fluxo (ver
  // fixedIncomeEquivalentRate em simulators.js).
  const semCustodia = { ...base, feeAnnualPct: 0 };
  let equivalencia = "";
  if (produto === "poupanca") {
    const regra = Number(rates.selic) > 8.5
      ? `0,5% ao mês mais TR, porque a Selic (${fmtNum(rates.selic)}% a.a.) está acima de 8,5%`
      : `70% da Selic mais TR, porque a Selic (${fmtNum(rates.selic)}% a.a.) está em 8,5% ou menos`;
    equivalencia = `A poupança não tem taxa contratada: rende ${regra}. Com as premissas atuais isso dá <b>${fmtNum(rates.poupanca)}% ao ano</b>, isento de IR.`;
  } else if (cfg.exempt) {
    const cdb = fixedIncomeEquivalentRate(semCustodia, { indexer: "cdi", taxExempt: false, netFinal: r.netFinal });
    if (cdb != null) equivalencia = `Para entregar o mesmo líquido em ${meses} ${meses === 1 ? "mês" : "meses"}, um CDB tributado precisaria pagar <b>${fmtNum(cdb)}% do CDI</b>. Abaixo disso, a isenta ganha.`;
  } else {
    const lci = fixedIncomeEquivalentRate(semCustodia, { indexer: "cdi", taxExempt: true, netFinal: r.netFinal });
    if (lci != null) equivalencia = `Uma LCI ou LCA isenta de <b>${fmtNum(lci)}% do CDI</b> entregaria o mesmo líquido em ${meses} ${meses === 1 ? "mês" : "meses"}. Acima disso, a isenta ganha; abaixo, este produto ganha.`;
  }

  const taxaBrutaDetalhe = cfg.indexer === "cdi"
    ? ` (${fmtNum(taxaInformada)}% de um CDI a ${fmtNum(rates.cdi)}%)`
    : cfg.indexer === "selic" ? ` (Selic ${fmtNum(rates.selic)}% + ${fmtNum(taxaInformada)})`
      : cfg.indexer === "ipca" ? ` (IPCA ${fmtNum(rates.ipca)}% + ${fmtNum(taxaInformada)}, compostos)` : "";

  return `<div class="card">
    <p class="card-title">Resultado líquido</p>
    <div class="invest-stats">
      ${simStat("Você resgataria", fmtBRL(r.netFinal), { highlight: true })}
      ${simStat("Do próprio bolso (aportes)", fmtBRL(r.contributed))}
      ${simStat("Rendimento líquido", fmtBRL(r.netEarnings), { interest: true })}
    </div>

    <div class="sim-breakdown">
      <div class="sim-breakdown__row"><span>Valor bruto no vencimento</span><b>${fmtBRL(r.grossFinal)}</b></div>
      <div class="sim-breakdown__row"><span>Rendimento bruto</span><b>${fmtBRL(r.grossEarnings)}</b></div>
      <div class="sim-breakdown__row"><span>Imposto de renda</span><b data-ui-css="color:var(--negative)">${r.exempt ? "isento" : `− ${fmtBRL(r.tax)}`}</b></div>
      ${r.iof > 0 ? `<div class="sim-breakdown__row"><span>IOF (resgate antes de 30 dias)</span><b data-ui-css="color:var(--negative)">− ${fmtBRL(r.iof)}</b></div>` : ""}
      ${r.feeAnnual > 0 ? `<div class="sim-breakdown__row"><span>Custódia ou administração</span><b data-ui-css="color:var(--negative)">${fmtNum(r.feeAnnual)}% a.a., já descontada</b></div>` : ""}
      <div class="sim-breakdown__row"><span>Taxa bruta</span><b>${fmtNum(r.grossAnnual)}% a.a.${taxaBrutaDetalhe}</b></div>
      <div class="sim-breakdown__row sim-breakdown__row--total"><span>Rentabilidade líquida</span><b>${r.netAnnualPct != null ? `${fmtNum(r.netAnnualPct)}% a.a.` : "Sem dados"}</b></div>
      <div class="sim-breakdown__row"><span>Acima da inflação (ganho real)</span><b data-ui-css="color:${r.losesToInflation ? "var(--negative)" : "var(--positive)"}">${r.realAnnualPct != null ? `${fmtNum(r.realAnnualPct)}% a.a.` : "Sem dados"}</b></div>
      ${produto !== "poupanca" ? `<div class="sim-breakdown__row"><span>Na poupança, no mesmo prazo</span><b>${fmtBRL(poup.netFinal)}</b></div>` : ""}
    </div>

    ${r.losesToInflation ? `<p class="ai-error">${svgIcon("alertTriangle", 14)} Nessa taxa o dinheiro rende menos que a inflação: você termina com mais reais e menos poder de compra.</p>` : ""}

    <p class="health-note">${r.exempt
      ? `Produto isento de IR nesta estimativa.`
      : `O IR foi calculado <b>lote a lote</b>: cada aporte tem o próprio prazo e a própria alíquota. A alíquota efetiva ficou em <b>${fmtNum(r.effectiveAliquot)}%</b> sobre o rendimento${r.lots.length > 1 ? `, entre ${fmtNum(Math.min(...r.lots.map((l) => l.aliquot)))}% do aporte mais antigo e ${fmtNum(Math.max(...r.lots.map((l) => l.aliquot)))}% do mais recente` : ""}.`}
    ${ganhoVsPoupanca > 0 && produto !== "poupanca" ? ` Contra a poupança no mesmo prazo, a diferença é de <b data-ui-css="color:var(--positive)">${fmtBRL(ganhoVsPoupanca)}</b>.` : ""}
    ${ganhoVsPoupanca < 0 && produto !== "poupanca" ? ` <b data-ui-css="color:var(--negative)">A poupança renderia ${fmtBRL(Math.abs(ganhoVsPoupanca))} a mais</b> neste prazo.` : ""}</p>
    ${equivalencia ? `<p class="health-note">${equivalencia}</p>` : ""}
    <p class="footnote">Resgate no vencimento, em ${fmtDateFull(r.redeemDate)}. Resgatar antes muda a alíquota do IR e, em título prefixado ou IPCA+, o preço de mercado do papel.</p>
  </div>`;
}

/* --------------------------------------------------------- empréstimo */
function renderSimLoan() {
  const mensal = moneyOrZero(simRaw("emprestimo", "juros"));
  const valor = simMoney("emprestimo", "valor");
  if (!(valor > 0)) {
    return `<div class="card">${renderEmptyState("creditCard", "Informe o valor emprestado para ver parcela, juros e CET.")}</div>`;
  }
  const r = simLoan({
    principal: valor,
    months: simInt("emprestimo", "parcelas", 1, 480),
    annualRatePct: monthlyToAnnual(mensal / 100),
    system: simRaw("emprestimo", "sistema"),
    monthlyFee: simMoney("emprestimo", "tarifa"),
    monthlyInsurance: simMoney("emprestimo", "seguro"),
    upfrontFee: simMoney("emprestimo", "iof"),
  });
  const sobra = estimateAvgMonthlySaving(state.data);
  const comprometimento = sobra > 0 ? safePct(r.firstPayment, sobra) : null;
  const custoTotal = addMoney(r.totalInterest, addMoney(r.totalExtras, r.upfrontFee));

  return `<div class="card">
    <p class="card-title">Custo do empréstimo</p>
    <div class="invest-stats">
      ${simStat(r.system === "sac" ? "Primeira parcela" : "Parcela mensal", fmtBRL(r.firstPayment), { highlight: true })}
      ${simStat("Total pago", fmtBRL(r.totalPaid))}
      ${simStat("Custo além do valor emprestado", fmtBRL(custoTotal), { color: "var(--negative)" })}
    </div>

    <div class="sim-breakdown">
      ${r.system === "sac" ? `<div class="sim-breakdown__row"><span>Última parcela</span><b>${fmtBRL(r.lastPayment)}</b></div>` : ""}
      <div class="sim-breakdown__row"><span>Só de juros</span><b data-ui-css="color:var(--negative)">${fmtBRL(r.totalInterest)} (${fmtNum(r.interestOverPrincipalPct)}% do emprestado)</b></div>
      ${r.totalExtras > 0 ? `<div class="sim-breakdown__row"><span>Tarifas e seguros no período</span><b data-ui-css="color:var(--negative)">${fmtBRL(r.totalExtras)}</b></div>` : ""}
      ${r.upfrontFee > 0 ? `<div class="sim-breakdown__row"><span>Cobrado na contratação</span><b data-ui-css="color:var(--negative)">${fmtBRL(r.upfrontFee)}</b></div>` : ""}
      <div class="sim-breakdown__row"><span>Taxa anunciada</span><b>${fmtNum(mensal)}% a.m. (${fmtNum(r.annualRatePct)}% a.a.)</b></div>
      <div class="sim-breakdown__row sim-breakdown__row--total"><span>Custo Efetivo Total (CET)</span><b>${r.cetAnnualPct != null ? `${fmtNum(r.cetMonthlyPct)}% a.m. · ${fmtNum(r.cetAnnualPct)}% a.a.` : "Não calculável com estes números"}</b></div>
    </div>

    ${r.cetAnnualPct != null && r.cetAnnualPct > r.annualRatePct + 0.5 ? `<p class="health-note">A taxa anunciada é <b>${fmtNum(r.annualRatePct)}% ao ano</b>, mas com tarifa, seguro e custos de contratação o dinheiro custa <b data-ui-css="color:var(--negative)">${fmtNum(r.cetAnnualPct)}% ao ano</b>. É este número, o CET, que a proposta oficial precisa mostrar; compare por ele.</p>` : ""}
    ${comprometimento != null ? `<p class="health-note">A parcela consome <b>${fmtNum(comprometimento)}%</b> da sua sobra média mensal (${fmtBRL(sobra)}).${comprometimento > 100 ? " <b data-ui-css=\"color:var(--negative)\">Isso não cabe no seu orçamento atual.</b>" : comprometimento > 50 ? " Metade ou mais da sobra presa numa parcela deixa pouca margem para imprevistos." : ""}</p>` : `<p class="health-note">Com três meses de lançamentos o app passa a dizer quanto desta parcela cabe na sua sobra média.</p>`}
  </div>`;
}

/* ------------------------------------------------------ financiamento */
function renderSimFinancing() {
  const bem = simMoney("financiamento", "bem");
  if (!(bem > 0)) {
    return `<div class="card">${renderEmptyState("home", "Informe o valor do bem para ver parcelas, juros e o custo total.")}</div>`;
  }
  const r = simLoan({
    assetValue: bem,
    downPayment: simMoney("financiamento", "entrada"),
    months: simInt("financiamento", "parcelas", 1, 480),
    annualRatePct: moneyOrZero(simRaw("financiamento", "juros")),
    system: simRaw("financiamento", "sistema"),
    monthlyInsurance: simMoney("financiamento", "seguro"),
    monthlyFee: simMoney("financiamento", "tarifa"),
  });

  if (r.nothingToFinance) {
    return `<div class="card">
      <p class="card-title">Não há o que financiar</p>
      <p class="health-note">A entrada de <b>${fmtBRL(r.down)}</b> cobre o valor do bem (${fmtBRL(bem)}). Reduza a entrada para ver o custo de financiar a diferença, ou use o simulador "Entrada ou amortizar?" para decidir quanto dinheiro vale a pena imobilizar.</p>
    </div>`;
  }

  const sobra = estimateAvgMonthlySaving(state.data);
  const comprometimento = sobra > 0 ? safePct(r.firstPayment, sobra) : null;

  return `<div class="card">
    <p class="card-title">Custo do financiamento</p>
    <div class="invest-stats">
      ${simStat("Primeira parcela", fmtBRL(r.firstPayment), { highlight: true })}
      ${simStat("Última parcela", fmtBRL(r.lastPayment))}
      ${simStat("Custo total do bem", fmtBRL(r.totalCost), { color: "var(--negative)" })}
    </div>

    <div class="sim-breakdown">
      <div class="sim-breakdown__row"><span>Valor financiado</span><b>${fmtBRL(r.principal)}</b></div>
      <div class="sim-breakdown__row"><span>Juros pagos no total</span><b data-ui-css="color:var(--negative)">${fmtBRL(r.totalInterest)}</b></div>
      <div class="sim-breakdown__row"><span>Seguros e tarifas no total</span><b data-ui-css="color:var(--negative)">${fmtBRL(r.totalExtras)}</b></div>
      <div class="sim-breakdown__row"><span>Taxa de juros</span><b>${fmtNum(r.annualRatePct)}% a.a. (${fmtNum(r.monthlyRate * 100)}% a.m.)</b></div>
      <div class="sim-breakdown__row sim-breakdown__row--total"><span>CET</span><b>${r.cetAnnualPct != null ? `${fmtNum(r.cetAnnualPct)}% a.a.` : "Não calculável com estes números"}</b></div>
      ${r.surchargePct != null ? `<div class="sim-breakdown__row"><span>Acima do preço à vista</span><b data-ui-css="color:var(--negative)">+${fmtNum(r.surchargePct)}%</b></div>` : ""}
    </div>

    <p class="health-note">Um bem de <b>${fmtBRL(bem)}</b> sai por <b>${fmtBRL(r.totalCost)}</b> ao fim do contrato${r.surchargePct != null ? `, <b data-ui-css="color:var(--negative)">${fmtNum(r.surchargePct)}% a mais</b>` : ""}. No sistema <b>${r.system === "sac" ? "SAC" : "Price"}</b>, ${r.system === "sac" ? "a parcela começa maior e cai todo mês, e o total de juros é menor" : "a parcela é fixa do começo ao fim, o que facilita o planejamento mas paga mais juros"}.</p>
    ${comprometimento != null ? `<p class="health-note">A primeira parcela consome <b>${fmtNum(comprometimento)}%</b> da sua sobra média mensal (${fmtBRL(sobra)}).${comprometimento > 100 ? " <b data-ui-css=\"color:var(--negative)\">Isso não cabe no seu orçamento atual.</b>" : ""}</p>` : ""}
    <p class="footnote">Se você usar 30% da renda bruta como limite pessoal de planejamento, uma primeira parcela de ${fmtBRL(r.firstPayment)} exigiria renda de ${fmtBRL(r.firstPayment / 0.3)}. A política de aprovação varia por instituição. Em financiamento imobiliário o saldo devedor costuma ser corrigido pela TR, e MIP e DFI variam com a idade e o saldo; a simulação usa seguro fixo e não aplica correção.</p>
  </div>`;
}

/* --------------------------------------------- entrada ou amortização futura */
function renderSimDownPaymentComparison() {
  const r = simDownPaymentVsPrepayment({
    assetValue: simMoney("entrada-amortizacao", "bem"),
    cashAvailable: simMoney("entrada-amortizacao", "dinheiro"),
    reserveToKeep: simMoney("entrada-amortizacao", "reserva"),
    months: simInt("entrada-amortizacao", "parcelas", 1, 480),
    prepaymentMonth: simInt("entrada-amortizacao", "mesamort", 1, 480),
    entryAnnualRatePct: moneyOrZero(simRaw("entrada-amortizacao", "taxaentrada")),
    fullAnnualRatePct: moneyOrZero(simRaw("entrada-amortizacao", "taxatotal")),
    investmentAnnualPct: moneyOrZero(simRaw("entrada-amortizacao", "rendimento")),
    system: simRaw("entrada-amortizacao", "sistema"),
    prepaymentMode: simRaw("entrada-amortizacao", "efeito"),
    monthlyInsurance: simMoney("entrada-amortizacao", "seguro"),
    monthlyFee: simMoney("entrada-amortizacao", "tarifa"),
  });

  if (!(r.assetValue > 0)) {
    return `<div class="card">${renderEmptyState("wallet", "Informe o valor do bem para comparar os dois caminhos.")}</div>`;
  }

  const entryWins = r.winner === "entry" || r.winner === "tie";
  const laterWins = r.winner === "later";
  const entryLoan = r.entry.loan;
  const entryOfferLoan = r.entry.offerLoan;
  const laterLoan = r.later.loan;
  const monthlySaving = estimateAvgMonthlySaving(state.data);
  const laterDoesNotFit = monthlySaving > 0 && moneyCompare(laterLoan.firstPayment, monthlySaving) > 0;
  const effectLabel = r.prepaymentMode === "term" ? "reduzir o prazo" : "reduzir as parcelas restantes";
  const verdict = r.noEntryAvailable
    ? "Não há dinheiro livre para comparar com uma entrada"
    : r.winner === "entry"
      ? `Menor custo estimado com ${fmtBRL(r.usableCash)} de entrada`
      : r.winner === "later"
        ? `Menor custo estimado amortizando no ${r.prepaymentMonth}º mês`
        : "Os dois caminhos empatam no dinheiro";
  const verdictDetail = r.noEntryAvailable
    ? `A reserva informada consome todo o dinheiro disponível. Reduza a reserva apenas se esse valor realmente puder ser usado.`
    : r.winner === "tie"
      ? `Como o custo estimado ficou igual, a entrada começa com menos dívida e depende de menos premissas futuras.`
      : `${entryWins ? "Dar entrada" : "Esperar para amortizar"} economiza ${fmtBRL(r.savings)} no custo total estimado.`;

  return `<div class="card">
    <p class="card-title">Entrada agora × amortização depois</p>

    <div class="invest-stats">
      ${simStat(verdict, fmtBRL(r.savings), { highlight: true })}
      ${simStat("Dinheiro usado na comparação", fmtBRL(r.usableCash))}
      ${simStat("Reserva preservada", fmtBRL(r.reserve))}
    </div>
    <p class="health-note">${verdictDetail}</p>

    <div class="sim-scenarios">
      <div class="sim-scenario ${entryWins && !r.noEntryAvailable ? "sim-scenario--best" : ""}">
        <div class="sim-scenario__head">
          <b>Dar entrada agora</b>
          ${entryWins && !r.noEntryAvailable ? `<span class="status-badge" data-ui-css="background:var(--positive-soft); color:var(--positive)">${r.winner === "tie" ? "mais simples" : "menor custo"}</span>` : ""}
        </div>
        <p class="sim-scenario__total">${fmtBRL(r.entry.economicCost)}</p>
        <span class="sim-scenario__detail">A proposta em ${r.months} meses começa em ${fmtBRL(entryOfferLoan.firstPayment)}. Para comparar com o mesmo esforço mensal da opção sem entrada, o cálculo mantém até ${fmtBRL(entryLoan.firstPayment)} e quita no ${entryLoan.payoffMonth}º mês.</span>
      </div>

      <div class="sim-scenario ${laterWins ? "sim-scenario--best" : ""}">
        <div class="sim-scenario__head">
          <b>Financiar tudo e amortizar</b>
          ${laterWins ? `<span class="status-badge" data-ui-css="background:var(--positive-soft); color:var(--positive)">menor custo</span>` : ""}
        </div>
        <p class="sim-scenario__total">${fmtBRL(r.later.economicCost)}</p>
        <span class="sim-scenario__detail">Custo econômico em valores de hoje. Financiamento de ${fmtBRL(laterLoan.principal)}, primeira parcela de ${fmtBRL(laterLoan.firstPayment)} e amortização de ${fmtBRL(laterLoan.prepaymentApplied)} no ${r.prepaymentMonth}º mês para ${effectLabel}. Quitação no ${laterLoan.payoffMonth}º mês.</span>
      </div>
    </div>

    <div class="sim-breakdown">
      <div class="sim-breakdown__row"><span>Dinheiro no mês da amortização</span><b>${fmtBRL(r.later.fundAtPrepayment)}</b></div>
      <div class="sim-breakdown__row"><span>Rendimento líquido acumulado</span><b data-ui-css="color:var(--positive)">+ ${fmtBRL(r.later.investmentGain)}</b></div>
      <div class="sim-breakdown__row"><span>Saldo antes da amortização</span><b>${fmtBRL(laterLoan.balanceBeforePrepayment)}</b></div>
      <div class="sim-breakdown__row"><span>Saldo depois da amortização</span><b>${fmtBRL(laterLoan.balanceAfterPrepayment)}</b></div>
      ${laterLoan.paymentAfterPrepayment > 0 ? `<div class="sim-breakdown__row"><span>Parcela depois da amortização</span><b>${fmtBRL(laterLoan.paymentAfterPrepayment)}</b></div>` : ""}
      <div class="sim-breakdown__row"><span>Desembolso nominal dando entrada e mantendo o esforço</span><b>${fmtBRL(addMoney(r.entry.downPayment, entryLoan.totalRegularPaid))}</b></div>
      <div class="sim-breakdown__row"><span>Total nominal recebido pelo banco na espera</span><b>${fmtBRL(laterLoan.totalToLender)}</b></div>
      <div class="sim-breakdown__row"><span>Juros dando entrada</span><b>${fmtBRL(entryLoan.totalInterest)}</b></div>
      <div class="sim-breakdown__row"><span>Juros amortizando depois</span><b>${fmtBRL(laterLoan.totalInterest)}</b></div>
      <div class="sim-breakdown__row"><span>Parcela inicial a mais sem entrada</span><b data-ui-css="color:${r.firstPaymentDifference > 0 ? "var(--negative)" : "var(--positive)"}">${r.firstPaymentDifference > 0 ? "+ " : ""}${fmtBRL(r.firstPaymentDifference)}</b></div>
      <div class="sim-breakdown__row sim-breakdown__row--total"><span>Rendimento líquido para esperar empatar</span><b>${r.breakEvenAnnualPct == null ? "Não alcançado" : `${fmtNum(r.breakEvenAnnualPct)}% a.a.`}</b></div>
    </div>

    ${r.breakEvenAnnualPct != null ? `<p class="health-note">Com estas duas propostas, esperar só ganha no custo se o dinheiro render pelo menos <b>${fmtNum(r.breakEvenAnnualPct)}% líquidos ao ano</b>. Você informou ${fmtNum(r.investmentAnnualPct)}%.</p>` : ""}
    ${r.reserveMissing ? `<p class="ai-error">${svgIcon("alertTriangle", 14)} A simulação usa todo o dinheiro disponível e deixa a reserva em zero. Uma opção matematicamente mais barata pode ser financeiramente ruim se qualquer imprevisto levar você a outra dívida.</p>` : ""}
    ${laterDoesNotFit ? `<p class="ai-error">${svgIcon("alertTriangle", 14)} A primeira parcela sem entrada, ${fmtBRL(laterLoan.firstPayment)}, supera sua sobra média mensal de ${fmtBRL(monthlySaving)}. Mesmo que o custo final pareça bom, esse fluxo não cabe no histórico atual.</p>` : ""}

    <p class="footnote">Use as taxas e os custos das duas propostas reais. Financiar 100% pode não ser aprovado ou ter uma taxa diferente. A amortização antecipada reduz juros futuros, mas o banco deve fornecer a planilha do contrato com o saldo e os descontos aplicados.</p>
  </div>`;
}

/* -------------------------------------------------------------- cartão */
function renderSimCard() {
  const divida = simMoney("cartao", "divida");
  if (!(divida > 0)) {
    return `<div class="card">${renderEmptyState("creditCard", "Informe o valor da fatura em aberto para comparar as saídas.")}</div>`;
  }
  const pagaPct = moneyOrZero(simRaw("cartao", "pagamento"));
  const jurosParcRaw = String(simRaw("cartao", "jurosparc")).trim();
  const r = simCreditCard({
    debt: divida,
    monthlyRatePct: moneyOrZero(simRaw("cartao", "juros")),
    minPaymentPct: pagaPct,
    installments: simInt("cartao", "parcelas", 1, 48),
    // Campo vazio não é "0% ao mês": é "não sei", e aí entra a premissa
    // documentada do motor.
    installmentRatePct: jurosParcRaw === "" ? undefined : moneyOrZero(jurosParcRaw),
    alternativeAnnualPct: moneyOrZero(simRaw("cartao", "alternativa")),
  });

  const detalhe = {
    cartao: `No vencimento você paga ${fmtNum(pagaPct)}% (${fmtBRL(r.rotativo.minPayment)}). Os ${fmtBRL(r.rotativo.financedBalance)} restantes ficam um ciclo no rotativo a ${fmtNum(r.monthlyRatePct)}% a.m. (${fmtBRL(r.rotativo.cycleInterest)} de juros) e, pela regra, viram parcelamento obrigatório: ${r.parcelamento.installments}x de ${fmtBRL(r.parcelamento.payment)} a ${fmtNum(r.parcelamento.monthlyRatePct)}% a.m.`,
    alternativa: `${r.alternativa.installments}x de ${fmtBRL(r.alternativa.payment)} a ${fmtNum(r.alternativa.annualRatePct)}% a.a., usando o crédito novo para quitar a fatura inteira no vencimento.`,
  };
  const cartao = r.ranking.find((o) => o.id === "cartao");
  const alternativa = r.ranking.find((o) => o.id === "alternativa");
  const diferenca = subMoney(cartao.total, alternativa.total);

  return `<div class="card">
    <p class="card-title">Ficar no cartão ou trocar a dívida?</p>
    <div class="sim-scenarios">
      ${r.ranking.map((opt, idx) => `<div class="sim-scenario ${idx === 0 ? "sim-scenario--best" : ""}">
          <div class="sim-scenario__head">
            <b>${escapeHtml(opt.label)}</b>
            ${idx === 0 ? `<span class="status-badge" data-ui-css="background:var(--positive-soft); color:var(--positive-ink)">menor custo estimado</span>` : ""}
          </div>
          <p class="sim-scenario__total">${fmtBRL(opt.total)}</p>
          <span class="sim-scenario__detail">${detalhe[opt.id] || ""}</span>
        </div>`).join("")}
    </div>

    <div class="sim-breakdown">
      <div class="sim-breakdown__row"><span>Fatura em aberto (quitar no vencimento)</span><b>${fmtBRL(r.payInFull.total)}</b></div>
      <div class="sim-breakdown__row"><span>Juros do rotativo ao ano (equivalente)</span><b data-ui-css="color:var(--negative)">${fmtNum(r.annualEquivalentPct)}%</b></div>
      <div class="sim-breakdown__row"><span>Encargos ficando no cartão</span><b data-ui-css="color:var(--negative)">${fmtBRL(r.cartaoTotalCharges)}</b></div>
      <div class="sim-breakdown__row"><span>Encargos no crédito alternativo</span><b data-ui-css="color:var(--negative)">${fmtBRL(r.alternativa.totalCharges)}</b></div>
      <div class="sim-breakdown__row sim-breakdown__row--total"><span>${diferenca >= 0 ? "Economia trocando a dívida" : "Trocar sairia mais caro em"}</span><b data-ui-css="color:${diferenca >= 0 ? "var(--positive-ink)" : "var(--negative)"}">${fmtBRL(Math.abs(diferenca))}</b></div>
    </div>

    ${r.legal.chargeCapReached ? `<p class="health-note">Os encargos pararam de crescer porque a lei limita juros e encargos do rotativo e do parcelamento da fatura a <b>100% do valor original da dívida</b> (Lei 14.690/2023). Sem esse teto, a projeção seria pior.</p>` : ""}
    ${r.parcelamento.rateSource === "premissa" ? `<p class="inline-alert">${svgIcon("info", 14)} Você não informou a taxa do parcelamento; usei ${fmtNum(r.parcelamento.monthlyRatePct)}% a.m., ordem de grandeza das taxas médias de cartão parcelado publicadas pelo Banco Central. Troque pela taxa da sua fatura.</p>` : ""}
    <p class="health-note">${fmtNum(r.monthlyRatePct)}% ao mês equivalem a <b data-ui-css="color:var(--negative)">${fmtNum(r.annualEquivalentPct)}% ao ano</b>. O rotativo dura um único ciclo por regra (Resolução CMN 4.549/2017): depois dele o banco é obrigado a oferecer o parcelamento, e é por isso que não existe aqui um cenário de "rotativo por 12 meses". Pagar a fatura inteira no vencimento custa ${fmtBRL(r.payInFull.total)} e zera os encargos.</p>
    <p class="footnote">O IOF do crédito (0,38% mais 0,0082% ao dia) incide nas duas saídas e não entra na conta. Confirme CET, prazo e parcela de cada proposta antes de trocar a dívida.</p>
  </div>`;
}

/* ----------------------------------------------------------- consórcio */
function renderSimConsortium() {
  const credito = simMoney("consorcio", "credito");
  if (!(credito > 0)) {
    return `<div class="card">${renderEmptyState("briefcase", "Informe o valor da carta de crédito para ver parcela, custo e a comparação com financiar.")}</div>`;
  }
  const prazo = simInt("consorcio", "prazo", 1, 240);
  const reajuste = moneyOrZero(simRaw("consorcio", "reajuste"));
  const r = simConsortium({
    credit: credito, months: prazo,
    adminPct: moneyOrZero(simRaw("consorcio", "admin")),
    reserveFundPct: moneyOrZero(simRaw("consorcio", "reserva")),
    lancePct: moneyOrZero(simRaw("consorcio", "lance")),
    contemplationMonth: simInt("consorcio", "contemplacao", 1, prazo),
    annualAdjustmentPct: reajuste,
  });
  const fin = simLoan({
    principal: credito, months: prazo,
    annualRatePct: moneyOrZero(simRaw("consorcio", "jurosfin")),
    system: "price",
  });
  const consorcioMaisBarato = r.totalPaid < fin.totalPaid;
  const faixa = r.effectiveRange || {};
  const temFaixa = faixa.bestMonthlyPct != null && faixa.worstMonthlyPct != null;
  const custoEfetivo = r.effectiveAnnualPct != null
    ? `${fmtNum(r.effectiveAnnualPct)}% a.a. (${fmtNum(r.effectiveMonthlyPct)}% a.m.)`
    : "Não há taxa única neste cenário";

  return `<div class="card">
    <p class="card-title">Consórcio × financiamento</p>
    <div class="invest-stats">
      ${simStat("Parcela do consórcio", fmtBRL(r.payment), { highlight: true })}
      ${simStat("Total pago no consórcio", fmtBRL(r.totalPaid))}
      ${simStat("Custo acima da carta", fmtBRL(r.totalCost), { color: "var(--negative)" })}
    </div>

    <div class="sim-breakdown">
      <div class="sim-breakdown__row"><span>Custo total em % da carta recebida</span><b>${fmtNum(r.costPct)}%</b></div>
      <div class="sim-breakdown__row"><span>Carta recebida no ${r.contemplationMonth}º mês</span><b>${fmtBRL(r.scenario.creditReceived)}</b></div>
      ${reajuste > 0 ? `<div class="sim-breakdown__row"><span>Última parcela, após os reajustes</span><b>${fmtBRL(r.scenario.lastPayment)}</b></div>` : ""}
      ${r.lance > 0 ? `<div class="sim-breakdown__row"><span>Lance previsto</span><b>${fmtBRL(r.lance)}</b></div>` : ""}
      <div class="sim-breakdown__row"><span>Custo efetivo com contemplação no ${r.contemplationMonth}º mês</span><b>${custoEfetivo}</b></div>
      ${temFaixa ? `<div class="sim-breakdown__row"><span>Faixa conforme a contemplação</span><b>${fmtNum(faixa.bestMonthlyPct)}% a.m. (início) a ${fmtNum(faixa.worstMonthlyPct)}% a.m. (fim)</b></div>` : ""}
      <div class="sim-breakdown__row sim-breakdown__row--total"><span>Financiamento equivalente (Price, ${prazo} meses)</span><b>${fmtBRL(fin.totalPaid)} · ${fmtBRL(fin.payment)}/mês</b></div>
    </div>

    <p class="health-note">${consorcioMaisBarato
      ? `Em dinheiro, o consórcio sai <b data-ui-css="color:var(--positive-ink)">${fmtBRL(subMoney(fin.totalPaid, r.totalPaid))}</b> mais barato que o financiamento. O preço disso é o tempo: sem lance, a carta só chega na contemplação, estimada aqui no <b>${r.contemplationMonth}º mês</b>, e até lá você paga sem ter o bem. Consórcio é para quem pode esperar.`
      : `Neste cenário o financiamento sai <b>${fmtBRL(subMoney(r.totalPaid, fin.totalPaid))}</b> mais barato, e ainda entrega o bem hoje. A taxa de administração de ${fmtNum(moneyOrZero(simRaw("consorcio", "admin")))}% pesa mais do que parece porque incide sobre a carta inteira.`}</p>
    ${r.effectiveAnnualPct == null ? `<p class="health-note">Contemplado no meio do prazo, o fluxo não se parece nem com empréstimo (receber antes, pagar depois) nem com poupança (pagar antes, receber depois), e não existe uma taxa única que o descreva. A faixa acima mostra os dois extremos: contemplado no início, o consórcio custa como um crédito; contemplado no fim, ele devolve menos do que recebeu.</p>` : ""}
    ${reajuste === 0 ? `<p class="inline-alert">${svgIcon("info", 14)} Sem reajuste informado, a carta e as parcelas ficam paradas no valor de hoje. Em contratos longos isso subestima o total pago: informe o índice esperado do grupo no campo "Reajuste anual da carta".</p>` : ""}
    <p class="footnote">O fundo de reserva pode ser devolvido no fim do grupo, e o financiamento comparado é pelo valor de hoje da carta, com o bem entregue de imediato. Trate os números como ordem de grandeza, não como contrato.</p>
  </div>`;
}

/* ---------------------------------------------------------------- FGTS */
function renderSimFgts() {
  const rates = marketRatesOf(state.data);
  const r = simFgts({
    balance: simMoney("fgts", "saldo"),
    monthlySalary: simMoney("fgts", "salario"),
    years: simInt("fgts", "anos", 1, 40),
    fgtsAnnualPct: moneyOrZero(simRaw("fgts", "rendimento")),
    alternativeAnnualPct: moneyOrZero(simRaw("fgts", "alternativa")),
    rates,
  });

  return `<div class="card">
    <p class="card-title">Em ${r.years} ${r.years === 1 ? "ano" : "anos"}</p>
    <div class="sim-scenarios">
      <div class="sim-scenario ${!r.anniversaryWins ? "sim-scenario--best" : ""}">
        <div class="sim-scenario__head"><b>Deixar tudo no FGTS</b>${!r.anniversaryWins ? `<span class="status-badge" data-ui-css="background:var(--positive-soft); color:var(--positive)">maior valor estimado</span>` : ""}</div>
        <p class="sim-scenario__total">${fmtBRL(r.keep.final)}</p>
        <span class="sim-scenario__detail">Equivale a ${fmtBRL(r.keep.realFinal)} em poder de compra de hoje. Saque integral disponível em demissão sem justa causa.</span>
      </div>
      <div class="sim-scenario ${r.anniversaryWins ? "sim-scenario--best" : ""}">
        <div class="sim-scenario__head"><b>Saque-aniversário investido</b>${r.anniversaryWins ? `<span class="status-badge" data-ui-css="background:var(--positive-soft); color:var(--positive)">maior valor estimado</span>` : ""}</div>
        <p class="sim-scenario__total">${fmtBRL(r.anniversary.final)}</p>
        <span class="sim-scenario__detail">${fmtBRL(r.anniversary.fundLeft)} no fundo + ${fmtBRL(r.anniversary.invested)} investidos. Sacado no período: ${fmtBRL(r.anniversary.withdrawn)}.</span>
      </div>
    </div>

    <div class="sim-breakdown">
      <div class="sim-breakdown__row"><span>Depósito do empregador</span><b>${fmtBRL(r.deposit)}/mês (8% do salário)</b></div>
      <div class="sim-breakdown__row"><span>Rendimento do FGTS</span><b>${fmtNum(r.fgtsAnnualPct)}% a.a.</b></div>
      <div class="sim-breakdown__row sim-breakdown__row--total"><span>Diferença entre os dois caminhos</span><b data-ui-css="color:${r.anniversaryWins ? "var(--positive)" : "var(--negative)"}">${r.anniversaryWins ? "+" : "−"}${fmtBRL(Math.abs(r.difference))}</b></div>
    </div>

    ${r.floorApplied ? `<p class="inline-alert">${svgIcon("info", 14)} A estimativa digitada ficou abaixo do IPCA de ${fmtNum(r.inflationFloorAnnualPct)}%. O cálculo aplicou esse piso anual à remuneração do FGTS.</p>` : ""}

    <p class="health-note"><b>Liquidez na demissão:</b> no saque-aniversário, a demissão sem justa causa libera a multa rescisória quando devida, mas não o saldo integral. Os ${fmtBRL(r.lockedOnDismissal)} restantes continuam na conta e só podem ser movimentados nas hipóteses legais. O retorno ao saque-rescisão, quando permitido, produz efeito no primeiro dia do 25º mês após o pedido.</p>
  </div>`;
}

/* -------------------------------------------------------- aposentadoria */
function renderSimRetirement() {
  const rates = marketRatesOf(state.data);
  const idade = simInt("aposentadoria", "idade", 16, 90);
  const idadeAposInformada = simInt("aposentadoria", "idadeapos", 0, 120);
  const expectativaInformada = simInt("aposentadoria", "expectativa", 0, 130);
  const r = simRetirement({
    currentAge: idade,
    retireAge: simInt("aposentadoria", "idadeapos", idade + 1, 100),
    lifeExpectancy: simInt("aposentadoria", "expectativa", 60, 110),
    currentSaved: simMoney("aposentadoria", "guardado"),
    monthlyContribution: simMoney("aposentadoria", "aporte"),
    desiredIncome: simMoney("aposentadoria", "renda"),
    annualRatePct: moneyOrZero(simRaw("aposentadoria", "taxa")),
    rates,
  });

  // O motor corrige idades impossíveis sozinho; a tela precisa dizer que
  // corrigiu, senão o resultado parece responder a uma pergunta que não foi
  // feita.
  const avisos = [];
  if (idadeAposInformada <= idade) avisos.push(`A idade para parar precisa ser maior que a sua idade atual; a conta usou ${r.retireAge} anos.`);
  if (expectativaInformada <= r.retireAge) avisos.push(`"Planejar até os" precisa ser maior que a idade de parar; a conta usou ${r.lifeExpectancy} anos.`);

  const rendaPerpetua = r.incomePerpetual != null ? fmtBRL(r.incomePerpetual) : "Não existe sem juro real";

  return `<div class="card">
    <p class="card-title">Aos ${r.retireAge} anos</p>
    <div class="invest-stats">
      ${simStat("Patrimônio acumulado", fmtBRL(r.atRetirement), { highlight: true })}
      ${simStat(`Renda mensal até os ${r.lifeExpectancy}`, fmtBRL(r.incomeDepleting), { interest: true })}
      ${simStat("Renda sem consumir o principal", rendaPerpetua)}
    </div>

    ${avisos.map((a) => `<p class="inline-alert">${svgIcon("info", 14)} ${a}</p>`).join("")}

    <div class="sim-breakdown">
      <div class="sim-breakdown__row"><span>Você teria aportado</span><b>${fmtBRL(r.contributed)}</b></div>
      <div class="sim-breakdown__row"><span>Juros reais no período</span><b data-ui-css="color:${r.interestEarned >= 0 ? "var(--positive-ink)" : "var(--negative)"}">${fmtBRL(r.interestEarned)}</b></div>
      <div class="sim-breakdown__row"><span>Rendimento real usado</span><b>${fmtNum(r.realAnnualPct)}% a.a. (${fmtNum(r.nominalAnnualPct)}% nominais descontada a inflação de ${fmtNum(rates.ipca)}%)</b></div>
      <div class="sim-breakdown__row"><span>Anos acumulando · anos de saque</span><b>${r.accumMonths / 12} · ${r.drawMonths / 12}</b></div>
      ${r.desiredIncome > 0 ? `<div class="sim-breakdown__row"><span>Capital para a renda desejada</span><b>${fmtBRL(r.capitalDepleting)}</b></div>` : ""}
      ${r.desiredIncome > 0 && r.capitalPerpetual != null ? `<div class="sim-breakdown__row"><span>Capital para a renda sem tocar no principal</span><b>${fmtBRL(r.capitalPerpetual)}</b></div>` : ""}
      ${r.desiredIncome > 0 ? `<div class="sim-breakdown__row sim-breakdown__row--total"><span>Aporte mensal necessário</span><b>${fmtBRL(r.requiredMonthly)}</b></div>` : ""}
    </div>

    ${r.realRateNegative ? `<p class="ai-error">${svgIcon("alertTriangle", 14)} Com rendimento abaixo da inflação, o patrimônio encolhe em poder de compra por mais que você aporte. Revise a taxa esperada ou o produto.</p>` : ""}
    ${!r.perpetualAvailable && !r.realRateNegative ? `<p class="health-note">${r.perpetualUnavailableReason}</p>` : ""}

    ${r.desiredIncome > 0 ? (r.onTrack
      ? `<p class="health-note">${svgIcon("checkCircle", 14)} No ritmo atual você chega lá: a renda projetada de <b data-ui-css="color:var(--positive-ink)">${fmtBRL(r.incomeDepleting)}</b> cobre os ${fmtBRL(r.desiredIncome)} que você quer, consumindo o patrimônio até os ${r.lifeExpectancy} anos.${r.capitalPerpetual != null ? ` Se quiser deixar herança ou viver mais que o previsto, o número a mirar é <b>${fmtBRL(r.capitalPerpetual)}</b>, que sustenta a renda sem tocar no principal.` : ""}</p>`
      : `<p class="health-note">Faltam <b data-ui-css="color:var(--negative)">${fmtBRL(r.gapIncome)}</b> por mês para a renda que você quer. Para fechar a conta, o aporte precisaria ser de <b>${fmtBRL(r.requiredMonthly)}</b>; hoje ele é de ${fmtBRL(r.monthlyContribution)}, uma diferença de <b>${fmtBRL(r.contributionGap)}</b> por mês. Adiar a parada em poucos anos também resolve, porque a diferença é composta.</p>`) : ""}

    <p class="footnote">Tudo em valores de hoje: a projeção desconta a inflação informada. O rendimento nominal deve ser o líquido de imposto e taxas do produto onde o dinheiro ficará. Não entra aqui o benefício do INSS.</p>
  </div>`;
}
