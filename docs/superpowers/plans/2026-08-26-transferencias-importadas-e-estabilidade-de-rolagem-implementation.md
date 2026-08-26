# Plano de implementação: transferências importadas e rolagem estável

Data: 26 de agosto de 2026

Especificação: `docs/superpowers/specs/2026-08-26-transferencias-importadas-e-estabilidade-de-rolagem-design.md`

## Princípios de execução

* Escrever primeiro os testes que demonstram cada falha.
* Usar `accountTransfers` como único modelo novo produzido pelos fluxos alterados.
* Não mudar os cálculos de gasto e renda para acomodar uma transferência mal modelada.
* Fazer remoção de transações e criação da transferência na mesma chamada de `setData`.
* Gerar `js/modules/app.generated.js` somente pelo script de build.
* Rodar testes direcionados depois de cada etapa e a suíte completa no fim.

## Etapa 1: regras puras de correspondência e construção

Arquivos:

* criar `tests/test-import-transfers.js`;
* alterar `js/movements.js`;
* alterar `js/import.js`.

Trabalho:

1. Cobrir Pix enviado e recebido, direção, valor em centavos e contas diferentes.
2. Extrair uma função pura de correspondência de pontas que possa ser usada pela Caixa de revisão e pelo importador.
3. Exigir valor, direção, contas, janela de dois dias e indício textual de transferência.
4. Retornar estado ambíguo quando houver mais de uma candidata.
5. Criar uma função que separe linhas incluídas em `transactions` e `accountTransfers`.
6. Preservar `origin.reference` e `sourceTransactionIds`.
7. Testar que a transferência muda os dois saldos e não altera gasto nem renda.

Validação:

* `node tests/test-import-transfers.js`
* `node tests/test-movements.js`
* `node tests/test-pdf-import.js`

## Etapa 2: revisão da importação

Arquivos:

* alterar `js/app.js` para o estado temporário das linhas;
* alterar `js/screens/import.js`;
* alterar `js/actions.js`;
* alterar `css/components.css`, que já contém `.import-row`.

Trabalho:

1. Adicionar a escolha entre lançamento e transferência somente para extrato bancário com duas contas ativas.
2. Mostrar o seletor da outra conta quando a linha for transferência.
3. Derivar origem e destino do tipo da linha e da conta do extrato.
4. Ocultar a categoria nesse modo.
5. Mostrar transferências separadas no resumo.
6. Bloquear a confirmação somente quando uma linha de transferência incluída estiver incompleta.
7. Gravar transações e transferências juntas.
8. Marcar a contraparte já registrada como desmarcada, com explicação e possibilidade de inclusão manual como lançamento.

Validação:

* ampliar `tests/test-import-transfers.js` para o HTML e as ações puras possíveis;
* `node tests/test-render.js`
* `node tests/test-beta-fixes.js`

## Etapa 3: conversão pelo editor

Arquivos:

* alterar `js/screens/add.js`;
* alterar `js/actions.js`;
* alterar `js/app.js` para o rascunho de conversão;
* ampliar `tests/test-movements.js` e `tests/test-import-transfers.js`.

Trabalho:

1. Remover `transferencia` das opções que salvam uma transação comum nova.
2. Ao editar, transformar essa escolha em um modo de conversão com origem e destino.
3. Preencher a conta vinculada e derivar a direção pelo tipo atual.
4. Reutilizar a correspondência pura para sugerir uma contraparte já importada.
5. Mostrar quais lançamentos serão substituídos.
6. Na confirmação, usar `removeTransactionsWithIntegrity`, adicionar um `accountTransfer` e preservar procedência.
7. Recusar contas iguais, arquivadas, inexistentes ou incompletas.

Validação:

* `node tests/test-movements.js`
* `node tests/test-import-transfers.js`
* `node tests/test-render.js`

## Etapa 4: estabilidade da rolagem e do foco

Arquivos:

* alterar `js/app.js`;
* ampliar `tests/test-beta-fixes.js`;
* ampliar `tests/browser/run-browser.js`.

Trabalho:

1. Criar uma chave para a tela e a camada realmente desenhadas.
2. Capturar a posição da janela e da folha modal antes de trocar `#app.innerHTML`.
3. Restaurar as posições somente quando a chave visual não mudar e não houver `revealTarget`.
4. Restaurar foco com `preventScroll: true` e manter a reserva para navegadores antigos.
5. Preservar a posição do cursor.
6. Testar uma atualização da mesma tela durante a edição de categoria.
7. Testar que navegação e `revealTarget` não herdam uma rolagem antiga.

Validação:

* `node tests/test-beta-fixes.js`
* `npm run test:browser`

## Etapa 5: geração e regressão

Arquivos:

* gerar `js/modules/app.generated.js`;
* atualizar `CHANGELOG.md` com a correção e a nova capacidade.

Comandos:

1. `npm run build`
2. `npm run check:build`
3. `npm test`
4. `npm run lint`
5. `npm run check:release`
6. `npm run test:browser`

Se algum teste antigo falhar, corrigir a causa no arquivo de origem e repetir primeiro o teste direcionado. Não ajustar uma expectativa antiga apenas para acomodar comportamento incorreto.
