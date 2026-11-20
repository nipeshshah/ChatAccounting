/* js/flows/view.js — View: debtor / creditor balances (plus the card helpers the statements reuse) */
/* ---- View ---- */

const TABLE_TH = "text-left font-semibold text-slate-500 uppercase tracking-wide pb-1.5 border-b border-slate-200 pr-2 whitespace-nowrap";

const TABLE_TD = "py-1.5 pr-2 border-b border-slate-100 align-top";

// View now shows debtor / creditor balances. The transaction history moved to Statement > Income & Expense.
async function viewMenu(){ await viewBalances(); }

const TX_ICONS = { "Sale": "ph-receipt", "Purchase": "ph-shopping-bag", "Debtor Receipt": "ph-hand-coins", "Creditor Payment": "ph-paper-plane-tilt", "Discount Allowed": "ph-tag", "Discount Received": "ph-tag" };

function dayLabel(iso){
  if(iso === todayISO()) return "Today";
  const y = new Date(); y.setDate(y.getDate() - 1);
  if(iso === localISO(y)) return "Yesterday";
  const parts = String(iso).split("-").map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  if(isNaN(d.getTime())) return esc(iso);
  const opts = { weekday: "short", day: "numeric", month: "short" };
  if(parts[0] !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString(undefined, opts);
}

function txCardHtml(e){
  const income = e.type === "income";
  const icon = TX_ICONS[e.category] || (income ? "ph-arrow-down-left" : "ph-arrow-up-right");
  const tint = income ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600";
  const amtColor = income ? "text-emerald-600" : "text-rose-600";
  const title = e.description || e.category || "Transaction";
  const sub = [e.category, e.account].filter(Boolean).map(esc).join(" · ");
  let gst = "";
  if(e.gstAmount !== undefined){
    const kind = e.taxSplit ? (e.taxSplit.type === "IGST" ? "IGST" : "CGST+SGST") : "GST";
    gst = `<div class="mt-0.5"><span class="inline-block text-[9px] font-semibold leading-none px-1.5 py-1 rounded bg-slate-200/70 text-slate-600">${kind} ${esc(e.gstPercent)}%</span></div>`;
  }
  return `<div class="flex items-center gap-2.5 bg-slate-50 border border-slate-100 rounded-xl px-2.5 py-2 mb-1.5">
    <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${tint}"><i class="ph-bold ${icon} text-sm"></i></div>
    <div class="min-w-0 flex-1">
      <div class="text-[12.5px] font-semibold text-slate-800 truncate">${esc(title)}</div>
      <div class="text-[10.5px] text-slate-500 truncate">${sub}</div>
    </div>
    <div class="text-right flex-shrink-0">
      <div class="font-mono text-[12.5px] font-bold ${amtColor}">${income ? "+" : "-"}${data.currency}${fmt(e.amount)}</div>
      ${gst}
    </div>
  </div>`;
}

async function viewBalances(){
  const card = newBotCard("ph-users");
  if(data.debtors.length === 0 && data.creditors.length === 0){
    card.innerHTML = `<p class="text-slate-800 text-[13.5px]">No debtors or creditors on record yet.</p>`;
    scrollBottom();
    return;
  }
  let html = "";
  if(data.debtors.length){
    html += `<p class="text-[13px] font-semibold text-slate-800 mb-1.5">Debtors (owe you)</p>
      <div class="overflow-x-auto -mx-1 mb-3"><table class="w-full text-[11px] font-mono border-collapse">
      <thead><tr><th class="${TABLE_TH}">Name</th><th class="${TABLE_TH} text-right">Balance</th></tr></thead><tbody>`;
    data.debtors.forEach(d => { html += `<tr><td class="${TABLE_TD}">${esc(d.name)}</td><td class="${TABLE_TD} text-right text-emerald-600">${data.currency}${fmt(d.balance)}</td></tr>`; });
    html += `</tbody></table></div>`;
  }
  if(data.creditors.length){
    html += `<p class="text-[13px] font-semibold text-slate-800 mb-1.5">Creditors (you owe)</p>
      <div class="overflow-x-auto -mx-1"><table class="w-full text-[11px] font-mono border-collapse">
      <thead><tr><th class="${TABLE_TH}">Name</th><th class="${TABLE_TH} text-right">Balance</th></tr></thead><tbody>`;
    data.creditors.forEach(c => { html += `<tr><td class="${TABLE_TD}">${esc(c.name)}</td><td class="${TABLE_TD} text-right text-rose-600">${data.currency}${fmt(c.balance)}</td></tr>`; });
    html += `</tbody></table></div>`;
  }
  card.innerHTML = html;
  scrollBottom();
  await askQuickReply([{ label: "Back to menu", value: "ok", icon: "ph-arrow-left" }]);
}
