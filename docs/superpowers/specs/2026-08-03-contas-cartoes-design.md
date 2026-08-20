# Módulo de contas, cartões e conciliação

## Objetivo

Fazer o saldo exibido pelo aplicativo representar dinheiro real, separando caixa, compras no crédito, faturas e transferências. Dados antigos continuam válidos e são migrados sem alteração dos lançamentos existentes.

## Modelo

- `accounts`: contas de caixa com nome, tipo, saldo inicial, data do saldo inicial, cor, estado ativo e timestamps.
- `creditCards`: cartões ligados a uma conta de pagamento, com nome, limite, dia de fechamento, dia de vencimento, estado ativo e timestamps.
- Cada lançamento pode ter `accountId`, `creditCardId`, `transferId` e `balanceEffect`.
- Lançamentos antigos permanecem sem conta e integram uma conta virtual chamada “Histórico anterior”.
- Transferências são pares vinculados: saída da origem e entrada no destino. Não alteram receitas, despesas, orçamento ou patrimônio total.
- Compra no crédito pertence à fatura do cartão e não reduz o caixa. O pagamento da fatura reduz a conta escolhida uma única vez.

## Cálculos

- Saldo da conta = saldo inicial + entradas de caixa - saídas de caixa após a data inicial.
- Saldo em contas = soma das contas ativas e do histórico anterior.
- Fatura = compras e ajustes do cartão atribuídos ao ciclo de fechamento, menos pagamentos vinculados.
- Disponível para gastar = saldo em contas - contas futuras confirmadas - faturas abertas até a próxima renda.
- Os totais de receita e despesa continuam medindo consumo e renda. Transferências e pagamentos de fatura ficam fora desses totais.

## Interface

- Nova tela “Contas e cartões”, acessível pelo Dashboard e por Ajustes.
- Cadastro, edição de saldo conciliado e arquivamento de contas/cartões.
- Transferência entre contas em formulário próprio.
- Formulário de lançamento passa a pedir conta para Pix, dinheiro, débito e outros; ao escolher crédito, passa a pedir cartão.
- Dashboard separa “Em contas”, “Faturas abertas” e “Disponível após compromissos”.

## Compatibilidade e erros

- Migração cria coleções vazias e mantém lançamentos antigos na conta virtual.
- Exclusão física não é permitida quando houver lançamentos; o item é arquivado.
- Transferência incompleta é descartada na normalização.
- Valores continuam armazenados com arredondamento em centavos.
- Backup, restauração e mesclagem incluem as novas coleções.

## Testes

- Migração, normalização e backup.
- Saldo inicial, lançamentos anteriores à abertura e conciliação.
- Crédito sem redução imediata de caixa, fechamento de fatura e pagamento único.
- Transferência neutra para renda, despesa e patrimônio.
- Renderização das telas e ações válidas.
