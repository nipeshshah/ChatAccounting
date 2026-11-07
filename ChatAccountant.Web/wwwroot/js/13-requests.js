/* ============================================================================
   13-requests.js  -  Transaction requests between users
   Classic script: shares the global scope with the other js/*.js files.
   Load order is defined in index.html.
   ============================================================================ */
/* ================= TRANSACTION REQUESTS ================= */
// A transaction with a debtor/creditor who has a mobile number is sent to them as a REQUEST. Nothing reaches
// their books until they accept; on accept the app writes the mirror entry into THEIR OWN account,
// so nobody ever writes into someone else's data. Everything in a request was typed by another
// person, so it is validated before it is shown or stored, and escaped wherever it is displayed.
const SHARE_KINDS = ["sale", "purchase", "received", "paid", "discount_allowed", "discount_received"];
const SHARE_LABEL = { sale: "Credit sale", purchase: "Credit purchase", received: "Payment received", paid: "Payment made", discount_allowed: "Discount given", discount_received: "Discount received" };
// What a request, seen from the SENDER's side, becomes in the RECIPIENT's books
const MIRROR = {
  sale:     { list: "creditors", type: "expense", category: "Purchase",         sign:  1, done: "credit purchase from" },
  purchase: { list: "debtors",   type: "income",  category: "Sale",             sign:  1, done: "credit sale to" },
  received: { list: "creditors", type: "expense", category: "Creditor Payment", sign: -1, done: "payment to" },
  paid:     { list: "debtors",   type: "income",  category: "Debtor Receipt",   sign: -1, done: "receipt from" },
  // a cash discount settled together with a payment (see askShortfallDiscount)
  discount_allowed:  { list: "creditors", type: "income",  category: "Discount Received", sign: -1, done: "discount from" },
  discount_received: { list: "debtors",   type: "expense", category: "Discount Allowed",  sign: -1, done: "discount allowed to" }
};

function round2(n){ return Math.round(Number(n) * 100) / 100; }
function cleanText(v, max){
  return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max || 120);
}
function normalizePhone(v){
  var s = String(v == null ? "" : v).trim();
  if(!s) return "";
  var d = s.replace(/\D/g, "");
  if(s.charAt(0) !== "+"){
    if(d.length === 11 && d.charAt(0) === "0") d = "91" + d.slice(1);
    else if(d.length === 10) d = "91" + d;
  }
  return /^[1-9]\d{7,14}$/.test(d) ? "+" + d : "";
}
function isPhone(v){ return !!normalizePhone(v); }
function toNum(v){ if(v === null || v === undefined || v === "") return null; const n = Number(v); return isFinite(n) ? n : null; }

// Only the two known tax-split shapes, with real numbers (the bill template prints these unescaped)
// Known kind and a sane positive amount (the database column holds up to 999,999,999,999.99)
function shareIsUsable(ns){ return !!ns.kind && ns.entry.amount !== null && ns.entry.amount > 0 && ns.entry.amount < 1e12; }

function sanitizeSplit(sp){
  if(!sp || typeof sp !== "object") return null;
  if(sp.type === "CGST_SGST"){
    const a = [toNum(sp.cgstPercent), toNum(sp.sgstPercent), toNum(sp.cgstAmount), toNum(sp.sgstAmount)];
    return a.some(function(x){ return x === null; }) ? null : { type: "CGST_SGST", cgstPercent: a[0], sgstPercent: a[1], cgstAmount: a[2], sgstAmount: a[3] };
  }
  if(sp.type === "IGST"){
    const a = [toNum(sp.igstPercent), toNum(sp.igstAmount)];
    return a.some(function(x){ return x === null; }) ? null : { type: "IGST", igstPercent: a[0], igstAmount: a[1] };
  }
  return null;
}

