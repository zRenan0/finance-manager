-- Fronteira de autorização do M16 no PostgreSQL real.
--
-- SOMENTE LEITURA. Não cria, não altera e não apaga nada.
-- Execute em desenvolvimento ou staging depois de aplicar todas as migrations.
-- O resultado esperado nos três blocos é zero linhas.

-- 1. RPC SECURITY DEFINER acessível sem a credencial do servidor.
select
  n.nspname as schema,
  p.proname as funcao,
  pg_get_function_identity_arguments(p.oid) as argumentos,
  case acl.grantee when 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as papel
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
where n.nspname = 'public'
  and p.prosecdef
  and (p.proname like 'cofre\_%' or p.proname = 'rls_auto_enable')
  and acl.privilege_type = 'EXECUTE'
  and (acl.grantee = 0 or pg_get_userbyid(acl.grantee) in ('anon', 'authenticated'))
order by p.proname, papel;

-- 2. Tabela financeira sem RLS.
select n.nspname as schema, c.relname as tabela
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname like 'cofre\_%'
  and not c.relrowsecurity
order by c.relname;

-- 3. Policy que não restringe a linha ao usuário autenticado.
select
  n.nspname as schema,
  c.relname as tabela,
  p.polname as policy,
  pg_get_expr(p.polqual, p.polrelid) as usando,
  pg_get_expr(p.polwithcheck, p.polrelid) as com_verificacao
from pg_policy p
join pg_class c on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname like 'cofre\_%'
  and (
    pg_get_expr(p.polqual, p.polrelid) is null
    or pg_get_expr(p.polqual, p.polrelid) = 'true'
    or pg_get_expr(p.polwithcheck, p.polrelid) = 'true'
  )
order by c.relname, p.polname;
