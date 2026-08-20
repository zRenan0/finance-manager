# Simulador: dar entrada ou amortizar depois

## Problema

O usuário tem dinheiro disponível, mas não sabe se deve usá-lo como entrada ou financiar um valor maior, manter o dinheiro aplicado e amortizar a dívida depois. Comparar apenas a parcela não responde à pergunta. A decisão depende do custo das duas propostas, do rendimento líquido até a amortização, do efeito escolhido para a amortização e da reserva que não pode ser consumida.

## Alternativas avaliadas

1. Acrescentar um texto simples ao simulador de financiamento atual. É insuficiente porque ele calcula apenas um contrato por vez.
2. Criar um comparador próprio com os dois fluxos completos. É a abordagem escolhida porque entrega um veredito verificável sem alterar o simulador existente.
3. Criar um planejador de dívidas com várias amortizações futuras. Seria útil, mas amplia o problema para um cronograma inteiro e não é necessário para responder à dúvida apresentada.

## Premissas informadas

O formulário terá:

- valor do bem;
- dinheiro disponível hoje;
- reserva mínima que permanecerá intocada;
- prazo do contrato;
- sistema Price ou SAC;
- taxa anual da proposta com entrada;
- taxa anual da proposta com financiamento integral;
- mês da amortização;
- rendimento anual líquido do dinheiro até esse mês;
- escolha entre reduzir prazo ou reduzir parcela;
- seguro e tarifa mensais.

O valor utilizável será `dinheiro disponível - reserva preservada`, limitado ao valor do bem. A reserva não entra na entrada nem na amortização.

## Cenários

### Dar entrada agora

O valor utilizável reduz o principal no início. O motor calcula parcelas, juros, tarifas, CET e mês de quitação pelo mesmo sistema usado nos simuladores atuais.

### Financiar tudo e amortizar depois

O bem inteiro é financiado. O valor utilizável rende pela taxa líquida informada até o mês escolhido e então é aplicado ao saldo devedor. A amortização pode:

- manter a prestação-base e reduzir o prazo; ou
- manter o prazo original e recalcular as prestações restantes.

Juros posteriores incidem somente sobre o saldo já reduzido. O cálculo registra saldo antes e depois da amortização, rendimento obtido, prestação antes e depois, juros totais, tarifas e mês de quitação.

## Comparação

O custo econômico dos dois caminhos será comparado em valor presente, usando o rendimento líquido informado como taxa de desconto. Os cenários também usarão o mesmo esforço mensal inicial: com a entrada, a diferença de prestação será direcionada à própria dívida e encurtará o prazo. Assim, financiar tudo não parece melhor apenas porque força uma parcela maior. A tela ainda mostrará a prestação normal da proposta com entrada para quem preferir aliviar o mês em vez de buscar o menor custo. A entrada entra no mês zero; parcelas e amortização são trazidas para valores de hoje. No cenário futuro, eventual sobra depois de quitar o saldo continua com o usuário.

O resultado mostrará:

- qual caminho custa menos e a economia em reais;
- custo econômico em valores de hoje, total pago ao banco, juros, primeira prestação e prazo de cada cenário;
- valor efetivamente amortizado;
- rendimento líquido obtido até a amortização;
- aumento de prestação causado pelo financiamento integral;
- taxa líquida de equilíbrio, acima da qual esperar passa a compensar;
- aviso quando a reserva informada for zero ou quando a prestação integral for maior que a sobra mensal calculada pelo aplicativo.

Empate financeiro será tratado por centavos. Em empate, dar entrada será apresentado como a escolha mais simples, porque exige menos dívida e não depende de rendimento futuro.

## Limites honestos

O simulador assume que as taxas digitadas continuam válidas e que a amortização ocorre exatamente no mês informado. Aprovação de financiamento integral, custos percentuais da contratação e regras operacionais variam por banco. A interface orientará o usuário a copiar as duas propostas reais e comparar pelo CET.

A liquidação antecipada parcial ou total com redução proporcional dos juros é assegurada ao consumidor. O Banco Central também informa que o cálculo operacional segue o contrato e recomenda solicitar a planilha de evolução da dívida. Referências: [Banco Central, liquidação antecipada](https://www.bcb.gov.br/meubc/faqs/s/liquidacao-antecipada) e [Banco Central, empréstimos e financiamentos](https://www.bcb.gov.br/meubc/faqs/s/emprestimos-e-financiamentos).

## Arquitetura

`js/simulators.js` receberá um motor puro para o contrato com amortização e outro para comparar os cenários. `js/screens/simulators.js` declarará o novo item do catálogo e desenhará o resultado usando os componentes já existentes. Não haverá persistência nova: os rascunhos continuarão em `state.sim.values` e o schema não mudará.

## Testes

Os testes cobrirão Price e SAC, redução de prazo e parcela, equivalência quando a amortização ocorre cedo, vantagem da entrada quando o rendimento é inferior ao crédito, possível vantagem da espera quando o rendimento líquido supera o custo, preservação da reserva, taxa de equilíbrio, quitação antecipada e valores vazios. A regressão completa e um fluxo real no navegador deverão passar.
