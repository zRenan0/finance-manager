-- Preparação do protocolo 3. Esta migração mantém escrita 2 durante a janela
-- de atualização e não remove snapshots nem operações antigas.

create table if not exists public.cofre_sync_config (
  id smallint primary key check (id = 1),
  server_protocol integer not null check (server_protocol >= 1),
  minimum_write_protocol integer not null check (
    minimum_write_protocol >= 1 and minimum_write_protocol <= server_protocol
  ),
  updated_at timestamptz not null default now()
);

insert into public.cofre_sync_config(id, server_protocol, minimum_write_protocol)
values (1, 3, 2)
on conflict (id) do update
  set server_protocol = excluded.server_protocol,
      minimum_write_protocol = least(public.cofre_sync_config.minimum_write_protocol, excluded.minimum_write_protocol),
      updated_at = now();

alter table public.cofre_sync_config enable row level security;
revoke all on public.cofre_sync_config from public, anon, authenticated;
grant select, update on public.cofre_sync_config to service_role;

alter table public.cofre_sync_ops
  drop constraint if exists cofre_sync_ops_entity_check;
alter table public.cofre_sync_ops
  drop constraint if exists cofre_sync_ops_entity_v3_check;
alter table public.cofre_sync_ops
  add constraint cofre_sync_ops_entity_v3_check check (
    entity in (
      'transactions', 'categories', 'goals', 'assets', 'settings',
      'accounts', 'creditCards', 'accountTransfers', 'cardPayments', 'accountAdjustments'
    )
  );

