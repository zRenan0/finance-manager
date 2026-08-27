// boot.js: configuração mínima executada antes da primeira pintura
"use strict";

(function applyInitialTheme() {
  try {
    let theme = localStorage.getItem("financas_theme");
    if (theme !== "dark" && theme !== "light") {
      theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    document.documentElement.setAttribute("data-theme", theme);
    applyThemeColorMeta(theme);
  } catch (error) {
    document.documentElement.setAttribute("data-theme", "light");
    applyThemeColorMeta("light");
  }

  // A COR DA BARRA DE STATUS SEGUE O TEMA ESCOLHIDO, NÃO O DO SISTEMA.
  //
  // Antes havia duas etiquetas `theme-color` presas a `prefers-color-scheme`.
  // Mas o tema do app é ESCOLHA da pessoa e mora no localStorage: quem usa o
  // aparelho no escuro e o app no claro recebia a cor errada, e no app
  // instalado na tela de início é ela que pinta a faixa da barra de status.
  // Uma etiqueta só, reescrita aqui antes da primeira pintura e mantida por
  // `applyTheme()` (js/app.js), acerta os dois casos.
  //
  // Os dois valores são o `--paper` de cada tema em css/base.css. Ficam
  // repetidos aqui de propósito: este arquivo roda ANTES de a folha existir,
  // então não há de onde ler. Mudou lá, muda aqui.
  function applyThemeColorMeta(theme) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    meta.setAttribute("content", theme === "dark" ? "#070C0B" : "#EFF2F0");
  }
})();
