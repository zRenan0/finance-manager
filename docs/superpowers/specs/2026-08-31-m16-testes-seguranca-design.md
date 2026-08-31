# M16: testes defensivos de segurança

## Objetivo

Transformar os nove vetores definidos no roteiro do M16 em uma regressão
executável e fácil de localizar: usuário A contra usuário B, JWT inválido, JWT
expirado, manipulação de `user_id`, RPC sem autenticação, aparelho revogado,
replay, entrada maliciosa e limite de requisições.

O projeto já possui provas espalhadas para boa parte desses casos. O M16 não
vai reescrever essas suítes nem criar um segundo sistema de autenticação. Ele
vai preencher as lacunas comportamentais, criar uma matriz rastreável e manter
as verificações próximas da fronteira que protegem.

## Abordagens consideradas

1. **Somente catalogar os testes atuais.** Tem pouco risco, mas não prova que os
   nove vetores continuam cobertos por comportamento.
2. **Atacar a produção pela rede.** Exercita o ambiente publicado, mas rate
   limit, replay e manipulação de conta podem alterar estado ou bloquear pessoas
   reais. Essa opção fica fora do M16.
3. **Suíte adversarial local mais contrato de banco.** Executa os handlers reais
   com um adaptador controlado para Auth e banco, complementa as provas SQL já
   existentes e deixa a execução em staging preparada. Esta é a abordagem
   escolhida.

## Arquitetura da prova

Uma suíte dedicada carregará `account.js`, `sync.js`, `analyze.js` e o limitador
real. Somente a fronteira de Supabase será substituída por respostas
determinísticas. Assim, parsing de cookies, ordem das guardas, códigos HTTP,
escopo da conta e chamadas privilegiadas continuam sendo o código de produção.

A suíte deverá provar:

| Vetor | Prova mínima |
|---|---|
| Usuário A contra B | conta B recebe 403 antes de qualquer leitura ou escrita |
| JWT inválido | token recusado pelo provedor não chega ao banco |
| JWT expirado | rota escopada pede renovação e não consome o refresh |
| Manipulação de `user_id` | identificadores no corpo são ignorados ou recusados; RPC recebe o usuário da sessão |
| RPC sem autenticação | nenhuma função privilegiada concede execução a `PUBLIC`, `anon` ou `authenticated` |
| Aparelho revogado | acesso termina em 403 antes de consultar dados financeiros |
| Replay | repetição idêntica é idempotente e conteúdo divergente recebe 409 |
| Entrada maliciosa | identificadores, corpo e filtros hostis são recusados antes da persistência |
| Limite de requisições | teto devolve 429, `retryAfter` e continua fechado quando o banco falha |

## Banco e ambientes

As provas Node entram na suíte comum e não usam conta real. As verificações SQL
permanecem somente leitura ou transacionais com `ROLLBACK`, como os arquivos em
`supabase/tests`. Se houver conexão de desenvolvimento ou staging disponível,
o contrato SQL poderá ser executado ali. Sem essa conexão, o M16 não tentará
adivinhar credenciais nem disparará testes agressivos contra produção.

## Tratamento de achados

Uma falha nova será corrigida somente na menor fronteira que a origina. Mudança
de protocolo, schema, política de acesso ou comportamento financeiro fica fora
do módulo, a menos que um teste confirme uma falha de segurança que exija a
alteração. Nesse caso, a causa e a compatibilidade serão registradas no
progresso da auditoria.

## Critérios de conclusão

- Os nove vetores possuem uma prova identificável e executável.
- A suíte defensiva usa handlers reais e confirma que recusas acontecem antes
  de Auth privilegiado, banco, IA ou persistência.
- Testes existentes continuam passando sem relaxar asserções.
- Lint, cobertura, pacote, navegadores, PWA e landing permanecem aprovados.
- A documentação aponta quais verificações exigem staging e não declara uma
  execução externa que não ocorreu.
