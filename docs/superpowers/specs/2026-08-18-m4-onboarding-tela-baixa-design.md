# M4: onboarding em tela baixa e zoom de 200%

## Objetivo

Garantir que os quatro passos da configuração inicial funcionem em uma viewport
touch de 320 por 480 px e no espaço CSS equivalente a uma janela ampliada em
200%. Nenhum trecho pode começar fora da área alcançável, e as ações de pular,
voltar, continuar e concluir devem permanecer disponíveis durante a leitura do
conteúdo.

## Defeito confirmado

`.onb` é um contêiner flex centralizado e também é o elemento rolável. Quando a
folha é maior que a viewport, a centralização coloca metade do excesso acima de
zero, fora do intervalo que `scrollTop` consegue alcançar.

Em 320 por 480 px, o passo 1 começou em `top: -325,5px`. Com o resumo legal
aberto, começou em `top: -462,4px`. Os passos 2 e 3 também esconderam o botão
“Pular por agora”. A posição de rolagem externa ainda foi herdada entre etapas,
fazendo o passo 4 abrir no meio do conteúdo.

## Abordagens consideradas

1. Limitar a folha à viewport e rolar apenas o corpo. É a escolha adotada porque
   mantém contexto, progresso e ações visíveis, sem remover informação.
2. Alinhar a folha inteira ao topo e continuar rolando a camada externa. Corrige
   o início negativo com menos CSS, mas deixa o usuário percorrer mais de mil
   pixels para alternar entre conteúdo e ações no passo 1.
3. Esconder textos e opções em tela baixa. Reduz altura, mas piora a decisão do
   usuário e não corrige a causa estrutural.

## Estrutura escolhida

O HTML atual já separa `.onb__head`, `.onb__progress`, `.onb__body` e
`.onb__foot`, portanto não precisa ser refeito. A folha terá altura máxima igual
à viewport dinâmica menos os insets verticais. Cabeçalho, progresso e rodapé não
encolhem. O corpo recebe `min-height: 0`, rolagem vertical própria e contenção de
overscroll.

Em telas grandes, a folha continua com altura natural e centralizada. Em telas
baixas, somente o conteúdo entre progresso e rodapé rola. Abrir o resumo legal
aumenta o `scrollHeight` do corpo sem mover o cabeçalho ou o botão principal. A
recriação do corpo a cada troca de etapa reinicia a nova etapa no topo.

O padding da camada continua respeitando a área segura uma única vez. A folha
usa `100vh` como alternativa e `100dvh` quando disponível, para acompanhar a
altura visível em navegadores móveis.

## Verificação

Um cenário Playwright dedicado deve percorrer os quatro passos em:

1. viewport touch de 320 por 480 px;
2. viewport CSS de 390 por 450 px com escala de dispositivo 2, equivalente ao
   espaço entregue por uma janela física de 780 por 900 px em zoom de 200%.

Em cada etapa, o teste mede os retângulos reais e confirma:

1. folha, cabeçalho, progresso e rodapé inteiros dentro da viewport;
2. botão principal com pelo menos 44 px de altura e totalmente visível;
3. corpo com altura positiva e último conteúdo alcançável pela rolagem;
4. nenhuma sobreposição entre corpo e rodapé;
5. ausência de rolagem horizontal no documento, na camada, na folha e no corpo;
6. nova etapa e retorno pela ação “Voltar” começando no topo;
7. resumo legal aberto sem deslocar as ações para fora da tela.

O teste conclui o fluxo pelos controles reais. O módulo não inclui mudanças de
foco preso, Escape, ARIA geral ou contraste, que pertencem ao M5.
