"use strict";

// landing.js; comportamento da página comercial (landing.html).
//
// Princípios desta unidade:
//
//   1. NADA de conteúdo depende deste arquivo. Ele adiciona movimento e
//      duas interações de verdade (o simulador e o acordeão). Sem ele, a
//      página continua completa, legível e navegável.
//   2. Uma única escuta de rolagem, com as leituras e escritas agrupadas
//      dentro de um requestAnimationFrame. Vários listeners disputando o
//      mesmo quadro é a forma mais rápida de transformar animação em
//      travamento.
//   3. Só transform e opacity nas animações de rolagem. Largura, altura e
//      posição forçariam recálculo de layout a cada quadro.
//   4. A CSP do projeto proíbe estilo inline em atributo. As variações
//      calculadas aqui vão por CSSOM (setProperty), que é outro caminho.

(function () {
  var raiz = document.documentElement;

  // Primeira coisa que este arquivo faz: avisar que ele existe. O
  // js/landing-boot.js espera esta marca; sem ela, ele devolve a página
  // inteira sem animação em vez de deixar blocos escondidos para sempre.
  raiz.setAttribute("data-lp-ready", "on");

  var animar = raiz.getAttribute("data-lp-motion") === "on";
  var temPonteiroFino = typeof window.matchMedia === "function"
    && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var temObservador = "IntersectionObserver" in window;

  function um(seletor, contexto) { return (contexto || document).querySelector(seletor); }
  function todos(seletor, contexto) {
    return Array.prototype.slice.call((contexto || document).querySelectorAll(seletor));
  }
  function limitar(valor, minimo, maximo) {
    return valor < minimo ? minimo : (valor > maximo ? maximo : valor);
  }

  var formatoMoeda = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var formatoInteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
  function reais(valor) { return "R$ " + formatoMoeda.format(valor); }
  function reaisCurto(valor) { return "R$ " + formatoInteiro.format(valor); }

  /* ------------------------------------------------------------------
   * 1. FILA DE ROLAGEM
   * Um listener, um quadro, todas as tarefas. Cada tarefa recebe a
   * posição e a altura da janela já lidas, para não pedir de novo.
   * ------------------------------------------------------------------ */
  var tarefas = [];
  var agendado = false;

  function aoRolar(tarefa) { tarefas.push(tarefa); }

  function processar() {
    agendado = false;
    var y = window.pageYOffset || raiz.scrollTop || 0;
    var altura = window.innerHeight || raiz.clientHeight;
    for (var i = 0; i < tarefas.length; i += 1) tarefas[i](y, altura);
  }

  function agendar() {
    if (agendado) return;
    agendado = true;
    window.requestAnimationFrame(processar);
  }

  window.addEventListener("scroll", agendar, { passive: true });
  window.addEventListener("resize", agendar, { passive: true });

  /* ------------------------------------------------------------------
   * 2. OBSERVADOR DE ENTRADA
   * Quem não tem IntersectionObserver recebe tudo revelado de uma vez:
   * pior animação, mesmo conteúdo.
   * ------------------------------------------------------------------ */
  var observadorRespondeu = false;

  function observar(alvos, aoEntrar, opcoes) {
    if (!alvos.length) return;
    if (!("IntersectionObserver" in window)) {
      alvos.forEach(aoEntrar);
      return;
    }
    var observador = new IntersectionObserver(function (entradas) {
      observadorRespondeu = true;
      entradas.forEach(function (entrada) {
        if (!entrada.isIntersecting) return;
        aoEntrar(entrada.target);
        observador.unobserve(entrada.target);
      });
    }, opcoes || { rootMargin: "0px 0px -10% 0px", threshold: 0.16 });
    alvos.forEach(function (alvo) { observador.observe(alvo); });
  }

  function revelar(elemento) { elemento.classList.add("is-in"); }

  // A ENTREGA DO IntersectionObserver ACONTECE NO PASSO DE RENDERIZAÇÃO.
  //
  // Ou seja: num documento que nunca compõe um quadro (aba aberta em segundo
  // plano e nunca visitada, visualizador embutido, página congelada por
  // extensão) ele não chama ninguém, exatamente como requestAnimationFrame.
  // Como o estado escondido dos blocos vem do CSS, isso deixaria metade da
  // página invisível sem nenhum erro no console.
  //
  // O observador dispara uma primeira leva assim que pode, inclusive para
  // alvos fora da tela. Se essa leva nunca chegar, o conteúdo aparece por
  // conta própria. Perde-se a revelação; não se perde a página.
  window.setTimeout(function () {
    if (observadorRespondeu) return;
    todos(".lp-reveal, [data-howto]").forEach(revelar);
  }, 2500);

  /* ------------------------------------------------------------------
   * 2b. LAÇOS DECORATIVOS SÓ RODAM NA TELA
   * Varredura do QR, ondas do "sem internet", pulso do indicador, deriva
   * dos cartões flutuantes: animações infinitas que, fora da janela,
   * gastam bateria para ninguém. Um observador liga e desliga; o CSS faz
   * o resto com `animation-play-state`.
   *
   * O atributo na raiz é escrito AQUI, e não na folha, para que o estado
   * padrão de quem não tem observador continue sendo "tocando". Congelar
   * por engano seria pior do que rodar de mais.
   * ------------------------------------------------------------------ */
  var lacos = todos("[data-loop]");

  if (lacos.length && temObservador) {
    raiz.setAttribute("data-lp-loops", "on");
    var observadorLacos = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (entrada) {
        entrada.target.classList.toggle("is-onscreen", entrada.isIntersecting);
      });
    }, { rootMargin: "20% 0px" });
    lacos.forEach(function (laco) { observadorLacos.observe(laco); });
  }

  /* ------------------------------------------------------------------
   * 2c. CAMADAS DE COMPOSIÇÃO SÓ PERTO DA HORA
   * As duas seções movidas por rolagem (caos e WOW) pedem `will-change`
   * em uma dúzia de elementos cada. Deixar isso ligado a página inteira
   * é uma dúzia de texturas na memória da GPU o tempo todo, num aparelho
   * que tem pouca. A classe entra quando a seção se aproxima e sai
   * quando ela passa.
   * ------------------------------------------------------------------ */
  var pesadas = todos("[data-caos], [data-wow]");

  if (pesadas.length && temObservador) {
    var observadorPesadas = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (entrada) {
        entrada.target.classList.toggle("is-near", entrada.isIntersecting);
      });
    }, { rootMargin: "40% 0px" });
    pesadas.forEach(function (secao) { observadorPesadas.observe(secao); });
  }

  /* ------------------------------------------------------------------
   * 3. ENTRADA DO HERO
   * Acontece uma vez, no primeiro quadro depois da montagem. Os atrasos
   * estão na folha de estilo, em [data-anim] e [data-stagger], para que
   * a coreografia inteira possa ser reordenada sem tocar em JavaScript.
   * ------------------------------------------------------------------ */
  var heroEntrou = false;

  function entrarHero() {
    if (heroEntrou) return;
    heroEntrou = true;
    todos("[data-anim], .lp-line, [data-stagger]").forEach(revelar);
  }

  if (animar) {
    window.requestAnimationFrame(function () { window.requestAnimationFrame(entrarHero); });
    // REDE DE SEGURANÇA.
    // requestAnimationFrame não roda enquanto a aba está oculta. Numa aba de
    // segundo plano isso é até correto: a animação espera a pessoa chegar.
    // Mas existe o caso em que nenhum quadro é composto (visualizador
    // embutido, aba que nunca ganha foco, extensão que congela a página) e
    // ali o hero ficaria invisível para sempre. Um relógio simples desarma
    // essa possibilidade: passado o tempo, o conteúdo aparece de qualquer
    // jeito. Perder a coreografia é aceitável; perder a manchete não é.
    window.setTimeout(entrarHero, 1200);
  } else {
    entrarHero();
  }

  /* ------------------------------------------------------------------
   * 4. CONTAGEM DOS NÚMEROS
   * `data-count` guarda o valor final. Quando `data-count-decimals`
   * existe, o número é dinheiro e sai formatado em reais; sem ele, é um
   * inteiro que aceita `data-count-suffix` (o "%" das metas).
   * O texto final já está no HTML: a contagem só reencena a chegada.
   * ------------------------------------------------------------------ */
  function contar(elemento) {
    var alvo = parseFloat(elemento.getAttribute("data-count"));
    if (isNaN(alvo)) return;
    var casas = elemento.getAttribute("data-count-decimals");
    var sufixo = elemento.getAttribute("data-count-suffix") || "";
    var duracao = 1400;
    var inicio = 0;

    function escrever(valor) {
      elemento.textContent = casas ? reais(valor) : (formatoInteiro.format(valor) + sufixo);
    }

    if (!animar) { escrever(alvo); return; }

    // Os números do hero esperam o painel terminar de entrar. Contar
    // enquanto o cartão ainda está em opacidade zero desperdiça a cena.
    var espera = elemento.closest && elemento.closest(".lp-hero") ? 700 : 0;
    var concluido = false;

    function quadro(agora) {
      if (concluido) return;
      if (!inicio) inicio = agora;
      var t = limitar((agora - inicio) / duracao, 0, 1);
      escrever(alvo * (1 - Math.pow(1 - t, 4)));
      if (t < 1) { window.requestAnimationFrame(quadro); return; }
      concluido = true;
    }

    window.setTimeout(function () {
      escrever(0);
      window.requestAnimationFrame(quadro);
      // Mesma rede de segurança do hero, e aqui ela é obrigatória: sem
      // quadros compostos o número ficaria congelado em zero, que é pior do
      // que não animar. Passado o tempo da contagem, o valor certo entra.
      window.setTimeout(function () {
        if (concluido) return;
        concluido = true;
        escrever(alvo);
      }, duracao + 900);
    }, espera);
  }

  observar(todos("[data-count]"), contar, { rootMargin: "0px 0px -8% 0px", threshold: 0.4 });
  observar(todos(".lp-reveal"), revelar);
  observar(todos("[data-howto]"), revelar, { rootMargin: "0px 0px -20% 0px", threshold: 0.2 });

  /* ------------------------------------------------------------------
   * 5. NAVEGAÇÃO
   * Fundo e desfoque entram depois da primeira dobra; a barra de
   * progresso usa transform, não width.
   * ------------------------------------------------------------------ */
  var barra = um("[data-nav]");
  var progresso = um("[data-scroll-progress]");

  if (barra) {
    aoRolar(function (y) {
      barra.classList.toggle("is-stuck", y > 24);
      if (!progresso) return;
      var rolavel = raiz.scrollHeight - window.innerHeight;
      progresso.style.setProperty("--lp-progress", rolavel > 0 ? (y / rolavel).toFixed(4) : "0");
    });
  }

  /* ------------------------------------------------------------------
   * 5b. MENU DO CELULAR
   * O painel é um trecho do documento que aparece e some, não um diálogo
   * modal, mas enquanto está aberto ele cobre a página, e é isso que
   * define o comportamento esperado:
   *
   *   • o foco entra no painel e circula dentro dele (Tab e Shift+Tab),
   *     senão a tabulação sai para links que estão atrás e invisíveis;
   *   • Escape fecha e devolve o foco ao botão, que é de onde a pessoa veio;
   *   • tocar fora fecha, porque é o gesto que todo mundo tenta primeiro;
   *   • o corpo para de rolar por baixo, senão o dedo arrasta a página
   *     inteira quando a intenção era rolar a lista.
   * ------------------------------------------------------------------ */
  var botaoMenu = um("[data-menu-toggle]");
  var painelMenu = um("[data-menu]");

  if (botaoMenu && painelMenu) {
    var focaveisMenu = todos("a[href], button:not([disabled])", painelMenu);

    function menuAberto() { return botaoMenu.getAttribute("aria-expanded") === "true"; }

    function abrirMenu() {
      botaoMenu.setAttribute("aria-expanded", "true");
      botaoMenu.setAttribute("aria-label", "Fechar menu");
      painelMenu.hidden = false;
      raiz.classList.add("lp-locked");
      if (focaveisMenu.length) focaveisMenu[0].focus();
    }

    function fecharMenu(devolverFoco) {
      if (!menuAberto()) return;
      botaoMenu.setAttribute("aria-expanded", "false");
      botaoMenu.setAttribute("aria-label", "Abrir menu");
      painelMenu.hidden = true;
      raiz.classList.remove("lp-locked");
      if (devolverFoco) botaoMenu.focus();
    }

    botaoMenu.addEventListener("click", function () {
      if (menuAberto()) fecharMenu(false); else abrirMenu();
    });

    // Link clicado: o destino é uma âncora nesta mesma página, então o
    // painel precisa sair da frente antes do salto.
    todos("a", painelMenu).forEach(function (link) {
      link.addEventListener("click", function () { fecharMenu(false); });
    });

    document.addEventListener("keydown", function (evento) {
      if (!menuAberto()) return;

      if (evento.key === "Escape") { fecharMenu(true); return; }
      if (evento.key !== "Tab" || !focaveisMenu.length) return;

      var primeiro = focaveisMenu[0];
      var ultimo = focaveisMenu[focaveisMenu.length - 1];
      var foco = document.activeElement;

      // O botão que abriu também faz parte do laço: ele é o caminho de
      // volta e continua visível na barra.
      if (evento.shiftKey && (foco === primeiro || foco === botaoMenu)) {
        evento.preventDefault();
        ultimo.focus();
        return;
      }
      if (!evento.shiftKey && foco === ultimo) {
        evento.preventDefault();
        botaoMenu.focus();
      }
    });

    // Toque fora do painel e fora do botão fecha. `pointerdown` em vez de
    // `click` para que o fechamento aconteça no gesto, não depois dele.
    document.addEventListener("pointerdown", function (evento) {
      if (!menuAberto()) return;
      if (painelMenu.contains(evento.target) || botaoMenu.contains(evento.target)) return;
      fecharMenu(false);
    });

    // Voltar para o desktop com o menu aberto deixaria o corpo travado e
    // uma lista solta no meio da barra.
    window.addEventListener("resize", function () {
      if (menuAberto() && window.innerWidth > 980) fecharMenu(false);
    }, { passive: true });
  }

  /* ------------------------------------------------------------------
   * 6. LUZ QUE ACOMPANHA O CURSOR
   * Interpolada, nunca colada no ponteiro: colada vira distração, e o
   * atraso é o que dá a sensação de peso. Só em ponteiro fino.
   * ------------------------------------------------------------------ */
  var brilho = um("[data-cursor-glow]");

  if (brilho && animar && temPonteiroFino) {
    var destinoX = window.innerWidth / 2;
    var destinoY = window.innerHeight * 0.22;
    var atualX = destinoX;
    var atualY = destinoY;
    var rodando = false;

    window.addEventListener("pointermove", function (evento) {
      destinoX = evento.clientX;
      destinoY = evento.clientY;
      if (!rodando) { rodando = true; window.requestAnimationFrame(seguir); }
    }, { passive: true });

    function seguir() {
      atualX += (destinoX - atualX) * 0.055;
      atualY += (destinoY - atualY) * 0.055;
      brilho.style.setProperty("--gx", atualX.toFixed(1) + "px");
      brilho.style.setProperty("--gy", atualY.toFixed(1) + "px");
      if (Math.abs(destinoX - atualX) > 0.6 || Math.abs(destinoY - atualY) > 0.6) {
        window.requestAnimationFrame(seguir);
      } else {
        rodando = false;
      }
    }
  }

  /* ------------------------------------------------------------------
   * 7. MICROINTERAÇÕES DE PONTEIRO
   * Botão magnético com deslocamento máximo de 4px: o suficiente para o
   * dedo perceber, pouco o bastante para o alvo não fugir do clique.
   * ------------------------------------------------------------------ */
  if (animar && temPonteiroFino) {
    todos("[data-magnetic]").forEach(function (botao) {
      botao.addEventListener("pointermove", function (evento) {
        var caixa = botao.getBoundingClientRect();
        var px = (evento.clientX - caixa.left) / caixa.width;
        var py = (evento.clientY - caixa.top) / caixa.height;
        botao.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
        botao.style.setProperty("--my", (py * 100).toFixed(1) + "%");
        botao.style.setProperty("transform", "translate(" + ((px - 0.5) * 8).toFixed(2) + "px," + ((py - 0.5) * 6).toFixed(2) + "px)");
      });
      botao.addEventListener("pointerleave", function () {
        botao.style.removeProperty("transform");
      });
    });

    todos(".lp-bx").forEach(function (cartao) {
      cartao.addEventListener("pointermove", function (evento) {
        var caixa = cartao.getBoundingClientRect();
        cartao.style.setProperty("--mx", (evento.clientX - caixa.left).toFixed(0) + "px");
        cartao.style.setProperty("--my", (evento.clientY - caixa.top).toFixed(0) + "px");
      }, { passive: true });
    });
  }

  /* ------------------------------------------------------------------
   * 8. DOCA MÓVEL
   * Aparece depois do hero e some perto do fechamento, onde o CTA
   * grande já ocupa a tela e a doca viraria repetição.
   * ------------------------------------------------------------------ */
  var doca = um("[data-dock]");
  var fechamento = um(".lp-final");

  if (doca) {
    doca.hidden = false;
    aoRolar(function (y, altura) {
      var passouHero = y > altura * 0.85;
      var chegouNoFim = fechamento ? fechamento.getBoundingClientRect().top < altura : false;
      doca.classList.toggle("is-on", passouHero && !chegouNoFim);
    });
  }

  /* ------------------------------------------------------------------
   * 9. TRANSIÇÃO HERO PARA CONTEÚDO
   * O palco inteiro (painel e cartões) deita alguns graus e encolhe
   * enquanto sai de cena, de modo que o hero não termina numa linha
   * reta: ele entra na seção seguinte.
   * ------------------------------------------------------------------ */
  var palco = um(".lp-hero__stage");

  if (palco && animar) {
    aoRolar(function (y, altura) {
      var p = limitar(y / (altura * 0.95), 0, 1);
      palco.style.setProperty("--lp-tilt", (p * 8).toFixed(2) + "deg");
      palco.style.setProperty("--lp-shrink", (1 - p * 0.055).toFixed(4));
    });
  }

  /* ------------------------------------------------------------------
   * 10. CAOS QUE CONVERGE
   * `--p` vai de 0 (pontas soltas espalhadas) a 1 (tudo dentro do
   * painel). A folha faz o resto com transform e opacity.
   * ------------------------------------------------------------------ */
  var caos = um("[data-caos]");

  if (caos && animar) {
    caos.classList.add("is-ready");
    aoRolar(function (y, altura) {
      var caixa = caos.getBoundingClientRect();
      var percorrido = altura - caixa.top - altura * 0.3;
      var p = limitar(percorrido / (caixa.height * 0.55), 0, 1);
      caos.style.setProperty("--p", p.toFixed(3));
    });
  }

  /* ------------------------------------------------------------------
   * 11. SHOWCASE FIXO
   * A etapa visível manda na interface. A faixa de ativação é a metade
   * da tela: sem isso, duas etapas disputam o painel na troca.
   * ------------------------------------------------------------------ */
  var historia = um("[data-story]");
  var etapas = todos(".lp-step");
  var paineis = todos(".lp-panel");

  function ativarEtapa(etapa) {
    var indice = etapa.getAttribute("data-step");
    etapas.forEach(function (outra) { outra.classList.toggle("is-active", outra === etapa); });
    paineis.forEach(function (painel) {
      painel.classList.toggle("is-active", painel.getAttribute("data-panel") === indice);
    });
  }

  if (historia && etapas.length && "IntersectionObserver" in window) {
    // A troca de interface acontece sempre: ela é a demonstração, não enfeite.
    // Já o esmaecimento das etapas vizinhas é ênfase visual, e ênfase por
    // opacidade baixa é exatamente o que `prefers-reduced-motion` pede para
    // não fazer: quem pediu menos movimento continua lendo as quatro etapas
    // com contraste cheio.
    if (animar) historia.classList.add("is-live");
    etapas[0].classList.add("is-active");
    var observadorEtapas = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (entrada) {
        if (entrada.isIntersecting) ativarEtapa(entrada.target);
      });
    }, { rootMargin: "-48% 0px -48% 0px", threshold: 0 });
    etapas.forEach(function (etapa) { observadorEtapas.observe(etapa); });
  }

  /* ------------------------------------------------------------------
   * 12. MOMENTO WOW
   * A rolagem dentro da seção fixa vira o eixo do tempo. Um ano de
   * organização em `--p`, com três legendas e três números.
   * ------------------------------------------------------------------ */
  var wow = um("[data-wow]");

  if (wow && animar) {
    var MESES_WOW = [
      "janeiro", "fevereiro", "março", "abril", "maio", "junho",
      "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
    ];
    var legendas = todos(".lp-wow__caption", wow);
    var saidaMes = um("[data-wow-out=\"mes\"]", wow);
    var saidaSobra = um("[data-wow-out=\"sobra\"]", wow);
    var saidaPatrimonio = um("[data-wow-out=\"patrimonio\"]", wow);
    var saidaMeta = um("[data-wow-out=\"meta\"]", wow);
    var ultimaLegenda = -1;
    var ultimoMes = -1;

    wow.classList.add("is-live");

    aoRolar(function (y, altura) {
      var caixa = wow.getBoundingClientRect();
      var curso = caixa.height - altura;
      var p = curso > 0 ? limitar(-caixa.top / curso, 0, 1) : 1;
      wow.style.setProperty("--p", p.toFixed(3));

      // O mês é o que transforma quatro números em linha do tempo: sem ele
      // a seção mostra valores mudando; com ele, mostra um ano passando.
      // Só escreve quando o mês vira, para não tocar no DOM a cada quadro.
      if (saidaMes) {
        var mes = limitar(Math.floor(p * 12), 0, 11);
        if (mes !== ultimoMes) {
          ultimoMes = mes;
          saidaMes.textContent = MESES_WOW[mes];
        }
      }

      if (saidaSobra) {
        var sobra = -180 + p * 2160;
        saidaSobra.textContent = (sobra < 0 ? "- " : "+ ") + reaisCurto(Math.abs(sobra));
      }
      if (saidaPatrimonio) saidaPatrimonio.textContent = reaisCurto(9200 + p * 9550);
      if (saidaMeta) saidaMeta.textContent = Math.round(4 + p * 57) + "%";

      var indice = p < 0.34 ? 0 : (p < 0.74 ? 1 : 2);
      if (indice === ultimaLegenda) return;
      ultimaLegenda = indice;
      legendas.forEach(function (legenda, posicao) {
        legenda.classList.toggle("is-on", posicao === indice);
      });
    });
  }

  /* ------------------------------------------------------------------
   * 13. SIMULADOR DE JUROS COMPOSTOS
   * A conta é a mesma do aplicativo: taxa anual convertida para mensal
   * equivalente COMPOSTA (raiz duodécima), nunca dividida por doze.
   * Dividir por doze superestima o resultado e é o erro mais comum em
   * simulador de internet.
   * ------------------------------------------------------------------ */
  var camposSim = todos("[data-sim-input]");

  if (camposSim.length) {
    var saidasSim = {};
    todos("[data-sim-out]").forEach(function (elemento) {
      saidasSim[elemento.getAttribute("data-sim-out")] = elemento;
    });

    var caixaBarras = um("[data-sim-bars]");
    var barras = [];
    var premissas = { inicial: 1000, aporte: 500, anos: 10, taxa: 10 };

    function garantirBarras(quantidade) {
      while (barras.length < quantidade) {
        var coluna = document.createElement("span");
        coluna.className = "lp-simbar";
        var proprio = document.createElement("i");
        proprio.className = "lp-simbar__own";
        var juros = document.createElement("i");
        juros.className = "lp-simbar__int";
        coluna.appendChild(juros);
        coluna.appendChild(proprio);
        caixaBarras.appendChild(coluna);
        barras.push({ coluna: coluna, proprio: proprio, juros: juros });
      }
      barras.forEach(function (barra, indice) {
        barra.coluna.hidden = indice >= quantidade;
      });
    }

    function montante(meses, mensal) {
      var fator = Math.pow(1 + mensal, meses);
      var doAporte = mensal > 0
        ? premissas.aporte * ((fator - 1) / mensal)
        : premissas.aporte * meses;
      return premissas.inicial * fator + doAporte;
    }

    function calcular() {
      var mensal = Math.pow(1 + premissas.taxa / 100, 1 / 12) - 1;
      var anos = premissas.anos;
      var totalFinal = montante(anos * 12, mensal);
      var investidoFinal = premissas.inicial + premissas.aporte * anos * 12;
      var jurosFinal = Math.max(0, totalFinal - investidoFinal);

      if (saidasSim.total) saidasSim.total.textContent = reais(totalFinal);
      if (saidasSim.investido) saidasSim.investido.textContent = reais(investidoFinal);
      if (saidasSim.juros) saidasSim.juros.textContent = reais(jurosFinal);
      if (saidasSim.prazo) saidasSim.prazo.textContent = "Em " + anos + (anos === 1 ? " ano você teria" : " anos você teria");
      if (saidasSim.fim) saidasSim.fim.textContent = "daqui a " + anos + (anos === 1 ? " ano" : " anos");
      if (saidasSim.frase) {
        var parte = totalFinal > 0 ? Math.round((jurosFinal / totalFinal) * 100) : 0;
        saidasSim.frase.textContent = parte >= 50
          ? "Depois de " + anos + (anos === 1 ? " ano" : " anos") + ", mais da metade do saldo (" + parte + "%) é juro, não aporte."
          : "Depois de " + anos + (anos === 1 ? " ano" : " anos") + ", os juros já respondem por " + parte + "% do total.";
      }

      if (!caixaBarras) return;
      var colunas = Math.min(anos, 35) + 1;
      garantirBarras(colunas);
      var passo = anos / (colunas - 1);
      for (var i = 0; i < colunas; i += 1) {
        var meses = Math.round(i * passo * 12);
        var total = montante(meses, mensal);
        var investido = premissas.inicial + premissas.aporte * meses;
        var proporcao = totalFinal > 0 ? total / totalFinal : 0;
        var fatiaPropria = total > 0 ? Math.min(100, (investido / total) * 100) : 100;
        barras[i].coluna.style.setProperty("--t", (proporcao * 100).toFixed(2) + "%");
        barras[i].proprio.style.setProperty("--seg-a", fatiaPropria.toFixed(2) + "%");
        barras[i].juros.style.setProperty("--seg-b", (100 - fatiaPropria).toFixed(2) + "%");
      }
    }

    function rotular(chave) {
      if (chave === "inicial" && saidasSim.inicial) saidasSim.inicial.textContent = reaisCurto(premissas.inicial);
      if (chave === "aporte" && saidasSim.aporte) saidasSim.aporte.textContent = reaisCurto(premissas.aporte);
      if (chave === "anos" && saidasSim.anos) saidasSim.anos.textContent = premissas.anos + (premissas.anos === 1 ? " ano" : " anos");
      if (chave === "taxa" && saidasSim.taxa) saidasSim.taxa.textContent = premissas.taxa.toFixed(1).replace(".", ",") + "% ao ano";
    }

    camposSim.forEach(function (campo) {
      var chave = campo.getAttribute("data-sim-input");
      premissas[chave] = parseFloat(campo.value);
      rotular(chave);
      campo.addEventListener("input", function () {
        premissas[chave] = parseFloat(campo.value);
        rotular(chave);
        calcular();
      });
    });

    calcular();
  }

  /* ------------------------------------------------------------------
   * 14. FRASE QUE VIRA LANÇAMENTO
   * Demonstra a entrada por linguagem natural. Só roda com o cartão na
   * tela: animação fora do viewport é bateria gasta à toa.
   * ------------------------------------------------------------------ */
  var campoFrase = um("[data-typewriter]");
  var cartaoFrase = um(".lp-bx--nlp");

  if (campoFrase && cartaoFrase && animar) {
    var texto = "gastei 45 no mercado ontem";
    var visivel = false;
    var relogio = 0;
    var posicao = 0;
    var apagando = false;

    // O campo só é esvaziado quando a digitação vai mesmo começar. Limpar
    // na carga deixaria o bloco com um campo em branco caso o observador
    // nunca respondesse (ver a rede de segurança lá em cima).
    function iniciar() {
      cartaoFrase.classList.add("is-typing");
      cartaoFrase.classList.remove("is-parsed");
      campoFrase.textContent = "";
      posicao = 0;
      apagando = false;
      ciclo();
    }

    function ciclo() {
      if (!visivel) return;
      if (!apagando) {
        posicao += 1;
        campoFrase.textContent = texto.slice(0, posicao);
        if (posicao >= texto.length) {
          cartaoFrase.classList.add("is-parsed");
          apagando = true;
          relogio = window.setTimeout(ciclo, 2600);
          return;
        }
        relogio = window.setTimeout(ciclo, 58);
        return;
      }
      cartaoFrase.classList.remove("is-parsed");
      posicao = 0;
      apagando = false;
      campoFrase.textContent = "";
      relogio = window.setTimeout(ciclo, 700);
    }

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entradas) {
        entradas.forEach(function (entrada) {
          if (entrada.isIntersecting === visivel) return;
          visivel = entrada.isIntersecting;
          window.clearTimeout(relogio);
          if (visivel) relogio = window.setTimeout(iniciar, 300);
        });
      }, { threshold: 0.35 }).observe(cartaoFrase);
    } else {
      visivel = true;
      iniciar();
    }
  }

  /* ------------------------------------------------------------------
   * 15. FAQ
   * O <details> já abre sozinho e responde ao teclado. O JavaScript só
   * fecha os vizinhos e suaviza a entrada do texto.
   * ------------------------------------------------------------------ */
  var itensFaq = todos(".lp-faq__item");

  itensFaq.forEach(function (item) {
    item.addEventListener("toggle", function () {
      if (!item.open) return;
      itensFaq.forEach(function (outro) {
        if (outro !== item) outro.open = false;
      });
      var corpo = um(".lp-faq__body", item);
      if (!animar || !corpo || typeof corpo.animate !== "function") return;
      corpo.animate(
        [{ opacity: 0, transform: "translateY(-8px)" }, { opacity: 1, transform: "none" }],
        { duration: 300, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
      );
    });
  });

  /* ------------------------------------------------------------------
   * 16. CURVA SUAVE NOS GRÁFICOS
   * O HTML traz o caminho em segmentos retos, que já é um gráfico
   * correto e legível sem JavaScript. Aqui ele é reescrito como uma
   * spline Catmull-Rom convertida em Bezier: mesma série, leitura mais
   * calma. As alças usam um sexto da distância entre vizinhos, que é a
   * conversão canônica e não cria ondulação inventada entre pontos.
   * ------------------------------------------------------------------ */
  function extrairPontos(caminho) {
    var numeros = (caminho.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    var pontos = [];
    for (var i = 0; i + 1 < numeros.length; i += 2) pontos.push([numeros[i], numeros[i + 1]]);
    return pontos;
  }

  function suavizar(pontos) {
    if (pontos.length < 3) return "";
    var d = "M" + pontos[0][0] + " " + pontos[0][1];
    for (var i = 0; i < pontos.length - 1; i += 1) {
      var p0 = pontos[i - 1] || pontos[i];
      var p1 = pontos[i];
      var p2 = pontos[i + 1];
      var p3 = pontos[i + 2] || p2;
      var c1x = p1[0] + (p2[0] - p0[0]) / 6;
      var c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6;
      var c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += "C" + c1x.toFixed(2) + " " + c1y.toFixed(2)
        + "," + c2x.toFixed(2) + " " + c2y.toFixed(2)
        + "," + p2[0] + " " + p2[1];
    }
    return d;
  }

  todos("[data-chart]").forEach(function (figura) {
    var linha = um("[data-chart-line]", figura);
    var area = um("[data-chart-area]", figura);
    if (!linha) return;
    var pontos = extrairPontos(linha.getAttribute("d"));
    var curva = suavizar(pontos);
    if (!curva) return;
    linha.setAttribute("d", curva);
    if (area) {
      var base = 178;
      area.setAttribute("d", curva
        + "L" + pontos[pontos.length - 1][0] + " " + base
        + "L" + pontos[0][0] + " " + base + "Z");
    }
  });

  // Primeira passada: acerta barra, progresso, inclinação e doca antes de
  // qualquer rolagem acontecer.
  agendar();
}());
