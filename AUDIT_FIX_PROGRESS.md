# Progresso da correção de auditoria (beta público)

Documento de continuidade. Se o trabalho for interrompido, retome pelo primeiro
item **PENDENTE** da fase corrente.

## Como rodar

```bash
npm ci
npm test                 # suíte Node (tests/run-all.js)
npm run test:browser     # fluxos Playwright
npm run verify:release   # build + testes + checagem de publicação
```

## Estado atual

- Base: `main` @ f136fc8, suíte verde (31 arquivos de teste) antes do trabalho.
- Fase corrente: **P1-B (itens 16 a 19)**.
- Suíte: 34 arquivos, verde. Playwright: 11 fluxos verdes no Chromium, incluindo
  ponteiro touch em 320 px. Cobertura global 21,8% (catraca em 20%).

## Fases

### P0-A — Isolamento e sincronização
| # | Item | Estado |
|---|------|--------|
| 1 | Isolar IndexedDB/memória/sync por `userId` | **CONCLUÍDO** |
| 2 | Sync incremental com oplog, tombstones, fila persistente | **CONCLUÍDO** |

### P0-B — Semântica financeira
| # | Item | Estado |
|---|------|--------|
| 3 | Separar consumo/transferência/aporte/principal/juros/estorno | **CONCLUÍDO** |
| 4 | Separar renda planejada, realizada e projetada | **CONCLUÍDO** |

### P0-C — Cálculos
| # | Item | Estado |
|---|------|--------|
| 5 | Cartão: rotativo por 1 ciclo + parcelamento real | **CONCLUÍDO** |
| 6 | Consórcio: sem desconto 0,8% e sem falso CET | **CONCLUÍDO** |
| 7 | Dívidas: taxa contratual, CET, quitação, Price/SAC | **CONCLUÍDO** |
| 8 | Carteira: eventos, XIRR/TWR, benchmarks | **CONCLUÍDO** |
| 9 | Aposentadoria: taxa real negativa, IR por dias, FGTS | **CONCLUÍDO** |
| 10 | Fontes oficiais com vigência e premissas | **CONCLUÍDO** |

### P1-A — Nuvem, privacidade, segurança
| # | Item | Estado |
|---|------|--------|
| 11 | Sem snapshot por ciclo; paginação e versões | **CONCLUÍDO** |
| 12 | Exclusão de conta apaga servidor e dispositivos | **CONCLUÍDO** |
| 13 | Telas de privacidade alinhadas ao real | **CONCLUÍDO** |
| 14 | IA: prévia, ocultação, sem "anônimo" falso | **CONCLUÍDO** |
| 15 | CSV, senha, rate limit, backups, datas, segredos | **CONCLUÍDO** |

### P1-B — UX, acessibilidade, entrega
| # | Item | Estado |
|---|------|--------|
| 16 | Onboarding em telas baixas e zoom 200% | **CONCLUÍDO** |
| 17 | Teclado, ARIA, foco, contraste AA | PENDENTE |
| 18 | 320 px, rótulos, nome único do assistente | **CONCLUÍDO** |
| 19 | HTML inicial, rota, paginação, service worker | PENDENTE |
| 20 | `npm start`, `dist/`, fontes locais | **CONCLUÍDO** |

## Decisões tomadas

### Item 1 (isolamento)
- Escopo de armazenamento por conta: `financas_db__u_<userId>`. O escopo
  `guest` MANTÉM os nomes históricos (`financas_db`, `financas_db_mirror`...),
  então quem já usava o app sem conta não migra nada e não perde nada.
- `/api/account` passou a devolver `userId`; o cliente deriva o escopo dele.
- O escopo ativo fica lembrado em `cofre_active_scope` para o app abrir no banco
  certo sem esperar a rede (importa para uso offline).
- Troca de escopo só acontece com sessão CONFIRMADA pelo servidor. Falha de rede
  não derruba para visitante (faria a conta parecer vazia).
