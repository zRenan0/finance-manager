# Protocolo de sincronização

Versão atual do contrato: `3` (operações por registro para todas as coleções
financeiras). O servidor ainda entende o corpo do contrato `2` e o contrato `1`
(snapshot inteiro) apenas para leitura. Essa compatibilidade não dispensa o
cabeçalho de isolamento `X-Account-Id`: uma página antiga que não o envia falha
fechado até recarregar o aplicativo novo, sem descartar sua fila local.

O aplicativo local continua sendo a fonte usada pela interface. O adaptador da
nuvem não substitui o IndexedDB: a interface lê sempre da memória alimentada
pelo armazenamento local, e o servidor é um segundo destino atualizado em
segundo plano. É o que mantém o aplicativo inteiro sem conexão.

## Por que o contrato 1 foi substituído

O contrato 1 trocava a base inteira a cada volta. Isso produzia cinco defeitos
que só apareciam com uso real:

1. **Exclusão remota não valia.** O envio era "a base como este aparelho a vê".
   Um aparelho com cópia antiga reenviava o registro apagado, e ele voltava.
2. **Conflito era disputa pelo documento inteiro.** Dois aparelhos mexendo em
   campos diferentes colidiam, e o `409` vinha em rajada.
3. **Relógio errado decidia o vencedor.** A comparação era por `updatedAt`, a
   hora do aparelho. Um celular adiantado ganhava todas as disputas.
4. **Custo por ciclo proporcional à base**, com teto rígido de 6 MiB no commit.
   Acima disso a sincronização parava sem caminho de volta.
5. **Nada sobrevivia ao fechamento da aba.** O que não tinha subido, se perdia.

## Modelo dos contratos 2 e 3

Cada alteração é uma **operação**:

```json
{
  "entity": "transactions",
  "entityId": "tx-abc",
  "op": "put",
  "rev": "001787012026412.000001.device-b02",
  "payload": { "id": "tx-abc", "type": "expense", "amount": 10, "date": "2026-08-05" }
}
```

`entity` identifica uma coleção sincronizável. No contrato 3, lançamentos,
categorias, metas, patrimônio, contas, cartões, transferências, pagamentos de
fatura e conciliações viajam por registro; preferências financeiras continuam
em `settings`. `op` é `put` ou `delete`. Exclusão é uma operação de primeira
classe: ela persiste no log e propaga, em vez de ser a ausência de um registro
num documento.

### Marca de versão (`rev`)

Relógio lógico híbrido, gerado no cliente:

```
<milissegundos com 15 dígitos>.<contador com 6 dígitos>.<id do escritor>
```

A largura é fixa para que a comparação de texto simples já seja a comparação de
ordem correta. As regras:

- escrita local: se `agora > último`, `último = agora` e contador zera; senão o
  contador incrementa;
- leitura remota: o aparelho **absorve** a marca recebida, de modo que a próxima
  escrita dele seja necessariamente maior que ela;
- marcas mais de 24 h à frente do relógio local são ignoradas, para que um
  aparelho quebrado não empurre o relógio de todos;
- o contador **vira**: cheio em `999999`, ele zera e o milissegundo avança um.
  Somar um sem virar produziria sete dígitos, largura fora do padrão, e o
  registro passaria a ser lido como se não tivesse marca. É a mesma regra do
  `cofre_hlc_successor` no servidor.

O teto de 24 h tem **uma exceção declarada**: a barreira de reset confirmada
pelo servidor (ver "Exclusão"). Ela nasce acima de toda marca da conta e, se
algum aparelho escreveu com o relógio muito adiantado, pode passar do teto.
Recusá-la faria a primeira criação depois de apagar perder para as lápides.
Nenhuma outra operação remota escapa do limite.

O escritor usa o id persistente do aparelho com um sufixo por aba
(`:tab_<id>`). Isso impede duas abas do mesmo navegador, com o mesmo
milissegundo e contador em memória, de cunharem a mesma revisão para conteúdos
diferentes. Revisões anteriores sem o sufixo continuam válidas e reconhecidas
como pertencentes ao aparelho.

