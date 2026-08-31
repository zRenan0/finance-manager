# M17: observabilidade segura

## Contexto

O aplicativo já mantém um diagnóstico local limitado a área, código, versão, schema, horário e estado da conexão. Esse registro não envia dados automaticamente, dura 30 dias e guarda no máximo 50 ocorrências. O backend, porém, ainda não produz um evento estruturado comum nem devolve um identificador de requisição. Além disso, falhas de autenticação e do Service Worker acabam classificadas como `unexpected`, pois suas áreas e códigos não fazem parte da lista permitida.

O M17 precisa cobrir frontend, backend, APIs, autenticação, sincronização, importações e Service Worker sem registrar conteúdo financeiro, credenciais ou identificadores pessoais.

## Decisão

Serão combinadas duas fontes de diagnóstico:

1. O frontend continuará gravando somente eventos controlados no aparelho. As áreas de autenticação, API e Service Worker entram na lista permitida, as chamadas existentes passam a usar códigos válidos e falhas operacionais da API de conta serão registradas sem mensagem, corpo ou resposta.
2. As funções de backend serão envolvidas por uma camada única que mede duração, classifica o resultado e escreve JSON estruturado nos logs da plataforma. Cada resposta receberá `X-Request-Id`, útil para relacionar uma falha vista no cliente à requisição do servidor.

O evento do backend terá apenas estes campos: `kind`, `version`, `at`, `level`, `area`, `operation`, `method`, `status`, `code`, `durationMs` e `requestId`. Área, operação, método e código serão reduzidos a listas ou padrões fechados. Corpo, query completa, cabeçalhos, cookies, endereço IP, email, identificadores de usuário ou aparelho, mensagens, pilhas e valores financeiros nunca serão registrados.

Os logs ficam no stdout da plataforma de execução. Fora de produção, a emissão só ocorre com `OBSERVABILITY_LOGS=1`, para não poluir testes e desenvolvimento. O cabeçalho de correlação e a medição continuam ativos em todos os ambientes.

## Alternativas rejeitadas

Um serviço externo de monitoramento daria painéis e alertas prontos, mas criaria um novo destinatário de dados, configuração secreta e impacto de privacidade sem necessidade para este módulo.

Uma tabela própria no banco permitiria consultas históricas, mas aumentaria a superfície de acesso, exigiria migração, retenção e limpeza. Os logs estruturados da plataforma atendem o diagnóstico operacional sem criar outro repositório.

Registrar mensagens e pilhas facilitaria parte da investigação, mas pode carregar email, token, descrição de lançamento ou valor. Códigos fechados e identificadores de requisição dão contexto suficiente com risco muito menor.

## Fluxo do backend

A camada de observação recebe uma área e um resolvedor de operação. Antes do handler, ela cria um identificador aleatório ou reaproveita um identificador seguro fornecido pela plataforma. Depois da resposta, extrai apenas status e um código que corresponda ao padrão permitido, acrescenta `X-Request-Id` e emite um evento. Respostas 2xx e 3xx usam nível `info`, 4xx usam `warn` e 5xx usam `error`.

Se o handler lançar uma exceção não tratada, a camada emite código `unhandled`, status 500 e relança o erro para conservar o comportamento da plataforma. A mensagem e a pilha não entram no evento.

As operações de conta e sincronização são aceitas apenas quando pertencem às rotas conhecidas. Qualquer rota desconhecida vira `unknown`. A análise usa a operação fixa `analyze`.

## Fluxo do frontend e Service Worker

O diagnóstico local continuará ignorando o objeto de erro recebido. A API de conta registrará somente falhas operacionais, como rede, timeout, serviço ausente e erros de servidor. Erros esperados de formulário, credencial ou limite não contam como indisponibilidade.

O Service Worker enviará aos clientes apenas uma mensagem fechada com área e código quando uma leitura de rede ou cache falhar. A página valida a mensagem antes de passá-la ao diagnóstico local. Nenhuma URL ou requisição acompanha a mensagem.

Importação e sincronização continuam usando os pontos existentes. Os códigos atualmente fora da lista passam a ser permitidos para que deixem de cair em `unexpected`.

## Verificação

Os testes devem provar que:

- todas as funções públicas usam a camada comum e devolvem `X-Request-Id`;
- corpo, cabeçalhos, email, token, mensagens, pilha e valores não aparecem no JSON emitido;
- status, nível, área, operação, código e duração são limitados e previsíveis;
- autenticação, API e Service Worker geram diagnósticos locais com códigos válidos;
- o objeto de erro entregue pelo frontend não é persistido;
- as suítes existentes, lint, cobertura, build, release e testes de navegador continuam aprovados.
