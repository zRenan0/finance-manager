# Finanças — Controle Financeiro Pessoal

App publicado como arquivos estáticos em HTML, CSS e JavaScript, sem dependências
JavaScript em produção, instalável como PWA e disponível offline depois do primeiro carregamento.

## Preparação comercial: dados externos, sincronização e publicação

Backups agora passam por saneamento estrito de identificadores, cores, ícones,
referências e tamanhos de texto. Uma chave de nota fiscal em qualquer endereço já
não basta para provocar uma consulta: o leitor aceita somente HTTPS em domínio
governamental identificado como SEFAZ ou Fazenda.

O `CloudAdapter` continua desligado e não está conectado a servidor. Seu contrato
agora exige sessão, dispositivo, revisão, idempotência e tratamento explícito de
conflito. As regras que um backend futuro precisa cumprir estão em
`docs/SYNC_PROTOCOL.md`.

O projeto possui repositório Git local, versão semântica, changelog, integração
contínua e comandos para gerar a entrada modular e verificar os 24 arquivos de teste:

```bash
npm run build
npm test
npm run verify:release
```

O processo de homologação, publicação e retorno está em `docs/RELEASE.md`. O schema
de dados está na versão 20 e o cache offline na versão 39.

## Módulo 15 — revisão das referências financeiras

As taxas rápidas da máquina de juros compostos deixaram de ser números fixos.
Poupança, 110% do CDI e IPCA mais 6% agora são calculados a partir das premissas
editáveis do aparelho, e o atalho de ações com retorno histórico sem fonte foi
removido. Enquanto essas premissas não forem revisadas pelo usuário, a interface
as identifica como exemplos iniciais, não como cotações atuais.

O simulador de FGTS passou a considerar TR mais 3% ao ano, distribuição de
resultados e o piso anual do IPCA definido em 2024. O texto do saque-aniversário
explica a retenção do saldo integral na demissão e a carência do retorno ao
saque-rescisão. FGC, custódia do Tesouro Direto e calendário do IRPF também foram
revistos. Percentuais internos de comprometimento agora aparecem como faixas de
planejamento do app, não como regras universais ou critérios de aprovação.

## Módulo 14 — dashboard progressivo e acessibilidade móvel

Uma base sem movimentações, metas ou patrimônio mostra apenas o cabeçalho, o
saldo, uma ação principal, até duas ações secundárias e uma orientação curta.
Depois do primeiro uso, cada cartão só aparece quando existem dados para ele,
sem apagar a ordem ou a preferência gravada na personalização.

O painel de saldo trocou cinco atalhos equivalentes por `Adicionar movimentação`
e duas ações escolhidas pelo estado da base. Conquistas ficaram opcionais e
desligadas inicialmente. A barra móvel passou a ter cinco destinos: Início,
Movimentações, Adicionar, Planejamento e Tudo.

O contraste de `--ink-faint` agora supera 4,5:1 nos dois temas e controles em
dispositivos de toque recebem pelo menos 44 por 44 pixels. O cache offline está
em `v32`.

```bash
node tests/test-dashboard.js                    # relevância progressiva e personalização
node tests/test-design-finance-references.js   # contraste, toque, navegação e referências
```

## Módulo 13 — dar entrada ou amortizar depois

O catálogo de simuladores ganhou a comparação que faltava para compras
financiadas: usar o dinheiro como entrada agora ou financiar o bem inteiro,
manter o valor aplicado e amortizar no futuro.

O motor compara duas propostas de taxa, Price ou SAC, seguro, tarifa, rendimento
líquido até a amortização e a escolha entre reduzir prazo ou parcela. A reserva
informada fica fora dos dois cenários. O veredito usa valor presente e iguala o
esforço mensal inicial, evitando recomendar o financiamento integral apenas
porque sua parcela maior força uma quitação mais rápida.

Além do caminho mais barato, a tela mostra juros, saldo antes e depois da
amortização, prestação, prazo, rendimento acumulado e a taxa líquida de
equilíbrio. Também avisa quando a simulação zera a reserva ou quando a prestação
sem entrada supera a sobra mensal observada no próprio aplicativo.

A amortização parcial reduz o saldo sobre o qual os juros futuros são cobrados.
O cálculo segue a orientação do Banco Central sobre liquidação antecipada e
deixa claro que aprovação de 100% do valor e custos operacionais dependem da
proposta real do banco. Cache offline atualizado posteriormente para `v32`.

```bash
node tests/test-simulators.js  # 100 asserções, incluindo 19 do novo comparador
node tests/test-render.js      # renderização e interação dos nove simuladores
```

## Módulo 12 — ações da interface fora do núcleo

O manipulador de cliques ocupava mais de mil linhas dentro de `app.js` e misturava
o ciclo de vida do aplicativo com cadastro, navegação, contas, dívidas, metas,
importação e ajustes. Ele foi movido sem reescrita para `js/actions.js`.

`app.js` continua dono do estado, renderização, persistência, roteamento e
inicialização. Seu contrato com a nova unidade é registrar
`root.addEventListener("click", onClick)`. A ordem entre telas, `actions.js` e
`app.js` está declarada no gerador da entrada ES nativa.

A extração reduziu o núcleo de 2.574 para 1.440 linhas sem alterar nenhuma ação.
O novo arquivo entrou no módulo gerado e no shell offline. Os testes Node seguem
a mesma ordem do navegador, e `tests/test-actions.js` impede que o manipulador
volte silenciosamente para o núcleo.

```bash
node tests/test-actions.js  # fronteira, ordem de carregamento e cache offline
node tests/test-render.js   # 532 asserções, incluindo ações reais de todos os módulos
```

## Módulo 11 — Início configurável, tela "Tudo" e regras de categorização

### 1. Personalização do Início (`js/layout.js`)

O dashboard chegou a vinte cartões. Vinte cartões servem bem a quem usa tudo —
dívidas, carteira, conquistas, assinaturas — e sepultam a informação de quem só
quer saber quanto sobrou este mês. A saída não foi cortar cartão: foi deixar cada
pessoa escolher quais aparecem e em que ordem.

`js/layout.js` é o registro único dos cartões do Início. `screens/dashboard.js`
monta a tela a partir dele, através de um `switch` que traduz id em função de
desenho — nenhum cartão é mais chamado direto no corpo da tela. O preço é
registrar cartão novo em dois lugares, e é justamente o ponto: um cartão fora do
registro não pode ser desligado pelo usuário.

Três decisões:

- **O cartão de saldo é fixo.** É o motivo de a pessoa abrir o app. Permitir
  escondê-lo abriria caminho para um Início que não responde à pergunta que o
  originou. `normalizeDashboardLayout` recusa o pedido inclusive quando ele vem
  do disco ou de um backup adulterado.
- **Cartão novo entra entre os vizinhos que o autor escolheu**, não no rodapé.
  Empurrar novidade para o fim da lista é a forma mais silenciosa de nunca ser
  vista.
- **Reordenação por subir/descer, não por arrastar.** Arrastar dentro de uma
  página que também rola verticalmente é ruim no celular mesmo quando bem feito.

`monthly: true` marca o que só faz sentido no mês corrente (previsão, ritmo,
pendências). Esses cartões somem sozinhos ao navegar para um mês passado, e o
painel de personalização diz isso em vez de deixar o usuário achar que quebrou.

### 2. Tela "Tudo" (`js/screens/all.js`), no lugar de Ajustes → Ferramentas

A lista de ferramentas morava num cartão de Ajustes. Quem procurava a Central de
Dívidas precisava adivinhar que ela estava em "Ajustes", e a tela de Ajustes
ficou com quinze destinos espremidos entre campos de configuração.

Os mesmos destinos ganharam tela própria (`#/tudo`), agrupada por intenção, com
busca. A busca não é enfeite: com dezoito destinos, rolar procurando um nome é
mais lento do que digitar três letras. Cada item carrega `keywords` porque o
usuário procura pelo problema, não pelo nome do recurso — quem digita "fatura"
quer Contas e cartões, quem digita "juros" quer os simuladores. Todos os termos
da busca precisam casar: buscar "conta cartão" estreita o resultado, não o
amplia.

**Mudança na barra de navegação:** "Investir" saiu e "Tudo" entrou. A barra tem
seis lugares e o app tem dezoito telas; a carteira é uma tela importante para
quem investe e invisível para quem ainda está organizando o mês, enquanto o
índice serve aos dois. Investir continua acessível dentro de "Tudo". Para
reverter, basta trocar a linha na constante `NAV` do `js/app.js` — nada mais
depende dessa lista.

Ajustes ficou com o que é configuração: perfil, reserva, renda, teto do cartão,
regra x/x/x, premissas de mercado, tema, alertas e backup. Categorias saíram de
Ajustes na mesma lógica e ganharam tela própria (`#/categorias`); o cartão que
sobrou ali só resume quantas existem, quantas têm teto e quantas estouraram.

### 3. Regras de categorização editáveis (`js/rules.js`, `js/screens/rules.js`)

O dicionário de categorização vivia como um `const` dentro de `import.js`. O
usuário via o palpite errado na tela de revisão, corrigia à mão, e no mês
seguinte corrigia de novo. Agora as regras são **dado**, não código.

O motor é puro: não toca DOM, não lê `state`, não grava nada. Recebe `data` e
devolve resultado. É o que permite testá-lo no Node sem stub de navegador e
reaproveitá-lo nos três consumidores — importador de extrato, lançamento por
texto livre e leitor de QR.

- **As regras de fábrica continuam no código**, mas ganharam id, rótulo e
  amostra de termos. O usuário não as edita: ele as **desliga** ou as
  **redireciona** para outra categoria. Guardar só a diferença (em vez de copiar
  as dez regras para dentro do backup de todo mundo) mantém o arquivo pequeno e
  permite que uma melhoria futura no dicionário chegue a quem já usa o app.
- **Regra do usuário nasce com peso 8**, acima de qualquer regra de fábrica
  (3 a 6). Quem escreveu a regra à mão sabe mais sobre o próprio extrato do que o
  dicionário genérico. Em empate de peso, a regra do usuário também vence.
- **Quatro tipos de casamento**: contém, palavra inteira, começa com e expressão
  regular. Regex é o último de propósito: é o único que o usuário consegue
  escrever errado. Um regex inválido vira mensagem na tela e regra ignorada pelo
  motor — nunca exceção.

A tela tem um **laboratório**: cola-se uma descrição igual à do extrato e vê-se
qual regra vence, por qual peso e quais outras casaram e perderam. Existe porque
regra de texto é a classe de configuração em que se erra em silêncio: a pessoa
escreve "posto ipiranga", o extrato diz "POSTO IPIRANGA LTDA 04", e sem um lugar
para testar ela só descobre no mês seguinte.

**Aplicar aos lançamentos antigos** só mexe em despesas paradas em "Outros", e
sempre com prévia antes de gravar. Recategorizar o histórico inteiro apagaria
correções feitas à mão — e quem corrigiu à mão é exatamente quem mais confia no
app.

### 4. Schema v15 → v16

Dois campos novos em settings: `dashboardLayout` (`{ order, hidden }`) e
`categoryRules` (`{ custom, builtin }`). Ambos normalizados na migração, não na
tela: um backup de outra versão, com cartão que não existe mais ou regra
apontando para categoria apagada, entra saneado.

Na mesclagem de backup, os dois se comportam de forma diferente de propósito:

- **Layout**: o do aparelho manda. Quem está mesclando está olhando para a
  própria tela agora; reorganizá-la a partir de um arquivo antigo seria a última
  coisa que ele esperaria de um botão chamado "mesclar".
