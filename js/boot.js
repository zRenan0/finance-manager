// boot.js: configuração mínima executada antes da primeira pintura
"use strict";

(function applyInitialTheme() {
  // [M42] A CHAVE GUARDA A ESCOLHA, NÃO O RESULTADO DELA.
  //
  // Antes ela guardava só "dark" ou "light", e o app gravava ali a preferência
  // do sistema lida no primeiro uso. Dali em diante a chave dizia "a pessoa
  // escolheu", quando na verdade ninguém tinha escolhido nada: quem instalava o
  // app com o aparelho no escuro ficava no escuro para sempre, inclusive depois
  // de trocar o sistema para claro. Medido: sistema em claro,
  // `prefers-color-scheme: dark` falso, e o app continuava com
  // `data-theme="dark"`.
  //
  // Agora "system" é um valor de primeira classe e é o padrão. Ele é resolvido
  // AQUI, a cada abertura, contra a preferência atual do aparelho; "light" e
  // "dark" continuam sendo escolha explícita e continuam mandando.
  try {
    var escolha = localStorage.getItem("financas_theme");
    if (escolha !== "dark" && escolha !== "light") escolha = "system";
    var resolvido = escolha === "system" ? preferenciaDoSistema() : escolha;
    document.documentElement.setAttribute("data-theme", resolvido);
    applyThemeColorMeta(resolvido);
  } catch (error) {
    document.documentElement.setAttribute("data-theme", "light");
    applyThemeColorMeta("light");
  }

  function preferenciaDoSistema() {
    try {
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch (e) {
      return "light";
    }
  }

  // A COR DA BARRA DE STATUS SEGUE O TEMA EM VIGOR.
  //
  // Antes havia duas etiquetas `theme-color` presas a `prefers-color-scheme`.
  // Mas o tema do app pode ser ESCOLHA da pessoa: quem usa o aparelho no escuro
  // e o app no claro recebia a cor errada, e no app instalado na tela de início
  // é ela que pinta a faixa da barra de status. Uma etiqueta só, reescrita aqui
  // antes da primeira pintura e mantida por `applyTheme()` (js/app.js), acerta
  // os dois casos, inclusive o "system", que já chega resolvido acima.
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
