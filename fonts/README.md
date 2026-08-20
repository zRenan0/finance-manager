# Fontes locais

O aplicativo **não busca fontes de terceiros**. Antes, o `index.html` carregava
Inter e Space Grotesk de `fonts.googleapis.com`, o que tinha três custos:

1. **Privacidade.** Toda abertura do app enviava o IP do usuário a um terceiro,
   num aplicativo cuja proposta é justamente manter os dados no aparelho. A
   política de privacidade não mencionava esse envio.
2. **Offline.** A primeira carga sem rede ficava sem a fonte, e o texto pulava
   de forma quando ela chegava depois.
3. **Segurança.** A CSP precisava liberar dois domínios externos em `style-src`
   e `font-src`, ampliando a superfície sem necessidade.

## Como está agora

Esta pasta está vazia, e o projeto assume isso.

`css/base.css` declara `@font-face` para Inter e Space Grotesk com **apenas
`local()`** na origem. Quem tem uma das famílias instalada no sistema vê a
tipografia do projeto; quem não tem cai na pilha do sistema declarada logo
abaixo, que é a mesma escolha da página comercial (`css/landing.css`). Em
nenhum dos dois casos sai requisição de fonte.

O `url("../fonts/inter-400.woff2")` que existia ao fim de cada `src` saiu por
medida, não por gosto: como o arquivo nunca esteve aqui, ele rendia **duas
requisições 404 por abertura** para quem não tivesse as famílias instaladas —
que é a maioria. O navegador recebia a página de erro em HTML, tentava lê-la
como WOFF2, descartava, e usava a pilha do sistema do mesmo jeito. O custo era
real; o resultado, nenhum.

## Para incluir as fontes do projeto

Coloque nesta pasta os arquivos abaixo, em WOFF2:

```
fonts/inter-400.woff2
fonts/inter-500.woff2
fonts/inter-600.woff2
fonts/inter-700.woff2
fonts/space-grotesk-500.woff2
fonts/space-grotesk-600.woff2
fonts/space-grotesk-700.woff2
```

E devolva o `url()` ao fim de cada `src` em `css/base.css`:

```css
src: local("Inter"), local("Inter Regular"),
     url("../fonts/inter-400.woff2") format("woff2");
```

Ambas as famílias estão sob a SIL Open Font License 1.1, que permite
redistribuição junto com o aplicativo. Guarde o arquivo de licença de cada
família nesta mesma pasta ao adicioná-las.

O `scripts/build-dist.js` copia esta pasta para `dist/` quando ela tem
arquivos. O teste `tests/test-commercial-readiness.js` reprova se a folha do
app voltar a apontar para um arquivo de fonte enquanto ele não estiver aqui, e
`tests/test-landing.js` faz o mesmo pela página comercial.

## A página comercial usa o mesmo critério

`css/landing.css` **não declara `@font-face`**. Ela declarava, apontando para
`fonts/inter-400.woff2` e `fonts/space-grotesk-500.woff2` — os mesmos arquivos
que nunca estiveram aqui. O sintoma era o descrito acima, mais uma tipografia
diferente conforme a pessoa tivesse ou não as famílias instaladas no próprio
sistema.

Hoje a landing usa uma pilha do sistema escolhida (`ui-sans-serif`,
`system-ui`, e daí para baixo), com tamanho, entrelinha e espaçamento ajustados
para ela. Para voltar às fontes do projeto naquela página: coloque os arquivos
nesta pasta, declare os `@font-face` no topo de `css/landing.css` e ponha o
nome da família na frente de `--lp-font-display` e `--lp-font-body`.
