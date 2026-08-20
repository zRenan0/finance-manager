# Conclusão dos módulos nativos e do CSS

## Objetivo

Encerrar a dívida técnica dos antigos itens 12 e 14 sem alterar regras financeiras, dados salvos, navegação ou funcionamento offline.

## Decisão de arquitetura

Os arquivos de domínio e tela continuam pequenos e independentes no repositório, pois os testes unitários os executam isoladamente. Um script de construção concatena esses arquivos, na ordem declarada e verificada, em um único módulo ES gerado para o navegador. O `index.html` passa a carregar somente o bootstrap modular. O bootstrap cria os serviços de interface e importa o módulo gerado.

Essa solução preserva o projeto estático, não adiciona framework nem dependências de produção e retira as declarações do escopo global do navegador. O artefato gerado não vira fonte de edição: o teste de publicação falha quando ele estiver diferente dos arquivos de origem.

## Estilos calculados

Os atributos `style` serão removidos dos modelos HTML. Valores calculados, como largura de progresso e cor de categoria, irão para `data-ui-css`. Antes da pintura, um serviço valida essas declarações, cria uma classe estável e insere a regra em uma folha CSS externa reservada para isso. O atributo temporário é removido do elemento.

Declarações inválidas, URLs, expressões, chaves e conteúdo que possa fechar uma regra CSS serão recusados. Como as regras entram em uma folha externa da própria origem, a política de segurança poderá retirar `unsafe-inline` de `style-src`.

## Compatibilidade

`boot.js` permanece pequeno e clássico porque precisa definir o tema antes da primeira pintura. Os testes Node continuam lendo os arquivos de origem. O service worker passa a guardar o módulo gerado e a folha dinâmica, em vez dos 59 arquivos que o navegador não consome mais.

## Verificação

A entrega precisa passar pelos testes unitários, testes de navegador, verificação de publicação, conferência de sintaxe do módulo gerado e auditorias que garantam:

1. somente um ponto de entrada modular para o aplicativo;
2. nenhum atributo `style` nos modelos HTML;
3. nenhum manipulador de evento inline;
4. artefato gerado idêntico às fontes;
5. política de segurança sem permissão para estilos inline;
6. funcionamento offline com a nova lista do cache.

## Marco estável

Depois das verificações, todo o estado atual será registrado em um primeiro commit local, incluindo documentação, testes e artefato gerado. Nenhum serviço externo será publicado e nenhum dado do usuário será enviado.
