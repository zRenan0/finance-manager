// wrapped.js. Resumo mensal visual estilo "Wrapped", desenhado via Canvas API.
// Gera uma imagem PNG pronta para salvar ou compartilhar (Web Share API), sem
// depender de nenhum serviço externo.
"use strict";

function buildWrappedData(data) {
  const now = new Date();
  const mKey = keyOfDate(now);
  const { income, expense, tx } = realizedMonthTotals(data, mKey);
  const byCategory = {};
  tx.filter((t) => t.type === "expense").forEach((t) => { byCategory[t.categoryId] = (byCategory[t.categoryId] || 0) + t.amount; });
  const topEntries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  const top = topEntries[0] ? categoryById(data, topEntries[0][0]) : null;
  const topValue = topEntries[0] ? topEntries[0][1] : 0;
  const saved = income - expense;
  const goalsProgress = data.goals.reduce((s, g) => s + g.current, 0);
  return {
    monthLabel: `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`,
    income, expense, saved,
    topCategoryName: top ? top.name : ":",
    topCategoryColor: top ? top.color : "#0E6E5D",
    topValue,
    txCount: tx.length,
    goalsProgress,
  };
}

function drawWrappedCard(canvas, w) {
  const W = 1080, H = 1350;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#0E6E5D");
  grad.addColorStop(1, "#0A5347");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // círculos decorativos
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath(); ctx.arc(W - 80, 140, 260, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(60, H - 160, 200, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "600 34px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText("Meu resumo financeiro", 64, 130);
  ctx.font = "800 56px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText(w.monthLabel, 64, 195);

  const cardY = 280, cardH = 620, cardX = 64, cardW = W - 128;
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  roundRect(ctx, cardX, cardY, cardW, cardH, 32);
  ctx.fill();

  ctx.fillStyle = "#10182B";
  ctx.font = "600 28px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText("Entradas", cardX + 48, cardY + 90);
  ctx.font = "800 52px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillStyle = "#12876F";
  ctx.fillText(fmtBRL(w.income), cardX + 48, cardY + 150);

  ctx.fillStyle = "#10182B";
  ctx.font = "600 28px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText("Gastos", cardX + 48, cardY + 230);
  ctx.font = "800 52px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillStyle = "#C8433B";
  ctx.fillText(fmtBRL(w.expense), cardX + 48, cardY + 290);

  ctx.strokeStyle = "#E7E9EC";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cardX + 48, cardY + 330); ctx.lineTo(cardX + cardW - 48, cardY + 330); ctx.stroke();

  ctx.fillStyle = "#10182B";
  ctx.font = "600 26px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText("Categoria campeã", cardX + 48, cardY + 390);
  ctx.fillStyle = w.topCategoryColor;
  ctx.font = "800 42px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText(w.topCategoryName, cardX + 48, cardY + 440);
  ctx.fillStyle = "#5B6472";
  ctx.font = "500 26px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText(fmtBRL(w.topValue) + " no mês", cardX + 48, cardY + 480);

  ctx.fillStyle = "#10182B";
  ctx.font = "600 26px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText(w.saved >= 0 ? "Sobrou no mês" : "Ficou no vermelho", cardX + 48, cardY + 550);
  ctx.fillStyle = w.saved >= 0 ? "#12876F" : "#C8433B";
  ctx.font = "800 46px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText(fmtBRL(Math.abs(w.saved)), cardX + 48, cardY + 600);

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "500 26px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText(`${w.txCount} lançamentos registrados este mês`, 64, cardY + cardH + 70);
  ctx.font = "700 30px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText("Finanças; meu app financeiro", 64, H - 60);

  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function shareOrDownloadCanvas(canvas, filename) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return;
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Meu resumo financeiro" });
      return;
    } catch (e) { /* usuário cancelou o compartilhamento; cai para download */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
