"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUTPUT = path.join(ROOT, "js", "modules", "app.generated.js");

const SOURCES = Object.freeze([
  "js/utils.js",
  "js/perf.js",
  "js/router.js",
  "js/icons.js",
  "js/rules.js",
  "js/layout.js",
  "js/safe-errors.js",
  "js/storage.js",
  "js/backup-crypto.js",
  "js/auth.js",
  "js/cloud-sync.js",
  "js/accounts.js",
  "js/movements.js",
  "js/data-sources.js",
  "js/reconcile.js",
  "js/debts.js",
  "js/budgets.js",
  "js/charts.js",
  "js/pdf.js",
  "js/import.js",
  "js/pdf-import.js",
  "js/nlp.js",
  "js/score.js",
  "js/metrics.js",
  "js/health.js",
  "js/wealth.js",
  "js/goals.js",
  "js/forecast.js",
  "js/transparency.js",
  "js/calendar.js",
  "js/recurring.js",
  "js/analytics.js",
  "js/insights.js",
  "js/assistant.js",
  "js/contextual-assistant.js",
  "js/advisor.js",
  "js/investments.js",
  "js/portfolio.js",
  "js/simulators.js",
  "js/qrcode.js",
  "js/achievements.js",
  "js/wrapped.js",
  "js/services.js",
  "js/demo.js",
  "js/screens/_shared.js",
  "js/screens/onboarding.js",
  "js/screens/dashboard.js",
  "js/screens/accounts.js",
  "js/screens/debts.js",
  "js/screens/add.js",
  "js/screens/analytics.js",
  "js/screens/goals.js",
  "js/screens/calendar.js",
  "js/screens/health.js",
  "js/screens/wealth.js",
  "js/screens/portfolio.js",
  "js/screens/invest.js",
  "js/screens/simulators.js",
  "js/screens/simulate.js",
  "js/screens/insights.js",
  "js/screens/subscriptions.js",
  "js/screens/notifications.js",
  "js/screens/achievements.js",
  "js/screens/import.js",
  "js/screens/all.js",
  "js/screens/rules.js",
  "js/screens/categories.js",
  "js/screens/settings.js",
  "js/screens/privacy.js",
  "js/screens/account.js",
  "js/screens/modals.js",
  "js/actions.js",
  "js/app.js",
]);

// ==============================================================================
// [M41] O PACOTE EM DOIS PEDAÇOS
// ==============================================================================
// Abrir o painel baixava e executava o app inteiro: simuladores, importação de
// PDF, carteira, conquistas, ajustes, privacidade. Medido neste repositório, o
// caminho crítico da primeira pintura carregava 271 kB brotli quando precisava
// de 209.
//
// As telas abaixo saem para um segundo pedaço, buscado por `import()`. O corte
// não é arbitrário: é o fecho de dependências do primeiro quadro. Ficaram no
// núcleo `dashboard`, `_shared`, `onboarding` e `modals` (o primeiro quadro e as
// camadas que abrem de qualquer tela), e mais `add`, `insights`, `calendar`,
// `achievements` e `subscriptions`, porque essas cinco DESENHAM CARTÕES DO
// PAINEL. Adiá-las tiraria bytes do caminho crítico entregando um painel
// incompleto na primeira pintura, que é trocar um problema por outro pior.
//
// A ordem relativa é a mesma de `SOURCES`: o pacote continua sendo concatenação,
// e concatenação depende de ordem.
//
// SEIS TELAS QUE PARECIAM ADIÁVEIS E NÃO SÃO. Categorias, Análises,
// Simuladores, Patrimônio, Carteira e Importar declaram funções que o núcleo
// chama fora de `renderScreen`: a bolha de categoria no onboarding, o histórico
// no formulário de lançamento, o cartão de IA na Central, a ficha de cálculo
// nas camadas sobrepostas, as fábricas de formulário em `actions.js` e os
// remendos cirúrgicos de linha da importação. Nenhum desses pontos sabe
// esperar um arquivo chegar, e a verificação em `analisar()` derruba o build
// se alguém tentar adiá-las de novo sem antes mover a declaração.
const DEFERRED = Object.freeze([
  "js/screens/accounts.js",
  "js/screens/debts.js",
  "js/screens/goals.js",
  "js/screens/health.js",
  "js/screens/wealth.js",
  "js/screens/portfolio.js",
  "js/screens/simulate.js",
  "js/screens/notifications.js",
  "js/screens/all.js",
  "js/screens/rules.js",
  "js/screens/settings.js",
  "js/screens/privacy.js",
  "js/screens/account.js",
]);

const OUTPUT_EXTRAS = path.join(ROOT, "js", "modules", "app.extras.generated.js");
const CORE = SOURCES.filter((f) => DEFERRED.indexOf(f) === -1);

