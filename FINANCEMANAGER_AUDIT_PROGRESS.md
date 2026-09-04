# FinanceManager — Progresso da auditoria e evolução

Memória de trabalho da auditoria por módulos (M0 a M40). **Leia este arquivo antes
de começar qualquer módulo**; ele existe para não refazer a análise a cada sessão.

Documento irmão, anterior e ainda válido: `AUDIT_FIX_PROGRESS.md` (auditoria de beta,
P0/P1). Não substituir nem apagar: o que está lá como CONCLUÍDO não deve ser refeito.

---

## Estado geral

| Campo | Valor |
|---|---|
| Módulo atual | **M32 e M33** (concluídos) |
| Status do M33 | **CONCLUÍDO** - painel por tipo de recorrência (streaming, software, academia, telefonia, moradia, educação, seguros, serviços), total anual de tudo que se repete e ficha "Revisar assinatura" com perguntas por tipo; a marcação guarda data, nunca veredito. Cache em `v70` |
| Status do M32 | **CONCLUÍDO** - anomalias contra a própria média em janela do mesmo tamanho, com a base escrita na tela; três frases do roteiro entregues e o elogio falso do começo do mês eliminado |
| Status do M31 | **CONCLUÍDO** - "posso comprar?" passou a responder em sobra mensal, comprometimento antes/depois e impacto na reserva, com nome do produto e leitura educativa |
| Status do M30 | **CONCLUÍDO** - limite diário calculado a partir da meta de guardar, não do que cabe na renda; declara a fonte do alvo e avisa quando não cabe. Cache em `v69` |
| Status do M29 | **CONCLUÍDO** - a cadeia do fechamento aparece no cartão de previsão e fecha no centavo; margem medida no pior dia do mês e risco com data. Cache em `v68` |
| Status do M28 | **CONCLUÍDO** - escada de 3/6/9 meses calculada sobre a média dos gastos essenciais, com nenhum degrau apresentado como obrigatório |
| Status do M27 | **CONCLUÍDO** - painel "Sua pontuação" com pontos por pilar, motivo, conselho e o maior ganho disponível; a promessa de pontos é normalizada pelo peso avaliado e travada por teste (somar os ganhos dá exatamente 100). Cache em `v67` |
| Status do M26 | **CONCLUÍDO** - linha discreta na tela inicial com "Proteger meus dados"; some sozinha quando há conta ou backup recente. Corrigido de passagem o diálogo de três botões, que espremia rótulos. Cache em `v66` |
| Status do M25 | **CONCLUÍDO** - demonstração vive só na memória, com as duas guardas no único caminho de gravação; provado em navegador que uma escrita real dentro dela não altera IndexedDB, espelho nem fila. Cache em `v65` |
| Status do M24 | **CONCLUÍDO** - passo de gastos fixos opcional, que vira teto de categoria em vez de lançamento; o assistente entrega plano pessoal em 11 interações. Cache em `v64` |
| Status do M23 | **CONCLUÍDO** - seção dos três pilares entre o problema e a demonstração, sem remover nenhuma funcionalidade da página e sem tocar no bento; cache promovido para `v63` porque a folha da landing é stale-while-revalidate |
| Status do M22 | **CONCLUÍDO** - decisão registrada (produto = Cofre, `financemanager.dev.br` = endereço), superfícies padronizadas, aplicativo em `noindex` e identificadores congelados travados por teste contra faxina de marca |
| Status do M21 | **CONCLUÍDO** - página pública `/reportar-vulnerabilidade`, `SECURITY.md` e `security.txt` gerado no build (RFC 9116), verificados em navegador real e em produção pelo `check:deploy`; nenhum endereço inventado enquanto `incidentEmail` for marcador |
| Status do M20 | **CONCLUÍDO** - `SECURITY_INCIDENT_RESPONSE.md` cobre as oito fases com as alavancas reais do sistema; teste novo amarra cada código, rota, RPC e variável citada ao código; `check:release` passou a exigir o documento. **Achado independente:** 5 arquivos de teste falham por fixture dependente de data, e a falha já existia em `HEAD` |
| Status do M19 | **CONCLUÍDO** - Vercel, Supabase, Anthropic, Have I Been Pwned e portais fiscais registrados com dados recebidos e limites; SMTP de produção preservado como pendência sem fornecedor presumido |
| Status do M18 | **CONCLUÍDO** - 14 fluxos mapeados em finalidade, armazenamento, retenção, acesso, terceiros e exclusão; política e inventário operacional usam a mesma fonte estruturada; pendências externas preservadas sem dados presumidos |
| Status do M17 | **CONCLUÍDO** - observações estruturadas no backend com `X-Request-Id`, diagnóstico local ampliado e Service Worker monitorado sem registrar conteúdo financeiro ou enviar diagnóstico automaticamente |
| Status do M16 | **CONCLUÍDO** - os nove vetores do roteiro possuem prova defensiva; 22 verificações novas nos handlers reais e contrato SQL somente leitura para desenvolvimento ou staging; nenhuma falha de produção confirmada |
| Status do M15 | **CONCLUÍDO** - ações financeiras críticas cobertas por comportamento; agregação V8 corrigida; cobertura real em 79,0% global e 41,7% em `js/actions.js`, com pisos de 75% e 35% |
| Status do M14 | **CONCLUÍDO** - duplicidade passou a olhar a descrição e a ter quatro motivos distintos, o FITID do OFX é lido e guardado, e existe desfazer da última importação; schema local em 23 |
| Status do M13 | **CONCLUÍDO** - seis versões inventariadas em `docs/VERSIONAMENTO.md` com matriz de compatibilidade conferida por teste; backup de schema futuro passou a avisar; banco passou a declarar a própria versão (**migração aplicada e confirmada em produção em 2026-08-31**) |
| Status do M12 | **CONCLUÍDO** - aviso de privacidade no cartão, rótulo sem o formato em primeiro plano e backup opcionalmente protegido por senha (AES-GCM + PBKDF2), com ida e volta verificada em navegador real |
| Status do M11 | **CONCLUÍDO** - numerador e denominador passaram a usar a mesma régua de natureza no ranking de categorias, no dia da semana, no mapa de calor, no relatório por período, na retrospectiva e na média da previsão; 41 invariantes contábeis travados em suíte nova |
| Status do M10 | **CONCLUÍDO** - repetição idempotente sobrevive à perda da resposta e à recarga; HLC confirmada pelo servidor é absorvida; concorrência, volume e paginação ganharam regressão |
| Status do M9 | **CONCLUÍDO** - pacote inteiro identificado por SHA-256, instalação atômica, primeiro quadro no HTML, reconciliação de controller, teste offline real e matriz Chromium/Firefox/WebKit |
| Status do M8 | **CONCLUÍDO** - inventário completo de IndexedDB, localStorage, sessionStorage, CacheStorage e cookies; versões conferidas; fluxo corrigido na documentação; risco do espelho em JSON registrado |
| Status do M7 | **CONCLUÍDO** — "sair dos outros aparelhos" com reautenticação e duas camadas; data de entrada na lista |
| Status do M6 | **CONCLUÍDO, sem pendência.** A proteção contra senha vazada é do plano pago do Supabase (org confirmada no **free**), então foi implementada aqui por k-anonimato contra o HaveIBeenPwned, verificada ao vivo. Ver F6-04 |
| Status do M5 | **CONCLUÍDO E CONFIRMADO EM PRODUÇÃO** (2026-08-30). `node scripts/check-deploy.js https://www.financemanager.dev.br` passa com **66 ok, 0 falhas**; antes da publicação reprovava 10 |
| Status do M4 | **CONCLUÍDO** — 3 achados corrigidos (1 P1, 1 P2, 1 P3) + suíte de regressão nova |
| Status do M3 | **CONCLUÍDO** — aplicado e confirmado no banco em 2026-08-28 |
| Status do M2 | **CONCLUÍDO** — nenhuma vulnerabilidade de autorização; invariantes travados por teste |
| Status do M1 | **CONCLUÍDO** — aplicado e confirmado; gatilho capturado e versionado |
| Módulos concluídos | M0 a M33 |
| Próximo módulo | M34 - Central de dívidas |
| Branch | `deploy-atualizado` (árvore limpa no início do M0) |
| Arquivos alterados até aqui | Testes/scripts: `tests/test-security.js`, `tests/test-service-role-scope.js`, `tests/test-xss-surface.js`, `tests/test-auth-password.js`, `tests/test-session-scope-backend.js`, `tests/test-device-revocation-backend.js`, `tests/test-storage-privacy-inventory.js`, `tests/test-render.js`, `tests/test-cloud-sync.js`, `tests/test-account-backend.js`, `tests/test-critical-actions.js`, `tests/test-coverage.js`, `tests/test-security-adversarial.js`, `tests/test-observability.js`, `tests/test-data-inventory-lgpd.js`, `tests/test-third-party-transparency.js`, `supabase/tests/verify_security_boundary.sql`, `scripts/check-deploy.js`, `scripts/serve.js`, `scripts/coverage.js`. Produção: `js/screens/analytics.js`, `js/icons.js` (M4), `vercel.json` (M5), `netlify/functions/account.js`, `netlify/functions/_shared/supabase-rest.js`, `js/utils.js`, `js/auth.js`, `js/actions.js`, `js/app.js`, `js/screens/account.js`, `css/screens/account.css` (M6/M7), `js/storage.js`, `js/cloud-sync.js` (M10), `js/analytics.js`, `js/forecast.js`, `js/wrapped.js`, `js/screens/analytics.js` (M11), `js/backup-crypto.js`, `js/app.js`, `js/actions.js`, `js/storage.js`, `js/screens/settings.js`, `css/components.css`, `scripts/build-app-module.js` (M12), `netlify/functions/sync.js` (M13), `js/import.js`, `netlify/functions/_shared/finance-schema.js` (M14), observabilidade em backend, frontend e Service Worker (M17), inventário e tela de Privacidade (M18), registro de terceiros e operadores (M19), `js/modules/app.generated.js` (regerado). Documentação: inventário do M8, protocolo do M10, backup protegido do M12, `docs/VERSIONAMENTO.md` do M13, observabilidade do M17, inventário LGPD do M18, terceiros do M19 e desenhos de M15 a M19. **M20 (só documentação e verificação, nenhum arquivo de produção):** `SECURITY_INCIDENT_RESPONSE.md` (novo), `tests/test-incident-response.js` (novo), `scripts/check-release.js`, `docs/LEGAL-LAUNCH.md`, `README.md`, `CHANGELOG.md`. **M21:** `reportar-vulnerabilidade.html` (novo), `css/reportar.css` (novo), `SECURITY.md` (novo), `scripts/security-txt.js` (novo), `tests/test-responsible-disclosure.js` (novo), `vercel.json`, `scripts/build-dist.js`, `scripts/serve.js`, `scripts/check-release.js`, `scripts/check-deploy.js`, `landing.html`, `tests/test-landing.js`, `tests/browser/run-landing.js`, `SECURITY_INCIDENT_RESPONSE.md`, `docs/LEGAL-LAUNCH.md`, `README.md`, `CHANGELOG.md`. **M22:** `docs/MARCA.md` (novo), `tests/test-brand.js` (novo), `index.html`, `manifest.webmanifest`, `landing.html`, `scripts/check-release.js`, `scripts/security-txt.js`, `SECURITY.md`, `SECURITY_INCIDENT_RESPONSE.md`, `README.md`, `CHANGELOG.md`. **M23:** `landing.html`, `css/landing.css`, `service-worker.js` (v63), `tests/test-brand.js`, `tests/test-responsible-disclosure.js`, `tests/test-third-party-transparency.js`, `README.md`, `docs/VERSIONAMENTO.md`, `docs/ARMAZENAMENTO-E-PRIVACIDADE.md`, `CHANGELOG.md`. **M24:** `js/screens/onboarding.js`, `js/app.js`, `js/actions.js`, `css/screens/notifications-onboarding.css`, `service-worker.js` (v64), `js/modules/app.generated.js`, `tests/test-onboarding.js`, `tests/browser/run-browser.js`, `tests/browser/run-pwa.js`, `README.md`, `docs/VERSIONAMENTO.md`, `docs/ARMAZENAMENTO-E-PRIVACIDADE.md`, `CHANGELOG.md`. **M32/M33:** `tests/test-anomalies-subscriptions.js` (novo), `tests/helpers/fixed-clock.js` (novo), `tests/test-health.js`, `tests/test-insights-engine.js`, `tests/test-render.js`, `tests/test-reserve-and-close.js`, `js/forecast.js`, `js/analytics.js`, `js/advisor.js`, `js/recurring.js`, `js/storage.js`, `js/screens/insights.js`, `js/screens/subscriptions.js`, `js/app.js`, `js/actions.js`, `css/screens/intelligence.css`, `service-worker.js` (v70), `js/modules/app.generated.js`, `README.md`, `docs/VERSIONAMENTO.md`, `docs/ARMAZENAMENTO-E-PRIVACIDADE.md`, `CHANGELOG.md`. **M30/M31:** `tests/test-daily-and-purchase.js` (novo), `js/forecast.js`, `js/insights.js`, `js/screens/calendar.js`, `js/screens/simulate.js`, `js/app.js`, `css/screens/planning.css`, `service-worker.js` (v69), `js/modules/app.generated.js`, `README.md`, `docs/VERSIONAMENTO.md`, `docs/ARMAZENAMENTO-E-PRIVACIDADE.md`, `CHANGELOG.md`. **M28/M29:** `tests/test-reserve-and-close.js` (novo), `js/metrics.js`, `js/forecast.js`, `js/screens/health.js`, `js/screens/calendar.js`, `css/screens/health.css`, `css/screens/planning.css`, `service-worker.js` (v68), `js/modules/app.generated.js`, `README.md`, `docs/VERSIONAMENTO.md`, `docs/ARMAZENAMENTO-E-PRIVACIDADE.md`, `CHANGELOG.md`. **M27:** `tests/test-score-explainable.js` (novo), `js/score.js`, `js/screens/health.js`, `css/screens/health.css`, `service-worker.js` (v67), `js/modules/app.generated.js`, `README.md`, `docs/VERSIONAMENTO.md`, `docs/ARMAZENAMENTO-E-PRIVACIDADE.md`, `CHANGELOG.md`. **M26:** `tests/test-local-only-notice.js` (novo), `js/app.js`, `js/actions.js`, `js/screens/dashboard.js`, `css/screens/dashboard.css`, `css/components.css`, `service-worker.js` (v66), `js/modules/app.generated.js`, `README.md`, `docs/VERSIONAMENTO.md`, `docs/ARMAZENAMENTO-E-PRIVACIDADE.md`, `CHANGELOG.md`. **M25:** `js/demo.js` (novo), `tests/test-demo-mode.js` (novo), `js/app.js`, `js/actions.js`, `js/screens/onboarding.js`, `css/components.css`, `service-worker.js` (v65), `scripts/build-app-module.js`, `js/modules/app.generated.js`, `README.md`, `docs/VERSIONAMENTO.md`, `docs/ARMAZENAMENTO-E-PRIVACIDADE.md`, `CHANGELOG.md`. |
| Migration do M13 | `20260831120000_database_schema_version.sql` — **aplicada e confirmada em produção em 2026-08-31** (`database_schema_version = 1`; grants inalterados: só `service_role` e `postgres`). Reversível por `alter table public.cofre_sync_config drop column if exists database_schema_version;` |
| Migrations criadas até aqui | `20260828120000_rls_auto_enable_least_privilege.sql`, `20260828130000_rls_auto_enable_versionada.sql`, `20260828140000_menor_privilegio_tabelas.sql` (as três **aplicadas e confirmadas em 2026-08-28**), `20260828150000_rls_auto_enable_gatilho.sql` (**ainda não aplicada**; é no-op em produção, onde o gatilho já existe) |
| Versão do app | `0.30.0` (package.json) |

### Ambiente de execução (RESOLVIDO)

**Atualização do M9 em 2026-08-30:** o bloco histórico abaixo não descreve mais
esta máquina. `node` v24.19.0, `npm` e as dependências do projeto estão no PATH.
Chromium, Firefox e WebKit do Playwright estão instalados, `npm run test:browser`
executa os três e `npm run test:pwa` executa o fluxo offline real. A cobertura e
a recriação de `dist/` também funcionaram nesta árvore.

Não há Node.js instalado nesta máquina (`node`/`npm`/`npx` fora do PATH; nada em
`Program Files`, `AppData\Local` ou `AppData\Roaming`; máquina corporativa JSL SA).

**Contorno em uso:** o Electron do VS Code roda como Node.

```sh
export ELECTRON_RUN_AS_NODE=1
"/c/Users/renan.mresende/AppData/Local/Programs/Microsoft VS Code/Code.exe" tests/run-all.js
```

Há um atalho `node` gravado no scratchpad da sessão (`.../scratchpad/bin/node`); basta
pô-lo no PATH. **Node v24.18.1** (o projeto declara `engines: 22.x`; a suíte roda igual
em 24 — divergência conhecida, sem efeito observado).

**`npm` não existe.** Rodar os scripts do `package.json` pelo comando equivalente:

| Script npm | Comando equivalente |
|---|---|
| `npm run lint` | `node scripts/lint.js` |
| `npm test` | `node tests/run-all.js` |
| `npm run check:build` | `node scripts/build-app-module.js --check` |
| `npm run build` | `node scripts/build-app-module.js` |
| `npm run check:release` | `node scripts/check-release.js` |
| `npm run build:dist` | `node scripts/build-dist.js` |
| `npm run test:browser` | `node tests/browser/run-browser.js` (exige Playwright — **indisponível aqui**) |

**Duas limitações que sobram, ambas do OneDrive, nenhuma do código:**

1. `node scripts/coverage.js` falha de forma reprodutível com `EPERM ... syscall: 'rm'`
   ao apagar `coverage/`: o OneDrive mantém handle aberto no diretório. A cobertura
   continua sendo medida **pela CI**.
2. Pela mesma causa, testes que recriam diretórios (`dist/`, `coverage/tmp`) podem
   falhar **esporadicamente** com EPERM. Aconteceu uma vez com
   `test-service-worker-update.js`, que passou sozinho (16/16) e passou na re-execução
   completa da suíte. **Falha isolada de EPERM não é regressão — re-execute antes de
   investigar.**

**Contorno para as duas:** copiar a árvore para fora do OneDrive e rodar lá.

```sh
tar -cf - --exclude=.git --exclude=coverage --exclude=dist \n  --exclude='tests/browser/screenshots' . | (cd "$DESTINO" && tar -xf -)
```

Com isso a suíte fecha 49/49 e a cobertura roda (21,9%, piso 20%). **É assim que
cada módulo deve ser validado**; rodar dentro do OneDrive dá falso vermelho.

Playwright não está instalado localmente; `test:browser` continua só na CI, que segue
sendo o validador final (`.github/workflows/ci.yml`).

---

## M0 — Auditoria e baseline

### Antes (situação encontrada)

Aplicação em produção, madura, com auditoria anterior já executada (`AUDIT_FIX_PROGRESS.md`).
Postura de segurança bem acima da média para um projeto deste porte. Nenhuma alteração
foi feita neste módulo.

### Stack e estrutura

| Camada | Tecnologia |
|---|---|
| Frontend | HTML/CSS/JS puro, **sem framework**, sem bundler de terceiros |
| Build | scripts próprios em Node (`scripts/build-app-module.js` gera `js/modules/app.generated.js`, 1,8 MB) |
| Entrega | Vercel (estático + funções), `vercel.json`; `api/_adaptar.js` adapta handlers Netlify para Vercel |
| Backend | `netlify/functions/{account,sync,analyze}.js` (fonte única das duas plataformas) |
| Banco | Supabase / PostgreSQL, 6 migrations versionadas |
| Local | IndexedDB (fonte da UI) + espelho em localStorage + fila `outbox` |
| PWA | `service-worker.js` v59, `manifest.webmanifest` |
| IA | Anthropic Messages API (`claude-haiku-4-5`), chamada **só pelo backend** |
| Testes | runner próprio (`tests/run-all.js`), 49 arquivos + Playwright (chromium/firefox/webkit) |
| Node | 22.x (engines) |

Diretórios: `js/` (79 arquivos, domínio + `js/screens/` + `js/modules/`), `css/` (dividido
por tela), `api/`, `netlify/functions/`, `supabase/migrations/`, `tests/`, `scripts/`,
`docs/`, `vendor/pdfjs`, `icons/`, `fonts/`.

Documentação existente e confiável — **usar em vez de reler código**:
`docs/ARCHITECTURE.md`, `docs/SYNC_PROTOCOL.md` (435 linhas, excelente),
`docs/BACKEND_SETUP.md`, `docs/RELEASE.md`, `docs/PROXIMA-SESSAO.md` (achados de beta
pendentes: F-06 a F-17), `docs/LEGAL-LAUNCH.md`, `docs/FONTES-FINANCEIRAS.md`.

### Rotas do app (hash-based, `js/router.js`)

23 telas: `dashboard(inicio)`, `add(novo)`, `analytics(analises)`, `goals(metas)`,
`settings(ajustes)`, `privacy(privacidade)`, `account(conta-e-acesso)`, `import(importar)`,
`simulate(simular)`, `subscriptions(assinaturas)`, `health(saude)`, `wealth(patrimonio)`,
`calendar(calendario)`, `invest(investir)`, `simulators(simuladores)`,
`achievements(conquistas)`, `insights(central)`, `notifications(avisos)`,
`accounts(contas)`, `debts(dividas)`, `all(tudo)`, `rules(regras)`, `categories(categorias)`.
11 camadas sobrepostas (overlays) fora do hash, empilhadas em `history.state`.

### Backend — rotas

`/api/account/{session,register,login,recover,resend,verify,exchange,logout,password,devices,revoke-device,delete}`
`/api/sync/{health,changes,reset,checkpoints,checkpoint,snapshot}`
`/api/analyze`

### Banco — tabelas e funções

Tabelas (todas com RLS habilitado): `cofre_financial_snapshots`, `cofre_devices`,
`cofre_mutations`, `cofre_sync_state`, `cofre_sync_ops`, `cofre_sync_checkpoints`,
`cofre_sync_checkpoint_rows`, `cofre_rate_limit`, `cofre_sync_config`.

Funções `security definer`, todas com `revoke all ... from public, anon, authenticated`
+ `grant execute ... to service_role`: `cofre_commit_snapshot`, `cofre_apply_ops`
(3 assinaturas), `cofre_reset_data` (3 assinaturas), `cofre_purge_account`,
`cofre_create_checkpoint`, `cofre_rate_hit`, `cofre_hlc_successor`.

### Versionamento hoje (insumo do M13)

| Versão | Onde | Valor |
|---|---|---|
| APP_VERSION | `package.json` **e** `js/safe-errors.js:7` (duplicado, risco de divergir) | `0.30.0` |
| LOCAL_SCHEMA_VERSION | `js/storage.js:267` (`SCHEMA_VERSION`) | `22` |
| IndexedDB | `js/storage.js:21` (`DB_VERSION`) | `4` |
| SYNC_PROTOCOL | `netlify/functions/sync.js` + tabela `cofre_sync_config` | `3` (mínimo de escrita: `2`) |
| Service Worker | `service-worker.js` | `v59` |
| DATABASE_SCHEMA | — | **não existe versão explícita** |

### Armazenamento local (insumo do M8)

localStorage: `financas_theme`, `cofre_device_id`, `cofre_active_scope`,
`cofre_build_reload`, `financas_safe_errors_v1`, `cofre_sync_cursor[__<escopo>]`,
`cofre_sync_seeded__<escopo>`, `financas_pro_v2` (legado), `financas_db_fallback`,
**`financas_db_mirror`** (espelho síncrono anti-perda), `financas_db_undo`,
`financas_db_outbox|meta|recovery[__<escopo>]`, `financas_db_clock[__<escopo>]`,
`financas_db_reset_barrier[__<escopo>]`.
IndexedDB: `financas_db` (visitante) / `financas_db__u_<id>` (por conta), versão 4.
Cookies: `HttpOnly; SameSite=Lax; Secure` — access, refresh, verifier PKCE, device secret.
**Confirmado em produção:** `financas_db_mirror` guarda a base financeira em texto no
localStorage. É deliberado (anti-perda), mas precisa entrar no inventário do M8/M18.

### Baseline de produção (medida agora, `https://financemanager.dev.br`)

Cabeçalhos entregues em `/` e `/index.html`:

```
content-security-policy: default-src 'self'; script-src 'self'; script-src-attr 'none';
  style-src 'self'; style-src-attr 'none'; font-src 'self'; img-src 'self' data: blob:;
  connect-src 'self' https://*.gov.br; worker-src 'self'; frame-ancestors 'none';
  base-uri 'self'; form-action 'none'; object-src 'none'
strict-transport-security: max-age=63072000
x-content-type-options: nosniff        x-frame-options: DENY
referrer-policy: strict-origin-when-cross-origin
permissions-policy: camera=(self), geolocation=(), microphone=(), payment=(), interest-cohort=()
cross-origin-opener-policy: same-origin
access-control-allow-origin: *   ← apenas em estáticos (padrão Vercel); ausente na API
```

CSP **já é restritiva**: sem `unsafe-inline`, sem `unsafe-eval`. O M5 é muito menor do
que o prompt supunha — sobram ajustes finos, não uma implantação.

Sondagens (GET, sem efeito colateral):

| Alvo | Resultado |
|---|---|
| `/api/sync/health` | 400 `protocol_mismatch` (correto: falta cabeçalho), `cache-control: no-store`, **sem CORS `*`** |
| `/api/account/session` | 200 `{ok:true, configured:true, authenticated:false}` |
| `/.well-known/security.txt` | **404** → M21 confirmado |
| `/robots.txt` | **404** |
| `/manifest.webmanifest`, `/service-worker.js` | 200 |
| Carga de `/index.html` | 27 recursos, **0 erro**, **0 recurso 4xx/5xx**, SW registrado, `financas_db` v4 criado |

Cobertura de testes: **21,9% global** (piso configurado: 20%), 69 arquivos.
Piores: `js/actions.js` 0,2%, `js/screens/accounts.js` 1,3%, `js/screens/privacy.js` 1,6%,
`js/screens/debts.js` 2,4%, `js/screens/analytics.js` 4,0%. Insumo do M15.

### Riscos e achados do M0 (classificados)

| # | P | Achado | Módulo |
|---|---|---|---|
| R1 | ~~P0~~ **P2** | `public.rls_auto_enable()` **não existe em nenhuma migration do repositório**. Ela só existe no banco de produção — foi criada fora do versionamento. Há **drift entre o banco real e as migrations**. Definição capturada em 2026-08-28 e versionada. **Reclassificado para P2: o alerta não é explorável** — função que devolve `event_trigger` não pode ser chamada diretamente e o PostgREST não a publica. Ver adendo do M1. | M1 |
| R2 | P3 | ~~Sem Node local~~ **resolvido** via Electron do VS Code. Resta: `coverage` e Playwright indisponíveis localmente (OneDrive/ausência), e `js/modules/app.generated.js` continua exigindo `node scripts/build-app-module.js` a cada alteração em `js/**`. | todos |
| R3 | P2 | `/.well-known/security.txt` e `/robots.txt` ausentes em produção. | M21 |
| R4 | P2 | HSTS sem `includeSubDomains` nem `preload`. Ativar exige certeza sobre subdomínios. | M5 |
| R5 | P2 | **A marca "FinanceManager" não aparece em nenhum arquivo do projeto.** O produto se chama "Cofre" no `<title>`, no manifest, na landing (16 ocorrências) e na UI; "FinanceManager" existe apenas no domínio. Não é ambiguidade de marca — é ausência total de uma delas no código. | M22 |
| R6 | P2 | `APP_VERSION` duplicada (`package.json` + `js/safe-errors.js`), sem amarração. | M13 |
| R7 | P3 | `financas_db_mirror` mantém a base financeira em texto claro no localStorage (decisão anti-perda deliberada; precisa ficar documentada, não removida). | M8/M18 |
| R8 | ~~P3~~ **FECHADO** | A medição de 21,9% estava incorreta por um erro na agregação entre processos. O M15 corrigiu o cálculo e cobriu a orquestração crítica de `js/actions.js`: 79,0% global e 41,7% no arquivo. | M15 |
| R9 | P3 | Achados de beta ainda abertos em `docs/PROXIMA-SESSAO.md`: F-06 (bundle sem minificação), F-08 a F-17 (UX/acessibilidade). Absorver nos módulos correspondentes em vez de duplicar. | M38/M39 |
| — | — | Item 17 de `AUDIT_FIX_PROGRESS.md` continua PENDENTE (teclado/ARIA/contraste). O item 19 foi concluído no M9. | M39 |

### O que o prompt supunha e a auditoria **não** confirmou

Registrado para não gastar tokens depois:

- **M5 (CSP)** — já implantada e restritiva, sem `unsafe-inline`/`unsafe-eval`. Escopo real: HSTS, `security.txt`, revisão de `connect-src`.
- **M2 (service_role)** — `netlify/functions/sync.js` já passa `p_user_id: session.user.id`, obtido da sessão validada; **nunca do corpo**. `requireSession` compara o `sub` do JWT com `X-Account-Id` antes de tocar em dados. Ainda exige varredura completa, mas a hipótese central do prompt já está endereçada.
- **M3 (RLS)** — tabelas sem policy são **deliberadamente server-only**, com `revoke all ... from anon, authenticated` e comentário explicando. Não criar policy para calar linter, exatamente como o prompt pede.
- **M4 (XSS)** — apenas 10 sinks de HTML em todo o código-fonte; `escapeHtml()` (`js/utils.js:379`) é usado de forma disciplinada nas telas (350+ chamadas). O trabalho é achar lacunas, não implantar a defesa.
- **M24 (onboarding)** — **já existe** e já é curto: 4 passos (Boas-vindas/Renda/Conta/Orçamento) com "Pular por agora". Escopo vira refino.
- **M9 (SW)** — já separa `CACHE_NAME` (shell) de `PAGE_CACHE` (landing) de `FONT_CACHE`, e `/api/` nunca toca no cache. Verificado no fonte.
- Nenhum segredo versionado; `.gitignore` cobre `.env*`; CI com `permissions: contents: read`.

### Alterações / Motivo / Compatibilidade

Nenhuma alteração de código. Criado apenas este arquivo. Retrocompatibilidade
integralmente preservada por não haver mudança.

### Testes realizados no M0