- Dados de visitante entram numa conta só por confirmação explícita; a resposta
  fica registrada em `cofre_guest_import_<escopo>` para não repetir a pergunta.
- Exclusão de conta agora apaga também a cópia local dela.

### Item 2 (sincronização)
- Protocolo 2: log de operações compactado (índice único por entidade+id), em
  vez de snapshot inteiro por ciclo. Contrato 1 continua só para LEITURA.
- Ordem entre aparelhos por relógio lógico híbrido (HLC), formato
  `<15 dígitos ms>.<6 dígitos contador>.<aparelho>`, comparável como texto.
- Lápide passou a ser `{ at, rev }` (aceita o formato antigo em texto).
- Dedup por assinatura de conteúdo REMOVIDO do merge: dois gastos iguais no
  mesmo dia são normais e ambos sobrevivem.
- Fila persistente no object store `outbox` (IndexedDB v3), só com conta ligada.
- Eco do remoto é detectado por IMPRESSÃO DO CONTEÚDO, não por dedução da marca:
  a dedução perdia a edição feita logo após receber a alteração alheia.
- Duas abas: `navigator.locks` com `ifAvailable` para o ciclo, `BroadcastChannel`
  + releitura do banco para o estado em memória.
- "Apagar tudo" com conta ligada grava lápides no servidor (propaga) e oferece
  a alternativa "apagar só aqui e desconectar".
- Versões restauráveis: `cofre_sync_checkpoints`, restauração emite marcas NOVAS
  para propagar como qualquer outra alteração.

### Itens 3 e 4 (semântica financeira)
- Campo `nature` no lançamento, com 8 valores (consumo, aporte, divida-principal,
  divida-encargos, transferencia, renda, resgate, estorno). Deduzido de
  `goalId`/`debtId`/categoria em bases antigas, então nenhum número muda por
  falta de informação.
- `realizedMonthTotals` passou a devolver os buckets separados; `expense` agora
  é consumo + encargos - estornos.
- `incomeBasis(data, mes)` devolve planejada, realizada, projetada, `basis`,
  `partial` e `complete`. `savingsRate` é NULL sem renda realizada (não zero).
- Score compara base compatível (fechado: realizado x realizado; corrente:
  projetado x projetado, marcado como estimativa).
- Conquistas só contam meses fechados.
- UI: seletor "Tipo de movimento" recolhido na tela de lançamento.

### Itens 5 e 6 (cartão e consórcio)
- Rotativo limitado a UM ciclo (Res. CMN 4.549/2017); depois, parcelamento real
  em tabela Price com cronograma explícito.
- Teto de 100% (Lei 14.690/2023) aplicado à SOMA das duas fases.
- Invariante garantida: soma das parcelas = total pago (resíduo na última).
- Taxa padrão do parcelamento virou premissa declarada (8,5% a.m.), em vez de
  "rotativo menos 7 pontos", que zerava em cartões baratos.
- Consórcio: removido o desconto de 0,8% a.m. e o CET derivado dele. A TIR agora
  usa o fluxo real (carta entra no mês da contemplação) e devolve NULL quando o
  fluxo não tem taxa única. Três cenários de contemplação, reajuste anual,
  seguro, fundo de reserva e lance em prazo ou parcela.

### Itens 7 a 10 (dívidas, carteira, tributação, fontes)
- Dívidas: taxa CONTRATUAL para saldo/cronograma/quitação; CET só para
  comparação e ordenação. `debtPayoffQuote` usa valor presente (CDC art. 52).
  `debtSchedule` gera Price e SAC com soma das parcelas exata.
- Carteira: eventos datados (`asset.events`), XIRR e TWR. Benchmark usa série
  histórica quando existe e se declara aproximado quando não existe.
  Textos de alocação reescritos para descrever, não recomendar (CVM 19 e 30/2021).
- Tributação: IR por DIAS REAIS de calendário (24 meses = 730/731 dias = 15%,
  não 720 = 17,5%). Regras versionadas em `TAX_RULES` com vigência e fonte.
