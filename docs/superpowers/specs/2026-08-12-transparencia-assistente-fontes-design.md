# Transparência, assistente contextual e central de fontes

## Escopo aprovado

Esta etapa reúne os itens 4, 5 e 6 da lista priorizada: explicar cálculos importantes, tornar o assistente sensível à tela atual e mostrar com clareza de onde vieram os dados de contas e cartões.

## 1. Transparência dos cálculos

Uma camada única deve descrever cada cálculo relevante com quatro informações: natureza do número, data de atualização, método e premissas. A natureza usa somente três estados:

- Realizado: deriva de movimentações já registradas.
- Previsto: deriva de compromissos futuros conhecidos.
- Estimado: deriva de hipóteses, médias ou taxas informadas.

As explicações serão abertas em uma caixa de diálogo acessível pelo botão "Como foi calculado". O registro será independente das telas e receberá o snapshot atual, evitando copiar fórmulas na interface. Nesta etapa, a cobertura deve incluir saldo em contas, patrimônio, previsão de caixa, saúde financeira, metas, dívidas e simuladores. Quando houver mistura de naturezas, a interface deve informar isso expressamente.

## 2. Assistente financeiro contextual

O assistente será local e determinístico. Ele deve ler a tela aberta e os dados já calculados para oferecer até três perguntas úteis. Cada pergunta pode:

- responder no próprio painel com um resumo calculado;
- abrir uma tela adequada;
- abrir um simulador com valores iniciais coerentes com o contexto.

O assistente não deve fingir ser uma IA externa, nem produzir aconselhamento sem base nos dados. A análise externa já existente continua separada e exige a confirmação atual. O painel será uma caixa de diálogo acionada por um botão flutuante, com título que informa a tela de origem, perguntas sugeridas e resposta local. Dívidas, metas, contas, movimentações, planejamento e simuladores terão sugestões próprias; as demais telas recebem um conjunto seguro baseado no estado financeiro.

## 3. Central de contas e fontes

A tela de Contas terá duas visões: "Contas e cartões" e "Fontes dos dados". A primeira mantém todas as operações atuais e acrescenta, em cada conta, quantidade de movimentações, última movimentação, última conciliação e pendências. A segunda agrega os canais realmente encontrados nos dados:

- lançamento manual;
- arquivo OFX ou CSV;
- QR Code de Pix ou nota fiscal;
- texto livre;
- transferências, pagamentos de fatura e ajustes internos.

Cada fonte mostrará situação, quantidade de registros, última atualização e referência do último arquivo quando houver. Como o produto não possui integração bancária, a situação geral será "Dados locais" e a interface dirá que não há sincronização automática. O botão de importar extrato continuará sendo o caminho principal para atualizar dados bancários.

Pendências serão derivadas, nunca armazenadas: movimentações sem conta, contas não conciliadas recentemente, vínculos inválidos e itens da caixa de revisão. Nenhuma nova coleção persistente será criada, portanto não há migração de esquema nesta etapa.

## Integração e acessibilidade

As duas caixas de diálogo entram na pilha de navegação existente e fecham por botão, clique externo, tecla Esc e voltar do aparelho. Botões e abas terão área de toque de pelo menos 44 px. Textos de estado não dependerão apenas de cor. No celular, cartões e fatos passam para uma coluna sem rolagem horizontal.

## Verificação

Testes unitários cobrirão classificação, premissas, agregação de fontes e sugestões contextuais. Testes de renderização validarão os controles e textos essenciais. O fluxo no navegador verificará abertura e fechamento das caixas, troca de visão em Contas e preenchimento de um simulador pelo assistente.
