"use strict";

// `/api/analyze` na Vercel.
//
// Esta e a unica das tres que mudou de endereco: o aplicativo chamava
// `/.netlify/functions/analyze` direto, com o nome da plataforma cravado no
// codigo do cliente (ver js/insights.js). Agora ela mora sob `/api/` como as
// outras duas, e nao ha mais nome de plataforma em lugar nenhum do cliente.

const { adaptar } = require("./_adaptar");
const { handler } = require("../netlify/functions/analyze");

module.exports = adaptar(handler);
