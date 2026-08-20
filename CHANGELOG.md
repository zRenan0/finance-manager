# Histórico de versões

## 0.29.3

Os dois aparelhos passaram a mostrar os mesmos valores. Duas falhas somadas
faziam a conta parecer sincronizada sem estar: a base que já existia no
aparelho nunca subia, e quem ficava com o app aberto nunca descia nada.

### A base anterior à conta agora sobe

- **Semeadura na primeira volta.** A fila de envio só recebia DIFERENÇA: ela é
  montada comparando a gravação com a anterior. Quem já usava o app antes de
  criar a conta, restaurou um backup, ou usou enquanto o servidor estava fora
  do ar, não produzia diferença nenhuma depois disso, e a base inteira ficava
  invisível para o servidor. O segundo aparelho entrava na mesma conta e via
  tudo zerado.
- **E nada denunciava.** O cartão da conta dizia "Tudo sincronizado", porque a
  fila estava mesmo vazia. Não havia erro para mostrar; havia ausência.
- **A semeadura roda depois da descida, e só uma vez por conta no aparelho.**
  Ela não inventa marca: reapresenta cada registro com a que ele já tem, e o
  servidor continua guardando a vencedora. Só cunha marca nova para o que nunca
  passou por uma gravação local. Se o servidor estiver sem nenhuma operação e o
  aparelho tiver base, ela roda de novo - é o caso de quem tentou sincronizar
  antes de as tabelas existirem no banco.
- **O padrão de fábrica fica de fora.** Um celular recém-conectado tem as mesmas
  categorias iniciais e as configurações zeradas de qualquer instalação.
  Anunciar isso com marca nova faria ele vencer e apagar, no computador, a
  categoria renomeada e a renda preenchida. O que ainda está como veio de
  fábrica não é notícia, e o silêncio preserva o que o outro aparelho tem.
- **Restaurar backup também viaja.** `replaceAll` troca a base inteira sem
  passar pelo diff, então restaurar um backup, desfazer uma restauração ou
  adotar os dados de visitante mudava só o aparelho que fez. Agora cada registro
  recebe marca nova e o que sumiu vira lápide, como já acontecia ao restaurar
  uma versão guardada na nuvem.

### Com o app aberto, o outro aparelho aparece sozinho

- **Volta periódica de um minuto.** O motor só tinha gatilho de saída: alteração
  local, volta da rede, retorno à aba COM fila pendente. Faltava o de entrada.
  Com o app aberto nos dois lados, quem lançava no celular não via nada mudar no
  computador até recarregar a página. A volta só acontece com o app à vista,
  para não gastar bateria em segundo plano, e não redesenha a tela quando não
  encontra novidade.
- **Voltar ao app busca o que chegou.** A condição antiga (`state.pending`) só
  deixava passar o aparelho que tinha algo a enviar, que é justamente o que não
  precisava do gatilho: quem ficou parado é quem está desatualizado.

### Testes

- `tests/test-cloud-sync.js` ganhou três cenários: a base anterior à conta
  chegando ao segundo aparelho, o aparelho novo e vazio que não pode apagar o
  que o outro tem, e a restauração de backup propagando a exclusão.

## 0.29.2

O link do email de confirmação passou a apontar para o domínio do produto, em
vez do domínio do Supabase. Resolve dois problemas que tinham a mesma raiz: o
email caindo em spam, e a confirmação que só funcionava no navegador que
cadastrou.

### O link do email agora é do nosso domínio

- **Nova rota `POST /api/account/verify`.** Ela recebe o `token_hash` que o
  próprio link carrega e o troca por sessão em `/auth/v1/verify` do Supabase.
  É o mesmo caminho que o `verifyOtp({ token_hash, type })` do supabase-js usa.
- **Confirmar deixou de depender do aparelho.** O caminho anterior devolvia um
  `code` que só vira sessão com o verificador PKCE, e o verificador é um cookie
  do navegador que pediu o link. Cadastrar no computador e abrir o email no
  celular, que é o caso comum, não concluía. O `token_hash` viaja dentro do
  link e não guarda estado deste lado, então vale em qualquer aparelho.
- **Remetente e link no mesmo domínio.** O modelo padrão do Supabase aponta
  para `SEU-PROJETO.supabase.co`, enquanto o email sai do domínio do produto.
  Filtro de spam lê essa combinação como phishing, e era o que sobrava depois
  de SPF e DKIM já estarem corretos.
- **O token não fica na barra de endereços.** Ele confirma uma conta, então é
  apagado da URL junto com o resto do retorno, e não entra no histórico nem no
  próximo `Referer`.
