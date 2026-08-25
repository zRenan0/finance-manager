-- A exclusão remota precisa vencer toda versão que já existe na conta.
--
-- Antes, o reset copiava a HLC do aparelho solicitante para as lápides. Se
-- outro aparelho tivesse escrito com o relógio adiantado, a lápide podia ser
-- menor que o put que ela substituiu. Esse aparelho rejeitava a exclusão e o
-- registro voltava na edição seguinte.

alter table public.cofre_mutations
  add column if not exists result_hlc text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cofre_mutations'::regclass
      and conname = 'cofre_mutations_result_hlc_check'
  ) then
    alter table public.cofre_mutations
      add constraint cofre_mutations_result_hlc_check
      check (result_hlc is null or result_hlc ~ '^[0-9]{15}\.[0-9]{6}\.[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$');
  end if;
end;
$$;

-- Produz uma HLC estritamente posterior às duas entradas. A comparação dos
-- componentes numéricos não depende da collation do banco nem do desempate por
-- id de aparelho. Incrementar o contador também garante que o resultado seja
-- maior para qualquer sufixo válido.
create or replace function public.cofre_hlc_successor(
  p_left text,
  p_right text,
  p_device text
) returns text
language plpgsql
immutable
strict
set search_path = public, pg_temp
as $$
declare
  v_left_millis bigint;
  v_right_millis bigint;
  v_left_counter integer;
  v_right_counter integer;
  v_millis bigint;
  v_counter integer;
begin
  if p_left !~ '^[0-9]{15}\.[0-9]{6}\.[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$'
    or p_right !~ '^[0-9]{15}\.[0-9]{6}\.[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$'
    or p_device !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$' then
    raise exception 'invalid hlc' using errcode = '22023';
  end if;

  v_left_millis := split_part(p_left, '.', 1)::bigint;
  v_right_millis := split_part(p_right, '.', 1)::bigint;
  v_left_counter := split_part(p_left, '.', 2)::integer;
  v_right_counter := split_part(p_right, '.', 2)::integer;
  v_millis := greatest(v_left_millis, v_right_millis);
  v_counter := greatest(
    case when v_left_millis = v_millis then v_left_counter else -1 end,
    case when v_right_millis = v_millis then v_right_counter else -1 end
  );

  if v_counter < 999999 then
    v_counter := v_counter + 1;
  else
    if v_millis >= 999999999999999 then
      raise exception 'hlc exhausted' using errcode = '22003';
    end if;
    v_millis := v_millis + 1;
    v_counter := 0;
  end if;

  return lpad(v_millis::text, 15, '0') || '.'
    || lpad(v_counter::text, 6, '0') || '.' || p_device;
end;
$$;

revoke all on function public.cofre_hlc_successor(text, text, text)
  from public, anon, authenticated;

-- O cliente compara HLC como texto ASCII. A collation padrão do projeto não
-- faz parte do protocolo e pode ordenar maiúsculas, minúsculas e pontuação de
-- outro modo. Toda decisão de vencedor no RPC usa por isso a collation C.
create or replace function public.cofre_apply_ops(
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

  -- Duas entregas simultâneas do mesmo mutation_id podem passar juntas pela
  -- consulta rápida acima. Depois do lock, a segunda precisa enxergar o commit
  -- da primeira e responder replay, não bater na chave única ao final.
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
    if v_existing is not null and (v_existing collate "C") >= (v_rev collate "C") then
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
        to_jsonb(greatest(
          (coalesce(v_touched->>v_list_entity, '') collate "C"),
          (v_rev collate "C")
        )),
        true
      );
    end if;

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
        if v_existing is not null and (v_existing collate "C") >= (v_rev collate "C") then continue; end if;

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
          and not (o.entity_id = any(v_ids))
          and (o.rev collate "C") < (v_rev collate "C")
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
      greatest(
        (coalesce(max(o.rev collate "C"), '') collate "C"),
        (v_row.touched_rev collate "C")
      )
      into v_canonical, v_canonical_rev
      from public.cofre_sync_ops o
      where o.user_id = p_user_id and o.entity = v_row.entity;

    select o.rev, o.payload into v_current_setting from public.cofre_sync_ops o
      where o.user_id = p_user_id and o.entity = 'settings' and o.entity_id = v_setting;
    if found and (v_current_setting.rev collate "C") = (v_canonical_rev collate "C")
      and v_current_setting.payload = v_canonical then
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

revoke all on function public.cofre_apply_ops(uuid, uuid, text, jsonb, text, integer, bigint)
  from public, anon, authenticated;
grant execute on function public.cofre_apply_ops(uuid, uuid, text, jsonb, text, integer, bigint)
  to service_role;

