# M18: inventário de dados e transparência LGPD

## Escopo

O M18 cria um inventário único para cada classe de dado tratada pelo aplicativo.
Cada item deve declarar finalidade, armazenamento, retenção, acesso, terceiros e
exclusão. O inventário cobre o modo local, a conta sincronizada e os envios
opcionais para serviços externos.

Não fazem parte deste módulo a escolha de bases legais, o preenchimento da
identificação do controlador, a negociação de contratos com fornecedores nem o
procedimento de incidente. Esses pontos dependem de decisão externa ou pertencem
aos módulos seguintes e continuam indicados como pendências de lançamento.

## Decisão

`js/storage.js` terá `LEGAL_DATA_INVENTORY`, a fonte estruturada do inventário.
Cada entrada usará os campos `id`, `data`, `purpose`, `storage`, `retention`,
`access`, `thirdParties` e `deletion`. Um validador apontará identificador
repetido, campo ausente ou texto vazio, permitindo que a suíte impeça uma
política incompleta.

A tela de Privacidade renderizará a mesma estrutura em blocos expansíveis. Isso
evita manter uma matriz no código e outra versão escrita à mão na interface. O
documento operacional `docs/INVENTARIO-DE-DADOS.md` continuará mais detalhado e
indicará as fontes de código que comprovam cada fluxo.

## Classes cobertas

1. Dados financeiros, perfil e preferências mantidos no aparelho.
2. Cópias locais legíveis de recuperação, fila e restauração.
3. Dados financeiros e preferências sincronizados com uma conta.
4. Cadastro, sessão e recuperação de acesso.
5. Identificação e atividade dos aparelhos conectados.
6. Identificadores derivados usados no limite de tentativas.
7. Aceites dos textos e preferências de envio para IA.
8. Diagnóstico local e observações técnicas do backend.
9. Pacotes enviados ao provedor de IA e suas respostas transitórias.
10. Prefixo de hash consultado no serviço de senhas vazadas.
11. Chave de nota enviada ao portal fiscal.
12. Arquivos importados e dados extraídos localmente.
13. Backups exportados pelo usuário.

## Regras de transparência

- As cópias financeiras locais em espelho, fallback e desfazer serão descritas
  como JSON legível e sem criptografia no aparelho.
- O inventário separará apagar dados controlados pelo app de apagar arquivos já
  exportados ou dados já enviados a terceiros.
- Retenção desconhecida de plataforma ou fornecedor não receberá prazo
  inventado. Ela ficará identificada como decisão necessária antes da oferta ao
  público.
- A consulta de senha deixará explícito que o terceiro recebe cinco caracteres
  do SHA-1 e o endereço da função, sem senha, email ou IP do usuário.
- O histórico de aceite será descrito como sincronizável quando há conta, pois
  `privacy` faz parte do protocolo atual. O comentário antigo que o chamava de
  exclusivamente local será corrigido.

## Compatibilidade

O schema financeiro, o IndexedDB, o protocolo de sincronização e as APIs não
mudam. Como a política ganha conteúdo material, `LEGAL_TEXT_VERSION` e
`LEGAL_REVIEW_DATE` sobem para 31 de agosto de 2026, pedindo novo aceite e
preservando o histórico anterior.

## Verificação

A suíte própria deve confirmar:

- identificadores únicos e as sete dimensões preenchidas em todas as entradas;
- cobertura das treze classes acima;
- correspondência com retenções implementadas, processamento local de arquivos,
  k-anonimato, observabilidade sem conteúdo e exclusão da conta;
- renderização do inventário na tela de Privacidade;
- aviso sobre JSON local legível e limites de exclusão;
- permanência das pendências externas sem dados ou prazos inventados.

Depois da suíte específica, serão executados build, lint, testes completos,
checagens de publicação, cobertura e matrizes de navegador, PWA e landing.
