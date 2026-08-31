-- Versão explícita do schema do banco.
--
-- O QUE FOI ENCONTRADO
--
-- O projeto tem quatro versões vivas e explícitas: a do aplicativo
-- (`package.json`), a do schema local (`SCHEMA_VERSION`), a do IndexedDB
-- (`DB_VERSION`) e a do protocolo de sincronização (`cofre_sync_config`). O
-- BANCO não tinha nenhuma. Saber quais migrações um banco recebeu dependia de
-- olhar tabela por tabela.
--
-- Isso já custou caro uma vez: a auditoria do M1 achou `public.rls_auto_enable`
-- existindo em produção sem migração correspondente no repositório. Com uma
-- versão declarada pelo próprio banco, "produção está atrás do repositório"
-- vira uma leitura, e não uma investigação.
--
-- O QUE ESTA MIGRAÇÃO FAZ
--
-- Acrescenta uma coluna à tabela de configuração que já existe e já é lida a
-- cada ciclo de sincronização. Nenhuma tabela nova, nenhuma função nova,
-- nenhum privilégio novo: `cofre_sync_config` continua revogada de `public`,
-- `anon` e `authenticated`, e continua legível apenas por `service_role`.
--
-- VERSÃO 1 = o schema formado por todas as migrações até
-- `20260828150000_rls_auto_enable_gatilho.sql`, inclusive. Toda migração
-- seguinte que mude a forma do banco (tabela, coluna, função, policy ou
-- privilégio) sobe este número na mesma migração que faz a mudança.
--
-- POR QUE NÃO É UM PORTÃO
--
-- O backend LÊ este número e o publica em `/api/sync/health`; ele não recusa
-- atendimento quando a versão está atrás. Um portão transformaria "esqueci de
-- aplicar uma migração" em "o aplicativo parou para todo mundo", que é
-- exatamente o tipo de conserto que causa o incidente que pretendia evitar. A
-- divergência precisa ser VISÍVEL, não fatal.
--
-- REVERSÃO
--
--   alter table public.cofre_sync_config drop column if exists database_schema_version;
--
-- Reverter é seguro: o backend trata a ausência da coluna como "banco anterior
-- a esta migração" e segue funcionando, porque ele lê a linha inteira em vez de
-- pedir a coluna pelo nome.

alter table public.cofre_sync_config
  add column if not exists database_schema_version integer not null default 1;

alter table public.cofre_sync_config
  drop constraint if exists cofre_sync_config_schema_version_check;
alter table public.cofre_sync_config
  add constraint cofre_sync_config_schema_version_check
  check (database_schema_version >= 1);

update public.cofre_sync_config
  set database_schema_version = greatest(database_schema_version, 1),
      updated_at = now()
  where id = 1;

comment on column public.cofre_sync_config.database_schema_version is
  'Versão do schema do banco. Sobe na mesma migração que muda a forma do banco. Lida pelo backend e publicada em /api/sync/health; não bloqueia atendimento.';