- `docs/FONTES-FINANCEIRAS.md` criado com fonte, vigência e premissa de cada
  cálculo, e com a lista do que ainda depende de decisão externa.

### Itens 11, 12, 14, 15 e 20 (P1)
- 11: já resolvido pelo protocolo 2 (paginação por cursor, sem snapshot por
  ciclo, checkpoints restauráveis).
- 12: `cofre_purge_account` roda ANTES de apagar o usuário do Auth e revoga
  todos os aparelhos no mesmo ato, fechando a janela em que um ciclo em
  andamento gravaria de volta. Falha na purga aborta a exclusão.
- 14: `buildAnonymousPayload` virou `buildAiPayload` (o pacote leva nomes de
  categoria e meta; não é anônimo). Prévia (`buildAiPayloadPreview`) e
  ocultação por campo. O prompt deixou de exigir 2 a 4 riscos e passou a mandar
  devolver lista vazia sem risco. O `score` do modelo é descartado.
- 15: CSV neutraliza fórmula (`=`, `+`, `-`, `@`, tab) e o importador desfaz;
  datas passam por `isRealIsoDate` (31/02 era aceito e rolava para março);
  senha limpa do estado em sucesso E em erro; backup com teto de 32 MB e
  200 mil registros; rate limit persistido no banco com identidade em HMAC.
- 20: `npm start` (servidor sem dependência), `dist/` por lista de inclusão
  (a raiz publicava tests/, docs/ e as migrações), CSP sem domínios do Google,
  fontes locais com `@font-face` e pilha do sistema como alternativa.

### Item 13 (privacidade e termos)
- A tela afirmava duas coisas que deixaram de ser verdade: que "a sincronização
  contínua dos dados financeiros ainda não está ativa" (o item 2 ligou) e que
  "fontes do Google podem receber dados técnicos" (o item 20 tirou o Google).
  Texto de privacidade errado é defeito, porque é com ele que o usuário decide.
- Entraram na tela: identificação do controlador, canal de atendimento,
  encarregado, prazo de resposta (art. 19, II), prazos de retenção por dado,
  os nove incisos do art. 18 mais o art. 20, canal de incidentes (art. 48),
  lista dos terceiros que recebem dados e termos completos em 12 cláusulas.
- Os campos que só o dono do app conhece ficam em `LEGAL_CONTROLLER` com o
  marcador `LEGAL_PENDING`. A tela mostra "Ainda não definido" e lista o que
  falta, em vez de esconder; o marcador em si nunca aparece para o usuário.
  `check:release` AVISA (não reprova), porque reprovar travaria a esteira que
  precisa rodar justamente até esses dados existirem.
- Os prazos de retenção foram lidos do código que os aplica, não estimados:
  30 dias/50 ocorrências no diagnóstico, 1 h de cookie de acesso, 30 dias de
  renovação, 365 dias de aparelho, poda de lápide em 24 meses, 5 versões
  restauráveis, 30 dias de idempotência, 1 dia de limite de tentativas.
- `LEGAL_TEXT_VERSION` subiu para `2026-08-18.1`: o conteúdo mudou, então o
  aceite tem de ser pedido de novo.
- `normalizePrivacy` ganhou `acceptedVersions`. Antes, subir a versão apagava a
  evidência do aceite anterior; agora ela fica registrada (no aparelho, o que
  não a torna prova contra o usuário, e a tela diz isso).
- Fora do módulo, mas do mesmo defeito: o resumo legal do onboarding também
  dizia que os dados ficam só no navegador, e o cabeçalho de
  `netlify/functions/analyze.js` ainda chamava o pacote de IA de anonimizado.
  Os dois textos foram corrigidos. O LAYOUT do onboarding continua sendo M4.

