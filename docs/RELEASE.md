# Processo de publicação

## Preparação

1. Trabalhe em uma branch própria e mantenha a branch principal protegida.
2. Atualize a versão no `package.json` e registre as mudanças no `CHANGELOG.md`.
3. Atualize a versão do cache em `service-worker.js` sempre que um arquivo do app mudar.
4. Execute `npm run build` para atualizar a entrada ES gerada.
5. Execute `npm run verify:release`.
6. Execute `npm run test:browser` com o Chromium do Playwright instalado.
7. Envie a branch e aguarde a integração contínua concluir sem falhas.
8. Se contas estiverem habilitadas, execute também o checklist de `docs/BACKEND_SETUP.md` no ambiente de homologação.
9. Aplique as migrações pendentes **em ordem de nome** e confirme cada uma no banco alvo antes de publicar; não presuma que produção já recebeu alguma:
   1. `20260825001552_add_device_type.sql`, antes de publicar o cliente que envia `X-Device-Type`;
   2. `20260825003000_reset_dominant_tombstones.sql`, antes de publicar o cliente que absorve `reset_rev` como barreira. Ela recria `cofre_apply_ops` e `cofre_reset_data` na mesma transação e adiciona `cofre_mutations.result_hlc`.
   3. `20260828120000_rls_auto_enable_least_privilege.sql`, `20260828130000_rls_auto_enable_versionada.sql`, `20260828140000_menor_privilegio_tabelas.sql` e
      `20260828150000_rls_auto_enable_gatilho.sql`. **Não dependem de versão de cliente**: só retiram privilégio que nenhum caminho vivo exerce e trazem `rls_auto_enable` para o versionamento. Podem ir juntas, em qualquer release.

      Confira o resultado com os dois scripts somente-leitura, **um bloco por vez** no editor SQL (ele exibe apenas o resultado da última consulta enviada):

      - `supabase/tests/verify_rls_auto_enable.sql` — o bloco 3.1 precisa dizer `OK: o gatilho existe e está habilitado.` e o bloco 4, `OK: nem anon nem authenticated executam public.rls_auto_enable.`
      - `supabase/tests/verify_table_privileges.sql` — o bloco 5 precisa vir **vazio**.

      Depois confirme `GET /api/account/devices` no ambiente: é a única rota que depende de concessão **por coluna**, e é o que quebraria se alguém aplicasse um `revoke all` em `cofre_devices` "por simetria".
10. Publique cliente e funções do contrato `X-Account-Id` juntos. Abas antigas falham fechado e mantêm a fila local até recarregar; não trate esse `400 invalid_account_scope` como perda de dados.

## Avisos abertos desta release

Os avisos abaixo não reprovam `npm run verify:release`. Ficam registrados aqui
para não virarem ruído aceito sem dono. Estado conferido em 31/08/2026.

### 1. Sete campos do controlador ainda são marcadores

`npm run check:release` avisa: `AVISO: 7 campo(s) do controlador ainda com
marcador`. São `name`, `document`, `address`, `supportEmail`, `dpoName`,
`dpoEmail` e `incidentEmail`, em `LEGAL_CONTROLLER` (`js/storage.js`), todos
ainda em `LEGAL_PENDING`.

**Não é dívida técnica e não se resolve no código.** São dados jurídicos reais e
verificáveis que só o dono do aplicativo conhece. Preencher com valor inventado
publicaria identificação falsa de controlador, o que é pior do que o marcador.
Enquanto ele existir, o app se identifica como versão local em desenvolvimento e
a cláusula 12 dos termos declara isso, de modo que o estado atual é coerente.

**Ação:** preencher com dados reais antes de oferecer a instalação ao público, e
subir `LEGAL_TEXT_VERSION` e `LEGAL_REVIEW_DATE` na mesma edição. A tabela com a
base legal de cada campo está em `docs/LEGAL-LAUNCH.md`, e o inventário dos
fluxos está em `docs/INVENTARIO-DE-DADOS.md`. Publicar beta continua liberado;
oferecer ao público, não.

### 2 e 3. Endereços de compartilhamento relativos e `SITE_URL`

São o mesmo aviso visto de dois lados. `npm run build:dist` avisa: `AVISO: 4
endereço(s) de compartilhamento em landing.html continuam relativos`. Os quatro
atributos marcados com `data-lp-absolute` em `landing.html` são o `canonical`, o
`og:url` e as duas imagens (`og:image` e `twitter:image`).

A fonte fica relativa de propósito: o domínio não está no repositório, e chutar
um quebraria o compartilhamento em vez de melhorá-lo. Quem resolve é o build,
quando o ambiente informa o endereço, na ordem `SITE_URL`,
`VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL`.

**Onde o aviso aparece, e por que produção está correta:** `vercel.json` usa
`buildCommand: npm run build:dist`, e a Vercel injeta
`VERCEL_PROJECT_PRODUCTION_URL` no ambiente de build. O aviso só acontece em
build local, onde nenhuma das três variáveis existe. `dist/` é ignorado pelo
Git, então a cópia local relativa nunca é a publicada.

**Conferido em produção (25/08/2026):** os quatro atributos saem absolutos, com
o domínio canônico:

```
<link rel="canonical" href="https://www.financemanager.dev.br/" data-lp-absolute />
<meta property="og:url" content="https://www.financemanager.dev.br/" data-lp-absolute />
<meta property="og:image" content="https://www.financemanager.dev.br/icons/icon-512.png" data-lp-absolute />
<meta name="twitter:image" content="https://www.financemanager.dev.br/icons/icon-512.png" data-lp-absolute />
```

Ou seja, este aviso **não é uma pendência de publicação**: é ruído de build
local. Definir `SITE_URL` continua sendo melhoria útil, mas só pelas
pré-visualizações.

**Ação recomendada:** definir `SITE_URL` explicitamente nas variáveis de ambiente
do projeto na Vercel, com esquema e domínio canônico (`https://dominio`). Ela vem
primeiro na ordem, então fixa o `canonical` também nas pré-visualizações e evita
uma prévia disputar indexação com a página real. Sem ela, produção ainda sai
correta, mas cada prévia se declara canônica.

**Como conferir depois de publicar:**

```
curl -s https://SEU-DOMINIO/ | grep -o '<link rel="canonical"[^>]*>'
```

O `href` precisa vir absoluto. Se voltar `href="/"`, nenhuma das três variáveis
chegou ao build.

## Homologação

Use uma Preview Deployment da Vercel para cada pull request. A homologação deve usar chaves e limites próprios, nunca os segredos de produção. Verifique onboarding, lançamento, cartão, meta, backup, restauração, atualização do service worker e telas móveis antes de aprovar.

## Conferência do roteamento da publicação

```
npm run check:deploy                            # produção (padrão)
npm run check:deploy -- https://uma-previa      # uma pré-visualização
```

Rode contra a **pré-visualização primeiro**, e depois contra produção. É a única verificação que alcança o roteamento da Vercel; todas as outras leem o repositório e param onde a plataforma começa.

O que ela cobre, e por que cada item existe:

| Confere | O que estaria errado |
| --- | --- |
| `/` entrega a página comercial | Um `index.html` na raiz da publicação faria a Vercel servi-lo pelo sistema de arquivos, ANTES das reescritas, e a regra da landing nunca seria avaliada. O build já falha se gerar esse arquivo, então uma falha aqui aponta para a configuração do projeto no painel, não para o build. |
| `/index.html` entrega o app, sem desvio, com os mesmos bytes do repositório (sha256) | Se virar redirecionamento para `/app.html`, o endereço muda na barra: o `start_url` do manifesto passa a divergir e a chave `index.html` do cache do service worker deixa de casar com a navegação. |
| Toda resposta traz `Content-Security-Policy` e os demais cabeçalhos | Um preset de framework no painel pode ignorar o bloco `headers` do `vercel.json`. |
| `/api/account/session` não é 404 nem 500 | 404 é reescrita ausente ou função não publicada; 500 costuma ser a Vercel não tendo rastreado o `require("../netlify/functions/...")`. |
| Um POST com a origem da própria publicação não volta `403 origin_denied` | **O erro mais silencioso da migração.** Com `ALLOWED_ORIGIN` no domínio antigo, toda chamada de conta e de sincronização é recusada. A rota GET de sessão não passa por `assertSameOrigin` e responde normalmente, então o problema só aparece quando alguém tenta entrar — por isso a conferência precisa de um POST. Deixar a variável vazia faz o código cair na própria origem, o que funciona inclusive em pré-visualização. |
| `tests/`, `docs/`, `supabase/`, `scripts/` e `package.json` respondem 404 | O deploy já apontou para a raiz do repositório inteira. |

Backend sem configurar sai como **aviso**, não como falha: é um estado válido numa pré-visualização.

## Produção

Faça a publicação somente a partir de uma revisão aprovada da branch principal. Crie uma tag com a mesma versão do `package.json` e registre o identificador da publicação da Vercel nas notas da versão.

## Retorno à versão anterior

Se a verificação após a publicação falhar, promova na Vercel a última publicação aprovada (Deployments, o deploy bom, "Promote to Production"). Depois reverta a alteração por um novo commit, aumente a versão do cache e publique novamente. Não reescreva o histórico da branch principal e não reduza a versão do schema de dados.

## Checklist após publicar

- A página abre sem erro no console.
- A atualização de uma instalação anterior termina sem tela vazia.
- O modo offline carrega o app completo.
- `npm run test:pwa` confirma shell, landing, dados locais, limpeza de cache e API fora do CacheStorage.
- Backup e restauração funcionam com a versão anterior.
- A função de IA recusa origem e sessão inválidas.
- Uma alteração salva no aparelho A aparece no B em até 20 segundos, sem abrir a tela de sincronização.
- Recarregar ou voltar à aba no aparelho B busca alterações imediatamente.
- Revogar B o remove da lista de acessos e faz conta, sincronização e análise recusarem os cookies antigos.
- Em duas abas, entre na conta B enquanto A está aberta e confirme que A troca de escopo sem enviar, analisar, revogar ou apagar dados de B com a identidade antiga.
- Deixe o access token expirar e confirme que sync/análise recebem `session_refresh_required`, passam por `/api/account/session` e retomam sem logout.
- Nenhuma chave ou arquivo `.env` entrou na publicação.
