# Protocolo de sincronização

Versão atual do contrato: `2` (log de operações). O contrato `1` (snapshot
inteiro) continua atendido **apenas para leitura**, para que um aparelho que
ainda não recarregou a página consiga baixar seus dados e migrar.

O aplicativo local continua sendo a fonte usada pela interface. O adaptador da
nuvem não substitui o IndexedDB: a interface lê sempre da memória alimentada
pelo armazenamento local, e o servidor é um segundo destino atualizado em
segundo plano. É o que mantém o aplicativo inteiro sem conexão.

## Por que o contrato 1 foi substituído

O contrato 1 trocava a base inteira a cada volta. Isso produzia cinco defeitos
que só apareciam com uso real:

1. **Exclusão remota não valia.** O envio era "a base como este aparelho a vê".
   Um aparelho com cópia antiga reenviava o registro apagado, e ele voltava.
2. **Conflito era disputa pelo documento inteiro.** Dois aparelhos mexendo em
   campos diferentes colidiam, e o `409` vinha em rajada.
3. **Relógio errado decidia o vencedor.** A comparação era por `updatedAt`, a
   hora do aparelho. Um celular adiantado ganhava todas as disputas.
4. **Custo por ciclo proporcional à base**, com teto rígido de 6 MiB no commit.
   Acima disso a sincronização parava sem caminho de volta.
5. **Nada sobrevivia ao fechamento da aba.** O que não tinha subido, se perdia.

## Modelo do contrato 2

Cada alteração é uma **operação**:

```json
{
  "entity": "transactions",
  "entityId": "tx-abc",
  "op": "put",
  "rev": "001787012026412.000001.device-b02",
  "payload": { "id": "tx-abc", "type": "expense", "amount": 10, "date": "2026-08-05" }
}
```

`entity` é uma das coleções (`transactions`, `categories`, `goals`, `assets`) ou
`settings`. `op` é `put` ou `delete`. Exclusão é uma operação de primeira
classe: ela persiste no log e propaga, em vez de ser a ausência de um registro
num documento.

### Marca de versão (`rev`)

Relógio lógico híbrido, gerado no cliente:

```
<milissegundos com 15 dígitos>.<contador com 6 dígitos>.<id do aparelho>
```

A largura é fixa para que a comparação de texto simples já seja a comparação de
ordem correta. As regras:

- escrita local: se `agora > último`, `último = agora` e contador zera; senão o
  contador incrementa;
- leitura remota: o aparelho **absorve** a marca recebida, de modo que a próxima
  escrita dele seja necessariamente maior que ela;
- marcas mais de 24 h à frente do relógio local são ignoradas, para que um
  aparelho quebrado não empurre o relógio de todos.

Consequência: quem escreveu **depois de ver** a alteração alheia vence, mesmo
com o relógio atrasado. O desempate final é o id do aparelho, então os dois
lados chegam ao mesmo vencedor sem conversar.

### Compactação

A tabela `cofre_sync_ops` tem índice único por `(user_id, entity, entity_id)`:
uma operação nova **substitui** a anterior do mesmo registro. Por isso a tabela
é ao mesmo tempo o log e o estado, e seu tamanho é proporcional aos **dados**,
não ao número de edições.

- ler o estado inteiro = ler todas as linhas, paginado;
- ler o que mudou = ler as linhas com `seq` maior que o cursor.

## Ciclo do cliente

1. Toda alteração local vira operação e entra numa **fila persistente**
   (object store `outbox`, no IndexedDB do escopo da conta).
2. O ciclo compacta a fila (a última marca de cada registro), envia em lotes de
   até 400 operações e só remove da fila **após** a confirmação do servidor.
3. A mesma resposta traz o que os outros aparelhos fizeram desde o cursor.
4. Se ainda houver páginas, o cliente continua com `GET /changes?since=...`.
5. O cursor é gravado por escopo (`cofre_sync_cursor__u_<id>`).
6. Terminada a descida, o aparelho **semeia** se ainda não semeou nesta conta.

Não há mais `409` de documento inteiro, porque não há mais documento inteiro.

### Semeadura

A fila só recebe **diferença**: ela nasce da comparação entre a gravação e a
anterior. Uma base parada não gera operação nenhuma. Isso deixava invisível para
o servidor tudo que já existia no aparelho antes de a sincronização começar a
funcionar: quem usou o app antes de criar a conta, quem restaurou um backup, e
quem usou enquanto o servidor estava fora do ar. Nada disso dava erro, porque
não havia erro; havia ausência.

A semeadura (`FinanceStore.seedOutbox`) reapresenta a base ao servidor:

- roda **depois da descida**, para nunca empurrar uma versão velha por cima do
  que o outro aparelho escreveu;
- **não inventa marca**: usa a que o registro já carrega, e só cunha uma nova
  para o que nunca passou por uma gravação local;
- **ignora o que está como veio de fábrica** (categorias iniciais intocadas,
  configurações no padrão). Um aparelho recém-conectado que anunciasse o próprio
  vazio com marca nova venceria por ser o mais recente, e apagaria no outro a
  categoria renomeada e a renda preenchida;
