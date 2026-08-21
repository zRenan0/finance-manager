# Próxima sessão: achados de beta que faltam corrigir

Registrado em 20/08/2026, depois do commit `777dffe`.

Este arquivo é um **handoff**: ele carrega o contexto de uma sessão de teste de
beta feita usando o aplicativo como usuário final. Serve para duas coisas:

1. Ser colado inteiro como prompt para um assistente em outra máquina.
2. Ser lido por qualquer pessoa que pegue estes consertos depois.

A ordem da seção "O que falta" é por retorno sobre esforço, não por gravidade.

---

## O projeto, em um parágrafo

O "Cofre" é um organizador financeiro pessoal: PWA local-first em HTML, CSS e
JavaScript puros, sem nenhuma dependência em produção, com os dados no IndexedDB
do próprio aparelho. Público brasileiro, interface em português. A branch local
`deploy-atualizado` rastreia `origin/main`, então um push daqui cai na `main` do
GitHub e dispara o deploy na Vercel.

```
npm start           servidor de desenvolvimento em localhost:4173
npm run build       REGENERA js/modules/app.generated.js
npm test            suíte completa (41 arquivos hoje)
npm run lint        análise estática
npm run build:dist  gera dist/ (produção)
```

`npm run build` é obrigatório depois de editar qualquer coisa em `js/`. O
aplicativo carrega o bundle gerado, não as fontes; sem o build, o navegador
continua rodando o código anterior.

---

## O que já foi corrigido: não refazer

O commit `777dffe` resolveu seis defeitos, todos com teste de regressão:

| Achado | Defeito | Onde |
| --- | --- | --- |
| F-01 | Service worker nunca era registrado; não havia modo offline nem PWA | `js/app.js` |
| F-02 | Cartão do saldo somava renda declarada com economia realizada | `js/screens/dashboard.js` |
| F-03 | Tela de conta abria com erro porque `/api` devolvia HTML com status 200 | `js/auth.js`, `scripts/serve.js` |
| F-04 | Data pura lida como UTC voltava um dia e inventava horário | `js/screens/modals.js` |
| F-05 | Lançamentos anteriores à abertura sumiam do saldo sem aviso | `js/data-sources.js`, `js/screens/accounts.js`, `js/screens/import.js` |
| F-07 | Foco do teclado caía no `body` a cada render | `js/app.js` |

As regressões estão travadas em `tests/test-beta-fixes.js`, com 53 asserções.
É lá que os novos consertos devem ganhar teste, no mesmo formato: um bloco por
achado, com asserção do caso positivo **e** do negativo.

---

## Convenções do repositório

1. **Nada de travessão nem emoji** em arquivos de `js/` ou nos CSS principais.
   O `tests/test-input-validation.js` falha se aparecer. Use vírgula ou
   dois-pontos.
2. **Comentários em português explicando o porquê**, não o quê: qual defeito
   aquele trecho evita. É o padrão da casa e vale manter.
3. **Dinheiro é sempre centavos inteiros.** Nunca somar float.
4. **Pluralização correta** ("1 movimentação" / "2 movimentações"). Nunca "(s)".

---

## Armadilhas conhecidas

Cada uma destas já custou tempo de diagnóstico:

- O service worker agora funciona e usa *stale-while-revalidate*. Em
  desenvolvimento, depois de editar código, o navegador serve o bundle
  **anterior**. Recarregue duas vezes ou use `location.reload()`.
- Navegar mudando só o hash (`#/rota`) **não** recarrega o documento nem o
  módulo ES. Para exercitar código novo, faça reload de verdade.
- Não use viewport emulada com dimensões personalizadas em automação de
  navegador: as coordenadas de clique desalinham e o clique cai no elemento
  errado, o que produz relatório de defeito inexistente.
- `npm run check:deploy` compara o `dist/` local com o site **publicado**.
  Divergir é esperado enquanto não houver deploy; não é falha.
- Enter sintético de harness de automação não ativa botão (não gera `click`).
  Não conclua defeito de teclado a partir disso.

---

## O que falta

### 1. F-08: "(s)" em mais de 60 textos visíveis

O de melhor retorno. Aparece em "Importar 6 lançamento(s)", "9 categoria(s)
principais", "Estes 8 lançamento(s) existem só neste aparelho". São 26
ocorrências de `lançamento(s)`, 8 de `subcategoria(s)`, 6 de `categoria(s)`,
mais `regra(s)`, `dia(s)` e `novo(s)`.

O aplicativo **já sabe fazer certo**: `js/screens/accounts.js` escreve
"1 movimentação / 8 movimentações" e "1 pendência / 2 pendências". A régua
existe, só não foi aplicada no resto.

Sugestão: um auxiliar em `js/utils.js` no formato
`plural(n, "lançamento", "lançamentos")` e a troca de todas as ocorrências.

```
grep -rn "(s)" js/ --include=*.js | grep -v app.generated
```

### 2. F-16: chip de categoria vira subcategoria

Em `js/screens/add.js`, por volta da linha 114, o rótulo do chip é
`selectedChild ? selectedChild.name : c.name`. Ao escolher "Mercado" dentro de
"Alimentação", a fila passa a mostrar "Moradia, Mercado, Transporte",
misturando dois níveis da taxonomia na mesma fileira.

Sugestão: "Alimentação > Mercado" no chip, ou o nome do pai em cima e o do
filho menor embaixo. O ícone já troca para o do filho, e isso é bom; preserve.