-- A função de cinco parâmetros depende da de seis. As duas são recriadas na
-- mesma migração, dentro da mesma transação, para não abrir uma janela sem RPC.
drop function if exists public.cofre_reset_data(uuid, uuid, text, text, text);
drop function if exists public.cofre_reset_data(uuid, uuid, text, text, text, integer);

create function public.cofre_reset_data(
  p_user_id uuid,
  p_mutation_id uuid,
  p_request_hash text,
  p_device_id text,
  p_rev_prefix text,
  p_protocol integer
) returns table(status text, revision text, applied integer, reset_rev text)
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
  v_max_rev text;
  v_reset_rev text;
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
    return query select 'protocol_upgrade_required'::text, '0'::text, 0, null::text;
    return;
  end if;
  if not exists (
    select 1 from public.cofre_devices
    where user_id = p_user_id and device_id = p_device_id and revoked_at is null
  ) then
    return query select 'device_revoked'::text, '0'::text, 0, null::text;
    return;
  end if;

  select * into v_prior from public.cofre_mutations
    where user_id = p_user_id and mutation_id = p_mutation_id;
  if found then
    if v_prior.request_hash = p_request_hash then
      return query select 'replayed'::text, v_prior.result_revision::text, 0,
        coalesce(v_prior.result_hlc, p_rev_prefix);
    else
      return query select 'idempotency_mismatch'::text, v_prior.result_revision::text, 0,
        v_prior.result_hlc;
    end if;
    return;
  end if;

  insert into public.cofre_sync_state(user_id, revision) values (p_user_id, 0)
    on conflict (user_id) do nothing;
  select s.revision into v_revision from public.cofre_sync_state s
    where s.user_id = p_user_id for update;

  -- Revalida sob o mesmo lock usado pelo reset. Sem esta segunda consulta,
  -- duas cópias simultâneas do pedido poderiam terminar em unique_violation.
  select * into v_prior from public.cofre_mutations
    where user_id = p_user_id and mutation_id = p_mutation_id;
  if found then
    if v_prior.request_hash = p_request_hash then
      return query select 'replayed'::text, v_prior.result_revision::text, 0,
        coalesce(v_prior.result_hlc, p_rev_prefix);
    else
      return query select 'idempotency_mismatch'::text, v_prior.result_revision::text, 0,
        v_prior.result_hlc;
    end if;
    return;
  end if;

  -- O lock do estado serializa este cálculo com cofre_apply_ops. Consideramos
  -- puts e lápides antigas: depois do purge local, a próxima criação também
  -- precisa vencer qualquer marca que o servidor já conhecia.
  select o.rev into v_max_rev
    from public.cofre_sync_ops o
    where o.user_id = p_user_id
    order by split_part(o.rev, '.', 1)::bigint desc,
      split_part(o.rev, '.', 2)::integer desc,
      o.rev collate "C" desc
    limit 1;
  v_reset_rev := public.cofre_hlc_successor(
    p_rev_prefix,
    coalesce(v_max_rev, p_rev_prefix),
    'server_reset:' || replace(p_mutation_id::text, '-', '')
  );

  for v_row in
    select entity, entity_id from public.cofre_sync_ops
    where user_id = p_user_id and op = 'put'
    order by entity, entity_id
  loop
    v_revision := v_revision + 1;
    insert into public.cofre_sync_ops(user_id, seq, entity, entity_id, op, rev, payload, device_id, mutation_id)
    values (p_user_id, v_revision, v_row.entity, v_row.entity_id, 'delete', v_reset_rev, null, p_device_id, p_mutation_id)
    on conflict (user_id, entity, entity_id) do update
      set seq = excluded.seq, op = 'delete', rev = excluded.rev, payload = null,
          device_id = excluded.device_id, mutation_id = excluded.mutation_id, created_at = now();
    v_applied := v_applied + 1;
  end loop;

  update public.cofre_sync_state set revision = v_revision, updated_at = now()
    where user_id = p_user_id;
  insert into public.cofre_mutations(user_id, mutation_id, request_hash, result_revision, result_hlc)
    values (p_user_id, p_mutation_id, p_request_hash, v_revision, v_reset_rev);
  return query select 'applied'::text, v_revision::text, v_applied, v_reset_rev;
end;
$$;

revoke all on function public.cofre_reset_data(uuid, uuid, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.cofre_reset_data(uuid, uuid, text, text, text, integer)
  to service_role;

-- Compatibilidade de leitura/escrita do cliente 2 durante a janela de corte.
create function public.cofre_reset_data(
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
  select r.status, r.revision, r.applied
  from public.cofre_reset_data(
    p_user_id, p_mutation_id, p_request_hash, p_device_id, p_rev_prefix, 2
  ) r;
$$;

revoke all on function public.cofre_reset_data(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.cofre_reset_data(uuid, uuid, text, text, text)
  to service_role;