- **acontece uma vez por conta e por aparelho** (`cofre_sync_seeded__<escopo>`),
  e mais uma vez sempre que o servidor estiver sem nenhuma operação e o aparelho
  tiver base - o caso de quem tentou sincronizar antes de as tabelas existirem.

Reapresentar é barato e seguro: a marca viaja junto e o servidor guarda a
vencedora, ignorando marca menor ou igual.

A troca da base inteira (`replaceAll`: restaurar backup, desfazer restauração,
adotar dados de visitante) também enfileira. Ali a marca é **nova** para tudo, e
o que sumiu vira lápide: restaurar é declarar o estado de agora, e a declaração
precisa vencer no outro aparelho em vez de ser desfeita por ele na volta
seguinte.

### Quando o ciclo roda

| Gatilho | Quando |
|---------|--------|
| alteração local | 4 s depois da última gravação (rajada vira um envio só) |
| volta da rede | evento `online` |
| retorno ao app | `visibilitychange`, tendo ou não fila para enviar |
| volta periódica | a cada 60 s, **só** com o app à vista |
| nova tentativa | 30 s depois de uma falha de rede |

A volta periódica existe porque os outros gatilhos são todos de **saída**. Sem
ela, dois aparelhos abertos ao mesmo tempo nunca ficavam iguais: quem estava
parado não tinha o que enviar e ninguém ia buscar o que havia chegado. Ela não
avisa a interface quando não encontra novidade, para não reconstruir a tela de
minuto em minuto.

### Uma aba por vez

O ciclo roda dentro de um bloqueio nomeado (`navigator.locks`,
`cofre-sync-<escopo>`, com `ifAvailable`). A aba que não obtém o bloqueio
desiste na hora: a outra já está enviando a mesma fila. Entre abas, gravações
são anunciadas por `BroadcastChannel` e a aba avisada **relê o banco** antes de
gravar de novo, para não reescrever por cima do que a outra fez.

## Isolamento por conta

Cada conta tem banco local próprio (`financas_db__u_<id>`), fila própria,
relógio próprio e cursor próprio. O escopo `guest` mantém os nomes históricos,
para não migrar quem já usava o app sem conta. Dados de visitante só entram numa
conta após confirmação explícita do usuário.

## Sessão

Toda chamada exige a sessão em cookie HttpOnly, `X-Device-Id` e
`X-Sync-Protocol`. O servidor obtém o usuário pela sessão validada, nunca por um
identificador enviado no corpo. O `CloudAdapter` ainda aceita Bearer para testes
e servidores compatíveis, mas a publicação usa `authMode: "cookie"`.

## Rotas

| Rota | Método | Função |
|------|--------|--------|
| `/api/sync/health` | GET | confirma protocolo e revisão atual |
| `/api/sync/changes?since=&limit=` | GET | página de operações após o cursor |
| `/api/sync/changes` | POST | envia operações e recebe as pendentes |
| `/api/sync/reset` | POST | "apagar tudo": grava lápide para cada registro vivo |
| `/api/sync/checkpoints` | GET/POST | lista e cria versões restauráveis |
| `/api/sync/checkpoint?id=` | GET | conteúdo de uma versão, paginado |
| `/api/sync/snapshot` | GET | leitura de compatibilidade (contrato 1) |
| `/api/sync/snapshot` | PUT/DELETE | **recusado** (`protocol_upgrade_required`) |

## Envelope

```json
{
  "protocol": 2,
  "status": "applied",
  "revision": "1284",
  "applied": 3,
  "ops": [],
  "hasMore": false,
  "cursor": "1284"
}
```

`revision` é a maior `seq` do usuário. O cliente a trata como cursor opaco.

## Concorrência e repetição

- `Idempotency-Key` obrigatório em toda gravação, igual ao `mutationId` do
  corpo. Divergência entre os dois é recusada com `400`.
- Repetir a **mesma** mutação devolve a revisão original sem gravar de novo
  (`status: "replayed"`).
- Repetir o mesmo `mutationId` com conteúdo diferente devolve `409`
  (`idempotency_mismatch`).
- Operação com marca menor ou igual à gravada é ignorada: o servidor guarda a
  **vencedora**, não a última que chegou.
- Aparelho revogado recebe `403` (`device_revoked`) e o cliente para o ciclo, sem
  apagar a fila local.

## Limites

- 500 operações por lote; o cliente envia 400.
- 64 KiB por operação.
- 1000 operações por página de leitura; o cliente pede 500.
- Lápides são podadas após 24 meses.
- Checkpoints: os 5 mais recentes por conta.

## Exclusão

- **"Apagar tudo" da conta** (`POST /reset`): grava lápide para cada registro
  vivo. As lápides descem para os outros aparelhos, que então apagam. Truncar as
  linhas apagaria só no servidor, e o próximo aparelho a sincronizar devolveria
  a base inteira.
- **Exclusão da conta** (`cofre_purge_account`): remove operações, estado,
  checkpoints e mutações, e revoga todos os aparelhos no mesmo ato, para que
  nenhum consiga gravar de volta depois.
