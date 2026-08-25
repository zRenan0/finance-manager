# Plano de implementação da sincronização automática e dos dispositivos

## Referência

Especificação aprovada:
`docs/superpowers/specs/2026-08-24-sincronizacao-automatica-e-dispositivos-design.md`.

Commit da especificação: `8fc380a`.

## Meta

Fazer login, recarga, foco e volta da rede atualizarem a conta sem botão manual,
enviar gravações em até um segundo, corrigir a revogação concorrente e substituir
a lista indistinta de dispositivos por um extrato de acessos verificável.

## Limites

- Não adicionar Open Finance nem importação bancária automática.
- Não adicionar Supabase Realtime nesta entrega.
- Não aplicar migração remota, publicar ou executar `git push`.
- Preservar o IndexedDB e a fila como fonte local durante falhas de rede.
- Preservar a fila de clientes em cache que parem de sincronizar até recarregar
  e passar a enviar o cabeçalho obrigatório de escopo.

## Invariantes

1. Falha de transporte não significa logout confirmado.
2. Fila pendente nunca é descartada por logout, revogação ou fechamento.
3. A interface não declara conta vazia antes da primeira descida.
4. Só autenticação explícita pode reativar um aparelho revogado.
5. Atividade comum nunca escreve `revoked_at`.
6. Revogação bem-sucedida altera exatamente um aparelho ativo da própria conta.
7. Revogados não aparecem como conectados.
8. Metadados do aparelho não incluem IP, modelo exato ou fingerprint.
9. Um único ciclo de sincronização roda por escopo e por aba.
10. O botão manual só aparece depois de uma falha.

## Tarefa 1. Fixar os testes que reproduzem os defeitos

Arquivos:

- ampliar `tests/test-cloud-sync.js`;
- ampliar `tests/test-account-backend.js`;
- criar teste de ciclo de sessão e dispositivos quando a fronteira ficar clara;
- ampliar `tests/test-render.js` ou teste focado da tela de conta.

Casos obrigatórios:

1. sessão indisponível fica desconhecida e recupera no evento `online`;
2. login e recarga fazem a primeira descida sem ação manual;
3. uma gravação agenda envio em no máximo um segundo;
4. polling visível busca dados mesmo sem fila local;
5. atividade iniciada antes da revogação não limpa `revoked_at`;
6. alvo revogado ou inexistente não devolve sucesso falso;
7. endpoint de dispositivos lista apenas ativos;
8. sondas sem sessão e erro de revogação não limpam cookies automaticamente;
9. sucesso da revogação encerra `busy` e remove a linha;
10. tipos diferentes renderizam ícones e rótulos diferentes.

## Tarefa 2. Criar a migração segura de tipo de aparelho

Arquivos:

- nova migração criada com Supabase CLI 2.115.0;
- atualizar os testes estáticos de migração.

Passos:

1. usar `supabase migration new add_device_type`;
2. adicionar `device_type text not null default 'unknown'`;
3. criar a restrição de valores de forma repetível, consultando
   `pg_constraint` antes de adicioná-la;
4. manter RLS atual;
5. conceder ao papel autenticado somente leitura da nova coluna;
6. não criar índice adicional, pois o acesso usa a chave primária existente
   `(user_id, device_id)`.

## Tarefa 3. Tornar a revogação atômica no backend

Arquivos:

- `netlify/functions/account.js`;
- `netlify/functions/sync.js`;
- `netlify/functions/analyze.js`;
- utilitário compartilhado de HTTP se a limpeza de cookies precisar ser movida;
- `tests/test-account-backend.js`.

Passos:

1. validar `device_type` e rótulo em funções pequenas;
2. separar toque ativo de cadastro ou reativação por login;
3. no toque ativo, usar PATCH filtrado por usuário, aparelho, segredo e
   `revoked_at=is.null`, sem enviar `revoked_at` no corpo;
4. pedir representação para confirmar que a atualização afetou uma linha;
5. no login explícito, rotacionar segredo e limpar revogação;
6. listar apenas `revoked_at=is.null`;
7. revogar somente um alvo ativo e validar a resposta do banco;
8. manter limpeza de cookies somente em logout, revogação explícita do aparelho
   atual e exclusão da conta;
