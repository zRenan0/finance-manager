# Histórico de versões

## Não publicado

### O painel dizia quantos lançamentos ficavam de fora do saldo, nunca quanto

- **O saldo em contas e as despesas do mês não fechavam entre si, e nada
  explicava.** Lançamento anterior à data de abertura da conta fica FORA do
  saldo de propósito — o saldo inicial informado já embute o que veio antes
  dele, e somar de novo contaria duas vezes. Mas ele continua entrando em
  "Despesas do mês", logo ali do lado. Quem somava de cabeça concluía, com
  razão, que o aplicativo estava errado. No caso que originou isto eram
  R$ 1.180,45 invisíveis.
- **A regra não mudou; o silêncio, sim.** A tela de Contas já avisava QUANTOS
  ficaram de fora. Faltava o que permite julgar: QUANTO. Com a contagem sozinha
  ninguém sabe se são R$ 5 ou R$ 1.180.
- **`accountPreOpeningEffect` espelha `accountBalance` regra por regra, ao
  contrário**, e as duas moram lado a lado de propósito: se um dia a regra do
  saldo mudar e esta não, o aviso passa a mentir — e aviso que mente é pior que
  aviso nenhum.
- **O aviso agora aparece nos três lugares**: no painel, junto do número que
  causa a dúvida; na linha da conta, com o valor e o que fazer a respeito
  (corrigir a data de abertura ou o saldo inicial); e na explicação do cálculo,
  que deixa de ser uma premissa genérica e passa a trazer o número do dia.
- **Compra no cartão não entra na contagem**: ela nunca reduziu o saldo da
  conta, então anunciá-la como "fora do saldo" seria explicar errado.
- Regressão travada no bloco F-05 de `tests/test-beta-fixes.js`.

### A causa de verdade: a normalização apagava o vínculo do lançamento com a conta

- **O relato era "a mesma conta mostra saldos diferentes em cada navegador".** Os
  dois aparelhos tinham os MESMOS 21 lançamentos, o MESMO cursor e a fila vazia.
  Não faltava registro nenhum: faltava o `accountId` deles num dos lados.
- **`migrate()` zerava a referência para uma conta ausente**, em
  `js/storage.js`. No disco, com a base completa, isso é saneamento correto.
  Durante a sincronização é destruição — e não por acaso: no vínculo do
  visitante a ordem é GARANTIDA. O ciclo desce primeiro (chegam os lançamentos,
  apontando para a conta do banco) e só depois o "juntar dados" traz a conta.
  Nesse intervalo todos eles perdiam o vínculo.
- **O estrago não era perder o vínculo; era GRAVAR o registro mutilado COM A
  MARCA DO SERVIDOR.** A partir daí dois aparelhos carregavam a mesma marca com
  conteúdos diferentes, e a comparação de marcas — que é toda a defesa do
  protocolo — não enxerga: `>` é falso entre iguais. Cada um mostrava um saldo,
  os dois diziam "Tudo sincronizado", nenhum tinha o que enviar, e nada no
  funcionamento normal desfazia isso.
- **Agora o alvo ausente fica guardado em `pendingAccountId` e volta sozinho**
  assim que a conta aparece. Para as cerca de sessenta leituras espalhadas pelo
  app nada muda: `accountId` continua nulo enquanto a conta não existe, que é
  exatamente o que elas já tratavam.
- **`legacyCashBalance` passou a contar o que NENHUMA conta reivindica.** A
  condição era `!t.accountId`, e isso deixava um buraco: um lançamento apontando
  para conta que este aparelho ainda não tem não entrava em conta nenhuma e
  também não entrava ali — sumia do saldo sem deixar rastro.
- **A reconciliação passou a aceitar empate de marca.** Numa releitura explícita
  do zero, para uma marca que este aparelho não autorou, quem tem a versão boa é
  o servidor. É o que permite REPARAR quem já está corrompido; no ciclo comum o
  empate continua sendo ignorado, porque ali ele é eco do próprio envio.
- **Regressão travada em `tests/test-sync-reconcile.js`**, que reproduz a ordem
  exata do vínculo (lançamento antes da conta) e confere que os dois aparelhos
  chegam ao mesmo saldo.
- **Limite conhecido:** transferência, conciliação e pagamento de fatura
  continuam sendo descartados pelo normalizador quando a conta deles não existe.
  Como o registro some por inteiro (em vez de ficar mutilado com a marca certa),
  a releitura do zero o traz de volta — e o teste cobre esse caminho.

### A mesma conta mostrava saldos diferentes em cada navegador

- **O ciclo incremental não tem como se corrigir sozinho, e essa era a causa.**
  O cursor promete "já apliquei tudo até aqui" e o servidor nunca reenvia o que
  ficou atrás dele; o recibo de semeadura promete "já ofereci minha base
  inteira" e a fila nunca reapresenta o que já foi confirmado. Basta uma
  operação escapar uma vez — uma marca recusada por um registro local gravado
  com o relógio adiantado, uma gravação que o navegador desfez por cota, uma aba
  fechada entre a resposta do servidor e o disco — para as duas promessas
  passarem a mentir, e nada no funcionamento normal desfaz isso. O aparelho
  ficava atrasado para sempre, sem sinal nenhum: a tela dizia "Tudo
  sincronizado", porque do ponto de vista dele era verdade.
- **A reconciliação completa retira as duas promessas ao mesmo tempo.** Zera o
  cursor e apaga o recibo de semeadura; o ciclo seguinte relê a conta inteira e
  reoferece a base inteira. Nos dois sentidos quem decide continua sendo a marca
  do relógio lógico, então nada é sobrescrito às cegas: o efeito é só um, os
  dois lados voltam a CONHECER tudo o que o outro tem, e a mesma regra passa a
  produzir o mesmo resultado nos dois. Não é caro, porque o log do servidor é
  compactado: uma linha por registro, não o histórico de alterações.
- **Ela roda sozinha uma vez por conta em cada aparelho.** É o reparo de quem já
  divergiu antes desta versão. O recibo fica no banco local, então isso não se
  repete a cada entrada.
- **E fica à mão, no cartão de sincronização, como "Conferir a conta inteira".**
  O botão precisa existir justamente porque a pessoa que precisa dele está
  olhando uma tela que afirma estar tudo em dia.

### "Juntar dados" mudava só o aparelho onde foi clicado

- **O lote do vínculo podia ficar parado na fila.** Com o portão da subida já
  aberto e um ciclo em curso, `finishAccountBootstrap` DEVOLVIA a promessa desse
  ciclo em vez de pedir outro, para economizar uma volta de rede. Só que quem a
  chama depois de "Juntar dados" acabou de gravar na fila, e o ciclo em curso
  podia já ter passado da subida. O resultado era exatamente o relato: o saldo
  somava aqui, a tela mostrava "Vínculo pendente" e nos outros aparelhos não
  aparecia nada. Agora ela sempre pede um ciclo novo; `syncNow` já agenda UMA
  reexecução compartilhada quando há ciclo em curso, então continua barato.

### Entrar na conta leva para o Início

- **A tela de entrar deixou de ser o destino de quem acabou de entrar.** O
  login terminava no mesmo lugar onde começou, com o formulário trocado por
  "Conta conectada", e era preciso ir ao menu para ver o próprio dinheiro.
- **A troca acontece depois de a sessão, o escopo e a decisão de vínculo
  terminarem**, e não no instante em que o servidor responde: assim o Início já
  abre com os dados da conta, e não com o banco vazio deste aparelho.
- **Com uma exceção, de propósito.** Se o cartão do vínculo estiver perguntando
  ("Trazer os dados deste aparelho?") ou pendente, a tela fica: essa pergunta só
  existe ali, e levar a pessoa embora esconderia a decisão que o app precisa que
  ela tome.

### Faturas e extratos em PDF agora entram no app

- **A importação aceita PDF com texto selecionável.** A leitura usa PDF.js do
  próprio site e acontece somente no navegador. Arquivos escaneados recebem uma
  mensagem específica, sem envio para OCR ou qualquer serviço externo.
- **Santander é reconhecido desde a primeira versão.** O leitor identifica
  fatura ou extrato, encontra linhas por data e valor e também possui uma leitura
  por estrutura para PDFs digitais de outros bancos.
- **A revisão exige o destino correto.** Fatura vai para um cartão escolhido e
  extrato vai para uma conta escolhida. Compras, entradas e estornos conservam
  seus efeitos corretos nos saldos, nas faturas e nas análises.
- **PDF protegido pode ser aberto com senha.** A senha permanece apenas na
  memória até a leitura terminar ou ser cancelada.

### A fatura do cartão parava de virar receita

- **"Pagamento recebido" não é dinheiro entrando.** Na fatura do Nubank (e de
  qualquer cartão), o pagamento do mês anterior aparece como CRÉDITO, com essa
  descrição. O importador lia o número positivo e gravava receita: o mês fechava
  com uma entrada que nunca existiu, o saldo mentia, a taxa de poupança mentia e
  o Score subia por causa de uma dívida paga. `classifyStatementRow` (js/rules.js)
  reconhece a linha e a tela de revisão a traz DESMARCADA, com a frase que
  explica o motivo. A mesma descrição no extrato da CONTA continua entrando como
  saída, porque ali o dinheiro sai de verdade.
- **"Valor pendente do mês anterior" também vem desmarcado.** É o saldo rolado
  da fatura: aquele gasto já foi contado no mês em que aconteceu, e importá-lo
  de novo cobraria a pessoa duas vezes pela mesma compra.
- **Multa, juros e IOF continuam entrando.** São gasto de verdade. O que mudou é
  que agora eles têm categoria explicada ("Tarifas, juros e encargos do banco")
  em vez de cair em "Outros" sem motivo aparente.
- **A caixa de revisão limpa o que já entrou.** Quem importou a fatura antes
  disso tem receitas que nunca existiram no histórico. A pendência
  "Pagamento de fatura contado como receita" aparece no topo da caixa de revisão,
  com o botão que exclui o lançamento depois de confirmar. Receita digitada à mão
  nunca é apontada: aquilo foi decisão da pessoa.

### O importador passou a entender o nome do estabelecimento

