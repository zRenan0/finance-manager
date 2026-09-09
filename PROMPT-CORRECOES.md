# Prompt de correção — Cofre (organizador financeiro)

> Auditoria feita em 08/09/2026 sobre a branch `deploy-atualizado`, com a suíte
> completa passando (81 arquivos, cobertura global 79,9%) e o modo demonstração
> aberto no navegador. Todos os números citados abaixo foram lidos da tela
> renderizada ou medidos, não estimados.

Você vai corrigir o app na ordem abaixo. **Não pule para P2 antes de fechar P0 e
P1**: os itens de P0 produzem um veredito financeiro falso, e nenhum ganho de
desempenho compensa isso.

Regras que valem para todos os itens:

- Toda correção entra com teste que **falha antes e passa depois**. A suíte já
  tem o lugar certo para cada um (`tests/test-money.js`, `test-dashboard.js`,
  `test-health.js`, `test-insights-engine.js`).
- Não crie um motor de cálculo novo. O problema deste app é **excesso** de
  motores paralelos para a mesma grandeza. Toda correção deve **remover** um
  caminho de cálculo, não acrescentar.
- Mantenha a régua de centavos inteiros (`js/utils.js`). Nenhuma conta nova em
  float.
- Preserve os identificadores congelados de `docs/MARCA.md`.

---

## P0 — Correções que mudam o diagnóstico financeiro do usuário

### P0.1 — A projeção linear do mês multiplica despesas que não se repetem

**Onde:** `js/metrics.js:392-395` e `js/analytics.js` (`anAverages`, ~linha 493).

```js
// metrics.js:392
const projectedExpense = progress.isCurrent && progress.ratio > 0.15
  ? divMoney(totals.expense, progress.ratio)
  : totals.expense;

// analytics.js — mesma conta, outro nome
const daily = divMoney(totals.expense, elapsed);
projected: mulMoney(daily, totalDays)
```

**O defeito.** As duas funções extrapolam o gasto do mês inteiro dividindo o
realizado pela fração do mês decorrida. Isso trata **toda** despesa como se ela
se repetisse todo dia. No dia 8 de setembro, com aluguel de R$ 1.850,00 já pago,
a conta multiplica esse aluguel por 30/8 = 3,75 e projeta que o usuário vai
pagar aluguel quase quatro vezes no mesmo mês.

**O efeito medido no modo demonstração:**

| Grandeza | Valor coerente | O que a projeção linear diz |
|---|---|---|
| Gasto até o dia 8 | R$ 3.748,58 | — |
| Fechamento do mês | R$ 8.407,36 (motor de previsão) | **R$ 14.057,18** |
| Economia projetada | positiva | **−R$ 6.857,18** |

Esse `projectedExpense` alimenta `scoreMonthBasis` (`js/score.js:48-56`), que
alimenta dois pilares:

- `poupanca` (peso 25): taxa negativa → `scoreRamp` devolve 0 → **0 de 25**
- `gastos` (peso 15): 14.057/7.200 = 195%, acima do teto de 110% → **0 de 15**

Resultado: **40 pontos de peso zerados por um artefato aritmético**, e uma
pessoa que guardou 48% da renda no mês recebe **score 25, nível "Crítico"**, com
a frase "Prioridade agora é estancar o desequilíbrio". Esse é o pior erro
possível para este produto: ele não erra um número de canto, ele erra o
veredito.

**A correção.** O app **já tem o cálculo certo** em `js/forecast.js`
(`monthCloseForecast`), que é o que a tela "Como o mês fecha" usa e que separa:

```
contas previstas (fixas, parcelas, faturas com data)  R$ 8.229,56
gastos variáveis estimados (média)                    R$   177,80
```

Faça `projectedExpense` e `anAverages().projected` **passarem a derivar de
`monthCloseForecast`**, com a regra:

```
projeção = gasto realizado até hoje
         + compromissos já datados que ainda vão cair no mês
         + (média diária APENAS do gasto variável × dias restantes)
```

O "gasto variável" é o que já não está classificado como fixo, parcela ou
fatura. `js/recurring.js` já sabe identificar isso.

Depois da correção, **remova** a fórmula antiga dos dois arquivos. Se
`anAverages` ficar sem uso próprio, apague-a.

