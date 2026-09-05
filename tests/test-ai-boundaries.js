// test-ai-boundaries.js — harness do M37 (IA financeira).
//
// O QUE ESTE ARQUIVO PROVA
//
// 1. o prompt não pede mais um "consultor financeiro" e proíbe, por escrito,
//    recomendação de investimento, produto, instituição e alocação;
// 2. o prompt parou de chamar o pacote de ANÔNIMO, que é o que o resto do
//    aplicativo já tinha corrigido em toda parte menos ali;
// 3. o filtro de saída derruba a recomendação de produto e **deixa passar** a
//    educação sobre risco, que é o texto que o roteiro pede;
// 4. as duas cópias do filtro (servidor e navegador) são idênticas;
// 5. o rótulo de natureza é gerado pelo código, não pedido ao modelo, e a tela
//    o exibe nos dois caminhos de renderização;
// 6. nada do texto removido vai para log.
//
// Ferramenta de dev: `node tests/test-ai-boundaries.js`.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const boundaries = require(path.join(ROOT, "netlify/functions/_shared/ai-boundaries.js"));
const analyze = read("netlify/functions/analyze.js");
const insightsSrc = read("js/insights.js");
const analyticsScreen = read("js/screens/analytics.js");
const transparency = read("js/transparency.js");
const appSrc = read("js/app.js");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? ` → ${extra}` : ""}`); }
}

/* ------------------------------------------------- 1. o prompt */
console.log("\n1. O prompt declara o limite");
{
  // O texto do PROMPT, não o comentário que conta a história: o cabeçalho da
  // função cita a persona antiga de propósito, para explicar por que ela saiu.
  check("a persona não é mais de consultor financeiro", !/return `Você é um consultor financeiro/.test(analyze));
  check("a persona é de organizador de orçamento", /Você é um organizador de orçamento doméstico/.test(analyze));
  check("o prompt diz o que a IA faz", /O QUE VOCÊ FAZ: explica, resume, organiza/.test(analyze));
  check("o prompt diz o que a IA não faz", /O QUE VOCÊ NÃO FAZ: recomendação de investimento/.test(analyze));
  check("proíbe recomendar investimento em regra explícita", /PROIBIDO recomendar investimento/.test(analyze));
  check("proíbe nomear ativo e produto", /Não cite ação, ticker, fundo, ETF, FII/.test(analyze));
  check("proíbe percentual de carteira", /não sugira percentual de carteira/.test(analyze));
  check("proíbe prometer rentabilidade", /Não prometa rentabilidade, retorno ou valorização/.test(analyze));
  check("ensina o enquadramento aceitável (prazo, volatilidade, uso do dinheiro)",
    /fale de PRAZO, VOLATILIDADE e da necessidade de\s*\n?\/\/?\s*usar o dinheiro/.test(analyze) || /PRAZO, VOLATILIDADE/.test(analyze));
  check("exige que número futuro seja hipótese declarada", /Todo número sobre o FUTURO é hipótese/.test(analyze));

  // Regras antigas que continuam valendo; o M37 não pode tê-las derrubado.
  check("o prompt segue proibindo nota", /NÃO devolva nota, score ou pontuação/.test(analyze));
  check("o prompt segue mandando lista de riscos vazia quando não há risco", /devolva uma lista vazia/.test(analyze));
}

/* --------------------------------------- 2. o pacote não é anônimo */
console.log("\n2. O prompt parou de dizer 'anônimo'");
{
  check("o prompt não chama mais os dados de anônimos", !/dados AGREGADOS e ANÔNIMOS/.test(analyze));
  check("o prompt diz que agregado não é anônimo", /NÃO são anônimos/.test(analyze));
  check("o prompt manda não comentar os nomes", /Não comente os nomes/.test(analyze));
}

/* --------------------------------------------- 3. o filtro de saída */
console.log("\n3. O filtro derruba produto e preserva educação");
const BLOQUEAR = [
  ["Compre ações da Petrobras ainda este mês", "acao-nomeada"],
  ["Considere PETR4 para o longo prazo", "ticker"],
  ["Coloque a reserva em um fundo de investimento", "fundo-produto"],
  ["Vale a pena olhar fundos imobiliários", "fundo-produto"],
  ["Um CDB de liquidez diária renderia mais", "sigla-produto"],
  ["Migre para o Tesouro Selic", "renda-fixa-nomeada"],
  ["Previdência privada resolveria a aposentadoria", "renda-fixa-nomeada"],
  ["Uma parte pequena em bitcoin diversifica", "cripto"],
  ["Abra conta em uma corretora para começar", "intermediario"],
  ["Invista 40% em algo mais rentável", "alocacao-percentual"],
  ["Invista em ações agora", "ordem-de-mercado"],
];
const PASSAR = [
  // A frase que o roteiro do módulo dá como exemplo do que se DESEJA.
  "Para um objetivo de curto prazo, ativos de alta volatilidade podem apresentar risco incompatível com a necessidade de usar o dinheiro em breve",
  "As ações que você pode tomar neste mês são duas",
  "Seu fundo de emergência cobre 3,2 meses de despesa essencial",
  "Reduza o gasto com restaurantes em cerca de R$ 200 por mês",
  "Suas despesas fixas representam 61% da renda",
  "Você comprometeu 45% em necessidades, acima dos 50% combinados",
  "Um aporte mensal na meta Notebook fecha o prazo",
  "O dinheiro parado em conta perde poder de compra ao longo do tempo",
  "Guardar antes de gastar costuma funcionar melhor do que guardar o que sobra",
];
{
  BLOQUEAR.forEach(([texto, padrao]) => {
    const achado = boundaries.adviceViolation(texto);
    check(`bloqueia: ${texto.slice(0, 44)}…`, achado === padrao, `esperado ${padrao}, veio ${achado}`);
  });
  PASSAR.forEach((texto) => {
    check(`deixa passar: ${texto.slice(0, 44)}…`, !boundaries.violates(texto), boundaries.adviceViolation(texto));
  });
  check("texto vazio não é violação", !boundaries.violates("") && !boundaries.violates(null));
}

