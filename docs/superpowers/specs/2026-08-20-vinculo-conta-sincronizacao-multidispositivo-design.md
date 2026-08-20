# Vínculo de conta e sincronização entre dispositivos

## Status

Desenho aprovado em 20 de agosto de 2026.

## Problema

O aplicativo separa fisicamente os dados de visitante dos dados autenticados. Quem preenche o aplicativo antes de criar a conta grava no escopo `guest`. Depois do login, o UUID devolvido pelo Supabase abre outro banco, `u_<uuid>`. Essa separação evita vazamento entre contas, mas o vínculo entre os dois escopos depende hoje de uma pergunta frágil.

A pergunta de importação é marcada como respondida no momento em que abre. Se a página for recarregada, o diálogo for fechado ou a pessoa escolher manter separado, não existe outra ação para trazer os dados. O primeiro aparelho continua com o histórico no escopo de visitante, enquanto o segundo abre a conta vazia. A mesma conta parece representar duas bases diferentes.

A investigação encontrou também quatro falhas que impedem tratar o vínculo como concluído:

- a semeadura pode ser marcada como feita mesmo quando a gravação da fila falha;
- erros da fila são convertidos em lista vazia e o estado pode mostrar `synced` sem envio;
- uma alteração local ainda no debounce pode ser sobrescrita por uma descida remota;
- o cursor pode avançar antes de a alteração remota estar gravada localmente.

Contas, cartões, transferências, pagamentos e ajustes trazem outro risco. Essas coleções são hoje enviadas como arrays inteiros dentro de `settings`. Duas inclusões concorrentes em aparelhos diferentes não são unidas; um array inteiro vence o outro. A correção precisa levá-las para operações por registro para cumprir a regra de preservação dos dois lados.

Há ainda dois caminhos de legado. O snapshot do protocolo 1 não é convertido para as operações do protocolo 2, e uma versão nova do aplicativo pode dividir a execução com um pacote anterior mantido pelo service worker.

O domínio da produção não é a causa. `financemanager.dev.br` redireciona para `www.financemanager.dev.br`, e os dois chegam à mesma publicação da Vercel.

## Objetivo

Depois de entrar com uma conta confirmada, todo dado financeiro criado antes do login deve ser vinculado com segurança àquela conta e chegar aos demais dispositivos. O aplicativo só pode declarar a sincronização concluída depois de confirmar a persistência local, a fila e a resposta do servidor.

O cenário de aceite principal é:

1. o aparelho A recebe dados antes de existir uma sessão;
2. a mesma pessoa entra em A;
3. a conta incorpora o conteúdo de visitante sem apagar o que já esteja nela;
4. o aparelho B entra com a mesma conta;
5. A e B convergem para o mesmo conteúdo;
6. fechar e reabrir os dois aparelhos não altera o resultado.

## Fora do escopo

- Compartilhar uma conta financeira entre UUIDs diferentes.
- Unir produção, preview e desenvolvimento, que usam projetos Supabase separados.
- Sincronizar preferências próprias do aparelho, como tema e disposição visual.
- Apagar automaticamente a cópia de visitante depois do vínculo.
- Criar uma interface de resolução manual para toda edição concorrente. A ordem lógica existente continua decidindo conflitos do mesmo registro.

## Decisões

### 1. A identidade canônica continua sendo o UUID

O email serve para autenticar. O dono remoto dos dados continua sendo `session.user.id`, validado pelo servidor. O cliente não enviará um identificador de usuário no corpo de sincronização.

O escopo autenticado continuará sendo derivado como `u_<uuid>`. A correção não juntará os bancos de todos os usuários nem removerá o isolamento atual.

### 2. O vínculo será automático somente quando for seguro

Depois da primeira descida autenticada, o aplicativo calcula se o servidor já tem história:

- revisão remota igual a zero: a conta nunca recebeu uma operação, então os dados de visitante podem ser incorporados automaticamente;
- revisão remota maior que zero: a conta já teve conteúdo, inclusive se hoje restarem apenas exclusões, então o aplicativo pede confirmação para juntar;
- estado remoto desconhecido por falta de rede: o vínculo aguarda. O aplicativo não presume que a conta está vazia.

Essa regra evita que uma base de visitante ressuscite silenciosamente conteúdo apagado de propósito em outro aparelho.

A revisão usada nessa decisão é a observada na conexão, antes de qualquer semeadura ou envio local deste aparelho. Alterações locais não podem fazer uma conta remota vazia parecer previamente usada.

### 3. Juntar nunca significa substituir

