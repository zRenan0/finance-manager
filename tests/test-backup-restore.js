// test-backup-restore.js — BACKUP, RESTAURAÇÃO E PROTEÇÃO POR SENHA (M12).
// ------------------------------------------------------------------------------
// O backup é a última linha de defesa de um app que guarda os dados no próprio
// aparelho. O que este arquivo protege:
//
//   1. Ida e volta: o que sai do app volta idêntico, inclusive as lápides. Sem
//      elas, restaurar um backup ressuscita tudo que foi apagado depois dele.
//   2. Formatos antigos continuam abrindo. Um backup guardado há um ano não pode
//      virar lixo porque o schema evoluiu.
//   3. O envelope protegido por senha abre com a senha certa e SÓ com ela.
//   4. Senha errada, arquivo adulterado e cabeçalho trocado dão erro, não dados.
//   5. O arquivo protegido não conta nada sobre a base em texto claro: nem
//      descrição, nem categoria, nem quantidade de lançamentos.
//   6. Os limites de tamanho e de registros continuam valendo.
//
// Ferramenta de dev: `node tests/test-backup-restore.js`.
"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const { webcrypto } = require("node:crypto");
const ROOT = path.join(__dirname, "..");
const readSrc = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const ctx = {
  console, module: { exports: {} }, indexedDB: undefined, localStorage: undefined,
  crypto: webcrypto, TextEncoder, TextDecoder, btoa, atob,
};
ctx.window = ctx;
ctx.globalThis = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);

["js/utils.js", "js/perf.js", "js/rules.js", "js/layout.js", "js/safe-errors.js",
  "js/storage.js", "js/backup-crypto.js"]
  .forEach((f) => vm.runInContext(readSrc(f), ctx, { filename: f }));

