"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

let pass = 0, fail = 0;
function check(label, condition, detail) {
  if (condition) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail == null ? "" : `: ${detail}`}`); }
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    dump() { return Array.from(values.entries()); },
  };
}

console.log("\n1. Diagnóstico sem conteúdo sensível");
const store = memoryStorage();
const originalLocalStorage = Object.getOwnPropertyDescriptor(global, "localStorage");
const originalNavigator = Object.getOwnPropertyDescriptor(global, "navigator");
Object.defineProperty(global, "localStorage", { value: store, configurable: true });
Object.defineProperty(global, "navigator", { value: { onLine: true }, configurable: true });
delete require.cache[require.resolve("../js/safe-errors.js")];
const errors = require("../js/safe-errors.js");
errors.clearSafeErrors();
errors.reportSafeError("storage", new Error("Conta Nubank, R$ 12.345,67, token segredo-123"), "storage_write");
const raw = store.getItem(errors.SAFE_ERROR_STORAGE_KEY) || "";
check("registra uma ocorrência", errors.readSafeErrors().length === 1);
check("não grava a mensagem da exceção", !raw.includes("Nubank") && !raw.includes("12.345") && !raw.includes("segredo"), raw);
check("guarda apenas código controlado", errors.readSafeErrors()[0].code === "storage_write");
errors.reportSafeError("perfil-renan", new Error("cpf 000"), "codigo-com-nome");
const fallback = errors.readSafeErrors().at(-1);
check("área externa vira app", fallback.area === "app");
check("código externo vira unexpected", fallback.code === "unexpected");

const now = Date.now();
const many = Array.from({ length: 70 }, (_, i) => ({ at: now - i * 1000, area: "app", code: "unexpected" }));
many.push({ at: now - 31 * 86400000, area: "app", code: "unexpected" });
const normalized = errors.normalizeSafeErrorEntries(many, now);
check("retenção remove itens com mais de 30 dias", normalized.every((item) => item.at >= now - errors.SAFE_ERROR_RETENTION_MS));
check("limite mantém no máximo 50 ocorrências", normalized.length === 50, normalized.length);
const summary = errors.safeErrorSummary();
check("resumo declara que não há envio automático", summary.automaticUpload === false);

console.log("\n2. Migração e consentimentos");
const ctx = {
  console, module: { exports: {} }, setTimeout, clearTimeout,
  indexedDB: undefined, localStorage: undefined,
  document: { addEventListener() {}, visibilityState: "visible" },
  navigator: { userAgent: "node" }, addEventListener() {}, removeEventListener() {},
};
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
["js/utils.js", "js/rules.js", "js/layout.js", "js/storage.js"].forEach((file) => vm.runInContext(read(file), ctx, { filename: file }));
const run = (code) => vm.runInContext(code, ctx);
check("schema corrente é 23", run("SCHEMA_VERSION") === 23);
check("base nova pergunta antes da IA", run("defaultData().privacy.aiSharing") === "ask");
check("base nova não presume aceite", run("legalAccepted(defaultData().privacy)") === false);
check("base antiga migra sem aceite", run("legalAccepted(migrate({ version:21 }).privacy)") === false);
run("__accepted = acceptLegalTexts(defaultPrivacy())");
check("aceite grava as duas versões", run("__accepted.termsVersion === LEGAL_TEXT_VERSION && __accepted.privacyVersion === LEGAL_TEXT_VERSION"));
check("bloqueio de IA é preservado", run("normalizePrivacy({ aiSharing:'blocked' }).aiSharing") === "blocked");
check("valor inválido volta a perguntar", run("normalizePrivacy({ aiSharing:'always' }).aiSharing") === "ask");
const backup = run("buildBackupEnvelope(Object.assign(defaultData(), { privacy:__accepted }))");
check("backup inclui o estado de consentimento", backup.data.privacy.termsVersion === run("LEGAL_TEXT_VERSION"));

console.log("\n3. Interface e limites financeiros");
const privacyScreen = read("js/screens/privacy.js");
const actions = read("js/actions.js");
const app = read("js/app.js");
const simulators = read("js/screens/simulators.js");
const transparency = read("js/transparency.js");
check("há rota de privacidade", /privacy:\s*"privacidade"/.test(read("js/router.js")));
check("tela informa armazenamento e retenção", /Onde seus dados ficam/.test(privacyScreen) && /últimos 30 dias/.test(privacyScreen));
check("usuário pode bloquear IA", /data-value="blocked"/.test(privacyScreen) && /privacy-ai-mode/.test(actions));
// Este teste checava `requestConfirmation` porque o envio passava pelo diálogo
// genérico. Ele agora passa pela prévia, e o que importa continua sendo o
// mesmo: o bloqueio é verificado ANTES de qualquer diálogo abrir. A asserção
// foi reescrita para o comportamento e deixou de depender da distância entre
// duas linhas, que quebrava a cada edição do corpo da função.
const corpoRequestAi = (app.match(/function requestAiInsight\(\)[\s\S]*?\n\}/) || [""])[0];
check("o bloqueio é verificado dentro do fluxo de envio", /aiSharing === "blocked"/.test(corpoRequestAi));
check("IA respeita o bloqueio antes de abrir qualquer diálogo",
  corpoRequestAi.indexOf('aiSharing === "blocked"') < corpoRequestAi.indexOf('openOverlay("ai-preview")')
  && corpoRequestAi.indexOf('openOverlay("ai-preview")') !== -1);
check("o envio recusa de novo se o bloqueio chegar depois",
  /aiSharing === "blocked"[\s\S]{0,120}InsightError\("BLOCKED"/.test(read("js/insights.js")));
check("exclusão exige texto APAGAR", /requiredText:\s*"APAGAR"/.test(actions));
check("diagnóstico pode ser exportado e apagado", /diagnostics-export/.test(actions) && /diagnostics-clear/.test(actions));
check("simuladores exibem aviso por assunto", /renderFinancialNotice\(id\)/.test(simulators));
check("crédito aponta para CET oficial", /Banco Central sobre CET/.test(transparency));
check("aposentadoria separa patrimônio de benefício do INSS", /Não estima concessão nem valor de benefício do INSS/.test(transparency));
check("texto não chama o pacote de IA de anônimo", !/dados anônimos|dados anonimos/i.test(privacyScreen + app));

console.log("\n4. Conteúdo obrigatório da política (LGPD)");
// A tela dizia coisas que deixaram de ser verdade quando a sincronização
// entrou no ar e as fontes viraram locais. Texto de privacidade errado é
// defeito, não detalhe: o usuário decide com base nele.
check("não afirma mais que a sincronização está desligada", !/sincronização contínua dos dados financeiros ainda não está ativa/i.test(privacyScreen));
check("descreve o que muda com conta ligada", /Com conta ligada.{0,120}sincronizados/i.test(privacyScreen));
check("não promete mais fonte do Google", !/Fontes do Google/i.test(privacyScreen) && /tipografia é servida pelo próprio app/i.test(privacyScreen));
check("declara a lista de terceiros que recebem dados", /Quem mais recebe dados/.test(privacyScreen) && /Portal fiscal da Sefaz/.test(privacyScreen));

check("identificação do controlador está na tela", /Quem responde por estes dados/.test(privacyScreen) && /Encarregado pelos dados/.test(privacyScreen));
check("prazo de resposta ao titular é declarado", /art\. 19, II/.test(privacyScreen));
check("prazos de retenção estão na tela", /Por quanto tempo cada coisa fica/.test(privacyScreen));
check("direitos do art. 18 estão na tela", /art\. 18/.test(privacyScreen));
check("canal de incidentes está na tela", /incidente de segurança/i.test(privacyScreen) && /art\. 48/.test(privacyScreen));
check("termos cobrem lei, foro e limite de responsabilidade", /Lei e foro/.test(privacyScreen) && /Limite de responsabilidade/.test(privacyScreen) && /Código de Defesa do Consumidor/.test(privacyScreen));

const controller = run("LEGAL_CONTROLLER");
const gaps = run("legalControllerGaps(LEGAL_CONTROLLER)");
check("controlador ainda não preenchido é reportado, não inventado", gaps.length === 7 && run("legalControllerReady(LEGAL_CONTROLLER)") === false, gaps.join(", "));
check("nenhum campo do controlador tem valor plausível de mentira", Object.keys(controller).filter((k) => k !== "responseDays").every((k) => controller[k] === run("LEGAL_PENDING")));
check("prazo de resposta segue o art. 19, II", controller.responseDays === 15);
check("controlador completo deixa de ser pendência",
  run("legalControllerReady({ name:'a', document:'b', address:'c', supportEmail:'d', dpoName:'e', dpoEmail:'f', incidentEmail:'g' })") === true);

const retention = run("LEGAL_RETENTION");
check("retenção separa aparelho de servidor",
  retention.some((r) => r.scope === "local") && retention.some((r) => r.scope === "conta"));
check("todo item de retenção declara um prazo", retention.every((r) => r.label && r.term && r.term.length > 20));
check("retenção do diagnóstico bate com o código", retention.some((r) => /30 dias/.test(r.term) && /50 ocorrências/.test(r.term)));
check("retenção da sincronização declara a poda de 24 meses", retention.some((r) => /24 meses/.test(r.term)));

const rights = run("LEGAL_SUBJECT_RIGHTS");
check("os nove incisos do art. 18 estão cobertos",
  ["I e II", "III", "IV", "V", "VI", "VII", "VIII", "IX"].every((inciso) => rights.some((r) => r.law === `art. 18, ${inciso}`)), rights.length);
check("revisão de decisão automatizada é citada", rights.some((r) => r.law === "art. 20"));
check("todo direito diz como é exercido", rights.every((r) => r.title && r.detail && r.detail.length > 20));

// Histórico de aceite: subir a versão do texto não pode apagar a evidência do
// aceite anterior, senão o app perde o registro do que o usuário concordou.
const anterior = { termsVersion: "2026-08-12.2", privacyVersion: "2026-08-12.2", acceptedAt: "2026-08-12T10:00:00.000Z", aiSharing: "ask" };
ctx.__anterior = anterior;
check("base sem histórico converte o aceite guardado em primeira entrada",
  run("normalizePrivacy(__anterior).acceptedVersions.length") === 1 && run("normalizePrivacy(__anterior).acceptedVersions[0].version") === "2026-08-12.2");
run("__renovado = acceptLegalTexts(__anterior)");
check("aceite novo preserva o anterior no histórico",
  run("__renovado.acceptedVersions.length") === 2 && run("__renovado.acceptedVersions[0].version") === "2026-08-12.2");
check("aceite novo passa a valer", run("legalAccepted(__renovado)") === true);
check("versão do texto subiu junto com a mudança de conteúdo", run("LEGAL_TEXT_VERSION") !== "2026-08-12.2");
check("texto anterior deixa de valer sozinho", run("legalAccepted(__anterior)") === false);
check("aceitar duas vezes a mesma versão não duplica o registro",
  run("acceptLegalTexts(__renovado).acceptedVersions.length") === 2);
check("histórico rejeita entrada inválida",
  run("normalizeLegalHistory([{ version:'x' }, null, 3, { at:'2026-01-01T00:00:00.000Z' }]).length") === 0);
check("histórico tem teto", run("normalizeLegalHistory(Array.from({length:40},(_,i)=>({version:'v'+i, at:new Date(Date.UTC(2026,0,1,0,i)).toISOString()}))).length") === run("LEGAL_HISTORY_MAX"));

const launchDoc = read("docs/LEGAL-LAUNCH.md");
check("pendências de lançamento apontam para o marcador no código", /LEGAL_PENDING/.test(launchDoc) && /LEGAL_CONTROLLER/.test(launchDoc));
check("documento deixou de listar a fonte do Google como pendência", !/^\d+\. Avaliar a remoção das fontes remotas do Google/m.test(launchDoc));
check("retenção no provedor de IA segue registrada como pendência", /retenção do provedor de IA/i.test(launchDoc));

if (originalLocalStorage) Object.defineProperty(global, "localStorage", originalLocalStorage);
else delete global.localStorage;
if (originalNavigator) Object.defineProperty(global, "navigator", originalNavigator);
else delete global.navigator;
console.log(`\n${fail ? "FALHAS ENCONTRADAS" : "TODOS OS TESTES PASSARAM"}: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
