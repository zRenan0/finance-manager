"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUTPUT = path.join(ROOT, "js", "modules", "app.generated.js");

const SOURCES = Object.freeze([
  "js/utils.js",
  "js/perf.js",
  "js/router.js",
  "js/icons.js",
  "js/rules.js",
  "js/layout.js",
  "js/safe-errors.js",
  "js/storage.js",
  "js/backup-crypto.js",
  "js/auth.js",
  "js/cloud-sync.js",
  "js/accounts.js",
  "js/movements.js",
  "js/data-sources.js",
  "js/debts.js",
  "js/budgets.js",
  "js/charts.js",
  "js/pdf.js",
  "js/import.js",
  "js/pdf-import.js",
  "js/nlp.js",
  "js/score.js",
  "js/metrics.js",
  "js/health.js",
  "js/wealth.js",
  "js/goals.js",
  "js/forecast.js",
  "js/transparency.js",
  "js/calendar.js",
  "js/recurring.js",
  "js/analytics.js",
  "js/insights.js",
  "js/assistant.js",
  "js/contextual-assistant.js",
  "js/advisor.js",
  "js/investments.js",
  "js/portfolio.js",
  "js/simulators.js",
  "js/qrcode.js",
  "js/achievements.js",
  "js/wrapped.js",
  "js/services.js",
  "js/screens/_shared.js",
  "js/screens/onboarding.js",
  "js/screens/dashboard.js",
  "js/screens/accounts.js",
  "js/screens/debts.js",
  "js/screens/add.js",
  "js/screens/analytics.js",
  "js/screens/goals.js",
  "js/screens/calendar.js",
  "js/screens/health.js",
  "js/screens/wealth.js",
  "js/screens/portfolio.js",
  "js/screens/invest.js",
  "js/screens/simulators.js",
  "js/screens/simulate.js",
  "js/screens/insights.js",
  "js/screens/subscriptions.js",
  "js/screens/notifications.js",
  "js/screens/achievements.js",
  "js/screens/import.js",
  "js/screens/all.js",
  "js/screens/rules.js",
  "js/screens/categories.js",
  "js/screens/settings.js",
  "js/screens/privacy.js",
  "js/screens/account.js",
  "js/screens/modals.js",
  "js/actions.js",
  "js/app.js",
]);

function normalize(source) {
  return source.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trimEnd();
}

function build() {
  const banner = [
    "// Arquivo gerado por scripts/build-app-module.js.",
    "// Edite os arquivos de origem em js/ e execute npm run build.",
    "",
  ].join("\n");

  const body = SOURCES.map((relativePath) => {
    const absolutePath = path.join(ROOT, relativePath);
    if (!fs.existsSync(absolutePath)) throw new Error(`Fonte ausente: ${relativePath}`);
    return `// source: ${relativePath}\n${normalize(fs.readFileSync(absolutePath, "utf8"))}`;
  }).join("\n\n");

  return `${banner}${body}\n`;
}

// Só executa quando chamado direto. Sem esta guarda, qualquer `require` deste
// arquivo (a análise estática precisa da lista `SOURCES`) dispararia o build
// como efeito colateral.
if (require.main === module) {
  const expected = build();
  if (process.argv.includes("--check")) {
    const current = fs.existsSync(OUTPUT) ? normalize(fs.readFileSync(OUTPUT, "utf8")) + "\n" : "";
    if (current !== expected) {
      console.error("js/modules/app.generated.js está desatualizado. Execute npm run build.");
      process.exit(1);
    }
    console.log(`Módulo gerado conferido a partir de ${SOURCES.length} fontes.`);
  } else {
    fs.writeFileSync(OUTPUT, expected, "utf8");
    console.log(`Módulo ES gerado a partir de ${SOURCES.length} fontes.`);
  }
}

module.exports = { SOURCES, build };