- **Regras**: união das duas listas por id, com a versão local vencendo em
  conflito. Regra criada em outro aparelho é trabalho que ninguém quer refazer.
  Padrão idêntico com id diferente é deduplicado, senão a mesma linha apareceria
  duas vezes sem que o usuário soubesse qual apagar.

### 5. Bug corrigido durante a refatoração

Em `parseOfxStatement`, `amount` era declarado com `const` e reatribuído logo
depois no ajuste de sinal por `TRNTYPE`. Em modo estrito isso lança `TypeError` e
derruba a importação inteira — justamente nos extratos que informam o tipo em vez
do sinal, que são os que mais precisam do ajuste. Agora é `let`, com teste
dedicado.

### Testes do M11

```bash
node tests/test-rules.js       # 64 asserções — compilação dos padrões, aritmética de
                               # pesos, override de regra de fábrica, aplicação em massa,
                               # mesclagem de backup e as ações da tela via onClick real
node tests/test-dashboard.js   # 61 asserções — reconciliação do layout, cartão fixo,
                               # reordenação refletida no HTML, busca da tela "Tudo"
node tests/test-render.js      # 525 asserções — inclui as duas telas novas
```

As asserções que verificavam os atalhos em Ajustes foram reapontadas para
`renderAllScreen()`: a promessa é a mesma, mudou a tela que a faz. A auditoria de
`data-tab` do `test-render.js` ganhou as rotas `all` e `rules` na lista branca.

Service worker em `v26`.

## Módulo 10 — Primeiro uso e fatiamento da camada de tela

### 1. Configuração inicial em 4 passos (`js/screens/onboarding.js`)

Quem abria o app pela primeira vez caía num dashboard sem renda, sem conta e sem
regra de orçamento — ou seja, num painel de zeros com seis abas de navegação. A
configuração inicial toma a tela inteira e faz quatro perguntas: nome, renda
mensal, conta principal e regra x/x/x.

Três decisões definem o arquivo:

- **Uma única gravação, no fim.** Os campos vivem em `state.onboarding` e só
  viram dado real (`userName`, `monthlyIncome`, `accounts`, `budgetSplit`) na
  confirmação. Gravar a cada "Continuar" deixaria meia conta cadastrada em
  qualquer aba fechada no meio.
- **A regra de orçamento é o último passo.** Ela depende da renda do passo
  anterior: mostrar "50% de R$ 0,00" é pedir uma decisão no escuro. Com a renda
  já informada, cada preset exibe quanto cada grupo receberia em reais.
- **Só a renda é obrigatória.** Sem ela, regra x/x/x, score e previsão ficam sem
  referência. Nome e conta podem ficar para depois, e "Pular por agora" é um
  desfecho registrado (`skipped`), não um adiamento que reaparece a cada
  abertura.

Em Ajustes → Seu perfil há um botão que reabre os mesmos quatro passos com os
campos já preenchidos. Refazer é revisão, não digitação do zero — e concluir
duas vezes não duplica a conta principal.

### 2. Schema v14 → v15

O novo campo é `onboarding: { done, skipped, completedAt }`. O ponto delicado é
que **usuários existentes não têm esse campo no disco** e não podem ser recebidos
por uma tela de boas-vindas. `normalizeOnboarding` lê do objeto **cru** vindo do
armazenamento, nunca do mesclado com `defaultData()` — senão o `{ done: false }`
padrão apagaria a distinção entre "não configurou" e "é anterior à v15". Sem
registro, o estado é inferido de qualquer sinal de uso: lançamento, conta, meta,
renda ou nome.

Na mesclagem de backup, o lado atual vence: restaurar um arquivo antigo num
aparelho já configurado não reabre o assistente.

### 3. Fatiamento do `app.js` (`js/screens/`)

O arquivo tinha 7.537 linhas e concentrava estado, roteamento, renderização de
dezoito telas e todos os handlers. Saíram 22 fatias em `js/screens/`, uma por
tela, e o núcleo caiu para cerca de 2.350 linhas.

O corte foi por **bloco de declaração de topo** (comentário + corpo), não por
intervalo de linha: nenhuma linha original se perdeu ou trocou de ordem dentro
do seu arquivo. Os arquivos continuam testáveis separadamente, mas o navegador
os executa dentro de uma única entrada ES, sem funções do domínio no escopo global.

O que **não** foi fatiado: o `switch` de `onClick`. São 990 linhas que
compartilham variáveis locais, e transformá-lo em cadeia de dispatch é uma
refatoração de risco diferente, que merece um passo próprio.

Ficaram no `app.js`: estado, modelos de leitura, `setState`/`setData`,
roteamento, o laço de render, os handlers de evento e o `init`.

### Testes do M10

```bash
node tests/test-onboarding.js  # 89 asserções — inferência da migração, guardas de
                               # avanço, gravação única, pular, reabrir por Ajustes
node tests/test-render.js      # 522 asserções — todas as telas, agora carregadas
                               # a partir das fatias
node tests/test-router.js      # 75 asserções — endereço e pilha de camadas
```

Três varreduras de código-fonte (auditoria de `id` em `<input>` delegado, `case`
no switch de telas e lápides de exclusão) passaram a concatenar núcleo **e**
fatias. Sem isso elas passariam por vacuidade, varrendo um `app.js` que não
contém mais o que auditavam.

O teste do onboarding pegou um bug real antes da publicação: `normalizeOnboarding`
lia do objeto já mesclado com `defaultData()`, e por isso **toda base anterior à
v15 seria recebida pela tela de boas-vindas**.

## Módulo 9 — Endereço de tela, exclusão sincronizável e fechamento do endpoint

Os módulos anteriores responderam perguntas sobre o dinheiro. Este não responde
nenhuma: ele conserta três defeitos que só aparecem **fora** do ambiente de
desenvolvimento e que, juntos, impedem o app de ser vendido.

### 1. Roteamento (`js/router.js`)

`state.tab` era a única fonte da tela aberta e não existia em lugar nenhum fora
da memória. Três consequências, todas visíveis em produção:

- No Android, com o PWA instalado, o botão voltar **fechava o app** em vez de
  voltar de tela. Não havia entrada de histórico para desempilhar.
- Nenhuma tela podia ser endereçada: notificação, e-mail e atalho da tela
  inicial só sabiam abrir o dashboard.
- Recarregar a página perdia o lugar.

Quatro decisões definem o arquivo:

- **O endereço vive no hash** (`#/saude`), não no caminho. O app é servido
  estático e sem regra de reescrita no `vercel.json`; com caminho de verdade,
  qualquer link direto cairia em 404 na hospedagem. (O motivo antigo, "precisa
  abrir por `file://`", deixou de valer: `file://` nunca funcionou de fato e a
  promessa saiu do README. O hash continua sendo a escolha certa pelo primeiro
  motivo.)
- **A sincronia mora no `setState`, não no `case "nav"`.** Há onze pontos no
  `app.js` que trocam de tela por conta própria (cancelamento de formulário,
  atalho de card, exclusão que volta ao dashboard). Uma tela alcançável sem
  entrada de histórico é uma tela da qual o voltar sai do app.
- **Camada sobreposta não é endereço.** Leitor de QR, resumo do mês, seletor de
  categoria e celebração entram numa pilha dentro do `history.state`, com o
  mesmo hash. É isso que faz o voltar fechar o modal antes de trocar de tela.
- **Esc, X, clique fora e o voltar do aparelho são a mesma operação.** Todos
  passam por `history.back()`. Sem isso, fechar pelo X deixaria uma entrada
  órfã e o voltar seguinte não faria nada visível.

A profundidade dentro do app (`history.state.d`) é o que permite responder
"existe tela anterior **minha** para voltar?" sem chutar pelo `history.length`,
que conta também o que a aba visitou antes do app.

### 2. Lápides de exclusão (schema v13 → v14)

A mesclagem de backup resolvia conflito de mesmo id pelo `updatedAt` mais
recente e **nunca removia nada**. Isso funciona com um aparelho só. No dia em
que dois aparelhos sincronizarem, um registro apagado aqui volta do backup do
outro, porque a ausência de um id é indistinguível de "esse aparelho ainda não
conhece". Era bug garantido no dia de ligar a nuvem.

A lápide registra a exclusão como um **fato datado**, comparável com a edição do
outro lado. A regra é uma só:

> o registro volta a existir ⟺ ele foi **editado depois** de ter sido apagado

Apagar no celular e restaurar um backup antigo do desktop não ressuscita nada;
mas editar no desktop depois de já ter apagado no celular ganha, porque a edição
é mais recente que a exclusão. Sem `updatedAt` (registro antigo), a exclusão
vence: o silêncio de um lado não deveria derrubar um ato explícito do outro.

Um campo entra em configurações, `graveyard`, com um mapa `{ id: data }` por
coleção (lançamentos, categorias, metas, bens). Lápide corrompida é
**descartada**, não consertada com data inventada — uma data falsa decide errado
o conflito com uma edição legítima. Há poda por idade (24 meses) e por volume.
Entra no backup, no checksum e na mesclagem; backups antigos continuam válidos.

Escrever isto agora custou um campo. Depois de ligar a nuvem, custaria uma
migração com dado divergente em produção.

### 3. Fechamento da função `analyze.js`

A função guarda uma chave de API paga e estava publicada com
`Access-Control-Allow-Origin: *` por padrão e **zero limite de requisições**.
Qualquer um que descobrisse a URL gastaria o crédito do dono do site.

- `ALLOWED_ORIGIN` aceita lista separada por vírgula (produção, previews do
  publicação, `localhost`). A resposta ecoa a origem aprovada em vez de `*`.
  Sem a variável, apenas a origem do próprio host é aceita. Requisição sem
  `Origin` é sempre recusada.
- **Teto por IP** em janela deslizante de 10 minutos (`x-nf-client-connection-ip`),
  mais um teto global por instância para o caso de muitos IPs. Não é um limite
  exato — a instância é efêmera —, é o que barra o abuso trivial sem depender de
  banco externo.
- Corpo acima de 64 KB é recusado **antes** do `JSON.parse`.
- 429 com `Retry-After`.

Configuráveis por variável de ambiente: `ALLOWED_ORIGIN`, `RATE_LIMIT_PER_IP`
(padrão 20), `RATE_LIMIT_GLOBAL` (padrão 300).

### 4. Lembrete de backup (grupo novo na central de notificações)

É o único aviso da central que não fala de dinheiro, e é o mais caro de ignorar.
Todo o resto do app é reconstituível a partir dos lançamentos; os lançamentos,
não. Limpar os dados do site, trocar de celular ou reinstalar o navegador apaga
tudo, e até aqui o único socorro era o usuário ter lembrado sozinho de exportar.

Dois portões para o aviso não virar ruído: só nasce quando há histórico que valha
a pena perder (15 lançamentos, ou qualquer meta/bem cadastrado), e a chave carrega
o mês, então ele se repete no máximo uma vez por mês. **Backup velho só incomoda
se houve movimento depois dele** — quem parou de usar o app não precisa de
lembrete mensal para exportar o mesmo arquivo. Ajustes ganhou uma linha com o
estado atual: sem isso, o único jeito de saber se havia cópia era lembrar de ter
feito.

`lastBackupAt` é carimbado **depois** do download: se o navegador bloquear a
gravação, o app não deve registrar um backup que não existe. Na mesclagem vale a
data mais recente dos dois lados.

### 5. Carregamento e tema

- **Entrada ES única.** O `index.html` carrega `boot.js` antes da pintura e um
  bootstrap modular. O bootstrap importa os serviços de interface e a entrada
  gerada a partir dos arquivos de domínio e tela.
