-- public.rls_auto_enable() entra no versionamento.
--
-- DE ONDE VEIO ESTE CORPO
--
-- Capturado do banco de produção em 2026-08-28 com `pg_get_functiondef`, pelo
-- bloco 1 de `supabase/tests/verify_rls_auto_enable.sql`. A função tinha sido
-- criada fora das migrações e existia só no banco. A partir daqui ela existe no
-- repositório, e um `supabase db reset` reproduz o ambiente de verdade.
--
-- O QUE ELA FAZ, E POR QUE FICA
--
-- É uma função de EVENT TRIGGER (`returns event_trigger`). A cada `CREATE TABLE`
-- no esquema `public`, ela liga RLS na tabela recém-criada. É uma defesa: sem
-- ela, uma tabela nova nasce sem RLS e fica legível por quem tiver a chave
-- pública. Não remover.
--
-- SOBRE O ALERTA DO SECURITY ADVISOR
--
-- O Advisor aponta a função como `security definer` executável por `anon` e
-- `authenticated`, e a ACL de produção confirma (`anon=X/postgres`,
-- `authenticated=X/postgres`, mais o `=X/postgres` de PUBLIC).
--
-- O privilégio está mesmo errado e é corrigido aqui e na migração
-- 20260828120000. Mas o alerta NÃO descreve um buraco explorável, e vale
-- registrar por quê, para ninguém tratar isso como incidente:
--
--   1. Função que devolve `event_trigger` não pode ser chamada diretamente. O
--      plpgsql recusa na compilação da chamada: "trigger functions can only be
--      called as triggers". Não existe caminho de execução por RPC.
--   2. O PostgREST não publica função com retorno de pseudo-tipo, então ela nem
--      aparece como rota.
--
-- O Advisor lê a ACL, não a chamabilidade. A correção é higiene de privilégio
-- (e silencia o alerta), não contenção de vazamento.
--
-- A ORDEM IMPORTA
--
-- `create or replace` preserva a ACL de uma função que já existe, mas um banco
-- novo (`supabase db reset`) cria a função do zero — e toda função nova nasce
-- com EXECUTE para PUBLIC. Por isso o `revoke` vem logo depois do `create`,
-- nesta mesma migração. Sem ele, o banco novo reintroduziria exatamente o
-- problema que a migração anterior corrigiu no banco antigo.

create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
-- Produção tem `search_path = 'pg_catalog'`. Falta `pg_temp`: quando ele não é
-- listado, o PostgreSQL o pesquisa PRIMEIRO, antes do `pg_catalog`, para nomes
-- de relação e de tipo. Listá-lo por último inverte isso e fecha a classe de
-- sombreamento por tabela temporária. O corpo abaixo não referencia nenhuma
-- relação por nome curto, então a mudança não altera comportamento nenhum aqui;
-- ela só remove a possibilidade. Para voltar ao estado exato de produção, basta
-- trocar esta linha por `set search_path to 'pg_catalog'`.
set search_path to 'pg_catalog', 'pg_temp'
as $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;

-- Nenhum `grant` acompanha o `revoke`. As outras funções do projeto concedem a
-- `service_role` porque o backend as chama; esta não é chamada por ninguém, em
-- papel nenhum. O disparo é feito pelo servidor dentro do evento e não consulta
-- a ACL: o PostgreSQL confere EXECUTE na CRIAÇÃO do gatilho, não a cada disparo.
-- Uma instrução só, como nas demais funções do projeto. As migrações existentes
-- já escrevem `from public, anon, authenticated` direto, então os papéis do
-- PostgREST são pré-requisito assumido do banco; inventar aqui um laço defensivo
-- que as outras não têm só criaria duas convenções para a mesma coisa.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- PENDENTE, DE PROPÓSITO: o GATILHO ainda não está versionado.
--
-- Esta migração versiona a FUNÇÃO. O `create event trigger` que a dispara
-- continua só no banco, e não foi capturado ainda (bloco 3 do script de
-- verificação). Consequência: num banco criado só a partir destas migrações, a
-- função existe mas nada a chama, e tabela nova não ganha RLS sozinha.
--
-- Não foi criado aqui às cegas por dois motivos: o nome e a configuração reais
-- do gatilho ainda são desconhecidos, e `create event trigger` exige superusuário
-- — falhar nisso derrubaria a migração inteira e travaria a publicação.
--
-- As tabelas do projeto não dependem desse automatismo: todas as `cofre_*` ligam
-- RLS explicitamente na própria migração que as cria. O gatilho é rede de
-- segurança para o que vier depois.
