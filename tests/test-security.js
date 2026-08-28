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
  // A etiqueta `theme-color` pinta a barra de status do app instalado e é escrita
  // por js/boot.js antes da primeira pintura. Sem ela no documento de mentira o
  // arquivo nem chegava a aplicar o tema.
  const etiquetaDeTema = { content: null, setAttribute(nome, valor) { if (nome === "content") this.content = valor; } };
  let applied = null;
  const darkContext = {
    localStorage: { getItem() { return "dark"; } },
    window: { matchMedia() { return { matches: false }; } },
    document: {
      documentElement: { setAttribute(name, value) { if (name === "data-theme") applied = value; } },
      querySelector() { return etiquetaDeTema; },
    },
  };
  vm.runInNewContext(read("js/boot.js"), darkContext, { filename: "js/boot.js" });
  check("preferência gravada é aplicada antes da tela", applied === "dark", applied);

  applied = null;
  const deniedContext = {
    localStorage: { getItem() { throw new Error("blocked"); } },
    window: {},
    document: {
      documentElement: { setAttribute(name, value) { if (name === "data-theme") applied = value; } },
      querySelector() { return etiquetaDeTema; },
    },
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
  check("preflight permite identificar conta e dispositivo",
    ["X-Account-Id", "X-Device-Id", "X-Device-Label", "X-Device-Type"]
      .every((header) => same.headers["Access-Control-Allow-Headers"].includes(header)),
    same.headers["Access-Control-Allow-Headers"]);
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
      "x-device-id": "dispositivo-de-teste-0001",
      "x-account-id": "00000000-0000-4000-8000-000000000001", ...(extra || {}),
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

  console.log("\n7. Nenhuma função SECURITY DEFINER fica executável por anon ou authenticated");
  // O esquema `public` é publicado pelo PostgREST. Uma função `security definer`
  // com EXECUTE para `anon` ou `authenticated` é, na prática, uma rota de
  // internet rodando com o privilégio do dono. O projeto já segue a regra em
  // todas as `cofre_*`; este bloco impede que a próxima função esqueça dela.
  //
  // O que o Advisor do Supabase encontrou em produção (`public.rls_auto_enable`)
  // não estava em migração nenhuma. Este teste não alcança o que não está
  // versionado; ele garante que o repositório nunca seja a origem do problema.
  const migrationsDir = path.join(ROOT, "supabase/migrations");
  const migrations = fs.readdirSync(migrationsDir).filter((n) => n.endsWith(".sql")).sort();
  check("há migrações para auditar", migrations.length > 0, migrations.length);

  const sqlBruto = migrations.map((n) => read(`supabase/migrations/${n}`)).join("\n");
  // Os corpos entre `$$` contêm `;` e palavras que confundem a leitura do
  // cabeçalho. Removidos, sobra exatamente a parte declarativa, que é a que
  // carrega `security definer`, `revoke` e `grant`.
  // Os comentarios saem depois: esta migracao documenta no cabecalho como
  // desfazer o revoke, e a frase de exemplo nao pode ser lida como concessao.
  const sql = sqlBruto.replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, " CORPO ").replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").toLowerCase();

  const concessoesIndevidas = (sql.match(/grant\s+execute\s+on\s+function\s+[^;]*?\s+to\s+[^;]*/g) || [])
    .filter((trecho) => /\b(anon|authenticated|public)\b/.test(trecho.split(" to ").pop()));
  check("nenhum grant execute para anon, authenticated ou public",
    concessoesIndevidas.length === 0, concessoesIndevidas.join(" || "));

  const declaradas = [];
  const declaracao = /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(([^)]*)\)(.*?)\bas\s+corpo/g;
  let achado;
  while ((achado = declaracao.exec(sql)) !== null) {
    if (/security\s+definer/.test(achado[3])) declaradas.push(achado[1]);
  }
  check("a auditoria encontrou as funções security definer do projeto",
    declaradas.length >= 7, declaradas.join(", "));

  const semRevoke = [...new Set(declaradas)].filter((nome) => {
    const revokes = sql.match(new RegExp(`revoke\\s+[^;]*?on\\s+function\\s+public\\.${nome}\\s*\\([^)]*\\)\\s*from\\s+[^;]*`, "g")) || [];
    return !revokes.some((r) => {
      const papeis = r.split(" from ").pop();
      return /\bpublic\b/.test(papeis) && /\banon\b/.test(papeis) && /\bauthenticated\b/.test(papeis);
    });
  });
  check("toda security definer revoga de public, anon e authenticated",
    semRevoke.length === 0, semRevoke.join(", "));

  console.log("\n8. A correção de rls_auto_enable é mínima e reversível");
  const correcao = migrations.filter((n) => /rls_auto_enable_least_privilege/.test(n));
  check("a migração de menor privilégio existe", correcao.length === 1, correcao.join(", "));
  if (correcao.length === 1) {
    const texto = read(`supabase/migrations/${correcao[0]}`);
    const executavel = texto.replace(/^\s*--.*$/gm, "").toLowerCase();
    check("ela revoga o privilégio de public", /revoke all on function %s from public/.test(executavel));
    check("ela revoga também de anon e authenticated",
      /'anon',\s*'authenticated'/.test(executavel) && /revoke all on function %s from %i/.test(executavel));
    // Menor privilégio não é remoção. A função pode sustentar um gatilho de
    // evento que liga RLS sozinho; apagá-la trocaria um risco por outro maior.
    check("ela não remove a função", !/\bdrop\s+function\b/.test(executavel));
    // O corpo não está versionado. Mexer no `search_path` sem ele podia quebrar
    // a função justamente na parte que ninguém consegue revisar.
    check("ela não altera a função às cegas", !/\balter\s+function\b/.test(executavel));
    check("ela tolera o banco que nunca teve a função", /atingidas = 0/.test(executavel));
  }

  check("o script de verificação acompanha a migração",
    fs.existsSync(path.join(ROOT, "supabase/tests/verify_rls_auto_enable.sql")));

  // `\echo`, `\d` e afins são comandos do psql, não SQL. O SQL Editor do
  // Supabase manda o texto direto ao servidor e falha com erro de sintaxe na
  // primeira barra invertida — foi o que aconteceu na primeira versão deste
  // script de verificação. Todo SQL do projeto precisa rodar nos dois lugares.
  const arquivosSql = ["supabase/tests", "supabase/migrations"].reduce((lista, dir) => {
    fs.readdirSync(path.join(ROOT, dir))
      .filter((nome) => nome.endsWith(".sql"))
      .forEach((nome) => lista.push(`${dir}/${nome}`));
    return lista;
  }, []);
  const comMetaComando = arquivosSql.filter((arq) => /^[ \t]*\\[a-z]/m.test(read(arq)));
  check("nenhum SQL depende de comando do psql",
    comMetaComando.length === 0, comMetaComando.join(", "));

  console.log("\n9. rls_auto_enable está versionada e nasce sem privilégio público");
  // A função foi capturada do banco em 2026-08-28 (`pg_get_functiondef`) e entrou
  // no repositório. Antes disso ela só existia em produção, e um `supabase db
  // reset` produzia um ambiente diferente do real.
  const versionadas = migrations.filter((n) => /rls_auto_enable_versionada/.test(n));
  check("a migração que versiona a função existe", versionadas.length === 1, versionadas.join(", "));
  if (versionadas.length === 1) {
    const fonte = read(`supabase/migrations/${versionadas[0]}`);
    const corpo = fonte.replace(/^\s*--.*$/gm, "");
    check("ela declara a função de event trigger",
      /create or replace function public\.rls_auto_enable\(\)/.test(corpo)
      && /returns event_trigger/.test(corpo));
    // O corpo é a defesa: liga RLS em toda tabela nova de `public`. Se esta
    // asserção cair, alguém esvaziou a função sem perceber.
    check("o corpo continua ligando RLS na tabela recém-criada",
      /pg_event_trigger_ddl_commands\(\)/.test(corpo)
      && /enable row level security/.test(corpo));
    // `pg_temp` não listado é pesquisado ANTES de `pg_catalog` para nomes de
    // relação e de tipo. Listá-lo por último fecha o sombreamento por tabela
    // temporária.
    check("o search_path fixa pg_temp por último",
      /set search_path to 'pg_catalog', 'pg_temp'/.test(corpo));
    // A armadilha da ordem: `create or replace` preserva a ACL de função que já
    // existe, mas num banco novo a função nasce com EXECUTE para PUBLIC. Sem o
    // revoke NESTA migração, o `db reset` reintroduziria o achado do Advisor.
    const posCreate = corpo.indexOf("create or replace function public.rls_auto_enable");
    const posRevoke = corpo.indexOf("revoke all on function public.rls_auto_enable()");
    check("o revoke vem depois do create, na mesma migração",
      posCreate >= 0 && posRevoke > posCreate, `create=${posCreate} revoke=${posRevoke}`);
    check("o revoke cobre public, anon e authenticated",
      /revoke all on function public\.rls_auto_enable\(\) from public, anon, authenticated;/.test(corpo));
    // Nada chama esta função: o disparo é do servidor, dentro do evento, e não
    // consulta a ACL. Um grant aqui seria privilégio sem consumidor.
    check("nenhum papel recebe execute de volta",
      !/grant\s+execute\s+on\s+function\s+public\.rls_auto_enable/i.test(corpo));
  }


  console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} - ${pass} ok, ${fail} falha(s)\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
