// icons.js; ícones SVG desenhados como formas simples (sem bibliotecas externas)
"use strict";

const ICONS = {
  home: '<path d="M3 10.5 12 4l9 6.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
  food: '<path d="M6 2.5v7a2 2 0 0 0 4 0v-7"/><path d="M8 9.5V21"/><path d="M17 2.5c-1.6.3-3 1.9-3 4.2 0 2 1.1 3.6 3 4.1V21"/>',
  transport: '<path d="M4.5 16V11l2-5.5h11l2 5.5v5"/><path d="M4.5 16h15"/><circle cx="8" cy="17.7" r="1.6"/><circle cx="16" cy="17.7" r="1.6"/>',
  leisure: '<polygon points="12 3 14.5 9 21 9.5 16 13.8 17.5 20 12 16.5 6.5 20 8 13.8 3 9.5 9.5 9"/>',
  health: '<path d="M12 20.3s-7.4-4.5-9.2-8.9A5 5 0 0 1 12 6.3 5 5 0 0 1 21.2 11.4c-1.8 4.4-9.2 8.9-9.2 8.9Z"/>',
  education: '<polygon points="12 4 22 9 12 14 2 9"/><path d="M6.5 11.2V16c0 1.2 2.5 2.3 5.5 2.3s5.5-1.1 5.5-2.3v-4.8"/>',
  subscriptions: '<path d="M4 12a8 8 0 0 1 13.3-6" /><path d="M20 4v4.3h-4.3" /><path d="M20 12a8 8 0 0 1-13.3 6" /><path d="M4 20v-4.3h4.3" />',
  other: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  tag: '<path d="M20 12.5 12.5 20a1.5 1.5 0 0 1-2.1 0l-6.4-6.4a1.5 1.5 0 0 1 0-2.1L11.5 4H19a1 1 0 0 1 1 1v7.5Z"/><circle cx="15.3" cy="8.5" r="1.2"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  x: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
  check: '<polyline points="5 13 10 18 19 7"/>',
  trash: '<path d="M5 7h14"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M7 7l1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  pencil: '<path d="M4 20l1-4L15.5 5.5l3 3L8 19l-4 1Z"/><line x1="13.5" y1="7" x2="16.5" y2="10"/>',
  download: '<path d="M12 3v12"/><polyline points="7 11 12 16 17 11"/><path d="M5 19h14"/>',
  upload: '<path d="M12 21V9"/><polyline points="7 13 12 8 17 13"/><path d="M5 5h14"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>',
  chevronLeft: '<polyline points="15 5 8 12 15 19"/>',
  chevronRight: '<polyline points="9 5 16 12 9 19"/>',
  chevronDown: '<polyline points="5 8 12 15 19 8"/>',
  chevronUp: '<polyline points="7 14.5 12 9.5 17 14.5"/>',
  arrowUpRight: '<line x1="6" y1="18" x2="18" y2="6"/><polyline points="8 6 18 6 18 16"/>',
  arrowDownRight: '<line x1="6" y1="6" x2="18" y2="18"/><polyline points="18 8 18 18 8 18"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2"/><path d="M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-5"/><path d="M15 12h5v4h-5a2 2 0 0 1 0-4Z"/>',
  bank: '<path d="M3 9h18L12 3 3 9Z"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 21h18M4 18h16"/>',
  archive: '<rect x="3" y="5" width="18" height="4" rx="1"/><path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9"/><path d="M9 13h6"/>',
  arrowRight: '<line x1="4" y1="12" x2="20" y2="12"/><polyline points="14 6 20 12 14 18"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13a7.7 7.7 0 0 0 0-2l1.9-1.4-2-3.4-2.2.8a7.7 7.7 0 0 0-1.7-1l-.3-2.3H10l-.3 2.3a7.7 7.7 0 0 0-1.7 1l-2.2-.8-2 3.4L5.7 11a7.7 7.7 0 0 0 0 2l-1.9 1.4 2 3.4 2.2-.8a7.7 7.7 0 0 0 1.7 1l.3 2.3h4l.3-2.3a7.7 7.7 0 0 0 1.7-1l2.2.8 2-3.4-1.9-1.4Z"/>',
  pie: '<circle cx="12" cy="12" r="9"/><path d="M12 3v9l7 4"/>',
  layout: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  search: '<circle cx="10.3" cy="10.3" r="6.3"/><line x1="15" y1="15" x2="20.5" y2="20.5"/>',
  filter: '<path d="M4 5h16l-6.2 7.1V19l-3.6 2v-8.9Z"/>',
  alertTriangle: '<path d="M12 3.3 22 20H2Z"/><line x1="12" y1="9.3" x2="12" y2="14"/><circle cx="12" cy="16.8" r="0.9" fill="currentColor" stroke="none"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><polyline points="8 12.3 11 15.3 16 9"/>',
  shieldCheck: '<path d="M12 3 4.5 6v6c0 4.8 3.3 7.7 7.5 8.7 4.2-1 7.5-3.9 7.5-8.7V6Z"/><polyline points="8.3 12 11 14.7 15.7 9.3"/>',
  piggy: '<path d="M4.2 12.3a5.8 5.8 0 0 1 5.8-5.8h2.8a4.8 4.8 0 0 1 4.5 3.1l2.5.4v3.8l-2 .5v2.4l-2 1v1.8h-2v-1.4H9v1.4H7v-1.9c-1.7-.7-2.8-2.4-2.8-4.3Z"/><circle cx="8.6" cy="11.3" r="0.8" fill="currentColor" stroke="none"/><line x1="9.2" y1="6.5" x2="9.2" y2="4.7"/>',
  plane: '<path d="M3 12 21 4l-6 18-3.2-7.4L3 12Z"/><line x1="11.8" y1="14.6" x2="21" y2="4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><line x1="12" y1="2.5" x2="12" y2="4.5"/><line x1="12" y1="19.5" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="4.5" y2="12"/><line x1="19.5" y1="12" x2="21.5" y2="12"/><line x1="5" y1="5" x2="6.4" y2="6.4"/><line x1="17.6" y1="17.6" x2="19" y2="19"/><line x1="5" y1="19" x2="6.4" y2="17.6"/><line x1="17.6" y1="6.4" x2="19" y2="5"/>',
  moon: '<path d="M20 14.3A8.3 8.3 0 0 1 9.7 4 8.3 8.3 0 1 0 20 14.3Z"/>',
  cart: '<path d="M3 4h2l2.2 12.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L20.5 8H6.1"/><circle cx="10" cy="20.3" r="1.3"/><circle cx="17" cy="20.3" r="1.3"/>',
  briefcase: '<rect x="3" y="8" width="18" height="11.5" rx="1.8"/><path d="M8.5 8V6.3a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2V8"/><line x1="3" y1="13.3" x2="21" y2="13.3"/>',
  gift: '<rect x="4" y="9.5" width="16" height="10.5" rx="1.3"/><rect x="4" y="9.5" width="16" height="3.6"/><line x1="12" y1="9.5" x2="12" y2="20"/><path d="M12 9.5c-1.6 0-3-1.1-3-2.6C9 5.7 9.9 4.7 11 4.7c1.3 0 1.9 2 1 4.8"/><path d="M12 9.5c1.6 0 3-1.1 3-2.6 0-1.2-.9-2.2-2-2.2-1.3 0-1.9 2-1 4.8"/>',
  book: '<path d="M4 5.3A1.8 1.8 0 0 1 5.8 3.5H11v17H5.8A1.8 1.8 0 0 0 4 22.3V5.3Z"/><path d="M20 5.3a1.8 1.8 0 0 0-1.8-1.8H13v17h5.2a1.8 1.8 0 0 1 1.8 1.8V5.3Z"/>',
  coffee: '<path d="M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9Z"/><path d="M16 10.3h1.6a2.4 2.4 0 0 1 0 4.7H16"/><path d="M8 6.3c0-1 .8-1.1.8-2M11.5 6.3c0-1 .8-1.1.8-2"/>',
  monitor: '<rect x="3" y="4" width="18" height="13" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  phone: '<rect x="7.2" y="2.5" width="9.6" height="19" rx="2"/><line x1="10.8" y1="18.3" x2="13.2" y2="18.3"/>',
  tablet: '<rect x="4.5" y="2.5" width="15" height="19" rx="2"/><circle cx="12" cy="18.4" r="0.7" fill="currentColor" stroke="none"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.3 2.5 3.5 5.5 3.5 9S14.3 18.5 12 21M12 3C9.7 5.5 8.5 8.5 8.5 12s1.2 6.5 3.5 9"/>',
  creditCard: '<rect x="2.3" y="5.5" width="19.4" height="13" rx="2"/><line x1="2.3" y1="9.7" x2="21.7" y2="9.7"/><line x1="5.3" y1="15" x2="9.5" y2="15"/>',
  gasPump: '<path d="M4.5 21V6.3a2 2 0 0 1 2-2h4.5a2 2 0 0 1 2 2V21"/><line x1="3" y1="21" x2="13.5" y2="21"/><path d="M13 8.3h2.3l2.4 2.4V17a1.5 1.5 0 0 1-3 0v-2.7h-1.7"/><line x1="6.3" y1="9.3" x2="10.7" y2="9.3"/>',
  dumbbell: '<rect x="9" y="10" width="6" height="4" rx="1"/><rect x="3.3" y="8" width="3" height="8" rx="1"/><rect x="17.7" y="8" width="3" height="8" rx="1"/><line x1="6.3" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="17.7" y2="12"/>',
  paw: '<ellipse cx="12" cy="16.2" rx="4.4" ry="3.5"/><circle cx="5.8" cy="9.3" r="1.7"/><circle cx="10.4" cy="6" r="1.7"/><circle cx="13.6" cy="6" r="1.7"/><circle cx="18.2" cy="9.3" r="1.7"/>',
  tool: '<path d="M14.4 6.6a4 4 0 0 0-5.3 5.3L3.5 17.5l3 3 5.6-5.6a4 4 0 0 0 5.3-5.3l-2.7 2.7-2-2 2.7-2.7Z"/>',
  wifi: '<path d="M4 9.3a12 12 0 0 1 16 0"/><path d="M7 12.8a7.5 7.5 0 0 1 10 0"/><path d="M10 16.2a3 3 0 0 1 4 0"/><circle cx="12" cy="19.3" r="0.9" fill="currentColor" stroke="none"/>',
  bolt: '<polygon points="13 2 5 14 11 14 10 22 19 9 13 9 14 2"/>',
  drop: '<path d="M12 3s6.8 7.9 6.8 12.2A6.8 6.8 0 0 1 5.2 15.2C5.2 10.9 12 3 12 3Z"/>',
  star: '<polygon points="12 3.2 14.6 9.3 21.2 9.9 16.2 14.1 17.8 20.6 12 17 6.2 20.6 7.8 14.1 2.8 9.9 9.4 9.3"/>',
  trendUp: '<polyline points="3.5 16.5 10 10 14 14 20.5 6.5"/><polyline points="14.5 6.5 20.5 6.5 20.5 12.5"/>',
  sparkles: '<path d="M12 3v4M12 17v4M4.5 12h4M15.5 12h4M6.5 6.5l2.8 2.8M14.7 14.7l2.8 2.8M17.5 6.5l-2.8 2.8M9.3 14.7l-2.8 2.8"/>',
  loader: '<circle cx="12" cy="12" r="9" stroke-dasharray="42 14"/>',
  info: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16.5"/><circle cx="12" cy="7.7" r="0.9" fill="currentColor" stroke="none"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.2A9.9 9.9 0 0 1 12 5c5 0 9 4 10.5 7-0.6 1.2-1.5 2.5-2.7 3.6M6.5 6.6C4.4 8 2.8 10 1.5 12c1.5 3 5.5 7 10.5 7 1.4 0 2.7-0.3 3.9-0.8"/><path d="M9.9 10c-0.6 0.6-1 1.3-1 2.1 0 1.7 1.3 3 3 3 0.8 0 1.5-0.3 2-0.8"/>',
  scan: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8"/><path d="M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8"/><path d="M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16"/><path d="M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><line x1="4" y1="12" x2="20" y2="12"/>',
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1-1.8A1 1 0 0 1 9.9 4.7h4.2a1 1 0 0 1 .9.5L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z"/><circle cx="12" cy="13" r="3.4"/>',
  refresh: '<path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5"/><polyline points="20 4 20 8.5 15.5 8.5"/><path d="M20 12a8 8 0 0 1-13.7 5.7L4 15.5"/><polyline points="4 20 4 15.5 8.5 15.5"/>',
  file: '<path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M14 3.5V8h4"/>',
  bell: '<path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c0.5-0.5 2-2 2-6Z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  leaf: '<path d="M4 20c8 0 15-6 16-16-10 1-16 8-16 16Z"/><path d="M5 19c4-3 7-6 9-11"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><line x1="3.5" y1="9.7" x2="20.5" y2="9.7"/><line x1="8" y1="3" x2="8" y2="6.5"/><line x1="16" y1="3" x2="16" y2="6.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 6.8 12 12.3 15.8 14.4"/>',
  flag: '<line x1="5" y1="3.5" x2="5" y2="21"/><path d="M5 4.5h10.5l-1.4 3.6 1.4 3.6H5Z"/>',
};

