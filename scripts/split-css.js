"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "css", "style.css");
const source = fs.readFileSync(sourcePath, "utf8").replace(/\r\n/g, "\n");

if (/^@import url\("base\.css"\);/m.test(source)) {
  console.log("CSS já está separado.");
  process.exit(0);
}

const lines = source.split("\n");
const parts = [
  ["base.css", 1, 278],
  ["layout.css", 279, 433],
  ["components.css", 434, 1655],
  ["utilities.css", 1656, 2108],
  ["screens/dashboard.css", 2109, 2260],
  ["screens/health.css", 2261, 2428],
  ["screens/wealth.css", 2429, 2616],
  ["screens/planning.css", 2617, 2910],
  ["screens/investments.css", 2911, 3104],
  ["screens/intelligence.css", 3105, 3379],
  ["screens/notifications-onboarding.css", 3380, 3590],
  ["screens/personalization.css", 3591, lines.length],
];

for (const [relative, first, last] of parts) {
  const destination = path.join(root, "css", relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, `${lines.slice(first - 1, last).join("\n").trim()}\n`, "utf8");
}

const imports = parts
  .map(([relative]) => `@import url("${relative.replace(/\\/g, "/")}");`)
  .join("\n");
fs.writeFileSync(sourcePath, `/* Ponto único de entrada. A ordem mantém a cascata anterior. */\n${imports}\n`, "utf8");
console.log(`CSS separado em ${parts.length} arquivos.`);