- **O ruído do banco sai antes da comparação.** `statementMerchantCore` tira o
  verbo ("COMPRA CARTAO", "PIX ENVIADO"), a máscara do cartão, o prefixo da
  maquininha ("PAG*", "IFD*"), a data, a parcela e a UF do fim. "COMPRA CARTAO
  5678 PAG*PADARIA DO ZE 12/08 SP" e "Compra com Cartão - 24/08 - Padaria do Zé"
  viram a mesma chave. "UBER *TRIP" é preservado: ali o asterisco tem espaço
  antes, e "uber" é o estabelecimento, não o código da maquininha.
- **O app lembra do que você já corrigiu.** Categoria escolhida à mão (lançamento
  manual ou categoria editada depois) vira memória por estabelecimento e volta
  como sugestão de confiança alta no mês seguinte, com a explicação "você já
  classificou este lugar assim". Voto manual pesa 4; palpite automático pesa 1,
  para o motor não repetir o próprio erro com mais confiança. Empate real não
  sugere nada. Regra escrita à mão continua acima de tudo.
- **O dicionário de fábrica dobrou de tamanho.** Farmácias, supermercados,
  companhias de energia e saneamento, corretoras, faculdades, streamings,
  aplicativos de transporte e as maquininhas mais comuns do país. Duas novas
  regras: "Compras e varejo" e "Tarifas, juros e encargos do banco".
- **Dois enganos frequentes deixaram de acontecer.** "Mercado Livre" e "Mercado
  Pago" não são mais supermercado, e "água mineral" comprada no mercado não vira
  conta de água. A abreviação "MERC", que aparece em metade dos mercados de
  bairro, passou a ser entendida.
- **A tela de revisão diz de onde veio cada palpite.** Antes ela calculava a
  confiança da sugestão e não mostrava nada. Agora cada linha traz o motivo
  ("Delivery de comida", "sua regra", "você já classificou este lugar assim"), que
  é o que permite corrigir de uma vez, criando uma regra, em vez de corrigir todo
  mês.

### Extrato em PDF

- **`js/pdf.js` escreve o formato à mão, sem biblioteca e sem rede.** O arquivo
  com todos os gastos da pessoa não pode passar por um servidor só para virar
  PDF. Usa as fontes base-14 (nada embutido, poucos KB), WinAnsiEncoding para o
  português inteiro e um byte por caractere, que é o que mantém o índice `xref`
  do arquivo correto em descrição com acento.
- **Sai o que está na tela.** O botão fica ao lado dos filtros em Movimentações e
  respeita período, busca, tipo, categoria, conta e origem; o cabeçalho do
  documento escreve por extenso o recorte aplicado. Ajustes também tem o botão,
  junto dos outros exportadores.
- **O documento tem cabeçalho com o resumo do período, tabela com dia,
  descrição, categoria, conta e valor, saídas por categoria e rodapé numerado**
  em todas as páginas, com a ressalva de que é documento de conferência e não
  substitui o extrato oficial do banco.
- **Regressão travada em `tests/test-pdf-export.js`:** 44 verificações, entre
  elas a que confere, byte a byte, se cada deslocamento do `xref` cai no começo
  do objeto que promete. É a falha que só apareceria abrindo o arquivo.

### O botão de cadastrar deixou de parecer quebrado

- **A tela agora vai até o formulário.** Em Patrimônio, "Cadastrar o primeiro
  item" fica depois do gráfico, da comparação anual e da leitura do período,
  enquanto o formulário nasce no TOPO da tela. Como `render()` refaz o DOM e o
  navegador mantém a rolagem onde estava, a pessoa clicava, nada se mexia, e a
  conclusão razoável era que o botão não funcionava. `state.revealTarget` marca o
  bloco e `afterRender` leva a tela até ele, pondo o cursor no primeiro campo.
- **Vale uma vez só.** `render()` roda a cada tecla digitada; rolar a tela a cada
  letra seria pior que o defeito original.
- **O mesmo conserto alcança os outros cadastros com o mesmo formato:** dívidas
  (incluindo registrar pagamento), investimentos, contas, cartões e
  transferências.
### O aparelho que só baixava volta a enviar

- **O portão da subida não fica mais preso.** `CloudSync.prepareAccount()` fecha
  a fila de propósito enquanto a decisão de vínculo não sai, para o próprio
  aparelho não preencher a conta e depois concluir que ela já estava em uso. A
  sequência em `js/auth.js` desiste em cinco pontos quando outra entrada, uma
  troca de escopo ou uma renovação de sessão assume no meio, e todos os cinco
  desistiam DEIXANDO O PORTÃO FECHADO. Dali em diante o aparelho aplicava o que
  os outros escreviam, mostrava "Tudo sincronizado" e não enviava mais nada, nem
  naquela sessão nem no dia seguinte: só recarregar a página ou sair da conta
  reabria a fila. No banco de produção isso aparecia como um aparelho ativo
  havia quatro dias, com sessão válida, e zero operações gravadas. A liberação
  agora acontece no `finally` de `bootstrapAccountLink`, então caminho novo
  acrescentado depois já nasce coberto.
- **Portão fechado deixou de ser "Tudo sincronizado".** Com a fila segurada, o
  ciclo desce e para; a fila podia estar vazia só porque a semeadura ainda não
  tinha rodado. O estado agora é "pendente" enquanto o portão estiver fechado.
- **O motor tem gatilho próprio de volta ao aplicativo.** `visibilitychange`,
  `pageshow`, `online` e `focus` passam por `CloudSync` diretamente, e não
  apenas pela camada de conta, que dedupla por 750 ms, compartilha promessa com
  a recuperação de sessão e exige sessão ativa. Além de sincronizar na hora, a
  volta rearma o intervalo de 15 s, que o navegador congela em aba escondida.
- **Regressão travada em `tests/test-auto-sync-session.js`, seção 8.** Um
  cenário abandona o vínculo no meio da preparação e confirma que a fila foi
  liberada; o outro confirma que o caminho normal libera uma vez só, para a rede
  de segurança não virar um ciclo extra em toda entrada.

### "Apagar conta" deixa de parecer quebrada

- **O painel não se fecha mais sozinho.** Ele era um `<details>` nativo, e
  `render()` refaz o DOM inteiro. Como a tela de conta se redesenha por conta
  própria (volta periódica da sincronização, atualização da lista de aparelhos,
  qualquer aviso), o formulário sumia no meio da digitação da senha. O
  aberto/fechado passou para `state.accountDangerOpen`, como já acontecia com os
  tópicos de Ajustes. Fechar o painel também limpa a senha digitada.
- **O aviso nasce ao lado do botão.** Clicar sem preencher tudo escrevia em
  `state.account.error`, desenhado no rodapé da tela, depois de todos os
  cartões: para quem estava olhando o botão, nada acontecia. Agora a mensagem
  aparece dentro do próprio painel e diz o que falta, senha ou frase.
- **A confirmação explica por que o botão está desligado.** A frase continua
  exigindo a caixa exata, que é parte da trava de uma ação irreversível, mas o
  campo passou a trazer uma linha dizendo o que libera o botão. Antes ele ficava
  cinza em silêncio, e o campo da tela anterior converte para maiúsculas
  sozinho, o que ensinava que minúsculas serviriam.
- **`tests/test-render.js`** deixou de exigir `<details>` e passou a exigir o
  cartão com `aria-expanded` e o corpo recolhido por `hidden`.

### Seis defeitos de tela vistos em prints de iPhone

- **O atalho "Ir para o conteúdo" ficava colado no alto da tela.** Ele é um
  `.skip-link`: mora acima da borda e desce quando recebe foco. No celular,
  encostar num link dá foco a ele, e a partir daí TODO render devolvia o foco
  pelo seletor `[data-action="skip-to-content"]`. A pilha verde se instalava por
  cima do relógio e do conteúdo e atravessava telas e minutos, sem jeito de
  fechar. Um controle que só serve de trampolim deixou de ser reencontrado
  depois do render; onde o navegador sabe distinguir a origem do foco, o toque
  também não o revela mais; e ele passou a respeitar o recuo da barra de status.
- **A data de conclusão da meta quebrava no meio do número.** `.goal-eta` é
  `display: flex`, e cada pedaço de texto solto vira um item separado: o texto
  antes do `<b>`, o `<b>` com a data e o texto depois viravam três colunas lado
  a lado. Saía "25/06/20" numa linha e "27" na seguinte, com "(10 meses)." numa
  terceira coluna. A frase virou um `<span>` único. O mesmo defeito existia no
  aviso de saldo negativo do calendário, corrigido junto.
- **A caixa de marcar da lista de movimentações virava um bloco preto.** A regra
  de alvo de toque esticava `min-height: 44px` em toda `input`, e uma
  `input[type=checkbox]` de 19px era deformada para 19x44. Caixas e botões de
  rádio saíram da regra: o alvo de 44px vem do `.movement-check` em volta, que
  já centraliza o controle.
- **O valor da movimentação caía solto embaixo da descrição.** No celular ele
  desce para a segunda linha de propósito, porque a descrição precisa da largura
  inteira, mas ficava encostado à esquerda e puxado por uma margem negativa: lia
  como mais uma linha de detalhe. Agora alinha à direita, no fim da mesma coluna
  da descrição. O marcador da busca também encolheu, porque
  "Buscar descrição, valor, conta ou origem" era cortado no meio da palavra; o
  texto inteiro continua no `aria-label` e no `title`.
- **As ações do topo de Notificações nunca tiveram estilo.** Sem regra, o botão
  ficava `inline-block` e o `svg { display: block }` da base empurrava o rótulo
  para a linha de baixo: saía um ícone solto em cima e o texto embaixo. Elas
  passaram a usar o mesmo desenho de `.hero-action`, já aplicado nos outros
  cartões escuros.
- **A tela de origens gastava meia rolagem com três números.** Os cartões de
  resumo empilhavam na largura inteira, um por linha; agora vêm em duas colunas,
  e o ímpar sozinho fica com a linha toda. O estado de cada origem (selo,
  contagem e data) era uma pilha recuada que não parecia pertencer à linha de
  cima; virou uma legenda em linha só.

### O cartão de apagar conta quebrado no Safari

