"use strict";

// test-account-callback.js; o link do email precisa cair no APLICATIVO.
//
// O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR
//
// O servidor monta o endereço de retorno dos emails de cadastro e de
// recuperação de senha. Enquanto a raiz do domínio servia o aplicativo,
// apontar para `${origem}/?auth_callback=signup` funcionava. Depois que a
// raiz passou a servir a página comercial (reescritas em `vercel.json`), o
// mesmo endereço passou a entregar quem clicou no link em cima do folheto.
//
// A página comercial não carrega `bootstrapAccount()`, que é quem lê o
// parâmetro `code` e o troca por uma sessão: essa função mora em `js/auth.js`,
// dentro do pacote que só o `index.html` carrega. O resultado era silencioso e
// total: o código expirava sem ser usado, o cadastro nunca confirmava e a
// recuperação de senha nunca abria o formulário de nova senha. Nenhum erro em
// lugar nenhum, porque, do ponto de vista do servidor, o email foi enviado.
//
// COMO ESTE ARQUIVO MEDE
//
// Não por casamento de texto no código-fonte. O handler de `account` é
// EXECUTADO com o Supabase substituído por um espião, e o que se afirma é o
// endereço que ele realmente mandou para o Supabase. Se alguém devolver a
// raiz, a seção 1 reprova.
//
// A rede de segurança (a landing reencaminhando os links JÁ ENVIADOS) também
// é executada, num contexto de `vm` com `location` e `document` de mentira,
// pelo mesmo motivo: medir o comportamento, não a intenção.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

