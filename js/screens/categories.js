// js/screens/categories.js. Central de categorias: estrutura, grupos e tetos.
// ------------------------------------------------------------------------------
// Categoria era um cartão espremido no fim de Ajustes: uma linha por categoria
// (ícone, nome, teto, dois botõezinhos e três chips de grupo) e, no rodapé, um
// formulário de criação com um <select> de "categoria pai". O resultado era
// previsível:
//
//   1. Criar subcategoria exigia entender o <select> ANTES de digitar o nome;
//      quem não mexia nele criava tudo solto na raiz.
//   2. Não havia como mudar o pai depois. Categoria criada no lugar errado
//      ficava errada para sempre, ou era apagada levando o histórico junto.
//   3. Os chips de grupo (Necessidade/Desejo/Futuro) repetiam em TODAS as
//      linhas e, ainda assim, não havia visão de conjunto: responder "o que eu
//      classifiquei como Desejo?" exigia varrer a lista inteira com o olho.
//
// Aqui os mesmos dados ganham três lentes; Estrutura (a hierarquia), Grupos (a
// Regra x/x/x) e Tetos (os limites do mês); mais um editor em folha que cria E
// edita, inclusive movendo uma categoria de pai.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

const CATEGORY_VIEWS = [
  { id: "tree", label: "Estrutura", icon: "layout" },
  { id: "groups", label: "Grupos", icon: "pie" },
  { id: "budgets", label: "Tetos", icon: "target" },
];

// Paleta do editor. As oito primeiras são as do app (usadas também pelos
// gráficos); as seis seguintes existem só para dar variedade a quem cria muitas
// categorias e não quer duas do mesmo tom lado a lado.
const CATEGORY_COLOR_CHOICES = PALETTE.concat(["#1F8A5F", "#2E6F7E", "#7A4E8C", "#A33B4C", "#6B7A2E", "#8C5A2B"]);

function freshCategoryEditor(patch) {
  return Object.assign({
    id: null,
    name: "",
    parentId: "",
    group: "necessidade",
    icon: "tag",
    color: PALETTE[0],
    budget: "",
    confirmDelete: false,
  }, patch || {});
}

// ------------------------------------------------------------------------------
// Modelo da tela. Puro: lê `state.data` e devolve o que as três lentes precisam,
// já com gasto do mês, teto e nível de alerta resolvidos por categoria.
// ------------------------------------------------------------------------------
function categoryStatOf(data, cat, monthKey, thresholds) {
  const spent = spentForCategory(data, cat.id, monthKey);
  const budget = typeof cat.budget === "number" && cat.budget > 0 ? cat.budget : null;
  const pct = budget ? safePct(spent, budget) : 0;
  const level = budget ? budgetLevelOf(pct, thresholds) : null;
  return {
    id: cat.id,
    name: cat.name,
    color: cat.color,
    icon: cat.icon,
    parentId: cat.parentId || null,
    group: categoryGroup(data, cat.id),
    spent, budget, pct, level,
    levelMeta: level ? BUDGET_LEVEL_META[level] : null,
  };
}