- **O caminho antigo continua atendido.** A rota `exchange` não foi removida:
  os links que já saíram usam ela, e quebrá-los seria trocar um defeito por
  outro. O aplicativo tenta o `token_hash` primeiro e cai no `code` depois.
- **A rota valida antes de repassar.** O tipo do link sai de uma lista fechada
  e o formato do token é conferido, porque os dois vêm do endereço que a pessoa
  clicou. Confirmação que volta sem sessão é tratada como link gasto, e não
  como login concluído.

### Documentação

- `docs/BACKEND_SETUP.md` ganhou os modelos de email prontos, com
  `{{ .TokenHash }}`, e a instrução de publicar um registro DMARC, que faltava.

## 0.29.1

Correção do cadastro por email e do diagnóstico da sincronização. Três defeitos
que se combinavam: o email não chegava, a confirmação não valia nada, e a falha
de sincronização não dizia a causa.

### A confirmação de email passou a valer

- **Conta sem email confirmado não entra e não sincroniza.** O servidor nunca
  olhava para `email_confirmed_at`: a tela pedia a confirmação e, logo depois,
  entrar funcionava do mesmo jeito. Quem decidia era uma chave do painel do
  Supabase que o aplicativo não enxerga, então a mesma versão do código se
  comportava de dois jeitos opostos conforme o projeto. Agora `login`, `session`
  e tudo que exige sessão respondem `403 email_not_confirmed` enquanto a
  confirmação não acontecer.
- **Existe como reenviar a confirmação.** Não havia saída para o email que não
  chega: cadastrar de novo devolve a mesma resposta opaca que o Supabase dá
  para endereço já cadastrado, e nenhum link novo sai. A tela de conta passou a
  ter um cartão de confirmação pendente com o botão de reenvio.
- **A frase do cadastro cobre os dois desfechos.** Dizia só "Confira seu email
  para confirmar o cadastro". Para um endereço que já tem conta, essa mesma
  resposta vem sem que nenhum email seja enviado, e a pessoa ficava esperando
  para sempre. Agora a tela diz as duas saídas sem revelar qual delas é a sua.

### O link do email parou de morrer sozinho

- **O cookie do fluxo PKCE durava 10 minutos; o link do email dura 24 horas.**
  Quem abrisse o email um pouco mais tarde recebia "Link expirado ou inválido"
  para um link ainda perfeitamente válido. O prazo agora acompanha o do provedor.
- **Abrir o link no celular deixou de virar erro falso.** O email é confirmado
  pelo servidor do Supabase antes do redirecionamento; o que não vem junto é a
  sessão, porque o verificador PKCE mora no navegador que começou. A tela agora
  diz "Email confirmado. Entre com seu email e senha para continuar." em vez de
  acusar um link quebrado que não está quebrado.
- **Link expirado ou já usado é dito como tal**, na query ou depois do `#`.

### O erro do Supabase chega traduzido, não apagado

- Todo `4xx` virava a mesma frase, "A operação foi recusada.". Isso apagava
  justamente a informação que resolve o problema: falha de SMTP, teto de envio
  de email, senha errada e migração não aplicada chegavam idênticos. A tradução
  é uma lista fechada; o que não está nela continua genérico, para não vazar
  detalhe interno do provedor.
- **A falha de envio de email passou a ser dizível.** É o caso mais comum de "o
  email não chega" (SMTP ausente, ou o serviço embutido do Supabase, que só
  entrega para membros da organização do projeto).

### A sincronização diz por que falhou

- **A razão da falha vinha no corpo da resposta e era jogada fora.** O cliente
  só olhava o número do status, então a tela mostrava "Sincronização com falha"
  e parava aí. Agora repete o motivo que o servidor mandou, mostra o código da
  falha e oferece **Tentar de novo**, botão que só existia com o motor ligado,
  justamente o estado que a falha mais comum desliga.
- **Migração não aplicada é reconhecida pelo nome.** Rodar só a primeira
  migração é o erro mais fácil de cometer na instalação, e ele não aparece na
  tela de entrar: login e cadastro funcionam, porque usam outra tabela. A falha
  agora diz que faltam as tabelas e aponta `supabase/migrations`.
- Erro de instalação parou de ser retentado a cada 30 segundos, o que só
  escondia a causa.
- `docs/BACKEND_SETUP.md` passou a listar as **três** migrações obrigatórias,
  com o que quebra sem cada uma, e a exigir SMTP próprio antes de convidar
  qualquer pessoa.

## 0.29.0