- **A grade saiu do elemento de controle.** Além de deixar de ser `<details>`, o
  cabeçalho do cartão passou a montar a grade num `<span>` interno. Era esse o
  motivo de o cartão aparecer desmontado no iPhone: o Safari ignorava o
  `display` pedido no elemento de controle, a grade não valia, título e
  subtítulo saíam grudados ("Apagar conta e dadosExclua a conta...") e cada
  ícone caía numa linha própria, com o triângulo nativo do `<details>` à mostra.

### Varredura de layout no celular

- **A etiqueta de assinatura empurrava a tela inteira.** `.sub-chip` junta data,
  nome e valor numa linha com `nowrap` e não tinha teto de largura: um nome
  comprido passava de 400 px num aparelho de 375 px. A página ganhava rolagem
  lateral e a barra de navegação de baixo, que mede a largura em porcentagem, ia
  junto e saía da tela. Agora a etiqueta tem `max-width` e reticências.
- **A porcentagem da regra de orçamento aparecia cortada.** Em 320 px o nome do
  grupo consumia a linha e espremia `.split-bar-row__pct` para 4 px, com "50%"
  cortado ao lado do rótulo. Ela deixou de encolher; quem cede espaço é o nome.
- **O resto da varredura passou limpo.** As 23 rotas foram medidas em 375 px e
  em 320 px, com nomes longos, valores de sete dígitos, contas, cartões e
  transferências, procurando rolagem lateral, texto cortado, alvo de toque
  pequeno e conteúdo escondido atrás da barra de baixo. Fora os dois itens
  acima, nada estourou.

### A conta sincroniza sem depender da tela de sincronização

- **Gravações passam a subir em até um segundo.** A fila continua no IndexedDB
  quando a rede falha e uma tentativa curta também acontece ao ocultar o app.
- **O outro aparelho busca mudanças sozinho.** Login, recarga, volta da rede,
  `pageshow`, foco e retorno à aba disparam uma descida. Com o app visível, a
  consulta periódica caiu de 60 para 15 segundos.
- **Falha temporária de sessão não vira logout.** O estado fica desconhecido,
  preserva o banco da conta e tenta se recuperar nos eventos do navegador. O
  botão manual não aparece no caminho saudável; depois de uma falha, continua
  disponível como tentativa imediata.
- **Consulta de sessão não fica pendurada para sempre.** Cabeçalhos e corpo da
  resposta têm limite de 12 segundos. Depois disso, o app preserva a conta
  local, libera a tentativa compartilhada e volta a consultar na recuperação.
- **O adaptador envia nome e tipo em toda rota de sincronização.** Isso impede
  que a atividade comum substitua o nome legível por "Este dispositivo" e
  permite distinguir computador, celular, tablet e navegador desconhecido.

### "Apagar tudo" vence toda versão anterior, inclusive depois de recarregar

- **O servidor carimba a exclusão acima de toda a conta.** `cofre_reset_data`
  calcula `reset_rev` com `cofre_hlc_successor` sobre a maior marca já gravada,
  puts e lápides antigas incluídos, em vez de copiar a HLC do aparelho que
  pediu. Antes, um aparelho com o relógio adiantado podia ter escrito acima da
  lápide, rejeitar a exclusão e devolver o registro na edição seguinte. A marca
  fica em `cofre_mutations.result_hlc`, então o replay do mesmo `mutation_id`
  devolve a mesma barreira.
- **A comparação de marcas no PostgreSQL usa `COLLATE "C"`.** O cliente compara
  HLC como texto ASCII; a collation padrão do projeto não faz parte do protocolo
  e poderia ordenar maiúsculas, minúsculas e pontuação de outro modo, fazendo
  servidor e aparelho escolherem vencedores diferentes para o mesmo par.
- **A barreira do reset sobrevive ao purge e ao recarregamento.** A marca
  dominante pode nascer mais de 24 h à frente do relógio local, que é justamente
  o caso recusado pelo teto do caminho remoto comum. Ela passa agora por
  `FinanceStore.observeResetRev`, que não aplica o teto e grava em
  `financas_db_reset_barrier`, chave que `purge()` preserva de propósito. Sem
  isso, a exclusão era confirmada, o purge apagava o relógio junto com os dados
  e o primeiro lançamento criado depois nascia menor que as lápides e sumia no
  ciclo seguinte. O teto de 24 h continua valendo em `observeRemoteRev` e nas
  operações remotas comuns.
- **O contador de seis dígitos passou a virar.** Ao absorver uma barreira com o
  contador cheio, somar um produzia sete dígitos, marca fora do padrão que o app
  trata como ausência de marca e que perderia para qualquer lápide. Agora o
  contador zera e o milissegundo avança um, igual ao `cofre_hlc_successor`.
- **A regressão está travada em `tests/test-cloud-sync.js`, seção 24.** O
  cenário usa `resetRev` 48 h à frente com o contador em `999999`, confirma a
  exclusão, faz o purge, recarrega num contexto novo com o mesmo `localStorage`
  e exige que o próximo `mintRev()` seja maior que a barreira e continue no
  formato válido da HLC.

### Revogar acesso passou a encerrar a sessão de verdade

- **Atividade comum nunca mais limpa uma revogação.** O carimbo de último acesso
  exige aparelho, segredo e `revoked_at` vazio na mesma atualização. Se outro
  aparelho revogar no intervalo, zero linhas são alteradas e a chamada antiga é
  recusada.
- **Só um novo login explícito reativa o aparelho.** Ele rotaciona o segredo e
  registra novamente o acesso. Conta, sincronização e análise recusam os cookies
  antigos; respostas automáticas não apagam um login mais novo por `Set-Cookie`
  atrasado.
- **A lista mostra somente acessos ativos e confirma a revogação no banco.** Um
  alvo ausente ou já revogado não devolve mais sucesso falso. A migração
  `20260825001552_add_device_type.sql` adiciona o tipo com uma lista fechada de
  valores e leitura limitada à coluna necessária.
- **Uma consulta antiga não recoloca o acesso revogado na tela.** A confirmação
  do PATCH volta a filtrar a lista depois de qualquer refresh que já estivesse
  em andamento.

### A tela de acessos ganhou hierarquia e ações mais seguras

- **Cada tipo tem ícone e cor próprios.** O extrato mostra contagem ativa,
  horário, selo "Este aparelho" e uma linha visual entre os acessos. O aparelho
  atual não oferece a ação de revogar.
- **Revogados somem e cada ação diz o que faz.** "Atualizar" e "Revogar acesso"
  deixam de depender de ícones sem texto, com alvos de toque de pelo menos 44 px
  no celular.
- **Apagar conta começa recolhido.** A área destrutiva não domina mais a tela e
  só expõe senha e confirmação depois de ser aberta.
- **"Apagar só aqui" agora encerra a sessão antes do purge.** Se o logout não
  for confirmado, nada local é removido. Se a troca para visitante falhar após
  sair ou excluir a conta, o snapshot financeiro antigo deixa de ser renderizado.

### Abas diferentes não misturam contas nem sobrescrevem login

- **Toda rota autenticada recebe `X-Account-Id`.** O backend compara a identidade
  esperada com a sessão antes de consultar dispositivo, sincronização ou análise.
  Uma aba antiga falha fechado e nunca aplica dados no banco local de outra conta.
- **Apenas `/api/account/session` renova o refresh token.** As demais rotas
  respondem `session_refresh_required` sem tocar no banco ou nos cookies; o
  cliente confirma a sessão e repete somente para a mesma identidade.
- **Chamadas que alteram cookies são serializadas entre abas.** O Web Lock
  `cofre-account-cookie` impede uma renovação antiga de responder depois de um
  login novo. Ciclos, cursores, fila, reset e restauração também carregam geração
  e escopo, então respostas atrasadas são descartadas.
- **Operações locais também ficam presas ao escopo em que começaram.** Recarga
  entre abas, gravação pendente, restauração de backup, limpeza e inicialização
  não podem terminar usando o adaptador de uma conta aberta depois. Uma
  restauração de versão também para sem alterar nada se a paginação travar ou
  exceder o limite seguro.
- **Restauração não pode ficar pela metade.** O estado restaurado e a fila que o
  envia aos outros aparelhos são gravados juntos. A paginação usa entidade e id
  no cursor, e uma leitura atrasada da mesma conta não apaga uma edição feita
  enquanto o banco estava sendo relido.
- **Edição durante sincronização não some.** Descida, semeadura e vínculo do
  visitante preservam uma alteração que chegue enquanto o IndexedDB grava. Uma
  ação da tela antiga também é recusada enquanto o banco da nova conta abre, sem
  criar mirror nem dados no escopo novo.
- **Cada aba tem um desempate próprio no relógio lógico.** Duas gravações do
  mesmo navegador, no mesmo milissegundo e contador, não recebem mais a mesma
  revisão. Marcas antigas continuam sendo reconhecidas como pertencentes ao
  aparelho.

### A suíte de navegador parou de falhar em cascata ou conforme o dia

Os dois primeiros defeitos estavam no teste. A run remota revelou um terceiro
no aplicativo, durante a primeira instalação do PWA.

- **A escolha de categoria agora termina antes de salvar.**
  `escolherPrimeiraCategoria(page)` toca o primeiro chip e, quando ele abre a
  folha de subcategorias, escolhe a primeira opção e espera a folha sair do DOM.
  Antes, o teste deixava o modal aberto na página compartilhada e uma falha
  derrubava os casos seguintes.
- **A compra parcelada sempre cria uma fatura pagável.** O cenário declara
  fechamento no dia 20 e vencimento no dia 28, e registra a compra no dia 1 do
  mês atual. A fatura continua no mês atual qualquer que seja o dia da execução,
  sem mudar a regra que esconde o pagamento de faturas futuras.
- **A primeira instalação não apaga mais o onboarding.** O primeiro
  `clients.claim()` do service worker assume a aba e dispara `controllerchange`,
  mas não está trocando um pacote antigo. O aplicativo recarregava mesmo assim
  e perdia o aceite do passo 1. Agora essa primeira tomada de controle preserva
  a página; uma substituição posterior continua terminando gravações e
  recarregando com a guarda por versão. O cache passou para v54.
- **A falha do onboarding ganhou localização e estado.** O cenário aguarda o
  primeiro controller e confirma que o aceite sobreviveu. Se um passo voltar a
  bloquear, a mensagem informa viewport, passo, motivo, campos presentes e
  estado de recarga, em vez de esperar 30 segundos sem dizer onde parou.
