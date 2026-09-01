# Arquitetura de marca

Registro operacional do M22. Ele responde uma pergunta só: **quando escrever
"Cofre" e quando escrever "financemanager.dev.br"** — e o que jamais deve ser
renomeado em nome de coerência de marca.

A suíte `tests/test-brand.js` confere o que está aqui. Se este documento mudar sem
o código mudar junto, o teste reprova.

## A decisão

**O produto se chama Cofre. `financemanager.dev.br` é o endereço dele.**

Não existem dois produtos, nem submarca, nem "Cofre by FinanceManager". Existe um
nome e um domínio, como acontece com quase todo produto cujo domínio bonito estava
ocupado.

Por que assim, e não o contrário:

- **"Cofre" já é a identidade inteira.** O logotipo é um cofre com um visto
  dentro; o nome aparece na landing, no onboarding, na navegação, no atalho
  instalado, no PDF exportado, na imagem da retrospectiva e no rodapé. Trocar isso
  seria refazer a identidade, não organizá-la.
- **O domínio é o ativo que não se troca barato.** Ele está na indexação, nos
  links já compartilhados, no `SITE_URL` que gera os emails de confirmação, no
  `Canonical` do `security.txt` e na conferência de publicação. Mudar domínio para
  casar com o nome custaria muito mais do que resolve.
- **"FinanceManager" nunca foi nome de produto.** Antes do M22 ele não aparecia em
  nenhuma tela, nenhum título, nenhum manifesto. Aparecia só na barra de endereço
  e em três linhas de documentação, escritas nos módulos 20 e 21.

## A regra de escrita

| Situação | Escreva | Não escreva |
|---|---|---|
| Interface, título, manifesto, textos | **Cofre** | FinanceManager |
| Falando do endereço publicado | **financemanager.dev.br** | FinanceManager |
| Quando os dois precisam aparecer juntos | **Cofre (financemanager.dev.br)** | FinanceManager — Cofre; Cofre by FinanceManager |
| Nome do repositório e dos arquivos de auditoria | como já estão | renomear por estética |

`FINANCEMANAGER_AUDIT_PROGRESS.md` mantém o nome. É arquivo de trabalho, tem
histórico e referências, e renomeá-lo só produziria links quebrados.

## Identificadores congelados

Estes nomes **parecem** inconsistência de marca e **não são**: são contratos.
Renomear qualquer um deles quebra dado gravado, sincronização ou instalação. Eles
existem em três gerações do projeto e a divergência entre eles é histórica, não
descuido.

| Identificador | Onde | Por que não pode mudar |
|---|---|---|
| `cofre_*` | Tabelas, RPCs e policies no Postgres | Nome de tabela e de função em produção; migrations aplicadas dependem deles |
| `financas_db`, `financas_db_undo`, `financas_safe_errors_v1` | IndexedDB e localStorage | Chave persistida no aparelho do usuário; renomear apaga os dados de quem já usa |
| `organizador-financeiro/backup` | Campo `kind` do arquivo de backup | Contrato do arquivo; a restauração valida por ele. Backup antigo pararia de abrir |
| `window.CofreUI` | Global de runtime entre módulos | Contrato interno entre `bootstrap.js` e o aplicativo |
| `cofre-organizador-financeiro` | `name` do `package.json` | Não é público; mudar não traz nada |
| `financas-cache-*`, `financas-pages-*`, `financas-fonts-*` | Nomes de cache do Service Worker | A limpeza de versão antiga procura por esse prefixo |

**Nenhum deles é visível para o usuário.** O `app:` do envelope de backup
("Cofre. Organizador financeiro pessoal") é descritivo, nunca lido de volta, e por
isso pode acompanhar a marca — mas o `kind` ao lado dele, não.

## Padronização das superfícies

| Superfície | Estado |
|---|---|
| Título da landing | `Cofre \| Organizador financeiro pessoal` |
| Título do aplicativo | o mesmo, de propósito — ver abaixo |
| Favicon e ícone de toque | `icons/icon-192.png` nas três páginas |
| Atalho iOS | `apple-mobile-web-app-title` = `Cofre` no aplicativo e na landing |
| Manifesto | `name` = `Cofre. Organizador financeiro pessoal`, `short_name` = `Cofre` |
| Open Graph | `og:site_name` = `Cofre`, só na landing, que é a página de compartilhamento |
| Navegação e onboarding | `Cofre` |
| PDF, retrospectiva e backup | `Cofre` |

### Por que landing e aplicativo têm o mesmo título

Não é descuido: é correção antiga, travada em `tests/test-beta-fixes.js` (F-11).
O aplicativo já se chamou "Finanças" enquanto a landing se chamava "Cofre", e quem
clicava em "Começar grátis" chegava ao que parecia outro produto. Os dois títulos
coincidirem é a garantia de que é a mesma casa.

O efeito colateral disso seria título duplicado na busca. Resolvido pelo caminho
certo: o aplicativo é `noindex`. Ele não tem o que indexar — sem JavaScript
executado e sem dados do usuário, a página é um esqueleto de carregamento. A
landing continua sendo a única porta indexada, e o `follow` preserva o rastreio
dos links que saem dela.

## Ao mudar qualquer coisa aqui

1. `docs/MARCA.md` e `tests/test-brand.js` andam juntos.
2. Superfície nova (página, email, exportação) usa **Cofre**, nunca o domínio como
   se fosse nome.
3. Identificador congelado só muda com migration e plano de compatibilidade — e
   nunca por motivo de marca.
4. Se algum dia o produto for renomeado de verdade, o trabalho começa por esta
   tabela, não pelo `find and replace`.
