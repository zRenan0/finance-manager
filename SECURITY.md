# Política de segurança

O Cofre (FinanceManager) guarda dado financeiro pessoal. Se você encontrou uma
falha, queremos saber antes de qualquer outra pessoa.

A versão publicada desta política, com escopo e prazos, fica em
**https://www.financemanager.dev.br/reportar-vulnerabilidade**, e o canal também
está declarado em `/.well-known/security.txt`.

## Como reportar

Use o **aviso privado de segurança do GitHub**, em
[Security → Report a vulnerability](https://github.com/zRenan0/finance-manager/security/advisories/new).
O relato fica visível só para quem mantém o projeto.

**Não abra issue pública** descrevendo a falha, e não publique antes da correção.

O endereço de email de incidentes será publicado junto com a identificação do
controlador, antes da oferta ao público (ver `docs/LEGAL-LAUNCH.md`). Até lá, o
canal do GitHub é o caminho completo.

## O que enviar

1. o que a falha permite fazer, em uma frase;
2. onde: endereço, tela, rota da API ou função;
3. como reproduzir, passo a passo;
4. o que aconteceu e o que deveria acontecer;
5. navegador, sistema e versão do aplicativo;
6. data e hora aproximadas do teste.

**Não anexe dado de outra pessoa.** Se você alcançou informação de terceiro,
diga que alcançou e descreva o tipo — sem enviar o conteúdo e sem guardar cópia.

## Escopo

**Dentro:** o site e o aplicativo em `financemanager.dev.br`; as funções
`/api/account`, `/api/sync` e `/api/analyze`; autenticação, sessão e aparelhos;
isolamento entre contas na sincronização; Service Worker, cache e comportamento
offline; importação, backup e restauração; o código deste repositório.

**Fora:** negação de serviço e teste de carga; engenharia social; ataque físico;
falha em serviço de terceiro; relato de varredura sem impacto demonstrado;
ausência de cabeçalho sem caminho de exploração.

## Regras do teste

Pesquisando dentro destas regras, tratamos seu trabalho como contribuição de
boa-fé e não tomamos medida legal contra você por causa dele.

- Use conta sua.
- Pare ao confirmar a falha; não é preciso ir mais fundo para provar.
- Não acesse, copie, altere nem apague dado de outra pessoa.
- Não degrade o serviço para quem está usando.
- Não use a falha para obter vantagem.
- Não publique antes da correção.

## O que esperar

| Prazo | O que acontece |
|---|---|
| até 72 horas | confirmamos que o relato chegou |
| até 7 dias | dizemos se reproduzimos e qual a gravidade |
| durante | avisamos o andamento sem você precisar cobrar |
| ao corrigir | avisamos e combinamos a data de publicação |

Falha que alcança dado de outro titular entra em contenção imediata. O
procedimento interno está em [`SECURITY_INCIDENT_RESPONSE.md`](SECURITY_INCIDENT_RESPONSE.md).

Projeto pequeno: os prazos são compromisso de esforço, não de contrato. Se
passar do prazo, cobre.

## Recompensa

**Não há recompensa em dinheiro.** O projeto está em beta e não mantém programa
pago. Oferecemos resposta rápida, correção real e crédito público a quem quiser.

## Versões

Só a versão publicada em produção recebe correção. Não há suporte a versões
anteriores instaladas fora do fluxo normal de atualização.
