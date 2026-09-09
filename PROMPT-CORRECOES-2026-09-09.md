# Prompt de correção — Cofre (organizador financeiro)

> Auditoria de **09/09/2026** sobre a branch `deploy-atualizado`, nos papéis de
> desenvolvedor de sistemas, responsável por segurança de dados, consultor
> financeiro e usuário final.
>
> Base da auditoria, tudo executado, nada estimado:
> `npm test` (81 arquivos, 85 asserções, 0 falha), `npm run lint` (0 erro,
> 0 aviso), `npm run check:build`, `npm run test:browser` (21 fluxos × Chromium,
> Firefox e WebKit), `test:pwa`, `test:landing` (18), `npm run test:coverage`
> (81,3% global), `npm audit` (0 vulnerabilidade), `check:release`,
> `check:deploy`, o aplicativo aberto no navegador em 360 / 390 / 1280 px nos
> temas claro e escuro, modo demonstração e cadastro novo do zero, e requisições
> reais contra `https://www.financemanager.dev.br`.
>
> Boa parte do `PROMPT-CORRECOES.md` de 08/09 foi de fato corrigida: P0.1, P0.2,
> P1.1 a P1.5, P2.1 a P2.3, P3.2, P3.3, P4.1 e P4.2 foram conferidos como
> **fechados**. Este documento traz só o que **continua aberto** ou o que
> **apareceu depois**. O que está certo e não deve ser mexido está no fim.

Regras que valem para todos os itens:

- Toda correção entra com teste que **falha antes e passa depois**.
- Não crie motor de cálculo novo. Corrigir aqui é **unificar** caminho, não
  acrescentar mais um.
- Régua de centavos inteiros (`js/utils.js`) preservada. Nenhuma conta em float.
- Identificadores congelados de `docs/MARCA.md` preservados.
- **Não pule para P2 antes de fechar P0 e P1.**

---

## Situação em 09/09/2026, depois das correções

| Item | Estado |
|---|---|
| P0.1 cadastro aberto sem controlador LGPD | **corrigido** (portão no servidor e na interface) |
| P0.2 "Contas em dia" com nota cheia e conta vencida | **corrigido** (score 73 "Bom" virou 63 "Regular" na demonstração) |
| P0.3 produção atrasada | **não existia**: era o `dist/` local velho enganando o `check:deploy`, que foi corrigido |
| P1 a P3 | abertos |

---

## P0 — Impede o lançamento público ou produz veredito falso

### P0.1 — O site está no ar para o público com o controlador LGPD em branco

**Onde:** `docs/LEGAL-LAUNCH.md`, refletido em `js/screens/privacy.js`.

**O defeito.** A tela `#/privacidade` mostra hoje:

```
Controlador               Ainda não definido
CPF ou CNPJ               Ainda não definido
Endereço                  Ainda não definido
Canal de atendimento      Ainda não definido
Encarregado pelos dados   Ainda não definido
Contato do encarregado    Ainda não definido
```

E o próprio app conclui, na mesma tela:

> "Identificação incompleta. Falta definir: nome empresarial ou responsável,
> CPF ou CNPJ, endereço, canal de atendimento, encarregado pelos dados, contato
> do encarregado, canal de comunicação de incidentes. Enquanto isso, esta
> instalação é versão local em desenvolvimento **e não deve ser oferecida ao
> público**."

`npm run check:release` concorda: `AVISO: 7 campo(s) do controlador ainda com
marcador` e `AVISO: 1 serviço(s) externo(s) ainda sem fornecedor definido`.

Só que `https://www.financemanager.dev.br/` responde **200 para qualquer
visitante**, e `/api/account/session` responde `{"ok":true,"configured":true}` —
o backend de contas está ligado e aceitando cadastro. O app coleta email, senha
e dados financeiros de terceiros sem controlador identificado e sem encarregado,
que são exatamente os arts. 9º, 18 e 41 da LGPD. O aviso que o app escreve na
tela é a admissão do problema, não a solução dele.

**A correção, nesta ordem:**

