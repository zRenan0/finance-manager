-- Validação das migrações de reset dominante contra PostgreSQL de verdade.
--
-- Por que este arquivo existe: os testes em Node conferem mocks e o TEXTO do
-- SQL. Eles não executam PostgreSQL, então não pegam erro de collation, de
-- ordenação, de permissão nem de comportamento sob lock. Este script roda o
-- RPC de verdade.
--
-- Cobre, na ordem: cofre_hlc_successor, virada do contador 999999, reset_rev
-- maior que qualquer put ou delete anterior, replay com o mesmo hash,
-- idempotency_mismatch com hash diferente, comparação COLLATE "C", permissões,
-- RLS e o wrapper do protocolo 2.
--
-- Como rodar (local):
--   supabase db reset
--   psql <URL_DO_BANCO> -v ON_ERROR_STOP=1 -f supabase/tests/validate_reset_migrations.sql
--
-- A URL local sai de `supabase status`. Em staging, aponte o psql para a
-- conexão de staging. O script roda inteiro dentro de uma transação e termina
-- em ROLLBACK, então não deixa resíduo. Ainda assim, prefira staging a
-- produção.
--
-- Qualquer falha aborta com a mensagem da asserção. Silêncio até a linha final
-- "VALIDACAO OK" significa que tudo passou.

-- SEGURANCA: este script cria um usuario SINTETICO proprio e apaga no fim.
-- Nunca reaproveite uma conta real aqui: o bloco 3 executa um reset de
-- verdade, que grava lapide para TODO registro vivo do usuario informado.
-- Como o `on delete cascade` alcanca todas as tabelas cofre_*, apagar o
-- usuario sintetico no fim leva junto tudo o que o teste criou, mesmo se a
-- ferramenta que executa este arquivo nao respeitar o rollback.

begin;

create or replace function pg_temp.assert(p_ok boolean, p_msg text)
returns void language plpgsql as $assert$
begin
  if p_ok is not true then
    raise exception 'FALHOU: %', p_msg using errcode = 'assert_failure';
  end if;
  raise notice 'ok: %', p_msg;
end;
$assert$;

-- ---------------------------------------------------------------------------
-- 1. cofre_hlc_successor
-- ---------------------------------------------------------------------------
do $bloco$
declare
  v_a text := '001787000000000.000005.device_a';
  v_b text := '001787000000000.000009.device_b';
  v_r text;
begin
  v_r := public.cofre_hlc_successor(v_a, v_b, 'server_reset:teste');
  perform pg_temp.assert(v_r > v_a and v_r > v_b,
    'o sucessor e estritamente maior que as duas entradas');
  perform pg_temp.assert(v_r = '001787000000000.000010.server_reset:teste',
    'o sucessor incrementa o contador do maior milissegundo, obtido: ' || v_r);

  -- Milissegundo maior manda, mesmo com contador menor do outro lado.
  v_r := public.cofre_hlc_successor('001787000000001.000000.dev', '001787000000000.999999.dev', 'srv');
  perform pg_temp.assert(v_r = '001787000000001.000001.srv',
    'o milissegundo maior manda, nao o contador maior, obtido: ' || v_r);

  -- O sufixo de aparelho nao pode influenciar a comparacao numerica.
  perform pg_temp.assert(
    public.cofre_hlc_successor('001787000000000.000005.zzz', '001787000000000.000005.AAA', 'srv')
      = '001787000000000.000006.srv',
    'empate numerico ignora o sufixo do aparelho');

  -- Entradas invalidas precisam ser recusadas, nao normalizadas.
  begin
    v_r := public.cofre_hlc_successor('nao-e-hlc', v_b, 'srv');
    perform pg_temp.assert(false, 'HLC invalida deveria ter sido recusada');
  exception when sqlstate '22023' then
    perform pg_temp.assert(true, 'HLC invalida e recusada com 22023');
  end;

  begin
    v_r := public.cofre_hlc_successor(v_a, v_b, 'aparelho invalido!');
    perform pg_temp.assert(false, 'aparelho invalido deveria ter sido recusado');
  exception when sqlstate '22023' then
    perform pg_temp.assert(true, 'id de aparelho invalido e recusado com 22023');
  end;
