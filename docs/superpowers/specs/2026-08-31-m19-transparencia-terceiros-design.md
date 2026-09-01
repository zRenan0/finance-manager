# M19: transparência de terceiros

## Escopo

O M19 documenta somente os serviços externos comprovados pelo código e pela
configuração do projeto. Para cada serviço, a política deve dizer quando ele
participa, por que é usado, quais dados recebe, como a retenção funciona e qual
limite de exclusão existe.

Entram no registro Vercel, Supabase, Anthropic, Have I Been Pwned e o portal
fiscal indicado pelo QR Code. O envio de email de autenticação também precisa
ser explicado, mas o repositório não identifica um provedor SMTP externo. Essa
decisão continuará marcada como pendência de lançamento, sem atribuir o fluxo a
uma empresa presumida. Não há analytics, publicidade ou scripts remotos no
aplicativo atual, e isso será dito de forma explícita.

Não fazem parte deste módulo a contratação dos fornecedores, a escolha da região
dos projetos, o preenchimento dos dados do controlador nem a definição do plano
de incidentes. Essas decisões externas permanecem visíveis.

## Decisão

`js/storage.js` terá `LEGAL_THIRD_PARTIES` como fonte estruturada do registro.
Cada entrada usará os campos `id`, `group`, `name`, `role`, `when`, `purpose`,
`data`, `retention`, `deletion`, `transfer`, `privacyUrl`, `evidence` e `status`.
O campo `status` separará serviços comprovados no código de uma dependência que
ainda precisa ser definida para produção.

Um validador verificará grupos, identificadores, campos obrigatórios, endereços
HTTPS e estados aceitos. Outra função listará pendências de lançamento sem
confundi-las com defeitos na estrutura do registro.

A tela de Privacidade renderizará os serviços em três grupos:

1. Infraestrutura da conta e do backend.
2. Serviços acionados por uma escolha ou operação específica.
3. Configuração necessária antes da oferta pública.

Cada cartão mostrará de imediato o nome, a função e o momento em que o serviço
entra. Os detalhes expansíveis mostrarão os dados recebidos, retenção, exclusão,
transferência e fontes oficiais. O desenho seguirá os cartões e estados já usados
na central de privacidade, com foco visível e leitura adequada em 320 px.

## Serviços comprovados

### Vercel

O `vercel.json` comprova a hospedagem do site e das funções. Ao abrir o domínio,
a plataforma recebe metadados normais da conexão. Ao usar conta, sincronização,
checagem de senha ou IA, as funções também processam o conteúdo necessário à
operação. Os eventos controlados pelo aplicativo não registram corpo, email,
senha, cookie, IP nem conteúdo financeiro, mas isso não elimina o processamento
transitório da requisição pela infraestrutura.

O prazo dos logs depende do plano do projeto. A documentação pública da Vercel
declara prazos diferentes por plano, então o plano efetivo precisa ser conferido
antes do lançamento.

### Supabase

O backend usa Supabase Auth, Postgres e APIs REST. O serviço recebe cadastro,
credenciais no fluxo de autenticação, sessões, identificadores de conta e
aparelho, dados financeiros sincronizados, versões restauráveis, marcas de
exclusão, preferências e identificadores derivados de limite de tentativas.

A região do projeto, o aditivo de tratamento aplicável e a configuração de
email não aparecem no repositório. Esses dados não serão presumidos.

### Anthropic

`netlify/functions/analyze.js` chama a API de mensagens da Anthropic. O envio só
acontece com conta válida e confirmação do usuário. A análise mensal recebe
totais, categorias, metas e regras selecionadas; o refinamento recebe a frase e
os nomes das categorias. A política pública da API informa exclusão padrão de
entradas e saídas em até 30 dias, com exceções contratuais, legais e de aplicação
da política de uso. O contrato efetivo e eventual retenção zero precisam ser
confirmados pelo controlador.

### Have I Been Pwned

A verificação de senha envia pelo backend somente os cinco primeiros caracteres
do SHA-1, com preenchimento de resposta ativado. Senha, hash completo, email e IP
do usuário não são enviados ao serviço. O endereço visto pelo serviço é o da
função hospedada.

### Portais fiscais

A leitura de QR Code consulta diretamente no navegador o portal oficial
`gov.br` indicado pela nota. O destino recebe a URL completa, que pode conter a
chave da nota, além do IP e dos metadados normais da conexão. O órgão e a política
aplicável variam conforme o emissor, por isso não haverá um operador único
inventado.

### Email de autenticação

Supabase Auth produz mensagens de cadastro e recuperação. O serviço padrão não
é indicado para produção e o projeto orienta configurar SMTP próprio, mas o
fornecedor escolhido não está versionado. A tela mostrará essa lacuna e os dados
que o futuro provedor receberá: endereço de email, conteúdo da mensagem e link
ou código necessário à operação.

## Compatibilidade

Não mudam o schema financeiro, o IndexedDB, as APIs nem o protocolo de
sincronização. Como a política ganha conteúdo material e o prazo público da API
de IA passa a ser informado, `LEGAL_TEXT_VERSION` sobe para `2026-08-31.2` e o
cache offline sobe uma versão. O histórico de aceite anterior é preservado.

## Verificação

A suíte própria deve confirmar:

- presença dos cinco serviços comprovados e da pendência de SMTP;
- preenchimento dos campos obrigatórios e rejeição de grupo, estado ou URL
  inválidos;
- correspondência entre cada registro e as integrações reais no código;
- declaração exata do conteúdo processado por Vercel, Supabase e Anthropic;
- k-anonimato do Have I Been Pwned e consulta fiscal direta;
- ausência declarada de analytics e publicidade;
- renderização do registro e das pendências na tela de Privacidade;
- documentação operacional e checagem de publicação ligadas à mesma fonte.

Depois da suíte específica, serão executados build, lint, testes completos,
cobertura, checagens de publicação e matrizes de navegador, PWA e landing.