1. Preencher os 7 campos em `docs/LEGAL-LAUNCH.md` e o fornecedor pendente em
   `docs/TERCEIROS-E-OPERADORES.md`.
2. Enquanto os campos não estiverem preenchidos, **o cadastro tem de estar
   fechado em produção**. Faça `check:release` sair com **erro**, não aviso, e
   ligue esse erro ao `buildCommand` do `vercel.json`: build que não passa no
   `check:release` não publica. Aviso que não trava nada é decoração — foi
   exatamente o que permitiu chegar até aqui.
3. Teste em `tests/test-legal-privacy-errors.js` que reprove se `check:release`
   devolver zero havendo marcador pendente.

---

### P0.2 — "Contas em dia": nota cheia com cinco faturas vencidas na tela ao lado

**Onde:** `js/score.js:212-231` (pilar `pontualidade`), alimentado por
`js/metrics.js:568-637` (`upcomingBills`).

```js
// score.js:218
const late = ctx.bills.lateCount;
...
detail: late === 0 ? "Nenhuma conta fixa em atraso neste mês." : ...

// metrics.js:633-636
lateCount:    out.filter((b) => b.kind === "late").length,
overdueCount: out.filter((b) => b.overdue).length,
```

**O defeito.** `lateCount` conta **só** `kind === "late"`, que são gastos fixos
recorrentes ainda não lançados. Fatura de cartão vencida sai com
`kind === "card-statement"` e `overdue: true`, e cai em `overdueCount`, que o
pilar **não lê**. Resultado: inadimplência de cartão — a dívida mais cara do
mercado brasileiro — não tira um único ponto do score.

**Medido com o motor real** (harness sobre `js/metrics.js` + `js/score.js`;
renda R$ 7.200, R$ 1.200/mês no cartão, nenhuma fatura paga em 6 meses):

```json
{ "lateCount": 0,
  "overdueCount": 5,
  "score": 65, "level": "Regular",
  "pontualidade": { "points": 10, "weight": 10,
                    "detail": "Nenhuma conta fixa em atraso neste mês." } }
```

Dez de dez pontos e uma frase **falsa**, com R$ 6.000 vencidos.

No modo demonstração o efeito aparece na mesma rolagem: "Próximas contas" diz
**"5 vencidas · 8 nos próximos 30 dias · R$ 11.805,80"**, o herói desconta
**R$ 7.339,56** de faturas abertas do saldo, e o score exibe **73, "Bom"**, com
o pilar de pontualidade cheio.

**A correção.**

1. O pilar passa a considerar `lateCount + overdueCount`. Fatura vencida pesa
   pelo menos tanto quanto conta fixa não lançada — ela já está rendendo
   rotativo.
2. O texto tem de dizer o que existe: `"5 faturas vencidas, R$ 7.339,56 em
   atraso."` Nunca "nenhuma conta em atraso" quando `overdueCount > 0`.
3. Considere um piso: com qualquer conta vencida, `ratio` não deveria passar de
   ~0,3, e o nível global não deveria chegar a "Bom". Estar em atraso é o sinal
   mais forte que este app consegue ler.
4. Teste em `tests/test-score-explainable.js`: cenário com fatura vencida reprova
   se `pontualidade.points === weight` ou se o `detail` contiver "Nenhuma conta".

---

### P0.3 — ~~O que está publicado não é o que foi auditado~~ (era alarme falso da ferramenta)

> **Correção de 09/09/2026, depois de verificar.** Este item estava errado. A
> produção **não** estava atrasada. Quem estava atrasado era o `dist/` desta
> máquina, e `check:deploy` não sabia dizer a diferença. O que sobrou de real é
> o defeito na ferramenta, corrigido abaixo.

**O que eu tinha reportado:**

```
$ npm run check:deploy
FALHA /index.html entrega os mesmos bytes de dist/app.html:
      local 16775851b3183364 != publicado 95ae161acfe58efb
```

**O que a verificação mostrou.** Construí `origin/main` num worktree limpo e
comparei com o que o domínio entrega:

```
hash produção   : 95ae161acfe58efb
hash origin/main: 95ae161acfe58efb
idênticos?      : true
```