end;
$bloco$;

-- ---------------------------------------------------------------------------
-- 2. Virada do contador em 999999
-- ---------------------------------------------------------------------------
do $bloco$
declare
  v_r text;
begin
  v_r := public.cofre_hlc_successor('001787000000000.999999.dev', '001787000000000.999999.dev', 'srv');
  perform pg_temp.assert(v_r = '001787000000001.000000.srv',
    'contador cheio vira e avanca o milissegundo, obtido: ' || v_r);
  perform pg_temp.assert(v_r ~ '^[0-9]{15}\.[0-9]{6}\.[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$',
    'a marca virada continua no formato do protocolo');
  perform pg_temp.assert(v_r > '001787000000000.999999.dev',
    'a marca virada continua maior que a entrada');

  -- Fim da largura: precisa falhar alto, nunca devolver marca fora do padrao.
  begin
    v_r := public.cofre_hlc_successor('999999999999999.999999.dev', '999999999999999.999999.dev', 'srv');
    perform pg_temp.assert(false, 'HLC esgotada deveria ter sido recusada, obtido: ' || v_r);
  exception when sqlstate '22003' then
    perform pg_temp.assert(true, 'HLC esgotada levanta 22003 em vez de estourar a largura');
  end;
end;
$bloco$;

-- ---------------------------------------------------------------------------
-- 3 a 7 e 9. RPC de verdade: reset dominante, replay, mismatch, COLLATE "C"
-- ---------------------------------------------------------------------------
do $bloco$
declare
  v_user uuid;
  v_device text := 'dispositivo-de-validacao';
  v_hash_a text := repeat('a', 64);
  v_hash_b text := repeat('b', 64);
  v_mut_ops uuid := gen_random_uuid();
  v_mut_reset uuid := gen_random_uuid();
  v_mut_colacao uuid := gen_random_uuid();
  v_status text;
  v_revision text;
  v_applied integer;
  v_reset_rev text;
  v_reset_rev_2 text;
  v_max_antes text;
  v_rev_existente text;
