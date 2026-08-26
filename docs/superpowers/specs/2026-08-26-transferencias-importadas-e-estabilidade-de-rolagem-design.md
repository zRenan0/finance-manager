# Transferências importadas e estabilidade de rolagem

Data: 26 de agosto de 2026

## Objetivo

Corrigir dois problemas relacionados à revisão de dados financeiros:

1. impedir que a página ou uma folha rolável volte sozinha para cima enquanto a pessoa digita ou interage com a mesma tela;
2. permitir que um Pix, TED, DOC ou movimento equivalente entre contas próprias seja registrado como uma transferência real durante a importação ou convertido depois pela edição.

Uma transferência entre contas próprias nunca será gasto nem renda. Ela somente reduz o saldo da conta de origem e aumenta o saldo da conta de destino.

## Decisões principais

### Registro financeiro

Transferências próprias serão persistidas em `accountTransfers`. Não serão representadas apenas por uma transação com `nature: "transferencia"`, pois uma transação comum possui somente uma conta e não consegue produzir o efeito igual e oposto nos dois saldos.

O registro terá conta de origem, conta de destino, valor positivo, data, descrição, origem do dado e até dois identificadores de transações substituídas. O campo `origin.reference` preservará a referência principal do arquivo importado. `sourceTransactionIds` preservará os identificadores das pontas que foram removidas.

Como `accountTransfers` não faz parte de `transactions`, o movimento ficará fora de:

* gastos e rendas;
* orçamentos e categorias;
* regra de distribuição mensal;
* análises de consumo e recorrência;
* conquistas baseadas em receita ou despesa.

O cálculo atual de `accountBalance` continuará sendo a fonte do efeito sobre os saldos. Para uma transferência dentro do período acompanhado pelas duas contas, o mesmo valor será subtraído da origem e somado ao destino. Se a data for anterior à abertura de alguma conta, a regra já existente do saldo inicial continuará valendo e a interface mostrará o aviso correspondente.

### Disponibilidade

A opção "Transferência entre minhas contas" ficará disponível apenas em extratos bancários e somente quando houver pelo menos duas contas ativas. Faturas de cartão não oferecerão essa classificação.

A conta do extrato sempre será uma das pontas:

* Pix enviado ou outra saída: a conta do extrato é a origem;
* Pix recebido ou outra entrada: a conta do extrato é o destino.

A outra ponta deverá ser uma conta ativa diferente. Contas arquivadas, inexistentes ou iguais à conta do extrato serão recusadas.

## Revisão da importação

Cada linha de um extrato terá um modo de gravação explícito:

* lançamento comum;
* transferência entre contas próprias.

Ao escolher transferência, a categoria deixa de ser aplicável e a linha passa a mostrar um seletor para a outra conta. O sinal da linha determina a direção, sem exigir que a pessoa repita a escolha de origem ou destino.

A confirmação da importação separará as linhas incluídas em transações e transferências. Os dois grupos serão gravados pela mesma alteração de estado. Se qualquer transferência estiver incompleta ou inválida, a confirmação será bloqueada e o erro ficará junto à linha.

O resumo da revisão mostrará transferências separadas de entradas e saídas. O botão final informará quantos lançamentos e quantas transferências serão gravados.

## Reconhecimento da contraparte

Quando uma transferência já tiver sido criada ao importar a primeira conta, a importação posterior da outra conta procurará a contraparte antes da gravação.

Uma correspondência automática exige todos estes sinais:

* valor idêntico em centavos;
* direção oposta compatível com a conta do novo extrato;
* mesmo par de contas;
* diferença máxima de dois dias corridos;
* indicação de transferência na descrição da linha nova ou na descrição já preservada.

Se houver exatamente uma correspondência, a linha virá desmarcada e identificada como "transferência já registrada". A pessoa ainda poderá incluí-la como lançamento comum se souber que é outro movimento.

Se houver mais de uma correspondência possível, nenhuma será escolhida automaticamente. A linha continuará disponível para decisão manual. A aplicação não usará apenas valor e data para tomar uma decisão irreversível.

## Conversão após a importação

O editor de um lançamento comum continuará acessível pela Central de movimentações. Ao selecionar "Transferência entre contas", ele mudará para o fluxo de conversão e exigirá as duas contas.

A conta vinculada ao lançamento importado será preenchida como uma das pontas. O tipo atual define a direção inicial, e a pessoa poderá corrigir origem e destino antes de salvar.

Se existir uma contraparte compatível entre as transações já gravadas, o editor mostrará que as duas serão substituídas. A confirmação executará uma única mutação:

1. cria o registro em `accountTransfers`;
2. remove uma ou duas transações com as lápides necessárias para a sincronização;
3. preserva os identificadores removidos em `sourceTransactionIds`;
4. preserva a principal referência de importação em `origin.reference`.

