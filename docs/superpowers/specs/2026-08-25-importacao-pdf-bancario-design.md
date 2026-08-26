# Importação local de faturas e extratos em PDF

Data: 25 de agosto de 2026

## Objetivo

Permitir que a tela de importação leia PDFs com texto selecionável de faturas de cartão e extratos bancários. O processamento continua inteiramente no navegador. O primeiro perfil reconhecido é o Santander, com um leitor estrutural de reserva para arquivos de outros bancos.

OCR não faz parte desta entrega. PDF composto apenas por imagem deve receber uma mensagem específica, sem tentativa de envio ou conversão externa.

## Decisões

### Leitura do PDF

O projeto usará `pdfjs-dist`, da Mozilla, como dependência de desenvolvimento. O build copiará apenas o módulo principal, o worker e as fontes padrão para `vendor/pdfjs/`. Esses arquivos serão publicados junto com o site e guardados pelo service worker.

O módulo será carregado dinamicamente apenas quando o arquivo selecionado for PDF. OFX e CSV não terão custo adicional de carregamento.

O arquivo será validado por tamanho, assinatura `%PDF-` e conteúdo extraído. Senhas serão aceitas em um campo temporário da tela. A senha e o arquivo ficarão apenas na memória e serão descartados ao concluir ou cancelar.

### Extração e estrutura

Cada página será lida como itens com texto e coordenadas. Itens próximos na mesma altura serão reunidos em linhas e ordenados da esquerda para a direita. Esse passo mantém a estrutura necessária para separar data, descrição, valor da transação e saldo.

O leitor terá duas camadas:

1. Perfil Santander, identificado por marcas textuais do banco e por cabeçalhos de fatura ou extrato.
2. Perfil estrutural, que reconhece linhas iniciadas por data e terminadas por um ou mais valores em formato brasileiro.

Em faturas, uma linha com data, descrição e um valor será tratada como compra. Valores negativos, estornos e créditos serão convertidos em lançamentos de natureza `estorno`. Pagamentos da própria fatura, saldo anterior, totais, limites e cabeçalhos continuarão fora da seleção inicial.

Em extratos bancários, quando a linha terminar com valor da movimentação e saldo, o leitor usará o penúltimo valor. Sinais, parênteses e marcadores `D` ou `C` determinarão saída e entrada.

Datas sem ano usarão o ano encontrado no período, vencimento ou emissão do documento. Se o período atravessar dezembro e janeiro, o mês será usado para ajustar o ano. Quando não houver ano confiável, a revisão mostrará o resultado, mas a importação será recusada até que uma data válida possa ser determinada pelo arquivo.

### Classificação do documento

O texto completo será usado para sugerir:

* banco reconhecido;
* fatura de cartão ou extrato bancário;
* quantidade de páginas;
* confiança da leitura;
* quantidade de linhas ignoradas.

A sugestão nunca escolhe silenciosamente um destino incompatível. A revisão sempre mostra o tipo do documento e o destino.

### Destino e gravação

Para fatura, a pessoa escolhe um cartão ativo. Compras serão gravadas com `creditCardId`, pagamento `Crédito`, origem `import-pdf` e sem `accountId`. Créditos da fatura usarão natureza `estorno` e o mesmo cartão.

Para extrato, a pessoa escolhe uma conta ativa. As transações terão `accountId`, origem `import-pdf` e nenhum cartão.

OFX e CSV também passarão a mostrar a conta de destino na revisão. Isso remove a escolha silenciosa da primeira conta cadastrada.

Duplicatas continuarão desmarcadas. A comparação incluirá tipo, valor e janela de três dias, como já ocorre hoje. As categorias serão sugeridas pelo motor existente.

### Interface

A área de envio aceitará `.ofx`, `.csv` e `.pdf`. O texto explicará que apenas PDF com texto selecionável funciona.

Após a leitura, a revisão exibirá:

* banco e tipo sugeridos;
* seletor entre fatura e extrato;
* seletor de cartão ou conta;
* páginas lidas e linhas ignoradas;
* lançamentos com seleção, categoria e sinal;
* avisos sobre pagamento de fatura, saldo anterior, baixa confiança e datas anteriores à abertura da conta.

PDF protegido mostrará o campo de senha na mesma tela. PDF sem texto selecionável mostrará instrução para exportar uma versão digital pelo banco.

### Build, cache e licença

Um script sincronizará os arquivos necessários de `node_modules/pdfjs-dist` para `vendor/pdfjs/`. A pasta gerada ficará fora do Git, mas será criada por `postinstall`, `build` e `build:dist`. O pacote de produção incluirá `vendor/`, e o service worker guardará seus três arquivos para leitura offline.

A licença Apache 2.0 do PDF.js será copiada junto com os arquivos publicados.

### Testes

Os testes cobrirão:

* agrupamento dos itens por posição;
* fatura Santander com compras, estorno, pagamento e saldo anterior;
* extrato com valor da movimentação e saldo;
* formato estrutural de outro banco;
* detecção de PDF sem texto;
* escolha de conta ou cartão na revisão;
* gravação correta de `accountId`, `creditCardId`, `nature`, `source` e `origin`;
* presença dos arquivos do PDF.js no pacote e no cache offline;
* regressão completa de OFX e CSV.

Fixtures serão sintéticas e não conterão dados bancários reais.
