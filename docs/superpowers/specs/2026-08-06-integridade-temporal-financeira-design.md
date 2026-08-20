# Integridade temporal financeira, itens 2 a 5

## Escopo

Esta etapa corrige quatro fontes de divergência que afetam decisões e relatórios.

## 2. Metas e lançamentos

O valor atual de uma meta será reconciliado a partir do saldo anterior informado e dos aportes e resgates realizados até hoje. Editar ou excluir um lançamento vinculado atualizará a meta na mesma operação. Lançamentos futuros não aumentarão o valor guardado hoje.

## 3. Realizado e agendado

`txForMonth` continuará representando todos os compromissos conhecidos do mês e será usado por calendário, faturas e previsão. `realizedTxForMonth` e `realizedMonthTotals` representarão somente movimentos cuja data já chegou. Dashboard, orçamento gasto, análises, saúde, conquistas, assistente e dados enviados para análise usarão o realizado.

## 4. Patrimônio histórico de contas

A série patrimonial incorporará o saldo inicial de cada conta no mês de abertura, lançamentos válidos a partir dessa abertura, conciliações e pagamentos de fatura. Transferências entre contas continuarão neutras no total consolidado.

## 5. Histórico de orçamento

O schema 19 guardará um retrato mensal dos tetos por categoria, grupos, hierarquia, regra x/x/x e faixas de alerta. Alterações no mês atual substituirão apenas o retrato desse mês. Meses seguintes herdarão o último retrato conhecido, enquanto meses anteriores ao primeiro registro não receberão limites inventados.

## Persistência e compatibilidade

Edições e exclusões de lançamentos aplicam somente a diferença no saldo da meta, preservando valores anteriores cujo histórico detalhado não existe no aparelho. Bases sem histórico de orçamento recebem um retrato no primeiro mês com dados e outro no mês atual. Backups incluem e mesclam os retratos pela atualização mais recente de cada mês.

## Verificação

Os testes cobrirão edição e exclusão de aportes, lançamentos futuros, renda realizada, abertura e conciliação de contas, permanência dos orçamentos antigos e backup do novo histórico.
