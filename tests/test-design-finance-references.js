// Regressão do dashboard progressivo, acessibilidade móvel e referências financeiras.
"use strict";

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

// A lista de telas é lida do diretório: uma folha de estilo nova entra na
// conferência de contraste sozinha, sem depender de alguém lembrar de citá-la.
const css = ["base.css", "layout.css", "components.css", "utilities.css"]
  .concat(fs.readdirSync(path.join(ROOT, "css", "screens")).sort().map((nome) => "screens/" + nome))
  .map((file) => read("css/" + file)).join("\n");
const app = read("js/app.js");
const actions = read("js/actions.js");
const dashboard = read("js/screens/dashboard.js");
const settings = read("js/screens/settings.js");
const storage = read("js/storage.js");
const investments = read("js/investments.js");
const simulators = read("js/simulators.js");
const simulatorScreen = read("js/screens/simulators.js");
const calendar = read("js/calendar.js");

let ok = 0;
let fail = 0;
function check(label, condition, extra) {
  if (condition) { ok++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${extra == null ? "" : ` → ${extra}`}`); }
}

function luminance(hex) {
  const rgb = (hex.match(/[0-9a-f]{2}/gi) || []).map((part) => parseInt(part, 16) / 255);
  const linear = rgb.map((value) => value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}
function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

console.log("\n1. Dashboard e navegação móvel");
{
  const mobileBlock = (app.match(/const MOBILE_NAV = \[([\s\S]*?)\];/) || [])[1] || "";
  const ids = Array.from(mobileBlock.matchAll(/id:\s*"([^"]+)"/g), (match) => match[1]);
  const labels = Array.from(mobileBlock.matchAll(/label:\s*"([^"]+)"/g), (match) => match[1]);
  const ariaLabels = Array.from(mobileBlock.matchAll(/ariaLabel:\s*"([^"]+)"/g), (match) => match[1]);
  check("a navegação móvel tem cinco destinos", ids.length === 5, ids.join(","));
  check("os destinos seguem a hierarquia definida",
    JSON.stringify(ids) === JSON.stringify(["dashboard", "analytics", "add", "calendar", "all"]), ids.join(","));
  check("os cinco rótulos esperados estão presentes",
    ["Início", "Movimentos", "Adicionar", "Planejar", "Recursos"].every((label) => labels.includes(label)));
  check("os nomes acessíveis contêm os rótulos curtos",
    ["Movimentos, abrir Movimentações", "Planejar, abrir Planejamento"].every((label) => ariaLabels.includes(label)));
  check("o painel principal tem uma única ação primária", (dashboard.match(/hero-action--primary/g) || []).length === 1);
  check("ações secundárias são limitadas a duas", dashboard.includes("return actions.slice(0, 2)"));
  check("os cinco atalhos antigos saíram do painel", !dashboard.includes("hero-tool-btn"));
}

console.log("\n2. Contraste e toque");
{
  const rootBlock = (css.match(/:root\s*\{([\s\S]*?)\n\}/) || [])[1] || "";
  const darkBlock = (css.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/) || [])[1] || "";
  const token = (block, name) => ((block.match(new RegExp(`--${name}:\\s*#([0-9A-Fa-f]{6})`)) || [])[1] || "000000");
  const lightFaint = token(rootBlock, "ink-faint");
  const lightPaper = token(rootBlock, "paper");
  const lightCard = token(rootBlock, "card");
  const darkFaint = token(darkBlock, "ink-faint");
  const darkPaper = token(darkBlock, "paper");
  const darkCard = token(darkBlock, "card");
  const lightMin = Math.min(contrast(lightFaint, lightPaper), contrast(lightFaint, lightCard));
  const darkMin = Math.min(contrast(darkFaint, darkPaper), contrast(darkFaint, darkCard));
  check("ink-faint claro passa de 4,5:1", lightMin >= 4.5, lightMin.toFixed(2));
  check("ink-faint escuro passa de 4,5:1", darkMin >= 4.5, darkMin.toFixed(2));
  // O CONTORNO É O QUE DIZ ONDE SE PODE TOCAR.
  //
  // `--border` sozinho ficava em 1,24:1 (claro) e 1,32:1 (escuro) contra o fundo
  // do próprio controle: campo, chip e botão de ícone se dissolviam no cartão, e
  // no escuro a folha modal tinha quase a cor da página. A régua da WCAG 1.4.11
  // para limite de componente é 3:1, e é ela que estes números seguram.
  const lightStrong = token(rootBlock, "border-strong");
  const darkStrong = token(darkBlock, "border-strong");
  const lightRaised = token(rootBlock, "surface-raised");
  const darkRaised = token(darkBlock, "surface-raised");
  const menorContorno = (borda, card, paper, raised) =>
    Math.min(contrast(borda, card), contrast(borda, paper), contrast(borda, raised));
  const contornoClaro = menorContorno(lightStrong, lightCard, lightPaper, lightRaised);
  const contornoEscuro = menorContorno(darkStrong, darkCard, darkPaper, darkRaised);
  check("contorno de controle claro passa de 3:1", contornoClaro >= 3, contornoClaro.toFixed(2));
  check("contorno de controle escuro passa de 3:1", contornoEscuro >= 3, contornoEscuro.toFixed(2));
  // Token definido e não usado seria só uma promessa: estes são os controles em
  // que a pessoa esbarra primeiro, um por família (campo, chip, folha).
  const usaContornoForte = [".input", ".chip", ".payment-chip", ".cat-icon-option", ".cat-parent-option"];
  const semContornoForte = usaContornoForte.filter((seletor) => {
    const regra = css.slice(css.indexOf("\n" + seletor + " {"));
    return !regra.slice(0, regra.indexOf("}")).includes("var(--border-strong)");
  });
  check("os controles usam o contorno forte", semContornoForte.length === 0, semContornoForte.join(","));
  check("a folha modal usa a superfície elevada",
    /\.modal-sheet \{[^}]*background: var\(--surface-raised\)/.test(css));

  check("controles de toque recebem 44 px", /@media \(pointer: coarse\)[\s\S]*min-height:\s*44px/.test(css));
  check("navegação móvel não volta a texto de 9 ou 10 px", !/bottom-nav__item[^}]*font-size:\s*(?:9|10)px/.test(css));
}