- **A verificação local terminou verde.** Passaram `npm run build`,
  `node scripts/lint.js`, `node tests/run-all.js` e
  `node tests/browser/run-browser.js`; a última suíte de navegador terminou com
  12 de 12 cenários aprovados.

### Entrar na conta parou de duplicar a conta do banco

Relatado no beta: "cadastrei uma conta de banco, mas duplicou na hora que fiz
login". A sincronização não tinha culpa; ela funde por id e nunca duplicou nada.
A culpa era da tela que aparecia logo depois do login.

- **Entrar numa conta não é mais lido como primeiro uso.** O banco local de uma
  conta nasce vazio neste aparelho, e o conteúdo dela só chega depois da
  primeira descida. O aplicativo olhava esse vazio, concluía "primeiro uso" e o
  assistente de quatro passos tomava a tela inteira pedindo nome, renda e conta
  do banco de novo. Quem respondia terminava com duas contas do mesmo banco: a
  que desceu da nuvem e a que acabara de digitar. Agora o assistente fica
  segurado enquanto a entrada na conta não termina, e o conteúdo que desce da
  conta o fecha por conta própria. Abrir o aplicativo já dentro de uma conta
  segue a mesma regra.
- **O assistente ganhou "Já tenho conta".** Ele cobria a tela inteira e não
  oferecia nenhum caminho para entrar numa conta existente: quem instalava o
  aplicativo num aparelho novo era obrigado a INVENTAR renda e conta do banco
  antes de chegar na tela de login, e o que inventava virava um segundo cadastro
  ao lado do que a conta já tinha. O botão leva direto para "Conta e acesso" e
  não grava configuração nenhuma; só o aceite legal, que é do aparelho e nunca
  sobe para a conta.
- **Instantâneo de orçamento do mês deixou de contar como conteúdo a vincular.**
  A migração cria um automaticamente para qualquer base que ainda não tenha
  nenhum. Ele sozinho fazia um aparelho recém-aberto parecer cheio, e a entrada
  na conta mostrava o pedido de "juntar dados" sem haver nada para juntar. Agora
  só conta o mês em que alguém definiu teto, mudou a regra de divisão ou mexeu
  nos avisos.

### O assistente de boas-vindas parou de tomar a tela sozinho

O conserto acima criou um defeito pior que o original, relatado em vídeo no
mesmo dia. A liberação do portão espera `finishAccountBootstrap`, que roda um
ciclo de sincronização inteiro: uma ida e volta na rede. Quem entrava numa conta
ainda vazia via o painel carregar, navegava para o Início, e **dois segundos
depois** o assistente aparecia por cima, sem nenhum clique, como se o aplicativo
tivesse esquecido que a pessoa acabara de entrar e sincronizar.

- **Uma tela em uso não é mais tomada.** Um clique ou uma tecla registram que a
  tela passou para as mãos da pessoa; a partir daí nenhuma promessa de rede que
  resolve tarde pode abrir o assistente por cima do que ela está fazendo.
- **O assistente é a primeira execução DO APARELHO, não DA CONTA.** Dentro de
  uma conta ele não abre mais, nem com o aplicativo recém-aberto: o banco local
  de uma conta pode estar vazio apenas porque a descida ainda não veio, e
  "conta vazia" nunca foi motivo para um formulário de tela cheia. Quem entra
  numa conta sem configuração vê o aplicativo vazio e refaz a configuração pelo
  botão de Ajustes, quando quiser.
- **Fechar continua livre.** O dado que desce da conta pode provar que a
  configuração já existe, e isso vale a qualquer momento, com o app em uso ou
  não. O que a liberação perdeu foi só o poder de ABRIR.

### Dá para excluir uma conta do banco e um cartão

- **Arquivar era a única saída, e ela não resolve cadastro repetido.** Conta
  arquivada continua na tela, continua no total de contas e continua no seletor
  de conciliação. Quem cadastrou a mesma conta duas vezes não tinha resposta
  nenhuma dentro do aplicativo. Cada linha de conta e cada cartão ganharam
  exclusão, e arquivar continua oferecido na mesma caixa de confirmação para
  ninguém apagar movimento por falta de alternativa à vista.
- **Nada de histórico é apagado junto.** Lançamento e cartão perdem o vínculo e
  continuam existindo: o lançamento volta a contar como histórico sem conta, na
  mesma linha "Histórico anterior" que a tela já mostrava. Transferência,
  conciliação e pagamento de fatura não existem sem a conta que os originou e
  saem junto, cada um com lápide própria, senão o outro aparelho os devolveria
  na sincronização seguinte.
- **A confirmação diz em número o que vai acontecer** antes de qualquer coisa
  sair: quantos lançamentos perdem o vínculo, quantas transferências e
  conciliações somem, e que as faturas pagas por aquela conta voltam a aparecer
  em aberto. No cartão, que as compras passam a sair do saldo em contas na data
  em que foram feitas.
- **A mesclagem passou a respeitar a lápide das cinco coleções de conta.**
  `mergeBackupInto` aplicava o cemitério em lançamento, categoria, meta e
  patrimônio, mas não em conta, cartão, transferência, pagamento e conciliação.
  Sem isso, a conta excluída voltava a existir na primeira restauração de backup
  ou no vínculo dos dados de visitante, e a exclusão parecia não ter funcionado.


### Escolher a regra x/x/x passou a criar orçamento de verdade

- **A configuração inicial semeia um teto por categoria.** Escolher
  "50 / 30 / 20" no quarto passo gravava três percentuais e mais nada: nenhuma
  categoria ganhava teto, então o motor de `js/budgets.js` (faixas de 80% e
  100%, projeção de ritmo, cartão de orçamentos) ficava dormindo até a pessoa
  digitar limite por limite na mão. A sugestão automática que já existia não
  ajudava no primeiro dia porque depende da média dos três meses anteriores, e
  no primeiro dia não existe mês anterior. Agora a cota de cada grupo é
  distribuída entre as categorias principais dele e vira teto na conclusão.
- **A prévia fica no próprio passo 4, aberta a um toque.** A conclusão grava
  valor que o usuário não digitou; ele precisa ver o que vai acontecer antes de
  concluir, não descobrir depois. Os números aparecem como ponto de partida do
  aplicativo, não como regra de mercado, e cada linha continua editável em
  Categorias.
- **O que já tem teto é intocável, e o valor dele sai da cota do grupo.** Com
  Moradia em R$ 2.000 dentro de uma cota de R$ 3.000, as outras dividem os
  R$ 1.000 que sobraram. Sem esse desconto, a semeadura proporia um orçamento
  que estoura a renda no papel antes de qualquer gasto. Refazer a configuração
  por Ajustes também não atropela limite digitado à mão.
- **Só categorias principais recebem teto.** O gasto de uma subcategoria já
  conta para o teto da mãe; semear as duas criaria dois limites medindo o mesmo
  gasto e o total do cartão contaria em dobro.
- **Quem pulou o assistente, ou já usava o aplicativo, tem o mesmo cálculo.** A
  lente "Tetos" da tela de Categorias ganhou um convite que aparece só quando há
  o que sugerir, some sozinho quando não há, e nunca sobrescreve limite
  existente.
- **`splitMoneyByWeights` em `js/utils.js`.** Rateio ponderado com a garantia do
  `splitMoney`: a soma das fatias é exatamente o total. Arredondar cada linha em
  separado faria a lista de tetos não fechar com a cota que a mesma tela acabou
  de exibir. O desempate é determinístico, para dois aparelhos sincronizados não
  divergirem um centavo sem que nada tenha mudado.

### Revisão de segurança feita antes da publicação

Nada nesta seção muda o que o aplicativo faz; muda o que ele permite que façam
com ele.

### A força bruta de senha deixou de ter saída fácil

- **A contagem de tentativas não é mais endereçável por quem tenta.** O
  limitador lia a ponta ESQUERDA de `x-forwarded-for`, que por definição é o que
  o cliente alegou antes de encostar em qualquer proxy nosso: bastava mandar um
  endereço diferente a cada tentativa para o teto nunca fechar. Agora vale o
  cabeçalho que a plataforma escreve (`x-vercel-forwarded-for`) e, na falta
  dele, a ponta DIREITA da lista, que é a que o último proxy escreveu.
- **Teto por CONTA, além do teto por endereço.** Contar por endereço não
  protegia conta nenhuma contra um ataque distribuído, e ainda fazia todo mundo
  atrás do mesmo CGNAT dividir as mesmas 30 tentativas. `login`, `register`,
  `recover` e `resend` agora consomem também um balde de 10 tentativas por 10
  minutos por endereço de email. O email não é gravado: entra como HMAC com
  segredo do servidor, junto com o nome do balde.
- No `login` o teto é cobrado **antes** de falar com o Supabase, então a
  tentativa recusada não custa uma ida à rede.

### O link do email não pode mais ser redirecionado por quem pede

- **A origem do link deixou de sair do cabeçalho da requisição.** `Host` e
  `X-Forwarded-Host` são escolhidos por quem chama. Um `curl` com
  `X-Forwarded-Host: dominio-falso` fazia o Supabase enviar para a vítima um
  email VERDADEIRO, com o nosso remetente e a nossa marca, apontando para o
  domínio de quem pediu. O PKCE segurava o roubo do código; o phishing já tinha
  saído assinado por nós.
- Quem decide agora é `canonicalOrigin()`: só passa origem que `ALLOWED_ORIGIN`
  já reconhecia, e host inventado cai para a primeira da lista. Pré-visualização
  continua servindo a si mesma. Sem a variável configurada, o comportamento é o
  de antes — por isso **`ALLOWED_ORIGIN` deixou de ser opcional em produção**
  (ver docs/BACKEND_SETUP.md).

### A política de conteúdo fechou a porta de saída

- **`connect-src` deixou de ser "qualquer HTTPS".** As outras diretivas tornam a
  injeção difícil; esta decidia o que aconteceria se ela ocorresse mesmo assim,
  e a resposta era "o extrato sai para qualquer lugar do mundo". A única saída
  legítima do aplicativo é a consulta da NFC-e nos portais estaduais, que já
  valida host por conta própria; a política passou a repetir esse limite onde o
  navegador consegue impor: `connect-src 'self' https://*.gov.br`.
