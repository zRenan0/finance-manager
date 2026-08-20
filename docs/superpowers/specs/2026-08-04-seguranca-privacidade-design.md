# Segurança e privacidade dos dados financeiros

## Objetivo

Reduzir o risco de execução de código injetado, impedir envio silencioso de informações financeiras para serviços externos e evitar que a função paga de IA aceite chamadas de qualquer site por configuração ausente.

## Abordagens consideradas

1. Manter a CSP em relatório e corrigir apenas pontos individuais de HTML. Tem menor impacto, mas não cria uma barreira efetiva contra novos pontos de injeção.
2. Aplicar CSP efetiva, retirar scripts inline, confirmar envios à IA e fechar a origem da função. É a abordagem escolhida porque cobre navegador, interface e servidor sem exigir contas de usuário.
3. Adicionar autenticação, criptografia com senha e serviço de identidade. É uma etapa futura, pois mudaria a arquitetura local do produto e o fluxo de acesso.

## Política de conteúdo

- `Content-Security-Policy-Report-Only` será substituída por `Content-Security-Policy`.
- Scripts poderão vir apenas do próprio site.
- Atributos de evento inline serão bloqueados.
- O código de seleção de tema sairá do `index.html` e irá para `js/boot.js`.
- A fonte externa será carregada por uma folha de estilos normal, sem `onload` inline.
- Estilos inline continuarão permitidos porque as telas atuais usam valores calculados em atributos `style`.
- Conexões HTTPS continuarão permitidas para leitura de QR de portais estaduais e para as fontes já usadas.

## Consentimento para IA

Antes de cada análise mensal, a interface informará que serão enviados valores agregados, nomes de categorias e metas para um serviço externo de IA. Descrições, datas e lançamentos individuais continuarão fora do payload.

Antes do refinamento de uma frase, a interface informará que a frase digitada e os nomes das categorias serão enviados. Cancelar encerra a ação sem rede e sem alterar o estado atual.

O cartão de IA também exibirá essa informação antes do primeiro envio, não apenas depois da resposta.

## Proteção da função

- Quando `ALLOWED_ORIGIN` estiver configurada, a lista continuará sendo a fonte de autorização.
- Sem a variável, a função aceitará apenas a origem que corresponda ao próprio host da requisição.
- Requisições sem `Origin` serão recusadas.
- Respostas do provedor não serão repassadas ao cliente em campos de diagnóstico.
- Limites de tamanho, tempo e frequência já existentes serão preservados.

## Compatibilidade

- O aplicativo continuará estático e local-first.
- A análise por IA continuará opcional.
- IndexedDB, backup e modelos financeiros não serão alterados.
- Desenvolvimento em localhost funciona quando a origem e o host correspondem ou quando `ALLOWED_ORIGIN` inclui a origem usada.

## Verificação

Os testes devem provar que não há script nem evento inline no HTML, que a CSP está efetiva, que o arquivo de tema entra no cache, que cancelar a confirmação impede a chamada de rede e que a função recusa origem diferente do host sem configuração. A suíte completa e uma execução com cabeçalhos Netlify devem passar.
