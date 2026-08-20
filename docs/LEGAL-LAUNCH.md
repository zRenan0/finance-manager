# Condições jurídicas para o lançamento comercial

O aplicativo implementa consentimento versionado, controles de IA, exportação, exclusão local e online, contas opcionais, retenção declarada e limites claros para estimativas financeiras. A política publicada na tela Privacidade já traz identificação do controlador, prazos de retenção, direitos do titular (art. 18) e canal de incidentes (art. 48).

Isso não torna o produto pronto para oferta pública. Falta preencher os campos que só o dono do aplicativo conhece. Eles vivem em `LEGAL_CONTROLLER`, em `js/storage.js`, com o marcador `LEGAL_PENDING`. Enquanto qualquer um deles estiver com o marcador:

- a tela Privacidade mostra "Ainda não definido" no campo e um aviso listando o que falta;
- a cláusula 12 dos termos declara a instalação como versão local em desenvolvimento;
- `npm run check:release` avisa que a identificação está incompleta.

## Campos a preencher em `LEGAL_CONTROLLER`

| Campo | O que é | Base legal |
|---|---|---|
| `name` | Nome empresarial ou nome do responsável | LGPD art. 9, I |
| `document` | CPF ou CNPJ aplicável | Marco Civil art. 7 e CDC art. 31 |
| `address` | Endereço do controlador | CDC art. 31 |
| `supportEmail` | Canal de atendimento ao titular | LGPD art. 18 e art. 19 |
| `dpoName` | Encarregado pelo tratamento de dados | LGPD art. 41 |
| `dpoEmail` | Contato do encarregado, publicado | LGPD art. 41, parágrafo 1 |
| `incidentEmail` | Canal para comunicar e receber aviso de incidente | LGPD art. 48 |

`responseDays` já está em 15 dias, o prazo do art. 19, II. Só mude com orientação jurídica.

## Bloqueadores de lançamento que continuam abertos

1. Preencher os sete campos da tabela acima com dados reais e verificáveis.
2. Contratar ou formalizar operadores e serviços externos usados hoje (hospedagem, banco de dados, provedor de IA) com cláusula de tratamento de dados. O provedor de IA e o de infraestrutura recebem dados pessoais quando a conta está ligada.
3. Documentar o prazo de retenção do provedor de IA sobre o conteúdo enviado. A política diz o que o app faz; o que o provedor faz depois é informação do contrato, e ainda não está declarada.
4. Registrar internamente as finalidades e bases legais por operação, incluindo execução de contrato para a conta e consentimento para os envios opcionais.
5. Definir o processo interno de incidentes: quem detecta, quem decide, em quanto tempo comunica o titular e a ANPD, e onde fica o registro.
6. Revisar os termos comerciais, preço, renovação, cancelamento, suporte, disponibilidade, propriedade intelectual e foro com assessoria jurídica. O texto atual foi escrito para uma versão gratuita e local.
7. Conferir publicidade, simuladores e conteúdos com profissional habilitado antes de apresentar qualquer resultado como orientação individual.
8. Fazer nova revisão da política e dos termos sempre que mudar a coleta, a infraestrutura ou a versão comercial, subindo `LEGAL_TEXT_VERSION` quando o conteúdo mudar.

## O que saiu da lista

- Fontes remotas do Google foram removidas. A tipografia é servida pelo próprio app, então não há mais terceiro carregando junto com a página.
- Prazos de retenção deixaram de ser pendência: estão declarados em `LEGAL_RETENTION`, lidos do código que os aplica.
- Direitos do titular e canal de incidentes deixaram de ser pendência: estão na tela, com o que o app resolve sozinho separado do que depende de pedido.

## Como subir a versão do texto

`LEGAL_TEXT_VERSION` sobe quando o CONTEÚDO muda, não quando muda a redação. Ao subir, todo usuário precisa aceitar de novo, e o aceite anterior fica registrado em `privacy.acceptedVersions`, no aparelho dele. Ajuste `LEGAL_REVIEW_DATE` na mesma edição.

## Referências oficiais

- [Lei Geral de Proteção de Dados](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm)
- [Direitos dos titulares na ANPD](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares)
- [Comunicação de incidente de segurança na ANPD](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis)
- [Guia de segurança para agentes de pequeno porte](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-sobre-seguranca-da-informacao-para-agentes-de-tratamento-de-pequeno-porte)
- [Orientação da CVM sobre consultoria de valores mobiliários](https://www.gov.br/cvm/pt-br/assuntos/noticias/2026/area-tecnica-da-cvm-orienta-sobre-atividade-de-consultoria-de-valores-mobiliarios/)

Até esses dados serem definidos e revisados, o próprio aplicativo identifica a instalação como versão local em desenvolvimento.
