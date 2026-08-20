"use strict";

const SCHEMA_VERSION = 22;
const COLLECTIONS = ["transactions", "categories", "goals", "assets"];
const SETTING_KEYS = [
  "monthlyIncome", "creditCardLimit", "theme", "dismissedCarryForwardMonth", "budgetSplit", "budgetAlerts",
  "budgetHistory", "version", "lastPersistAt", "userName", "emergencyGoalId", "emergencyMonths", "marketRates",
  "achievements", "recurringPrefs", "notifications", "accounts", "creditCards", "accountTransfers", "cardPayments",
  "accountAdjustments", "debtPlan", "onboarding", "dashboardLayout", "dashboardFocus", "categoryRules", "privacy",
  "graveyard", "lastBackupAt",
];
const TOP_LEVEL = new Set([...COLLECTIONS, ...SETTING_KEYS]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$/;
const LIMITS = { transactions: 100000, categories: 500, goals: 1000, assets: 5000 };
const SETTING_ARRAY_LIMITS = { accounts: 1000, creditCards: 1000, accountTransfers: 50000, cardPayments: 50000, accountAdjustments: 50000 };
const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);

function invalid(message, code = "invalid_financial_data") {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  throw error;
}

function inspect(value) {
  let nodes = 0;
  const walk = (item, depth) => {
    if (++nodes > 220000 || depth > 12) invalid("Os dados excedem o limite de complexidade");
    if (typeof item === "string" && item.length > 4000) invalid("Um texto excede o limite permitido");
    if (typeof item === "number" && !Number.isFinite(item)) invalid("Número inválido");
    if (!item || typeof item !== "object") return;
    if (Array.isArray(item)) { item.forEach((entry) => walk(entry, depth + 1)); return; }
    Object.keys(item).forEach((key) => {
      if (FORBIDDEN.has(key)) invalid("Campo não permitido");
      walk(item[key], depth + 1);
    });
  };
  walk(value, 0);
}

function validDate(value, optional = false) {
  if (optional && (value == null || value === "")) return true;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}
function validMoney(value) { return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1e12; }
function validRef(value) { return value == null || value === "" || SAFE_ID.test(String(value)); }
function validateRecord(name, record) {
  if (name === "transactions") {
    if (!["income", "expense"].includes(record.type) || !validMoney(record.amount) || record.amount < 0 || !validDate(record.date)) invalid("Lançamento financeiro inválido");
    if (record.description != null && (typeof record.description !== "string" || record.description.length > 200)) invalid("Descrição de lançamento inválida");
    ["categoryId", "accountId", "creditCardId", "goalId", "debtId"].forEach((key) => { if (!validRef(record[key])) invalid(`Referência inválida em ${key}`); });
  }
  if (name === "categories") {
    if (typeof record.name !== "string" || !record.name.trim() || record.name.length > 60 || !/^#[0-9A-F]{6}$/i.test(String(record.color || "")) || !validRef(record.parentId)) invalid("Categoria inválida");
  }
  if (name === "goals") {
    if (typeof record.name !== "string" || !record.name.trim() || record.name.length > 80 || !validMoney(record.target) || record.target < 0 || !validMoney(record.current) || record.current < 0 || !validDate(record.deadline, true)) invalid("Meta inválida");
    ["savedUpfront", "monthlyPlan"].forEach((key) => { if (record[key] != null && (!validMoney(record[key]) || record[key] < 0)) invalid(`Valor inválido em ${key}`); });
  }
  if (name === "assets") {
    if (typeof record.name !== "string" || !record.name.trim() || record.name.length > 80 || !["asset", "liability"].includes(record.kind) || !validMoney(record.value) || record.value < 0) invalid("Item patrimonial inválido");
  }
}

function validateSnapshot(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) invalid("Snapshot inválido");
  Object.keys(raw).forEach((key) => { if (!TOP_LEVEL.has(key)) invalid(`Campo não permitido: ${key}`); });
  if (Number(raw.version) !== SCHEMA_VERSION) invalid("Versão de dados incompatível", "schema_mismatch");
  COLLECTIONS.forEach((name) => {
    const list = raw[name];
    if (!Array.isArray(list) || list.length > LIMITS[name]) invalid(`Coleção inválida: ${name}`);
    const seen = new Set();
    list.forEach((record) => {
      if (!record || typeof record !== "object" || !SAFE_ID.test(String(record.id || ""))) invalid(`Identificador inválido em ${name}`);
      if (seen.has(record.id)) invalid(`Identificador repetido em ${name}`);
      seen.add(record.id);
      validateRecord(name, record);
    });
  });
  Object.entries(SETTING_ARRAY_LIMITS).forEach(([key, limit]) => {
    if (raw[key] != null && (!Array.isArray(raw[key]) || raw[key].length > limit)) invalid(`Configuração inválida: ${key}`);
  });
  ["monthlyIncome", "creditCardLimit"].forEach((key) => { if (raw[key] != null && (!validMoney(raw[key]) || raw[key] < 0)) invalid(`Valor inválido: ${key}`); });
  inspect(raw);
  return JSON.parse(JSON.stringify(raw));
}

