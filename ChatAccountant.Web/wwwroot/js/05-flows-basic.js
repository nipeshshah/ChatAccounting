/* ============================================================================
   05-flows-basic.js  -  Income, expense, received, paid flows
   Classic script: shares the global scope with the other js/*.js files.
   Load order is defined in index.html.
   ============================================================================ */
/* ================= FLOWS (logic unchanged) ================= */
// Plain income / expense. Besides cash, it can be put on credit against a debtor (income) or creditor
// (expense) — e.g. stationery bought on account at a shop that isn't a "purchase" for the business.
// A credit entry raises that party's balance, exactly like a credit sale/purchase (but with no GST),
// and is later settled with Received / Paid.
// askMode=false is for "Other receipt / Other payment" inside Received / Paid, which are always cash.
async function logIncomeFlow(askMode = true){ await logSimpleFlow("income", askMode); }
async function logExpenseFlow(askMode = true){ await logSimpleFlow("expense", askMode); }

async function logSimpleFlow(type, askMode){
  const income = type === "income";
  let mode = "cash";
  if(askMode){
    await botSay(income ? "Received now, or on credit (a debtor owes you)?" : "Paid now, or on credit (you owe a creditor)?", { icon: "ph-hand-coins" });
    mode = await askQuickReply([
      { label: "Credit", value: "credit", variant: type, icon: "ph-user" },
      { label: "Cash", value: "cash", variant: type, icon: "ph-money" }
    ]);
  }

  let party = null, account;
  if(mode === "credit"){
    await botSay(income ? "Which debtor?" : "Which creditor?", { icon: "ph-user" });
    party = await pickOrCreateParty(income ? data.debtors : data.creditors, income ? "debtor" : "creditor");
    account = party.name;
  } else {
    account = await pickAccount();
  }

  await botSay("Pick a category:", { icon: "ph-folder-notch-open" });
  const category = await pickCategory(type);
  await botSay("How much?", { icon: "ph-pencil-simple-line" });
  const amount = parseFloat(await askText(`Amount (${data.currency})`, { numeric: true, required: true, showPresets: true })) || 0;
  await botSay("Add a short description:", { icon: "ph-pencil-simple-line" });
  const description = await askText(income ? "e.g. Invoice #204" : "e.g. Office supplies", { allowSkip: true });

  const entry = { date: currentDate(), type, category, account, description, amount };
  if(party){
    entry.party = party.name;
    party.balance = round2(party.balance + amount);
    saveData();
    addLedgerEntry(entry);
    await botSay(income
      ? `Logged on credit: +${data.currency}${fmt(amount)} · ${category}. ${party.name} now owes you ${data.currency}${fmt(party.balance)}.`
      : `Logged on credit: -${data.currency}${fmt(amount)} · ${category}. You now owe ${party.name} ${data.currency}${fmt(party.balance)}.`, { icon: "ph-check-circle" });
    // seen from the other side: my credit income is their credit purchase, and my credit expense is their credit sale
    await shareWithParty(income ? "sale" : "purchase", party, entry);
  } else {
    addLedgerEntry(entry);
    await botSay(`Logged: ${income ? "+" : "-"}${data.currency}${fmt(amount)} · ${category} · ${account}`, { icon: "ph-check-circle" });
  }
}

async function receivedFlow(){
  await botSay("Is this a debtor settling what they owe, or a fresh receipt?", { icon: "ph-hand-coins" });
  const choice = await askQuickReply([
    { label: "From a Debtor", value: "debtor", variant: "income", icon: "ph-user" },
    { label: "Other receipt", value: "other", variant: "income", icon: "ph-receipt" }
  ]);
  if(choice === "other"){ await logIncomeFlow(false); return; }

  const debtor = await pickOrCreateParty(data.debtors, "debtor");
  await botSay(`${debtor.name} currently owes ${data.currency}${fmt(debtor.balance)}.`);
  const account = await pickAccount();
  const due = round2(debtor.balance);
  const amount = parseFloat(await askText(`Amount received (${data.currency})`, { numeric: true, required: true, showPresets: true, defaultValue: due > 0 ? fmt(due) : undefined })) || 0;
  const discount = await askShortfallDiscount(due, amount, "Debtor");

  debtor.balance = round2(debtor.balance - amount - discount);
  saveData();
  const entry = addLedgerEntry({ date: currentDate(), type: "income", category: "Debtor Receipt", account, party: debtor.name, description: `Received from ${debtor.name}`, amount });
  let discEntry = null;
  if(discount > 0){
    discEntry = addLedgerEntry({ date: currentDate(), type: "expense", category: "Discount Allowed", account: debtor.name, party: debtor.name, description: `Discount allowed to ${debtor.name}`, amount: discount });
    await botSay(`Logged: +${data.currency}${fmt(amount)} from ${debtor.name} and ${data.currency}${fmt(discount)} discount allowed. ${data.currency}${fmt(due)} cleared — balance now ${data.currency}${fmt(debtor.balance)}.`, { icon: "ph-check-circle" });
  } else {
    await botSay(`Logged: +${data.currency}${fmt(amount)} from ${debtor.name}. Balance now ${data.currency}${fmt(debtor.balance)}.`, { icon: "ph-check-circle" });
  }
  await shareWithParty("received", debtor, entry);
  if(discEntry) await shareWithParty("discount_allowed", debtor, discEntry);
}

