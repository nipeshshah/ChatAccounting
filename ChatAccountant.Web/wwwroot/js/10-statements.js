/* ============================================================================
   10-statements.js  -  Debtor / creditor statements
   Classic script: shares the global scope with the other js/*.js files.
   Load order is defined in index.html.
   ============================================================================ */
/* ================= DEBTOR / CREDITOR STATEMENT ================= */
// Which party does a ledger entry belong to, and how does it move that party's balance?
// Older receipts/payments have no `party` field, so they are recognised from their fixed description.
function entryPartyName(e){
  if(e.party) return e.party;
  if(e.category === "Debtor Receipt" || e.category === "Creditor Payment"){
    const m = /^(?:Received from|Paid to) (.+)$/.exec(String(e.description || ""));
    if(m) return m[1];
  }
  return null;
}
function entryPartyEffect(e){
  const c = e.category;
  if(c === "Debtor Receipt" || c === "Discount Allowed") return { list: "debtors", sign: -1 };
  if(c === "Creditor Payment" || c === "Discount Received") return { list: "creditors", sign: -1 };
  if(e.party) return e.type === "income" ? { list: "debtors", sign: 1 } : { list: "creditors", sign: 1 };
  return null;
}

function statementPeriod(key){
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  if(key === "month") return { key: key, label: "This month", from: localISO(new Date(y, m, 1)), to: localISO(new Date(y, m + 1, 0)) };
  if(key === "lastmonth") return { key: key, label: "Last month", from: localISO(new Date(y, m - 1, 1)), to: localISO(new Date(y, m, 0)) };
  return { key: "all", label: "All time", from: null, to: null };
}

// The party's current balance is the source of truth; the opening balance is whatever is left once every
// recorded entry is taken off it (so it also covers an opening balance typed in by hand).
function buildStatement(party, kind, period){
  const listName = kind === "debtor" ? "debtors" : "creditors";
  const all = [];
  ledger.forEach(function(e, i){
    const name = entryPartyName(e);
    if(!name || !partyHasName(party, name)) return;
    const eff = entryPartyEffect(e);
    if(!eff || eff.list !== listName) return;
    all.push({ e: e, i: i, delta: round2(eff.sign * Number(e.amount)) });
  });
  all.sort(function(a, b){ return a.e.date < b.e.date ? -1 : a.e.date > b.e.date ? 1 : a.i - b.i; });
  const total = all.reduce(function(s, x){ return s + x.delta; }, 0);
  let bal = round2((Number(party.balance) || 0) - total), opening = bal;
  const rows = [];
  let increase = 0, decrease = 0;
  all.forEach(function(x){
    if(period.from && x.e.date < period.from){ bal = round2(bal + x.delta); opening = bal; return; }
    if(period.to && x.e.date > period.to) return;
    bal = round2(bal + x.delta);
    rows.push({ e: x.e, delta: x.delta, balance: bal });
    if(x.delta > 0) increase = round2(increase + x.delta); else decrease = round2(decrease - x.delta);
  });
  return { kind: kind, party: party, period: period, rows: rows, opening: opening, closing: bal, increase: increase, decrease: decrease };
}

function sm(n){ return n < 0 ? "-" + data.currency + fmt(-n) : data.currency + fmt(n); }
function shortDate(iso){
  const p = String(iso).split("-").map(Number);
  const d = new Date(p[0], p[1] - 1, p[2]);
  return isNaN(d.getTime()) ? esc(iso) : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" });
}

