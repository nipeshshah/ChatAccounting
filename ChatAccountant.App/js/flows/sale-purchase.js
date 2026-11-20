/* js/flows/sale-purchase.js — Sale / Purchase with GST (cash or credit) */
async function saleFlow(){
  const cur = data.currency;
  await botSay("Credit sale or cash sale?", { icon: "ph-receipt" });
  const mode = await askQuickReply([
    { label: "Credit", value: "credit", variant: "income", icon: "ph-user" },
    { label: "Cash", value: "cash", variant: "income", icon: "ph-money" }
  ]);

  let debtor = null, account;
  async function pickDebtor(){
    await botSay("Who's the debtor?", { icon: "ph-user" });
    debtor = await pickOrCreateParty(data.debtors, "debtor");
    account = debtor.name;
  }
  if(mode === "credit") await pickDebtor(); else account = await pickAccount();

  const category = "Sale";
  const shop = await getShopDetails();
  const gst = data.gstEnabled !== false;          // Settings > GST on sales. Off = no GST question, no tax lines.

  await botSay(gst ? "Sale amount (before GST)?" : "Sale amount?", { icon: "ph-pencil-simple-line" });
  let amount = parseFloat(await askText(`Amount (${cur})`, { numeric: true, required: true, showPresets: true })) || 0;
  let gstPercent = gst ? await askGstPercent() : 0;
  await botSay("Add a short description:", { icon: "ph-pencil-simple-line" });
  const ph = mode === "credit" ? "e.g. Invoice #305 (unpaid)" : "e.g. Counter sale";
  let description = await askText(ph, { allowSkip: true });

  const calc = function(){
    if(!gst) return { gstAmount: 0, total: round2(amount), taxSplit: null };
    const gstAmount = round2(amount * gstPercent / 100);
    return { gstAmount: gstAmount, total: round2(amount + gstAmount), taxSplit: computeGstSplit(shop.state, debtor ? debtor.state : null, gstPercent, gstAmount) };
  };
  const effDesc = function(){ return description || (mode === "credit" ? `Credit sale to ${debtor.name}` : "Cash sale"); };

  await reviewBeforeSave(function(){
    const c = calc();
    return {
      title: `${cur}${fmt(c.total)} · Sale · ${debtor ? debtor.name + " (credit)" : account}`,
      details: [`Invoice no: ${peekBillNo()}`, gst ? `Taxable ${cur}${fmt(amount)} · ${describeGstSplit(c.taxSplit, gstPercent, c.gstAmount)}` : "", effDesc(), reviewDateLine()].filter(Boolean),
      warning: amount > 0 ? "" : "Amount must be more than zero."
    };
  }, [
    amountEditor("Amount", `Sale amount (${cur})`, function(){ return amount; }, function(v){ amount = v; }),
    gst ? { label: "GST rate", icon: "ph-percent", run: async function(){ gstPercent = await askGstPercent(); } } : null,
    textEditor("Description", "ph-pencil-simple-line", ph, function(){ return description; }, function(v){ description = v; }),
    mode === "credit"
      ? { label: "Debtor", icon: "ph-user", run: pickDebtor }
      : { label: "Payment mode", icon: "ph-credit-card", run: async function(){ account = await pickAccount(); } }
  ].filter(Boolean));

  const c = calc();
  const undo = newUndo(`Saved +${cur}${fmt(c.total)} · Sale`);
  // The invoice number is fixed when the sale is saved, so the statement and the printed bill always agree.
  undo.counter = { before: data.billCounter };
  const invoiceNo = nextBillNo();
  undo.counter.after = data.billCounter;
  const entry = {
    date: currentDate(), type: "income", category, account, invoiceNo,
    description: effDesc(),
    amount: c.total
  };
  if(gst) Object.assign(entry, { taxableAmount: amount, gstPercent, gstAmount: c.gstAmount, taxSplit: c.taxSplit });
  if(debtor){
    entry.party = debtor.name;
    debtor.balance = round2(debtor.balance + c.total);
    undo.balances.push({ party: debtor, delta: c.total });
    saveData();
    undo.entries.push(addLedgerEntry(entry));
    await botSay(`Recorded credit sale of ${cur}${fmt(c.total)}${gst ? " (incl. GST)" : ""} to ${debtor.name}. They now owe ${cur}${fmt(debtor.balance)}.`, { icon: "ph-check-circle" });
    await shareWithParty("sale", debtor, entry, undo);
  } else {
    undo.entries.push(addLedgerEntry(entry));
    await botSay(`Logged: +${cur}${fmt(c.total)}${gst ? " (incl. GST)" : ""} · Cash sale · ${account}`, { icon: "ph-check-circle" });
  }
  showUndo(undo);

  await offerBill(entry, "sale", debtor);
}