### 3. F-09: total enganoso na revisão da importação

`js/screens/import.js`, linha aproximada 60. O texto "total R$ 7.250,25" soma
receita e despesa em módulo (R$ 5.420,00 de salário mais R$ 1.830,25 de gastos).
O número não significa nada e assusta na hora de confirmar.

Sugestão: "6 lançamentos: R$ 5.420,00 em entradas e R$ 1.830,25 em saídas".

### 4. F-15: modelo de meta não preenche o valor alvo

`js/goals.js`, por volta da linha 30, em `GOAL_TEMPLATES`. O modelo "Reserva de
emergência" preenche nome e prazo e deixa **Valor alvo em branco**, sendo que a
tela inicial já calcula e exibe "6 meses de despesa (R$ X/mês)".

Sugestão: sugerir `6 x despesa média` como alvo, editável. É exatamente a conta
que o modelo existe para fazer.

### 5. F-10: botões desabilitados sem explicar por quê

`js/screens/onboarding.js`, linhas 77 e 83. "Continuar" e "Pular por agora"
ficam `disabled` até o aceite dos termos, sem `title`, sem `aria-describedby` e
sem texto de apoio. Quem clica não recebe resposta nenhuma.

Sugestão: uma linha abaixo do checkbox ("Marque o aceite para continuar") e um
`aria-describedby` ligando o botão a ela.

**Decisão pendente:** "Pular por agora" também travado é estranho, porque o
rótulo promete uma saída que não existe. Confirmar se ele deve mesmo ficar
bloqueado antes de mexer.

### 6. F-12: falta teto de sanidade no valor

**Este achado estava mal descrito no relatório original.** O `-50` virando `50`
e o `12,345` virando `12,34` **não são defeitos**: o `sanitizeDecimalInput`
(`js/utils.js:207`) corta o sinal e a terceira casa enquanto se digita, à vista,
e a direção do dinheiro vem do botão Gasto/Receita. Não mexer nisso.

O que falta de verdade é **teto**: não existe limite nenhum no código. Foi
possível salvar R$ 999.999.999.999, o que estourou o layout do seletor de conta
(que passou a exibir "-R$ 1.000.000.001.063,26").

Sugestão: um limite razoável, com mensagem clara em vez de corte silencioso.

### 7. F-17: "Sobra média dos últimos 1 mês"

`js/screens/goals.js`, linha 78. Quando `capacityMonths` vale 1, o texto sai
como "dos últimos 1 mês". Deveria ser "do último mês". Mesma família do F-08.

### 8. F-13: dois contrastes abaixo de 4,5:1 no tema escuro

Foram medidas 36 combinações de texto com composição alpha correta; 34 passaram.
Falharam duas:

| Elemento | Cores | Contraste |
| --- | --- | --- |
| Badge numérico do sino | branco sobre `#E9736A` | 2,95:1 |
| Pílula "30 dias" da previsão | branco sobre `#1FB394` | 2,65:1 |

O mínimo do WCAG AA para texto pequeno é 4,5:1. Escurecer o fundo ou usar texto
escuro resolve os dois.

### 9. F-14: um alvo de toque com 40px

Em 375px de largura, 36 dos 37 elementos interativos passam os 44x44. O botão
"Como foi calculado" fica em 140x40. O estilo está em
`css/screens/transparency-assistant-sources.css`, na classe `.calculation-link`;
já existe uma media query levando a altura para 40px. Levar para 44.

### 10. F-11: marca inconsistente

A página comercial é "Cofre | Organizador financeiro pessoal"; o aplicativo é
"Finanças | Controle Financeiro Pessoal", e o cabeçalho escreve "Finanças". Quem
clica em "Começar grátis" no Cofre chega em outro produto.

Opinião registrada: "Cofre" é o nome melhor. É nome e não categoria, tem imagem
mental, combina com o discurso de dados no próprio aparelho e é buscável.
"Finanças" é impossível de procurar.

**Decisão pendente:** é escolha de marca, do dono do produto. A troca mexe em
`manifest.webmanifest`, `index.html`, `landing.html` e em vários textos.

### 11. F-06: bundle sem minificação

Medições no bundle de produção:

| Caminho | Bruto | Brotli |
| --- | --- | --- |
| Hoje | 1.492 KB | 312 KB |
| Sem comentários e indentação | ~1.116 KB | ~290 KB |
| Minificador de verdade | ~600 KB | ~160 KB |

São 4.256 linhas de comentário (14,2% do arquivo) indo para produção. O ganho
principal não é o download: é o tempo de *parse* num aparelho modesto, que
compressão nenhuma reduz.

**Decisão pendente:** o projeto não tem nenhuma dependência instalada, e
minificar de verdade exige adicionar uma. Seria dependência de **build**, não de
runtime, então não fere o princípio de "sem dependências em produção"; ainda
assim é mudança de postura do projeto e precisa de aval.

---

## Como conduzir o trabalho

Comece pelos itens 1 a 4, que concentram o retorno. Para cada um:

1. Editar a fonte em `js/`.
2. Rodar `npm run build`.
3. Acrescentar as asserções em `tests/test-beta-fixes.js`.
4. Rodar `npm test` e `npm run lint` antes de dar por encerrado.
5. Verificar no navegador o que for visível, com reload de verdade.

Se algum achado aqui estiver mal descrito, como o F-12 estava, diga isso em vez
de implementar a descrição errada. Os itens 5, 10 e 11 têm decisão pendente e
não devem ser resolvidos sem confirmação.