| Teste | Resultado |
|---|---|
| Carga de `/index.html` em produção, console e rede | **PASSOU** — 0 erro, 0 recurso com falha |
| Registro do Service Worker | **PASSOU** — escopo `https://www.financemanager.dev.br/` |
| Criação do IndexedDB visitante | **PASSOU** — `financas_db` v4 |
| Cabeçalhos de segurança em produção | **PASSOU** — coletados acima |
| `/api/account/session` sem sessão | **PASSOU** — 200, `authenticated:false`, sem vazamento |
| `/api/sync/health` sem cabeçalhos | **PASSOU** — 400 `protocol_mismatch` (falha fechado) |
| Ausência de segredos no versionamento | **PASSOU** |
| `node scripts/lint.js` | **PASSOU** — 147 arquivos, 0 erro, 0 aviso |
| `node tests/run-all.js` | **PASSOU** — 49/49 arquivos (1ª execução teve 1 EPERM do OneDrive em `test-service-worker-update.js`; passou sozinho 16/16 e passou na re-execução completa) |
| `node scripts/build-app-module.js --check` | **PASSOU** — módulo gerado confere com 70 fontes |
| `node scripts/check-release.js` | **PASSOU** — `Publicação 0.30.0 verificada` (aviso conhecido: 7 campos legais do controlador ainda com marcador, ver `docs/LEGAL-LAUNCH.md`) |
| `node scripts/build-dist.js` | **PASSOU** — 38 arquivos (aviso conhecido: `SITE_URL` ausente localmente, definida na Vercel) |
| `node scripts/coverage.js` | **NÃO VALIDADO** — `EPERM` do OneDrive ao apagar `coverage/`; medida pela CI |
| `test:browser` (Playwright) | **NÃO VALIDADO** — Playwright não instalado localmente; roda na CI |

### Status

**CONCLUÍDO** — auditoria e baseline estabelecidas, sem alteração funcional.

---

## M1 — Correções críticas de segurança (`rls_auto_enable`)

### Antes (situação encontrada)

O Security Advisor do Supabase aponta `public.rls_auto_enable()` como função
`security definer` com EXECUTE para `anon` e `authenticated`. Como o PostgREST
publica o esquema `public`, isso equivale a uma rota de internet
(`POST /rest/v1/rpc/rls_auto_enable`) chamável por qualquer visitante, rodando com
os privilégios do dono da função.

**Investigação — dependências (o passo obrigatório antes de tocar em qualquer coisa):**

| Pergunta | Resposta |
|---|---|
| Quem usa? | Ninguém no projeto. `grep -rni rls_auto_enable` em `*.sql`, `*.js`, `*.md` retorna **zero** ocorrências. |
| Está em migração? | **Não.** Criada fora do versionamento — é o desvio R1 do M0. |
| O backend chama? | Não. `netlify/functions/*` só chama RPC `cofre_*`, sempre com `service: true`. |
| O Service Worker / fluxo offline dependem? | Não. Nada do cliente fala com PostgREST direto; tudo passa por `/api/`. |
| Existe fallback ligado a ela? | Não encontrado. |
| Há razão de segurança para ela existir? | **Sim, provavelmente.** O nome indica função de *event trigger* que liga RLS automaticamente em tabela nova. Isso é uma defesa, não um problema. O problema é só o privilégio. |

### Alterações

| Arquivo | O que |
|---|---|
| `supabase/migrations/20260828120000_rls_auto_enable_least_privilege.sql` | **novo.** Revoga EXECUTE de `PUBLIC`, `anon` e `authenticated` em toda sobrecarga de `public.rls_auto_enable`. |
| `supabase/tests/verify_rls_auto_enable.sql` | **novo.** Diagnóstico somente-leitura, em 5 blocos, para rodar antes e depois. **SQL puro, sem comando de psql**: a primeira versão usava `\echo` e quebrava no SQL Editor do Supabase com `syntax error at or near "\"`. No painel, rodar **um bloco por vez** — o editor mostra só o resultado da última consulta. |
| `supabase/migrations/20260828130000_rls_auto_enable_versionada.sql` | **novo.** Traz a função para o versionamento com o corpo verbatim de produção. |
| `tests/test-security.js` | blocos 7, 8 e 9 acrescentados (nada removido). |

### Motivo

Princípio do menor privilégio. Uma função administrativa não precisa de superfície
pública, e `security definer` transforma essa superfície em execução privilegiada.

**Por que o revoke não quebra o gatilho automático:** o PostgreSQL confere EXECUTE de
uma função de gatilho no momento em que o **gatilho é criado**, não a cada disparo. O
disparo é feito pelo próprio servidor dentro do evento e não consulta a ACL da função.
Retirar EXECUTE de `anon`/`authenticated` fecha a chamada por RPC e deixa o automatismo
intacto. É por isso que a correção é a **mínima possível**: um `revoke`, e nada mais.

### O que a migração deliberadamente NÃO faz

- **Não remove a função.** Ela pode sustentar o event trigger que liga RLS sozinho;
  apagá-la trocaria um risco por outro maior.
- **Não altera o corpo, o dono nem o `search_path`.** O corpo não está versionado.
  Mexer no `search_path` sem tê-lo em mãos podia quebrar justamente a parte que
  ninguém consegue revisar. Fica como **P2**, para depois da captura da definição.
- **Não revoga de `service_role` nem do dono.** Só o que o Advisor aponta.

### Compatibilidade

Total. Nenhuma rota, contrato, tabela, coluna ou chave local foi tocada. A migração é
idempotente e tolera o banco que nunca teve a função (`supabase db reset` a partir só
destas migrações), registrando um `notice` em vez de falhar. É reversível com uma linha,
documentada no cabeçalho do próprio arquivo.

### Testes

| Teste | Resultado |
|---|---|
| `node tests/test-security.js` | **PASSOU** — 59 ok, 0 falha (era 45; +14 asserções) |
| **Teste de mutação da guarda** — migração sintética com `security definer` + `grant execute ... to authenticated` | **PASSOU** — as duas asserções novas dispararam; removido o mutante, voltou a 59/0. A guarda não é decorativa. |
| **Teste de mutação da guarda de psql** — arquivo `.sql` sintético com `\echo` | **PASSOU** — a asserção disparou e apontou o arquivo; removido, voltou a 59/0. |
| `node scripts/lint.js` | **PASSOU** — 0 erro, 0 aviso |
| `node tests/run-all.js` | **PASSOU** — 49/49 (execução fora do OneDrive) |
| `node scripts/build-app-module.js --check` | **PASSOU** — 70 fontes |
| `node scripts/coverage.js` | **PASSOU** — 21,9% global, piso 20% (fora do OneDrive) |
| Aplicação da migração no banco | **NÃO VALIDADO** — sem acesso ao banco daqui |
| Event trigger continua disparando depois do revoke | **NÃO VALIDADO** — depende da aplicação |

### Adendo — a definição chegou (2026-08-28) e ela reclassifica o achado

O bloco 1 foi executado em produção e devolveu a função inteira. Três coisas mudaram.

**1. Confirmado: é event trigger, e a ACL está mesmo errada.**

```
rls_auto_enable() | dono postgres | security_definer = true | search_path = pg_catalog
retorno: event_trigger
acl: =X/postgres / postgres=X / anon=X / authenticated=X / service_role=X
```

O corpo percorre `pg_event_trigger_ddl_commands()` e, para todo `CREATE TABLE` /
`CREATE TABLE AS` / `SELECT INTO` no esquema `public`, executa
`alter table ... enable row level security`. Falha individual é engolida com
`RAISE LOG`. **É uma defesa. Não remover.**

**2. A gravidade cai de P0 para P2 — o alerta não é explorável.**

Registrado para não virar incidente por engano. `anon` e `authenticated` têm mesmo
EXECUTE, mas não existe caminho para exercê-lo:

- Função que devolve `event_trigger` **não pode ser chamada diretamente**. O plpgsql
  recusa na compilação da chamada (`trigger functions can only be called as triggers`).
- O PostgREST **não publica** função com retorno de pseudo-tipo: ela nunca chega a
  existir como rota `POST /rest/v1/rpc/...`.

O Advisor lê a ACL, não a chamabilidade. A correção continua certa e continua valendo
— higiene de privilégio, defesa em profundidade e o alerta some — mas **não houve
exposição de dados**, e nada aqui pede comunicação de incidente.

**3. `search_path` estava melhor do que eu supunha, e ficou melhor ainda.**

Produção já tinha `search_path = 'pg_catalog'`, então o alerta clássico de
"search path mutable" não se aplica. Faltava só `pg_temp`: **quando não é listado, o
PostgreSQL o pesquisa antes de `pg_catalog`** para nomes de relação e de tipo.
Listá-lo por último inverte a ordem e fecha a classe de sombreamento por tabela
temporária. O corpo não referencia nenhuma relação por nome curto, então a mudança
não altera comportamento — só remove a possibilidade. Reversível trocando uma linha.

**4. Migração nova: `20260828130000_rls_auto_enable_versionada.sql`.**

Traz a função para o repositório (fecha o desvio R1) com o corpo verbatim de produção.

**A armadilha que ela evita:** `create or replace` preserva a ACL de uma função que já
existe, mas num banco novo (`supabase db reset`) a função **nasce com EXECUTE para
PUBLIC**. Sem o `revoke` dentro desta mesma migração, o banco novo reintroduziria
exatamente o achado que a migração anterior corrigiu no banco antigo. O teste 9 fixa a
ordem `create` → `revoke` para que isso não volte.

**Ainda pendente de propósito: o GATILHO não está versionado.** Só a função está. O
`create event trigger` continua apenas no banco (sai do bloco 3, ainda não executado).
Não foi escrito às cegas porque o nome real é desconhecido e `create event trigger`
exige superusuário — falhar nisso derrubaria a migração e travaria a publicação.
Nenhuma tabela do projeto depende do automatismo: todas as `cofre_*` ligam RLS
explicitamente na migração que as cria. O gatilho é rede de segurança para o que vier.

### Testes do adendo

| Teste | Resultado |
|---|---|
| `node tests/test-security.js` | **PASSOU** — 66 ok, 0 falha (blocos 7, 8 e 9) |
| **Mutação:** remover o `revoke` da migração de versionamento | **PASSOU** — 3 asserções dispararam, incluindo `create=43 revoke=-1` |
| **Mutação:** voltar `search_path` para só `pg_catalog` | **PASSOU** — a asserção do `pg_temp` disparou |
| `node scripts/lint.js` | **PASSOU** — 0 erro, 0 aviso |
| `node tests/run-all.js` (fora do OneDrive) | **PASSOU** — 49/49 |
| `node scripts/build-app-module.js --check` | **PASSOU** — 70 fontes |
| Aplicação das duas migrações no banco | **NÃO VALIDADO** |
| Gatilho continua disparando depois do revoke | **NÃO VALIDADO** |

### O que ainda falta para fechar o M1

1. Rodar o **bloco 3** do script de verificação: dá o nome e a configuração do event
   trigger, único item que falta para o automatismo entrar no versionamento.
2. Rodar o **bloco 5**: lista outras `security definer` expostas. Se vier vazio, a
   varredura do M2 começa limpa; se vier com linhas, são achados do M2.
3. Aplicar as duas migrações (`120000` e `130000`).
4. Rodar o **bloco 4**: deve dizer `OK: nem anon nem authenticated executam
   public.rls_auto_enable.`
5. Em staging, criar uma tabela e confirmar que ela nasce com RLS ligado.

### Status

**CONCLUÍDO** — aplicado em 2026-08-28 e confirmado no banco: `OK: nem anon nem
authenticated executam public.rls_auto_enable.` Função e gatilho versionados.

---

## M2 — Auditoria de service_role e autorização (IDOR/BOLA)

### Antes (situação encontrada)

O prompt supunha que endpoints privilegiados pudessem confiar num `user_id` vindo do
cliente. **Não é o caso.** A auditoria cobriu as 12 chamadas com `service_role`, as
4 leituras por RLS, o adaptador da Vercel e a cadeia de sessão inteira.

### Inventário das 12 chamadas com `service_role`

| Onde | O que faz | Como é escopada |
|---|---|---|
| `account.js:257` | lê aparelho (`touchDevice`) | `deviceLookupPath(userId, deviceId)` — filtra `user_id=eq.` |
| `account.js:273` | marca atividade do aparelho | filtro por `user_id` + `secret_hash` + `revoked_at is null` |
| `account.js:287` | lê aparelho (`authorizeDevice`) | `deviceLookupPath(userId, deviceId)` |
| `account.js:303` | reativa aparelho e troca segredo | filtro por `user_id` e `device_id` |
| `account.js:312` | insere aparelho | linha nasce com `user_id: userId` |
| `account.js:560` | revoga aparelho | `user_id=eq.${session.user.id}` |
| `account.js:594` | `rpc/cofre_purge_account` | `p_user_id: session.user.id` |
| `sync.js:52` | lê `cofre_sync_config` | linha única `id=1`, configuração global sem dado de usuário |
| `sync.js:182` | `rpc/cofre_apply_ops` | `p_user_id: session.user.id` |
| `sync.js:276` | `rpc/cofre_reset_data` | `p_user_id: session.user.id` |
| `sync.js:330` | `rpc/cofre_create_checkpoint` | `p_user_id: session.user.id` |
| `rate-limit.js:94` | `rpc/cofre_rate_hit` | identidade já em HMAC-SHA256, sem id de usuário |

Mais `supabase-rest.js:180` (`auth/v1/admin/users/<id>`), chamada em um único ponto e
sempre com `session.user.id`.

**`p_user_id` aparece 4 vezes no backend inteiro e é `session.user.id` nas 4.**
`body.userId`, `body.user_id` e `body.accountId` não existem no backend.

### A cadeia de identidade

`sessionOf` chama `api.auth.user(token)` — ou seja, `GET /auth/v1/user` no Supabase,
que **confere a assinatura do JWT**. A identidade não é decodificada aqui.

`jwtSubjectOf` decodifica sem verificar, mas só é usado em
`rejectClaimedAccountMismatch`, para **recusar cedo** — igualdade nunca autoriza. O
código diz isso num comentário e o teste novo fixa a regra.

`X-Account-Id` nunca autoriza sozinho: `requireAccountScope` compara com
`session.user.id` e devolve `403 account_scope_changed` na divergência.

### IDOR do checkpoint: verificado e fechado

O ponto clássico de IDOR é `GET /api/sync/checkpoint?id=<uuid>`. Conferido:
`cofre_sync_checkpoint_rows` tem coluna `user_id`, RLS habilitado, policy
`for select to authenticated using ((select auth.uid()) = user_id)`, e `authenticated`
só tem `select`. A leitura usa `{ token: session.token }`, então o PostgREST resolve
`auth.uid()` do JWT e o RLS recorta. **Saber o UUID do checkpoint alheio não basta.**

### CSRF

`assertSameOrigin` em todo método diferente de GET, em `account.js` e `sync.js`;
`analyze.js` tem allowlist própria que **falha fechada**. Cookies são
`HttpOnly; SameSite=Lax; Secure`. Origem ausente é recusada, não tratada como própria.

Testado em produção com preflight `OPTIONS /api/analyze` mandando
`X-Forwarded-Host: evil.example`: a resposta continuou ecoando
`https://www.financemanager.dev.br`. **O caminho de origem derivada do cabeçalho não é
alcançável do cliente em produção** — mas o teste não distingue se isso vem de
`ALLOWED_ORIGIN` estar configurada ou de a Vercel sobrescrever o cabeçalho. Ver M2-03.

### Injeção no filtro do PostgREST

Ids de aparelho entram em filtros PostgREST. São validados antes por conjunto fechado
(`^[A-Za-z0-9][A-Za-z0-9:_-]{7,79}$`) e passam por `encodeURIComponent`. `secret_hash`
é hex de SHA-256. O cursor de checkpoint é base64url com entidade validada contra
`OP_ENTITIES` e id contra regex. **Nenhum ponto de injeção encontrado.**

### Alterações

| Arquivo | O que |
|---|---|
| `tests/test-service-role-scope.js` | **novo.** 27 asserções estruturais sobre o código do backend. |

**Nenhuma linha de backend foi alterada.** A auditoria não encontrou o que corrigir; o
que faltava era impedir a regressão. Os testes existentes
(`test-account-backend`, `test-device-revocation-backend`, `test-session-scope-backend`,
`test-user-isolation`) cobrem o que o backend **faz**; este cobre o que ele **não pode
passar a fazer**.

O teste recorta cada `api.db(...)` contando parênteses — expressão regular não serve,
porque os argumentos têm objetos, template strings e parênteses aninhados, e um recorte
errado classificaria a chamada errada. Comentário de linha inteira sai antes: a prosa
deste projeto cita `service: true` e `p_user_id` ao explicar as regras.

### Achados (nenhum P0 ou P1)

| # | P | Achado | Vai para |
|---|---|---|---|
| M2-01 | **P2** | `POST /api/account/password` troca a senha **sem pedir a senha atual**. Sessão roubada vira tomada permanente da conta, e o dono não é avisado nem expulso. Contrasta com `delete`, que já exige senha + frase de confirmação. | **M6** (é o item "reautenticação antes de ações críticas"; entra lá, não aqui) |
| M2-02 | P3 | As leituras por RLS não repetem `user_id=eq.` no caminho. É o desenho: o RLS recorta. Mas se o RLS de uma tabela fosse desligado por engano, essas quatro leituras viravam IDOR silencioso. O teste novo cobre o inverso (não trocar `token` por `service_role`); o filtro redundante seria defesa em profundidade. | registrado, sem ação |
| M2-03 | P3 | Sem `ALLOWED_ORIGIN` configurada, `allowedOrigins()` deriva a origem de `x-forwarded-host`, que é cabeçalho da requisição. O projeto já resolveu isso para o link de e-mail (`canonicalOrigin`), mas `assertSameOrigin` continua no caminho antigo. Não alcançável em produção hoje. | **M5** (precisa confirmar se `ALLOWED_ORIGIN` está definida na Vercel) |
| M2-04 | P3 | `RATE_LIMIT_SECRET` cai para `SUPABASE_SERVICE_ROLE_KEY` quando não definida. Funciona, mas amarra o tempero do HMAC ao segredo mais sensível: **girar a chave de serviço zera todos os baldes de rate limit**, porque as identidades passam a gerar outro hash — e girar a chave é exatamente o que se faz depois de um vazamento, quando o limite mais importa. | **M17/M6** |

### Compatibilidade

Total. Nenhum arquivo de produção foi tocado — só um arquivo de teste novo.

### Testes

| Teste | Resultado |
|---|---|
| `node tests/test-service-role-scope.js` | **PASSOU** — 27 ok, 0 falha |
| **Mutação 1** — `p_user_id: session.user.id` → `body.userId` | **PASSOU** — 3 asserções dispararam |
| **Mutação 2** — leitura de checkpoint troca `{token}` por `{service: true}` | **PASSOU** — 3 asserções dispararam |
| **Mutação 3** — remover `assertSameOrigin` de `sync.js` | **PASSOU** — 1 asserção disparou |
| **Mutação 4** — identidade decodificada localmente em vez de validada no provedor | **PASSOU** — 2 asserções dispararam |
| Preflight em produção com `X-Forwarded-Host` forjado | **PASSOU** — origem ecoada continuou a canônica |
| `node scripts/lint.js` | **PASSOU** — 0 erro, 0 aviso |
| `node tests/run-all.js` (fora do OneDrive) | **PASSOU** — 50/50 |
| `node scripts/coverage.js` | **PASSOU** — 21,9%, piso 20% |
| Tentativa real de ler dados de outro usuário contra produção | **NÃO VALIDADO** — exige duas contas de teste; não se ataca produção (regra do próprio prompt) |

### Status

**CONCLUÍDO** — auditoria completa, nenhuma vulnerabilidade de autorização encontrada,
invariantes travados por teste. Os quatro achados são P2/P3 e estão endereçados aos
módulos donos.

---

## M3 — RLS e princípio do menor privilégio

### Antes (situação encontrada)

Nove tabelas `cofre_*`, todas com RLS habilitado. Seis policies, todas de `select`,
todas `to authenticated` com `(select auth.uid()) = user_id`. Nenhuma policy de escrita:
toda escrita passa por RPC `security definer`.

**Resultado do bloco 5 do M1, executado em produção:** a varredura de `security definer`
expostas devolveu **só `rls_auto_enable`** (uma linha por papel). Nenhuma outra função
privilegiada é executável por `anon`/`authenticated`. Isso confirma que, quanto a
privilégio de função, **as migrações descrevem o banco real** — não há mais desvio.

### O achado: o privilégio padrão do Supabase nunca foi desfeito em duas tabelas

O Supabase concede `ALL` sobre toda tabela nova do esquema `public` para `anon`,
`authenticated` e `service_role`, por `alter default privileges`. **Uma tabela nasce
aberta**, e é a migração que precisa fechá-la. As migrações do projeto fazem isso caso a
caso — e duas passaram sem a parte de `authenticated`:

| Tabela | O que a migração fez | O que ficou |
|---|---|---|
| `cofre_financial_snapshots` | `revoke all ... from anon` + `grant select to authenticated` | **conceder não revoga**: `insert`, `update` e `delete` do privilégio padrão continuam |
| `cofre_mutations` | `revoke all ... from anon`, e nada mais | `authenticated` provavelmente mantém `ALL` |

**Hoje o RLS segura, e é exatamente esse o problema.** As duas têm RLS ligado;
`cofre_financial_snapshots` só tem policy de `select` e `cofre_mutations` não tem policy
nenhuma, então escrita já é negada. Não há falha explorável hoje.

Mas é **uma camada só**. Uma policy escrita sem cuidado, ou um
`disable row level security` num diagnóstico às pressas, transformaria privilégio
esquecido em escrita real sobre o diário financeiro e sobre o registro de idempotência.
Privilégio que ninguém usa não deve existir: é a diferença entre "não dá porque a porta
está trancada" e "não dá porque não existe porta".

### Confirmação no banco real (2026-08-28, bloco 5 do `verify_table_privileges.sql`)

O achado não era hipótese sobre o privilégio padrão do Supabase. É o estado de produção:

```
tabela,problema
cofre_financial_snapshots,escrita concedida a authenticated: DELETE
cofre_financial_snapshots,escrita concedida a authenticated: INSERT
cofre_financial_snapshots,escrita concedida a authenticated: TRUNCATE
cofre_financial_snapshots,escrita concedida a authenticated: UPDATE
cofre_mutations,escrita concedida a authenticated: DELETE
cofre_mutations,escrita concedida a authenticated: INSERT
cofre_mutations,escrita concedida a authenticated: TRUNCATE
cofre_mutations,escrita concedida a authenticated: UPDATE
```

**Exatamente as duas tabelas previstas, e só elas.** O resto da matriz veio limpo:

- nenhuma linha `RLS DESLIGADO` → as nove têm RLS ligado;
- nenhuma linha `leitura concedida a anon` → `anon` não lê nada;
- nenhuma linha `policy permissiva demais` → nenhuma policy com `using (true)` nem sem
  condição;
- as outras sete tabelas não aparecem → os `revoke ... from authenticated` das
  migrações `202608180001`, `202608180002` e `202608200001` funcionaram.

Ou seja: a migração do M3 acerta o alvo e não precisa tocar em mais nada.

### Correção de uma coisa que eu disse antes: TRUNCATE não é coberto por RLS

Eu escrevi que "hoje o RLS segura" as quatro escritas. Isso vale para `INSERT`,
`UPDATE` e `DELETE`, que são filtrados por policy — e como não existe policy de escrita,
são negados.

**`TRUNCATE` não.** As policies do PostgreSQL se aplicam a `SELECT`, `INSERT`, `UPDATE`,
`DELETE` e `MERGE`. `TRUNCATE` não tem conceito de linha, não é filtrado por RLS e
depende só do privilégio `TRUNCATE` — que `authenticated` possui nas duas tabelas.

O que impede hoje **não é o RLS**: é o PostgREST não ter como emitir `TRUNCATE`. Ele
expõe `SELECT`/`INSERT`/`UPDATE`/`DELETE` pelos verbos HTTP e funções por RPC; um
`DELETE` sem filtro vira `DELETE` (filtrado por RLS), nunca `TRUNCATE`. E nenhuma função
do projeto executa `TRUNCATE`. Não há caminho vivo.

Continua **P2**, não explorável. Mas a garantia é mais fina do que eu disse: para três
privilégios o RLS é a rede; para o quarto a rede é "nenhuma rota emite esse comando". A
migração cobre os quatro, porque `revoke all` inclui `TRUNCATE`.

### Confirmado no banco depois de aplicar (2026-08-28)

**M1 — veredito do `verify_rls_auto_enable.sql`:**
`OK: nem anon nem authenticated executam public.rls_auto_enable.`
As migrações `120000` e `130000` pegaram.

**Gatilho (bloco 3):** `ensure_rls`, evento `ddl_command_end`, `evtenabled = 'O'`
(estado normal, habilitado), chamando `rls_auto_enable()`. O automatismo está de pé em
produção; a migração `150000` só importa para banco novo.

**M3 — bloco 4 (todas as policies, por extenso):** seis policies, e nada além delas.

```
cofre_devices               owner reads devices          SELECT  authenticated  ((SELECT auth.uid()) = user_id)  null
cofre_financial_snapshots   owner reads snapshot         SELECT  authenticated  ((SELECT auth.uid()) = user_id)  null
cofre_sync_checkpoint_rows  owner reads checkpoint rows  SELECT  authenticated  ((SELECT auth.uid()) = user_id)  null
cofre_sync_checkpoints      owner reads checkpoints      SELECT  authenticated  ((SELECT auth.uid()) = user_id)  null
cofre_sync_ops              owner reads sync ops         SELECT  authenticated  ((SELECT auth.uid()) = user_id)  null
cofre_sync_state            owner reads sync state       SELECT  authenticated  ((SELECT auth.uid()) = user_id)  null
```

Confirma no banco real o que o teste afirma sobre as migrações:

- **nenhuma policy de escrita** — as seis são `SELECT`, e `com_verificacao` é nulo em
  todas. Não há caminho de escrita direta pelo PostgREST;
- **nenhuma `using (true)`** — as seis comparam `auth.uid()` com `user_id`;
- **nenhuma vale para `anon`** — as seis são `to authenticated`;
- `cofre_mutations`, `cofre_rate_limit` e `cofre_sync_config` **não aparecem**: o trio
  server-only continua sem policy, negando por ausência, como projetado.

A forma `(select auth.uid())` em vez de `auth.uid()` direto é a recomendada pelo
Supabase: o planejador a avalia uma vez como initplan em vez de por linha.

**Falta ainda o bloco 5** (`tabela, problema`), que é o que confirma se o `revoke` da
migração `140000` desfez os oito privilégios de escrita.

### Consumidores conferidos antes de revogar

Busca por `cofre_financial_snapshots` e `cofre_mutations` em `netlify/`, `api/` e `js/`:
**nenhuma ocorrência**. As duas só são tocadas por funções `security definer` que rodam
com `service_role`, e `service_role` tem concessão própria, não herdada de
`authenticated`. Revogar não alcança nenhum caminho vivo.

### A armadilha que a auditoria evitou

`cofre_devices` **fica de fora de propósito**. Ela usa concessão **por coluna**
(`grant select (user_id, device_id, label, first_seen_at, last_seen_at, revoked_at)`, mais
`device_type` na migração `20260825001552`) — é assim que `secret_hash` nunca chega ao
cliente. Um `revoke all ... from authenticated` "por simetria" apagaria as concessões das
duas migrações e quebraria `GET /api/account/devices`, que lê a lista com o token do
usuário. O teste novo fixa isso nos dois sentidos: a tabela não pode receber `grant
select` de tabela inteira, e a migração do M3 não pode mencioná-la.

### Alterações

| Arquivo | O que |
|---|---|
| `supabase/migrations/20260828140000_menor_privilegio_tabelas.sql` | **novo.** Revoga o privilégio padrão sobrando nas duas tabelas; reconcede só `select` em `cofre_financial_snapshots`; documenta as três tabelas server-only com `comment on table`. |
| `supabase/tests/verify_table_privileges.sql` | **novo.** Matriz de RLS, policies e privilégios de tabela e de coluna, em 5 blocos somente-leitura. |
| `tests/test-rls-least-privilege.js` | **novo.** 21 asserções sobre as migrações. |

### RLS sem policy: decisão, não esquecimento

O linter do Supabase avisa "RLS habilitado sem policy" em `cofre_mutations`,
`cofre_rate_limit` e `cofre_sync_config`. **O aviso está certo quanto ao fato e errado
quanto à conclusão.** Criar policy para calá-lo abriria caminho de leitura onde hoje não
existe nenhum. As três ganharam `comment on table` explicando o porquê, para que quem
abrir o banco sem abrir o repositório leia a decisão:

- `cofre_mutations` — idempotência de escrita; só `service_role`.
- `cofre_rate_limit` — legível, seria um **oráculo**: dá para descobrir se um e-mail
  existe medindo o consumo do balde.
- `cofre_sync_config` — o cliente já recebe protocolo e mínimo de escrita no envelope
  de `/api/sync`; nunca precisa ler a tabela.

A lista de server-only é **fechada** no teste: uma tabela server-only nova precisa ser
declarada de propósito, não descoberta depois pelo linter.

### Verificações que passaram sem achado

- `cofre_purge_account` apaga das **seis** tabelas do usuário, incluindo
  `cofre_financial_snapshots` e `cofre_mutations`. Some-se a isso
  `references auth.users(id) on delete cascade` em todas. Exclusão de conta é completa —
  sem pendência de LGPD aqui.
- A restrição de entidade de `cofre_sync_ops` **foi migrada** para as 9 coleções do
  protocolo 3 (`cofre_sync_ops_entity_v3_check`, migração `202608200001`). A lista de 5
  da migração original não ficou para trás.
- `secret_hash` não aparece em `grant` nenhum.

### Achados registrados (nenhum P0/P1)

| # | P | Achado | Vai para |
|---|---|---|---|
| M3-01 | P3 | `cofre_financial_snapshots` mantém `grant select` + policy de leitura, mas **nenhum código lê a tabela**: é resíduo do protocolo 1. Preservado por ser funcionalidade declarada; remover seria arrumação, não correção. | revisão futura |
| M3-02 | P3 | `cofre_commit_snapshot` (RPC do protocolo 1) **não é chamada por lugar nenhum**. Já está com `revoke all from public, anon, authenticated`, então não há exposição — é peso morto. Não removida: é o caminho de escrita do contrato 1, e o projeto ainda declara compatibilidade de leitura com ele. | revisão futura |

