# Preparação comercial, itens 6 a 8

## Escopo

Esta etapa reduz três riscos antes de conectar o aplicativo a serviços pagos ou publicar versões comerciais.

## 6. Dados externos e QR fiscal

Todo identificador vindo de backup será convertido para um formato restrito e determinístico, preservando os vínculos entre contas, cartões, metas, categorias, dívidas e lançamentos. Cores aceitarão somente hexadecimal de seis dígitos. Textos e campos enumerados terão tamanho e valores limitados durante a migração.

Uma URL lida por QR somente será tratada como nota fiscal quando usar HTTPS, contiver uma chave fiscal de 44 dígitos e pertencer a um domínio governamental com identificação de SEFAZ ou Fazenda. A consulta de rede repetirá essa validação e recusará redirecionamento para domínio não fiscal.

## 7. Contrato de sincronização

O `CloudAdapter` continuará desligado. Para ser criado, exigirá ativação explícita, HTTPS, token, identificador do dispositivo e protocolo compatível. Leituras receberão envelope com revisão do servidor. Escritas enviarão revisão-base e chave de idempotência. Conflitos HTTP 409 não serão resolvidos silenciosamente.

Operações destrutivas exigirão uma opção separada. Requisições terão limite de tempo, tamanho máximo de resposta, tipo de conteúdo validado e mensagens de erro sem corpo do servidor.

O contrato documentado não conecta o app a nenhum backend. Ele estabelece o que um servidor futuro precisa cumprir antes do uso.

## 8. Desenvolvimento e publicação

O projeto terá um `package.json` sem dependências externas, um comando único que executa todos os testes, uma verificação de publicação, integração contínua e documentação de versão, homologação e retorno à versão anterior. O repositório Git será iniciado localmente, sem criar remoto, publicar ou enviar arquivos.

## Verificação

Os testes cobrirão identificadores e cores adulterados, URLs fiscais e não fiscais, redirecionamento de consulta, ativação do adaptador, autenticação, revisão, idempotência, conflito, timeout e bloqueio destrutivo. A verificação de publicação confirmará versão, cache, changelog, arquivos essenciais e execução integral da suíte.
