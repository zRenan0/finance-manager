# Passivo de cartões no patrimônio e na saúde financeira

## Objetivo

Fazer compras registradas em cartões reduzirem o patrimônio líquido enquanto a fatura estiver aberta e comporem o diagnóstico de dívidas. A compra continua sem reduzir o caixa; o pagamento continua reduzindo caixa e fatura uma única vez.

## Reconhecimento da obrigação

- Compra única entra no passivo a partir da data do lançamento.
- Compra parcelada entra integralmente no passivo a partir da data da primeira parcela, pois o compromisso total já existe.
- Compra futura não parcelada só entra quando sua data chegar.
- Pagamentos reduzem o passivo a partir da data em que foram registrados.
- O saldo de cada cartão nunca fica negativo, mesmo com dados inconsistentes.
- Cartão arquivado continua no cálculo enquanto houver saldo aberto.

## Seletores

`cardLiabilityStatements(data, cardId, asOf)` reconstrói as faturas reconhecidas até uma data. `cardLiabilitySummary(data, asOf)` consolida total aberto, vencido, com vencimento em 30 dias, prazo final e quantidade de compras parceladas.

Os seletores são puros e não mudam `cardStatements`, usado pela tela de contas e pela previsão para mostrar todo o calendário conhecido.

## Patrimônio

O patrimônio passa a separar `registeredLiabilities`, referente às dívidas cadastradas, e `cardLiabilities`, referente às faturas abertas. `liabilities` permanece disponível e passa a ser a soma das duas fontes.

Na série histórica, compras no cartão não reduzem caixa no lançamento. A obrigação reconhecida até o fim de cada mês é subtraída como passivo. Pagamentos reduzem caixa e passivo, preservando o patrimônio.

## Saúde Financeira

O diagnóstico usa o saldo real das faturas registradas. O comprometimento mensal considera faturas vencidas ou com vencimento nos próximos 30 dias. Parcelas de cartões registrados não voltam a entrar como parcelas futuras, evitando dupla contagem.

Lançamentos antigos marcados apenas como `Crédito`, sem um cartão cadastrado, mantêm o cálculo anterior para preservar compatibilidade.

## Verificação

Os testes cobrem compra à vista, compra parcelada, compra futura, pagamento parcial, quitação, histórico patrimonial, vencimento em 30 dias, atraso e ausência de dupla contagem. A suíte completa e a abertura real do site devem passar.
