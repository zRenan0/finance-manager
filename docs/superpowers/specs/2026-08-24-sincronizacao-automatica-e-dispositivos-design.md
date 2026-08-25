# Sincronização automática e gestão de dispositivos

## Status

Desenho aprovado em 24 de agosto de 2026, com a exigência adicional de que a
sincronização entre aparelhos não dependa de uma ação manual.

## Problema

O aplicativo já possui um motor incremental e uma fila local durável, mas o
caminho completo de sessão não cumpre a experiência prometida. Se a consulta
inicial da sessão falha, o cliente marca a conta como desconectada, desliga o
motor e não reavalia a sessão quando a rede volta. O botão de atualização vira
o único caminho de recuperação.

Há ainda uma janela de quatro segundos entre uma gravação local e o envio. Ao
fechar ou ocultar o aplicativo durante essa janela, os dados ficam seguros no
aparelho, porém podem não chegar ao servidor a tempo de outro aparelho baixá-los.

A gestão de dispositivos tem defeitos funcionais e visuais:

- a sincronização não envia o rótulo do aparelho e o backend o substitui por
  `Este dispositivo`;
- todos os itens usam o mesmo ícone de telefone;
- a listagem mistura acessos ativos e revogados;
- o estado ocupado pode permanecer ligado depois de uma revogação bem-sucedida;
- o aparelho revogado continua parecendo conectado até uma atualização manual;
- uma corrida entre o toque de atividade e a revogação pode limpar
  `revoked_at` e reativar a sessão sem novo login.

## Objetivo

Tudo que a pessoa salvar ou importar em um aparelho conectado deve subir sem
botão manual e aparecer automaticamente nos demais aparelhos conectados.

O cenário principal de aceite é:

1. a pessoa salva um lançamento no computador;
2. o aplicativo envia a alteração sozinho;
3. o celular, já aberto e conectado, recebe a alteração sem navegação nem botão;
4. se o celular estava fechado, ele recebe tudo ao abrir ou recarregar;
5. se estava sem rede, a fila converge depois do retorno da conexão;
6. uma revogação impede novas chamadas remotas e encerra a aparência de sessão
   ativa no aparelho afetado.

Atualização automática significa sincronizar os dados que já entram no Cofre
por cadastro, importação, recorrência ou outra função interna. Este trabalho não
adiciona integração bancária nem Open Finance.

## Critérios mensuráveis

- Depois de uma gravação confirmada, o envio deve começar em até 1 segundo.
- Com dois aparelhos online, autenticados e visíveis, uma alteração confirmada
  pelo servidor deve aparecer no outro em até 20 segundos.
- Login, recarga, retorno ao primeiro plano e volta da rede devem iniciar uma
  busca imediatamente.
- A primeira tela de uma conta em aparelho novo não pode declarar base vazia
  antes do fim da primeira busca remota.
- O botão manual não participa de nenhum cenário normal de aceite. Ele existe
  somente para uma falha apresentada na interface.
- Uma fila offline nunca é descartada ao sair, perder a sessão ou fechar o app.
- Um dispositivo revogado não pode ser reativado por uma chamada de atividade.

## Abordagem escolhida

Será mantida a arquitetura local-first atual, com IndexedDB como fonte da
interface, fila persistente e backend REST sobre Supabase. O protocolo de
operações já resolve união, exclusões e repetição; a correção ficará no ciclo de
sessão, nos gatilhos automáticos e na revogação.

Supabase Realtime não será adicionado nesta etapa. Um ciclo curto somente com o
aplicativo visível atende ao prazo de atualização sem expor a tabela de
operações diretamente ao navegador nem introduzir outra conexão permanente.

## Desenho técnico

### 1. Estado de sessão explícito

A sessão terá três resultados distintos:

- `active`: o servidor confirmou a conta;
- `guest`: o servidor confirmou que não existe sessão;
- `unknown`: rede, timeout ou indisponibilidade impediram a confirmação.

Uma falha de transporte nunca será convertida em `guest`. Se já havia conta
ativa, o escopo autenticado permanece carregado, com aviso de modo offline e
fila preservada. Se era a primeira abertura, a tela mantém o estado de
verificação até uma resposta ou até apresentar uma falha acionável.

O bootstrap terá uma única promessa em andamento. Chamadas concorrentes de
login, recarga ou atualização reutilizam essa promessa em vez de iniciar duas
trocas de escopo. Nenhuma rejeição será descartada com `catch(() => {})`.

### 2. Gatilhos automáticos

O cliente executará busca ou recuperação nestes momentos:

