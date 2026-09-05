// netlify/functions/_shared/ai-boundaries.js
// ------------------------------------------------------------------------------
// [M37] O LIMITE DO QUE O TEXTO DA IA PODE SER.
//
// O prompt em analyze.js proíbe recomendação de investimento. Instrução de
// prompt, porém, é pedido, não garantia: modelo erra, prompt muda, e um dia
// alguém troca o modelo por outro sem reler o prompt. Este arquivo é a segunda
// barreira, determinística e testável: ele olha o TEXTO QUE SAIU e remove o
// trecho que atravessou a linha.
//
// O QUE É BLOQUEADO: produto, ativo, instituição e alocação NOMEADOS. É o que o
// roteiro do módulo descreve como fora de escopo ("Compre ação XYZ", "Invista
// 40% em fundo ABC") e é a fronteira que separa conteúdo educativo de
// recomendação individualizada de valores mobiliários.
//
// O QUE **NÃO** É BLOQUEADO, de propósito: a educação sobre risco em si. Esta
// frase, que o próprio roteiro dá como exemplo do que se deseja, precisa passar
// inteira: "para um objetivo de curto prazo, ativos de alta volatilidade podem
// apresentar risco incompatível com a necessidade de usar o dinheiro em breve".
// Filtro que derruba o texto bom para se proteger do texto ruim entrega uma tela
// vazia, e tela vazia não educa ninguém.
//
// POR ISSO O FILTRO OLHA SUBSTANTIVO NOMEADO, NÃO VERBO. Três armadilhas do
// português que a versão ingênua atropela:
//
//   • "ações"  é quase sempre AÇÕES A TOMAR ("as ações que você pode tomar");
//   • "fundo"  é quase sempre FUNDO DE EMERGÊNCIA neste app;
//   • "aporte" é o vocabulário das METAS aqui dentro, não o da bolsa.
//
// Então "ação" e "fundo" só contam quando vêm com o complemento que os torna
// produto ("ações da Empresa", "fundo imobiliário", "fundo de investimento").
//
// ESTE ARQUIVO É ESPELHADO NO CLIENTE (`js/insights.js`, `AI_ADVICE_PATTERNS`),
// porque o navegador não carrega código do backend e uma resposta em cache de
// uma versão anterior da função não pode furar o filtro. `tests/test-ai-boundaries.js`
// compara as duas listas termo a termo e reprova se elas divergirem.
"use strict";

// Cada item é [nome, fonte da expressão regular]. A fonte fica em texto para o
// teste poder comparar as duas cópias sem depender de como cada lado compila.
const AI_ADVICE_PATTERNS = [
  ["ticker", "\\b[A-Z]{4}\\d{1,2}\\b"],
  ["acao-nomeada", "\\b[AaÁá](?:ç|c)(?:(?:õ|o)es|(?:ã|a)o)\\s+(?:d[aeo]s?\\s+)?[A-ZÀ-Þ][\\wÀ-ÿ]{2,}"],
  ["fundo-produto", "\\bfundos?\\s+(?:de\\s+investimento|imobili(?:á|a)ri[oa]s?|cambia(?:l|is)|multimercado|de\\s+(?:a(?:ç|c)(?:õ|o)es|renda\\s+fixa)|DI\\b)"],
  ["sigla-produto", "\\b(?:ETF|FII|CDB|RDB|LCI|LCA|LCD|CRI|CRA|COE|PGBL|VGBL|BDR)s?\\b"],
  ["renda-fixa-nomeada", "\\b(?:tesouro\\s+(?:direto|selic|ipca|prefixado)|deb(?:ê|e)ntures?|previd(?:ê|e)ncia\\s+privada)\\b"],
  ["cripto", "\\b(?:bitcoin|ethereum|criptomoedas?|cripto\\b|stablecoins?)"],
  ["intermediario", "\\b(?:corretoras?|home\\s+broker|day\\s+trade|banco\\s+de\\s+investimento)\\b"],
  ["alocacao-percentual", "\\d{1,3}\\s*%\\s+(?:em|n[oa]s?|para)\\s+(?!necessidades|desejos|futuro|nenhum)[\\wÀ-ÿ]"],
  ["ordem-de-mercado", "\\b(?:compre|venda|invista|aplique|aloque|realoque|migre)\\s+(?:\\S+\\s+){0,3}?(?:a(?:ç|c)(?:õ|o)es|fundos?|cripto|bitcoin|tesouro|CDB|ETF|FII)\\b"],
];