### Compatibilidade

Total. Nenhum código de aplicação foi tocado. A migração só retira privilégio que
nenhum caminho vivo exerce, e reconcede explicitamente o `select` que a migração
original de `cofre_financial_snapshots` declarava. `cofre_devices` intocada. Nenhuma
policy criada ou removida, RLS de nada foi desligado. Reversível com `grant`.

### Testes

| Teste | Resultado |
|---|---|
| `node tests/test-rls-least-privilege.js` | **PASSOU** — 21 ok, 0 falha |
| **Mutação 1** — remover o revoke de `cofre_mutations` | **PASSOU** — 2 asserções dispararam |
| **Mutação 2** — policy com `using (true)` | **PASSOU** — 2 asserções dispararam |
| **Mutação 3** — `grant insert, update ... to authenticated` | **PASSOU** — 1 asserção disparou |
| **Mutação 4** — `grant select` de tabela inteira em `cofre_devices` | **PASSOU** — 1 asserção disparou |
| **Mutação 5** — policy de `insert` pelo PostgREST | **PASSOU** — 1 asserção disparou |
| `node scripts/lint.js` | **PASSOU** — 0 erro, 0 aviso |
| `node tests/run-all.js` (fora do OneDrive) | **PASSOU** — 51/51 |
| Aplicação da migração no banco | **NÃO VALIDADO** |
| Matriz real de privilégios do banco | **NÃO VALIDADO** — sai de `verify_table_privileges.sql` |

### Limitação conhecida destes scripts SQL

**Não existe PostgreSQL nesta máquina**, então os arquivos de `supabase/tests/` e as
migrações **não são executados em lugar nenhum antes de chegarem a você**. Os testes em
Node conferem o TEXTO do SQL, não a semântica. Dois erros já escaparam por isso:

1. `\echo` no primeiro `verify_rls_auto_enable.sql` — comando de psql, não SQL.
2. `p.polcmd` sem cast no `verify_table_privileges.sql` — `polcmd` é do tipo `"char"`
   do catálogo, e `text || "char"` casa com mais de um operador
   (`operator is not unique`).

Correção aplicada e generalizada: **toda coluna de catálogo agora vai com `::text`
explícito** nas concatenações (`polcmd`, `polname`, `rolname`), e a busca por `anon`
passa pelo `pg_roles` em vez de literal, para devolver zero linha em vez de exceção num
banco sem os papéis do PostgREST.

O que segura de verdade: os scripts são **somente leitura**, então o custo de um erro é
uma mensagem no editor, nunca dado alterado. As migrações, essas sim, precisam ser
aplicadas primeiro em staging.

### O que falta para fechar o M3

1. ~~Rodar o `verify_table_privileges.sql` antes~~ **FEITO em 2026-08-28**: o bloco 5
   confirmou as 8 linhas previstas e nada mais. Evidência acima.
2. Aplicar `20260828140000_menor_privilegio_tabelas.sql`.
3. Rodar o **bloco 5** de novo: deve vir **vazio**.
4. Conferir que `GET /api/account/devices` continua listando aparelhos (é a única rota
   que depende de concessão por coluna).

### Status

**CONCLUÍDO** — aplicado em 2026-08-28. O bloco 5 voltou **vazio**: os oito privilégios
de escrita sumiram, RLS segue ligado nas nove, `anon` não lê nada e nenhuma policy é
permissiva.

**Ressalva registrada:** a regressão de `GET /api/account/devices` **não foi validada**
por quem tem sessão. O risco é próximo de zero — a migração comprovadamente não
menciona `cofre_devices` (asserção do teste) e o bloco 5 não acusou nada —, mas
"próximo de zero" não é "testado". O bloco 3 do `verify_table_privileges.sql` fecha isso
no nível do banco, sem precisar de login.

---

## M4 — XSS e entradas não confiáveis

### Antes (situação encontrada)

