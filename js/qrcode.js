// qrcode.js. Leitor de QR Code via câmera (BarcodeDetector nativo)
// ------------------------------------------------------------------------------
// Reconhece DOIS formatos e decide sozinho qual é qual:
//
//   1. BR Code / PIX  (padrão EMV® MPM do Banco Central); estrutura TLV
//      "ID + tamanho + valor" concatenada, terminada num CRC16. Dá para extrair
//      valor, nome do recebedor, cidade, chave PIX e txid SEM rede nenhuma.
//
//   2. NFC-e / NF-e  ; o QR é uma URL do portal da SEFAZ do estado. O valor não
//      está no QR; tentamos ler a página pública (quase sempre bloqueada por
//      CORS) e, falhando, caímos no preenchimento manual com a chave já lida.
//
// Nada é enviado a servidor nosso: a decodificação acontece 100% no aparelho.
"use strict";

const QrScanner = {
  stream: null,
  detector: null,
  rafId: null,
  onResult: null,
  videoEl: null,
  starting: false,

  isSupported() {
    return typeof window !== "undefined" && "BarcodeDetector" in window &&
      typeof navigator !== "undefined" && "mediaDevices" in navigator;
  },

  async start(videoEl, onResult) {
    if (this.starting || this.stream) return;   // evita abrir duas câmeras em re-render
    this.starting = true;
    try {
      this.videoEl = videoEl;
      this.onResult = onResult;
      this.detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      videoEl.srcObject = this.stream;
      await videoEl.play();
      this.tick();
    } finally {
      this.starting = false;
    }
  },

  tick() {
    this.rafId = requestAnimationFrame(() => this.scanFrame());
  },

  async scanFrame() {
    if (!this.stream) return;                    // parado enquanto o frame processava
    if (!this.videoEl || this.videoEl.readyState < 2) { this.tick(); return; }
    try {
      const codes = await this.detector.detect(this.videoEl);
      if (codes && codes.length > 0) {
        const value = codes[0].rawValue;
        this.stop();
        this.onResult && this.onResult(value);
        return;
      }
    } catch (e) { /* ignora frame com falha de decodificação */ }
    this.tick();
  },

  stop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; }
    if (this.videoEl) { try { this.videoEl.srcObject = null; } catch (e) {} }
  },
};

// ==============================================================================
// PIX / BR CODE; parser EMV® MPM
// ==============================================================================
// O payload é uma cadeia de campos no formato:
//
//     ID(2 dígitos) + TAMANHO(2 dígitos) + VALOR(TAMANHO caracteres)
//
// Alguns campos são "templates": o VALOR deles é, por sua vez, outra cadeia TLV.
// Mapa dos que interessam:
//
//   00  Payload Format Indicator ("01")
//   01  Point of Initiation      ("11" estático, "12" dinâmico/uso único)
//   26-51 Merchant Account Info  (template) → 00 = GUI "br.gov.bcb.pix"
//                                             01 = chave PIX
//                                             02 = descrição
//                                             25 = URL (PIX dinâmico)
//   52  Merchant Category Code
//   54  Transaction Amount       ← o valor, em formato "123.45"
//   58  Country Code
//   59  Merchant Name            ← o recebedor
//   60  Merchant City
//   62  Additional Data          (template) → 05 = txid
//   63  CRC16                    ← sempre o último campo
// ==============================================================================

const PIX_GUI = "br.gov.bcb.pix";

// CRC-16/CCITT-FALSE, polinômio 0x1021, inicial 0xFFFF; é o exigido pelo padrão.
// Validar o CRC é o que impede o app de aceitar um QR truncado/borrado e lançar
// um valor errado no orçamento do usuário.
function pixCrc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= (str.charCodeAt(i) & 0xFF) << 8;
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// Quebra uma cadeia TLV em { id: valor }. Retorna null se o formato não fechar
// (tamanho declarado maior que o restante da string, campo não numérico etc.).
function pixParseTlv(payload) {
  const out = {};
  let i = 0;
  while (i < payload.length) {
    if (i + 4 > payload.length) return null;
    const id = payload.slice(i, i + 2);
    const lenStr = payload.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(lenStr)) return null;
    const len = parseInt(lenStr, 10);
    const start = i + 4;
    const end = start + len;
    if (end > payload.length) return null;
    out[id] = payload.slice(start, end);
    i = end;
  }
  return out;
}

function looksLikePixPayload(raw) {
  const s = String(raw || "").trim();
  if (s.length < 20) return false;
  if (!/^000201/.test(s)) return false;          // todo BR Code começa com "0002" + "01"
  return /6304[0-9A-Fa-f]{4}$/.test(s) || s.toLowerCase().includes(PIX_GUI);
}

