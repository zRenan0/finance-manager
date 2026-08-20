-- Sincronização v2: log de operações no lugar do snapshot inteiro.
--
-- POR QUE TROCAR
--
-- O modelo anterior guardava UM json com a base inteira do usuário e o
-- reescrevia a cada ciclo. Isso trazia quatro defeitos de uma vez:
--
--   1. Teto rígido. O commit rejeitava acima de 6 MiB. Uma base grande parava
--      de sincronizar sem aviso e sem caminho de volta.
--   2. Custo por ciclo. Cada alteração de um campo subia e descia a base toda.
--   3. Exclusão frágil. Apagar um registro era "mandar um json sem ele"; quem
--      estivesse com uma cópia antiga o reenviava e ele ressuscitava.
--   4. Conflito de tudo contra tudo. Dois aparelhos gravando campos diferentes
--      disputavam o documento inteiro, e o 409 virava rotina.
--
-- COMO FUNCIONA AGORA
--
-- Cada alteração é uma LINHA: (entidade, id, operação, marca lógica, dado).
-- A tabela é ao mesmo tempo o log e o estado, porque uma operação nova
-- SUBSTITUI a anterior do mesmo (entidade, id). O resultado:
--
--   * ler o estado inteiro  = ler todas as linhas (paginado);
--   * ler o que mudou       = ler as linhas com seq maior que o cursor;
--   * exclusão              = linha com op='delete', que persiste e propaga;
--   * tamanho               = proporcional aos DADOS, não ao número de edições.
--
-- A ordem entre aparelhos é decidida por `rev` (relógio lógico híbrido gerado
-- no cliente), nunca por `created_at`: relógio de celular erra, e um aparelho
-- adiantado não pode ganhar todas as disputas.

create extension if not exists pgcrypto;

-- Revisão corrente por usuário. É o cursor que o cliente guarda.
create table if not exists public.cofre_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.cofre_sync_ops (
  user_id uuid not null references auth.users(id) on delete cascade,
  seq bigint not null,
  entity text not null check (entity in ('transactions','categories','goals','assets','settings')),
  entity_id text not null check (char_length(entity_id) between 1 and 80),
  op text not null check (op in ('put','delete')),
  -- Marca do relógio lógico: "<15 dígitos>.<6 dígitos>.<aparelho>". A largura
  -- fixa faz a comparação de texto ser a comparação correta de ordem.
  rev text not null check (rev ~ '^[0-9]{15}\.[0-9]{6}\.[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$'),
  payload jsonb,
  device_id text not null,
  mutation_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, seq)
);

-- Uma linha viva por (entidade, id): é isto que mantém a tabela do tamanho dos
-- dados em vez do tamanho do histórico de edições.
create unique index if not exists cofre_sync_ops_entity_key
  on public.cofre_sync_ops (user_id, entity, entity_id);
create index if not exists cofre_sync_ops_cursor
  on public.cofre_sync_ops (user_id, seq);

-- Versões restauráveis. Um ponto no tempo que o usuário pode voltar depois de
-- uma importação ruim ou de um "apagar tudo" feito por engano.
create table if not exists public.cofre_sync_checkpoints (
  user_id uuid not null references auth.users(id) on delete cascade,
  checkpoint_id uuid not null default gen_random_uuid(),
  revision bigint not null,
  label text not null check (char_length(label) between 1 and 60),
  entity_count integer not null default 0,
  byte_size integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, checkpoint_id)
);
create index if not exists cofre_sync_checkpoints_recent
  on public.cofre_sync_checkpoints (user_id, created_at desc);

-- Conteúdo do checkpoint em pedaços, para nunca depender de um json gigante.
create table if not exists public.cofre_sync_checkpoint_rows (
  user_id uuid not null references auth.users(id) on delete cascade,
  checkpoint_id uuid not null,
  entity text not null,
  entity_id text not null,
  op text not null,
  rev text not null,
  payload jsonb,
  primary key (user_id, checkpoint_id, entity, entity_id)
);

alter table public.cofre_sync_state enable row level security;
alter table public.cofre_sync_ops enable row level security;
alter table public.cofre_sync_checkpoints enable row level security;
alter table public.cofre_sync_checkpoint_rows enable row level security;

-- RLS de verdade: o dono lê o que é dele e NADA escreve pela API pública.
-- Toda escrita passa pelas funções `security definer` abaixo, que validam
-- idempotência, revisão e aparelho revogado.
drop policy if exists "owner reads sync state" on public.cofre_sync_state;
create policy "owner reads sync state" on public.cofre_sync_state
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "owner reads sync ops" on public.cofre_sync_ops;
create policy "owner reads sync ops" on public.cofre_sync_ops
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "owner reads checkpoints" on public.cofre_sync_checkpoints;
create policy "owner reads checkpoints" on public.cofre_sync_checkpoints
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "owner reads checkpoint rows" on public.cofre_sync_checkpoint_rows;
create policy "owner reads checkpoint rows" on public.cofre_sync_checkpoint_rows
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.cofre_sync_state, public.cofre_sync_ops,
  public.cofre_sync_checkpoints, public.cofre_sync_checkpoint_rows from anon;
