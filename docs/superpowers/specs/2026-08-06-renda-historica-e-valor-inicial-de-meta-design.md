# Renda histórica e valor inicial de meta

## Objetivo

Separar renda realizada de renda planejada e permitir que o valor inicial de uma meta tenha uma origem explícita, sem alterar o patrimônio por dupla contagem.

## Renda

`monthlyIncome` continua sendo a renda planejada atual e segue alimentando orçamento e previsões. No mês atual, a leitura operacional usa o maior valor entre a renda planejada e a receita já lançada. Em meses encerrados, os indicadores usam somente receitas registradas naquele mês. Assim, mudar a renda atual não reescreve taxas de poupança, comparações e diagnósticos antigos.

## Valor inicial da meta

Ao criar uma meta com valor inicial maior que zero, um popup oferece três caminhos:

1. Tirar do saldo: cria a meta e um aporte real, debitando a conta padrão.
2. Já estava guardado: cria a meta sem lançamento e marca esse valor como já incluído no saldo atual. Essa parcela aparece no progresso da meta, mas não é somada novamente ao patrimônio.
3. Cancelar: fecha o popup e mantém o formulário preenchido.

O campo `existingBalance` identifica somente a parcela inicial que se sobrepõe ao saldo. Aportes posteriores mantêm o modelo atual, com despesa real. Em um resgate, a parcela financiada por aportes reais volta ao saldo; a parcela já existente apenas deixa de ficar vinculada à meta, pois nunca saiu do saldo.

## Compatibilidade

Metas antigas recebem `existingBalance: 0`. O `savedUpfront` já migrado continua ligado ao lançamento `goal-upfront`, sem nova alteração de caixa. O schema sobe para a versão 18 apenas para normalizar o novo campo.

## Testes

Os testes devem cobrir renda encerrada, renda do mês atual, as duas origens do valor inicial, cancelamento sem perda do formulário, patrimônio invariável e resgate das duas parcelas.
