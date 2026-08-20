# M3: 320 px, rótulos e nome do assistente

## Objetivo

Fechar o item 18 da auditoria sem alterar a hierarquia de rotas nem ampliar o
escopo para onboarding ou para a revisão geral de acessibilidade. Em uma janela
de 320 px, nenhum rótulo da navegação pode ser cortado e o lançador do
assistente não pode cobrir a doca nem o conteúdo final da página.

## Decisões de produto

1. A central hoje chamada “Tudo” passa a se chamar “Recursos”. Ela é um catálogo
   pesquisável com 22 entradas, portanto o novo nome descreve o conteúdo melhor
   que “Mais”. O identificador interno `all` e o endereço `tudo` permanecem para
   preservar links existentes.
2. A doca móvel usa “Movimentos” e “Planejar”. As telas continuam chamadas
   “Movimentações” e “Planejamento”, e os botões expõem esses nomes completos
   para tecnologias assistivas.
3. O nome da funcionalidade será “Assistente financeiro”. O cartão, o lançador,
   o diálogo e os comentários diretamente ligados ao recurso usarão a mesma
   forma. Textos corridos podem empregar “o assistente” quando a palavra for uma
   referência comum, não o nome da funcionalidade.

## Correções de layout

O token que representa a navegação inferior deve cobrir a altura real da doca,
seu afastamento da borda e a área segura do aparelho. O lançador do assistente
deve consumir esse token uma única vez. A reserva inferior do conteúdo deve
deixar o último elemento totalmente acima do lançador no fim da rolagem.

Os botões de `.tool-links` hoje usam margens horizontais negativas dentro de um
contêiner mais estreito. Isso faz o `scrollWidth` do contêiner superar seu
`clientWidth`, embora o documento esconda o sintoma. A margem será movida para o
contêiner e removida dos filhos, preservando o alinhamento visual sem manter
conteúdo interno fora da caixa.

## Arquivos e limites

As mudanças de texto alcançam `js/app.js`, `js/actions.js`,
`js/screens/all.js`, `js/screens/settings.js`, `js/assistant.js`,
`js/budgets.js`, `js/layout.js`, `js/screens/dashboard.js` e
`js/screens/modals.js`. O CSS fica restrito às regras compartilhadas de
navegação, espaçamento inferior, links de ferramentas e lançador do assistente.
O pacote `js/modules/app.generated.js` será alterado apenas pelo comando de
build.

O onboarding permanece no M4. A revisão ampla de foco, ARIA e contraste
permanece no M5. A rota interna `all`, o estado `allSearch` e o endereço `tudo`
não serão renomeados.

## Verificação

Os testes Node devem confirmar “Recursos” na navegação, no título e no atalho de
Ajustes, além de “Assistente financeiro” no cartão, no lançador e no diálogo.
Descrições de testes que tratam a central pelo nome antigo serão atualizadas sem
alterar suas asserções funcionais.

O teste Playwright em 320 px deve comprovar:

1. cada rótulo visível da doca cabe em sua própria caixa;
2. o lançador e a doca não se interceptam;
3. o lançador não cobre o último conteúdo após a rolagem até o fim;
4. `.tool-links` não tem largura rolável maior que sua largura visível;
5. o documento não cria rolagem horizontal.

Depois de `npm run build`, a entrega exige `npm test`, `npm run lint`,
`npm run check:release` e o teste de navegador. O progresso será atualizado com
o comportamento medido e com qualquer limitação real encontrada.