- **HSTS declarado.** Não existia em lugar nenhum do projeto. A plataforma
  costuma pôr sozinha, e é exatamente por isso que a ausência passava
  despercebida: ninguém confere o que acredita que vem de graça.
  `npm run check:deploy` passou a conferir o cabeçalho no site publicado.

  Vale só para o domínio principal: sem `includeSubDomains` e sem `preload`.
  Os dois ampliam a promessa para terreno que este repositório não conhece, e
  a assimetria pesa. Ampliar depois é editar uma linha; estreitar exige servir
  `max-age=0` e esperar cada visitante voltar para receber a correção, um a um.

### Higiene

- **Contador morto removido de `analyze.js`.** O `Map` em memória ficou órfão
  quando a cobrança passou para o banco, e órfão é pior que ausente: quem
  abrisse o arquivo para ajustar o limite mexeria num código que não roda e iria
  embora achando que tinha mudado alguma coisa.
- **Comparação do segredo do dispositivo em tempo constante** (`timingSafeEqual`
  em vez de `===`). Pela rede o vazamento é quase ruído puro; a troca custa uma
  função e tira o assunto da mesa.

## 0.30.0

Entrar com a mesma conta em dois aparelhos passou a mostrar o mesmo conteúdo.
O aparelho que já era usado sem conta guardava os dados num banco de visitante;
o login abria um segundo banco, vazio, e nada ligava um ao outro. A pergunta de
importação existia, mas gravava "já perguntei" no instante em que a caixa abria:
quem fechasse sem responder perdia o caminho de volta para sempre.

### O vínculo acontece, e é seguro

- **Vínculo automático quando a conta nunca foi usada.** A decisão usa a revisão
  do servidor OBSERVADA na conexão, antes de qualquer envio deste aparelho.
  Revisão zero significa uma conta que nunca recebeu uma operação, e só nesse
  caso os dados de visitante entram sozinhos.
- **Conta com história pede confirmação.** As opções são `Juntar dados` e
  `Manter separados`. Nenhuma delas substitui ou apaga um dos lados: registros
  com IDs diferentes entram por união, e no mesmo registro vence a marca do
  relógio lógico, depois `updatedAt`, depois a personalização, e por fim o
  conteúdo que já estava na conta.
- **A cópia de visitante permanece.** Ela nunca é apagada pelo vínculo, então
  qualquer conflito continua recuperável no aparelho de origem.
- **A decisão é registrada pelo CONTEÚDO.** Um recibo com a impressão SHA-256
  canônica do que existe no visitante substituiu o marcador antigo. Abrir ou
  fechar a caixa não grava nada; `Manter separados` grava, e vale só para aquele
  conteúdo. Se o visitante mudar, a impressão muda e o aplicativo volta a
  reconhecer trabalho pendente. A tela de conta mantém a ação de vincular.
- **Repetir não duplica.** Um diário local guarda o `linkId` e as marcas já
  cunhadas: uma queda no meio do vínculo termina o MESMO lote na volta seguinte,
  em vez de criar uma segunda versão dos mesmos registros.

### "Sincronizado" passou a exigir prova

- **Dado e fila gravam juntos ou falham juntos.** A alteração financeira e as
  operações que a representam agora entram na mesma transação do IndexedDB. No
  fallback em `localStorage`, um registro de recuperação recompõe a gravação
  interrompida na abertura seguinte.
- **A fila deixou de esconder falha.** Erro de leitura não vira mais lista
  vazia, e erro de inclusão não vira sucesso. Era isso que permitia a tela dizer
  "Tudo sincronizado" com a fila cheia.
- **O ciclo tem ordem fixa:** terminar as gravações locais, descer, semear,
  subir, aplicar a resposta, confirmar a fila, descer de novo. O cursor só
  avança depois de a operação remota chegar ao disco, e o estado só vira
  `synced` depois de uma leitura da fila que funcionou e voltou vazia.
- **A semeadura considera a base inteira.** Quem cadastrou só a conta do banco,
  só o cartão ou só a renda era tratado como base vazia e não subia nada. O
  marcador booleano antigo deixou de valer como recibo, o que libera a
  reparação de quem sincronizou antes de as tabelas existirem no banco.

### Protocolo 3: as coleções financeiras sincronizam por registro

- **Contas, cartões, transferências, pagamentos e conciliações** eram enviadas
  como uma lista inteira dentro de `settings`. Duas contas criadas em aparelhos
  diferentes disputavam a lista, e uma delas sumia. Agora cada uma é uma
  entidade com ID próprio, com operação `put` e `delete` individuais.
- **Transição sem quebra.** O servidor fala 3 e ECOA a versão do cliente;
  `minimumWriteProtocol` vale 2 durante a janela de atualização, e uma escrita
  abaixo do mínimo recebe HTTP 426 (não 409, que o cliente trata como conflito
  de documento e descartaria a fila). Uma migração de preparação converte o
  snapshot antigo apenas para quem ainda não tem operações no log.

### Atualização do aplicativo

- **Módulos publicados levam o SHA-256 no nome** e o service worker guarda
  exatamente esses nomes, então uma navegação nova não recebe metade de cada
  versão.
- **A troca de controller espera a gravação.** O aplicativo pergunta ao worker
  novo qual pacote ele é, força `FinanceStore.flush()` e só então recarrega, uma
  vez por pacote. Se a gravação não confirmar, a página fica e o aviso diz que a
  atualização está pendente.

## 0.29.3

Os dois aparelhos passaram a mostrar os mesmos valores. Duas falhas somadas
faziam a conta parecer sincronizada sem estar: a base que já existia no
aparelho nunca subia, e quem ficava com o app aberto nunca descia nada.

### A base anterior à conta agora sobe

- **Semeadura na primeira volta.** A fila de envio só recebia DIFERENÇA: ela é
  montada comparando a gravação com a anterior. Quem já usava o app antes de
  criar a conta, restaurou um backup, ou usou enquanto o servidor estava fora
  do ar, não produzia diferença nenhuma depois disso, e a base inteira ficava
  invisível para o servidor. O segundo aparelho entrava na mesma conta e via
  tudo zerado.
- **E nada denunciava.** O cartão da conta dizia "Tudo sincronizado", porque a
  fila estava mesmo vazia. Não havia erro para mostrar; havia ausência.
- **A semeadura roda depois da descida, e só uma vez por conta no aparelho.**
  Ela não inventa marca: reapresenta cada registro com a que ele já tem, e o
  servidor continua guardando a vencedora. Só cunha marca nova para o que nunca
  passou por uma gravação local. Se o servidor estiver sem nenhuma operação e o
  aparelho tiver base, ela roda de novo - é o caso de quem tentou sincronizar
  antes de as tabelas existirem no banco.
- **O padrão de fábrica fica de fora.** Um celular recém-conectado tem as mesmas
  categorias iniciais e as configurações zeradas de qualquer instalação.
  Anunciar isso com marca nova faria ele vencer e apagar, no computador, a
  categoria renomeada e a renda preenchida. O que ainda está como veio de
  fábrica não é notícia, e o silêncio preserva o que o outro aparelho tem.
- **Restaurar backup também viaja.** `replaceAll` troca a base inteira sem
  passar pelo diff, então restaurar um backup, desfazer uma restauração ou
  adotar os dados de visitante mudava só o aparelho que fez. Agora cada registro
  recebe marca nova e o que sumiu vira lápide, como já acontecia ao restaurar
  uma versão guardada na nuvem.

### Com o app aberto, o outro aparelho aparece sozinho

- **Volta periódica de um minuto.** O motor só tinha gatilho de saída: alteração
  local, volta da rede, retorno à aba COM fila pendente. Faltava o de entrada.
  Com o app aberto nos dois lados, quem lançava no celular não via nada mudar no
  computador até recarregar a página. A volta só acontece com o app à vista,
  para não gastar bateria em segundo plano, e não redesenha a tela quando não
  encontra novidade.
- **Voltar ao app busca o que chegou.** A condição antiga (`state.pending`) só
  deixava passar o aparelho que tinha algo a enviar, que é justamente o que não
  precisava do gatilho: quem ficou parado é quem está desatualizado.

### Testes

- `tests/test-cloud-sync.js` ganhou três cenários: a base anterior à conta
  chegando ao segundo aparelho, o aparelho novo e vazio que não pode apagar o
  que o outro tem, e a restauração de backup propagando a exclusão.

## 0.29.2

O link do email de confirmação passou a apontar para o domínio do produto, em
vez do domínio do Supabase. Resolve dois problemas que tinham a mesma raiz: o
email caindo em spam, e a confirmação que só funcionava no navegador que
cadastrou.

### O link do email agora é do nosso domínio

- **Nova rota `POST /api/account/verify`.** Ela recebe o `token_hash` que o
  próprio link carrega e o troca por sessão em `/auth/v1/verify` do Supabase.
  É o mesmo caminho que o `verifyOtp({ token_hash, type })` do supabase-js usa.
- **Confirmar deixou de depender do aparelho.** O caminho anterior devolvia um
  `code` que só vira sessão com o verificador PKCE, e o verificador é um cookie
  do navegador que pediu o link. Cadastrar no computador e abrir o email no
  celular, que é o caso comum, não concluía. O `token_hash` viaja dentro do
  link e não guarda estado deste lado, então vale em qualquer aparelho.
- **Remetente e link no mesmo domínio.** O modelo padrão do Supabase aponta
  para `SEU-PROJETO.supabase.co`, enquanto o email sai do domínio do produto.
  Filtro de spam lê essa combinação como phishing, e era o que sobrava depois
  de SPF e DKIM já estarem corretos.
- **O token não fica na barra de endereços.** Ele confirma uma conta, então é
  apagado da URL junto com o resto do retorno, e não entra no histórico nem no
  próximo `Referer`.
- **O caminho antigo continua atendido.** A rota `exchange` não foi removida:
  os links que já saíram usam ela, e quebrá-los seria trocar um defeito por
  outro. O aplicativo tenta o `token_hash` primeiro e cai no `code` depois.
- **A rota valida antes de repassar.** O tipo do link sai de uma lista fechada
  e o formato do token é conferido, porque os dois vêm do endereço que a pessoa
  clicou. Confirmação que volta sem sessão é tratada como link gasto, e não
  como login concluído.

### Documentação