Consequência: quem escreveu **depois de ver** a alteração alheia vence, mesmo
com o relógio atrasado. O desempate final é o id do escritor, então os dois
lados chegam ao mesmo vencedor sem conversar.

### Compactação

A tabela `cofre_sync_ops` tem índice único por `(user_id, entity, entity_id)`:
uma operação nova **substitui** a anterior do mesmo registro. Por isso a tabela
é ao mesmo tempo o log e o estado, e seu tamanho é proporcional aos **dados**,
não ao número de edições.

- ler o estado inteiro = ler todas as linhas, paginado;
- ler o que mudou = ler as linhas com `seq` maior que o cursor.

## Ciclo do cliente

1. Toda alteração local vira operação e entra numa **fila persistente**
   (object store `outbox`, no IndexedDB do escopo da conta).
2. O ciclo compacta a fila (a última marca de cada registro), envia em lotes de
   até 400 operações e só remove da fila **após** a confirmação do servidor.
3. A mesma resposta traz o que os outros aparelhos fizeram desde o cursor.
4. Se ainda houver páginas, o cliente continua com `GET /changes?since=...`.
5. O cursor é gravado por escopo (`cofre_sync_cursor__u_<id>`).
6. Terminada a descida, o aparelho **semeia** se ainda não semeou nesta conta.

Não há mais `409` de documento inteiro, porque não há mais documento inteiro.

### Semeadura

A fila só recebe **diferença**: ela nasce da comparação entre a gravação e a
anterior. Uma base parada não gera operação nenhuma. Isso deixava invisível para
o servidor tudo que já existia no aparelho antes de a sincronização começar a
funcionar: quem usou o app antes de criar a conta, quem restaurou um backup, e
quem usou enquanto o servidor estava fora do ar. Nada disso dava erro, porque
não havia erro; havia ausência.

A semeadura (`FinanceStore.seedOutbox`) reapresenta a base ao servidor:

- roda **depois da descida**, para nunca empurrar uma versão velha por cima do
  que o outro aparelho escreveu;
- **não inventa marca**: usa a que o registro já carrega, e só cunha uma nova
  para o que nunca passou por uma gravação local;
- **ignora o que está como veio de fábrica** (categorias iniciais intocadas,
  configurações no padrão). Um aparelho recém-conectado que anunciasse o próprio
  vazio com marca nova venceria por ser o mais recente, e apagaria no outro a
  categoria renomeada e a renda preenchida;
- **acontece uma vez por conta e por aparelho** (`cofre_sync_seeded__<escopo>`),
  e mais uma vez sempre que o servidor estiver sem nenhuma operação e o aparelho
  tiver base - o caso de quem tentou sincronizar antes de as tabelas existirem.

Reapresentar é barato e seguro: a marca viaja junto e o servidor guarda a
vencedora, ignorando marca menor ou igual.

A troca da base inteira (`replaceAll`: restaurar backup, desfazer restauração,
adotar dados de visitante) também enfileira. Ali a marca é **nova** para tudo, e
o que sumiu vira lápide: restaurar é declarar o estado de agora, e a declaração
precisa vencer no outro aparelho em vez de ser desfeita por ele na volta
seguinte.

Restaurar um checkpoint só começa a alterar a base depois de ler todas as
páginas. Cursor sem avanço e limite de páginas atingido cancelam a operação
antes de criar qualquer exclusão. O cursor carrega a chave completa
`(entity, entity_id)`, na mesma ordem da consulta, para não pular dois registros
de entidades diferentes que compartilhem o mesmo id. Quando a leitura termina,
base restaurada e fila de propagação são confirmadas na mesma transação local.

