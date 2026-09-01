# Armazenamento local e privacidade

Este documento inventaria o que o aplicativo grava no navegador, o que pode
sair do aparelho e quais versões controlam cada formato. O código continua
sendo a fonte de verdade. O teste `tests/test-storage-privacy-inventory.js`
impede que as chaves principais e este inventário se afastem.

O inventário de tratamento do M18, com finalidade, retenção, acesso, terceiros e
exclusão de cada classe, está em `docs/INVENTARIO-DE-DADOS.md` e na estrutura
`LEGAL_DATA_INVENTORY`, usada pela tela de Privacidade.

## Versões atuais

| Contrato | Versão | Fonte |
|---|---:|---|
| Schema lógico dos dados | 23 | `SCHEMA_VERSION` em `js/storage.js` e `netlify/functions/_shared/finance-schema.js` |
| Estrutura física do IndexedDB | 4 | `DB_VERSION` em `js/storage.js` |
| Protocolo de sincronização | 3 | `CLOUD_SYNC_PROTOCOL` no cliente e `SYNC_PROTOCOL` no servidor |
| Pacote do cache offline | v63 | `VERSION` em `service-worker.js` |

As duas primeiras versões não são a mesma coisa. O schema lógico sobe quando o
formato ou o significado dos dados muda. A versão física sobe somente quando um
object store ou índice do IndexedDB precisa ser criado ou alterado. Uma mudança
lógica pode usar os mesmos stores e, nesse caso, não deve promover o IndexedDB.

Todo snapshot normalizado recebe `version: 23`. O backup JSON também leva a
versão no campo `schema`, e o servidor só aceita snapshots na mesma versão. As
migrações lógicas ficam concentradas em `migrate()` e precisam continuar
idempotentes. Nunca se reduz uma versão publicada.

## Escopos

O visitante usa o escopo `guest`. Ele conserva os nomes históricos, como
`financas_db` e `financas_db_mirror`, para não perder dados de instalações
antigas. Uma conta usa `u_<id seguro>` e recebe nomes separados, como
`financas_db__u_<id>` e `financas_db_mirror__u_<id>`.

`cofre_active_scope` lembra qual banco deve abrir antes da rede responder. Isso
permite trabalhar offline numa conta já conhecida sem gravar no banco do
visitante. Trocar de conta fecha o adapter anterior, limpa o snapshot em memória
e abre o banco do novo escopo. Dados de visitante só entram numa conta depois de
uma confirmação própria.

## Fluxo dos dados financeiros

1. A interface lê um snapshot em memória carregado do IndexedDB.
2. Uma alteração atualiza esse snapshot e grava uma cópia síncrona em
   `financas_db_mirror`, com limite de 3 MB.
3. A confirmação durável vai para o IndexedDB. Quando há conta ligada, a mesma
   transação inclui a operação na `outbox`.
4. `js/cloud-sync.js` envia a fila para `/api/sync`, recebe as alterações que
   vieram de outros aparelhos, grava tudo localmente e só então avança o cursor.
5. Sem IndexedDB, o `LocalStorageAdapter` mantém base, fila e metadados em chaves
   separadas, com um diário de recuperação para simular um commit completo.
6. Sem IndexedDB e sem localStorage, o aplicativo fica apenas em memória e avisa
   que não consegue salvar.

O espelho, o fallback, a cópia de desfazer e o backup da migração antiga contêm
dados financeiros em JSON legível. Eles não são criptografados no aparelho.
Scripts da página ficam limitados pela CSP e não há script de terceiro no app,
mas uma pessoa com acesso ao perfil do navegador ou ao aparelho pode inspecionar
esses dados. Tokens de sessão nunca entram no localStorage, no IndexedDB, no
backup ou no diagnóstico.

## IndexedDB

Nome físico: `financas_db` para visitante e `financas_db__u_<id>` para conta.
Versão física atual: 4.

| Object store | Conteúdo | Sai no backup | Sincroniza |
|---|---|---:|---:|
| `transactions` | Lançamentos | Sim | Sim |
| `categories` | Categorias e limites | Sim | Sim |
| `goals` | Metas | Sim | Sim |
| `assets` | Bens, investimentos e dívidas | Sim | Sim |
| `settings` | Renda, contas, cartões, movimentos internos, preferências, avisos, consentimentos, lápides e versão lógica | Sim, com seleção explícita de campos | Parcialmente; `privacy` participa |
| `outbox` | Operações ainda não confirmadas pelo servidor, inclusive o registro completo em operações de gravação | Não | É a fila de envio |
| `localMeta` | Cursor, recibos e diários de semeadura, vínculo, reconciliação e lote de envio em voo | Não | Não |

