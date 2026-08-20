# Plano de implementação do vínculo de conta e sincronização multidispositivo

## Referência

Especificação aprovada: `docs/superpowers/specs/2026-08-20-vinculo-conta-sincronizacao-multidispositivo-design.md`.

Commit da especificação: `4330ac5`.

## Meta

Fazer o conteúdo criado antes do login entrar com segurança na conta autenticada, persistir todas as operações antes de declará-las sincronizadas e permitir que dois aparelhos convirjam sem substituir coleções financeiras inteiras.

## Limites desta entrega

- Implementar o cliente e o backend compatíveis com os protocolos 2 e 3.
- Adicionar somente a migração de preparação, com `minimumWriteProtocol = 2`.
- Converter snapshots remotos legados sem apagá-los.
- Não adicionar nem aplicar a migração de corte nesta entrega. O corte para escrita mínima 3 será uma publicação posterior, depois da janela de atualização.
- Não publicar, aplicar migrações remotas nem enviar commits para o repositório remoto sem autorização própria para essas ações.

## Invariantes

1. Dado financeiro e respectiva fila persistem juntos ou falham juntos.
2. Erro de leitura, inclusão ou remoção da fila nunca vira lista vazia ou sucesso.
3. Operação remota chega ao armazenamento antes de o cursor avançar.
4. Resposta de subida chega ao armazenamento antes de a fila ser confirmada.
5. `linked` e `synced` exigem confirmação real, não ausência presumida de erro.
6. `linkId`, `seedId` e metadados locais nunca seguem no corpo enviado ao servidor.
7. As cinco listas financeiras novas sincronizam por registro e continuam armazenadas localmente no formato atual.
8. O escopo `guest` permanece intacto depois do vínculo.
9. O UUID da sessão continua sendo o único dono remoto dos dados.
10. Um cliente 2 continua funcionando durante a transição e recebe `protocol: 2` nas respostas.

## Tarefa 1. Fixar os contratos e os testes de falha

Arquivos:

- modificar `tests/test-cloud-sync.js`;
- modificar `tests/test-user-isolation.js`;
- modificar `tests/test-account-backend.js`;
- criar `tests/test-guest-link.js`;
- criar `tests/test-service-worker-update.js`.

Passos:

1. Atualizar o servidor falso para anunciar `serverProtocol: 3` e `minimumWriteProtocol: 2`, ecoando em `protocol` a versão falada pelo cliente.
2. Criar casos que reproduzem fila com falha de inclusão, leitura e remoção.
3. Provar que uma gravação ainda no debounce termina antes da primeira descida.
4. Provar que uma promessa de aplicação remota pendente impede o avanço do cursor.
5. Provar que conta, cartão, transferência, pagamento, ajuste, renda e categoria personalizada tornam o visitante significativo.
6. Provar que fechar uma confirmação não grava `dismissed`.
7. Provar que marcadores antigos `asked`, `empty` e `imported` não bloqueiam a reparação.
8. Provar a resposta compatível dos protocolos 2 e 3 e o uso de HTTP 426 para `protocol_upgrade_required`.

Comandos:

```powershell
node tests/test-cloud-sync.js
node tests/test-user-isolation.js
node tests/test-account-backend.js
node tests/test-guest-link.js
```

Resultado esperado antes das correções: os novos casos falham pelas causas documentadas.

## Tarefa 2. Criar a transação local única

Arquivo principal: `js/storage.js`.

Passos:

1. Subir `DB_VERSION` para 4.
2. Criar `STORE_LOCAL_META = "localMeta"`, fora do snapshot, do backup e da exportação.
3. Adicionar `entryKey` estável à fila e índices locais para `linkId` e `seedId`.
4. Substituir o contrato fragmentado do adapter por um commit que aceite dados, inclusões e remoções da fila, além de metadados locais.
5. No IndexedDB, incluir todos os stores tocados na mesma transação `readwrite`.
6. No fallback, gravar um registro de recuperação, aplicar as três partes, conferir as escritas e apagar o registro somente no fim.
7. Reaplicar uma recuperação pendente na inicialização usando `entryKey`, sem duplicar fila.
8. Expor `localMetaGet`, `localMetaPut` e `localMetaDelete` com separação por escopo.
9. Fazer `persist()`, `flush()`, aplicação remota, semeadura, vínculo e restauração passarem pela mesma fila interna de escrita.
10. Atualizar `lastPersisted`, relógio, revisões de configuração e estado saudável somente depois da confirmação da transação.
11. Remover os `catch` que transformam falha da fila em `false` ou `[]`.

