-- Menor privilégio nas duas tabelas que ficaram só com o RLS segurando.
--
-- O QUE FOI ENCONTRADO
--
-- O Supabase concede, por privilégio padrão do esquema `public`, ALL sobre toda
-- tabela nova para `anon`, `authenticated` e `service_role`. As migrações do
-- projeto desfazem isso caso a caso — e duas passaram sem a parte de
-- `authenticated`:
--
--   • `cofre_financial_snapshots` — a migração 202608120001 revoga de `anon`
--     (linha 40) e concede `select` a `authenticated` (linha 41). Conceder não
--     revoga: `insert`, `update` e `delete` do privilégio padrão continuam lá.
--   • `cofre_mutations` — revogada de `anon` na mesma linha 40, e de mais
--     ninguém. `authenticated` provavelmente mantém ALL.
--
-- HOJE O RLS SEGURA, E É EXATAMENTE O PROBLEMA
--
-- As duas têm RLS habilitado. `cofre_financial_snapshots` só tem policy de
-- `select`; `cofre_mutations` não tem policy nenhuma. Logo, escrita já é negada
-- por ausência de policy, e não há falha explorável hoje.
--
-- Mas é UMA camada só. Uma policy escrita sem cuidado no futuro, ou um
-- `disable row level security` num diagnóstico às pressas, transformaria
-- privilégio esquecido em escrita de verdade sobre o diário financeiro e sobre
-- o registro de idempotência. Privilégio que ninguém usa não deve existir: é a
-- diferença entre "não dá porque a porta está trancada" e "não dá porque não
-- existe porta".
--
-- POR QUE SÓ ESTAS DUAS
--
-- As outras já estão certas e não são tocadas aqui:
--   `cofre_sync_state`, `cofre_sync_ops`, `cofre_sync_checkpoints` e
--   `cofre_sync_checkpoint_rows` revogam de `anon` E de `authenticated` antes de
--   conceder `select` (202608180001, linhas 114-118);
--   `cofre_rate_limit` revoga de `anon, authenticated` (202608180002);
--   `cofre_sync_config` revoga de `public, anon, authenticated` (202608200001).
--
-- `cofre_devices` FICA DE FORA DE PROPÓSITO. Ela usa concessão POR COLUNA
-- (`grant select (user_id, device_id, label, ...)`, mais `device_type` na
-- migração 20260825001552). Um `revoke all ... from authenticated` aqui
-- apagaria essas concessões e quebraria `GET /api/account/devices`, que lê a
-- lista com o token do usuário. Ela já foi revogada corretamente na 202608120001.
--
-- CONSUMIDORES CONFERIDOS ANTES DE REVOGAR
--
-- Busca por `cofre_financial_snapshots` e `cofre_mutations` em `netlify/`,
-- `api/` e `js/`: **nenhuma ocorrência**. As duas só são tocadas por funções
-- `security definer` que rodam com `service_role`, e `service_role` tem
-- concessão própria, não herdada de `authenticated`. Revogar aqui não alcança
-- nenhum caminho vivo.
--
-- A policy de leitura de `cofre_financial_snapshots` é PRESERVADA, e com ela o
-- `grant select`: a intenção declarada na 202608120001 era o dono poder ler o
-- próprio instantâneo do protocolo 1. Hoje nada exerce essa leitura, mas
-- retirá-la seria remover funcionalidade declarada em nome de arrumação. Fica
-- registrado para revisão futura, não removido.

-- Revogar e reconceder é o mesmo padrão da 202608180001 para as tabelas de
-- sincronização. `revoke all` primeiro porque `grant select` sozinho não desfaz
-- o que o privilégio padrão já tinha dado.
revoke all on public.cofre_financial_snapshots from public, anon, authenticated;
grant select on public.cofre_financial_snapshots to authenticated;

-- Registro de idempotência: quem escreve é `cofre_apply_ops` e quem apaga é
-- `cofre_purge_account`, as duas com `service_role`. Nenhum cliente lê isto, e
-- ler seria informação sobre o ritmo de uso da conta. Sem policy e sem
-- concessão, a tabela nega por dois motivos independentes.
revoke all on public.cofre_mutations from public, anon, authenticated;

-- As três tabelas SERVER-ONLY do projeto, declaradas aqui para que a ausência
-- de policy seja lida como decisão e não como esquecimento. O linter do
-- Supabase avisa "RLS habilitado sem policy" nas três; o aviso está correto
-- quanto ao fato e errado quanto à conclusão. Criar policy para calá-lo abriria
-- caminho de leitura onde hoje não existe nenhum.
--
--   cofre_mutations    — idempotência de escrita; só service_role.
--   cofre_rate_limit   — contagem de tentativas. Legível, seria um oráculo:
--                        dá para descobrir se um email existe medindo o
--                        consumo do balde.
--   cofre_sync_config  — versão mínima de escrita do protocolo, igual para
--                        todos; o cliente já a recebe no envelope da resposta.
comment on table public.cofre_mutations is
  'Server-only: RLS sem policy é deliberado. Escrita por cofre_apply_ops, limpeza por cofre_purge_account, ambas com service_role. Nenhum cliente lê.';
comment on table public.cofre_rate_limit is
  'Server-only: RLS sem policy é deliberado. Leitura pública seria um oráculo de existência de conta. Só cofre_rate_hit toca, com service_role.';
comment on table public.cofre_sync_config is
  'Server-only: RLS sem policy é deliberado. O cliente recebe protocolo e mínimo de escrita no envelope de /api/sync, nunca lendo a tabela.';