// Parser principal do BR Code. Sempre retorna um objeto (nunca lança), com
// `valid` indicando se o CRC bateu.
function parsePixPayload(raw) {
  const payload = String(raw || "").trim();
  const result = {
    kind: "pix", raw: payload, valid: false, crcOk: false,
    amount: null, merchant: null, city: null, pixKey: null,
    description: null, txid: null, dynamic: false, url: null,
  };

  const fields = pixParseTlv(payload);
  if (!fields) return result;

  // ---- CRC: calculado sobre tudo até "6304" (inclusive) ----
  const crcIndex = payload.lastIndexOf("6304");
  if (crcIndex > -1) {
    const expected = payload.slice(crcIndex + 4).toUpperCase();
    const computed = pixCrc16(payload.slice(0, crcIndex + 4));
    result.crcOk = expected === computed;
  }

  result.dynamic = fields["01"] === "12";

  // ---- Merchant Account Information: varre 26..51 até achar o template PIX ----
  for (let id = 26; id <= 51; id++) {
    const key = String(id).padStart(2, "0");
    const tpl = fields[key];
    if (!tpl) continue;
    const inner = pixParseTlv(tpl);
    if (!inner) continue;
    const gui = (inner["00"] || "").toLowerCase();
    if (gui !== PIX_GUI && !gui.includes("bcb.pix")) continue;
    result.pixKey = inner["01"] || null;
    result.description = inner["02"] || null;
    result.url = inner["25"] || null;
    if (result.url) result.dynamic = true;
    break;
  }

  // ---- Valor ----
  if (fields["54"] != null && fields["54"] !== "") {
    // O padrão manda ponto como separador decimal ("123.45").
    const parsed = parseMoneyInput(String(fields["54"]).replace(",", "."));
    if (Number.isFinite(parsed) && parsed > 0) result.amount = parsed;
  }

  // ---- Recebedor / cidade ----
  result.merchant = pixCleanName(fields["59"]);
  result.city = pixCleanName(fields["60"]);

  // ---- Dados adicionais (txid) ----
  if (fields["62"]) {
    const extra = pixParseTlv(fields["62"]);
    if (extra) {
      result.txid = extra["05"] && extra["05"] !== "***" ? extra["05"] : null;
      if (!result.description && extra["02"]) result.description = extra["02"];
    }
  }

  result.valid = !!(result.pixKey || result.merchant) && !!fields["00"];
  return result;
}

