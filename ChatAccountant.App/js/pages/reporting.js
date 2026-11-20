/* js/pages/reporting.js — Reporting tab: period filter + totals, category breakdowns, creditors & debtors */
const REPORT_PERIODS = [["today", "Today"], ["week", "This week"], ["month", "This month"], ["fy", "Current FY"], ["lastfy", "Last FY"]];
let reportPeriodKey = "today";

function repCard(label, value, tone, sub){
  const color = tone === "in" ? "text-emerald-600" : tone === "out" ? "text-rose-600" : "text-slate-900";
  return '<div class="bg-white border border-slate-200 rounded-xl p-3 shadow-fintech-sm min-w-0">'
    + '<div class="text-[11px] font-bold uppercase tracking-wide text-slate-500">' + label + '</div>'
    + '<div class="font-mono text-[16px] font-bold mt-1 break-words ' + color + '">' + value + '</div>'
    + (sub ? '<div class="text-[11px] text-slate-500 mt-0.5">' + sub + '</div>' : '') + '</div>';
}
function repSection(title, inner){
  return '<section><h3 class="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 px-0.5">' + title + '</h3>' + inner + '</section>';
}
function repCategoryList(map, tone){
  const rows = Object.keys(map).map(function(k){ return { k: k, v: round2(map[k]) }; }).filter(function(x){ return x.v > 0; }).sort(function(a, b){ return b.v - a.v; });
  if(!rows.length) return '<div class="bg-white border border-slate-200 rounded-xl p-3 shadow-fintech-sm text-[13px] text-slate-400 text-center">Nothing in this period.</div>';
  const max = rows[0].v, bar = tone === "in" ? "bg-emerald-500" : "bg-rose-500";
  return '<div class="bg-white border border-slate-200 rounded-xl p-3 shadow-fintech-sm space-y-2.5">' + rows.map(function(x){
    return '<div><div class="flex items-baseline justify-between gap-2"><span class="text-[14px] text-slate-800 truncate">' + esc(x.k) + '</span>'
      + '<span class="font-mono text-[14px] font-bold text-slate-900 flex-shrink-0">' + data.currency + fmt(x.v) + '</span></div>'
      + '<div class="h-1.5 rounded-full bg-slate-100 mt-1 overflow-hidden"><div class="h-full rounded-full ' + bar + '" style="width:' + Math.max(3, Math.round(x.v / max * 100)) + '%"></div></div></div>';
  }).join("") + '</div>';
}
// per-party sale / purchase for the period; parties with no activity are left out
function repPartyList(rows, kind){
  const active = rows.filter(function(x){ return x.amount > 0; }).sort(function(a, b){ return b.amount - a.amount; });
  const noun = kind === "debtor" ? "sale" : "purchase", owes = kind === "debtor" ? "owes you" : "you owe";
  if(!active.length) return '<div class="bg-white border border-slate-200 rounded-xl p-3 shadow-fintech-sm text-[13px] text-slate-400 text-center">No ' + noun + 's to ' + (kind === "debtor" ? "debtors" : "creditors") + ' in this period.</div>';
  const total = round2(active.reduce(function(s, x){ return s + x.amount; }, 0));
  return '<div class="bg-white border border-slate-200 rounded-xl shadow-fintech-sm divide-y divide-slate-100">' + active.map(function(x){
    return '<div class="flex items-center justify-between gap-3 px-3 py-2.5"><div class="min-w-0"><div class="text-[14px] font-semibold text-slate-800 truncate">' + esc(x.name) + '</div>'
      + '<div class="text-[12px] text-slate-500">' + x.count + ' ' + noun + (x.count === 1 ? '' : 's') + (x.balance ? ' · ' + sm(x.balance) + ' ' + owes : '') + '</div></div>'
      + '<div class="font-mono text-[14px] font-bold text-slate-900 flex-shrink-0">' + data.currency + fmt(x.amount) + '</div></div>';
  }).join("") + '<div class="flex items-center justify-between px-3 py-2.5 bg-slate-50 rounded-b-xl"><span class="text-[12px] font-bold uppercase tracking-wide text-slate-500">Total</span>'
    + '<span class="font-mono text-[14px] font-bold text-slate-900">' + data.currency + fmt(total) + '</span></div></div>';
}

function renderReporting(){
  const period = reportPeriod(reportPeriodKey), r = buildReport(period), cur = data.currency;
  const chips = document.getElementById("reportPeriods");
  chips.innerHTML = REPORT_PERIODS.map(function(p){
    return '<button type="button" data-rp="' + p[0] + '" class="period-chip flex-shrink-0' + (p[0] === reportPeriodKey ? " active" : "") + '">' + p[1] + '</button>';
  }).join("");
  chips.querySelectorAll("[data-rp]").forEach(function(b){
    b.onclick = function(){ reportPeriodKey = b.getAttribute("data-rp"); renderReporting(); };
  });

  const range = period.from === period.to ? shortDate(period.from) : shortDate(period.from) + " – " + shortDate(period.to);
  const taxSub = function(b){ return b.count ? b.count + (b.count === 1 ? " invoice" : " invoices") + " · taxable " + cur + fmt(b.taxable) + " · GST " + cur + fmt(b.gst) : "No invoices"; };
  const countOf = function(rows){ return rows.filter(function(x){ return Math.abs(x.balance) > 0.004; }).length; };

  document.getElementById("reportContent").innerHTML =
    '<div class="text-[13px] text-slate-600 px-0.5"><b class="text-slate-800">' + esc(period.label) + '</b>' + (period.fyLabel ? ' · ' + esc(period.fyLabel) : '') + ' · ' + range + '</div>'
    + repSection("Overview", '<div class="grid grid-cols-2 gap-2">'
      + repCard("Total sale", cur + fmt(r.sale.total), "in", taxSub(r.sale))
      + repCard("Total purchase", cur + fmt(r.purchase.total), "out", taxSub(r.purchase))
      + repCard("Total income", cur + fmt(r.income), "in", "Other than sales")
      + repCard("Total expense", cur + fmt(r.expense), "out", "Other than purchases")
      + repCard("Money received", cur + fmt(r.received), "in", "Cash, UPI &amp; bank in")
      + repCard("Money spent", cur + fmt(r.spent), "out", "Cash, UPI &amp; bank out")
      + '</div>')
    + repSection("Money received by category", repCategoryList(r.receivedByCat, "in"))
    + repSection("Money spent by category", repCategoryList(r.spentByCat, "out"))
    + repSection("Creditors &amp; debtors · as of " + shortDate(r.asOf), '<div class="grid grid-cols-2 gap-2">'
      + repCard("Total creditors", String(r.creditors.length), "", countOf(r.creditors) + " with a balance")
      + repCard("Credit (you owe)", cur + fmt(r.creditTotal), "out", "Payable to creditors")
      + repCard("Total debtors", String(r.debtors.length), "", countOf(r.debtors) + " with a balance")
      + repCard("Total debt (owed to you)", cur + fmt(r.debtTotal), "in", "Receivable from debtors")
      + '</div>')
    + repSection("Debtors · sales in this period", repPartyList(r.debtors, "debtor"))
    + repSection("Creditors · purchases in this period", repPartyList(r.creditors, "creditor"));
  document.getElementById("reportContent").scrollTop = 0;
}