Byte a byte. `www.financemanager.dev.br` estava, e está, exatamente em
`origin/main`. Minificação, fusão do CSS, alvos de toque e a divisão do pacote
em dois pedaços **estão no ar**.

**O defeito real, esse sim.** `scripts/check-deploy.js` compara os bytes
publicados com o `dist/app.html` que estiver em disco, e `dist/` é gerado, não
versionado — o `.gitignore` o exclui. Quem roda a conferência sem reconstruir
compara a publicação de hoje com um pacote gerado antes dos últimos commits, e
recebe uma frase categórica e falsa: *"a produção está atrasada"*. Foi o que
aconteceu aqui, e virou um item P0 que não existia.

**A correção, já aplicada.** `check-deploy.js` passou a comparar a data do
`dist/app.html` com a das fontes que o geram (`js/`, `css/`, `icons/`, os HTML
da raiz, o `service-worker.js` e o próprio `build-dist.js`). Se o pacote for
mais velho que qualquer uma delas, a conferência **se recusa a rodar**:

```
Não foi possível conferir a publicação: dist/ está mais velho que as fontes
(js/score.js mudou depois do build). Comparar assim acusaria a publicação de
estar atrasada quando o atrasado é este disco. Execute `npm run build:dist`
e repita a conferência.
```

Antes de acusar a publicação, a ferramenta agora prova que tem com o que
comparar.

**O que continua pendente.** As correções de P0.1 e P0.2 estão commitadas e
ainda **não publicadas**: enquanto não forem, `check:deploy` aponta a diferença
de hash — e desta vez ela é verdadeira.

---

## P1 — Afirmações que a tela faz e os dados não sustentam

### P1.1 — "Crescimento de 100,0% desde abril" para quem instalou o app hoje

**Onde:** `js/metrics.js:244-268` (`netWorthGrowth`), exibido em
`js/screens/dashboard.js:344-372`.

```js
const pct = !measurable ? null
  : (first !== 0 ? (delta / Math.abs(first)) * 100 : (last > 0 ? 100 : ...));
```

**O defeito.** A janela é fixa em 6 meses e começa antes de o usuário existir.
Quem cadastra a conta hoje tem `first = 0` e recebe `pct = 100`.

**Medido**, três perfis de usuário novo (conta aberta no mês passado, R$ 5.000
hoje):

| Cenário | `first` | `last` | `pct` exibido |
|---|---|---|---|
| Começa do zero | R$ 0,00 | R$ 5.000,00 | **+100,0%** |
| R$ 1,00 no início | R$ 0,00 | R$ 5.000,00 | **+100,0%** |
| R$ 50,00 no início | R$ 0,00 | R$ 5.000,00 | **+100,0%** |

A frase que sai é *"Crescimento de 100,0% desde abril: de R$ 0,00 para
R$ 5.000,00"*. Em abril essa pessoa não usava o app. É uma estatística inventada
sobre um período que não foi medido, e é a primeira coisa que ela lê sobre o
próprio patrimônio.

**A correção.**

1. A janela começa no **primeiro mês com dado real** do usuário, não seis meses
   atrás por decreto.
2. Com menos de 2 meses fechados, ou com `first` abaixo de um piso (sugestão:
   `first < 1% de last`), **não exibir percentual**: exibir só o delta absoluto
   (`+R$ 5.000,00 desde que você começou`). O delta é sempre verdadeiro; o
   percentual sobre base zero, nunca.
3. Teste em `tests/test-dashboard.js` com base zero, reprovando `pct` não nulo.

---

### P1.2 — O tema congela na primeira abertura e não existe "Seguir o sistema"

**Onde:** `js/boot.js`, `js/app.js:948-954` (`systemThemePreference`),
`js/app.js:2588-2640`, `js/screens/settings.js:166-172`.

```js
function systemThemePreference() {
  if (!__themeNeverChosen) return null;   // depois da 1ª vez, nunca mais olha
  ...
}
```

**O defeito, reproduzido no navegador:**

1. Base limpa, sistema em escuro → app abre escuro e **grava**
   `localStorage.financas_theme = "dark"`.
