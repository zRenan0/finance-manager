// Transparência de cálculos, Assistente financeiro contextual e central de fontes.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const ctx = {
  console, module:{ exports:{} }, setTimeout, clearTimeout, setInterval, clearInterval,
  indexedDB:undefined, localStorage:undefined, document:{ addEventListener(){}, visibilityState:"visible" },
  navigator:{ userAgent:"node" }, addEventListener(){}, removeEventListener(){},
};
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
[
  "js/utils.js", "js/rules.js", "js/layout.js", "js/storage.js", "js/accounts.js", "js/movements.js",
  "js/data-sources.js", "js/debts.js", "js/budgets.js", "js/score.js", "js/metrics.js", "js/wealth.js",
  "js/goals.js", "js/forecast.js", "js/transparency.js", "js/contextual-assistant.js",
].forEach((file) => vm.runInContext(read(file), ctx, { filename:file }));
const run = (code) => vm.runInContext(code, ctx);

let pass = 0, fail = 0;
function check(name, condition, extra) {
  if (condition) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra === undefined ? "" : ` → ${extra}`}`); }
}

ctx.__data = run(`migrate({ version:21, monthlyIncome:5000,
  accounts:[
    {id:'a1',name:'Principal',openingBalance:20000,openingDate:'2026-01-01',reconciledAt:'2026-08-12'},
    {id:'a2',name:'Reserva',openingBalance:1000,openingDate:'2026-01-01'}
  ],
  creditCards:[{id:'c1',name:'Cartão',accountId:'a1',limit:5000,closingDay:20,dueDay:28}],
  transactions:[
    {id:'m1',type:'expense',amount:100,date:'2026-08-01',categoryId:'alimentacao',description:'Mercado',source:'manual',accountId:'a1'},
    {id:'o1',type:'expense',amount:70,date:'2026-08-02',categoryId:'outros',description:'Loja',source:'import-ofx',accountId:'a1',origin:{channel:'import-ofx',label:'Extrato OFX',reference:'agosto.ofx',importedAt:'2026-08-12T10:00:00Z'}},
    {id:'n1',type:'expense',amount:30,date:'2026-08-03',categoryId:'lazer',description:'Cinema',source:'nlp',accountId:'a1'},
    {id:'c1t',type:'expense',amount:200,date:'2026-08-04',categoryId:'alimentacao',description:'Compra cartão',source:'manual',creditCardId:'c1',payment:'Crédito'}
  ],
  goals:[{id:'g1',name:'Viagem',target:12000,current:1000,deadline:'2027-08-01',monthlyPlan:500,createdAt:'2026-01-01T00:00:00Z'}],
  assets:[{id:'d1',class:'divida',kind:'liability',name:'Empréstimo',value:3000,monthlyPayment:300,ratePct:2,ratePeriod:'monthly',balanceCheckedAt:'2026-08-01'}]
})`);

console.log("\n1. Transparência dos cálculos");
ctx.__worth = run("calculationExplanation(__data, 'net-worth')");
check("patrimônio é classificado como realizado", ctx.__worth.kinds.length === 1 && ctx.__worth.kinds[0] === "realized");
check("explicação informa fórmula e premissas", /Caixa/.test(ctx.__worth.formula) && ctx.__worth.premises.length >= 3);
ctx.__forecast = run("calculationExplanation(__data, 'forecast')");
check("previsão separa realizado, previsto e estimado", ["realized","forecast","estimated"].every((kind) => ctx.__forecast.kinds.includes(kind)));
check("data de atualização é rastreável", !!ctx.__forecast.updatedAt, ctx.__forecast.updatedAt);
ctx.__sim = run("calculationExplanation(__data, 'simulator', { title:'Teste', premises:['Taxa: 10%'] })");
check("simulador é identificado como estimativa", ctx.__sim.kinds.join() === "estimated" && ctx.__sim.premises.some((item) => /Taxa/.test(item)));

console.log("\n2. Fontes e contas");
ctx.__sources = run("buildDataSourcesModel(__data)");
check("não finge conexão bancária", ctx.__sources.connection.connected === false && /Sem sincronização/.test(ctx.__sources.connection.detail));
check("agrega manual, OFX e texto livre", ["manual","import-ofx","nlp"].every((id) => ctx.__sources.sources.some((source) => source.id === id)));
check("preserva referência do arquivo", ctx.__sources.sources.find((source) => source.id === "import-ofx").reference === "agosto.ofx");
check("conta mostra movimentações e pendência de conciliação", ctx.__sources.accountStats.find((item) => item.accountId === "a1").movementCount === 3 && ctx.__sources.pendingCount > 0);
check("cartão tem contagem própria", ctx.__sources.cardStats.find((item) => item.cardId === "c1").movementCount === 1);

console.log("\n3. Assistente financeiro contextual");
ctx.__accountsAssistant = run("buildContextualAssistant(__data, 'accounts')");
check("perguntas mudam para contas", ctx.__accountsAssistant.screenLabel === "Contas" && ctx.__accountsAssistant.items.some((item) => item.id === "accounts-update"));
ctx.__purchase = ctx.__accountsAssistant.items.find((item) => item.id === "accounts-purchase");
check("abre comparador com saldo preenchido", ctx.__purchase.action.simId === "entrada-amortizacao" && ctx.__purchase.action.values.dinheiro === "20800,00", JSON.stringify(ctx.__purchase.action));
ctx.__debtsAssistant = run("buildContextualAssistant(__data, 'debts')");
check("dívidas recebe resposta baseada no plano", ctx.__debtsAssistant.items.some((item) => item.id === "debt-priority" && /Empréstimo/.test(item.answer)));
ctx.__movementAssistant = run("buildContextualAssistant(__data, 'analytics')");
check("movimentações oferece a central de fontes", ctx.__movementAssistant.items.some((item) => item.action && item.action.kind === "accounts-sources"));
check("Assistente financeiro fica limitado a três sugestões", ctx.__accountsAssistant.items.length <= 3 && ctx.__debtsAssistant.items.length <= 3);


/* ==============================================================================
 * IA: prévia, ocultação, sem "anônimo" falso e sem score do modelo
 * ============================================================================== */
console.log("\nEnvio para a IA");
{
  const analyze = read("netlify/functions/analyze.js");
  const insightsSrc = read("js/insights.js");
  const privacyScreen = read("js/screens/privacy.js");

  // 1. O pacote não é anônimo: ele leva nomes escolhidos pelo usuário. Chamar
  // de anônimo é promessa que o código não cumpre.
  check("a função de montagem não se chama mais 'anônima'", /function buildAiPayload\(/.test(insightsSrc));
  check("o código explica por que não é anônimo", /o nome errado é perigoso/.test(insightsSrc));
  check("a tela de privacidade não promete anonimato",
    /não são chamados de anônimos/.test(privacyScreen), "texto da tela");

  // 2. Prévia do envio: consentir sem ver não é consentir.
  check("existe prévia do pacote", /function buildAiPayloadPreview\(/.test(insightsSrc));
  check("a prévia usa o MESMO objeto do envio", /const pacote = buildAiPayload\(data, monthKey, options\);/.test(insightsSrc));
  check("a prévia diz o que NÃO vai junto", /Não leva descrições de lançamentos/.test(insightsSrc));

  // 3. Ocultação: o usuário pode tirar partes antes de enviar.
  check("há campos ocultáveis declarados", /AI_HIDEABLE_FIELDS/.test(insightsSrc));
  check("ocultar metas remove o campo", /if \(esconder\.has\("metas"\)\) delete pacote\.metas;/.test(insightsSrc));
  check("ocultar categorias troca os nomes", /Categoria \$\{i \+ 1\}/.test(insightsSrc));

  // 4. Ameaça não é forçada: sem risco nos números, a lista vem vazia.
  check("o prompt não obriga um número mínimo de riscos", !/Inclua de 2 a 4 itens em "riscos"/.test(analyze));
  check("o prompt manda devolver lista vazia sem risco", /devolva uma lista vazia/.test(analyze));
  check("o prompt proíbe inventar preocupação", /Não invente preocupação/.test(analyze));

  // 5. Score do modelo é descartado: o app tem nota própria e auditável.
  check("o prompt proíbe o modelo de dar nota", /NÃO devolva nota, score ou pontuação/.test(analyze));
  check("a resposta não carrega score do modelo", !/^\s*score,$/m.test(analyze));
  check("o motivo do descarte está no código", /calculada por regras auditáveis/.test(analyze));

  // 6. A prévia chegou à TELA. Antes, o motor existia e a interface mostrava um
  // parágrafo descrevendo o pacote: o usuário consentia sobre a descrição, não
  // sobre o conteúdo.
  const app = read("js/app.js");
  const insightsScreen = read("js/screens/insights.js");
  const actions = read("js/actions.js");
  const analytics = read("js/screens/analytics.js");

  check("existe tela de prévia do envio", /function renderAiPreviewModal\(\)/.test(insightsScreen));
  check("a tela usa a MESMA função que monta o envio", /buildAiPayloadPreview\(state\.data, mKey, \{ hide \}\)/.test(insightsScreen));
  check("a tela mostra o pacote inteiro, não só o resumo", /preview\.json/.test(insightsScreen));
  check("a tela mostra o tamanho do pacote", /preview\.bytes/.test(insightsScreen));
  check("a tela oferece cada campo ocultável", /preview\.ocultaveis/.test(insightsScreen));
  check("chave interna não é anunciada como campo enviado", /nome\.charAt\(0\) !== "_"/.test(insightsScreen));

  check("o envio não abre mais o diálogo genérico de confirmação",
    !/requestConfirmation\([\s\S]{0,200}Enviar dados agregados/.test(app));
  check("o botão de análise abre a prévia", /openOverlay\("ai-preview"\)/.test(app));
  check("a prévia tem ação de enviar e de cancelar",
    /case "ai-preview-send"/.test(actions) && /case "ai-preview-cancel"/.test(actions));

  // A ocultação escolhida precisa ATRAVESSAR até o envio. Prévia mostrando um
  // pacote e envio mandando outro seria pior do que não ter prévia.
  check("o envio aceita a ocultação escolhida",
    /async function requestStructuredAnalysis\(data, monthKey, options\)/.test(insightsSrc));
  check("o envio monta o pacote com as opções", /const payload = buildAiPayload\(data, monthKey, options\);/.test(insightsSrc));
  check("a tela repassa as opções escolhidas", /requestStructuredAnalysis\(state\.data, mKey, opcoes\)/.test(app));

  check("a escolha vira preferência salva", /aiHide: normalizeAiHide\(opcoes\.hide\)/.test(app));
  check("a preferência salva abre a prévia já marcada", /hide: salvo\.slice\(\)/.test(app));
  check("a tela de privacidade também deixa escolher os campos",
    /data-action-select="privacy-ai-field"/.test(privacyScreen) && /AI_HIDEABLE_FIELDS/.test(privacyScreen));

  // O cartão prometia prévia antes de ela existir.
  check("o cartão não promete mais uma prévia que não existia",
    !/Antes do envio você verá exatamente quais dados/.test(analytics));
  check("o cartão descreve o que a tela realmente faz",
    /pode tirar partes dele/.test(analytics));

  // Formato do que fica guardado: nome desconhecido é inerte no motor, então
  // aqui basta impedir lixo (objeto, script, lista infinita).
  check("preferência de ocultação é saneada", (() => {
    const limpo = run("normalizeAiHide(['metas', 'metas', {x:1}, '<script>', 'ORCAMENTO', 'historico'])");
    return limpo.length === 2 && limpo.indexOf("metas") !== -1 && limpo.indexOf("historico") !== -1;
  })());
  check("preferência de ocultação tem teto",
    run("normalizeAiHide(Array.from({length:40},(_,i)=>'campo'+String.fromCharCode(97+i%26))).length") <= 12);
  check("base nova não oculta nada por padrão", run("defaultPrivacy().aiHide.length") === 0);
}

console.log(`\nResultado: ${pass} passou, ${fail} falhou.`);
if (fail) process.exit(1);