- sessão confirmada após login;
- inicialização e recarga da página;
- evento `online`;
- `visibilitychange` para visível;
- `pageshow`, incluindo restauração pelo cache de navegação;
- foco da janela, com deduplicação por tempo;
- ciclo de até 15 segundos enquanto a conta estiver ativa, online e visível.

Uma gravação concluída agenda o envio com debounce máximo de 1 segundo. O
debounce agrupa efeitos gerados pela mesma ação, como lançamento, conquista e
notificação, mas não deixa a pessoa esperando quatro segundos.

Ao ocultar ou fechar, o aplicativo conclui `FinanceStore.flush()` e inicia uma
tentativa curta de envio. Como o navegador pode interromper trabalho em segundo
plano, essa tentativa é melhor esforço. A garantia real continua sendo a fila
persistente, enviada no próximo gatilho automático.

Web Locks continuam impedindo dois ciclos simultâneos no mesmo navegador. Os
gatilhos passam por uma função única que ignora duplicatas quando já existe um
ciclo em andamento.

### 2.1 Identidade do escopo e concorrência

Cada instância do motor recebe o UUID explícito da conta confirmada. Toda
chamada do `CloudAdapter` envia esse valor no cabeçalho `X-Account-Id`; ele não
é reconstruído a partir do nome sanitizado do banco local. O servidor compara
o cabeçalho com a identidade da sessão antes de ler ou gravar operações. Uma
diferença responde `account_scope_changed`, sem payload financeiro.

`account_scope_changed` não é logout. O cliente invalida o motor antigo,
consulta a sessão novamente e abre o escopo da identidade agora confirmada.
Isso cobre a troca de conta em outra aba, pois cookies são compartilhados entre
abas enquanto os bancos locais não são.

Cada ciclo captura uma geração, o escopo e o adaptador com que nasceu.
`disable()` e toda troca de escopo avançam a geração. Depois de qualquer espera
de rede, o ciclo confere a geração antes de aplicar operações, confirmar a fila
ou avançar o cursor. Um ciclo antigo termina como cancelado e nunca toca no
banco que entrou depois dele.

Consultas de sessão usam uma geração própria. Login, logout e exclusão invalidam
qualquer consulta automática anterior, portanto uma resposta iniciada antes da
ação explícita não pode desfazer seu resultado. A lista de dispositivos só é
preservada em falha quando a identidade continua sendo a mesma; ao mudar o
`userId`, ela é limpa antes da nova consulta.

Ao abrir um escopo autenticado, a fila é ligada imediatamente, antes da saúde
do serviço remoto ser consultada. Falha temporária no `health` não cria uma
janela em que edições são gravadas sem operação. Sessão `unknown` e ativação do
motor têm nova tentativa automática limitada à mesma identidade e ao estado
autenticado que agendou o timer.

Se ocultar a página enquanto já existe um ciclo em andamento, o gatilho marca
uma nova volta. Quando o ciclo atual termina, a volta pendente usa a mesma
geração ou é descartada se a conta já mudou.

### 3. Primeira carga de uma conta

Entrar em uma conta seguirá esta ordem:

1. confirmar a sessão;
2. abrir o escopo local da conta;
3. manter a interface em `Buscando seus dados`;
4. baixar e persistir todas as páginas remotas;
5. concluir eventual vínculo de dados de visitante;
6. liberar o onboarding e a tela financeira;
7. iniciar o ciclo automático visível.

Uma falha temporária mantém a tela e oferece nova tentativa, mas `online`, foco
e retorno ao app já tentam novamente sem exigir o botão.

### 4. Revogação atômica

`touchDevice` será separado em dois caminhos:

- atividade comum atualiza apenas rótulo, tipo e `last_seen_at`, com filtro
  `revoked_at is null`; nunca escreve `revoked_at`;
- autenticação explícita pode cadastrar ou reativar o aparelho, limpa
  `revoked_at` e sempre rotaciona o segredo do dispositivo.

O PATCH de atividade será condicionado ao identificador, segredo e estado
ativo. Se nenhuma linha for alterada, a requisição termina como
`device_revoked` ou `device_unknown`. Assim uma chamada iniciada antes da
revogação não consegue desfazê-la depois.

A rota de revogação pedirá representação ou contagem e somente devolverá
sucesso quando alterar um aparelho ativo da própria conta. Um alvo ausente ou
já revogado receberá resposta específica.

Sondas automáticas de conta, sincronização e análise não limparão cookies ao
detectar aparelho revogado, desconhecido ou sessão inválida. Uma resposta
antiga não consegue provar que ainda pertence à geração atual da sessão e não
pode apagar os cookies emitidos por um login que terminou depois. Logout,
revogação explícita do aparelho atual e exclusão da conta continuam limpando
cookies. O motor emitirá um evento de sessão inválida; a camada de conta
desativará o estado autenticado e trocará a interface para o escopo visitante
sem apagar o banco local da conta.

