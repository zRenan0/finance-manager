# CI do navegador: categoria e fatura pagável

## Objetivo

Fazer a suíte de navegador representar os fluxos reais de escolha de categoria
e pagamento de fatura sem depender do dia do mês. A regra do produto para
faturas futuras permanece inalterada.

## Defeitos confirmados

Uma categoria com filhos exige a escolha do chip pai e depois de uma opção da
folha de subcategorias. O teste executava apenas o primeiro passo. A folha
continuava aberta, bloqueava o botão de salvar e contaminava os casos seguintes
porque eles usam a mesma página.

O teste de compra parcelada cria um cartão que fecha no dia 20 e vence no dia
28. A compra recebe a data atual. Do dia 21 ao fim do mês, a primeira parcela
vai para a fatura seguinte, que corretamente não oferece pagamento. A asserção
espera uma fatura pagável e, por isso, falha conforme o calendário.

O teste do onboarding passou em três execuções completas consecutivas. Ele roda
antes das chamadas ao novo auxiliar de categoria e usa contextos próprios. Não
há evidência para alterar esse fluxo neste conserto.

## Abordagens consideradas

1. Fixar a compra no primeiro dia do mês atual e declarar no cenário os dias 20
   e 28 do cartão. Esta é a escolha adotada porque mantém a fatura no mês atual
   em qualquer data de execução e testa a interface real.
2. Congelar o relógio do navegador antes do dia 20. Também elimina a variação,
   mas amplia o alcance da fixture e pode interferir em outros usos de data.
3. Derivar fechamento e vencimento do dia atual. Não cobre o dia 31, quando não
   existe um vencimento posterior dentro do intervalo aceito pelo formulário.

## Desenho escolhido

O auxiliar de categoria conclui a seleção em dois passos somente quando a folha
de subcategorias existe. A primeira opção representa a categoria pai e evita
dependência da lista atual de filhos. O auxiliar aguarda a remoção da folha
antes de continuar.

No fluxo de cartão, o teste preenche explicitamente fechamento 20 e vencimento
28. Depois de abrir o formulário do lançamento, lê o mês já fornecido pela
aplicação e troca apenas o dia por `01`. Assim a compra não fica no futuro, cai
antes do fechamento e produz uma fatura do mês atual. O botão Pagar deve então
existir e o fluxo continua pela interface.

Nenhum arquivo de `js/` precisa mudar. A condição que esconde o pagamento de
faturas futuras continua protegendo o comportamento correto do produto.

## Verificação

Após a correção da data, a suíte de navegador inteira deve passar. Em seguida
serão executados `npm run build`, `node scripts/lint.js`, `node tests/run-all.js`
e uma nova execução da suíte de navegador. O resultado será registrado em
`CHANGELOG.md` e `docs/PROXIMA-SESSAO.md` antes do único commit e do envio
explícito de `HEAD` para `origin/main`.
