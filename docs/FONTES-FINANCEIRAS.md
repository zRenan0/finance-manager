# Fontes, vigência e premissas dos cálculos

Este documento é o par obrigatório do código de cálculo. Cada fórmula usada no
aplicativo aparece aqui com **fonte**, **vigência** e **premissas**. Quando um
número não tem fonte, ele é uma premissa e está marcado como tal; quando uma
premissa não pode ser justificada, o cálculo devolve `null` em vez de inventar
um valor.

> **Regra do projeto:** nenhum número exibido ao usuário pode existir sem uma
> destas três origens: (a) dado que ele mesmo informou, (b) norma citada aqui,
> (c) premissa declarada aqui e visível na tela.

Última revisão do conteúdo: **2026-08-18**.

---

## 1. Imposto de renda em renda fixa

| Item | Valor |
|---|---|
| Fonte | Lei 11.033/2004, art. 1º |
| Vigência | desde 2005-01-01 |
| Onde | `TAX_RULES` e `irAliquotFor()` em `js/simulators.js` |

Tabela regressiva, sobre o **rendimento**, por **dias corridos** entre a
aplicação e o resgate:

| Prazo | Alíquota |
|---|---|
| até 180 dias | 22,5% |
| de 181 a 360 dias | 20% |
| de 361 a 720 dias | 17,5% |
| acima de 720 dias | 15% |

**Premissas e cuidados**

- O prazo é contado em **dias reais de calendário**, não em meses de 30 dias.
  Contar 30 dias por mês colocava uma aplicação de 24 meses em 720 dias
  (17,5%), quando o prazo real é de 730 ou 731 dias (15%). O erro aparecia
  exatamente nas fronteiras da tabela.
- O imposto é calculado **lote a lote**: em aportes mensais, cada aporte tem
  prazo próprio. Aplicar a alíquota final sobre o rendimento inteiro subestima
  o imposto de quem aporta todo mês.
- As regras são **versionadas** por data de vigência (`TAX_RULES`), para que uma
  mudança futura não reescreva cálculos anteriores.

## 2. IOF em resgates de curto prazo

| Item | Valor |
|---|---|
| Fonte | Decreto 6.306/2007, Anexo I |
| Vigência | desde 2008-01-01 |
| Onde | `IOF_TABLE` e `iofPctFor()` em `js/simulators.js` |

Incide **apenas sobre o rendimento**, em resgates com menos de 30 dias, de 96%
no 1º dia a 0% no 30º. A tabela é literal no código porque não é linear.

## 3. Cartão de crédito: rotativo e parcelamento da fatura

| Item | Valor |
|---|---|
| Fonte (prazo do rotativo) | Resolução CMN 4.549/2017 |
| Fonte (teto de encargos) | Lei 14.690/2023 |
| Onde | `simCreditCard()` em `js/simulators.js` |

- O saldo não pago só permanece no rotativo **até o vencimento da fatura
  seguinte**. Depois disso, a instituição é obrigada a oferecer parcelamento.
  Por isso o simulador roda **um único ciclo** de rotativo e migra para
  parcelamento. Simular 12 ou 24 meses de rotativo mostra um cenário que não
  pode ser contratado.
- Os encargos totais (rotativo **mais** parcelamento) são limitados a **100% do
  valor original da dívida**. O teto vale para a soma das duas fases.

**Premissa declarada**

- `CARD_INSTALLMENT_DEFAULT_PCT = 8,5% a.m.` é usado apenas quando o usuário não
  informa a taxa do próprio contrato. Origem: ordem de grandeza das taxas médias
  de "cartão de crédito parcelado" publicadas pelo BCB nas Estatísticas de
  Crédito. **Não é a taxa do contrato do usuário**; o resultado sempre declara
  `rateSource: "premissa"` quando ela é usada.
- A regra anterior ("taxa do rotativo menos 7 pontos") foi removida: em cartões
  com rotativo baixo ela chegava a zero e o app prometia parcelamento sem juros.

## 4. Consórcio

| Item | Valor |
|---|---|
| Fonte | Lei 11.795/2008; Circular BCB 3.432/2009 |
| Onde | `simConsortium()` em `js/simulators.js` |

- Consórcio **não tem juros**. Tem taxa de administração, fundo de reserva,
  seguro e reajuste da carta. Todos entram no cálculo separadamente.
- As parcelas são **percentuais da carta atualizada**; por isso o reajuste anual
  aumenta as parcelas seguintes.
- **Não existe custo efetivo único.** Ele depende de quando a contemplação
  acontece, e isso não é garantido em contrato. O simulador devolve três
  cenários (início, meio e fim) e a faixa entre eles.
  - Contemplação no **início**: o fluxo se parece com um empréstimo e a TIR é
    positiva.
  - Contemplação no **fim**: é uma poupança forçada com retorno **negativo**.
  - Contemplação no **meio**: o fluxo não tem taxa única; o campo vem `null`.

**Removido nesta revisão:** o desconto arbitrário de 0,8% ao mês aplicado à carta
antes do cálculo da TIR. Ele não vinha de índice, contrato ou norma, e como
entrava no denominador, o "CET" exibido dependia inteiramente desse palpite.

