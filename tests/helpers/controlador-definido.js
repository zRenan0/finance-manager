// controlador-definido.js — abre o portão do cadastro para os testes que não
// são sobre ele.
//
// [M42] `/api/account/register` recusa com 503 `legal_controller_pending`
// enquanto `LEGAL_CONTROLLER` tiver marcador (ver o cabeçalho de
// `netlify/functions/_shared/legal-controller.js`). Isso é o comportamento
// correto e é o que `tests/test-legal-privacy-errors.js` verifica.
//
// Só que quatro suítes usam a rota de cadastro para testar OUTRA coisa: as
// regras de senha nova, a consulta ao HaveIBeenPwned, o link de confirmação e o
// retorno do callback. Para elas o portão é cenário, não objeto: precisam de uma
// instalação com o controlador já publicado, que é o estado em que o cadastro
// existe.
//
// `comControladorDefinido()` preenche a cópia do servidor em memória e devolve a
// função que restaura. Preencher em memória, e não no arquivo, é o que mantém a
// suíte honesta: o estado real do repositório continua sendo "pendente", e
// `test-legal-privacy-errors.js` continua vendo o portão fechado.
"use strict";

const path = require("path");
const gate = require(path.join(__dirname, "..", "..", "netlify", "functions", "_shared", "legal-controller.js"));

const VALORES = {
  name: "Instalação de teste",
  document: "00.000.000/0001-00",
  address: "Rua de Teste, 1",
  supportEmail: "suporte@cofre.test",
  dpoName: "Encarregado de Teste",
  dpoEmail: "encarregado@cofre.test",
  incidentEmail: "incidentes@cofre.test",
};

function comControladorDefinido() {
  const original = { ...gate.LEGAL_CONTROLLER };
  Object.keys(VALORES).forEach((campo) => { gate.LEGAL_CONTROLLER[campo] = VALORES[campo]; });
  return function restaurar() {
    Object.keys(original).forEach((campo) => { gate.LEGAL_CONTROLLER[campo] = original[campo]; });
  };
}

module.exports = { comControladorDefinido };