// Supplier invoice number and date are mandatory on every purchase. The date starts as the current (working) date.
async function askInvoiceNo(defaultValue){
  while(true){
    const v = cleanText(await askText("Supplier invoice no.", { required: true, defaultValue: defaultValue }), 40);
    if(v) return v;
    await botSay("The invoice number can't be blank.", { icon: "ph-warning" });
  }
}
async function askInvoiceDate(defaultValue){
  while(true){
    const v = await askText("Invoice date", { required: true, dateInput: true, defaultValue: defaultValue });
    if(/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    await botSay("Please pick a valid invoice date.", { icon: "ph-warning" });
  }
}

async function purchaseFlow(){
  const cur = data.currency;
  await botSay("Credit purchase or cash purchase?", { icon: "ph-shopping-bag" });
  const mode = await askQuickReply([
    { label: "Credit", value: "credit", variant: "expense", icon: "ph-user" },
    { label: "Cash", value: "cash", variant: "expense", icon: "ph-money" }
  ]);

  let creditor = null, account;
  async function pickCreditor(){
    await botSay("Who's the creditor?", { icon: "ph-user" });
    creditor = await pickOrCreateParty(data.creditors, "creditor");
    account = creditor.name;
  }
  if(mode === "credit") await pickCreditor(); else account = await pickAccount();

  const category = "Purchase";
  const shop = await getShopDetails();

  await botSay("Supplier's invoice number? (required)", { icon: "ph-hash" });
  let invoiceNo = await askInvoiceNo();
  await botSay("Invoice date? Today's date is filled in — change it if the bill is dated differently.", { icon: "ph-calendar" });
  let invoiceDate = await askInvoiceDate();

  await botSay("Purchase amount (before GST)?", { icon: "ph-pencil-simple-line" });
  let amount = parseFloat(await askText(`Amount (${cur})`, { numeric: true, required: true, showPresets: true })) || 0;
  let gstPercent = await askGstPercent();
  await botSay("Add a short description:", { icon: "ph-pencil-simple-line" });
  const ph = mode === "credit" ? "e.g. Bill #88 (unpaid)" : "e.g. Counter purchase";
  let description = await askText(ph, { allowSkip: true });

  const calc = function(){
    const gstAmount = round2(amount * gstPercent / 100);
    return { gstAmount: gstAmount, total: round2(amount + gstAmount), taxSplit: computeGstSplit(creditor ? creditor.state : null, shop.state, gstPercent, gstAmount) };
  };
  const effDesc = function(){ return description || (mode === "credit" ? `Credit purchase from ${creditor.name}` : "Cash purchase"); };

  // the same supplier should not send the same invoice number twice
  const duplicate = function(){
    const who = creditor ? creditor.name : "";
    return ledger.some(function(e){ return e.category === "Purchase" && e.invoiceNo === invoiceNo && (e.party || "") === who; });
  };

  await reviewBeforeSave(function(){
    const c = calc();
    return {
      title: `${cur}${fmt(c.total)} · Purchase · ${creditor ? creditor.name + " (credit)" : account}`,
      details: [`Invoice ${invoiceNo} · dated ${shortDate(invoiceDate)}`, duplicate() ? "⚠ This invoice number is already recorded for this supplier." : "",
        `Taxable ${cur}${fmt(amount)} · ${describeGstSplit(c.taxSplit, gstPercent, c.gstAmount)}`, effDesc()].filter(Boolean),
      warning: amount > 0 ? "" : "Amount must be more than zero."
    };
  }, [
    { label: "Invoice no.", icon: "ph-hash", run: async function(){ invoiceNo = await askInvoiceNo(invoiceNo); } },
    { label: "Invoice date", icon: "ph-calendar", run: async function(){ invoiceDate = await askInvoiceDate(invoiceDate); } },
    amountEditor("Amount", `Purchase amount (${cur})`, function(){ return amount; }, function(v){ amount = v; }),
    { label: "GST rate", icon: "ph-percent", run: async function(){ gstPercent = await askGstPercent(); } },
    textEditor("Description", "ph-pencil-simple-line", ph, function(){ return description; }, function(v){ description = v; }),
    mode === "credit"
      ? { label: "Creditor", icon: "ph-user", run: pickCreditor }
      : { label: "Payment mode", icon: "ph-credit-card", run: async function(){ account = await pickAccount(); } }
  ]);

  const c = calc();
  const entry = {
    date: invoiceDate, type: "expense", category, account, invoiceNo,   // a purchase is booked on its invoice date
    description: effDesc(),
    amount: c.total, taxableAmount: amount, gstPercent, gstAmount: c.gstAmount, taxSplit: c.taxSplit
  };
  const undo = newUndo(`Saved -${cur}${fmt(c.total)} · Purchase`);
  if(creditor){
    entry.party = creditor.name;
    creditor.balance = round2(creditor.balance + c.total);
    undo.balances.push({ party: creditor, delta: c.total });
    saveData();
    undo.entries.push(addLedgerEntry(entry));
    await botSay(`Recorded credit purchase of ${cur}${fmt(c.total)} (incl. GST) from ${creditor.name}. You now owe them ${cur}${fmt(creditor.balance)}.`, { icon: "ph-check-circle" });
    await shareWithParty("purchase", creditor, entry, undo);
  } else {
    undo.entries.push(addLedgerEntry(entry));
    await botSay(`Logged: -${cur}${fmt(c.total)} (incl. GST) · Cash purchase · ${account}`, { icon: "ph-check-circle" });
  }
  showUndo(undo);
}
