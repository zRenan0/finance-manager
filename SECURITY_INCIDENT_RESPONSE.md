# Resposta a incidentes de segurança

Procedimento operacional do Cofre (`financemanager.dev.br`). Ele responde ao item 8 de
`docs/LEGAL-LAUNCH.md`: quem detecta, quem decide, em quanto tempo se comunica e
onde fica o registro.

Este documento descreve o que existe. Ele não escolhe base legal, não substitui
assessoria jurídica e não presume contrato, plano ou fornecedor que o repositório
não conhece. As pendências estão no fim.

Fluxo: **Detecção → Classificação → Contenção → Investigação → Correção →
Avaliação de impacto → Comunicação quando aplicável → Post-mortem.**

---

## Papéis

A equipe é pequena e uma mesma pessoa pode acumular funções. O que não pode
faltar é saber, no momento do incidente, quem responde por cada decisão.

| Função | Decide | Hoje |
|---|---|---|
| Quem detecta | Abre o incidente. Qualquer pessoa, usuário ou sinal automático | Aberto |
| Responsável técnico | Contenção, investigação e correção | Mantenedor do repositório |
| Controlador | Comunicar ou não comunicar, e o que é dito | `LEGAL_CONTROLLER.name` — ainda marcador |
| Encarregado (LGPD art. 41) | Fala com a ANPD e com os titulares | `LEGAL_CONTROLLER.dpoName` — ainda marcador |
| Registro | Guarda evidência, decisões e post-mortem | Este documento e `docs/incidentes/` |

Enquanto os campos de `LEGAL_CONTROLLER` (em `js/storage.js`) estiverem com o
marcador, o papel de controlador e o de encarregado recaem sobre o mantenedor por
falta de designação formal. Isso é uma pendência de lançamento, não uma escolha.

---

## 1. Detecção

Sinais que o sistema já produz. Nenhum deles contém valor financeiro, descrição,
email, senha, cookie ou IP — essa é uma decisão do M17 e ela não muda durante um
incidente.

| Fonte | Onde | O que olhar |
|---|---|---|
| Observações do backend | Logs da plataforma | `kind: "cofre_observation"`, campos `level`, `area` (`account`, `sync`, `analyze`), `code`, `status`, `duration`, `requestId` |
| Saúde do protocolo | `/api/sync/health` | Divergência entre `database_schema_version` e o esperado (`docs/VERSIONAMENTO.md`) |
| Supabase | Security Advisor e logs do projeto | Função privilegiada exposta, RLS desabilitada, policy nova, grant novo |
| Roteamento e cabeçalhos | `npm run check:deploy` | Reprovação em qualquer das verificações de produção (M5) |
| Diagnóstico do usuário | Arquivo que o usuário exporta na tela de Privacidade | `area` e `code`; nunca conteúdo |
| Relato externo | Aviso privado no GitHub, `/reportar-vulnerabilidade` e `/.well-known/security.txt` | Relato de pesquisador; entra por este fluxo na fase 2 |

Códigos que merecem atenção imediata quando aparecem em volume anormal ou fora do
fluxo esperado:

- **Autorização:** `invalid_account_scope`, `account_scope_changed`, `bad_jwt`,
  `device_revoked`, `device_authorization_failed`, `reauth_failed`,
  `forbidden_origin`, `origin_denied`.
- **Integridade da sincronização:** `idempotency_mismatch`, `invalid_revision`,
  `invalid_commit`, `remote_changed`, `purge_failed`.
- **Disponibilidade e configuração:** `schema_missing`, `upstream_unavailable`,
  `server_error`, `unhandled`, `not_configured`.
- **Versão do cliente:** `protocol_upgrade_required`. Depois de subir o mínimo de
  escrita ele é esperado; fora disso, indica cliente antigo preso em cache velho.
- **Abuso:** `rate_limited`, `rate_limit`, `email_rate_limited`, `leaked_password`.

**O que a detecção não alcança.** Não há alerta ativo, nem plantão, nem retenção
longa de log. O prazo dos logs de execução depende do plano da Vercel e pode ser
de **1 hora** (ver `docs/TERCEIROS-E-OPERADORES.md`). Por isso a primeira ação da
investigação é preservar evidência, não conter.

