// test-accessibility.js — harness do M39 (Acessibilidade).
//
// O QUE ESTE ARQUIVO PROVA
//
// A auditoria do M39 rodou no navegador, em 20 rotas e nos dois temas. O que
// ela encontrou foi corrigido; este arquivo existe para que as correções não
// sejam desfeitas sem alguém perceber. Ele trava, na fonte, as seis decisões:
//
//   1. o foco volta para quem abriu o diálogo, inclusive quando o gatilho some;
//   2. os dois marcos de navegação têm nomes DIFERENTES;
//   3. texto miúdo sobre pastilha colorida usa a tinta escurecida (`*-ink`);
//   4. quem pede menos movimento não recebe as animações do aplicativo;
//   5. campo sem rótulo visível tem nome próprio, e não só texto de exemplo;
//   6. link repetido em fornecedores diferentes diz de qual fornecedor é.
//
// Por que não medir contraste aqui: a conta depende do fundo COMPOSTO (pastilha
// translúcida sobre cartão sobre página) e de gradiente, que só existem no
// navegador. Medir com aproximação em Node produziria número errado, e número
// errado sobre acessibilidade é pior que número nenhum. A medida vive no
// relatório do módulo; aqui trava-se a decisão que dela resultou.
//
// Ferramenta de dev: `node tests/test-accessibility.js`.
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? ` → ${extra}` : ""}`); }
}

const dialogo = read("js/modules/dialog-controller.js");
const app = read("js/app.js");
const movimentos = read("css/screens/movements.css");
const componentes = read("css/components.css");
const invest = read("js/screens/invest.js");
const categorias = read("js/screens/categories.js");
const privacidade = read("js/screens/privacy.js");

/* ---------------------------------------- 1. o foco volta para o gatilho */
console.log("\n1. Fechar o diálogo devolve o foco para quem o abriu");
{
  check("o controlador aceita a declaração explícita do gatilho", /function noteTrigger\(/.test(dialogo));
  check("`noteTrigger` é exportado", /return Object\.freeze\(\{ sync, noteTrigger \}\)/.test(dialogo));
  check("não sobrescreve um gatilho já anotado", /if \(opener \|\| document\.querySelector\(DIALOG_SELECTOR\)\) return;/.test(dialogo));
  check("`openOverlay` anota o gatilho ANTES do render", /noteTrigger\(document\.activeElement\)/.test(app)
    && app.indexOf("noteTrigger(document.activeElement)") < app.indexOf("state.overlayStack.push(name)"));
  check("o `sync` também lê o foco quando o diálogo aparece", /if \(!wasOpen && !opener\) opener = triggerDescriptor\(document\.activeElement\);/.test(dialogo));
  check("o caminho do ponteiro continua existindo", /document\.addEventListener\('pointerdown', onPointerDown, true\)/.test(dialogo));
  check("o retorno de foco continua acontecendo ao fechar", /queueMicrotask\(\(\) => target\.focus\(\{ preventScroll: true \}\)\)/.test(dialogo));
  check("o motivo está escrito no código", /WCAG 2\.4\.3/.test(dialogo));
}

/* ------------------------------------- 2. marcos com nomes diferentes */
console.log("\n2. Os dois marcos de navegação são distinguíveis");
{
  const lateral = /<nav class="side-nav" aria-label="([^"]+)"/.exec(app);
  const inferior = /<nav class="bottom-nav" aria-label="([^"]+)"/.exec(app);
  check("a navegação lateral é rotulada", !!lateral, lateral && lateral[1]);
  check("a navegação inferior é rotulada", !!inferior, inferior && inferior[1]);
  check("os dois nomes são diferentes", !!lateral && !!inferior && lateral[1] !== inferior[1],
    lateral && inferior ? `${lateral[1]} / ${inferior[1]}` : "");
}

/* ------------------------------------------ 3. tinta de texto miúdo */
console.log("\n3. Texto miúdo sobre pastilha usa a tinta escurecida");
{
  const linha = movimentos.split("\n").find((l) => l.includes(".review-count {"));
  check("o contador da caixa de revisão existe", !!linha);
  check("ele usa `--goal-ink`, não `--goal`", !!linha && /color:var\(--goal-ink\)/.test(linha), linha && linha.slice(0, 120));
  check("o fundo continua sendo a pastilha de 16%", !!linha && /color-mix\(in srgb, var\(--goal\) 16%/.test(linha));
  check("o motivo está escrito na folha", /NÃO conta como texto grande/.test(movimentos));
  // A base precisa continuar oferecendo a variante, e no escuro ela volta a
  // apontar para a cor de sinal: se isso mudar, a correção acima vira outra coisa.
  const base = read("css/base.css");
  check("a base define `--goal-ink`", /--goal-ink:\s*#/.test(base));
  check("no tema escuro `--goal-ink` volta a ser `--goal`", /--goal-ink:\s*var\(--goal\)/.test(base));
}

/* ------------------------------------------ 4. movimento reduzido */
console.log("\n4. Quem pede menos movimento recebe menos movimento");
{
  const bloco = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(componentes);
  check("existe bloco de movimento reduzido nos componentes", !!bloco);
  const corpo = bloco ? bloco[1] : "";
  ["screen--enter > *", "screen--enter .grid-dashboard > *", "modal-overlay--enter", ".toast"]
    .forEach((sel) => check(`cobre \`${sel}\``, corpo.includes(sel), corpo.slice(0, 90)));
  check("desliga a animação", /animation:\s*none/.test(corpo));
  // O giro do carregando fica de propósito: é a única indicação de trabalho em
  // andamento, e tirá-lo removeria informação em vez de movimento.
  check("o giro do carregando NÃO é desligado", !/\.spinner/.test(corpo));
}

