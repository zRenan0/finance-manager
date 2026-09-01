# Inventário de dados

Este é o registro operacional do M18. A fonte usada pela tela de Privacidade é
`LEGAL_DATA_INVENTORY`, em `js/storage.js`. A suíte
`tests/test-data-inventory-lgpd.js` confere se cada entrada declara finalidade,
armazenamento, retenção, acesso, terceiros e exclusão.

O inventário descreve o comportamento implementado. Ele não escolhe bases legais,
não substitui registro de operações de tratamento e não preenche informações que
dependem do controlador ou de contratos ainda não definidos.

## Matriz

| Dados | Finalidade | Armazenamento e retenção | Acesso | Terceiros | Exclusão | Fonte principal |
|---|---|---|---|---|---|---|
| Dados financeiros, perfil e preferências locais | Executar organização, cálculos e interface | IndexedDB ou fallback local; permanecem até exclusão do site ou do escopo | Usuário e código da mesma origem | Nenhum no uso local | Controle de exclusão local ou limpeza do site | `js/storage.js` |
| Espelho, fallback, fila, recuperação e desfazer | Recuperar gravação, repetir envio e restaurar estado anterior | IndexedDB e localStorage; as cópias financeiras podem ser JSON legível sem criptografia | Usuário, app e quem já acessa o perfil local do navegador | Backend somente para a fila de conta | Purga local; a barreira sem conteúdo permanece | `js/storage.js`, `docs/ARMAZENAMENTO-E-PRIVACIDADE.md` |
| Dados sincronizados | Manter aparelhos convergentes, propagar exclusões e restaurar versões | Banco; atual enquanto a conta existir, lápides por 24 meses, 5 versões e recibos por 30 dias | Usuário pela sessão e backend de serviço | Hospedagem e Supabase | Purga antes da exclusão da conta | `js/cloud-sync.js`, `netlify/functions/sync.js` |
| Cadastro e sessão | Autenticar, confirmar email e recuperar acesso | Supabase Auth e cookies HttpOnly; acesso 1 hora, renovação 30 dias, PKCE 24 horas e recuperação 30 minutos | Usuário, backend e autenticação | Hospedagem e Supabase | Logout limpa sessão; exclusão remove cadastro | `netlify/functions/account.js` |
| Aparelhos conectados | Reconhecer, listar e revogar aparelhos | Identificador local, segredo em cookie e hash no banco; registro enquanto a conta existir | Usuário e backend | Hospedagem e Supabase | Revogação encerra acesso; exclusão da conta remove linhas | `js/auth.js`, `netlify/functions/account.js` |
| HMAC do limite de tentativas | Conter abuso sem guardar email ou IP em texto | Banco; elegível para limpeza após 1 dia e removido na execução seguinte do limitador | Backend de serviço | Hospedagem e Supabase | Limpeza automática do limitador | `netlify/functions/_shared/rate-limit.js`, `supabase/migrations/202608180002_rate_limit.sql` |
| Aceites e escolhas de IA | Versionar aceite e respeitar bloqueio ou retirada de campos | Configuração local e, com conta, sincronizada; até 10 versões enquanto houver dados | Usuário, app e backend de sincronização | Hospedagem e Supabase com conta | Exclusões local e de conta são separadas | `js/storage.js`, `netlify/functions/_shared/finance-schema.js` |
| Diagnóstico local | Investigar falhas sem conteúdo | localStorage; 30 dias e 50 ocorrências | Usuário e app | Nenhum automaticamente | Botão próprio ou exclusão local | `js/safe-errors.js` |
| Observações do backend e metadados da hospedagem | Entregar site e funções, contar falhas e localizar requisição | O evento controlado exclui IP e conteúdo; a plataforma recebe metadados normais da conexão e pode manter registros de acesso; prazo externo ainda não definido | Operadores autorizados | Plataforma de hospedagem | Configuração e procedimento da plataforma ainda pendentes | `netlify/functions/_shared/observability.js` |
| Pacotes e respostas de IA | Análise opcional e interpretação de frase | Transitórios no app e backend; retenção do provedor ainda não definida | Usuário, backend e provedor de IA | Hospedagem e provedor configurado | Bloqueio impede envio futuro; envio passado depende do fornecedor | `js/insights.js`, `netlify/functions/analyze.js` |
| Prefixo de hash da senha | Consultar senha conhecida em vazamento por k-anonimato | Cinco caracteres do SHA-1 enviados pelo backend; não persistidos pelo app | Backend e Have I Been Pwned | Hospedagem e Have I Been Pwned | Sem cópia local; serviço externo segue seus controles | `netlify/functions/_shared/senha-vazada.js` |
| Endereço e chave de nota fiscal | Consultar página pública e sugerir valor ou estabelecimento | Chamada direta do navegador ao portal; resposta em memória | Usuário, app e portal, que pode receber IP e metadados de conexão | Portal oficial de Sefaz ou Fazenda | Cancelar descarta prévia; acesso do portal não é apagado pelo app | `js/qrcode.js` |
| OFX, CSV e PDF importados | Criar prévia e lançamentos escolhidos | Original processado localmente; registros confirmados entram na base | Usuário e app local | Nenhum | Cancelar, desfazer última importação ou apagar registros | `js/import.js`, `js/pdf-import.js` |
| Backups e diagnósticos exportados | Portabilidade, recuperação e suporte | Arquivo no destino escolhido; comum legível ou protegido por AES-GCM | Quem possui arquivo e, quando aplicável, senha | Somente os escolhidos pelo usuário | Usuário remove cada cópia, lixeira, nuvem ou destinatário | `js/storage.js`, `js/backup-crypto.js` |

## Limites que precisam ficar explícitos

- Apagar a conta não apaga os arquivos já exportados nem a cópia local de um
  navegador desconectado.
- Apagar os dados do aparelho não apaga a conta nem o conteúdo sincronizado.
- Bloquear IA vale para os próximos envios. O app não controla o conteúdo já
  entregue ao provedor.
- Apagar um lançamento criado por nota fiscal não apaga o registro de acesso que
  o portal público possa ter mantido.
- Os dados importados não saem do navegador pelo fluxo de importação, mas os
  lançamentos confirmados podem sincronizar depois se uma conta estiver ligada.

## Pendências externas

Antes da oferta ao público ainda é necessário definir:

1. Os sete campos reais de `LEGAL_CONTROLLER`.
2. As bases legais e o registro interno das operações de tratamento.
3. O prazo e o procedimento de exclusão dos logs da hospedagem.
4. O prazo, a finalidade secundária e o procedimento de exclusão do provedor de IA.
5. Os contratos e responsabilidades de cada operador e terceiro.

Esses itens permanecem em `docs/LEGAL-LAUNCH.md`. Nenhum recebeu valor presumido
no inventário.

## Referências oficiais

- [Lei Geral de Proteção de Dados](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm)
- [Direitos dos titulares na ANPD](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares)
- [Guia de segurança para agentes de pequeno porte](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-sobre-seguranca-da-informacao-para-agentes-de-tratamento-de-pequeno-porte)