9. manter a checagem própria de aparelho em toda rota protegida;
10. distinguir códigos terminais do Auth de timeout, transporte e HTTP 5xx;
11. validar `X-Account-Id` antes de dados em sync, análise e ações autenticadas
    de conta, com 400 para formato inválido e 403 para identidade divergente;
12. impedir refresh em rotas com escopo e devolver
    `401 session_refresh_required` sem cookies ou acesso ao banco;
13. manter `/account/session` como único ponto de renovação e usar `sub` não
    verificado somente para rejeição antecipada, nunca para autorização;
14. liberar `X-Account-Id` no preflight CORS da análise.

## Tarefa 4. Corrigir estado de sessão e recuperação automática

Arquivos:

- `js/auth.js`;
- `js/cloud-sync.js`;
- `js/app.js`;
- `js/storage.js` para cabeçalhos do `CloudAdapter`;
- testes de sessão e sincronização.

Passos:

1. representar sessão como ativa, visitante ou desconhecida;
2. só trocar para visitante quando o servidor confirmar ausência de sessão;
3. preservar o escopo lembrado durante falha de rede;
4. manter uma promessa única de bootstrap e propagar seus erros;
5. recuperar sessão em `online`, `pageshow`, foco e visibilidade;
6. deduplicar os gatilhos e ciclos concorrentes;
7. reduzir o debounce de gravação para no máximo um segundo;
8. reduzir o polling visível para 15 segundos;
9. tentar flush e envio curto ao ocultar, preservando a fila se interrompido;
10. enviar rótulo e tipo do aparelho também pelo `CloudAdapter`;
11. emitir invalidação de sessão ao receber `device_revoked` ou
    `session_expired`;
12. voltar a interface ao escopo visitante sem apagar o banco da conta.
13. enviar `X-Account-Id` em sincronização, análise e ações autenticadas de
    conta, tratando `account_scope_changed` sem aplicar resposta antiga;
14. ao receber `session_refresh_required`, consultar `/account/session`,
    confirmar a mesma identidade e repetir a operação uma única vez.

## Tarefa 5. Refazer o extrato de acessos

Arquivos:

- `js/icons.js`;
- `js/screens/account.js`;
- `css/screens/account.css`;
- `js/actions.js` e `js/auth.js` para os estados das ações;
- testes de renderização.

Passos:

1. adicionar ícones de computador, celular, tablet e navegador desconhecido;
2. produzir rótulo curto a partir de navegador e plataforma;
3. mostrar contagem de ativos, selo do aparelho atual e horário relativo;
4. remover a ação de revogar do aparelho atual;
5. remover outro aparelho imediatamente depois da confirmação;
6. manter os itens atuais quando uma atualização da lista falhar;
7. esconder a ação de sincronização no estado saudável;
8. recolher a área de exclusão até uma ação explícita;
9. garantir alvos de toque, foco e disposição móvel;
10. conferir temas claro e escuro.

## Tarefa 6. Integrar, gerar o pacote e validar

Arquivos:

- `js/modules/app.generated.js`;
- `service-worker.js`;
- documentação de protocolo, backend, release e changelog.

Passos:

1. atualizar documentação que ainda descreve o protocolo 2 ou sync desligado;
2. promover a versão do service worker;
3. executar testes focados após cada frente;
4. gerar o módulo;
5. rodar lint, suíte completa, navegador e verificação de release;
6. inspecionar a tela em desktop e celular;
7. conferir `git diff --check` e arquivos fora do escopo.

## Comandos de validação

```powershell
node tests/test-account-backend.js
node tests/test-cloud-sync.js
node tests/test-guest-link.js
node tests/test-render.js
npm run build
npm run lint
npm test
npm run test:browser
npm run verify:release
```

Se houver ambiente local do Supabase e Docker disponível:

```powershell
npx supabase@2.115.0 db reset
npx supabase@2.115.0 migration list --local
```

## Resultado esperado

- salvar em A envia sozinho;
- B recebe sozinho enquanto aberto ou imediatamente ao voltar;
- login e recarga nunca exigem o botão de sincronização;
- falha de rede se recupera sem derrubar uma sessão conhecida;
- revogação não sofre reativação concorrente;
- o aparelho revogado deixa a conta e perde o backend;
- a lista distingue aparelhos e não mistura revogados;
- a área destrutiva deixa de dominar a tela.