/* ------------------------------------------ 5. campos com nome próprio */
console.log("\n5. Campo sem rótulo visível tem nome próprio");
{
  ["invest-inicial", "invest-aporte", "invest-anos", "invest-taxa"].forEach((campo) => {
    const temRotulo = new RegExp(`<span id="${campo}-rotulo">`).test(invest);
    const amarrado = new RegExp(`aria-labelledby="${campo}-rotulo"`).test(invest);
    check(`${campo}: rótulo com id e campo amarrado a ele`, temRotulo && amarrado, `${temRotulo}/${amarrado}`);
  });
  check("a busca de categorias tem nome permanente",
    /aria-label="Buscar categoria ou subcategoria"/.test(categorias));
  check("o texto de exemplo continua lá, para quem enxerga",
    /placeholder="Buscar categoria ou subcategoria"/.test(categorias));
  check("o motivo está escrito no código", /SOME assim que a pessoa digita/.test(categorias));
}

/* ------------------------------------------ 6. links distinguíveis */
console.log("\n6. Link repetido diz a qual fornecedor pertence");
{
  check("a privacidade do fornecedor entra no nome do link",
    /aria-label="Privacidade do serviço: \$\{escapeHtml\(item\.name\)\}"/.test(privacidade));
  check("a fonte técnica também",
    /aria-label="Fonte técnica oficial: \$\{escapeHtml\(item\.name\)\}"/.test(privacidade));
  check("o texto visível não mudou",
    />Privacidade do serviço<\/a>/.test(privacidade) && />Fonte técnica oficial<\/a>/.test(privacidade));
  check("o nome do fornecedor é escapado como o resto", /escapeHtml\(item\.name\)/.test(privacidade));
}

/* ------------------- 7. o que já existia e não pode regredir */
console.log("\n7. O que o aplicativo já fazia certo continua de pé");
{
  const erros = read("js/modules/form-errors.js");
  check("erro de formulário é anunciado (`role=alert`)", /setAttribute\('role', 'alert'\)/.test(erros));
  check("campo inválido é marcado (`aria-invalid`)", /setAttribute\('aria-invalid', 'true'\)/.test(erros));
  check("erro é amarrado ao campo (`aria-describedby`)", /aria-describedby/.test(erros));
  check("o foco vai para o primeiro campo inválido", /first\.focus\(\{ preventScroll: false \}\)/.test(erros));
  check("o diálogo prende o Tab", /event\.key !== 'Tab'/.test(dialogo));
  check("o fundo do diálogo fica inerte", /node\.inert = true/.test(dialogo));
  check("Esc fecha a camada de cima", /if \(closeTopOverlay\(\)\) return;/.test(app));
  check("o atalho de pular o menu existe", /skip-to-content/.test(app));
}

/* ------- [M42] Controle travado: anunciado, alcançável, mas não é a porta ------- */
// O assistente trocou `disabled` por `aria-disabled` nos botões travados, para
// que a razão do bloqueio (`aria-describedby`) chegue ao leitor de tela: um
// `<button disabled>` sai da ordem de tabulação e a descrição não é anunciada.
//
// O primeiro corte dessa troca criou um defeito novo: como `aria-disabled` não
// tira o elemento do foco, o foco INICIAL do diálogo passou a cair em "Já tenho
// conta", que está desabilitado. Quem usa leitor de tela era recebido pelo
// único controle que não podia usar.
//
// A regra que ficou separa os dois momentos, e é isto que este bloco tranca.
console.log("\n5. [M42] Foco inicial não cai em controle desabilitado por ARIA");
{
  check("existe um seletor próprio para o foco inicial",
    /const FOCO_INICIAL_SELECTOR/.test(dialogo));
  check("ele exclui quem está marcado como desabilitado",
    /:not\(\[aria-disabled="true"\]\)/.test(dialogo));
  check("o foco inicial prefere esse seletor",
    /dialog\.querySelector\(FOCO_INICIAL_SELECTOR\)/.test(dialogo));
  // Sem a reserva, um diálogo em que TODOS os controles estejam travados
  // ficaria sem foco nenhum e o Escape deixaria de funcionar.
  check("mas continua havendo reserva quando tudo está travado",
    /\|\| dialog\.querySelector\(FOCUSABLE_SELECTOR\)/.test(dialogo));

  // O ciclo do Tab NÃO pode excluir: tirar o controle da roda desfaria
  // exatamente o ganho que motivou a troca.
  const cicloTab = dialogo.slice(dialogo.indexOf("if (event.key !== 'Tab') return;"));
  check("o ciclo do Tab continua alcançando o controle travado",
    /querySelectorAll\(FOCUSABLE_SELECTOR\)/.test(cicloTab) && !/FOCO_INICIAL_SELECTOR/.test(cicloTab));

  // E o assistente precisa continuar usando `aria-disabled`, não `disabled`:
  // é a marcação que sustenta tudo acima.
  const assistente = read("js/screens/onboarding.js");
  check("o assistente trava por ARIA, não pelo atributo do navegador",
    /aria-disabled="true" aria-describedby="onb-block-reason"/.test(assistente)
    && !/disabled aria-describedby="onb-block-reason"/.test(assistente));
  check("e quem barra a ação é o despachante",
    /case "onb-skip": if \(!onbBloqueado\(\)\)/.test(read("js/actions.js")));
}

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} — ${pass} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