// DOIS PADRÕES DEPENDEM DA CAIXA, e é a caixa que os torna precisos:
//   • `ticker`       : "PETR4" é ativo, "casa4" não é;
//   • `acao-nomeada` : o que separa "ações da Vale" (empresa) de "ações que
//                      você pode tomar" (o sentido comum da palavra em
//                      português) é a MAIÚSCULA do nome próprio depois dela.
// Ignorar a caixa nesses dois derrubaria texto legítimo; ignorar nos outros só
// deixaria passar violação escrita em caixa diferente.
const AI_CASE_SENSITIVE = ["ticker", "acao-nomeada"];

const COMPILED = AI_ADVICE_PATTERNS.map(([id, source]) => [
  id, new RegExp(source, AI_CASE_SENSITIVE.indexOf(id) === -1 ? "iu" : "u"),
]);

// Devolve o id do primeiro padrão violado, ou `null` quando o texto passa.
function adviceViolation(text) {
  const value = String(text == null ? "" : text);
  if (!value.trim()) return null;
  for (let i = 0; i < COMPILED.length; i++) {
    const [id, re] = COMPILED[i];
    if (re.test(value)) return id;
  }
  return null;
}

function violates(text) { return adviceViolation(text) !== null; }

// Limpa a análise inteira. NÃO reescreve texto: campo que atravessa a linha sai
// vazio e item que atravessa some da lista. Reescrever seria inventar conteúdo
// em cima de conteúdo que já provou não merecer confiança.
//
// Devolve { analise, removidos }: `removidos` são só CONTADORES por padrão
// violado, jamais o texto. Log de conteúdo financeiro é proibido (ver M17).
function stripAdvicePatterns(analise) {
  const removidos = {};
  const conta = (id) => { if (id) removidos[id] = (removidos[id] || 0) + 1; };
  const limpa = (texto) => {
    const id = adviceViolation(texto);
    if (!id) return texto;
    conta(id);
    return "";
  };
  const filtra = (lista, campos) => (lista || []).filter((item) => {
    const id = campos.map((c) => adviceViolation(item && item[c])).find(Boolean) || null;
    conta(id);
    return !id;
  });

  const limpo = {
    ...analise,
    diagnostico: limpa(analise.diagnostico),
    fluxoCaixa: { ...analise.fluxoCaixa, comentario: limpa(analise.fluxoCaixa && analise.fluxoCaixa.comentario) },
    riscos: filtra(analise.riscos, ["titulo", "descricao"]),
    recomendacoes: filtra(analise.recomendacoes, ["acao", "impacto"]),
    metasComentario: limpa(analise.metasComentario),
  };
  return { analise: limpo, removidos };
}

// O rótulo de natureza. É gerado AQUI, pelo código, e não pedido ao modelo: um
// rótulo que o próprio texto se atribui não vale nada, e um que o servidor pode
// esquecer de mandar deixaria a tela sem aviso. O cliente ainda tem o dele.
const AI_NATURE = Object.freeze({
  tipo: "educacional",
  texto: "Conteúdo educativo gerado por IA a partir dos números que você enviou. Não é recomendação de investimento nem consultoria financeira, e todo valor futuro citado é estimativa, não previsão.",
});

module.exports = { AI_ADVICE_PATTERNS, adviceViolation, violates, stripAdvicePatterns, AI_NATURE };
