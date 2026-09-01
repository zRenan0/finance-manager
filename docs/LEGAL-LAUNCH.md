# Condições jurídicas para o lançamento comercial

O aplicativo implementa consentimento versionado, controles de IA, exportação, exclusão local e online, contas opcionais, retenção declarada e limites claros para estimativas financeiras. A política publicada na tela Privacidade já traz identificação do controlador, inventário de dados, prazos de retenção, direitos do titular (art. 18) e canal de incidentes (art. 48).

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
2. Formalizar Vercel, Supabase e Anthropic com as cláusulas de tratamento aplicáveis. O registro completo dos serviços e dos dados recebidos está em `LEGAL_THIRD_PARTIES` e em `docs/TERCEIROS-E-OPERADORES.md`.
3. Confirmar o contrato efetivo da Anthropic. A política pública informa exclusão padrão das entradas e saídas da API em até 30 dias, mas admite acordo diferente, retenção para aplicação da política de uso e obrigação legal.
4. Confirmar o plano da Vercel e registrar o prazo efetivo. A documentação pública informa 1 hora no Hobby, 1 dia no Pro, 3 dias no Enterprise e 30 dias com Observability Plus, mas o repositório não identifica o plano contratado.
5. Identificar e registrar o provedor SMTP de produção, sua política, retenção, exclusão, país e contrato. O Supabase exige SMTP próprio para produção, mas o fornecedor não aparece no repositório.
6. Registrar a região de Vercel e Supabase, os países de processamento e as salvaguardas de transferência internacional aplicáveis às contas efetivas.
7. Registrar internamente as finalidades e bases legais por operação. As finalidades técnicas estão no inventário, mas a escolha jurídica da base continua pendente.
8a. O canal de entrada para pesquisadores existe desde o M21: página pública em `/reportar-vulnerabilidade`, `SECURITY.md` no repositório e `/.well-known/security.txt` gerado no build. Ele **não** depende de `incidentEmail`, porque usa o aviso privado do GitHub. Falta confirmar, nas configurações do repositório, que o recebimento privado de vulnerabilidades está habilitado; e, quando o email de incidentes existir, ele entra sozinho no `security.txt`, sem mudança de código.

8. O processo interno de incidentes está definido em `SECURITY_INCIDENT_RESPONSE.md` (M20): quem detecta, quem contém, quem decide comunicar, os prazos e onde fica o registro. O que continua aberto é a **designação real**: sem `dpoName`, `dpoEmail` e `incidentEmail` preenchidos, não há encarregado nomeado nem canal publicado para comunicar ou receber comunicação. Enquanto isso, o papel de controlador e o de encarregado recaem sobre o mantenedor por falta de designação formal.
9. Revisar os termos comerciais, preço, renovação, cancelamento, suporte, disponibilidade, propriedade intelectual e foro com assessoria jurídica. O texto atual foi escrito para uma versão gratuita e local.
10. Conferir publicidade, simuladores e conteúdos com profissional habilitado antes de apresentar qualquer resultado como orientação individual.
11. Fazer nova revisão da política e dos termos sempre que mudar a coleta, a infraestrutura ou a versão comercial, subindo `LEGAL_TEXT_VERSION` quando o conteúdo mudar.

## O que saiu da lista

- Fontes remotas do Google foram removidas. A tipografia é servida pelo próprio app, então não há mais terceiro carregando junto com a página.
- Prazos de retenção deixaram de ser pendência: estão declarados em `LEGAL_RETENTION`, lidos do código que os aplica.
- Direitos do titular e canal de incidentes deixaram de ser pendência: estão na tela, com o que o app resolve sozinho separado do que depende de pedido.
- O inventário técnico deixou de ser pendência: as classes e suas seis dimensões estão em `LEGAL_DATA_INVENTORY` e em `docs/INVENTARIO-DE-DADOS.md`. Prazos externos que ainda dependem de contrato continuam abertos, sem estimativa inventada.
- A lista de terceiros deixou de ser uma descrição solta. Vercel, Supabase, Anthropic, Have I Been Pwned e portais fiscais estão em `LEGAL_THIRD_PARTIES`, com momento de uso, dados recebidos, retenção, exclusão, transferência e fonte oficial. O SMTP de produção continua marcado como fornecedor não definido.

## Como subir a versão do texto

`LEGAL_TEXT_VERSION` sobe quando o CONTEÚDO muda, não quando muda a redação. Ao subir, todo usuário precisa aceitar de novo, e o aceite anterior fica registrado em `privacy.acceptedVersions`, no aparelho e, com conta ligada, na configuração sincronizada. Ajuste `LEGAL_REVIEW_DATE` na mesma edição.

## Referências oficiais

- [Lei Geral de Proteção de Dados](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm)
- [Direitos dos titulares na ANPD](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares)
- [Comunicação de incidente de segurança na ANPD](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis)
- [Guia de segurança para agentes de pequeno porte](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-sobre-seguranca-da-informacao-para-agentes-de-tratamento-de-pequeno-porte)
- [Orientação da CVM sobre consultoria de valores mobiliários](https://www.gov.br/cvm/pt-br/assuntos/noticias/2026/area-tecnica-da-cvm-orienta-sobre-atividade-de-consultoria-de-valores-mobiliarios/)

Até esses dados serem definidos e revisados, o próprio aplicativo identifica a instalação como versão local em desenvolvimento.