// A trusted, display-safe copy of a request received from the server
function normalizeShare(s){
  const p = s.payload || {}, from = p.from || {}, e = p.entry || {};
  const dateOk = typeof e.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && !isNaN(new Date(e.date).getTime());
  const amount = toNum(e.amount);
  const out = {
    id: String(s.id), kind: SHARE_KINDS.indexOf(s.kind) >= 0 ? s.kind : null, status: s.status, createdAt: s.createdAt,
    fromPhone: normalizePhone(s.fromPhone), toPhone: normalizePhone(s.toPhone),
    from: { name: cleanText(from.name, 80), business: cleanText(from.business, 80), state: cleanText(from.state, 60), address: cleanText(from.address, 160), gstNumber: cleanText(from.gstNumber, 30) },
    toName: cleanText(p.toName, 80),
    entry: { date: dateOk ? e.date : todayISO(), amount: amount === null ? null : round2(amount), description: cleanText(e.description, 160), category: cleanText(e.category, 60), account: cleanText(e.account, 40) }
  };
  ["taxableAmount", "gstPercent", "gstAmount"].forEach(function(k){ const n = toNum(e[k]); if(n !== null) out.entry[k] = round2(n); });
  out.entry.taxSplit = sanitizeSplit(e.taxSplit);
  // GST fields must be complete or absent: derive a missing percentage from the amounts, else treat as non-GST
  if(out.entry.gstAmount !== undefined && out.entry.gstPercent === undefined){
    if(out.entry.taxableAmount > 0) out.entry.gstPercent = round2(out.entry.gstAmount / out.entry.taxableAmount * 100);
    else { delete out.entry.gstAmount; delete out.entry.taxableAmount; out.entry.taxSplit = null; }
  }
  out.label = out.from.business || out.from.name || out.fromPhone || "Unknown contact";
  out.toLabel = out.toName || out.toPhone;
  return out;
}

/* ---- sending ---- */
function shareSenderInfo(){
  const u = Panel.user || {}, shop = data.shop || {};
  return { name: u.name || "", business: shop.name || "", state: shop.state || "", address: shop.address || "", gstNumber: shop.gstNumber || "" };
}

// Called after a transaction with a debtor/creditor. Does nothing unless they have a mobile number.
// The sender's own entry is already saved; a failure here never undoes it.
async function shareWithParty(kind, party, entry){
  if(!Panel.supportsShares || !party || !party.phone) return;
  if(!Panel.user || !Panel.user.phone){
    await botSay(`Your entry is saved. To send a request to ${party.phone}, first verify your own mobile number in the Profile tab.`, { icon: "ph-warning" });
    return;
  }
  const e = { date: entry.date, amount: entry.amount, description: entry.description || "", category: entry.category || "" };
  ["taxableAmount", "gstPercent", "gstAmount"].forEach(function(k){ if(entry[k] !== undefined && entry[k] !== null) e[k] = entry[k]; });
  if(entry.taxSplit) e.taxSplit = entry.taxSplit;
  if(kind === "received" || kind === "paid") e.account = entry.account || "";   // payment mode; for sale/purchase "account" is just the party's name
  try{
    const saved = await Panel.shares.send({ kind: kind, toPhone: party.phone, payload: { from: shareSenderInfo(), toName: party.name, currency: data.currency, entry: e } });
    if(saved && saved.notifyStatus === "sent"){
      await botSay(`Request sent to ${party.phone} by SMS. It's added to their books only if they accept.`, { icon: "ph-paper-plane-tilt" });
    } else if(saved && saved.notifyStatus === "demo"){
      await botSay(`Demo mode: request stored for ${party.phone} — no SMS is sent. Sign in with that verified number to accept it.`, { icon: "ph-paper-plane-tilt" });
    } else {
      await botSay(`Request is waiting for ${party.phone} in the app. No SMS was sent, so they'll see it once they sign in with that verified number.`, { icon: "ph-paper-plane-tilt" });
    }
  }catch(err){
    await botSay(`Your entry is saved, but the request to ${party.phone} couldn't be sent (${err && err.message ? err.message : "unknown error"}).`, { icon: "ph-warning" });
  }
}

/* ---- receiving ---- */
let incomingShares = [], outgoingShares = [], requestsFlash = null, flashTimer = null;
const PROCESSING = {};

function updateRequestsBadge(){
  const n = incomingShares.length;
  $("#requestsBadge").text(n > 9 ? "9+" : String(n)).css("display", n ? "flex" : "none");
}

