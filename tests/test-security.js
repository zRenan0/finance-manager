// test-security.js: política de conteúdo, boot seguro e origem da função de IA
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
let pass = 0;
let fail = 0;

function check(name, condition, extra) {
  if (condition) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra == null ? "" : ` -> ${extra}`}`); }
}

async function main() {
  console.log("\n1. Política de conteúdo efetiva");
  // A política de conteúdo mora em `vercel.json`, dentro do bloco de
  // cabeçalhos. Ler o JSON em vez de casar texto solto tem uma vantagem
  // concreta: um cabeçalho renomeado ou movido de bloco continua sendo
  // encontrado, e um arquivo inválido reprova aqui em vez de passar por
  // "política ausente".
  const vercel = JSON.parse(read("vercel.json"));
  const cabecalhos = (vercel.headers || []).reduce((todos, regra) => todos.concat(regra.headers || []), []);
  const cabecalho = (nome) => (cabecalhos.find((h) => h.key === nome) || {}).value || "";
  const index = read("index.html");
  const worker = read("service-worker.js");
  const csp = cabecalho("Content-Security-Policy");

  check("CSP saiu do modo de relatório", csp.length > 0 && !cabecalho("Content-Security-Policy-Report-Only"));
  check("scripts só podem vir do próprio site", /script-src 'self';/.test(csp));
  check("scripts inline não são permitidos", !/script-src[^;]*'unsafe-inline'/.test(csp));
  check("atributos de evento estão bloqueados", /script-src-attr 'none'/.test(csp));
  check("estilos inline não são permitidos", !/style-src[^;]*'unsafe-inline'/.test(csp) && /style-src-attr 'none'/.test(csp));

  // ONDE UM SCRIPT INJETADO PODERIA MANDAR OS DADOS.
  //
  // A política dizia `connect-src 'self' https:`, que é a rede inteira. As
  // outras diretivas tornam a injeção difícil; esta decidia o que aconteceria
  // se ela ocorresse mesmo assim, e a resposta era "o extrato sai para
  // qualquer lugar". A única saída legítima para fora do site é a consulta da
  // NFC-e (js/qrcode.js), que já valida host por conta própria; aqui o mesmo
  // limite é repetido onde o navegador consegue impor.
  const connectSrc = (csp.split(";").map((parte) => parte.trim()).find((parte) => parte.startsWith("connect-src ")) || "");
  check("existe uma diretiva de conexão", connectSrc.length > 0, csp);
  check("saída de dados não é qualquer HTTPS", !/\bhttps:(\s|$)/.test(connectSrc), connectSrc);
  check("a única saída externa é a consulta fiscal", /https:\/\/\*\.gov\.br/.test(connectSrc), connectSrc);

  // Sem HSTS, a primeira visita digitada sem esquema trafega em texto claro e
  // um downgrade continua possível depois. É o cabeçalho que a plataforma
  // costuma pôr sozinha — e é exatamente por isso que ninguém repara quando
  // ela deixa de pôr.
  const hsts = cabecalho("Strict-Transport-Security");
  const maxAge = Number((hsts.match(/max-age=(\d+)/) || [])[1] || 0);
  check("HTTPS fica obrigatório depois da primeira visita", maxAge >= 15552000, hsts || "ausente");

  const inlineScripts = [...index.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/\bsrc\s*=/.test(match[1]) && match[2].trim());
  check("index não contém script inline", inlineScripts.length === 0, inlineScripts.length);
  check("index não contém manipulador inline", !/\son[a-z]+\s*=/i.test(index));
  check("tema inicial vem de arquivo próprio", /<script src="js\/boot\.js"><\/script>/.test(index));
  check("boot entra no cache offline", worker.includes('"js/boot.js"'));

  console.log("\n2. Boot do tema");
  let applied = null;
  const darkContext = {
    localStorage: { getItem() { return "dark"; } },
    window: { matchMedia() { return { matches: false }; } },
    document: { documentElement: { setAttribute(name, value) { if (name === "data-theme") applied = value; } } },
  };
  vm.runInNewContext(read("js/boot.js"), darkContext, { filename: "js/boot.js" });
  check("preferência gravada é aplicada antes da tela", applied === "dark", applied);

  applied = null;
  const deniedContext = {
    localStorage: { getItem() { throw new Error("blocked"); } },
    window: {},
    document: { documentElement: { setAttribute(name, value) { if (name === "data-theme") applied = value; } } },
  };
  vm.runInNewContext(read("js/boot.js"), deniedContext, { filename: "js/boot.js" });
  check("falha no armazenamento cai para tema claro", applied === "light", applied);

  console.log("\n3. Origem da função de IA");
  const oldAllowed = process.env.ALLOWED_ORIGIN;
  delete process.env.ALLOWED_ORIGIN;
  const functionPath = require.resolve(path.join(ROOT, "netlify/functions/analyze.js"));
  delete require.cache[functionPath];
  const { handler } = require(functionPath);
  const event = (origin) => ({
    httpMethod: "OPTIONS",
    headers: { ...(origin ? { origin } : {}), host: "financas.example", "x-forwarded-proto": "https" },
    body: "",
  });
  const same = await handler(event("https://financas.example"));
  const foreign = await handler(event("https://malicioso.example"));
  const missing = await handler(event(null));
  check("mesma origem é aceita sem variável", same.statusCode === 204, same.statusCode);
  check("origem diferente é recusada", foreign.statusCode === 403, foreign.statusCode);
  check("requisição sem Origin é recusada", missing.statusCode === 403, missing.statusCode);
  check("resposta permitida não usa curinga", same.headers["Access-Control-Allow-Origin"] === "https://financas.example", same.headers["Access-Control-Allow-Origin"]);
  if (oldAllowed == null) delete process.env.ALLOWED_ORIGIN;
  else process.env.ALLOWED_ORIGIN = oldAllowed;
  delete require.cache[functionPath];

  console.log("\n4. Sessão obrigatória na função de IA");
  // `Origin` só é inforjável dentro de um navegador; via curl é um cabeçalho
  // como outro qualquer. Como esta função guarda uma chave paga, a sessão é a
  // camada que realmente fecha o endpoint.
  const analyzeSource = read("netlify/functions/analyze.js");
  check("a função exige sessão como o sync", /requireSession/.test(analyzeSource));
  check("o teto de requisições deixou de ser por IP", /identity:\s*session\.user\.id/.test(analyzeSource));

  // O limite precisa sobreviver ao cold start e valer entre instâncias. Um
  // `Map` local zerava a cada reciclagem da função e era contado em separado
  // por instância, então o teto real era o configurado vezes o número de
  // instâncias ativas.
  const rateSource = read("netlify/functions/_shared/rate-limit.js");
  const accountSource = read("netlify/functions/account.js");
  const rateMigration = read("supabase/migrations/202608180002_rate_limit.sql");
  check("o limite é persistido no banco", /rpc\/cofre_rate_hit/.test(rateSource));
  check("a contagem é serializada por identidade", /for update/.test(rateMigration));
  check("a tabela de limite não é legível pelo usuário", /revoke all on public\.cofre_rate_limit from anon, authenticated/.test(rateMigration));
  check("a identidade não é gravada em claro", /createHmac\("sha256"/.test(rateSource) && /identity_hash text not null check/.test(rateMigration));
  check("o limitador em memória saiu da função de conta", !/const attempts = new Map\(\)/.test(accountSource));
  check("a conta usa o limitador compartilhado", /rateLimit\.enforce\(event, \{ bucket: "conta"/.test(accountSource));
  check("banco fora do ar não abre a porta", /localFallback/.test(rateSource));
  check("não sobrou contagem por endereço de rede", !/function clientIp/.test(analyzeSource));

  const postar = (extra) => ({
    httpMethod: "POST",
    headers: {
      origin: "https://financas.example", host: "financas.example", "x-forwarded-proto": "https",
      "x-device-id": "dispositivo-de-teste-0001", ...(extra || {}),
    },
    body: JSON.stringify({ rendaMensal: 5000, categorias: [{ nome: "Mercado", gasto: 800 }] }),
  });

  const chaveAntiga = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "chave-que-nao-pode-ser-usada";

  // Sem backend de contas: falha FECHADA. Um endpoint pago sem forma de saber
  // quem chama é um endpoint aberto, então recusar é a única resposta correta.
  ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"].forEach((k) => delete process.env[k]);
  delete require.cache[functionPath];
  const semBackend = await require(functionPath).handler(postar());
  check("sem backend de contas a função recusa", semBackend.statusCode === 503, semBackend.statusCode);
  check("o motivo da recusa é explicado", JSON.parse(semBackend.body).code === "ACCOUNT_UNAVAILABLE", semBackend.body);

  // Com backend configurado e sem cookie de sessão: 401 antes de qualquer rede.
  process.env.SUPABASE_URL = "https://projeto.supabase.co";
  process.env.SUPABASE_ANON_KEY = "chave-publica-de-teste";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-servico-de-teste";
  delete require.cache[functionPath];
  const semSessao = await require(functionPath).handler(postar());
  check("sem sessão a análise é recusada", semSessao.statusCode === 401, semSessao.statusCode);
  check("o cliente recebe um código que sabe tratar", JSON.parse(semSessao.body).code === "AUTH_REQUIRED", semSessao.body);
  check("a recusa mantém a origem permitida na resposta",
    semSessao.headers["Access-Control-Allow-Origin"] === "https://financas.example", semSessao.headers["Access-Control-Allow-Origin"]);
  check("o cliente sabe traduzir o código", /AUTH_REQUIRED/.test(read("js/insights.js")));
  check("o cliente envia a sessão junto", /credentials: "include"/.test(read("js/insights.js")));

  ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"].forEach((k) => delete process.env[k]);
  if (chaveAntiga == null) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = chaveAntiga;
  delete require.cache[functionPath];

  console.log("\n5. A origem do link de email não vem do cabeçalho da requisição");
  // O endereço montado aqui sai dentro de um email assinado por nós. Tirá-lo de
  // `Host`/`X-Forwarded-Host` permitia que um `curl` pedisse ao provedor um
  // email verdadeiro, com a nossa marca, apontando para o domínio de quem pediu.
  const { canonicalOrigin } = require(path.join(ROOT, "netlify/functions/_shared/http.js"));
  const evento = (headers) => ({ headers });
  const origemSalva = process.env.ALLOWED_ORIGIN;

  delete process.env.ALLOWED_ORIGIN;
  check("sem configuração, a própria origem continua valendo",
    canonicalOrigin(evento({ host: "financas.example", "x-forwarded-proto": "https" })) === "https://financas.example",
    canonicalOrigin(evento({ host: "financas.example", "x-forwarded-proto": "https" })));

  process.env.ALLOWED_ORIGIN = "https://financas.example,https://previa.financas.example";
  const forjado = canonicalOrigin(evento({ "x-forwarded-host": "dominio-falso.example", "x-forwarded-proto": "https" }));
  check("host forjado cai para a origem canônica", forjado === "https://financas.example", forjado);
  const previa = canonicalOrigin(evento({ host: "previa.financas.example", "x-forwarded-proto": "https" }));
  check("pré-visualização configurada continua servindo a si mesma", previa === "https://previa.financas.example", previa);
  check("o link de email usa a origem canônica, não a do cabeçalho",
    /canonicalOrigin\(event\)/.test(accountSource) && !/siteOrigin\(event\)/.test(accountSource));

  if (origemSalva == null) delete process.env.ALLOWED_ORIGIN;
  else process.env.ALLOWED_ORIGIN = origemSalva;

  console.log("\n6. A contagem de tentativas não é endereçável por quem tenta");
  // `x-forwarded-for` é uma lista que os proxies completam. A ponta esquerda é
  // o que o CLIENTE alegou; lê-la deixava o atacante escolher a própria chave
  // de contagem e tornava o teto de senha decorativo.
  const { clientIp } = require(path.join(ROOT, "netlify/functions/_shared/rate-limit.js"));
  const daPlataforma = clientIp(evento({ "x-vercel-forwarded-for": "203.0.113.9", "x-forwarded-for": "1.2.3.4" }));
  check("o cabeçalho da plataforma vence a lista encaminhada", daPlataforma === "203.0.113.9", daPlataforma);
  const daLista = clientIp(evento({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }));
  check("a lista encaminhada é lida pela ponta direita", daLista === "203.0.113.9", daLista);
  const semNada = clientIp(evento({}));
  check("sem endereço nenhum a contagem ainda acontece", semNada === "desconhecido", semNada);

  // Teto por endereço não protege conta nenhuma contra ataque distribuído: o
  // alvo é o email, e é por ele que precisa contar.
  check("a força bruta também é contada por conta", /bucket: "conta-email"/.test(accountSource));
  check("o teto por conta é cobrado antes de falar com o provedor",
    /await limitarPorEmail\(event, email\);\s*\n\s*const result = await api\.auth\.signIn/.test(accountSource));
  // O endereço chega ao balde já normalizado por `emailOf`. Sem isso,
  // "Fulano@X.com" e "fulano@x.com" contariam separado e o teto cairia só
  // trocando a caixa das letras.
  check("o email entra no balde já normalizado",
    /const email = emailOf\(body\.email\);\s*(\n\s*\/\/[^\n]*)*\s*\n\s*await limitarPorEmail\(event, email\)/.test(accountSource));

  console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} - ${pass} ok, ${fail} falha(s)\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