- **Tema aplicado no `<head>`, antes do CSS.** O `data-theme` só era escrito
  quando o `app.js` executava, no fim de trinta scripts: quem usa o aparelho no
  escuro tomava um flash branco. O arquivo `js/boot.js` lê uma chave própria e
  minúscula do `localStorage` (ler o espelho inteiro do banco ali custaria parse
  de megabytes no caminho crítico) e, sem escolha registrada, segue a
  preferência do sistema.
- O "usuário nunca escolheu tema" é capturado na **carga do script**, não dentro
  do `init()`: o próprio `applyTheme` grava a chave, então qualquer leitura
  posterior encontraria um valor escrito pelo app e concluiria que houve escolha.

### 6. Cabeçalhos de segurança (`vercel.json`)

`nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy`
e uma `Permissions-Policy` mais fechada. A CSP é aplicada pelo cabeçalho
`Content-Security-Policy`: scripts, eventos e estilos inline são recusados. Os
arquivos do aplicativo precisam vir da própria origem e somente as origens
necessárias para fontes e conexões são permitidas.

### Testes

```
node tests/test-router.js     # 75 asserções — gramática do endereço, pilha de camadas com
                              #                History API falso de pilha real, lápides,
                              #                mesclagem e a regra de backup
```

Os outros 13 arquivos da suíte continuam passando. Três deles tiveram apenas a
asserção de versão de schema atualizada para 14.

## Módulo 8 — Arquitetura em serviços, Event Bus e Central de Notificações

Os módulos anteriores responderam *"quanto eu tenho?"*, *"eu vou chegar lá?"*,
*"vale a pena?"*, *"por que saiu tanto?"* e *"por que eu voltaria amanhã?"*.
Este responde a única que sobrava — e é a que o app respondia mal: **"o que
mudou desde a última vez que eu abri?"**

Ele também fecha o §19 do briefing (a separação explícita entre UI, Serviços,
Lógica Financeira e Persistência, com Event Bus).

**Como chegar:** sino no cabeçalho do Dashboard · Ajustes → Ferramentas →
"Central de notificações".

### Camada de serviços (`js/services.js`)

Os seis serviços que o briefing nomeia — `FinanceService`, `BudgetService`,
`InvestmentService`, `AnalyticsService`, `InsightService`,
`NotificationService` — mais o `EventBus`, reunidos em `Services`.

Duas decisões definem o arquivo:

- **Nenhum cálculo financeiro novo mora aqui.** Os serviços são **fachadas**
  sobre os motores puros que já existiam. `FinanceService.balance(data)` *é*
  `realizedBalance(data)`; `BudgetService.status(data)` *é*
  `computeBudgetStatus(data)`. Há um teste que compara serviço e motor campo a
  campo justamente para isso: duas fontes para o mesmo número seriam duas
  verdades sobre o mesmo dinheiro — o defeito que o Módulo 3 já teve de
  corrigir no patrimônio. O que a camada entrega é vocabulário e endereço
  estável, não uma segunda implementação.
- **Fachada sem estado interno.** Todo método recebe `data` explicitamente. Um
  serviço com cópia própria do snapshot seria uma terceira verdade e mais um
  cache para invalidar à mão — o app grava de forma imutável, e é essa
  imutabilidade que o `perf.js` já usa para memoizar.

O **Event Bus** tem três detalhes que valem explicação: um handler que estoura
não impede os outros (`emit` é difusão, não cadeia — se o cartão de notificação
quebrar, o toast ainda tem de aparecer); `on()` devolve a própria função de
cancelamento, para quem assina não precisar guardar a referência; e há curinga
(`*`), porque um log de eventos em desenvolvimento não deveria exigir doze
assinaturas. Eventos publicados hoje: `data:changed`, `tab:changed`,
`notifications:created`, `notification:read`.

### Central de notificações

O app **já sabia** de tudo isto — a conta que vence, o orçamento estourado, a
assinatura reajustada. Só não sabia *avisar*: a informação existia, mas apenas
para quem abrisse a tela certa no dia certo.

Sete grupos de regra, todos lendo modelos prontos (`upcomingBills`,
`computeBudgetStatus`, `buildRecurringModel`, `buildGoalsModel`,
`buildForecast`, `emergencyFund`, `netWorthSeries` e o registro de conquistas do
Módulo 6): contas a vencer e atrasadas, orçamento estourado e em risco,
reajuste de assinatura / cobrança que parou / proposta de recorrente, meta
atrasada e meta concluída, saldo projetado negativo, reserva completa e queda
patrimonial, conquista desbloqueada.

Quatro decisões definem o comportamento:

- **Uma notificação por fato, não por render.** A identidade é a `key` —
  `conta:<id>:<data>`, `orcamento:<categoria>:<mês>:over`. Enquanto o fato for
  o mesmo, o aviso é o mesmo, ainda que a tela seja reconstruída mil vezes. Sem
  isso, cada `render()` empilharia um alerta idêntico.
- **A primeira sincronização é silenciosa.** Quem já usa o app há meses
  receberia trinta avisos não lidos no primeiro boot — um paredão que não
  informa nada. O passado entra já lido; só o que acontecer daí em diante
  acende o badge. É a mesma decisão tomada nas conquistas do Módulo 6.
- **O badge conta o não lido, nunca o total.** Um número que não zera deixa de
  ser informação e vira decoração.
- **Silenciar é por grupo e não apaga nada.** Os avisos daquele tipo param de
  nascer; o histórico, os lançamentos e todas as outras telas continuam
  idênticos. Limpar remove apenas o que já foi lido — o não lido é justamente o
  que o usuário ainda não viu.

Só o que é **acionável** vira aviso: uma conta a 20 dias não interrompe
ninguém, uma a 2 dias sim. E uma regra que estoure vira silêncio, não uma
central quebrada.

### Correção — campos de digitação da tela de investimentos

`render()` reconstrói o DOM inteiro a cada tecla e reencontrava o campo em
edição **apenas pelo `id`**. Quatro inputs não tinham `id` — "valor inicial" da
máquina do tempo, "valor do bem" e "entrada" do What‑If, e o teto de categoria
—, e são exatamente os que provocam `render()` no evento `input`. O resultado
era o defeito relatado: o campo perdia o foco na primeira tecla e, ao tocar
nele de novo, o cursor voltava para o começo — os números saíam fora de ordem.

Duas correções, porque uma só resolveria o sintoma:

1. Os quatro campos ganharam `id`.
2. `render()` ganhou plano B (`focusKeyOf` → `restoreFocus`): sem `id`, o campo
   é reencontrado pelo par `data-field` + `data-id`, que todo campo delegado já
   possui. O `setSelectionRange` também passou a ser isolado — ele lança em
   `input[type=number]`, e a exceção derrubava a restauração de foco junto.

Há teste automatizado que varre o `app.js` e falha se qualquer `<input>` com
`data-field` voltar a nascer sem âncora de foco.

### Migração de dados (schema v10 → v11)

Sem *object store* nova — o IndexedDB continua na v2. Um campo entra em
configurações, `notifications`, com `items` (histórico de avisos, cada um com
`readAt`), `muted` (grupos silenciados) e `initialized` (marca da primeira
sincronização). Aviso corrompido é **descartado**, não consertado com valores
inventados: notificação é registro do que aconteceu, e um registro em que não
se pode confiar não deveria virar badge vermelho.

Entra no backup, no checksum e na mesclagem; backups antigos continuam válidos.
Na mesclagem os avisos são **unidos por `key`** e a leitura de qualquer um dos
lados prevalece — restaurar um backup antigo não deve reacender um badge que o
usuário já resolveu.

### Testes

```
node tests/test-services.js   # 74 asserções — Event Bus, fachadas × motores, as sete
                              #                regras, identidade por key, primeira
                              #                sincronização silenciosa, migração v11 e backup
node tests/test-render.js     # 520 asserções — inclui a central, o sino, o painel de
                              #                 silêncio e a varredura anti-regressão dos
                              #                 campos sem âncora de foco
```

## Módulo 7 — Assinaturas, recorrências e inteligência financeira

Os módulos anteriores responderam *"quanto eu tenho?"*, *"eu vou chegar lá?"*,
*"vale a pena?"* e *"por que eu voltaria amanhã?"*. Este responde a pergunta que
o usuário faz olhando o extrato: **"por que saiu tanto — e o que eu faço com
isso?"**

**Como chegar:** cartão "Central inteligente" no Dashboard · cartão "Assinaturas
e recorrências" no Dashboard · Ajustes → Ferramentas → "Central inteligente" e
"Assinaturas e recorrências".

### Assinaturas 2.0 (`js/recurring.js`)

O app já tinha um detector de recorrências. Ele respondia uma pergunta binária —
*"esse gasto apareceu em dois meses diferentes?"* — e isso produzia três erros
que mudam a decisão de quem lê:

1. **Cadência ignorada.** Um seguro anual de R$ 1.200 e uma mensalidade de
   R$ 1.200 entravam iguais no "total previsto por mês". O primeiro é R$ 100/mês.
2. **Assinatura cancelada nunca saía da conta.** Quem cancelou a Netflix em março
   continuava vendo R$ 55,90 no total de dezembro.
3. **Nada separava preço fixo de valor variável.** Spotify e conta de luz
   apareciam como a mesma coisa — mas uma se cancela e a outra se negocia.

A regra do motor novo: **a recorrência é definida pelo intervalo entre as
cobranças**, não por "apareceu em dois meses". A mediana dos intervalos
classifica a cadência (semanal, quinzenal, mensal, bimestral, trimestral,
semestral, anual); a regularidade dos intervalos diz se dá para confiar; e a
forma da variação do valor separa assinatura de gasto recorrente.

Detalhes que valem explicação:

- **A distinção assinatura × recorrente variável não é a amplitude, é a forma.**
  Um reajuste de 25% na Netflix estouraria qualquer tolerância de valor e jogaria
  uma assinatura óbvia na lista de "valor variável" — justamente no mês em que
  ela mais precisa ser vista como assinatura. O que separa os dois é o desenho:
  assinatura anda em **degraus** (poucos preços distintos, cada um repetido por
  meses), conta de luz anda em **rampa** (quase todo mês um valor diferente).
- **O número grande da tela é o custo anual**, e a mensalidade virou legenda. É
  uma inversão deliberada de hierarquia: "R$ 55,90" não faz ninguém reavaliar um
  plano; "R$ 670,80 por ano" faz. O mesmo vale para o aviso de reajuste, que
  mostra quanto o aumento custa em doze meses, não os R$ 4 da cobrança.
- **Cobrança que parou sai do total.** Sem lançamento há mais de 2,6 cadências, o
  item vai para "parou de cobrar" — listado, mas fora da conta do mês. Se voltar
  a aparecer, retorna sozinho.
- **"Parar de acompanhar" não apaga nada.** Some das listas e dos totais; os
  lançamentos continuam intactos alimentando gráficos, orçamentos e comparações.
- **Parcelamento, aporte em meta e receita nunca viram assinatura.** Parcela tem
  fim; recorrência não tem.

### Detecção de gastos recorrentes (§9)

`buildRecurringProposals` faz a pergunta do briefing — *"Todo dia 10 · Internet.
Deseja cadastrar como gasto recorrente?"* — e **nada é gravado sem confirmação**.

Uma sugestão errada aceita por engano vira gasto fixo fantasma na previsão de
saldo: o app passa a projetar uma saída que não existe. Por isso quatro portões,
todos com teste próprio: o gasto ainda não pode estar marcado como recorrente;
precisa de **pelo menos três cobranças** (duas podem ser coincidência); o dia do
mês tem de se repetir (consistência ≥ 60%); e a cobrança não pode ter parado.
Recusar uma proposta a encerra — o app não volta a perguntar.

