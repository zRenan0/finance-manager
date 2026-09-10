// test-tema-sistema.js — [M42] "Seguir o sistema" é um valor, não um palpite.
//
// O DEFEITO QUE ESTE ARQUIVO TRANCA
//
// O app lia `prefers-color-scheme` UMA vez, no primeiro uso, e gravava o
// resultado como se fosse escolha da pessoa. A partir dali parava de olhar para
// o aparelho. Medido no navegador: base limpa com o sistema no escuro grava
// "dark"; troca-se o sistema para claro, recarrega, e o app segue escuro com
// `matchMedia("(prefers-color-scheme: dark)")` valendo falso. Em celular, onde o
// tema escuro costuma ser automático por horário, o app discordava do aparelho
// toda noite. E Ajustes só tinha um interruptor de duas posições: não havia como
// voltar para o automático nem apagando nada pela interface.
//
// POR QUE ESTE TESTE EXISTE EM VEZ DE UMA CONFERÊNCIA NO NAVEGADOR
//
// A emulação de `prefers-color-scheme` do painel de navegador troca o valor da
// consulta mas NÃO dispara o evento `change` (conferido: um ouvinte próprio
// registrado na mesma consulta recebeu zero disparos enquanto `matches` virava
// `true`). O ouvinte só pode ser exercitado com uma `matchMedia` controlável,
// que é o que este arquivo monta.
"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const readSrc = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail === undefined ? "" : ` → ${JSON.stringify(detail)}`}`); }
}
function section(t) { console.log(`\n${t}`); }

// Aparelho de mentira: uma preferência que dá para trocar, e que avisa quem
// estiver ouvindo — exatamente o que um celular faz ao anoitecer.
function aparelho(preferenciaInicial) {
  const ouvintes = [];
  let escuro = preferenciaInicial === "dark";
  return {
    ouvintes,
    get escuro() { return escuro; },
    trocarPara(preferencia) {
      escuro = preferencia === "dark";
      ouvintes.forEach((fn) => fn({ matches: escuro }));
    },
    matchMedia(consulta) {
      const alvo = { media: consulta, get matches() { return /dark/.test(consulta) ? escuro : !escuro } };
      alvo.addEventListener = (tipo, fn) => { if (tipo === "change") ouvintes.push(fn); };
      alvo.removeEventListener = () => {};
      alvo.addListener = (fn) => ouvintes.push(fn);
      return alvo;
    },
  };
}

function memoriaLocal() {
  const valores = new Map();
  return {
    getItem: (k) => (valores.has(k) ? valores.get(k) : null),
    setItem: (k, v) => valores.set(k, String(v)),
    removeItem: (k) => valores.delete(k),
    clear: () => valores.clear(),
  };
}

// Contexto mínimo: o que `applyTheme`, `resolveTheme` e `watchSystemTheme`
// tocam de verdade. Nada de DOM completo; o que importa é o atributo.
function montar(preferenciaInicial, temaGravado) {
  const dispositivo = aparelho(preferenciaInicial);
  const raiz = { atributos: {} };
  const ctx = {
    console,
    module: { exports: {} },
    setTimeout, clearTimeout,
    localStorage: memoriaLocal(),
    matchMedia: dispositivo.matchMedia,
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    document: {
      documentElement: {
        setAttribute(nome, valor) { raiz.atributos[nome] = valor; },
        getAttribute(nome) { return raiz.atributos[nome] === undefined ? null : raiz.atributos[nome]; },
      },
      querySelector: () => null,
      addEventListener() {},
      visibilityState: "visible",
    },
    navigator: { userAgent: "node" },
    addEventListener() {}, removeEventListener() {},
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);

  // `THEME_CHOICES` mora em storage.js; `applyTheme`, `resolveTheme` e
  // `watchSystemTheme` moram em app.js. Carregar os dois arquivos inteiros
  // custaria o app todo, então isolamos só o que este teste exercita — e
  // conferimos, no fim, que o recorte continua sendo o código de verdade.
  const storage = readSrc("js/storage.js");
  const app = readSrc("js/app.js");
  const recorte = [
    storage.slice(storage.indexOf("const THEME_CHOICES"), storage.indexOf("const LEGAL_PENDING")),
    app.slice(app.indexOf("const THEME_KEY"), app.indexOf("// A MESMA TELA REDESENHADA")),
  ].join("\n");
  vm.runInContext(recorte, ctx, { filename: "recorte-tema.js" });
  vm.runInContext(`var state = { data: { theme: ${JSON.stringify(temaGravado)} } };`, ctx);
  return { ctx, dispositivo, raiz, run: (codigo) => vm.runInContext(codigo, ctx) };
}

