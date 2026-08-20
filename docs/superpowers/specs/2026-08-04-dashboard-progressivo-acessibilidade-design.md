# Dashboard progressivo e navegação móvel

## Objetivo

Reduzir o esforço necessário para começar a usar o app sem apagar recursos já existentes. O Início deve responder primeiro quanto há disponível e qual é o próximo passo. Recursos analíticos entram quando os dados necessários existem.

## Abordagens avaliadas

1. Apenas ocultar cartões no layout padrão. Reduz a altura, mas ainda deixa vários estados vazios e não escolhe um próximo passo.
2. Criar uma experiência inicial compacta e aplicar relevância aos cartões depois do primeiro uso. É a abordagem escolhida porque resolve o primeiro acesso e continua reduzindo ruído conforme o estado da pessoa.
3. Aumentar a configuração inicial para escolher cada cartão. Foi descartada porque transfere a complexidade do dashboard para o primeiro acesso.

## Experiência inicial

Uma base sem movimentações, metas ou patrimônio mostra:

- cabeçalho do mês;
- painel de saldo;
- uma ação principal, `Adicionar movimentação`;
- no máximo duas ações secundárias escolhidas entre importar extrato, cadastrar conta e abrir contas;
- um cartão curto explicando como começar.

O restante dos cartões continua disponível na personalização, mas não aparece até existir informação que dê sentido a ele. O painel de saldo também deixa de apresentar cinco atalhos simultâneos.

## Relevância progressiva

Os cartões respeitam a escolha manual do usuário e, além disso, exigem os dados mínimos do próprio assunto. Exemplos: patrimônio exige conta, meta ou bem; orçamento por categoria exige algum teto; histórico exige movimentações; gamificação exige ativação explícita.

Ocultar por falta de dados não altera a preferência salva. Quando o dado passa a existir, o cartão pode aparecer na posição já escolhida.

## Gamificação

Conquistas e celebrações ficam desligadas inicialmente. Um controle em Ajustes permite ativá-las. Ao ativar pela primeira vez, conquistas já atendidas são registradas sem abrir uma sequência de celebrações antigas. Desativar não apaga o histórico conquistado.

## Navegação móvel

A barra móvel terá cinco destinos:

1. Início;
2. Movimentações, usando a tela atual de análises e histórico;
3. Adicionar;
4. Planejamento, usando calendário e previsão;
5. Tudo.

A navegação lateral de telas maiores permanece com seus destinos atuais.

## Acessibilidade

- `--ink-faint` deve atingir contraste mínimo de 4,5:1 sobre os fundos em que aparece nos temas claro e escuro.
- Em dispositivos de toque, botões e campos terão área mínima de 44 por 44 pixels, preservando o desenho visual dos interruptores.
- Foco, nomes acessíveis e ordem de navegação existentes serão mantidos.
- A barra móvel usará texto de pelo menos 11 pixels.

## Direção visual

A identidade `Cofre` será preservada. O painel esmeralda continua sendo o elemento de assinatura; a mudança visual é de hierarquia, não de decoração. O dashboard inicial deve caber aproximadamente em uma tela de celular, admitindo pequena rolagem em aparelhos baixos.

## Testes

- motor de relevância e preferências;
- dashboard inicial sem cartões vazios;
- limite de três ações no painel principal;
- ativação e desativação da gamificação;
- cinco destinos na navegação móvel;
- contraste dos tokens;
- dimensões mínimas em navegador com viewport de 390 pixels.