Recarga, limpeza, restauração de backup e inicialização também capturam escopo,
adaptador e geração; se a conta mudar no meio de um `await`, o resultado antigo
é descartado sem marcar a conta nova como danificada. A recarga ainda confirma
o debounce antes de ler e rejeita uma leitura que tenha começado antes de uma
nova edição local. Descida, semeadura e vínculo do visitante capturam a versão
que começaram a gravar; se uma edição chegar durante a transação, ela é
reaplicada sobre o resultado e confirmada em seguida. Enquanto um novo escopo
ainda está abrindo, ações da tela anterior são recusadas e não escrevem mirror.

### O registro gravado tem de ser o registro que o servidor tem

A descida aplica operação por operação e monta o snapshot com `migrate()`, que
entre outras coisas reconcilia REFERÊNCIAS: lançamento apontando para conta que
não existe perde o `accountId`; transferência, conciliação e pagamento sem a
conta que os originou são descartados por inteiro.

No disco, com a base completa, isso é saneamento. Durante a descida a base é
**parcial por construção**, e no vínculo do visitante a ordem é garantida: o
ciclo desce primeiro (chegam os lançamentos, que apontam para a conta do banco)
e só depois o "juntar dados" traz a conta. Naquele intervalo a normalização
apagava o vínculo de todos eles.

O problema não é perder o vínculo. É **gravar o registro mutilado com a marca do
servidor**. A partir daí dois aparelhos carregam a mesma marca com conteúdos
diferentes, e a comparação de marcas não enxerga a diferença: `>` é falso entre
iguais. Cada aparelho mostra um saldo, os dois declaram "Tudo sincronizado",
nenhum tem o que enviar, e nada no funcionamento normal desfaz isso. Foi o
defeito por trás de "a mesma conta com números diferentes em cada navegador".

A regra passou a ser: **a referência que chega é preservada**. Quando a conta
ainda não desceu, o alvo fica em `pendingAccountId` e `accountId` continua nulo
— que é o que as leituras do app já tratavam. Assim que a conta aparece,
`migrate()` promove o valor de volta, sem recarimbar nada. `legacyCashBalance`
conta o que NENHUMA conta reivindica, de modo que o saldo fica correto também no
intervalo.

Transferência, conciliação e pagamento continuam sendo descartados quando a
conta deles não existe. Ali a perda é diferente: o registro SOME, em vez de
ficar mutilado com a marca certa, então a releitura do zero o traz de volta.

### Reconciliação completa

O ciclo é incremental, e o incremental se apoia em duas promessas que ele não
consegue reavaliar sozinho:

- o **cursor** promete "já apliquei tudo até aqui", e o servidor nunca reenvia o
  que ficou atrás dele;
- o **recibo de semeadura** promete "já ofereci minha base inteira", e a fila
  nunca reapresenta o que já foi confirmado.

Basta uma operação escapar **uma** vez para as duas passarem a mentir. Escapar
não exige defeito de protocolo: uma marca recusada porque o registro local
nasceu de um relógio adiantado, uma gravação que o navegador desfez por cota,
uma aba fechada entre a resposta do servidor e o disco. A partir daí o aparelho
fica atrasado (ou adiantado) **para sempre**, e sem sinal nenhum: ele cumpriu as
duas promessas, então a tela diz "Tudo sincronizado". Na prática isso aparece
como a mesma conta mostrando saldos diferentes em navegadores diferentes.

A reconciliação (`CloudSync.reconcile()`) retira as duas promessas ao mesmo
tempo, no começo do ciclo e dentro do mesmo bloqueio de aba:

1. grava `syncCursor = "0"`;
2. apaga o recibo de semeadura (`syncSeedReceipt`);
3. grava `syncReconcileReceipt`, nessa ordem — se a sessão parar no meio, a
   volta seguinte refaz o preparo em vez de considerá-lo feito.

Dentro dela, e **somente** dentro dela, um empate de marca é resolvido a favor
do servidor. No ciclo comum um empate é eco do que este aparelho acabou de
enviar, e reaplicá-lo seria trabalho perdido; numa releitura explícita do zero é
o contrário — para uma marca que este aparelho não autorou, quem tem a versão
boa é o servidor. É isso que torna a reconciliação capaz de REPARAR um registro
que ficou com a marca certa e o conteúdo errado (ver a seção anterior).

