/* js/core/summary.js — the three cards at the top of the chat.
   They show ONE day (today, or the date being logged when "Set Date" is active) and mean whatever the user
   picked in Settings > Chat totals. Longer periods live in Reporting, which uses the same definitions. */
const SUMMARY_MODES = {
  cash:   { name: "Cash",             left: "Received", right: "Spent",    badgeL: "In",    badgeR: "Out",  net: "Net cash", pos: "Cash surplus",       neg: "Cash deficit",    hint: "Money actually received and spent: cash, UPI and bank. Credit entries and discounts aren't counted." },
  sales:  { name: "Sale / Purchase",  left: "Sale",     right: "Purchase", badgeL: "Sales", badgeR: "Buys", net: "Net",      pos: "Sales ahead",        neg: "Purchases ahead", hint: "Invoices raised, cash or credit, including GST." },
  income: { name: "Income / Expense", left: "Income",   right: "Expense",  badgeL: "In",    badgeR: "Out",  net: "Net",      pos: "Profitable surplus", neg: "Running deficit", hint: "Income and expenses other than sales and purchases (rent, fees, interest …)." },
  debt:   { name: "Debt / Credit",    left: "Debt",     right: "Credit",   badgeL: "Owed",  badgeR: "Owe",  net: "Net",      pos: "Net receivable",     neg: "Net payable",     hint: "Debt = what debtors owe you. Credit = what you owe creditors. Balances as of the day shown." }
};
function summaryMode(){ return SUMMARY_MODES[data.summaryMode] ? data.summaryMode : "cash"; }

function updateSummary(){
  const day = currentDate(), isToday = day === todayISO();
  const mode = summaryMode(), M = SUMMARY_MODES[mode];
  let left, right;
  if(mode === "debt"){
    const b = reportBalanceTotals(day); left = b.debt; right = b.credit;
  } else {
    const t = reportTotals({ from: day, to: day });
    if(mode === "cash"){ left = t.received; right = t.spent; }
    else if(mode === "sales"){ left = t.sale.total; right = t.purchase.total; }
    else { left = t.income; right = t.expense; }
  }
  const net = round2(left - right);

  const set = function(id, text){ const el = document.getElementById(id); if(el) el.textContent = text; };
  set("summaryCaption", (mode === "debt" ? (isToday ? "As of today" : "As of " + shortDate(day)) : (isToday ? "Today · " + shortDate(day) : shortDate(day) + " · date set")) + " · " + M.name);
  set("sumLabelA", M.left); set("sumLabelB", M.right); set("sumLabelNet", M.net);
  set("sumBadgeA", M.badgeL); set("sumBadgeB", M.badgeR);
  set("sumIncome", sm(left));
  set("sumExpense", sm(right));
  set("sumNet", sm(net));
  ["sumIncome", "sumExpense", "sumNet"].forEach(function(id){ const el = document.getElementById(id); el.style.fontSize = el.textContent.length > 12 ? "11px" : "13px"; });

  const maxVal = Math.max(left, right, 1);
  document.getElementById("barIncome").style.width = Math.min(100, (left / maxVal) * 100) + "%";
  document.getElementById("barExpense").style.width = Math.min(100, (right / maxVal) * 100) + "%";

  const marginPct = left > 0 ? Math.round((net / left) * 100) : 0;
  const marginWrap = document.getElementById("netMarginWrap");
  const marginEl = document.getElementById("netMargin");
  const netLabel = document.getElementById("netLabel");
  marginEl.textContent = (marginPct >= 0 ? "+" : "") + marginPct + "%";
  if(net >= 0){
    marginWrap.className = "flex items-center gap-0.5 text-[9px] font-bold text-emerald-300 bg-emerald-950/70 px-1 py-0.5 rounded border border-emerald-500/30";
    netLabel.textContent = net === 0 ? "Break-even" : M.pos;
  } else {
    marginWrap.className = "flex items-center gap-0.5 text-[9px] font-bold text-rose-300 bg-rose-950/70 px-1 py-0.5 rounded border border-rose-500/30";
    netLabel.textContent = M.neg;
  }
  marginWrap.style.display = mode === "debt" ? "none" : "";      // a % of what? — not meaningful for balances
}
