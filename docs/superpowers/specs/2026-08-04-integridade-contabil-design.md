# Integridade contábil do valor inicial das metas

## Objetivo

Corrigir uma inconsistência sem mudar o modelo existente: `savedUpfront` precisa ter uma contrapartida no caixa, como qualquer outro aporte em meta.

## Invariantes

- Meta continua sendo um bucket patrimonial alimentado por transações com `goalId`.
- Nenhuma meta será vinculada ou convertida em reserva de uma conta.
- Um aporte reduz caixa e aumenta o bucket da meta pelo mesmo valor.
- Um resgate reduz o bucket e aumenta caixa pelo mesmo valor.
- Nenhuma dessas operações altera o patrimônio líquido.
- `savedUpfront` preserva o progresso da meta, mas ganha a transação que faltava.
- O tratamento já existente dos aportes, resgates e totais mensais não será alterado.

## Migração v17

Para cada meta com `savedUpfront > 0`, a migração verifica se existe a transação sintética determinística `goal-upfront:<goalId>`. Quando não existe, cria um aporte com:

- tipo `expense` para manter a direção do fluxo de caixa;
- categoria `investimento`;
- `goalId` da meta;
- valor igual a `savedUpfront`;
- data igual a `createdAt` da meta quando houver uma data ISO válida;
- origem `goal-upfront`;
- ID determinístico para impedir duplicação.

Bases anteriores à v3 já recebem um lançamento correspondente a `goal.current`. A migração v17 reconhece esse ajuste e não cria outro aporte.

Novas metas com valor inicial pedem confirmação antes de qualquer gravação. A mensagem informa que o valor será registrado como aporte e debitado do caixa. Se o usuário cancelar, nem a meta nem a transação são criadas; ele pode remover o valor inicial e salvar a meta sem débito. Quando confirmado, meta e transação são criadas na mesma atualização de estado.

## Compatibilidade

- Campos e contratos existentes permanecem disponíveis.
- Backups antigos continuam aceitos.
- IDs determinísticos tornam a migração idempotente.
- Nenhuma tela, rota ou recurso será removido.

## Verificação

Os testes devem cobrir criação confirmada e cancelada, migração v16, migração anterior à v3, repetição da migração, saldo e patrimônio. A suíte completa e uma abertura real do `index.html` devem passar.
