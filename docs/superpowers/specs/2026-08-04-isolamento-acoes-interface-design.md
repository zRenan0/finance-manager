# Isolamento das ações da interface

## Objetivo

Retirar do núcleo do aplicativo o manipulador de cliques que concentra mais de mil linhas, sem alterar telas, cálculos, dados persistidos ou comportamento visível. O resultado deve deixar `app.js` responsável por estado, renderização, ciclo de vida e ligação dos eventos, enquanto uma unidade própria traduz ações da interface em chamadas do aplicativo.

## Alternativas avaliadas

1. Manter o `switch` em `app.js` e apenas criar funções auxiliares. O risco imediato é baixo, mas o núcleo continua misturando ciclo de vida com regras de interação.
2. Extrair mecanicamente `onClick` para `js/actions.js`. É a abordagem escolhida porque cria uma fronteira clara com alteração pequena e verificável.
3. Substituir tudo por um registro de ações dividido por domínio ou por módulos ES. Isso reduziria arquivos individuais, mas mudaria ao mesmo tempo ordem de avaliação, resolução de dependências e forma de despacho. O ganho não justifica esse risco agora.

## Estrutura escolhida

`js/actions.js` será um script clássico carregado depois das telas e antes de `app.js`. Ele conterá o mesmo `onClick` atual, com os mesmos casos e na mesma ordem. As funções e o estado usados pelas ações continuam no escopo global dos scripts clássicos e só são consultados quando ocorre um clique, depois que `app.js` terminou de carregar.

`app.js` continuará registrando `root.addEventListener("click", onClick)`. Essa linha passa a funcionar como contrato entre o núcleo e a camada de ações. Os demais manipuladores, `input`, `change`, `focusout` e `keydown`, ficam fora deste módulo para manter o recorte pequeno.

## Compatibilidade e cache

O novo arquivo entrará no `index.html` antes de `app.js` e no shell do service worker. A versão do cache será incrementada para impedir que uma instalação antiga receba `app.js` sem receber `actions.js`.

Os harnesses Node que simulam a ordem do navegador também carregarão o novo arquivo antes de `app.js`. Varreduras de código-fonte deverão considerar núcleo, ações e telas, evitando testes que passem sem enxergar os casos movidos.

## Garantias

- Nenhuma ação, confirmação, cálculo ou mensagem será reescrita durante a extração.
- Nenhuma mudança de schema ou migração será criada.
- O site continuará estático, sem empacotador e sem dependência externa.
- Uma auditoria verificará que todas as ações declaradas no HTML têm tratamento e que `app.js` não voltou a absorver o grande `switch`.
- A suíte completa e uma execução real no navegador deverão passar.

## Fora do escopo

Dividir `actions.js` em vários domínios, converter o projeto para módulos ES e refatorar os manipuladores de campos são trabalhos posteriores. Eles só fazem sentido depois que esta fronteira simples estiver protegida por testes.