let ok = 0;
let fail = 0;
const check = (label, condition, extra) => {
  if (condition) { ok++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${extra == null ? "" : `: ${extra}`}`); }
};

const http = require(path.join(ROOT, "netlify/functions/_shared/http"));
const api = require(path.join(ROOT, "netlify/functions/_shared/supabase-rest"));

const HOST = "cofre.exemplo";
const ORIGEM = `https://${HOST}`;

function event(action, body, extra) {
  return {
    httpMethod: "POST",
    path: `/api/account/${action}`,
    queryStringParameters: { action },
    headers: {
      origin: ORIGEM,
      host: HOST,
      "x-forwarded-proto": "https",
      "x-device-id": "device-callback-1234",
      ...(extra || {}),
    },
    body: JSON.stringify(body),
  };
}

async function main() {
  /* ================================================================ *
   * 1. O ENDEREÇO DE RETORNO, MEDIDO NA CHAMADA DE VERDADE
   * ================================================================ */
  console.log("\n1. O endereço de retorno do email");

  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "public-test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
  // Deixado VAZIO de propósito: sem `ALLOWED_ORIGIN`, `allowedOrigins()` cai
  // para a própria origem da requisição. É assim que uma pré-visualização da
  // Vercel funciona, e é o caminho que precisa continuar montando o retorno
  // com o host de quem chamou, não com um domínio fixo.
  delete process.env.ALLOWED_ORIGIN;

  const capturado = {};
  api.auth.signUp = async (email, senha, redirectTo) => {
    capturado.signup = redirectTo;
    // Sem `access_token`: é o caso real de projeto com confirmação de email
    // ativa, que é justamente quando o link importa.
    return { user: { id: "00000000-0000-4000-8000-000000000009", email } };
  };
  api.auth.recover = async (email, redirectTo) => {
    capturado.recovery = redirectTo;
    return {};
  };
  // `register` e `recover` passam pelo limitador, que consulta o banco.
  api.db = async (route) => (route === "rpc/cofre_rate_hit" ? [{ allowed: true, retry_after: 0, hits: 1 }] : null);

  delete require.cache[require.resolve(path.join(ROOT, "netlify/functions/account"))];
  const account = require(path.join(ROOT, "netlify/functions/account"));

  const registro = await account.handler(event("register", { email: "pessoa@example.com", password: "senha-segura-123" }));
  check("o cadastro respondeu sem erro", registro.statusCode === 200, `${registro.statusCode} ${registro.body}`);
  check("o cadastro pediu confirmação por email", JSON.parse(registro.body).confirmationRequired === true);

  const recuperacao = await account.handler(event("recover", { email: "pessoa@example.com" }));
  check("a recuperação respondeu sem erro", recuperacao.statusCode === 200, `${recuperacao.statusCode} ${recuperacao.body}`);

  check("o cadastro informou um endereço de retorno", typeof capturado.signup === "string" && capturado.signup.length > 0, capturado.signup);
  check("a recuperação informou um endereço de retorno", typeof capturado.recovery === "string" && capturado.recovery.length > 0, capturado.recovery);

  [["cadastro", capturado.signup, "signup"], ["recuperação", capturado.recovery, "recovery"]].forEach(([nome, endereco, proposito]) => {
    let url = null;
    try { url = new URL(String(endereco)); } catch (_) {}
    check(`o retorno do ${nome} é uma URL absoluta`, !!url, endereco);
    if (!url) return;

    // ESTA É A ASSERÇÃO QUE O DEFEITO REPROVA.
    check(`o retorno do ${nome} NÃO cai na raiz do domínio`, url.pathname !== "/", url.pathname);
    check(`o retorno do ${nome} abre o aplicativo em /index.html`, url.pathname === "/index.html", url.pathname);

    check(`o retorno do ${nome} mantém o propósito na query`, url.searchParams.get("auth_callback") === proposito, url.search);
    check(`o retorno do ${nome} usa o host de quem chamou`, url.origin === ORIGEM, url.origin);

    // `app.html` é nome de arquivo dentro do `dist/`, destino de uma
    // reescrita. Ele não é endereço público e não pode vazar para um email.
    check(`o retorno do ${nome} não expõe o nome interno app.html`, !/app\.html/.test(String(endereco)), endereco);

    // Barra dupla mataria o link sem erro nenhum do lado do servidor.
    check(`o retorno do ${nome} não tem barra dupla`, !/\/\//.test(String(endereco).replace(/^https?:\/\//, "")), endereco);
  });

  /* ================================================================ *
   * 2. `siteOrigin()` NÃO PODE TRAZER BARRA FINAL
   * ================================================================ */
  console.log("\n2. A origem entra sem barra final");

  // A concatenação em `appCallbackUrl` depende disto: a barra antes de
  // `index.html` é escrita à mão lá, então qualquer barra que sobrasse aqui
  // viraria "https://dominio//index.html".
  [
    ["host simples", { host: HOST, "x-forwarded-proto": "https" }, ORIGEM],
    ["host encaminhado", { "x-forwarded-host": "preview-abc.vercel.app", "x-forwarded-proto": "https" }, "https://preview-abc.vercel.app"],
    ["host com porta local", { host: "localhost:4173" }, "http://localhost:4173"],
    ["lista de hosts encaminhados", { "x-forwarded-host": `${HOST}, interno.local`, "x-forwarded-proto": "https, http" }, ORIGEM],
  ].forEach(([nome, headers, esperado]) => {
    const origem = http.siteOrigin({ headers });
    check(`siteOrigin com ${nome} sai sem barra final`, !/\/$/.test(origem), origem);
    check(`siteOrigin com ${nome} resolve o endereço`, origem === esperado, origem);
    check(`a junção com ${nome} não duplica barra`, !/\/\//.test(`${origem}/index.html`.replace(/^https?:\/\//, "")), `${origem}/index.html`);
  });

  /* ================================================================ *
   * 3. O CÓDIGO-FONTE NÃO PODE VOLTAR PARA A RAIZ
   * ================================================================ */
  console.log("\n3. A montagem do endereço no servidor");

  const fonte = read("netlify/functions/account.js");
  check("o servidor não monta mais o retorno para a raiz",
    !/siteOrigin\(event\)\}\/\?auth_callback/.test(fonte));
  check("os dois fluxos passam pela mesma montagem",
    (fonte.match(/appCallbackUrl\(event, "(?:signup|recovery)"\)/g) || []).length === 2);
  check("a montagem aponta para o aplicativo",
    /return `\$\{siteOrigin\(event\)\}\/index\.html\?auth_callback=\$\{purpose\}`/.test(fonte));

  /* ================================================================ *
   * 4. QUEM CONCLUI O FLUXO SÓ EXISTE NO APLICATIVO
   * ================================================================ *
   * É esta assimetria que torna o endereço de retorno crítico. Se um dia a
   * troca do código passar a existir também na landing, esta seção reprova e
   * obriga a revisitar a decisão em vez de deixar as duas versões divergirem.
   */
  console.log("\n4. A troca do código mora no aplicativo");

  const auth = read("js/auth.js");
  const bundle = read("js/modules/app.generated.js");
  const indexHtml = read("index.html");
  const landingHtml = read("landing.html");
  const landingJs = read("js/landing.js");

  check("bootstrapAccount lê o código da query", /async function bootstrapAccount\(\)/.test(auth) && /params\.get\("code"\)/.test(auth));
  check("bootstrapAccount troca o código por uma sessão", /AccountAPI\.exchange\(code\)/.test(auth));
  check("bootstrapAccount está no pacote que o aplicativo carrega", /bootstrapAccount/.test(bundle));
  check("o aplicativo carrega esse pacote", /js\/modules\/bootstrap\.js/.test(indexHtml));

  check("a página comercial não carrega o pacote do aplicativo",
    !/app\.generated\.js|modules\/bootstrap\.js/.test(landingHtml));
  check("a página comercial não tenta trocar o código sozinha",
    !/AccountAPI|exchange\(/.test(landingJs));

  /* ================================================================ *
   * 5. REDE DE SEGURANÇA PARA OS LINKS JÁ ENVIADOS
   * ================================================================ *
   * Corrigir o servidor não conserta o email que já saiu. Os links em
   * circulação apontam para a raiz, e a raiz é a página comercial. O
   * `js/landing-boot.js` reencaminha esses links para o aplicativo.
   *
   * Ele é executado aqui de verdade, com `location` e `document` de mentira.
   */
  console.log("\n5. A landing devolve o link já enviado ao aplicativo");

  const bootFonte = read("js/landing-boot.js");

  function rodarBoot(search, hash) {
    const destinos = [];
    const atributos = {};
    const raiz = {
      setAttribute(nome, valor) { atributos[nome] = String(valor); },
      getAttribute(nome) { return Object.prototype.hasOwnProperty.call(atributos, nome) ? atributos[nome] : null; },
      removeAttribute(nome) { delete atributos[nome]; },
    };
    const location = {
      search: search || "",
      hash: hash || "",
      replace(destino) { destinos.push(String(destino)); },
    };
    const janela = {
      location,
      matchMedia: () => ({ matches: false }),
      setTimeout: () => 0,
    };
    const caixa = { window: janela, document: { documentElement: raiz }, location };
    vm.createContext(caixa);
    vm.runInContext(bootFonte, caixa, { filename: "landing-boot.js" });
    return { destinos, motion: raiz.getAttribute("data-lp-motion") };
  }

  // O formato real de um link já enviado: o `auth_callback` veio do
  // `redirect_to` antigo e o `code` foi acrescentado pelo Supabase.
  const jaEnviado = rodarBoot("?auth_callback=signup&code=abc123def456");
  check("um link de cadastro já enviado é reencaminhado", jaEnviado.destinos.length === 1, jaEnviado.destinos.join(", "));
  check("o reencaminhamento vai para o aplicativo",
    jaEnviado.destinos[0] === "index.html?auth_callback=signup&code=abc123def456", jaEnviado.destinos[0]);
  check("a query inteira é preservada, inclusive o código",
    /[?&]code=abc123def456\b/.test(jaEnviado.destinos[0] || "") && /[?&]auth_callback=signup\b/.test(jaEnviado.destinos[0] || ""));
  check("a landing não esconde blocos enquanto reencaminha", jaEnviado.motion === null, jaEnviado.motion);

  const recuperacaoEnviada = rodarBoot("?auth_callback=recovery&code=zzz");
  check("um link de recuperação já enviado é reencaminhado",
    recuperacaoEnviada.destinos[0] === "index.html?auth_callback=recovery&code=zzz", recuperacaoEnviada.destinos[0]);

  const soCodigo = rodarBoot("?code=somente-o-codigo");
  check("um link só com código também é reencaminhado",
    soCodigo.destinos[0] === "index.html?code=somente-o-codigo", soCodigo.destinos[0]);

  const semCodigo = rodarBoot("?auth_callback=signup");
  check("um link sem código chega ao aplicativo para receber a mensagem de erro",
    semCodigo.destinos[0] === "index.html?auth_callback=signup", semCodigo.destinos[0]);

  const comHash = rodarBoot("?auth_callback=signup&code=abc", "#/conta-e-acesso");
  check("o hash de rota sobrevive ao reencaminhamento",
    comHash.destinos[0] === "index.html?auth_callback=signup&code=abc#/conta-e-acesso", comHash.destinos[0]);

  // O outro lado: visita normal não pode sair da página comercial.
  [
    ["sem query nenhuma", ""],
    ["com endereço de campanha", "?utm_source=instagram&utm_medium=social"],
    ["com indicação", "?ref=parceiro"],
    // A comparação exige a chave inteira depois de `?` ou `&`. Sem isso,
    // qualquer parâmetro terminado em "code" levaria a visita para o app.
    ["com parâmetro terminado em code", "?ref_code=promo10"],
    ["com parâmetro terminado em auth_callback", "?no_auth_callback=1"],
  ].forEach(([nome, busca]) => {
    const visita = rodarBoot(busca);
    check(`visita ${nome} continua na página comercial`, visita.destinos.length === 0, visita.destinos.join(", "));
    check(`visita ${nome} mantém a animação ligada`, visita.motion === "on", String(visita.motion));
  });

  // Duas propriedades que o teste de comportamento acima não alcança.
  check("o reencaminhamento usa replace, para não empilhar histórico",
    /location\.replace\(/.test(bootFonte) && !/location\.assign\(|location\.href\s*=/.test(bootFonte));
  check("o reencaminhamento vive no script síncrono do <head>, não no defer",
    /<script src="js\/landing-boot\.js"><\/script>/.test(landingHtml)
    && /<script src="js\/landing\.js" defer><\/script>/.test(landingHtml)
    && !/code\|auth_callback/.test(landingJs));

  /* ================================================================ *
   * 6. A DOCUMENTAÇÃO MANDA CADASTRAR O ENDEREÇO CERTO
   * ================================================================ *
   * A lista de URLs de redirecionamento do Supabase é preenchida à mão pelo
   * dono do projeto, a partir deste documento. Documento errado reintroduz o
   * defeito na próxima instalação, mesmo com o código correto.
   */
  console.log("\n6. A instrução de configuração do Supabase");

  const doc = read("docs/BACKEND_SETUP.md");
  check("a documentação não manda mais cadastrar a raiz",
    !/SEU-DOMINIO\/\?auth_callback/.test(doc));
  check("a documentação manda cadastrar o retorno do cadastro",
    /SEU-DOMINIO\/index\.html\?auth_callback=signup/.test(doc));
  check("a documentação manda cadastrar o retorno da recuperação",
    /SEU-DOMINIO\/index\.html\?auth_callback=recovery/.test(doc));
  check("a documentação explica por que o caminho importa",
    /página comercial/.test(doc) && /index\.html/.test(doc));

  console.log(`\n${fail ? "FALHAS ENCONTRADAS" : "TODOS OS TESTES PASSARAM"}: ${ok} ok, ${fail} falha(s)`);
  process.exit(fail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