// `const` no topo de um script do vm cria vínculo léxico, não propriedade do
// contexto: as constantes do app só chegam aqui avaliando dentro dele.
const run = (code) => vm.runInContext(code, ctx);
const SCHEMA_VERSION = run("SCHEMA_VERSION");
const BACKUP_KIND = run("BACKUP_KIND");
const BACKUP_ENC_KIND = run("BACKUP_ENC_KIND");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? ` -> ${extra}` : ""}`); }
}
async function esperaErro(nome, fn, codigo) {
  try {
    await fn();
    check(nome, false, "não lançou erro");
  } catch (e) {
    check(nome, !codigo || e.code === codigo, `${e.code || "sem código"}: ${e.message}`);
  }
}

const SENHA = "reserva-de-emergencia-2026";

function baseCompleta() {
  return ctx.migrate({
    monthlyIncome: 6200,
    userName: "Renan",
    accounts: [{ id: "account_aaa", name: "Corrente", type: "corrente", openingBalance: 1500, openingDate: "2026-01-01" }],
    transactions: [
      ctx.makeTransaction({ id: "t1", type: "expense", amount: 187.4, categoryId: "mercado", date: "2026-03-04", accountId: "account_aaa", description: "Feira do bairro" }),
      ctx.makeTransaction({ id: "t2", type: "income", amount: 6200, categoryId: "salario", date: "2026-03-05", accountId: "account_aaa", description: "Salário" }),
    ],
    goals: [{ id: "goal_1", name: "Viagem ao Chile", target: 12000, current: 3400 }],
    graveyard: { transactions: { t9: "2026-03-09T10:00:00.000Z" } },
  });
}

async function principal() {
  /* ============================================================== 1 */
  console.log("\n1. Ida e volta do backup comum");
  {
    const data = baseCompleta();
    const envelope = ctx.buildBackupEnvelope(data);
    const lido = ctx.parseBackupFile(JSON.stringify(envelope));
    check("os lançamentos voltam", lido.data.transactions.length === 2, lido.data.transactions.length);
    check("a meta volta", lido.data.goals.length === 1);
    check("a conta volta", lido.data.accounts.length === 1);
    check("a integridade confere", lido.meta.checksumOk === true);
    check("o arquivo não é tratado como legado", lido.meta.legacy !== true);
    check("as lápides sobrevivem", !!(lido.data.graveyard && lido.data.graveyard.transactions && lido.data.graveyard.transactions.t9),
      JSON.stringify(lido.data.graveyard));
    check("a descrição volta inteira", lido.data.transactions.some((t) => t.description === "Feira do bairro"));
  }

  /* ============================================================== 2 */
  console.log("\n2. Arquivo alterado depois de exportado");
  {
    const envelope = ctx.buildBackupEnvelope(baseCompleta());
    envelope.data.transactions[0].amount = 999999;
    const lido = ctx.parseBackupFile(JSON.stringify(envelope));
    check("a verificação de integridade acusa", lido.meta.checksumOk === false, lido.meta.checksumOk);
  }

  /* ============================================================== 3 */
  console.log("\n3. Formatos antigos continuam abrindo");
  {
    // Snapshot cru, sem envelope: é o que o app exportava nas primeiras versões.
    const legado = {
      version: 5,
      monthlyIncome: 4000,
      transactions: [{ id: "t1", type: "expense", amount: 50, categoryId: "mercado", date: "2025-02-10" }],
      categories: [], goals: [],
    };
    const lido = ctx.parseBackupFile(JSON.stringify(legado));
    check("o formato antigo é reconhecido", lido.meta.legacy === true);
    check("o lançamento antigo sobrevive", lido.data.transactions.length === 1);
    check("a renda antiga sobrevive", lido.data.monthlyIncome === 4000, lido.data.monthlyIncome);
    check("as coleções novas nascem vazias, não indefinidas",
      Array.isArray(lido.data.accounts) && Array.isArray(lido.data.cardPayments) && Array.isArray(lido.data.accountTransfers),
      JSON.stringify({ a: lido.data.accounts, p: lido.data.cardPayments }));
    check("o schema é atualizado na leitura", lido.data.version === SCHEMA_VERSION, lido.data.version);
  }
  {
    // Envelope de uma versão intermediária, sem as coleções de conta e cartão.
    const intermediario = {
      kind: BACKUP_KIND, schema: 14, exportedAt: "2025-08-01T12:00:00.000Z",
      data: { version: 14, monthlyIncome: 3000, transactions: [], categories: [], goals: [{ id: "g1", name: "Reserva", target: 5000, current: 100 }] },
    };
    const lido = ctx.parseBackupFile(JSON.stringify(intermediario));
    check("envelope sem checksum não é recusado", lido.meta.checksumOk !== false);
    check("a meta do envelope antigo volta", lido.data.goals.length === 1);
    check("a data de exportação é lida", lido.meta.exportedAt === "2025-08-01T12:00:00.000Z");
  }

  /* ============================================================== 4 */
  console.log("\n4. Limites da restauração continuam de pé");
  {
    await esperaErro("arquivo acima de 32 MB é recusado",
      () => ctx.parseBackupFile("x".repeat(33 * 1024 * 1024)), "TOO_LARGE");
    await esperaErro("texto que não é JSON é recusado",
      () => ctx.parseBackupFile("isto não é json"), "INVALID_JSON");
    await esperaErro("JSON que não é backup é recusado",
      () => ctx.parseBackupFile(JSON.stringify({ oi: 1 })), "NOT_A_BACKUP");
  }

  /* ============================================================== 5 */
  console.log("\n5. Backup protegido por senha: ida e volta");
  {
    check("a criptografia está disponível no ambiente", ctx.backupCryptoAvailable() === true);
    const texto = JSON.stringify(ctx.buildBackupEnvelope(baseCompleta()));
    const protegido = await ctx.encryptBackupText(texto, SENHA);

    check("o envelope se identifica", protegido.kind === BACKUP_ENC_KIND, protegido.kind);
    check("o derivador é declarado", protegido.kdf.name === "PBKDF2" && protegido.kdf.hash === "SHA-256");
    check("o número de iterações viaja no arquivo", protegido.kdf.iterations >= 100000, protegido.kdf.iterations);
    check("a cifra é autenticada", protegido.cipher.name === "AES-GCM");

    const aberto = await ctx.decryptBackupText(JSON.stringify(protegido), SENHA);
    check("o texto volta idêntico", aberto === texto);
    const lido = ctx.parseBackupFile(aberto);
    check("o conteúdo decifrado é um backup válido", lido.data.transactions.length === 2 && lido.meta.checksumOk === true);
  }

  /* ============================================================== 6 */
  console.log("\n6. O arquivo protegido não conta nada da base");
  {
    const texto = JSON.stringify(ctx.buildBackupEnvelope(baseCompleta()));
    const protegido = JSON.stringify(await ctx.encryptBackupText(texto, SENHA));
    ["Feira do bairro", "Viagem ao Chile", "Renan", "mercado", "salario", "6200"].forEach((agulha) => {
      check(`"${agulha}" não aparece em texto claro`, protegido.indexOf(agulha) === -1);
    });
    check("não há contagem de lançamentos no cabeçalho", protegido.indexOf("counts") === -1);
  }

  /* ============================================================== 7 */
  console.log("\n7. Dois arquivos da mesma base não são iguais");
  {
    const texto = JSON.stringify(ctx.buildBackupEnvelope(baseCompleta()));
    const a = await ctx.encryptBackupText(texto, SENHA);
    const b = await ctx.encryptBackupText(texto, SENHA);
    check("o sal muda a cada exportação", a.kdf.salt !== b.kdf.salt);
    check("o vetor de inicialização muda", a.cipher.iv !== b.cipher.iv);
    check("o conteúdo cifrado muda", a.payload !== b.payload);
    check("mas os dois abrem com a mesma senha",
      (await ctx.decryptBackupText(JSON.stringify(b), SENHA)) === texto);
  }

  /* ============================================================== 8 */
  console.log("\n8. Senha errada, arquivo adulterado, cabeçalho trocado");
  {
    const texto = JSON.stringify(ctx.buildBackupEnvelope(baseCompleta()));
    const protegido = await ctx.encryptBackupText(texto, SENHA);

    await esperaErro("senha errada não abre",
      () => ctx.decryptBackupText(JSON.stringify(protegido), "senha-errada-mas-longa"), "WRONG_PASSWORD");

    const adulterado = JSON.parse(JSON.stringify(protegido));
    const bytes = Buffer.from(adulterado.payload, "base64");
    bytes[10] = bytes[10] ^ 0xff;
    adulterado.payload = bytes.toString("base64");
    await esperaErro("um byte trocado no conteúdo não abre",
      () => ctx.decryptBackupText(JSON.stringify(adulterado), SENHA), "WRONG_PASSWORD");

    const semSal = JSON.parse(JSON.stringify(protegido));
    semSal.kdf.iterations = 10;
    await esperaErro("proteção enfraquecida no arquivo é recusada",
      () => ctx.decryptBackupText(JSON.stringify(semSal), SENHA), "UNSUPPORTED_KDF");

    const outraCifra = JSON.parse(JSON.stringify(protegido));
    outraCifra.cipher.name = "AES-CBC";
    await esperaErro("cifra desconhecida é recusada",
      () => ctx.decryptBackupText(JSON.stringify(outraCifra), SENHA), "UNSUPPORTED_CIPHER");

    const truncado = JSON.parse(JSON.stringify(protegido));
    truncado.cipher.iv = "AAAA";
    await esperaErro("envelope incompleto é recusado",
      () => ctx.decryptBackupText(JSON.stringify(truncado), SENHA), "NOT_A_BACKUP");
  }

  /* ============================================================== 9 */
  console.log("\n9. Senha fraca não gera arquivo");
  {
    check("senha curta é apontada", typeof ctx.backupPasswordIssue("curta") === "string");
    check("senha e confirmação diferentes são apontadas",
      typeof ctx.backupPasswordIssue("senha-boa-e-longa", "outra-senha-boa") === "string");
    check("senha longa e confirmada passa",
      ctx.backupPasswordIssue("senha-boa-e-longa", "senha-boa-e-longa") === null);
    await esperaErro("exportar com senha curta é recusado",
      () => ctx.encryptBackupText("{}", "123"), "WEAK_PASSWORD");
  }

  /* ============================================================== 10 */
  console.log("\n10. O app sabe distinguir os dois arquivos");
  {
    const comum = JSON.stringify(ctx.buildBackupEnvelope(baseCompleta()));
    const protegido = JSON.stringify(await ctx.encryptBackupText(comum, SENHA));
    check("reconhece o arquivo protegido", ctx.isEncryptedBackupText(protegido) === true);
    check("não confunde o backup comum", ctx.isEncryptedBackupText(comum) === false);
    check("não quebra com texto qualquer", ctx.isEncryptedBackupText("não é json") === false);
    await esperaErro("a leitura comum explica o que fazer com um arquivo protegido",
      () => ctx.parseBackupFile(protegido), "ENCRYPTED");
  }

  /* ============================================================== 11 */
  console.log("\n11. Mesclar um backup protegido não é diferente de mesclar um comum");
  {
    const original = baseCompleta();
    const texto = JSON.stringify(ctx.buildBackupEnvelope(original));
    const aberto = await ctx.decryptBackupText(JSON.stringify(await ctx.encryptBackupText(texto, SENHA)), SENHA);
    const { data } = ctx.parseBackupFile(aberto);
    const atual = ctx.migrate({ transactions: [ctx.makeTransaction({ id: "t3", type: "expense", amount: 10, categoryId: "mercado", date: "2026-03-06" })] });
    const { data: mesclado, stats } = ctx.mergeBackupInto(atual, data);
    check("o que já existia continua", mesclado.transactions.some((t) => t.id === "t3"));
    check("o que veio do arquivo entra", mesclado.transactions.some((t) => t.id === "t1"));
    check("a mesclagem contabiliza os novos", stats.added === 2, JSON.stringify(stats));
  }

  console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS"} - ${pass} ok, ${fail} falha(s)`);
  process.exit(fail === 0 ? 0 : 1);
}

principal().catch((e) => { console.error(e); process.exit(1); });