2. Usuário troca o sistema para claro e recarrega → app **continua escuro**
   (`data-theme="dark"` com `matchMedia('(prefers-color-scheme: dark)')` falso).

A preferência do sistema é lida uma vez e virada escolha permanente. Em celular,
onde o tema escuro costuma ser automático por horário, o app passa a discordar do
aparelho todo dia à noite. E `js/screens/settings.js` só oferece um interruptor
binário: não há como voltar para "automático" depois.

**A correção.** Três valores em `data.theme`: `"system"` (padrão), `"light"`,
`"dark"`. Com `"system"`, `applyTheme` acompanha um listener de
`matchMedia("(prefers-color-scheme: dark)")`, e o `theme-color` do `boot.js`
acompanha junto. O interruptor vira três opções. Migração: quem já tem
`"light"`/`"dark"` gravado mantém o que escolheu.

---

### P1.3 — Contraste abaixo de 4,5:1 em texto que carrega número de dinheiro

**Onde:** tokens de cor em `css/base.css` (âmbar de meta, verde de acerto,
vermelho de alerta), usados em `mini-card__sub`, `goal-status`,
`btn--goal-soft`, `plan-verdict`, `debt-strategy__pro`, `debt-burden__label`,
`wealth-delta__value`, `debt-rank`, `settings-destination__stat-value`.

**O defeito.** Medido no navegador, tema claro, compondo as camadas
translúcidas de verdade (elementos com gradiente foram excluídos da medição para
não gerar falso positivo):

| Onde | Texto | Fundo | Razão | Exigido |
|---|---|---|---|---|
| `btn--goal-soft` — "Aportar R$ 350,00", "Ver metas" | `#A9791F` | `#F7EFDC` | **3,37:1** | 4,5:1 |
| `goal-status` — "Ritmo baixo" | `#A9791F` | `#FFFFFF` | **3,86:1** | 4,5:1 |
| `mini-card__sub` — "24% concluída" | `#A9791F` | `#FFFFFF` | **3,86:1** | 4,5:1 |
| valor de meta — "R$ 600,00" | `#A9791F` | `#FAFBFA` | **3,72:1** | 4,5:1 |
| `debt-strategy__pro` — vantagem da estratégia | `#0E8A6E` | `#ECF2F1` | **3,80:1** | 4,5:1 |
| `wealth-delta__value` — "+R$ 42,1 mil" | `#0E8A6E` | `#FAFBFA` | **4,15:1** | 4,5:1 |
| `debt-burden__label` — "Dentro do que o orçamento absorve" | `#0E8A6E` | `#FFFFFF` | **4,30:1** | 4,5:1 |
| `plan-verdict` — "Cabe" | `#0E8A6E` | `#FFFFFF` | **4,30:1** | 4,5:1 |
| `debt-rank` — "1" | `#BE443B` | `#F7E9E7` | **4,35:1** | 4,5:1 |
| `settings-destination__stat-value` | `#BE443B` | `#FBEAE7` | **4,42:1** | 4,5:1 |

Falha de WCAG 2.1 SC 1.4.3 (AA). Não é detalhe estético: `#A9791F` sobre
`#F7EFDC` é o **rótulo de um botão** ("Aportar R$ 350,00") e o veredito de uma
meta. Quem tem baixa visão ou usa o celular no sol perde exatamente a linha que
decide um aporte.

**Por que a suíte não pegou.** `tests/test-accessibility.js` verifica regras de
CSS; nenhum teste calcula contraste **renderizado**, com camada translúcida
composta.

**A correção.**

1. Escurecer os três tokens até no mínimo 4,5:1 sobre **todas** as superfícies em
   que aparecem (branco, `#FAFBFA` e o próprio tom suave). Como referência:
   `#A9791F` → perto de `#8A6114`; `#0E8A6E` → perto de `#0B6E58`; `#BE443B` →
   perto de `#A8382F`.
2. Refazer a mesma medição no tema escuro depois de mexer.
3. Novo teste em `tests/browser/` que percorra as telas, componha os fundos
   translúcidos e reprove abaixo de 4,5:1 (3:1 para texto grande). É o único
   formato que impede a regressão — a verificação em CSS não enxerga isto.

