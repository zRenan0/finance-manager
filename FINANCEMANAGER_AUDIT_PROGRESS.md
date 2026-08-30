# FinanceManager — Progresso da auditoria e evolução

Memória de trabalho da auditoria por módulos (M0 a M40). **Leia este arquivo antes
de começar qualquer módulo**; ele existe para não refazer a análise a cada sessão.

Documento irmão, anterior e ainda válido: `AUDIT_FIX_PROGRESS.md` (auditoria de beta,
P0/P1). Não substituir nem apagar: o que está lá como CONCLUÍDO não deve ser refeito.

---

## Estado geral

| Campo | Valor |
|---|---|
| Módulo atual | **M7 — Sessões e dispositivos** (a iniciar) |
| Status do M6 | **CONCLUÍDO no repositório**, com **uma ação sua pendente**: ligar "Prevent use of leaked passwords" no painel do Supabase (passo a passo no M6; não tranca ninguém para fora) |
| Status do M5 | **CONCLUÍDO no repositório**; vale em produção **depois de publicar**. Critério: `node scripts/check-deploy.js https://www.financemanager.dev.br` passar (hoje reprova 10, de propósito) |
| Status do M4 | **CONCLUÍDO** — 3 achados corrigidos (1 P1, 1 P2, 1 P3) + suíte de regressão nova |
| Status do M3 | **CONCLUÍDO** — aplicado e confirmado no banco em 2026-08-28 |
| Status do M2 | **CONCLUÍDO** — nenhuma vulnerabilidade de autorização; invariantes travados por teste |
| Status do M1 | **CONCLUÍDO** — aplicado e confirmado; gatilho capturado e versionado |
| Módulos concluídos | M0, M1, M2, M3, M4, M5, M6 |
| Próximo módulo | M7 — Segurança > Dispositivos e sessões (a tela já existe e lista/revoga; falta "sair de todos os outros", que **precisa de reautenticação** — a prova já está pronta no M6) |
| Branch | `deploy-atualizado` (árvore limpa no início do M0) |
| Arquivos alterados até aqui | Testes/scripts: `tests/test-security.js` (M1/M2/M3 + M5), `tests/test-service-role-scope.js`, `tests/test-xss-surface.js` (M4), `tests/test-auth-password.js` (M6), `tests/test-session-scope-backend.js` (M6), `scripts/check-deploy.js` e `scripts/serve.js` (M5). Produção: `js/screens/analytics.js` e `js/icons.js` (M4), `vercel.json` (M5), `netlify/functions/account.js`, `js/utils.js`, `js/auth.js`, `js/screens/account.js`, `css/screens/account.css` (M6), `js/modules/app.generated.js` (regerado). |
| Migrations criadas até aqui | `20260828120000_rls_auto_enable_least_privilege.sql`, `20260828130000_rls_auto_enable_versionada.sql`, `20260828140000_menor_privilegio_tabelas.sql` (as três **aplicadas e confirmadas em 2026-08-28**), `20260828150000_rls_auto_enable_gatilho.sql` (**ainda não aplicada**; é no-op em produção, onde o gatilho já existe) |
| Versão do app | `0.30.0` (package.json) |

### Ambiente de execução (RESOLVIDO)

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
| PWA | `service-worker.js` v58, `manifest.webmanifest` |
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
| Service Worker | `service-worker.js:39` | `v58` |
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
| R8 | P3 | Cobertura 21,9%; `js/actions.js` (110 KB, orquestra as ações das telas) praticamente sem teste. | M15 |
| R9 | P3 | Achados de beta ainda abertos em `docs/PROXIMA-SESSAO.md`: F-06 (bundle sem minificação), F-08 a F-17 (UX/acessibilidade). Absorver nos módulos correspondentes em vez de duplicar. | M38/M39 |
| — | — | Itens 17 e 19 de `AUDIT_FIX_PROGRESS.md` continuam PENDENTES (teclado/ARIA/contraste; HTML inicial/rota/paginação/SW). | M39/M9 |

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

**CONCLUÍDO no repositório. Pendente de publicação para valer em produção.**

Critério de fechamento em produção, um comando:

```
node scripts/check-deploy.js https://www.financemanager.dev.br
```