Falhas do Supabase serão separadas entre credenciais terminais e
indisponibilidade. Token inválido, refresh revogado, sessão ausente ou expirada
confirmam o encerramento. Timeout, falha de transporte e HTTP 5xx preservam o
estado como desconhecido e podem ser tentados novamente sem apagar cookies.

Toda rota de sincronização, análise e ação autenticada de conta exigirá
`X-Account-Id` com UUID igual ao usuário da sessão, validado antes de consultar
configuração, revisão ou dados. Isso inclui `password`, `devices`,
`revoke-device`, `delete` e `logout` quando existe sessão. Cabeçalho ausente ou
malformado recebe `400 invalid_account_scope`; divergência recebe
`403 account_scope_changed`. Nenhum desses erros limpa cookies. Continuam sem o
cabeçalho `session`, `login`, `register`, `recover`, `resend`, `exchange` e
`verify`; logout sem sessão permanece idempotente e limpa os cookies locais.

A revogação impede novos acessos ao servidor, mas não promete apagar à distância
uma cópia que já estava armazenada no outro aparelho. Essa limitação aparecerá
na confirmação.

### 5. Identidade visual do aparelho

O cliente produzirá metadados curtos e não identificadores:

- tipo: `desktop`, `phone`, `tablet` ou `unknown`;
- rótulo: navegador e plataforma, como `Chrome no Windows` ou
  `Safari no iPhone`.

Não serão coletados IP, modelo exato, resolução, identificador publicitário ou
fingerprint. Uma migração acrescentará `device_type` à tabela de dispositivos,
com lista fechada de valores. O rótulo continua limitado a 50 caracteres.

O `CloudAdapter` enviará rótulo e tipo em todas as chamadas, não apenas nas
rotas de conta. O backend só substituirá um rótulo quando o cabeçalho válido
estiver presente; a ausência do cabeçalho preserva o valor atual.

## Interface

### Extrato de acessos

A lista será apresentada como um registro de acessos ordenado por atividade:

```text
Dispositivos com acesso                         3 ativos  Atualizar

[computador]  Chrome no Windows                 Este aparelho
              Ativo agora

[celular]     Safari no iPhone                  Revogar acesso
              Hoje, 20:55
```

Cada tipo terá ícone próprio. O item atual recebe selo `Este aparelho` e não
oferece revogação, pois a ação equivalente já é `Sair desta conta`. Outros
itens recebem `Revogar acesso`, com tratamento destrutivo contido. O sucesso
remove o item imediatamente e depois revalida a lista.

Revogados não aparecem em `Dispositivos com acesso`. O servidor mantém a linha
para bloquear o segredo antigo e permitir auditoria técnica, sem apresentá-la
como sessão ativa.

A paleta segue o Cofre:

- esmeralda `#0B6B5C` para conta e acesso ativos;
- latão `#A9791F` para atenção;
- vermelho `#BE443B` somente em revogação e exclusão;
- branco `#FFFFFF` e tinta `#0B1512` para superfície e leitura.

Space Grotesk continua nos títulos e identificações; Inter permanece no corpo
e nos horários. A assinatura da seção será a sequência vertical de atividade,
parecida com um extrato, e não uma coleção de caixas iguais.

### Estado de sincronização

O cartão mostrará uma frase principal e uma evidência temporal:

- `Dados atualizados` com horário da última volta;
- `Enviando alterações` com quantidade pendente;
- `Sem conexão` com a garantia de fila local;
- `Não foi possível atualizar` com causa e botão de nova tentativa.

`Sincronizar agora` não aparece no estado saudável. O botão `Tentar novamente`
surge somente quando existe falha.

### Exclusão de conta

A área destrutiva ficará recolhida inicialmente. A ação `Apagar conta e dados
online` abre os campos de senha e confirmação. O vermelho não contornará um
bloco grande enquanto nenhuma intenção de apagar foi demonstrada.

No celular, botões e ações terão pelo menos 44 por 44 pixels, e a ação de cada
aparelho ficará abaixo do texto quando não houver largura.

## Tratamento de falhas

- Rede ausente no boot: sessão `unknown`, escopo anterior preservado e nova
  tentativa automática ao voltar a conexão.
