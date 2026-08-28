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
   | `202608200001_sync_protocol_3_prepare.sql` | entidades de contas e cartões por registro, compatibilidade e corte gradual do protocolo | Contas, cartões, transferências, pagamentos e conciliações entre aparelhos. |
   | `20260825001552_add_device_type.sql` | tipo visual do aparelho e restrição de valores aceitos | Identificação correta de computador, celular, tablet e acesso desconhecido. |
   | `20260825003000_reset_dominant_tombstones.sql` | `cofre_hlc_successor`, recria `cofre_apply_ops` e `cofre_reset_data`, adiciona `cofre_mutations.result_hlc` | O primeiro lançamento criado depois de "apagar tudo" some no ciclo seguinte, porque nasce menor que as lápides. |
   | `20260828120000_rls_auto_enable_least_privilege.sql` | tira `EXECUTE` de `public.rls_auto_enable` de `PUBLIC`, `anon` e `authenticated` | Nada. É higiene de privilégio; sem ela o Security Advisor continua acusando. |
   | `20260828130000_rls_auto_enable_versionada.sql` | traz `rls_auto_enable` para o versionamento e fixa `pg_temp` no fim do `search_path` | Num banco novo a função não existe, e tabela criada depois não ganha RLS sozinha. |
   | `20260828140000_menor_privilegio_tabelas.sql` | desfaz o `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` que o privilégio padrão deu a `authenticated` em `cofre_financial_snapshots` e `cofre_mutations` | Nada hoje. Sem ela, o RLS fica sendo a única camada — e `TRUNCATE` sequer passa por policy. |
   | `20260828150000_rls_auto_enable_gatilho.sql` | o gatilho de evento `ensure_rls`, em `ddl_command_end` | Tabela nova em `public` não ganha RLS sozinha. |

   **`create event trigger` exige superusuário**, e o papel que aplica migrações no
   Supabase nem sempre tem esse poder. A migração trata isso: se não conseguir criar,
   emite `WARNING` com o comando a rodar à mão em vez de derrubar a migração. **Confira
   o resultado** com o bloco 3.1 de `supabase/tests/verify_rls_auto_enable.sql`, que
   responde em uma linha se o automatismo está de pé.

   Nenhuma tabela do projeto depende desse gatilho — todas as `cofre_*` ligam RLS na
   própria migração que as cria. Ele é rede de segurança para o que vier depois.

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
6. **Troque os modelos de email para apontarem o link ao SEU domínio** (Authentication → Emails → Templates).

   O modelo padrão usa `{{ .ConfirmationURL }}`, que aponta para `https://SEU-PROJETO.supabase.co/auth/v1/verify?...`. Isso custa duas coisas de uma vez:

   - **Spam.** O remetente é do seu domínio e o link é de outro. Filtro de spam lê remetente e link em domínios diferentes como sinal de phishing, e é um dos motivos mais comuns de a confirmação cair na caixa de spam mesmo com SPF e DKIM passando.
   - **Só funciona no navegador que cadastrou.** Aquele caminho devolve um `code` que só vira sessão com o verificador PKCE, e o verificador é um cookie do navegador que pediu o link. Cadastrar no computador e abrir o email no celular não conclui.

   Use `{{ .TokenHash }}`, que viaja dentro do link e não depende de cookie nenhum. Em **Confirm signup**:

   ```html
   <a href="https://SEU-DOMINIO/index.html?auth_callback=signup&token_hash={{ .TokenHash }}&type=signup">Confirmar meu email</a>
   ```

   Em **Reset password**:

   ```html
   <a href="https://SEU-DOMINIO/index.html?auth_callback=recovery&token_hash={{ .TokenHash }}&type=recovery">Definir nova senha</a>
   ```

   Quem recebe esse endereço é `bootstrapAccount()` em `js/auth.js`, que manda o token para `POST /api/account/verify`; o servidor troca por sessão e devolve os cookies. O token é apagado da barra de endereços logo depois, porque ele confirma uma conta e não pode ficar no histórico.

   **Isto não substitui as URLs de redirecionamento do item 3.** Os links já enviados usam o caminho antigo, e ele continua atendido pela rota `exchange`. As duas entradas continuam necessárias enquanto houver link antigo circulando.