**Teste obrigatório.** Base sintética: renda 7.200, aluguel 1.850 pago no dia 3,
gastos variáveis de 60/dia, "hoje" = dia 8. A projeção não pode passar de
~R$ 3.650 e o score não pode cair abaixo de "Regular". Congele esse cenário para
que a regressão não volte.

---

### P0.2 — O limite diário oferece o patrimônio acumulado como mesada

**Onde:** `js/forecast.js:549-565` (`dailyAllowance`), exibido por
`js/screens/calendar.js:264-286`.

```js
const disponivel = subMoney(subMoney(addMoney(close.saldoAtual, close.receitas), close.contas), alvo.value);
const porDia = disponivel > 0 ? divMoney(disponivel, diasRestantes) : 0;
```

**O defeito.** `close.saldoAtual` é o **saldo inteiro em conta** — reserva de
emergência inclusa, poupada ao longo de meses. Dividi-lo pelos dias que faltam
transforma patrimônio em orçamento do mês.

**O efeito medido.** O app diz, para quem ganha R$ 7.200,00 por mês
(R$ 240,00/dia):

> "sobram R$ 17.815,35 para gasto variável, o equivalente a cerca de
> **R$ 774,58 por dia** nos 23 dias que faltam"

São 3,2× a renda diária. E o próprio app, no cartão de saúde logo abaixo, dá a
resposta certa: *"O teto que ainda cabe na renda é de R$ 150,06 por dia"*. Os
dois números estão na mesma rolagem.

**A correção.** O limite diário deve sair da **renda ainda não comprometida do
mês**, não do saldo acumulado:

```
disponível = receitas do mês (realizadas + previstas)
           − compromissos do mês
           − alvo de poupança
```

O saldo em conta entra apenas como **piso de segurança** (garantir que a conta
não fica negativa), nunca como fonte de gasto. Se o resultado passar da renda
disponível, trave na renda.

Unifique com o número do cartão de saúde: os dois devem chamar a **mesma**
função. Hoje são dois cálculos que discordam por 5×.

---

## P1 — Contradições visíveis na mesma tela

O padrão é sempre o mesmo: **duas funções calculam a mesma grandeza e a tela
mostra as duas**. Cada item abaixo se resolve eliminando um dos lados, não
ajustando ambos.

### P1.1 — "Fecha no vermelho" ao lado de "sem risco de saldo negativo"

Na mesma rolagem do painel:

- cartão de score: *"Você deve fechar o mês no vermelho em R$ 6.857,18"*
- cartão de fechamento: *"Saldo projetado no fim do mês: R$ 18.587,55"* +
  *"Sem risco de saldo negativo no mês"*

A origem é P0.1. Mas **acrescente a distinção de vocabulário**: um número é
**fluxo do mês** (entrou menos saiu), o outro é **saldo em conta**. Nunca use
"no vermelho" para os dois. Sugestão: "o mês gasta mais do que entra" para
fluxo; "a conta fica negativa" para saldo.

### P1.2 — "Nada previsto para os próximos 30 dias" com R$ 8.229,56 previstos

**Onde:** `js/screens/dashboard.js:456-476` lê `m.bills`, que vem de
`upcomingBills(data)` (`js/metrics.js:643`) e olha só `state.data.transactions`
com data futura. O motor de previsão (`js/forecast.js`) monta a mesma janela a
partir de recorrências, parcelas e faturas, e encontra R$ 8.229,56.

O cartão ainda promete embaixo: *"Parcelas e gastos fixos aparecem aqui
automaticamente."* — e não aparecem.

**Correção:** `upcomingBills` passa a consumir os eventos de `forecast.js`
(`kind` ∈ `recurring | scheduled | installment | card-statement`) em vez de
varrer `transactions`. Uma fonte só para "o que vem aí".

### P1.3 — Patrimônio cresceu 443,2% ou 251,1%?

A mesma tela mostra o selo **`+443,2%`** no cartão de patrimônio e a frase
*"Seu patrimônio cresceu **251,1%** nos últimos meses"* no cartão de score.
Mesma grandeza, mesma tela, dois números.

Ache as duas janelas de comparação (provavelmente "primeiro mês da série" vs
"N meses atrás"), escolha uma, e faça a outra chamá-la. Escreva na tela qual é o
período: "desde abril" vale mais que um percentual solto.

### P1.4 — A reserva mede em uma régua e mira em outra