- Falha no upload: fila permanece no IndexedDB e o estado nunca vira atualizado.
- Falha no download: cursor não avança e a tela mantém os dados locais anteriores.
- Aba encerrada durante envio: a fila reaparece na próxima inicialização.
- Revogação durante atividade: o PATCH condicionado não altera a linha revogada.
- Revogação percebida pelo sync: a chamada é recusada, o motor para e a conta
  sai da aparência autenticada sem uma resposta antiga apagar um login novo.
- Supabase indisponível: a falha mantém código transitório, não vira sessão
  expirada e não envia `Set-Cookie` destrutivo.
- Escopo ausente ou divergente: sincronização, análise e ações autenticadas de
  conta falham antes de qualquer leitura financeira e preservam os cookies.
- Lista de dispositivos falha: os itens atuais permanecem na tela com aviso;
  uma falha de atualização não produz lista vazia falsa.

## Testes

### Unidade e integração

- sessão indisponível resulta em `unknown`, não em `guest`;
- evento `online` reavalia a sessão mesmo com o motor desligado;
- `pageshow`, foco e visibilidade disparam uma única busca deduplicada;
- gravação agenda envio em até 1 segundo;
- ciclo visível busca alterações remotas sem fila local;
- primeira carga não libera estado vazio antes do download;
- rótulo e tipo seguem em chamadas de conta e sincronização;
- chamada sem rótulo não sobrescreve o nome existente;
- revogação e atividade concorrentes não limpam `revoked_at`;
- login explícito reativa com segredo novo;
- alvo inexistente não devolve sucesso;
- lista de conectados não inclui revogados;
- sucesso da revogação encerra `busy` e remove a linha;
- sondas sem sessão e respostas `device_revoked` não enviam cookies de exclusão;
- timeout, falha de transporte e HTTP 5xx não viram `session_expired`;
- sync, análise e ações autenticadas de conta sem `X-Account-Id` ou com UUID
  divergente falham antes de ler dados;
- evento de sessão inválida volta a interface ao modo local sem apagar a cópia.
- toda chamada de sincronização envia o UUID esperado em `X-Account-Id`;
- `account_scope_changed` reconsulta a sessão e não aplica o corpo da resposta;
- ciclo invalidado por troca de escopo não aplica operações, não confirma fila e
  não avança cursor;
- resposta de sessão iniciada antes de login ou logout não altera o estado novo;
- falha no `health` mantém a fila ligada e repete a ativação automaticamente;
- ocultação durante um ciclo em andamento provoca uma volta posterior.

### Navegador com dois contextos

1. entrar com a mesma conta em A e B;
2. salvar em A e observar chegada automática em B;
3. recarregar B e confirmar primeira carga completa;
4. deixar B offline, salvar dos dois lados e reconectar;
5. confirmar convergência sem botão manual;
6. revogar B em A;
7. devolver B ao primeiro plano e confirmar encerramento da sessão remota;
8. confirmar que A segue autenticado e que B não envia novas operações;
9. entrar novamente em B com senha e confirmar novo segredo.

Os testes usarão relógio controlado para validar os prazos sem depender de
esperas reais de 15 ou 20 segundos.

### Interface e acessibilidade

- ícones distintos para computador, telefone, tablet e desconhecido;
- selo e ação correta no aparelho atual;
- alvos de toque mínimos;
- foco visível e preservado depois de atualizar ou revogar;
- tema claro e escuro sem perda de contraste;
- 320, 390, 768 e 1440 pixels sem corte ou estouro horizontal;
- movimento reduzido sem animação obrigatória.

## Publicação

1. criar e aplicar a migração de `device_type` em homologação;
2. publicar backend e cliente com `X-Account-Id` no mesmo release;
3. promover a versão do service worker e orientar a recarga de abas antigas;
4. executar o cenário com dois aparelhos na prévia;
5. rodar a verificação de deploy e então publicar em produção.

O backend aceitará por uma versão clientes que ainda não enviam tipo ou rótulo,
preservando o valor existente. `X-Account-Id`, porém, é obrigatório: clientes
em cache que ainda não o enviam param de sincronizar até recarregar. A fila
local permanece intacta, então a mudança não descarta alterações pendentes.

## Critérios finais de aceite

- O uso normal nunca exige abrir a tela de sincronização.
- Login ou recarga em outro aparelho trazem os dados automaticamente.
- Dois aparelhos abertos convergem dentro do prazo definido.
- Rede intermitente não derruba a sessão conhecida nem perde alterações.
- Revogação não pode ser desfeita por corrida ou atividade comum.
- O aparelho revogado deixa de parecer conectado e não acessa o backend.
- A lista mostra somente acessos ativos, com nomes e ícones distinguíveis.
- A suíte completa, os testes de navegador e as verificações de release passam.
