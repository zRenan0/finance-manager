---
description: Commita tudo que mudou e ja empurra pro GitHub (origin)
---

Suba as alteracoes pendentes deste repositorio para o GitHub.

Passos:

1. Rode `git status -sb` e `git diff --stat` para ver o que mudou. Se nao houver nada
   pendente (nem modificado, nem novo arquivo), avise que nao ha o que subir e pare.
2. Mostre ao usuario, em uma lista curta, os arquivos que serao enviados. Se algo parecer
   que nao deveria ir (arquivo com segredo, `.env`, dump, build local, arquivo enorme),
   aponte antes de continuar.
3. `git add -A`
4. Faca o commit com mensagem no padrao do repositorio: conventional commit em portugues,
   sem acentos, na linha de assunto — ex.: `feat: adiciona filtro por categoria`,
   `fix: corrige total do mes na dashboard`, `chore: atualiza dependencias`.
   Se o usuario passou um texto como argumento ($ARGUMENTS), use-o como base da mensagem.
   Termine a mensagem com:
   Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
5. `git push` para o remoto configurado da branch atual. Se a branch nao tiver upstream,
   use `git push -u origin HEAD`.
6. Confirme o resultado: nome da branch, para qual branch remota foi, hash curto do commit
   e o link https://github.com/zRenan0/finance-manager/commit/<hash>.

Atencao: a branch local `deploy-atualizado` rastreia `origin/main`. Um push daqui cai na
`main` do GitHub e dispara o deploy da Vercel. Se o commit for arriscado ou experimental,
avise o usuario disso antes de empurrar.