O vínculo usa uma mesclagem idempotente. Registros com IDs diferentes entram por união. Registros com o mesmo ID seguem esta ordem:

1. maior `syncRev`, quando os dois lados possuem uma marca válida;
2. lado com `syncRev` válida, quando somente um possui marca;
3. maior `updatedAt`, quando os dois lados possuem data válida;
4. lado com `updatedAt` válida, quando somente um possui data;
5. versão que difere do valor de fábrica, quando somente um lado foi personalizado;
6. conteúdo da conta autenticada, quando não houver prova de que o visitante é mais recente.

O escopo `guest` permanece intacto. Assim, até um conflito sem informação temporal continua recuperável no aparelho de origem.

Configurações financeiras seguem uma lista fechada: `monthlyIncome`, `creditCardLimit`, `budgetSplit`, `budgetAlerts`, `budgetHistory`, `userName`, `emergencyGoalId`, `emergencyMonths`, `marketRates`, `achievements`, `recurringPrefs`, `debtPlan`, `onboarding` e `categoryRules`. Um valor preenchido na conta não é trocado por um padrão do visitante. O valor do visitante completa um campo `null`, `undefined`, texto vazio ou exatamente igual ao resultado correspondente de `defaultData()`. Zero só é tratado como vazio quando também for o padrão daquele campo.

Quando os dois lados diferem do padrão, mapas e históricos usam as funções de mesclagem específicas já existentes; escalares preservam a conta autenticada. Preferências de aparelho, incluindo `theme`, `dashboardLayout` e `dashboardFocus`, consentimentos, notificações, carimbos e metadados de backup não participam da decisão de vínculo.

### 4. A decisão será registrada pelo conteúdo, não pela abertura do diálogo

O marcador atual `asked` será substituído por um recibo com versão e impressão digital do conteúdo de visitante. Estados possíveis:

- `pending`: há conteúdo ainda não vinculado;
- `dismissed`: a pessoa escolheu manter aquela versão separada;
- `linked`: aquela versão foi mesclada, persistida e confirmada pelo servidor.

Abrir ou fechar o diálogo não grava decisão. `dismissed` só nasce de uma escolha explícita. Se o conteúdo de visitante mudar, sua impressão também muda e o aplicativo volta a reconhecer trabalho pendente. A tela de conta terá uma ação permanente para revisar ou executar o vínculo mais tarde.

O recibo é metadado local do escopo autenticado e não sobe para a nuvem. Um novo object store `localMeta`, criado na próxima versão do IndexedDB, guardará `guestLinkReceipt`, `guestLinkJournal`, `syncSeedReceipt` e o registro de recuperação. Ele não fará parte de `load()`, exportação, backup nem geração de operações. No fallback, as mesmas chaves recebem o prefixo do escopo autenticado no `localStorage`.

A impressão será SHA-256 de um JSON canônico, depois de `migrate()`, com objetos ordenados por chave, coleções ordenadas por ID e remoção de `syncRev`, carimbos e campos fora da lista de vínculo. As coleções consideradas são `transactions`, `categories`, `goals`, `assets`, `accounts`, `creditCards`, `accountTransfers`, `cardPayments` e `accountAdjustments`. Categorias iguais às de fábrica não contam; qualquer personalização conta. Se WebCrypto não estiver disponível, o aplicativo não persiste `dismissed` e prefere perguntar novamente a esconder uma mudança.

### 5. Coleções financeiras terão operações por registro

O protocolo 3 acrescentará `accounts`, `creditCards`, `accountTransfers`, `cardPayments` e `accountAdjustments` como entidades de primeira classe. O armazenamento local pode continuar guardando essas listas no store de configurações, mas o diff, a fila, o servidor e os conflitos passam a trabalhar por ID. Remoções ganham operações `delete`; arquivamentos continuam sendo `put` do registro arquivado.

O cliente do protocolo 3 entende temporariamente tanto o array antigo em `settings` quanto as novas operações por registro. Quando os dois existirem, cada registro é resolvido pela própria `rev`. Depois do corte, o servidor recusa gravações do protocolo 2 com `protocol_upgrade_required`; a fila do aparelho antigo fica local até ele carregar a versão nova.

O endpoint de saúde e as respostas de sincronização expõem `protocol: 3` e `minimumWriteProtocol`. Durante a transição, `minimumWriteProtocol` vale 2; no corte, passa a 3. Esse mínimo é configuração versionada do backend, igual para todos os usuários, e o cliente nunca considera `synced` uma fila que o servidor recusou por versão.

## Componentes

### Orquestração de conta em `js/auth.js`