Auditoria de preparação para o beta público. Esta versão corrige defeitos que
mudavam números na tela do usuário e que faziam dados sumirem ou reaparecerem.

### Isolamento por conta

- Cada conta passou a ter banco, espelho, fila e relógio próprios. Antes havia
  um banco por navegador: duas contas no mesmo aparelho liam e gravavam os
  mesmos registros, e sair da conta não removia nada.
- Quem usa o app sem conta continua com os dados no lugar de sempre; nada é
  migrado. Trazer esses dados para uma conta exige confirmação explícita.
- Apagar a conta apaga também a cópia local dela.

### Sincronização

- O ciclo deixou de trocar a base inteira e passou a enviar apenas o que mudou.
  Acabou o teto prático de 6 MiB, e o custo por ciclo passou a ser proporcional
  à alteração, não ao tamanho da base.
- Exclusão feita num aparelho agora vale nos outros e não volta na sincronização
  seguinte.
- Dois gastos iguais no mesmo dia não desaparecem mais. O app descartava
  lançamentos "parecidos" (mesma data, valor, categoria e descrição), o que
  apagava despesas repetidas legítimas.
- Relógio errado no aparelho deixou de decidir conflito. Vence quem escreveu
  depois de ver a alteração do outro, mesmo com a hora atrasada.
- O que não subiu fica numa fila que sobrevive ao fechamento da aba.
- Duas abas abertas não se sobrescrevem mais.
- "Apagar tudo" com conta conectada apaga em todos os aparelhos, com a opção de
  apagar só neste e desconectar.
- Versões restauráveis da base ficam guardadas no servidor.

### Números do mês

- Guardar dinheiro deixou de contar como gasto. Um aporte de R$ 500 numa meta
  aparecia como despesa, e o mês parecia ruim justamente quando a pessoa poupou.
- Pagar dívida foi separado entre amortização (troca dívida por patrimônio) e
  juros e tarifas (custo real).
- Estorno deixou de virar renda; ele desconta do gasto original.
- Transferência entre contas próprias não é gasto nem renda.
- Renda planejada, realizada e projetada viraram três números distintos. No dia
  3 do mês, o app dizia "você poupou 96%" comparando o gasto de três dias com a
  renda planejada do mês inteiro.
- Score, conquistas, saúde e orçamento passaram a comparar apenas dados do mesmo
  período, e a dizer quando o mês ainda está em andamento.
- A tela de lançamento ganhou o campo "tipo de movimento" para marcar estorno,
  transferência e juros.

### Cálculos

- Cartão: o rotativo passou a durar um ciclo de fatura, como manda a regra, e o
  simulador segue para o parcelamento. O teto legal de 100% de encargos vale
  para a soma das duas fases, e a soma das parcelas agora fecha com o total.
- Consórcio: saiu o desconto de 0,8% ao mês que não vinha de lugar nenhum e o
  "CET" calculado a partir dele. Entraram reajuste da carta, seguro, fundo de
  reserva, lance em prazo ou parcela e três cenários de contemplação.
- Dívidas: o saldo passou a crescer pela taxa do contrato, não pelo CET (que
  inclui IOF e tarifas já pagas e inflava a dívida). Quitação antecipada calcula
  o valor presente das parcelas restantes. Cronogramas Price e SAC.
- Investimentos: rentabilidade por XIRR e TWR, considerando a data de cada
  aporte. Antes, quem aportou há cinco anos e quem aportou ontem apareciam com a
  mesma rentabilidade.
- Imposto de renda contado em dias reais de calendário. Uma aplicação de 24
  meses caía na faixa de 17,5% por causa de meses de 30 dias; o prazo real leva
  à faixa de 15%.
- Aposentadoria com juro real negativo deixou de prometer renda maior do que a
  sustentável.
- `docs/FONTES-FINANCEIRAS.md` registra a fonte, a vigência e a premissa de cada
  cálculo.

### Privacidade e segurança

- As fontes deixaram de vir do Google: o app não envia mais o IP do usuário a um
  terceiro a cada abertura.
- Exportação para CSV neutraliza fórmulas. Uma descrição começando com `=` era
  executada ao abrir a planilha.
- Datas impossíveis (31 de fevereiro) deixaram de ser aceitas; elas caíam no mês
  seguinte e mudavam totais.
- A senha sai da memória do aplicativo assim que o servidor responde.
- O limite de tentativas passou a ser compartilhado entre instâncias e a
  sobreviver a reinício; a identidade é guardada em hash.
