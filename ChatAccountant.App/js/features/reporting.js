/* js/features/reporting.js — report engine: totals for a date range (no screen code here) */

// Periods. Weeks run Monday–Sunday; the financial year is the Indian one (1 April – 31 March).
function reportPeriod(key){
  const now = new Date(), y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  if(key === "today"){ const t = todayISO(); return { key: key, label: "Today", from: t, to: t }; }
  if(key === "week"){
    const back = (now.getDay() + 6) % 7;                      // days since Monday
    return { key: key, label: "This week", from: localISO(new Date(y, m, d - back)), to: localISO(new Date(y, m, d - back + 6)) };
  }
  if(key === "month") return { key: key, label: "This month", from: localISO(new Date(y, m, 1)), to: localISO(new Date(y, m + 1, 0)) };
  const fy = (m >= 3 ? y : y - 1) - (key === "lastfy" ? 1 : 0);
  return { key: key === "lastfy" ? "lastfy" : "fy", label: (key === "lastfy" ? "Last" : "Current") + " financial year",
           fyLabel: "FY " + fy + "-" + String(fy + 1).slice(2), from: fy + "-04-01", to: (fy + 1) + "-03-31" };
}

// Did money actually change hands? Receipts and payments always did; an entry with a party is on credit
// (account = the party's name) and moved nothing; everything else was cash / UPI / bank.
function reportMoneyMoved(e){
  return e.category === "Debtor Receipt" || e.category === "Creditor Payment" || !e.party;
}
function reportInPeriod(e, period){
  return (!period.from || e.date >= period.from) && (!period.to || e.date <= period.to);
}

// Sale / Purchase per debtor or creditor in the period, plus their balance at the end of it
function reportParties(list, kind, category, period, asOf){
  return list.map(function(p){
    let amount = 0, count = 0;
    ledger.forEach(function(e){
      if(e.category !== category || !reportInPeriod(e, period)) return;
      const name = entryPartyName(e);
      if(!name || !partyHasName(p, name)) return;
      amount += Number(e.amount) || 0; count++;
    });
    const balance = buildStatement(p, kind, { from: null, to: asOf, label: "" }).closing;
    return { name: p.name, amount: round2(amount), count: count, balance: balance };
  });
}

// Totals for a period (no per-party work), used by the report and by the chat totals strip
function reportTotals(period){
  const r = {
    period: period,
    sale: { total: 0, taxable: 0, gst: 0, count: 0 }, purchase: { total: 0, taxable: 0, gst: 0, count: 0 },
    income: 0, expense: 0,                         // everything that is not a sale / purchase / settlement
    received: 0, spent: 0, receivedByCat: {}, spentByCat: {}
  };
  ledger.forEach(function(e){
    if(!reportInPeriod(e, period)) return;
    const amt = Number(e.amount) || 0, cat = e.category || "Other", inc = e.type === "income";
    const bucket = inc && cat === "Sale" ? r.sale : (!inc && cat === "Purchase" ? r.purchase : null);
    if(bucket){
      bucket.total += amt; bucket.count++;
      bucket.taxable += e.taxableAmount !== undefined ? Number(e.taxableAmount) || 0 : amt;
      bucket.gst += Number(e.gstAmount) || 0;
    }
    else if(inc && cat !== "Debtor Receipt") r.income += amt;           // Log Income, discounts received …
    else if(!inc && cat !== "Creditor Payment") r.expense += amt;       // Log Expense, discounts allowed …
    if(reportMoneyMoved(e)){
      if(inc){ r.received += amt; r.receivedByCat[cat] = (r.receivedByCat[cat] || 0) + amt; }
      else { r.spent += amt; r.spentByCat[cat] = (r.spentByCat[cat] || 0) + amt; }
    }
  });
  ["sale", "purchase"].forEach(function(k){ ["total", "taxable", "gst"].forEach(function(f){ r[k][f] = round2(r[k][f]); }); });
  ["income", "expense", "received", "spent"].forEach(function(k){ r[k] = round2(r[k]); });
  return r;
}

// Total owed by debtors / owed to creditors as they stood at the end of `asOf`
function reportBalanceTotals(asOf){
  const sum = function(list, kind){ return round2(list.reduce(function(s, p){ return s + buildStatement(p, kind, { from: null, to: asOf, label: "" }).closing; }, 0)); };
  return { debt: sum(data.debtors, "debtor"), credit: sum(data.creditors, "creditor") };
}

function buildReport(period){
  const r = reportTotals(period);
  // balances are shown as they stood at the end of the period (or today, if the period isn't over yet)
  r.asOf = period.to && period.to < todayISO() ? period.to : todayISO();
  r.debtors = reportParties(data.debtors, "debtor", "Sale", period, r.asOf);
  r.creditors = reportParties(data.creditors, "creditor", "Purchase", period, r.asOf);
  const sum = function(rows){ return round2(rows.reduce(function(s, x){ return s + x.balance; }, 0)); };
  r.debtTotal = sum(r.debtors);                    // what debtors owe you
  r.creditTotal = sum(r.creditors);                // what you owe creditors
  return r;
}