/* ------------------------------- 4. o filtro aplicado à análise */
console.log("\n4. A limpeza da análise inteira");
{
  const suja = {
    diagnostico: "Seu mês fechou positivo",
    fluxoCaixa: { situacao: "positivo", sobraEstimada: 800, comentario: "Aplique a sobra em um CDB" },
    riscos: [
      { titulo: "Fatura alta", nivel: "medio", descricao: "A fatura consome 38% da renda" },
      { titulo: "Dinheiro parado", nivel: "baixo", descricao: "Compre ações da Vale com o excedente" },
    ],
    recomendacoes: [
      { acao: "Reduzir delivery", impacto: "R$ 180 por mês" },
      { acao: "Invista 40% em renda variável", impacto: "mais retorno" },
    ],
    metasComentario: "A meta Viagem está no ritmo",
  };
  const { analise, removidos } = boundaries.stripAdvicePatterns(suja);

  check("o comentário de fluxo com produto sai vazio", analise.fluxoCaixa.comentario === "");
  check("o número do fluxo é preservado", analise.fluxoCaixa.sobraEstimada === 800);
  check("o risco legítimo fica", analise.riscos.length === 1 && analise.riscos[0].titulo === "Fatura alta");
  check("o risco com recomendação de ativo sai", !analise.riscos.some((r) => /Vale/.test(r.descricao)));
  check("a recomendação legítima fica", analise.recomendacoes.length === 1 && analise.recomendacoes[0].acao === "Reduzir delivery");
  check("a recomendação de alocação sai", !analise.recomendacoes.some((r) => /40%/.test(r.acao)));
  check("o diagnóstico limpo é preservado", analise.diagnostico === "Seu mês fechou positivo");
  check("o comentário de metas é preservado", analise.metasComentario === "A meta Viagem está no ritmo");
  check("o relatório traz só contadores por padrão", Object.values(removidos).every((v) => typeof v === "number"));
  check("o relatório não carrega o texto removido",
    !JSON.stringify(removidos).includes("CDB") && !JSON.stringify(removidos).includes("Vale"));

  const limpa = boundaries.stripAdvicePatterns({
    diagnostico: "Mês equilibrado", fluxoCaixa: { situacao: "equilibrado", comentario: "Entradas e saídas próximas" },
    riscos: [], recomendacoes: [{ acao: "Revisar assinaturas", impacto: "R$ 90" }], metasComentario: "",
  });
  check("análise sem violação sai intacta", Object.keys(limpa.removidos).length === 0
    && limpa.analise.diagnostico === "Mês equilibrado"
    && limpa.analise.recomendacoes.length === 1);
}