section("1. O padrão acompanha o aparelho, e continua acompanhando");
{
  const { ctx, dispositivo, raiz, run } = montar("dark", "system");
  run("applyTheme(state.data.theme); watchSystemTheme();");
  check("aparelho no escuro abre o app no escuro", raiz.atributos["data-theme"] === "dark", raiz.atributos["data-theme"]);
  check("o que fica gravado é a ESCOLHA, não o resultado dela",
    ctx.localStorage.getItem("financas_theme") === "system", ctx.localStorage.getItem("financas_theme"));

  // Este é o caso que falhava: o sistema muda embaixo do app.
  dispositivo.trocarPara("light");
  check("aparelho passa para claro e o app acompanha SEM recarregar",
    raiz.atributos["data-theme"] === "light", raiz.atributos["data-theme"]);
  check("e a escolha gravada continua sendo 'system'",
    ctx.localStorage.getItem("financas_theme") === "system", ctx.localStorage.getItem("financas_theme"));

  dispositivo.trocarPara("dark");
  check("volta a acompanhar quando o aparelho volta ao escuro",
    raiz.atributos["data-theme"] === "dark", raiz.atributos["data-theme"]);
}

section("2. Escolha explícita manda, e para de acompanhar");
{
  const { ctx, dispositivo, raiz, run } = montar("dark", "light");
  run("applyTheme(state.data.theme); watchSystemTheme();");
  check("com 'light' escolhido, aparelho no escuro NÃO manda",
    raiz.atributos["data-theme"] === "light", raiz.atributos["data-theme"]);
  check("a escolha explícita é o que fica gravado",
    ctx.localStorage.getItem("financas_theme") === "light", ctx.localStorage.getItem("financas_theme"));

  dispositivo.trocarPara("light");
  dispositivo.trocarPara("dark");
  check("mudança do aparelho não mexe em quem escolheu",
    raiz.atributos["data-theme"] === "light", raiz.atributos["data-theme"]);
}

section("3. Voltar para o automático é possível");
{
  const { ctx, dispositivo, raiz, run } = montar("dark", "dark");
  run("applyTheme(state.data.theme); watchSystemTheme();");
  check("parte de 'dark' escolhido", raiz.atributos["data-theme"] === "dark");

  run(`state.data.theme = "system"; applyTheme(state.data.theme);`);
  dispositivo.trocarPara("light");
  check("depois de voltar para 'system', o aparelho volta a mandar",
    raiz.atributos["data-theme"] === "light", raiz.atributos["data-theme"]);
  check("e a chave passa a guardar 'system'",
    ctx.localStorage.getItem("financas_theme") === "system", ctx.localStorage.getItem("financas_theme"));
}

section("4. Valor desconhecido cai no automático, não em branco");
{
  const { raiz, run } = montar("dark", "roxo");
  run("applyTheme(state.data.theme);");
  check("tema inválido resolve para o do aparelho", raiz.atributos["data-theme"] === "dark", raiz.atributos["data-theme"]);

  const { raiz: r2, run: run2 } = montar("light", undefined);
  run2("applyTheme(state.data.theme);");
  check("tema ausente resolve para o do aparelho", r2.atributos["data-theme"] === "light", r2.atributos["data-theme"]);
}

section("5. O resto do app concorda com esta regra");
{
  const storage = readSrc("js/storage.js");
  const boot = readSrc("js/boot.js");
  const settings = readSrc("js/screens/settings.js");
  const acoes = readSrc("js/actions.js");
  const app = readSrc("js/app.js");

  check("'system' é um valor de primeira classe no armazenamento",
    /const THEME_CHOICES = \["system", "light", "dark"\]/.test(storage));
  check("instalação nova nasce em 'system'", /theme: "system",/.test(storage));
  check("a normalização aceita os três e recusa o resto",
    /data\.theme = THEME_CHOICES\.indexOf\(data\.theme\) >= 0 \? data\.theme : "system";/.test(storage));

  // O `boot.js` roda antes da primeira pintura e é ele que evita o piscar.
  check("o boot resolve 'system' contra a preferência atual",
    /escolha === "system" \? preferenciaDoSistema\(\)/.test(boot));
  check("e o boot não trata mais a chave como resultado",
    !/theme !== "dark" && theme !== "light"[\s\S]{0,80}matchMedia/.test(boot));

  check("Ajustes oferece as três opções",
    /id: "system"/.test(settings) && /id: "light"/.test(settings) && /id: "dark"/.test(settings));
  check("as opções são um grupo de rádio, não um interruptor",
    /role="radiogroup"/.test(settings) && /role="radio"/.test(settings) && !/data-action="toggle-theme"/.test(settings));
  check("a ação grava a escolha validada", /case "set-theme"/.test(acoes) && /THEME_CHOICES\.indexOf\(value\)/.test(acoes));

  // O caminho antigo tem de estar MORTO, não só sem uso: enquanto ele existir,
  // alguém volta a chamá-lo.
  // A menção em comentário fica: ela é o registro do defeito. O que não pode
  // sobreviver é o CÓDIGO, porque enquanto ele existir alguém volta a chamá-lo.
  check("a fixação de uma vez só saiu do código",
    !/const __themeNeverChosen/.test(app)
    && !/function systemThemePreference/.test(app)
    && !/systemThemePreference\(\)/.test(app));
  check("o init acompanha o sistema em vez de gravar um palpite",
    /watchSystemTheme\(\);/.test(app) && !/__systemTheme/.test(app));
}

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"}: ${pass} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
