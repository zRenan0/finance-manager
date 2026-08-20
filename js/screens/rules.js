// js/screens/rules.js. Regras de categorização: as do usuário e as de fábrica.
// ------------------------------------------------------------------------------
// O motor está em `js/rules.js` e não sabe que esta tela existe. Aqui só há HTML.
//
// A ordem dos cartões segue o caminho de quem chega com um problema concreto
// ("o app insiste em jogar meu posto de gasolina em Outros"): primeiro o
// laboratório onde ele cola a descrição e vê o que acontece, depois as regras
// dele, depois o botão que conserta o histórico, e só no fim as regras de
// fábrica; que a maioria nunca vai precisar abrir.
//
// Fatiado de app.js. Carregado como script global (sem módulos ES), então
// todas as funções continuam visíveis para o restante do app.
"use strict";

function rulesCategoryOptions(selectedId) {
  return topLevelCategories(state.data).map((c) => {
    const subs = childCategories(state.data, c.id);
    const own = `<option value="${c.id}" ${selectedId === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`;
    const kids = subs.map((sub) => `<option value="${sub.id}" ${selectedId === sub.id ? "selected" : ""}>${escapeHtml(c.name)} › ${escapeHtml(sub.name)}</option>`).join("");
    return own + kids;
  }).join("");
}

function renderRulesScreen() {
  const cfg = normalizeCategoryRules(state.data.categoryRules);
  return `<div class="screen screen--narrow">
    ${renderBackHeader("Regras de categorização")}

    <div class="card">
      <p class="card-subtitle" data-ui-css="margin-top:0">Quando um lançamento chega de um extrato, de um QR Code ou do campo de texto livre, o app tenta adivinhar a categoria pela descrição. Aqui você ensina o que ele ainda não sabe. Tudo é calculado no seu aparelho.</p>
      <p class="field-hint">Em caso de empate, vence a regra de maior peso; entre pesos iguais, a sua regra ganha da regra de fábrica.</p>
    </div>

    ${renderRuleTesterCard()}
    ${renderCustomRulesCard(cfg)}
    ${renderRuleApplyCard()}
    ${renderBuiltinRulesCard(cfg)}
  </div>`;
}

// ---- Laboratório: cole uma descrição, veja quem ganha ----
// Existe porque regra de texto é a classe de configuração em que o usuário mais
// erra em silêncio: ele escreve "posto ipiranga", o extrato diz "POSTO IPIRANGA
// LTDA 04", e sem um lugar para testar ele só descobre no mês seguinte.
function renderRuleTesterCard() {
  const text = state.rules.testText || "";
  const compiled = compileCategoryRules(state.data);
  const best = text ? matchCategoryRules(compiled, normalizeText(text)) : null;
  const hits = text ? compiled.filter((r) => { try { return r.re.test(normalizeText(text)); } catch (e) { return false; } }) : [];
  const cat = best ? categoryById(state.data, best.categoryId) : null;

  return `<div class="card">
    <p class="card-title">Testar uma descrição</p>
    <p class="card-subtitle" data-ui-css="margin-top:0">Cole aqui um texto igual ao que aparece no seu extrato.</p>
    <input id="rule-test-input" class="input" data-field="rule-test" value="${escapeHtml(text)}"
      placeholder="Ex: PAG*PostoIpiranga 04" autocomplete="off" />

    ${!text ? "" : best ? `<div class="rule-test-result">
      <span class="icon-bubble icon-bubble--sm" data-ui-css="background:color-mix(in srgb, ${cat.color} 14%, transparent); color:${cat.color}">${svgIcon(cat.icon, 15)}</span>
      <div class="rule-test-result__text">
        <p class="rule-test-result__cat">${escapeHtml(cat.name)}</p>
        <p class="rule-test-result__rule">por ${best.source === "custom" ? "sua regra" : "regra de fábrica"} “${escapeHtml(best.label)}” · peso ${best.weight}</p>
      </div>
    </div>
    ${hits.length > 1 ? `<p class="field-hint">${hits.length} regras casaram com esse texto. As demais perderam no peso: ${hits.filter((r) => r !== best).map((r) => escapeHtml(r.label)).slice(0, 3).join(", ")}.</p>` : ""}` : `<div class="rule-test-result rule-test-result--miss">
      ${svgIcon("info", 16)}
      <div class="rule-test-result__text">
        <p class="rule-test-result__cat">Nenhuma regra casou</p>
        <p class="rule-test-result__rule">Esse lançamento cairia em “Outros”. Crie uma regra abaixo.</p>
      </div>
    </div>`}
  </div>`;
}