*"Cobre 2,1 de 6 meses de despesa (R$ 3.963,38/mês)"* + *"Alvo: R$ 21.600,00"*.

6 × 3.963,38 = **R$ 23.780,28**, não 21.600. Em `js/metrics.js:359` o alvo vem
da meta cadastrada pelo usuário quando ela existe, mas `monthsCovered` e o texto
continuam usando `monthlyNeed`. Alcançar o alvo exibido dá 5,45 meses, não 6.

**Correção:** quando o alvo vier da meta do usuário, o texto tem que dizer isso
("Alvo definido por você") e converter para meses pela mesma régua
(`alvo / monthlyNeed`), ou o cartão perde a coerência interna.

### P1.5 — Aluguel contado como assinatura

*"Suas assinaturas somam R$ 2.176,70 por mês. São **5** cobranças recorrentes.
R$ 26.120,40 ao longo de um ano, 30% da sua renda."* — e logo abaixo
*"**11** identificadas"*, com **Aluguel R$ 1.850,00** encabeçando a lista.

Dois problemas:

1. **5 vs 11** na mesma tela.
2. Aluguel não é assinatura. O alarme "suas assinaturas comem 30% da renda"
   existe para provocar **cancelamento**; aplicá-lo a moradia é conselho vazio e
   mina a confiança nos outros alertas. Sem o aluguel, o número real é
   R$ 326,70/mês — que é a informação útil.

**Correção:** separe `recorrente` (todo gasto fixo) de `assinatura` (serviço
cancelável, de baixo valor unitário). Só o segundo grupo entra no alerta e no
"por ano". Moradia, saúde obrigatória e educação formal ficam de fora por
padrão, com o usuário podendo reclassificar.

---

## P2 — Entrega ao navegador

Medições reais deste repositório:

| Item | Medido |
|---|---|
| Bundle único `app.generated.*.js` | **2.090.538 bytes** (2,09 MB), sem minificação |
| gzip -9 | 592.183 bytes |
| brotli -11 | 448.763 bytes |
| CSS total | 294 KB em **19 arquivos** |
| Recursos que bloqueiam renderização | **20** (`boot.js` + 19 CSS) |
| Pré-cache do service worker na 1ª visita | ~2,3 MB + 1,78 MB de PDF.js |

### P2.1 — Nenhuma minificação no build

`scripts/build-dist.js` e `scripts/build-app-module.js` concatenam os fontes e
copiam, sem passo de minificação. O que vai para produção inclui todos os
comentários — e este projeto tem comentários excelentes e **muito** longos, que
são patrimônio do repositório e peso morto na rede.

**Correção:** acrescente minificação **só na saída `dist/`**, preservando os
fontes intactos. `esbuild` como `devDependency` resolve em uma linha
(`esbuild --minify --target=es2020`) e não viola o princípio de "zero dependência
em produção", porque nada dele vai para o navegador. Meta: abaixo de 250 KB
brotli.

### P2.2 — Cascata de `@import` no CSS

`css/style.css` é só uma lista de 18 `@import`. O navegador precisa **baixar e
interpretar** `style.css` antes de descobrir que existem outros 18 arquivos —
dois níveis serializados de latência antes do primeiro pixel, em toda carga
fria. Em localhost isso custa 35 ms e some; em 4G brasileiro com 70 ms de RTT
são centenas de milissegundos no caminho crítico.

**Correção:** `scripts/split-css.js` já existe; faça o build **concatenar** os 19
arquivos em um `style.css` só, na ordem atual da cascata, e minificar. Mantenha
os arquivos separados no repositório — a divisão é boa para quem edita, péssima
para quem carrega.

### P2.3 — Um único pedaço para o app inteiro

Abrir o painel baixa o código de simuladores, importação de PDF, portfólio,
conquistas e wrapped. O `js/screens/` já é modular por tela e o roteador já sabe
qual tela vai abrir.

**Correção:** separe em pelo menos dois pedaços — *shell + painel* (o que a
primeira tela precisa) e *o resto*, por `import()` sob demanda no roteador. O
PDF.js já faz isso certo (`js/pdf-import.js:7`) e serve de modelo.

---

## P3 — Segurança: o que ainda falta