O ciclo seguinte então relê a conta inteira e reoferece a base inteira. **Nos
dois sentidos quem decide continua sendo a marca do relógio lógico**, como em
qualquer volta: nada é sobrescrito às cegas, nada é apagado, nada é duplicado. O
efeito é um só — os dois lados voltam a **conhecer** tudo o que o outro tem, e a
mesma regra passa a produzir o mesmo resultado nos dois. É isso que converge.

A ordem importa: a descida acontece **antes** da semeadura, então o aparelho já
chega à reoferta com as marcas do servidor em mãos. Sem isso, um aparelho que
tivesse perdido o mapa local de marcas de configuração (`financas_db_clock`, no
localStorage) cunharia marcas novas e promoveria os próprios valores por cima
dos da conta.

Reler do zero não é caro: o log do servidor é **compactado**, uma linha por
registro, e não o histórico de alterações. O custo é o tamanho da base, uma vez.

Ela roda sozinha **uma vez por conta em cada aparelho** — é o reparo de quem já
divergiu — e sob demanda, pelo botão "Conferir a conta inteira" no cartão de
sincronização da tela de conta. O botão fica sempre visível de propósito: a
pessoa que precisa dele está justamente olhando uma tela que afirma estar tudo
em dia.

Coberto por `tests/test-sync-reconcile.js`.

### Quando o ciclo roda

| Gatilho | Quando |
|---------|--------|
| alteração local | até 1 s depois da última gravação (rajada vira um envio só) |
| login ou recarga | primeira descida durante o bootstrap da conta |
| volta da rede | evento `online`, inclusive para recuperar sessão desconhecida |
| retorno ao app | `pageshow`, foco ou `visibilitychange`, tendo ou não fila para enviar |
| app ocultado | tentativa curta de envio; a fila permanece se a página for interrompida |
| volta periódica | a cada 15 s, **só** com o app à vista |
| nova tentativa | 30 s depois de uma falha de rede |

A volta periódica existe porque os outros gatilhos são todos de **saída**. Sem
ela, dois aparelhos abertos ao mesmo tempo nunca ficavam iguais: quem estava
parado não tinha o que enviar e ninguém ia buscar o que havia chegado. Ela não
avisa a interface quando não encontra novidade, para não reconstruir a tela a
cada consulta de 15 segundos.

### Uma aba por vez

O ciclo roda dentro de um bloqueio nomeado (`navigator.locks`,
`cofre-sync-<escopo>`, com `ifAvailable`). A aba que não obtém o bloqueio
desiste na hora: a outra já está enviando a mesma fila. Entre abas, gravações
são anunciadas por `BroadcastChannel` e a aba avisada **relê o banco** antes de
gravar de novo, para não reescrever por cima do que a outra fez.

As chamadas de conta que podem escrever cookies usam outro bloqueio,
`cofre-account-cookie`. Assim, uma renovação de sessão iniciada numa aba não
consegue responder depois de um login feito em outra e sobrescrever os cookies
novos. Sem Web Locks, a fila equivalente continua valendo dentro da própria aba;
o cabeçalho de conta ainda impede leitura ou escrita no escopo errado.

## Isolamento por conta

Cada conta tem banco local próprio (`financas_db__u_<id>`), fila própria,
relógio próprio e cursor próprio. O escopo `guest` mantém os nomes históricos,
para não migrar quem já usava o app sem conta. Dados de visitante só entram numa
conta após confirmação explícita do usuário.

## Sessão

