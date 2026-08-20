# Implementação dos módulos 15, 14, 12, 11, 10 e 9

## Decisões

1. O painel passa a ter cinco objetivos iniciais: organizar o mês, sair das dívidas, montar reserva, planejar uma compra e acompanhar patrimônio. O objetivo apenas define a ordem inicial dos cartões. Cartões fixados, ocultos e alterações manuais continuam sob controle do usuário.
2. A folha de estilos é separada por responsabilidade, mantendo a ordem original da cascata para não alterar a aparência existente.
3. A migração para módulos JavaScript começou pelos serviços de interface e foi concluída com uma entrada ES gerada. Os arquivos antigos permanecem como fontes separadas para edição e testes, mas não são mais carregados como scripts globais pelo navegador.
4. Todo diálogo modal prende o foco, isola o conteúdo ao fundo, recebe foco inicial e devolve o foco ao controle que o abriu.
5. Erros de formulário aparecem junto ao campo, usam `aria-invalid`, são anunciados por tecnologia assistiva e levam o foco ao primeiro campo inválido. Valores monetários aceitam no máximo duas casas decimais.
6. Os testes de navegador cobrem os fluxos financeiros críticos, tamanhos de tela, zoom de 200% e os dois temas. Os testes unitários existentes continuam sendo a primeira barreira contra regressões.

## Compatibilidade

Nenhum dado financeiro existente é removido. A migração cria apenas a preferência `dashboardFocus` quando ela não existir. Backups passam a transportar essa preferência. O cache do aplicativo é renovado para incluir os novos arquivos.

## Critérios de conclusão

- objetivo escolhido no onboarding e alterável no personalizador;
- CSS carregado em arquivos separados sem mudança na cascata;
- serviços de interface e aplicativo completo carregados como módulos nativos;
- navegação de teclado funcional em todos os modais;
- validações visíveis e associadas aos campos;
- suíte de navegador disponível no projeto e executada localmente quando o ambiente permitir.