// ---- Regras do usuário ----
function renderCustomRulesCard(cfg) {
  const form = state.rules.form;
  return `<div class="card">
    <div class="settings-row-header">
      <div>
        <p class="card-title" data-ui-css="margin:0">Suas regras</p>
        <p class="card-subtitle" data-ui-css="margin:2px 0 0">${cfg.custom.length === 0 ? "Nenhuma regra criada ainda." : `${cfg.custom.length} regra(s) · ${cfg.custom.filter((r) => r.enabled).length} ativa(s)`}</p>
      </div>
      ${form ? "" : `<button class="btn btn--primary btn--sm" data-action="rule-new">${svgIcon("plus", 15)} Nova</button>`}
    </div>

    ${form ? renderRuleForm(form) : ""}

    ${cfg.custom.length === 0 && !form
      ? renderEmptyState("tag", "Sem regras suas.", "Crie uma para que o app pare de errar na mesma descrição todo mês.")
      : `<div class="rule-list">${cfg.custom.map((r) => renderRuleRow(r)).join("")}</div>`}
  </div>`;
}

function renderRuleRow(r) {
  const cat = categoryById(state.data, r.categoryId);
  const type = RULE_MATCH_TYPES.find((m) => m.id === r.matchType) || RULE_MATCH_TYPES[0];
  const compiled = compileRulePattern(r.pattern, r.matchType);

  return `<div class="rule-row ${r.enabled ? "" : "rule-row--off"}">
    <span class="icon-bubble icon-bubble--sm" data-ui-css="background:color-mix(in srgb, ${cat.color} 14%, transparent); color:${cat.color}">${svgIcon(cat.icon, 15)}</span>
    <div class="rule-row__text">
      <p class="rule-row__pattern">${escapeHtml(r.pattern)}</p>
      <p class="rule-row__meta">${escapeHtml(type.label)} · ${escapeHtml(cat.name)} · peso ${r.weight}</p>
      ${compiled.ok ? "" : `<p class="rule-row__error">${svgIcon("alertTriangle", 12)} ${escapeHtml(compiled.error)}; a regra está sendo ignorada.</p>`}
    </div>
    <button class="switch ${r.enabled ? "active" : ""}" data-action="rule-toggle" data-id="${r.id}" role="switch" aria-checked="${r.enabled ? "true" : "false"}" aria-label="${r.enabled ? "Desativar" : "Ativar"} regra"><span class="switch__knob"></span></button>
    <button class="icon-btn" data-action="rule-edit" data-id="${r.id}" aria-label="Editar regra">${svgIcon("pencil", 14)}</button>
    <button class="icon-btn" data-action="rule-delete" data-id="${r.id}" aria-label="Excluir regra">${svgIcon("trash", 14)}</button>
  </div>`;
}

function renderRuleForm(form) {
  const compiled = compileRulePattern(form.pattern, form.matchType);
  const typeMeta = RULE_MATCH_TYPES.find((m) => m.id === form.matchType) || RULE_MATCH_TYPES[0];
  const canSave = compiled.ok && !!form.categoryId;

  return `<div class="rule-form">
    <div class="field">
      <label class="field__label" for="rule-pattern-input">Texto que a regra procura</label>
      <input id="rule-pattern-input" class="input" data-field="rule-pattern" value="${escapeHtml(form.pattern)}"
        placeholder="Ex: ipiranga" autocomplete="off" maxlength="120" />
      ${form.pattern && !compiled.ok ? `<p class="rule-row__error">${svgIcon("alertTriangle", 12)} ${escapeHtml(compiled.error)}</p>` : `<p class="field-hint">Acentos e maiúsculas não importam.</p>`}
    </div>

    <div class="field">
      <label class="field__label" for="rule-type-select">Como comparar</label>
      <select class="input" id="rule-type-select" data-action-select="rule-type">
        ${RULE_MATCH_TYPES.map((m) => `<option value="${m.id}" ${form.matchType === m.id ? "selected" : ""}>${escapeHtml(m.label)}</option>`).join("")}
      </select>
      <p class="field-hint">${escapeHtml(typeMeta.hint)}</p>
    </div>

    <div class="field">
      <label class="field__label" for="rule-category-select">Categoria de destino</label>
      <select class="input" id="rule-category-select" data-action-select="rule-category">
        <option value="">Escolha uma categoria</option>
        ${rulesCategoryOptions(form.categoryId)}
      </select>
    </div>

    <div class="field">
      <label class="field__label" for="rule-weight-input">Peso (${RULE_WEIGHT_MIN} a ${RULE_WEIGHT_MAX})</label>
      <input id="rule-weight-input" class="input input--budget" type="number" min="${RULE_WEIGHT_MIN}" max="${RULE_WEIGHT_MAX}" step="1"
        data-field="rule-weight" value="${escapeHtml(String(form.weight))}" inputmode="numeric" />
      <p class="field-hint">Só importa quando duas regras casam com a mesma descrição. O padrão (${RULE_WEIGHT_DEFAULT}) já ganha de todas as de fábrica.</p>
    </div>

    <div class="settings-actions">
      <button class="btn btn--ghost btn--sm" data-action="rule-cancel">Cancelar</button>
      <button class="btn btn--primary btn--sm" data-action="rule-save" ${canSave ? "" : "disabled"}>${svgIcon("check", 15)} ${form.id ? "Salvar regra" : "Criar regra"}</button>
    </div>
  </div>`;
}

