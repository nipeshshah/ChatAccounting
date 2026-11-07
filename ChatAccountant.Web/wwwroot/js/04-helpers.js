/* ============================================================================
   04-helpers.js  -  Account / category / party pickers
   Classic script: shares the global scope with the other js/*.js files.
   Load order is defined in index.html.
   ============================================================================ */
/* ================= SHARED HELPERS ================= */
async function pickAccount(){
  await botSay("Payment mode?", { icon: "ph-credit-card" });
  return askQuickReply(data.accounts.map(a => ({ label: a, value: a })));
}

async function pickCategory(type){
  const catList = data.categories[type];
  let category = await askQuickReply(
    catList.map(c => ({ label: c, value: c })).concat([{ label: "New category", value: "__new__" }])
  );
  if(category === "__new__"){
    category = await askText("Type the new category name", { required: true });
    if(!catList.includes(category)){ catList.push(category); saveData(); }
  }
  return category;
}

async function pickOrCreateParty(list, roleLabel){
  if(list.length){
    const opts = list.map((p,i)=>({ label: `${p.name} — ${data.currency}${fmt(p.balance)}`, value: String(i), icon: "ph-user" }));
    opts.push({ label: `New ${roleLabel}`, value: "__new__" });
    const choice = await askQuickReply(opts);
    if(choice !== "__new__") return list[parseInt(choice,10)];
  }
  const name = await askText(`${roleLabel[0].toUpperCase()+roleLabel.slice(1)} name`, { required: true });
  await botSay("Which state are they in? Used to work out CGST/SGST vs IGST on GST bills.", { icon: "ph-map-pin" });
  const state = await askText("e.g. Maharashtra", { allowSkip: true });
  let phone = "";
  if(Panel.supportsShares){
    await botSay("Their mobile number? Optional — if you add it, each transaction with them is sent to them to confirm, and is added to their books if they accept.", { icon: "ph-device-mobile" });
    while(true){
      const v = (await askText("e.g. 98765 43210 (India) or +1 415 555 0123", { allowSkip: true })).trim();
      if(!v) break;
      if(isPhone(v)){ phone = normalizePhone(v); break; }
      await botSay("That doesn't look like a mobile number — try again, or skip.", { icon: "ph-warning" });
    }
  }
  const party = { name, balance: 0, state, phone };
  list.push(party);
  saveData();
  return party;
}
