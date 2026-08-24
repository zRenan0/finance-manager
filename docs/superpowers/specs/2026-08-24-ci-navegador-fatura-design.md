# CI do navegador: categoria, fatura e onboarding preservado

## Objetivo

Fazer a suíte de navegador representar os fluxos reais de escolha de categoria
e pagamento de fatura sem depender do dia do mês. A primeira instalação do PWA
também deve preservar o onboarding em andamento. A regra do produto para
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

O onboarding passou em três execuções locais, mas a primeira run após o push
falhou no passo 1 da viewport de 320 por 480. A reprodução controlada confirmou
que o aceite habilitava o botão e, segundos depois, a primeira instalação do
service worker assumia a aba, recarregava a página e recriava o passo 1 sem o
rascunho. `clients.claim()` dispara `controllerchange` tanto na primeira tomada
de controle quanto numa atualização, e o aplicativo tratava os dois casos como
troca de pacote.

## Abordagens consideradas

### Fatura

1. Fixar a compra no primeiro dia do mês atual e declarar no cenário os dias 20
   e 28 do cartão. Esta é a escolha adotada porque mantém a fatura no mês atual
   em qualquer data de execução e testa a interface real.
2. Congelar o relógio do navegador antes do dia 20. Também elimina a variação,
   mas amplia o alcance da fixture e pode interferir em outros usos de data.
3. Derivar fechamento e vencimento do dia atual. Não cobre o dia 31, quando não
   existe um vencimento posterior dentro do intervalo aceito pelo formulário.

### Primeiro controle do PWA

1. Distinguir a primeira tomada de controle de uma substituição de controller.
   Esta é a escolha adotada porque corrige a perda real de rascunho e preserva a
   recarga segura quando uma versão posterior substitui a anterior.
2. Bloquear service workers no contexto Playwright. Estabilizaria o teste, mas
   esconderia o mesmo defeito para quem instala o Cofre pela primeira vez.
3. Esperar a recarga inicial antes de preencher. Acoplaria o teste ao defeito e
   manteria a perda de dados no produto.

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

O observador de `controllerchange` guarda o controller anterior. A transição de
nenhum controller para o primeiro worker apenas atualiza essa referência. Uma
transição posterior, de um worker existente para outro, continua chamando o
fluxo que termina gravações, aplica a guarda por pacote e recarrega. A versão do
cache sobe para v54 para entregar o novo pacote a instalações existentes.

O teste unitário executa o observador com as transições `null` para v53 e v53
para v54. O cenário de navegador aguarda o primeiro controller no passo 1 e
confirma que o aceite continua marcado. Um auxiliar de avanço inclui cenário,
passo e estado do formulário na mensagem, evitando outro timeout sem contexto.

## Verificação

Após cada correção, a suíte de navegador inteira deve passar. Antes do novo
envio serão executados `npm run build`, `node scripts/lint.js`,
`node tests/run-all.js` e uma nova execução da suíte de navegador. A run remota
também precisa concluir os jobs `test` e `browser`; um resultado apenas local
não encerra este conserto.
