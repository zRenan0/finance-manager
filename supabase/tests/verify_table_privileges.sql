-- Matriz de RLS, policies e privilégios das tabelas do projeto.
--
-- SOMENTE LEITURA. Não cria, não altera e não apaga nada. Seguro em produção.
--
-- Rodar ANTES e DEPOIS de
-- `supabase/migrations/20260828140000_menor_privilegio_tabelas.sql`.
--
-- No SQL Editor do Supabase: UM BLOCO POR VEZ — o editor mostra só o resultado
-- da última consulta enviada. Por linha de comando o arquivo inteiro funciona:
--   psql <URL_DO_BANCO> -v ON_ERROR_STOP=1 -f supabase/tests/verify_table_privileges.sql
--
-- Sem comandos de psql, de propósito, para o mesmo arquivo servir nos dois lugares.


-- ============================================================================
-- BLOCO 1 — RLS ligado? Quantas policies? A tabela é server-only?
--
-- Esperado: RLS ligado nas nove. Zero policy em cofre_mutations,
-- cofre_rate_limit e cofre_sync_config — é deliberado, e o COMMENT diz isso.
-- ============================================================================

select
  c.relname                                   as tabela,
  c.relrowsecurity                            as rls_ligado,
  c.relforcerowsecurity                       as rls_forcado_para_o_dono,
  count(p.polname)                            as policies,
  -- `polcmd` é do tipo `"char"` do catálogo, não `text`. Sem o cast, `||` casa
  -- com mais de um operador e o PostgreSQL recusa: "operator is not unique".
  coalesce(string_agg(p.polname::text || ' [' || p.polcmd::text || ']', ' / ' order by p.polname), '(nenhuma: nega tudo)') as detalhe,
  coalesce(obj_description(c.oid, 'pg_class'), '(sem comentário)') as proposito
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'cofre\_%'
group by c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
order by c.relname;


-- ============================================================================
-- BLOCO 2 — Privilégios de TABELA por papel.
--
-- É aqui que aparece o achado do módulo 3: privilégio de escrita sobrando em
-- `authenticated`, que o privilégio padrão do esquema `public` concedeu e a
-- migração original não desfez.
--
-- Esperado DEPOIS da migração:
--   cofre_financial_snapshots → authenticated: SELECT, e só.
--   cofre_mutations           → authenticated: nada.
--   demais                    → SELECT para authenticated, nada para anon.
-- ============================================================================

select
  c.relname   as tabela,
  r.rolname   as papel,
  string_agg(privilegio, ', ' order by privilegio) as concedidos
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated')) r
cross join lateral (
  select unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as privilegio
) p
where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'cofre\_%'
  and has_table_privilege(r.rolname, c.oid, p.privilegio)
group by c.relname, r.rolname
order by c.relname, r.rolname;


-- ============================================================================
-- BLOCO 3 — Privilégios de COLUNA.
--
-- `cofre_devices` usa concessão por coluna: o cliente lê rótulo e tipo, nunca
-- `secret_hash`. Um `revoke all ... from authenticated` nessa tabela apagaria
-- estas linhas e quebraria GET /api/account/devices — por isso a migração do
-- módulo 3 não a toca.
--
-- Esperado: só cofre_devices aparece, e `secret_hash` NUNCA está na lista.
-- ============================================================================

select
  c.relname    as tabela,
  a.attname    as coluna,
  r.rolname    as papel
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated')) r
where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'cofre\_%'
  and has_column_privilege(r.rolname, c.oid, a.attnum, 'SELECT')
  and not has_table_privilege(r.rolname, c.oid, 'SELECT')
order by c.relname, r.rolname, a.attname;


-- ============================================================================
-- BLOCO 4 — Toda policy escrita, por extenso.
--
-- Procurar por: `true` sozinho em USING ou WITH CHECK, policy que não compare
-- `auth.uid()` com `user_id`, e policy de INSERT/UPDATE/DELETE — o projeto não
-- tem nenhuma, porque toda escrita passa por RPC `security definer`.
-- ============================================================================

select
  c.relname                          as tabela,
  p.polname                          as policy,
  case p.polcmd
    when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE'
    when 'd' then 'DELETE' else 'ALL' end as comando,
  coalesce(
    (select string_agg(rolname::text, ', ') from pg_roles where oid = any(p.polroles)),
    'PUBLIC'
  )                                  as papeis,
  pg_get_expr(p.polqual, p.polrelid)      as usando,
  pg_get_expr(p.polwithcheck, p.polrelid) as com_verificacao
from pg_policy p
join pg_class c on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname like 'cofre\_%'
order by c.relname, p.polname;


-- ============================================================================
-- BLOCO 5 — VEREDITO do módulo 3. Devolve uma linha por problema encontrado.
--
-- Lista VAZIA é o resultado esperado depois da migração.
-- ============================================================================

with tabelas as (
  select c.oid, c.relname, c.relrowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'cofre\_%'
)
select relname as tabela, 'RLS DESLIGADO' as problema
from tabelas where not relrowsecurity
union all
select t.relname, 'escrita concedida a ' || r.rolname::text || ': ' || p.privilegio
from tabelas t
cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated')) r
cross join lateral (select unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as privilegio) p
where has_table_privilege(r.rolname, t.oid, p.privilegio)
union all
select t.relname, 'leitura concedida a ' || r.rolname::text
from tabelas t
cross join (select rolname from pg_roles where rolname = 'anon') r
where has_table_privilege(r.rolname, t.oid, 'SELECT')
union all
select c.relname, 'policy permissiva demais: ' || p.polname::text
from pg_policy p
join pg_class c on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname like 'cofre\_%'
  and (pg_get_expr(p.polqual, p.polrelid) = 'true'
       or pg_get_expr(p.polwithcheck, p.polrelid) = 'true'
       or pg_get_expr(p.polqual, p.polrelid) is null)
order by 1, 2;
