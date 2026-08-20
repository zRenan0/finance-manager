"use strict";

// landing-boot.js; decide se a landing pode animar, antes da primeira pintura.
//
// POR QUE ELE EXISTE
//
// A folha css/landing.css só esconde alguma coisa dentro de
// `[data-lp-motion="on"]`. Se este arquivo não rodar, nada fica invisível:
// a página inteira é entregue estática e legível. Isso resolve três casos de
// uma vez, sem script inline (proibido pela CSP do projeto):
//
//   1. JavaScript desligado ou com falha ao carregar: sem o atributo, não
//      existe conteúdo escondido esperando um `.is-in` que nunca vem.
//   2. `prefers-reduced-motion: reduce`: o atributo também não é escrito,
//      então as entradas nem chegam a existir, em vez de serem canceladas
//      no meio do caminho.
//   3. Piscada de conteúdo: por ser clássico e síncrono no `<head>`, ele roda
//      ANTES da primeira pintura. Um módulo, que é adiado, deixaria o texto
//      aparecer e sumir.
//
// É a mesma estratégia do js/boot.js do aplicativo, que aplica o tema salvo
// antes de a tela existir.

// ------------------------------------------------------------------
// REDE DE SEGURANÇA: LINK DE CONFIRMAÇÃO DE CONTA QUE CAIU AQUI
// ------------------------------------------------------------------
// O servidor voltou a apontar o retorno dos emails para `/index.html`
// (ver `appCallbackUrl` em netlify/functions/account.js). Mas os links JÁ
// ENVIADOS continuam apontando para a RAIZ, e a raiz é esta página. Quem
// abrir um desses cai no folheto: `bootstrapAccount()` mora em js/auth.js,
// dentro do pacote que só o `index.html` carrega, então o código do email
// nunca é trocado e o cadastro nunca conclui.
//
// Aqui a página só reencaminha, preservando a busca inteira, para o
// aplicativo terminar o trabalho. Vale para os dois sentidos do fluxo:
// `auth_callback=signup` e `auth_callback=recovery`. E também para um link
// que chegue só com `code`, caso o modelo de email use a URL padrão do
// projeto no Supabase em vez do `redirect_to`.
//
// POR QUE AQUI, E NÃO NO `js/landing.js`
//
// Este arquivo é clássico e síncrono no `<head>`: ele roda antes da primeira
// pintura, então quem está confirmando a conta não chega a ver a página
// comercial piscar. O `landing.js` é `defer` e, pior, é justamente o arquivo
// que pode morrer no caminho (é o caso que o trinco lá embaixo trata); se o
// reencaminhamento dependesse dele, a confirmação continuaria quebrada em
// silêncio exatamente nas redes ruins.
//
// A comparação exige a chave inteira depois de `?` ou `&`, então `ref_code=`
// e afins não disparam. Ainda assim, fica o aviso: `code` e `auth_callback`
// pertencem ao fluxo de conta e não podem ser reaproveitados como parâmetro
// de campanha nesta página.
//
// `replace` e não `assign`: a landing não pode ficar no histórico, senão o
// botão Voltar do aplicativo devolve a pessoa para cá e reencaminha de novo.
var encaminhado = false;
try {
  var busca = window.location.search || "";
  if (/[?&](?:code|auth_callback)=/.test(busca)) {
    encaminhado = true;
    window.location.replace("index.html" + busca + (window.location.hash || ""));
  }
} catch (erro) {
  // Sem `location` utilizável não há para onde encaminhar; a página segue
  // sendo a landing, que é o comportamento de antes desta correção.
}

try {
  var movimentoReduzido = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Durante o reencaminhamento a página ainda pode pintar, se a rede
  // demorar. Nesse intervalo ela deve aparecer inteira e estática: esconder
  // blocos esperando uma animação que não vai acontecer seria o pior dos
  // dois mundos.
  if (!encaminhado && !movimentoReduzido) document.documentElement.setAttribute("data-lp-motion", "on");
} catch (erro) {
  // Navegador sem matchMedia: a página fica estática. Perde animação,
  // não perde conteúdo.
}

// ------------------------------------------------------------------
// TRINCO DE SEGURANÇA: E SE SÓ O `landing.js` FALHAR?
// ------------------------------------------------------------------
// O raciocínio acima cobre o caso em que NENHUM script roda. Falta o caso
// intermediário, que é o mais provável em rede ruim: este arquivo carrega
// (ele é pequeno e vem no <head>), marca `data-lp-motion="on"`, e o
// `js/landing.js`, que é quem devolve o `.is-in`, morre no caminho: 404 de
// deploy incompleto, tempo esgotado, bloqueador de conteúdo. O resultado
// seria uma página com metade dos blocos invisíveis e nenhum erro visível.
//
// O `landing.js` marca `data-lp-ready="on"` na primeira linha em que executa.
// Se o prazo passar sem essa marca, desistimos da animação e devolvemos a
// página inteira. Perder a coreografia é aceitável; perder o conteúdo não é.
try {
  window.setTimeout(function () {
    var raiz = document.documentElement;
    if (raiz.getAttribute("data-lp-ready") === "on") return;
    raiz.removeAttribute("data-lp-motion");
  }, 4000);
} catch (erro) {
  // Sem setTimeout não há o que fazer aqui, e o caso não existe na prática.
}