Confirmar marca `recurring: true` em todos os lançamentos do grupo, que é o que
faz o **calendário e a previsão de saldo do Módulo 4** passarem a contar com o
compromisso.

### Insights avançados (`js/analytics.js`)

Os onze indicadores do §11 num motor puro: comparação com o mês passado,
comparação anual (mesmo mês **e** acumulado do ano), categorias que cresceram e
que diminuíram, maior e menor gasto, categoria dominante, dia da semana mais
caro, horário, média diária e média semanal.

Três decisões de método:

1. **Comparação por categoria raiz.** "Delivery cresceu" e "Alimentação cresceu"
   são as duas verdadeiras, mas só uma é acionável. A agregação usa a
   categoria-mãe — a mesma herança que os orçamentos já usam, para as duas telas
   nunca discordarem.
2. **A média diária do mês corrente usa os dias já decorridos.** Dividir o gasto
   do dia 5 por 31 devolve uma média que não existe e faz o mês parecer barato
   justamente quando ainda dá para corrigir. Pelo mesmo motivo, a média por dia
   da semana divide pelas **ocorrências daquele dia** — um mês com cinco sábados
   não faz sábado parecer mais caro só por existir mais vezes.
3. **Horário é declarado como horário de registro, não de compra.** O app não
   guarda a hora da compra. Contamos apenas os lançamentos criados no **mesmo dia**
   da despesa e mostramos o tamanho da amostra; abaixo de 5 registros ou 35% de
   cobertura, a tela diz que não há base suficiente em vez de desenhar um gráfico
   bonito e falso. Sem esse recorte, um extrato importado de madrugada diria que
   a pessoa gasta de madrugada.

Sem base de comparação, o percentual devolvido é `null` — porque "cresceu 100%" e
"não havia com o que comparar" são coisas diferentes, e a tela precisa saber qual
das duas está mostrando.

### Central inteligente (`js/advisor.js`)

A "IA financeira" do §10, com as frases que o briefing pediu: *"Você gastou 22% a
mais com Restaurantes"*, *"Seu Mercado aumentou R$ 340"*, *"Você pode economizar
aproximadamente R$ 500 este mês"*, *"Seu patrimônio cresceu 4%"*, *"Você está
gastando acima da média aos finais de semana"*, *"Seu cartão está consumindo 42%
da renda"*.

Duas decisões definem o arquivo:

- **Nenhum cálculo financeiro novo.** Toda regra consulta motores que já existem
  (`buildAnalyticsModel`, `buildRecurringModel`, `detectSilentLeaks`,
  `emergencyFund`, `netWorthSeries`, `creditSpentInMonth`, `getAssistantAlerts`).
  Duas fontes para o mesmo número seriam duas verdades sobre o mesmo dinheiro — o
  defeito que o Módulo 3 já teve de corrigir no patrimônio. Este arquivo é
  tradução: número → frase acionável.
- **A "IA" não é um modelo de linguagem, e é de propósito.** Recomendação
  financeira precisa ser determinística, auditável e funcionar offline. A chamada
  opcional à LLM continua existindo (payload anonimizado, função em `/api/`) e é um
  **complemento**, exibido na mesma tela.

O *"você pode economizar R$ X"* não é "corte 30% de tudo": é o **excesso sobre o
seu próprio hábito** — o gasto do mês contra a média das últimas três ocorrências
da mesma categoria —, e categorias essenciais ficam fora da sugestão. Cortar
moradia ou saúde não é conselho que um consultor daria de um painel.

Ordem de consultor: gravidade primeiro, dinheiro em jogo no desempate, teto de 8
itens. Uma regra que estoure é isolada e vira silêncio, não uma tela quebrada. E
há reforço positivo entre os cartões — um painel que só aponta erro ensina a
evitar o painel.

### Gráficos novos (§16)

Em `js/charts.js`, três acréscimos, todos SVG/HTML puro:

- **Mapa de calor mensal** — uma célula por dia, intensidade proporcional ao dia
  mais caro do mês. Dias que ainda não chegaram ficam **vazados**: pintar zero num
  dia futuro faria o fim do mês parecer barato. Cada célula é um botão navegável
  por teclado que abre o detalhe do dia.
- **Barras comparativas** — dia da semana e faixa de horário.
- **Barras divergentes** — o que subiu para a direita, o que caiu para a esquerda,
  na mesma escala.

Como no Módulo 2 e no Módulo 5, **nenhuma cor é escolhida pelo CSS**: gravidade,
intensidade e cor de categoria chegam prontas do JS em `--tone`, `--heat` ou
`style`. Uma regra de estilo nunca decide se um número é bom ou ruim.

### Migração de dados (schema v9 → v10)

Sem *object store* nova — o IndexedDB continua na v2. Um campo entra em
configurações, `recurringPrefs`, com três mapas `{ chave: "AAAA-MM-DD" }`:

- `ignored` — o que o usuário mandou parar de acompanhar;
- `dismissed` — proposta de cadastro recusada;
- `confirmed` — proposta aceita (o efeito real vive no `recurring` dos
  lançamentos; aqui fica só a data).

Entra no backup, no checksum e na mesclagem; backups antigos continuam válidos e
são normalizados na leitura. Na mesclagem os três mapas são **unidos**, com
conflito resolvido pela data mais recente: se um aparelho já mandou parar de
acompanhar uma assinatura, restaurar um backup antigo não deve ressuscitá-la.

### Testes

```
node tests/test-recurring.js        # 63 asserções — cadência, cancelamento, degrau x rampa,
                                    #                propostas, migração v10 e backup
node tests/test-insights-engine.js  # 77 asserções — as três decisões de método, os onze
                                    #                indicadores e as frases do §10
node tests/test-render.js           # 445 asserções — inclui as três abas de assinaturas,
                                    #                 as três visões da central, o mapa de
                                    #                 calor e a auditoria de ações do onClick
```

## Módulo 5 — Investimentos e Simuladores

O Módulo 3 respondeu *"quanto eu tenho?"* e o Módulo 4, *"eu vou chegar lá?"*.
Este responde as duas que faltavam: **"isso está rendendo bem?"** (carteira) e
**"vale a pena?"** (simuladores).

**Como chegar:** aba Investir na barra inferior · cartão de Patrimônio no
Dashboard → "Carteira" · Ajustes → Ferramentas → "Carteira de investimentos" e
"Simuladores".

### Central de Investimentos (`js/portfolio.js`)

**A decisão estrutural do módulo: a carteira não tem coleção própria.** Um
investimento é um `asset` de classe `investimento` — o mesmo registro do Módulo
3. Duas coleções significariam duas verdades sobre o mesmo dinheiro, e o
patrimônio passaria a contar a carteira duas vezes. A v8 só acrescenta
**detalhe** ao registro que já existia.

Cada aplicação guarda dois números que costumam ser confundidos:

| Número | O que é | Para que serve |
|---|---|---|
| **Valor de mercado** | quanto vale hoje | é o que entra no patrimônio |
| **Total aportado** | quanto saiu do bolso | é a base da rentabilidade |

A diferença entre os dois é o lucro. Sem o custo informado, o app **não inventa
uma rentabilidade**: marca o item como "sem custo", mantém o valor no total da
carteira e mostra quantos itens estão sem o dado — porque um item sem custo
somado ingenuamente faria o "lucro" da carteira ser o valor cheio da aplicação.

Detalhes que valem explicação:

- **Proventos não entram no patrimônio.** Dividendo, JCP e aluguel de FII, quando
  caem na conta, já são lançamento de receita; somá-los de novo aqui contaria o
  mesmo dinheiro duas vezes. Eles compõem apenas o **retorno**, que é uma
  pergunta diferente de "quanto eu tenho".
- **Rentabilidade só é anualizada com 3+ meses de aplicação.** Anualizar 2% em 20
  dias devolve "43% ao ano" — um número que não significa nada e induz à decisão
  errada. Sem prazo suficiente, a tela mostra o retorno acumulado e explica por
  que não anualizou.
- **Retorno real usa a fórmula composta**, `(1+nominal)/(1+inflação)−1`, e não a
  subtração simples, que superestima o ganho.
- **A comparação com o CDI usa o mesmo prazo da carteira** — a média de
  permanência ponderada pelo valor aplicado. Comparar uma carteira de 4 meses com
  o CDI de 12 meses é uma comparação enviesada.
- **A curva de evolução vem do histórico mensal de cada item**, não do valor de
  hoje projetado para trás.
- Diagnóstico em ordem de consultor: risco estrutural primeiro (concentração,
  liquidez da reserva), depois eficiência (retorno abaixo do CDI), depois hábito
  (aporte do mês). No máximo 4 itens.

Treze tipos de aplicação em quatro classes — renda fixa (poupança, Tesouro
Selic/IPCA+/prefixado, CDB, LCI/LCA, fundo RF), renda variável (ações, FIIs, ETF,
fundos), cripto e outros — cada um com a própria regra de tributação e liquidez.

### Simuladores (`js/simulators.js`)

Nove simuladores compartilhando **um** renderizador de formulário: cada um
declara os próprios campos em `SIM_CATALOG` e só o bloco de resultado é
específico. Sem isso seriam nove formulários copiados — e nove lugares para
esquecer de corrigir um bug.

**O princípio que organiza o arquivo: um simulador honesto mostra o número
líquido.** Renda fixa sem IR, financiamento sem CET e consórcio sem taxa de
administração são propaganda, não simulação.

| Simulador | O que ele faz de diferente |
|---|---|
| **Juros compostos** | a máquina do tempo e o motor What‑If que já existiam, preservados integralmente |
| **Renda fixa** | CDI, Selic, Tesouro IPCA+, prefixado, LCI/LCA e poupança. **IR calculado lote a lote**, IOF nos primeiros 30 dias, taxa de custódia/administração composta e comparação com a poupança no mesmo prazo |
| **Empréstimo** | Price e SAC, com **CET por TIR** do fluxo real — tarifa e seguro fazem o custo subir acima da taxa da vitrine |
| **Financiamento** | parcela inicial e final, juros totais, quanto o bem fica mais caro que à vista e a renda que a parcela exigiria |
| **Entrada ou amortizar?** | duas propostas completas, reserva preservada, amortização futura, valor presente e taxa líquida de equilíbrio |
| **Cartão** | rotativo × parcelar a fatura × trocar por crédito mais barato, com o **teto legal de 100% de encargos** aplicado |
| **Consórcio** | custo efetivo por TIR e comparação direta com o financiamento equivalente — incluindo o mês estimado da contemplação |
| **FGTS** | manter no fundo × saque‑aniversário investido, com o custo que nenhuma calculadora de banco mostra: o saldo retido na demissão |
| **Aposentadoria** | acumulação **e** fase de saque; renda que consome o principal × renda perpétua; aporte que falta para a meta |

Duas decisões de método:

1. **Taxa mensal equivalente, nunca a divisão por 12.** É esse erro que faz um
   financiamento parecer 20% mais barato do que é.
2. **Aposentadoria trabalha em taxa real.** Projetar R$ 3 milhões nominais em 30
   anos é verdade e é inútil ao mesmo tempo; os números aparecem no poder de
   compra de hoje.

### Premissas de mercado (Ajustes)

O app é offline: não existe cotação em tempo real, e fingir que existe seria pior
do que não ter. Selic, CDI, IPCA e TR são **premissas editáveis com a data da
revisão**, e todo simulador mostra de onde veio a taxa que usou. A poupança não é
armazenada — é **derivada da Selic** pela regra vigente (0,5% a.m. + TR acima de
8,5%; 70% da Selic abaixo disso).

