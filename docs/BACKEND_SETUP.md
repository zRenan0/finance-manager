# Configuração de contas e backend financeiro

O aplicativo continua funcionando apenas no navegador quando estas etapas não forem feitas. A conta é opcional: sem ela, tudo permanece neste aparelho, como sempre.

Com a conta conectada, a sincronização entra em operação automaticamente. O IndexedDB continua sendo a fonte da interface; a nuvem é um segundo destino atualizado em segundo plano, então o aplicativo continua inteiro e rápido sem conexão.

## Efeito nas análises com IA

A função `analyze` guarda uma chave paga da Anthropic. A partir da versão 0.26.0 ela **exige sessão**, e o teto de requisições passou a ser por conta em vez de por endereço de rede.

Consequência prática: **sem as variáveis do Supabase configuradas, as análises com IA deixam de funcionar** e a função responde `503 ACCOUNT_UNAVAILABLE`. Isso é deliberado. A defesa anterior era só a allowlist de `Origin`, que não vale nada fora de um navegador, e um endpoint pago sem forma de identificar o chamador é um endpoint aberto ao custo do dono do site. Se você usa a IA, configure as contas.

## 1. Criar o projeto no Supabase

1. Crie um projeto separado para cada ambiente.
2. Execute **todas** as migrações de `supabase/migrations/`, no editor SQL, **em ordem de nome**:

   | Arquivo | O que cria | O que quebra sem ele |
   | --- | --- | --- |
   | `202608120001_accounts_finance.sql` | `cofre_devices`, `cofre_mutations`, snapshots | Entrar e criar conta. |
   | `202608180001_sync_oplog.sql` | `cofre_sync_state`, `cofre_sync_ops`, checkpoints e as funções `cofre_apply_ops` / `cofre_reset_data` / `cofre_purge_account` | **A sincronização inteira**, e o apagar conta. |
   | `202608180002_rate_limit.sql` | `cofre_rate_hit` | O limite de tentativas compartilhado (cai num limite pior, por instância). |

   **Rodar só a primeira é o erro mais fácil de cometer aqui**, e ele não aparece na tela de entrar: login e cadastro funcionam, porque o que eles usam é `cofre_devices`. Quem falha é a sincronização, e antes ela só sabia dizer "Sincronização com falha". Hoje ela repete o motivo que veio do banco ("o projeto está sem as tabelas desta função"), mas conferir aqui continua sendo mais barato que descobrir depois.

   Para conferir sem sair do editor SQL do Supabase:

   ```sql
   select table_name from information_schema.tables
   where table_schema = 'public' and table_name like 'cofre_%'
   order by table_name;
   ```

   Precisam aparecer, no mínimo: `cofre_devices`, `cofre_sync_state`, `cofre_sync_ops`, `cofre_sync_checkpoints`, `cofre_sync_checkpoint_rows`.
3. Em Authentication → URL Configuration, cadastre como URLs de redirecionamento `https://SEU-DOMINIO/index.html?auth_callback=signup` e `https://SEU-DOMINIO/index.html?auth_callback=recovery`.

   **O `/index.html` não é decoração.** A raiz do domínio serve a página comercial (ver as reescritas em `vercel.json`), e quem troca o `code` do email por uma sessão é `bootstrapAccount()`, que só existe dentro do pacote carregado pelo `index.html`. Um endereço terminando em `/` faz o link do email abrir o folheto: o código expira sem ser usado e o cadastro nunca conclui.

   Se a lista já tinha as versões com `/?auth_callback=...`, pode apagá-las. Os links que já saíram carregam o endereço gravado na hora do envio, então remover a entrada antiga não quebra nenhum deles; e a página comercial reencaminha esses links para o aplicativo por conta própria (ver `js/landing-boot.js`).
4. Mantenha a confirmação de email ativa em produção (Authentication → Providers → Email → *Confirm email*).
5. **Configure um SMTP próprio antes de convidar qualquer pessoa** (Project Settings → Authentication → SMTP Settings).

   O serviço de email embutido do Supabase **não serve para produção**, e a forma como ele falha é a pior possível: silenciosa. Ele tem teto de poucas mensagens por hora e **só entrega para endereços de quem é membro da organização do projeto**. Para qualquer outro endereço, o Supabase aceita o cadastro, responde `200`, e o email simplesmente não sai. Do lado do aplicativo o cadastro parece ter dado certo; do lado da pessoa, nada chega. Nunca.

   Serve qualquer provedor com SMTP (Resend, Postmark, SendGrid, Amazon SES, Zoho). O que importa é que o domínio remetente seja seu e tenha SPF e DKIM, senão o que sair vai cair em spam.

   **Quando o email não chegar, teste nesta ordem.** As duas primeiras causas são muito mais comuns que a terceira, e as três produzem exatamente a mesma tela:

   1. **O endereço já tinha conta.** Cadastre com um endereço *novo em folha*. Um endereço já cadastrado recebe a mesma resposta de sucesso e nenhum email (ver a seção 1.1); insistir nele não adianta nunca.
   2. **O log do provedor de email.** Se não existe registro de envio lá, o Supabase nunca chegou a mandar, e o problema é o item 1 ou a credencial de SMTP. Se existe, o email saiu e a questão é entrega ou spam.
   3. **A credencial de SMTP.** É o único campo que o painel não deixa reler. Uma chave errada ou revogada só aparece como falha de envio.

   Sintomas de que o SMTP está faltando ou recusando:

   - o cadastro responde certo e o email nunca chega, inclusive no spam;
   - reenviar a confirmação responde certo e também não chega;
   - com esta versão, o erro do envio deixa de ficar mudo e a tela mostra "O servidor não conseguiu enviar o email. Confira a configuração de SMTP do Supabase.";
   - no painel, Authentication → Logs registra `Error sending confirmation email`.