/* ------------------------------- 5. as duas cópias não podem divergir */
console.log("\n5. Servidor e navegador usam a MESMA lista");
{
  const extrai = (src) => {
    const inicio = src.indexOf("const AI_ADVICE_PATTERNS = [");
    const fim = src.indexOf("];", inicio);
    // Normaliza a ponta de linha: os dois arquivos vivem com convenções
    // diferentes nesta árvore, e CRLF contra LF não é divergência de conteúdo.
    return inicio === -1 || fim === -1 ? null : src.slice(inicio, fim + 2).replace(/\r\n/g, "\n").trim();
  };
  const doServidor = extrai(read("netlify/functions/_shared/ai-boundaries.js"));
  const doCliente = extrai(insightsSrc);
  check("as duas listas existem", !!doServidor && !!doCliente);
  check("as duas listas são idênticas, termo a termo", doServidor === doCliente,
    doServidor === doCliente ? "" : "a lista do cliente andou sem a do servidor (ou o contrário)");
  check("o cliente aponta para o arquivo canônico", /netlify\/functions\/_shared\/ai-boundaries\.js/.test(insightsSrc));
  check("o servidor avisa que existe cópia no cliente", /ESPELHADO NO CLIENTE/.test(read("netlify/functions/_shared/ai-boundaries.js")));

  const listaSensivel = (src) => {
    const m = src.match(/const AI_CASE_SENSITIVE = \[[^\]]*\]/);
    return m ? m[0] : null;
  };
  check("a lista de padrões sensíveis à caixa também é a mesma",
    listaSensivel(read("netlify/functions/_shared/ai-boundaries.js")) === listaSensivel(insightsSrc),
    listaSensivel(insightsSrc));

  // Comparar TEXTO prova que ninguém editou um lado só; comparar COMPORTAMENTO
  // prova que as duas cópias decidem igual. As duas verificações são
  // necessárias: texto igual com matcher diferente ainda divergiria na tela.
  const ctx = { console, module: { exports: {} }, navigator: { onLine: true } };
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  vm.createContext(ctx);
  ["js/utils.js", "js/insights.js"].forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));

  const divergencias = BLOQUEAR.map(([texto]) => texto).concat(PASSAR)
    .filter((texto) => ctx.aiAdviceViolation(texto) !== boundaries.adviceViolation(texto));
  check("cliente e servidor decidem igual em todos os casos do harness",
    divergencias.length === 0, divergencias.slice(0, 3));
  check("o cliente também deixa passar a frase-modelo do roteiro",
    !ctx.aiViolatesBoundaries(PASSAR[0]));
  check("o cliente também bloqueia recomendação de ativo",
    ctx.aiViolatesBoundaries("Compre ações da Petrobras ainda este mês"));
}

/* ------------------------------- 6. o cliente filtra de novo */
console.log("\n6. A resposta é entrada não confiável mesmo vinda do nosso backend");
{
  check("o cliente tem o filtro", /function stripAiAdvice\(/.test(insightsSrc));
  check("o cliente aplica o filtro na análise recebida", /analise: body\.analise \? stripAiAdvice\(body\.analise\) : null/.test(insightsSrc));
  check("o cliente descarta o texto corrido que violar", /aiViolatesBoundaries\(textoBruto\) \? "" : textoBruto/.test(insightsSrc));
  check("o servidor filtra antes de responder", /boundaries\.stripAdvicePatterns\(normalizeAnalysis\(parsed\)\)/.test(analyze));
  check("o caminho degradado (texto bruto) também é filtrado", /boundaries\.violates\(bruto\)/.test(analyze));
  check("análise esvaziada pelo filtro vira aviso, não cartão em branco", /function aiAnalysisIsEmpty\(/.test(insightsSrc)
    && /A resposta saiu do que este app pode dizer/.test(appSrc));
}

/* ------------------------------- 7. rótulo de natureza */
console.log("\n7. A natureza do conteúdo é declarada");
{
  check("o rótulo é gerado pelo código, não pelo modelo", /AI_NATURE = Object\.freeze/.test(read("netlify/functions/_shared/ai-boundaries.js")));
  check("o rótulo diz que é educativo", boundaries.AI_NATURE.tipo === "educacional");
  check("o rótulo nega recomendação de investimento", /Não é recomendação de investimento/.test(boundaries.AI_NATURE.texto));
  check("o rótulo diz que valor futuro é estimativa", /estimativa, não previsão/.test(boundaries.AI_NATURE.texto));
  check("o servidor devolve o rótulo", /natureza: boundaries\.AI_NATURE/.test(analyze));
  check("o cliente tem rótulo próprio, sem depender do servidor", /const AI_NATURE = Object\.freeze/.test(insightsSrc));

  check("existe ressalva de IA no registro de ressalvas", /\n\s*ia: \{ text: "Conteúdo educativo gerado por IA/.test(transparency));
  check("a ressalva nega consultoria financeira", /Não é recomendação de investimento nem consultoria financeira/.test(transparency));
  check("a ressalva leva à educação do investidor da CVM",
    /ia: \{ text:[\s\S]{0,400}gov\.br\/cvm/.test(transparency));
  check("a análise estruturada mostra a ressalva", /renderFinancialNotice\("ia"\)/.test(analyticsScreen));
  check("o texto corrido também mostra a ressalva",
    (analyticsScreen.match(/renderFinancialNotice\("ia"\)/g) || []).length >= 2,
    (analyticsScreen.match(/renderFinancialNotice\("ia"\)/g) || []).length);
}

/* ------------------------------- 8. privacidade do filtro */
console.log("\n8. Filtrar não pode virar vazamento");
{
  check("o servidor não registra o texto removido em log", !/console\.(log|info|warn|error)\([^)]*analise/.test(analyze));
  check("o relatório de filtragem só viaja quando houve corte", /Object\.keys\(removidos\)\.length \? \{ filtrados: removidos \}/.test(analyze));
  check("o motivo da restrição está escrito no código", /log de conteúdo/i.test(analyze) || /log de conteúdo/i.test(read("netlify/functions/_shared/ai-boundaries.js")));
}

console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} — ${pass} ok, ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