### Migração de dados (schema v7 → v8)

Sem *object store* nova — o IndexedDB continua na v2. Quatro campos entram no
`asset`, todos só para a classe investimento (em qualquer outra classe eles são
forçados a vazio/zero, para o detalhe não vazar para um carro ou um imóvel):

- `invType` — tipo da aplicação; id desconhecido cai para `outro` em vez de virar
  dado corrompido.
- `invested` — total aportado (custo).
- `dividends` — proventos acumulados.
- `startedAt` — início da aplicação; data inválida vira `""` em vez de `NaN` no
  cálculo de prazo.

E `marketRates` entra nas configurações, normalizado por faixa (taxa negativa,
não numérica ou absurda cai para o padrão). Tudo entra no backup, no checksum e
na mesclagem; backups antigos continuam válidos. Na mesclagem, as premissas do
aparelho que está restaurando prevalecem — só adotamos as do arquivo quando as
atuais nunca foram revisadas.

### Testes

```
node tests/test-portfolio.js    # 74 asserções — rentabilidade, dupla contagem, migração v8, backup
node tests/test-simulators.js   # 100 asserções — inclui entrada × amortização futura
node tests/test-render.js       # 546 asserções, incluindo o comparador de entrada e amortização
                                #                 de HTML dos nove simuladores
```

## Módulo 4 — Metas, Calendário e Previsão

O Módulo 3 respondeu *"quanto eu tenho?"*. Este responde as duas perguntas que
sobraram: **"eu vou chegar lá?"** (metas) e **"em que dia o dinheiro sai?"**
(calendário e previsão).

**Como chegar:** aba Metas na barra inferior · faixa "Previsão de saldo" no
Dashboard · cartão "Próximas contas" → "Ver no calendário" · Ajustes →
Ferramentas → "Calendário, previsão e planejamento anual".

### Metas 2.0 (`js/goals.js`)

O app já mostrava quanto estava guardado. O que faltava era projeção — e a
projeção só é honesta se três números que costumam ser confundidos ficarem
**separados**:

| Número | De onde vem | Para que serve |
|---|---|---|
| **Necessário** | quanto falta ÷ meses até o prazo | é o que a matemática exige |
| **Planejado** | `goal.monthlyPlan`, informado por você | é o seu compromisso |
| **Ritmo real** | média dos aportes efetivamente lançados | é o que está acontecendo |

A **estimativa de conclusão usa o ritmo real** sempre que ele existe; só cai para
o planejado quando ainda não há um único aporte no histórico. Um app que projeta
pelo plano diz ao usuário o que ele quer ouvir. Um que projeta pelo histórico diz
o que vai acontecer — e avisa quando a data estimada passa do prazo.

Detalhes que valem explicação:

- **A janela do ritmo ignora os meses anteriores ao primeiro aporte.** Sem esse
  recorte, quem começou a guardar mês passado teria a média dividida por seis e
  uma previsão absurdamente pessimista. Há teste automatizado só para isso.
- **Resgate entra como valor negativo no ritmo.** Guardar 1.000 e resgatar 400 é
  um ritmo de 300/mês em dois meses, não de 500.
- **O plano é confrontado com a sobra real.** A tela soma os aportes mensais de
  todas as metas ativas e compara com a média de sobra dos meses que tiveram
  movimento (meses vazios são descartados). Se não couber, o app diz quanto falta
  e sugere esticar um prazo em vez de furar o orçamento.
- **Meta concluída não consome capacidade** e vai para o fim da lista; a ordem é
  de consultor — atrasada, ritmo baixo, parada, no ritmo, sem prazo, concluída.
- **O valor guardado não é editável.** Ele só muda por aporte ou resgate, senão o
  saldo da meta passaria a discordar dos lançamentos que o alimentaram.
- Seis **modelos de meta** (reserva, viagem, carro, imóvel, notebook, estudos) que
  pré-preenchem nome, ícone e um prazo sugerido. Nada é criado sem confirmação.

### Calendário financeiro (`js/calendar.js`)

Grade mensal com o que já aconteceu e o que está previsto: lançamentos, parcelas,
gastos fixos, salário, parcelas de dívida cadastrada e prazos de meta.

**Fato e previsão nunca se misturam.** Cada evento carrega `certain`; na grade, o
dia já lançado tem barra sólida e o previsto tem barra vazada; no topo, realizado
e previsto aparecem em linhas separadas — nunca somados num número só. O prazo de
uma meta entra como **marcador**, sem valor: ele não é uma saída de caixa e não
mexe no saldo projetado.

Também mostra os três dias mais pesados do mês (é onde a régua realmente aperta) e
sinaliza o gasto fixo que já venceu e ainda não foi lançado — que, sem esse
tratamento, sumiria da tela justamente no dia em que passa a importar.

### Previsão financeira (`js/forecast.js`)

Saldo dia a dia por 365 dias, com horizontes de **7 dias, 30 dias, 3 meses e 12
meses**, o dia em que o saldo fica negativo e o menor ponto da curva.

**O problema difícil deste módulo: contar o mesmo compromisso duas vezes.** A
mesma saída pode chegar por quatro caminhos — lançamento futuro cadastrado, gasto
fixo projetado, parcela de financiamento cadastrado e média de gastos variáveis.
Somar os quatro produz uma previsão catastrófica e inútil. Quatro defesas, cada
uma com teste próprio:

1. **Gasto fixo** só é projetado no mês em que não existe lançamento equivalente
   (mesma categoria + mesma descrição) — a mesma regra do banner de gastos fixos,
   para as duas telas nunca discordarem.
2. **Parcela de dívida** só entra quando não há, no mesmo mês, um fixo ou uma
   parcela de valor equivalente (±5%). Normalmente a parcela do financiamento
   **já é** um dos dois.
3. **Média de variáveis** exclui do cálculo tudo que é recorrente, parcelado ou
   aporte em meta — justamente porque esses entram pelos outros caminhos.
4. **No mês corrente**, a média considera só o que ainda *falta* gastar, não a
   média inteira, senão o mês em curso seria cobrado duas vezes.

E a **renda** só é projetada nos meses que ainda não têm receita lançada, no dia
que é a moda do seu histórico de recebimentos.

Cada horizonte declara a própria confiança, e a tela lista as premissas do
cálculo: 7 e 30 dias saem quase todos de dados reais; 12 meses depende de médias.
Número projetado sem a premissa ao lado é chute.

### Planejamento anual

IPVA, IPTU, IRPF, seguro, material escolar, férias, Black Friday, 13º e Natal. A
lista de datas é fixa (é o calendário do país), mas o **valor estimado sai do seu
histórico**: se você pagou IPVA em janeiro do ano passado, o app mostra quanto foi
e de que ano veio o número. Sem histórico, o item aparece como lembrete, sem valor
inventado.

### Migração de dados (schema v6 → v7)

Sem *object store* nova — o IndexedDB continua na v2. Dois campos entram:

- `goal.monthlyPlan` — aporte mensal planejado. Metas antigas nascem com 0; valor
  negativo ou não numérico é zerado em vez de virar `NaN` na soma do plano.
- `asset.dueDay` — dia do vencimento da parcela (1–31, 0 = não informado), só para
  dívidas. **Sem o dia informado, a parcela não vira evento no calendário** —
  melhor não marcar dia nenhum do que marcar o dia errado.

Ambos entram no backup, no checksum e na mesclagem; backups antigos continuam
válidos e são normalizados na leitura.

### Testes

```
node tests/test-goals.js      # 51 asserções — três aportes, ritmo, ETA, capacidade, migração
node tests/test-calendar.js   # 67 asserções — grade, previsão, planejamento anual e as
                              #                quatro defesas contra contagem dupla
node tests/test-render.js     # 184 asserções — renderização, fluxo de metas e calendário
                              #                 ponta a ponta, não-regressão das 12 telas
node tests/test-health.js     # 32 asserções — motor de Saúde Financeira
node tests/test-wealth.js     # 52 asserções — patrimônio, migração, dupla contagem, backup
```

## Módulo 3 — Evolução Patrimonial

O Módulo 2 diagnosticou. Este módulo resolve a limitação que os dois anteriores
carregavam: até aqui o app só conhecia o dinheiro que passou por um lançamento.
Carro, apartamento, carteira de investimentos e financiamento simplesmente não
existiam. Agora existem — com **histórico próprio**, que é o que permite desenhar
uma evolução patrimonial real.

**Como chegar:** cartão de Patrimônio no Dashboard → "Gerenciar patrimônio", ou
Ajustes → Ferramentas → "Patrimônio (bens, dívidas e evolução)".

### O que dá para cadastrar

Contas · Carteiras e dinheiro · Investimentos · Veículos · Imóveis · Outros bens ·
Dívidas (com parcela mensal).

Cada item guarda o valor atual **e um ponto por mês no histórico**. Quando você
atualiza o valor do carro, o valor antigo não é sobrescrito — ele fica no
histórico. É por isso que a curva mostra o que cada bem valia na época, e não o
valor de hoje projetado para trás.

### O problema difícil deste módulo: contagem dupla

Um app que soma "lançamentos + bens cadastrados" ingenuamente conta o mesmo
dinheiro duas vezes. Três defesas foram implementadas:

1. **Investimentos** — assim que existe pelo menos um investimento cadastrado, a
   estimativa por lançamentos (aportes menos resgates) é **descartada**, não
   somada. O cadastro vira a fonte da verdade.
2. **Contas e carteiras** — o formulário oferece a chave *"o saldo desta conta já
   vem dos meus lançamentos"*. Marcada, a conta aparece na lista para referência
   mas fica fora da soma.
3. **Parcelas no cartão** — herdada do Módulo 2: uma parcela que vence dentro do
   mês corrente já está na fatura em formação e não é contada de novo.

Há teste automatizado para cada uma das três.

### Correção de coerência no gráfico

O histórico patrimonial ignorava o dinheiro guardado em **metas**: um aporte só
saía do caixa e não voltava em lugar nenhum, então a última barra do gráfico não
fechava com o Patrimônio exibido no topo. Corrigido — e o ponto do mês corrente
passou a usar o patrimônio de hoje, não uma projeção de fim de mês. O número do
gráfico e o número do topo agora são o mesmo número.

Na mesma passagem, a série deixou de ser `O(meses × lançamentos)`: uma única
varredura agrupa os deltas por mês e o acumulado sai de uma soma corrida.

### O que a tela mostra

Patrimônio líquido e composição (caixa · investimentos · metas · bens · dívidas) ·
evolução mensal em 6, 12 ou 24 meses · comparação anual (fechamento de cada ano
civil, variação no ano e contra 12 meses atrás) · distribuição por classe ·
listas por classe com atualização de valor e exclusão em duas etapas.

### Migração de dados (schema v5 → v6, IndexedDB v1 → v2)

A parte mais delicada. O que foi feito para que nenhuma base existente quebre:

- Nova *object store* `assets` criada dentro de `onupgradeneeded`, sempre guardada
  por `objectStoreNames.contains` — bancos antigos ganham só a coleção nova.
- Toda transação do IndexedDB passou a **filtrar** os stores que realmente
  existem. Um navegador que falhe no upgrade fica sem a coleção nova em vez de
  quebrar toda a leitura com `NotFoundError`.
- `migrate()` sanea o cadastro: item sem id, valor não numérico, classe
  inexistente e id duplicado são normalizados ou descartados.
