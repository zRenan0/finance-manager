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
- Backup e restauração funcionam com a versão anterior.
- A função de IA recusa origem e sessão inválidas.
- Nenhuma chave ou arquivo `.env` entrou na publicação.