-- A assinatura nova recebe a versão falada pelo cliente e a revisão observada
-- antes de um vínculo automático. A comparação da revisão acontece sob o
-- mesmo bloqueio usado para aplicar o lote.
drop function if exists public.cofre_apply_ops(uuid, uuid, text, jsonb, text, integer, bigint);
create function public.cofre_apply_ops(
  p_user_id uuid,
  p_mutation_id uuid,
  p_request_hash text,
  p_ops jsonb,
  p_device_id text,
  p_protocol integer,
  p_expected_revision bigint
) returns table(status text, revision text, applied integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_server_protocol integer;
  v_minimum_protocol integer;
  v_revision bigint;
  v_prior public.cofre_mutations%rowtype;
  v_op jsonb;
  v_record jsonb;
  v_row record;
  v_applied integer := 0;
  v_existing text;
  v_entity text;
  v_entity_id text;
  v_operation text;
  v_rev text;
  v_list_entity text;
  v_setting text;
  v_ids text[];
  v_touched jsonb := '{}'::jsonb;
  v_canonical jsonb;
  v_canonical_rev text;
  v_current_setting record;
begin
  if p_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(p_ops) <> 'array' then raise exception 'invalid ops' using errcode = '22023'; end if;
  if jsonb_array_length(p_ops) > 500 then raise exception 'batch too large' using errcode = '22023'; end if;

  select c.server_protocol, c.minimum_write_protocol
    into v_server_protocol, v_minimum_protocol
    from public.cofre_sync_config c where c.id = 1;
  if not found then raise exception 'sync config missing' using errcode = '55000'; end if;
  if p_protocol < v_minimum_protocol or p_protocol > v_server_protocol then
    return query select 'protocol_upgrade_required'::text, '0'::text, 0;
    return;
  end if;

  if not exists (
    select 1 from public.cofre_devices
    where user_id = p_user_id and device_id = p_device_id and revoked_at is null
  ) then
    return query select 'device_revoked'::text, '0'::text, 0;
    return;
  end if;

  select * into v_prior from public.cofre_mutations
    where user_id = p_user_id and mutation_id = p_mutation_id;
  if found then
    if v_prior.request_hash = p_request_hash then
      return query select 'replayed'::text, v_prior.result_revision::text, 0;
    else
      return query select 'idempotency_mismatch'::text, v_prior.result_revision::text, 0;
    end if;
    return;
  end if;

  insert into public.cofre_sync_state(user_id, revision) values (p_user_id, 0)
    on conflict (user_id) do nothing;
  select s.revision into v_revision from public.cofre_sync_state s
    where s.user_id = p_user_id for update;

  if p_expected_revision is not null and p_expected_revision <> v_revision then
    return query select 'remote_changed'::text, v_revision::text, 0;
    return;
  end if;

  for v_op in select * from jsonb_array_elements(p_ops) loop
    v_entity := v_op->>'entity';
    v_entity_id := v_op->>'entityId';
    v_operation := v_op->>'op';
    v_rev := v_op->>'rev';

    if v_operation not in ('put', 'delete')
      or v_entity_id is null or char_length(v_entity_id) not between 1 and 80
      or v_rev !~ '^[0-9]{15}\.[0-9]{6}\.[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$' then
      raise exception 'invalid op' using errcode = '22023';
    end if;
    if p_protocol = 2 and v_entity not in ('transactions', 'categories', 'goals', 'assets', 'settings') then
      raise exception 'entity requires protocol 3' using errcode = '22023';
    end if;
    if p_protocol >= 3 and v_entity not in (
      'transactions', 'categories', 'goals', 'assets', 'settings',
      'accounts', 'creditCards', 'accountTransfers', 'cardPayments', 'accountAdjustments'
    ) then
      raise exception 'invalid entity' using errcode = '22023';
    end if;
    if v_entity = 'settings' and v_operation = 'delete' then
      raise exception 'settings cannot be deleted' using errcode = '22023';
    end if;
    if p_protocol >= 3 and v_entity = 'settings'
      and v_entity_id in ('accounts', 'creditCards', 'accountTransfers', 'cardPayments', 'accountAdjustments') then
      raise exception 'list setting requires record entity' using errcode = '22023';
    end if;
    if v_operation = 'put' and not (v_op ? 'payload') then
      raise exception 'missing payload' using errcode = '22023';
    end if;

    v_list_entity := case
      when v_entity = 'settings' and v_entity_id = 'accounts' then 'accounts'
      when v_entity = 'settings' and v_entity_id = 'creditCards' then 'creditCards'
      when v_entity = 'settings' and v_entity_id = 'accountTransfers' then 'accountTransfers'
      when v_entity = 'settings' and v_entity_id = 'cardPayments' then 'cardPayments'
      when v_entity = 'settings' and v_entity_id = 'accountAdjustments' then 'accountAdjustments'
      when v_entity in ('accounts', 'creditCards', 'accountTransfers', 'cardPayments', 'accountAdjustments') then v_entity
      else null
    end;

    select o.rev into v_existing from public.cofre_sync_ops o
      where o.user_id = p_user_id and o.entity = v_entity and o.entity_id = v_entity_id;
    if v_existing is not null and v_existing >= v_rev then
      continue;
    end if;

    v_revision := v_revision + 1;
    insert into public.cofre_sync_ops(user_id, seq, entity, entity_id, op, rev, payload, device_id, mutation_id)
    values (
      p_user_id, v_revision, v_entity, v_entity_id, v_operation, v_rev,
      case when v_operation = 'put' then v_op->'payload' else null end,
      p_device_id, p_mutation_id
    )
    on conflict (user_id, entity, entity_id) do update
      set seq = excluded.seq, op = excluded.op, rev = excluded.rev,
          payload = excluded.payload, device_id = excluded.device_id,
          mutation_id = excluded.mutation_id, created_at = now();
    v_applied := v_applied + 1;

    if v_list_entity is not null then
      v_touched := jsonb_set(
        v_touched,
        array[v_list_entity],
        to_jsonb(greatest(coalesce(v_touched->>v_list_entity, ''), v_rev)),
        true
      );
    end if;

    -- Um array falado pelo cliente 2 vira registros e lápides com a mesma rev.
    if v_entity = 'settings' and v_list_entity is not null then
      if jsonb_typeof(v_op->'payload') <> 'array' then
        raise exception 'invalid list setting' using errcode = '22023';
      end if;
      v_ids := array[]::text[];
      for v_record in select * from jsonb_array_elements(v_op->'payload') loop
        if jsonb_typeof(v_record) <> 'object'
          or coalesce(v_record->>'id', '') !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$' then
          raise exception 'invalid list record' using errcode = '22023';
        end if;
        if (v_record->>'id') = any(v_ids) then
          raise exception 'duplicate list record' using errcode = '22023';
        end if;
        v_ids := array_append(v_ids, v_record->>'id');

        select o.rev into v_existing from public.cofre_sync_ops o
          where o.user_id = p_user_id and o.entity = v_list_entity and o.entity_id = (v_record->>'id');
        if v_existing is not null and v_existing >= v_rev then continue; end if;

        v_revision := v_revision + 1;
        insert into public.cofre_sync_ops(user_id, seq, entity, entity_id, op, rev, payload, device_id, mutation_id)
        values (p_user_id, v_revision, v_list_entity, v_record->>'id', 'put', v_rev, v_record, p_device_id, p_mutation_id)
        on conflict (user_id, entity, entity_id) do update
          set seq = excluded.seq, op = 'put', rev = excluded.rev, payload = excluded.payload,
              device_id = excluded.device_id, mutation_id = excluded.mutation_id, created_at = now();
      end loop;

      for v_row in
        select o.entity_id, o.rev from public.cofre_sync_ops o
        where o.user_id = p_user_id and o.entity = v_list_entity
          and not (o.entity_id = any(v_ids)) and o.rev < v_rev
      loop
        v_revision := v_revision + 1;
        insert into public.cofre_sync_ops(user_id, seq, entity, entity_id, op, rev, payload, device_id, mutation_id)
        values (p_user_id, v_revision, v_list_entity, v_row.entity_id, 'delete', v_rev, null, p_device_id, p_mutation_id)
        on conflict (user_id, entity, entity_id) do update
          set seq = excluded.seq, op = 'delete', rev = excluded.rev, payload = null,
              device_id = excluded.device_id, mutation_id = excluded.mutation_id, created_at = now();
      end loop;
    end if;
  end loop;

  -- Toda mudança por registro reconstrói o array lido pelo cliente 2. O array
  -- usa a maior rev dos registros, mas recebe seq nova sempre que o conteúdo
  -- muda, inclusive quando um registro com rev menor é acrescentado.
  for v_row in select key as entity, value #>> '{}' as touched_rev from jsonb_each(v_touched) loop
    v_setting := case v_row.entity
      when 'accounts' then 'accounts'
      when 'creditCards' then 'creditCards'
      when 'accountTransfers' then 'accountTransfers'
      when 'cardPayments' then 'cardPayments'
      when 'accountAdjustments' then 'accountAdjustments'
      else null
    end;
    if v_setting is null then continue; end if;

    select
      coalesce(jsonb_agg(o.payload order by o.entity_id) filter (where o.op = 'put'), '[]'::jsonb),
      greatest(coalesce(max(o.rev), ''), v_row.touched_rev)
      into v_canonical, v_canonical_rev
      from public.cofre_sync_ops o
      where o.user_id = p_user_id and o.entity = v_row.entity;

    select o.rev, o.payload into v_current_setting from public.cofre_sync_ops o
      where o.user_id = p_user_id and o.entity = 'settings' and o.entity_id = v_setting;
    if found and v_current_setting.rev = v_canonical_rev and v_current_setting.payload = v_canonical then
      continue;
    end if;

    v_revision := v_revision + 1;
    insert into public.cofre_sync_ops(user_id, seq, entity, entity_id, op, rev, payload, device_id, mutation_id)
    values (p_user_id, v_revision, 'settings', v_setting, 'put', v_canonical_rev, v_canonical, p_device_id, p_mutation_id)
    on conflict (user_id, entity, entity_id) do update
      set seq = excluded.seq, op = 'put', rev = excluded.rev, payload = excluded.payload,
          device_id = excluded.device_id, mutation_id = excluded.mutation_id, created_at = now();
  end loop;

  update public.cofre_sync_state set revision = v_revision, updated_at = now()
    where user_id = p_user_id;
  insert into public.cofre_mutations(user_id, mutation_id, request_hash, result_revision)
    values (p_user_id, p_mutation_id, p_request_hash, v_revision);
  delete from public.cofre_mutations
    where user_id = p_user_id and created_at < now() - interval '30 days';
  delete from public.cofre_sync_ops
    where user_id = p_user_id and op = 'delete' and created_at < now() - interval '24 months';

  return query select 'applied'::text, v_revision::text, v_applied;
end;
$$;

revoke all on function public.cofre_apply_ops(uuid, uuid, text, jsonb, text, integer, bigint) from public, anon, authenticated;
grant execute on function public.cofre_apply_ops(uuid, uuid, text, jsonb, text, integer, bigint) to service_role;

-- A função de cinco parâmetros continua sendo a entrada do backend 2. Quando
-- o mínimo mudar para 3, este adaptador também passa a recusar a escrita.
create or replace function public.cofre_apply_ops(
  p_user_id uuid,
  p_mutation_id uuid,
  p_request_hash text,
  p_ops jsonb,
  p_device_id text
) returns table(status text, revision text, applied integer)
language sql
security definer
set search_path = public, pg_temp
as $$
  select * from public.cofre_apply_ops(
    p_user_id, p_mutation_id, p_request_hash, p_ops, p_device_id, 2, null
  );
$$;

revoke all on function public.cofre_apply_ops(uuid, uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.cofre_apply_ops(uuid, uuid, text, jsonb, text) to service_role;

-- O reset também carrega a versão, para que uma função antiga não atravesse
-- o corte posterior do protocolo 3.
drop function if exists public.cofre_reset_data(uuid, uuid, text, text, text, integer);
create function public.cofre_reset_data(
  p_user_id uuid,
  p_mutation_id uuid,
  p_request_hash text,
  p_device_id text,
  p_rev_prefix text,
  p_protocol integer
) returns table(status text, revision text, applied integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_server_protocol integer;
  v_minimum_protocol integer;
  v_revision bigint;
  v_applied integer := 0;
  v_row record;
  v_prior public.cofre_mutations%rowtype;
begin
  if p_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_rev_prefix !~ '^[0-9]{15}\.[0-9]{6}\.[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$' then
    raise exception 'invalid rev' using errcode = '22023';
  end if;
  select c.server_protocol, c.minimum_write_protocol
    into v_server_protocol, v_minimum_protocol
    from public.cofre_sync_config c where c.id = 1;
  if not found then raise exception 'sync config missing' using errcode = '55000'; end if;
  if p_protocol < v_minimum_protocol or p_protocol > v_server_protocol then
    return query select 'protocol_upgrade_required'::text, '0'::text, 0;
    return;
  end if;
  if not exists (
    select 1 from public.cofre_devices
    where user_id = p_user_id and device_id = p_device_id and revoked_at is null
  ) then
    return query select 'device_revoked'::text, '0'::text, 0;
    return;
  end if;

  select * into v_prior from public.cofre_mutations
    where user_id = p_user_id and mutation_id = p_mutation_id;
  if found then
    if v_prior.request_hash = p_request_hash then
      return query select 'replayed'::text, v_prior.result_revision::text, 0;
    else
      return query select 'idempotency_mismatch'::text, v_prior.result_revision::text, 0;
    end if;
    return;
  end if;

  insert into public.cofre_sync_state(user_id, revision) values (p_user_id, 0)
    on conflict (user_id) do nothing;
  select s.revision into v_revision from public.cofre_sync_state s
    where s.user_id = p_user_id for update;

  for v_row in
    select entity, entity_id from public.cofre_sync_ops
    where user_id = p_user_id and op = 'put'
  loop
    v_revision := v_revision + 1;
    insert into public.cofre_sync_ops(user_id, seq, entity, entity_id, op, rev, payload, device_id, mutation_id)
    values (p_user_id, v_revision, v_row.entity, v_row.entity_id, 'delete', p_rev_prefix, null, p_device_id, p_mutation_id)
    on conflict (user_id, entity, entity_id) do update
      set seq = excluded.seq, op = 'delete', rev = excluded.rev, payload = null,
          device_id = excluded.device_id, mutation_id = excluded.mutation_id, created_at = now();
    v_applied := v_applied + 1;
  end loop;

  update public.cofre_sync_state set revision = v_revision, updated_at = now()
    where user_id = p_user_id;
  insert into public.cofre_mutations(user_id, mutation_id, request_hash, result_revision)
    values (p_user_id, p_mutation_id, p_request_hash, v_revision);
  return query select 'applied'::text, v_revision::text, v_applied;
end;
$$;

revoke all on function public.cofre_reset_data(uuid, uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.cofre_reset_data(uuid, uuid, text, text, text, integer) to service_role;

create or replace function public.cofre_reset_data(
  p_user_id uuid,
  p_mutation_id uuid,
  p_request_hash text,
  p_device_id text,
  p_rev_prefix text
) returns table(status text, revision text, applied integer)
language sql
security definer
set search_path = public, pg_temp
as $$
  select * from public.cofre_reset_data(
    p_user_id, p_mutation_id, p_request_hash, p_device_id, p_rev_prefix, 2
  );
$$;

revoke all on function public.cofre_reset_data(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.cofre_reset_data(uuid, uuid, text, text, text) to service_role;

-- Converte somente snapshots cujo usuário nunca teve estado no log atual.
-- A ordem, as marcas e a mutação são derivadas do snapshot, então a conversão
-- é repetível. O snapshot original não é alterado.
do $$
declare
  v_snapshot record;
  v_candidate record;
  v_ops jsonb;
  v_count integer;
  v_base_millis bigint;
  v_rev text;
  v_mutation uuid;
  v_defaults jsonb := jsonb_build_object(
    'monthlyIncome', 0,
    'creditCardLimit', 0,
    'budgetSplit', jsonb_build_object('necessidade', 50, 'desejo', 30, 'futuro', 20),
    'budgetAlerts', jsonb_build_object('warn', 80, 'over', 100),
    'budgetHistory', '{}'::jsonb,
    'userName', '',
    'emergencyGoalId', 'null'::jsonb,
    'emergencyMonths', 6,
    'marketRates', jsonb_build_object('selic', 15, 'cdi', 14.9, 'ipca', 4.5, 'tr', 0.2, 'updatedAt', null),
    'achievements', jsonb_build_object('enabled', false, 'initialized', false, 'unlocked', '{}'::jsonb),
    'recurringPrefs', jsonb_build_object('ignored', '{}'::jsonb, 'dismissed', '{}'::jsonb, 'confirmed', '{}'::jsonb),
    'debtPlan', jsonb_build_object('strategy', 'avalanche', 'extraMonthly', 0, 'updatedAt', null),
    'onboarding', jsonb_build_object('done', false, 'skipped', false, 'completedAt', null),
    'categoryRules', jsonb_build_object('custom', '[]'::jsonb, 'builtin', '{}'::jsonb)
  );
  v_default_categories jsonb := jsonb_build_object(
    'moradia', jsonb_build_object('id','moradia','name','Moradia','color','#0E6E5D','icon','home','budget',null,'parentId',null,'group','necessidade'),
    'alimentacao', jsonb_build_object('id','alimentacao','name','Alimentação','color','#3C6E8F','icon','food','budget',null,'parentId',null,'group','necessidade'),
    'mercado', jsonb_build_object('id','mercado','name','Mercado','color','#3C6E8F','icon','cart','budget',null,'parentId','alimentacao','group','necessidade'),
    'delivery', jsonb_build_object('id','delivery','name','Delivery','color','#3C6E8F','icon','coffee','budget',null,'parentId','alimentacao','group','desejo'),
    'transporte', jsonb_build_object('id','transporte','name','Transporte','color','#B5652B','icon','transport','budget',null,'parentId',null,'group','necessidade'),
    'lazer', jsonb_build_object('id','lazer','name','Lazer','color','#8A5FBF','icon','leisure','budget',null,'parentId',null,'group','desejo'),
    'saude', jsonb_build_object('id','saude','name','Saúde','color','#B5476A','icon','health','budget',null,'parentId',null,'group','necessidade'),
    'educacao', jsonb_build_object('id','educacao','name','Educação','color','#C08A2E','icon','education','budget',null,'parentId',null,'group','necessidade'),
    'assinaturas', jsonb_build_object('id','assinaturas','name','Assinaturas','color','#4E7C99','icon','subscriptions','budget',null,'parentId',null,'group','desejo'),
    'outros', jsonb_build_object('id','outros','name','Outros','color','#7C8592','icon','other','budget',null,'parentId',null,'group','desejo'),
    'investimento', jsonb_build_object('id','investimento','name','Investimentos','color','#1F8A5F','icon','trendUp','budget',null,'parentId',null,'group','futuro')
  );
begin
  for v_snapshot in
    select s.user_id, s.snapshot, s.updated_at
    from public.cofre_financial_snapshots s
    left join public.cofre_sync_state st on st.user_id = s.user_id
    where coalesce(st.revision, 0) = 0
      and not exists (select 1 from public.cofre_sync_ops o where o.user_id = s.user_id)
    order by s.user_id
  loop
    with collection_specs(entity, source_key, entity_order) as (
      values
        ('transactions', 'transactions', 1),
        ('categories', 'categories', 2),
        ('goals', 'goals', 3),
        ('assets', 'assets', 4),
        ('accounts', 'accounts', 5),
        ('creditCards', 'creditCards', 6),
        ('accountTransfers', 'accountTransfers', 7),
        ('cardPayments', 'cardPayments', 8),
        ('accountAdjustments', 'accountAdjustments', 9)
    ), record_ops as (
      select c.entity, r.value->>'id' as entity_id, 'put'::text as op,
        r.value as payload, c.entity_order
      from collection_specs c
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(v_snapshot.snapshot->c.source_key) = 'array'
          then v_snapshot.snapshot->c.source_key else '[]'::jsonb end
      ) r(value)
      where jsonb_typeof(r.value) = 'object'
        and coalesce(r.value->>'id', '') ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$'
        and (
          c.entity <> 'categories'
          or not (v_default_categories ? (r.value->>'id'))
          or (r.value - 'syncRev' - 'createdAt' - 'updatedAt') is distinct from (v_default_categories->(r.value->>'id'))
        )
    ), setting_ops as (
      select 'settings'::text as entity, d.key as entity_id, 'put'::text as op,
        v_snapshot.snapshot->d.key as payload, 10 as entity_order
      from jsonb_each(v_defaults) d
      where v_snapshot.snapshot ? d.key
        and (v_snapshot.snapshot->d.key) is distinct from d.value
    ), candidates as (
      select * from record_ops
      union all
      select * from setting_ops
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object('entity', entity, 'entityId', entity_id, 'op', op, 'payload', payload)
        order by entity_order, entity, entity_id
      ),
      '[]'::jsonb
    ) into v_ops from candidates;

    v_count := jsonb_array_length(v_ops);
    if v_count = 0 then continue; end if;
    if v_count > 999999 then raise exception 'legacy snapshot has too many records'; end if;

    v_base_millis := greatest(0, floor(extract(epoch from v_snapshot.updated_at) * 1000)::bigint);
    v_mutation := md5(v_snapshot.user_id::text || ':legacy-snapshot-v3')::uuid;

    for v_candidate in
      select value as op, ordinality::bigint as ordinal
      from jsonb_array_elements(v_ops) with ordinality
      order by ordinality
    loop
      v_rev := lpad(v_base_millis::text, 15, '0') || '.'
        || lpad(v_candidate.ordinal::text, 6, '0') || '.legacy';
      insert into public.cofre_sync_ops(
        user_id, seq, entity, entity_id, op, rev, payload, device_id, mutation_id, created_at
      ) values (
        v_snapshot.user_id, v_candidate.ordinal,
        v_candidate.op->>'entity', v_candidate.op->>'entityId', 'put', v_rev,
        v_candidate.op->'payload', 'legacy-snapshot', v_mutation, v_snapshot.updated_at
      );
    end loop;

    insert into public.cofre_sync_state(user_id, revision, updated_at)
    values (v_snapshot.user_id, v_count, v_snapshot.updated_at)
    on conflict (user_id) do update
      set revision = excluded.revision, updated_at = excluded.updated_at
      where public.cofre_sync_state.revision = 0;

    insert into public.cofre_mutations(user_id, mutation_id, request_hash, result_revision, created_at)
    values (
      v_snapshot.user_id, v_mutation,
      encode(digest(v_snapshot.snapshot::text, 'sha256'), 'hex'),
      v_count, v_snapshot.updated_at
    ) on conflict (user_id, mutation_id) do nothing;
  end loop;
end;
$$;