---

### P1.4 — A caixa de seleção de lançamento é anunciada como "on"

**Onde:** `js/screens/analytics.js:71`.

```html
<label class="movement-check" aria-label="Selecionar ${escapeHtml(entry.description)}">
  <input type="checkbox" data-action-select="movement-select" data-id="...">
</label>
```

**O defeito.** O `aria-label` está no `<label>`, não no `<input>`. A árvore de
acessibilidade real do navegador devolve:

```
label "Selecionar Academia"
  checkbox "on"          <- este é o controle em que o leitor de tela para
```

Quem navega por teclado ou leitor de tela percorre a lista de movimentações e
ouve "caixa de seleção, on" a cada linha, sem saber o que está marcando. Falha
de WCAG 4.1.2 (Nome, Função, Valor).

**A correção.** Mover o `aria-label` para o `<input>`. Teste na suíte de
navegador conferindo o **nome acessível computado** do checkbox, não a presença
do atributo no HTML.

---

## P2 — Segurança e entrega

### P2.1 — `connect-src https://*.gov.br` não é usado por nada

**Onde:** `vercel.json`, cabeçalho `Content-Security-Policy`.

**O defeito.** Levantei todas as saídas de rede do cliente:

```
js/auth.js:584      fetch(`${ACCOUNT_ENDPOINT}/${path}`)   ACCOUNT_ENDPOINT = "/api/account"
js/insights.js:292  fetch(ANALYZE_ENDPOINT)                ANALYZE_ENDPOINT = "/api/analyze"
js/storage.js:2991  this.fetch(`${this.baseUrl}${path}`)   baseUrl          = "/api/sync"
```

Nenhum `XMLHttpRequest`, `sendBeacon`, `EventSource` ou `WebSocket`. `gov.br`
aparece só em `<a href target="_blank">` — isso é **navegação**, governada por
`form-action`/`frame-src`, não por `connect-src` — e numa validação de host em
`js/qrcode.js:223`, que é comparação de string e não faz requisição.

Ou seja: o curinga libera milhares de subdomínios de terceiro como destino de
`fetch` em troca de **zero** funcionalidade. Foi apontado como P3.1 em 08/09 e
continua aberto.

**A correção.** `connect-src 'self'`. Rodar `check:deploy` e a suíte para
confirmar que nada quebra — não vai quebrar.

Aproveite o mesmo cabeçalho para duas adições baratas:
`Cross-Origin-Resource-Policy: same-origin` e um `report-to`/`report-uri` na CSP,
para que uma violação futura apareça em vez de falhar em silêncio.

---

### P2.2 — `Permissions-Policy` declara um recurso que o navegador rejeita

**Onde:** `vercel.json`, chave `Permissions-Policy`.

Toda carga de página imprime, três vezes, no console:

```
Error with Permissions-Policy header: Unrecognized feature: 'ambient-light-sensor'.
```

O cabeçalho inteiro **não** é descartado por causa disso, mas o console de um app
financeiro passa a ter ruído constante, e ruído constante é onde erro de verdade
se esconde. Remover `ambient-light-sensor=()` e reconferir a lista contra o
registro atual de recursos (`interest-cohort` também já saiu da especificação).

---

### P2.3 — 1,3 MB na primeira carga; 900 KB só no pacote crítico

**Medido** contra `dist/` servido localmente:

| Recurso | Bruto | gzip |
|---|---|---|
| `app.generated.js` (crítico) | **900 KB** | **277 KB** |
| `app.extras.generated.js` (13 telas, pré-carregado em ocioso) | 191 KB | 48 KB |
| `css/style.css` | 203 KB | 33 KB |
| **Total transferido na 1ª carga** | **1.307 KB** | ~360 KB |

Primeira pintura com conteúdo em 148 ms e uma tarefa longa de 65 ms — em
desktop, em `localhost`. Num Android mediano (CPU 4 a 6× mais lenta) essa tarefa
vira 250 a 400 ms, somada ao download de 277 KB em rede móvel. A divisão em dois
pedaços (commit `999096b`) tirou 13 telas do caminho crítico, o que é correto,
mas o núcleo continua sendo um bloco único de 900 KB.

