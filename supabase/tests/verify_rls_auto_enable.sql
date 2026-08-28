-- Diagnóstico e verificação de public.rls_auto_enable().
--
-- Este script é SOMENTE LEITURA. Ele não cria, não altera e não apaga nada.
-- Pode ser rodado em produção sem risco, e deve ser rodado DUAS vezes:
--
--   1) ANTES da migração 20260828120000_rls_auto_enable_least_privilege.sql,
--      para capturar a definição da função — que não está em nenhuma migração
--      deste repositório — e o estado atual dos privilégios;
--   2) DEPOIS da migração, para confirmar que `anon` e `authenticated` perderam
--      EXECUTE e que o gatilho de evento continua no lugar.
--
-- Como rodar:
--   psql <URL_DO_BANCO> -v ON_ERROR_STOP=1 -f supabase/tests/verify_rls_auto_enable.sql
--
-- No painel do Supabase, o mesmo conteúdo roda no SQL Editor.
--
-- A saída do bloco 1 é o que fecha o desvio de versionamento: guarde o texto de
-- `definicao` para que a função passe a existir no repositório.

\echo ''
\echo '=============================================================='
\echo '1. A função existe? Definição, dono, seguranca e search_path'
\echo '=============================================================='

select
  p.oid::regprocedure                              as assinatura,
  pg_get_userbyid(p.proowner)                      as dono,
  p.prosecdef                                      as security_definer,
  coalesce(array_to_string(p.proconfig, ' | '), '(search_path herdado)') as configuracao,
  p.provolatile                                    as volatilidade,
  p.prorettype::regtype                            as retorno,
  coalesce(array_to_string(p.proacl::text[], E'\n'), '(sem ACL explícita: EXECUTE de PUBLIC vale)') as acl,
  pg_get_functiondef(p.oid)                        as definicao
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'rls_auto_enable';

\echo ''
\echo '=============================================================='
\echo '2. Quem consegue executar, de fato (privilegio efetivo)'
\echo '=============================================================='

-- `has_function_privilege` já resolve herança por PUBLIC e por pertencimento a
-- papel. É a resposta que vale, não a leitura crua da ACL.
select
  p.oid::regprocedure as assinatura,
  r.rolname           as papel,
  has_function_privilege(r.rolname, p.oid, 'EXECUTE') as pode_executar
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (
  select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role', 'postgres')
) r
where n.nspname = 'public'
  and p.proname = 'rls_auto_enable'
order by p.oid, r.rolname;

\echo ''
\echo '=============================================================='
\echo '3. Ela é usada por gatilho de evento ou por gatilho comum?'
\echo '=============================================================='

-- Se aparecer aqui, o automatismo depende dela e a função NÃO pode ser
-- removida. Revogar EXECUTE não afeta o disparo: o PostgreSQL confere esse
-- privilégio na CRIAÇÃO do gatilho, não a cada disparo.
select
  'event trigger' as tipo,
  e.evtname       as nome,
  e.evtevent      as evento,
  e.evtenabled    as habilitado,
  e.evtfoid::regprocedure as funcao
from pg_event_trigger e
join pg_proc p on p.oid = e.evtfoid
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'rls_auto_enable'
union all
select
  'trigger' as tipo,
  t.tgname,
  t.tgrelid::regclass::text,
  t.tgenabled::text,
  t.tgfoid::regprocedure
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'rls_auto_enable';

\echo ''
\echo '=============================================================='
\echo '4. VEREDITO'
\echo '=============================================================='

do $$
declare
  existe boolean;
  exposta boolean;
begin
  select exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) into existe;

  if not existe then
    raise notice 'NAO SE APLICA: public.rls_auto_enable nao existe neste banco.';
    return;
  end if;

  select bool_or(has_function_privilege(r.rolname, p.oid, 'EXECUTE'))
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated')) r
  where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  into exposta;

  if exposta then
    raise notice 'PENDENTE: anon ou authenticated ainda executam public.rls_auto_enable.';
    raise notice 'Aplique supabase/migrations/20260828120000_rls_auto_enable_least_privilege.sql.';
  else
    raise notice 'OK: nem anon nem authenticated executam public.rls_auto_enable.';
  end if;
end
$$;

\echo ''
\echo '=============================================================='
\echo '5. Varredura geral: outras SECURITY DEFINER expostas em public'
\echo '=============================================================='

-- Generaliza o achado. O esquema `public` é publicado pelo PostgREST, então
-- toda `security definer` executável por `anon` ou `authenticated` é uma rota
-- de internet rodando com privilégio do dono. Espera-se lista VAZIA: todas as
-- funções `cofre_*` do projeto revogam de public/anon/authenticated e concedem
-- apenas a service_role. Qualquer linha aqui é achado do Módulo 2.
select
  p.oid::regprocedure as assinatura,
  r.rolname           as papel_com_execute,
  coalesce(array_to_string(p.proconfig, ' | '), '(search_path herdado)') as configuracao
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated')) r
where n.nspname = 'public'
  and p.prosecdef
  and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
order by 1, 2;