---

## 2. Classificação

Duas perguntas independentes. Gravidade técnica não decide dever legal, e o
contrário também é verdade.

### Gravidade técnica

| Nível | Definição | Exemplos neste sistema | Iniciar contenção em |
|---|---|---|---|
| **S1** | Dado de um titular alcançável por outro, ou perda irreversível | Falha de escopo em `cofre_apply_ops` ou `cofre_purge_account`; vazamento de `SUPABASE_SERVICE_ROLE_KEY`; segredo de JWT exposto; destruição em massa | Imediato |
| **S2** | Autenticação ou autorização contornável em uma rota, sem alcance geral | Bypass em uma ação de `/api/account`; XSS executável no app; aparelho revogado que continua escrevendo | 24 horas |
| **S3** | Abuso ou exposição sem dado pessoal | Limite de tentativas contornável; mensagem que permite enumerar usuário; erro que revela estrutura interna | 7 dias |
| **S4** | Endurecimento e risco teórico | Cabeçalho ausente, aviso de dependência sem caminho explorável, achado de análise estática | Próximo módulo |

### Envolve dado pessoal?

Se houver acesso, exposição, alteração, perda ou destruição não autorizada de dado
pessoal, é **incidente de segurança para a LGPD**, mesmo que a gravidade técnica
seja baixa. A partir daí valem os prazos da fase 7. A leitura de qual dado foi
alcançado sai do inventário (fase 6).

Registre a classificação por escrito no momento em que ela é feita, com o horário.
Reclassificar depois é normal; apagar a classificação anterior, não.

---

## 3. Contenção

Ordem por alcance. Use a menor alavanca que resolve.