- `updatedAt` é preservado na migração — sem isso, cada boot carimbaria uma data
  nova, o diff regravaria tudo e a mesclagem de backup passaria a resolver
  conflitos pelo boot mais recente em vez da edição real.
- Backup: `assets` entra no envelope, no checksum, na contagem da prévia e na
  mesclagem. Backups antigos (sem a coleção) continuam válidos.

### Integração com os módulos anteriores

- **Módulo 1 (Score)** — o pilar de crescimento patrimonial passa a enxergar bens
  e dívidas reais.
- **Módulo 2 (Saúde Financeira)** — o saldo devedor cadastrado entra na dívida
  total e a **parcela mensal informada entra no comprometimento da renda**.

### Testes

```
node tests/test-health.js   # 32 asserções — motor de Saúde Financeira
node tests/test-wealth.js   # 52 asserções — patrimônio, migração, dupla contagem, backup
node tests/test-render.js   # 97 asserções — renderização, fluxo de cadastro ponta a ponta,
                            #                não-regressão das 11 telas
```

O `test-render.js` dispara os eventos **pelos handlers reais** (`onClick`/`onInput`),
não pelas funções internas — é assim que se descobre uma ação sem `case` no
switch antes do usuário descobrir.

## Módulo 2 — Saúde Financeira

O Módulo 1 entregou o dashboard premium e o Score. O Score responde *"como estou?"*
com um número. Este módulo responde **"por quê?"** — uma tela dedicada de
diagnóstico com sete indicadores independentes, cada um com valor, cor, leitura em
linguagem humana e uma recomendação acionável.

**Como chegar:** cartão de Score no Dashboard → "Ver saúde financeira", ou
Ajustes → Ferramentas → "Saúde financeira (diagnóstico completo)".

### Os sete indicadores (`js/health.js`)

| Indicador | O que mede | Referência usada |
|---|---|---|
| **Liquidez** | Quantas vezes o dinheiro disponível cobre o que vence nos próximos 30 dias | caixa ≥ 2x os compromissos do mês |
| **Reserva de emergência** | Quantos meses de despesa a reserva sustenta se a renda parar hoje | 6 meses (configurável) |
| **Patrimônio** | Total acumulado e a **direção** da curva em 6 meses | curva ascendente, ≥ 6 meses de despesa |
| **Investimentos** | Quanto do patrimônio está aplicado + quanto da renda virou aporte | ≥ 40% aplicado, ≥ 10% da renda/mês |
| **Dívidas** | Quanto da renda já está comprometido com fatura e parcelas futuras | até 30% da renda (limite bancário) |
| **Fluxo de caixa** | Com que **regularidade** você fecha o mês no azul | 5 dos últimos 6 meses positivos |
| **Capacidade de poupança** | Quanto sobraria pagando só o essencial — e quanto disso você guarda de fato | essenciais ≤ 50%, poupança ≥ 20% |

### Decisões de projeto que valem explicação

- **Não existe uma segunda nota de 0 a 100.** Duas notas concorrentes sobre a mesma
  base de dados confundem mais do que informam. A tela reaproveita o Score de
  `score.js`; os indicadores são o raio-X dele, e o `ratio` de cada um serve só para
  desenhar barra e cor — nunca aparece como pontuação.
- **Indicador sem base de cálculo não vira nota ruim.** Ele é marcado como *"sem
  dados"* e sai do diagnóstico. Punir o usuário por informação que ele ainda não
  cadastrou é o defeito clássico de score caseiro.
- **Capacidade de poupança ≠ economia realizada.** A capacidade é o teto teórico
  (renda − gastos do grupo "necessidade" da regra 50/30/20 que o app já usa). A
  distância entre o teto e o que você guardou é, literalmente, o dinheiro que virou
  desejo — e a tela mostra esse número.
- **Fluxo de caixa mede regularidade, não o último mês.** Um mês bom isolado não
  diz nada; "5 dos 6 últimos meses no azul" diz. Meses sem nenhum movimento são
  descartados, para quem instalou o app ontem não carregar cinco meses de prejuízo
  fantasma.
- **Dívida sai de dado real, não de estimativa.** São as parcelas futuras já
  lançadas, a fatura do cartão em formação e o saldo negativo em conta. Uma parcela
  de crédito que vence ainda dentro do mês corrente **não é contada duas vezes** —
  há teste automatizado só para isso.
- **Plano de ação em ordem de consultor.** As recomendações são ordenadas por
  gravidade e, no empate, pela sequência que faz sentido resolver: liquidez e dívida
  antes de reserva, reserva antes de investimento. No máximo 4 itens — uma lista de
  sete prioridades não é uma lista de prioridades.

### Arquitetura

`js/health.js` é um **motor puro**: nenhuma função toca no DOM, no `state` da UI ou
no armazenamento. Recebe `(data, monthKey, ctx)` e devolve um modelo de leitura.
O `ctx` é o mesmo objeto que `metrics.js` já montou para o Dashboard — mês,
patrimônio, reserva e contas **não são recalculados**. Um indicador que lance
exceção é isolado (`try/catch` por indicador) e vira "sem dados" em vez de derrubar
a tela.

Em `js/app.js` foram acrescentadas apenas funções de renderização
(`renderHealthScreen`, `renderHealthHero`, `renderHealthIndicator`,
`renderHealthPlan`), uma rota, um campo de estado e uma ação de clique. Nenhuma
função existente foi alterada ou removida. No CSS, a seção 29 é só acréscimo — a
cor de cada cartão vem da variável local `--tone` injetada pelo JS, então nenhuma
regra de estilo decide se um número é bom ou ruim.

### Testes

```
node tests/test-health.js   # 32 asserções do motor (cenários financeiros reais)
node tests/test-render.js   # renderização + não-regressão de todas as telas
```

O segundo carrega o `app.js` inteiro num contexto de VM com um DOM mínimo, renderiza
todas as telas e audita o HTML resultante (tags balanceadas, ausência de `undefined`,
`NaN`, `[object Object]` e de `data-tab` apontando para rota inexistente).

## Novidades desta revisão (auditoria + 5 recursos)

Esta versão passou por uma auditoria de matemática financeira, resiliência de
dados e performance, e ganhou cinco recursos novos. Resumo do que mudou:

| Área | O que mudou |
|---|---|
| Matemática | Todo cálculo de dinheiro passou a ser feito em **centavos inteiros** (`js/utils.js`). Nada mais de `0.1 + 0.2 = 0.30000000000000004` na sua fatura. |
| Dados | **Espelho síncrono** no `localStorage` + snapshot de **desfazer**: uma escrita não confirmada não se perde mais ao fechar o app. |
| Performance | Gravação com diff O(1) por referência e índices memoizados: sem varrer todos os lançamentos a cada tela. |
| Recurso 1 | **QR Code Pix** — lê o BR Code (padrão EMV® MPM), valida o CRC e pré-preenche valor e recebedor. |
| Recurso 2 | **Backup** — exportar/importar o banco local em JSON verificável, além de CSV de lançamentos e de orçamentos. |
| Recurso 3 | **Orçamentos por categoria** — teto mensal com alertas visuais em 80% e 100%. |
| Recurso 4 | **Lançamento inteligente** — escreva "Gastei 30 no ifood" e o app monta o lançamento. |
| Recurso 5 | **Layout do celular** — grades fluidas, nada mais de blocos espremidos. |

### 1. QR Code Pix (`js/qrcode.js`)

O leitor deixou de ser só de nota fiscal. Agora ele **classifica** o que a câmera
viu antes de decidir o que fazer:

- **Pix (BR Code / EMV MPM)** — o payload é decodificado campo a campo (TLV
  recursivo, inclusive dentro dos templates 26–51 e 62). São extraídos o **valor**
  (campo 54), o **recebedor** (campo 59), a cidade, a chave Pix e o txid.
- **Verificação de integridade (CRC-16/CCITT-FALSE)** — o app recalcula o CRC do
  payload e compara com o que veio no código. QR adulterado ou lido pela metade é
  sinalizado na tela em vez de virar um lançamento errado.
- **Nome do recebedor limpo** — `MERCADO SAO JOAO LTDA` vira `Mercado Sao Joao`.
- **Categoria sugerida** — primeiro pelo seu histórico (se você já classificou
  "Mercado São João" antes, ele repete), depois pelo dicionário de palavras‑chave.
- Nota fiscal (NFC-e) continua funcionando, agora com leitura da chave de 44
  dígitos e do valor (`vNF`) direto da URL, sem depender do portal do estado.

Da leitura você escolhe: **"Abrir no formulário"** (para ajustar antes) ou
**"Salvar gasto"** (um toque).

### 2. Backup — exportar e importar (`js/storage.js`)

Em **Ajustes → Backup e restauração**:

- **Exportar JSON** — gera um *envelope* versionado com `kind`, `schema`,
  `exportedAt`, contagens e **checksum** (FNV-1a sobre uma serialização canônica,
  de chaves ordenadas). Não é um despejo cru: dá para detectar arquivo corrompido
  **antes** de mexer nos seus dados.
- **Exportar CSV** — lançamentos (com BOM UTF-8, para o Excel em português abrir
  com acentos certos) e orçamentos do mês.
- **Importar** — o arquivo é lido e mostrado numa **prévia** ("você tem 340
  lançamentos, o arquivo tem 355, ficará com 361") antes de qualquer gravação.
  Você escolhe o modo:
  - **Mesclar** (padrão) — junta sem duplicar. Registros com o mesmo conteúdo
    (data + tipo + valor + categoria + descrição) são reconhecidos como o mesmo
    lançamento **mesmo com ids diferentes**, o que resolve o caso do backup feito
    em outro aparelho. Conflitos de mesmo id são resolvidos pelo `updatedAt` mais
    recente.
  - **Substituir** — troca tudo. Antes disso o app guarda um snapshot e oferece
    **Desfazer**.
- Backups antigos (formato de snapshot cru, sem envelope) continuam sendo aceitos.

### 3. Orçamentos por categoria (`js/budgets.js`)

- Cada categoria pode ter um **teto mensal** (Ajustes → Categorias, ou o card
  "Orçamentos" no Dashboard).
- **Alertas em 80% e 100%** — os dois limiares são configuráveis em Ajustes.
- **Herança**: o gasto de uma subcategoria conta no teto da categoria‑mãe. Um gasto
  em "Delivery" consome o teto de "Alimentação".
- **Projeção de ritmo**: mesmo dentro do limite, o app avisa quando o ritmo atual
  levaria a estourar antes do fim do mês, e mostra quanto ainda cabe **por dia**.
- **Aviso antes de salvar**: ao preencher um gasto, o formulário mostra uma barra
  com o antes/depois do teto. Você vê que vai estourar **antes** de confirmar.
- Depois de salvar, um aviso aparece só quando o lançamento **mudou de faixa**
  (entrou em 80% ou estourou) — não a cada gasto.
- **Sugestão de teto** com base na média dos 3 meses anteriores.

### 4. Lançamento inteligente (`js/nlp.js`)

Um campo no Dashboard onde você escreve em português comum:

| Você escreve | O app entende |
|---|---|
| `Gastei 30 no ifood` | R$ 30,00 · Delivery · hoje |
| `Paguei 120 de mercado ontem no débito` | R$ 120,00 · Mercado · ontem · Débito |
| `Comprei um tênis 450 em 3x no crédito` | R$ 450,00 · 3 parcelas de R$ 150,00 · Crédito |
| `gastei trinta e cinco reais na padaria` | R$ 35,00 · Alimentação (número por extenso) |
| `Recebi 2500 de salário` | Receita de R$ 2.500,00 |
| `netflix 55,90 todo mês` | R$ 55,90 · Assinaturas · recorrente |
| `mercado 120; uber 18` | dois lançamentos de uma vez |

O reconhecimento é **determinístico e offline** — camadas de regras em ordem fixa
(parcelas → data → valor → forma de pagamento → descrição/categoria). A IA **não é
necessária**; ela existe só como um botão opcional ("Refinar com IA") para frases
que as regras não deram conta. A categoria vem, em ordem de prioridade, do **seu
histórico**, dos **nomes das suas categorias** e por último do dicionário genérico.

Nada é gravado sem você confirmar: cada frase vira um **rascunho** revisável, com o
nível de confiança da categoria e o aviso de estouro de teto, se houver.

### 5. Layout no celular

O ponto de partida do problema era grade de coluna fixa (`repeat(4, 1fr)`,
`repeat(6, 1fr)`) e largura fixa em pixels dentro de telas de 360px. A correção:

- Grades fluidas com `repeat(auto-fit, minmax(...))` — o número de colunas passa a
  ser consequência do espaço, não uma decisão fixa.
- `minmax(0, 1fr)` no lugar de `1fr` e `min-width: 0` no reset: sem isso, um valor
  monetário longo empurra a coluna e estoura o grid.
- Tipografia fluida com `clamp()` — o saldo do topo diminui em vez de vazar.
- Padding proporcional à largura da tela.
- Ponto de quebra em **520px** (antes era 380px, o que deixava a maior parte dos
  celulares no layout de desktop).
- `100dvh` no lugar de `100vh`, para a barra do navegador não cortar o rodapé.
- Linha de edição de categoria virou grade com áreas nomeadas: no celular o campo
  de teto desce para a segunda linha em vez de espremer o nome.
- Modais viram folhas na base da tela, com rolagem própria e respeito à área
  segura do aparelho.
- Zoom de pinça reativado (`maximum-scale=1` removido do viewport).

## Recursos anteriores

Todos os recursos abaixo rodam **inteiramente no navegador** — nenhum dado do seu
extrato, foto de nota ou lançamento é enviado para servidor algum.

1. **Importador de extratos (OFX/CSV)** — em Ajustes → Ferramentas → "Importar
   extrato", ou arrastando o arquivo direto na tela. Lê o formato OFX (padrão de
   bancos) e CSV (com `;` ou `,`), detecta datas em `DD/MM/AAAA` ou `AAAA-MM-DD`,
   sugere a categoria de cada gasto automaticamente e já marca prováveis duplicatas
   (mesma data ± 3 dias, mesmo valor) para você revisar antes de importar.