7. Publique um registro **DMARC** para o domínio remetente. Sem ele, Gmail e Outlook penalizam a entrega mesmo com SPF e DKIM corretos. Comece em modo de observação, que não bloqueia nada:

   ```
   _dmarc.SEU-DOMINIO   TXT   "v=DMARC1; p=none; rua=mailto:VOCE@SEU-DOMINIO"
   ```

8. Configure o restante dos modelos de email com o nome e o domínio reais do produto antes de receber usuários externos.

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
  **A primeira da lista é a canônica.** Ela é o endereço que entra nos links dos emails de
  cadastro e de recuperação quando a requisição chega com um host que a lista não reconhece.
  Coloque a produção primeiro.

  Esta variável deixou de ser opcional em produção. Sem ela, a origem do link de email volta a
  sair do cabeçalho `Host`/`X-Forwarded-Host` da requisição, e um `curl` com
  `X-Forwarded-Host: dominio-falso` faz o Supabase enviar para a vítima um email **verdadeiro**,
  com o seu remetente e a sua marca, apontando para o domínio de quem pediu. Configure também
  a allowlist de redirect no painel do Supabase (Authentication → URL Configuration), que é a
  segunda barreira para o mesmo problema.

Não coloque a chave de serviço em arquivo JavaScript, `.env` publicado, backup ou diagnóstico. Depois de alterar variáveis, faça uma nova publicação das funções.

## 3. Conferir antes de publicar

1. Cadastre uma conta e confirme o email.
2. Saia e entre novamente.
3. Solicite recuperação e defina uma nova senha pelo link.
4. Entre em dois navegadores, confira tipo, nome e selo do aparelho atual na lista de acessos.
5. Revogue o outro navegador, confirme que ele some da lista e que as rotas de conta, sincronização e análise passam a recusá-lo.
6. Envie o mesmo `mutationId` duas vezes e confirme que a revisão avança apenas uma vez.
7. Envie uma revisão antiga e confirme a resposta `409` sem sobrescrever o snapshot atual.
8. Teste exclusão da conta e confirme que os registros do Supabase são removidos em cascata.
9. Confira que o app local continua abrindo e salvando sem conexão.
10. Com A e B abertos na mesma conta, lance algo em A e confirme que B mostra a alteração em até 20 segundos, sem abrir a tela de sincronização.
11. Recarregue B e confirme que a primeira descida termina sem ação manual.
12. Exclua esse lançamento em B e confirme que ele não reaparece em A na sincronização seguinte.
13. Deixe A sem rede, lance algo, devolva a rede e confirme que o envio acontece sozinho.
14. Derrube temporariamente a rota de sessão, recarregue e confirme que a conta fica em estado desconhecido e se recupera ao voltar a rede, sem ser tratada como logout.
15. Confirme que as análises com IA respondem `401` quando não há sessão.
16. Envie sync, análise e `GET /devices` sem `X-Account-Id` e confirme `400 invalid_account_scope`, sem consulta a `cofre_devices`, dados financeiros ou `Set-Cookie`.
17. Envie `X-Account-Id` de outra conta com uma sessão válida e confirme `403 account_scope_changed`, também sem efeito colateral.
18. Teste uma sessão apenas com refresh token: rotas com escopo devem responder `401 session_refresh_required`; somente `GET /api/account/session` pode renovar e emitir cookies.

## Como o conflito é resolvido

Não existe tela pedindo ao usuário para escolher entre duas versões. A cada ciclo o aplicativo envia a fila local e recebe as operações posteriores ao seu cursor:

- União por entidade e identificador. Um registro que só existe de um lado passa a existir dos dois.
- No mesmo identificador, vence a maior revisão lógica `rev`; ela combina tempo, contador e aparelho para produzir a mesma ordem nos dois lados.
- Exclusão é registrada em lápide e vale nos dois sentidos: o que você apagou não volta pelo outro aparelho.
- Preferências de aparelho (tema, layout do Início, consentimentos de privacidade) não são impostas pelo outro lado.

O `409 remote_changed` fica reservado ao primeiro vínculo de dados de visitante: ele impede que uma confirmação preparada sobre uma conta antiga ignore alterações que chegaram no intervalo.

## Limite desta etapa

O conflito é resolvido pelo registro inteiro, não campo a campo. Duas edições simultâneas em campos diferentes do mesmo lançamento ainda resultam em uma versão vencedora. Compartilhamento de conta entre pessoas, como orçamento de casal, continua fora do escopo: cada conta pertence a um usuário.