| Ação | Como | Efeito e custo |
|---|---|---|
| Rotacionar credencial | Variáveis do projeto na Vercel: `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `RATE_LIMIT_SECRET`, `SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY`; publicar em seguida | Corta o uso da chave vazada. Trocar `RATE_LIMIT_SECRET` invalida a correspondência dos HMAC já gravados, o que apenas reinicia a contagem |
| Encerrar sessão de um titular | `POST /api/account/revoke-others` (pede senha) ou `revoke-device` | Encerra os outros aparelhos e mantém o atual. Não toca em dado local |
| Encerrar todas as sessões | Rotação do segredo de JWT no painel do Supabase Auth | Derruba todo mundo. Use só quando o próprio segredo estiver em risco |
| **Bloquear cliente vulnerável** | Subir `minimum_write_protocol` em `cofre_sync_config` | Cliente abaixo do mínimo recebe **426** e **mantém a fila local**. É o desligamento mais seguro: recusa escrita sem apagar nada |
| Desligar a IA | Remover `ANTHROPIC_API_KEY` | `/api/analyze` passa a responder `NO_API_KEY`; o resto do app continua inteiro |
| Fechar origem | `ALLOWED_ORIGIN` restrito à origem canônica | Corta chamada de origem estranha às funções |
| Voltar a publicação | Vercel → Deployments → promover o último bom (`docs/RELEASE.md`) | Reverte o servidor. **Não reverte o cliente** — ver abaixo |

**O cliente é offline-first: reverter o servidor não basta.** Um aparelho que já
instalou o pacote defeituoso continua com ele. Para alcançar esses aparelhos é
preciso publicar uma correção com `VERSION` do `service-worker.js` promovida; a
instalação atômica do M9 troca o pacote inteiro na abertura seguinte. Rollback de
servidor contém o backend; só a publicação nova contém o navegador.

### O que nunca é contenção

- Desabilitar RLS, apagar policy ou afrouxar grant "para destravar".
- Rodar `cofre_purge_account`, `cofre_reset_data` ou qualquer exclusão sobre dado
  de terceiro sem pedido do titular.
- Apagar dado local do usuário. Em modo visitante, o aparelho é a única cópia.
- Editar migration histórica, reduzir `SCHEMA_VERSION` ou baixar
  `database_schema_version`.
- Publicar o detalhe explorável antes de a correção estar no ar.
- Expor `service_role` no frontend, versionar segredo ou usar chave de produção em
  pré-visualização.

---

## 4. Investigação

1. **Preserve a evidência antes de qualquer outra coisa.** Copie os eventos
   relevantes dos logs da plataforma para fora dela. A janela pode ser de 1 hora.
2. Correlacione por `X-Request-Id`. Ele liga o relato do usuário ao evento do
   backend sem identificar quem fez a requisição.
3. Consulte o banco **somente em leitura**. Para o contrato de segurança existe
   arquivo próprio: `supabase/tests/verify_security_boundary.sql`, que roda em
   staging, não em produção.
4. Reproduza em pré-visualização ou local, nunca em produção e nunca com dado de
   outro titular. `tests/test-security-adversarial.js` (M16) já tem o molde.
5. Monte uma linha do tempo com horário, sinal, ação e quem fez.
6. Ao pedir informação ao usuário, peça o **diagnóstico exportado**, que é sem
   conteúdo. Não peça captura de tela com valores, não peça backup, não peça senha.

---

## 5. Correção

- Correção mínima, em branch, com commit pequeno e claro.
- Se for banco: **migration nova**, pequena e reversível. Nunca alterar migration
  já aplicada.
- Todo incidente S1 ou S2 sai com **teste de regressão que falha antes da
  correção**, junto das suítes existentes.
- Portas obrigatórias antes de publicar: `npm run lint`, `npm test`,
  `npm run check:build`, `npm run check:release`, `npm run build:dist` e, quando o
  cliente mudar, `npm run test:browser` e `npm run test:pwa`.
- Depois de publicar: `npm run check:deploy` contra produção e a checklist de
  regressão de `FINANCEMANAGER_AUDIT_PROGRESS.md`.
- Se a correção mudar o que o usuário recebe, promova `VERSION` do
  `service-worker.js`. Se mudar o conteúdo entregue ao titular, suba
  `LEGAL_TEXT_VERSION` e `LEGAL_REVIEW_DATE`.

---

## 6. Avaliação de impacto

Use as classes de `LEGAL_DATA_INVENTORY` (`js/storage.js`, matriz em
`docs/INVENTARIO-DE-DADOS.md`). Para cada classe alcançada, responda: houve acesso
efetivo ou apenas exposição possível; quantos titulares; o dado permite identificar
a pessoa; e o que ele revela.

| Classe alcançada | Leitura de risco |
|---|---|
| Dados financeiros sincronizados | Alto. Revelam renda, dívida, patrimônio e hábito. Comprometem a intimidade mesmo sem fraude direta |
| Cadastro e sessão | Alto. Email mais sessão permite acesso à conta |
| Aparelhos conectados | Médio. Metadado de uso; o identificador não revela conteúdo |
| Aceites e escolhas de IA | Médio. Revela uso do produto |
| Pacotes de IA | Alto quando enviados. Contêm totais, categorias e metas |
| Diagnóstico local | Baixo. Sem conteúdo e sem identificador pessoal |
| Observações do backend | Baixo. Sem IP, sem usuário e sem corpo |
| HMAC do limite de tentativas | Baixo. Não reverte para email ou IP |
| Backup exportado | Alto se o arquivo for comum; o protegido por senha (M12) depende da senha do titular |

Registre também o que **não** foi alcançado, com a razão técnica. Um incidente no
backend não alcança, por si, o dado que nunca saiu do aparelho.

---

## 7. Comunicação quando aplicável

| Destinatário | Quando | Prazo | Canal |
|---|---|---|---|
| ANPD | Incidente com dado pessoal que possa acarretar risco ou dano relevante | **3 dias úteis** do conhecimento | Comunicado de Incidente de Segurança (CIS) no site da ANPD |
| Titulares afetados | No mesmo evento | Junto da comunicação à ANPD | Email do cadastro e aviso no app |
| Pesquisador que relatou | Ao conter e ao corrigir | Assim que houver o que dizer | O mesmo aviso privado por onde ele escreveu |
| Operadores (Vercel, Supabase, Anthropic) | Quando a causa estiver no serviço deles | Assim que identificado | Suporte do fornecedor |

O prazo de 3 dias úteis vem do Regulamento de Comunicação de Incidente de Segurança
da ANPD. **Confira a redação vigente antes de aplicá-lo**: é norma recente e sujeita
a alteração. A decisão de comunicar é do controlador, com o encarregado, e não deve
ser tomada sozinho pelo responsável técnico.

A comunicação ao titular precisa dizer, em linguagem simples: o que aconteceu, quais
dados dele, quando, o que já foi feito, o que ele deve fazer (trocar senha, conferir
aparelhos em Segurança) e como falar com o encarregado. Não deve conter detalhe
explorável antes de a correção estar publicada, não deve culpar o usuário e não deve
prometer o que ainda não se sabe.

O canal de incidente publicado é `LEGAL_CONTROLLER.incidentEmail`, exibido na tela de
Privacidade sob o art. 48. Ele ainda é um marcador — ver pendências.

---

## 8. Post-mortem

Prazo: **5 dias úteis** depois do fechamento. Sem busca de culpado; o alvo é a
condição que deixou o erro passar.

Arquivo em `docs/incidentes/AAAA-MM-DD-descricao-curta.md`, com:

1. Resumo em três linhas.
2. Gravidade, classificação LGPD e se houve comunicação.
3. Linha do tempo (detecção, contenção, correção, publicação).
4. Causa raiz técnica.
5. Por que as portas existentes não pegaram (lint, suíte, `check:release`,
   `check:deploy`, revisão, advisor do Supabase).
6. O que mudou para não repetir: teste, verificação, documento, migration.
7. Pendências abertas, com responsável.

O post-mortem não guarda dado pessoal, valor financeiro, trecho de log com conteúdo,
token, senha nem identificador de titular.

---

## Prazos, em um lugar só

| Evento | Prazo |
|---|---|
| Contenção de S1 | Imediata |
| Contenção de S2 | 24 horas |
| Comunicação à ANPD e ao titular | 3 dias úteis do conhecimento, quando aplicável |
| Post-mortem | 5 dias úteis do fechamento |
| Resposta a pedido de titular | 15 dias (`LEGAL_CONTROLLER.responseDays`, art. 19, II) |

---

## Registro de incidentes

| Data | Descrição | Gravidade | Dado pessoal | Comunicado | Post-mortem |
|---|---|---|---|---|---|
| — | Nenhum incidente registrado até 2026-09-01 | — | — | — | — |

Achado de auditoria corrigido antes de qualquer exploração não entra aqui: ele fica
em `FINANCEMANAGER_AUDIT_PROGRESS.md` e em `AUDIT_FIX_PROGRESS.md`.

---

## Pendências

Este procedimento funciona hoje para detectar, conter, investigar e corrigir. Para a
parte de comunicação ele depende de decisões externas ao repositório:

1. **Identificação do controlador e do encarregado.** Sem `dpoName`, `dpoEmail` e
   `incidentEmail` reais, não há canal publicado para comunicar nem para receber.
   Ver `docs/LEGAL-LAUNCH.md`.
2. **Retenção de log da hospedagem.** O plano efetivo da Vercel define a janela de
   evidência. Com 1 hora, quase toda investigação começa tarde.
3. **Recebimento privado no GitHub.** O canal existe (M21): página pública,
   `SECURITY.md` e `security.txt` gerado no build. Falta confirmar nas
   configurações do repositório que o aviso privado de vulnerabilidade está
   habilitado — sem isso, o link do canal preferido não abre para quem relatar.
4. **Sem alerta ativo.** A detecção depende de alguém olhar o log ou de alguém
   relatar. Não há disparo automático nem plantão.
5. **Sem exercício de mesa.** O procedimento nunca foi ensaiado com um caso simulado
   de ponta a ponta.
6. **Base legal e registro das operações de tratamento** continuam pendentes e
   afetam o texto da comunicação.

## Referências oficiais

- [Lei Geral de Proteção de Dados](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm)
- [Comunicação de incidente de segurança na ANPD](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis)
- [Guia de segurança para agentes de tratamento de pequeno porte](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-sobre-seguranca-da-informacao-para-agentes-de-tratamento-de-pequeno-porte)