// O núcleo declara `state` com `let` por motivo histórico e NUNCA o reatribui:
// tudo é mutação de campo. Por isso a cópia que o segundo pedaço recebe aponta
// para o mesmo objeto e continua válida. Qualquer OUTRO `let`/`var` do núcleo
// que o segundo pedaço passe a ler derruba o build de propósito: uma
// reatribuição lá deixaria a cópia daqui velha, e o defeito apareceria como
// tela desatualizada sem erro nenhum no console.
const MUTAVEIS_PERMITIDOS = Object.freeze(["state"]);

function normalize(source) {
  return source.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trimEnd();
}

function ler(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) throw new Error(`Fonte ausente: ${relativePath}`);
  return normalize(fs.readFileSync(absolutePath, "utf8"));
}

// Código sem comentários e sem literais de texto, para a varredura de
// identificadores não contar uma palavra escrita numa frase como referência.
// O conteúdo das interpolações de template volta, porque ali é código de
// verdade e é onde as telas chamam quase tudo.
function semTextoNemComentario(codigo) {
  let out = "";
  let i = 0;
  const n = codigo.length;
  let estado = null;
  while (i < n) {
    const c = codigo[i];
    const d = codigo[i + 1];
    if (estado === null) {
      if (c === "/" && d === "/") { estado = "linha"; i += 2; continue; }
      if (c === "/" && d === "*") { estado = "bloco"; i += 2; continue; }
      if (c === "'" || c === '"' || c === "`") { estado = c; i += 1; out += " "; continue; }
      out += c; i += 1; continue;
    }
    if (estado === "linha") { if (c === "\n") { estado = null; out += "\n"; } i += 1; continue; }
    if (estado === "bloco") { if (c === "*" && d === "/") { estado = null; i += 2; out += " "; continue; } i += 1; continue; }
    if (c === "\\") { i += 2; continue; }
    if (estado === "`" && c === "$" && d === "{") {
      let nivel = 1; i += 2; let dentro = "";
      while (i < n && nivel > 0) {
        if (codigo[i] === "{") nivel++;
        else if (codigo[i] === "}") { nivel--; if (!nivel) break; }
        dentro += codigo[i]; i += 1;
      }
      out += " " + semTextoNemComentario(dentro) + " ";
      i += 1; continue;
    }
    if (c === estado) { estado = null; out += " "; }
    i += 1;
  }
  return out;
}

// Declarações de TOPO (coluna zero). É o mesmo critério de `scripts/lint.js`,
// que já garante que nenhum nome se repete entre arquivos.
function declaracoesDe(codigo) {
  const out = new Map();
  const regex = /^(const|let|var|class|function)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = regex.exec(codigo)) !== null) out.set(m[2], m[1]);
  return out;
}

// Identificadores referenciados, sem os acessos a propriedade. A varredura
// SUPERESTIMA de propósito: `obj.render` não conta (tem ponto antes), mas uma
// chave solta em desestruturação conta. Superestimar engorda o núcleo; o erro
// na direção contrária deixaria passar uma referência que só quebra no
// navegador do usuário.
function referenciasDe(codigo) {
  const out = new Set();
  const limpo = semTextoNemComentario(codigo);
  const re = /(\.\s*)?\b([A-Za-z_$][\w$]*)\b/g;
  let m;
  while ((m = re.exec(limpo)) !== null) {
    if (m[1]) continue;
    out.add(m[2]);
  }
  return out;
}

