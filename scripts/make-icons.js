// make-icons.js. Gera os PNG do ícone do app a partir de icons/cofre-mark.svg.
//
// Uso: node scripts/make-icons.js
//
// A fonte da verdade é o SVG: é o mesmo desenho que `svgIcon("cofre")` pinta
// na navegação e que a landing usa na marca. Daqui saem três arquivos:
//
//   icons/icon-192.png           favicon e ícone de toque (fundo arredondado,
//   icons/icon-512.png           cantos transparentes)
//   icons/icon-maskable-512.png  ícone "maskable" do manifesto: fundo cheio e
//                                desenho dentro da zona segura (círculo central
//                                de 80%), porque o sistema recorta a forma.
//
// Usa o Chromium do Playwright (já dependência de desenvolvimento dos testes
// de navegador) para rasterizar. Nenhuma biblioteca de imagem a mais.
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const BRAND = "#0B6B5C";          // --brand do tema claro (css/base.css)
const MARK = fs.readFileSync(path.join(ROOT, "icons", "cofre-mark.svg"), "utf8")
  .replace('stroke="currentColor"', 'stroke="#ffffff"');

function tile(size, { radius, markScale }) {
  const box = Math.round(size * markScale);
  const offset = Math.round((size - box) / 2);
  return `<div class="tile" style="width:${size}px;height:${size}px;border-radius:${radius}px;background:${BRAND}">
    <div style="position:absolute;left:${offset}px;top:${offset}px;width:${box}px;height:${box}px">${MARK}</div>
  </div>`;
}

const page = `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:transparent}.tile{position:relative;overflow:hidden;margin:0 0 20px}svg{display:block;width:100%;height:100%}</style>
${tile(512, { radius: 112, markScale: 0.66 })}
${tile(192, { radius: 42, markScale: 0.66 })}
${tile(512, { radius: 0, markScale: 0.5 })}`;

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.COFRE_CHROMIUM || undefined,
  });
  const tab = await browser.newPage({ viewport: { width: 600, height: 1300 }, deviceScaleFactor: 1 });
  await tab.setContent(page);
  const tiles = await tab.$$(".tile");
  const nomes = ["icon-512.png", "icon-192.png", "icon-maskable-512.png"];
  for (let i = 0; i < tiles.length; i++) {
    const destino = path.join(ROOT, "icons", nomes[i]);
    await tiles[i].screenshot({ path: destino, omitBackground: true });
    console.log(`${nomes[i]}: ${fs.statSync(destino).size} bytes`);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
