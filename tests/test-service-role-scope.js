// test-service-role-scope.js: nenhuma chamada privilegiada aceita identidade do cliente.
// ------------------------------------------------------------------------------
// A credencial `service_role` ATRAVESSA o RLS. Toda chamada feita com ela é uma
// consulta sem dono: quem decide de quem são os dados é o código, não o banco.
// Basta uma chamada tirar o identificador do corpo da requisição para o
// aplicativo inteiro virar um IDOR — ler, escrever e apagar a conta alheia
// informando o id dela.
//
// Os testes de comportamento que já existem (test-account-backend,
// test-device-revocation-backend, test-session-scope-backend, test-user-isolation)
// cobrem o que o backend FAZ. Este cobre o que ele NÃO PODE PASSAR A FAZER: é uma
// guarda estrutural sobre o código-fonte, para que a próxima chamada privilegiada
// não nasça sem escopo e para que uma chamada nova não passe despercebida.
//
// A regra em uma frase: identidade vem da sessão validada no provedor, nunca do
// que o cliente mandou.
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
let pass = 0;
let fail = 0;

function check(name, condition, extra) {
  if (condition) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra == null ? "" : ` -> ${extra}`}`); }
}

const ARQUIVOS = [
  "netlify/functions/account.js",
  "netlify/functions/sync.js",
  "netlify/functions/analyze.js",
  "netlify/functions/_shared/rate-limit.js",
  "netlify/functions/_shared/supabase-rest.js",
  "netlify/functions/_shared/http.js",
  "api/_adaptar.js",
];

// Comentário de linha inteira sai antes da análise. O texto deste projeto é
// denso e cita `api.db`, `p_user_id` e `service: true` ao explicar as regras;
// sem remover, a prosa seria auditada como se fosse código.
function semComentarios(fonte) {
  return fonte.split("\n").filter((linha) => !/^\s*\/\//.test(linha)).join("\n");
}

// Recorta a lista de argumentos de cada `api.db(...)` contando parênteses. Uma
// expressão regular não serve: os argumentos têm objetos, template strings e
// parênteses aninhados, e um recorte errado classificaria a chamada errada.
function chamadasDe(fonte, alvo) {
  const saida = [];
  let de = 0;
  for (;;) {
    const inicio = fonte.indexOf(alvo, de);
    if (inicio === -1) return saida;
    let i = inicio + alvo.length;
    let nivel = 1;
    while (i < fonte.length && nivel > 0) {
      const c = fonte[i];
      if (c === "(") nivel++;
      else if (c === ")") nivel--;
      i++;
    }
    saida.push(fonte.slice(inicio, i));
    de = i;
  }
}

// Tabelas cujas linhas pertencem a um usuário. Uma chamada privilegiada que
// toque nelas precisa dizer de QUEM são as linhas.
const TABELAS_DO_USUARIO = [
  "cofre_devices", "cofre_sync_ops", "cofre_sync_state", "cofre_sync_checkpoints",
  "cofre_sync_checkpoint_rows", "cofre_financial_snapshots", "cofre_mutations",
];

// Caminhos privilegiados que legitimamente não carregam dado de usuário nenhum.
// A lista é FECHADA: incluir algo aqui é uma decisão, não um efeito colateral.
const SEM_DADO_DE_USUARIO = [
  { padrao: /cofre_sync_config/, porque: "configuração global do protocolo, linha única id=1" },
  { padrao: /rpc\/cofre_rate_hit/, porque: "contagem por identidade já em HMAC, sem id de usuário" },
];

function main() {
  console.log("\n1. Toda chamada com service_role diz de quem são os dados");
  const naoClassificadas = [];
  let privilegiadas = 0;
  ARQUIVOS.forEach((arquivo) => {
    const fonte = semComentarios(read(arquivo));
    chamadasDe(fonte, "api.db(").forEach((chamada) => {
      if (!/service:\s*true/.test(chamada)) return;
      privilegiadas++;
      const escopada =
        // RPC: o banco recebe o dono como parâmetro, e ele vem da sessão.
        /p_user_id:\s*session\.user\.id/.test(chamada)
        // PostgREST: o filtro por dono está no próprio caminho.
        || /user_id=eq\.\$\{encodeURIComponent\((session\.user\.id|userId)\)\}/.test(chamada)
        // Helper que monta o caminho com o filtro por dono (asserção 2).
        || /deviceLookupPath\(/.test(chamada)
        // Inserção: a linha nasce carimbada com o dono.
        || /user_id:\s*userId/.test(chamada)
        || SEM_DADO_DE_USUARIO.some(({ padrao }) => padrao.test(chamada));
      if (!escopada) naoClassificadas.push(`${arquivo}: ${chamada.slice(0, 120).replace(/\s+/g, " ")}`);
    });
  });
  check("existem chamadas privilegiadas para auditar", privilegiadas >= 10, privilegiadas);
  check("nenhuma chamada privilegiada ficou sem escopo de usuário",
    naoClassificadas.length === 0, naoClassificadas.join(" || "));

  console.log("\n2. O identificador do usuário nunca vem do cliente");
  const backend = ARQUIVOS.map((a) => semComentarios(read(a))).join("\n");
  // A regra central do módulo. `p_user_id` é o parâmetro que os RPC usam para
  // decidir o dono das linhas; se algum dia ele aceitar outra coisa que não a
  // sessão, o banco passa a obedecer o cliente.
  const parametrosDono = backend.match(/p_user_id:\s*[^,\n}]+/g) || [];
  check("todo p_user_id é session.user.id",
    parametrosDono.length > 0 && parametrosDono.every((t) => /p_user_id:\s*session\.user\.id\s*$/.test(t.trim())),
    parametrosDono.join(" || "));
  // Nem por outro nome. Um `body.userId` no backend não tem uso legítimo:
  // a identidade já chegou pela sessão antes de qualquer rota rodar.
  check("o backend não lê identidade do corpo da requisição",
    !/\b(body|payload|corpo)\.(userId|user_id|accountId|account_id|uid)\b/.test(backend));
  // O cabeçalho de conta serve para RECUSAR cedo, nunca para autorizar. Quem
    // autoriza é a comparação com o usuário devolvido pelo provedor.
  const conta = semComentarios(read("netlify/functions/account.js"));
  check("o escopo de conta é conferido contra a sessão",
    /accountId\.toLowerCase\(\)\s*!==\s*expected\.toLowerCase\(\)/.test(conta)
    && /const expected = String\(session && session\.user && session\.user\.id \|\| ""\)/.test(conta));
  // `jwtSubjectOf` decodifica sem verificar assinatura. Só pode aparecer no
  // caminho que RECUSA; usá-lo para montar sessão aceitaria token forjado.
  const usosDoSub = (conta.match(/jwtSubjectOf\(/g) || []).length;
  check("o sub não verificado do JWT só é usado para recusar",
    usosDoSub === 2 && /function rejectClaimedAccountMismatch[\s\S]*?jwtSubjectOf\(/.test(conta), usosDoSub);

  console.log("\n3. A identidade é validada no provedor, não decodificada aqui");
  // `api.auth.user(token)` chama /auth/v1/user no Supabase, que confere a
  // assinatura. Trocar isso por um decode local aceitaria qualquer JWT montado
  // à mão, e nenhum outro teste desta suíte pegaria.
  check("sessionOf pergunta ao provedor quem é o dono do token",
    /async function sessionOf[\s\S]*?api\.auth\.user\(values\[ACCESS\]\)/.test(conta));
  check("o refresh também termina com um usuário confirmado pelo provedor",
    /api\.auth\.refresh\(values\[REFRESH\]\)[\s\S]*?renewed\.user \|\| await api\.auth\.user\(/.test(conta));
  check("a exclusão da conta só apaga o usuário da própria sessão",
    /api\.auth\.deleteUser\(session\.user\.id\)/.test(conta)
    && (conta.match(/api\.auth\.deleteUser\(/g) || []).length === 1);

  console.log("\n4. O caminho do aparelho carrega o dono e resiste a injeção");
  check("deviceLookupPath filtra por usuário e por aparelho",
    /function deviceLookupPath\(userId, deviceId\)[\s\S]*?user_id=eq\.\$\{encodeURIComponent\(userId\)\}[\s\S]*?device_id=eq\.\$\{encodeURIComponent\(deviceId\)\}/.test(conta));
  // O id do aparelho entra num filtro do PostgREST. Sem a lista fechada de
  // caracteres, um valor com `,` ou `.` reescreveria o filtro.
  check("o id do aparelho é validado por conjunto fechado de caracteres",
    /\^\[A-Za-z0-9\]\[A-Za-z0-9:_-\]\{7,79\}\$/.test(semComentarios(read("netlify/functions/_shared/http.js"))));
  check("touchDevice e authorizeDevice recebem o id da sessão",
    !/\b(touchDevice|authorizeDevice)\(\s*(body|payload)\./.test(backend)
    && /touchDevice\(session\.user\.id, event\)/.test(conta));
  // Segredo do aparelho comparado byte a byte em tempo constante, e com o
  // tamanho conferido antes porque `timingSafeEqual` lança quando difere.
  check("o segredo do aparelho é comparado em tempo constante",
    /crypto\.timingSafeEqual/.test(conta) && /x\.length !== y\.length/.test(conta));

  console.log("\n5. Leitura de dados do usuário passa pelo RLS, não pelo service_role");
  // Estas leituras não trazem filtro por dono no caminho DE PROPÓSITO: elas
  // usam o token do usuário, e é o RLS que recorta. Trocar `token` por
  // `service: true` devolveria a base inteira de todo mundo, sem erro nenhum.
  const sync = semComentarios(read("netlify/functions/sync.js"));
  TABELAS_DO_USUARIO.forEach((tabela) => {
    const leiturasPrivilegiadas = chamadasDe(sync + "\n" + conta, "api.db(")
      // Sem `method:` explícito, `api.db` faz GET. Um POST/PATCH que traz
      // `?select` está só pedindo a linha de volta (`return=representation`):
      // é escrita carimbada com o dono, não leitura de base alheia.
      .filter((c) => new RegExp(`["\`]${tabela}\\?select`).test(c)
        && /service:\s*true/.test(c)
        && !/method:\s*"(POST|PATCH|PUT|DELETE)"/.test(c));
    check(`select em ${tabela} não usa service_role`,
      leiturasPrivilegiadas.length === 0, leiturasPrivilegiadas.join(" || "));
  });
  check("a página de operações usa o token do usuário",
    /cofre_sync_ops\?select[\s\S]*?\{ token: session\.token \}/.test(sync));
  check("o conteúdo da versão restaurável usa o token do usuário",
    /cofre_sync_checkpoint_rows\?select[\s\S]*?\{ token: session\.token \}/.test(sync));

  console.log("\n6. Escrita cruzada de origem é recusada");
  // Cookie de sessão é enviado pelo navegador sozinho. Sem conferir a origem,
  // uma página de terceiro consegue disparar escrita autenticada.
  check("account.js exige mesma origem em tudo que não é GET",
    /if \(method !== "GET"\) assertSameOrigin\(event\);/.test(conta));
  check("sync.js exige mesma origem em tudo que não é GET",
    /if \(method !== "GET"\) assertSameOrigin\(event\);/.test(sync));
  check("a função de IA recusa origem fora da lista",
    /if \(!origin\.allowed\)/.test(semComentarios(read("netlify/functions/analyze.js"))));
  const http = semComentarios(read("netlify/functions/_shared/http.js"));
  check("origem ausente é recusada, não tratada como própria",
    /if \(!origin \|\| allowedOrigins\(event\)\.indexOf\(origin\) < 0\)/.test(http));
  check("o cookie de sessão é HttpOnly, SameSite e Secure fora de localhost",
    /"HttpOnly", "SameSite=Lax"/.test(http) && /if \(secureCookie\(event\)\) parts\.push\("Secure"\)/.test(http));

  console.log(`\n${fail === 0 ? "TODOS OS TESTES PASSARAM" : "FALHAS ENCONTRADAS"} - ${pass} ok, ${fail} falha(s)\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
