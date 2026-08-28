-- Diagnóstico e verificação de public.rls_auto_enable().
--
-- Este script é SOMENTE LEITURA. Não cria, não altera e não apaga nada. Pode ser
-- rodado em produção sem risco, e deve ser rodado DUAS vezes:
--
--   1) ANTES da migração 20260828120000_rls_auto_enable_least_privilege.sql, para
--      capturar a definição da função — que não está em nenhuma migração deste
--      repositório — e o estado atual dos privilégios;
--   2) DEPOIS da migração, para confirmar que `anon` e `authenticated` perderam
--      EXECUTE e que o gatilho de evento continua no lugar.
--
-- COMO RODAR
--
-- No SQL Editor do Supabase: rode UM BLOCO POR VEZ. O editor exibe apenas o
-- resultado da última consulta enviada; mandar o arquivo inteiro de uma vez
-- mostraria só o bloco 5 e esconderia os outros quatro.
--
-- Por linha de comando, o arquivo inteiro de uma vez funciona:
--   psql <URL_DO_BANCO> -v ON_ERROR_STOP=1 -f supabase/tests/verify_rls_auto_enable.sql
--
-- Não há comando de psql aqui (nada de `\echo`, `\d` ou afins): é tudo SQL puro,
-- justamente para que o mesmo arquivo sirva nos dois lugares.
--
-- A saída do bloco 1 é o que fecha o desvio de versionamento: guarde o texto da
-- coluna `definicao` para que a função passe a existir no repositório.


-- ============================================================================
-- BLOCO 1 — A função existe? Definição, dono, segurança e search_path.
-- ============================================================================

select
  p.oid::regprocedure                              as assinatura,
  pg_get_userbyid(p.proowner)                      as dono,
  p.prosecdef                                      as security_definer,
  coalesce(array_to_string(p.proconfig, ' | '), '(search_path herdado)') as configuracao,
  p.prorettype::regtype                            as retorno,
  coalesce(array_to_string(p.proacl::text[], ' / '), '(sem ACL explícita: EXECUTE de PUBLIC vale)') as acl,
  pg_get_functiondef(p.oid)                        as definicao
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'rls_auto_enable';


-- ============================================================================
-- BLOCO 2 — Quem consegue executar, de fato (privilégio efetivo).
--
-- `has_function_privilege` já resolve herança por PUBLIC e por pertencimento a
-- papel. É a resposta que vale, não a leitura crua da ACL.
-- ============================================================================

select
  p.oid::regprocedure as assinatura,
  r.rolname           as papel,
  has_function_privilege(r.rolname, p.oid, 'EXECUTE') as pode_executar
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (
  select rolname from pg_roles
  where rolname in ('anon', 'authenticated', 'service_role', 'postgres')
) r
where n.nspname = 'public'
  and p.proname = 'rls_auto_enable'
order by 1, 2;


-- ============================================================================
-- BLOCO 3 — Ela é usada por gatilho de evento ou por gatilho comum?
--
-- Se aparecer aqui, o automatismo depende dela e a função NÃO pode ser removida.
-- Revogar EXECUTE não afeta o disparo: o PostgreSQL confere esse privilégio na
-- CRIAÇÃO do gatilho, não a cada disparo.
-- ============================================================================

-- `evtenabled`: O = habilitado (sessão de origem, o normal), D = desabilitado,
-- R = só em réplica, A = sempre. Qualquer coisa diferente de O ou A merece
-- explicação. `evttags` nulo significa que o gatilho dispara em TODO comando do
-- evento e quem filtra é a função — que é o desenho de `rls_auto_enable`.
select
  'event trigger'                            as tipo,
  e.evtname::text                            as nome,
  e.evtevent::text                           as evento_ou_tabela,
  e.evtenabled::text                         as habilitado,
  coalesce(array_to_string(e.evttags, ', '), '(sem filtro de tag: a função filtra)') as tags,
  e.evtfoid::regprocedure::text              as funcao
from pg_event_trigger e
join pg_proc p on p.oid = e.evtfoid
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'rls_auto_enable'
union all
select
  'trigger',
  t.tgname::text,
  t.tgrelid::regclass::text,
  t.tgenabled::text,
  '(não se aplica)',
  t.tgfoid::regprocedure::text
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'rls_auto_enable';


-- ----------------------------------------------------------------------------
-- BLOCO 3.1 — O automatismo está de pé?
--
-- Uma linha. Função sem gatilho é o caso silencioso: nada dá erro, e tabela
-- nova simplesmente nasce sem RLS.
-- ----------------------------------------------------------------------------

select
  case
    when not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'rls_auto_enable'
    ) then 'AUSENTE: a função nem existe neste banco.'
    when not exists (
      select 1 from pg_event_trigger e
      join pg_proc p on p.oid = e.evtfoid
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'rls_auto_enable'
    ) then 'QUEBRADO: a função existe mas NENHUM gatilho a chama. '
           || 'Tabela nova em public não ganha RLS sozinha. '
           || 'Aplique 20260828150000_rls_auto_enable_gatilho.sql.'
    when exists (
      select 1 from pg_event_trigger e
      join pg_proc p on p.oid = e.evtfoid
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'rls_auto_enable'
        and e.evtenabled not in ('O', 'A')
    ) then 'DESLIGADO: existe gatilho, mas ele está desabilitado.'
    else 'OK: o gatilho existe e está habilitado.'
  end as automatismo;


-- ============================================================================
-- BLOCO 4 — VEREDITO.
--
-- Devolve exatamente uma linha. É um `select`, e não `raise notice`, porque o
-- SQL Editor do Supabase mostra tabela de resultado e engole aviso de servidor.
-- ============================================================================

select
  case
    when not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'rls_auto_enable'
    )
      then 'NAO SE APLICA: public.rls_auto_enable nao existe neste banco.'
    when exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated')) r
      where n.nspname = 'public' and p.proname = 'rls_auto_enable'
        and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
    )
      then 'PENDENTE: anon ou authenticated ainda executam public.rls_auto_enable. '
           || 'Aplique supabase/migrations/20260828120000_rls_auto_enable_least_privilege.sql.'
    else 'OK: nem anon nem authenticated executam public.rls_auto_enable.'
  end as veredito;


-- ============================================================================
-- BLOCO 5 — Varredura geral: outras SECURITY DEFINER expostas em public.
--
-- Generaliza o achado. O esquema `public` é publicado pelo PostgREST, então toda
-- `security definer` executável por `anon` ou `authenticated` é uma rota de
-- internet rodando com privilégio do dono. Espera-se lista VAZIA: todas as
-- funções `cofre_*` do projeto revogam de public/anon/authenticated e concedem
-- apenas a service_role. Qualquer linha aqui é achado do Módulo 2.
-- ============================================================================

select
  p.oid::regprocedure as assinatura,
  r.rolname           as papel_com_execute,
  pg_get_userbyid(p.proowner) as dono,
  coalesce(array_to_string(p.proconfig, ' | '), '(search_path herdado)') as configuracao
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated')) r
where n.nspname = 'public'
  and p.prosecdef
  and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
order by 1, 2;