const CATEGORY_ICON_CHOICES = [
  "home", "food", "cart", "transport", "gasPump", "leisure", "health", "education",
  "subscriptions", "phone", "wifi", "bolt", "drop", "briefcase", "creditCard", "gift",
  "book", "coffee", "dumbbell", "paw", "tool", "star", "tag", "other",
];

// [M4] A BUSCA PRECISA SER PELA CHAVE PRÓPRIA, NÃO PELA CADEIA DE PROTÓTIPOS.
//
// `normalizeIconName` (js/storage.js) aceita qualquer `[A-Za-z][A-Za-z0-9]{0,31}`,
// e isso inclui `constructor`, `toString` e `valueOf`. Um backup restaurado ou
// um registro sincronizado com `icon: "constructor"` passava pela normalização,
// caía em `ICONS[name]`, achava a função herdada de `Object.prototype` e a
// interpolava no SVG: a tela mostrava `function Object() { [native code] }`
// dentro do ícone. Não é injeção (o texto nativo não tem `<`), mas é conteúdo
// que ninguém escreveu aparecendo na interface a partir de um arquivo de fora.
// `hasOwnProperty` fecha isso e devolve o ícone padrão, como para qualquer
// outro nome desconhecido.
function svgIcon(name, size = 20, extraClass = "") {
  const body = Object.prototype.hasOwnProperty.call(ICONS, name) ? ICONS[name] : ICONS.tag;
  const cls = extraClass ? ` class="${extraClass}"` : "";
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${cls} aria-hidden="true">${body}</svg>`;
}
