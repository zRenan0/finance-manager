# Arquitetura do aplicativo

O aplicativo continua sem framework e o resultado publicado permanece estático. Os arquivos de origem são reunidos em uma entrada ES nativa antes da publicação.

## Camadas

- `js/modules`: serviços de interface isolados, bootstrap e módulo gerado para o navegador.
- `js/screens`: funções de apresentação das telas atuais.
- arquivos de domínio na raiz de `js`: cálculos financeiros e normalização de dados.
- `js/cloud-sync.js`: ciclo de sincronização com o servidor.
- `js/actions.js`: ações delegadas das telas.
- `js/app.js`: composição e ciclo de renderização.

## Armazenamento e sincronização

O IndexedDB é a fonte da interface, sempre. `js/cloud-sync.js` é um segundo destino: envia a fila persistente de operações, recebe mudanças posteriores ao cursor e as aplica no banco local em segundo plano. Trocar o adapter da interface pelo da nuvem faria toda leitura passar pela rede e o aplicativo deixaria de funcionar offline, que é a característica que o define. Ver `docs/SYNC_PROTOCOL.md`.

O formato lógico dos dados está na versão 22 e a estrutura física do IndexedDB
está na versão 4. Essas versões têm finalidades diferentes e não precisam subir
juntas. O inventário de bancos, object stores, chaves de Web Storage, caches,
cookies, exclusão e saídas do aparelho está em
`docs/ARMAZENAMENTO-E-PRIVACIDADE.md`.

O bootstrap expõe somente a fachada congelada `window.CofreUI`. O domínio inteiro roda dentro do escopo do módulo gerado e não cria funções globais. Funções financeiras não devem depender de DOM nem dessa fachada.

## Construção e estilos calculados

`npm run build` gera `js/modules/app.generated.js` na ordem registrada em `scripts/build-app-module.js`. `npm run check:build` impede a publicação de um artefato desatualizado.

Os modelos não usam atributos `style`. Quando uma medida ou cor depende dos dados, o modelo fornece `data-ui-css`; o serviço modular valida a declaração, cria uma classe estável na folha externa `css/dynamic.css` e remove o atributo temporário antes da pintura.
