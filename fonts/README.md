# Fontes locais

O aplicativo **não busca fontes de terceiros**. Inter (texto) e Space Grotesk
(títulos e números) são servidas desta pasta, do próprio site, e entram no
pré-cache do service worker junto com o restante do shell. Três consequências:

1. **Privacidade.** Nenhuma abertura do app envia o IP do usuário a um
   servidor de fontes. A CSP libera apenas `font-src 'self'`.
2. **Offline.** A primeira carga sem rede já sai com a tipografia do projeto,
   e o texto não pula de forma quando a fonte chega depois.
3. **Consistência.** A interface tem a mesma cara em Windows, Android, iPhone
   e Mac. Resolvida só por `local()`, como era antes, ela mudava conforme o
   aparelho e, onde havia uma Inter estática instalada, o navegador fabricava
   o negrito a partir do peso 400.

## Arquivos

| Arquivo | Família | Pesos | Subconjunto | Tamanho |
|---|---|---|---|---|
| `inter-latin-wght-normal.woff2` | Inter v4 (variável) | 100 a 900 | latino (cobre todo o português) | 48 kB |
| `space-grotesk-latin-wght-normal.woff2` | Space Grotesk (variável) | 300 a 700 | latino | 22 kB |

Origem: pacotes `@fontsource-variable/inter` e `@fontsource-variable/space-grotesk`
(versão 5.3.0), que redistribuem os arquivos oficiais já subdivididos por
alfabeto. O subconjunto latino inclui U+0000 a U+00FF, o suficiente para
acentos, cedilha e o símbolo de real.

Ambas as famílias estão sob a **SIL Open Font License 1.1**. O texto da
licença de cada uma está nesta pasta (`LICENSE-Inter.txt` e
`LICENSE-SpaceGrotesk.txt`) e precisa acompanhar os arquivos em qualquer
redistribuição.

## Onde são declaradas

`css/base.css` declara um `@font-face` por família, com `font-display: swap`
e o `unicode-range` do subconjunto. `index.html` faz `preload` da Inter, que é
a fonte do primeiro texto pintado. `service-worker.js` lista os dois arquivos
no `APP_SHELL`. `scripts/build-dist.js` copia a pasta para `dist/`.

`tests/test-commercial-readiness.js` reprova se a folha do app referenciar um
arquivo de fonte que não exista aqui, se alguma fonte vier de outro endereço,
se faltar o arquivo de licença ou se os arquivos saírem do pré-cache.

## A página comercial

`css/landing.css` **não declara `@font-face`** e usa uma pilha do sistema
escolhida (`ui-sans-serif`, `system-ui`, e daí para baixo), com tamanho,
entrelinha e espaçamento ajustados para ela. É uma decisão da página, que não
promete funcionar offline. Para levar as fontes do projeto para lá: declare os
`@font-face` no topo de `css/landing.css` apontando para estes arquivos e
ponha o nome da família na frente de `--lp-font-display` e `--lp-font-body`.
