/* js/flows/income-expense.js — Log Income / Log Expense (cash or on credit) */
// Plain income / expense. Besides cash, it can be put on credit against a debtor (income) or creditor
// (expense) — e.g. stationery bought on account at a shop that isn't a "purchase" for the business.
// A credit entry raises that party's balance, exactly like a credit sale/purchase (but with no GST),
// and is later settled with Received / Paid.
// askMode=false is for "Other receipt / Other payment" inside Received / Paid, which are always cash.
async function logIncomeFlow(askMode = true){ await logSimpleFlow("income", askMode); }

async function logExpenseFlow(askMode = true){ await logSimpleFlow("expense", askMode); }

async function logSimpleFlow(type, askMode){
  const income = type === "income", cur = data.currency;
  let mode = "cash";
  if(askMode){
    await botSay(income ? "Received now, or on credit (a debtor owes you)?" : "Paid now, or on credit (you owe a creditor)?", { icon: "ph-hand-coins" });
    mode = await askQuickReply([
      { label: "Credit", value: "credit", variant: type, icon: "ph-user" },
      { label: "Cash", value: "cash", variant: type, icon: "ph-money" }
    ]);
  }

  let party = null, account;
  async function pickParty(){
    await botSay(income ? "Which debtor?" : "Which creditor?", { icon: "ph-user" });
    party = await pickOrCreateParty(income ? data.debtors : data.creditors, income ? "debtor" : "creditor");
    account = party.name;
  }
  if(mode === "credit") await pickParty(); else account = await pickAccount();

  await botSay("Pick a category:", { icon: "ph-folder-notch-open" });
  let category = await pickCategory(type);
  await botSay("How much?", { icon: "ph-pencil-simple-line" });
  let amount = parseFloat(await askText(`Amount (${cur})`, { numeric: true, required: true, showPresets: true })) || 0;
  await botSay("Add a short description:", { icon: "ph-pencil-simple-line" });
  const ph = income ? "e.g. Invoice #204" : "e.g. Office supplies";
  let description = await askText(ph, { allowSkip: true });

  await reviewBeforeSave(function(){
    return {
      title: cur + fmt(amount) + " · " + category + " · " + (party ? party.name : account),
      details: [(income ? "Income" : "Expense") + (party ? " on credit" : " · " + account), description, reviewDateLine()].filter(Boolean),
      warning: amount > 0 ? "" : "Amount must be more than zero."
    };
  }, [
    amountEditor("Amount", `Amount (${cur})`, function(){ return amount; }, function(v){ amount = v; }),
    { label: "Category", icon: "ph-folder-notch-open", run: async function(){ await botSay("Pick a category:", { icon: "ph-folder-notch-open" }); category = await pickCategory(type); } },
    textEditor("Description", "ph-pencil-simple-line", ph, function(){ return description; }, function(v){ description = v; }),
    mode === "credit"
      ? { label: income ? "Debtor" : "Creditor", icon: "ph-user", run: pickParty }
      : { label: "Payment mode", icon: "ph-credit-card", run: async function(){ account = await pickAccount(); } }
  ]);

  const entry = { date: currentDate(), type, category, account, description, amount };
  const undo = newUndo(`Saved ${income ? "+" : "-"}${cur}${fmt(amount)} · ${category}`);
  if(party){
    entry.party = party.name;
    party.balance = round2(party.balance + amount);
    undo.balances.push({ party: party, delta: amount });
    saveData();
    undo.entries.push(addLedgerEntry(entry));
    await botSay(income
      ? `Logged on credit: +${cur}${fmt(amount)} · ${category}. ${party.name} now owes you ${cur}${fmt(party.balance)}.`
      : `Logged on credit: -${cur}${fmt(amount)} · ${category}. You now owe ${party.name} ${cur}${fmt(party.balance)}.`, { icon: "ph-check-circle" });
    // seen from the other side: my credit income is their credit purchase, and my credit expense is their credit sale
    await shareWithParty(income ? "sale" : "purchase", party, entry, undo);
  } else {
    undo.entries.push(addLedgerEntry(entry));
    await botSay(`Logged: ${income ? "+" : "-"}${cur}${fmt(amount)} · ${category} · ${account}`, { icon: "ph-check-circle" });
  }
  showUndo(undo);
}