2. **Leitor de QR Code de nota fiscal** — botão "Ler QR da nota" no topo do
   Dashboard ou em Ajustes. Usa a API nativa `BarcodeDetector` do navegador para ler
   o QR do cupom (NFC-e) pela câmera, sem enviar nenhuma imagem para fora do
   aparelho. Quando o portal da nota permite, o valor e o estabelecimento vêm
   preenchidos automaticamente; caso o site do estado bloqueie o acesso (comum por
   política de CORS), você confirma os dados manualmente em 2 toques.
   *Funciona em navegadores com suporte a `BarcodeDetector` (Chrome/Edge no Android,
   por exemplo). Onde não há suporte, o app avisa e sugere lançar manualmente.*
3. **Gestor de assinaturas e recorrências** — identifica sozinho gastos que se
   repetem mês a mês (mesma descrição/categoria), mostra o total previsto por mês,
   prevê a data da próxima cobrança e alerta quando o valor sobe em relação à
   cobrança anterior.
4. **Simulador "E se...?"** — antes de gastar, veja o impacto no seu orçamento
   diário do resto do mês e o possível atraso em uma meta específica.
5. **Detector de vazamentos silenciosos** — agrupa gastos pequenos e recorrentes
   (cafés, apps de entrega, lanches) e mostra quanto isso já somou no mês.
6. **Saldo livre vs. saldo reservado** — o card principal do Dashboard agora separa
   o dinheiro já alocado em metas do saldo realmente livre para gastar.
7. **Projeção de fluxo de caixa** — na aba Análises, um gráfico projeta (por
   regressão linear simples) como seu saldo deve se comportar até o fim do mês, com
   base no ritmo de gastos atual.
8. **Resumo mensal "Wrapped"** — na aba Análises, gera um cartão visual (via Canvas)
   com o resumo do mês, pronto para salvar ou compartilhar pelo compartilhamento
   nativo do celular (Web Share API).

## Módulos

```
index.html
├── js/utils.js         núcleo de dinheiro em centavos, datas, formatação
├── js/router.js        [M9] endereço da tela e pilha de camadas (puro, sem DOM)
├── js/icons.js         biblioteca de ícones SVG
├── js/storage.js       FinanceStore (adapters, espelho, backup, regras de negócio)
│                       + [M3] modelo de bens/dívidas e agregações de patrimônio
├── js/budgets.js       [NOVO] motor de orçamentos (puro, sem DOM)
├── js/charts.js        gráficos em SVG
├── js/import.js        importação de extratos OFX/CSV
├── js/nlp.js           [NOVO] interpretação de frases em português
├── js/score.js         [M1] motor do Score financeiro (puro, sem DOM)
├── js/metrics.js       [M1] modelo de leitura do dashboard (puro, sem DOM)
├── js/health.js        [M2] motor da Saúde Financeira (puro, sem DOM)
├── js/wealth.js        [M3] motor da Evolução Patrimonial (puro, sem DOM)
├── js/goals.js         [M4] motor das Metas financeiras (puro, sem DOM)
├── js/forecast.js      [M4] motor da Previsão de saldo (puro, sem DOM)
├── js/calendar.js      [M4] motor do Calendário e do planejamento anual (puro)
├── js/recurring.js     [M7] motor de assinaturas e recorrências (puro, sem DOM)
├── js/analytics.js     [M7] motor de insights avançados (puro, sem DOM)
├── js/advisor.js       [M7] central inteligente / IA financeira (puro, sem DOM)
├── js/services.js      [M8] Event Bus + camada de serviços + notificações (puro)
├── js/insights.js      simulações, projeções, detecção de vazamentos
├── js/assistant.js     alertas do assistente
├── js/investments.js   carteira e juros compostos
├── js/portfolio.js     [M5] motor da Central de Investimentos (puro, sem DOM)
├── js/simulators.js    [M5] motores dos simuladores financeiros (puros, sem DOM)
├── js/qrcode.js        leitura de QR (Pix BR Code + NFC-e)
├── js/wrapped.js       cartão de resumo mensal
├── js/screens/         [M10] uma fatia por tela (só HTML, nenhum cálculo)
│   ├── _shared.js        peças usadas por mais de uma tela
│   ├── onboarding.js     [NOVO] configuração inicial em 4 passos
│   ├── dashboard.js      tela inicial e seus cartões
│   ├── accounts.js       contas, cartões e conciliação
│   ├── debts.js          central de dívidas
│   ├── add.js            lançamento, avisos de orçamento e entrada por frase
│   ├── analytics.js      extrato, projeções e o cartão de análise por IA
│   ├── goals.js          metas financeiras
│   ├── calendar.js       calendário do mês e previsão
│   ├── health.js         saúde financeira
│   ├── wealth.js         patrimônio
│   ├── portfolio.js      carteira de investimentos
│   ├── invest.js         juros compostos e What-If
│   ├── simulators.js     catálogo de simuladores
│   ├── simulate.js       simulador de decisão pontual
│   ├── insights.js       conselheiro e padrões de gasto
│   ├── subscriptions.js  assinaturas e recorrências
│   ├── notifications.js  central de notificações
│   ├── achievements.js   nível, XP e conquistas
│   ├── import.js         importação de extrato
│   ├── settings.js       ajustes, tetos e backup
│   └── modals.js         seletor de subcategoria, QR e resumo do mês
├── js/actions.js       [M12] ações delegadas de clique
└── js/app.js           [M10] núcleo: estado, modelos, roteamento, campos, init
```

A ordem das fontes está declarada em `scripts/build-app-module.js`, não no HTML.
Motores e persistência entram primeiro, seguidos pelas telas, `actions.js` e
`app.js`. `npm run build` reúne essas fontes em `js/modules/app.generated.js`.
`npm run check:build` compara o artefato com as fontes e recusa uma publicação
desatualizada.

O navegador carrega apenas `boot.js` e `js/modules/bootstrap.js`. O primeiro
aplica o tema antes da pintura. O segundo cria a fachada `CofreUI`, inicia o
serviço de estilos calculados e importa o aplicativo gerado. Os arquivos de
origem continuam sendo usados diretamente pelos testes unitários.

## Arquitetura Local-First (nesta versão)

O app foi reescrito por dentro para ser um **PWA Local-First** — a interface
continua exatamente a mesma, mas a lógica interna mudou:

```
UI (app.js)  →  FinanceStore (façade + cache em memória + fila de escrita)
                     │
                     ▼
             StorageAdapter (contrato)
                     │
        ┌────────────┼──────────────┐
   IndexedDB    localStorage      Cloud
   (principal)   (fallback)    (pronto p/ o futuro)
```

**1. Storage (`js/storage.js`) — padrão Adapter sobre IndexedDB**

- Cada coleção (`transactions`, `categories`, `goals`, `settings`) é um *object
  store* próprio, com índices por mês, data, categoria, tipo e meta. Consultas não
  precisam varrer o array inteiro.
- A UI lê um **snapshot síncrono em memória** (zero latência ao renderizar) e as
  gravações acontecem em background, **em diff**: só os registros que realmente
  mudaram são escritos, numa fila serializada com coalescência de ~80 ms.
- Migração automática: quem já usava a versão antiga tem os dados do
  `localStorage` transferidos para o IndexedDB na primeira abertura (com backup da
  chave antiga preservado por segurança).
- Degradação graciosa: sem IndexedDB, cai para `LocalStorageAdapter`; sem nenhum
  dos dois, o app roda em memória e avisa o usuário.
- `flush()` é disparado em `visibilitychange`/`pagehide`, então nada se perde ao
  minimizar o app no celular.

**Trocar para nuvem no futuro:** `CloudAdapter` já está implementado no mesmo
arquivo, seguindo o mesmo contrato de 5 métodos. Basta ter um backend REST com as
rotas `/health`, `/snapshot` (GET/PUT/DELETE) e `/changes` (POST) e chamar, no boot:

```js
FinanceStore.use(new CloudAdapter({ baseUrl: "/api", token: seuToken }));
```

Nenhuma linha de UI precisa mudar.

**2. Importação offline (`js/import.js`)**

- Parsers próprios para **OFX** (SGML dos bancos, incluindo `TRNTYPE` sem sinal) e
  **CSV** (separador `;`, `,` ou tab detectado automaticamente; datas `DD/MM/AAAA`,
  `AAAA-MM-DD`; valores `1.234,56`, `1,234.56`, `(123,45)`, `-R$ 12,00`).
- Detecção de codificação: tenta UTF-8 e refaz em `windows-1252` quando o extrato
  vem em Latin-1 (comum nos bancos brasileiros) — acentos não quebram mais.
- **Categorização automática por Regex com peso**: ~60 padrões de comerciantes
  brasileiros divididos por categoria. A regra de maior peso vence, então "NETFLIX"
  cai em Assinaturas e não em Lazer. Cada linha carrega a confiança da sugestão.
- Erros tipados (`ImportError`) com mensagem pronta para a tela: arquivo vazio,
  formato desconhecido, arquivo grande demais, nenhuma transação válida.
- Tudo no navegador: o arquivo nunca sai do aparelho.

**3. Integração analítica (`netlify/functions/analyze.js` + `js/insights.js`)**