function categoriesModel() {
  const data = state.data;
  const monthKey = keyOfCurrentMonth();
  const thresholds = budgetThresholds(data, monthKey);
  const query = normalizeText(state.categoriesUi.search || "");
  const hits = (name) => !query || normalizeText(name).indexOf(query) !== -1;

  const nodes = topLevelCategories(data).map((parent) => {
    const stat = categoryStatOf(data, parent, monthKey, thresholds);
    const children = childCategories(data, parent.id).map((child) => categoryStatOf(data, child, monthKey, thresholds));
    const parentHit = hits(parent.name);
    const visibleChildren = children.filter((child) => parentHit || hits(child.name));
    // O gasto do pai já inclui o das filhas (é assim que o teto funciona); aqui
    // separamos o que foi lançado DIRETO nele, que é o número que explica uma
    // categoria-mãe com subcategorias.
    const childrenSpent = children.reduce((sum, child) => addMoney(sum, child.spent), 0);
    return Object.assign({}, stat, {
      children,
      visibleChildren,
      ownSpent: Math.max(0, subMoney(stat.spent, childrenSpent)),
      visible: parentHit || visibleChildren.length > 0,
    });
  });

  const flat = [];
  nodes.forEach((node) => {
    flat.push(Object.assign({}, node, { depth: 0, path: node.name }));
    node.children.forEach((child) => flat.push(Object.assign({}, child, { depth: 1, path: `${node.name} › ${child.name}` })));
  });

  const groupSpend = monthGroupSpend(data, monthKey);
  const byGroup = {};
  BUDGET_GROUPS.forEach((group) => {
    byGroup[group] = flat.filter((item) => item.group === group).sort((a, b) => b.spent - a.spent);
  });

  return {
    monthKey, thresholds, query, nodes, flat, byGroup, groupSpend,
    totals: {
      parents: nodes.length,
      children: flat.length - nodes.length,
      total: flat.length,
      withBudget: flat.filter((item) => item.budget).length,
      over: flat.filter((item) => item.level === "over").length,
      spent: nodes.reduce((sum, node) => addMoney(sum, node.spent), 0),
    },
  };
}

// Um nó fica aberto por padrão. Durante uma busca todos abrem: esconder o
// resultado atrás de um chevron seria o oposto de procurar.
function isCategoryNodeOpen(model, id) {
  if (model.query) return true;
  return (state.categoriesUi.collapsed || []).indexOf(id) === -1;
}

function categoryGroupTag(group) {
  return `<span class="cat-tag cat-tag--${group}">${svgIcon(GROUP_ICONS[group], 11)}${GROUP_LABELS[group]}</span>`;
}

function categoryBubbleCss(color, strength) {
  return `background:color-mix(in srgb, ${color} ${strength || 14}%, transparent); color:${color}`;
}

// ------------------------------------------------------------------------------
// Tela
// ------------------------------------------------------------------------------
function renderCategoriesScreen() {
  const ui = state.categoriesUi;
  const model = categoriesModel();
  const view = CATEGORY_VIEWS.some((v) => v.id === ui.view) ? ui.view : "tree";

  return `<div class="screen screen--narrow cat-hub">
    ${renderBackHeader("Categorias")}

    ${renderCategoriesOverviewCard(model)}

    <div class="card cat-toolbar">
      <div class="cat-toolbar__top">
        <div class="cat-search">
          ${svgIcon("search", 16, "cat-search__icon")}
          <input id="cat-search-input" class="input input--search" data-field="cat-search" value="${escapeHtml(ui.search || "")}"
            placeholder="Buscar categoria ou subcategoria" autocomplete="off" />
          ${ui.search ? `<button class="icon-btn icon-btn--muted cat-search__clear" data-action="cat-search-clear" aria-label="Limpar busca">${svgIcon("x", 14)}</button>` : ""}
        </div>
        <button class="btn btn--primary cat-toolbar__new" data-action="cat-editor-open">${svgIcon("plus", 16)} Nova categoria</button>
      </div>
      <div class="segmented cat-toolbar__views" role="tablist" aria-label="Modo de visualização das categorias">
        ${CATEGORY_VIEWS.map((v) => `<button class="segmented__option ${view === v.id ? "active" : ""}" role="tab" aria-selected="${view === v.id ? "true" : "false"}" data-action="cat-view" data-value="${v.id}">${svgIcon(v.icon, 14)} ${v.label}</button>`).join("")}
      </div>
      <p class="field-hint">${escapeHtml(CATEGORY_VIEW_HINTS[view])}</p>
    </div>

    ${view === "tree" ? renderCategoryTreeView(model) : ""}
    ${view === "groups" ? renderCategoryGroupsView(model) : ""}
    ${view === "budgets" ? renderCategoryBudgetsView(model) : ""}

    <p class="footnote">O gasto de uma subcategoria conta para o teto da categoria principal. Excluir uma categoria não apaga lançamentos: eles são movidos para “Outros”.</p>
  </div>`;
}

