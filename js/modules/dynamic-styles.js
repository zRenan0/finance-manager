const INVALID_CSS = /(?:url\s*\(|expression\s*\(|@import|[{}<>]|\/\*|\*\/|\\)/i;
const PROPERTY = /^(?:--)?[a-z][a-z0-9-]*$/i;

function sanitizeDeclarations(input) {
  const source = String(input || "").trim();
  if (!source || source.length > 1000 || INVALID_CSS.test(source)) {
    throw new TypeError("Declaração visual inválida");
  }

  const declarations = source.split(";").map((part) => part.trim()).filter(Boolean);
  if (!declarations.length || declarations.length > 12) {
    throw new TypeError("Quantidade de declarações visuais inválida");
  }

  return declarations.map((declaration) => {
    const separator = declaration.indexOf(":");
    if (separator <= 0) throw new TypeError("Propriedade visual inválida");
    const property = declaration.slice(0, separator).trim();
    const value = declaration.slice(separator + 1).trim();
    if (!PROPERTY.test(property) || !value || value.length > 240 || INVALID_CSS.test(value)) {
      throw new TypeError("Valor visual inválido");
    }
    return `${property}:${value}`;
  }).join(";");
}

function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

export function createDynamicStyleController(doc = document) {
  const rules = new Map();
  const pending = new Map();
  let observer = null;

  function sheet() {
    const link = doc.querySelector("link[data-dynamic-styles]");
    if (!link || !link.sheet) return null;
    try {
      void link.sheet.cssRules;
      return link.sheet;
    } catch (_) {
      return null;
    }
  }

  function insert(className, declarations) {
    if (rules.has(className)) return true;
    const target = sheet();
    if (!target) {
      pending.set(className, declarations);
      return false;
    }
    target.insertRule(`.${className}{${declarations}}`, target.cssRules.length);
    rules.set(className, declarations);
    pending.delete(className);
    return true;
  }

  function flush() {
    pending.forEach((declarations, className) => insert(className, declarations));
  }

  function className(input) {
    const declarations = sanitizeDeclarations(input);
    const name = `ui-d-${hash(declarations)}`;
    insert(name, declarations);
    return name;
  }

  function hydrate(root = doc) {
    const nodes = [];
    if (root.nodeType === 1 && root.matches("[data-ui-css]")) nodes.push(root);
    if (typeof root.querySelectorAll === "function") nodes.push(...root.querySelectorAll("[data-ui-css]"));

    nodes.forEach((node) => {
      try {
        node.classList.add(className(node.getAttribute("data-ui-css")));
      } catch (_) {
        node.setAttribute("data-ui-style-rejected", "");
      } finally {
        node.removeAttribute("data-ui-css");
      }
    });
    flush();
  }

  function observe(root = doc.documentElement) {
    if (observer || typeof MutationObserver === "undefined") return;
    const link = doc.querySelector("link[data-dynamic-styles]");
    if (link) link.addEventListener("load", flush, { once: true });
    hydrate(doc);
    observer = new MutationObserver((records) => {
      records.forEach((record) => {
        if (record.type === "attributes") hydrate(record.target);
        record.addedNodes.forEach((node) => {
          if (node.nodeType === 1) hydrate(node);
        });
      });
    });
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-ui-css"] });
  }

  return Object.freeze({ className, hydrate, observe });
}
