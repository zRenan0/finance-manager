# Contas de usuário e backend financeiro

## Escopo

Esta etapa cobre os itens 11 e 12 da lista priorizada: cadastro e acesso de usuários, recuperação de senha, dispositivos conectados e a base do backend financeiro com autorização, validação, revisão, conflitos e idempotência.

O modo local continuará funcionando sem cadastro. Criar uma conta não moverá dados financeiros automaticamente e o backend não será selecionado como armazenamento principal nesta etapa. Sincronização contínua, fila offline e resolução visual de conflitos pertencem ao item 13.

## Arquitetura escolhida

O navegador falará somente com rotas da mesma origem em funções Netlify. As funções usarão Supabase Auth para identidade e Postgres para dados. Tokens de acesso e renovação ficarão em cookies `HttpOnly`, `Secure` em produção e `SameSite=Lax`; não serão gravados no `localStorage`, no backup financeiro ou no diagnóstico.

A escolha mantém o site estático, evita criar armazenamento próprio de senhas e aproveita confirmação de email, recuperação por email, expiração de sessão e limitação de tentativas do provedor. A alternativa de autenticação feita manualmente no projeto foi descartada pelo risco de armazenamento de senha, recuperação e revogação incorretos. O acesso direto do navegador ao banco também foi descartado para manter validação, limite de corpo e tratamento de conflitos em uma fronteira única.

## Conta e sessão

A central de Conta oferecerá:

1. cadastro com email e senha;
2. login e logout;
3. recuperação por email usando PKCE;
4. definição de nova senha depois do retorno do email;
5. visualização dos dispositivos que já acessaram a conta;
6. revogação de um dispositivo;
7. exclusão da conta mediante nova autenticação e confirmação digitada.

Respostas de recuperação serão deliberadamente neutras para não revelar se um email existe. A interface nunca exibirá token, refresh token, identificador interno do usuário ou detalhe bruto do provedor.

Cada instalação terá um identificador aleatório local limitado ao uso de sessão e sincronização. O servidor obterá o usuário exclusivamente pela sessão autenticada e cruzará o dispositivo enviado no cabeçalho com a tabela do próprio usuário. Um dispositivo revogado perde acesso aos endpoints financeiros; um novo login explícito nesse aparelho cria uma nova autorização.

## Backend financeiro

O banco terá uma linha de snapshot por usuário, uma coleção de dispositivos e uma tabela de mutações idempotentes. Todas as tabelas terão Row Level Security com `auth.uid() = user_id` e acesso apenas para a função ou usuário autenticado correspondente.

O contrato existente será preservado:

- `GET /api/sync/health` valida sessão, dispositivo e protocolo;
- `GET /api/sync/snapshot` devolve o snapshot e a revisão;
- `POST /api/sync/changes` aplica um conjunto de alterações sobre a revisão informada;
- `PUT /api/sync/snapshot` substitui o snapshot quando autorizado;
- `DELETE /api/sync/snapshot` grava uma base vazia quando autorizado.

Toda escrita exige `If-Match`, `Idempotency-Key`, `mutationId` idêntico e protocolo compatível. Uma função SQL bloqueia a linha do usuário, verifica a revisão e grava a nova revisão na mesma transação. Repetir a mesma mutação com o mesmo conteúdo devolve a resposta anterior. Reutilizar a chave com conteúdo diferente é recusado. Revisão divergente retorna HTTP 409 sem sobrescrever dados.

## Validação e limites

As funções limitarão o corpo a 6 MB, recusarão chaves perigosas de protótipo, profundidade excessiva, strings desproporcionais, coleções acima dos limites e schema diferente do atual. Mudanças incrementais serão aplicadas em uma cópia do snapshot e o resultado completo será validado antes do commit atômico.

Erros públicos usarão códigos controlados. Mensagens do banco, tokens, email, conteúdo financeiro e corpos de requisição não entrarão em logs ou respostas. Rotas autenticadas usarão `Cache-Control: no-store`, validação de origem e cookies da mesma origem.

## Migração e compatibilidade

Não haverá migração automática dos dados locais para a nuvem. O schema local passa a guardar apenas preferências não sensíveis da central de conta, sem email ou sessão. O contrato de nuvem aceitará autenticação por cookie para a mesma origem e manterá o modo `Bearer` existente para testes e integrações administrativas.

O SQL de implantação ficará versionado em `supabase/migrations`. A publicação exigirá `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_ORIGIN` e a aplicação prévia da migração. A chave de serviço será usada apenas na exclusão integral da conta, depois de confirmar a sessão e a senha atual.

## Testes

Os testes cobrirão:

- cookies seguros e ausência de tokens no corpo;
- validação de origem, método e tamanho;
- cadastro, login, sessão, logout e recuperação com respostas controladas;
- isolamento por usuário e dispositivo nas políticas SQL;
- rejeição de dispositivo revogado;
- idempotência e reutilização inválida de chave;
- conflito de revisão com HTTP 409;
- validação do snapshot e do conjunto de alterações;
- renderização da central de conta nos estados local, desconectado e autenticado;
- funcionamento integral do app sem backend configurado.

## Fora desta etapa

Sincronização automática, fila offline, mesclagem de dois dispositivos, Open Finance, cobrança, autenticação social, biometria e suporte permanecem fora deste módulo.
