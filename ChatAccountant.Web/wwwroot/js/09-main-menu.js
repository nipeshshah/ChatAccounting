/* ============================================================================
   09-main-menu.js  -  Main menu, export/print/date flows, full-screen mode
   Classic script: shares the global scope with the other js/*.js files.
   Load order is defined in index.html.
   ============================================================================ */
/* ================= MAIN LOOP ================= */
async function exportCSVFlow(){
  if(ledger.length === 0){
    await botSay("Nothing to export yet.", { icon: "ph-download" });
    return;
  }
  await botSay("Download the CSV, or send it straight from here?", { icon: "ph-download" });
  const choice = await askQuickReply([
    { label: "Download file", value: "download", icon: "ph-download" },
    { label: "Send / Share", value: "send", icon: "ph-share-network" }
  ]);
  const csv = buildCSV();
  if(choice === "download"){
    const method = await exportCSV();
    await botSay(method === "share" ? "Choose where to save it from the share sheet." : "CSV downloaded.", { icon: "ph-check-circle" });
    return;
  }
  const shared = await shareCSV(csv);
  if(shared){
    await botSay("Sent.", { icon: "ph-check-circle" });
  } else {
    downloadCSV(csv);
    openEmailDraft();
    await botSay("This browser can't attach files directly, so I downloaded the CSV and opened an email draft — just attach the file that was downloaded.", { icon: "ph-info" });
  }
}

async function printBillFlow(){
  const saleEntries = ledger.filter(e => e.type === "income" && e.taxableAmount !== undefined);
  if(saleEntries.length === 0){
    await botSay("No sales with GST details yet — create one via the Sale option first.", { icon: "ph-printer" });
    return;
  }
  await botSay("Which sale would you like to print a bill for?", { icon: "ph-printer" });
  const recent = saleEntries.slice().reverse().slice(0, 20);
  const opts = recent.map(e => ({
    label: `${e.date} · ${e.party || e.account} · ${data.currency}${fmt(e.amount)}`,
    value: String(ledger.indexOf(e)),
    icon: "ph-receipt"
  }));
  const idxStr = await askQuickReply(opts);
  const entry = ledger[parseInt(idxStr, 10)];
  const shop = await getShopDetails();
  let party = entry.party ? data.debtors.find(d => partyHasName(d, entry.party)) : null;
  if(party) await ensurePartyDetails(party, "sale");
  else party = { name: entry.party || "Walk-in Customer" };
  generateBill(entry, "sale", shop, party);
  await botSay("Bill sent to print.", { icon: "ph-check-circle" });
}

/* ---- Full-screen chat (on by default; remembered on this device) ---- */
let fullChat = (function(){ try{ return localStorage.getItem("ledgerChat.fullChat") !== "0"; }catch(e){ return true; } })();
function applyFullChat(){
  document.querySelector(".app-frame").classList.toggle("chat-full", fullChat && currentPage === "chat");
  setTimeout(scrollBottom, 60);
}
function setFullChat(on){
  fullChat = !!on;
  try{ localStorage.setItem("ledgerChat.fullChat", fullChat ? "1" : "0"); }catch(e){}
  applyFullChat();
}
function fullScreenMenuOption(){
  if(!fullChat) return { label: "Full Screen", value: "fullscreen", icon: "ph-corners-out", hint: "Max chat" };
  const n = incomingShares.length;
  return { label: "Exit Full Screen", value: "fullscreen", icon: "ph-corners-in", hint: n ? n + " request" + (n > 1 ? "s" : "") + " pending" : "Tabs & settings" };
}

function dateMenuOption(){
  const active = workingDate && workingDate !== todayISO();
  return active
    ? { label: "Reset Date", value: "date", icon: "ph-calendar-x", hint: workingDate }
    : { label: "Set Date", value: "date", icon: "ph-calendar", hint: "Today" };
}

async function dateFlow(){
  if(workingDate && workingDate !== todayISO()){
    workingDate = null;
    updateDateBanner();
    await botSay(`Date reset to today (${todayISO()}).`, { icon: "ph-calendar-check" });
    return;
  }
  await botSay("Pick a date. New transactions will use this date until you change or reset it.", { icon: "ph-calendar" });
  const val = await askText("Choose a date", { required: true, dateInput: true });
  workingDate = val || null;
  updateDateBanner();
  if(workingDate && workingDate !== todayISO()){
    await botSay(`Date set to ${workingDate}. New transactions will be logged on this date — tap "Reset Date" in the menu anytime to go back to today.`, { icon: "ph-calendar-check" });
  } else {
    await botSay(`That's today's date — nothing to change.`, { icon: "ph-calendar-check" });
  }
}

async function mainMenu(){
  try{
    await botSay("What would you like to record?", { icon: "ph-lightning" });
    const choice = await askQuickReply([
      { label: "Log Income", value: "income", variant: "income", icon: "ph-arrow-circle-down-right", hint: "+ Credit" },
      { label: "Log Expense", value: "expense", variant: "expense", icon: "ph-arrow-circle-up-right", hint: "- Debit" },
      { label: "Received", value: "received", variant: "income", icon: "ph-hand-coins", hint: "From debtor" },
      { label: "Paid", value: "paid", variant: "expense", icon: "ph-paper-plane-tilt", hint: "To creditor" },
      { label: "Sale", value: "sale", variant: "income", icon: "ph-receipt", hint: "Cash/Credit + GST" },
      { label: "Purchase", value: "purchase", variant: "expense", icon: "ph-shopping-bag", hint: "Cash/Credit + GST" },
      { label: "Print Bill", value: "printbill", icon: "ph-printer", hint: "From past sale" },
      dateMenuOption(),
      { label: "View", value: "view", icon: "ph-book-open", hint: "Ledger & balances" },
      { label: "Export CSV", value: "export", icon: "ph-download", hint: "Download file" },
      fullScreenMenuOption()
    ], "grid");

    if(choice === "income") await logIncomeFlow();
    else if(choice === "expense") await logExpenseFlow();
    else if(choice === "received") await receivedFlow();
    else if(choice === "paid") await paidFlow();
    else if(choice === "sale") await saleFlow();
    else if(choice === "purchase") await purchaseFlow();
    else if(choice === "date") await dateFlow();
    else if(choice === "printbill") await printBillFlow();
    else if(choice === "view") await viewMenu();
    else if(choice === "export") await exportCSVFlow();
    else if(choice === "fullscreen"){
      setFullChat(!fullChat);
      await botSay(fullChat ? "Full screen on. Open the menu and tap Exit Full Screen to bring back the tabs and totals." : "Full screen off — tabs and totals are back.", { icon: fullChat ? "ph-corners-out" : "ph-corners-in" });
    }
  }catch(err){
    if(err instanceof CancelFlow){
      await botSay("Cancelled — nothing was saved. Back to the main menu.", { icon: "ph-x-circle" });
    } else {
      console.error(err);
      await botSay("Something interrupted that — back to the main menu.", { icon: "ph-warning" });
    }
  }

  mainMenu();
}