// ---- Aplicar ao que já está gravado ----
// Só mexe em despesas que estão em "Outros". Recategorizar o histórico inteiro
// apagaria correções feitas à mão; e a pessoa que corrigiu à mão é exatamente
// a que mais confia no app.
function renderRuleApplyCard() {
  const preview = state.rules.applyPreview;
  return `<div class="card">
    <p class="card-title">Aplicar aos lançamentos antigos</p>
    <p class="card-subtitle" data-ui-css="margin-top:0">Passa as regras atuais pelas despesas que estão em “Outros”. Nada que você já categorizou à mão é tocado.</p>

    ${preview ? (preview.count === 0
      ? `<div class="inline-note">${svgIcon("checkCircle", 16)}<span>Nenhum lançamento em “Outros” casou com as regras atuais.</span></div>`
      : `<div class="inline-note">${svgIcon("info", 16)}<span><b>${preview.count}</b> lançamento(s) mudariam de categoria.</span></div>
         <div class="rule-preview-list">
           ${preview.changes.slice(0, 8).map((c) => `<div class="rule-preview-row">
             <span class="rule-preview-row__desc">${escapeHtml(c.description || "(sem descrição)")}</span>
             <span class="rule-preview-row__to">${svgIcon("arrowRight", 13)} ${escapeHtml(categoryById(state.data, c.to).name)}</span>
           </div>`).join("")}
           ${preview.count > 8 ? `<p class="footnote" data-ui-css="text-align:left">e mais ${preview.count - 8}.</p>` : ""}
         </div>`) : ""}

    <div class="settings-actions" data-ui-css="margin-top:12px">
      ${preview
        ? `<button class="btn btn--ghost btn--sm" data-action="rule-apply-cancel">Cancelar</button>
           ${preview.count > 0 ? `<button class="btn btn--primary btn--sm" data-action="rule-apply-confirm">${svgIcon("check", 15)} Recategorizar ${preview.count}</button>` : ""}`
        : `<button class="btn btn--secondary btn--sm" data-action="rule-apply-preview">${svgIcon("refresh", 15)} Ver o que mudaria</button>`}
    </div>
  </div>`;
}

// ---- Regras de fábrica ----
// Não são editáveis, e isso é deliberado: elas evoluem com o app, e uma cópia
// congelada no aparelho de cada usuário deixaria de receber correções. O que o
// usuário controla é se cada uma vale e para onde ela aponta.
function renderBuiltinRulesCard(cfg) {
  const open = state.rules.showBuiltins;
  const changed = Object.keys(cfg.builtin).length;

  return `<div class="card">
    <div class="settings-row-header">
      <div>
        <p class="card-title" data-ui-css="margin:0">Regras de fábrica</p>
        <p class="card-subtitle" data-ui-css="margin:2px 0 0">${BUILTIN_CATEGORY_RULES.length} dicionários prontos${changed > 0 ? ` · ${changed} alterado(s) por você` : ""}</p>
      </div>
      <button class="btn btn--ghost btn--sm" data-action="rules-toggle-builtins">
        ${open ? "Ocultar" : "Ver todas"} ${svgIcon(open ? "chevronUp" : "chevronDown", 14)}
      </button>
    </div>

    ${!open ? "" : `<div class="rule-list">
      ${BUILTIN_CATEGORY_RULES.map((rule) => {
        const o = cfg.builtin[rule.id] || {};
        const enabled = o.enabled !== false;
        const targetId = o.categoryId || rule.categoryId;
        const cat = categoryById(state.data, targetId);
        return `<div class="rule-row rule-row--builtin ${enabled ? "" : "rule-row--off"}">
          <span class="icon-bubble icon-bubble--sm" data-ui-css="background:color-mix(in srgb, ${cat.color} 14%, transparent); color:${cat.color}">${svgIcon(cat.icon, 15)}</span>
          <div class="rule-row__text">
            <p class="rule-row__pattern">${escapeHtml(rule.label)}</p>
            <p class="rule-row__meta">${escapeHtml(rule.sample)}</p>
          </div>
          <button class="switch ${enabled ? "active" : ""}" data-action="rule-builtin-toggle" data-id="${rule.id}" role="switch" aria-checked="${enabled ? "true" : "false"}" aria-label="${enabled ? "Desativar" : "Ativar"} ${escapeHtml(rule.label)}"><span class="switch__knob"></span></button>
          <select class="input rule-row__select" data-action-select="rule-builtin-category" data-id="${rule.id}" ${enabled ? "" : "disabled"}>
            ${rulesCategoryOptions(targetId)}
          </select>
        </div>`;
      }).join("")}
      ${changed > 0 ? `<button class="btn btn--ghost btn--sm btn--block" data-action="rules-builtin-reset" data-ui-css="margin-top:8px">${svgIcon("refresh", 15)} Restaurar as ${changed} regra(s) de fábrica alterada(s)</button>` : ""}
    </div>`}
  </div>`;
}