const CATEGORY_VIEW_HINTS = {
  tree: "Toque em qualquer categoria para editar nome, ícone, cor, grupo, teto ou mudar de categoria principal.",
  groups: "É esta divisão que alimenta a Regra x/x/x do Início. Toque numa categoria para trocá-la de grupo.",
  budgets: "Digite o limite do mês e saia do campo; o valor salva sozinho. Campo vazio significa sem limite.",
};

function renderCategoriesOverviewCard(model) {
  const totals = model.totals;
  const monthName = MONTH_NAMES[new Date().getMonth()].toLowerCase();
  const segments = BUDGET_GROUPS.map((group) => ({
    group,
    value: model.groupSpend[group],
    pct: totals.spent > 0 ? safePct(model.groupSpend[group], totals.spent) : 0,
  }));

  return `<div class="card cat-overview">
    <p class="card-title" data-ui-css="margin-bottom:4px">Como seus gastos estão organizados</p>
    <p class="card-subtitle">${totals.parents} categoria(s) principais e ${totals.children} subcategoria(s), com ${fmtBRL(totals.spent)} classificados em ${escapeHtml(monthName)}.</p>

    ${totals.spent > 0 ? `<div class="segment-bar cat-overview__bar" role="img" aria-label="Divisão dos gastos do mês entre necessidades, desejos e futuro">
      ${segments.filter((s) => s.pct > 0).map((s) => `<span class="cat-overview__seg cat-overview__seg--${s.group}" data-ui-css="width:${s.pct}%"></span>`).join("")}
    </div>
    <div class="cat-overview__legend">
      ${segments.map((s) => `<span class="cat-overview__legend-item">
        <i class="cat-overview__dot cat-overview__dot--${s.group}" aria-hidden="true"></i>
        <b>${GROUP_LABELS[s.group]}</b>
        <small>${fmtBRL(s.value)} · ${Math.round(s.pct)}%</small>
      </span>`).join("")}
    </div>` : `<p class="field-hint">Nenhum gasto lançado neste mês ainda. A divisão por grupo aparece assim que o primeiro entrar.</p>`}

    <div class="cat-overview__stats">
      <div><span>Com teto definido</span><b>${totals.withBudget} de ${totals.total}</b></div>
      <div><span>Estouradas no mês</span><b class="${totals.over > 0 ? "is-over" : ""}">${totals.over}</b></div>
      <div><span>Grupos em uso</span><b>${BUDGET_GROUPS.filter((g) => model.byGroup[g].length > 0).length} de 3</b></div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- Lente 1: estrutura
function renderCategoryTreeView(model) {
  const nodes = model.nodes.filter((node) => node.visible);
  if (nodes.length === 0) {
    return `<div class="card">${renderEmptyState("search", "Nenhuma categoria com esse nome.", "Tente um termo mais curto ou crie uma categoria nova.")}</div>`;
  }
  return `<div class="card cat-tree">
    ${nodes.map((node) => renderCategoryNode(model, node)).join("")}
  </div>`;
}

function renderCategoryNode(model, node) {
  const open = isCategoryNodeOpen(model, node.id);
  const hasChildren = node.children.length > 0;
  const children = model.query ? node.visibleChildren : node.children;

  return `<div class="cat-node ${open ? "is-open" : ""}">
    <div class="cat-node__head">
      <button class="cat-node__main" data-action="cat-editor-open" data-id="${node.id}" aria-label="Editar categoria ${escapeHtml(node.name)}">
        <span class="icon-bubble" data-ui-css="${categoryBubbleCss(node.color)}">${svgIcon(node.icon, 18)}</span>
        <span class="cat-node__text">
          <span class="cat-node__name">${escapeHtml(node.name)}</span>
          <span class="cat-node__meta">
            ${categoryGroupTag(node.group)}
            ${hasChildren ? `<span class="cat-node__count">${node.children.length} subcategoria${node.children.length > 1 ? "s" : ""}</span>` : ""}
          </span>
        </span>
        <span class="cat-node__values">
          <b>${fmtBRL(node.spent)}</b>
          <small>${node.budget ? `de ${fmtBRL(node.budget)}` : "sem teto"}</small>
        </span>
      </button>
      ${hasChildren
        ? `<button class="cat-node__toggle" data-action="cat-toggle" data-id="${node.id}" aria-expanded="${open ? "true" : "false"}" aria-label="${open ? "Recolher" : "Expandir"} as subcategorias de ${escapeHtml(node.name)}">${svgIcon("chevronDown", 16)}</button>`
        : `<button class="cat-node__toggle cat-node__toggle--add" data-action="cat-editor-open" data-parent="${node.id}" aria-label="Criar subcategoria em ${escapeHtml(node.name)}">${svgIcon("plus", 16)}</button>`}
    </div>

    ${renderCategoryBudgetBar(node)}

    ${open && hasChildren ? `<div class="cat-node__children">
      ${children.map((child) => renderCategoryChildRow(child)).join("")}
      <button class="cat-node__add" data-action="cat-editor-open" data-parent="${node.id}">
        ${svgIcon("plus", 14)} Nova subcategoria em ${escapeHtml(node.name)}
      </button>
    </div>` : ""}
  </div>`;
}

function renderCategoryChildRow(child) {
  return `<button class="cat-child" data-action="cat-editor-open" data-id="${child.id}" aria-label="Editar subcategoria ${escapeHtml(child.name)}">
    <span class="cat-child__rail" aria-hidden="true"></span>
    <span class="icon-bubble icon-bubble--sm" data-ui-css="${categoryBubbleCss(child.color)}">${svgIcon(child.icon, 15)}</span>
    <span class="cat-child__text">
      <span class="cat-child__name">${escapeHtml(child.name)}</span>
      <span class="cat-child__meta">${categoryGroupTag(child.group)}${child.budget ? `<span class="cat-child__budget">teto ${fmtBRL(child.budget)}</span>` : ""}</span>
    </span>
    <span class="cat-child__value ${child.level === "over" ? "is-over" : ""}">${fmtBRL(child.spent)}</span>
  </button>`;
}

function renderCategoryBudgetBar(item) {
  if (!item.budget) return "";
  const meta = item.levelMeta || BUDGET_LEVEL_META.ok;
  return `<div class="cat-bar">
    <div class="progress progress--sm" data-ui-css="margin:0">
      <div class="progress__fill" data-ui-css="width:${clamp(item.pct, 0, 100)}%; background:${meta.color}"></div>
    </div>
    <span class="cat-bar__text" data-ui-css="color:${meta.color}">${Math.round(item.pct)}%</span>
  </div>`;
}

// ---------------------------------------------------------------- Lente 2: grupos
function renderCategoryGroupsView(model) {
  const income = effectiveIncome(state.data, model.monthKey);
  return BUDGET_GROUPS.map((group) => {
    const items = model.byGroup[group].filter((item) => !model.query || normalizeText(item.path).indexOf(model.query) !== -1);
    const spent = model.groupSpend[group];
    const allocated = income > 0 ? groupAllocated(state.data, model.monthKey, group) : 0;
    const pct = allocated > 0 ? safePct(spent, allocated) : 0;
    const over = allocated > 0 && spent > allocated;

    return `<div class="card cat-group-card cat-group-card--${group}">
      <div class="cat-group-card__head">
        <span class="icon-bubble cat-group-card__icon cat-group-card__icon--${group}">${svgIcon(GROUP_ICONS[group], 18)}</span>
        <div class="cat-group-card__text">
          <p class="card-title" data-ui-css="margin:0">${GROUP_LABELS[group]}</p>
          <p class="card-subtitle" data-ui-css="margin:3px 0 0">${items.length} categoria(s) · ${fmtBRL(spent)} neste mês</p>
        </div>
        ${allocated > 0 ? `<span class="cat-group-card__pct ${over ? "is-over" : ""}">${Math.round(pct)}%</span>` : ""}
      </div>

      ${allocated > 0 ? `<div class="progress progress--sm" data-ui-css="margin:12px 0 6px">
          <div class="progress__fill" data-ui-css="width:${clamp(pct, 0, 100)}%; background:${over ? "var(--negative)" : "var(--brand)"}"></div>
        </div>
        <p class="field-hint" data-ui-css="margin-top:0">A Regra x/x/x reserva ${fmtBRL(allocated)} por mês (${state.data.budgetSplit[group]}% da renda) para este grupo.</p>`
        : `<p class="field-hint">Informe sua renda em Ajustes para ver quanto a Regra x/x/x reserva para este grupo.</p>`}

      ${items.length > 0 ? `<div class="cat-group-list">
        ${items.map((item) => `<button class="cat-group-row" data-action="cat-editor-open" data-id="${item.id}" aria-label="Editar ${escapeHtml(item.path)}">
          <span class="icon-bubble icon-bubble--sm" data-ui-css="${categoryBubbleCss(item.color)}">${svgIcon(item.icon, 15)}</span>
          <span class="cat-group-row__text">
            <span class="cat-group-row__name">${escapeHtml(item.name)}</span>
            ${item.depth === 1 ? `<span class="cat-group-row__path">${escapeHtml(item.path)}</span>` : ""}
          </span>
          <span class="cat-group-row__value">${fmtBRL(item.spent)}</span>
          ${svgIcon("chevronRight", 14, "cat-group-row__chevron")}
        </button>`).join("")}
      </div>` : `<p class="field-hint" data-ui-css="margin-top:12px">Nenhuma categoria neste grupo${model.query ? " com esse nome" : ""}.</p>`}
    </div>`;
  }).join("");
}

// ---------------------------------------------------------------- Lente 3: tetos
function renderCategoryBudgetsView(model) {
  const items = model.flat.filter((item) => !model.query || normalizeText(item.path).indexOf(model.query) !== -1);
  if (items.length === 0) {
    return `<div class="card">${renderEmptyState("search", "Nenhuma categoria com esse nome.", "Limpe a busca para ver a lista completa.")}</div>`;
  }
  return `<div class="card">
    <p class="card-title">Tetos deste mês</p>
    <p class="card-subtitle">Um teto é um limite seu, não um bloqueio: o app avisa quando você se aproxima e quando passa.</p>
    <div class="cat-budget-list">
      ${items.map((item) => renderCategoryBudgetRow(model, item)).join("")}
    </div>
  </div>`;
}

function renderCategoryBudgetRow(model, item) {
  const draft = Object.prototype.hasOwnProperty.call(state.categoryBudgetDrafts, item.id)
    ? state.categoryBudgetDrafts[item.id]
    : (item.budget ? item.budget.toFixed(2).replace(".", ",") : "");
  const suggestion = item.budget ? null : suggestBudgetFor(state.data, item.id);
  const meta = item.levelMeta;

  return `<div class="cat-budget-row ${item.depth === 1 ? "cat-budget-row--child" : ""}">
    <div class="cat-budget-row__main">
      <span class="icon-bubble icon-bubble--sm" data-ui-css="${categoryBubbleCss(item.color)}">${svgIcon(item.icon, 15)}</span>
      <div class="cat-budget-row__text">
        <span class="cat-budget-row__name">${escapeHtml(item.name)}</span>
        <span class="cat-budget-row__meta">${item.depth === 1 ? escapeHtml(item.path) : GROUP_LABELS[item.group]} · ${fmtBRL(item.spent)} gastos</span>
      </div>
      <div class="cat-budget-row__input">
        <span>R$</span>
        <input id="cat-budget-input-${item.id}" class="input input--budget" data-field="category-budget" data-id="${item.id}"
          value="${escapeHtml(draft)}" inputmode="decimal" placeholder="sem limite" aria-label="Teto mensal de ${escapeHtml(item.name)}" />
      </div>
    </div>
    ${item.budget ? `<div class="cat-bar">
      <div class="progress progress--sm" data-ui-css="margin:0">
        <div class="progress__fill" data-ui-css="width:${clamp(item.pct, 0, 100)}%; background:${meta.color}"></div>
      </div>
      <span class="cat-bar__text" data-ui-css="color:${meta.color}">${fmtBRL(item.spent)} de ${fmtBRL(item.budget)} · ${Math.round(item.pct)}%</span>
    </div>` : (suggestion ? `<button class="cat-budget-suggest" data-action="apply-budget-suggestion" data-id="${item.id}" data-value="${suggestion}">
      ${svgIcon("sparkles", 12)} Sugerir ${fmtBRL(suggestion)} (média dos últimos meses)
    </button>` : "")}
  </div>`;
}

// ------------------------------------------------------------------------------
// Editor em folha. O mesmo componente cria e edita; é ele que torna possível
// mover uma categoria de pai sem perder o histórico.
// ------------------------------------------------------------------------------
function renderCategoryEditorModal() {
  const draft = state.categoriesUi.editor;
  if (!draft) return "";
  const editing = !!draft.id;
  const existing = editing ? categoryById(state.data, draft.id) : null;
  // Uma categoria com filhas não pode virar filha de outra: o modelo tem um
  // nível só, e aninhar mais esconderia gastos de todos os tetos.
  const childCount = editing ? childCategories(state.data, draft.id).length : 0;
  const canBeChild = childCount === 0;
  const parents = topLevelCategories(state.data).filter((c) => c.id !== draft.id);
  const previewName = draft.name.trim() || (editing ? existing.name : "Nova categoria");
  const parentName = draft.parentId ? categoryById(state.data, draft.parentId).name : "";
  const suggestion = editing && !draft.budget.trim() ? suggestBudgetFor(state.data, draft.id) : null;

  return `<div class="modal-overlay" data-action="cat-editor-close">
    <div class="modal-sheet cat-editor" data-stop-close="1" role="dialog" aria-modal="true" aria-labelledby="cat-editor-title">
      <div class="modal-header">
        <span class="icon-bubble icon-bubble--lg" data-ui-css="${categoryBubbleCss(draft.color, 16)}">${svgIcon(draft.icon, 21)}</span>
        <div>
          <p class="card-title" id="cat-editor-title" data-ui-css="margin:0">${escapeHtml(previewName)}</p>
          <p class="card-subtitle" data-ui-css="margin:3px 0 0">${parentName ? `Subcategoria de ${escapeHtml(parentName)}` : "Categoria principal"} · ${GROUP_LABELS[draft.group]}</p>
        </div>
        <button class="icon-btn" data-action="cat-editor-close" aria-label="Fechar editor de categoria">${svgIcon("x", 16)}</button>
      </div>

      <div class="field">
        <label class="field__label" for="cat-editor-name">Nome</label>
        <input id="cat-editor-name" class="input" data-field="cat-editor-name" value="${escapeHtml(draft.name)}"
          placeholder="Ex: Mercado, Farmácia, Academia" autocomplete="off" maxlength="60" />
      </div>

      <div class="field cat-editor__field">
        <p class="field__label">Onde ela fica</p>
        <div class="cat-parent-picker">
          <button class="cat-parent-option ${!draft.parentId ? "active" : ""}" data-action="cat-editor-set-parent" data-value="">
            ${svgIcon("layout", 15)} Categoria principal
          </button>
          ${canBeChild ? parents.map((parent) => `<button class="cat-parent-option ${draft.parentId === parent.id ? "active" : ""}" data-action="cat-editor-set-parent" data-value="${parent.id}">
            <span class="cat-parent-option__dot" data-ui-css="background:${parent.color}"></span>${escapeHtml(parent.name)}
          </button>`).join("") : ""}
        </div>
        <p class="field-hint">${canBeChild
          ? "Subcategorias somam no teto da principal e continuam aparecendo separadas nas análises."
          : `Esta categoria tem ${childCount} subcategoria(s), então ela mesma precisa continuar sendo principal.`}</p>
      </div>

      <div class="field cat-editor__field">
        <p class="field__label">Grupo da Regra x/x/x</p>
        <div class="cat-group-choice">
          ${BUDGET_GROUPS.map((group) => `<button class="cat-group-choice__option ${draft.group === group ? "active" : ""}" data-action="cat-editor-set-group" data-value="${group}" aria-pressed="${draft.group === group ? "true" : "false"}">
            ${svgIcon(GROUP_ICONS[group], 15)}
            <span>${GROUP_LABELS[group]}</span>
          </button>`).join("")}
        </div>
        <p class="field-hint">${escapeHtml(CATEGORY_GROUP_HINTS[draft.group])}</p>
      </div>

      <div class="field cat-editor__field">
        <p class="field__label">Ícone</p>
        <div class="cat-icon-grid">
          ${CATEGORY_ICON_CHOICES.map((icon) => `<button class="cat-icon-option ${draft.icon === icon ? "active" : ""}" data-action="cat-editor-set-icon" data-value="${icon}" aria-label="Usar o ícone ${icon}" aria-pressed="${draft.icon === icon ? "true" : "false"}">${svgIcon(icon, 17)}</button>`).join("")}
        </div>
      </div>

      <div class="field cat-editor__field">
        <p class="field__label">Cor</p>
        <div class="cat-color-row">
          ${CATEGORY_COLOR_CHOICES.map((color) => `<button class="cat-color-option ${draft.color === color ? "active" : ""}" data-ui-css="background:${color}" data-action="cat-editor-set-color" data-value="${color}" aria-label="Usar a cor ${color}" aria-pressed="${draft.color === color ? "true" : "false"}"></button>`).join("")}
        </div>
      </div>

      <div class="field cat-editor__field">
        <label class="field__label" for="cat-editor-budget">Teto mensal (opcional)</label>
        <div class="cat-editor__money">
          <span>R$</span>
          <input id="cat-editor-budget" class="input" data-field="cat-editor-budget" value="${escapeHtml(draft.budget)}"
            inputmode="decimal" placeholder="sem limite" autocomplete="off" />
        </div>
        ${suggestion ? `<button class="cat-budget-suggest" data-action="cat-editor-suggest" data-value="${suggestion}">
          ${svgIcon("sparkles", 12)} Usar ${fmtBRL(suggestion)} (média dos últimos meses)
        </button>` : `<p class="field-hint">Deixe em branco para acompanhar o gasto sem limite definido.</p>`}
      </div>

      ${draft.confirmDelete ? `<div class="cat-editor__danger">
        <p class="cat-editor__danger-title">${svgIcon("alertTriangle", 15)} Excluir “${escapeHtml(existing ? existing.name : previewName)}”?</p>
        <p class="cat-editor__danger-text">${childCount > 0 ? `As ${childCount} subcategoria(s) também serão excluídas. ` : ""}Os lançamentos não são apagados: eles passam para “Outros”.</p>
        <div class="cat-editor__danger-actions">
          <button class="btn btn--ghost btn--sm" data-action="cat-editor-delete-cancel">Manter categoria</button>
          <button class="btn btn--danger btn--sm" data-action="cat-editor-delete-confirm">${svgIcon("trash", 14)} Excluir mesmo assim</button>
        </div>
      </div>` : ""}

      <div class="cat-editor__actions">
        ${editing && !draft.confirmDelete ? `<button class="btn btn--ghost btn--sm cat-editor__delete" data-action="cat-editor-delete">${svgIcon("trash", 14)} Excluir</button>` : ""}
        <button class="btn btn--secondary" data-action="cat-editor-close">Cancelar</button>
        <button class="btn btn--primary" data-action="cat-editor-save">${svgIcon("check", 15)} ${editing ? "Salvar alterações" : "Criar categoria"}</button>
      </div>
    </div>
  </div>`;
}

const CATEGORY_GROUP_HINTS = {
  necessidade: "Necessidades: o que você pagaria mesmo num mês apertado (moradia, mercado, remédio).",
  desejo: "Desejos: o que melhora a vida mas pode esperar (lazer, delivery, assinatura).",
  futuro: "Futuro: o que sai hoje e volta depois (aporte, reserva, amortização de dívida).",
};