- Restauração de backup tem limite de tamanho e de registros.
- Na análise com IA, o pacote enviado deixou de ser chamado de anônimo (ele leva
  nomes de categorias e metas), ganhou prévia e permite ocultar campos. O modelo
  não devolve mais nota, e deixou de ser obrigado a apontar riscos quando não há.
- A política de privacidade voltou a descrever o app real. Ela ainda afirmava
  que a sincronização não estava ativa e que a tipografia vinha do Google; as
  duas coisas mudaram e o texto não tinha acompanhado.
- A tela de Privacidade passou a trazer identificação do controlador, canal de
  atendimento, prazos de retenção de cada dado, os direitos do titular do
  art. 18 e o canal para incidentes do art. 48. Os campos que dependem do dono
  do aplicativo (CNPJ, endereço, encarregado) aparecem como "Ainda não
  definido", em vez de serem preenchidos por suposição.
- Os termos de uso deixaram de ser três parágrafos e passaram a cobrir escopo,
  responsabilidades, disponibilidade, limite de responsabilidade, propriedade,
  encerramento, lei e foro.
- Trocar a versão do texto legal não apaga mais o aceite anterior: ele fica
  registrado no aparelho, e a tela mostra o que já havia sido aceito.
- A análise com IA passou a mostrar o pacote de verdade antes de enviar. O app
  prometia que você veria os dados que sairiam do aparelho, e o que aparecia
  era um parágrafo descrevendo o pacote. Agora a prévia traz o JSON que vai
  sair, o número de campos e o tamanho.
- Na mesma prévia dá para tirar os nomes das categorias, os nomes e valores das
  metas, o histórico e as regras de orçamento antes de enviar. A escolha fica
  salva e também pode ser feita em Privacidade.

### Página comercial

- O domínio passou a abrir na página comercial. A raiz é reescrita para
  `landing.html` (`vercel.json`, `scripts/serve.js` e o servidor da suíte
  fazem a mesma coisa) e o aplicativo continua em `/index.html`, byte por byte
  no mesmo endereço: `start_url` do manifesto, cache offline e todos os links
  `index.html#/rota` seguem valendo.
- O service worker ganhou um cache separado para páginas que não são o shell.
  A raiz saiu da definição de shell; sem isso, abrir a página comercial uma vez
  faria o aplicativo abrir offline mostrando o folheto, sem a rede poder
  corrigir. Cache promovido para v49.
- Estouro horizontal no celular corrigido na causa: uma regra de empilhamento
  aplicava `position: relative` a todo filho do `<body>` e vencia o
  `position: fixed` da doca de CTA, que passava 12px da janela a 390px. As
  etiquetas da seção do problema também eram largas demais entre 861 e 1120px.
- A seção "Quatro telas resolvem o mês inteiro" ganhou composição própria no
  celular. O painel fixo do desktop sai de cena e cada etapa carrega o próprio
  recorte de tela, logo abaixo do texto que ele ilustra; a sobreposição deixou
  de ser possível por construção, com ou sem JavaScript.
- As duas famílias de fonte declaradas em `css/landing.css` apontavam para
  arquivos que nunca existiram no repositório. As referências saíram e a página
  usa uma pilha do sistema escolhida, com tamanho e espaçamento ajustados.
- Saiu da interface pública: a seção que anunciava não haver depoimento, os
  cartões de depoimento vazios, o plano com preço `XX,XX` e a promessa de
  "menos de 2 minutos", que não tem medição por trás. A estrutura de prova
  social continua no código, dentro de um `<template>` desligado.
- Preços passou a ter uma oferta só, que é o que existe hoje: beta aberto,
  grátis, com a ressalva de que qualquer mudança comercial será comunicada
  antes de cobrança.
- Nova faixa de confiança logo abaixo do hero e nova ordem da narrativa: os
  nove simuladores saíram da abertura e entraram depois do produto, como
  diferencial. A altura da página no celular caiu cerca de 20%.
- Custo de pintura reduzido em ponteiro grosso (mesclagem, borrão e
  `backdrop-filter`), laços decorativos pausados fora da tela e `will-change`
  só nas seções próximas da janela.
- Correção de centralização na causa: o reset de tipografia estava escrito
  como `.lp h2` / `.lp ul`, que vale mais que qualquer regra de componente de
  uma classe só e zerava as margens delas. O fechamento da página aparecia
  254px fora do centro ao lado de botões centralizados, a faixa de confiança
  saía 120px à esquerda, o parágrafo do hero 140px, e todo respiro vertical
  declarado entre kicker, título e texto de abertura simplesmente não existia.
  O reset passou a ter especificidade zero, com `:where()`.