// If the amount is a little SHORT of what's due (up to 5%), ask whether the gap is a cash discount.
// Returns the discount amount, or 0 when there is none (exact/over payment, a bigger gap, or "carry forward").
async function askShortfallDiscount(due, amount, roleLabel){
  const diff = round2(due - amount);
  if(!(due > 0) || !(amount > 0) || diff <= 0 || diff > round2(due * 0.05)) return 0;
  await botSay(`${data.currency}${fmt(diff)} is short of the ${data.currency}${fmt(due)} due. Is it a discount? If not, it stays on the ${roleLabel.toLowerCase()}'s balance as carry forward.`, { icon: "ph-tag" });
  const choice = await askQuickReply([
    { label: "Yes, discount", value: "yes", icon: "ph-tag" },
    { label: "No, carry forward", value: "no", icon: "ph-arrow-right" }
  ]);
  return choice === "yes" ? diff : 0;
}

async function paidFlow(){
  await botSay("Is this settling a creditor, or a fresh payment?", { icon: "ph-paper-plane-tilt" });
  const choice = await askQuickReply([
    { label: "To a Creditor", value: "creditor", variant: "expense", icon: "ph-user" },
    { label: "Other payment", value: "other", variant: "expense", icon: "ph-receipt" }
  ]);
  if(choice === "other"){ await logExpenseFlow(false); return; }

  const creditor = await pickOrCreateParty(data.creditors, "creditor");
  await botSay(`You currently owe ${creditor.name} ${data.currency}${fmt(creditor.balance)}.`);
  const account = await pickAccount();
  const due = round2(creditor.balance);
  const amount = parseFloat(await askText(`Amount paid (${data.currency})`, { numeric: true, required: true, showPresets: true, defaultValue: due > 0 ? fmt(due) : undefined })) || 0;
  const discount = await askShortfallDiscount(due, amount, "Creditor");

  creditor.balance = round2(creditor.balance - amount - discount);
  saveData();
  const entry = addLedgerEntry({ date: currentDate(), type: "expense", category: "Creditor Payment", account, party: creditor.name, description: `Paid to ${creditor.name}`, amount });
  let discEntry = null;
  if(discount > 0){
    discEntry = addLedgerEntry({ date: currentDate(), type: "income", category: "Discount Received", account: creditor.name, party: creditor.name, description: `Discount received from ${creditor.name}`, amount: discount });
    await botSay(`Logged: -${data.currency}${fmt(amount)} to ${creditor.name} and ${data.currency}${fmt(discount)} discount received. ${data.currency}${fmt(due)} cleared — balance now ${data.currency}${fmt(creditor.balance)}.`, { icon: "ph-check-circle" });
  } else {
    await botSay(`Logged: -${data.currency}${fmt(amount)} to ${creditor.name}. Balance now ${data.currency}${fmt(creditor.balance)}.`, { icon: "ph-check-circle" });
  }
  await shareWithParty("paid", creditor, entry);
  if(discEntry) await shareWithParty("discount_received", creditor, discEntry);
}

function nextBillNo(){
  const num = data.billCounter;
  const padded = String(num).padStart(3, "0");
  const format = data.invoiceFormat || "INV-[INDEX]";
  const no = format.includes("[INDEX]") ? format.replace("[INDEX]", padded) : format + padded;
  data.billCounter = num + 1;
  saveData();
  return no;
}