Toda chamada exige a sessão em cookie HttpOnly, `X-Account-Id`, `X-Device-Id` e
`X-Sync-Protocol`. O cliente também envia `X-Device-Label` e `X-Device-Type`
(`desktop`, `phone`, `tablet` ou `unknown`) como metadados de exibição, sem IP,
modelo exato ou fingerprint. O servidor valida a sessão e compara seu usuário
com `X-Account-Id` antes de consultar aparelho ou dados. O cabeçalho nunca
autoriza sozinho. O `CloudAdapter` ainda aceita Bearer para testes e servidores
compatíveis, mas a publicação usa `authMode: "cookie"`.

Rotas com escopo não consomem refresh token. Quando o access token terminou e
ainda existe refresh, elas respondem `401 session_refresh_required`, sem banco e
sem `Set-Cookie`. O cliente passa pelo único ponto de renovação,
`GET /api/account/session`, confirma a identidade e só então repete a operação.
Se outra aba trocou de conta, `403 account_scope_changed` também não toca nos
dados: a sessão é consultada novamente e o banco local correto é aberto.

Atividade comum só atualiza um aparelho que ainda está ativo e nunca limpa
`revoked_at`. Revogar encerra o acesso remoto daquele aparelho; somente um novo
login explícito pode cadastrar ou reativar o identificador com outro segredo.

## Rotas

| Rota | Método | Função |
|------|--------|--------|
| `/api/sync/health` | GET | confirma protocolo e revisão atual |
| `/api/sync/changes?since=&limit=` | GET | página de operações após o cursor |
| `/api/sync/changes` | POST | envia operações e recebe as pendentes |
| `/api/sync/reset` | POST | "apagar tudo": grava lápide para cada registro vivo |
| `/api/sync/checkpoints` | GET/POST | lista e cria versões restauráveis |
| `/api/sync/checkpoint?id=` | GET | conteúdo de uma versão, paginado |
| `/api/sync/snapshot` | GET | leitura de compatibilidade (contrato 1) |
| `/api/sync/snapshot` | PUT/DELETE | **recusado** (`protocol_upgrade_required`) |

## Envelope

```json
{
  "protocol": 3,
  "serverProtocol": 3,
  "minimumWriteProtocol": 2,
  "status": "applied",
  "revision": "1284",
  "applied": 3,
  "ops": [],
  "hasMore": false,
  "cursor": "1284"
}
```

`revision` é a maior `seq` do usuário. O cliente a trata como cursor opaco.

`protocol` é o ECO da versão que o cliente falou no cabeçalho `X-Sync-Protocol`;
`serverProtocol` é a versão que o servidor implementa. Sem o eco, publicar o
backend novo faria todo aparelho ainda no protocolo 2 recusar as respostas por
"protocolo incompatível" antes mesmo de o aplicativo novo existir nos aparelhos.

## Versões e a janela de atualização

`minimumWriteProtocol` é configuração versionada do backend (`cofre_sync_config`),
igual para todos os usuários. Durante a transição ela vale `2`: o servidor ainda
aceita esse formato quando o chamador já cumpre o contrato de isolamento por
conta. No corte ela passa a `3`, e uma escrita abaixo do mínimo recebe **HTTP
426** com `protocol_upgrade_required`.

426, e não 409: o cliente trata 409 como conflito de documento, e descartaria a
fila. Com 426 ele para o motor, mantém a fila local intacta e sobe tudo assim que
o aplicativo for atualizado. Leitura continua permitida em qualquer versão.

## Entidades (protocolo 3)

Nove coleções sincronizam POR REGISTRO: `transactions`, `categories`, `goals`,
`assets`, `accounts`, `creditCards`, `accountTransfers`, `cardPayments` e
`accountAdjustments`.

As cinco últimas viajavam como uma lista inteira dentro de `settings`. Duas
contas criadas em aparelhos diferentes disputavam a MESMA chave, e uma delas
sumia. Um cliente 3 não pode mais enviar `settings/accounts` e afins; um cliente
2 ainda pode, durante a transição, e cada registro é resolvido pela própria
`rev`.

## Vínculo com condição de revisão