6. Configure os modelos de email com o domínio real do produto antes de receber usuários externos.

## 1.1 O que o aplicativo faz com a confirmação

Vale saber para não confundir sintoma com causa:

- **Enquanto o email não é confirmado, não há sessão.** `login`, `session` e tudo que exige sessão (inclusive a sincronização) respondem `403 email_not_confirmed`. Antes, quem decidia isso era só o Supabase, e a tela pedia confirmação sem que nada dependesse dela.
- **Cadastrar um email que já tem conta devolve a mesma resposta de um cadastro novo.** É o Supabase que faz isso, de propósito, para não virar sonda de quem tem conta. Nenhum email sai nesse caso. Por isso a tela diz as duas saídas ("se ainda não tinha conta, o link foi enviado; se já tinha, entre com sua senha") e oferece **Reenviar confirmação**.
- **O link vale 24 horas** e o cookie do fluxo PKCE agora acompanha esse prazo. Ele era de 10 minutos, o que fazia um link válido morrer sozinho para quem abrisse o email um pouco mais tarde.
- **Abrir o link em outro navegador ou celular confirma o email do mesmo jeito** (quem confirma é o servidor do Supabase, antes de redirecionar), mas não deixa a sessão pronta ali, porque o verificador PKCE mora no navegador que começou. Nesse caso a tela diz "Email confirmado. Entre com seu email e senha para continuar." em vez do antigo e falso "Link expirado ou inválido".

As leituras usam RLS e vinculam os registros ao `auth.uid()` da sessão. Cada navegador recebe também um segredo próprio em cookie HttpOnly. O hash desse segredo não pode ser lido pelo usuário autenticado. A gravação só pode ser chamada pela função do servidor, que informa o usuário já validado, confere o dispositivo, trava a revisão e registra a chave da operação na mesma transação.

## 2. Configurar a Vercel

Defina estas variáveis somente no painel da Vercel (Settings → Environment Variables):

- `SUPABASE_URL`: endereço HTTPS do projeto.
- `SUPABASE_PUBLISHABLE_KEY`: chave pública do projeto.
- `SUPABASE_SERVICE_ROLE_KEY`: usada exclusivamente para apagar uma conta após nova autenticação.
- `ALLOWED_ORIGIN`: origens permitidas, separadas por vírgula. Inclua produção e homologação.

Não coloque a chave de serviço em arquivo JavaScript, `.env` publicado, backup ou diagnóstico. Depois de alterar variáveis, faça uma nova publicação das funções.

## 3. Conferir antes de publicar

1. Cadastre uma conta e confirme o email.
2. Saia e entre novamente.
3. Solicite recuperação e defina uma nova senha pelo link.
4. Entre em dois navegadores, confira a lista de dispositivos e revogue um deles.
5. Confirme que a revogação bloqueia as rotas de conta e de dados financeiros.
6. Envie o mesmo `mutationId` duas vezes e confirme que a revisão avança apenas uma vez.
7. Envie uma revisão antiga e confirme a resposta `409` sem sobrescrever o snapshot atual.
8. Teste exclusão da conta e confirme que os registros do Supabase são removidos em cascata.
9. Confira que o app local continua abrindo e salvando sem conexão.
10. Lance algo no navegador A, abra o navegador B com a mesma conta e confirme que o lançamento aparece.
11. Exclua esse lançamento em B e confirme que ele não reaparece em A na sincronização seguinte.
12. Deixe A sem rede, lance algo, devolva a rede e confirme que o envio acontece sozinho.
13. Confirme que as análises com IA respondem `401` quando não há sessão.

## Como o conflito é resolvido

Não existe tela pedindo ao usuário para escolher entre duas versões. A cada ciclo o aplicativo lê o snapshot remoto, funde dentro do local e devolve o resultado ao servidor:

- União por identificador. Um lançamento que só existe de um lado passa a existir dos dois.
- Empate de mesmo identificador fica com o `updatedAt` mais recente.
- Exclusão é registrada em lápide e vale nos dois sentidos: o que você apagou não volta pelo outro aparelho.
- Preferências de aparelho (tema, layout do Início, consentimentos de privacidade) não são impostas pelo outro lado.

Se o servidor responder `409`, outro aparelho gravou entre a leitura e o envio; o ciclo recomeça já incluindo o que ele mandou, até três vezes.

## Limite desta etapa

Contas e cartões são arquivados, nunca excluídos, então não têm lápide: arquivar em um aparelho vale nos outros, mas não existe exclusão definitiva a propagar. Compartilhamento de conta entre pessoas (orçamento de casal) continua fora do escopo: o snapshot é de um usuário só.
