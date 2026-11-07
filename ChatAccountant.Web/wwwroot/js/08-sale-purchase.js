/* ============================================================================
   08-sale-purchase.js  -  Sale and purchase flows
   Classic script: shares the global scope with the other js/*.js files.
   Load order is defined in index.html.
   ============================================================================ */
async function saleFlow(){
  await botSay("Credit sale or cash sale?", { icon: "ph-receipt" });
  const mode = await askQuickReply([
    { label: "Credit", value: "credit", variant: "income", icon: "ph-user" },
    { label: "Cash", value: "cash", variant: "income", icon: "ph-money" }
  ]);

  let debtor = null, account;
  if(mode === "credit"){
    await botSay("Who's the debtor?", { icon: "ph-user" });
    debtor = await pickOrCreateParty(data.debtors, "debtor");
    account = debtor.name;
  } else {
    account = await pickAccount();
  }

  const category = "Sale";
  const shop = await getShopDetails();

  await botSay("Sale amount (before GST)?", { icon: "ph-pencil-simple-line" });
  const amount = parseFloat(await askText(`Amount (${data.currency})`, { numeric: true, required: true, showPresets: true })) || 0;
  const gstPercent = await askGstPercent();
  const gstAmount = amount * gstPercent / 100;
  const total = amount + gstAmount;
  const taxSplit = computeGstSplit(shop.state, debtor ? debtor.state : null, gstPercent, gstAmount);
  await botSay(`Taxable: ${data.currency}${fmt(amount)}  ·  ${describeGstSplit(taxSplit, gstPercent, gstAmount)}  ·  Total: ${data.currency}${fmt(total)}`, { icon: "ph-calculator" });

  await botSay("Add a short description:", { icon: "ph-pencil-simple-line" });
  const description = await askText(mode === "credit" ? "e.g. Invoice #305 (unpaid)" : "e.g. Counter sale", { allowSkip: true });

  const entry = {
    date: currentDate(), type: "income", category, account,
    description: description || (mode === "credit" ? `Credit sale to ${debtor.name}` : "Cash sale"),
    amount: total, taxableAmount: amount, gstPercent, gstAmount, taxSplit
  };
  if(debtor){
    entry.party = debtor.name;
    debtor.balance += total;
    saveData();
    addLedgerEntry(entry);
    await botSay(`Recorded credit sale of ${data.currency}${fmt(total)} (incl. GST) to ${debtor.name}. They now owe ${data.currency}${fmt(debtor.balance)}.`, { icon: "ph-check-circle" });
    await shareWithParty("sale", debtor, entry);
  } else {
    addLedgerEntry(entry);
    await botSay(`Logged: +${data.currency}${fmt(total)} (incl. GST) · Cash sale · ${account}`, { icon: "ph-check-circle" });
  }

  await offerBill(entry, "sale", debtor);
}

async function purchaseFlow(){
  await botSay("Credit purchase or cash purchase?", { icon: "ph-shopping-bag" });
  const mode = await askQuickReply([
    { label: "Credit", value: "credit", variant: "expense", icon: "ph-user" },
    { label: "Cash", value: "cash", variant: "expense", icon: "ph-money" }
  ]);

  let creditor = null, account;
  if(mode === "credit"){
    await botSay("Who's the creditor?", { icon: "ph-user" });
    creditor = await pickOrCreateParty(data.creditors, "creditor");
    account = creditor.name;
  } else {
    account = await pickAccount();
  }

  const category = "Purchase";
  const shop = await getShopDetails();

  await botSay("Purchase amount (before GST)?", { icon: "ph-pencil-simple-line" });
  const amount = parseFloat(await askText(`Amount (${data.currency})`, { numeric: true, required: true, showPresets: true })) || 0;
  const gstPercent = await askGstPercent();
  const gstAmount = amount * gstPercent / 100;
  const total = amount + gstAmount;
  const taxSplit = computeGstSplit(creditor ? creditor.state : null, shop.state, gstPercent, gstAmount);
  await botSay(`Taxable: ${data.currency}${fmt(amount)}  ·  ${describeGstSplit(taxSplit, gstPercent, gstAmount)}  ·  Total: ${data.currency}${fmt(total)}`, { icon: "ph-calculator" });

  await botSay("Add a short description:", { icon: "ph-pencil-simple-line" });
  const description = await askText(mode === "credit" ? "e.g. Bill #88 (unpaid)" : "e.g. Counter purchase", { allowSkip: true });

  const entry = {
    date: currentDate(), type: "expense", category, account,
    description: description || (mode === "credit" ? `Credit purchase from ${creditor.name}` : "Cash purchase"),
    amount: total, taxableAmount: amount, gstPercent, gstAmount, taxSplit
  };
  if(creditor){
    entry.party = creditor.name;
    creditor.balance += total;
    saveData();
    addLedgerEntry(entry);
    await botSay(`Recorded credit purchase of ${data.currency}${fmt(total)} (incl. GST) from ${creditor.name}. You now owe them ${data.currency}${fmt(creditor.balance)}.`, { icon: "ph-check-circle" });
    await shareWithParty("purchase", creditor, entry);
  } else {
    addLedgerEntry(entry);
    await botSay(`Logged: -${data.currency}${fmt(total)} (incl. GST) · Cash purchase · ${account}`, { icon: "ph-check-circle" });
  }
}