function statementHtml(st){
  const debtor = st.kind === "debtor";
  const who = esc(st.party.name);
  const meaning = debtor ? "owed to you" : "you owe";
  let html = '<div class="flex items-start justify-between gap-2 mb-2">'
    + '<div class="min-w-0"><p class="text-[13px] font-semibold text-slate-800 truncate">Statement · ' + who + '</p>'
    + '<p class="text-[10.5px] text-slate-500 truncate">' + esc(st.period.label) + (st.party.phone ? " · " + esc(st.party.phone) : "") + '</p></div>'
    + '<span class="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ' + (debtor ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700") + '">' + (debtor ? "Debtor" : "Creditor") + '</span></div>'
    + '<div class="grid grid-cols-2 gap-1.5 mb-2">'
    +   '<div class="rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-1.5"><div class="text-[9.5px] font-bold uppercase tracking-wide text-slate-400">Opening</div><div class="font-mono text-[12.5px] font-bold text-slate-800">' + sm(st.opening) + '</div></div>'
    +   '<div class="rounded-lg bg-corporate-navy px-2.5 py-1.5"><div class="text-[9.5px] font-bold uppercase tracking-wide text-slate-300">Closing · ' + meaning + '</div><div class="font-mono text-[12.5px] font-bold text-white">' + sm(st.closing) + '</div></div>'
    + '</div>';
  if(!st.rows.length){
    return html + '<p class="text-[12px] text-slate-500 py-3 text-center">No transactions in this period.</p>';
  }
  html += '<div class="overflow-x-auto -mx-1"><table class="w-full text-[11px] font-mono border-collapse">'
    + '<thead><tr><th class="' + TABLE_TH + '">Date</th><th class="' + TABLE_TH + '">Details</th><th class="' + TABLE_TH + ' text-right">Amount</th><th class="' + TABLE_TH + ' text-right">Balance</th></tr></thead><tbody>';
  st.rows.forEach(function(r){
    const title = r.e.description || r.e.category || "Transaction";
    const sub = r.e.description && r.e.category && r.e.description !== r.e.category ? '<div class="text-[9.5px] text-slate-400 font-sans">' + esc(r.e.category) + '</div>' : "";
    html += '<tr><td class="' + TABLE_TD + ' whitespace-nowrap">' + shortDate(r.e.date) + '</td>'
      + '<td class="' + TABLE_TD + ' font-sans">' + esc(title) + sub + '</td>'
      + '<td class="' + TABLE_TD + ' text-right whitespace-nowrap ' + (r.delta > 0 ? "text-slate-800" : "text-emerald-600") + '">' + (r.delta > 0 ? "+" : "-") + data.currency + fmt(Math.abs(r.delta)) + '</td>'
      + '<td class="' + TABLE_TD + ' text-right whitespace-nowrap">' + sm(r.balance) + '</td></tr>';
  });
  html += '</tbody></table></div>'
    + '<div class="flex items-center justify-between text-[10.5px] text-slate-500 mt-2 px-0.5">'
    + '<span>' + (debtor ? "Billed" : "Purchased") + ' <b class="font-mono text-slate-700">' + data.currency + fmt(st.increase) + '</b></span>'
    + '<span>' + (debtor ? "Received" : "Paid") + ' <b class="font-mono text-emerald-600">' + data.currency + fmt(st.decrease) + '</b></span></div>';
  return html;
}

// ---- statement markup: 3-inch receipt, and A4/A5 page ----
// Content rule for every size: the date once per day, description on the left, DR/CR amount on the right,
// and the balance only at the end (no running balance per line).
function statementDocParts(st){
  const debtor = st.kind === "debtor";
  // DR / CR is standard: a debtor's balance grows with a DEBIT; a creditor's grows with a CREDIT.
  const isDr = function(r){ return debtor ? r.delta > 0 : r.delta < 0; };
  return {
    debtor: debtor, isDr: isDr,
    debitTotal: debtor ? st.increase : st.decrease,
    creditTotal: debtor ? st.decrease : st.increase,
    periodText: esc(st.period.label) + (st.period.from ? " (" + shortDate(st.period.from) + " – " + shortDate(st.period.to) + ")" : "")
  };
}
function statementHtmlThermal(st){
  const shop = data.shop || {}, p = st.party, d = statementDocParts(st), debtor = d.debtor;
  let lastDate = null;
  const entriesHtml = st.rows.map(function(r){
    let head = "";
    if(r.e.date !== lastDate){ head = '<div class="dt">' + shortDate(r.e.date) + '</div>'; lastDate = r.e.date; }
    return head + '<div class="row"><span class="ds">' + esc(r.e.description || r.e.category || "Transaction") + '</span>'
      + '<span class="am"><b>' + (d.isDr(r) ? "DR" : "CR") + '</b> ' + fmt(Math.abs(r.delta)) + '</span></div>';
  }).join("");
  return `
    <div class="doc doc-thermal">
      <p class="shop">${esc(shop.name) || "Your Business"}</p>
      ${shop.address ? `<div class="meta">${esc(shop.address)}</div>` : ""}
      ${shop.gstNumber ? `<div class="meta">GSTIN: ${esc(shop.gstNumber)}</div>` : ""}
      <div class="ttl">STATEMENT OF ACCOUNT</div>
      <div class="meta">${d.periodText}</div>
      <div class="meta">Printed ${shortDate(todayISO())}</div>
      <div class="sep"></div>
      <div class="meta">${debtor ? "Customer (Debtor)" : "Supplier (Creditor)"}</div>
      <div class="nm">${esc(p.name)}</div>
      ${p.address ? `<div class="meta">${esc(p.address)}</div>` : ""}
      ${p.gstNumber ? `<div class="meta">GSTIN: ${esc(p.gstNumber)}</div>` : ""}
      ${p.phone ? `<div class="meta">Mobile: ${esc(p.phone)}</div>` : ""}
      <div class="sep"></div>
      <div class="row bold"><span class="ds">Opening balance</span><span class="am">${sm(st.opening)}</span></div>
      <div class="sep"></div>
      ${entriesHtml || '<div class="ctr" style="padding:6px 0;">No transactions in this period</div>'}
      <div class="sep"></div>
      <div class="row"><span class="ds">Total DR</span><span class="am">${fmt(d.debitTotal)}</span></div>
      <div class="row"><span class="ds">Total CR</span><span class="am">${fmt(d.creditTotal)}</span></div>
      <div class="close"><span>CLOSING BALANCE</span><span>${sm(st.closing)}</span></div>
      <div class="sub">${debtor ? "Receivable from customer" : "Payable to supplier"}</div>
      <div class="sep"></div>
      <div class="meta">Amounts in ${esc(data.currency)} · DR = debit, CR = credit</div>
      <div class="foot">Generated by Chat Accountant</div>
    </div>`;
}
function statementHtmlPage(st, mode){
  const shop = data.shop || {}, p = st.party, d = statementDocParts(st), debtor = d.debtor;
  const cur = function(n){ return data.currency + fmt(n); };
  let lastDate = null;
  const rows = st.rows.map(function(r){
    let head = "";
    if(r.e.date !== lastDate){ head = '<tr class="dg"><td colspan="3">' + shortDate(r.e.date) + '</td></tr>'; lastDate = r.e.date; }
    const amt = cur(Math.abs(r.delta)), dr = d.isDr(r);
    return head + '<tr><td>' + esc(r.e.description || r.e.category || "Transaction") + '</td><td class="r">' + (dr ? amt : "") + '</td><td class="r">' + (dr ? "" : amt) + '</td></tr>';
  }).join("");
  return `
    <div class="doc doc-page doc-${mode}">
      <div class="hdr">
        <div>
          <div class="bn">${esc(shop.name) || "Your Business"}</div>
          ${shop.address ? `<div class="bm">${esc(shop.address)}</div>` : ""}
          ${shop.gstNumber ? `<div class="bm">GSTIN: ${esc(shop.gstNumber)}</div>` : ""}
        </div>
        <div class="rt">
          <div class="dtitle">STATEMENT OF ACCOUNT</div>
          <div class="bm">${d.periodText}</div>
          <div class="bm">Printed ${shortDate(todayISO())}</div>
        </div>
      </div>
      <div class="party">
        <div class="pl">${debtor ? "Customer (Debtor)" : "Supplier (Creditor)"}</div>
        <div class="pn">${esc(p.name)}</div>
        ${p.address ? `<div class="bm">${esc(p.address)}</div>` : ""}
        ${p.gstNumber ? `<div class="bm">GSTIN: ${esc(p.gstNumber)}</div>` : ""}
        ${p.phone ? `<div class="bm">Mobile: ${esc(p.phone)}</div>` : ""}
      </div>
      <div class="strip">
        <div class="sb"><div class="sbl">Opening balance</div><div class="sbv">${sm(st.opening)}</div></div>
        <div class="sb"><div class="sbl">Total debit (DR)</div><div class="sbv">${cur(d.debitTotal)}</div></div>
        <div class="sb"><div class="sbl">Total credit (CR)</div><div class="sbv">${cur(d.creditTotal)}</div></div>
        <div class="sb dark"><div class="sbl">Closing balance</div><div class="sbv">${sm(st.closing)}</div></div>
      </div>
      <table class="stm">
        <thead><tr><th>Description</th><th class="r">Debit (DR)</th><th class="r">Credit (CR)</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="3" style="text-align:center;color:#94A3B8;">No transactions in this period</td></tr>'}
        <tr class="tt"><td>Total</td><td class="r">${cur(d.debitTotal)}</td><td class="r">${cur(d.creditTotal)}</td></tr></tbody>
      </table>
      <div class="closeline"><span>Closing balance <span class="closenote">(${debtor ? "receivable from customer" : "payable to supplier"})</span></span><span>${sm(st.closing)}</span></div>
      <div class="ft">Generated by Chat Accountant</div>
    </div>`;
}
function buildStatementDoc(st){
  const mode = getPrintMode();
  const safe = String(st.party.name).replace(/[^\w\-]+/g, "_");
  return {
    mode: mode,
    html: mode === "thermal" ? statementHtmlThermal(st) : statementHtmlPage(st, mode),
    title: "Statement · " + st.party.name,
    filename: "Statement-" + safe + "-" + todayISO() + ".pdf"
  };
}

// Quick-menu flow
async function statementFlow(){
  await botSay("Statement for a debtor or a creditor?", { icon: "ph-scroll" });
  const kind = await askQuickReply([
    { label: "Debtor", value: "debtor", variant: "income", icon: "ph-user" },
    { label: "Creditor", value: "creditor", variant: "expense", icon: "ph-user" }
  ]);
  const list = kind === "debtor" ? data.debtors : data.creditors;
  if(!list.length){ await botSay(`No ${kind}s yet — add one from Manage first.`, { icon: "ph-info" }); return; }
  await botSay(`Which ${kind}?`, { icon: "ph-user" });
  const idx = await askQuickReply(list.map((p, i) => ({ label: `${p.name} — ${data.currency}${fmt(p.balance)}`, value: String(i), icon: "ph-user" })));
  const party = list[parseInt(idx, 10)];

  await botSay("Which period?", { icon: "ph-calendar" });
  const key = await askQuickReply([
    { label: "All time", value: "all", icon: "ph-infinity" },
    { label: "This month", value: "month", icon: "ph-calendar" },
    { label: "Last month", value: "lastmonth", icon: "ph-calendar" },
    { label: "Custom range", value: "custom", icon: "ph-sliders" }
  ]);
  let period;
  if(key === "custom"){
    await botSay("From which date?", { icon: "ph-calendar" });
    let from = await askText("From date", { required: true, dateInput: true });
    await botSay("To which date?", { icon: "ph-calendar" });
    let to = await askText("To date", { required: true, dateInput: true });
    if(from > to){ const t = from; from = to; to = t; }
    period = { key: "custom", label: shortDate(from) + " – " + shortDate(to), from: from, to: to };
  } else period = statementPeriod(key);

  const st = buildStatement(party, kind, period);
  const card = newBotCard("ph-scroll");
  card.innerHTML = statementHtml(st);
  const doc = buildStatementDoc(st);
  const first = askQuickReply([
    { label: "Print statement", value: "print", icon: "ph-printer" },
    { label: "Share statement", value: "share", icon: "ph-share-network" },
    { label: "Done", value: "done", icon: "ph-check" }
  ]);
  // askQuickReply scrolls to the bottom; jump back to the top of the statement
  chatLog.scrollTop = Math.max(0, card.getBoundingClientRect().top - chatLog.getBoundingClientRect().top + chatLog.scrollTop - 12);
  await outputDocument(doc, await first, "statement");
}

// Manage > Debtors / Creditors: statement view with period chips
let stmtPeriodKey = "all";
function openStatementView(list, index, roleLabel){
  const el = document.getElementById("manageContent");
  const party = list[index];
  function draw(){
    const st = buildStatement(party, roleLabel, statementPeriod(stmtPeriodKey));
    const chips = [["all", "All time"], ["month", "This month"], ["lastmonth", "Last month"]].map(function(c){
      const on = c[0] === stmtPeriodKey;
      return '<button type="button" data-period="' + c[0] + '" class="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border ' + (on ? "bg-corporate-navy text-white border-corporate-navy" : "bg-white text-slate-600 border-slate-200") + '">' + c[1] + '</button>';
    }).join("");
    el.innerHTML = '<div class="flex items-center justify-between gap-2">'
      + '<button type="button" id="stmtBack" class="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1"><i class="ph-bold ph-arrow-left text-xs"></i> Back</button>'
      + '<div class="flex gap-1.5"><button type="button" id="stmtShare" class="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1"><i class="ph-bold ph-share-network text-xs"></i> <span>Share</span></button>'
      + '<button type="button" id="stmtPrint" class="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1"><i class="ph-bold ph-printer text-xs"></i> Print</button></div></div>'
      + '<p id="stmtMsg" class="text-[11px] font-semibold text-slate-500 min-h-[14px]"></p>'
      + '<div class="flex gap-1.5 overflow-x-auto no-scrollbar">' + chips + '</div>'
      + '<div class="bg-white border border-slate-200 rounded-xl p-3 shadow-fintech-sm">' + statementHtml(st) + '</div>';
    el.querySelector("#stmtBack").onclick = function(){ renderManageSection(); };
    const doc = buildStatementDoc(st);
    el.querySelector("#stmtPrint").onclick = function(){ printDocument(doc); };
    el.querySelector("#stmtShare").onclick = async function(){
      const btn = this, label = btn.querySelector("span"), msg = el.querySelector("#stmtMsg");
      btn.disabled = true; label.textContent = "Preparing…"; msg.textContent = "";
      let blob;
      try{ blob = await getDocPdf(doc); }
      catch(e){ msg.textContent = "Couldn't prepare the PDF — " + (e && e.message ? e.message : "unknown error") + "."; btn.disabled = false; label.textContent = "Share"; return; }
      const r = await sharePdfBlob(blob, doc.filename, doc.title);
      btn.disabled = false;
      if(r === "blocked"){ label.textContent = "Tap to share"; msg.textContent = "PDF ready — tap again to open the share sheet."; return; }
      label.textContent = "Share";
      msg.textContent = r === "shared" ? "Shared." : r === "downloaded" ? "This browser can't share files, so the PDF was downloaded." : "";
    };
    el.querySelectorAll("[data-period]").forEach(function(b){ b.onclick = function(){ stmtPeriodKey = b.getAttribute("data-period"); draw(); }; });
    el.scrollTop = 0;
  }
  draw();
}