// A ANÁLISE QUE TORNA O CORTE VERIFICÁVEL.
//
// Sem ela, mover uma tela para o segundo pedaço é apostar que ninguém no núcleo
// chama uma função dela. A aposta perdida não aparece no build nem nos testes
// de Node (que carregam as fontes num escopo só): aparece como ReferenceError
// no navegador de quem clicou. Aqui as duas travessias são calculadas e as duas
// ganham ponte gerada.
function analisar() {
  const codigo = new Map();
  const dono = new Map();
  const tipo = new Map();
  SOURCES.forEach((f) => {
    const src = ler(f);
    codigo.set(f, src);
    declaracoesDe(src).forEach((kind, nome) => { dono.set(nome, f); tipo.set(nome, kind); });
  });
  const ehExtra = (f) => DEFERRED.indexOf(f) !== -1;

  // núcleo -> segundo pedaço: cada nome vira uma função-ponte no núcleo.
  const paraExtras = new Set();
  CORE.forEach((f) => referenciasDe(codigo.get(f)).forEach((nome) => {
    if (dono.has(nome) && ehExtra(dono.get(nome))) paraExtras.add(nome);
  }));
  const naoFuncao = [...paraExtras].filter((nome) => tipo.get(nome) !== "function");
  if (naoFuncao.length) {
    throw new Error(`O núcleo lê ${naoFuncao.map((n) => `"${n}" (${tipo.get(n)} em ${dono.get(n)})`).join(", ")} do segundo pedaço. `
      + "Só função vira ponte: um valor não pode ser buscado depois que já foi lido. "
      + "Mova a declaração para um arquivo do núcleo, ou traga o arquivo inteiro de volta tirando-o de DEFERRED.");
  }

  // A PONTE SÓ É SEGURA NO LUGAR ONDE DÁ PARA ESPERAR.
  //
  // Uma ponte chamada antes de o segundo pedaço chegar não devolve tela: ela
  // lança. `renderScreen` sabe esperar (mostra esqueleto e redesenha quando o
  // arquivo chega), e é o ÚNICO lugar do app que sabe. Qualquer outra chamada
  // no núcleo, mesmo correta hoje, é uma bomba-relógio: basta o usuário clicar
  // antes de a rede responder.
  //
  // Foi assim que a primeira versão deste corte quebrou o onboarding, que é
  // núcleo e desenhava a bolha de categoria com uma função da tela Categorias.
  // O teste de navegador pegou; este bloco pega antes, e diz o que fazer.
  const switchDeTelas = /case\s+"[a-z-]+"\s*:\s*return\s+([A-Za-z_$][\w$]*)\s*\(/g;
  const noSwitch = new Map();
  let sm;
  while ((sm = switchDeTelas.exec(codigo.get("js/app.js"))) !== null) {
    noSwitch.set(sm[1], (noSwitch.get(sm[1]) || 0) + 1);
  }
  const foraDoSwitch = [];
  paraExtras.forEach((nome) => {
    const usuarios = CORE.filter((f) => referenciasDe(codigo.get(f)).has(nome));
    const soNoApp = usuarios.length === 1 && usuarios[0] === "js/app.js";
    // No app.js o nome pode aparecer só como destino do `switch`; qualquer
    // ocorrência a mais é uma chamada que não sabe esperar.
    const ocorrencias = soNoApp
      ? (semTextoNemComentario(codigo.get("js/app.js")).match(new RegExp(`(?<![.\\w$])${nome}(?![\\w$])`, "g")) || []).length
      : 0;
    if (!soNoApp || ocorrencias !== (noSwitch.get(nome) || 0)) {
      foraDoSwitch.push({ nome, arquivos: usuarios });
    }
  });
  if (foraDoSwitch.length) {
    throw new Error("Estas funções do segundo pedaço são chamadas fora do `switch` de `renderScreen`, "
      + "onde não há como esperar o arquivo chegar:\n"
      + foraDoSwitch.map((x) => `  ${x.nome} (de ${dono.get(x.nome)}) chamada em ${x.arquivos.join(", ")}`).join("\n")
      + "\nMova a declaração para um arquivo do núcleo, ou tire o arquivo de DEFERRED.");
  }

  // segundo pedaço -> núcleo: os nomes chegam por `instalarNucleo`.
  const doNucleo = new Set();
  DEFERRED.forEach((f) => referenciasDe(codigo.get(f)).forEach((nome) => {
    if (dono.has(nome) && !ehExtra(dono.get(nome))) doNucleo.add(nome);
  }));
  const mutaveis = [...doNucleo].filter((nome) => (tipo.get(nome) === "let" || tipo.get(nome) === "var")
    && MUTAVEIS_PERMITIDOS.indexOf(nome) === -1);
  if (mutaveis.length) {
    throw new Error(`O segundo pedaço lê ${mutaveis.map((n) => `"${n}" (${tipo.get(n)} em ${dono.get(n)})`).join(", ")} do núcleo. `
      + "Vínculo reatribuível não atravessa a ponte: a cópia de lá ficaria velha em silêncio. "
      + "Troque para `const`, ou registre em MUTAVEIS_PERMITIDOS explicando por que nunca é reatribuído.");
  }

  const nomesExtras = [];
  DEFERRED.forEach((f) => declaracoesDe(codigo.get(f)).forEach((_kind, nome) => nomesExtras.push(nome)));

  // QUAIS ABAS PRECISAM ESPERAR O SEGUNDO PEDAÇO.
  //
  // A lista não é escrita à mão: sai do próprio `switch` de `renderScreen`, que
  // já é a tabela de "aba -> função que desenha". Uma aba entra aqui quando a
  // função dela virou ponte. Escrever a lista à mão seria criar uma segunda
  // verdade que envelhece na primeira tela que mudar de pedaço.
  const abas = [];
  const switchRe = /case\s+"([a-z-]+)"\s*:\s*return\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let s;
  while ((s = switchRe.exec(codigo.get("js/app.js"))) !== null) {
    if (paraExtras.has(s[2])) abas.push(s[1]);
  }

  return {
    codigo,
    pontes: [...paraExtras].sort(),
    doNucleo: [...doNucleo].sort(),
    exportados: nomesExtras.sort(),
    abas: [...new Set(abas)].sort(),
  };
}

function corpo(lista, codigo) {
  return lista.map((f) => `// source: ${f}\n${codigo.get(f)}`).join("\n\n");
}

function build() {
  const banner = [
    "// Arquivo gerado por scripts/build-app-module.js.",
    "// Edite os arquivos de origem em js/ e execute npm run build.",
    "",
  ].join("\n");
  const a = analisar();

  // ---- ponte do núcleo para o segundo pedaço ----
  // As funções abaixo têm o nome exato das do segundo pedaço, e por isso o
  // código-fonte não muda em lugar nenhum: `renderDebtsScreen()` continua
  // sendo `renderDebtsScreen()`. Declaração de função é içada, então a ponte
  // já existe antes de qualquer linha do núcleo rodar.
  const ponte = [
    "",
    "/* ---- ponte para o segundo pedaço (gerado; ver scripts/build-app-module.js) ---- */",
    "let __extrasCarregados = null;",
    "let __extrasEmVoo = null;",
    "function extrasProntos() { return !!__extrasCarregados; }",
    "function __extrasAgora() {",
    "  if (!__extrasCarregados) throw new Error('Tela ainda não carregada: chame carregarExtras() antes de renderizar.');",
    "  return __extrasCarregados;",
    "}",
    `const TELAS_ADIADAS = ${JSON.stringify(a.abas)};`,
    "function carregarExtras() {",
    "  if (__extrasCarregados) return Promise.resolve(__extrasCarregados);",
    "  if (!__extrasEmVoo) {",
    "    __extrasEmVoo = import('./app.extras.generated.js').then((mod) => {",
    `      mod.instalarNucleo({ ${a.doNucleo.join(", ")} });`,
    "      __extrasCarregados = mod;",
    "      return mod;",
    "    }).catch((erro) => { __extrasEmVoo = null; throw erro; });",
    "  }",
    "  return __extrasEmVoo;",
    "}",
    ...a.pontes.map((nome) => `function ${nome}(...args) { return __extrasAgora().${nome}(...args); }`),
    "",
  ].join("\n");

  const nucleo = `${banner}${corpo(CORE, a.codigo)}\n${ponte}`;

  // ---- segundo pedaço ----
  // Nada é importado do núcleo: os nomes chegam por atribuição. É o que impede
  // o ciclo entre os dois módulos, e `scripts/build-dist.js` precisa de um
  // grafo acíclico para nomear cada arquivo pelo próprio conteúdo.
  const cabecalho = [
    "// Arquivo gerado por scripts/build-app-module.js.",
    "// Segundo pedaço do pacote: telas que não fazem parte da primeira pintura.",
    "// Edite os arquivos de origem em js/ e execute npm run build.",
    "",
    `let ${a.doNucleo.join(", ")};`,
    "export function instalarNucleo(n) {",
    `  ({ ${a.doNucleo.join(", ")} } = n);`,
    "}",
    "",
  ].join("\n");
  const extras = `${cabecalho}${corpo(DEFERRED, a.codigo)}\n\nexport {\n  ${a.exportados.join(",\n  ")},\n};\n`;

  return { nucleo: `${nucleo}`, extras, analise: a };
}

// Só executa quando chamado direto. Sem esta guarda, qualquer `require` deste
// arquivo (a análise estática precisa da lista `SOURCES`) dispararia o build
// como efeito colateral.
if (require.main === module) {
  const esperado = build();
  const saidas = [
    { arquivo: OUTPUT, rotulo: "js/modules/app.generated.js", conteudo: esperado.nucleo },
    { arquivo: OUTPUT_EXTRAS, rotulo: "js/modules/app.extras.generated.js", conteudo: esperado.extras },
  ];
  if (process.argv.includes("--check")) {
    const desatualizados = saidas.filter(({ arquivo, conteudo }) => {
      const atual = fs.existsSync(arquivo) ? normalize(fs.readFileSync(arquivo, "utf8")) + "\n" : "";
      return atual !== normalize(conteudo) + "\n";
    });
    if (desatualizados.length) {
      console.error(`${desatualizados.map((s) => s.rotulo).join(" e ")} desatualizado(s). Execute npm run build.`);
      process.exit(1);
    }
    console.log(`Pacote conferido: ${CORE.length} fontes no núcleo, ${DEFERRED.length} no segundo pedaço.`);
  } else {
    saidas.forEach(({ arquivo, conteudo }) => fs.writeFileSync(arquivo, normalize(conteudo) + "\n", "utf8"));
    console.log(`Pacote gerado: ${CORE.length} fontes no núcleo, ${DEFERRED.length} no segundo pedaço `
      + `(${esperado.analise.pontes.length} pontes de ida, ${esperado.analise.doNucleo.length} nomes de volta).`);
  }
}

module.exports = { SOURCES, CORE, DEFERRED, build };