revoke all on public.cofre_sync_state, public.cofre_sync_ops,
  public.cofre_sync_checkpoints, public.cofre_sync_checkpoint_rows from authenticated;
grant select on public.cofre_sync_state, public.cofre_sync_ops,
  public.cofre_sync_checkpoints, public.cofre_sync_checkpoint_rows to authenticated;

-- ---------------------------------------------------------------------------
-- Aplicação de um lote de operações
-- ---------------------------------------------------------------------------
-- Recebe um array json de operações. Devolve a revisão nova. Regras:
--
--   * operação com marca MENOR OU IGUAL à que já está gravada é ignorada (o
--     servidor guarda o vencedor, não o último que chegou);
--   * `mutation_id` repetido devolve a revisão original, sem gravar de novo;
--   * aparelho revogado não grava.
drop function if exists public.cofre_apply_ops(uuid, uuid, text, jsonb, text);
create function public.cofre_apply_ops(
  p_user_id uuid,
  p_mutation_id uuid,
  p_request_hash text,
  p_ops jsonb,
  p_device_id text
) returns table(status text, revision text, applied integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_revision bigint;
  v_prior public.cofre_mutations%rowtype;
  v_op jsonb;
  v_applied integer := 0;
  v_existing text;
begin
  if p_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(p_ops) <> 'array' then raise exception 'invalid ops' using errcode = '22023'; end if;
  -- Lote grande é recusado para não segurar a transação; o cliente pagina.
  if jsonb_array_length(p_ops) > 500 then raise exception 'batch too large' using errcode = '22023'; end if;

  if not exists (
    select 1 from public.cofre_devices
    where user_id = p_user_id and device_id = p_device_id and revoked_at is null
  ) then
    return query select 'device_revoked'::text, '0'::text, 0; return;
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

  for v_op in select * from jsonb_array_elements(p_ops) loop
    select o.rev into v_existing from public.cofre_sync_ops o
      where o.user_id = p_user_id
        and o.entity = (v_op->>'entity')
        and o.entity_id = (v_op->>'entityId');

    -- Comparação de texto porque a marca tem largura fixa. Igual também é
    -- ignorado: reenvio da mesma operação não pode mexer na revisão.
    if v_existing is not null and v_existing >= (v_op->>'rev') then
      continue;
    end if;

    v_revision := v_revision + 1;
    insert into public.cofre_sync_ops(user_id, seq, entity, entity_id, op, rev, payload, device_id, mutation_id)
    values (
      p_user_id, v_revision, (v_op->>'entity'), (v_op->>'entityId'), (v_op->>'op'),
      (v_op->>'rev'), v_op->'payload', p_device_id, p_mutation_id
    )
    on conflict (user_id, entity, entity_id) do update
      set seq = excluded.seq, op = excluded.op, rev = excluded.rev,
          payload = excluded.payload, device_id = excluded.device_id,
          mutation_id = excluded.mutation_id, created_at = now();
    v_applied := v_applied + 1;
  end loop;

  update public.cofre_sync_state set revision = v_revision, updated_at = now()
    where user_id = p_user_id;
  insert into public.cofre_mutations(user_id, mutation_id, request_hash, result_revision)
    values (p_user_id, p_mutation_id, p_request_hash, v_revision);
  delete from public.cofre_mutations
    where user_id = p_user_id and created_at < now() - interval '30 days';
  -- Poda de lápides antigas: depois de 24 meses nenhum aparelho ainda precisa
  -- da prova de exclusão, e mantê-las faria a tabela crescer para sempre.
  delete from public.cofre_sync_ops
    where user_id = p_user_id and op = 'delete' and created_at < now() - interval '24 months';

  return query select 'applied'::text, v_revision::text, v_applied;
end;
$$;

revoke all on function public.cofre_apply_ops(uuid, uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.cofre_apply_ops(uuid, uuid, text, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- "Apagar tudo" que PROPAGA
-- ---------------------------------------------------------------------------
-- Truncar as linhas apagaria só aqui: o próximo aparelho a sincronizar
-- reenviaria a base inteira de volta. Então a exclusão vira lápide para cada
-- registro vivo, e é ela que viaja.
drop function if exists public.cofre_reset_data(uuid, uuid, text, text, text);
create function public.cofre_reset_data(
  p_user_id uuid,
  p_mutation_id uuid,
  p_request_hash text,
  p_device_id text,
  p_rev_prefix text
) returns table(status text, revision text, applied integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_revision bigint;
  v_applied integer := 0;
  v_row record;
  v_prior public.cofre_mutations%rowtype;
begin
  if p_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_rev_prefix !~ '^[0-9]{15}\.[0-9]{6}\.[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$' then
    raise exception 'invalid rev' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.cofre_devices
    where user_id = p_user_id and device_id = p_device_id and revoked_at is null
  ) then
    return query select 'device_revoked'::text, '0'::text, 0; return;
  end if;

  select * into v_prior from public.cofre_mutations
    where user_id = p_user_id and mutation_id = p_mutation_id;
  if found then
    return query select 'replayed'::text, v_prior.result_revision::text, 0; return;
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

  update public.cofre_sync_state set revision = v_revision, updated_at = now() where user_id = p_user_id;
  insert into public.cofre_mutations(user_id, mutation_id, request_hash, result_revision)
    values (p_user_id, p_mutation_id, p_request_hash, v_revision);
  return query select 'applied'::text, v_revision::text, v_applied;
end;
$$;

revoke all on function public.cofre_reset_data(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.cofre_reset_data(uuid, uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Exclusão definitiva da conta
-- ---------------------------------------------------------------------------
-- Diferente do "apagar tudo": aqui não sobra lápide, porque não sobra conta.
-- Os aparelhos são revogados no mesmo ato, então nenhum deles consegue gravar
-- de volta depois.
drop function if exists public.cofre_purge_account(uuid);
create function public.cofre_purge_account(p_user_id uuid)
returns table(status text, removed_ops integer, removed_devices integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ops integer := 0;
  v_devices integer := 0;
begin
  if p_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  delete from public.cofre_sync_checkpoint_rows where user_id = p_user_id;
  delete from public.cofre_sync_checkpoints where user_id = p_user_id;
  with removed as (delete from public.cofre_sync_ops where user_id = p_user_id returning 1)
    select count(*) into v_ops from removed;
  delete from public.cofre_sync_state where user_id = p_user_id;
  delete from public.cofre_financial_snapshots where user_id = p_user_id;
  delete from public.cofre_mutations where user_id = p_user_id;
  with revoked as (
    update public.cofre_devices set revoked_at = now()
    where user_id = p_user_id and revoked_at is null returning 1
  ) select count(*) into v_devices from revoked;
  return query select 'purged'::text, v_ops, v_devices;
end;
$$;

revoke all on function public.cofre_purge_account(uuid) from public, anon, authenticated;
grant execute on function public.cofre_purge_account(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Checkpoint (versão restaurável)
-- ---------------------------------------------------------------------------
drop function if exists public.cofre_create_checkpoint(uuid, text, integer);
create function public.cofre_create_checkpoint(p_user_id uuid, p_label text, p_keep integer)
returns table(checkpoint_id uuid, revision text, entity_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := gen_random_uuid();
  v_revision bigint := 0;
  v_count integer := 0;
  v_bytes integer := 0;
begin
  if p_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select coalesce(s.revision, 0) into v_revision from public.cofre_sync_state s where s.user_id = p_user_id;

  insert into public.cofre_sync_checkpoint_rows(user_id, checkpoint_id, entity, entity_id, op, rev, payload)
  select user_id, v_id, entity, entity_id, op, rev, payload
  from public.cofre_sync_ops where user_id = p_user_id and op = 'put';
  get diagnostics v_count = row_count;

  select coalesce(sum(octet_length(coalesce(payload::text, ''))), 0)::integer into v_bytes
    from public.cofre_sync_checkpoint_rows where user_id = p_user_id and checkpoint_id = v_id;

  insert into public.cofre_sync_checkpoints(user_id, checkpoint_id, revision, label, entity_count, byte_size)
  values (p_user_id, v_id, v_revision, coalesce(nullif(trim(p_label), ''), 'Automático'), v_count, v_bytes);

  -- Mantém apenas os N mais recentes: histórico recuperável não pode virar
  -- crescimento sem teto.
  delete from public.cofre_sync_checkpoint_rows r
   where r.user_id = p_user_id
     and r.checkpoint_id in (
       select c.checkpoint_id from public.cofre_sync_checkpoints c
       where c.user_id = p_user_id
       order by c.created_at desc offset greatest(coalesce(p_keep, 5), 1)
     );
  delete from public.cofre_sync_checkpoints c
   where c.user_id = p_user_id
     and c.checkpoint_id not in (
       select c2.checkpoint_id from public.cofre_sync_checkpoints c2
       where c2.user_id = p_user_id
       order by c2.created_at desc limit greatest(coalesce(p_keep, 5), 1)
     );

  return query select v_id, v_revision::text, v_count;
end;
$$;

revoke all on function public.cofre_create_checkpoint(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.cofre_create_checkpoint(uuid, text, integer) to service_role;
