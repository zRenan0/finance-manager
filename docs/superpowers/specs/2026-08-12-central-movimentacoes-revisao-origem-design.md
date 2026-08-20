# Central de Movimentações, revisão e origem

## Objetivo

Reunir consulta, correção e rastreabilidade dos lançamentos em uma tela própria, sem alterar a contabilidade existente. A central deve tornar erros visíveis, permitir correções em lote e explicar de onde cada dado veio e quando foi alterado.

## Escopo aprovado

O módulo cobre os três primeiros itens da lista priorizada:

1. Central de Movimentações 2.0 com busca, filtros, agrupamento, resumo e ações em lote.
2. Caixa de revisão e conciliação para lançamentos sem categoria confiável, possíveis duplicidades, transferências e pagamentos de fatura importados.
3. Origem e histórico dos dados em cada lançamento, preservados em backup, restauração e mesclagem.

## Decisões de produto

A rota atual de Movimentações passa a ter duas visões. A visão inicial é a central operacional. A visão Relatórios preserva os gráficos, projeções, resumo visual e análise por IA que já existem.

Os filtros combinam período, tipo, categoria, conta ou cartão e origem. A busca considera descrição, categoria, conta, cartão, forma de pagamento, valor e rótulo de origem. O resumo apresenta entradas, saídas, saldo e quantidade do resultado filtrado. A lista é agrupada por data.

A seleção em lote permite recategorizar ou excluir. Exclusões continuam usando confirmação em popup e respeitam as rotinas existentes de lápide e ajuste de meta.

A caixa de revisão aponta apenas situações que o app consegue justificar:

* categoria Outros em dado importado ou capturado;
* possível duplicidade com mesmo tipo, valor, data e descrição normalizada;
* possível transferência entre contas, formada por uma saída e uma entrada iguais em contas diferentes, próximas no tempo;
* possível pagamento de fatura reconhecido pela descrição;
* conta ativa que ainda não foi conferida ou cuja última conciliação ocorreu há mais de 30 dias.

Detecções são sugestões. Nada é apagado ou convertido sem confirmação. O usuário pode corrigir, converter, conferir a conta ou marcar a sugestão como revisada.

## Modelo de dados

O esquema sobe para a versão 21. Cada transação passa a guardar:

* `origin`, com canal, rótulo, referência opcional e data de importação ou captura;
* `changeLog`, uma lista limitada das criações, edições e decisões de revisão;
* `reviewedIssues`, chaves determinísticas das sugestões já descartadas pelo usuário.

Dados antigos recebem uma origem derivada de `source`. O histórico começa com um registro de criação usando `createdAt`. A fábrica canônica e a migração aplicam os mesmos limites e validações. O histórico registra apenas nomes de campos alterados, sem copiar valores financeiros antigos ou descrições para reduzir exposição e crescimento do banco.

## Regras de integridade

A edição de uma transação mantém `id` e `createdAt`, atualiza `updatedAt` e acrescenta uma entrada ao histórico quando campos contábeis mudarem. Marcar uma sugestão como revisada não muda saldo.

A conversão em transferência remove os dois lançamentos selecionados e cria um movimento em `accountTransfers`. A conversão em pagamento de fatura remove o lançamento importado e cria um registro em `cardPayments`. Ambas usam as coleções contábeis já existentes e criam lápides para impedir ressurreição em mesclagens futuras.

A conciliação de conta continua usando `accountAdjustments`. A central apenas leva o usuário ao formulário de conferência já existente.

## Interface e acessibilidade

Controles de filtro têm rótulos associados e área de toque mínima de 44 px. O estado vazio explica se não há dados ou se os filtros não encontraram resultados. A procedência usa ícone e texto, nunca apenas cor. Detalhes e histórico ficam em um popup acessível pelo botão de informações de cada linha.

No celular, filtros avançados ficam recolhidos e os resumos usam duas colunas. No desktop, a barra de filtros distribui os campos sem comprimir a lista. A tela não usa emojis nem travessões.

## Validação

Serão adicionados testes unitários para filtros, busca, agrupamento, origem, histórico e cada detector da caixa de revisão. Os testes existentes de persistência, backup, contas, metas e renderização devem continuar passando. A entrega será validada com geração do módulo, suíte completa, verificação de release e teste de navegador.
