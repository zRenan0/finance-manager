# M15: testes automatizados das ações críticas

## Objetivo

Fechar a principal lacuna registrada na baseline: os motores financeiros têm
testes de unidade, os handlers têm testes de integração e os navegadores cobrem
os fluxos completos, mas `js/actions.js`, que liga a interface às mutações, tem
apenas 0,9% de cobertura. O M15 deve provar o comportamento das ações críticas
sem alterar regras financeiras nem depender de produção.

## Abordagens consideradas

1. Testar apenas os motores puros. É rápido, mas repete o que a suíte já cobre e
   não alcança a fronteira que hoje está descoberta.
2. Acrescentar muitos fluxos Playwright. Exercita a tela real, porém deixa a suíte
   lenta e torna cada falha mais difícil de localizar.
3. Executar o aplicativo em um contexto VM com DOM controlado e disparar o mesmo
   `onClick` usado pelo navegador, mantendo uma seleção pequena de fluxos E2E.
   Esta é a abordagem escolhida porque cobre a orquestração real com testes
   determinísticos e preserva os testes de navegador onde eles são necessários.

## Escopo

Um novo teste comportamental carregará as fontes na mesma ordem do navegador e
disparará ações com elementos `data-action`. Ele cobrirá:

- criar, editar e excluir lançamento, inclusive lápide;
- criar transferência entre contas;
- criar cartão e registrar pagamento de fatura;
- criar, editar e excluir meta;
- definir orçamento de categoria;
- encaminhar login, logout e sincronização para seus serviços;
- encaminhar restauração de backup e importação para os fluxos existentes;
- manter o comportamento offline já verificado pelo teste PWA real.

Os testes existentes continuam responsáveis pelos cálculos financeiros, contrato
HTTP, banco simulado, criptografia, importação, sincronização e PWA. O M15 não
duplica essas provas; ele cobre a passagem entre clique e regra de domínio.

## Catracas de cobertura

O relatório continuará exigindo um piso global e passará a aceitar pisos por
arquivo. A medição correta do M15 fica protegida por 75% no total e 35% em
`js/actions.js`; a CI falhará se qualquer um cair. O valor mede caminhos críticos
executados, sem testes que procuram texto no fonte para inflar o relatório.

## Tratamento de falhas

O ambiente controlado registrará notificações, confirmações, persistência e chamadas
de serviço. Cada caso começará de uma base conhecida para não depender da ordem dos
testes. Operações destrutivas só serão aplicadas depois da confirmação, e as provas
verificarão tanto o estado resultante quanto as lápides ou entidades relacionadas.

## Compatibilidade e verificação

Não haverá mudança de schema, protocolo, IndexedDB, rotas ou formato de backup.
Se os novos testes revelarem defeito funcional, a correção entrará no mesmo módulo
com regressão específica; sem defeito demonstrado, somente testes, catracas e
documentação serão alterados.

O módulo termina com lint, suíte completa, cobertura, módulo gerado, release,
pacote de distribuição, Chromium, Firefox, WebKit, PWA e landing aprovados.
