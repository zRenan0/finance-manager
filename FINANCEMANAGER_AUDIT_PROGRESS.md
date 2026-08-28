# FinanceManager — Progresso da auditoria e evolução

Memória de trabalho da auditoria por módulos (M0 a M40). **Leia este arquivo antes
de começar qualquer módulo**; ele existe para não refazer a análise a cada sessão.

Documento irmão, anterior e ainda válido: `AUDIT_FIX_PROGRESS.md` (auditoria de beta,
P0/P1). Não substituir nem apagar: o que está lá como CONCLUÍDO não deve ser refeito.

---

## Estado geral

| Campo | Valor |
|---|---|
| Módulo atual | **M1 — Correções críticas de segurança** |
| Status do M1 | **PARCIAL** — correção escrita, testada e versionada; **falta aplicar no banco** (ver M1) |
| Módulos concluídos | M0 |
| Próximo módulo | M2 — Auditoria de service_role e autorização |
| Branch | `deploy-atualizado` (árvore limpa no início do M0) |
| Arquivos alterados até aqui | `tests/test-security.js` (+2 blocos), este arquivo |
| Migrations criadas até aqui | `20260828120000_rls_auto_enable_least_privilege.sql`, `20260828130000_rls_auto_enable_versionada.sql` |
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

**PARCIAL** — correção implementada, testada e versionada. Pendente de aplicação no banco.

---

## Checklist de regressão

Executar após **todo** módulo que toque no código. Marcar `OK` / `FALHOU` / `NÃO VALIDADO`.
Os itens automatizados são a primeira linha; os manuais só onde não há teste.

### A. Automatizado (CI ou máquina com Node) — porta de entrada obrigatória

- [ ] `npm run lint`
- [ ] `npm test` (49 arquivos)
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
- **Bloco 5 do script de verificação** pode revelar outras `security definer` expostas
  no banco que não estão em migração. É a primeira coisa a olhar no M2.
- Cobertura e Playwright indisponíveis dentro do OneDrive; usar a cópia externa (R2).
- Itens 17 e 19 de `AUDIT_FIX_PROGRESS.md` e F-06/F-08 a F-17 de `docs/PROXIMA-SESSAO.md`
  continuam abertos e serão absorvidos pelos módulos correspondentes.
- 7 campos legais do controlador ainda com marcador (`docs/LEGAL-LAUNCH.md`); o
  `check-release.js` avisa a cada execução. Decisão externa, entra no M18.
