// test-rls-least-privilege.js: RLS ligado, policy estreita, privilégio mínimo.
// ------------------------------------------------------------------------------
// O Supabase concede ALL sobre toda tabela nova do esquema `public` para `anon`,
// `authenticated` e `service_role`, por privilégio padrão. Ou seja: uma tabela
// nasce ABERTA, e é a migração que precisa fechá-la. Esquecer o `revoke` não dá
// erro nenhum, não aparece em teste de comportamento e só vira problema no dia
// em que o RLS falhar ou receber uma policy mal escrita.
//
// Foi o que aconteceu com `cofre_financial_snapshots` e `cofre_mutations`: as
// duas revogavam de `anon` e não de `authenticated`. O RLS segurava sozinho.
// Este teste existe para que a próxima tabela não repita isso.
//
// Ele lê as migrações, não o banco. O banco é conferido por
// `supabase/tests/verify_table_privileges.sql`.
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
let pass = 0;
let fail = 0;

function check(name, condition, extra) {
  if (condition) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra == null ? "" : ` -> ${extra}`}`); }
}

// Corpos entre `$…$` e comentários de linha saem antes: a prosa deste projeto
// cita `grant`, `revoke` e `policy` ao explicar as decisões, e seria auditada
// como se fosse código.
function declarativo(sql) {
  return sql
    .replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, " CORPO ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// Tabelas que NÃO devem ter policy nenhuma: nenhum cliente as lê, em papel
// nenhum. A lista é fechada — uma tabela server-only nova precisa ser declarada
// aqui de propósito, e não descoberta depois pelo linter.
const SERVER_ONLY = ["cofre_mutations", "cofre_rate_limit", "cofre_sync_config"];

// Concessão por coluna, e não por tabela: o cliente lê rótulo e tipo do
// aparelho, nunca `secret_hash`. Uma tabela assim não pode receber
// `grant select` de tabela inteira.
const GRANT_POR_COLUNA = ["cofre_devices"];

function main() {
  const arquivos = fs.readdirSync(MIGRATIONS).filter((n) => n.endsWith(".sql")).sort();
  const sql = declarativo(arquivos.map((n) => fs.readFileSync(path.join(MIGRATIONS, n), "utf8")).join("\n"));

  console.log("\n1. Toda tabela do projeto liga RLS");
  const tabelas = [...new Set((sql.match(/create table if not exists public\.(cofre_\w+)/g) || [])
    .map((t) => t.replace(/.*public\./, "")))];
  check("as tabelas do projeto foram encontradas", tabelas.length === 9, `${tabelas.length}: ${tabelas.join(", ")}`);
  const semRls = tabelas.filter((t) => !new RegExp(`alter table public\\.${t} enable row level security`).test(sql));
  check("todas habilitam row level security", semRls.length === 0, semRls.join(", "));

  console.log("\n2. Nenhuma policy é mais larga do que precisa");
  const policies = sql.match(/create policy [^;]*;/g) || [];
  check("há policies para auditar", policies.length >= 6, policies.length);
  // Toda escrita do projeto passa por RPC `security definer`. Uma policy de
  // insert/update/delete abriria caminho de escrita direta pelo PostgREST.
  const deEscrita = policies.filter((p) => !/ for select /.test(p));
  check("nenhuma policy permite escrita pelo PostgREST", deEscrita.length === 0, deEscrita.join(" || "));
  // `using (true)` é o atalho que faz o linter calar e a tabela abrir.
  const permissivas = policies.filter((p) => /using \(\s*true\s*\)|with check \(\s*true\s*\)/.test(p));
  check("nenhuma policy usa a condição sempre verdadeira", permissivas.length === 0, permissivas.join(" || "));
  const semDono = policies.filter((p) => !/auth\.uid\(\)\) = user_id/.test(p));
  check("toda policy compara auth.uid() com o dono da linha", semDono.length === 0, semDono.join(" || "));
  const semPapel = policies.filter((p) => !/ to authenticated /.test(p));
  check("toda policy vale só para authenticated", semPapel.length === 0, semPapel.join(" || "));
  // Uma policy numa tabela server-only seria a porta que não deveria existir.
  const serverOnlyComPolicy = SERVER_ONLY.filter((t) => policies.some((p) => p.includes(`public.${t} `)));
  check("as tabelas server-only continuam sem policy", serverOnlyComPolicy.length === 0, serverOnlyComPolicy.join(", "));

  console.log("\n3. O privilégio padrão do Supabase é desfeito em toda tabela");
  // `revoke <privs> on <alvos> from <papeis>;` — os alvos vêm em lista, e a
  // mesma instrução costuma cobrir quatro tabelas de uma vez.
  const revogados = { anon: new Set(), authenticated: new Set(), public: new Set() };
  const revokes = sql.match(/revoke\s+[^;]*?\s+on\s+[^;]*?\s+from\s+[^;]*?;/g) || [];
  revokes.forEach((instrucao) => {
    const partes = /revoke\s+(.*?)\s+on\s+(.*?)\s+from\s+(.*?);/.exec(instrucao);
    if (!partes || /\bfunction\b/.test(partes[2])) return;
    const alvos = partes[2].split(",").map((a) => a.trim().replace(/^public\./, ""));
    const papeis = partes[3].split(",").map((p) => p.trim());
    // Revogação de coluna (`revoke select (device_type) ...`) não desfaz o
    // privilégio de tabela, então não conta aqui.
    if (/\(/.test(partes[1])) return;
    papeis.forEach((papel) => {
      if (revogados[papel]) alvos.forEach((a) => revogados[papel].add(a));
    });
  });
  const faltaAnon = tabelas.filter((t) => !revogados.anon.has(t));
  check("toda tabela revoga o privilégio padrão de anon", faltaAnon.length === 0, faltaAnon.join(", "));
  const faltaAuth = tabelas.filter((t) => !revogados.authenticated.has(t));
  check("toda tabela revoga o privilégio padrão de authenticated", faltaAuth.length === 0, faltaAuth.join(", "));

  console.log("\n4. Nenhuma concessão de escrita ao cliente");
  const grants = sql.match(/grant\s+[^;]*?\s+on\s+[^;]*?\s+to\s+[^;]*?;/g) || [];
  const escritaConcedida = grants.filter((g) => {
    const partes = /grant\s+(.*?)\s+on\s+(.*?)\s+to\s+(.*?);/.exec(g);
    if (!partes || /\bfunction\b/.test(partes[2])) return false;
    return /\b(insert|update|delete|truncate|all)\b/.test(partes[1])
      && /\b(anon|authenticated|public)\b/.test(partes[3]);
  });
  check("nenhum grant de escrita para anon, authenticated ou public",
    escritaConcedida.length === 0, escritaConcedida.join(" || "));
  // Tabela com concessão por coluna não pode receber concessão de tabela
  // inteira depois: seria devolver `secret_hash` ao cliente sem ninguém notar.
  const vazouTabelaInteira = GRANT_POR_COLUNA.filter((t) =>
    grants.some((g) => new RegExp(`grant select on public\\.${t}\\b`).test(g)));
  check("cofre_devices continua concedida por coluna, nunca por tabela",
    vazouTabelaInteira.length === 0, vazouTabelaInteira.join(", "));
  check("o segredo do aparelho nunca é concedido",
    !/grant select \([^)]*secret_hash/.test(sql));

  console.log("\n5. A correção do módulo 3 está aplicada e é mínima");
  const correcao = arquivos.filter((n) => /menor_privilegio_tabelas/.test(n));
  check("a migração de menor privilégio existe", correcao.length === 1, correcao.join(", "));
  if (correcao.length === 1) {
    const texto = declarativo(fs.readFileSync(path.join(MIGRATIONS, correcao[0]), "utf8"));
    check("cofre_financial_snapshots é revogada e reconcedida só para leitura",
      /revoke all on public\.cofre_financial_snapshots from public, anon, authenticated;/.test(texto)
      && /grant select on public\.cofre_financial_snapshots to authenticated;/.test(texto));
    check("cofre_mutations é revogada e não recebe nada de volta",
      /revoke all on public\.cofre_mutations from public, anon, authenticated;/.test(texto)
      && !/grant \w+ on public\.cofre_mutations/.test(texto));
    // A armadilha: `revoke all` em cofre_devices apagaria as concessões POR
    // COLUNA de duas migrações e quebraria GET /api/account/devices.
    check("ela não toca em cofre_devices", !/on public\.cofre_devices/.test(texto));
    check("ela não cria policy nenhuma", !/create policy/.test(texto));
    check("ela não desliga RLS de nada", !/disable row level security/.test(texto));
  }
  // O comentário na tabela é o que transforma "sem policy" de esquecimento em
  // decisão registrada, legível por quem abrir o banco sem abrir o repositório.
  const semComentario = SERVER_ONLY.filter((t) => !new RegExp(`comment on table public\\.${t} is`).test(sql));
  check("toda tabela server-only explica por que não tem policy",
    semComentario.length === 0, semComentario.join(", "));

  console.log("\n6. O script de conferência do banco acompanha");
  check("verify_table_privileges.sql existe",
    fs.existsSync(path.join(ROOT, "supabase/tests/verify_table_privileges.sql")));

  console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} - ${pass} ok, ${fail} falha(s)\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
