# Central de Dívidas e Plano de Quitação

## Objetivo

Transformar o cadastro básico de dívidas do Patrimônio em uma central capaz de responder quatro perguntas:

1. Quanto ainda é devido?
2. Quanto das despesas mensais já está comprometido?
3. Qual dívida deve receber um pagamento extra primeiro?
4. Em que mês as dívidas terminam em cada estratégia?

A Central de Dívidas terá interface própria, mas usará os mesmos itens de classe `divida` armazenados em `assets`. Não haverá uma segunda lista de saldos devedores.

## Escopo

O módulo inclui:

- cadastro detalhado e edição de dívidas;
- visão consolidada do saldo devedor e das parcelas;
- comparação entre avalanche e bola de neve;
- simulação de pagamento extra e redistribuição automática das parcelas liberadas;
- registro de pagamentos como lançamentos ligados à dívida;
- atualização manual do saldo devedor visto no credor;
- integração com contas, calendário, previsão, saúde financeira, patrimônio, notificações e backup;
- migração dos cadastros atuais sem perda de dados.

O módulo não inclui:

- conexão bancária ou Open Finance;
- renegociação automática;
- consulta de contrato em instituição financeira;
- promessa de economia ou data oficial de quitação;
- alteração automática do saldo devedor a partir do valor total de uma parcela.

## Fonte única de dados

Uma dívida continua sendo um `asset` com `class: "divida"` e `kind: "liability"`. A tela de Patrimônio, a Saúde Financeira e a nova Central de Dívidas leem o mesmo objeto.

O campo `value` representa o saldo devedor atual. O campo `monthlyPayment` representa a parcela ou pagamento mínimo atual. O campo `dueDay` continua alimentando calendário e previsão.

Os seguintes campos serão acrescentados somente às dívidas:

- `debtType`: tipo padronizado da dívida;
- `creditor`: nome do credor;
- `originalPrincipal`: valor originalmente contratado, quando conhecido;
- `ratePct`: taxa informada;
- `ratePeriod`: `month`, `year` ou `unknown`;
- `cetAnnualPct`: CET anual, quando informado;
- `remainingInstallments`: parcelas restantes, quando conhecidas;
- `amortizationSystem`: `price`, `sac`, `fixed` ou `unknown`;
- `nextDueDate`: próximo vencimento completo, quando informado;
- `debtStatus`: `active`, `negotiating` ou `paid`;
- `balanceCheckedAt`: data da última conferência do saldo devedor.

Os tipos aceitos serão: financiamento imobiliário, financiamento de veículo, empréstimo pessoal, consignado, dívida de cartão parcelada, cheque especial, imposto, dívida informal e outro.

`dueDay` será o campo operacional usado nas repetições mensais. Quando `nextDueDate` for informado, seu dia atualizará `dueDay` e a data completa permitirá distinguir uma parcela futura de uma vencida. Quando houver somente `dueDay`, o próximo vencimento será a próxima ocorrência desse dia.

Saldo igual a zero marcará a dívida como `paid`. Se um saldo positivo for informado novamente, o item voltará para `active`. O estado `negotiating` nunca será aplicado automaticamente.

Lançamentos poderão receber `debtId`. Esse vínculo identifica pagamentos realizados, mas não transforma automaticamente o valor total pago em redução do principal.

A preferência do plano será persistida em `debtPlan`:

- `strategy`: `avalanche` ou `snowball`;
- `extraMonthly`: valor adicional escolhido pelo usuário;
- `updatedAt`: última alteração do plano.

## Cadastro progressivo

O formulário terá dois níveis no mesmo fluxo:

- modo simples: nome, saldo devedor, parcela e vencimento;
- detalhes do contrato: credor, tipo, taxa, período da taxa, CET, parcelas restantes e sistema de amortização.

Somente nome e saldo devedor serão obrigatórios. A ausência de taxa não impedirá o cadastro nem a exibição da dívida, mas limitará os cálculos de juros e a estratégia avalanche.

Dívidas existentes serão migradas para o modo simples. Seus campos novos nascerão vazios ou como `unknown`.

## Motor de quitação

O motor será puro, sem DOM e sem persistência. Receberá as dívidas ativas, o pagamento extra e a estratégia. Devolverá uma linha do tempo mensal, os resultados consolidados e os avisos de qualidade dos dados.

### Taxa usada

Quando houver CET anual, ele será a referência de custo para ordenar a avalanche e projetar encargos. Caso contrário, será usada a taxa contratual convertida para taxa mensal equivalente. Taxa anual não será dividida por 12; será convertida por composição.

Quando a taxa for desconhecida:

- a dívida continuará no plano;
- a avalanche colocará dívidas com custo conhecido antes das desconhecidas;
- a projeção usará amortização linear sem juros apenas para produzir uma estimativa de prazo;
- juros totais e economia dessa dívida serão marcados como indisponíveis;
- a interface pedirá CET ou taxa para melhorar a estimativa.

Quando parte das dívidas não tiver taxa, o total de juros exibirá apenas a parcela calculável e informará quantas dívidas ficaram fora. A interface não apresentará esse subtotal como custo completo da carteira.

### Estratégias

Na avalanche, o valor extra vai para a dívida com maior custo mensal efetivo. Em empate, vence o menor saldo.

Na bola de neve, o valor extra vai para a dívida com menor saldo. Em empate, vence o maior custo conhecido.

Em ambas:

- todas as dívidas recebem pelo menos a parcela informada;
- quando uma dívida termina, sua parcela passa para o próximo alvo;
- o pagamento do último mês é limitado ao saldo mais juros daquele mês;
- não são criados juros negativos;
- a simulação para após 600 meses e informa quando não consegue quitar.

