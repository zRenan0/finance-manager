-- Menor privilégio para public.rls_auto_enable().
--
-- O QUE O ADVISOR ENCONTROU
--
-- O Security Advisor do Supabase aponta `public.rls_auto_enable()` como uma
-- função `security definer` com EXECUTE para `anon` e `authenticated`. Como o
-- PostgREST publica o esquema `public`, uma função nessa situação é chamável
-- pela internet em `POST /rest/v1/rpc/rls_auto_enable`, por qualquer visitante,
-- rodando com os privilégios do dono. Não importa o que ela faça: uma função
-- administrativa não deve ter superfície pública.
--
-- ELA NÃO ESTÁ NO VERSIONAMENTO
--
-- `rls_auto_enable` não aparece em nenhuma migração deste repositório, nem em
-- nenhum arquivo do projeto. Ela existe apenas no banco, criada fora do
-- versionamento. Este arquivo é, portanto, também o registro desse desvio: a
-- correção passa a estar versionada mesmo que a criação nunca tenha estado.
--
-- POR QUE O REVOKE NÃO QUEBRA O GATILHO DE EVENTO
--
-- O nome e a forma indicam uma função de EVENT TRIGGER, que liga RLS
-- automaticamente em tabela recém-criada. O PostgreSQL confere EXECUTE de uma
-- função de gatilho no momento em que o GATILHO É CRIADO, não a cada disparo.
-- O disparo é feito pelo próprio servidor, dentro do evento, e não consulta a
-- ACL da função. Tirar EXECUTE de `anon` e `authenticated` fecha a chamada por
-- RPC e deixa o automatismo intacto.
--
-- O QUE ESTA MIGRAÇÃO DELIBERADAMENTE NÃO FAZ
--
-- Não remove a função, não mexe no corpo, não mexe no dono e não mexe no
-- `search_path` dela. Alterar `search_path` sem ter a definição em mãos podia
-- quebrar o corpo, que é justamente a parte que não está versionada. Fica
-- como pendência, para depois de a definição ser capturada por
-- `supabase/tests/verify_rls_auto_enable.sql`.
--
-- É REVERSÍVEL
--
-- Para desfazer, basta devolver o privilégio:
--   grant execute on function public.rls_auto_enable() to authenticated;
-- Nada é apagado aqui.

do $$
declare
  alvo record;
  papel text;
  atingidas integer := 0;
begin
  for alvo in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rls_auto_enable'
  loop
    -- `public` primeiro: é dele que vem o EXECUTE implícito de toda função
    -- nova. Sem tirar daqui, revogar de `anon` e `authenticated` não muda o
    -- privilégio efetivo, porque eles continuam herdando por PUBLIC.
    execute format('revoke all on function %s from public', alvo.assinatura);

    -- Os papéis do PostgREST podem não existir num PostgreSQL cru (por
    -- exemplo, uma restauração local fora do Supabase). Consultar o catálogo
    -- deixa a migração aplicável nos dois ambientes.
    foreach papel in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = papel) then
        execute format('revoke all on function %s from %I', alvo.assinatura, papel);
      end if;
    end loop;

    atingidas := atingidas + 1;
    raise notice 'menor privilégio aplicado em %', alvo.assinatura;
  end loop;

  -- Ausência não é erro. A função nasceu fora do versionamento, então um banco
  -- criado só a partir destas migrações (`supabase db reset`) não a tem, e essa
  -- migração precisa passar assim mesmo.
  if atingidas = 0 then
    raise notice 'public.rls_auto_enable não existe neste banco; nada a revogar';
  end if;
end
$$;