Índices financeiros existem apenas onde há consulta local: lançamentos por mês,
data, categoria, tipo e meta; categorias por pai; bens por natureza e classe. A
fila tem índices pelos identificadores internos de vínculo, semeadura e entrada.

## localStorage

O sufixo `[__u_<id>]` significa que o visitante usa a chave sem sufixo e cada
conta recebe uma chave própria.

| Chave ou padrão | Conteúdo | Ciclo de vida |
|---|---|---|
| `financas_theme` | Tema claro ou escuro | Global no navegador; volta para claro ao apagar os dados pela interface |
| `cofre_device_id` | Identificador aleatório e estável do aparelho | Permanece para reconhecer o aparelho; não é segredo de sessão |
| `cofre_active_scope` | Escopo da última conta conhecida | Removido ao voltar ao visitante |
| `financas_safe_errors_v1` | Até 50 códigos de diagnóstico dos últimos 30 dias, sem conteúdo financeiro ou identificadores | Podado na leitura e removido pelo controle de diagnóstico ou pela exclusão local concluída |
| `financas_pro_v2` | Base financeira do formato anterior ao IndexedDB, somente no visitante | Lida uma vez, copiada para a chave de backup e removida após a migração |
| `financas_pro_v2_backup` | Cópia da base legada feita na migração | Permanece como recuperação até a exclusão dos dados do visitante |
| `financas_db_fallback[__u_<id>]` | Snapshot financeiro completo quando o IndexedDB não funciona | Reescrito a cada commit; removido no purge do escopo |
| `financas_db_mirror[__u_<id>]` | Espelho financeiro completo, síncrono, com teto de 3 MB | Reescrito a cada gravação; removido no purge do escopo |
| `financas_db_undo[__u_<id>]` | Snapshot anterior a uma restauração ou limpeza reversível | Substituído pela próxima operação desse tipo; removido no purge do escopo |
| `financas_db_outbox[__u_<id>]` | Fila com operações e payloads quando o fallback está ativo | Esvaziada após confirmação; removida no purge do escopo |
| `financas_db_meta[__u_<id>]` | Cursor, recibos e diários quando o fallback está ativo, inclusive a identidade do lote de envio em voo | Atualizado pelo ciclo; removido no purge do escopo |
| `financas_db_recovery[__u_<id>]` | Diário temporário com base, fila e metadados durante um commit do fallback | Removido ao confirmar; reaplicado no próximo boot depois de interrupção |
| `financas_db_clock[__u_<id>]` | Relógio lógico e revisões de configurações deste aparelho | Removido no purge do escopo |
| `financas_db_reset_barrier[__u_<id>]` | Maior marca de uma exclusão remota confirmada | Preservado no purge para impedir que um item novo nasça abaixo das lápides |
| `cofre_sync_cursor[__u_<id>]` | Cursor do formato antigo | Apenas lido para migração ao `localMeta`; removido no purge |
| `cofre_sync_seeded__<escopo>` | Marcador antigo de semeadura | Não é mais lido; removido no purge |
| `__financas_test__` | Teste transitório de disponibilidade | Criado e removido na mesma verificação |

O `sessionStorage` contém apenas `cofre_build_reload`, a versão do pacote que já
provocou recarga nesta aba. Ele evita um laço durante a troca do service worker,
some ao fechar a aba e não contém dado financeiro.

O diário `syncBatchJournal` não duplica os dados financeiros da fila. Ele guarda
as chaves exatas das entradas, o `mutationId` e a revisão remota esperada para
repetir com segurança uma chamada cuja resposta possa ter se perdido.

## CacheStorage e service worker

| Cache | Conteúdo |
|---|---|
| `financas-cache-v63` | HTML do app, CSS, JavaScript, PDF.js, fontes locais, manifesto e ícones |
| `financas-pages-v63` | Landing e outras navegações públicas |
| `financas-fonts-v63` | Reserva para fontes externas; vazio hoje porque `FONT_HOSTS` está vazio |

No pacote publicado, cada nome recebe ainda o SHA-256 integral da publicação
depois de `v63`. Isso faz duas versões coexistirem durante a instalação sem que
a nova escrita altere o cache usado pelo worker anterior.

Somente requisições GET podem entrar no service worker. Qualquer caminho sob
`/api/` sai antes da leitura ou escrita de cache, e as respostas do backend
também levam `Cache-Control: no-store`. Assim, sessão, sincronização e respostas
de IA não são gravadas no CacheStorage. Na ativação, versões antigas com prefixo
`financas-` são apagadas.

## Cookies

Os cinco cookies são criados pelo backend. Todos usam `Path=/`, `HttpOnly` e
`SameSite=Lax`; em HTTPS ou produção também usam `Secure`. Como não há atributo
`Domain`, são cookies do host que os emitiu.

