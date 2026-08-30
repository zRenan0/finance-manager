"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const runner = path.join(__dirname, "run-browser.js");
const failures = [];

for (const browser of ["chromium", "firefox", "webkit"]) {
  const result = spawnSync(process.execPath, [runner], {
    cwd: path.join(__dirname, "..", ".."),
    env: { ...process.env, COFRE_BROWSER: browser },
    stdio: "inherit",
  });
  if (result.status !== 0) failures.push(browser);
}

if (failures.length) {
  console.error(`\nFalharam no navegador: ${failures.join(", ")}`);
  process.exit(1);
}

console.log("\nFluxos aprovados em Chromium, Firefox e WebKit.");
