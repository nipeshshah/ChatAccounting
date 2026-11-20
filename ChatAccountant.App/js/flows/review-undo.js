/* js/flows/review-undo.js — review-before-save step and the Undo toast */
/* ================= FLOWS (logic unchanged) ================= */

/* ---- Review before saving, and Undo ---- */

function reviewDateLine(){ return workingDate && workingDate !== todayISO() ? "Date: " + workingDate : ""; }

// getSummary() -> { title, details: [text...], warning? }   editors -> [{ label, icon, run }]
// Shows "Review: ₹1,180.00 · Sale · Cash" with Save / Edit. Edit lets you pick what to change, then shows the review again.
async function reviewBeforeSave(getSummary, editors){
  while(true){
    const s = getSummary();
    const card = newBotCard("ph-clipboard-text");
    card.innerHTML = '<p class="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Review</p>'
      + '<p class="text-[15px] font-bold text-slate-900 break-words">' + esc(s.title) + '</p>'
      + (s.details && s.details.length ? '<div class="mt-1 space-y-0.5 text-[12.5px] text-slate-600">' + s.details.map(function(d){ return '<div>' + esc(d) + '</div>'; }).join("") + '</div>' : "")
      + (s.warning ? '<p class="mt-1.5 text-[12.5px] font-semibold text-rose-600">' + esc(s.warning) + '</p>' : "");
    scrollBottom();
    const opts = [];
    if(!s.warning) opts.push({ label: "Save", value: "save", icon: "ph-check", variant: "income" });
    opts.push({ label: "Edit", value: "edit", icon: "ph-pencil-simple" });
    if((await askQuickReply(opts)) === "save") return;

    await botSay("What would you like to change?", { icon: "ph-pencil-simple-line" });
    const pick = await askQuickReply(editors.map(function(e, i){ return { label: e.label, value: String(i), icon: e.icon }; })
      .concat([{ label: "Back", value: "back", icon: "ph-arrow-left" }]));
    if(pick !== "back") await editors[parseInt(pick, 10)].run();
  }
}

function amountEditor(label, prompt, get, set, after){
  return { label: label, icon: "ph-currency-inr", run: async function(){
    await botSay("New amount?", { icon: "ph-pencil-simple-line" });
    set(parseFloat(await askText(prompt, { numeric: true, required: true, showPresets: true, defaultValue: fmtRaw(get()) })) || 0);
    if(after) await after();
  } };
}

function textEditor(label, icon, placeholder, get, set){
  return { label: label, icon: icon, run: async function(){ set(await askText(placeholder, { allowSkip: true, defaultValue: get() })); } };
}

// Undo: a toast for a few seconds after a transaction is saved. It removes the ledger entries, puts the
// debtor/creditor balances back and withdraws any request that was sent (if the other person hasn't answered yet).
function newUndo(label){ return { label: label, entries: [], balances: [], shares: [] }; }

let undoState = null, undoTimer = null, undoCancelled = false;

const UNDO_MS = 7000;

function hideUndo(){ clearTimeout(undoTimer); undoState = null; $("#undoToast").hide(); }

function showUndo(u){
  clearTimeout(undoTimer);
  undoState = u;
  const frame = document.querySelector(".app-frame"), foot = document.getElementById("composerFooter");
  const fr = frame.getBoundingClientRect(), ft = foot.getBoundingClientRect();
  const bottom = ft.height ? Math.max(8, fr.bottom - ft.top + 8) : 70;
  $("#undoText").text(u.label);
  $("#undoToast").css({ display: "block", bottom: bottom + "px" });
  const bar = document.getElementById("undoBar");
  bar.style.transition = "none"; bar.style.width = "100%";
  void bar.offsetWidth;
  bar.style.transition = "width " + UNDO_MS + "ms linear"; bar.style.width = "0%";
  undoTimer = setTimeout(hideUndo, UNDO_MS);
}

async function performUndo(){
  const u = undoState;
  if(!u) return;
  hideUndo();
  // a question about this transaction may still be on screen (e.g. "Print bill?") — drop it
  if(activePrompt){ undoCancelled = true; cancelCurrentFlow("Undo"); }
  // on screen first
  u.entries.forEach(function(e){ const i = ledger.indexOf(e); if(i >= 0) ledger.splice(i, 1); });
  u.balances.forEach(function(b){ b.party.balance = round2((Number(b.party.balance) || 0) - b.delta); });
  updateSummary();
  let counterChanged = false;
  if(u.counter && data.billCounter === u.counter.after){ data.billCounter = u.counter.before; counterChanged = true; }
  if(u.balances.length || counterChanged) saveData();
  // then in storage
  let failed = 0, stuck = 0;
  for(const e of u.entries){
    const p = savePromises.get(e);
    if(p){ try{ await p; }catch(err){ continue; } }          // it never reached the server, nothing to remove
    if(e.id){ try{ await Panel.ledger.remove(e.id); }catch(err){ failed++; } }
  }
  for(const id of u.shares){
    try{ if(!(await Panel.shares.withdraw(id))) stuck++; }catch(err){ stuck++; }
  }
  await botSay("Undone — " + u.label.replace(/^Saved /, "") + " was removed."
    + (failed ? " It couldn't be removed from the server, so check Transactions." : "")
    + (stuck ? " A request had already been answered, so it couldn't be withdrawn." : ""), { icon: "ph-arrow-counter-clockwise" });
}