O primeiro lote do vínculo automático (dados criados antes do login entrando numa
conta que nunca foi usada) leva `expectedRemoteRevision` no corpo. O banco compara
a revisão sob bloqueio antes de aplicar; se a conta tiver avançado no intervalo,
responde **409 `remote_changed`** com a revisão observada no corpo.

Esse é o único 409 que o cliente NÃO trata como conflito de documento: o diário e
a fila do vínculo continuam intactos, o envio daquele lote para, e a decisão volta
para a pessoa como confirmação de mesclagem.

## Concorrência e repetição

- `Idempotency-Key` obrigatório em toda gravação, igual ao `mutationId` do
  corpo. Divergência entre os dois é recusada com `400`.
- Repetir a **mesma** mutação devolve a revisão original sem gravar de novo
  (`status: "replayed"`).
- Repetir o mesmo `mutationId` com conteúdo diferente devolve `409`
  (`idempotency_mismatch`).
- Operação com marca menor ou igual à gravada é ignorada: o servidor guarda a
  **vencedora**, não a última que chegou.
- Aparelho revogado recebe `403` (`device_revoked`) e o cliente volta ao escopo
  visitante sem apagar a fila nem o banco local da conta. Respostas automáticas
  não emitem cookies de exclusão, pois uma resposta antiga poderia apagar um
  login mais novo; logout, exclusão da conta e revogação do aparelho atual são
  os fluxos explícitos que limpam cookies.

## Limites

- 500 operações por lote; o cliente envia 400.
- 64 KiB por operação.
- 1000 operações por página de leitura; o cliente pede 500.
- Lápides são podadas após 24 meses.
- Checkpoints: os 5 mais recentes por conta.

## Exclusão

- **"Apagar tudo" da conta** (`POST /reset`): grava lápide para cada registro
  vivo. As lápides descem para os outros aparelhos, que então apagam. Truncar as
  linhas apagaria só no servidor, e o próximo aparelho a sincronizar devolveria
  a base inteira.

  **`reset_rev` é dominante.** `cofre_reset_data` não copia mais a HLC do
  aparelho que pediu: ela calcula, sob o mesmo lock de `cofre_sync_state` que
  serializa `cofre_apply_ops`, o sucessor da maior marca já gravada na conta
  (`cofre_hlc_successor`), considerando puts **e** lápides antigas. Antes, um
  aparelho com o relógio adiantado podia ter escrito acima da lápide, rejeitar
  a exclusão e devolver o registro na edição seguinte. A marca resultante fica
  em `cofre_mutations.result_hlc`, para que o replay do mesmo `mutation_id`
  devolva a mesma barreira em vez de uma nova.

  **A comparação usa `COLLATE "C"`.** O cliente compara HLC como texto ASCII. A
  collation padrão do projeto não faz parte do protocolo e poderia ordenar
  maiúsculas, minúsculas e pontuação de outro modo, o que faria servidor e
  aparelho escolherem vencedores diferentes para o mesmo par de marcas. Toda
  decisão de vencedor nos RPC fixa a collation.

  **A barreira sobrevive ao purge e ao recarregamento.** O aparelho que pediu a
  exclusão absorve `reset_rev` por `FinanceStore.observeResetRev`, que grava em
  `financas_db_reset_barrier` (por escopo). `purge()` apaga o relógio
  (`financas_db_clock`) de propósito, porque ele descrevia a base removida, mas
  **preserva a barreira**, que descreve as lápides que continuam na conta. Sem
  ela, a exclusão era confirmada, o purge levava o relógio junto e o primeiro
  lançamento criado depois nascia menor que as lápides e sumia no ciclo
  seguinte. `observeResetRev` devolve `false` quando não consegue gravar: sem
  persistência a barreira não sobreviveria ao recarregamento, e quem chamou
  precisa avisar que a preparação local ficou incompleta.
- **Exclusão da conta** (`cofre_purge_account`): remove operações, estado,
  checkpoints e mutações, e revoga todos os aparelhos no mesmo ato, para que
  nenhum consiga gravar de volta depois.