- As duas linhas de gráfico desenhadas por `stroke-dasharray` apareciam
  PARTIDAS em pedaços soltos de 768px para cima: `vector-effect:
  non-scaling-stroke` desfaz a normalização de `pathLength`, e o tracejado
  passava a ser medido em pixels de tela. O efeito saiu das duas.
- Sem JavaScript, a maquete do produto nascia oca: gráfico vazio, anel da meta
  sem arco, toda barra de categoria num trilho vazio ao lado do valor em
  reais, e a barra fixa do topo flutuando transparente por cima do conteúdo.
  Os estados finais passaram a valer quando o atributo de movimento não está
  no documento, que é o caso dos três cenários já previstos: sem script, com
  movimento reduzido e com o trinco do `landing-boot.js` desistindo.
- Os dois cartões flutuantes do hero pousavam em cima de número: um cobria
  "8,4% nos últimos 6 meses", o outro cobria três valores de categoria, em
  todas as larguras entre 1121 e 1920px. O da esquerda desceu para a única
  faixa livre; o da direita passou a pender para fora do palco quando há
  folga e sai de cena abaixo de 1300px, onde não há.
- Título da seção da planilha deixava "trabalho" sozinho numa linha, e o do
  FAQ deixava "faz". Os H2 ganharam quebra equilibrada.
- A suíte `tests/test-landing.js` nunca chegou a executar: uma quebra de linha
  literal dentro de uma expressão regular a fazia falhar na carga. A suíte de
  navegador media a sobreposição da história contra `.lp-step p`, que também
  casa com as legendas de dentro do próprio recorte de tela; virou
  `.lp-step > p`. E a captura por seção esperava 450ms num encadeamento que
  termina em 1900ms, o que rendia imagem de meio caminho para a revisão.
- O aplicativo parou de pedir arquivo de fonte que não existe. `css/base.css`
  declarava `@font-face` com `url("../fonts/inter-400.woff2")` e
  `url("../fonts/space-grotesk-500.woff2")`, e a pasta sempre esteve vazia:
  eram duas requisições 404 por abertura para quem não tivesse as famílias
  instaladas, com a pilha do sistema assumindo no fim de qualquer jeito. As
  duas famílias passaram a ser resolvidas só por `local()`, como já era na
  página comercial. Quem tem Inter ou Space Grotesk instaladas continua
  vendo as duas; ninguém mais paga por requisição que não podia dar certo.
- Travessões removidos de `service-worker.js`, `js/landing.js` e
  `js/landing-boot.js`, que reprovavam `tests/test-input-validation.js`.
- Testes novos: `tests/test-landing.js` na suíte padrão e
  `npm run test:landing` no navegador, com varredura de largura de 1920 a
  360px, sobreposição, menu, ausência de recurso 404 e capturas por seção.

### Publicação

- `npm start` sobe o app. A instrução de abrir o `index.html` com duplo clique
  saiu: ela nunca funcionou nesta versão.
- Só a pasta `dist/` vai para o ar. Antes a raiz inteira era publicada,
  incluindo testes, documentação interna e as migrações do banco.
- A página comercial e os arquivos dela entram no `dist/`, e o build reescreve
  `canonical`, `og:url` e `og:image` para endereço absoluto quando a publicação
  informa o domínio (`VERCEL_PROJECT_PRODUCTION_URL` na Vercel, ou `SITE_URL`).

#### `npm run check:deploy`: conferência do roteamento da publicação

- Sobrou exatamente uma coisa que `npm test`, `check:release` e `build:dist`
  não alcançam: o roteamento da Vercel. Todos eles leem o repositório e param
  onde a plataforma começa. `scripts/check-deploy.js` faz as requisições
  contra uma publicação real e confere o que só existe lá: que `/` entrega a
  página comercial, que `/index.html` entrega os mesmos bytes do repositório
  (por sha256) sem virar desvio, que os cabeçalhos de segurança vieram, que as
  funções não respondem 404 nem 500, e que `tests/`, `docs/`, `supabase/`,
  `scripts/` e `package.json` não estão no ar.
- Ele também cobre o erro mais silencioso da migração: `ALLOWED_ORIGIN` com o
  domínio antigo faz toda chamada de conta e de sincronização voltar `403
  origin_denied`. A rota GET de sessão não passa por `assertSameOrigin` e
  responde normalmente, então a conferência precisa de um POST para o problema
  aparecer antes de um usuário encontrá-lo.
- Uso: `npm run check:deploy -- https://o-endereco-da-publicacao`. Serve para
  pré-visualização e para produção. Backend sem configurar é aviso, não falha.
  Ver a tabela em `docs/RELEASE.md`.