O login passa a ter uma sequência única:

1. confirmar a sessão e obter o UUID;
2. trocar para o escopo autenticado;
3. conectar a sincronização sem semear ainda;
4. concluir a primeira descida e obter a revisão inicial do servidor;
5. reconciliar o conteúdo de visitante;
6. garantir a semeadura do estado final;
7. enviar a fila e aguardar confirmação;
8. registrar o recibo `linked` e mostrar a conclusão.

`offerGuestImport()` deixa de escrever `asked` ao abrir. A responsabilidade será dividida entre leitura do resumo, decisão de interface e execução do vínculo. O resumo contará lançamentos, contas, cartões, transferências, pagamentos, ajustes, metas, patrimônio, renda e configurações financeiras alteradas.

### Persistência em `js/storage.js`

`peekScope()` passará a devolver um resumo completo e a impressão canônica definida acima. Valores de fábrica e campos voláteis não farão uma base vazia parecer preenchida. Uma categoria personalizada, mesmo sem outro dado, torna a base significativa.

`adoptScope()` deixará de usar `replaceAll()`. Ele preparará somente o diff da mesclagem e o gravará pelo mesmo caminho transacional de uma edição comum, sem recarimbar registros inalterados. O escopo de origem continuará preservado. O resultado estruturado terá:

- impressão de origem;
- estatísticas antes e depois;
- conflitos resolvidos;
- confirmação da gravação local;
- operações colocadas na fila.

A operação será idempotente também no nível da fila. Antes de gravar, cria um `linkId` e um diário local com o UUID da conta, a impressão do visitante, a revisão remota de base, as operações e as marcas lógicas já cunhadas. Depois que o diário existe, uma nova tentativa termina aquele mesmo lote e reutiliza as mesmas `rev`, mesmo se outra operação remota chegar no intervalo. Ela não chama `replaceAll()` nem cria versões mais recentes para reivindicar o conflito. Depois da confirmação, o diário vira o recibo `linked`.

### Fila durável em `js/storage.js`

Uma gravação financeira e as operações que a representam precisam ter o mesmo desfecho. No IndexedDB, alterações de dados e inclusão na `outbox` ocorrerão na mesma transação. A promessa de persistência só resolve com sucesso depois de a transação completar.

Entradas da fila aceitarão metadados locais opcionais `linkId` e `seedId`. Eles não viajam para o servidor; servem para saber quais operações pertencem ao vínculo ou à semeadura. A confirmação ocorre quando uma resposta válida reconhece o envio e nenhuma entrada com aquele identificador permanece na fila.

Os métodos de fila deixam de esconder falhas:

- `outboxAppend` falha se nada foi persistido;
- `outboxRead` não transforma erro em `[]`;
- `outboxDrop` só confirma depois de remover as entradas;
- `seedOutbox` só informa quantidade semeada depois de confirmar a inclusão;
- o estado de armazenamento recebe a falha e pode voltar a saudável após uma operação bem-sucedida.

O fallback em `localStorage` usará um registro de recuperação antes de alterar dado e fila. Se houver interrupção entre as duas escritas, a inicialização recompõe a fila a partir desse registro antes de liberar a sincronização. Recibos de vínculo e semeadura ficam no store `localMeta` do escopo e entram no mesmo processo de recuperação.

### Ciclo em `js/cloud-sync.js`

Cada ciclo seguirá esta ordem:

1. `FinanceStore.flush()` grava alterações locais e sua fila;
2. a descida aplica operações remotas e aguarda a persistência local;
3. o cursor avança somente após essa persistência;
4. a subida envia a fila persistida;
5. a resposta é aplicada e persistida antes de remover o que foi confirmado;
6. uma descida final busca páginas que ainda restarem;
7. o estado vira `synced` apenas com fila lida com sucesso e vazia.

O hook `applyRemote` passa a devolver uma promessa e será aguardado. O hook `readLocal`, hoje configurado mas sem uso real, será removido ou usado somente por uma fronteira documentada. Não permanecerá como contrato morto.

A semeadura deixa de depender apenas da existência de lançamentos. Ela considera todo o estado financeiro. O marcador booleano antigo será ignorado uma vez pela versão nova. O recibo novo só será gravado depois de:

- persistir as operações na fila;
- receber resposta válida do servidor;
- aplicar a resposta localmente;
- confirmar que não resta operação daquele lote.

Se qualquer etapa falhar, o recibo continua ausente e a próxima conexão repete a semeadura. Repetir é seguro porque o servidor já ignora uma `rev` menor ou igual.

