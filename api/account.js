"use strict";

// `/api/account/*` na Vercel.
//
// A reescrita em `vercel.json` transforma `/api/account/login` em
// `/api/account?action=login`, que e exatamente o formato que o handler ja
// esperava quando a mesma rota era servida pela Netlify. Ver `api/_adaptar.js`.

const { adaptar } = require("./_adaptar");
const { handler } = require("../netlify/functions/account");

module.exports = adaptar(handler);