#### Correção: o link de confirmação de conta caía na página comercial

- **Cadastro e recuperação de senha estavam quebrados no ar.** O servidor
  montava o endereço de retorno dos emails como `${origem}/?auth_callback=...`,
  isto é, a raiz do domínio. Enquanto a raiz servia o aplicativo isso estava
  certo; desde que ela passou a servir a página comercial, o link do email
  passou a entregar quem clicou em cima do folheto. Quem lê o parâmetro `code`
  e o troca por uma sessão é `bootstrapAccount()`, em `js/auth.js`, que só
  existe dentro do pacote carregado pelo `index.html`. A landing não carrega
  esse código, então nada acontecia: o código expirava sem ser usado, o
  cadastro nunca confirmava e a recuperação nunca abria o formulário de nova
  senha. Sem erro em lugar nenhum, porque, do lado do servidor, o email foi
  enviado. O defeito é anterior à mudança de hospedagem: entrou junto com a
  landing.
- Os dois endereços passaram a apontar para `/index.html?auth_callback=...`, e
  passaram pela mesma função (`appCallbackUrl`), para não voltarem a divergir.
  `/index.html` é endereço público e continua entregando os bytes do
  aplicativo; `app.html` é nome de arquivo interno do `dist/` e não pode
  aparecer em link nenhum.
- **Os links que já saíram continuam apontando para a raiz**, e não há como
  reescrever email enviado. Por isso a página comercial passou a reencaminhar
  sozinha: `js/landing-boot.js` detecta `code` ou `auth_callback` na query e
  devolve a pessoa para `index.html` com a query inteira, incluindo o hash. A
  checagem exige a chave inteira depois de `?` ou `&`, então parâmetro de
  campanha terminado em `code` não dispara. O reencaminhamento ficou no
  `landing-boot.js`, e não no `landing.js`, por duas razões: ele é síncrono no
  `<head>`, então a página comercial não chega a piscar; e o `landing.js` é
  justamente o arquivo que pode morrer no caminho em rede ruim, que é quando a
  confirmação mais precisa funcionar.
- `docs/BACKEND_SETUP.md` passou a mandar cadastrar `/index.html?auth_callback=...`
  na lista de URLs de redirecionamento do Supabase, com a explicação do porquê.
  **Esta lista é preenchida à mão no painel do Supabase e precisa ser
  atualizada pelo dono do projeto**; o código sozinho não resolve.
- Suíte nova: `tests/test-account-callback.js`. Ela executa o handler de
  `account` com o Supabase substituído por um espião e afirma o endereço que
  ele realmente enviou, executa o `landing-boot.js` num contexto de `vm` com
  `location` de mentira, e confere que a documentação não voltou a mandar
  cadastrar a raiz. Não havia teste cobrindo isto.
- `npm run test:landing` ganhou o cenário de navegador correspondente: um link
  no formato já enviado (`/?auth_callback=signup&code=...`) precisa terminar no
  aplicativo com a query intacta, o botão Voltar não pode devolver a página
  comercial, e uma visita de campanha (`?utm_source=...&ref_code=...`) não pode
  ser arrastada para fora da landing.
- Cache offline promovido para v51. O `landing-boot.js` é um estático servido
  por stale-while-revalidate: sem promover a versão, quem já tivesse a landing
  em cache receberia o arquivo antigo na primeira visita depois da publicação,
  que é justamente a visita do clique no link do email.
- Em `tests/test-landing.js`, a verificação de movimento reduzido deixou de
  casar o texto `if (!movimentoReduzido)` e passou a EXECUTAR o boot num
  contexto de `vm`, como a seção 7 já fazia com `isAppShell`. Ela media a
  linha, não a regra: bastou o boot ganhar uma segunda condição para a suíte
  reprovar uma mudança que preservava o comportamento inteiro.

#### Mudança de hospedagem: Netlify para Vercel

- A configuração saiu do `netlify.toml` para o `vercel.json`: comando de build,
  pasta publicada, reescritas de entrada e todos os cabeçalhos de segurança,
  incluindo a política de conteúdo. O arquivo antigo foi removido; nada mais no
  projeto o consulta.