// Never rejects: a failed poll is simply retried on the next one.
function refreshRequests(){
  if(!Panel.supportsShares || !Panel.user) return Promise.resolve();
  const wantOut = currentPage === "requests";
  return new Promise(function(resolve){
    $.when(Panel.shares.listIncoming(), wantOut ? Panel.shares.listOutgoing() : null)
      .done(function(inc, out){
        // unusable requests are ignored entirely, so they can't inflate the badge or show an empty card
        incomingShares = (inc || []).filter(function(s){ return shareIsUsable(normalizeShare(s)); });
        if(wantOut) outgoingShares = out || [];
        updateRequestsBadge();
        if(currentPage === "requests") renderRequests();
      })
      .always(function(){ resolve(); });
  });
}

function flashRequests(msg, kind){
  requestsFlash = { msg: msg, kind: kind || "ok" };
  clearTimeout(flashTimer);
  flashTimer = setTimeout(function(){ requestsFlash = null; if(currentPage === "requests") renderRequests(); }, 7000);
  if(currentPage === "requests") renderRequests();
}

function incomingSummary(ns){
  const who = ns.label, amt = data.currency + fmt(ns.entry.amount);
  switch(ns.kind){
    case "sale":     return { title: who + " recorded a credit sale to you", effect: "Accepting adds a credit purchase of " + amt + " from " + who + " to your books, and you'll owe them " + amt + " more." };
    case "purchase": return { title: who + " recorded a credit purchase from you", effect: "Accepting adds a credit sale of " + amt + " to " + who + " in your books, and they'll owe you " + amt + " more." };
    case "received": return { title: who + " says they received " + amt + " from you", effect: "Accepting records a payment of " + amt + " to " + who + ", reducing what you owe them." };
    case "paid":     return { title: who + " says they paid you " + amt, effect: "Accepting records " + amt + " received from " + who + ", reducing what they owe you." };
    case "discount_allowed":  return { title: who + " gave you a discount of " + amt, effect: "Accepting records a discount of " + amt + " received from " + who + ", reducing what you owe them." };
    case "discount_received": return { title: who + " says you gave them a discount of " + amt, effect: "Accepting records a discount of " + amt + " allowed to " + who + ", reducing what they owe you." };
  }
  return null;
}

function statusChip(status){
  const map = { pending: ["Pending", "bg-amber-50 text-amber-700 border-amber-200"], accepted: ["Accepted", "bg-emerald-50 text-emerald-700 border-emerald-200"], rejected: ["Declined", "bg-rose-50 text-rose-700 border-rose-200"] };
  const m = map[status] || map.pending;
  return '<span class="inline-block text-[10px] font-semibold leading-none px-2 py-1 rounded-full border ' + m[1] + '">' + m[0] + '</span>';
}

function incomingCardHtml(s){
  const ns = normalizeShare(s), sum = incomingSummary(ns);
  if(!sum || !shareIsUsable(ns)) return "";
  const e = ns.entry;
  const gst = e.gstAmount !== undefined
    ? '<div class="text-[11px] font-mono text-slate-500 mt-1.5">' + (e.taxableAmount !== undefined ? "Taxable " + data.currency + fmt(e.taxableAmount) + " · " : "") + esc(e.taxSplit || e.gstPercent !== undefined ? describeGstSplit(e.taxSplit, e.gstPercent, e.gstAmount) : "GST " + data.currency + fmt(e.gstAmount)) + '</div>' : "";
  return '<div class="bg-white border border-slate-200 rounded-xl p-3 shadow-fintech-sm" data-share="' + esc(ns.id) + '">'
    + '<div class="flex items-start gap-2.5">'
    +   '<div class="w-8 h-8 rounded-full bg-corporate-navy text-white flex items-center justify-center text-[11px] font-bold flex-shrink-0">' + esc(initials(ns.label)) + '</div>'
    +   '<div class="min-w-0 flex-1"><div class="text-[12.5px] font-semibold text-slate-800 leading-snug">' + esc(sum.title) + '</div>'
    +   '<div class="text-[10.5px] text-slate-500 truncate">' + esc(ns.fromPhone) + ' · ' + esc(e.date) + '</div></div>'
    +   '<div class="font-mono text-[13px] font-bold text-slate-900 flex-shrink-0">' + data.currency + fmt(e.amount) + '</div>'
    + '</div>'
    + gst
    + (e.description ? '<div class="text-[11px] text-slate-600 mt-1">' + esc(e.description) + '</div>' : "")
    + '<p class="text-[11px] text-slate-600 mt-2 leading-snug bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5">' + esc(sum.effect) + '</p>'
    + '<div class="flex gap-2 mt-2.5">'
    +   '<button type="button" data-accept="' + esc(ns.id) + '" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg py-2">Accept</button>'
    +   '<button type="button" data-decline="' + esc(ns.id) + '" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-lg py-2">Decline</button>'
    + '</div></div>';
}