console.log("\n3. Gamificação opcional");
{
  check("gamificação nasce desligada", /defaultAchievements\(\)\s*\{\s*return \{ enabled: false/.test(storage));
  check("Ajustes oferece o controle", settings.includes('data-action="toggle-gamification"'));
  check("o controle tem ação implementada", actions.includes('case "toggle-gamification"'));
  check("sincronização respeita a preferência", app.includes("if (!record.enabled) return"));
}

console.log("\n4. Referências financeiras");
{
  check("atalhos de investimento são derivados", investments.includes("function investmentRatePresets"));
  check("atalho sem fonte de ações foi removido", !investments.includes("Ações (hist.)"));
  check("FGC cita conglomerado e teto de quatro anos", /conglomerado[\s\S]*R\$ 1 milhão em quatro anos/.test(storage));
  check("calendário não fixa 31 de maio", !calendar.includes("31 de maio"));
  check("FGTS aplica piso do IPCA", simulators.includes("Math.max(requestedFgtsAnnual, ipca)"));
  check("saque-aniversário informa a carência de 25 meses", simulatorScreen.includes("25º mês"));
  check("premissas sem revisão são chamadas de exemplos", settings.includes("Exemplos iniciais, não cotações atuais"));
}

/* ==============================================================================
 * Fontes, vigência e premissas (item 10 da auditoria)
 * ==============================================================================
 * Cada número que o app exibe precisa vir de: dado do usuário, norma citada, ou
 * premissa declarada. Este bloco garante que a documentação existe e que o
 * código aponta para ela.
 */
console.log("\nFontes oficiais, vigência e premissas");
{
  const fontes = read("docs/FONTES-FINANCEIRAS.md");
  const debts = read("js/debts.js");
  const portfolio = read("js/portfolio.js");

  check("o documento de fontes existe e tem data de revisão", /Última revisão do conteúdo/.test(fontes));

  // Cada cálculo corrigido precisa da norma citada, com número identificável.
  const normas = [
    ["IR regressivo", /Lei 11\.033\/2004/],
    ["IOF de curto prazo", /Decreto 6\.306\/2007/],
    ["prazo do rotativo", /Resolução CMN 4\.549\/2017/],
    ["teto de encargos do cartão", /Lei 14\.690\/2023/],
    ["consórcio", /Lei 11\.795\/2008/],
    ["CET", /Resolução CMN 4\.881\/2020/],
    ["quitação antecipada", /art\. 52/],
    ["limite de recomendação de investimento", /Resoluç(ão|ões) CVM (19|30)\/2021/],
    ["FGTS", /Lei 8\.036\/1990/],
    ["poupança", /Lei 12\.703\/2012/],
  ];
  normas.forEach(([nome, re]) => check(`fonte citada: ${nome}`, re.test(fontes)));

  // As premissas que sobraram precisam estar listadas como premissas, e não
  // apresentadas como fato.
  check("as premissas pendentes estão listadas", /Premissas que ainda dependem de decisão externa/.test(fontes));
  check("a premissa da taxa de parcelamento está declarada", /CARD_INSTALLMENT_DEFAULT_PCT/.test(fontes));
  check("o documento registra a remoção do desconto de 0,8%", /0,8% ao mês/.test(fontes));

  // O código aponta para o documento onde o número não é auto-explicativo.
  check("o simulador de cartão aponta para as fontes", /FONTES-FINANCEIRAS\.md/.test(simulators));
  check("as regras tributárias são versionadas com vigência", /TAX_RULES/.test(simulators) && /since:/.test(simulators));
  check("a tabela de IR cita a lei no próprio código", /Lei 11\.033\/2004/.test(simulators));
  check("o cálculo de dívida cita o CDC na quitação", /art\. 52/.test(debts));
  check("a carteira cita o limite da CVM no próprio código", /CVM/.test(portfolio));

  // Nenhum número mágico sem origem nos pontos já corrigidos. A checagem olha
  // para CÓDIGO, não para comentário: o comentário que explica a remoção do
  // 0,8% precisa continuar lá, senão o defeito volta na próxima refatoração.
  const codigoSimuladores = simulators.split("\n")
    .filter((linha) => !/^\s*(\/\/|\*|\/\*)/.test(linha)).join("\n");
  check("o desconto de 0,8% saiu do código do consórcio", !/1\.008/.test(codigoSimuladores));
  check("o motivo da remoção continua registrado no código", /0,8% ao/.test(simulators));
  check("a taxa do parcelamento não é mais derivada do rotativo",
    !/monthlyPct - 7/.test(simulators));
}

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} — ${ok} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
