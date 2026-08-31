// backup-crypto.js. BACKUP PROTEGIDO POR SENHA (opcional, aditivo).
// ------------------------------------------------------------------------------
// O backup em JSON continua existindo, continua sendo o padrão e não muda de
// formato. Este arquivo acrescenta UMA opção: gerar o mesmo backup dentro de um
// envelope cifrado, para quem vai guardar a cópia em nuvem de terceiro, mandar
// por e-mail ou deixar num pen drive.
//
// DECISÕES, e o porquê de cada uma:
//
//   • AES-GCM 256. Autenticado: um arquivo adulterado falha na decifragem em vez
//     de devolver lixo plausível. É o que o WebCrypto oferece em todo navegador
//     que este app suporta, sem biblioteca de terceiro.
//   • PBKDF2-SHA-256. Argon2 seria melhor, mas não existe no WebCrypto; trazer
//     uma implementação em WASM contradiz o princípio de não depender de terceiro
//     no caminho dos dados financeiros. O número de iterações VIAJA DENTRO DO
//     ARQUIVO: subir o padrão amanhã não invalida nenhum backup gerado hoje.
//   • Sal de 16 bytes e IV de 12 bytes, sorteados a cada exportação. Dois backups
//     da mesma base com a mesma senha não produzem o mesmo arquivo.
//   • O cabeçalho não guarda contagem de lançamentos, nome, nem nada da base. Se
//     guardasse, o arquivo "protegido" contaria em texto claro o tamanho da vida
//     financeira de quem o gerou.
//   • O `kind` entra como dado autenticado adicional: trocar o rótulo do envelope
//     quebra a verificação, em vez de produzir um erro confuso mais adiante.
//
// NÃO HÁ RECUPERAÇÃO DE SENHA. É a consequência de a chave nascer só da senha:
// ninguém, nem o app, nem o servidor, consegue abrir o arquivo sem ela. A tela
// diz isso antes de o usuário escolher a senha, não depois.
"use strict";

const BACKUP_ENC_KIND = "cofre.backup.encrypted.v1";
const BACKUP_ENC_ITERATIONS = 310000;
const BACKUP_ENC_SALT_BYTES = 16;
const BACKUP_ENC_IV_BYTES = 12;
// Mesmo mínimo da senha de conta. Uma régua só evita a pergunta "por que ali são
// dez e aqui são seis?" e evita a resposta errada.
const BACKUP_ENC_MIN_PASSWORD = 10;

function backupCryptoSubtle() {
  const root = typeof globalThis !== "undefined" ? globalThis : null;
  const api = root && root.crypto;
  return api && api.subtle ? api.subtle : null;
}

function backupCryptoAvailable() {
  return !!backupCryptoSubtle();
}

function backupRandomBytes(length) {
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
}

// Base64 sem depender de Buffer (navegador) nem de atob em lote gigante: a
// conversão é feita em blocos para não estourar o limite de argumentos de
// `String.fromCharCode` com um backup de alguns megabytes.
function bytesToBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let texto = "";
  const bloco = 0x8000;
  for (let i = 0; i < view.length; i += bloco) {
    texto += String.fromCharCode.apply(null, view.subarray(i, i + bloco));
  }
  return btoa(texto);
}

function base64ToBytes(value) {
  const texto = atob(String(value || ""));
  const out = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i++) out[i] = texto.charCodeAt(i);
  return out;
}