### Item 14 (a tela da IA)
- O motor já estava pronto e não foi tocado. Faltava a interface, e o cartão
  prometia "antes do envio você verá exatamente quais dados sairão do aparelho"
  enquanto mostrava um PARÁGRAFO descrevendo o pacote. Consentir sobre uma
  descrição não é consentir sobre o conteúdo, ainda mais quando o conteúdo leva
  nomes escolhidos pelo usuário.
- `renderAiPreviewModal()` (nova camada `ai-preview`) mostra o JSON que vai
  sair, o número de campos e o tamanho, com as quatro caixas de ocultação.
  Ela chama `buildAiPayloadPreview`, a MESMA função do envio, então prévia e
  envio não podem divergir.
- `requestStructuredAnalysis` ganhou o terceiro parâmetro `options` e passou a
  usar `buildAiPayload` em vez do atalho `buildAnonymousPayload`, que descartava
  a ocultação. Sem isso, a prévia mostraria um pacote e o envio mandaria outro.
- A escolha vira preferência (`privacy.aiHide`) e também pode ser feita em
  Privacidade. Conferido nos dois sentidos no navegador.
- `_rendaLancada` é chave interna com valor `undefined`: o JSON já a omite, mas
  ela aparecia em `preview.campos`. A tela filtra nomes iniciados por `_` para
  não anunciar um envio que não acontece.
- Teste que codificava o mecanismo antigo: "IA respeita o bloqueio antes do
  popup" casava com `requestConfirmation`, que saiu do fluxo. Foi reescrito para
  o COMPORTAMENTO (a guarda vem antes de abrir a camada, comparando posições
  dentro da função) e deixou de depender da distância entre duas linhas.
- Conferido no navegador em 375 px e 320x480: ações alcançáveis, corpo rolando,
  sem vazamento horizontal, `<details>` sobrevivendo ao rerender, e o erro de
  envio sem backend virando mensagem controlada.

### Item 16 (onboarding em tela baixa e zoom de 200%)
- A folha inteira era centralizada dentro de um contêiner flexível com rolagem.
  Quando o conteúdo passava da altura disponível, seu início ficava acima da
  viewport e não podia ser alcançado nem com rolagem.
- Cabeçalho, progresso e rodapé agora permanecem dentro da folha, enquanto só
  o corpo central encolhe e rola. A altura usa `100dvh` com alternativa em
  `100vh`, e os insets superior e inferior da área segura são descontados uma
  única vez.
- A região rolável tem altura útil, contém a rolagem e reserva espaço para o
  anel de foco. Em telas de até 520 px de altura, os intervalos da folha são
  menores sem reduzir os alvos de toque.
- O Playwright percorre os quatro passos em 320x480 com toque e em uma viewport
  CSS de 390x450 com DPR 2, equivalente ao espaço disponível com ampliação de
  200%. DPR cobre densidade; quem comprova o reflow é a viewport CSS reduzida.
- O teste mede caixas reais, ausência de rolagem horizontal e aninhada, alvos
  mínimos de 44 px, rótulos do progresso, separação entre corpo e rodapé,
  alcance do último conteúdo, resumo legal aberto e o anel de foco completo.
  Também confirma que avançar e voltar levam o novo passo ao topo.
- Fora do módulo: ordem completa por teclado, semântica ARIA e contraste geral
  continuam no M5; carregamento inicial e paginação continuam no M6.

### Item 18 (320 px, rótulos e assistente)
- Em 320 px, a doca dava 52 px a cada destino e escondia com reticências os
  rótulos “Movimentações” e “Planejamento”. No celular eles viraram
  “Movimentos” e “Planejar”; os nomes acessíveis contêm o rótulo visível e o
  nome completo da tela.
- A central “Tudo” virou “Recursos”, nome compatível com seu catálogo
  pesquisável de 22 entradas. `all`, `allSearch` e o endereço `#/tudo` foram
  preservados para não quebrar estado, código ou links existentes.
- O nome da funcionalidade foi fixado em “Assistente financeiro” no cartão, no
  lançador e no diálogo. “Local” saiu do nome, porque a própria tela já explica
  que as respostas são calculadas no aparelho.