Testes específicos:

- um erro da fila aborta também a alteração financeira;
- uma repetição do fallback não duplica a entrada;
- `localMeta` de um UUID não aparece em outro;
- `purge()` remove os metadados apenas do escopo atual;
- `flush()` aguarda uma gravação já iniciada.

Commit previsto: `fix: persiste dados e fila na mesma transacao`.

## Tarefa 3. Tratar as cinco listas como entidades do protocolo 3

Arquivos:

- modificar `js/storage.js`;
- modificar `netlify/functions/_shared/finance-schema.js`;
- modificar `tests/test-cloud-sync.js`;
- modificar `tests/test-account-backend.js`.

Passos:

1. Criar uma descrição única das nove entidades sincronizáveis.
2. Preservar `syncRev` nos normalizadores de contas, cartões, transferências, pagamentos e ajustes.
3. Ampliar `GRAVEYARD_COLLECTIONS`, prefixos, cópia rasa, diff, semeadura, restauração e aplicação remota.
4. Manter as cinco listas no store `settings`, mas gerar operações `put` e `delete` por ID.
5. Impedir novas operações `settings` para essas listas no protocolo 3.
6. Gerar lápide quando um registro desaparecer da lista local.
7. Expandir temporariamente uma operação antiga `settings/accounts`, por exemplo, em operações virtuais por registro com a mesma `rev`.
8. Resolver a coexistência dos dois formatos por revisão de cada ID.
9. Separar no schema do servidor as entidades centrais, as entidades por registro e as chaves aceitas por cada protocolo.
10. Validar os cinco novos payloads e suas referências pelo formato.

Testes específicos:

- duas contas criadas em aparelhos diferentes sobrevivem;
- dois pagamentos criados em aparelhos diferentes sobrevivem;
- uma exclusão não ressuscita;
- cliente 3 não cria `settings accounts`;
- cliente 2 ainda pode enviar o array durante a transição;
- registro 3 mais recente vence a versão da lista 2.

Commit previsto: `feat: sincroniza colecoes financeiras por registro`.

## Tarefa 4. Corrigir o ciclo e criar a barreira da primeira descida

Arquivos:

- modificar `js/cloud-sync.js`;
- modificar a classe `CloudAdapter` em `js/storage.js`;
- modificar `js/app.js`;
- modificar `tests/test-cloud-sync.js`.

Passos:

1. Mover cursor, recibo de semeadura e relógio para `localMeta`, importando as chaves antigas uma vez.
2. Tornar `FinanceStore.applyRemoteOps()` assíncrona e responsável por persistir sem criar operações de saída.
3. Fazer o hook `applyRemote` atualizar apenas estado e tela.
4. Remover `readLocal` do contrato sem uso.
5. Executar o ciclo na ordem: `flush`, descida, semeadura liberada, subida, aplicação da resposta, confirmação da fila, descida final e leitura estrita da fila.
6. Aplicar a resposta da subida antes de remover entradas confirmadas.
7. Persistir o cursor somente depois da aplicação remota.
8. Lançar erro se houver cursor parado com `hasMore`, limite de páginas ou limite de lotes.
9. Definir `synced` somente quando a leitura final da fila funcionar e retornar vazia.
10. Fazer `enable()` devolver o resultado real da primeira execução.
11. Expor `prepareAccount()` para inicializar e baixar sem enviar nem semear.
12. Expor `finishAccountBootstrap()` para liberar a fila e a semeadura depois da decisão de vínculo.
13. Guardar a revisão observada no `health` antes de qualquer envio local.

Testes específicos:

- fila não vazia termina em `idle` e `pending`, nunca em `synced`;
- falha ao aplicar a resposta mantém a fila;
- `linkId` e `seedId` não aparecem no corpo HTTP;
- base contendo apenas conta ou renda é semeada;
- o marcador booleano antigo não impede a semeadura de reparo;
- `minimumWriteProtocol` maior que o cliente preserva a fila e para o motor.

Commit previsto: `fix: confirma persistencia antes de avancar o sync`.

## Tarefa 5. Implementar resumo, impressão, diário e recibo do vínculo

Arquivo principal: `js/storage.js`.

Passos:

1. Fazer `peekScope()` fechar adapters em `finally` e devolver resumo completo, sem expor conteúdo financeiro.
2. Criar JSON canônico com objetos por chave, coleções por ID e exclusão dos campos voláteis definidos na especificação.
3. Calcular SHA-256 com versão de digest.
4. Tratar categorias de fábrica como vazias e categorias personalizadas como conteúdo.
5. Criar recibos `dismissed` e `linked` em `localMeta`.
6. Sem WebCrypto, manter `dismissed` apenas na sessão.
7. Refazer `adoptScope()` para validar novamente o digest, mesclar pelo contrato aprovado e produzir somente o diff.
8. Criar `linkId`, diário, revisões estáveis e operações com `linkId`.
9. Persistir diário, diff e fila juntos.
10. Retomar o mesmo diário depois de interrupção, sem recarimbar.
11. Promover o diário para `linked` somente quando nenhuma entrada daquele `linkId` restar após resposta válida.
12. Preservar a base visitante.

Proteção contra corrida:

- o primeiro lote automático leva `expectedRemoteRevision: "0"`;
- o RPC compara a revisão sob bloqueio antes de aplicar;
- `remote_changed` mantém diário e fila, força nova descida e muda o fluxo para confirmação;
- o motor não envia novamente as operações bloqueadas até a decisão explícita.

Testes específicos:

- digest não muda por `syncRev` nem por carimbo técnico;
- digest muda por conteúdo financeiro;
- mesmo digest usa o mesmo `linkId` e as mesmas revisões;
- digest alterado volta a ficar pendente;
- conflito do mesmo ID respeita `syncRev`, depois `updatedAt`, depois personalização e por fim a conta;
- falha local ou remota mantém o diário.

Commit previsto: `feat: vincula dados de visitante com recibo duravel`.

## Tarefa 6. Orquestrar o login e mostrar uma ação permanente

Arquivos:

- modificar `js/auth.js`;
- modificar `js/screens/account.js`;
- modificar `js/actions.js`;
- modificar `css/screens/account.css`;
- modificar `js/app.js`;
- modificar `tests/test-guest-link.js`;
- modificar `tests/test-render.js`.

Passos:

1. Remover `guestImportDecision()`, `rememberGuestImportDecision()` e a escrita antecipada de `asked`.
2. Fazer `applyAccountScope()` cuidar apenas da troca de banco e da limpeza visual.
3. Executar a inspeção mesmo quando o escopo autenticado já estava aberto no início do app.
4. Aguardar `prepareAccount()`, inspecionar o visitante e então decidir vínculo automático, confirmação, espera por rede ou recibo existente.
5. Proteger cada sequência assíncrona com UUID e escopo, cancelando resultado antigo depois de logout ou troca de conta.
6. Adicionar fases próprias em `state.account.guestLink`.
7. Vincular automaticamente apenas com revisão remota conhecida e igual a zero.
8. Para conta usada, mostrar `Juntar dados`, `Manter separados` e `Agora não` como ações diferentes.
9. Manter `Vincular dados deste aparelho` disponível depois de `dismissed`.
10. Mostrar falha como `Vínculo pendente`, sem apresentar sincronização concluída.
11. Adicionar ações de confirmar, dispensar, rever e tentar novamente.
12. Tornar o identificador do aparelho estável em memória e usar cookie próprio como reserva quando `localStorage` estiver bloqueado.

Testes específicos:

- a primeira descida ocorre antes da inspeção e da adoção;
- revisão zero vincula automaticamente;
- revisão maior que zero aguarda ação;
- fechar não grava decisão;
- ação explícita grava `dismissed`;
- logout durante uma promessa não conclui na conta errada;
- o cartão nunca mostra digest, UUID ou IDs financeiros.

Commit previsto: `feat: conclui vinculo da conta depois da primeira descida`.

## Tarefa 7. Preparar o backend e converter snapshots legados

Arquivos:

- modificar `netlify/functions/sync.js`;
- modificar `netlify/functions/_shared/finance-schema.js`;
- modificar `netlify/functions/_shared/supabase-rest.js` se necessário para preservar o código controlado;
- criar `supabase/migrations/202608200001_sync_protocol_3_prepare.sql`;
- modificar `tests/test-account-backend.js`;
- criar testes SQL locais quando o ambiente do Supabase estiver disponível.

Passos:

1. Definir protocolo atual 3 e aceitar falas 1, 2 e 3 conforme a rota.
2. Ecoar `protocol: 2` para cliente 2 e acrescentar `serverProtocol: 3` e `minimumWriteProtocol: 2`.
3. Exigir que cabeçalho e corpo falem a mesma versão nas escritas.
4. Passar `p_protocol` e `p_expected_revision` ao RPC.
5. Fazer o banco recusar uma escrita abaixo do mínimo, inclusive quando chamada por uma função antiga.
6. Mapear `protocol_upgrade_required` para HTTP 426 e `remote_changed` para HTTP 409 com corpo próprio, sem convertê-lo em conflito de documento no cliente novo.
7. Manter assinaturas antigas como adaptadores do protocolo 2 durante a transição.
8. Fazer escrita dupla temporária entre lista 2 e registros 3 dentro da mesma transação.
9. Criar `cofre_sync_config` sem leitura ou escrita por `anon` e `authenticated`.
10. Ampliar a restrição de entidade em `cofre_sync_ops`.
11. Converter snapshot apenas quando não houver log atual.
12. Ignorar snapshot sem conteúdo significativo.
13. Converter coleções e configurações permitidas com marcas e ordem determinísticas.
14. Não apagar `cofre_financial_snapshots`.
15. Garantir que a segunda execução não altere contagem, revisão ou conteúdo.

Observação de publicação: o backend compatível precisa entrar antes do cliente 3. Na Vercel isso exige dois deployments, pois frontend e funções são publicados juntos.

Commit previsto: `feat: prepara backend para protocolo de sync 3`.

## Tarefa 8. Versionar o pacote e tratar a troca de service worker

Arquivos:

- modificar `scripts/build-dist.js`;
- modificar `scripts/check-release.js`;
- modificar `scripts/check-deploy.js`;
- modificar `service-worker.js`;
- modificar `js/app.js`;
- modificar `tests/test-modular-build.js`;
- modificar `tests/test-service-worker-update.js`.

Passos:

1. Gerar o pacote principal normalmente.
2. No `dist`, calcular SHA-256 dos módulos, publicar nomes com hash e reescrever todos os imports do bootstrap.
3. Reescrever `dist/app.html` para o bootstrap com hash.
4. Reescrever o service worker do `dist` para armazenar exatamente os nomes com hash.
5. Remover do `dist` as cópias sem hash dos módulos reescritos.
6. Promover a versão do cache.
7. Registrar `controllerchange`, aguardar `FinanceStore.flush()` e usar uma guarda de build no `sessionStorage` antes de recarregar.
8. Se o flush falhar, manter a página e mostrar atualização pendente.
9. Fazer `check-deploy` comparar com `dist/app.html` e seguir as referências de módulos com hash.
10. Normalizar texto para LF no build, evitando diferença falsa por CRLF.

Commit previsto: `fix: impede mistura de pacotes durante atualizacao`.

## Tarefa 9. Cenário real com dois contextos e revisão final

Arquivos:

- criar ou ampliar teste de navegador em `tests/browser/`;
- modificar `package.json` se houver novo comando;
- modificar `docs/SYNC_PROTOCOL.md`;
- modificar `docs/BACKEND_SETUP.md`;
- modificar `docs/RELEASE.md`;
- modificar `CHANGELOG.md`;
- modificar `js/safe-errors.js`;
- gerar `js/modules/app.generated.js`.

Cenário obrigatório:

1. Contexto A grava lançamento, conta, cartão e renda como visitante.
2. A entra numa conta remota vazia.
3. O vínculo automático conclui e recebe recibo.
4. Contexto B entra na mesma conta e recebe o mesmo conteúdo.
5. A e B criam registros diferentes ao mesmo tempo.
6. Os dois lados convergem.
7. Ambos fecham e reabrem.
8. O resultado permanece.
9. Uma falha temporária conserva diário e fila.
10. A retomada conclui sem duplicar.
11. Uma conta remota usada exige confirmação.

Comandos finais:

```powershell
npm run build
npm run lint
npm test
npm run test:browser
npm run check:build
npm run check:release
npm run build:dist
```

Se o Supabase local estiver configurado:

```powershell
npx supabase db reset
npx supabase test db
```

Revisão final:

- conferir `git diff --check`;
- conferir que nenhum arquivo fora do escopo foi alterado;
- conferir que o pacote gerado corresponde às fontes;
- não executar `git push`, migration remota nem publicação sem autorização.

Commit previsto: `test: cobre vinculo e sync em dois aparelhos`.

## Etapa posterior, fora desta entrega

Depois que produção estiver com backend e cliente 3 por uma janela suficiente:

1. criar a migração de corte em outro commit;
2. desdobrar qualquer lista 2 restante;
3. publicar `minimumWriteProtocol: 3` por último;
4. provar que escrita 2 recebe HTTP 426 e mantém a fila;
5. manter snapshots e linhas antigas durante uma versão de segurança;
6. nunca voltar a backend ou cliente que conheça somente o protocolo 2.
