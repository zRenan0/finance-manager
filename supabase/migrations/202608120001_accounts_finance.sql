create extension if not exists pgcrypto;

create table if not exists public.cofre_financial_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.cofre_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null check (device_id ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{7,79}$'),
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  label text not null check (char_length(label) between 1 and 50),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, device_id)
);

create table if not exists public.cofre_mutations (
  user_id uuid not null references auth.users(id) on delete cascade,
  mutation_id uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  result_revision bigint not null,
  created_at timestamptz not null default now(),
  primary key (user_id, mutation_id)
);

alter table public.cofre_financial_snapshots enable row level security;
alter table public.cofre_devices enable row level security;
alter table public.cofre_mutations enable row level security;

drop policy if exists "owner reads snapshot" on public.cofre_financial_snapshots;
create policy "owner reads snapshot" on public.cofre_financial_snapshots for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "owner reads devices" on public.cofre_devices;
create policy "owner reads devices" on public.cofre_devices for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "owner inserts devices" on public.cofre_devices;
drop policy if exists "owner updates devices" on public.cofre_devices;
revoke all on public.cofre_financial_snapshots, public.cofre_devices, public.cofre_mutations from anon;
grant select on public.cofre_financial_snapshots to authenticated;
revoke all on public.cofre_devices from authenticated;
grant select (user_id, device_id, label, first_seen_at, last_seen_at, revoked_at) on public.cofre_devices to authenticated;

drop function if exists public.cofre_commit_snapshot(bigint, uuid, text, jsonb, text);
drop function if exists public.cofre_commit_snapshot(uuid, bigint, uuid, text, jsonb, text);
create function public.cofre_commit_snapshot(
  p_user_id uuid,
  p_base_revision bigint,
  p_mutation_id uuid,
  p_request_hash text,
  p_snapshot jsonb,
  p_device_id text
) returns table(status text, revision text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := p_user_id;
  v_revision bigint;
  v_prior public.cofre_mutations%rowtype;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(p_snapshot) <> 'object' or octet_length(p_snapshot::text) > 6291456 then
    raise exception 'invalid snapshot' using errcode = '22023';
  end if;
  if not exists (select 1 from public.cofre_devices where user_id = v_user and device_id = p_device_id and revoked_at is null) then
    return query select 'device_revoked'::text, '0'::text; return;
  end if;
  select * into v_prior from public.cofre_mutations where user_id = v_user and mutation_id = p_mutation_id;
  if found then
    if v_prior.request_hash = p_request_hash then return query select 'replayed'::text, v_prior.result_revision::text;
    else return query select 'idempotency_mismatch'::text, v_prior.result_revision::text; end if;
    return;
  end if;
  insert into public.cofre_financial_snapshots(user_id, revision, snapshot) values (v_user, 0, '{"version":22,"transactions":[],"categories":[],"goals":[],"assets":[]}'::jsonb)
    on conflict (user_id) do nothing;
  select s.revision into v_revision from public.cofre_financial_snapshots s where s.user_id = v_user for update;
  if v_revision <> p_base_revision then return query select 'conflict'::text, v_revision::text; return; end if;
  v_revision := v_revision + 1;
  update public.cofre_financial_snapshots set revision = v_revision, snapshot = p_snapshot, updated_at = now() where user_id = v_user;
  insert into public.cofre_mutations(user_id, mutation_id, request_hash, result_revision) values (v_user, p_mutation_id, p_request_hash, v_revision);
  delete from public.cofre_mutations where user_id = v_user and created_at < now() - interval '30 days';
  return query select 'applied'::text, v_revision::text;
end;
$$;

revoke all on function public.cofre_commit_snapshot(uuid, bigint, uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.cofre_commit_snapshot(uuid, bigint, uuid, text, jsonb, text) to service_role;