### Conversão do snapshot remoto

Uma primeira migração SQL preparará o protocolo 3. Ela ampliará a restrição de entidades em `cofre_sync_ops`, atualizará as funções que validam e gravam operações e converterá `cofre_financial_snapshots` somente para usuários que ainda não possuem estado nem operações no log atual.

Cada coleção vira operações `put`. As configurações conhecidas e sincronizáveis viram operações `settings`; campos que o cliente já exclui da nuvem permanecem fora. A migração usa uma marca lógica determinística derivada de `updated_at`, com contador estável, e inicializa a revisão do usuário com a quantidade convertida.

Se já existir qualquer operação do protocolo 2, a migração não toca naquele usuário. Isso impede um snapshot antigo de vencer conteúdo novo. A migração é repetível e não cria linhas duplicadas.

Durante uma versão de transição, backend e cliente 3 leem os dois formatos. Depois que essa versão estiver publicada, uma migração de corte desdobra as linhas antigas de `settings` que guardam listas financeiras em operações por registro. O desdobramento preserva a `rev` da lista e nunca substitui uma operação por registro com marca maior. A mesma etapa publica `minimumWriteProtocol: 3`; a partir daí gravações do protocolo 2 são recusadas. As linhas de lista podem ser removidas em uma migração posterior.

O snapshot antigo permanece durante uma versão de segurança e só poderá ser removido em outra mudança, depois de confirmar a conversão em produção.

### Atualização do aplicativo

A versão do cache será promovida. O HTML passará a referenciar o pacote principal com uma versão de conteúdo, para que uma navegação nova não receba o mesmo endereço estático antigo.

O aplicativo observará `controllerchange`. Antes de recarregar, força `FinanceStore.flush()`, usa uma guarda em `sessionStorage` para não entrar em laço e então abre a versão nova. Se a gravação não puder ser confirmada, mantém a página atual e mostra que há uma atualização pendente.

## Interface

A tela de conta mostrará um cartão de vínculo somente quando houver conteúdo de visitante ainda não tratado.

Conta remota vazia:

- estado `Vinculando dados deste aparelho` durante o processo;
- conclusão com quantidades incorporadas;
- nenhuma pergunta desnecessária.

Conta remota já usada:

- quantidades dos dois lados;
- ação principal `Juntar dados`;
- ação secundária `Manter separados`;
- explicação de que a cópia local não será apagada.

Falha:

- estado `Vínculo pendente`;
- causa segura e acionável;
- botão `Tentar novamente`;
- sincronização não aparece como concluída.

Depois de `dismissed`, a tela mantém a ação `Vincular dados deste aparelho` na área da conta. A pergunta não volta sozinha enquanto a impressão do conteúdo não mudar.

## Tratamento de falhas

- Sem rede antes da primeira descida: não incorpora automaticamente e mantém `pending`.
- Falha ao abrir o escopo de visitante: preserva os dois escopos e informa que a leitura não foi possível.
- Falha ao gravar a conta: não cria recibo nem avança cursor.
- Falha ao gravar a fila: não declara sincronização e repete na próxima tentativa.
- Sessão expirada: mantém dados e fila locais, interrompe o envio e pede novo login.
- Migração SQL ausente: mantém o código `schema_missing` já exibido e não marca vínculo remoto.
- Conflito durante nova tentativa: repete a união por ID, sem duplicar.
- Atualização do service worker durante gravação: aguarda `flush()` antes de recarregar.

## Segurança e privacidade

- O UUID continua vindo somente da sessão validada.
- Nenhum dado de um escopo autenticado é incorporado a outro UUID.
- A incorporação automática só usa o escopo `guest` do mesmo navegador e somente quando o servidor nunca recebeu operações.
- Uma conta remota já usada exige ação explícita.
- Tema, disposição visual, consentimentos e notificações não são usados para decidir nem preencher automaticamente uma conta.
- Diagnósticos mostram contagens, estados e códigos, nunca conteúdo financeiro, token ou segredo de dispositivo.

## Testes

### Unidade e integração local

