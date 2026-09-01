# Terceiros e operadores

Este é o registro operacional do M19. A fonte exibida na tela de Privacidade é
`LEGAL_THIRD_PARTIES`, em `js/storage.js`. A suíte
`tests/test-third-party-transparency.js` confere os nomes, os dados recebidos e
a correspondência com o código.

O registro usa somente integrações comprovadas. Analytics, publicidade, pixels,
fontes remotas e scripts de terceiros não existem na versão atual. O serviço de
email de produção aparece como pendência porque o repositório exige SMTP próprio,
mas não identifica qual empresa foi contratada.

## Matriz

| Serviço | Quando participa | Dados recebidos | Retenção e exclusão | Situação |
|---|---|---|---|---|
| Vercel | Abertura do domínio e chamadas ao backend | IP e metadados da conexão; nas funções, conteúdo necessário de conta, sincronização, senha ou IA | Logs de execução variam por plano: 1 hora no Hobby, 1 dia no Pro, 3 dias no Enterprise e 30 dias com Observability Plus. Plano efetivo precisa ser confirmado | Em uso, contrato e plano a conferir |
| Supabase | Conta, autenticação, sincronização, aparelhos, limites e exclusão | Email, credenciais no fluxo de autenticação, sessão, identificadores, dados financeiros sincronizados, versões, lápides, preferências e códigos HMAC | Prazos do app estão no inventário. Logs, backups, região e aditivo dependem do projeto contratado | Em uso, região e aditivo a conferir |
| Anthropic | Análise ou refinamento confirmado pelo usuário | Totais, categorias, metas, regras e histórico selecionados; ou frase de lançamento e categorias | API com exclusão padrão de entradas e saídas em até 30 dias, sujeita a acordo diferente, aplicação da política de uso e obrigação legal | Em uso, contrato efetivo a conferir |
| Have I Been Pwned | Cadastro ou troca de senha | Cinco caracteres do SHA-1 e endereço da função; sem senha, hash completo, email ou IP do usuário | O app não persiste. Registros externos seguem a política do serviço | Em uso |
| Portal fiscal da Sefaz ou Fazenda | Consulta confirmada do QR de NFC-e ou NF-e | URL completa, possível chave da nota, IP e metadados da conexão | A resposta fica em memória no app. Registros externos seguem o órgão do portal | Em uso sob ação específica |
| Provedor SMTP de produção | Cadastro, confirmação e recuperação por email | Email, mensagem e link ou código de autenticação | Fornecedor, prazo, exclusão, país e política ainda não definidos | Pendente antes da oferta pública |

## O que a hospedagem processa

Os eventos estruturados criados pelo aplicativo excluem corpo, cabeçalhos,
cookies, IP, email, usuário, aparelho, mensagem, pilha e valores financeiros.
Isso limita o conteúdo escrito pelo app nos logs, mas não significa que a
infraestrutura deixe de processar a requisição. Uma função de sincronização
precisa receber os registros enviados; uma função de login precisa receber a
credencial durante a chamada; e a função de IA precisa receber o pacote antes de
repassá-lo à Anthropic.

Essa distinção aparece na política para não confundir "não registrado em log"
com "não processado".

## Email de autenticação

O Supabase Auth cria os fluxos de confirmação e recuperação. A documentação do
Supabase informa que o serviço SMTP padrão é destinado a testes e que produção
deve usar SMTP próprio. O código não revela a configuração do painel, portanto
não é possível afirmar se o envio atual usa Resend, AWS SES, Postmark, SendGrid,
Brevo ou outro serviço.

Antes da oferta pública, o controlador precisa registrar em
`LEGAL_THIRD_PARTIES`:

1. nome do fornecedor contratado;
2. política de privacidade e aditivo aplicável;
3. dados e metadados mantidos;
4. prazo de logs e conteúdo;
5. procedimento de exclusão;
6. país de processamento e salvaguarda de transferência.

## Transferência internacional

O repositório não contém o plano, a região nem os contratos das contas externas.
Por isso, o registro não afirma país ou base de transferência. Vercel, Supabase,
Anthropic e a infraestrutura do Have I Been Pwned podem processar dados fora do
Brasil conforme serviço, região e contrato. Esses elementos devem ser conferidos
nas contas efetivamente usadas antes da oferta pública.

## Atualização obrigatória

Qualquer inclusão de analytics, publicidade, suporte, pagamento, armazenamento,
email ou novo provedor de IA exige, no mesmo trabalho:

- nova entrada em `LEGAL_THIRD_PARTIES`;
- revisão dos fluxos afetados em `LEGAL_DATA_INVENTORY`;
- atualização deste documento e da tela de Privacidade;
- aumento de `LEGAL_TEXT_VERSION` quando o conteúdo entregue ao usuário mudar;
- conferência de CSP, retenção, exclusão, contrato e transferência.

## Fontes oficiais consultadas

- [Vercel Privacy Notice](https://vercel.com/legal/privacy-notice)
- [Vercel Data Processing Addendum](https://vercel.com/legal/dpa)
- [Retenção de Runtime Logs da Vercel](https://vercel.com/docs/logs/runtime)
- [Política de Privacidade da Supabase](https://supabase.com/privacy)
- [Aditivo de tratamento da Supabase](https://supabase.com/legal/customer-resources/data-processing-addendum)
- [Arquitetura do Supabase Auth](https://supabase.com/docs/guides/auth/architecture)
- [SMTP de produção no Supabase Auth](https://supabase.com/docs/guides/auth/auth-smtp)
- [Retenção da Anthropic API](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data)
- [API Pwned Passwords](https://haveibeenpwned.com/api/v3#PwnedPasswords)
- [Política de privacidade do Have I Been Pwned](https://haveibeenpwned.com/privacy)