- **A raiz precisou de outro mecanismo.** A Netlify tinha `force = true`, que
  fazia a reescrita ganhar do arquivo estático. A Vercel consulta o sistema de
  arquivos ANTES das reescritas, então bastava existir um `index.html` na raiz da
  publicação para o domínio abrir no aplicativo e a regra da landing nunca ser
  avaliada. A solução não toca no repositório: o build publica o aplicativo como
  `app.html`, os dois endereços viram falha de sistema de arquivos, e as duas
  reescritas passam a valer (`/` para a landing, `/index.html` para `app.html`).
  `/index.html` continua entregando os mesmos bytes no mesmo endereço, então o
  `start_url` do manifesto, a chave do cache do service worker e todo link
  `index.html#/rota` seguem valendo sem alteração. O build falha de propósito se
  um `index.html` reaparecer no `dist/`.
- As três funções não foram reescritas. Elas continuam em `netlify/functions/`,
  com a mesma assinatura que seis arquivos de teste exercitam, e ganharam uma
  casca em `api/` que traduz o formato da Vercel (`api/_adaptar.js`). O
  adaptador tem suíte própria: `tests/test-vercel-adapter.js` mede que a ação da
  reescrita chega, que o corpo chega como texto, que os três `Set-Cookie` da
  sessão saem em linhas separadas e que um handler que estoura não vaza rastro
  de pilha.
- `/.netlify/functions/analyze` virou `/api/analyze`. Era o único endereço com
  nome de plataforma cravado no código do cliente.
- As verificações que liam o `netlify.toml` passaram a ler o `vercel.json`, e
  agora leem o JSON em vez de casar texto: `check-release.js`,
  `test-landing.js`, `test-security.js`, `test-modular-build.js` e
  `test-commercial-readiness.js`.
- README, `docs/RELEASE.md` e `docs/BACKEND_SETUP.md` atualizados, incluindo o
  que conferir no primeiro deploy.
- `engines.node` fixado em `22.x`, que é o que a integração contínua já usava. A
  faixa aberta `>=20` fazia a Vercel avisar que a publicação subiria de major
  sozinha quando ela promovesse a próxima versão.
- Integração contínua com `npm ci`, análise estática, cobertura e os três
  motores de navegador.
- Versão do aplicativo 0.29.0 e cache offline v50. O cache subiu junto com a
  mudança de endereço da função de análise: sem promover a versão, quem já
  tinha o pacote antigo em cache chamaria `/.netlify/functions/analyze` mais
  uma vez antes da revalidação em segundo plano trocar o arquivo.

## 0.28.0

- Ajustes deixou de ser uma pilha de cartões abertos e virou uma lista de seis tópicos.
- Cada linha fechada mostra o valor atual do ajuste (a regra em vigor, quantas categorias têm teto, quando foi o último backup), então dá para se situar sem abrir nada.
- Um tópico aberto por vez; tocar no que já está aberto fecha e devolve o índice.
- Os atalhos para outras telas, incluindo a central de categorias, continuam sempre visíveis: navegação não entra no acordeão.
- A prévia e o erro de importação de backup abrem o tópico de dados sozinhos, para o resultado de escolher um arquivo não ficar escondido.
- A sincronização em nuvem passou a ser opcional para o restante do aplicativo, protegida por verificação de existência como já acontece com o diagnóstico e o histórico de navegação.
- Versão do aplicativo 0.28.0 e cache offline v46, sem alteração do schema de dados.

## 0.27.0

- Sincronização em nuvem ligada de fato: com a conta conectada, os lançamentos passam a subir e descer entre os aparelhos.
- Fusão automática por união, com exclusões respeitadas nos dois lados e nova tentativa quando outro aparelho grava no meio do envio.
- O IndexedDB continua sendo a fonte da interface; a nuvem é um segundo destino atualizado em segundo plano, e o aplicativo segue inteiro sem conexão.
- Estado da sincronização visível na tela de conta, com data da última troca e envio manual.
- A função de análise com IA passou a exigir sessão e a contar requisições por conta, não por IP. Sem backend de contas configurado, ela recusa em vez de liberar.
- Identificadores de registro passaram a usar UUID do Web Crypto, condição para dois aparelhos gravarem sem colisão silenciosa.
- Correção na leitura de valores: "1,5000" era lido como 15000 enquanto "1.5000" virava 1,5. A regra agora é a mesma para vírgula e ponto, o que corrige a importação de extratos com quatro casas decimais.
- Nova suíte `tests/test-money.js` cobrindo centavos, rateio de parcelas, leitura de valor digitado e unicidade de identificador.
- Correção de dois nomes de variável de estilo inexistentes (`--line` e `--ink-muted`), que deixavam bordas e textos auxiliares na cor errada nas telas de conta e movimentações.

## 0.26.0

