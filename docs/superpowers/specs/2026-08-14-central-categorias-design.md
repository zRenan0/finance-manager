# Central de categorias: criação, hierarquia e agrupamento

## Problema

Categoria era um cartão no fim de Ajustes. Cada categoria ocupava uma linha com ícone, nome, campo de teto e dois botões; abaixo dela, três chips repetiam o grupo da Regra x/x/x. A criação ficava no rodapé, num formulário com um `select` de "categoria pai". Três consequências, todas observáveis:

1. Criar subcategoria exigia entender o `select` antes de digitar o nome. Quem não mexia nele criava tudo solto na raiz.
2. Não havia como mudar a categoria-mãe depois. Categoria criada no lugar errado ficava errada para sempre, ou era apagada — e apagar mexe no histórico.
3. A hierarquia aparecia como lista plana com um "›" antes do nome, e o grupo era repetido linha a linha sem nenhuma visão de conjunto. Não dava para responder "o que eu classifiquei como Desejo?" sem varrer a tela inteira.

## Escopo aprovado

Tela própria (`#/categorias`) para criar, organizar e limitar categorias. Ajustes deixa de editar categoria e passa a resumir o estado e apontar para a tela nova. Nenhuma mudança no modelo de dados: continuam valendo um único nível de subcategoria, o campo `group` por categoria e o teto mensal em `budget`.

## 1. Três lentes sobre a mesma lista

A tela abre com um panorama do mês (divisão dos gastos entre Necessidades, Desejos e Futuro, quantas categorias têm teto e quantas estouraram) e um seletor de três visões:

- **Estrutura**: a árvore. Cada categoria-mãe mostra gasto do mês, teto e quantidade de subcategorias; as filhas ficam presas a ela por um trilho vertical, com grupo e teto próprios. Recolher e expandir é por categoria.
- **Grupos**: um cartão por grupo da Regra x/x/x, com o gasto do mês contra o valor que a regra reserva para aquele grupo, e a lista das categorias que caem nele. É a resposta direta à pergunta "o que eu classifiquei como Desejo?".
- **Tetos**: lista compacta com um campo por categoria, barra de consumo e sugestão pela média dos últimos meses. Preserva a edição em lote que a versão antiga permitia.

A busca por nome atravessa as três visões e força a expansão do que casou: esconder resultado atrás de um chevron é o oposto de procurar.

## 2. Editor único, em folha

Criar e editar passam pelo mesmo componente, aberto como camada sobreposta:

- nome, ícone (grade sempre visível), cor e teto opcional;
- **onde a categoria fica**: "Categoria principal" ou uma das mães existentes, escolhida por chip, e não por `select`. É este campo que passa a permitir **mover** uma categoria de mãe sem apagar nada;
- **grupo da Regra x/x/x**, com uma linha explicando o que cada grupo significa em vez de três chips mudos.

Uma categoria que já tem subcategorias não pode virar subcategoria: o modelo tem um nível só, e aninhar mais esconderia gasto de todos os tetos. A regra é aplicada na interface e novamente ao salvar.

A exclusão é confirmada dentro da própria folha, em duas etapas, como já acontece em patrimônio e carteira. O texto diz o que acontece com o histórico: lançamento não é apagado, ele passa para "Outros".

## 3. Integração

A camada do editor entra na pilha de navegação existente e fecha por botão, clique externo, Esc e voltar do aparelho. A tela nova entra no roteador (`categorias`), na tela "Tudo" e no atalho "Organizar categorias" do formulário de lançamento. O campo de teto continua confirmando no `focusout`, com o mesmo caminho de gravação de antes, e a sugestão de teto continua vindo da média dos três meses anteriores.

## Verificação

Testes de renderização cobrem as três lentes, a busca (com e sem resultado), o editor em modo criação, edição e exclusão, a recusa de aninhar uma categoria com filhas, e a ausência do editor antigo em Ajustes. Cada ação nova precisa ter `case` correspondente no manipulador de cliques. O painel continua sem `undefined`, `NaN` ou marcação desbalanceada nos quatro caminhos de desenho.
