/* js/flows/received-paid.js — Received / Paid: settle a debtor or creditor, with cash discount */
async function receivedFlow(){
  const cur = data.currency;
  await botSay("Is this a debtor settling what they owe, or a fresh receipt?", { icon: "ph-hand-coins" });
  const choice = await askQuickReply([
    { label: "From a Debtor", value: "debtor", variant: "income", icon: "ph-user" },
    { label: "Other receipt", value: "other", variant: "income", icon: "ph-receipt" }
  ]);
  if(choice === "other"){ await logIncomeFlow(false); return; }

  const debtor = await pickOrCreateParty(data.debtors, "debtor");
  await botSay(`${debtor.name} currently owes ${cur}${fmt(debtor.balance)}.`);
  let account = await pickAccount();
  const due = round2(debtor.balance);
  let amount = parseFloat(await askText(`Amount received (${cur})`, { numeric: true, required: true, showPresets: true, defaultValue: due > 0 ? fmtRaw(due) : undefined })) || 0;
  let discount = await askShortfallDiscount(due, amount, "Debtor");

  await reviewBeforeSave(function(){
    return {
      title: `${cur}${fmt(amount)} · Received · ${account}`,
      details: [`From ${debtor.name}`, discount > 0 ? `Discount allowed: ${cur}${fmt(discount)}` : "", `Balance after: ${cur}${fmt(round2(debtor.balance - amount - discount))}`, reviewDateLine()].filter(Boolean),
      warning: amount > 0 ? "" : "Amount must be more than zero."
    };
  }, [
    amountEditor("Amount", `Amount received (${cur})`, function(){ return amount; }, function(v){ amount = v; },
      async function(){ discount = await askShortfallDiscount(due, amount, "Debtor"); }),
    { label: "Payment mode", icon: "ph-credit-card", run: async function(){ account = await pickAccount(); } }
  ]);

  const undo = newUndo(`Saved +${cur}${fmt(amount)} · from ${debtor.name}`);
  debtor.balance = round2(debtor.balance - amount - discount);
  undo.balances.push({ party: debtor, delta: -(amount + discount) });
  saveData();
  const entry = addLedgerEntry({ date: currentDate(), type: "income", category: "Debtor Receipt", account, party: debtor.name, description: `Received from ${debtor.name}`, amount });
  undo.entries.push(entry);
  let discEntry = null;
  if(discount > 0){
    discEntry = addLedgerEntry({ date: currentDate(), type: "expense", category: "Discount Allowed", account: debtor.name, party: debtor.name, description: `Discount allowed to ${debtor.name}`, amount: discount });
    undo.entries.push(discEntry);
    await botSay(`Logged: +${cur}${fmt(amount)} from ${debtor.name} and ${cur}${fmt(discount)} discount allowed. ${cur}${fmt(due)} cleared — balance now ${cur}${fmt(debtor.balance)}.`, { icon: "ph-check-circle" });
  } else {
    await botSay(`Logged: +${cur}${fmt(amount)} from ${debtor.name}. Balance now ${cur}${fmt(debtor.balance)}.`, { icon: "ph-check-circle" });
  }
  await shareWithParty("received", debtor, entry, undo);
  if(discEntry) await shareWithParty("discount_allowed", debtor, discEntry, undo);
  showUndo(undo);
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
  const cur = data.currency;
  await botSay("Is this settling a creditor, or a fresh payment?", { icon: "ph-paper-plane-tilt" });
  const choice = await askQuickReply([
    { label: "To a Creditor", value: "creditor", variant: "expense", icon: "ph-user" },
    { label: "Other payment", value: "other", variant: "expense", icon: "ph-receipt" }
  ]);
  if(choice === "other"){ await logExpenseFlow(false); return; }

  const creditor = await pickOrCreateParty(data.creditors, "creditor");
  await botSay(`You currently owe ${creditor.name} ${cur}${fmt(creditor.balance)}.`);
  let account = await pickAccount();
  const due = round2(creditor.balance);
  let amount = parseFloat(await askText(`Amount paid (${cur})`, { numeric: true, required: true, showPresets: true, defaultValue: due > 0 ? fmtRaw(due) : undefined })) || 0;
  let discount = await askShortfallDiscount(due, amount, "Creditor");

  await reviewBeforeSave(function(){
    return {
      title: `${cur}${fmt(amount)} · Paid · ${account}`,
      details: [`To ${creditor.name}`, discount > 0 ? `Discount received: ${cur}${fmt(discount)}` : "", `Balance after: ${cur}${fmt(round2(creditor.balance - amount - discount))}`, reviewDateLine()].filter(Boolean),
      warning: amount > 0 ? "" : "Amount must be more than zero."
    };
  }, [
    amountEditor("Amount", `Amount paid (${cur})`, function(){ return amount; }, function(v){ amount = v; },
      async function(){ discount = await askShortfallDiscount(due, amount, "Creditor"); }),
    { label: "Payment mode", icon: "ph-credit-card", run: async function(){ account = await pickAccount(); } }
  ]);

  const undo = newUndo(`Saved -${cur}${fmt(amount)} · to ${creditor.name}`);
  creditor.balance = round2(creditor.balance - amount - discount);
  undo.balances.push({ party: creditor, delta: -(amount + discount) });
  saveData();
  const entry = addLedgerEntry({ date: currentDate(), type: "expense", category: "Creditor Payment", account, party: creditor.name, description: `Paid to ${creditor.name}`, amount });
  undo.entries.push(entry);
  let discEntry = null;
  if(discount > 0){
    discEntry = addLedgerEntry({ date: currentDate(), type: "income", category: "Discount Received", account: creditor.name, party: creditor.name, description: `Discount received from ${creditor.name}`, amount: discount });
    undo.entries.push(discEntry);
    await botSay(`Logged: -${cur}${fmt(amount)} to ${creditor.name} and ${cur}${fmt(discount)} discount received. ${cur}${fmt(due)} cleared — balance now ${cur}${fmt(creditor.balance)}.`, { icon: "ph-check-circle" });
  } else {
    await botSay(`Logged: -${cur}${fmt(amount)} to ${creditor.name}. Balance now ${cur}${fmt(creditor.balance)}.`, { icon: "ph-check-circle" });
  }
  await shareWithParty("paid", creditor, entry, undo);
  if(discEntry) await shareWithParty("discount_received", creditor, discEntry, undo);
  showUndo(undo);
}
