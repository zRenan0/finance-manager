# Personalização, confirmações e validação

## Objetivo

Manter o Início progressivo para uma base nova, sem impedir que a pessoa mostre manualmente um cartão ainda sem dados. Substituir confirmações espalhadas por um diálogo próprio do aplicativo, retirar travessões e emojis visíveis e impedir caracteres incompatíveis nos campos.

## Decisões

O layout do Início passa a guardar uma lista `pinned`. Um cartão aparece quando possui dados ou quando foi marcado manualmente. A lista `hidden` continua tendo precedência e o cartão de saldo permanece fixo. Restaurar o padrão limpa as duas listas.

O painel de personalização mostra o estado efetivo de cada cartão. Cartões sem dados recebem uma indicação curta e podem ser ativados. Essa escolha fica salva e também funciona na tela inicial vazia.

Todas as confirmações de exclusão, duplicidade, consentimento de IA e aporte inicial usam o mesmo popup com `role="alertdialog"`. A ação só roda após a confirmação. Cancelar, clicar fora ou pressionar Escape fecha o popup sem alterar dados.

Campos numéricos são saneados antes de atualizar o estado. Valores monetários e percentuais aceitam dígitos, vírgula e ponto, preservando formatos brasileiros como `1.234,56`. Campos inteiros aceitam somente dígitos. Campos de texto removem caracteres de controle e respeitam `maxlength`.

Textos exibidos não usam travessões nem emojis. Estados comemorativos usam ícones SVG do conjunto já existente.

## Alternativas descartadas

Desligar o filtro progressivo inteiro faria uma base nova voltar a receber cartões vazios. Criar um layout separado por perfil duplicaria estado sem necessidade. Confirmações nativas do navegador não seguem o visual, não oferecem semântica consistente e não podem ser testadas como parte da interface.

## Verificação

Os testes devem cobrir persistência dos cartões marcados, popup de confirmação, ausência de `confirm()` nativo, saneamento de entradas e ausência de travessões e emojis visíveis. A aplicação também deve ser aberta no navegador em largura móvel e desktop, com inspeção de erros no console.