begin
  -- Usuario SINTETICO, sempre novo. Jamais reaproveitar uma conta real: o
  -- reset abaixo apaga tudo do usuario informado.
  v_user := gen_random_uuid();
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (v_user, '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated',
          'validacao-hlc+' || replace(v_user::text, '-', '') || '@exemplo.invalido',
          now(), now());
  -- Deixa o id visivel para a limpeza do fim, mesmo se algo falhar no meio.
  create temporary table if not exists pg_temp_usuario_validacao(id uuid);
  delete from pg_temp_usuario_validacao;
  insert into pg_temp_usuario_validacao values (v_user);

  insert into public.cofre_devices(user_id, device_id, secret_hash, label)
  values (v_user, v_device, repeat('0', 64), 'Validacao')
  on conflict (user_id, device_id) do update set revoked_at = null;

  -- Base: um put e uma lapide, com o put propositalmente ADIANTADO no relogio.
  -- E o caso que quebrava antes: a lapide do reset nascia menor que ele.
  select r.status, r.revision, r.applied
    into v_status, v_revision, v_applied
    from public.cofre_apply_ops(
      v_user, v_mut_ops, v_hash_a,
      jsonb_build_array(
        jsonb_build_object('entity', 'transactions', 'entityId', 'tx-adiantado', 'op', 'put',
          'rev', '001999000000000.000042.aparelho_adiantado',
          'payload', jsonb_build_object('id', 'tx-adiantado')),
        jsonb_build_object('entity', 'transactions', 'entityId', 'tx-apagado', 'op', 'delete',
          'rev', '001788000000000.000007.aparelho_normal')
      ),
      v_device, 3, null) r;
  perform pg_temp.assert(v_status = 'applied' and v_applied = 2,
    'as duas operacoes de base foram aplicadas, obtido: ' || v_status || '/' || v_applied);

  select max(o.rev collate "C") into v_max_antes
    from public.cofre_sync_ops o where o.user_id = v_user;

  -- 3. reset_rev maior que QUALQUER put ou lapide anterior.
  select r.status, r.revision, r.applied, r.reset_rev
    into v_status, v_revision, v_applied, v_reset_rev
    from public.cofre_reset_data(v_user, v_mut_reset, v_hash_a, v_device,
      '001787000000000.000001.local', 3) r;
  perform pg_temp.assert(v_status = 'applied', 'o reset foi aplicado, obtido: ' || v_status);
  perform pg_temp.assert(v_reset_rev is not null, 'o reset devolveu reset_rev');
  perform pg_temp.assert((v_reset_rev collate "C") > (v_max_antes collate "C"),
    'reset_rev vence a maior marca anterior: ' || v_reset_rev || ' vs ' || v_max_antes);
  perform pg_temp.assert(v_reset_rev > '001999000000000.000042.aparelho_adiantado',
    'reset_rev vence tambem o put do aparelho adiantado');
  perform pg_temp.assert(
    not exists (select 1 from public.cofre_sync_ops o
                where o.user_id = v_user and o.op = 'put'),
    'o reset nao deixou nenhum put vivo');
  perform pg_temp.assert(
    (select count(*) from public.cofre_sync_ops o
      where o.user_id = v_user and o.rev = v_reset_rev) >= 1,
    'as lapides do reset carregam a marca dominante');

  -- 5. Replay com o MESMO hash devolve a MESMA barreira, nao uma nova.
  select r.status, r.revision, r.applied, r.reset_rev
    into v_status, v_revision, v_applied, v_reset_rev_2
    from public.cofre_reset_data(v_user, v_mut_reset, v_hash_a, v_device,
      '001787000000000.000001.local', 3) r;
  perform pg_temp.assert(v_status = 'replayed',
    'o mesmo mutation_id com o mesmo hash responde replayed, obtido: ' || v_status);
  perform pg_temp.assert(v_reset_rev_2 = v_reset_rev,
    'o replay devolve a MESMA barreira (result_hlc), nao uma nova');
  perform pg_temp.assert(v_applied = 0, 'o replay nao aplica nada de novo');

  -- 6. Mesmo mutation_id com hash DIFERENTE e conflito, nao replay.
  select r.status, r.reset_rev
    into v_status, v_reset_rev_2
    from public.cofre_reset_data(v_user, v_mut_reset, v_hash_b, v_device,
      '001787000000000.000001.local', 3) r;
  perform pg_temp.assert(v_status = 'idempotency_mismatch',
    'hash diferente no mesmo mutation_id responde idempotency_mismatch, obtido: ' || v_status);

  -- O mesmo contrato vale em cofre_apply_ops.
  select r.status into v_status
    from public.cofre_apply_ops(v_user, v_mut_ops, v_hash_a, '[]'::jsonb, v_device, 3, null) r;
  perform pg_temp.assert(v_status = 'replayed',
    'apply_ops repete replayed com o mesmo hash, obtido: ' || v_status);
  select r.status into v_status
    from public.cofre_apply_ops(v_user, v_mut_ops, v_hash_b, '[]'::jsonb, v_device, 3, null) r;
  perform pg_temp.assert(v_status = 'idempotency_mismatch',
    'apply_ops acusa mismatch com hash diferente, obtido: ' || v_status);

  -- 4. Duas chamadas com o mesmo mutation_id: a segunda enxerga a primeira.
  -- Em uma sessao so, isto exercita a revalidacao APOS o lock. A concorrencia
  -- real de duas sessoes esta no bloco comentado no fim deste arquivo.
  perform pg_temp.assert(
    (select count(*) from public.cofre_mutations m
      where m.user_id = v_user and m.mutation_id = v_mut_reset) = 1,
    'o mesmo mutation_id gravou uma unica linha em cofre_mutations');

  -- 7. COLLATE "C": a decisao de vencedor precisa ser ASCII pura.
  --
  -- 'Zebra' e 'alpha' so trocam de ordem entre as collations: em C, 'Z' (0x5A)
  -- vem antes de 'a' (0x61), entao a marca com 'alpha' e MAIOR e deve ser
  -- aplicada. Numa collation linguistica (en_US.UTF-8), 'alpha' viria antes de
  -- 'Zebra' e a operacao seria descartada. Se esta assercao falhar, a collation
  -- do banco esta decidindo o protocolo no lugar do contrato.
  insert into public.cofre_sync_ops(user_id, seq, entity, entity_id, op, rev, payload, device_id, mutation_id)
  values (v_user, 900001, 'transactions', 'tx-colacao', 'put',
          '001787000000000.000100.Zebra', jsonb_build_object('id', 'tx-colacao'),
          v_device, gen_random_uuid())
  on conflict (user_id, entity, entity_id) do update
    set rev = excluded.rev, seq = excluded.seq, op = excluded.op, payload = excluded.payload;
  update public.cofre_sync_state set revision = 900001 where user_id = v_user;

  select r.status into v_status
    from public.cofre_apply_ops(
      v_user, v_mut_colacao, v_hash_a,
      jsonb_build_array(jsonb_build_object(
        'entity', 'transactions', 'entityId', 'tx-colacao', 'op', 'put',
        'rev', '001787000000000.000100.alpha',
        'payload', jsonb_build_object('id', 'tx-colacao'))),
      v_device, 3, null) r;
  select o.rev into v_rev_existente from public.cofre_sync_ops o
    where o.user_id = v_user and o.entity = 'transactions' and o.entity_id = 'tx-colacao';
  perform pg_temp.assert(v_rev_existente = '001787000000000.000100.alpha',
    'a comparacao usa COLLATE "C": .alpha vence .Zebra, obtido: ' || v_rev_existente);

  -- 9. Wrapper do protocolo 2: cinco parametros delegam para os seis.
  select r.status, r.revision, r.applied
    into v_status, v_revision, v_applied
    from public.cofre_reset_data(v_user, gen_random_uuid(), v_hash_a, v_device,
      '001787000000000.000001.local') r;
  perform pg_temp.assert(v_status = 'applied',
    'o wrapper de 5 parametros aplica no protocolo 2, obtido: ' || v_status);

  -- Aparelho revogado nao escreve, nem pelo wrapper.
  update public.cofre_devices set revoked_at = now()
    where user_id = v_user and device_id = v_device;
  select r.status into v_status
    from public.cofre_reset_data(v_user, gen_random_uuid(), v_hash_a, v_device,
      '001787000000000.000001.local') r;
  perform pg_temp.assert(v_status = 'device_revoked',
    'aparelho revogado recebe device_revoked, obtido: ' || v_status);
  select r.status into v_status
    from public.cofre_apply_ops(v_user, gen_random_uuid(), v_hash_a, '[]'::jsonb, v_device, 3, null) r;
  perform pg_temp.assert(v_status = 'device_revoked',
    'apply_ops tambem recusa aparelho revogado, obtido: ' || v_status);