Sem contraparte, somente a transação editada será substituída. A outra conta ainda receberá o efeito da transferência real.

A escolha atual de `nature: "transferencia"` deixará de salvar um lançamento de uma ponta só. Para novos movimentos, a transferência continuará disponível pelo cadastro próprio em Contas. Para lançamentos existentes, essa escolha abrirá a conversão descrita acima.

## Estabilidade da rolagem e do foco

O salto ocorre quando `render()` substitui o conteúdo de `#app`, recria o campo e chama `focus()` no novo elemento. O foco pode rolar a janela ou a folha até o campo, e uma folha recriada também perde o próprio `scrollTop`.

Antes de reconstruir o DOM, o ciclo de renderização guardará:

* a identidade da tela e da camada que estão realmente desenhadas;
* `window.scrollX` e `window.scrollY`;
* a posição da folha modal rolável aberta, quando houver;
* a chave do elemento focado e a posição do cursor.

Depois da reconstrução, a posição somente será restaurada se a tela e a camada continuarem sendo as mesmas. O foco será devolvido com `focus({ preventScroll: true })`, com reserva para navegadores antigos, e o cursor será recolocado sem alterar a rolagem.

Uma navegação, a abertura de outra camada ou uma ação com `revealTarget` não herdará uma posição antiga. Nesses casos, a rolagem intencional existente continuará tendo prioridade.

## Componentes afetados

* `js/import.js`: preparação das linhas, correspondência com transferências existentes e construção dos dois tipos de registro.
* `js/screens/import.js`: controles por linha, seletor da outra conta, estados de erro e resumo separado.
* `js/actions.js`: confirmação mista da importação e conversão atômica de transações existentes.
* `js/screens/add.js`: modo de conversão no editor e validação das contas.
* `js/movements.js`: função compartilhada para encontrar uma contraparte sem duplicar as regras da Caixa de revisão.
* `js/app.js`: preservação de rolagem e foco no mesmo contexto visual.
* `js/accounts.js` e `js/storage.js`: uso e normalização do registro real de transferência, com ajustes apenas se necessários para preservar procedência.
* `js/modules/app.generated.js`: atualização pelo processo normal de build.

## Erros e mensagens

A interface tratará estes casos sem gravar dados parciais:

* menos de duas contas ativas;
* outra conta não selecionada;
* origem e destino iguais;
* conta arquivada ou removida durante a revisão;
* tentativa de classificar uma linha de fatura como transferência bancária;
* correspondência automática ambígua;
* transferência anterior à abertura de uma das contas.

Mensagens de validação ficarão próximas ao controle que precisa de correção. Uma ambiguidade será apresentada como decisão manual, não como erro fatal da importação.

## Testes

Os testes de domínio cobrirão:

* construção de transferência para Pix enviado e recebido;
* direção correta a partir do sinal e da conta do extrato;
* efeito igual e oposto nos saldos;
* ausência nos totais de gasto, renda, orçamento e categoria;
* importação mista de transações e transferências;
* reconhecimento da contraparte na segunda importação;
* rejeição de correspondências ambíguas;
* conversão de uma transação isolada;
* conversão de duas pontas já importadas;
* preservação de referência e identificadores de origem;
* validação de contas insuficientes, iguais, arquivadas ou removidas.

Os testes de interface cobrirão:

* controles de transferência na revisão do extrato;
* bloqueio e mensagem por linha incompleta;
* resumo separado de entradas, saídas e transferências;
* edição posterior pela Central de movimentações;
* página e folha modal mantendo a posição durante novo desenho da mesma tela;
* foco e cursor restaurados sem rolagem;
* navegação e `revealTarget` continuando a rolar quando solicitado.

A validação final executará geração do módulo, suíte completa, verificação de release e teste de navegador.

## Fora do escopo

Esta entrega não tentará identificar automaticamente o titular do Pix, conectar bancos, ler chaves Pix nem alterar o leitor dos arquivos além dos metadados necessários à classificação. Também não converterá silenciosamente transações antigas sem que as contas de origem e destino possam ser determinadas.

## Critérios de aceite

1. Digitar ou receber uma atualização na mesma tela não leva a página nem a folha para cima.
2. Um Pix próprio pode virar transferência durante a revisão do extrato.
3. Um lançamento já importado pode ser convertido depois com escolha das duas contas.
4. A origem perde exatamente o valor que o destino recebe, respeitando as datas de abertura.
5. A transferência não aparece como gasto nem renda em nenhum resumo financeiro.
6. A contraparte importada depois vem desmarcada quando existe uma única correspondência segura.
7. Nenhuma gravação parcial ocorre em caso de validação ou correspondência ambígua.
8. A suíte existente continua passando.