**A correção**, por ordem de retorno:

1. Um terceiro pedaço para o que só abre sob ação explícita: importador de
   OFX/CSV/PDF (`js/import.js`, `js/pdf-import.js`, `js/pdf.js`), leitor de QR
   (`js/qrcode.js`) e simuladores (`js/simulators.js`, 60 KB de fonte). Nada
   disso é necessário para a primeira pintura.
2. `css/style.css` fatiado no mesmo critério do JS: o crítico entra em linha, o
   resto carrega depois.
3. Teto medido em `tests/test-performance.js`, reprovando se o pacote crítico
   passar de um limite em bytes **comprimidos**. Sem teto, o pacote volta a
   crescer no commit seguinte.

---

### P2.4 — Cobertura baixa justamente onde estão sessão e dinheiro

`npm run test:coverage` — global 81,3%, piso 75%. Abaixo do piso:

```
!  56,2%  js/auth.js              <- 71 KB: sessão, PKCE, troca de senha, revogação
!  60,9%  js/app.js
!  23,9%  js/screens/simulate.js
!  29,1%  js/screens/modals.js
!  42,0%  js/qrcode.js            <- lê Pix da câmera
!  54,9%  js/screens/portfolio.js
!  61,2%  js/contextual-assistant.js
!  63,6%  js/insights.js          <- monta o que sai para a IA
!  65,2%  js/screens/accounts.js
!  70,2%  js/screens/analytics.js
!  74,8%  js/screens/import.js
```

`js/auth.js` é o arquivo mais sensível do cliente e o penúltimo em cobertura.
Subir `auth.js`, `insights.js` e `qrcode.js` para o piso é o alvo: os três
tratam, respectivamente, sessão, dado que sai do aparelho e entrada vinda da
câmera.

---

## P3 — Clareza e acabamento

### P3.1 — O cartão de assinaturas mostra um número que não é de assinaturas

`js/screens/subscriptions.js:347` — `leak-total` recebe `committedMonthly`, que
`js/recurring.js:494` define como assinaturas **+** essenciais **+** recorrentes
variáveis. Na demonstração o cartão fica assim:

```
Assinaturas e recorrências
11 recorrências identificadas, 4 delas assinaturas · R$ 3.920,40 por ano em assinaturas
                                                              R$ 3.748,58/mês
```

R$ 3.920,40/ano são R$ 326,70/mês. O número grande, R$ 3.748,58, é outra coisa —
e por acaso é idêntico ao total de despesas do mês, o que reforça a leitura
errada. Rotular (`R$ 3.748,58/mês comprometidos`) ou separar em duas linhas.

### P3.2 — A demonstração é uma má primeira impressão do produto

`js/demo.js:36-42` — `demoIsoDay` limita o dia a `min(28, hoje.getDate())`.
Consequência: **todo** lançamento do mês corrente cai no dia de hoje. Aberta no
dia 9, a demonstração mostra "Últimos lançamentos" com seis linhas datadas
`09/09`, e as estimativas de ritmo diário saem de um mês em que nada aconteceu
até hoje.

Pior: a demonstração nasce com **cinco faturas de cartão vencidas**,
R$ 7.339,56 — 102% da renda mensal fictícia. O primeiro contato de um visitante
com o produto é um painel dizendo "5 vencidas" com um score "Bom" ao lado (ver
P0.2). Pagar as faturas antigas no conjunto fictício, deixando no máximo a do
mês corrente em aberto, e distribuir os dias do mês corrente proporcionalmente
ao dia de hoje em vez de empilhar tudo num só.

### P3.3 — `userName: "Convidada"`

`js/demo.js:134`. A saudação sai "Boa noite, Convidada" para todo mundo. Usar
algo neutro ("Boa noite!" sem nome, ou "Visitante").

### P3.4 — `series[].net` não é líquido