end;
$bloco$;

-- ---------------------------------------------------------------------------
-- 8. Permissões e RLS
-- ---------------------------------------------------------------------------
do $bloco$
declare
  v_fn text;
  v_papel text;
  v_tabela text;
begin
  -- Nenhuma das funcoes pode ser executavel por public/anon/authenticated.
  foreach v_fn in array array[
    'cofre_hlc_successor(text,text,text)',
    'cofre_apply_ops(uuid,uuid,text,jsonb,text,integer,bigint)',
    'cofre_reset_data(uuid,uuid,text,text,text,integer)',
    'cofre_reset_data(uuid,uuid,text,text,text)'
  ] loop
    foreach v_papel in array array['public', 'anon', 'authenticated'] loop
      perform pg_temp.assert(
        not has_function_privilege(v_papel, 'public.' || v_fn, 'execute'),
        v_papel || ' NAO executa ' || v_fn);
    end loop;
  end loop;

  -- service_role executa as de escrita. cofre_hlc_successor e interna: so e
  -- chamada de dentro de cofre_reset_data, que e security definer.
  foreach v_fn in array array[
    'cofre_apply_ops(uuid,uuid,text,jsonb,text,integer,bigint)',
    'cofre_reset_data(uuid,uuid,text,text,text,integer)',
    'cofre_reset_data(uuid,uuid,text,text,text)'
  ] loop
    perform pg_temp.assert(
      has_function_privilege('service_role', 'public.' || v_fn, 'execute'),
      'service_role executa ' || v_fn);
  end loop;

  perform pg_temp.assert(
    not has_function_privilege('service_role', 'public.cofre_hlc_successor(text,text,text)', 'execute'),
    'cofre_hlc_successor continua interna, sem execute para service_role');

  -- RLS ligada em toda tabela tocada pelo reset.
  foreach v_tabela in array array[
    'cofre_devices', 'cofre_mutations', 'cofre_sync_state', 'cofre_sync_ops'
  ] loop
    perform pg_temp.assert(
      (select c.relrowsecurity from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = v_tabela),
      'RLS ligada em ' || v_tabela);
  end loop;

  -- As funcoes de escrita precisam ser security definer com search_path fixo:
  -- sem isso, um search_path hostil trocaria as tabelas por baixo delas.
  perform pg_temp.assert(
    (select bool_and(p.prosecdef) from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('cofre_apply_ops', 'cofre_reset_data')),
    'cofre_apply_ops e cofre_reset_data sao security definer');
  perform pg_temp.assert(
    (select bool_and(array_to_string(p.proconfig, ',') like '%search_path%') from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('cofre_apply_ops', 'cofre_reset_data', 'cofre_hlc_successor')),
    'as tres funcoes fixam search_path');

  -- result_hlc precisa existir e ter o check de formato.
  perform pg_temp.assert(
    exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'cofre_mutations'
        and column_name = 'result_hlc'),
    'cofre_mutations.result_hlc existe');
  perform pg_temp.assert(
    exists (select 1 from pg_constraint
      where conrelid = 'public.cofre_mutations'::regclass
        and conname = 'cofre_mutations_result_hlc_check'),
    'o check de formato de result_hlc existe');