- `docs/BACKEND_SETUP.md` ganhou os modelos de email prontos, com
  `{{ .TokenHash }}`, e a instrução de publicar um registro DMARC, que faltava.

## 0.29.1

Correção do cadastro por email e do diagnóstico da sincronização. Três defeitos
que se combinavam: o email não chegava, a confirmação não valia nada, e a falha
de sincronização não dizia a causa.

### A confirmação de email passou a valer

- **Conta sem email confirmado não entra e não sincroniza.** O servidor nunca
  olhava para `email_confirmed_at`: a tela pedia a confirmação e, logo depois,
  entrar funcionava do mesmo jeito. Quem decidia era uma chave do painel do
  Supabase que o aplicativo não enxerga, então a mesma versão do código se
  comportava de dois jeitos opostos conforme o projeto. Agora `login`, `session`
  e tudo que exige sessão respondem `403 email_not_confirmed` enquanto a
  confirmação não acontecer.
- **Existe como reenviar a confirmação.** Não havia saída para o email que não
  chega: cadastrar de novo devolve a mesma resposta opaca que o Supabase dá
  para endereço já cadastrado, e nenhum link novo sai. A tela de conta passou a
  ter um cartão de confirmação pendente com o botão de reenvio.
- **A frase do cadastro cobre os dois desfechos.** Dizia só "Confira seu email
  para confirmar o cadastro". Para um endereço que já tem conta, essa mesma
  resposta vem sem que nenhum email seja enviado, e a pessoa ficava esperando
  para sempre. Agora a tela diz as duas saídas sem revelar qual delas é a sua.

### O link do email parou de morrer sozinho

- **O cookie do fluxo PKCE durava 10 minutos; o link do email dura 24 horas.**
  Quem abrisse o email um pouco mais tarde recebia "Link expirado ou inválido"
  para um link ainda perfeitamente válido. O prazo agora acompanha o do provedor.
- **Abrir o link no celular deixou de virar erro falso.** O email é confirmado
  pelo servidor do Supabase antes do redirecionamento; o que não vem junto é a
  sessão, porque o verificador PKCE mora no navegador que começou. A tela agora
  diz "Email confirmado. Entre com seu email e senha para continuar." em vez de
  acusar um link quebrado que não está quebrado.
- **Link expirado ou já usado é dito como tal**, na query ou depois do `#`.

### O erro do Supabase chega traduzido, não apagado

- Todo `4xx` virava a mesma frase, "A operação foi recusada.". Isso apagava
  justamente a informação que resolve o problema: falha de SMTP, teto de envio
  de email, senha errada e migração não aplicada chegavam idênticos. A tradução
  é uma lista fechada; o que não está nela continua genérico, para não vazar
  detalhe interno do provedor.
- **A falha de envio de email passou a ser dizível.** É o caso mais comum de "o
  email não chega" (SMTP ausente, ou o serviço embutido do Supabase, que só
  entrega para membros da organização do projeto).

### A sincronização diz por que falhou

- **A razão da falha vinha no corpo da resposta e era jogada fora.** O cliente
  só olhava o número do status, então a tela mostrava "Sincronização com falha"
  e parava aí. Agora repete o motivo que o servidor mandou, mostra o código da
  falha e oferece **Tentar de novo**, botão que só existia com o motor ligado,
  justamente o estado que a falha mais comum desliga.
- **Migração não aplicada é reconhecida pelo nome.** Rodar só a primeira
  migração é o erro mais fácil de cometer na instalação, e ele não aparece na
  tela de entrar: login e cadastro funcionam, porque usam outra tabela. A falha
  agora diz que faltam as tabelas e aponta `supabase/migrations`.
- Erro de instalação parou de ser retentado a cada 30 segundos, o que só
  escondia a causa.
- `docs/BACKEND_SETUP.md` passou a listar as **três** migrações obrigatórias,
  com o que quebra sem cada uma, e a exigir SMTP próprio antes de convidar
  qualquer pessoa.

## 0.29.0

Auditoria de preparação para o beta público. Esta versão corrige defeitos que
mudavam números na tela do usuário e que faziam dados sumirem ou reaparecerem.

### Isolamento por conta

- Cada conta passou a ter banco, espelho, fila e relógio próprios. Antes havia
  um banco por navegador: duas contas no mesmo aparelho liam e gravavam os
  mesmos registros, e sair da conta não removia nada.
- Quem usa o app sem conta continua com os dados no lugar de sempre; nada é
  migrado. Trazer esses dados para uma conta exige confirmação explícita.
- Apagar a conta apaga também a cópia local dela.

### Sincronização

- O ciclo deixou de trocar a base inteira e passou a enviar apenas o que mudou.
  Acabou o teto prático de 6 MiB, e o custo por ciclo passou a ser proporcional
  à alteração, não ao tamanho da base.
- Exclusão feita num aparelho agora vale nos outros e não volta na sincronização
  seguinte.
- Dois gastos iguais no mesmo dia não desaparecem mais. O app descartava
  lançamentos "parecidos" (mesma data, valor, categoria e descrição), o que
  apagava despesas repetidas legítimas.
- Relógio errado no aparelho deixou de decidir conflito. Vence quem escreveu
  depois de ver a alteração do outro, mesmo com a hora atrasada.
- O que não subiu fica numa fila que sobrevive ao fechamento da aba.
- Duas abas abertas não se sobrescrevem mais.
- "Apagar tudo" com conta conectada apaga em todos os aparelhos, com a opção de
  apagar só neste e desconectar.
- Versões restauráveis da base ficam guardadas no servidor.

### Números do mês

- Guardar dinheiro deixou de contar como gasto. Um aporte de R$ 500 numa meta
  aparecia como despesa, e o mês parecia ruim justamente quando a pessoa poupou.
- Pagar dívida foi separado entre amortização (troca dívida por patrimônio) e
  juros e tarifas (custo real).
- Estorno deixou de virar renda; ele desconta do gasto original.
- Transferência entre contas próprias não é gasto nem renda.
- Renda planejada, realizada e projetada viraram três números distintos. No dia
  3 do mês, o app dizia "você poupou 96%" comparando o gasto de três dias com a
  renda planejada do mês inteiro.
- Score, conquistas, saúde e orçamento passaram a comparar apenas dados do mesmo
  período, e a dizer quando o mês ainda está em andamento.
- A tela de lançamento ganhou o campo "tipo de movimento" para marcar estorno,
  transferência e juros.

### Cálculos

- Cartão: o rotativo passou a durar um ciclo de fatura, como manda a regra, e o
  simulador segue para o parcelamento. O teto legal de 100% de encargos vale
  para a soma das duas fases, e a soma das parcelas agora fecha com o total.
- Consórcio: saiu o desconto de 0,8% ao mês que não vinha de lugar nenhum e o
  "CET" calculado a partir dele. Entraram reajuste da carta, seguro, fundo de
  reserva, lance em prazo ou parcela e três cenários de contemplação.
- Dívidas: o saldo passou a crescer pela taxa do contrato, não pelo CET (que
  inclui IOF e tarifas já pagas e inflava a dívida). Quitação antecipada calcula
  o valor presente das parcelas restantes. Cronogramas Price e SAC.
- Investimentos: rentabilidade por XIRR e TWR, considerando a data de cada
  aporte. Antes, quem aportou há cinco anos e quem aportou ontem apareciam com a
  mesma rentabilidade.
- Imposto de renda contado em dias reais de calendário. Uma aplicação de 24
  meses caía na faixa de 17,5% por causa de meses de 30 dias; o prazo real leva
  à faixa de 15%.
- Aposentadoria com juro real negativo deixou de prometer renda maior do que a
  sustentável.
- `docs/FONTES-FINANCEIRAS.md` registra a fonte, a vigência e a premissa de cada
  cálculo.

### Privacidade e segurança

- As fontes deixaram de vir do Google: o app não envia mais o IP do usuário a um
  terceiro a cada abertura.
- Exportação para CSV neutraliza fórmulas. Uma descrição começando com `=` era
  executada ao abrir a planilha.
- Datas impossíveis (31 de fevereiro) deixaram de ser aceitas; elas caíam no mês
  seguinte e mudavam totais.
- A senha sai da memória do aplicativo assim que o servidor responde.
- O limite de tentativas passou a ser compartilhado entre instâncias e a
  sobreviver a reinício; a identidade é guardada em hash.
- Restauração de backup tem limite de tamanho e de registros.
- Na análise com IA, o pacote enviado deixou de ser chamado de anônimo (ele leva
  nomes de categorias e metas), ganhou prévia e permite ocultar campos. O modelo
  não devolve mais nota, e deixou de ser obrigado a apontar riscos quando não há.
- A política de privacidade voltou a descrever o app real. Ela ainda afirmava
  que a sincronização não estava ativa e que a tipografia vinha do Google; as
  duas coisas mudaram e o texto não tinha acompanhado.
- A tela de Privacidade passou a trazer identificação do controlador, canal de
  atendimento, prazos de retenção de cada dado, os direitos do titular do
  art. 18 e o canal para incidentes do art. 48. Os campos que dependem do dono
  do aplicativo (CNPJ, endereço, encarregado) aparecem como "Ainda não
  definido", em vez de serem preenchidos por suposição.
- Os termos de uso deixaram de ser três parágrafos e passaram a cobrir escopo,
  responsabilidades, disponibilidade, limite de responsabilidade, propriedade,
  encerramento, lei e foro.
- Trocar a versão do texto legal não apaga mais o aceite anterior: ele fica
  registrado no aparelho, e a tela mostra o que já havia sido aceito.
- A análise com IA passou a mostrar o pacote de verdade antes de enviar. O app
  prometia que você veria os dados que sairiam do aparelho, e o que aparecia
  era um parágrafo descrevendo o pacote. Agora a prévia traz o JSON que vai
  sair, o número de campos e o tamanho.
- Na mesma prévia dá para tirar os nomes das categorias, os nomes e valores das
  metas, o histórico e as regras de orçamento antes de enviar. A escolha fica
  salva e também pode ser feita em Privacidade.

### Página comercial

- O domínio passou a abrir na página comercial. A raiz é reescrita para
  `landing.html` (`vercel.json`, `scripts/serve.js` e o servidor da suíte
  fazem a mesma coisa) e o aplicativo continua em `/index.html`, byte por byte
  no mesmo endereço: `start_url` do manifesto, cache offline e todos os links
  `index.html#/rota` seguem valendo.
