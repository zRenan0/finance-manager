# Revisão das referências financeiras

## Objetivo

Separar regras oficiais, parâmetros pessoais e exemplos ilustrativos. Nenhuma taxa variável deve parecer uma cotação atual quando o app está offline.

## Escopo

Esta revisão cobre referências capazes de mudar uma decisão no estado atual do produto:

- atalhos de rendimento da máquina de juros compostos;
- remuneração e saque-aniversário do FGTS;
- cobertura do FGC;
- custódia do Tesouro Direto;
- prazo anual do IRPF;
- percentuais de comprometimento de renda apresentados como regra geral;
- origem e validade das premissas editáveis de Selic, CDI, IPCA e TR.

## Regras de apresentação

1. Taxas variáveis serão derivadas das premissas editáveis ou digitadas pelo usuário.
2. Premissas nunca revisadas serão chamadas de exemplos iniciais, com aviso explícito de que não são cotações atuais.
3. Percentuais internos de saúde financeira serão chamados de faixas de planejamento do app, não de limites bancários ou recomendações universais.
4. Regras oficiais terão a instituição responsável e a data da revisão registradas no código e mostradas na interface quando relevante.

## Correções

- Remover o atalho `Ações (hist.) 12%`, pois um retorno único sem período, índice e fonte induz expectativa indevida.
- Calcular os atalhos de poupança, 110% do CDI e IPCA mais 6% a partir das premissas do aparelho.
- No FGTS, preservar `TR + 3% + distribuição de resultados` e considerar o piso anual do IPCA estabelecido em 2024. O retorno continua editável, pois a distribuição anual não pode ser prevista pelo app.
- Explicar que, no saque-aniversário, a demissão libera a multa rescisória, mas não o saldo integral; o retorno ao saque-rescisão só produz efeito no 25º mês após a solicitação, quando aplicável.
- Descrever a cobertura do FGC por CPF ou CNPJ e conglomerado, incluindo o teto global de quatro anos.
- Manter a custódia do Tesouro Direto em 0,20% ao ano e a isenção do Tesouro Selic até R$ 10 mil, com texto que permita futura revisão.
- Não fixar `31 de maio` no calendário. O evento informará o prazo do exercício quando conhecido pelo calendário oficial e orientará confirmação anual.

## Fontes primárias

- Banco Central do Brasil para poupança.
- Tesouro Direto para custódia.
- Fundo Garantidor de Créditos para limites de cobertura.
- FGTS para remuneração e saque-aniversário.
- Receita Federal para IRPF e tributação de renda fixa.

## Testes

- atalhos variam quando as premissas mudam;
- nenhum atalho de ações permanece;
- retorno padrão do FGTS não fica abaixo do piso informado de inflação;
- textos de saque-aniversário, FGC e IRPF não preservam afirmações incorretas;
- tabelas de IR já existentes continuam cobertas pelos testes atuais.

