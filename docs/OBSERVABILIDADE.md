# Observabilidade

O M17 cobre as funções de conta, sincronização e análise, além do diagnóstico local do frontend, autenticação, importação e Service Worker. Nenhum serviço externo de monitoramento foi adicionado.

## Backend

Cada chamada das três funções recebe um `X-Request-Id`. O mesmo valor aparece no evento JSON escrito no stdout da plataforma, permitindo localizar a requisição sem registrar quem a fez ou o conteúdo enviado.

O evento usa `kind: "cofre_observation"` e contém somente versão, horário, nível, área, operação, método, status HTTP, código controlado, duração e identificador da requisição. Não entram corpo, query completa, cabeçalhos, cookies, IP, email, usuário, aparelho, mensagens, pilhas, descrições nem valores financeiros.

Em produção, a emissão fica ativa automaticamente. Em desenvolvimento ou staging, use `OBSERVABILITY_LOGS=1` para emitir os mesmos eventos. A busca recomendada nos logs da plataforma é por `cofre_observation` e, quando houver um relato específico, pelo valor de `X-Request-Id`.

Status até 399 usam `info`, falhas de cliente usam `warn` e falhas de servidor usam `error`. Uma exceção não tratada recebe apenas o código `unhandled`; a camada não registra sua mensagem ou pilha.

## Frontend e Service Worker

O diagnóstico do navegador continua local, com retenção de 30 dias e limite de 50 ocorrências. Ele guarda somente horário, área, código, versão do app, schema e estado da conexão. O objeto de erro é ignorado e o resumo declara `automaticUpload: false`.

Falhas operacionais de autenticação, como rede, timeout ou indisponibilidade do servidor, recebem o código `auth_request`. Erros esperados de formulário e credencial não são tratados como indisponibilidade. Importações e sincronização conservam seus códigos próprios.

O Service Worker envia à página apenas `COFRE_OBSERVATION`, a área `service_worker` e um dos códigos permitidos. URL, requisição e resposta não acompanham a mensagem. A página valida esses três campos antes de gravar a ocorrência local.

O usuário pode exportar ou apagar o diagnóstico na tela de privacidade. Nada é enviado automaticamente ao backend.
