"use strict";

// [M6] CHECAGEM DE SENHA VAZADA, FEITA AQUI PORQUE O PLANO NÃO A ENTREGA.
//
// O Supabase tem esta checagem pronta ("Leaked password protection"), mas só no
// plano pago. Este projeto está no plano gratuito, e o alerta
// `auth_leaked_password_protection` do advisor não fecha por chave de painel.
// Ou se implementa, ou se aceita que `Corinthians2010` continue virando senha
// de um aplicativo financeiro.
//
// COMO A SENHA NÃO VAZA NA CONSULTA (k-anonimato).
//
// A API do HaveIBeenPwned recebe apenas os CINCO PRIMEIROS caracteres do
// SHA-1 da senha e devolve TODOS os sufixos de hash daquele prefixo (algo entre
// 300 e 1.000 linhas). A comparação com o nosso sufixo acontece aqui dentro.
// Ou seja: a senha não sai, o hash completo não sai, e do outro lado ninguém
// consegue dizer qual das centenas de senhas daquele balde foi consultada.
//
// `Add-Padding: true` completa a resposta com registros falsos até um tamanho
// fixo. Sem ele, o TAMANHO da resposta já é um sinal sobre qual prefixo foi
// pedido para quem observa a rede.
//
// POR QUE ELA FALHA ABERTO, E NÃO FECHADO.
//
// Se o HIBP estiver fora do ar, lento, ou bloqueado pela hospedagem, esta
// função devolve "não vazada, não consultada" e o cadastro segue. A alternativa
// é impedir alguém de criar conta porque um terceiro caiu, o que troca um risco
// de senha fraca por uma indisponibilidade certa. As outras regras de
// `senhaNovaOf` continuam valendo em qualquer caso: esta camada acrescenta,
// não sustenta sozinha.
//
// DESLIGAR: `LEAKED_PASSWORD_CHECK=off` na hospedagem. Existe para o caso de a
// consulta virar um problema de latência ou de política, sem precisar publicar
// código novo.
//
// PRIVACIDADE (entra no inventário do M18 e na lista de terceiros do M19): a
// consulta sai do SERVIDOR, nunca do navegador, então nenhum IP de usuário
// chega ao HIBP; o que chega é o IP da função e cinco caracteres hexadecimais.

const crypto = require("crypto");

const HIBP_URL = "https://api.pwnedpasswords.com/range/";
const TIMEOUT_MS = 2500;

function ligada() {
  return String(process.env.LEAKED_PASSWORD_CHECK || "").trim().toLowerCase() !== "off";
}

// Exportada para o teste conseguir afirmar que o que sai é só o prefixo.
function prefixoDe(senha) {
  const hash = crypto.createHash("sha1").update(String(senha), "utf8").digest("hex").toUpperCase();
  return { prefixo: hash.slice(0, 5), sufixo: hash.slice(5) };
}

async function verificarSenhaVazada(senha, opcoes = {}) {
  const naoConsultado = { vazada: false, ocorrencias: 0, consultado: false };
  if (!senha || !ligada()) return naoConsultado;

  const buscar = opcoes.fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!buscar) return naoConsultado;

  const { prefixo, sufixo } = prefixoDe(senha);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(opcoes.timeoutMs) || TIMEOUT_MS);
  try {
    const res = await buscar(`${HIBP_URL}${prefixo}`, {
      method: "GET",
      headers: { "Add-Padding": "true", "User-Agent": "cofre-financeiro" },
      signal: controller.signal,
    });
    if (!res || !res.ok) return naoConsultado;
    const corpo = String(await res.text());
    for (const linha of corpo.split("\n")) {
      const at = linha.indexOf(":");
      if (at < 1) continue;
      if (linha.slice(0, at).trim().toUpperCase() !== sufixo) continue;
      const ocorrencias = Number(linha.slice(at + 1).trim()) || 0;
      // O preenchimento do `Add-Padding` vem com contagem zero. Ele existe para
      // igualar o tamanho da resposta, não para relatar vazamento nenhum.
      if (ocorrencias <= 0) return { vazada: false, ocorrencias: 0, consultado: true };
      return { vazada: true, ocorrencias, consultado: true };
    }
    return { vazada: false, ocorrencias: 0, consultado: true };
  } catch (_) {
    return naoConsultado;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { verificarSenhaVazada, prefixoDe };