**Premissa declarada**

- Sem reajuste informado, o simulador usa **0%** e declara
  `assumptions.adjustmentInformed: false`. Inventar um índice repetiria o erro
  do 0,8%. Na prática, contratos de imóvel costumam usar INCC e os demais IPCA
  ou IGP-M; o valor correto está no contrato do usuário.

## 5. Dívidas: taxa contratual, CET e quitação antecipada

| Item | Valor |
|---|---|
| Fonte (CET) | Resolução CMN 4.881/2020 |
| Fonte (quitação antecipada) | CDC (Lei 8.078/1990), art. 52, §2º |
| Onde | `debtMonthlyRateInfo()`, `debtCetInfo()`, `debtPayoffQuote()` em `js/debts.js` |

- **Taxa contratual** é o juro que incide sobre o saldo. É ela que projeta o
  saldo devedor, as parcelas e o cronograma.
- **CET** inclui IOF, tarifa de cadastro, seguro prestamista e registro. Serve
  para **comparar** propostas, não para fazer o saldo crescer. Usá-lo na
  evolução do saldo inflava a dívida projetada e o valor de quitação.
- Quando só o CET é conhecido, ele é aceito como aproximação e o resultado marca
  `approximate: true`.
- **Quitação antecipada**: o consumidor tem direito à redução proporcional dos
  juros. O valor devido é o **valor presente das parcelas restantes**,
  descontado pela taxa contratual, e não a soma nominal delas.

### Sistemas de amortização

| Sistema | Característica |
|---|---|
| Price | parcela constante; juros altos no início |
| SAC | amortização constante; parcela decrescente; menos juros no total |

Ambos em `debtSchedule()`, com o resíduo de arredondamento na última parcela
para que a soma das parcelas feche exatamente com o total.

## 6. Carteira de investimentos

| Item | Valor |
|---|---|
| Fonte (comparação de rentabilidade) | Resolução CVM 175/2022; ANBIMA, Código de Administração de Recursos de Terceiros |
| Fonte (limite de recomendação) | Resoluções CVM 19/2021 e 30/2021 |
| Onde | `xirr()`, `twr()`, `portfolioBenchmark()` em `js/portfolio.js` |

- **XIRR** (money-weighted): retorno do dinheiro do investidor, considerando a
  data de cada aporte. Responde "quanto eu ganhei".
- **TWR** (time-weighted): retorno da escolha, isolando o efeito do momento dos
  aportes. É a medida comparável com um índice.
- O cálculo anterior, `(valor − custo) / custo`, dava o **mesmo** número para
  quem aportou há cinco anos e para quem aportou ontem.
- **Benchmark**: quando existe série histórica mensal em `marketRates.history`,
  o acumulado do índice sai dela. Sem a série, o app projeta a taxa atual e
  **declara** `benchmarkSource: "taxa-atual-projetada"`. Projetar a taxa de hoje
  para trás compara a carteira com um CDI que nunca existiu.

**Limite jurídico**

O aplicativo **não** é consultor de valores mobiliários autorizado pela CVM e
não conhece o perfil do investidor (objetivo, prazo, tolerância a risco,
situação financeira). Por isso os textos da carteira **descrevem** a composição
e **não recomendam** compra, venda ou percentual de alocação. Recomendação sem
avaliação de adequação é o que as Resoluções CVM 19/2021 e 30/2021 vedam.

## 7. Reserva de emergência e FGTS

| Item | Valor |
|---|---|
| Fonte (FGTS) | Lei 8.036/1990; Lei 13.932/2019 (saque-aniversário) |
| Onde | `js/simulators.js`, `js/health.js` |

- O FGTS rende **3% a.a. + TR**, mais distribuição de resultados quando houver.
  A distribuição não é garantida e por isso não entra na projeção.
- Saque-aniversário **bloqueia** o saque-rescisão. Essa é uma consequência
  contratual, não uma opinião, e precisa estar visível junto da simulação.

## 8. Índices de mercado

| Índice | Fonte oficial |
|---|---|
| Selic | BCB, Copom / série 432 do SGS |
| CDI | B3 / série 12 do SGS |
| IPCA | IBGE / série 433 do SGS |
| TR | BCB, série 226 do SGS |
| Poupança | Lei 12.703/2012 (70% da Selic + TR quando Selic ≤ 8,5% a.a.; 0,5% a.m. + TR acima disso) |

As taxas ficam em `marketRates`, com `updatedAt`. **O aplicativo não busca esses
valores automaticamente**: quem os revisa é o usuário, e a data da última
revisão é exibida junto dos resultados que dependem deles.

---

## Premissas que ainda dependem de decisão externa

1. **Série histórica de índices.** Sem ela, os benchmarks da carteira são
   projeções da taxa atual. Publicar uma série mensal (ou consumir o SGS do BCB)
   é o que torna a comparação exata.
2. **Taxa média de parcelamento de fatura.** O valor de 8,5% a.m. precisa ser
   revisado periodicamente contra as Estatísticas de Crédito do BCB.
3. **Índice de reajuste do consórcio.** Depende do contrato; hoje é 0% quando
   não informado.
