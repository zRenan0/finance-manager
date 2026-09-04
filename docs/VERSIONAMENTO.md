# Versionamento e compatibilidade

Este documento é o inventário das versões vivas do projeto e a matriz do que
acontece quando duas pontas discordam. Ele existe porque o app roda em três
lugares ao mesmo tempo (o navegador que já baixou o pacote, o pacote publicado
agora e o banco) e nenhum dos três atualiza junto com os outros.

`tests/test-versioning.js` confere os números desta página contra o código. Se
esta tabela mentir, a suíte falha; documentação que envelhece em silêncio é pior
do que documentação nenhuma.

## As seis versões

| Versão | Onde mora | Valor atual | Quem obriga |
|---|---|---|---|
| `APP_VERSION` | `package.json` e `js/safe-errors.js` (`SAFE_ERROR_APP_VERSION`) | `0.30.0` | `scripts/check-release.js` reprova a publicação se as duas divergirem ou se o CHANGELOG não citar a versão |
| `LOCAL_SCHEMA_VERSION` | `js/storage.js` (`SCHEMA_VERSION`) | `23` | `migrate()` carimba em todo snapshot; o backup leva o número junto |
| `INDEXEDDB_VERSION` | `js/storage.js` (`DB_VERSION`) | `4` | O próprio navegador, no `indexedDB.open()` |
| `SYNC_PROTOCOL_VERSION` | `js/storage.js` (`CLOUD_SYNC_PROTOCOL`) e `netlify/functions/sync.js` (`PROTOCOL`) | `3` (mínimo de escrita `2`, leitura legada `1`) | O backend, pelo cabeçalho `X-Sync-Protocol` e pelo campo `protocol` do corpo |
| `DATABASE_SCHEMA_VERSION` | `cofre_sync_config.database_schema_version` | `1` | Ninguém: é declarativa. Publicada em `/api/sync/health` |
| `SERVICE_WORKER_VERSION` | `service-worker.js` (`VERSION`) | `v71` + digest do pacote | `scripts/build-dist.js`, que injeta o SHA-256 de todo o pacote publicado |

Versões menores, com regra própria:

| Versão | Onde | Para quê |
|---|---|---|
| `LEGAL_TEXT_VERSION` | `js/storage.js` | Sobe quando o CONTEÚDO da política muda, não a redação. Subir pede aceite de novo |
| `BACKUP_KIND` | `js/storage.js` | Identidade do arquivo de backup comum |
| `cofre.backup.encrypted.v1` | `js/backup-crypto.js` | Identidade do backup protegido. A versão está no nome, e os parâmetros do derivador viajam dentro do arquivo |
| `LINK_DIGEST_VERSION` | `js/storage.js` | Formato do resumo usado ao vincular a base do visitante a uma conta |

## Quando subir cada uma

- **`APP_VERSION`**: a cada publicação. O CHANGELOG precisa citar o número antes.
- **`LOCAL_SCHEMA_VERSION`**: quando a FORMA do snapshot mudar (campo novo,
  campo com outro significado, entidade nova). Junto com ela entra o bloco
  correspondente em `migrate()`, que só sobe de versão e nunca apaga o que não
  reconhece sem substituto.
- **`INDEXEDDB_VERSION`**: só quando um object store ou índice for criado. O
  `onupgradeneeded` usa `contains()` em tudo, então bancos antigos ganham apenas
  a coleção nova e os dados gravados não são tocados.
- **`SYNC_PROTOCOL_VERSION`**: quando o formato do que trafega mudar. Subir o
  `minimum_write_protocol` no banco é o que corta clientes antigos, e é uma
  decisão separada de subir o protocolo.
- **`DATABASE_SCHEMA_VERSION`**: na MESMA migração que muda a forma do banco.
- **`SERVICE_WORKER_VERSION`**: não precisa ser tocada a cada publicação; o
  digest do pacote já muda sozinho. Subir o `vNN` é para mudança na estratégia
  de cache.

## Matriz de compatibilidade

O que acontece hoje, verificado, quando as pontas discordam:

| Situação | O que acontece | Perde dado? |
|---|---|---|
| Cliente antigo × protocolo de sincronização acima do mínimo de escrita | Sincroniza normalmente; o servidor atende as versões 1, 2 e 3 | Não |
| Cliente abaixo do `minimum_write_protocol` | **426** `protocol_upgrade_required`, com a fila local preservada para depois da atualização | Não |
| Cliente fala protocolo que o servidor não conhece | **400** `protocol_mismatch` | Não |
| Cabeçalho e corpo falam protocolos diferentes | **400** `protocol_mismatch` (defesa contra corpo forjado) | Não |
| Servidor exige mínimo acima do que o cliente fala | O cliente detecta antes de enviar (`minimumWriteProtocol > CLOUD_SYNC_PROTOCOL`) e não tenta escrever | Não |
| `cofre_sync_config` ausente ou inválida (migração não aplicada) | **503** `schema_missing`, com mensagem exposta | Não |
| Banco sem `database_schema_version` (anterior à migração 20260831120000) | `/api/sync/health` devolve `databaseSchema: null`. Nada é recusado | Não |
| Backup de schema **antigo** restaurado em app novo | `migrate()` sobe versão por versão; a prévia avisa "formato antigo (será convertido)" | Não |
| Backup de schema **novo** restaurado em app antigo | Abre, com aviso explícito na prévia. O que a versão atual reconhece entra inteiro; campo introduzido depois dela não é entendido e não entra | **Parcial, e avisado** |
| Backup protegido aberto por app anterior ao M12 | "não parece ser um backup"; nada é gravado | Não |
| IndexedDB com versão **maior** que a do app (usuário voltou para uma versão anterior) | O `open()` falha com `VersionError`, o app cai no `LocalStorageAdapter` e recupera a base pelo espelho `financas_db_mirror` | Não, até 3 MB de espelho |
| Service Worker antigo × pacote novo | A instalação só assume o controle depois de guardar o pacote inteiro; o digest do pacote muda a identidade do worker | Não |
| Política com `LEGAL_TEXT_VERSION` nova | O aceite é pedido de novo antes de continuar | Não |

## Limitações conhecidas

1. **Sincronização entre versões diferentes do schema local.** O protocolo
   trafega registros, não a versão do schema que os criou. Um aparelho com o app
   mais novo pode gravar um campo que um aparelho com o app antigo não conhece;
   ao baixar, normalizar e reenviar, o aparelho antigo devolve o registro sem
   esse campo. Hoje isso é contido na prática por três coisas: o app é servido de
   uma origem só, o Service Worker força a atualização do pacote inteiro e
   `migrate()` nunca apaga entidade, apenas campos desconhecidos DENTRO de um
   registro. Resolver de verdade pede um lugar no protocolo para campos não
   reconhecidos, o que é mudança de protocolo e não cabe numa correção. **Está
   registrado como P2, não corrigido.**
2. **O espelho do localStorage tem teto de 3 MB.** Ele é a rede de segurança
   para o caso de IndexedDB indisponível ou com versão à frente; uma base maior
   que isso não cabe inteira nele.
3. **`DATABASE_SCHEMA_VERSION` é declarativa.** Ela não recusa atendimento
   quando o banco está atrás. Isso é deliberado: um portão transformaria "esqueci
   de aplicar uma migração" em "o aplicativo parou para todo mundo".