| Cookie | Finalidade | Validade máxima |
|---|---|---:|
| `cofre_access` | Token curto de acesso | 1 hora |
| `cofre_refresh` | Renovação de sessão | 30 dias |
| `cofre_pkce` | Verificador do cadastro ou recuperação por email | 24 horas |
| `cofre_device` | Segredo próprio do aparelho, comparado por hash no servidor | 365 dias |
| `cofre_recovery` | Prova de que a sessão veio de um link de recuperação | 30 minutos |

O JavaScript do navegador não lê esses cookies. O backend pode renová-los pela
rota de sessão e os limpa no logout, na revogação do aparelho atual e na exclusão
da conta.

## Saídas do aparelho

| Ação | Destino | Conteúdo |
|---|---|---|
| Usar sem conta | Nenhum servidor de dados | Os dados financeiros permanecem no navegador |
| Ligar uma conta | Backend da mesma origem e Supabase | Registros selecionados pelo protocolo de sincronização, email, sessão e identificação dos aparelhos |
| Pedir análise por IA | `/api/analyze` e provedor de IA | Totais mensais, nomes de categorias, nomes e valores de metas, histórico e regras escolhidas na prévia; não é anônimo porque nomes podem revelar contexto |
| Pedir refinamento de lançamento | `/api/analyze` e provedor de IA | Frase digitada e nomes das categorias |
| Cadastrar ou trocar senha | Backend e Have I Been Pwned | Cinco caracteres do SHA-1 enviados pelo servidor; sem senha, email ou IP do usuário |
| Usar conta, sincronização ou IA | Logs da hospedagem | Área, operação, método, status, duração, código controlado e `X-Request-Id`; sem corpo, IP, email ou conteúdo financeiro |
| Consultar QR de nota fiscal | Portal oficial da Sefaz | Endereço e chave da nota depois da ação do usuário; como a chamada sai do navegador, o portal pode receber IP e metadados normais da conexão |
| Exportar backup | Arquivo escolhido pelo usuário | Snapshot financeiro versionado com checksum |
| Exportar backup protegido | Arquivo escolhido pelo usuário | O mesmo snapshot dentro de um envelope AES-GCM; fora dele ficam apenas o rótulo do formato, os parâmetros do derivador e a data |

Importações de OFX, CSV e PDF são processadas no navegador. O arquivo original
não é enviado pelo fluxo de importação.

## Backup protegido por senha

O backup em JSON continua sendo o padrão e não mudou de formato. A proteção por
senha é uma segunda porta para o mesmo conteúdo, pensada para quem vai guardar a
cópia em nuvem de terceiro ou enviá-la por e-mail.

| Item | Escolha | Motivo |
|---|---|---|
| Cifra | AES-GCM 256 | Autenticada: arquivo adulterado falha em vez de devolver conteúdo plausível |
| Derivação | PBKDF2-SHA-256, 310.000 iterações | É o que o WebCrypto oferece sem biblioteca de terceiro no caminho dos dados |
| Sal e IV | 16 e 12 bytes, sorteados a cada exportação | Dois backups da mesma base com a mesma senha não produzem o mesmo arquivo |
| Cabeçalho | Rótulo, parâmetros do derivador, IV e data | Não guarda contagem de lançamentos, nome nem qualquer conteúdo da base |
| Iterações | Gravadas dentro do arquivo | Subir o padrão amanhã não invalida arquivo gerado hoje |

A chave nasce só da senha: **não existe recuperação**. A tela diz isso antes da
escolha da senha. A senha vive apenas em memória, some assim que o arquivo é
gerado ou aberto, e nunca é gravada em disco nem enviada para o servidor.

Senha errada e arquivo adulterado produzem a mesma mensagem de propósito:
distinguir os dois casos entregaria a quem tenta abrir o arquivo a informação de
quando acertou metade do problema.

## Exclusão

`FinanceStore.purge()` limpa os sete stores do escopo atual e remove as chaves
locais que podem reter conteúdo financeiro ou estado daquele escopo. A barreira
de reset fica, de propósito, porque ela protege contra a volta de registros já
apagados. O diagnóstico é removido pela interface somente depois que o purge
termina com sucesso.

Com conta ligada, "apagar em todos os aparelhos" cria as exclusões no servidor
antes de esvaziar o banco local. "Apagar só aqui e desconectar" limpa o escopo
local e encerra a sessão. Apagar a conta usa outra ação, que purga as tabelas do
usuário antes de remover o cadastro de autenticação.

CacheStorage não entra nessa limpeza porque só contém arquivos públicos do
aplicativo. Cookies e o identificador estável do aparelho seguem os controles de
sessão, e não o botão que apaga somente os dados financeiros.
