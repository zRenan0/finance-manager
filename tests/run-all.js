"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const testsDir = __dirname;
const files = fs.readdirSync(testsDir)
  .filter((name) => /^test-.*\.js$/.test(name))
  .sort();

const failures = [];
for (const file of files) {
  process.stdout.write(`\n===== ${file} =====\n`);
  const result = spawnSync(process.execPath, [path.join(testsDir, file)], {
    cwd: path.join(testsDir, ".."),
    stdio: "inherit",
  });
  if (result.status !== 0) failures.push(file);
}

if (failures.length) {
  console.error(`\nFalharam: ${failures.join(", ")}`);
  process.exit(1);
}

console.log(`\nSuíte completa aprovada: ${files.length} arquivos de teste.`);
