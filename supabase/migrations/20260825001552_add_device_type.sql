alter table public.cofre_devices
  add column device_type text not null default 'unknown';

-- A lista fechada evita que um cabeçalho livre vire dado permanente. Consultar
-- o catálogo torna a criação segura caso a restrição já tenha sido preparada
-- manualmente no ambiente antes desta migração.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cofre_devices_device_type_check'
      and conrelid = 'public.cofre_devices'::regclass
  ) then
    alter table public.cofre_devices
      add constraint cofre_devices_device_type_check
      check (device_type in ('desktop', 'phone', 'tablet', 'unknown')) not valid;
  end if;
end
$$;

alter table public.cofre_devices
  validate constraint cofre_devices_device_type_check;

-- O aplicativo só precisa ler o tipo. Escrita continua exclusiva do backend
-- com service_role, como já ocorre com rótulo, segredo e revogação.
revoke select (device_type) on public.cofre_devices from anon;
grant select (device_type) on public.cofre_devices to authenticated;
