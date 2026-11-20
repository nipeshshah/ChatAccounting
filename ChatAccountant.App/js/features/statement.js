/* js/features/statement.js — debtor / creditor statement: engine, on-screen view, chat flow, Manage view */
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

function periodLine(p){
  if(p.key === "custom" || !p.from) return esc(p.label);
  return esc(p.label) + " · " + (p.from === p.to ? shortDate(p.from) : shortDate(p.from) + " – " + shortDate(p.to));
}

// Statements show the invoice number, never the free-text description. Entries that have no invoice
// (receipts, payments, discounts, older sales) get a plain label instead.
function statementDescription(e){
  if(e.invoiceNo) return "Invoice " + e.invoiceNo;
  switch(e.category){
    case "Debtor Receipt":    return "Payment received";
    case "Creditor Payment":  return "Payment made";
    case "Discount Allowed":  return "Discount allowed";
    case "Discount Received": return "Discount received";
  }
  return e.category || "Transaction";
}

function statementPeriod(key){
  if(key === "today" || key === "week") return reportPeriod(key);      // same periods as Reporting
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

function statementHtml(st){
  const debtor = st.kind === "debtor";
  const who = esc(st.party.name);
  const meaning = debtor ? "owed to you" : "you owe";
  let html = '<div class="flex items-start justify-between gap-2 mb-2">'
    + '<div class="min-w-0"><p class="text-[13px] font-semibold text-slate-800 truncate">Statement · ' + who + '</p>'
    + '<p class="text-[10.5px] text-slate-500 truncate">' + periodLine(st.period) + (st.party.phone ? " · " + esc(st.party.phone) : "") + '</p></div>'
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
    const title = statementDescription(r.e), sub = "";
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

// Income & Expense statement: every entry in the period, oldest first, with totals of what came in and went out
function buildTransactionsStatement(period){
  const rows = ledger.map(function(e, i){ return { e: e, i: i }; })
    .filter(function(x){ return reportInPeriod(x.e, period); })
    .sort(function(a, b){ return a.e.date < b.e.date ? -1 : a.e.date > b.e.date ? 1 : a.i - b.i; })
    .map(function(x){ return x.e; });
  let totalIn = 0, totalOut = 0;
  rows.forEach(function(e){ if(e.type === "income") totalIn += Number(e.amount) || 0; else totalOut += Number(e.amount) || 0; });
  totalIn = round2(totalIn); totalOut = round2(totalOut);
  return { kind: "transactions", period: period, rows: rows, totalIn: totalIn, totalOut: totalOut, net: round2(totalIn - totalOut) };
}
function transactionsHtml(st){
  const box = function(label, value, cls){ return '<div class="rounded-lg px-2.5 py-1.5 ' + cls + '"><div class="text-[9.5px] font-bold uppercase tracking-wide opacity-70">' + label + '</div><div class="font-mono text-[12.5px] font-bold">' + value + '</div></div>'; };
  let html = '<div class="flex items-start justify-between gap-2 mb-2"><div class="min-w-0"><p class="text-[13px] font-semibold text-slate-800">Income &amp; Expense statement</p>'
    + '<p class="text-[10.5px] text-slate-500 truncate">' + periodLine(st.period) + '</p></div>'
    + '<span class="text-[10.5px] font-mono font-semibold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">' + st.rows.length + '</span></div>'
    + '<div class="grid grid-cols-3 gap-1.5 mb-2.5">' + box("Total in", sm(st.totalIn), "bg-emerald-50 text-emerald-700") + box("Total out", sm(st.totalOut), "bg-rose-50 text-rose-700") + box("Net", sm(st.net), "bg-corporate-navy text-white") + '</div>';
  if(!st.rows.length) return html + '<p class="text-[12px] text-slate-500 py-3 text-center">No transactions in this period.</p>';
  let last = null;
  st.rows.forEach(function(e){
    if(e.date !== last){ html += '<div class="text-[10.5px] font-bold uppercase tracking-wide text-slate-400 mb-1.5 px-0.5 ' + (last === null ? "" : "mt-3") + '">' + dayLabel(e.date) + '</div>'; last = e.date; }
    html += txCardHtml(e);
  });
  return html;
}

// Statement: debtor, creditor, or income & expense. Today's statement is shown straight away;
// the buttons below switch period, print or share it.
const STATEMENT_PERIODS = [["today", "Today"], ["week", "This week"], ["month", "This month"], ["lastmonth", "Last month"], ["all", "All time"]];
async function statementViewer(make){
  let period = statementPeriod("today"), view = null;
  while(true){
    let card = null;
    if(!view){ view = make(period); card = newBotCard("ph-scroll"); card.innerHTML = view.html; }
    else await botSay("Anything else with this statement?", { icon: "ph-scroll" });
    const opts = [{ label: "Print", value: "print", icon: "ph-printer" }, { label: "Share", value: "share", icon: "ph-share-network" }];
    STATEMENT_PERIODS.forEach(function(p){ if(p[0] !== period.key) opts.push({ label: p[1], value: "p:" + p[0], icon: "ph-calendar" }); });
    opts.push({ label: "Custom range", value: "custom", icon: "ph-sliders" }, { label: "Done", value: "done", icon: "ph-check" });
    const pending = askQuickReply(opts);
    // askQuickReply scrolls to the bottom; show the top of a freshly drawn statement
    if(card) chatLog.scrollTop = Math.max(0, card.getBoundingClientRect().top - chatLog.getBoundingClientRect().top + chatLog.scrollTop - 12);
    const act = await pending;
    if(act === "done") return;
    if(act === "print"){ printDocument(view.doc); await botSay("Sent to print (" + PRINT_MODES[view.doc.mode].label + ").", { icon: "ph-check-circle" }); continue; }
    if(act === "share"){ await shareFlow(view.doc); continue; }
    if(act === "custom"){
      await botSay("From which date?", { icon: "ph-calendar" });
      let from = await askText("From date", { required: true, dateInput: true });
      await botSay("To which date?", { icon: "ph-calendar" });
      let to = await askText("To date", { required: true, dateInput: true });
      if(from > to){ const t = from; from = to; to = t; }
      period = { key: "custom", label: shortDate(from) + " – " + shortDate(to), from: from, to: to };
    } else period = statementPeriod(act.slice(2));
    view = null;                                  // draw the new period
  }
}

// Quick-menu flow
async function statementFlow(){
  await botSay("Statement for?", { icon: "ph-scroll" });
  const kind = await askQuickReply([
    { label: "Debtor", value: "debtor", variant: "income", icon: "ph-user" },
    { label: "Creditor", value: "creditor", variant: "expense", icon: "ph-user" },
    { label: "Income & Expense", value: "tx", icon: "ph-arrows-left-right" }
  ]);
  if(kind === "tx"){
    await statementViewer(function(period){ const st = buildTransactionsStatement(period); return { html: transactionsHtml(st), doc: buildTransactionsDoc(st) }; });
    return;
  }
  const list = kind === "debtor" ? data.debtors : data.creditors;
  if(!list.length){ await botSay(`No ${kind}s yet — add one from Manage first.`, { icon: "ph-info" }); return; }
  await botSay(`Which ${kind}?`, { icon: "ph-user" });
  const idx = await askQuickReply(list.map((p, i) => ({ label: `${p.name} — ${data.currency}${fmt(p.balance)}`, value: String(i), icon: "ph-user" })));
  const party = list[parseInt(idx, 10)];
  await statementViewer(function(period){ const st = buildStatement(party, kind, period); return { html: statementHtml(st), doc: buildStatementDoc(st) }; });
}

// Manage > Debtors / Creditors: statement view with period chips
let stmtPeriodKey = "today";

function openStatementView(list, index, roleLabel){
  const el = document.getElementById("manageContent");
  const party = list[index];
  function draw(){
    const st = buildStatement(party, roleLabel, statementPeriod(stmtPeriodKey));
    const chips = [["today", "Today"], ["month", "This month"], ["lastmonth", "Last month"], ["all", "All time"]].map(function(c){
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
      msg.textContent = r === "shared" ? "Shared." : r === "downloaded" ? (isMobileDevice() ? "This browser can't share files, so the PDF was saved." : "The PDF was saved to your Downloads folder — attach it from there.") : "";
    };
    el.querySelectorAll("[data-period]").forEach(function(b){ b.onclick = function(){ stmtPeriodKey = b.getAttribute("data-period"); draw(); }; });
    el.scrollTop = 0;
  }
  draw();
}