end;
$bloco$;

-- Limpeza explicita, alem do rollback: se a ferramenta que executa este
-- arquivo rodar cada comando em autocommit, o rollback nao vale e so esta
-- linha garante que nada do teste fica no banco. O cascade alcanca
-- cofre_devices, cofre_sync_ops, cofre_sync_state e cofre_mutations.
do $limpeza$
begin
  if to_regclass('pg_temp.pg_temp_usuario_validacao') is not null then
    delete from auth.users
      where id in (select id from pg_temp_usuario_validacao);
  end if;
end;
$limpeza$;

rollback;

-- ---------------------------------------------------------------------------
-- Concorrência real: duas sessões, mesmo mutation_id
-- ---------------------------------------------------------------------------
-- O bloco acima cobre a revalidação após o lock em uma sessão só. Para o caso
-- de verdade, abra DOIS psql e dispare ao mesmo tempo, com o MESMO mutation_id
-- e o MESMO hash. Uma responde 'applied', a outra 'replayed', e nenhuma das
-- duas pode falhar com unique_violation em cofre_mutations.
--
--   select * from public.cofre_reset_data(
--     '<user_id>'::uuid,
--     '<mesmo mutation_id>'::uuid,
--     repeat('a', 64),
--     '<device_id>',
--     '001787000000000.000001.local',
--     3);
--
-- Com hash DIFERENTE entre as duas, a perdedora precisa responder
-- 'idempotency_mismatch'. Se aparecer unique_violation em qualquer combinação,
-- a segunda consulta sob o lock não está enxergando o commit da primeira.