Hoje ele reprova 10 asserções porque produção ainda serve os cabeçalhos
anteriores. Depois de publicar, tem de passar. Nada além de publicar é
necessário — não há migração, variável de ambiente nem passo manual.

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
| **F6-04** | P2 | `auth_leaked_password_protection` continua **desligado** (confirmado no advisor do Supabase agora, nível WARN). É chave de painel, não de código. | **PENDENTE DE AÇÃO SUA** — instruções abaixo |
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

### O QUE VOCÊ PRECISA FAZER (2 minutos, no painel do Supabase)

Projeto **Finance Manager** (`drmnezcjhfkxdksdpjyr`) → **Authentication** →
**Sign In / Providers** → seção **Password**:

1. Ligar **"Prevent use of leaked passwords"** (checagem contra o
   HaveIBeenPwned). Resolve o alerta `auth_leaked_password_protection`.
2. Opcional, defesa em profundidade: subir **Minimum password length** para
   **10**, igualando o que o backend já exige.

**Isto não tranca ninguém para fora.** A checagem de senha vazada do Supabase
roda no **cadastro e na troca de senha**, nunca no login. Quem já tem conta com
uma senha que aparece em vazamento continua entrando normalmente; só será
recusado se tentar **definir** essa senha de novo.

Conferir depois de ligar: o advisor de segurança do projeto deve deixar de
listar `auth_leaked_password_protection`. Os três `rls_enabled_no_policy` que
sobram (`cofre_mutations`, `cofre_rate_limit`, `cofre_sync_config`) são nível
INFO e **deliberados** — tabelas server-only, decisão registrada no M3.

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
- **M17 (observabilidade)**: `reauth_failed` e `weak_password` são os dois
  códigos novos e são bons sinais de monitoramento — uma sequência de
  `reauth_failed` numa conta é tentativa de tomada de conta com sessão viva.

---

## Checklist de regressão

Executar após **todo** módulo que toque no código. Marcar `OK` / `FALHOU` / `NÃO VALIDADO`.
Os itens automatizados são a primeira linha; os manuais só onde não há teste.

### A. Automatizado (CI ou máquina com Node) — porta de entrada obrigatória

- [ ] `npm run lint`
- [ ] `npm test` (53 arquivos)
- [ ] `npm run check:build` (o `app.generated.js` publicado corresponde às fontes)
- [ ] `npm run check:release`
- [ ] `npm run build:dist`
- [ ] `npm run test:browser` (chromium + firefox + webkit)
- [ ] Cobertura não caiu abaixo da baseline **21,9%** (piso do script: 20%)

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
- [ ] "Pagamento recebido" de fatura **não** entra como receita

### E. Conta e autenticação

- [ ] Cadastro → e-mail de confirmação → callback volta para o app
- [ ] Login / logout
- [ ] Recuperação de senha
- [ ] Troca de senha
- [ ] Listagem de dispositivos
- [ ] Revogar dispositivo → o dispositivo revogado recebe 403 e volta ao escopo visitante **sem perder a fila nem o banco local**
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
- [ ] Restaurar backup de versão antiga do schema funciona
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
- **M5 depende de PUBLICAÇÃO para valer.** Os cabeçalhos novos estão em
  `vercel.json` e passam em todos os testes locais, mas produção só passa a
  servi-los depois do próximo deploy. Conferir com
  `node scripts/check-deploy.js https://www.financemanager.dev.br`.
- **M6 depende de UMA CHAVE NO PAINEL do Supabase** para fechar: ligar
  "Prevent use of leaked passwords" em Authentication > Sign In / Providers >
  Password. Passo a passo e a garantia de que não tranca ninguém estão no M6.
- **M5, ressalva de longo prazo:** com `includeSubDomains` no ar, criar depois
  um subdomínio servido em **HTTP** (blog, painel de terceiro) será recusado
  pelos navegadores que já viram o cabeçalho. Só ápice e `www` existem hoje,
  sem curinga e sem MX. É reversível servindo `max-age=0`; `preload`, que não
  seria, ficou de fora de propósito.
- Itens 17 e 19 de `AUDIT_FIX_PROGRESS.md` e F-06/F-08 a F-17 de `docs/PROXIMA-SESSAO.md`
  continuam abertos e serão absorvidos pelos módulos correspondentes.
- 7 campos legais do controlador ainda com marcador (`docs/LEGAL-LAUNCH.md`); o
  `check-release.js` avisa a cada execução. Decisão externa, entra no M18.