- O service worker ganhou um cache separado para páginas que não são o shell.
  A raiz saiu da definição de shell; sem isso, abrir a página comercial uma vez
  faria o aplicativo abrir offline mostrando o folheto, sem a rede poder
  corrigir. Cache promovido para v49.
- Estouro horizontal no celular corrigido na causa: uma regra de empilhamento
  aplicava `position: relative` a todo filho do `<body>` e vencia o
  `position: fixed` da doca de CTA, que passava 12px da janela a 390px. As
  etiquetas da seção do problema também eram largas demais entre 861 e 1120px.
- A seção "Quatro telas resolvem o mês inteiro" ganhou composição própria no
  celular. O painel fixo do desktop sai de cena e cada etapa carrega o próprio
  recorte de tela, logo abaixo do texto que ele ilustra; a sobreposição deixou
  de ser possível por construção, com ou sem JavaScript.
- As duas famílias de fonte declaradas em `css/landing.css` apontavam para
  arquivos que nunca existiram no repositório. As referências saíram e a página
  usa uma pilha do sistema escolhida, com tamanho e espaçamento ajustados.
- Saiu da interface pública: a seção que anunciava não haver depoimento, os
  cartões de depoimento vazios, o plano com preço `XX,XX` e a promessa de
  "menos de 2 minutos", que não tem medição por trás. A estrutura de prova
  social continua no código, dentro de um `<template>` desligado.
- Preços passou a ter uma oferta só, que é o que existe hoje: beta aberto,
  grátis, com a ressalva de que qualquer mudança comercial será comunicada
  antes de cobrança.
- Nova faixa de confiança logo abaixo do hero e nova ordem da narrativa: os
  nove simuladores saíram da abertura e entraram depois do produto, como
  diferencial. A altura da página no celular caiu cerca de 20%.
- Custo de pintura reduzido em ponteiro grosso (mesclagem, borrão e
  `backdrop-filter`), laços decorativos pausados fora da tela e `will-change`
  só nas seções próximas da janela.
- Correção de centralização na causa: o reset de tipografia estava escrito
  como `.lp h2` / `.lp ul`, que vale mais que qualquer regra de componente de
  uma classe só e zerava as margens delas. O fechamento da página aparecia
  254px fora do centro ao lado de botões centralizados, a faixa de confiança
  saía 120px à esquerda, o parágrafo do hero 140px, e todo respiro vertical
  declarado entre kicker, título e texto de abertura simplesmente não existia.
  O reset passou a ter especificidade zero, com `:where()`.
- As duas linhas de gráfico desenhadas por `stroke-dasharray` apareciam
  PARTIDAS em pedaços soltos de 768px para cima: `vector-effect:
  non-scaling-stroke` desfaz a normalização de `pathLength`, e o tracejado
  passava a ser medido em pixels de tela. O efeito saiu das duas.
- Sem JavaScript, a maquete do produto nascia oca: gráfico vazio, anel da meta
  sem arco, toda barra de categoria num trilho vazio ao lado do valor em
  reais, e a barra fixa do topo flutuando transparente por cima do conteúdo.
  Os estados finais passaram a valer quando o atributo de movimento não está
  no documento, que é o caso dos três cenários já previstos: sem script, com
  movimento reduzido e com o trinco do `landing-boot.js` desistindo.
- Os dois cartões flutuantes do hero pousavam em cima de número: um cobria
  "8,4% nos últimos 6 meses", o outro cobria três valores de categoria, em
  todas as larguras entre 1121 e 1920px. O da esquerda desceu para a única
  faixa livre; o da direita passou a pender para fora do palco quando há
  folga e sai de cena abaixo de 1300px, onde não há.
- Título da seção da planilha deixava "trabalho" sozinho numa linha, e o do
  FAQ deixava "faz". Os H2 ganharam quebra equilibrada.
- A suíte `tests/test-landing.js` nunca chegou a executar: uma quebra de linha
  literal dentro de uma expressão regular a fazia falhar na carga. A suíte de
  navegador media a sobreposição da história contra `.lp-step p`, que também
  casa com as legendas de dentro do próprio recorte de tela; virou
  `.lp-step > p`. E a captura por seção esperava 450ms num encadeamento que
  termina em 1900ms, o que rendia imagem de meio caminho para a revisão.
- O aplicativo parou de pedir arquivo de fonte que não existe. `css/base.css`
  declarava `@font-face` com `url("../fonts/inter-400.woff2")` e
  `url("../fonts/space-grotesk-500.woff2")`, e a pasta sempre esteve vazia:
  eram duas requisições 404 por abertura para quem não tivesse as famílias
  instaladas, com a pilha do sistema assumindo no fim de qualquer jeito. As
  duas famílias passaram a ser resolvidas só por `local()`, como já era na
  página comercial. Quem tem Inter ou Space Grotesk instaladas continua
  vendo as duas; ninguém mais paga por requisição que não podia dar certo.
- Travessões removidos de `service-worker.js`, `js/landing.js` e
  `js/landing-boot.js`, que reprovavam `tests/test-input-validation.js`.
- Testes novos: `tests/test-landing.js` na suíte padrão e
  `npm run test:landing` no navegador, com varredura de largura de 1920 a
  360px, sobreposição, menu, ausência de recurso 404 e capturas por seção.

### Publicação

- `npm start` sobe o app. A instrução de abrir o `index.html` com duplo clique
  saiu: ela nunca funcionou nesta versão.
- Só a pasta `dist/` vai para o ar. Antes a raiz inteira era publicada,
  incluindo testes, documentação interna e as migrações do banco.
- A página comercial e os arquivos dela entram no `dist/`, e o build reescreve
  `canonical`, `og:url` e `og:image` para endereço absoluto quando a publicação
  informa o domínio (`VERCEL_PROJECT_PRODUCTION_URL` na Vercel, ou `SITE_URL`).

#### `npm run check:deploy`: conferência do roteamento da publicação

- Sobrou exatamente uma coisa que `npm test`, `check:release` e `build:dist`
  não alcançam: o roteamento da Vercel. Todos eles leem o repositório e param
  onde a plataforma começa. `scripts/check-deploy.js` faz as requisições
  contra uma publicação real e confere o que só existe lá: que `/` entrega a
  página comercial, que `/index.html` entrega os mesmos bytes do repositório
  (por sha256) sem virar desvio, que os cabeçalhos de segurança vieram, que as
  funções não respondem 404 nem 500, e que `tests/`, `docs/`, `supabase/`,
  `scripts/` e `package.json` não estão no ar.
- Ele também cobre o erro mais silencioso da migração: `ALLOWED_ORIGIN` com o
  domínio antigo faz toda chamada de conta e de sincronização voltar `403
  origin_denied`. A rota GET de sessão não passa por `assertSameOrigin` e
  responde normalmente, então a conferência precisa de um POST para o problema
  aparecer antes de um usuário encontrá-lo.
- Uso: `npm run check:deploy -- https://o-endereco-da-publicacao`. Serve para
  pré-visualização e para produção. Backend sem configurar é aviso, não falha.
  Ver a tabela em `docs/RELEASE.md`.

#### Correção: o link de confirmação de conta caía na página comercial

- **Cadastro e recuperação de senha estavam quebrados no ar.** O servidor
  montava o endereço de retorno dos emails como `${origem}/?auth_callback=...`,
  isto é, a raiz do domínio. Enquanto a raiz servia o aplicativo isso estava
  certo; desde que ela passou a servir a página comercial, o link do email
  passou a entregar quem clicou em cima do folheto. Quem lê o parâmetro `code`
  e o troca por uma sessão é `bootstrapAccount()`, em `js/auth.js`, que só
  existe dentro do pacote carregado pelo `index.html`. A landing não carrega
  esse código, então nada acontecia: o código expirava sem ser usado, o
  cadastro nunca confirmava e a recuperação nunca abria o formulário de nova
  senha. Sem erro em lugar nenhum, porque, do lado do servidor, o email foi
  enviado. O defeito é anterior à mudança de hospedagem: entrou junto com a
  landing.
- Os dois endereços passaram a apontar para `/index.html?auth_callback=...`, e
  passaram pela mesma função (`appCallbackUrl`), para não voltarem a divergir.
  `/index.html` é endereço público e continua entregando os bytes do
  aplicativo; `app.html` é nome de arquivo interno do `dist/` e não pode
  aparecer em link nenhum.
- **Os links que já saíram continuam apontando para a raiz**, e não há como
  reescrever email enviado. Por isso a página comercial passou a reencaminhar
  sozinha: `js/landing-boot.js` detecta `code` ou `auth_callback` na query e
  devolve a pessoa para `index.html` com a query inteira, incluindo o hash. A
  checagem exige a chave inteira depois de `?` ou `&`, então parâmetro de
  campanha terminado em `code` não dispara. O reencaminhamento ficou no
  `landing-boot.js`, e não no `landing.js`, por duas razões: ele é síncrono no
  `<head>`, então a página comercial não chega a piscar; e o `landing.js` é
  justamente o arquivo que pode morrer no caminho em rede ruim, que é quando a
  confirmação mais precisa funcionar.
- `docs/BACKEND_SETUP.md` passou a mandar cadastrar `/index.html?auth_callback=...`
  na lista de URLs de redirecionamento do Supabase, com a explicação do porquê.
  **Esta lista é preenchida à mão no painel do Supabase e precisa ser
  atualizada pelo dono do projeto**; o código sozinho não resolve.
- Suíte nova: `tests/test-account-callback.js`. Ela executa o handler de
  `account` com o Supabase substituído por um espião e afirma o endereço que
  ele realmente enviou, executa o `landing-boot.js` num contexto de `vm` com
  `location` de mentira, e confere que a documentação não voltou a mandar
  cadastrar a raiz. Não havia teste cobrindo isto.
- `npm run test:landing` ganhou o cenário de navegador correspondente: um link
  no formato já enviado (`/?auth_callback=signup&code=...`) precisa terminar no
  aplicativo com a query intacta, o botão Voltar não pode devolver a página
  comercial, e uma visita de campanha (`?utm_source=...&ref_code=...`) não pode
  ser arrastada para fora da landing.