**Registre o que está certo antes de mexer.** Esta é a parte mais forte do
projeto e não deve ser tocada sem motivo: zero dependências em produção,
`npm audit` limpo, nenhum segredo no repositório, CSP restritiva sem
`unsafe-inline`, HSTS de 2 anos, RLS com menor privilégio explicado migração a
migração, rate limit persistido com HMAC do IP (nunca em claro), PKCE,
`canonicalOrigin` fechando o phishing por `X-Forwarded-Host`, backup em AES-GCM
com PBKDF2-310k e iterações viajando dentro do arquivo, e a fronteira da IA
aplicada em três camadas (prompt, servidor, cliente). Isso está acima do padrão
de mercado para um app financeiro pessoal.

O que resta:

### P3.1 — `connect-src https://*.gov.br` é um curinga largo

`vercel.json` libera **qualquer** subdomínio `gov.br` para conexão. O leitor de
nota fiscal já restringe em código a SEFAZ/Fazenda; a CSP deveria repetir a
mesma lista. Curinga na CSP é a rede de proteção que sobra quando a validação em
código falha — e larga demais ela não protege.

**Correção:** troque pelo conjunto explícito de hosts da SEFAZ efetivamente
usados. Se a lista não couber no cabeçalho, mantenha o curinga mas documente a
decisão junto com os outros trade-offs do projeto.

### P3.2 — CI não roda os testes de navegador

`.github/workflows/ci.yml` roda `lint`, `test:coverage`, `check:build`,
`check:release` e `build:dist`. Não roda `test:browser`, `test:pwa` nem
`test:landing`. Uma regressão de service worker, de PWA ou de renderização real
passa verde.

**Correção:** acrescente um job com Playwright (já é `devDependency`). Se o tempo
pesar, rode só em `pull_request` e no push para `main`.

### P3.3 — Sem `dependabot.yml`

Duas dependências de desenvolvimento (`pdfjs-dist`, `playwright`), mas o PDF.js
**vai para o navegador** e processa arquivo que o usuário recebeu de terceiro — é
o único código de terceiro no caminho de dados, e historicamente um alvo de CVE.

**Correção:** `.github/dependabot.yml` com atualização semanal de `npm` e de
`github-actions`.

### P3.4 — Cobertura baixa onde o dinheiro é manipulado

Global em 79,9%, mas: `js/screens/simulate.js` **23,9%**,
`js/screens/modals.js` **29,1%**, `js/screens/debts.js` **43,6%**,
`js/screens/portfolio.js` **55,4%**, `js/screens/add.js` **57,4%**.

`debts.js` é onde vive a matemática de Price/SAC e o desconto de valor presente
do art. 52 §2º do CDC. `add.js` é por onde todo lançamento entra. São as duas
piores telas para se ter cobertura baixa.

**Correção:** suba `debts` e `add` para 75% antes de qualquer coisa em P4.

---

## P4 — Acabamento

### P4.1 — "O alvo vem de do aporte mensal"

`js/screens/calendar.js:269-285`: as duas variantes de `fonte` já começam com
"do"/"da", e o template acrescenta "de" antes. Sai **"vem de do aporte mensal"**
em toda renderização.

Tire o "de" do template ou as preposições das variantes.

### P4.2 — Alvos de toque no desktop

No painel em 800px, 29 de 51 elementos interativos ficam abaixo de 44px de
altura. No mobile (375px) o resultado é exemplar — só 1, e é o link de pular para
o conteúdo. O trabalho do M40 pegou o mobile e deixou o desktop de fora. WCAG
2.5.8 (AA) pede 24px mínimos; verifique quais dos 29 ficam abaixo disso.

---

## O que NÃO mudar

- Os identificadores congelados de `docs/MARCA.md` (`cofre_*`, `financas_db`,
  `organizador-financeiro/backup`, `window.CofreUI`, prefixos de cache).
  Renomear apaga dado de quem já usa; `tests/test-brand.js` reprova.
- A régua de centavos inteiros de `js/utils.js`.
- Os comentários longos dos fontes. Eles explicam **por que** cada decisão foi
  tomada e são a melhor parte deste repositório. A minificação de P2.1 tira o
  peso da rede sem tocar no que está gravado.
- A fronteira da IA (`_shared/ai-boundaries.js` + prompt + filtro no cliente).
  Ela é o que mantém o produto fora da atividade regulada de recomendação de
  investimento.
