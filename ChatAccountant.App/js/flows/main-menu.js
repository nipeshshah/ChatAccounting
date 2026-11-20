/* js/flows/main-menu.js — quick menu, full-screen chat mode, working-date flow */
/* ---- Full-screen chat (on by default; remembered on this device) ---- */

// Full screen switches on by itself the moment a transaction begins, and goes off only when the user exits it
// (Menu > Exit Full Screen, or the exit icon in the slim header).
let fullChat = false;

const TRANSACTION_CHOICES = ["income", "expense", "received", "paid", "sale", "purchase"];

function applyFullChat(){
  document.querySelector(".app-frame").classList.toggle("chat-full", fullChat && currentPage === "chat");
  setTimeout(scrollBottom, 60);
}

function setFullChat(on){
  fullChat = !!on;
  applyFullChat();
}

function fullScreenMenuOption(){
  if(!fullChat) return { label: "Full Screen", value: "fullscreen", icon: "ph-corners-out", hint: "Max chat" };
  const n = incomingShares.length;
  return { label: "Exit Full Screen", value: "fullscreen", icon: "ph-corners-in", hint: n ? n + " request" + (n > 1 ? "s" : "") + " pending" : "Tabs & settings" };
}

function isCompact(){ return data.viewMode === "compact"; }

// Compact view: buttons show only icon + title (no description line). Every shortcut stays, Statement included.
function menuFor(opts){
  if(!isCompact()) return opts;
  return opts.map(function(o){ return Object.assign({}, o, { hint: undefined }); });
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
    const menuOptions = [
      { label: "Log Income", value: "income", variant: "income", icon: "ph-arrow-circle-down-right", hint: "+ Credit" },
      { label: "Log Expense", value: "expense", variant: "expense", icon: "ph-arrow-circle-up-right", hint: "- Debit" },
      { label: "Received", value: "received", variant: "income", icon: "ph-hand-coins", hint: "From debtor" },
      { label: "Paid", value: "paid", variant: "expense", icon: "ph-paper-plane-tilt", hint: "To creditor" },
      { label: "Sale", value: "sale", variant: "income", icon: "ph-receipt", hint: data.gstEnabled === false ? "Cash/Credit" : "Cash/Credit + GST" },
      { label: "Purchase", value: "purchase", variant: "expense", icon: "ph-shopping-bag", hint: "Cash/Credit + GST" },
      { label: "Print Bill", value: "printbill", icon: "ph-printer", hint: "From past sale" },
      dateMenuOption(),
      { label: "Statement", value: "statement", icon: "ph-scroll", hint: "Parties & ledger" },
      { label: "View", value: "view", icon: "ph-book-open", hint: "Balances" },
      { label: "Export CSV", value: "export", icon: "ph-download", hint: "Download file" },
      fullScreenMenuOption()
    ];
    const choice = await askQuickReply(menuFor(menuOptions), "grid");
    if(TRANSACTION_CHOICES.indexOf(choice) >= 0) setFullChat(true);

    if(choice === "income") await logIncomeFlow();
    else if(choice === "expense") await logExpenseFlow();
    else if(choice === "received") await receivedFlow();
    else if(choice === "paid") await paidFlow();
    else if(choice === "sale") await saleFlow();
    else if(choice === "purchase") await purchaseFlow();
    else if(choice === "date") await dateFlow();
    else if(choice === "printbill") await printBillFlow();
    else if(choice === "view") await viewMenu();
    else if(choice === "statement") await statementFlow();
    else if(choice === "export") await exportCSVFlow();
    else if(choice === "fullscreen"){
      setFullChat(!fullChat);
      await botSay(fullChat ? "Full screen on. Open the menu and tap Exit Full Screen to bring back the tabs and totals." : "Full screen off — tabs and totals are back.", { icon: fullChat ? "ph-corners-out" : "ph-corners-in" });
    }
  }catch(err){
    if(err instanceof CancelFlow){
      if(undoCancelled) undoCancelled = false;   // Undo reports for itself
      else await botSay("Cancelled — nothing was saved. Back to the main menu.", { icon: "ph-x-circle" });
    } else {
      console.error(err);
      await botSay("Something interrupted that — back to the main menu.", { icon: "ph-warning" });
    }
  }

  mainMenu();
}