Se a parcela for menor ou igual aos juros do mês, o motor sinalizará amortização negativa. O módulo não esconderá crescimento do saldo.

### Precisão

Price, SAC, tarifas, seguros, correção monetária e datas exatas podem fazer o contrato real divergir da projeção. O sistema de amortização será mostrado como contexto, mas o plano usará saldo atual, taxa efetiva e parcela atual para manter uma regra única e verificável.

O resultado será apresentado como estimativa. Para antecipação ou portabilidade, a interface orientará o usuário a solicitar ao credor o saldo oficial de quitação e o demonstrativo da dívida.

## Registro de pagamento

A Central oferecerá “Registrar pagamento”. O fluxo pedirá:

- dívida;
- conta de origem, quando houver conta cadastrada;
- valor pago;
- data;
- categoria do lançamento;
- novo saldo devedor visto no credor, opcional.

O pagamento cria uma transação de despesa com `debtId` e reduz o saldo da conta escolhida. Ele não reduz o saldo devedor automaticamente.

Quando o usuário informar o novo saldo devedor, o mesmo fluxo atualizará `asset.value`, `balanceCheckedAt` e o histórico mensal do item. Assim, juros, seguros e encargos não são confundidos com amortização de principal.

Antes de gravar, o módulo verificará se já existe transação equivalente ligada à mesma dívida, data e valor. Em caso positivo, pedirá confirmação para evitar duplicidade.

## Interface

A rota `debts` será acessível por:

- Dashboard;
- indicador de Dívidas da Saúde Financeira;
- tela de Patrimônio;
- Ajustes, na lista de ferramentas.

A tela terá:

1. cabeçalho com saldo devedor total, parcelas mensais, comprometimento da renda e data estimada sem dívidas;
2. lista de dívidas ordenada pela estratégia ativa;
3. comparação entre avalanche e bola de neve;
4. controle de pagamento extra mensal;
5. linha do tempo de redução do saldo;
6. alertas sobre dados incompletos, amortização negativa e saldo desatualizado;
7. histórico de pagamentos vinculados;
8. ações para cadastrar, editar, atualizar saldo e registrar pagamento.

Cartões cadastrados aparecerão apenas como compromissos de curto prazo em um resumo. Faturas abertas não serão adicionadas novamente à lista de dívidas. Caso uma fatura seja parcelada ou vire rotativo, o usuário poderá cadastrá-la como dívida específica.

## Integrações

### Contas

Um pagamento ligado a uma conta reduz o caixa uma única vez por meio da transação criada. A Central não manterá um segundo lançamento interno.

### Calendário e previsão

O calendário continuará projetando a parcela pelo vencimento da dívida. Se houver transação futura equivalente, a defesa contra duplicidade existente continuará prevalecendo.

### Saúde financeira

O indicador de Dívidas passará a considerar:

- comprometimento mensal;
- saldo total;
- custo conhecido;
- ocorrência de amortização negativa;
- prazo estimado de quitação.

### Patrimônio

O saldo devedor atualizado continuará reduzindo o patrimônio líquido. Pagamentos não reduzem o passivo por conta própria.

### Notificações

Serão geradas notificações para:

- parcela próxima do vencimento;
- parcela vencida sem pagamento vinculado;
- saldo sem conferência há mais de 60 dias;
- dívida cuja parcela não cobre os juros;
- conclusão estimada de uma dívida no plano atual.

### Backup

Os campos novos, `debtId` e `debtPlan` entrarão no backup, restauração, checksum e mesclagem. Backups anteriores continuarão aceitos.

## Migração

O schema passará da versão 12 para a 13.

A migração:

- preservará ids, saldos, parcelas, vencimentos e históricos atuais;
- normalizará tipos, taxas, datas e sistemas de amortização;
- removerá `debtId` órfão de lançamentos;
- criará `debtPlan` com avalanche e valor extra zero;
- não inventará taxa, CET, credor ou número de parcelas.

## Tratamento de erros

- Taxas negativas, datas inválidas e parcelas negativas serão recusadas ou saneadas.
- CET menor que zero será descartado.
- Pagamento maior que o caixa será permitido, pois contas podem representar cheque especial, mas a interface mostrará o saldo resultante negativo.
- Dívida sem parcela não participará da simulação de prazo e receberá aviso.
- Resultado com `NaN`, infinito ou prazo acima do limite será convertido em estado sem estimativa.
- Falha ao persistir seguirá o mecanismo atual de espelho e aviso do `FinanceStore`.

## Testes

O módulo terá uma suíte própria cobrindo:

- migração de dívidas antigas;
- normalização de campos novos;
- conversão de taxas mensais e anuais;
- ordenação avalanche e bola de neve;
- redistribuição de parcelas após quitação;
- dívida sem juros;
- dívida sem taxa;
- amortização negativa;
- limite de 600 meses;
- cálculo de juros e data de término;
- comparação com e sem pagamento extra;
- vínculo de pagamento sem redução automática do passivo;
- prevenção de lançamento duplicado;
- backup, restauração e mesclagem;
- renderização vazia, parcial e completa;
- fluxos no navegador em desktop e celular;
- execução de todas as suítes existentes.

## Referências

- [Banco Central: Custo Efetivo Total](https://www.bcb.gov.br/content/cidadaniafinanceira/documentos_cidadania/Informacoes_gerais/glossario_cidadania_financeira.pdf)
- [Banco Central: portabilidade de crédito](https://www.bcb.gov.br/meubc/faqs/s/portabilidade-de-credito)
- [Código de Defesa do Consumidor, artigo 52](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm?origin=instituicao)
