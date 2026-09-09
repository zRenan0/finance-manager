// netlify/functions/_shared/legal-controller.js
// ------------------------------------------------------------------------------
// [M42] QUEM RESPONDE PELOS DADOS, DO LADO DO SERVIDOR.
//
// O aplicativo já sabia que a identificação do controlador estava em branco: a
// tela Privacidade escreve "Ainda não definido" em cada campo e conclui, com
// todas as letras, que "esta instalação é versão local em desenvolvimento e não
// deve ser oferecida ao público". `npm run check:release` também avisava.
//
// Só que nada disso ERA APLICADO. O site respondia 200 para qualquer visitante,
// `/api/account/session` respondia `configured: true`, e o cadastro aceitava
// email, senha e, na sequência, a base financeira inteira da pessoa. Ou seja: o
// app anunciava que não podia ser oferecido ao público e se oferecia ao público
// assim mesmo. Aviso que não tranca nada é decoração.
//
// A LGPD não pede um aviso na tela; pede um controlador identificado (art. 9, I),
// um canal para o titular exercer os direitos do art. 18 no prazo do art. 19, um
// encarregado nomeado e publicado (art. 41) e um canal de incidente (art. 48).
// Enquanto esses campos forem marcador, o que não pode existir é a COLETA, e a
// coleta começa no cadastro.
//
// Por isso o portão mora aqui, no servidor, e não só na interface: recusar no
// navegador para uma tela que qualquer `curl` contorna não recusa nada.
//
// ------------------------------------------------------------------------------
// POR QUE ESTE ARQUIVO É UMA CÓPIA
// ------------------------------------------------------------------------------
// O original é `LEGAL_CONTROLLER`, em `js/storage.js`, que é código de
// NAVEGADOR: as funções deste diretório não o carregam, e ele não está no
// rastreamento de arquivos da função publicada. Ler o arquivo em disco daria um
// portão que funciona no teste e falha na publicação, que é o pior resultado
// possível para um portão.
//
// Então a cópia é explícita, no mesmo padrão já usado por
// `_shared/ai-boundaries.js`: `tests/test-legal-privacy-errors.js` compara os
// dois lados campo a campo e REPROVA se eles divergirem. Preencher um lado só
// não passa na suíte.
"use strict";

// Igual a `LEGAL_PENDING` em js/storage.js.
const LEGAL_PENDING = "[definir antes da oferta ao público]";

// Igual a `LEGAL_CONTROLLER` em js/storage.js, sem `responseDays` (que é prazo
// legal, não identificação, e já nasce preenchido).
const LEGAL_CONTROLLER = {
  name: LEGAL_PENDING,
  document: LEGAL_PENDING,
  address: LEGAL_PENDING,
  supportEmail: LEGAL_PENDING,
  dpoName: LEGAL_PENDING,
  dpoEmail: LEGAL_PENDING,
  incidentEmail: LEGAL_PENDING,
};

// Igual a `LEGAL_CONTROLLER_FIELDS` em js/storage.js.
const LEGAL_CONTROLLER_FIELDS = {
  name: "nome empresarial ou responsável",
  document: "CPF ou CNPJ",
  address: "endereço",
  supportEmail: "canal de atendimento",
  dpoName: "encarregado pelos dados",
  dpoEmail: "contato do encarregado",
  incidentEmail: "canal de comunicação de incidentes",
};

function legalControllerGaps() {
  return Object.keys(LEGAL_CONTROLLER_FIELDS).filter((campo) => {
    const valor = String(LEGAL_CONTROLLER[campo] == null ? "" : LEGAL_CONTROLLER[campo]).trim();
    return valor === "" || valor === LEGAL_PENDING;
  });
}

function legalControllerReady() {
  return legalControllerGaps().length === 0;
}

// O ERRO É EXPLICADO, e não genérico, porque quem o recebe é o dono do site.
//
// `exposeMessage` deixa a frase atravessar `safeFailure` (ver _shared/http.js).
// Não há segredo nenhum aqui: a mesma informação já está na tela Privacidade,
// pública, e sem a frase inteira o dono do app veria "não foi possível concluir
// a operação" e iria procurar o problema no Supabase.
function legalControllerError() {
  const faltando = legalControllerGaps().map((campo) => LEGAL_CONTROLLER_FIELDS[campo]);
  return Object.assign(new Error(
    "O cadastro de novas contas está fechado enquanto a identificação do controlador "
    + `de dados não estiver publicada. Falta definir: ${faltando.join(", ")}. `
    + "Ver docs/LEGAL-LAUNCH.md. O aplicativo continua funcionando sem conta, com os dados no próprio aparelho."
  ), { statusCode: 503, code: "legal_controller_pending", exposeMessage: true });
}

// Portão de uma linha para as rotas que INICIAM uma coleta nova.
function assertLegalControllerReady() {
  if (!legalControllerReady()) throw legalControllerError();
}

module.exports = {
  LEGAL_PENDING,
  LEGAL_CONTROLLER,
  LEGAL_CONTROLLER_FIELDS,
  legalControllerGaps,
  legalControllerReady,
  assertLegalControllerReady,
};
