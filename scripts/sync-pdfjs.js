"use strict";

// Copia somente os arquivos usados no navegador. `pdfjs-dist` continua sendo
// dependência de build; a aplicação publicada recebe arquivos estáticos e não
// precisa de Node nem de qualquer serviço para ler o PDF.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PACKAGE_DIR = path.join(ROOT, "node_modules", "pdfjs-dist");
const OUTPUT_DIR = path.join(ROOT, "vendor", "pdfjs");
const FILES = Object.freeze([
  ["legacy/build/pdf.min.mjs", "pdf.min.mjs"],
  ["legacy/build/pdf.worker.min.mjs", "pdf.worker.min.mjs"],
  ["LICENSE", "LICENSE"],
]);

function syncPdfJs() {
  if (!fs.existsSync(PACKAGE_DIR)) {
    throw new Error("pdfjs-dist não está instalado. Execute npm install antes do build.");
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  FILES.forEach(([source, target]) => {
    const input = path.join(PACKAGE_DIR, ...source.split("/"));
    const output = path.join(OUTPUT_DIR, target);
    if (!fs.existsSync(input)) throw new Error(`Arquivo do PDF.js ausente: ${source}`);
    fs.copyFileSync(input, output);
  });
  console.log(`PDF.js sincronizado em vendor/pdfjs com ${FILES.length} arquivos.`);
}

if (require.main === module) syncPdfJs();

module.exports = { FILES, syncPdfJs };