`js/simulators.js:197` e `:201` gravam `net: balance`, que é o **bruto**. Os
totais corretos existem em `netFinal`/`tax`, e a tabela de IR está certa
(conferido: 20% até 360 dias, 17,5% até 720, 15% acima, com tributação por lote
quando há aporte mensal). Hoje nenhuma tela lê `series[].net`, então não há
defeito visível — mas um campo chamado `net` que devolve o bruto é uma armadilha
para o próximo gráfico. Ou desconta o IR proporcional, ou muda de nome.

### P3.5 — Botão desabilitado com a razão em `aria-describedby`

O assistente faz certo em explicar por que "Continuar" está travado
(`aria-describedby="onb-block-reason"`), mas um `<button disabled>` sai da ordem
de tabulação e a maioria dos leitores de tela não anuncia a descrição de um
controle desabilitado. Trocar `disabled` por `aria-disabled="true"` mantendo o
botão focável, e barrar a ação no manipulador.

### P3.6 — `engines` diz 22.x e a máquina de desenvolvimento roda 24.19.0

`package.json` fixa `node: 22.x`, o CI usa 22, a máquina local está em v24.19.0.
Toda a auditoria local rodou num runtime que não é o de produção. Alinhar com um
`.nvmrc`.

---

## O que **não** mudar

Foi verificado e está correto. Mexer aqui é regressão:

- **Contabilidade em centavos inteiros** (`js/utils.js`). `parseMoneyInput`
  resolve "1.234,56", "1,234.56", "(12,00)" e "R$ 30" pela regra do último
  separador, documentada e testada.
- **Matemática financeira.** PRICE de R$ 100.000 a 1% a.m. por 120 meses:
  parcela R$ 1.434,71 e juros R$ 72.165,06, contra R$ 1.434,71 / R$ 72.165,14
  teóricos. SAC confere na primeira e na última parcela. Conversão anual→mensal é
  geométrica. Tabela de IR de renda fixa correta, **com tributação por lote** no
  aporte mensal — que é onde quase todo aplicativo erra. CDC art. 52 §2º com
  desconto a valor presente na quitação antecipada.
- **Fronteira regulatória da IA** (`netlify/functions/_shared/ai-boundaries.js`
  espelhado em `js/insights.js`): bloqueia produto, ativo e instituição nomeados
  e deixa passar educação sobre risco, com teste que reprova se as duas cópias
  divergirem.
- **Backend.** Toda chamada com `service_role` é escopada por `session.user.id`
  verificado. Origem cruzada recusada em produção (`403 origin_denied`
  conferido). `/api/analyze` e `/api/sync` recusam sem sessão. Segredo nenhum no
  repositório. `npm audit`: 0 vulnerabilidade.
- **Cabeçalhos de produção**: CSP sem `unsafe-inline`, HSTS de 2 anos com
  `includeSubDomains`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`,
  `form-action 'none'`, `Referrer-Policy`, `nosniff` — todos conferidos na
  resposta real do domínio.
- **Service worker**: `/api/` nunca cacheado, `FONT_HOSTS` vazio (nenhuma fonte
  de terceiro), cache separado para shell e páginas, gravação dentro de
  `waitUntil`.
- **Semântica e responsividade**: `lang="pt-BR"`, link de pular para o conteúdo,
  marcos corretos, um `h1` por tela, nenhum salto de nível de cabeçalho, nenhum
  botão sem nome, nenhuma imagem sem `alt`, e **zero estouro horizontal** nas 23
  telas entre 320 e 1440 px. A suíte de navegador passa nos três motores.
- **A separação de naturezas contábeis** (`TRANSACTION_NATURES`): aporte,
  resgate, principal, encargos, transferência e estorno tratados à parte de
  consumo. É o que faz os totais deste app fecharem.

---

## Nota de método

Não consegui entregar clique sintético de ponteiro de forma confiável pelo painel
de navegador desta sessão; as interações foram acionadas pelos mesmos
manipuladores delegados (`data-action`) via `.click()`, e a medição de layout,
contraste e árvore de acessibilidade foi feita sobre o DOM renderizado. Entrada
real de ponteiro e teclado está coberta pela suíte Playwright do próprio projeto,
que passa nos três motores.