// Nomes vêm em caixa alta e sem acento no BR Code ("MERCADO SAO JOAO LTDA").
// Deixamos em Title Case para caber bem na lista de lançamentos.
function pixCleanName(value) {
  let s = String(value || "").trim();
  if (!s) return null;
  // Remove sufixos societários do fim ("MERCADO SAO JOAO LTDA ME" → "Mercado Sao Joao").
  s = s.replace(/\s+(ltda|me|epp|eireli|s\.?a\.?|mei)\b\.?/gi, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  const minor = new Set(["de", "da", "do", "das", "dos", "e", "em"]);
  return s.toLowerCase().split(" ").map((w, i) => {
    if (i > 0 && minor.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(" ");
}

// ==============================================================================
// NFC-e / NF-e (portais estaduais)
// ==============================================================================
function isTrustedFiscalHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!host.endsWith(".gov.br")) return false;
  const labels = host.split(".");
  return labels.some((label) => label === "sefaz" || label === "fazenda")
    && labels.some((label) => label === "nfce" || label === "nfe" || label === "sefaz" || label === "fazenda" || label === "portalsped");
}

function parseNfceUrl(raw) {
  try {
    const url = new URL(raw);
    const trusted = url.protocol === "https:" && !url.username && !url.password
      && (!url.port || url.port === "443") && isTrustedFiscalHost(url.hostname);
    const p = url.searchParams.get("p") || "";
    const parts = p.split("|");
    let chave = parts[0] && /^\d{44}$/.test(parts[0]) ? parts[0] : null;
    if (!chave) {
      // Alguns estados usam ?chNFe=..; em vez do parâmetro "p".
      const alt = url.searchParams.get("chNFe") || url.searchParams.get("chnfe");
      if (alt && /^\d{44}$/.test(alt)) chave = alt;
    }
    // O valor total às vezes aparece em "vNF" na própria URL; quando aparece,
    // pulamos direto para o formulário preenchido, sem depender de rede.
    const vNF = url.searchParams.get("vNF") || url.searchParams.get("vnf");
    const amount = vNF ? parseMoneyInput(vNF) : NaN;
    return {
      url: url.href,
      chave: trusted ? chave : null,
      host: url.hostname,
      trusted,
      amount: trusted && Number.isFinite(amount) && amount > 0 ? amount : null,
    };
  } catch (e) {
    return { url: String(raw || ""), chave: null, host: null, trusted: false, amount: null };
  }
}

// Busca best-effort a página pública da nota. Muitos portais estaduais bloqueiam
// CORS; nesse caso retornamos null e o app segue para o preenchimento manual.
async function tryFetchNfceDetails(url, fetchImpl) {
  const parsed = parseNfceUrl(url);
  if (!parsed.trusted || !parsed.chave) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const request = fetchImpl || fetch;
    const res = await request(parsed.url, { mode: "cors", redirect: "error", signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const contentType = String(res.headers && res.headers.get ? res.headers.get("content-type") : "").toLowerCase();
    const contentLength = Number(res.headers && res.headers.get ? res.headers.get("content-length") : 0);
    if (contentType && !contentType.includes("text/html")) return null;
    if (Number.isFinite(contentLength) && contentLength > 1024 * 1024) return null;
    const html = (await res.text()).slice(0, 1024 * 1024);
    const valorMatch = html.match(/valor\s*a\s*pagar[^0-9]{0,40}([\d.,]+)/i) || html.match(/total[^0-9]{0,40}R?\$?\s*([\d.,]{3,})/i);
    const estabMatch = html.match(/<[^>]*class="[^"]*razao[^"]*"[^>]*>([^<]+)</i) || html.match(/<title>([^<]+)<\/title>/i);
    const valor = valorMatch ? parseMoneyInput(valorMatch[1]) : NaN;
    const estabelecimento = estabMatch
      ? estabMatch[1].replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)
      : null;
    if (!Number.isFinite(valor) && !estabelecimento) return null;
    return { valor: Number.isFinite(valor) ? valor : null, estabelecimento };
  } catch (e) {
    return null; // CORS bloqueado, offline ou timeout; fallback manual assume
  }
}

// ==============================================================================
// FACHADA ÚNICA; é o que app.js consome
// ==============================================================================
// Classifica o conteúdo bruto do QR e devolve um formato normalizado, já pronto
// para pré-preencher o formulário de novo gasto.
function classifyQrPayload(raw) {
  const value = String(raw || "").trim();

  if (looksLikePixPayload(value)) {
    const pix = parsePixPayload(value);
    return {
      kind: "pix",
      amount: pix.amount,
      merchant: pix.merchant,
      description: pix.description,
      pixKey: pix.pixKey,
      city: pix.city,
      txid: pix.txid,
      dynamic: pix.dynamic,
      crcOk: pix.crcOk,
      valid: pix.valid,
      payment: "Pix",
      raw: value,
    };
  }

  if (/^https?:\/\//i.test(value)) {
    const nfce = parseNfceUrl(value);
    return {
      kind: nfce.chave ? "nfce" : "url",
      amount: nfce.amount,
      merchant: null,
      chave: nfce.chave,
      host: nfce.host,
      trusted: nfce.trusted,
      valid: !!nfce.chave && nfce.trusted,
      payment: "Outro",
      raw: value,
    };
  }

  return { kind: "unknown", amount: null, merchant: null, valid: false, payment: "Outro", raw: value };
}

// Converte o resultado do QR num rascunho de formulário, sugerindo a categoria
// pelo nome do recebedor (reaproveita o dicionário do importador de extratos).
function draftFromQr(parsed, data) {
  const label = parsed.merchant || parsed.description || "";
  let categoryId = "outros";
  let categorySource = "padrao";

  if (label && typeof guessCategoryId === "function") {
    const guess = guessCategoryId(data, label);
    if (guess && guess !== "outros") { categoryId = guess; categorySource = "dicionario"; }
  }
  // Histórico do usuário tem prioridade sobre o dicionário genérico.
  if (label && typeof nlpCategoryFromHistory === "function") {
    const fromHistory = nlpCategoryFromHistory(data, label);
    if (fromHistory && (data.categories || []).some((c) => c.id === fromHistory)) {
      categoryId = fromHistory; categorySource = "historico";
    }
  }
  if (categoryId === "outros" && data.categories && data.categories.length) {
    categoryId = data.categories.some((c) => c.id === "outros") ? "outros" : data.categories[0].id;
  }

  return {
    kind: parsed.kind,
    amount: parsed.amount != null ? roundMoney(parsed.amount).toFixed(2).replace(".", ",") : "",
    merchant: parsed.merchant || "",
    description: label || (parsed.kind === "pix" ? "Pagamento via Pix" : "Compra via QR"),
    categoryId,
    categorySource,
    payment: parsed.payment || "Outro",
    pixKey: parsed.pixKey || null,
    txid: parsed.txid || null,
    chave: parsed.chave || null,
    dynamic: !!parsed.dynamic,
    crcOk: parsed.crcOk !== false,
    autoFilled: !!(parsed.amount || parsed.merchant),
    raw: parsed.raw,
    source: parsed.kind === "pix" ? "qrcode-pix" : "qrcode-nfce",
  };
}