function validateChanges(raw) {
  if (!raw || typeof raw !== "object") invalid("Conjunto de alterações inválido");
  const puts = raw.puts && typeof raw.puts === "object" ? raw.puts : {};
  const deletes = raw.deletes && typeof raw.deletes === "object" ? raw.deletes : {};
  const settings = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
  Object.keys(puts).forEach((key) => { if (!COLLECTIONS.includes(key)) invalid("Coleção não permitida"); });
  Object.keys(deletes).forEach((key) => { if (!COLLECTIONS.includes(key)) invalid("Coleção não permitida"); });
  Object.keys(settings).forEach((key) => { if (!SETTING_KEYS.includes(key)) invalid("Configuração não permitida"); });
  COLLECTIONS.forEach((name) => {
    if (puts[name] != null && !Array.isArray(puts[name])) invalid(`Alterações inválidas em ${name}`);
    if (deletes[name] != null && (!Array.isArray(deletes[name]) || deletes[name].some((id) => !SAFE_ID.test(String(id))))) invalid(`Exclusões inválidas em ${name}`);
  });
  inspect(raw);
  return JSON.parse(JSON.stringify({ puts, deletes, settings }));
}

function applyChanges(snapshot, rawChanges) {
  const changes = validateChanges(rawChanges);
  const next = JSON.parse(JSON.stringify(snapshot));
  COLLECTIONS.forEach((name) => {
    const map = new Map((next[name] || []).map((record) => [record.id, record]));
    (changes.puts[name] || []).forEach((record) => {
      if (!record || !SAFE_ID.test(String(record.id || ""))) invalid(`Registro inválido em ${name}`);
      map.set(record.id, record);
    });
    (changes.deletes[name] || []).forEach((id) => map.delete(id));
    next[name] = Array.from(map.values());
  });
  Object.assign(next, changes.settings);
  return validateSnapshot(next);
}

function emptySnapshot() {
  return { version: SCHEMA_VERSION, transactions: [], categories: [], goals: [], assets: [] };
}

// ------------------------------------------------------------------------------
// Protocolo 2: operações incrementais
// ------------------------------------------------------------------------------
// O servidor não recebe mais a base inteira. Cada alteração chega como uma
// operação isolada, validada por si só. Isso é o que permite recusar UMA
// operação inválida sem descartar o lote todo do usuário, e é o que mantém o
// custo por ciclo proporcional ao que mudou.
const OP_ENTITIES = [...COLLECTIONS, "settings"];
const REV_PATTERN = /^\d{15}\.\d{6}\.[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$/;
const MAX_OPS_PER_BATCH = 500;
const MAX_OP_BYTES = 64 * 1024;          // um registro isolado nunca chega perto disso

function validateOp(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) invalid("Operação inválida");
  const entity = String(raw.entity || "");
  const entityId = String(raw.entityId == null ? "" : raw.entityId);
  const op = String(raw.op || "");
  const rev = String(raw.rev || "");

  if (OP_ENTITIES.indexOf(entity) === -1) invalid("Coleção não permitida na operação");
  if (op !== "put" && op !== "delete") invalid("Tipo de operação não permitido");
  if (!REV_PATTERN.test(rev)) invalid("Marca de versão inválida na operação");

  if (entity === "settings") {
    if (SETTING_KEYS.indexOf(entityId) === -1) invalid("Configuração não permitida");
    if (op === "delete") invalid("Configuração não é excluída, apenas substituída");
  } else {
    if (!SAFE_ID.test(entityId)) invalid("Identificador inválido na operação");
  }

  const out = { entity, entityId, op, rev, payload: null };
  if (op === "put") {
    if (raw.payload === undefined) invalid("Operação de gravação sem conteúdo");
    const size = Buffer.byteLength(JSON.stringify(raw.payload) || "", "utf8");
    if (size > MAX_OP_BYTES) invalid("Conteúdo da operação excede o limite");
    inspect(raw.payload);
    if (entity !== "settings") {
      if (!raw.payload || typeof raw.payload !== "object" || Array.isArray(raw.payload)) invalid("Registro inválido na operação");
      if (String(raw.payload.id || "") !== entityId) invalid("Identificador do registro não confere");
      validateRecord(entity, raw.payload);
    }
    out.payload = JSON.parse(JSON.stringify(raw.payload));
  }
  return out;
}

function validateOps(raw) {
  if (!Array.isArray(raw)) invalid("Lote de operações inválido");
  if (raw.length > MAX_OPS_PER_BATCH) invalid("Lote de operações acima do limite", "batch_too_large");
  return raw.map(validateOp);
}

// Dobra o log de operações num snapshot, para exportação e restauração. É a
// mesma função usada pelo cliente ao montar a base a partir do zero.
function foldOps(ops) {
  const snapshot = emptySnapshot();
  const maps = {};
  COLLECTIONS.forEach((name) => { maps[name] = new Map(); });
  (ops || []).forEach((row) => {
    if (!row || row.op !== "put") return;
    if (row.entity === "settings") { snapshot[row.entityId] = row.payload; return; }
    if (!maps[row.entity]) return;
    maps[row.entity].set(row.entityId, row.payload);
  });
  COLLECTIONS.forEach((name) => { snapshot[name] = Array.from(maps[name].values()); });
  return snapshot;
}

module.exports = {
  SCHEMA_VERSION, COLLECTIONS, SETTING_KEYS, MAX_OPS_PER_BATCH,
  validateSnapshot, validateChanges, applyChanges, emptySnapshot,
  validateOp, validateOps, foldOps,
};