function outgoingRowHtml(s){
  const ns = normalizeShare(s);
  return '<div class="flex items-center gap-2.5 bg-white border border-slate-100 rounded-xl px-2.5 py-2">'
    + '<div class="min-w-0 flex-1"><div class="text-[12.5px] font-semibold text-slate-800 truncate">' + esc(ns.toLabel) + '</div>'
    + '<div class="text-[10.5px] text-slate-500 truncate">' + esc(SHARE_LABEL[ns.kind] || "Request") + ' · ' + esc(ns.entry.date) + '</div></div>'
    + '<div class="text-right flex-shrink-0"><div class="font-mono text-[12px] font-bold text-slate-800 mb-1">' + (ns.entry.amount === null ? "" : data.currency + fmt(ns.entry.amount)) + '</div>' + statusChip(ns.status) + '</div>'
    + '</div>';
}

function renderRequests(){
  const el = document.getElementById("requestsContent");
  if(!el) return;
  let html = "";
  if(requestsFlash){
    const bad = requestsFlash.kind === "error";
    html += '<div class="rounded-lg border px-3 py-2 text-[12px] font-medium ' + (bad ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-emerald-50 border-emerald-200 text-emerald-700") + '">' + esc(requestsFlash.msg) + '</div>';
  }
  if(!(Panel.user && Panel.user.phone)){
    html += '<div class="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-[12px] leading-snug">Verify your mobile number to send and receive requests. <button type="button" id="goVerifyPhone" class="font-bold underline">Verify now</button></div>';
  }
  html += '<div class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Needs your answer (' + incomingShares.length + ')</div>';
  const cards = incomingShares.map(incomingCardHtml).join("");
  html += cards || '<p class="text-xs text-slate-400 italic py-4 text-center">Nothing waiting. When someone you do business with sends you a transaction, it shows up here.</p>';
  html += '<div class="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-2">Sent by you</div>';
  html += outgoingShares.length ? outgoingShares.map(outgoingRowHtml).join("")
    : '<p class="text-xs text-slate-400 italic py-4 text-center">Add a mobile number to a debtor or creditor, and each transaction with them is sent here for confirmation.</p>';
  el.innerHTML = html;
  const goVerify = el.querySelector("#goVerifyPhone");
  if(goVerify) goVerify.onclick = function(){ showPage("profile"); };
  el.querySelectorAll("[data-accept]").forEach(function(b){ b.onclick = function(){ acceptShare(b.getAttribute("data-accept"), b.closest("[data-share]")); }; });
  el.querySelectorAll("[data-decline]").forEach(function(b){ b.onclick = function(){ declineShare(b.getAttribute("data-decline"), b.closest("[data-share]")); }; });
}

function lockRequestCard(card, label){
  if(!card) return;
  card.querySelectorAll("button").forEach(function(b){ b.disabled = true; b.classList.add("opacity-50"); });
  const acc = card.querySelector("[data-accept]");
  if(acc && label) acc.textContent = label;
}

// Where does this sender live in my books? By verified number first, then by name (adopting their number),
// otherwise a new debtor/creditor pre-filled with what they shared (state/address/GSTIN).
function planCounterparty(list, ns){
  const phone = ns.fromPhone, label = ns.label.toLowerCase();
  let p = phone ? list.find(function(x){ return normalizePhone(x.phone) === phone; }) : null;
  if(p) return { party: p, name: p.name, adoptPhone: false };
  p = list.find(function(x){ return !x.phone && partyHasName(x, label); });
  if(p) return { party: p, name: p.name, adoptPhone: true };
  const taken = list.some(function(x){ return partyHasName(x, label); });
  return { party: null, name: taken ? ns.label + " (" + phone + ")" : ns.label, adoptPhone: false };
}
function applyCounterparty(list, plan, ns){
  if(plan.party){ if(plan.adoptPhone) plan.party.phone = ns.fromPhone; return plan.party; }
  const party = { name: plan.name, balance: 0, phone: ns.fromPhone, state: ns.from.state, address: ns.from.address, gstNumber: ns.from.gstNumber };
  list.push(party);
  return party;
}

function buildMirrorEntry(ns, m, partyName){
  const e = ns.entry;
  const entry = { date: e.date, type: m.type, category: m.category, amount: e.amount, shareId: ns.id };
  if(ns.kind === "sale" || ns.kind === "purchase"){
    entry.account = partyName;
    entry.party = partyName;
    entry.description = e.description || ((ns.kind === "sale" ? "Credit purchase from " : "Credit sale to ") + partyName);
    ["taxableAmount", "gstPercent", "gstAmount"].forEach(function(k){ if(e[k] !== undefined) entry[k] = e[k]; });
    entry.taxSplit = e.taxSplit;
  } else if(ns.kind === "discount_allowed" || ns.kind === "discount_received"){
    entry.account = partyName;
    entry.party = partyName;
    entry.description = (ns.kind === "discount_allowed" ? "Discount received from " : "Discount allowed to ") + partyName;
  } else {
    entry.account = e.account || "Other";
    entry.description = (ns.kind === "received" ? "Paid to " : "Received from ") + partyName;
  }
  return entry;
}

// Each of the three steps can be retried safely: the ledger entry is tagged with the request id,
// the balance change is recorded in config.appliedShares, and the server only answers a request once.
async function acceptShare(id, card){
  if(PROCESSING[id]) return;
  const raw = incomingShares.find(function(s){ return s.id === id; });
  const ns = raw ? normalizeShare(raw) : null;
  if(!ns || !shareIsUsable(ns)){
    flashRequests("That request is incomplete, so it can't be accepted.", "error");
    return;
  }
  PROCESSING[id] = true;
  lockRequestCard(card, "Adding…");
  const m = MIRROR[ns.kind];
  const snapshot = JSON.stringify(data);
  try{
    const list = data[m.list];
    const plan = planCounterparty(list, ns);

    if(!ledger.some(function(e){ return e.shareId === ns.id; })){
      let saved = null;
      try{ saved = await Panel.ledger.add(buildMirrorEntry(ns, m, plan.name)); }
      catch(err){
        if(err && err.code === "23505"){ ledger = await Panel.ledger.list(); }   // recorded already (e.g. in another tab)
        else throw err;
      }
      if(saved) ledger.push(saved);
      updateSummary();
    }

    data.appliedShares = Array.isArray(data.appliedShares) ? data.appliedShares : [];
    if(data.appliedShares.indexOf(ns.id) < 0){
      const party = applyCounterparty(list, plan, ns);
      party.balance = round2((Number(party.balance) || 0) + m.sign * ns.entry.amount);
      data.appliedShares = data.appliedShares.concat(ns.id).slice(-500);
      try{ await Panel.config.save(data); }
      catch(err){ data = JSON.parse(snapshot); throw err; }
    }

    await Panel.shares.respond(ns.id, "accepted");
    incomingShares = incomingShares.filter(function(x){ return x.id !== ns.id; });   // drop the card right away
    updateRequestsBadge();
    flashRequests("Accepted — added to your books: " + m.done + " " + plan.name + " (" + data.currency + fmt(ns.entry.amount) + ").");
  }catch(err){
    flashRequests("Couldn't finish accepting (" + (err && err.message ? err.message : "unknown error") + "). Nothing is lost — tap Accept again to retry.", "error");
  }finally{
    delete PROCESSING[id];
    await refreshRequests();
  }
}

async function declineShare(id, card){
  if(PROCESSING[id]) return;
  if(!confirm("Decline this request? Nothing will be added to your books.")) return;
  PROCESSING[id] = true;
  lockRequestCard(card);
  try{
    await Panel.shares.respond(id, "rejected");
    incomingShares = incomingShares.filter(function(x){ return x.id !== id; });
    updateRequestsBadge();
    flashRequests("Declined. Nothing was added to your books.");
  }catch(err){
    flashRequests("Couldn't decline (" + (err && err.message ? err.message : "unknown error") + ").", "error");
  }finally{
    delete PROCESSING[id];
    await refreshRequests();
  }
}
