# M10: protocolo de sincronização

## Objetivo

Auditar o protocolo 3 de ponta a ponta e ampliar as provas automatizadas dos
casos de concorrência, repetição e recuperação definidos no roteiro. O trabalho
preserva as interfaces atuais, a compatibilidade declarada com clientes antigos,
o modelo por operações e as garantias de `mutation_id`, `request_hash`, revisão,
HLC, lápides, checkpoints e dispositivos.

## Abordagem escolhida

Foram consideradas três alternativas:

1. Manter o protocolo e testar seus invariantes por camada, corrigindo apenas
   defeitos demonstrados. É a escolha adotada porque reduz o risco de mudar dados
   ou contratos que já estão em produção.
2. Dividir agora as funções SQL grandes em funções menores. Isso facilitaria a
   leitura, mas criaria uma migração ampla sem benefício funcional comprovado.
3. Substituir o protocolo por sincronização de instantâneo. Isso removeria
   idempotência, resolução por registro e proteção contra concorrência, além de
   contrariar o escopo do M10.

## Camadas e invariantes

O cliente continuará produzindo operações por registro, mantendo fila local e
cursor remoto por escopo. O backend continuará obtendo o usuário da sessão,
validando protocolo, corpo, dispositivo e formato antes de chamar as funções
privilegiadas. O PostgreSQL continuará serializando alterações por conta,
rejeitando revisão esperada divergente, registrando idempotência e escolhendo a
operação vencedora pela HLC.

As provas do M10 devem cobrir:

- dois dispositivos alterando ao mesmo tempo, tanto registros diferentes quanto
  o mesmo registro;
- repetição do mesmo `mutation_id`, com o mesmo hash e com conteúdo diferente;
- queda antes ou depois da confirmação remota, sem duplicar nem perder operação;
- dispositivo revogado e recusa de escrita;
- aparelho offline por vários dias e relógio fora do intervalo aceito;
- cliente antigo, versão aceita para leitura e protocolo incompatível para
  escrita;
- exclusão seguida de recriação, respeitando a maior HLC;
- reset concorrente com ciclo de sincronização;
- checkpoint completo, paginação e recusa de restauração parcial;
- lote grande e importação concorrente, preservando paginação, ordem e
  idempotência.

## Tratamento de falhas

Falhas de transporte mantêm a operação na fila. Conflito de revisão força nova
leitura antes de reenviar. Respostas incompatíveis ou malformadas falham sem
avançar cursor. Dispositivo revogado encerra o vínculo remoto. Reset e
restauração usam a trava do escopo para impedir que uma resposta antiga
ressuscite dados. Nenhum erro pode transformar uma leitura parcial de checkpoint
em exclusão local.

## Verificação e limites

Os testes serão determinísticos e não dependerão da produção. Eles exercitarão
cliente, contrato HTTP, validação de payload e estrutura das migrações SQL. Se um
defeito for confirmado, a correção terá teste de regressão e manterá protocolo 3,
nomes de rotas, formato de backup e dados existentes. Refatoração sem falha
demonstrada, mudança de protocolo e implantação no banco ficam fora deste módulo.

O M10 termina com lint, suíte completa, checagem do módulo gerado, release,
pacote de distribuição, cobertura e testes de navegador aprovados. A memória da
auditoria deve registrar achados, correções, compatibilidade e comandos
executados.
