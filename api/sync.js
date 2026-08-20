"use strict";

// `/api/sync/*` na Vercel. Ver `api/account.js` e `api/_adaptar.js`.

const { adaptar } = require("./_adaptar");
const { handler } = require("../netlify/functions/sync");

module.exports = adaptar(handler);