- Central de categorias em tela própria (`#/categorias`), com três lentes sobre a mesma lista: Estrutura, Grupos e Tetos.
- Estrutura em árvore de verdade: subcategorias presas à categoria-mãe por trilho, com gasto do mês, teto e grupo em cada linha.
- Lente Grupos mostra Necessidades, Desejos e Futuro com o gasto do mês contra o valor reservado pela Regra x/x/x.
- Editor em folha único para criar e editar, incluindo mover uma categoria de mãe sem perder histórico; exclusão confirmada na própria folha.
- Busca por nome, recolher/expandir subcategorias e sugestão de teto pela média dos últimos meses.
- Ajustes deixou de editar categoria: agora resume o estado e entrega a tela nova.
- Versão do aplicativo 0.26.0 e cache offline v44, sem alteração do schema local.

## 0.25.0

- Conta opcional com cadastro, login, confirmação por email, recuperação de senha e encerramento de sessão.
- Sessões em cookies HttpOnly, sem tokens no armazenamento local, nos backups ou nos diagnósticos.
- Lista de dispositivos conectados, revogação individual e exclusão da conta online com nova autenticação.
- Backend financeiro com isolamento por usuário, RLS, revisão atômica, controle de conflitos e idempotência.
- Validação do snapshot e das alterações no servidor, limite de 6 MB e bloqueio de campos e identificadores inválidos.
- Persistência do registro de exclusões e da data do último backup em todos os adaptadores.
- Versão do aplicativo 0.25.0 e cache offline v43, sem alteração do schema local.

## 0.24.0

- Revisão dos textos financeiros e avisos específicos nos simuladores, com fontes oficiais e linguagem condicional.
- Nova área de privacidade, termos, controle de IA, exportação e exclusão definitiva dos dados locais.
- Registro local de erros com códigos controlados, retenção de 30 dias e sem mensagens, valores ou dados pessoais.
- Schema 22, versão do aplicativo 0.24.0 e cache offline v42.

## 0.23.0

- Explicações comuns para saldo, patrimônio, previsão, saúde, metas, dívidas e simuladores.
- Separação visual entre valores realizados, previstos e estimados, com data, fórmula e premissas.
- Assistente financeiro local que adapta perguntas à tela e abre simuladores preenchidos.
- Central de fontes com origem, quantidade, última atualização, arquivo de referência e pendências.
- Contas e cartões mostram quantidade de movimentações, última movimentação e última conciliação.
- Situação local exibida sem sugerir uma conexão bancária que o aplicativo ainda não possui.
- Versão do aplicativo 0.23.0 e cache offline v41, sem alteração do schema de dados.

## 0.22.0

- Central de Movimentações com busca ampla, filtros, agrupamento por data, resumo e correções em lote.
- Relatórios preservados em uma visão separada dentro da mesma rota.
- Caixa de revisão para categorias pendentes, duplicidades, transferências, pagamentos de fatura e conferência de contas.
- Conversões contábeis confirmadas em popup, sem duplicar receitas ou despesas.
- Origem e histórico de alterações preservados em lançamentos, transferências, pagamentos, backup e restauração.
- Conciliação de conta registra a data da conferência mesmo quando o saldo já está correto.
- Migração de dados para o schema 21, versão do aplicativo 0.22.0 e cache offline v40.

## 0.21.0

- Aplicativo carregado por uma única entrada ES nativa, sem declarações do domínio no escopo global do navegador.
- Artefato modular gerado e conferido automaticamente a partir dos arquivos de origem.
- Atributos `style` removidos dos modelos e substituídos por classes calculadas em folha CSS externa.
- Política de conteúdo passou a bloquear estilos inline.
- Cache offline reduzido aos arquivos realmente consumidos pelo navegador.

## 0.20.0

- Saneamento estrito de identificadores, cores e referências vindas de backup.
- Consulta de QR fiscal limitada a portais governamentais reconhecidos.
- Contrato versionado e seguro por padrão para futura sincronização.
- Comando único de testes, verificação de publicação e integração contínua.
- Objetivos pessoais no onboarding e no personalizador do Início.
- CSS separado por base, layout, componentes, utilitários e telas.
- Serviços de diálogo e validação carregados como módulos JavaScript nativos.
- Pop-ups com foco preso, fundo isolado e retorno ao controle de origem.
- Erros associados aos campos e valores monetários limitados a duas casas decimais.
- Testes de navegador para os fluxos financeiros principais, responsividade, zoom e temas.

## 0.19.0

- Separação entre valores realizados e compromissos futuros.
- Histórico mensal de orçamento.
- Correção do histórico patrimonial de contas.
- Sincronização de metas com lançamentos editados ou excluídos.