async function backupDeriveKey(password, salt, iterations) {
  const subtle = backupCryptoSubtle();
  if (!subtle) throw new BackupError("CRYPTO_UNAVAILABLE", "Este navegador não oferece a criptografia necessária para abrir backups protegidos por senha.");
  const material = await subtle.importKey("raw", new TextEncoder().encode(String(password)), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// Regra de senha do backup. Devolve a MENSAGEM do problema ou `null`; quem chama
// decide onde mostrar.
function backupPasswordIssue(password, confirmation) {
  const senha = String(password == null ? "" : password);
  if (senha.length < BACKUP_ENC_MIN_PASSWORD) {
    return `A senha do backup precisa de pelo menos ${BACKUP_ENC_MIN_PASSWORD} caracteres.`;
  }
  if (confirmation !== undefined && senha !== String(confirmation == null ? "" : confirmation)) {
    return "As duas senhas não são iguais.";
  }
  return null;
}

// Um arquivo é reconhecido como protegido pelo `kind`, sem decifrar nada. Serve
// para a tela pedir a senha ANTES de tentar interpretar o conteúdo.
function isEncryptedBackupText(text) {
  const raw = String(text == null ? "" : text);
  // Descarta cedo o arquivo grande e comum: só vale a pena tentar o JSON quando
  // o rótulo aparece nos primeiros bytes.
  if (raw.indexOf(BACKUP_ENC_KIND) === -1) return false;
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { return false; }
  return !!(parsed && parsed.kind === BACKUP_ENC_KIND && typeof parsed.payload === "string");
}

// Cifra o TEXTO já pronto do backup comum. Assim o formato interno continua
// sendo exatamente o mesmo do arquivo aberto: decifrar devolve um backup que o
// `parseBackupFile` de sempre entende, sem caminho paralelo de leitura.
async function encryptBackupText(plainText, password) {
  const subtle = backupCryptoSubtle();
  if (!subtle) throw new BackupError("CRYPTO_UNAVAILABLE", "Este navegador não oferece a criptografia necessária para proteger o backup com senha.");
  const problema = backupPasswordIssue(password);
  if (problema) throw new BackupError("WEAK_PASSWORD", problema);

  const salt = backupRandomBytes(BACKUP_ENC_SALT_BYTES);
  const iv = backupRandomBytes(BACKUP_ENC_IV_BYTES);
  const key = await backupDeriveKey(password, salt, BACKUP_ENC_ITERATIONS);
  const cifrado = await subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(BACKUP_ENC_KIND) },
    key,
    new TextEncoder().encode(String(plainText)),
  );

  return {
    kind: BACKUP_ENC_KIND,
    app: "Cofre. Organizador financeiro pessoal",
    exportedAt: new Date().toISOString(),
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: BACKUP_ENC_ITERATIONS, salt: bytesToBase64(salt) },
    cipher: { name: "AES-GCM", iv: bytesToBase64(iv) },
    payload: bytesToBase64(new Uint8Array(cifrado)),
  };
}

// Devolve o TEXTO do backup comum. Senha errada e arquivo adulterado dão o mesmo
// erro de propósito: distinguir os dois casos entregaria ao atacante um oráculo
// para saber quando acertou metade do problema.
async function decryptBackupText(text, password) {
  const subtle = backupCryptoSubtle();
  if (!subtle) throw new BackupError("CRYPTO_UNAVAILABLE", "Este navegador não oferece a criptografia necessária para abrir backups protegidos por senha.");
  let envelope;
  try { envelope = JSON.parse(String(text == null ? "" : text)); }
  catch (e) { throw new BackupError("INVALID_JSON", "O arquivo não é um JSON válido."); }
  if (!envelope || envelope.kind !== BACKUP_ENC_KIND || typeof envelope.payload !== "string") {
    throw new BackupError("NOT_A_BACKUP", "O arquivo não parece ser um backup protegido do app.");
  }

  const kdf = envelope.kdf || {};
  const iteracoes = Number(kdf.iterations);
  // Teto para que um arquivo hostil não peça dez milhões de iterações e trave a
  // aba antes de qualquer verificação; piso para não aceitar um envelope
  // enfraquecido de propósito.
  if (!(iteracoes >= 100000 && iteracoes <= 2000000) || kdf.name !== "PBKDF2" || kdf.hash !== "SHA-256") {
    throw new BackupError("UNSUPPORTED_KDF", "Este arquivo usa uma proteção que esta versão do app não conhece.");
  }
  if (!envelope.cipher || envelope.cipher.name !== "AES-GCM") {
    throw new BackupError("UNSUPPORTED_CIPHER", "Este arquivo usa uma cifra que esta versão do app não conhece.");
  }

  let salt, iv, dados;
  try {
    salt = base64ToBytes(kdf.salt);
    iv = base64ToBytes(envelope.cipher.iv);
    dados = base64ToBytes(envelope.payload);
  } catch (e) {
    throw new BackupError("NOT_A_BACKUP", "O arquivo protegido está incompleto ou corrompido.");
  }
  if (salt.length !== BACKUP_ENC_SALT_BYTES || iv.length !== BACKUP_ENC_IV_BYTES || dados.length === 0) {
    throw new BackupError("NOT_A_BACKUP", "O arquivo protegido está incompleto ou corrompido.");
  }

  const key = await backupDeriveKey(password, salt, iteracoes);
  let aberto;
  try {
    aberto = await subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(BACKUP_ENC_KIND) },
      key,
      dados,
    );
  } catch (e) {
    throw new BackupError("WRONG_PASSWORD", "Senha incorreta ou arquivo alterado. Os seus dados atuais continuam intactos.");
  }
  return new TextDecoder().decode(aberto);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    BACKUP_ENC_KIND, BACKUP_ENC_MIN_PASSWORD, BACKUP_ENC_ITERATIONS,
    backupCryptoAvailable, backupPasswordIssue, isEncryptedBackupText,
    encryptBackupText, decryptBackupText,
  };
}
