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
  } catch (error) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