- resumo reconhece contas, cartões, renda, metas e patrimônio mesmo sem lançamentos;
- valores de fábrica não tornam o visitante significativo;
- fechar o diálogo não grava `dismissed`;
- `dismissed` vale somente para a impressão escolhida;
- mudar o visitante oferece o vínculo novamente;
- conta vazia incorpora automaticamente;
- conta preenchida exige confirmação;
- união preserva IDs diferentes e resolve IDs iguais pela regra definida;
- repetição após interrupção não duplica;
- repetição do vínculo reutiliza as mesmas `rev` e o mesmo `linkId`;
- falha da `outbox` não grava recibo de semeadura;
- erro de leitura da fila não vira `synced`;
- gravação local pendente é concluída antes da descida;
- operação remota é persistida antes de avançar cursor;
- base sem lançamentos é semeada;
- marcador booleano antigo força uma semeadura de reparo;
- fallback recompõe uma transação interrompida;
- categoria personalizada sem lançamentos é reconhecida e vinculada;
- duas contas ou dois pagamentos criados simultaneamente em aparelhos diferentes sobrevivem como operações por registro.

### Dois aparelhos

Um teste de navegador usará dois contextos independentes, IndexedDB real e um servidor de sincronização controlado. Ele cobrirá:

1. dados de visitante em A;
2. login da mesma conta em A e B;
3. convergência inicial;
4. edição em A chegando a B;
5. edição em B chegando a A;
6. fechamento e reabertura;
7. falha temporária da fila e recuperação;
8. alteração local concorrente com descida remota.

### Backend e migração

- snapshot legado vazio não cria operações inúteis;
- snapshot preenchido vira operações uma única vez;
- usuário com log atual não é alterado;
- RLS continua limitando leitura ao `auth.uid()`;
- funções de escrita continuam restritas ao `service_role`;
- a revisão inicial e as sequências convertidas são válidas;
- uma segunda execução da migração não muda o resultado;
- arrays financeiros do protocolo 2 são desdobrados sem vencer operações por registro mais recentes;
- gravação do protocolo 2 é recusada depois do corte, sem apagar a fila do cliente.

### Publicação

- pacote gerado corresponde às fontes;
- versão do cache muda junto com o pacote;
- navegação nova busca o endereço versionado;
- `controllerchange` descarrega gravações antes da recarga;
- produção responde pelo domínio canônico e mantém o redirecionamento atual;
- um teste autenticado opcional confirma ida e volta de uma operação no ambiente publicado sem guardar credenciais no repositório.

## Critérios de aceite

- O cenário principal converge em dois aparelhos sem ação manual quando a conta nunca foi usada.
- Uma conta já usada nunca recebe dados de visitante sem confirmação.
- Nenhuma execução marca `linked` ou `synced` após falha de persistência, fila, sessão ou servidor.
- O conteúdo de visitante permanece recuperável no aparelho de origem.
- Repetir vínculo, semeadura ou migração não duplica registros.
- Dados existentes somente no snapshot remoto antigo aparecem no protocolo atual após a migração.
- A suíte completa, os testes de navegador e as verificações de release passam.

## Publicação e recuperação

1. Aplicar a nova migração no ambiente de homologação.
2. Publicar em homologação backend e cliente capazes de ler os protocolos 2 e 3, com pacote e cache promovidos.
3. Executar o cenário com uma conta de teste em dois contextos.
4. Conferir contagens de snapshots convertidos, operações e erros, sem consultar conteúdo financeiro.
5. Aplicar em produção a preparação de schema e a conversão do snapshot.
6. Publicar em produção o backend compatível e o cliente 3, nessa ordem, e executar a verificação autenticada.
7. Depois da janela de atualização, desdobrar as listas antigas e publicar no backend `minimumWriteProtocol: 3`.
8. Manter `cofre_financial_snapshots` e as linhas de lista antigas durante uma versão de segurança.

Antes do corte do protocolo 3, uma falha permite promover a versão anterior na Vercel. Depois que `minimumWriteProtocol` passar a 3, qualquer retorno deve usar o último cliente compatível com o protocolo 3; voltar ao cliente 2 deixaria todas as gravações pendentes. As migrações não apagam snapshots nem operações mais recentes, e entradas da fila permanecem locais até uma versão compatível voltar a enviá-las.

## Arquivos previstos

- `js/auth.js`
- `js/storage.js`
- `js/cloud-sync.js`
- `js/app.js`
- `js/screens/account.js`
- `js/actions.js`
- `netlify/functions/sync.js`
- `netlify/functions/_shared/finance-schema.js`
- `service-worker.js`
- `index.html`
- `scripts/build-dist.js`, se a versão de conteúdo for injetada no build
- `scripts/check-release.js`
- `scripts/check-deploy.js`
- nova migração em `supabase/migrations/`
- testes de conta, isolamento, sincronização, service worker, navegador e backend
- `docs/SYNC_PROTOCOL.md`
- `docs/BACKEND_SETUP.md`
- `docs/RELEASE.md`
- `CHANGELOG.md`
- `package.json`