- A doca touch ocupa até 90 px e fica 9 px acima da borda. `--nav-h` agora cobre
  esse espaço e a área segura; o lançador deixou de somar a área segura duas
  vezes. A reserva inferior do conteúdo também passou a incluir sua altura.
- `.tool-link` tinha 276 px dentro de `.tool-links` com 256 px, pois cada filho
  carregava margem negativa. A margem foi movida para o contêiner: o alinhamento
  ficou igual, mas `scrollWidth` e `clientWidth` agora fecham.
- O Playwright novo mede as caixas reais em 320 px com toque: nenhum rótulo é
  cortado, lançador e doca não se cruzam, o último conteúdo fica descoberto,
  `.tool-links` não vaza e o documento não cria rolagem horizontal.
- Fora do módulo: onboarding em tela baixa continua no M4; foco, ARIA e
  contraste geral continuam no M5; carregamento inicial e paginação continuam
  no M6.

### Qualidade
- CI: `npm ci`, análise estática (`scripts/lint.js`, sem dependência externa),
  cobertura por `NODE_V8_COVERAGE` e os três motores no Playwright.
- A catraca de cobertura está em 20% (medido: 21,8%). É piso contra regressão,
  não meta: os motores de cálculo têm cobertura alta e as telas, baixa.

### Defeito escapado e a defesa que o fecha
Na primeira leva, `daysBetweenIso` foi adicionada em `portfolio.js` e colidiu
com a de `utils.js`. O pacote concatenado é carregado como MÓDULO, onde duas
`function` homônimas no topo são SyntaxError: o app abria na tela de erro. A
suíte inteira passava, porque cada arquivo é avaliado isolado num `vm` (modo
script, onde a redeclaração é legal), e `node --check arquivo.js` também analisa
em modo script.

Duas defesas foram acrescentadas, e as duas foram verificadas reintroduzindo o
defeito de propósito:
1. `scripts/lint.js` acusa identificador de topo declarado em dois arquivos da
   lista de concatenação;
2. `tests/test-modular-build.js` copia o pacote para `.mjs` antes do
   `node --check`, forçando o mesmo modo do navegador.

## Decisões externas ainda necessárias

Dependem de informação que só o dono do aplicativo tem. Todas estão marcadas no
código com `LEGAL_PENDING`, em `LEGAL_CONTROLLER` (`js/storage.js`), e
detalhadas em `docs/LEGAL-LAUNCH.md`. Enquanto qualquer uma faltar, a tela de
Privacidade e a cláusula 12 dos termos declaram a instalação como versão local
em desenvolvimento.

| Campo | O que falta | Onde entra |
|---|---|---|
| `name` | Nome empresarial ou do responsável | LGPD art. 9, I |
| `document` | CPF ou CNPJ | CDC art. 31 |
| `address` | Endereço do controlador | CDC art. 31 |
| `supportEmail` | Canal de atendimento ao titular | LGPD art. 18 e 19 |
| `dpoName` | Encarregado pelos dados | LGPD art. 41 |
| `dpoEmail` | Contato público do encarregado | LGPD art. 41, § 1 |
| `incidentEmail` | Canal de comunicação de incidentes | LGPD art. 48 |

Além dos campos, seguem em aberto e não podem ser resolvidos por código:

1. Contrato com os operadores em uso hoje (hospedagem, banco, provedor de IA),
   com cláusula de tratamento de dados.
2. Prazo de retenção do provedor de IA sobre o conteúdo enviado. A política diz
   o que o app faz; o que o provedor faz depois é informação de contrato.
3. Processo interno de incidentes: quem detecta, quem decide, em quanto tempo
   comunica titular e ANPD, e onde fica o registro.
4. Revisão dos termos comerciais por assessoria jurídica. O texto atual foi
   escrito para uma versão gratuita e local.
5. `responseDays` está em 15 dias (art. 19, II). Só mude com orientação
   jurídica.
