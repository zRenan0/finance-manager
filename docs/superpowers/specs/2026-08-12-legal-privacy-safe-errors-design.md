# Revisão financeira, privacidade e diagnóstico seguro

## Escopo aprovado

Este documento cobre os itens 7, 8 e 10 da lista priorizada: revisão jurídica e financeira, controles de privacidade e LGPD e registro seguro de erros. A implementação preserva o funcionamento local, não cria conta remota e não envia diagnóstico automaticamente.

## Decisões de produto

### 1. Orientações e simuladores

Os cálculos continuam educativos. Nenhum resultado será apresentado como recomendação individual, promessa, proposta bancária, cotação atual ou confirmação de direito previdenciário. Cada simulador exibirá limites compatíveis com o assunto e acesso às fontes oficiais usadas na metodologia.

Crédito será comparado pelo CET quando o usuário o informar. A interface explicará que a estimativa interna pode divergir da proposta porque tarifas, seguros, tributos, datas e regras contratuais mudam o fluxo real. Aposentadoria continuará sendo planejamento patrimonial, sem estimar concessão ou valor de benefício do INSS.

Textos categóricos como "melhor", "sempre" e "saída padrão" serão trocados por comparações condicionais. Investimentos mostrarão que rentabilidade, tributação, liquidez, risco e proteção podem mudar e precisam ser conferidos antes da decisão.

### 2. Privacidade e termos

Será criada uma tela única de Privacidade, termos e fontes, acessível por Ajustes e Tudo. Ela explicará:

- quais dados são guardados e para qual finalidade;
- que o armazenamento atual é local no navegador;
- quais recursos usam rede;
- como exportar e apagar os dados;
- por quanto tempo dados e diagnósticos permanecem;
- limites financeiros e jurídicos do aplicativo;
- fontes oficiais e data da revisão.

O estado persistente terá uma versão dos textos aceitos, data de aceite e preferência de IA. O padrão para IA será perguntar antes de cada envio. O usuário poderá bloquear totalmente esse envio, e reativá-lo depois. Não haverá autorização permanente silenciosa.

O texto atual "dados anônimos" será removido. Nomes de categorias e metas podem revelar contexto pessoal, portanto serão descritos como dados agregados selecionados. A confirmação mostrará um resumo exato do pacote antes do envio.

No primeiro uso, a etapa final exigirá aceite dos termos e da política. Usuários existentes não serão bloqueados pela atualização, mas verão o estado pendente na tela de privacidade. A exclusão será uma ação destrutiva explícita, com confirmação digitada, e apagará dados financeiros, preferências, espelhos, recuperação local e diagnósticos.

### 3. Registro seguro de erros

Será criado um registro exclusivamente local, limitado e separado dos dados financeiros. Cada item terá apenas data, área funcional, código conhecido, versão do app, versão do schema e estado de conexão. Mensagem, pilha, descrição, valor, conta, categoria, meta, conteúdo importado, URL fiscal, chave e identificador não serão armazenados.

O registro terá retenção máxima de 30 dias e limite de 50 ocorrências. A tela de privacidade permitirá ver contagens, exportar um diagnóstico resumido e apagar o histórico. Nada será enviado automaticamente.

Falhas de inicialização, persistência, importação, sincronização, IA, QR e eventos globais serão registradas por código controlado. A mensagem técnica original continuará disponível apenas no console de desenvolvimento quando necessário, sem entrar no diagnóstico persistente.

## Alternativas descartadas

Uma política apenas textual foi descartada porque não entregaria bloqueio de IA, exclusão real nem retenção de diagnóstico. Consentimento permanente para IA foi descartado porque impediria o usuário de revisar cada pacote. Registro de `error.message` e `stack` foi descartado porque esses campos podem carregar dados pessoais ou financeiros.

## Migração e compatibilidade

O schema passa da versão 21 para 22 com o objeto `privacy`. Bases antigas recebem a preferência `ask`, sem aceite presumido. Backups continuam compatíveis e passam a incluir apenas o estado de consentimento necessário. O diagnóstico permanece fora do backup financeiro.

## Validação

Os testes devem provar que a migração preserva bases antigas, a IA respeita o bloqueio, a exclusão limpa todos os depósitos locais, o diagnóstico não contém segredos inseridos em exceções, a retenção funciona e todas as novas telas e ações renderizam no navegador.