- Cache offline promovido para v51. O `landing-boot.js` é um estático servido
  por stale-while-revalidate: sem promover a versão, quem já tivesse a landing
  em cache receberia o arquivo antigo na primeira visita depois da publicação,
  que é justamente a visita do clique no link do email.
- Em `tests/test-landing.js`, a verificação de movimento reduzido deixou de
  casar o texto `if (!movimentoReduzido)` e passou a EXECUTAR o boot num
  contexto de `vm`, como a seção 7 já fazia com `isAppShell`. Ela media a
  linha, não a regra: bastou o boot ganhar uma segunda condição para a suíte
  reprovar uma mudança que preservava o comportamento inteiro.

#### Mudança de hospedagem: Netlify para Vercel

- A configuração saiu do `netlify.toml` para o `vercel.json`: comando de build,
  pasta publicada, reescritas de entrada e todos os cabeçalhos de segurança,
  incluindo a política de conteúdo. O arquivo antigo foi removido; nada mais no
  projeto o consulta.
- **A raiz precisou de outro mecanismo.** A Netlify tinha `force = true`, que
  fazia a reescrita ganhar do arquivo estático. A Vercel consulta o sistema de
  arquivos ANTES das reescritas, então bastava existir um `index.html` na raiz da
  publicação para o domínio abrir no aplicativo e a regra da landing nunca ser
  avaliada. A solução não toca no repositório: o build publica o aplicativo como
  `app.html`, os dois endereços viram falha de sistema de arquivos, e as duas
  reescritas passam a valer (`/` para a landing, `/index.html` para `app.html`).
  `/index.html` continua entregando os mesmos bytes no mesmo endereço, então o
  `start_url` do manifesto, a chave do cache do service worker e todo link
  `index.html#/rota` seguem valendo sem alteração. O build falha de propósito se
  um `index.html` reaparecer no `dist/`.
- As três funções não foram reescritas. Elas continuam em `netlify/functions/`,
  com a mesma assinatura que seis arquivos de teste exercitam, e ganharam uma
  casca em `api/` que traduz o formato da Vercel (`api/_adaptar.js`). O
  adaptador tem suíte própria: `tests/test-vercel-adapter.js` mede que a ação da
  reescrita chega, que o corpo chega como texto, que os três `Set-Cookie` da
  sessão saem em linhas separadas e que um handler que estoura não vaza rastro
  de pilha.
- `/.netlify/functions/analyze` virou `/api/analyze`. Era o único endereço com
  nome de plataforma cravado no código do cliente.
- As verificações que liam o `netlify.toml` passaram a ler o `vercel.json`, e
  agora leem o JSON em vez de casar texto: `check-release.js`,
  `test-landing.js`, `test-security.js`, `test-modular-build.js` e
  `test-commercial-readiness.js`.
- README, `docs/RELEASE.md` e `docs/BACKEND_SETUP.md` atualizados, incluindo o
  que conferir no primeiro deploy.
- `engines.node` fixado em `22.x`, que é o que a integração contínua já usava. A
  faixa aberta `>=20` fazia a Vercel avisar que a publicação subiria de major
  sozinha quando ela promovesse a próxima versão.
- Integração contínua com `npm ci`, análise estática, cobertura e os três
  motores de navegador.
- Versão do aplicativo 0.29.0 e cache offline v50. O cache subiu junto com a
  mudança de endereço da função de análise: sem promover a versão, quem já
  tinha o pacote antigo em cache chamaria `/.netlify/functions/analyze` mais
  uma vez antes da revalidação em segundo plano trocar o arquivo.

## 0.28.0

- Ajustes deixou de ser uma pilha de cartões abertos e virou uma lista de seis tópicos.
- Cada linha fechada mostra o valor atual do ajuste (a regra em vigor, quantas categorias têm teto, quando foi o último backup), então dá para se situar sem abrir nada.
- Um tópico aberto por vez; tocar no que já está aberto fecha e devolve o índice.
- Os atalhos para outras telas, incluindo a central de categorias, continuam sempre visíveis: navegação não entra no acordeão.
- A prévia e o erro de importação de backup abrem o tópico de dados sozinhos, para o resultado de escolher um arquivo não ficar escondido.
- A sincronização em nuvem passou a ser opcional para o restante do aplicativo, protegida por verificação de existência como já acontece com o diagnóstico e o histórico de navegação.
- Versão do aplicativo 0.28.0 e cache offline v46, sem alteração do schema de dados.

## 0.27.0

- Sincronização em nuvem ligada de fato: com a conta conectada, os lançamentos passam a subir e descer entre os aparelhos.
- Fusão automática por união, com exclusões respeitadas nos dois lados e nova tentativa quando outro aparelho grava no meio do envio.
- O IndexedDB continua sendo a fonte da interface; a nuvem é um segundo destino atualizado em segundo plano, e o aplicativo segue inteiro sem conexão.
- Estado da sincronização visível na tela de conta, com data da última troca e envio manual.
- A função de análise com IA passou a exigir sessão e a contar requisições por conta, não por IP. Sem backend de contas configurado, ela recusa em vez de liberar.
- Identificadores de registro passaram a usar UUID do Web Crypto, condição para dois aparelhos gravarem sem colisão silenciosa.
- Correção na leitura de valores: "1,5000" era lido como 15000 enquanto "1.5000" virava 1,5. A regra agora é a mesma para vírgula e ponto, o que corrige a importação de extratos com quatro casas decimais.
- Nova suíte `tests/test-money.js` cobrindo centavos, rateio de parcelas, leitura de valor digitado e unicidade de identificador.
- Correção de dois nomes de variável de estilo inexistentes (`--line` e `--ink-muted`), que deixavam bordas e textos auxiliares na cor errada nas telas de conta e movimentações.

## 0.26.0

- Central de categorias em tela própria (`#/categorias`), com três lentes sobre a mesma lista: Estrutura, Grupos e Tetos.
- Estrutura em árvore de verdade: subcategorias presas à categoria-mãe por trilho, com gasto do mês, teto e grupo em cada linha.
- Lente Grupos mostra Necessidades, Desejos e Futuro com o gasto do mês contra o valor reservado pela Regra x/x/x.
- Editor em folha único para criar e editar, incluindo mover uma categoria de mãe sem perder histórico; exclusão confirmada na própria folha.
- Busca por nome, recolher/expandir subcategorias e sugestão de teto pela média dos últimos meses.
- Ajustes deixou de editar categoria: agora resume o estado e entrega a tela nova.
- Versão do aplicativo 0.26.0 e cache offline v44, sem alteração do schema local.

## 0.25.0

- Conta opcional com cadastro, login, confirmação por email, recuperação de senha e encerramento de sessão.
- Sessões em cookies HttpOnly, sem tokens no armazenamento local, nos backups ou nos diagnósticos.
- Lista de dispositivos conectados, revogação individual e exclusão da conta online com nova autenticação.
- Backend financeiro com isolamento por usuário, RLS, revisão atômica, controle de conflitos e idempotência.
- Validação do snapshot e das alterações no servidor, limite de 6 MB e bloqueio de campos e identificadores inválidos.
- Persistência do registro de exclusões e da data do último backup em todos os adaptadores.
- Versão do aplicativo 0.25.0 e cache offline v43, sem alteração do schema local.

## 0.24.0

- Revisão dos textos financeiros e avisos específicos nos simuladores, com fontes oficiais e linguagem condicional.
- Nova área de privacidade, termos, controle de IA, exportação e exclusão definitiva dos dados locais.
- Registro local de erros com códigos controlados, retenção de 30 dias e sem mensagens, valores ou dados pessoais.
- Schema 22, versão do aplicativo 0.24.0 e cache offline v42.

## 0.23.0

- Explicações comuns para saldo, patrimônio, previsão, saúde, metas, dívidas e simuladores.
- Separação visual entre valores realizados, previstos e estimados, com data, fórmula e premissas.
- Assistente financeiro local que adapta perguntas à tela e abre simuladores preenchidos.
- Central de fontes com origem, quantidade, última atualização, arquivo de referência e pendências.
- Contas e cartões mostram quantidade de movimentações, última movimentação e última conciliação.
- Situação local exibida sem sugerir uma conexão bancária que o aplicativo ainda não possui.
- Versão do aplicativo 0.23.0 e cache offline v41, sem alteração do schema de dados.

## 0.22.0

- Central de Movimentações com busca ampla, filtros, agrupamento por data, resumo e correções em lote.
- Relatórios preservados em uma visão separada dentro da mesma rota.
- Caixa de revisão para categorias pendentes, duplicidades, transferências, pagamentos de fatura e conferência de contas.
- Conversões contábeis confirmadas em popup, sem duplicar receitas ou despesas.
- Origem e histórico de alterações preservados em lançamentos, transferências, pagamentos, backup e restauração.
- Conciliação de conta registra a data da conferência mesmo quando o saldo já está correto.
- Migração de dados para o schema 21, versão do aplicativo 0.22.0 e cache offline v40.

## 0.21.0

- Aplicativo carregado por uma única entrada ES nativa, sem declarações do domínio no escopo global do navegador.
- Artefato modular gerado e conferido automaticamente a partir dos arquivos de origem.
- Atributos `style` removidos dos modelos e substituídos por classes calculadas em folha CSS externa.
- Política de conteúdo passou a bloquear estilos inline.
- Cache offline reduzido aos arquivos realmente consumidos pelo navegador.

## 0.20.0

- Saneamento estrito de identificadores, cores e referências vindas de backup.
- Consulta de QR fiscal limitada a portais governamentais reconhecidos.
- Contrato versionado e seguro por padrão para futura sincronização.
- Comando único de testes, verificação de publicação e integração contínua.
- Objetivos pessoais no onboarding e no personalizador do Início.
- CSS separado por base, layout, componentes, utilitários e telas.
- Serviços de diálogo e validação carregados como módulos JavaScript nativos.
- Pop-ups com foco preso, fundo isolado e retorno ao controle de origem.
- Erros associados aos campos e valores monetários limitados a duas casas decimais.
- Testes de navegador para os fluxos financeiros principais, responsividade, zoom e temas.

## 0.19.0

- Separação entre valores realizados e compromissos futuros.
- Histórico mensal de orçamento.
- Correção do histórico patrimonial de contas.
- Sincronização de metas com lançamentos editados ou excluídos.