O M0 já suspeitava que este módulo seria pequeno ("apenas 10 sinks de HTML;
`escapeHtml()` usado de forma disciplinada"). A varredura confirmou e explicou
**por que** o app resiste, o que é a parte que o M0 não tinha.

**Varredura executada** (scripts descartáveis, no scratchpad da sessão; não
versionados): extração de todo literal de template que contenha `<tag` em
`js/**` e `scripts/**`, com o contexto anterior de cada `${...}`, para saber se
a interpolação cai em texto, em atributo aspeado ou em atributo solto.
1.528 interpolações em 32 arquivos; 448 sobraram depois de descontar as
obviamente seguras; todas triadas.

| Sink | Ocorrências | Situação |
|---|---|---|
| `innerHTML` | 8 | `renderShell()` (2×), campos de arquivo fixos, tela de falha de carga, avisos/histórico do formulário, resumo e avisos da importação |
| `outerHTML` | 1 | linha da revisão de importação (`renderImportReviewRow`, escapada) |
| `insertAdjacentHTML` | 0 | — |
| `document.write` | 0 | — |
| `eval` / `new Function` | 0 | — |
| atributo **sem aspas** com interpolação | 0 | — |
| `href`/`src` dinâmico | 1 | `js/transparency.js:122`, lista constante de fontes oficiais |

**O achado central do módulo não é uma falha, é uma dependência não documentada.**
A resistência do app vem de **duas camadas**, e só a segunda é visível para
quem lê uma tela:

1. **Normalização na borda** (`js/storage.js`). Tudo que entra — backup
   restaurado (32 MB de JSON arbitrário), operação baixada da nuvem
   (`applyRemoteOps` chama `migrate()` na linha 3224), extrato importado — passa
   por `migrate()`, e lá cada campo que a interface interpola **sem escapar**
   tem alfabeto fechado:
   `normalizeRecordId` (`^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$`, com slug de
   contingência), `normalizeHexColor` (`^#[0-9a-f]{6}$`), `normalizeIconName`
   (`^[A-Za-z][A-Za-z0-9]{0,31}$`), `ACCOUNT_TYPES.includes`,
   `BUDGET_GROUPS.includes`, `isRealIsoDate`, `normalizeBudgetAlert`, `clamp`.
2. **Escape no render** (`escapeHtml`, `js/utils.js:379`, 350+ chamadas).

É a camada 1 que faz `data-ui-css="--account-color: ${a.color}"` não ser uma
quebra de atributo esperando acontecer: `a.color` só existe em `#RRGGBB`.
Nenhum comentário no código dizia isso, e nenhum teste prendia. **Foi
comprovado por teste de mutação**: enfraquecendo `normalizeHexColor` para
`color || fallback`, três telas passam a emitir atributo quebrado a partir de um
backup forjado (Início, Contas e cartões, Categorias). Ver "Testes".

### Achados

| # | P | Achado | Situação |
|---|---|---|---|
| **F4-01** | **P1** | `js/screens/analytics.js`: o cabeçalho da análise de IA renderizava `<b>${a.score}</b><span>/100</span>`, mas `normalizeAnalysis` (`netlify/functions/analyze.js:269`) **descarta o `score` do modelo de propósito**. O front nunca acompanhou: `a.score` chegava `undefined` e a tela mostrava **"undefined/100" em 38px** (`.ai-score b`, `css/components.css:522`) no topo da análise. Bug visível em produção. | **CORRIGIDO** |
| **F4-02** | P2 | `js/insights.js:439` devolve `body.analise` **cru** para `state.aiInsight`, e a tela interpola `AI_FLOW_COLOR[situacao]`, `AI_FLOW_LABEL[situacao]`, `AI_RISK_COLOR[nivel]`, `AI_RISK_LABEL[nivel]` sem repetir a whitelist do servidor. Hoje o backend valida (não é explorável), mas era a **única** barreira: era um contrato remoto sustentando o render. | **CORRIGIDO** |
| **F4-03** | P3 | `js/icons.js:85`: `ICONS[name]` lia a cadeia de protótipos. `normalizeIconName` aceita `constructor`, `toString`, `valueOf` e `hasOwnProperty` (todos casam com o alfabeto), então um backup ou registro sincronizado com `icon: "constructor"` fazia a tela desenhar `function Object() { [native code] }` dentro do `<svg>`. Não é injeção (texto nativo não tem `<`), mas é conteúdo vindo de arquivo externo aparecendo na interface. | **CORRIGIDO** |
| **F4-04** | P2 | A camada 1 não estava documentada nem coberta. Uma troca inocente (aceitar `rgb()` em `normalizeHexColor`) viraria injeção de atributo em três telas de uma vez, sem nenhum teste reprovando. | **COBERTO** por `tests/test-xss-surface.js` |
| — | — | Fluxos que a auditoria conferiu e passaram **sem achado**: importação CSV/OFX/PDF (descrição, motivo, rótulo e nomes de conta/categoria escapados), QR Code PIX/NFC-e (`js/qrcode.js`: host restrito a `.gov.br` com rótulo `sefaz`/`fazenda`, chave `^\d{44}$`, `estabelecimento` raspado com `[^<]+` e teto de 120 caracteres, tudo escapado no render), toast/`notify` (escapado), lista de dispositivos (`device.label` e `device.id` escapados, `type` por whitelist), nome do usuário (`escapeHtml` no render), exportação CSV (`csvCell` já neutraliza `= + - @ TAB` contra injeção de fórmula), PDF.js (auto-hospedado, `isEvalSupported: false`, sem `enableScripting`), backend (nenhuma função devolve HTML), `index.html`/`landing.html` (nenhum manipulador de evento em linha), `detectSubscriptions` (chave sempre contém `\|`, então `__proto__` é inalcançável). | — |

### Alterações

| Arquivo | O quê |
|---|---|
| `js/screens/analytics.js` | `renderAiStructured`: bloco da nota só sai quando `Number.isFinite(score)`, com `Math.round(clamp(score, 0, 100))`; `aiFlowKey()` e `aiRiskKey()` repetem no cliente a whitelist do servidor (`positivo/equilibrado/negativo`, `alto/medio/baixo`) |
| `js/icons.js` | `svgIcon`: busca por chave própria (`Object.prototype.hasOwnProperty.call`) em vez de leitura direta |
| `js/modules/app.generated.js` | regerado (`node scripts/build-app-module.js`, 70 fontes) |
| `tests/test-xss-surface.js` | **novo**, 85 asserções em 10 blocos |

Nenhuma mudança em contrato de API, banco, LocalStorage, IndexedDB, sincronização
ou formato de dados. Nenhum arquivo, função, coluna, policy ou migração removida.

### Motivo

F4-01 é bug de interface entregue ao usuário. F4-02 e F4-03 tiram o render da
dependência de um contrato que mora fora do arquivo (a validação do backend, a
ausência de chaves herdadas). F4-04 é o que sobra do módulo: sem teste, a
camada 1 é uma convenção, e convenção não sobrevive a refatoração.

### Compatibilidade

- **Nota da IA**: quando `score` for numérico (backend antigo em cache, ou se um
  dia a nota voltar), o bloco renderiza **exatamente como antes**; asserção
  `<b>74</b><span>/100</span>` no teste. Quando não for, some em vez de mostrar
  `undefined`. Não há formato de dado envolvido.
- **Rótulos de risco e fluxo**: valores dentro da whitelist produzem
  **byte a byte** o mesmo HTML de antes. Fora dela, caem no mesmo padrão que o
  `||` anterior já dava (`"Atenção"`, `var(--goal)`), com a diferença de a cor
  e o rótulo passarem a concordar.
- **Ícones**: nome conhecido desenha igual; nome desconhecido continua caindo em
  `tag`. Só muda o caso `constructor`/`toString`/`valueOf`/`hasOwnProperty`, que
  antes vazava função herdada.
- **Dados antigos**: nenhum campo persistido muda de forma. Backups antigos
  continuam restaurando (`parseBackupFile` e `migrate` intocados).

### Testes

Ambiente: Node v22.19.0 via Electron do VS Code (ver "Ambiente de execução").

| Teste | Resultado |
|---|---|
| `node scripts/lint.js` | **PASSOU** — 0 erro, 0 aviso (reprovou uma vez por travessão no comentário novo; corrigido) |
| `node tests/run-all.js` | **PASSOU** — **52/52** arquivos (51 anteriores + o novo), sem EPERM nesta execução |
| `node tests/test-xss-surface.js` | **PASSOU** — 85 ok, 0 falha |
| `node scripts/build-app-module.js --check` | **PASSOU** — módulo gerado confere com 70 fontes |
| `node scripts/check-release.js` | **PASSOU** — `Publicação 0.30.0 verificada` (aviso conhecido: 7 campos legais) |
| `node scripts/build-dist.js` | **PASSOU** — 38 arquivos (aviso conhecido: `SITE_URL` local) |
| **Teste de mutação das asserções novas** | **PASSOU** — ver abaixo |
| Navegador local (`node scripts/serve.js`, 127.0.0.1:4173) | **PASSOU** — ver abaixo |
| `node scripts/coverage.js` | **NÃO VALIDADO** — EPERM do OneDrive (R2); medido pela CI |
| `test:browser` (Playwright) | **NÃO VALIDADO** — Playwright indisponível localmente; roda na CI |
| Cartão de IA com resposta real da `/api/analyze` | **NÃO VALIDADO** — exige `vercel dev` + `ANTHROPIC_API_KEY`; coberto por teste de unidade nos dois caminhos (nota numérica e nota ausente) |

**Teste de mutação** (um teste que nunca falha não prova nada). Quebrando de
propósito as duas defesas e rodando o arquivo novo:

- `normalizeHexColor` → `return color || fallback`: reprovam 7 asserções,
  incluindo **"Início / Contas e cartões / Categorias: a carga não virou
  marcação"**. Isto é a prova de F4-04: a cor é o que separa um backup forjado
  de injeção de atributo em três telas.
- `svgIcon` → `ICONS[name] || ICONS.tag`: reprovam as 4 asserções de protótipo.

Restaurados os dois arquivos, 85/85 de novo.

**Navegador local**, aplicativo servido de `js/` (não do `dist/`):

- Parte em `data-module-boot="ready"`, sem erro novo de console.
- Portão de aceite da política **continua exigido** antes do onboarding avançar
  (item B da checklist de regressão), e "Pular por agora" leva ao `#/inicio`.
- **As 23 rotas percorridas uma a uma**: 534 ícones desenhados, **0** ocorrência
  de `undefined`, `NaN`, `[object Object]` ou `native code`; **0** elemento com
  `data-ui-css` pendente e **0** com `data-ui-style-rejected` (ou seja, nenhuma
  declaração visual passou a ser recusada pelo sanitizador).
- Únicos erros de console: `GET /api/account/session → 404` (duas vezes) e a
  falha de registro do Service Worker que vem dele. **Pré-existentes e
  esperados**: `scripts/serve.js` avisa na partida que `/api/*` exige
  `vercel dev`. Não têm relação com as alterações.

### Funcionalidades preservadas

Confirmado explicitamente: importação (CSV/OFX/PDF), QR Code, backup e
restauração, sincronização, dispositivos, toast, ícones em todas as telas,
exportação CSV, onboarding e o portão de aceite. Nenhuma regressão conhecida.

### Status

**CONCLUÍDO** — F4-01, F4-02 e F4-03 corrigidos; F4-04 coberto por teste de
regressão com mutação comprovada. Pendências do módulo: nenhuma.

### Registrado para módulos seguintes

- **M5**: `js/transparency.js:122` interpola `href="${url}"` sem escapar. A lista
  é constante (fontes oficiais em `docs/FONTES-FINANCEIRAS.md`), então não é
  achado hoje; vira achado no dia em que a lista virar dado. `form-action 'none'`
  e `base-uri 'self'` já estão na CSP e cobrem o resto.
- **M15**: `tests/test-xss-surface.js` é o primeiro teste do projeto que renderiza
  **sete telas** com uma base hostil completa. Serve de molde para a cobertura de
  `js/actions.js` (0,2%, o pior número da baseline).
- **M12**: a restauração aceita 32 MB de JSON arbitrário e é a maior entrada não
  confiável do app. `migrate()` a normaliza bem; o que falta lá é o aviso ao
  usuário sobre o conteúdo do arquivo, não saneamento.

---

## M5 — Cabeçalhos HTTP e CSP

### Antes (situação encontrada)

O M0 já tinha avisado: a CSP **não** precisava ser implantada, ela já existia e já
era restritiva (sem `unsafe-inline`, sem `unsafe-eval`). O trabalho aqui foi de
ajuste fino, com uma medição nova que o M0 não tinha feito.

**A medição que mudou o módulo:** `financemanager.dev.br` responde **308 para
`www.financemanager.dev.br`**. O endereço canônico é um **subdomínio**. Quem
digita o domínio sem esquema faz a primeira requisição em texto claro para o
ápice e é mandado para um host que o HSTS do ápice não cobria, porque o
cabeçalho não trazia `includeSubDomains`. Era o achado R4 do M0, agora com o
motivo concreto.

Estado medido em produção (`https://www.financemanager.dev.br`, três caminhos
estáticos + a API):

| Cabeçalho | Valor entregue antes |
|---|---|
| `Content-Security-Policy` | restritiva, sem `frame-src` e sem `upgrade-insecure-requests` |
| `Strict-Transport-Security` | `max-age=63072000` — **sem `includeSubDomains`** |
| `Referrer-Policy` | `strict-origin-when-cross-origin` (a API já usava `no-referrer`) |
| `Permissions-Policy` | 5 recursos (`camera=(self)` + 4 negados), incluindo o já obsoleto `interest-cohort` |
| `X-Content-Type-Options` / `X-Frame-Options` / `COOP` | corretos |
| `Access-Control-Allow-Origin: *` | só nos estáticos (padrão da Vercel); **ausente na API** |
| `Cache-Control` da API | `no-store` |

### Achados

| # | P | Achado | Situação |
|---|---|---|---|
| **F5-01** | **P2** | HSTS sem `includeSubDomains` num domínio cujo host canônico é o subdomínio `www`. | **CORRIGIDO** |
| **F5-02** | P2 | **A política de conteúdo estava escrita à mão em DOIS arquivos**: `vercel.json` e `scripts/serve.js`. O servidor local existe justamente para que um erro de CSP apareça antes de produção; com duas cópias, mudar uma e esquecer a outra dava o pior caso possível — um ambiente local que aprova o que a publicação recusa. Não estava divergente ainda; a estrutura é que garantia que um dia divergiria. | **CORRIGIDO** |
| **F5-03** | P3 | `default-src 'self'` **permite moldura de mesma origem** e não diz nada sobre promoção de subrecurso. Faltavam `frame-src 'none'` e `upgrade-insecure-requests`. | **CORRIGIDO** |
| **F5-04** | P3 | `Permissions-Policy` cobria 5 recursos. USB, serial, bluetooth, HID, MIDI, sensores, captura de tela, detecção de ociosidade e fontes locais ficavam no padrão do navegador (permitido). `interest-cohort` sozinho é obsoleto: o nome atual é `browsing-topics`. | **CORRIGIDO** |
| **F5-05** | P3 | `Referrer-Policy: strict-origin-when-cross-origin` manda a origem para fora. Num app financeiro cujo retorno de confirmação de email carrega `?code=` na URL, `same-origin` custa nada e fecha a porta. | **CORRIGIDO** |
| **F5-06** | P3 | Nenhum teste conferia se os cabeçalhos chegam **na API**. Em `vercel.json` a regra é `/(.*)` e parece cobrir tudo, mas `/api/*` passa por reescrita e por função — exatamente onde configuração "óbvia" costuma não chegar. (Na medição, chega.) | **COBERTO** por teste |

### Decisões tomadas e NÃO implementadas (com o motivo)

Registradas para não serem reabertas sem argumento novo:

- **`preload` no HSTS: NÃO.** Entrar na lista de precarga é praticamente
  irreversível (sair leva meses e depende do ciclo de versões dos navegadores).
  É decisão do dono do domínio, não de uma auditoria. O que falta para poder
  optar já está feito: `includeSubDomains` presente e `max-age` de dois anos.
  Para ativar, bastaria acrescentar `; preload` e submeter em hstspreload.org.
- **`Cross-Origin-Resource-Policy`: NÃO.** `same-origin` bloquearia a
  incorporação da `og:image` por qualquer cliente de pré-visualização que use
  navegador, e o ganho seria quase nulo: os estáticos são públicos por
  definição e a API não é incorporável (é JSON e tem `nosniff`).
- **`Cross-Origin-Embedder-Policy: require-corp`: NÃO.** Exigiria CORP em todo
  subrecurso; quebra sem entregar nada, porque o app não usa
  `SharedArrayBuffer` nem precisa de isolamento de origem cruzada.
- **`require-trusted-types-for 'script'`: NÃO.** O render inteiro do app passa
  por `innerHTML` (`renderShell()`); ligar Trusted Types sem antes criar uma
  política **derruba o aplicativo na primeira pintura**. Fica registrado como
  P3 de longo prazo, dependente do M38.
- **Remover `Access-Control-Allow-Origin: *` dos estáticos: NÃO.** É padrão da
  plataforma, incide só sobre arquivos públicos (HTML, JS, CSS, ícones) e não
  vem com `Allow-Credentials`, então não há leitura privilegiada. Mexer nisso
  arriscaria o carregamento de módulos e do worker do PDF.js sem resolver
  nenhum risco real. **Confirmado que a API não o recebe**, e agora há teste.
- **Estreitar `connect-src 'self' https://*.gov.br`: NÃO DÁ.** Os portais
  estaduais variam (`nfce.sefaz.rs.gov.br`, `portalsped.fazenda.mg.gov.br`, ...)
  e a CSP só aceita curinga no rótulo mais à esquerda. `https://*.gov.br` é a
  forma mais estreita que a linguagem permite. Quem estreita de verdade é
  `js/qrcode.js`, que exige rótulo `sefaz`/`fazenda` no host.
- **`autoplay`, `web-share`, `fullscreen`, `publickey-credentials-*`: fora da
  lista de negação, de propósito.** `navigator.share` é usado pelas telas;
  `autoplay=()` poderia impedir o `<video>` do leitor de QR; e negar WebAuthn
  hoje viraria armadilha para o M6, que vai mexer em autenticação.

### Alterações

| Arquivo | O quê |
|---|---|
| `vercel.json` | HSTS ganha `includeSubDomains`; `Referrer-Policy` vira `same-origin`; `Permissions-Policy` passa de 5 para 23 recursos; CSP ganha `frame-src 'none'` e `upgrade-insecure-requests` |
| `scripts/serve.js` | passa a **ler** os cabeçalhos de `vercel.json` em vez de repetir a política à mão; duas exceções declaradas para o ambiente local (HSTS e `upgrade-insecure-requests`, ambas por causa do `http://`) |
| `scripts/check-deploy.js` | confere na resposta real: `includeSubDomains`, `Referrer-Policy`, `Permissions-Policy`, as quatro diretivas novas da CSP e **os cabeçalhos da API** (política, `nosniff`, `no-store`, referrer, CORS não-`*`); passa a reaproveitar uma requisição em vez de duas |
| `tests/test-security.js` | +26 asserções sobre `vercel.json` e sobre a ausência de segunda cópia da política |

Nenhuma mudança em código de aplicação, contrato de API, banco, armazenamento
local ou sincronização.

### Motivo

`includeSubDomains` era o único achado com efeito prático mensurável (o host
canônico ficava fora do HSTS). O resto é o que o módulo pede: menor privilégio
nos recursos do navegador e defesa em profundidade nas diretivas que o
`default-src` herda frouxo. A leitura de `vercel.json` pelo servidor local não é
estética: é a diferença entre um ambiente de desenvolvimento que valida e um que
mente.

### Compatibilidade

- **`includeSubDomains` é reversível**, ao contrário de `preload`: servir
  `max-age=0` limpa o registro nos navegadores. O levantamento de DNS feito
  agora mostra que **só o ápice e `www` resolvem**, não há curinga e não há MX,
  então nada que exista hoje pode cair. **A ressalva vale para o futuro:**
  criar depois um subdomínio servido em HTTP (um `blog.`, um painel de terceiro)
  será recusado pelos navegadores que já viram o cabeçalho.
- **`upgrade-insecure-requests`** é rede de segurança, não mudança de
  comportamento: o inventário de URLs do cliente tem apenas `https://*.gov.br`.
  Nenhum subrecurso em `http://` existe para ser promovido.
- **`frame-src 'none'`**: o app não tem nenhum `<iframe>` (varredura conferiu),
  e o PDF.js roda por worker, não por moldura.
- **`camera=(self)` preservado** e verificado em navegador: `getUserMedia`
  responde `NotFoundError` (não há câmera na máquina de teste) e **não**
  `NotAllowedError`, que é o que uma política bloqueando produziria.
- **`Referrer-Policy: same-origin`**: navegação interna do app é por hash, e
  fragmento nunca vai no `Referer`. Nada no app depende de referrer de saída.
- O `Referrer-Policy: no-referrer` que as funções já punham por conta própria
  continua valendo e é mais fechado; o teste aceita os dois.

### Testes

| Teste | Resultado |
|---|---|
| `node scripts/lint.js` | **PASSOU** — 0 erro, 0 aviso |
| `node tests/run-all.js` | **PASSOU** — 52/52 arquivos |
| `node tests/test-security.js` | **PASSOU** — **105 ok, 0 falha** (eram 79) |
| `node scripts/build-app-module.js --check` | **PASSOU** |
| `node scripts/check-release.js` | **PASSOU** (aviso conhecido dos campos legais) |
| `node scripts/build-dist.js` | **PASSOU** — 38 arquivos (aviso conhecido de `SITE_URL`) |
| **Teste de mutação (6 mutações)** | **PASSOU** — ver abaixo |
| **Navegador local com os cabeçalhos NOVOS** | **PASSOU** — ver abaixo |
| `node scripts/check-deploy.js` contra produção | **REPROVOU 10 asserções, como esperado**: produção ainda serve os cabeçalhos antigos. **Rodar de novo depois de publicar** — é o critério de fechamento em produção. |
| `test:browser` (Playwright) | **NÃO VALIDADO** — indisponível localmente; roda na CI |

**Teste de mutação.** Desfazendo cada mudança em `vercel.json` e rodando
`test-security.js`: reprovam `frame-src 'none'`, `upgrade-insecure-requests`,
`includeSubDomains`, `Referrer-Policy`, `usb=()` e `camera=(self)`. Seis de
seis. Restaurado, 105/105.

**Navegador local.** `scripts/serve.js` agora entrega em `http://127.0.0.1:4173`
exatamente os cabeçalhos de produção (menos as duas exceções declaradas),
confirmado por requisição. Com eles no ar:

- App parte em `data-module-boot="ready"`.
- **As 23 rotas percorridas com um ouvinte de `securitypolicyviolation`
  instalado: 534 ícones, `violacoes: []`.** Nenhuma violação de CSP, nenhuma de
  Permissions-Policy, nenhuma tela vazia.
- **Página comercial** carregada e rolada até o fim (17.000 px, 18 seções):
  `violacoes: []`. As animações continuam — elas passam por CSSOM
  (`style.setProperty`), que `style-src-attr 'none'` não alcança, como o próprio
  `js/landing.js:17` já registrava.
- `getUserMedia` responde `NotFoundError`: a câmera continua **permitida** pela
  política.
- Únicos erros de console: `GET /api/account/session → 404` e a falha de
  registro do Service Worker que vem dele. Pré-existentes e esperados sem
  `vercel dev` (o próprio `serve.js` avisa na partida).

### Funcionalidades preservadas

Confirmado: aplicativo nas 23 rotas, página comercial com animações, leitor de
QR (permissão de câmera), compartilhamento (`web-share` deliberadamente não
negado), PDF.js por worker, formulário de login (é um `<form>` de verdade, mas
interceptado por JS — `form-action 'none'` só age se o JS falhar, e aí impedir o
envio é o comportamento desejado), API com seus próprios cabeçalhos.

### Status

**CONCLUÍDO E CONFIRMADO EM PRODUÇÃO** (publicado em 2026-08-30, commit `6334fa1`).

O comando de fechamento passou:

```
node scripts/check-deploy.js https://www.financemanager.dev.br
```

Antes da publicação ele reprovava 10 asserções; depois dela fechou em **66 ok,
0 falhas**, incluindo `includeSubDomains`, `Referrer-Policy: same-origin`, as
quatro diretivas novas da política e os cabeçalhos da API.

### Registrado para módulos seguintes

- **M21**: `/.well-known/security.txt` e `/robots.txt` continuam **404**
  (achado R3 do M0). São arquivos, não cabeçalhos; ficam no módulo que já os
  reivindica.
- **M6**: se entrar passkey/WebAuthn, `publickey-credentials-get` e
  `publickey-credentials-create` foram deixados **fora** da lista de negação de
  propósito. Nada a fazer.
- **M22**: `<title>` de `landing.html` e de `index.html` são idênticos
  (`Cofre | Organizador financeiro pessoal`) e diferentes do `og:title` da
  landing. Notado de passagem, é matéria de marca.
- **M38**: Trusted Types depende de o render deixar de depender de `innerHTML`.
- **Decisão do dono**: `preload` no HSTS. Requisitos técnicos já atendidos.

---

## M6 — Autenticação e senhas

### Antes (situação encontrada)

A autenticação é a parte mais bem construída do backend. Já existiam, sem
nenhuma ajuda deste módulo: PKCE no fluxo de email, sessão só em cookie
`HttpOnly; Secure; SameSite=Lax`, segredo por aparelho com HMAC, confirmação de
email obrigatória inclusive em sessão já emitida, `assertSameOrigin` em todo
POST, teto de tentativas em duas dimensões (30/10min por origem **e** 10/10min
por endereço, com o email passando por HMAC antes de tocar o banco), respostas
deliberadamente opacas para não revelar quem tem conta, e a senha apagada do
estado do cliente em qualquer desfecho.

Três coisas faltavam. Uma delas era um buraco de verdade.

### Achados

| # | P | Achado | Situação |
|---|---|---|---|
| **F6-01** | **P1** | **`POST /api/account/password` trocava a senha com o cookie de sessão e mais nada.** Nenhuma senha atual, nenhuma prova de recuperação. Quem chegasse a uma sessão viva — o celular destravado esquecido na mesa, um cookie capturado — trocava a senha, tomava a conta e trancava o dono do lado de fora **sem nunca ter sabido a senha**. O cookie prova que alguém entrou; não prova que é o dono, e trocar a senha é a ação que decide quem manda na conta daqui para frente. Nota: a interface só chega nesta rota pelo link de recuperação, mas a interface não é a fronteira — a rota aceitava qualquer sessão. | **CORRIGIDO** |
| **F6-02** | P2 | Política de senha era só comprimento (10 a 128). `senha123456`, `1234567890`, `qwertyuiop` e o próprio email do usuário passavam. | **CORRIGIDO** |
| **F6-03** | P2 | Nenhum retorno de força enquanto a pessoa escolhe a senha. | **CORRIGIDO** |
| **F6-04** | P2 | Proteção contra senha vazada ausente. A do Supabase é **do plano pago** e a organização está no **free**, então não havia chave a ligar: foi implementada aqui (HaveIBeenPwned por k-anonimato, do servidor, falhando aberta). O advisor vai **continuar** apontando o alerta, porque ele lê a chave do painel e não o comportamento do app. | **CORRIGIDO** — ver seção própria |
| **F6-05** | P3 | Sem MFA. | **ARQUITETURA REGISTRADA**, não implementada |
| — | — | Conferidos **sem achado**: enumeração de usuários (cadastro, recuperação e reenvio devolvem a mesma resposta para endereço existente e inexistente; `email_not_confirmed` só aparece **depois** de um login bem-sucedido, ou seja, para quem já tem a senha certa — não é sonda); teto de tentativas; exclusão de conta (já reautenticava com senha **e** exigia digitar "APAGAR CONTA"); cookies de sessão. | — |

### Alterações

| Arquivo | O quê |
|---|---|
| `netlify/functions/account.js` | `senhaNovaOf()` (regra de senha nova, separada de `passwordOf`); cookie `cofre_recovery`; reautenticação em `/account/password`; `clearSession` limpa a marca nova |
| `js/utils.js` | `passwordStrength()` — medidor, sem dependência |
| `js/screens/account.js` | `renderPasswordStrength()` no campo de cadastro e no de nova senha |
| `js/auth.js` | mensagem própria quando a marca de recuperação vence |
| `css/screens/account.css` | estilo do medidor |
| `tests/test-auth-password.js` | **novo**, 45 asserções em 6 blocos |
| `netlify/functions/_shared/senha-vazada.js` | **novo**, checagem contra o HaveIBeenPwned por k-anonimato |
| `tests/test-senha-vazada.js` | **novo**, 32 asserções em 5 blocos |
| `docs/BACKEND_SETUP.md` | variável `LEAKED_PASSWORD_CHECK` documentada |
| `tests/test-session-scope-backend.js` | a conferência do logout passa a ser por NOME de cookie, não por quantidade |
| `js/modules/app.generated.js` | regerado |

### Motivo, e a decisão de projeto que sustenta o módulo

**A prova exigida para trocar a senha depende de por que se está trocando**, e
os dois motivos são legítimos:

* quem **lembra** a senha e quer trocar por vontade prova com a senha atual;
* quem **esqueceu** não pode ser obrigado a digitar exatamente o que não tem.
  A prova, aí, é o link que só chega na caixa de entrada do dono do endereço.

O cookie `cofre_recovery` é a segunda prova, emitida pelo servidor no instante
em que o link é consumido (`verify` e `exchange`), `HttpOnly`, com 30 minutos de
validade e **consumida na primeira troca**. O cliente não a lê nem a escreve.
Sem ela, `/account/password` volta a exigir a senha atual.

**Por que a regra de senha nova é uma função separada.** `passwordOf` também é
usada no **login** e na reautenticação da exclusão. Se as regras novas
entrassem lá, todo usuário com uma senha que não as atende ficaria trancado
para fora da própria conta no dia da publicação — e nem a senha **certa**
passaria, porque a checagem roda antes de falar com o provedor. Regra nova vale
para senha nova. É o bloco 3 do teste, e existe só para isso.

**O que as regras deliberadamente NÃO fazem: exigir maiúscula, número e
símbolo.** O NIST SP 800-63B recomenda contra composição obrigatória desde 2017,
por um motivo medido: ela empurra as pessoas para `Senha@2024`, que é pior do
que uma frase longa. O que ele recomenda é o que está implementado —
comprimento, lista de proibidas e palavras do contexto do usuário (o email).

**O medidor é conselho, não regra.** A política mora só no servidor. Repetir a
regra em duas linguagens é o começo garantido de uma divergir da outra — a mesma
lição do F5-02, onde a política de conteúdo estava copiada em dois arquivos. O
medidor dá retorno enquanto a senha ainda pode ser trocada sem custo; quem
recusa é o servidor.

### F6-04 — senha vazada: o plano não entregava, então foi implementado

**A primeira leitura estava errada e ficou registrada como tal.** Eu tinha
escrito que bastava uma chave no painel. A proteção contra senha vazada do
Supabase é **recurso do plano pago**, e a organização (`zRenan0's Org`) está no
**plano free** — confirmado pela API. Não havia chave a ligar.

**Correção de uma segunda coisa que eu tinha escrito:** anotei que fazer a
checagem por conta própria esbarraria na `connect-src` que o M5 acabou de
fechar. Isso vale para uma chamada do **navegador**. A consulta sai do
**servidor**, onde política de conteúdo não se aplica. Não havia conflito
nenhum com o M5.

**Implementado** em `netlify/functions/_shared/senha-vazada.js`, com o mesmo
método que o Supabase pago usa por baixo: a API do HaveIBeenPwned por
**k-anonimato**.

#### Como a senha não vaza na consulta

Sai do servidor apenas o **prefixo de cinco caracteres** do SHA-1 da senha. O
HIBP devolve todos os sufixos daquele prefixo (centenas de linhas) e a
comparação acontece dentro da função. A senha não sai, o hash completo não sai,
o email não sai, e do outro lado ninguém consegue dizer qual das centenas de
senhas daquele balde foi consultada. O cabeçalho `Add-Padding: true` completa a
resposta com registros falsos até um tamanho fixo — sem ele, o **tamanho** da
resposta já é um sinal sobre qual prefixo foi pedido para quem observa a rede.

A consulta parte do **servidor**, nunca do navegador: nenhum IP de usuário
chega ao HIBP, e a `connect-src` do M5 continua intocada.

#### Falha ABERTA, e isso é decisão, não descuido

HIBP fora do ar, lento, bloqueado pela hospedagem ou desligado por variável
devolve "não vazada, não consultada", e o cadastro segue. A alternativa seria
impedir alguém de criar conta porque um terceiro caiu — trocar um risco de
senha fraca por uma indisponibilidade certa. As regras locais de `senhaNovaOf`
(lista de proibidas, sequências, só dígitos, email dentro da senha) continuam
valendo em qualquer cenário: esta camada **acrescenta, não sustenta sozinha**.

Ordem deliberada: **regras locais primeiro, rede depois.** Senha que já cai numa
regra local não gasta ida à rede, e o prefixo dela nem chega a sair.

#### Verificação ao vivo contra a API real

| Senha | Prefixo | Resultado | Tempo |
|---|---|---|---|
| `Password1234` | `5B966` | **vazada, 321.223 ocorrências** | 410 ms |
| `corinthians2010` | `9FBB7` | **vazada, 4.881 ocorrências** | 201 ms |
| frase aleatória | `BF6CB` | limpa | 778 ms |

Latência entre 200 e 800 ms, bem dentro do teto de 2.500 ms.

#### Desligar sem publicar código

`LEAKED_PASSWORD_CHECK=off` na hospedagem. Documentado em
`docs/BACKEND_SETUP.md`. Ligada por padrão; não precisa de chave nem de conta
no HIBP.

#### O que o advisor do Supabase vai continuar dizendo

O alerta `auth_leaked_password_protection` **continua listado**, porque ele
verifica a chave do painel, não o comportamento do aplicativo. Isso é esperado
e não é pendência: a proteção existe, só não é a do provedor. Se um dia o
projeto for para o plano Pro, ligar a nativa e desligar esta com
`LEAKED_PASSWORD_CHECK=off` remove a duplicidade.

**Opcional que continua valendo, se um dia houver painel:** subir
*Minimum password length* para 10, igualando o backend. Os três
`rls_enabled_no_policy` que o advisor lista (`cofre_mutations`,
`cofre_rate_limit`, `cofre_sync_config`) são nível INFO e **deliberados** —
tabelas server-only, decisão registrada no M3.

#### Testes (`tests/test-senha-vazada.js`, 32 asserções)

Bloco 2 é o que mais importa: afirma que a senha em texto, o hash completo e o
sufixo **não aparecem** na requisição, e que a URL é exatamente
`.../range/<5 chars>`. Bloco 4 cobre os seis modos de falha (serviço fora do ar,
erro HTTP, corpo ilegível, corpo vazio, lixo, tempo esgotado) e o desligamento
por variável. Bloco 5 liga tudo ao handler e confirma que **uma senha vazada já
em uso continua entrando** e que **o login não consulta o HIBP**.

**Teste de mutação:** mandar o hash inteiro na URL reprova 5 asserções, entre
elas "o hash completo não aparece na requisição". Fazer a checagem falhar
fechada reprova 3, entre elas "serviço fora do ar: não bloqueia".

**Achado do próprio teste:** a primeira versão do `fetch` de mentira ignorava o
sinal de aborto, e o teste do tempo esgotado terminava em silêncio com código 0
sem ter testado nada. O `fetch` real respeita o sinal; o falso passou a
respeitar também.

### Arquitetura para MFA (F6-05, registrada, não implementada)

O Supabase já traz TOTP; o trabalho é de integração, não de criptografia.
Desenho que se encaixa no que existe, para quando o M7 ou uma sessão futura
pegar isto:

1. **Backend** — quatro rotas novas em `netlify/functions/account.js`, todas no
   molde atual (`requireSession` + `assertSameOrigin` + `rateLimit.enforce`):
   `mfa-enroll` (chama `POST /auth/v1/factors`), `mfa-challenge`, `mfa-verify`
   (devolve token com `aal2`) e `mfa-unenroll` — esta última **exigindo
   reautenticação**, porque desligar a segunda etapa é ação crítica.
2. **Nível de garantia** — `requireSession` ganha `{ aal: "aal2" }` opcional,
   lendo a reivindicação `aal` do JWT. As ações críticas passam a pedir `aal2`
   em vez de senha: `delete`, `password`, e o "sair de todos os aparelhos"
   que o M7 vai criar.
3. **Segredo na tela sem dependência nova** — o app tem **leitor** de QR
   (`js/qrcode.js`), não gerador. Mostrar o segredo em texto para digitação
   manual evita puxar biblioteca de geração e evita a imagem do segredo; se um
   QR for desejado depois, ele precisa ser desenhado **localmente**, nunca por
   serviço externo (a `connect-src` do M5 já barraria, e é bom que barre).
4. **Códigos de recuperação** — obrigatórios antes de concluir a ativação. Sem
   eles, perder o telefone vira perder a conta, e o suporte vira o elo fraco.
5. **Convivência com o modelo de aparelhos** — MFA entra no **login**; o
   segredo por aparelho continua sendo o que autoriza a sincronização. São
   camadas diferentes e não se substituem.
6. **Permissions-Policy** — o M5 deixou `publickey-credentials-get` e
   `publickey-credentials-create` **fora** da lista de negação exatamente para
   não criar armadilha aqui, caso um dia entre passkey. Nada a mudar.

### Compatibilidade

- **Login não mudou em nada.** Nenhuma regra nova o alcança; travado por teste
  (bloco 3: senha legada `1234567890` continua entrando e autenticando).
- **Fluxo de recuperação por email não mudou** para quem o usa: o cookie chega
  junto com a sessão, e a tela continua igual. Se a marca vencer (mais de 30
  minutos entre abrir o link e salvar), a tela agora diz "peça um novo link" em
  vez de repetir a recusa do servidor, que ali não faria sentido.
- **Exclusão de conta não mudou**: já reautenticava.
- **Nenhum contrato quebrado**: `/account/password` só ganhou um campo
  **opcional** no corpo (`currentPassword`). Cliente antigo que não o envia e
  esteja em fluxo de recuperação continua funcionando igual.
- **Nenhuma senha existente ficou inválida.** As regras novas valem no cadastro
  e na definição de senha nova.
- Cookie novo, nenhum cookie renomeado ou removido; `clearSession` limpa os
  cinco.

### Testes

| Teste | Resultado |
|---|---|
| `node scripts/lint.js` | **PASSOU** — 0 erro, 0 aviso |
| `node tests/run-all.js` | **PASSOU** — **53/53** arquivos (52 + o novo) |
| `node tests/test-auth-password.js` | **PASSOU** — **45 ok, 0 falha** |
| `node scripts/build-app-module.js --check` | **PASSOU** |
| `node scripts/check-release.js` / `build-dist.js` | **PASSOU** (avisos conhecidos) |
| **Teste de mutação (2 mutações)** | **PASSOU** — ver abaixo |
| **Navegador local, 23 rotas** | **PASSOU** — 534 ícones, 0 problema, 0 violação de CSP, nenhum erro novo de console |
| Formulário de cadastro em navegador, com o medidor visível | **NÃO VALIDADO** — sem `vercel dev` o app local considera o serviço de contas não configurado e nem desenha o formulário. O render foi conferido chamando `renderPasswordStrength` direto (bloco 6): marcação, níveis, texto por extenso, `aria-hidden` na barra, `role="status"` no texto e escape de email hostil |
| Fluxo real de recuperação ponta a ponta (email → link → nova senha) | **NÃO VALIDADO** — exige SMTP e `vercel dev`. As duas provas e o consumo da marca estão cobertos por teste de integração do handler |
| `test:browser` (Playwright) | **NÃO VALIDADO** — indisponível localmente; roda na CI |

**Teste de mutação.** Desligando a reautenticação (`porRecuperacao = true`
fixo): reprovam 6 asserções, incluindo "sessão sozinha não troca a senha" e
"nada foi gravado na recusa". Trocando `senhaNovaOf` de volta por `passwordOf`
no cadastro: reprovam 10, uma por regra. Restaurado, 45/45.

O teste usa **sessão de verdade**: entra pelo handler e reaproveita os cookies
que o servidor devolveu, inclusive o segredo do aparelho, com uma tabela de
aparelhos em memória que respeita o filtro por `secret_hash` da rota. Um mock
que devolvesse linha fixa nunca casaria com o HMAC e todo pedido morreria em
`device_unknown` antes de chegar à regra sob teste — o teste passaria a testar
o mock.

### Status

**CONCLUÍDO no repositório**, com **uma ação sua pendente** (a chave de senha
vazada no painel do Supabase, seção acima). F6-01, F6-02 e F6-03 corrigidos e
travados por teste. F6-05 registrado como arquitetura.

### Registrado para módulos seguintes

- **M7 (dispositivos e sessões)**: "sair de todos os outros aparelhos" ainda não
  existe. Quando existir, **precisa de reautenticação** — a prova já está pronta
  e é a mesma de `/account/password`. **Revogar UM aparelho continua sem
  reautenticação de propósito**: é ação defensiva, e quem acabou de ver um
  acesso estranho precisa conseguir cortá-lo em dois toques, não travado por um
  campo de senha.
- **P3 registrado**: a exclusão de conta usa `passwordOf` para validar a senha
  **atual**, o que aplicaria o mínimo de 10 caracteres a uma senha antiga mais
  curta. Nenhum usuário conhecido está nessa faixa (o mínimo é 10 desde antes
  desta auditoria) e mexer nisso agora é risco sem ganho; fica anotado.
- **M19 (terceiros)**: o HaveIBeenPwned entra na lista de integrações. O que ele
  recebe: cinco caracteres hexadecimais do SHA-1 de uma senha e o IP da função.
  O que ele NÃO recebe: senha, hash completo, email, IP de usuário.
- **M18 (LGPD)**: a consulta ao HIBP não gera dado novo guardado em lugar nenhum;
  é uma chamada de ida e volta, sem persistência.
- **Se o projeto for para o plano Pro do Supabase**: ligar a proteção nativa e
  desligar esta com `LEAKED_PASSWORD_CHECK=off`, para não checar duas vezes.
- **M17 (observabilidade)**: `reauth_failed`, `weak_password` e `leaked_password`
  são os três
  códigos novos e são bons sinais de monitoramento — uma sequência de
  `reauth_failed` numa conta é tentativa de tomada de conta com sessão viva.

---

## M7 — Sessões e dispositivos

### Antes (situação encontrada)

A tela "Dispositivos com acesso" **já existia** e já era boa: lista os acessos
ativos, marca o atual com selo, mostra ícone por tipo (computador, celular,
tablet, desconhecido), diz o último acesso em linguagem de gente ("Hoje, 14:32",
"Ontem, 09:10"), revoga um a um com confirmação, e some com o aparelho revogado
sem esperar outra ida à rede. O rótulo já vem pronto do cliente como
"Chrome no Windows" (`accountDeviceLabel`, js/auth.js), então **dispositivo e
navegador já estavam cobertos**.

Faltavam três coisas.

### Achados

| # | P | Achado | Situação |
|---|---|---|---|
| **F7-01** | P2 | **Não existia "sair de todos os outros aparelhos".** Quem visse um acesso que não reconhece só podia revogar um por vez, e não tinha como cortar tudo de uma vez depois de uma senha vazada. | **CORRIGIDO** |
| **F7-02** | P3 | `firstSeenAt` **já vinha da API** e não era mostrado. É o campo que separa "é meu, entrei em maio" de "isto apareceu ontem" — exatamente a pergunta que a tela existe para responder. | **CORRIGIDO** |
| **F7-03** | P3 | Nenhuma cobertura de render para a lista de dispositivos além do básico. | **COBERTO** |
| — | — | Conferidos **sem achado**: a lista só traz acessos ativos (`revoked_at=is.null` na consulta **e** filtro no cliente); revogar o próprio aparelho já limpava a sessão; `revoke-device` já exigia alvo ativo e devolvia 404 em repetição. | — |

### O desenho da saída em massa, e por que são duas camadas

Revogar a linha em `cofre_devices` **corta a sincronização no ato**: toda
chamada seguinte passa por `touchDevice`, que recusa aparelho revogado. Já o
`logout?scope=others` do provedor **invalida os refresh tokens**, o que impede
renovar a sessão — mas o access token que o outro aparelho já tem na mão
continua valendo até vencer, perto de uma hora depois.

Sozinha, cada uma deixa uma fresta:

* só o provedor deixaria a janela do access token aberta;
* só as linhas deixariam a sessão viva para renovar indefinidamente.

Juntas não deixam. E é por isso que **a revogação das linhas vem primeiro**: se
a chamada ao provedor falhar, o acesso aos dados já foi cortado, e a resposta
devolve `sessionsEnded: false` para a tela contar o que sobrou em vez de
anunciar uma limpeza que não aconteceu inteira. A mensagem, nesse caso, sugere
trocar a senha — que é o que encerra tudo na hora.

**Reautenticação, e por que só aqui.** Derrubar as outras sessões é ação de
dono: quem tomou uma sessão emprestada não pode usá-la para expulsar o dono do
próprio aparelho. A prova é a mesma que o M6 montou. **Revogar UM aparelho
continua sem senha, de propósito**: é ação defensiva, e quem acabou de ver um
acesso estranho na lista precisa conseguir cortá-lo em dois toques, não travado
por um campo de senha que talvez ele nem lembre.

### Decisões tomadas e NÃO implementadas (com o motivo)

- **Localização aproximada: NÃO.** O prompt condiciona a "se houver forma
  adequada e respeitando privacidade" — e não há, de forma proporcional. Exigiria
  (a) **passar a guardar o IP**, que hoje o app não guarda em lugar nenhum e que
  é dado pessoal sob a LGPD, com base legal, retenção e inventário próprios;
  (b) um **serviço de geolocalização de terceiro**, ou seja, mais um operador
  recebendo dados dos usuários (M19) e uma abertura na `connect-src` que o M5
  acabou de fechar; e (c) aceitar a precisão real desse tipo de consulta, que em
  CGNAT e rede móvel erra de cidade e às vezes de estado. Uma cidade errada ao
  lado de um acesso legítimo produz exatamente o pânico que a tela deveria
  evitar. **O que responde a mesma pergunta com o que já existe** é a data de
  entrada do aparelho (F7-02), agora na tela.
- **Coluna "status" explícita: NÃO.** A lista só mostra acesso **ativo** (o
  filtro é do servidor e do cliente), e o atual tem selo. Uma coluna dizendo
  "ativo" em todas as linhas seria ruído numa tela onde ruído faz parar de ler.
- **Encerrar sessões sem revogar aparelho (só `logout?scope=others`): NÃO.**
  Deixaria o aparelho autorizado a voltar a sincronizar no próximo login, o que
  não é o que "sair dos outros aparelhos" promete.

### Alterações

| Arquivo | O quê |
|---|---|
| `netlify/functions/_shared/supabase-rest.js` | `auth.logoutOthers()` (`logout?scope=others`) |
| `netlify/functions/account.js` | rota `revoke-others`: reautenticação, revogação em massa restrita à conta e excluindo o aparelho atual, depois as sessões do provedor; responde `{ revoked, sessionsEnded }` |
| `js/auth.js` | `revoke-others` no escopo de conta, `AccountAPI.revokeOthers`, `accountRevokeOthers()`, campo `revokeOthersPassword` no estado |
| `js/actions.js` | abrir/fechar o bloco (esquecendo a senha ao fechar) e a ação com confirmação |
| `js/app.js` | campo `auth-revoke-others-password` |
| `js/screens/account.js` | `accountDeviceFirstSeen()`, "entrou pela primeira vez em" na linha, `accountRevokeOthersBlock()` |
| `css/screens/account.css` | separador e corpo do bloco |
| `tests/test-device-revocation-backend.js` | +15 asserções (bloco 5) |
| `tests/test-render.js` | +11 asserções na seção de conta |
| `js/modules/app.generated.js` | regerado |

### Compatibilidade

- **Rota nova, nada alterado no que existia.** `revoke-device`, `devices`,
  `logout` e `delete` não mudaram uma linha.
- **`logoutOthers` é função nova** em `supabase-rest.js`; `logout` continua com
  `scope=local` como sempre.
- **A tela só ganha elementos.** Com um aparelho só, o bloco novo nem é
  desenhado, e a tela fica idêntica à de antes.
- **`firstSeenAt` é opcional na renderização**: aparelho antigo sem esse campo
  no banco não ganha texto inventado (asserção no teste).
- **Nenhum contrato de dados, banco, armazenamento local ou sincronização
  tocado.** Nenhuma migração.
- Um esbarro encontrado e corrigido durante o trabalho: `accountDeviceDate` **já
  existia** (data + hora, usada em "última sincronização"). A função nova se
  chama `accountDeviceFirstSeen` e formata só o dia; a antiga ficou intacta.

### Testes

| Teste | Resultado |
|---|---|
| `node scripts/lint.js` | **PASSOU** — 0 erro, 0 aviso |
| `node tests/run-all.js` | **PASSOU** — **53/53** arquivos |
| `node tests/test-device-revocation-backend.js` | **PASSOU** — **35 ok** (eram 20) |
| `node tests/test-render.js` | **PASSOU** — seção de conta com as 11 asserções novas |
| `node scripts/build-app-module.js --check` | **PASSOU** |
| **Teste de mutação** | **PASSOU** — desligando a reautenticação da rota, reprovam **7** asserções, entre elas "sair dos outros exige reautenticação" e "nenhuma revogação em massa aconteceu sem senha" |
| **Navegador local, 23 rotas** | **PASSOU** — 534 ícones, 0 problema, 0 violação de CSP, nenhum erro novo |
| **CSS conferido no navegador** | **PASSOU** — os 5 seletores novos e o `.account-danger` antigo aparecem entre as 2.090 regras carregadas (ou seja, nada quebrou a cascata); o medidor rende três cores distintas por nível, o passo apagado usa o token de borda, o bloco recolhido tem `display: none` de verdade e o separador tem 1px |
| Tela de dispositivos com sessão real em navegador | **NÃO VALIDADO** — sem `vercel dev` o app local considera o serviço de contas não configurado e não desenha a tela. O render está coberto por `test-render.js`, que monta cinco aparelhos (inclusive um revogado e um sem `firstSeenAt`) e confere marcação, contagem, textos e o recolhimento inicial |
| Encerramento real de sessões no Supabase | **NÃO VALIDADO** — exige `vercel dev` e duas sessões de verdade. As duas camadas, a ordem entre elas e o caminho de falha parcial estão cobertos por teste de integração do handler |
| `test:browser` (Playwright) | **NÃO VALIDADO** — indisponível localmente; roda na CI |

### Funcionalidades preservadas

Confirmado: lista de dispositivos, revogação individual (inclusive do próprio
aparelho, que continua limpando a sessão), atualização da lista, cartão de
sincronização, vínculo de dados do visitante, exclusão de conta, medidor de
senha do M6. Nenhuma regressão conhecida.

### Status

**CONCLUÍDO.** F7-01, F7-02 e F7-03 fechados e travados por teste. Nada pendente
neste módulo além da publicação, que é comum a M5, M6 e M7.

### Registrado para módulos seguintes

- **M17 (observabilidade)**: `sessionsEnded: false` é um sinal que merece
  monitoramento — significa que o provedor recusou o encerramento e que existem
  sessões vivas que o usuário acredita ter derrubado.
- **Quando o MFA do M6 entrar**: a reautenticação de `revoke-others` deve passar
  a exigir `aal2`, junto com `password` e `delete`.
- **M18 (LGPD)**: a decisão de **não** guardar IP nem geolocalizar entra no
  inventário de dados como escolha registrada, não como omissão.

---

## M8 - Armazenamento local e privacidade

### Antes

O desenho local já tinha duas versões explícitas e corretas: schema lógico 22 e
IndexedDB físico 4. O IndexedDB já era a fonte da interface, a fila já ficava no
mesmo banco e tokens de sessão já estavam somente em cookies `HttpOnly`.

O problema deste módulo era a documentação. A lista do M0 não era completa,
misturava uma chave de `sessionStorage` com `localStorage`, não conhecia o cookie
de recuperação criado no M6 e não registrava a cópia
`financas_pro_v2_backup`. O README também contradizia o aplicativo ao afirmar
que nada era enviado a servidor, mesmo com sincronização de conta ativa, e ainda
chamava de anônimo um pacote de IA que leva nomes escolhidos pelo usuário.

### Inventário confirmado

| Camada | Situação confirmada |
|---|---|
| IndexedDB | `financas_db` no visitante e `financas_db__u_<id>` por conta, versão 4; stores `transactions`, `categories`, `goals`, `settings`, `assets`, `outbox` e `localMeta` |
| Schema lógico | versão 22 no cliente e no validador do backend; também sai no backup; não houve mudança de formato neste módulo |
| localStorage | 17 famílias de chave persistente mais o teste transitório; espelho, fallback, undo, outbox e cópias legadas podem conter JSON financeiro legível |
| sessionStorage | somente `cofre_build_reload`, guarda da recarga do pacote nesta aba |
| CacheStorage | shell, páginas e fontes separados em `v58`; apenas arquivos públicos; `/api/` nunca entra no cache e o backend responde `no-store` |
| Cookies | `cofre_access`, `cofre_refresh`, `cofre_pkce`, `cofre_device` e `cofre_recovery`; todos `HttpOnly`, `SameSite=Lax`, `Path=/` e `Secure` em produção |
| Exclusão | `purge()` limpa os sete stores e as cópias financeiras do escopo; preserva só a barreira de reset, que não contém registro e impede ressurreição |

### Achados

| # | P | Achado | Situação |
|---|---|---|---|
| F8-01 | P3 | O README dizia que nenhum dado ia para servidor, apesar de a conta sincronizar registros financeiros. | **CORRIGIDO.** O texto agora separa uso sem conta, sincronização, IA, Sefaz e exportação. |
| F8-02 | P3 | O README chamava o pacote da IA de anônimo. Ele leva nomes de categorias e metas, que podem revelar contexto pessoal. | **CORRIGIDO.** Passou a ser descrito como pacote reduzido, não anônimo. |
| F8-03 | P3 | O inventário do M0 omitia `financas_pro_v2_backup`, tratava `cofre_build_reload` como localStorage e não incluía o cookie `cofre_recovery`. | **CORRIGIDO** no inventário técnico e travado por teste. |
| R7 | P3 | `financas_db_mirror` guarda a base financeira como JSON legível. Fallback, undo, outbox e backup legado também podem guardar conteúdo equivalente. | **ACEITO NO DESENHO ATUAL.** Criptografia sem um segredo externo só esconderia a chave no mesmo JavaScript. A cópia existe para evitar perda entre a escrita em memória e o commit assíncrono. O risco e a exclusão estão documentados; a redação legal para usuário permanece no M18. |
| - | - | Tokens no Web Storage, dados financeiros no CacheStorage, API cacheada ou cookie acessível por JavaScript. | **NÃO ENCONTRADO.** |

### Alterações

| Arquivo | Motivo |
|---|---|
| `docs/ARMAZENAMENTO-E-PRIVACIDADE.md` | inventário das versões, escopos, stores, chaves, caches, cookies, fluxos de saída e exclusão |
| `docs/ARCHITECTURE.md` | distingue schema lógico 22 de IndexedDB físico 4 e aponta para o inventário |
| `README.md` | corrige cache para v58, sincronização com conta e a descrição do pacote de IA |
| `tests/test-storage-privacy-inventory.js` | confere 69 invariantes entre código e documentação |

### Compatibilidade

Nenhum código de produção, dado persistido, cookie, schema, banco ou cache mudou.
O schema continua 22, o IndexedDB continua 4, o protocolo continua 3 e o pacote
offline continua v58. Não há migração nem alteração na sincronização.

### Testes

| Teste | Resultado |
|---|---|
| `node tests/test-storage-privacy-inventory.js` | **PASSOU** - 69 ok, 0 falhas |
| `node scripts/lint.js` | **PASSOU** - 154 arquivos, 0 erro, 0 aviso |
| `node tests/run-all.js` | **PASSOU** - 55/55 arquivos |
| `node scripts/build-app-module.js --check` | **PASSOU** - 70 fontes conferidas |
| `node scripts/check-release.js` | **PASSOU** - publicação 0.30.0 verificada; permanece o aviso conhecido dos 7 campos legais |
| `node scripts/build-dist.js` | **PASSOU** - 38 arquivos; permanece o aviso local conhecido de `SITE_URL` |
| `node scripts/coverage.js` | **PASSOU** - 22,4% global, acima do piso de 20% e da baseline de 21,9% |
| `node tests/browser/run-browser.js` | **PASSOU** - 18 cenários no Chromium, 0 falha; inclui 320/390/768/1440 px, zoom de 200% e temas |

### Status

**CONCLUÍDO.** O armazenamento local está versionado, o fluxo de dados está
documentado e as diferenças encontradas não alteram a base do usuário. O risco
de dados locais legíveis fica registrado para a transparência jurídica do M18,
sem prometer criptografia que o produto não oferece.

### Registrado para módulos seguintes

- **M9**: conferir no navegador a promoção de pacote, limpeza de caches antigos,
  shell offline e separação entre landing e aplicativo. O inventário mostra que
  nenhuma resposta de API deve aparecer no CacheStorage. O runner local atual
  importa somente `chromium`, embora o checklist ainda diga Chromium, Firefox e
  WebKit; essa divergência entra na validação do M9.
- **M13**: há várias versões independentes no projeto. A auditoria de versão deve
  impedir divergência entre cliente e backend e decidir como um cliente antigo
  reage a um snapshot criado por schema futuro.
- **M18**: levar para a política a informação de que as cópias locais financeiras
  são legíveis no perfil do navegador, além de preencher os sete campos do
  controlador. Este módulo só fechou o inventário técnico.

---

## M9 - PWA, cache e atualização offline

### Antes

O worker já separava shell, páginas e fontes e já excluía `/api/` do cache. A
landing também não contaminava a chave de `index.html`. Essas premissas do M0
foram confirmadas e preservadas.

O defeito central estava na identidade da publicação. O SHA-256 era apenas o do
módulo `bootstrap.js`. Uma mudança isolada em HTML, CSS, manifesto, ícone,
landing ou PDF.js não alterava o identificador, então instalações existentes
podiam continuar com parte do pacote anterior. A instalação também aceitava
falha de qualquer recurso fora de uma lista curta de cinco itens.

### Achados

| # | P | Achado | Situação |
|---|---|---|---|
| F9-01 | P1 | O identificador do pacote cobria apenas o bootstrap; mudanças em outros arquivos publicados podiam não criar um worker novo. | **CORRIGIDO.** O digest percorre todo `dist/`, com nomes ordenados e conteúdo. O worker entra antes de receber a identidade e a meta é retirada do cálculo para evitar referência circular. |
| F9-02 | P1 | Um CSS, módulo auxiliar, ícone, landing ou PDF.js podia falhar no precache e ainda assim a versão chamar `skipWaiting()`. | **CORRIGIDO.** Todos os recursos declarados são obrigatórios; falha apaga os caches parciais e mantém a versão anterior. |
| F9-03 | P2 | O listener de `controllerchange` só era ligado depois de IndexedDB e da chamada de conta. Uma promoção durante esse intervalo podia passar sem recarga. | **CORRIGIDO.** O listener entra antes de `init()` e o HTML é reconciliado com o controller depois que o armazenamento abre. |
| F9-04 | P2 | O comando e a CI diziam cobrir três motores, mas `run-browser.js` importava e iniciava apenas Chromium. | **CORRIGIDO.** A matriz executa Chromium, Firefox e WebKit; os três passaram os 18 fluxos. |
| F9-05 | P3 | `#app` vinha vazio no HTML e só recebia o esqueleto depois de baixar e avaliar o módulo grande. | **CORRIGIDO.** O mesmo desenho de carregamento já vem no documento inicial com `aria-busy`. |
| F9-06 | P3 | A navegação HTML disparava `cache.put()` sem aguardar a gravação. O worker podia terminar antes de persistir a página. | **CORRIGIDO.** `handleNavigate()` aguarda a escrita antes de concluir a resposta. |

### Alterações

| Arquivo | Motivo |
|---|---|
| `service-worker.js` | v59, precache obrigatório inteiro, limpeza de pacote parcial e gravação de navegação aguardada |
| `scripts/build-dist.js` | identidade SHA-256 de todo o pacote publicado |
| `index.html` | primeiro quadro acessível sem depender do módulo |
| `js/app.js` | listener antecipado, reconciliação HTML/controller e skip link explícito para WebKit |
| `css/screens/notifications-onboarding.css` | margem de rolagem que mantém o foco dentro do corpo também no Firefox |
| `tests/test-pwa-cache.js` | 15 testes executáveis do ciclo install/activate/fetch e da separação dos caches |
| `tests/browser/run-pwa.js` | pacote real em Chromium, online e offline, com rota profunda, persistência e landing |
| `tests/browser/run-browser-matrix.js` | execução real dos 18 fluxos nos três motores |
| `.github/workflows/ci.yml` e `package.json` | comandos da matriz e do teste PWA real |

### Compatibilidade

Schema lógico 22, IndexedDB 4, protocolo de sincronização 3, cookies e dados
persistidos não mudaram. O cache sobe de v58 para v59. Uma instalação existente
baixa o conjunto novo em outro nome, só promove depois de completar tudo, faz
flush e recarrega uma vez com a identidade integral do pacote.

### Testes

| Teste | Resultado |
|---|---|
| `npm run lint` | **PASSOU** - 157 arquivos, 0 erro, 0 aviso |
| `npm test` | **PASSOU** - 56/56 arquivos |
| `npm run check:build` | **PASSOU** - 70 fontes conferidas |
| `npm run check:release` | **PASSOU** - publicação 0.30.0 verificada; permanece o aviso conhecido dos 7 campos legais |
| `npm run build:dist` | **PASSOU** - 38 arquivos; identidade integral conferida; permanece o aviso local conhecido de `SITE_URL` |
| `npm run test:coverage` | **PASSOU** - 22,5% global, acima do piso de 20% e da baseline de 21,9% |
| `node tests/test-pwa-cache.js` | **PASSOU** - 15 ok, 0 falhas |
| `node tests/test-service-worker-update.js` | **PASSOU** - 20 ok, 0 falhas |
| `npm run test:pwa` | **PASSOU** - shell, landing, rota profunda, dados locais, limpeza seletiva e `/api/` fora do cache |
| `npm run test:browser` | **PASSOU** - 18/18 no Chromium, 18/18 no Firefox e 18/18 no WebKit |
| `npm run test:landing` | **PASSOU** - 18/18 no Chromium, com capturas para revisão visual |

### Item 19 da auditoria beta

**CONCLUÍDO.** O HTML inicial não vem mais vazio; as 23 rotas seguem cobertas
pelos testes de roteamento e navegador; a revisão de extrato mantém paginação em
blocos de 60; o pacote offline foi validado no worker executado e em navegador
real. `AUDIT_FIX_PROGRESS.md` foi atualizado para não voltar a cobrar o item.

### Status

**CONCLUÍDO.** Nenhuma pendência conhecida ficou no M9.

---

## M10 - Protocolo de sincronização

### Escopo revisado

O protocolo 3 já tinha identidade de aparelho, HLC, revisão remota, lápides,
checkpoints, reconciliação, vínculo condicionado à revisão, revogação e
compatibilidade de leitura. A auditoria percorreu cliente, armazenamento local,
handler de produção e regressões para perda de conexão, concorrência, relógio
incorreto, repetição, volume e clientes incompatíveis.

### Achados

| # | P | Achado | Situação |
|---|---|---|---|
| F10-01 | P1 | `CloudAdapter.push()` criava outro `mutationId` em cada tentativa. Se o servidor confirmasse e a resposta se perdesse, a fila sobrevivia, mas a recarga publicava o mesmo conteúdo como uma mutação nova. | **CORRIGIDO.** O lote exato, o `mutationId` e a revisão esperada são persistidos antes da rede e repetidos até a confirmação. |
| F10-02 | P1 | Operações já confirmadas pelo servidor eram aplicadas ao conteúdo, mas uma HLC mais de 24 horas à frente não entrava no relógio local. Um aparelho atrasado podia criar a edição seguinte abaixo da vencedora remota e nunca conseguir publicá-la. | **CORRIGIDO.** Operações vindas do servidor autenticado usam `SyncClock.absorb`; o teto permanece para estado local, backup e outras origens não confirmadas. |

### Alterações

| Arquivo | Motivo |
|---|---|
| `js/cloud-sync.js` | diário persistente do lote em voo, repetição exata após recarga, nova leitura da fila depois de cada confirmação e recuperação de colisão de identidade sem apagar operações |
| `js/storage.js` | `mutationId` fornecido pelo ciclo, código próprio para `idempotency_mismatch`, confirmação atômica da fila e do diário, absorção de HLC confirmada pelo servidor |
| `tests/test-cloud-sync.js` | resposta perdida, recarga, nova edição do mesmo registro, relógio atrasado, dois aparelhos, importação concorrente e colisão de identidade |
| `tests/test-account-backend.js` | paginação real de 2.001 registros em cinco páginas, sem corte nem repetição |
| `tests/test-commercial-readiness.js` | contrato explícito do novo código de colisão de idempotência |
| `tests/test-insights-engine.js` | expectativa de projeção estável no último dia do mês, necessária para a suíte não depender da data de execução |
| `docs/SYNC_PROTOCOL.md`, `docs/ARMAZENAMENTO-E-PRIVACIDADE.md`, `README.md` e `CHANGELOG.md` | contrato, inventário local e comportamento de recuperação documentados |

### Compatibilidade

Protocolo 3, schema lógico 22 e IndexedDB 4 permanecem. Não há migration de banco,
mudança de endpoint nem alteração no formato financeiro. O `localMeta` recebe apenas
um diário local sem cópia do payload: chaves da fila, identidade da mutação e revisão
esperada. Instalações anteriores começam a usá-lo no primeiro lote novo.

### Testes

| Teste | Resultado |
|---|---|
| `npm run lint` | **PASSOU** - 157 arquivos, 0 erro, 0 aviso |
| `npm test` | **PASSOU** - 56/56 arquivos |
| `node tests/test-cloud-sync.js` | **PASSOU** - 103 ok, 0 falhas |
| `node tests/test-account-backend.js` | **PASSOU** - 74 ok, 0 falhas |
| `npm run check:build` | **PASSOU** - 70 fontes conferidas |
| `npm run check:release` | **PASSOU** - publicação 0.30.0 verificada; permanece o aviso conhecido dos 7 campos legais |
| `npm run build:dist` | **PASSOU** - 38 arquivos; permanece o aviso local conhecido de `SITE_URL` |
| `npm run test:coverage` | **PASSOU** - 22,4% global, acima do piso de 20% e da baseline de 21,9% |
| `npm run test:browser` | **PASSOU** - 18/18 no Chromium, 18/18 no Firefox e 18/18 no WebKit |
| `npm run test:pwa` | **PASSOU** - shell, landing, dados locais, limpeza e API fora do cache |
| `npm run test:landing` | **PASSOU** - 18/18 no Chromium, com capturas para revisão visual |

### Status

**CONCLUÍDO.** A repetição agora é idempotente também quando a confirmação se
perde, e o relógio do aparelho continua capaz de editar depois de receber uma
marca remota válida. Nenhuma pendência conhecida ficou no M10.

---

## M11 - Integridade financeira (dupla contagem)

### Antes (situação encontrada)

O modelo já era bom e a maior parte da doutrina já estava implementada:

- Transferência, pagamento de fatura e ajuste de saldo **não são lançamentos**.
  São entidades próprias (`accountTransfers`, `cardPayments`, `accountAdjustments`),
  o que impede por construção que virem receita ou despesa.
- Existe um campo `nature` por lançamento (`consumo`, `aporte`, `divida-principal`,
  `divida-encargos`, `transferencia`, `renda`, `resgate`, `estorno`) com dedução
  retroativa para bases antigas, e `realizedMonthTotals()` respeita todos eles.
- Compra no crédito não sai do caixa na data da compra; sai no pagamento da fatura.
  A previsão de fechamento marca a compra com `cashEffect: false` e desconta a
  fatura no vencimento, o que já evita a dupla contagem que o prompt teme.

O que a auditoria procurou foi o inverso: **onde a régua da natureza não chegou.**

### Achados

| # | P | Achado | Situação |
|---|---|---|---|
| F11-01 | P1 | Nas telas de análise, o **denominador** era por natureza (`realizedMonthTotals().expense`) e o **numerador** era por tipo (`t.type === "expense"`). `anExpenseByRoot`, `anWeekdayProfile` e `anHeatmap` somavam aporte de meta, investimento livre, amortização de dívida e transferência legada como se fossem gasto. Efeito visível: guardar R$ 2.000 e gastar R$ 300 fazia "Investimento" liderar o ranking com participação **acima de 100% do mês** e ser marcado como concentração. O mesmo valia para o relatório por período e para a retrospectiva mensal. | **CORRIGIDO** |
| F11-02 | P2 | `variableBaseline()` e `variableSpentInMonth()` (previsão de fechamento) contavam a perna de saída de uma transferência legada como gasto variável. A perna de entrada não compensa, porque a média só olha despesa: a projeção ficava mais pessimista a cada transferência entre contas próprias. | **CORRIGIDO** |
| — | — | Conferidos **sem achado**: `monthGroupSpend` (orçamento 50/30/20), `anExtremes`, `anHourProfile`, `insights.js` inteiro, `metrics.js` (patrimônio, série histórica, contas a pagar), `health.js`, `budgets.js`, `accounts.js` (saldo, faturas, efeito pré-abertura), `netWorth` (sobreposição meta/investimento/carteira já tratada) e o modelo de caixa da previsão. `layout.js:100` usa `type` só para decidir se um cartão do painel é relevante — não soma dinheiro. | — |

### Alterações

| Arquivo | Motivo |
|---|---|
| `js/analytics.js` | `anExpenseByRoot`, `anWeekdayProfile` e `anHeatmap` passam a usar `consumptionCentsOf()`, a mesma função do orçamento e do total do mês. Intensidade do mapa de calor protegida contra dia negativo por estorno |
| `js/forecast.js` | `isTransferTx()` novo e local; a média de gastos variáveis e o gasto variável do mês corrente ignoram transferência |
| `js/wrapped.js` | ranking da retrospectiva pela mesma régua do `expense` que ela já exibia |
| `js/screens/analytics.js` | relatório "Gastos por categoria" por período com a mesma régua |
| `tests/test-accounting-integrity.js` | **novo** — 41 invariantes contábeis |
| `tests/test-render.js` | a visão "Relatórios" não era renderizada por teste nenhum; entrou na não-regressão de telas |

### Motivo

A regra do prompt ("transferência não é receita nem despesa; pagamento de fatura
não é despesa nova") já valia no total do mês, mas **não valia nas partes**. Um
painel em que o todo e as partes discordam é pior do que um painel errado de forma
consistente: o usuário confere a conta, não fecha, e perde a confiança no número
certo junto com o errado.

### Compatibilidade

Nenhum dado muda. Não há migration, não há campo novo, não há alteração de contrato
de armazenamento, de sincronização ou de API. `consumptionCentsOf()` já existia e já
deduz a natureza de lançamentos antigos sem o campo, então bases anteriores são lidas
com a mesma regra sem conversão. Saldo, patrimônio, faturas, metas e orçamento
continuam exatamente com os mesmos números; o que muda é a composição por categoria,
por dia e a média usada na projeção.

### Testes

| Teste | Resultado |
|---|---|
| `node tests/test-accounting-integrity.js` | **PASSOU** - 41 ok, 0 falhas (9 blocos: transferência, cartão + fatura, ajuste, aporte, dívida, estorno, transferência legada, mês corrente, previsão) |
| `npm run lint` | **PASSOU** - 0 erro, 0 aviso |
| `npm test` | **PASSOU** - 57 arquivos |
| `npm run check:build` | **PASSOU** - 70 fontes conferidas |
| `npm run check:release` | **PASSOU** - 0.30.0; permanece o aviso conhecido dos 7 campos legais |
| `npm run build:dist` | **PASSOU** - 38 arquivos; permanece o aviso local de `SITE_URL` |
| `npm run test:coverage` | **PASSOU** - 22,4% global (piso 20%, baseline 21,9%) |
| `npm run test:browser` | **PASSOU** - 18/18 em Chromium, Firefox e WebKit |
| `npm run test:pwa` | **PASSOU** |
| `npm run test:landing` | **PASSOU** - 18/18 |
| Navegador real (`localhost:4173`, dados semeados pela própria interface) | **PASSOU** - com R$ 200.000 em "Investimentos" e R$ 30.000 em "Transporte", o painel mostra `DESPESAS DO MÊS R$ 30.000,00` e a tela Relatórios mostra `TOTAL 30.000,00 / Transporte 100%`. Antes da correção o mesmo cenário somava R$ 230.000 e dava 87% a "Investimentos". Nenhum 4xx e nenhum erro de console na página do aplicativo |

Uma execução isolada de `scripts/coverage.js` reportou "a suíte falhou" sem listar
teste algum; a re-execução e a execução direta com `NODE_V8_COVERAGE` fecharam em
zero. É a falha esporádica de EPERM do OneDrive já registrada em R2, não regressão.

### Status

**CONCLUÍDO.** F11-01 e F11-02 corrigidos e cobertos por regressão. Nenhuma
pendência do módulo.

### Registrado para módulos seguintes

- **M13 (versionamento)**: R6 já está resolvido na prática — `scripts/check-release.js:23`
  falha a publicação quando `SAFE_ERROR_APP_VERSION` diverge de `package.json`.
  O que falta no M13 é o resto: `DATABASE_SCHEMA_VERSION` não existe e não há matriz
  de compatibilidade escrita entre cliente antigo e schema/protocolo novo.
- **M19/M20 (saúde financeira e limite diário)**: agora podem confiar em
  `consumptionCentsOf()` como régua única de "gasto". Qualquer indicador novo que
  volte a classificar por `t.type` reintroduz F11-01.
- **P3 registrado, não corrigido:** `variableBaseline()` exclui aporte com `goalId`
  mas inclui investimento livre e amortização de dívida. As três saem do caixa, então
  incluir é defensável numa projeção de caixa; o que não é defensável é tratar duas
  delas de um jeito e a terceira de outro. Mexer nisso muda saldos projetados e pede
  decisão de produto, não correção de bug.

---

## M12 - Backup, restauração e proteção do arquivo

### Antes (situação encontrada)

O melhor cartão da tela de Ajustes, e por larga margem. Já existia:

- envelope versionado com `kind`, `schema`, `exportedAt`, contagens e **checksum**;
- leitura do formato legado (snapshot cru, sem envelope), para não invalidar
  arquivo antigo guardado pelo usuário;
- teto de 32 MB e de 200.000 registros, com o motivo escrito no código
  (`JSON.parse` é síncrono: um arquivo enorme congela a aba antes de qualquer
  validação);
- **prévia antes de gravar**, escolha entre mesclar e substituir, número final
  calculado antes da decisão, e **desfazer a última restauração**;
- lápides dentro do backup, sem as quais restaurar ressuscita o que foi apagado
  depois que o arquivo foi gerado;
- linha de "último backup" que fica vermelha quando não existe nenhum.

O que faltava era o que o prompt pede: **o aviso de que o arquivo é sensível**, a
ênfase no formato em vez do propósito, e uma alternativa para quem guarda a cópia
fora do próprio aparelho.

### Achados

| # | P | Achado | Situação |
|---|---|---|---|
| F12-01 | P2 | O cartão não avisava em lugar nenhum que o arquivo exportado contém a vida financeira inteira em texto claro. Quem o joga no Drive ou manda por e-mail não é alertado. | **CORRIGIDO** - aviso em destaque no cartão |
| F12-02 | P3 | O botão principal era "Backup completo (JSON)": o formato ocupava o mesmo peso do propósito. | **CORRIGIDO** - "Baixar backup completo"; o formato foi para a explicação |
| F12-03 | P2 | Não havia alternativa para guardar o backup fora do aparelho com proteção. A única opção era um arquivo aberto. | **CORRIGIDO** - opção adicional de backup cifrado com senha |
| — | — | Conferidos **sem achado**: checksum, prévia, desfazer, mesclagem por lápide, tetos de tamanho e de registros, leitura de formato legado, carimbo de `lastBackupAt` só depois do download. | — |

### Alterações

| Arquivo | Motivo |
|---|---|
| `js/backup-crypto.js` | **novo.** Envelope AES-GCM 256 com chave por PBKDF2-SHA-256 (310.000 iterações), sal e IV sorteados por exportação, `kind` como dado autenticado adicional, regra de senha e detecção de arquivo protegido |
| `js/app.js` | `freshBackupState()`, exportação protegida, abertura do arquivo protegido, desvio na leitura do arquivo, campos de senha e Enter |
| `js/actions.js` | ações `backup-protect-open`, `backup-protect-cancel`, `backup-protect-confirm` e `backup-unlock` |
| `js/storage.js` | `parseBackupFile` reconhece um envelope protegido e explica o que fazer, em vez de dizer "não é um backup" |
| `js/screens/settings.js` | aviso de privacidade, rótulo novo, formulário de senha na exportação e na restauração, degradação limpa onde o WebCrypto não existir |
| `css/components.css` | moldura `.backup-protect` |
| `scripts/build-app-module.js` | novo arquivo no pacote (71 fontes) |
| `tests/test-backup-restore.js` | **novo** - 53 verificações |
| `tests/test-render.js` | os dois estados novos do cartão entram na não-regressão de telas |

### Motivo

O app é offline-first: o backup é a única cópia que existe para quem não liga
conta. Um backup que o usuário não faz não protege ninguém, e um backup que ele
faz sem entender o que está no arquivo cria um risco novo no lugar do antigo. O
aviso trata do segundo caso; a proteção por senha trata do primeiro, tirando o
motivo para não guardar a cópia em algum lugar de fato seguro.

### Compatibilidade

Nada foi removido nem alterado no formato existente:

- o backup comum continua idêntico, com o mesmo `kind`, o mesmo checksum e a
  mesma leitura de formato legado;
- o arquivo protegido é um formato **adicional**, com rótulo próprio
  (`cofre.backup.encrypted.v1`); um app anterior a esta versão que receba um
  arquivo protegido dá "não parece ser um backup", nunca corrompe dados;
- não há migration, campo novo em `data`, mudança de schema local ou de
  protocolo de sincronização;
- onde o WebCrypto não existir, a opção some e o cartão continua inteiro.

### Testes

| Teste | Resultado |
|---|---|
| `node tests/test-backup-restore.js` | **PASSOU** - 53 ok, 0 falhas |
| `npm run lint` | **PASSOU** - 0 erro, 0 aviso |
| `npm test` | **PASSOU** - 58 arquivos |
| `npm run check:build` | **PASSOU** - 71 fontes |
| `npm run check:release` | **PASSOU** - aviso conhecido dos 7 campos legais |
| `npm run build:dist` | **PASSOU** - 38 arquivos; o digest do pacote muda sozinho, então o Service Worker se atualiza sem bump manual |
| `npm run test:coverage` | **PASSOU** - 22,5% global |
| `npm run test:browser` | **PASSOU** - 18/18 em Chromium, Firefox e WebKit |
| `npm run test:pwa` / `test:landing` | **PASSOU** |
| Navegador real, ciclo completo | **PASSOU** - senha curta recusada com a frase certa; exportação gerou `financas-backup-...-protegido.json` de 7.993 bytes com o envelope correto e **sem** descrição, categoria ou nome em texto claro; o mesmo arquivo reimportado pediu senha antes de ler o conteúdo; senha errada deu "Senha incorreta ou arquivo alterado"; senha certa abriu a prévia normal e a mesclagem fechou em "0 novos, 2 já existiam". Nenhum erro de console; os únicos 404 são de `/api/account/session`, que o servidor estático local não serve |

### Status

**CONCLUÍDO.** F12-01, F12-02 e F12-03 corrigidos. Pendência do módulo: nenhuma.

### Registrado para módulos seguintes

- **M13**: o arquivo protegido carrega a própria versão no `kind`
  (`cofre.backup.encrypted.v1`) e o número de iterações no corpo. Esse é o molde
  para as demais versões: identidade no formato, parâmetro no dado.
- **Decisão consciente, não achado:** PBKDF2 em vez de Argon2. Argon2 resiste
  melhor a ataque com GPU, mas não existe no WebCrypto, e trazer uma
  implementação WASM colocaria um terceiro no caminho dos dados financeiros. As
  iterações estão no arquivo justamente para permitir subir o custo depois.
- **P3 registrado:** a importação de CSV/OFX/PDF (prompt M13) já tem o fluxo de
  prévia, validação e detecção de duplicidade que o prompt pede; ficou fora deste
  módulo de propósito, porque não é backup e não tinha achado aberto.

---

## M13 - Versionamento e matriz de compatibilidade

### Antes (situação encontrada)

Cinco versões existiam e funcionavam, mas viviam espalhadas e sem documento que
as reunisse. O que já estava bem resolvido, e não foi tocado:

- **Protocolo de sincronização.** Negociação completa: cabeçalho `X-Sync-Protocol`
  conferido contra o campo `protocol` do corpo (defesa contra corpo forjado),
  **426** `protocol_upgrade_required` para cliente abaixo do mínimo de escrita
  (e não 409, que faria o cliente descartar a fila), **400** para versão
  desconhecida, **503** `schema_missing` quando a configuração não existe, e o
  cliente detectando sozinho, antes de enviar, que o mínimo do servidor está
  acima do que ele fala.
- **`APP_VERSION` duplicada (R6 do M0).** Já estava resolvido: `check-release.js`
  reprova a publicação quando `js/safe-errors.js` diverge do `package.json`.
  **R6 fecha aqui, sem código novo.**
- **IndexedDB.** `onupgradeneeded` usa `contains()` em todos os stores e índices,
  então subir a versão não toca em dado gravado.
- **Service Worker.** Desde o M9 a identidade é o SHA-256 do pacote inteiro,
  injetado pela publicação; não depende de alguém lembrar de subir o `vNN`.

### Achados

| # | P | Achado | Situação |
|---|---|---|---|
| F13-01 | P2 | `migrate()` só sabe SUBIR de versão. Um backup gerado por versão futura abria em silêncio, e todo campo criado depois desta versão era descartado pelos normalizadores sem aviso. Quem restaurasse acharia que trouxe tudo. | **CORRIGIDO** - `parseBackupFile` reporta `meta.schema` e `meta.future`; a prévia avisa em destaque. O arquivo continua abrindo |
| F13-02 | P2 | O banco não declarava versão nenhuma. Descobrir se produção tinha todas as migrações exigia inspecionar tabela por tabela — foi exatamente assim que o M1 achou `rls_auto_enable` fora do versionamento. | **CORRIGIDO** - `cofre_sync_config.database_schema_version`, publicada em `/api/sync/health` |
| F13-03 | P3 | Não havia documento reunindo as versões nem dizendo o que acontece quando duas pontas discordam. | **CORRIGIDO** - `docs/VERSIONAMENTO.md`, com o conteúdo conferido por teste |
| F13-04 | **P2, registrado e NÃO corrigido** | O protocolo trafega registros, não a versão do schema que os criou. Um aparelho novo grava um campo que um aparelho antigo não conhece; o antigo baixa, normaliza (perde o campo) e reenvia. Contido na prática pela origem única e pela atualização forçada do pacote, mas não impedido. Resolver pede lugar no protocolo para campo não reconhecido, o que é mudança de protocolo. | Registrado em `docs/VERSIONAMENTO.md`, "Limitações conhecidas" |

### Alterações

| Arquivo | Motivo |
|---|---|
| `docs/VERSIONAMENTO.md` | **novo.** Seis versões, onde moram, quem as obriga, quando subir, matriz de compatibilidade e limitações conhecidas |
| `js/storage.js` | `parseBackupFile` passa a reportar `meta.schema` e `meta.future` |
| `js/screens/settings.js` | aviso na prévia da restauração; o rótulo "protegido por senha" também aparece |
| `css/components.css` | `.inline-error--warn` (aviso não é erro; pintar de vermelho diria que algo falhou) |
| `netlify/functions/sync.js` | `syncConfig` lê a linha inteira (`select=*`) e devolve `databaseSchema`; `/api/sync/health` publica |
| `supabase/migrations/20260831120000_database_schema_version.sql` | **nova**, aplicada |
| `tests/test-versioning.js` | **novo** - 44 verificações |
| `tests/test-account-backend.js` | comportamento real do banco sem a coluna, com a coluna e com valor inválido |

### Motivo

Versão que ninguém consegue ler não protege ninguém. O app roda em três lugares
que não atualizam juntos (o pacote já baixado no navegador, o pacote publicado
agora e o banco), e cada divergência entre eles tinha resposta — só que a
resposta morava no código, espalhada. Reuni-las num documento **conferido por
teste** é o que impede a matriz de virar ficção seis meses depois.

### Compatibilidade

- `select=*` em vez da lista de colunas foi escolha deliberada: pedir a coluna
  nova pelo nome faria o PostgREST devolver **400 em todo banco sem a migração**,
  ou seja, a correção derrubaria a sincronização até alguém aplicar o SQL.
- Banco sem a coluna devolve `databaseSchema: null` e **continua atendendo**;
  provado por teste de handler, não por leitura de código.
- A migração é aditiva (`add column if not exists`, `default 1`), não toca em
  dado, não mexe em grant nem em RLS, e a própria migração documenta como
  reverter.
- Backup de qualquer schema, antigo ou futuro, continua abrindo. Nada passou a
  ser recusado.

### Testes

| Teste | Resultado |
|---|---|
| `node tests/test-versioning.js` | **PASSOU** - 44 ok, 0 falhas |
| `node tests/test-account-backend.js` | **PASSOU** - 79 ok (era 74; cinco novos sobre a versão do banco) |
| `npm run lint` | **PASSOU** - 0 erro, 0 aviso |
| `npm test` | **PASSOU** - 59 arquivos |
| `npm run check:build` / `check:release` / `build:dist` | **PASSOU** (avisos conhecidos: 7 campos legais e `SITE_URL` local) |
| `npm run test:coverage` | **PASSOU** - 22,4% |
| `npm run test:browser` / `test:pwa` | **PASSOU** - 18/18 nos três motores; PWA aprovado |
| Migração em produção | **APLICADA E CONFERIDA** - `database_schema_version = 1`; grants seguem só `service_role` e `postgres`, sem `anon` nem `authenticated` |
| Navegador real | **PASSOU** - backup declarando schema 99 mostra o aviso e ainda restaura (1 no arquivo, 2 no aparelho, 3 depois); backup de schema 22 **não** mostra aviso nenhum. Zero erros de console |

### Status

**CONCLUÍDO.** F13-01, F13-02 e F13-03 corrigidos; F13-04 registrado como P2 com
o motivo de não ser corrigido agora. R6 do M0 fechado.

### Registrado para módulos seguintes

- **Toda migração daqui em diante sobe `database_schema_version` na mesma
  migração que muda a forma do banco.** Está escrito em `docs/VERSIONAMENTO.md`.
- **Todo módulo que subir uma versão precisa atualizar `docs/VERSIONAMENTO.md`**,
  senão `tests/test-versioning.js` falha. É de propósito.
- **F13-04** é candidato natural a um M-de-protocolo futuro, junto de qualquer
  outra mudança que já exija subir o `SYNC_PROTOCOL_VERSION`.

---

## M14 - Importação de extratos (CSV, OFX e PDF)

### Antes (situação encontrada)

O fluxo que o prompt pede **já existia inteiro**: escolher arquivo → parser →
pré-visualização → validação → detecção de duplicidade → confirmação →
importação. Nada é gravado antes do "Importar", e a revisão é boa: papel de cada
linha (pagamento da própria fatura, saldo anterior), categoria sugerida com o
motivo, conversão para transferência entre contas próprias, aviso de linha
anterior à abertura da conta, teto de 12 MB e detecção de banco pelo conteúdo.

Os dois buracos estavam nas pontas: **a régua de duplicidade** e **o que fazer
depois de importar o arquivo errado**.

### Achados

| # | P | Achado | Situação |
|---|---|---|---|
| F14-01 | **P1** | A duplicidade comparava valor, tipo e proximidade de data, **sem olhar a descrição**. Como a linha marcada nasce DESMARCADA, dois gastos legítimos de mesmo valor na mesma semana viravam um só: o segundo era descartado em silêncio. Perda de dado do usuário, sem erro e sem aviso. | **CORRIGIDO** - a descrição entra na comparação e o caso vira "parecida", com rótulo próprio |
| F14-02 | P2 | O `FITID` do OFX (identificador que o banco dá ao movimento) era lido e jogado fora. Sem ele, reimportar o mesmo extrato depois de o banco mudar data ou descrição não era reconhecido. | **CORRIGIDO** - lido, guardado em `origin.externalId` e usado como sinal mais forte |
| F14-03 | P2 | Linha repetida DENTRO do próprio arquivo não era detectada: só se comparava com o que já estava gravado. | **CORRIGIDO** - motivo "repetida no arquivo" |
| F14-04 | P2 | "possível duplicata" dizia a mesma coisa para casos opostos, e não havia como julgar se descartar era certo. | **CORRIGIDO** - quatro rótulos distintos, cada um com o motivo, e resumo que conta cada um |
| F14-05 | P2 | **Não havia como desfazer uma importação.** O snapshot de desfazer só era escrito por restauração de backup e por limpeza; importar era um `setData` sem volta. Importar 200 linhas na conta errada exigia apagar uma a uma. | **CORRIGIDO** - "Desfazer importação" |
| — | — | Conferidos **sem achado**: nada é gravado antes da confirmação; papéis de fatura; conversão em transferência; teto de tamanho; datas inválidas (já cobertas desde o M4); conteúdo hostil de CSV/OFX (coberto por `test-xss-surface.js`); o arquivo nunca sai do aparelho. | — |

### Alterações

| Arquivo | Motivo |
|---|---|
| `js/import.js` | `FITID` lido e propagado pela normalização; `markDuplicates` reescrita com quatro motivos e detecção dentro do arquivo; contagem por motivo no resumo |
| `js/storage.js` | `origin.externalId` (v23) e a chave `META_IMPORT_UNDO` do recibo local |
| `js/actions.js` | recibo gravado após importar e ação `import-undo`, que remove pelo identificador com lápide |
| `js/app.js` | `state.importUndo`, gravação e hidratação do recibo no boot |
| `js/screens/import.js` | rótulo por motivo com explicação, resumo por motivo e o convite para desfazer |
| `netlify/functions/_shared/finance-schema.js` | schema 23, para cliente e servidor continuarem concordando |
| `tests/test-import-duplicates.js` | **novo** - 31 verificações |
| `tests/test-render.js`, `tests/test-account-backend.js`, `tests/test-accounts.js`, `tests/test-debts.js`, `tests/test-legal-privacy-errors.js`, `tests/test-router.js`, `tests/test-services.js`, `tests/browser/run-browser.js` | expectativa de schema 22 → 23 e a nova tela na não-regressão |
| `docs/VERSIONAMENTO.md`, `docs/ARMAZENAMENTO-E-PRIVACIDADE.md` | schema 23 |

### Motivo

Importação é a única porta por onde entram centenas de lançamentos de uma vez, e
errar nela custa nos dois sentidos. Marcar como duplicata o que não é apaga dado
real em silêncio; não marcar o que é dobra o mês. A régua antiga só errava para o
primeiro lado, que é o pior dos dois, porque não deixa rastro.

### Compatibilidade

- **`origin.externalId` nasce `null`** em toda base anterior e em todo lançamento
  que não veio de extrato com identificador. Nenhum número muda.
- A régua ficou mais **precisa**, não mais permissiva: tudo que era marcado por
  valor e data próxima continua marcado (agora como "parecida") e continua
  nascendo desmarcado. O que mudou é a pessoa saber qual caso tem diante de si.
- O recibo do desfazer mora no `localMeta`, que não entra no backup nem na
  sincronização, e é apagado junto no purge do escopo.
- O desfazer remove **pelo identificador** dos registros criados por aquela
  importação, com lápide; não toca no que foi lançado ou editado depois.
- Schema local 22 → 23, com o backend subindo junto. A rota legada de snapshot é
  somente leitura, então não há janela de `schema_mismatch` durante a publicação.
  A disciplina do M13 funcionou: `tests/test-versioning.js` **reprovou** a
  documentação desatualizada antes que ela chegasse ao commit.

### Testes

| Teste | Resultado |
|---|---|
| `node tests/test-import-duplicates.js` | **PASSOU** - 31 ok, 0 falhas |
| `npm run lint` | **PASSOU** - 0 erro, 0 aviso |
| `npm test` | **PASSOU** - 60 arquivos |
| `npm run check:build` / `check:release` / `build:dist` | **PASSOU** (avisos conhecidos) |
| `npm run test:coverage` | **PASSOU** - 22,5% |
| `npm run test:browser` | **PASSOU** - 18/18 em Chromium, Firefox e WebKit |
| `npm run test:pwa` | **PASSOU** |
| Navegador real, ciclo completo | **PASSOU** - OFX com três linhas, duas de R$ 12,00 com descrições diferentes: **as duas entraram** (antes, uma sumiria). Reimportar o mesmo extrato com data e descrição alteradas marcou duas linhas como "já importado" pelo FITID e deixou a nova marcada; o resumo disse "2 já vieram deste mesmo extrato". "Desfazer importação" pediu confirmação declarando 3 lançamentos, removeu de 5 para 2 (os 2 anteriores intactos) e o convite sumiu. Nenhum 4xx fora da API |

### Status

**CONCLUÍDO.** F14-01 a F14-05 corrigidos. Pendência do módulo: nenhuma.

### Registrado para módulos seguintes

- **CSV e PDF não têm identificador de banco**, então continuam dependendo de
  data, valor e descrição. É limitação do formato, não do código.
- O desfazer guarda **uma** importação, a última. Guardar uma pilha exigiria
  decidir retenção e limite, e não havia achado que pedisse isso.

---

## M15 - Testes automatizados

### Antes (situação encontrada)

A suíte já conferia cálculos, telas, armazenamento, backend, sincronização e os
fluxos principais em três navegadores. Faltava uma prova comportamental na
fronteira mais sensível: o clique registrado em `data-action` chegando à
mutação financeira real. O relatório também apontava 22,5% no total e 0,9% em
`js/actions.js`, números incompatíveis com os caminhos que os testes executavam.

### Achados

| # | P | Achado | Situação |
|---|---|---|---|
| F15-01 | P2 | O agregador de cobertura fazia a união dos intervalos não executados de todos os processos. Se um teste carregasse `actions.js` sem clicar, ele anulava os trechos cobertos por outro teste. | **CORRIGIDO** - um trecho só fica descoberto quando permaneceu sem execução em todos os processos |
| F15-02 | P2 | Criação, edição e exclusão de entidades críticas eram provadas em partes, mas não havia uma suíte dedicada ao caminho `data-action` até a persistência. | **CORRIGIDO** - 29 verificações comportamentais com os fontes reais na ordem do navegador |

### Alterações

| Arquivo | Motivo |
|---|---|
| `tests/test-critical-actions.js` | **novo** - transações offline, transferência, cartão e pagamento, meta, orçamento, importação, login, logout, sincronização, restauração e arquivo protegido |
| `scripts/coverage.js` | interseção correta dos intervalos não executados e pisos de 75% global e 35% para `js/actions.js` |
| `tests/test-coverage.js` | **novo** - regressão da união e da interseção dos intervalos de cobertura |
| `docs/superpowers/specs/2026-08-31-m15-testes-automatizados-design.md` | escopo, fronteiras e critérios do módulo |

### Compatibilidade

Nenhum código de produção, schema, protocolo de sincronização, rota, formato de
backup ou armazenamento foi alterado. O módulo muda somente os testes, a forma
de medir o que eles executam e os pisos que barram regressões.

### Testes

| Teste | Resultado |
|---|---|
| `node tests/test-critical-actions.js` | **PASSOU** - 29 ok, 0 falhas |
| `node tests/test-coverage.js` | **PASSOU** - 3 ok, 0 falhas |
| `npm run lint` | **PASSOU** - 0 erro, 0 aviso |
| `npm test` | **PASSOU** - 62 arquivos |
| `npm run test:coverage` | **PASSOU** - 79,0% global; `js/actions.js` em 41,7% |
| `npm run check:build` / `check:release` / `build:dist` | **PASSOU** - módulo conferido em 71 fontes e pacote com 38 arquivos; avisos legais e de `SITE_URL` já conhecidos |
| `npm run test:browser` | **PASSOU** - 18/18 em Chromium, Firefox e WebKit |
| `npm run test:pwa` | **PASSOU** - shell, dados locais, limpeza e API fora do cache |
| `npm run test:landing` | **PASSOU** - 18/18 |

### Status

**CONCLUÍDO.** F15-01 e F15-02 corrigidos. Pendência do módulo: nenhuma.

---

## M16 - Testes de segurança

### Antes (situação encontrada)

As defesas pedidas pelo roteiro já existiam e eram conferidas em testes
especializados, mas a leitura estava espalhada por autenticação, escopo,
sincronização, revogação, XSS e banco. Faltava uma matriz única que percorresse
os nove vetores nos handlers reais e deixasse explícita a ordem das recusas.

### Resultado da auditoria

| Vetor | Resultado |
|---|---|
| Usuário A contra usuário B | 403 antes de qualquer acesso ao banco |
| JWT inválido | 401 e zero consulta financeira |
| JWT expirado | renovação explícita, sem consumir o refresh na rota escopada |
| Manipulação de `user_id` | o RPC recebe somente `session.user.id` |
| RPC sem autenticação | nenhuma concessão de `EXECUTE` para `PUBLIC`, `anon` ou `authenticated` |
| Aparelho revogado | 403 antes de configuração, revisão ou operações financeiras |
| Replay | repetição idêntica não reaplica; conteúdo divergente recebe 409 |
| Entrada maliciosa | aparelho e entidade hostis são recusados antes da consulta ou do RPC |
| Rate limit | 429 com espera; falha do banco mantém o teto local fechado |

Nenhum dos vetores confirmou uma falha no código de produção. O trabalho do
módulo foi tornar as garantias existentes executáveis em conjunto e deixar uma
consulta para conferir o estado real do PostgreSQL.

### Alterações

| Arquivo | Motivo |
|---|---|
| `tests/test-security-adversarial.js` | **novo** - 22 verificações contra `account.js`, `sync.js`, as guardas de aparelho e o limitador reais |
| `supabase/tests/verify_security_boundary.sql` | **novo** - consulta somente leitura para RPC, RLS e policies no banco de desenvolvimento ou staging |
| `docs/superpowers/specs/2026-08-31-m16-testes-seguranca-design.md` | escopo, método e critérios do módulo |

### Compatibilidade e ambiente

Nenhum código de produção, schema, policy, grant, protocolo ou dado foi
alterado. Não havia Supabase local, `psql`, Docker ou credenciais de staging
nesta máquina, por isso a consulta SQL não foi declarada como executada. Ela
não foi apontada para produção: os testes de rate limit e replay não devem
consumir limites nem criar operações em contas reais.

### Testes

| Teste | Resultado |
|---|---|
| `node tests/test-security-adversarial.js` | **PASSOU** - 22 ok, 0 falhas |
| `npm run lint` | **PASSOU** - 0 erro, 0 aviso |
| `npm test` | **PASSOU** - 63 arquivos |
| `npm run test:coverage` | **PASSOU** - 79,0% global; `js/actions.js` em 41,7% |
| `npm run check:build` / `check:release` / `build:dist` | **PASSOU** - módulo conferido em 71 fontes e pacote com 38 arquivos; avisos legais e de `SITE_URL` já conhecidos |
| `npm run test:browser` | **PASSOU** - 18/18 em Chromium, Firefox e WebKit |
| `npm run test:pwa` | **PASSOU** - shell, dados locais, limpeza e API fora do cache |
| `npm run test:landing` | **PASSOU** - 18/18 |

### Status

**CONCLUÍDO.** Os nove vetores estão cobertos. Pendência externa: executar
`supabase/tests/verify_security_boundary.sql` quando houver desenvolvimento ou
staging conectado; isso não pede alteração no banco.

---

## M17 - Observabilidade

### Resultado

Conta, sincronização e análise agora produzem um evento JSON controlado com
área, operação, método, status, duração, código e identificador aleatório da
requisição. O mesmo `X-Request-Id` volta na resposta. Corpo, cabeçalhos, cookies,
IP, email, identificadores de usuário ou aparelho, mensagens, pilhas e valores
financeiros não entram no evento.

O diagnóstico do navegador ganhou áreas de autenticação, API e Service Worker,
mas continua local, limitado a 30 dias e 50 ocorrências e sem envio automático.
O Service Worker comunica apenas área e código permitidos.

### Alterações

| Arquivo | Motivo |
|---|---|
| `netlify/functions/_shared/observability.js` | evento seguro e correlação por requisição |
| `netlify/functions/account.js`, `sync.js`, `analyze.js` | cobertura das funções públicas |
| `js/safe-errors.js`, `js/auth.js`, `js/app.js`, `service-worker.js` | diagnóstico local das novas áreas e falhas do pacote |
| `docs/OBSERVABILIDADE.md` | contrato dos campos e procedimento de consulta |
| `tests/test-observability.js` | **novo**; 18 verificações do evento, exceção, funções e cliente |

### Testes

| Teste | Resultado |
|---|---|
| `node tests/test-observability.js` | **PASSOU**; 18 ok, 0 falhas |
| `npm run lint` | **PASSOU**; 0 erro, 0 aviso |
| `npm test` | **PASSOU**; 64 arquivos |
| `npm run test:coverage` | **PASSOU**; 79,0% global e 41,7% em `js/actions.js` |
| Matrizes de navegador, PWA e landing | **PASSOU** |

### Status

**CONCLUÍDO.** Nenhum serviço externo de monitoramento foi adicionado. O prazo
dos logs da plataforma não foi inventado e passou para o inventário do M18.

---

## M18 - Inventário de dados e LGPD

### Resultado

`LEGAL_DATA_INVENTORY` passou a mapear 14 fluxos com as seis dimensões do roteiro:
finalidade, armazenamento, retenção, acesso, terceiros e exclusão. A tela de
Privacidade renderiza essa fonte em itens expansíveis, e o documento operacional
liga cada fluxo ao código que o implementa.

A revisão encontrou duas diferenças entre o texto antigo e o comportamento real.
O aceite faz parte da configuração sincronizada quando há conta, e a consulta
fiscal sai diretamente do navegador, permitindo que o portal receba IP e
metadados normais da conexão. Os dois pontos foram corrigidos na política.

A política também passou a declarar que as cópias locais de recuperação podem
ser JSON legível e sem criptografia e que apagar dados do app não alcança backup
exportado, chamada já enviada à IA nem registro mantido por portal externo.

### Alterações

| Arquivo | Motivo |
|---|---|
| `js/storage.js` | fonte estruturada, validador, versão legal `2026-08-31.1` e retenção precisa do limite de tentativas |
| `js/screens/privacy.js`, `css/screens/legal.css` | inventário acessível e avisos corrigidos |
| `docs/INVENTARIO-DE-DADOS.md` | **novo**; matriz operacional e fontes de código |
| `docs/LEGAL-LAUNCH.md`, `docs/ARMAZENAMENTO-E-PRIVACIDADE.md`, `docs/RELEASE.md` | pendências e fluxos externos atualizados |
| `tests/test-data-inventory-lgpd.js` | **novo**; 35 verificações de estrutura, agrupamento e correspondência |
| `scripts/check-release.js` | presença do inventário vira condição da publicação |
| `service-worker.js` | pacote offline promovido para `v61` |

### Compatibilidade

Schema financeiro, IndexedDB, protocolo de sincronização e APIs permanecem
inalterados. A mudança material da política pede novo aceite e preserva o
histórico anterior. Os sete campos do controlador, a retenção dos logs e o
contrato de retenção e exclusão da IA continuam como decisões externas.

### Testes

| Teste | Resultado |
|---|---|
| `node tests/test-data-inventory-lgpd.js` | **PASSOU**; 35 ok, 0 falhas |
| `node tests/test-legal-privacy-errors.js` | **PASSOU**; 60 ok, 0 falhas |
| `node tests/test-storage-privacy-inventory.js` | **PASSOU**; 69 ok, 0 falhas |
| `node tests/test-versioning.js` | **PASSOU**; 44 ok, 0 falhas |
| `npm run lint` | **PASSOU**; 0 erro, 0 aviso |
| `npm test` | **PASSOU**; 65 arquivos |
| `npm run test:coverage` | **PASSOU**; 79,1% global e 41,7% em `js/actions.js` |
| `npm run check:build`, `check:release`, `build:dist` | **PASSOU**; 71 fontes e pacote com 38 arquivos; avisos externos conhecidos preservados |
| `npm run test:browser` | **PASSOU**; 18 de 18 em Chromium, Firefox e WebKit |
| `npm run test:pwa` | **PASSOU**; shell, landing, dados locais, limpeza e API fora do cache |
| `npm run test:landing` | **PASSOU**; 18 de 18 |

### Status

**CONCLUÍDO.** Inventário, política, documentação, publicação e fluxos de navegador
foram validados. As pendências restantes dependem de dados e contratos externos.

---

## M19 - Transparência de terceiros

### Resultado

`LEGAL_THIRD_PARTIES` registra os cinco serviços externos comprovados pela
configuração e pelo código: Vercel, Supabase, Anthropic, Have I Been Pwned e o
portal fiscal indicado pelo QR Code. Cada entrada declara quando participa,
finalidade, dados recebidos, retenção, exclusão, transferência e fonte oficial.

A hospedagem agora é descrita com a distinção necessária entre processar a
requisição e escrever conteúdo em log. O evento controlado continua sem corpo,
email, senha, cookie, IP e dados financeiros, mas as funções processam
temporariamente cadastro, sincronização, senha ou pacote de IA conforme a rota.

O prazo público da Anthropic foi registrado como exclusão padrão da API em até
30 dias, com as exceções declaradas pelo fornecedor. A Vercel passou a mostrar a
faixa por plano, de 1 hora a 30 dias. Plano, contrato e região efetivos continuam
como decisões externas. O SMTP de produção aparece sem nome de empresa porque o
fornecedor escolhido não existe no repositório.

### Alterações

| Arquivo | Motivo |
|---|---|
| `js/storage.js` | fonte estruturada, validadores, prazos públicos e versão legal `2026-08-31.2` |
| `js/screens/privacy.js`, `css/screens/legal.css` | registro expansível com estado em uso ou por definir |
| `docs/TERCEIROS-E-OPERADORES.md` | **novo**; matriz, limites, fontes e regra de atualização |
| `docs/LEGAL-LAUNCH.md`, `docs/INVENTARIO-DE-DADOS.md`, `README.md` | pendências contratuais e serviços atuais alinhados |
| `tests/test-third-party-transparency.js` | **novo**; estrutura, integração, UI e publicação |
| `scripts/check-release.js` | registro, tela e documento viram condição da publicação |
| `service-worker.js` | pacote offline promovido para `v62` |

### Compatibilidade

Schema financeiro, IndexedDB, protocolo de sincronização e APIs permanecem
inalterados. A mudança material da política pede novo aceite e preserva o
histórico anterior. Não foi adicionado nenhum serviço, chamada de rede ou script.

### Testes

| Teste | Resultado |
|---|---|
| `node tests/test-third-party-transparency.js` | **PASSOU**; 37 ok, 0 falhas |
| `node tests/test-data-inventory-lgpd.js` | **PASSOU**; 35 ok, 0 falhas |
| `node tests/test-legal-privacy-errors.js` | **PASSOU**; 60 ok, 0 falhas |
| `node tests/test-storage-privacy-inventory.js` | **PASSOU**; 69 ok, 0 falhas |
| `npm run lint` | **PASSOU**; 0 erro, 0 aviso |
| `npm test` | **PASSOU**; 66 arquivos |
| `npm run test:coverage` | **PASSOU**; 79,3% global e 41,7% em `js/actions.js` |
| `npm run check:build`, `check:release`, `build:dist` | **PASSOU**; 71 fontes e pacote com 38 arquivos; avisos externos conhecidos preservados |
| `npm run test:browser` | **PASSOU**; 18 de 18 em Chromium, Firefox e WebKit, incluindo o registro expansível |
| `npm run test:pwa` | **PASSOU**; shell, landing, dados locais, limpeza e API fora do cache |
| `npm run test:landing` | **PASSOU**; 18 de 18 |
| Revisão visual | **PASSOU**; 1440 px e 390 px sem estouro horizontal ou erro de página |

### Status

**CONCLUÍDO.** Serviços reais documentados e ausência de analytics declarada.
Fornecedor SMTP, plano e contrato efetivos permanecem como pendências externas.

---

## M20 - Resposta a incidentes

### Antes

Não existia procedimento. O item 8 de `docs/LEGAL-LAUNCH.md` registrava a falta
("quem detecta, quem decide, em quanto tempo comunica, onde fica o registro") e a
tela de Privacidade já publicava um canal do art. 48 sem processo por trás dele.
As peças estavam todas prontas e espalhadas: eventos do M17, inventário do M18,
terceiros do M19, revogação do M7, protocolo do M10, retorno de publicação do
`docs/RELEASE.md`. Faltava a ordem em que se puxa cada uma sob pressão.

### Alterações

| Arquivo | Motivo |
|---|---|
| `SECURITY_INCIDENT_RESPONSE.md` | **novo**; as oito fases, papéis, prazos, registro e pendências |
| `tests/test-incident-response.js` | **novo**; 69 verificações que amarram o documento ao código |
| `scripts/check-release.js` | documento e as oito fases viram condição de publicação |
| `docs/LEGAL-LAUNCH.md` | item 8 deixa de ser "processo indefinido" e passa a ser "designação pendente" |
| `README.md`, `CHANGELOG.md` | apontam o procedimento |

**Nenhum arquivo de produção foi tocado.** Sem `js/`, sem `css/`, sem
`netlify/`, sem `supabase/`, sem `service-worker.js`, sem migration. O cache
offline não precisou de promoção e `LEGAL_TEXT_VERSION` não mudou, porque nada do
que o usuário recebe mudou.

### Motivo

O que diferencia este plano de um modelo genérico é que a contenção só cita
alavanca que existe:

- rotação de `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `RATE_LIMIT_SECRET`;
- `revoke-device` e `revoke-others` (M7), que encerram sessão sem tocar dado local;
- **subir `minimum_write_protocol` em `cofre_sync_config`**, que faz o cliente
  vulnerável receber **426** e **manter a fila** — o desligamento mais seguro do
  sistema, porque recusa escrita sem descartar nada;
- remover `ANTHROPIC_API_KEY`, que desliga só a IA;
- promover o último deploy bom na Vercel.

Dois pontos que só aparecem por ser este sistema e não outro:

1. **Reverter o servidor não alcança o cliente.** Quem já instalou o pacote ruim
   continua com ele; só publicação com `VERSION` do Service Worker promovida chega
   ao navegador. Um plano copiado de SaaS comum erraria isso.
2. **Preservar evidência vem antes de conter**, porque o log de execução pode durar
   1 hora conforme o plano da Vercel (M19). Conter primeiro apagaria a prova.

Há uma lista explícita de **"o que nunca é contenção"** — não desabilitar RLS, não
purgar dado de terceiro, não apagar dado local (em modo visitante o aparelho é a
única cópia), não editar migration histórica. É a regra de ouro da auditoria
escrita para o momento em que a pressa empurra para o lado contrário.

### Compatibilidade

Total. Módulo de documentação e verificação. Contratos de API, banco, IndexedDB,
localStorage, sincronização e formatos de dados intocados. `check:release` ganhou
verificação nova, e ela foi testada nos dois sentidos: aprova com o documento
íntegro e reprova sem ele ou com ele esvaziado.

### Testes

| Teste | Resultado |
|---|---|
| `node tests/test-incident-response.js` | **PASSOU**; 69 ok, 0 falhas |
| `npm run check:release` | **PASSOU**; avisos externos conhecidos (7 campos do controlador, 1 fornecedor) preservados |
| `npm run check:release` sem o documento | **REPROVOU como esperado**; 3 falhas |
| `npm run check:release` com o documento esvaziado | **REPROVOU como esperado**; 2 falhas |
| `npm run lint` | **PASSOU**; 0 erro, 0 aviso |
| `npm run check:build` | **PASSOU**; 71 fontes, módulo gerado conferido |
| `npm test` | **5 arquivos falharam**, todos por causa anterior — ver o achado abaixo |
| `npm run test:browser`, `test:pwa`, `test:coverage` | **NÃO EXECUTADOS**; nenhum arquivo de cliente ou de produção mudou, então não haveria o que provar |

### Achado independente do módulo (P2, pré-existente)

`test-goals.js`, `test-health.js`, `test-insights-engine.js`, `test-render.js` e
`test-wealth.js` falham nesta árvore. **Não é regressão do M20**: o M20 não tocou
nenhum `js/`, e as cinco falhas foram reproduzidas em uma worktree limpa no commit
`56c58f9` (M19).

**Causa: fixture dependente da data de execução.** As suítes montam dados com
`monthsAgo(n, day = 10)`, que ancora lançamentos no **dia 10** de cada mês. Hoje é
**dia 1**, então `monthsAgo(0)` cai no **futuro** e o app corretamente ignora
lançamento futuro. Daí "caixa = 8.000 → 10000" (a despesa futura não baixou o
saldo), o mapa de calor do mês vazio e o aporte da meta não contabilizado.

O produto está certo; o teste é que assume que o dia 10 já passou. Por isso o M19
registrou `npm test` como aprovado em **2026-08-31** e a mesma árvore reprova em
**2026-09-01**. A suíte passa do dia 11 em diante e reprova nos dez primeiros dias
de qualquer mês.

Correção sugerida (não feita aqui, é escopo do M15): congelar o relógio das
fixtures ou ancorar no dia 1 em vez do dia 10. Enquanto não for feito, a CI
reprova dez dias por mês por motivo falso — o que é pior que um teste vermelho
conhecido, porque ensina a ignorar o vermelho.

### Status

**CONCLUÍDO.** O procedimento existe, está amarrado ao código por teste e virou
condição de publicação. O que continua aberto não é processo, é **designação**:
sem `dpoName`, `dpoEmail` e `incidentEmail` reais não há encarregado nomeado nem
canal publicado. O canal de entrada para pesquisador é o M21.

---

## M21 - Divulgação responsável

### Antes

Não havia por onde relatar. O M20 já dizia, nas próprias pendências, que "hoje um
pesquisador não tem para onde escrever". O repositório é público
(`zRenan0/finance-manager`, confirmado pela API do GitHub), mas não tinha
`SECURITY.md`; o domínio não servia `security.txt`; e os sete campos de
`LEGAL_CONTROLLER` continuam marcadores, então **não existe endereço de email
publicável**.

### Alterações

| Arquivo | Motivo |
|---|---|
| `reportar-vulnerabilidade.html` | **novo**; página pública, estática, sem script, formulário ou rede |
| `css/reportar.css` | **novo**; só o que a landing não tinha (texto corrido, listas, cartões) |
| `SECURITY.md` | **novo**; a mesma política onde o GitHub procura |
| `scripts/security-txt.js` | **novo**; gerador do `/.well-known/security.txt` (RFC 9116) |
| `tests/test-responsible-disclosure.js` | **novo**; 63 verificações |
| `vercel.json` | reescrita de `/reportar-vulnerabilidade` e `/security.txt`; `Content-Type` do arquivo |
| `scripts/build-dist.js` | publica a página e gera o `security.txt` |
| `scripts/serve.js`, `tests/browser/run-landing.js` | espelham as reescritas, lendo do próprio `vercel.json` |
| `scripts/check-release.js`, `scripts/check-deploy.js` | canal vira condição de publicação e é conferido em produção |
| `landing.html`, `tests/test-landing.js` | link no rodapé; validador de links passou a entender reescrita |
| `SECURITY_INCIDENT_RESPONSE.md`, `docs/LEGAL-LAUNCH.md` | o M20 deixa de listar o canal como ausente |

**Nenhum arquivo de `js/` foi tocado**, e o Service Worker continua em `v62`: a
página nova não faz parte do app shell, e o `handleNavigate` já trata qualquer
outra página do site pelo `PAGE_CACHE`, sob a própria URL, com a raiz de reserva.

### Motivo

Três decisões carregam o módulo:

1. **O `security.txt` é gerado, não commitado.** O campo `Expires` é obrigatório e
   a RFC 9116 o quer a menos de um ano no futuro. Arquivo estático vence sozinho,
   em silêncio, e um pesquisador que o encontre expirado tem motivo para achar o
   canal abandonado. Gerando no build, cada publicação renova o prazo (hoje 180
   dias). Sem `SITE_URL` resolvida ele não é escrito — URI relativa seria inválida,
   e publicar inválido é pior que não publicar.
2. **O `Contact` aponta para a página e para o GitHub, não para um email.** A RFC
   aceita qualquer URI. Como `incidentEmail` é marcador, inventar endereço faria o
   relato cair no vazio. Quando o campo receber valor real, o `mailto:` entra
   sozinho, na frente dos outros, **sem mudança de código** — e há teste provando
   os dois estados.
3. **A página é inerte.** Sem script, sem formulário, sem manipulador, sem estilo
   embutido, sem recurso de outra origem. Quem chega nela pode estar investigando
   o site; ela não deve ser mais uma superfície para investigar. Isso também a
   mantém dentro da CSP atual, que tem `form-action 'none'`.

O conteúdo diz o que o módulo pede e mais uma coisa que só vale para este produto:
a divulgação deve esperar a correção **porque o app é offline-first** — quem já
instalou uma versão só recebe o conserto ao abrir de novo, então publicar antes
atinge quem ainda não teve como se atualizar.

### Compatibilidade

Total. Nenhuma rota, contrato, chave ou formato mudou. As duas reescritas novas
são endereços que não existiam. As duas verificações que já espelhavam o
`vercel.json` (servidor local e servidor da suíte de navegador) passaram a ler as
reescritas do próprio arquivo, em vez de repetir a lista — e o espelho do
navegador só aplica a reescrita quando o destino existe ali, senão `/index.html`
passaria a 404 ao servir o repositório.

### Testes

| Teste | Resultado |
|---|---|
| `node tests/test-responsible-disclosure.js` | **PASSOU**; 63 ok, 0 falhas |
| `node tests/test-incident-response.js` | **PASSOU**; 69 ok |
| `node tests/test-landing.js` | **PASSOU**; 71 ok |
| `npm run lint` | **PASSOU**; 0 erro, 0 aviso |
| `npm run check:release` | **PASSOU**; avisos externos conhecidos preservados |
| `npm run check:build` | **PASSOU**; 71 fontes |
| `npm run build:dist` | **PASSOU**; 40 arquivos + `security.txt` válido até 2027-02-28 |
| `npm run test:landing` | **PASSOU**; 18 de 18 |
| `npm run test:browser` | **PASSOU**; 18 de 18 em Chromium, Firefox e WebKit |
| `npm run test:pwa` | **PASSOU**; shell, landing, dados locais, limpeza e API fora do cache |
| `npm test` | 68 arquivos; as **mesmas 5 falhas** de data do M20, nenhuma nova |
| Navegador real | **PASSOU**; página conferida em 1440, 390 e 320 px, sem estouro horizontal e sem erro de console |
| `npm run check:deploy` | **NÃO VALIDADO**; as verificações novas do bloco 8 só rodam contra o site publicado |

### Status

**CONCLUÍDO.** O canal existe e não depende de nenhuma pendência jurídica para
funcionar. Duas coisas ficam fora do alcance do repositório: confirmar no painel
do GitHub que o **recebimento privado de vulnerabilidade** está habilitado (sem
isso o link do canal preferido não abre para quem relatar), e preencher
`incidentEmail` quando existir.

---

## M22 - Arquitetura de marca

### Antes

A auditoria abriu este módulo supondo disputa entre duas marcas. O levantamento
mostrou outra coisa: **não havia duas marcas**. "FinanceManager" não aparecia em
nenhuma tela, título, manifesto, PDF, backup ou onboarding. Aparecia na barra de
endereço e em **três linhas de documentação**, escritas nos módulos 20 e 21 por
este próprio trabalho. O produto sempre se chamou Cofre.

O que existia de verdade eram duas coisas diferentes:

1. **Nome e endereço não combinam**, o que é comum e não é defeito;
2. **Três gerações de identificadores** convivem no código (`cofre_*` no banco,
   `financas_*` no aparelho, `organizador-financeiro/backup` no arquivo), e essa
   divergência *parece* bagunça de marca esperando limpeza.

O segundo item é o risco real do módulo. Uma "padronização de marca" feita por
busca e substituição renomearia tabela em produção, chave de IndexedDB e o `kind`
do backup — apagando o banco local de quem já usa e impedindo a abertura de
backups antigos.

### Alterações

| Arquivo | Motivo |
|---|---|
| `docs/MARCA.md` | **novo**; a decisão, a regra de escrita e os identificadores congelados |
| `tests/test-brand.js` | **novo**; 52 verificações, metade delas travando os congelados |
| `index.html` | `noindex, follow` e o comentário explicando por que o título é igual ao da landing |
| `manifest.webmanifest` | `name` sem barra vertical; `short_name`, `start_url` e `scope` intactos |
| `landing.html` | `apple-mobile-web-app-title` = `Cofre` |
| `SECURITY.md`, `SECURITY_INCIDENT_RESPONSE.md`, `scripts/security-txt.js` | as três linhas que tratavam o domínio como nome de produto |
| `scripts/check-release.js` | marca, congelados e identidade de instalação viram condição de publicação |

### Motivo

**A decisão:** o produto se chama Cofre; `financemanager.dev.br` é o endereço.
Nem "FinanceManager — Cofre", nem "Cofre by FinanceManager". "Cofre" já é a
identidade inteira (logotipo, atalho instalado, PDF, retrospectiva, onboarding), e
o domínio é o ativo caro de trocar (indexação, links compartilhados, `SITE_URL`
dos emails de confirmação, `Canonical` do `security.txt`). Trocar qualquer um dos
dois custaria muito mais do que a confusão resolve.

**O que NÃO foi feito, e por quê.** O impulso natural aqui era separar os títulos
da landing e do aplicativo, que hoje são idênticos. Isso teria contrariado uma
correção anterior deliberada: o F-11 de `tests/test-beta-fixes.js` trava a
igualdade porque o aplicativo já se chamou "Finanças" enquanto a landing se
chamava "Cofre", e quem clicava em "Começar grátis" chegava ao que parecia outro
produto. A regra de ouro se aplicou: **função confirmada, não se remove.**

O efeito colateral legítimo do título repetido — duas URLs disputando a mesma
busca — foi resolvido pelo outro lado: o aplicativo virou `noindex, follow`. Ele
não tem o que indexar (sem JavaScript executado, a página é um esqueleto de
carregamento), e isso também resolve a duplicata entre `/index.html` e
`/app.html`, que servem os mesmos bytes. Reversível apagando uma linha.

### Compatibilidade

Total, e este é o ponto do módulo. `short_name`, `start_url` e `scope` do
manifesto não mudaram — como não existe campo `id`, é o `start_url` que identifica
a instalação, então nenhum atalho já instalado foi afetado. O `name` mudou só de
`|` para `.`, seguindo o idioma que o projeto já usa em outros lugares.

O Service Worker continua em `v62`: `handleNavigate` busca o app shell pela rede
primeiro e só cai no cache quando falha, então o `noindex` chega na próxima
abertura com conexão, sem forçar todo mundo a rebaixar o pacote.

Nenhum identificador congelado foi tocado.

### Testes

| Teste | Resultado |
|---|---|
| `node tests/test-brand.js` | **PASSOU**; 52 ok, 0 falhas |
| `node tests/test-beta-fixes.js` (F-11) | **PASSOU**; a igualdade de títulos continua travada |
| `node tests/test-input-validation.js` | **PASSOU** depois de corrigir dois travessões que eu havia introduzido em `index.html` e no manifesto (o projeto proíbe `—` no código entregue) |
| `npm run lint`, `check:release`, `check:build`, `build:dist` | **PASSOU** |
| `npm run test:pwa` | **PASSOU**; manifesto alterado não afetou instalação nem cache |
| `npm run test:browser` | **PASSOU**; 18 de 18 em Chromium, Firefox e WebKit |
| `npm run test:landing` | **PASSOU**; 18 de 18 |
| `npm test` | 69 arquivos; as **mesmas 5 falhas** de data, nenhuma nova |
| Navegador real | **PASSOU**; aplicativo abre no onboarding com a marca Cofre, `robots` e ícones conferidos, único 404 é `/api/account/session` (esperado sem `vercel dev`) |

### Status

**CONCLUÍDO.** Fica registrado como P3, sem impedimento: o aplicativo não declara
Open Graph próprio, então um link direto para `/index.html` compartilhado em rede
social não gera cartão. A landing é a página de compartilhamento e tem o conjunto
completo; resolver isso exigiria estender a absolutização de endereços do build
para uma segunda página, o que é custo sem retorno hoje.

---

## M23 - Landing page

### Antes

A landing já é boa e a ordem dela já estava certa: problema, quatro telas,
recursos, momento wow, simuladores, comparação, segurança, passos, preço, FAQ,
chamada final. O que faltava não era conteúdo nem ordem, era **o mapa**: o leitor
saía de "cadê o dinheiro?" e caía direto em quatro telas e nove cartões de
recurso, sem uma gaveta onde guardar o que estava vendo.

### Alterações

| Arquivo | Motivo |
|---|---|
| `landing.html` | seção nova "A proposta", entre o problema e a demonstração |
| `css/landing.css` | bloco 27, só o que não existia (cartão de pilar, lista, link) |
| `service-worker.js` | `v62` para `v63` |
| `tests/test-brand.js`, `test-responsible-disclosure.js`, `test-third-party-transparency.js` | fixavam o número da versão do cache |
| `README.md`, `docs/VERSIONAMENTO.md`, `docs/ARMAZENAMENTO-E-PRIVACIDADE.md` | versão do cache publicada |

### Motivo

Os três pilares entram **onde a pergunta nasce**: logo depois de "Tudo isso cabe
em uma tela só" e antes da demonstração. Eles respondem "e o que isso faz por
mim?" em três movimentos, na ordem em que a pessoa vive o dinheiro, e cada um
aponta para a seção que o prova (`#historia`, `#recursos`, `#simuladores`).

**O que NÃO foi feito, e por quê.** O caminho óbvio seria reagrupar os nove
cartões do bento sob os três pilares. Não foi feito: o bento é uma grade de 6
colunas cujos `span` ladrilham exatamente (3+3, 4+2, 2+2+2, 3+3), e qualquer
reagrupamento por pilar quebra a conta — "ENTENDA" sozinho daria 3+2+3+2, que não
fecha linha. Seria refazer um layout que funciona para satisfazer uma taxonomia.
Os atrasos de revelação (`nth-child(3n+2)`) e as regras responsivas também
dependem da ordem atual dos filhos diretos.

**Nenhuma funcionalidade saiu da página.** Nenhuma seção mudou de lugar, nenhum
`id` mudou, a navegação e o rodapé não foram tocados. A seção nova reaproveita
shell, cabeçalho, kicker e o `.lp-reveal` global, então não há JavaScript novo e
a animação é a mesma do resto da página.

### O achado do módulo: a folha da landing é stale-while-revalidate

O preview mostrou a seção **sem estilo nenhum**. Não era erro de CSS: o Service
Worker registrado servia `css/landing.css` do balde `financas-cache-v62`. Foi
confirmado ao vivo — com `navigator.serviceWorker.controller` presente, o estilo
não aplicava; sem controlador, aplicava.

É exatamente o caso descrito no comentário do `v51` no próprio Service Worker.
Como a navegação vai à rede primeiro, o visitante que voltasse receberia o **HTML
novo com a folha antiga** e veria a seção crua. Por isso a versão foi promovida
para `v63`, com o motivo registrado na lista de versões do arquivo.

Três testes fixavam `"v62"` literalmente e reprovaram por causa disso. Eles foram
relaxados para o invariante que realmente importa (a versão existe e não regride),
porque fixar o número transforma toda promoção legítima futura em falha de um
módulo que nada tem a ver com ela. Os outros testes já liam a versão do arquivo e
exigiam que a documentação acompanhasse — esses estavam certos, e a documentação
foi atualizada.

### Testes

| Teste | Resultado |
|---|---|
| `node tests/test-landing.js` | **PASSOU**; 71 ok |
| `npm run test:landing` | **PASSOU**; 18 de 18, incluindo "todo CTA chega a uma página que existe" |
| `npm run test:browser` | **PASSOU**; 18 de 18 em Chromium, Firefox e WebKit |
| `npm run test:pwa` | **PASSOU**; promoção de cache não quebrou o offline |
| `npm run lint`, `check:release`, `build:dist` | **PASSOU** |
| `npm test` | 69 arquivos; as **mesmas 5 falhas** de data, nenhuma nova |
| Navegador real | **PASSOU**; 1440 px em três colunas com a mesma altura e os três links alinhados na base; 797 px e 390 px em coluna única, sem estouro horizontal; os três destinos existem |

### Status

**CONCLUÍDO.** Design e animações preservados, nenhuma funcionalidade removida da
página, hierarquia resolvida por adição.

---

## M24 - Onboarding

### Antes

O assistente já existia, com 4 passos e "Pular por agora". A primeira coisa do
módulo foi **medir**, em navegador, o que ele entregava: em 9 interações o painel
já nascia com saldo real, renda declarada e teto em 9 categorias. Não era um
tutorial de 15 passos, e o objetivo do roteiro estava quase todo cumprido.

Faltava exatamente uma das perguntas do roteiro: **gastos fixos**. E faltava o que
ela resolveria: as três manchetes do painel nasciam em R$ 0,00 e os tetos vinham
de percentual, não da vida da pessoa.

### Alterações

| Arquivo | Motivo |
|---|---|
| `js/screens/onboarding.js` | passo 4 novo, resumo ao vivo, base comum de semeadura, rótulo de reserva do progresso |
| `js/app.js` | um `case "onb-fixed"` para as cinco linhas, pela `data-id` |
| `js/actions.js` | o avanço deixou de fixar 4 como último passo |
| `css/screens/notifications-onboarding.css` | linhas do passo, total, e a barra cabendo cinco passos |
| `service-worker.js` | `v63` para `v64` |
| `tests/test-onboarding.js`, `tests/browser/run-browser.js`, `tests/browser/run-pwa.js` | cobertura do passo e ajudantes que não contam mais cliques |

### Motivo: por que a resposta NÃO vira lançamento

Foi a decisão central do módulo, e ela é do próprio app:

1. **Recorrência aqui é derivada, não cadastrada.** `recurring.js` classifica a
   cadência pelo intervalo entre cobranças reais. Semear lançamentos para
   alimentar esse motor seria dar histórico falso justamente ao componente cujo
   trabalho é inferir o histórico verdadeiro.
2. **Nenhuma data seria honesta.** Um aluguel que ainda não venceu não é despesa
   deste mês; gravá-lo hoje inflaria "Despesas do mês". Gravá-lo no mês passado
   inventaria um passado que a pessoa não viveu.

O que a resposta faz custa zero em integridade e vale mais: vira **teto da
categoria antes da semeadura**. `seedBudgetsFromSplit` já trata teto existente
como intocável e o desconta da cota do grupo (comentário do próprio budgets.js),
então **nenhuma linha de `budgets.js` precisou mudar**. Conferido no navegador com
renda de R$ 6.000 e fixos de R$ 2.080: Necessidades ficou com R$ 3.000, menos
R$ 1.900 declarados, e os R$ 1.100 restantes se repartiram em Alimentação
R$ 733,33, Saúde R$ 244,45 e Educação R$ 122,22 — soma exata. O painel abriu com
Moradia em R$ 1.500,00, o valor da pessoa, e não os R$ 1.200,00 do rateio.

### Três consertos que o módulo obrigou

1. **O resumo ao vivo sem sink de HTML.** Somar cinco campos e só mostrar o
   resultado na próxima renderização esvaziaria o passo. O remendo escreve
   `textContent` em elementos que já existem: um `innerHTML` aqui seria o
   primeiro sink novo desde o M4, e `tests/test-xss-surface.js` reprovou a
   primeira tentativa — corretamente.
2. **A barra de progresso.** `repeat(4, 1fr)` era o número de passos escrito na
   folha, e com cinco ela quebrava linha. Virou `grid-auto-flow: column`, que
   conta os passos que existem.
3. **Rótulo cortado a 320 px com zoom de 200%.** Cinco colunas não comportam
   cinco rótulos legíveis. Nessa faixa os rótulos saem e fica só o do passo
   atual, em linha própria; o grupo continua anunciando "Passo X de 5".

### Compatibilidade

`state.onboarding` é memória de tela, não é persistido, então o campo novo não
mexe em schema nem em migração. Quem pula o passo termina com exatamente o
comportamento anterior. Nenhum contrato de dados foi tocado.

Três ajudantes de teste contavam cliques em `Próximo` ou fixavam "de 4"; foi isso
que derrubou 17 dos 18 testes de navegador na primeira execução. Foram trocados
por laço e por leitura do próprio rótulo — a mesma lição das versões de cache no
M23: número fixo em teste vira falha de módulo alheio.

### Testes

| Teste | Resultado |
|---|---|
| `node tests/test-onboarding.js` | **PASSOU**; 152 ok |
| `node tests/test-xss-surface.js` | **PASSOU** (reprovou a primeira tentativa, com razão) |
| `npm run test:browser` | **PASSOU**; 18 de 18, incluindo 320x480 com zoom de 200% |
| `npm run test:pwa` | **PASSOU** |
| `npm run lint`, `check:build`, `check:release` | **PASSOU** |
| `npm test` | 69 arquivos; as **mesmas 5 falhas** de data. `test-account-confirmation` falhou uma vez por EPERM do OneDrive e passou na re-execução |
| Navegador real | **PASSOU**; fluxo completo em 11 interações, total ao vivo, prévia conferindo com a gravação, painel abrindo com o teto declarado; 390 px sem estouro |

### Status

**CONCLUÍDO.** Fica registrado, sem impedimento: o passo 2 ainda exige renda
maior que zero para avançar. É defensável (orçamento e previsão não existem sem
ela) e há a saída global de "Pular por agora", mas quem não sabe a renda não tem
como seguir só até a conta.

---

## M25 - Modo demonstração

### Antes

Não existia. Quem chegava pela landing precisava responder o assistente e lançar
dados para ver qualquer coisa funcionando. O risco do módulo é único e óbvio:
**um modo que escreve no mesmo lugar dos dados reais é pior que não ter modo
nenhum.**

### A decisão de arquitetura

Havia dois caminhos de isolamento:

1. **Escopo próprio de armazenamento.** O app já separa banco por conta
   (`storageScopeFor`, `scopedName`), e um escopo `demo` daria um IndexedDB
   separado. Mas oito lugares do código tratam "não é visitante" como sinônimo
   de "é conta" — inclusive o que liga a fila de sincronização. Cada um teria de
   aprender um terceiro caso, no arquivo mais delicado do projeto (`auth.js`).
2. **Memória, com guarda no caminho único de gravação.** `setData` é, nas
   palavras do próprio comentário do arquivo, "o ponto por onde TODA alteração
   passa", e `saveData` só é chamado ali.

Foi o segundo. **Duas linhas guardadas em um lugar, em vez de oito verificações
espalhadas.** Enquanto o modo está ligado, `setData` não chama `saveData` e não
agenda a nuvem; nada mais precisou mudar.

O efeito colateral é aceito de propósito: recarregar a página encerra a
demonstração. Para dado fictício é o comportamento certo, e é o que torna a
promessa verificável em vez de depender de disciplina.

### Alterações

| Arquivo | Motivo |
|---|---|
| `js/demo.js` | **novo**; arquivo puro que monta o conjunto fictício |
| `tests/test-demo-mode.js` | **novo**; 46 verificações, com espiões nas duas saídas |
| `js/app.js` | `isDemoMode`, as duas guardas, entrar, sair e a faixa |
| `js/actions.js`, `js/screens/onboarding.js`, `css/components.css` | ações, porta de entrada e estilo |
| `service-worker.js` | `v64` para `v65` |

O conjunto tem 78 lançamentos em 6 meses, conta, cartão, 2 metas, 3 bens, 1
dívida e teto em 9 categorias. Ele é montado pelas **fábricas reais**
(`makeTransaction`, `makeAccount`, `makeCreditCard`, `makeAsset`) e passa por
`migrate` no fim, então nunca sai do schema. As datas usam dia limitado a 28 e,
no mês corrente, a hoje — as duas armadilhas que hoje deixam cinco suítes
vermelhas. E é determinístico, sem `Math.random`.

### A prova, em navegador

Não bastava afirmar. Com a demonstração aberta:

1. despejei o IndexedDB e o espelho em localStorage;
2. executei uma **escrita real** pelo caminho normal do app (confirmar uma
   recorrência na tela de Assinaturas, que chama `setData`);
3. despejei tudo de novo.

Resultado: **banco idêntico, espelho idêntico, 0 lançamentos no disco (contra 78
na tela), fila de sincronização vazia** e nenhum traço de `Convidada`,
`demo-conta-corrente` ou `demo-goal-reserva` em lugar nenhum. As oito telas
prometidas foram percorridas com a faixa presente em todas.

### O defeito que a verificação encontrou

Ao sair da demonstração, o usuário caía no painel **sem ter aceitado a política**:
entrar fechava o assistente e sair não o trazia de volta. Olhar a demonstração
tinha virado um caminho para pular o aceite.

Corrigido guardando `onboardingWasOpen` ao entrar e restaurando ao sair.
Reconferido em navegador: entrar esconde o assistente, sair devolve "Passo 1 de
5" com o aceite pendente. Quem não estava no assistente não é jogado nele.

### Compatibilidade

Nenhum contrato tocado: sem schema, sem migração, sem escopo novo, sem campo
novo em `defaultData`. `state.demo` é memória de tela. Quem nunca abrir a
demonstração tem exatamente o comportamento anterior, e o teste trava que
`saveData` continua sendo chamado em um lugar só.

### Testes

| Teste | Resultado |
|---|---|
| `node tests/test-demo-mode.js` | **PASSOU**; 46 ok, incluindo dez gravações seguidas sem tocar o disco |
| `npm run test:browser` | **PASSOU**; 18 de 18 |
| `npm run test:pwa` | **PASSOU** |
| `npm run lint`, `check:build`, `check:release` | **PASSOU** |
| `npm test` | 70 arquivos; as **mesmas 5 falhas** de data, nenhuma nova |
| Navegador real | **PASSOU**; isolamento provado por despejo do banco, oito telas com a faixa, saída restaurando o assistente, 390 px sem estouro |

### Status

**CONCLUÍDO.** Registrado como P3, sem impedimento: a porta de entrada existe só
no assistente. Quem já concluiu a configuração não tem como abrir a demonstração
— cabe um atalho em Ajustes se isso for desejado.

---

## M26 - Aviso de dados somente locais

### Antes

O app dizia isso em oito lugares diferentes — Ajustes, Privacidade, Contas,
Conta, assistente — e em nenhum deles no momento em que importa: olhando os
próprios lançamentos. `renderLastBackupLine()` já existia, mas mora dentro de
Ajustes, onde só chega quem já foi procurar.

### Alterações

| Arquivo | Motivo |
|---|---|
| `js/app.js` | `shouldWarnLocalOnly`, `renderLocalOnlyNotice`, `openProtectDataDialog` |
| `js/screens/dashboard.js`, `css/screens/dashboard.css` | a linha, logo abaixo do cabeçalho |
| `js/actions.js` | as duas ações |
| `css/components.css` | **correção de passagem**: a linha de botões do diálogo de confirmação |
| `tests/test-local-only-notice.js` | **novo**; 36 verificações |
| `service-worker.js` | `v65` para `v66` |

### Motivo: a condição é o módulo

O risco aqui não é o aviso não aparecer; é **aparecer demais**. Alerta permanente
na tela inicial de um app de dinheiro vira ruído em uma semana e deixa de ser
lido por quem precisa. Por isso a maior parte do trabalho — e do teste — é sobre
quando ele **não** aparece:

- sem nenhum lançamento (não há o que perder, e a tela já é outra);
- com conta ligada (os dados não estão só aqui);
- com backup dos últimos 30 dias (já resolvido);
- dentro da demonstração (avisar sobre perder dado fictício seria mentira);
- durante o carregamento;
- dispensado nesta sessão.

A dispensa é de sessão, como o aviso de armazenamento que já existia: o risco não
deixa de existir porque a pessoa fechou o aviso, e gravar a dispensa exigiria
campo novo no schema para resolver um incômodo que a condição já limita. E o
aviso some **sozinho e para sempre** assim que houver conta ou backup — que é o
objetivo dele.

O tom foi tratado como requisito, não como estilo: o teste reprova as palavras de
susto ("perigo", "cuidado!", "urgente", "você vai perder"), exige `role="status"`
em vez de `role="alert"`, e exige que seja `<p>`, não cartão.

"Proteger meus dados" reaproveita o diálogo de confirmação que já suporta três
botões, com as duas saídas reais do produto: **Baixar backup completo** (o mesmo
rótulo do M12) e **Criar conta e sincronizar**.

### O defeito que a verificação encontrou

No navegador, o diálogo com três botões **espremia os rótulos até um cobrir o
outro**: "Criar conta e sincroniza" cortado, "Baixar backup completo" vazando
para fora do botão. Não era do meu texto — é do próprio diálogo, que oferece
`alternateLabel` desde antes e nunca tinha sido usado com três rótulos longos.

Corrigido na folha, não no texto: a linha de ações passou a quebrar
(`flex-wrap`) e os botões deixaram de encolher abaixo do conteúdo
(`flex: 0 0 auto`). **Rótulo de ação não se encurta para caber no layout; é o
layout que cede.** Vale para qualquer diálogo do app.

Segundo ajuste vindo do navegador: a 390 px, dar `order` a só dois dos quatro
filhos deixava o × sozinho no topo, antes da frase que ele fecha. Os quatro
ganharam ordem explícita.

### Compatibilidade

Nenhum contrato tocado: sem schema, sem migração, sem campo persistido novo. A
condição só lê o que já existia (`transactions`, `lastBackupAt`,
`account.authenticated`). Quem já tem conta ou backup recente não vê diferença
alguma.

### Testes

| Teste | Resultado |
|---|---|
| `node tests/test-local-only-notice.js` | **PASSOU**; 36 ok, a maioria sobre quando NÃO aparecer |
| `npm run test:browser` | **PASSOU**; 18 de 18 |
| `npm run test:pwa` | **PASSOU** |
| `npm run lint`, `check:build`, `check:release` | **PASSOU** |
| `npm test` | 71 arquivos; as **mesmas 5 falhas** de data, nenhuma nova |
| Navegador real | **PASSOU**; aviso ausente sem lançamento e presente depois do primeiro, diálogo com os três botões legíveis, dispensa valendo entre telas e voltando no recarregamento, 390 px sem estouro e com o fechar em 44 px |

### Status

**CONCLUÍDO.**

---

## M27 - Saúde financeira explicável

### Antes

A auditoria assumiu que faltava explicabilidade. O levantamento mostrou outra
coisa: **o motor já explicava tudo e nada aparecia**. `js/score.js` calcula sete
pilares, cada um com peso, pontos, razão em linguagem humana (`detail`) e o que
fazer (`advice`); `weaknesses` já vinha ordenado pela lacuna disponível. A tela
de Saúde mostrava só o número, o rótulo e uma frase de método.

Ou seja: o trabalho não era construir uma explicação, era **exibir a que já
existia** e completá-la com a única peça que o roteiro pede e o motor não tinha:
quanto cada pilar ainda pode somar **na nota**.

### Alterações

| Arquivo | Motivo |
|---|---|
| `js/score.js` | expõe `maxWeight`/`earned` e ganha `scoreGains()`, puro |
| `js/screens/health.js`, `css/screens/health.css` | painel "Sua pontuação" |
| `tests/test-score-explainable.js` | **novo**; 38 verificações, a maioria sobre a aritmética |
| `service-worker.js` | `v66` para `v67` |

**Nenhum pilar, peso ou fórmula do motor foi alterado**, e o teste trava isso:
os sete ids, os sete pesos na ordem e a soma 100.

### O ponto difícil: prometer pontos que existem

A frase do roteiro ("para chegar perto de 80, X teria maior impacto") é a única
do painel que faz promessa numérica, e é fácil errá-la.

A nota é normalizada **sobre o peso do que foi avaliado**, não sobre 100 — é como
o motor evita punir quem ainda não informou um dado. Logo, o ganho de fechar a
lacuna de um pilar **não** é `weight * (1 - ratio)`: é essa lacuna dividida pelo
peso avaliado, vezes 100. Um pilar de peso 15, num mês em que só 90 de peso foram
avaliados, vale 16,7 pontos, não 15.

Sem essa divisão o app prometeria pontos inexistentes. A invariante que trava
isso: **somar todos os ganhos tem de dar exatamente 100 menos a nota atual.**
Conferido com o conjunto da demonstração: nota 69, soma dos ganhos 31, total 100.
O teste falha se alguém "simplificar" a fórmula.

Dois cuidados de linguagem, também travados por teste: a frase diz "somaria
**até**", porque fechar a lacuna inteira é teto e não expectativa; e ganho abaixo
de meio ponto não vira recomendação, porque meio ponto não é conselho.

### Falsa precisão

O roteiro pede explicitamente para não apresentar precisão científica falsa. O
rodapé do painel diz, com todas as letras, que é indicador educacional criado
por este app, que **não é score de crédito, não é usado por banco nenhum e não
vale como análise de risco**, e mostra a cobertura quando algum pilar ficou sem
base ("hoje 90% dos pilares têm base de cálculo; os demais ficam fora da conta em
vez de virar nota baixa").

### Compatibilidade

Total. As duas adições ao retorno de `computeFinanceScore` são campos novos;
`scoreGains` é função nova e pura. Nenhum consumidor existente muda de
comportamento, e base vazia continua sem nota (o painel não aparece).

### Testes

| Teste | Resultado |
|---|---|
| `node tests/test-score-explainable.js` | **PASSOU**; 38 ok |
| `npm run test:browser` | **PASSOU**; 18 de 18 |
| `npm run test:pwa` | **PASSOU** |
| `npm run lint`, `check:build`, `check:release` | **PASSOU** |
| `npm test` | 72 arquivos; as **mesmas 5 falhas** de data, nenhuma nova |
| Navegador real | **PASSOU**; frase do ganho conferindo com o cálculo (69 → até 17 pontos → perto de 86), seis pilares com pontos e conselho, rodapé educacional visível, 390 px sem estouro |

### Status

**CONCLUÍDO.** Nota: os nomes dos pilares do roteiro (endividamento, estabilidade
do orçamento, liquidez) não batem um a um com os do motor (poupança, gastos,
reserva, investimento, patrimônio, pontualidade, crédito). Os do motor foram
mantidos: renomear pilar muda a leitura de uma nota que já está no aparelho das
pessoas, e a tela de Saúde já traz liquidez e endividamento como indicadores
próprios, ao lado do painel.

---

## M28 - Reserva de emergência dinâmica

### Antes

`emergencyFund()` já existia e já era dinâmico, mas com dois problemas:

1. **A régua era o gasto TOTAL** (`avgMonthlyExpense`). Numa emergência ninguém
   corta aluguel e remédio antes de streaming e delivery. Reserva dimensionada
   sobre o total pede uma meta maior que a necessária, e meta grande demais é a
   que ninguém começa.
2. **Era um número só**, apresentado como o alvo. O roteiro pede o contrário:
   mostrar 3, 6 e 9 meses e explicar a diferença sem tratar nenhum como
   obrigatório.

### Alterações

`js/metrics.js` ganhou `avgMonthlyEssentials()` e `emergencyLadder()`, ambos
puros. `js/screens/health.js` ganhou o painel "Quanto guardar para emergências".
**`emergencyFund` não foi tocado** — o alvo que o app já usava continua igual.

A régua de "essencial" não foi inventada: é o grupo `necessidade` do 50/30/20 que
o orçamento, o score e a saúde já usam. Uma segunda definição de "essencial" no
app seria uma divergência esperando acontecer.

Os três degraus vêm com o que cada um compra ("intervalo curto entre empregos",
"renda estável com carteira assinada", "renda variável, autônomo ou sócio"), e
apenas o alvo escolhido em Ajustes recebe marca. O rodapé diz, com todas as
letras, que nenhum é obrigatório e que o app não recomenda um.

Sem essencial medido a escada não aparece: qualquer alvo ali seria chute.

---

## M29 - Previsão de fechamento

### Antes

`buildForecast` já produzia o saldo dia a dia, os horizontes, o pior ponto e o
dia em que o saldo fica negativo. O cartão mostrava o **resultado**
("R$ 22.160,66 em 30 dias") e as premissas em texto. Faltava a **conta**: de onde
sai esse número. Um valor projetado que ninguém consegue reconstruir é palpite
com tipografia bonita, e é justamente o número usado para decidir se dá para
gastar.

### Alterações

`js/forecast.js` ganhou `monthCloseForecast()`, puro, e o cartão de previsão
(`js/screens/calendar.js`) passou a exibir a cadeia nas duas versões, compacta e
completa. `buildForecast` continua devolvendo exatamente o que devolvia.

### O ponto difícil: a conta precisa fechar

As parcelas são lidas do **mesmo lugar** que produz o saldo diário: eventos com
efeito de caixa até o último dia do mês, e `baseline.remainingCurrentMonth` para
o variável, que já exclui recorrente, parcelado e aporte para não contar duas
vezes.

Mesmo assim as duas rotas não davam o mesmo centavo: a caminhada diária arredonda
a cada passo e a soma arredonda uma vez, e no conjunto da demonstração a
diferença era de **três centavos**. Três centavos não mudam decisão nenhuma, mas
uma conta escrita na tela que não fecha destrói a confiança no cartão inteiro.

Solução: **o número exibido é o resultado da soma exibida**. A caminhada diária
fica como conferência independente, em `divergencia`, e o teste trava que as duas
continuam concordando dentro de dez centavos. É a única forma de a explicação não
mentir.

Mesmo motivo para o segundo ajuste, encontrado no navegador: quando o pior dia do
mês **é** o último, margem e saldo projetado são a mesma coisa, e mostrar dois
números com três centavos de diferença lado a lado lê como erro de cálculo. Agora
é um número só.

### Margem e risco

Margem de segurança é medida no **pior dia do mês, não no último**: fechar
positivo não ajuda quem fica no vermelho no dia 18 e volta ao azul quando o
salário cai no dia 30. Risco de fechar negativo vem com a data.

Cada parcela diz o que é: contas previstas são compromissos com data; gasto
variável vem rotulado como estimativa por média.

### Compatibilidade (M28 e M29)

Total nos dois. Quatro funções novas e puras; nenhuma função existente mudou de
assinatura ou de resultado. Sem schema, sem migração, sem bloco novo no painel
(a cadeia entrou no cartão de previsão que já existia, evitando mexer no layout
já salvo de quem usa o app).

### Testes

| Teste | Resultado |
|---|---|
| `node tests/test-reserve-and-close.js` | **PASSOU**; 43 ok |
| `npm run test:browser` | **PASSOU**; 18 de 18 |
| `npm run test:pwa` | **PASSOU** |
| `npm run lint`, `check:build`, `check:release` | **PASSOU** |
| `npm test` | 73 arquivos; as **mesmas 5 falhas** de data, nenhuma nova |
| Navegador real | **PASSOU**; escada com essenciais de R$ 3.314,81 e degraus de R$ 9.944,43 / R$ 19.888,86 / R$ 29.833,29; cadeia do fechamento somando 26.994,91 + 0,00 − 8.229,56 − 177,80 = 18.587,55 na tela; 390 px sem estouro nos dois painéis |

### Status

**AMBOS CONCLUÍDOS.**

---

## M30 - Limite diário inteligente

### Antes

Já existia um teto diário, em `renderBudgetHealth`: renda menos gasto do mês,
dividido pelos dias que faltam. Ele responde **"quanto ainda cabe na renda"**,
que é pergunta mais frouxa: gastar tudo o que cabe é terminar o mês em zero, com
a meta de guardar sacrificada por último, sem ninguém notar.

### Alterações

`js/forecast.js` ganhou `savingTargetOf()` e `dailyAllowance()`, puras, e a linha
entrou **no mesmo painel do fechamento do M29** — porque é a mesma conta olhada
por outro lado. Em cartão separado, os dois números pareceriam cálculos
independentes que podem discordar.

A conta é a do roteiro: caixa + receitas previstas − contas previstas − meta,
dividido pelos dias que faltam. A estimativa de gasto variável **não** entra no
desconto: ela é justamente o que este número substitui por uma decisão, e
descontá-la contaria duas vezes.

**O alvo não virou campo novo.** Sai do aporte mensal que a pessoa já planejou
nas metas; sem metas com plano, da fatia "futuro" da regra de orçamento dela. A
tela diz de qual das duas veio. Pedir mais um número seria pedir de novo o que já
foi dito.

Quando o alvo não cabe no caixa, o app diz isso em vez de mostrar um teto
convidativo, e deixa explícito que não bloqueia nada. E a frase se declara
referência, não obrigação.

---

## M31 - "Posso comprar?"

### Antes

O simulador já existia, com À Vista e Financiado, custo real do financiamento,
juros embutidos, comprometimento da parcela e atraso na meta. Faltavam quatro
coisas, e a primeira é a que importa:

1. **a resposta era em orçamento diário.** Ninguém decide um notebook pensando em
   trocar R$ 12 por dia por ele. A pergunta é mensal;
2. o comprometimento mostrado era só o da parcela nova, sem o que já existe;
3. nada dizia se a reserva seria atingida;
4. não havia onde escrever **o que** se pensa em comprar.

### Alterações

`js/insights.js` ganhou `monthlyDebtCommitment()` e `reserveImpactOf()`, e os dois
motores existentes passaram a devolver `monthlyBefore`/`monthlyAfter`,
`commitmentBefore`/`commitmentAfter` e `reserveImpact`. **Nenhum campo antigo foi
removido**, e o custo real do financiamento continua igual.

O comprometimento "antes" sai das dívidas já cadastradas em Patrimônio com
parcela mensal. Nada é estimado: sem cadastro, o antes é zero e a tela diz isso.

A reserva é avaliada pelas **duas portas de risco**, porque são mecanismos
diferentes: à vista, o caixa livre não cobrir a compra sem encostar na reserva;
parcelado, a sobra mensal virar negativa e a diferença sair da reserva todo mês.

O exemplo do roteiro, conferido no navegador com o conjunto da demonstração:
notebook de R$ 4.000 em 10x de R$ 400 → sobra mensal de R$ 3.451,42 para
R$ 3.051,42, comprometimento de 12% para 18%, reserva de R$ 8.400,00 não afetada.

### Não incentivar endividamento, como requisito

O roteiro pede isso, então virou teste: a tela declara a análise como educativa,
devolve a decisão ("o app não diz se vale a pena"), diz que parcelar não é errado
nem certo por si, e o teste reprova as frases de empurrão ("vale a pena comprar",
"recomendamos", "aproveite", "boa oportunidade").

### Compatibilidade (M30 e M31)

Total nos dois. Quatro funções novas e puras; os dois motores de simulação
ganharam campos e não perderam nenhum. Sem schema, sem migração. `state.simulate`
ganhou `label`, que é memória de tela e não é persistida.

### O tropeço do módulo

`npm test` reprovou em `test-modular-build`: o artefato gerado não batia com as
fontes mesmo depois de reconstruir. Causa: meu script de edição escreveu
`js/insights.js` com **CR duplo** (`\r\r\n`) em 35 linhas. O `normalize` do build
converte `\r\n` para `\n`, e `\r\r\n` vira `\r\n` de novo — sobrevivendo à
normalização e deixando a conferência impossível de satisfazer. Corrigido nas 35
linhas; o `--check` voltou a passar.

### Testes

| Teste | Resultado |
|---|---|
| `node tests/test-daily-and-purchase.js` | **PASSOU**; 49 ok |
| `node tests/test-reserve-and-close.js` | **PASSOU**; 43 ok |
| `npm run test:browser` | **PASSOU**; 18 de 18 |
| `npm run test:pwa` | **PASSOU** |
| `npm run lint`, `check:build`, `check:release` | **PASSOU** |
| `npm test` | 74 arquivos; as **mesmas 5 falhas** de data, nenhuma nova |
| Navegador real | **PASSOU**; limite diário e as três leituras da compra conferindo com o cálculo; 390 px sem estouro nos dois |

### Status

**AMBOS CONCLUÍDOS.**

---

## M32 - Anomalias financeiras

### Antes

O conselheiro já comparava categorias, mas **só com o mês anterior**, e o motor
já calculava a média de 3 meses sem nunca transformá-la em aviso. Faltava a
terceira frase do roteiro ("despesas fixas representam X% da renda") e, sobretudo,
faltava o requisito que dá sentido às outras duas: **períodos comparáveis**.

O defeito era concreto e estava em produção: no dia 3 do mês, toda categoria
"caiu" em relação ao mês anterior INTEIRO, e a regra `categoria-em-queda`
parabenizava por isso ("Você economizou R$ 640 em Mercado") para quem ia gastar
exatamente o mesmo. A mesma distorção na direção oposta escondia a alta real.

### Alterações

`js/analytics.js` ganhou `anExpenseByRootThroughDay()` (soma por categoria raiz
recortada no dia N) e `anAnomalies()`. A função antiga `anExpenseByRoot()` passou
a delegar para a nova com janela nula, para não existirem duas cópias da mesma
regra de soma.

A janela é o coração do módulo: **mês em curso compara até o dia de hoje contra
os mesmos primeiros dias de cada mês de base**; mês fechado compara meses
inteiros. Truncar fevereiro no dia 31 de um mês de 31 dias tiraria três dias da
base e inventaria uma alta de calendário, então o recorte só existe onde é
necessário.

Cinco portões contra alerta irrelevante, todos nomeados em `ANOM`: `minElapsedDays`
(5), `minBaselineMonths` (2), `minBaselineValue` (R$ 40), `minDiff` (R$ 60) e
`minPct` (25%).

`js/advisor.js` ganhou quatro regras — `anomalia-alta`, `anomalia-valor`,
`anomalia-queda` e `despesas-fixas` — e duas guardas nas regras antigas:
`categoria-em-queda` não fala mais em mês parcial, e as duas regras de mês
anterior se calam quando a leitura por média comparável já nomeou a mesma
categoria (o mesmo fato dito duas vezes é ruído).

`despesas-fixas` **não** usa o "gastos fixos" do mês corrente: no dia 3 ele ainda
não aconteceu e a conta sairia pequena justamente quando engana mais. Sai de
`rec.committedMonthly`, que já converte cada compromisso para equivalente mensal.

Na tela, `js/screens/insights.js` ganhou o cartão "Fora do seu padrão" (a
evidência por trás da frase, com a base da comparação escrita) e um aviso na aba
Comparar quando o mês ainda está em curso.

### Motivo

Uma leitura financeira errada com aparência de precisão é pior do que nenhuma
leitura. "Você economizou R$ 640" no dia 3 ensina a ignorar o painel.

### Compatibilidade

Total. Nenhum campo removido, nenhum contrato alterado, nenhum schema tocado.
`anExpenseByRoot` devolve exatamente o que devolvia (travado por teste). As duas
guardas só **suprimem** cartão duplicado ou falso; nenhuma regra existente mudou
de texto ou de conta.

---

## M33 - Recorrências e assinaturas

### Antes

A tela já era boa: custo anual como manchete, equivalente mensal, cadência,
reajuste, "parar de acompanhar" e propostas de cadastro. Faltavam duas coisas do
roteiro:

1. **identificar de que tipo é cada item** (streaming, software, academia,
   serviços). A categoria financeira responde "de que bolso sai", não isso;
2. **"Revisar assinatura"** como ação, com a regra explícita de não afirmar que
   uma assinatura é inútil.

### Alterações

`js/recurring.js` ganhou `REC_TYPES` (lista fechada e conservadora, com termos
de 4+ letras casando por trecho e curtos como "tim"/"oi"/"gym" por palavra
inteira), `recTypeOf()`, `recTotalsByType()` e `recDecorate()`. O modelo passou a
devolver `byType`, `committedAnnual` e, em cada item, `typeId`/`typeLabel`/
`reviewedAt`/`daysSinceReview`. O balde final é "Outros"; nunca se chuta
"Serviços" para não deixar vazio.

Os subtotais somam pelo **equivalente mensal**, senão um seguro anual de R$ 1.200
lideraria a lista como se cobrasse todo mês. Teste trava que os tipos fecham com
`committedMonthly` no centavo.

`js/storage.js` ganhou o balde `review` em `defaultRecurringPrefs`,
`normalizeRecurringPrefs` e `mergeRecurringPrefs` (a fusão vence pela data mais
recente, como os outros três).

`js/screens/subscriptions.js` ganhou o painel "Por tipo de recorrência", a linha
"Recorrências no ano" no cabeçalho e a ficha de revisão: custo de 12 meses,
equivalente mensal, peso na renda, tipo reconhecido, histórico de preço e as
perguntas que só o usuário responde. **As perguntas mudam com o tipo**: "você
assistiu alguma coisa no último mês?" para streaming, "quantas vezes você foi?"
para academia, "o valor mudou por consumo ou por reajuste?" para conta de luz.
Perguntar errado desmoralizaria a ficha inteira.

Aluguel e conta de luz deixaram de ser chamados de assinatura no botão
("Revisar compromisso") e na frase de fecho.

### Motivo

O app não sabe se a assinatura é útil: não sabe se você usa, se é da família ou
se é ferramenta de trabalho. Pode mostrar preço, cadência, histórico e peso na
renda, e devolver a decisão — inclusive a de não decidir.

### Compatibilidade

`review` entrou **sem subir o `SCHEMA_VERSION`**: é um mapa `{ chave: data }`
dentro de `recurringPrefs`, campo que já existia e já sincronizava, e a ausência
dele em dado antigo normaliza para `{}`. Subir o schema exigiria mexer também no
`finance-schema.js` do servidor e em três testes que fixam o número 23, sem
ganho. O único efeito de um cliente **antigo** ler este dado é descartar as datas
de revisão ao normalizar; nenhum lançamento, valor ou preferência antiga é
afetado, e a informação volta na revisão seguinte.

Nenhum campo removido. `recPrefsOf`, `recPrefsWith`, `applyRecurringFlag`,
`buildRecurringProposals` e todos os totais antigos continuam iguais; teste trava
que revisar não muda nenhum total nem tira o item de lugar nenhum.

### Correções que saíram no mesmo trabalho

**Bug real na previsão (P1, `js/forecast.js`).** A estimativa de gasto variável do
mês era espalhada com `Math.round(restante / diasQueFaltam)` repetido por dia, o
que sobra até meio centavo por dia. No dia 20 são dez dias e ninguém nota; no dia
3 são 27, e a caminhada diária terminava R$ 0,13 longe da soma das quatro parcelas
que o cartão do M29 escreve na tela. Agora o resto é distribuído em centavos
inteiros nos primeiros dias: as duas rotas fecham no mesmo número em qualquer dia
do mês. Achado pelo `test-reserve-and-close`, que reprovava por isso.

**Fusão em vez de supressão (correção de rumo dentro do M32).** A primeira versão
das guardas fazia o cartão do mês anterior se calar quando a leitura por média
nomeava a mesma categoria — e isso **removia** um cartão que o
`test-insights-engine` já cobrava. Trocado por fusão: quando as duas leituras
apontam o mesmo gasto, existe um cartão só, o do mês anterior, com a frase da
média anexada ("…e também está 28% acima da sua média dos últimos 3 meses"). Os
portões viraram três funções (`advMomGrowth`, `advMomDrop`, `advSameAnomaly`) para
as duas regras não divergirem sobre quem fala.

### Testes (M32 e M33)

| Teste | Resultado |
|---|---|
| `node tests/test-anomalies-subscriptions.js` (novo) | **PASSOU**; 95 ok |
| Os 4 arquivos que reprovavam por data, nos dias 15 de 14 meses diferentes (`TEST_TODAY`) | **PASSARAM** em todos, inclusive fevereiro comum e bissexto |
| `node tests/test-recurring.js` | **PASSOU**; 63 ok |
| `node tests/test-dashboard.js` | **PASSOU**; 87 ok |
| `node tests/test-versioning.js`, `test-pwa-cache`, `test-service-worker-update`, `test-storage-privacy-inventory` | **PASSARAM** |
| `npm run lint`, `check:build`, `check:release` | **PASSARAM** |
| `npm test` | **75 arquivos, 0 falhas.** As 4 falhas de data que vinham do baseline foram corrigidas no mesmo trabalho (relógio congelado + arredondamento da previsão); ver a pendência resolvida no fim deste arquivo |
| `npm run test:browser` | **PASSOU**; 18 de 18 em Chromium, Firefox e WebKit |
| `npm run test:pwa` | **PASSOU** |
| Navegador real (demonstração) | **PASSOU**; painel por tipo somando R$ 3.748,58/mês, ficha de revisão com perguntas por tipo, data gravada e relida, "Fora do seu padrão" com a base escrita, aviso de mês em curso na aba Comparar, 390 px sem estouro horizontal |

### Status

**AMBOS CONCLUÍDOS.**

---

## Checklist de regressão

Executar após **todo** módulo que toque no código. Marcar `OK` / `FALHOU` / `NÃO VALIDADO`.
Os itens automatizados são a primeira linha; os manuais só onde não há teste.

### A. Automatizado (CI ou máquina com Node) — porta de entrada obrigatória

- [ ] `npm run lint`
- [ ] `npm test` (69 arquivos) — **atenção:** 5 arquivos reprovam do dia 1 ao 10 de
  cada mês por fixture ancorada no dia 10; ver o achado P2 do M20 antes de investigar
- [ ] `node tests/test-incident-response.js` (plano de resposta a incidentes do M20)
- [ ] `node tests/test-responsible-disclosure.js` (canal de divulgação responsável do M21)
- [ ] `node tests/test-brand.js` (marca e identificadores congelados do M22)
- [ ] `node tests/test-onboarding.js` (cinco passos e gastos fixos do M24)
- [ ] `node tests/test-demo-mode.js` (guardas da demonstração do M25)
- [ ] `node tests/test-local-only-notice.js` (aviso de dados locais do M26)
- [ ] `node tests/test-score-explainable.js` (aritmética do ganho de pontos do M27)
- [ ] `node tests/test-reserve-and-close.js` (escada da reserva do M28 e conta do fechamento do M29)
- [ ] `node tests/test-daily-and-purchase.js` (limite diário do M30 e leituras de compra do M31)
- [ ] `node tests/test-anomalies-subscriptions.js` (janela comparável do M32 e tipos/revisão do M33)
- [ ] `node tests/test-accounting-integrity.js` (invariantes contábeis do M11)
- [ ] `node tests/test-backup-restore.js` (backup, restauração e senha do M12)
- [ ] `node tests/test-versioning.js` (versões e matriz de compatibilidade do M13)
- [ ] `node tests/test-import-duplicates.js` (duplicidade e desfazer da importação do M14)
- [ ] `node tests/test-critical-actions.js` (ações financeiras críticas do M15)
- [ ] `node tests/test-coverage.js` (agregação de cobertura do M15)
- [ ] `node tests/test-security-adversarial.js` (matriz defensiva do M16)
- [ ] `node tests/test-observability.js` (contrato de eventos do M17)
- [ ] `node tests/test-data-inventory-lgpd.js` (matriz de tratamento do M18)
- [ ] `node tests/test-third-party-transparency.js` (serviços externos do M19)
- [ ] `npm run check:build` (o `app.generated.js` publicado corresponde às fontes)
- [ ] `npm run check:release`
- [ ] `npm run build:dist`
- [ ] `npm run test:browser` (chromium + firefox + webkit)
- [ ] `npm run test:pwa` (pacote publicado online e offline no Chromium)
- [ ] Cobertura não caiu abaixo de **75% global** nem de **35% em `js/actions.js`**

### B. Visitante (sem conta)

- [ ] Landing `/` abre, animações preservadas
- [ ] `/index.html` abre no onboarding de 4 passos; "Pular por agora" funciona
- [ ] Aceite de política e termos exigido antes de prosseguir
- [ ] Dashboard renderiza sem erro de console
- [ ] Dados gravam em `financas_db` (escopo visitante) e sobrevivem ao recarregamento

### C. Transações e núcleo financeiro

- [ ] Criar receita / criar despesa
- [ ] Editar lançamento
- [ ] Excluir lançamento (e a exclusão persistir após recarregar)
- [ ] Criar conta; criar cartão
- [ ] **Transferência entre contas não altera receita nem despesa do período**
- [ ] **Pagamento de fatura não vira nova despesa quando as compras já foram lançadas**
- [ ] **A soma das categorias em Relatórios fecha com "Despesas do mês"** (aporte, amortização e transferência ficam fora dos dois lados)
- [ ] Ajuste de saldo de conta
- [ ] Criar meta; criar item de patrimônio; criar dívida
- [ ] Criar recorrência e ver o lançamento previsto aparecer
- [ ] Categorias: criar, renomear, excluir
- [ ] Regras de categorização automática aplicam

### D. Importação

- [ ] CSV: selecionar → pré-visualizar → confirmar
- [ ] OFX: idem
- [ ] PDF (extrato e fatura com texto) — caminho corrigido nos commits recentes
- [ ] Safari/iPhone: selecionar arquivo mantém a escolha (regressão já corrigida, não reintroduzir)
- [ ] Detecção de duplicidade não deixa passar lançamento repetido
- [ ] **Dois gastos diferentes de mesmo valor na mesma semana continuam sendo dois** (não viram duplicata)
- [ ] **Reimportar o mesmo OFX marca as linhas como "já importado" pelo identificador do banco**
- [ ] **"Desfazer importação" remove só o que aquele arquivo criou**
- [ ] "Pagamento recebido" de fatura **não** entra como receita

### E. Conta e autenticação

- [ ] Cadastro → e-mail de confirmação → callback volta para o app
- [ ] Login / logout
- [ ] Recuperação de senha
- [ ] Troca de senha
- [ ] Listagem de dispositivos
- [ ] Revogar dispositivo → o dispositivo revogado recebe 403 e volta ao escopo visitante **sem perder a fila nem o banco local**
- [ ] **Sair dos outros aparelhos**: pede senha, encerra só os OUTROS, este aparelho continua conectado e sincronizando
- [ ] Exclusão de conta remove servidor e revoga todos os dispositivos

### F. Sincronização (o mais frágil — ver `docs/SYNC_PROTOCOL.md`)

- [ ] Dois dispositivos editando o mesmo registro convergem para o mesmo vencedor
- [ ] Mesmo `mutationId` repetido devolve `status: "replayed"` sem gravar de novo
- [ ] Mesmo `mutationId` com conteúdo diferente devolve 409 `idempotency_mismatch`
- [ ] Exclusão em um dispositivo apaga no outro (lápide propaga)
- [ ] "Apagar tudo" seguido de nova criação: o novo registro **não** desaparece (barreira `reset_rev` sobrevive ao purge e ao recarregamento)
- [ ] Cliente em protocolo abaixo do mínimo recebe **426**, não 409, e mantém a fila
- [ ] Semeadura roda uma vez por conta/aparelho e não sobrescreve o outro dispositivo
- [ ] Perda de conexão no meio do ciclo: fila persiste e sobe depois
- [ ] Troca de conta em outra aba → `403 account_scope_changed` sem tocar nos dados

### G. Backup, restauração e offline

- [ ] Exportar backup (JSON) gera arquivo íntegro
- [ ] **Exportar backup protegido por senha e reimportá-lo no mesmo aparelho** (senha errada recusa; senha certa abre a prévia normal)
- [ ] Restaurar backup de versão antiga do schema funciona
- [ ] **Restaurar backup de versão MAIS NOVA avisa antes e mesmo assim restaura o que é reconhecido**
- [ ] Desfazer restauração (`financas_db_undo`) funciona
- [ ] Checkpoints: listar e restaurar
- [ ] Modo avião: app abre, navega e grava; ao voltar, sincroniza
- [ ] PWA instalado (Android e iPhone/tela de início) abre no app, não na landing
- [ ] Botão voltar do Android fecha camada antes de sair da tela

### H. Interface

- [ ] 320 / 360 / 390 / 430 / 768 / 1024 / 1440 px sem rolagem horizontal indevida
- [ ] Tema claro e escuro
- [ ] Zoom 200%
- [ ] Nenhum erro novo de console em nenhuma das 23 rotas

---

## Decisões arquiteturais assumidas neste trabalho

1. **`AUDIT_FIX_PROGRESS.md` permanece.** É histórico de auditoria anterior, não lixo.
2. **A CI é o validador.** Sem Node local, todo módulo que altera código só se fecha
   com a CI verde ou com execução do usuário. O que não passou por isso vai marcado
   como NÃO VALIDADO, sem exceção.
3. **Migrations são append-only.** Nenhuma das 6 existentes será editada. Correção de
   banco entra como migration nova, pequena e reversível.
4. **`security definer` + `grant execute to service_role` é o padrão do projeto.**
   Qualquer função nova segue o mesmo molde; qualquer função que fuja dele é suspeita.
5. **Drift de banco é tratado como achado, não como descuido.** O que existe no banco
   e não existe em migration precisa ser trazido para o versionamento antes de ser
   alterado (caso `rls_auto_enable`, M1).

## Pendências abertas

- **M1 está PARCIAL.** A migração existe e passou nos testes, mas o banco de produção
  só fica corrigido depois de aplicá-la. Passos em "O que falta para fechar o M1".
- ~~Definição de `public.rls_auto_enable` não capturada~~ **feito em 2026-08-28**: a
  função está versionada e o achado caiu para P2 (não é explorável).
- **O GATILHO de evento ainda não está versionado**, só a função. Falta o bloco 3.
- ~~Bloco 5: outras `security definer` expostas~~ **executado em 2026-08-28: só `rls_auto_enable`**.
  Nenhuma outra função privilegiada é executável por `anon`/`authenticated` no banco real.
- Cobertura e Playwright indisponíveis dentro do OneDrive; usar a cópia externa (R2).
- **M4**: o cartão de IA com resposta real da `/api/analyze` não foi visto em
  navegador (exige `vercel dev` + chave). Os dois caminhos estão cobertos por
  teste de unidade; a confirmação visual fica para a próxima vez que o backend
  rodar localmente.
- **M5, ressalva de longo prazo:** com `includeSubDomains` no ar, criar depois
  um subdomínio servido em **HTTP** (blog, painel de terceiro) será recusado
  pelos navegadores que já viram o cabeçalho. Só ápice e `www` existem hoje,
  sem curinga e sem MX. É reversível servindo `max-age=0`; `preload`, que não
  seria, ficou de fora de propósito.
- Item 17 de `AUDIT_FIX_PROGRESS.md` e F-06/F-08 a F-17 de `docs/PROXIMA-SESSAO.md`
  continuam abertos e serão absorvidos pelos módulos correspondentes. O item 19
  foi concluído no M9.
- ~~**P2 aberto (M20): suíte dependente da data.**~~ **RESOLVIDO em 2026-09-03.**
  Eram duas causas, não uma:
  1. **Fixtures em dias futuros.** `test-health`, `test-insights-engine` e
     `test-render` lançam no dia 10 do mês corrente, e o app (corretamente) só
     conta o que já aconteceu. Corrigido com `tests/helpers/fixed-clock.js`, que
     troca o `Date` do contexto de VM por uma subclasse fixada no **dia 15 do mês
     corrente**. Mantém mês e ano reais (as fixtures falam em "mês passado") e
     elimina a única dimensão que quebrava. `TEST_TODAY=AAAA-MM-DD` força outra
     data; os quatro arquivos passam nos dias 15 de 14 meses diferentes, incluindo
     fevereiro comum e bissexto.
  2. **Bug real de arredondamento** (`js/forecast.js`), que aparecia como falha do
     `test-reserve-and-close`: a cota diária da estimativa variável era arredondada
     e repetida, sobrando até meio centavo por dia. Com 27 dias pela frente a
     caminhada diária terminava R$ 0,13 longe da soma das quatro parcelas do
     cartão do M29. Agora o resto é distribuído em centavos inteiros nos primeiros
     dias e as duas rotas fecham no mesmo número em qualquer dia.
  `npm test` passa inteiro: **75 arquivos, 0 falhas**. `test-goals` e `test-wealth`,
  citados no achado original, já não reprovavam.
- **M21:** falta confirmar no painel do GitHub que o recebimento privado de
  vulnerabilidade está habilitado; sem isso, o link do canal preferido não abre
  para quem relatar. `incidentEmail` entra sozinho no `security.txt` quando existir.
- **M20:** o procedimento está pronto, mas não foi ensaiado (sem exercício de mesa)
  e não há alerta ativo nem plantão. A janela de evidência depende do plano da
  Vercel e pode ser de 1 hora.
- 7 campos legais do controlador ainda com marcador (`docs/LEGAL-LAUNCH.md`); o
  `check-release.js` avisa a cada execução. Decisão externa, entra no M18.
