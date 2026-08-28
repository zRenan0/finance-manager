-- O gatilho de evento `ensure_rls` entra no versionamento.
--
-- DE ONDE VEIO
--
-- Capturado do banco de produção em 2026-08-28, pelo bloco 3 de
-- `supabase/tests/verify_rls_auto_enable.sql`:
--
--   tipo           nome        evento            habilitado  função
--   event trigger  ensure_rls  ddl_command_end   O           rls_auto_enable()
--
-- `habilitado = 'O'` é o estado normal (dispara em sessão de origem). Não é
-- preciso `alter event trigger ... enable`.
--
-- A migração 20260828130000 trouxe a FUNÇÃO para o repositório. Faltava o que a
-- chama. Sem esta migração, um banco criado só a partir de `supabase/migrations`
-- tem a função e não tem quem dispare: tabela nova nasce sem RLS, e o furo só
-- aparece no dia em que alguém criar uma tabela e esquecer o
-- `enable row level security` na mão.
--
-- EM PRODUÇÃO ISTO É NO-OP
--
-- O gatilho já existe lá. O bloco abaixo só cria quando NÃO existe gatilho
-- algum apontando para `public.rls_auto_enable`, então produção passa sem ser
-- tocada. A verificação é pela FUNÇÃO ALVO, e não pelo nome: um gatilho com
-- outro nome apontando para a mesma função já cumpre o papel, e criar um
-- segundo faria a função rodar duas vezes por comando.
--
-- POR QUE SEM `WHEN TAG IN (...)`
--
-- A própria função já filtra: ela percorre `pg_event_trigger_ddl_commands()` e
-- só age em `CREATE TABLE`, `CREATE TABLE AS` e `SELECT INTO`, no esquema
-- `public`. Repetir o filtro na declaração do gatilho criaria duas listas para
-- manter em sincronia, e uma lista de tags mais ESTREITA que a da função
-- silenciaria casos que a função trataria. Sem `WHEN`, o gatilho dispara em
-- todo `ddl_command_end` e a função decide — que é exatamente o desenho dela.
--
-- Se o gatilho de produção tiver um `WHEN TAG` (não capturado no bloco 3, que
-- não seleciona `evttags`), ele continua como está: esta migração não o altera.
--
-- POR QUE A FALHA NÃO DERRUBA A MIGRAÇÃO
--
-- `create event trigger` exige SUPERUSUÁRIO. No Supabase, o papel que aplica
-- migração nem sempre tem esse poder — o gatilho de produção foi criado fora
-- deste repositório, provavelmente pelo painel. Deixar a exceção subir faria
-- toda migração futura parar num ambiente onde o privilégio não existe, e o
-- preço seria alto demais para uma rede de segurança.
--
-- Então a falha vira AVISO, não erro. Aviso e não silêncio: `raise warning`
-- aparece na saída do editor SQL e no log, com a instrução do que fazer à mão.
-- Quem conferir de verdade é o bloco 3 do script de verificação.

do $$
declare
  ja_existe boolean;
begin
  select exists (
    select 1
    from pg_event_trigger e
    join pg_proc p on p.oid = e.evtfoid
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) into ja_existe;

  if ja_existe then
    raise notice 'ensure_rls: já existe gatilho para public.rls_auto_enable; nada a fazer';
    return;
  end if;

  begin
    create event trigger ensure_rls
      on ddl_command_end
      execute function public.rls_auto_enable();
    raise notice 'ensure_rls: gatilho de evento criado';
  exception
    when insufficient_privilege then
      raise warning 'ensure_rls NAO foi criado: o papel que aplica migracoes nao e superusuario. '
        'Rode a mão, com um papel que possa: '
        'create event trigger ensure_rls on ddl_command_end execute function public.rls_auto_enable(); '
        'Sem ele, tabela nova em public NAO ganha RLS sozinha.';
    when others then
      raise warning 'ensure_rls NAO foi criado (%): %', sqlstate, sqlerrm;
  end;
end
$$;