- `js/insights.js` compila um JSON **anonimizado** a partir do IndexedDB: só
  agregados numéricos e nomes de categoria. Descrições de lançamento, datas
  individuais, estabelecimentos, ids e chaves de nota **nunca** saem do aparelho.
- `analyze.js` é um proxy seguro: a chave da API vive só na variável de ambiente da
  publicação. Ele ainda aplica uma faxina defensiva no payload (descarta qualquer campo
  fora do schema, trunca strings, limita listas) antes de falar com a LLM.
- A resposta é **estruturada e validada**: diagnóstico, score 0–100, situação do
  fluxo de caixa, riscos (com nível) e recomendações acionáveis. Se a LLM não
  devolver JSON válido, o app cai para o texto corrido em vez de quebrar.
- Timeouts, rate limit, chave ausente e offline viram mensagens específicas na tela.

**4. Motor What-If (`js/charts.js` + `js/app.js`)**

Na aba **Investir**, abaixo da máquina do tempo, o card "Motor What-If" projeta duas
linhas paralelas no mesmo gráfico — o cenário real e o simulado:

- **Guardar mais por mês** — juros compostos mês a mês sobre saldo atual + sobra
  média + aporte extra; mostra quanto veio do bolso e quanto veio dos juros.
- **Financiar uma compra** — parcela pela **Tabela Price**, custo total dos juros,
  percentual acima do valor à vista e quanto a parcela compromete da sobra mensal.
- O ponto de partida (saldo de hoje e sobra média dos últimos meses) sai do próprio
  IndexedDB. O app alerta quando o cenário simulado é inviável ou joga o saldo no
  vermelho.

## Hospedar na Vercel

1. Crie uma conta em https://vercel.com e importe o repositório
2. O `vercel.json` já traz o que a publicação precisa: comando de build
   (`npm run build:dist`), pasta publicada (`dist`), as reescritas de entrada
   e os cabeçalhos de segurança. Não é preciso configurar nada na tela de import.
3. As três funções de `api/` sobem sozinhas; elas são a casca de
   `netlify/functions/`, que continua sendo o backend (ver `api/_adaptar.js`)
4. Pronto: você recebe uma URL tipo `https://seu-projeto.vercel.app`
5. (Opcional) Conecte um domínio próprio em Settings → Domains

> A leitura de QR Code precisa de câmera, que só funciona em conexões HTTPS (ou
> `localhost`). A Vercel entrega tudo em HTTPS por padrão.

### O que confirmar no primeiro deploy

A Vercel consulta o sistema de arquivos ANTES das reescritas, então a entrada
do domínio depende de o aplicativo ser publicado como `app.html` e de as duas
reescritas do `vercel.json` valerem. Abra a URL da publicação e confira:

- `/` mostra a **página comercial**
- `/index.html` mostra o **aplicativo** (e o endereço continua sendo
  `/index.html` na barra: é reescrita, não desvio)
- em qualquer resposta, o cabeçalho `Content-Security-Policy` está presente

Se `/` abrir no aplicativo, alguma coisa devolveu um `index.html` na raiz da
publicação; `npm run build:dist` falha de propósito nesse caso, então o
problema estaria na configuração da Vercel, não no build.

## Módulo 6 — Gamificação, animações e otimizações finais

Os módulos anteriores responderam "quanto eu tenho?", "eu vou chegar lá?" e "vale
a pena?". Este responde a única que sobrou, e é a mais difícil: **"por que eu
voltaria amanhã?"**

**Como chegar:** cartão "Seu nível" no Dashboard · Ajustes → Ferramentas →
"Conquistas e nível".

### Motor de conquistas (`js/achievements.js`)

Arquivo puro, no mesmo contrato de `score.js` e `health.js`: recebe o snapshot,
devolve um modelo de leitura, não toca no DOM. **32 conquistas** em sete grupos
(Primeiros passos, Hábito, Economia, Metas, Proteção, Patrimônio, Disciplina),
quatro tiers e **8 níveis** — de *Iniciante* a *Mestre das Finanças*.

Nenhum cálculo financeiro novo foi escrito: as regras consultam
`monthTotals`, `emergencyFund`, `netWorthSeries`, `computeBudgetStatus` e
`upcomingBills`, os mesmos motores que alimentam o Score e a Saúde Financeira.
Duas fontes para o mesmo número seriam duas verdades sobre o mesmo dinheiro.

Quatro decisões que definem o módulo:

- **Nada de medalha por usar o app.** Toda conquista premia um fato financeiro
  real — guardar, quitar, investir, cumprir orçamento — ou o hábito de registrar,
  que é o que faz todo o resto funcionar. Gamificação que premia cliques treina o
  usuário a clicar, não a poupar.
- **Conquista desbloqueada não volta a trancar.** A regra é avaliada sobre o dado
  de hoje, mas o desbloqueio fica gravado com data. Se a sequência de seis meses
  quebrar, a medalha continua sua: ela registra algo que *aconteceu*. Tirar um
  troféu por causa de uma recaída é o oposto de reforço positivo.
- **O trancado mostra progresso, não um cadeado mudo.** Cada conquista devolve
  `current`/`target` na mesma unidade, então a tela diz "faltam R$ 320" em vez de
  esconder o objetivo. É a diferença entre um placar e um guia.
- **A barra de XP anda dentro do nível, não sobre o total.** Uma barra medida
  contra os 2.025 XP do catálogo fica travada perto de zero por meses e
  desmotiva; medida dentro da faixa atual, ela sempre tem para onde ir.

Um detalhe que só aparece em produção: **a primeira sincronização é silenciosa.**
Quem já usa o app há meses desbloquearia vinte medalhas no primeiro boot — um
paredão de celebrações que não celebra nada. O passado é registrado sem alarde e
a comemoração fica reservada ao que for conquistado dali em diante.

E o portão que evita a conquista fantasma: um mês **sem lançamento nenhum** não
conta como "mês economizando", mesmo que a renda fixa cadastrada faça a conta
fechar positiva no papel. Sem isso, o app daria dois anos de sequência a quem
nunca o abriu.

### Performance (`js/perf.js`)

`render()` reconstrói a tela inteira a cada evento — barato para o DOM (é uma
string), caro para os **modelos**: `buildDashboardModel`, `buildHealthModel`,
`buildGoalsModel`, `buildPortfolioModel` e o novo `buildAchievementsModel`
varrem transações, metas e ativos várias vezes cada. Num render de dashboard os
mesmos números eram recalculados de 3 a 8 vezes.

A chave da solução já estava no projeto: o app grava de forma **imutável**
(`setData((d) => ({ ...d, ... }))`). Logo "mesmo objeto `data`" equivale a "nada
mudou", e um `WeakMap` com a identidade do snapshot como chave invalida o cache
sozinho — sem invalidação manual e sem vazamento (o cache morre junto com o
snapshot antigo). É a mesma técnica que `dataIndex` já usava para os índices,
promovida a camada de modelo.

A verificação de conquistas — que reavalia metas, reserva, orçamentos e
patrimônio — roda em `idleTask` (`requestIdleCallback`, com queda para
`setTimeout` no Safari), fora do caminho crítico do quadro.

### Movimento e carregamento

- **Esqueleto no lugar do spinner.** O primeiro paint desenha uma silhueta com a
  *mesma geometria* do dashboard, então o conteúdo preenche o contorno em vez de
  empurrá-lo — nenhum salto de layout no boot.
- **Celebração sem confete.** Partículas custam quadros e não sobrevivem a
  `prefers-reduced-motion`. O overlay usa raios em cone girando devagar e um
  *pop* na medalha; com movimento reduzido, os raios simplesmente somem.
- Qualquer clique fecha a celebração. Comemoração que precisa ser fechada com
  precisão vira interrupção.

### Acessibilidade

- **Link "pular para o conteúdo"**, invisível até a primeira Tab.
- O toast agora é decorativo (`aria-hidden`); a mensagem real vive numa região
  `role="status" aria-live="polite"` — antes, leitor de tela nenhum a anunciava.
- `<main>` e `<nav>` como landmarks, `aria-label` na navegação e
  `aria-current="page"` na aba ativa.
- **Esc fecha os modais** na ordem em que foram empilhados (celebração →
  seletor de categoria → QR → resumo do mês). Antes, só o clique fora fechava —
  inalcançável por teclado.
- Anel de foco branco sobre as superfícies escuras (painel esmeralda, navegação
  inferior), onde o anel esmeralda desaparecia.
- Estado de medalha não depende só de cor: trancada é dessaturada **e** tem o
  contorno tracejado; conquistada ganha selo de check.
- Alvos de toque com mínimo de 44px em ponteiro grosso.

### Testes

`node tests/test-achievements.js` — 70 verificações: forma do catálogo,
contagem de sequência (incluindo o mês corrente ainda em aberto), natureza
*sticky* do desbloqueio, progresso do trancado, níveis, pureza de
`withUnlockedAchievements`, migração v8→v9 com dado corrompido e a memoização
por identidade do snapshot.

`node tests/test-render.js` cresceu para 312 verificações, com um bloco novo
para a tela de conquistas, o esqueleto e os landmarks de acessibilidade.

## Ativar os Insights com IA (opcional)

1. Crie uma chave de API em https://console.anthropic.com (Settings → API Keys)
2. No painel da Vercel: Settings → Environment Variables → Add
   - Key: `ANTHROPIC_API_KEY`
   - Value: sua chave (começa com `sk-ant-...`)
   - Opcional para produção e previews: `ALLOWED_ORIGIN` com as origens permitidas separadas por vírgula
3. Vá em "Deployments" → o deploy mais recente → "Redeploy" para aplicar a variável
4. Pronto — o botão "Analisar meus gastos" na tela de Análises vai funcionar

Isso usa a API paga da Anthropic (cobrança por uso, não é o Claude.ai). Sem a chave configurada,
o app continua funcionando normalmente — só o botão de IA mostra uma mensagem explicando que
precisa ser configurado.

## Rodar localmente antes de hospedar

```bash
npm start
```

Abre em `http://127.0.0.1:4173`. Não precisa de `npm install`: o servidor usa
apenas o `http` do Node.

**Abrir o `index.html` com duplo clique não funciona**, e o README prometia isso
até esta versão. Em `file://` o navegador bloqueia módulos ES (o app não chega a
iniciar), não registra o service worker, trata o IndexedDB como origem opaca (os
dados somem entre aberturas) e não tem `/api/*`. A promessa custava suporte e
não tinha como ser cumprida.

Para ver o pacote publicado exatamente como ele vai para o ar:

```bash
npm run start:dist
```

Conta e sincronização exigem as funções serverless (`vercel dev`). A leitura de
QR Code exige `https://` ou `http://localhost`, porque a câmera só é liberada em
origem segura.

## Onde ficam os dados

Tudo fica no **IndexedDB do seu navegador**, no seu próprio aparelho (com
`localStorage` como fallback em navegadores antigos). Nada é enviado para servidor
algum — nem os extratos importados, nem as fotos/QR codes lidos pela câmera.

A única exceção, se você optar por usar os Insights com IA, é um **resumo agregado e
anônimo** (renda, totais por grupo, gastos por nome de categoria, progresso das
metas e o histórico de 6 meses). Descrições de lançamentos, datas individuais,
estabelecimentos e identificadores nunca saem do aparelho. O aplicativo mostra
uma confirmação com essa lista antes de cada envio.

Use "Ajustes → Exportar backup (JSON)" regularmente. Ao restaurar um backup, o banco
é **substituído por inteiro** — nenhum registro antigo sobrevive ao restore.
