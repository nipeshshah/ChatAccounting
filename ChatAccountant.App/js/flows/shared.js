/* js/flows/shared.js — pickers (payment mode, category, party), business + customer details, GST helpers */
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
      const v = (await askText("e.g. 98765 43210 (India) or +1 415 555 0123", { allowSkip: true, inputMode: "tel" })).trim();
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

/* ---- Shop (business) profile — asked once, saved to your account ---- */

async function getShopDetails(intro){
  if(data.shop && data.shop.name) return data.shop;
  await botSay(intro || "First, let's set up your business details — these appear on every printed bill (one-time setup).", { icon: "ph-storefront" });
  const name = await askText("Business / shop name", { required: true });
  await botSay("Business address:", { icon: "ph-map-pin" });
  const address = await askText("e.g. 12 MG Road, Mumbai", { allowSkip: true });
  await botSay("State:", { icon: "ph-map-pin" });
  const state = await askText("e.g. Maharashtra", { allowSkip: true });
  let gstNumber = "";
  if(data.gstEnabled !== false){
    await botSay("GST number (GSTIN):", { icon: "ph-identification-badge" });
    gstNumber = await askText("e.g. 27ABCDE1234F1Z5", { allowSkip: true });
  }
  data.shop = { name, address, state, gstNumber, discoverable: true };
  saveData();
  await botSay("Saved — you can update this anytime from the Settings tab.", { icon: "ph-check-circle" });
  return data.shop;
}

/* ---- Customer / supplier details — asked once per party, stored on the party record ---- */

// Checks whether the party's mobile number belongs to a Chat Accountant user who shares a business
// profile. Returns a cleaned copy of it, or null (not registered / not shared / can't check).
// Never throws — a failed lookup just falls back to typing the details in.
async function findRegisteredProfile(party){
  if(!Panel.supportsLookup || !party.phone || !(Panel.user && Panel.user.phone)) return null;
  try{
    const f = await Panel.profiles.lookupByPhone(party.phone);
    if(!f || !cleanText(f.name, 80)) return null;
    return { name: cleanText(f.name, 80), address: cleanText(f.address, 160), state: cleanText(f.state, 60), gstNumber: cleanText(f.gstNumber, 30) };
  }catch(e){ return null; }
}

async function ensurePartyDetails(party, kind){
  if(party.gstNumber !== undefined) return; // already asked (even if left blank)
  const roleLabel = kind === "sale" ? "customer" : "supplier";

  // No number on file yet? Ask for it, so we can check whether they already use the app.
  if(Panel.supportsLookup && Panel.user && Panel.user.phone && !party.phone){
    await botSay(`What's ${party.name}'s mobile number? If they already use Chat Accountant, I can fetch their business details.`, { icon: "ph-device-mobile" });
    while(true){
      const v = (await askText("e.g. 98765 43210", { allowSkip: true, inputMode: "tel" })).trim();
      if(!v) break;
      if(isPhone(v)){ party.phone = normalizePhone(v); saveData(); break; }
      await botSay("That doesn't look like a mobile number — try again, or skip.", { icon: "ph-warning" });
    }
  }

  // Existing user? Offer to fetch their profile; otherwise (or if declined) enter it by hand.
  const found = await findRegisteredProfile(party);
  if(found){
    await botSay(`${party.phone} is registered on Chat Accountant as "${found.name}". Fetch their business details from there?`, { icon: "ph-cloud-arrow-down" });
    const choice = await askQuickReply([
      { label: "Fetch details", value: "fetch", icon: "ph-download" },
      { label: "Enter manually", value: "manual", icon: "ph-pencil-simple-line" }
    ]);
    if(choice === "fetch"){
      party.address = found.address;
      party.gstNumber = found.gstNumber;
      if(found.state) party.state = found.state;
      saveData();
      await botSay(`Fetched: ${found.address || "no address shared"} · GSTIN ${found.gstNumber || "not shared"}${found.state ? " · " + found.state : ""}.`, { icon: "ph-check-circle" });
      return;
    }
  }

  await botSay(`Add billing details for ${party.name}? Optional, but shows up on the invoice.`, { icon: "ph-address-book" });
  party.address = await askText(`${roleLabel[0].toUpperCase() + roleLabel.slice(1)} address`, { allowSkip: true });
  if(kind === "sale" && data.gstEnabled === false) party.gstNumber = "";      // no GST on sales: nothing to ask
  else party.gstNumber = await askText(`${roleLabel[0].toUpperCase() + roleLabel.slice(1)} GSTIN (if registered)`, { allowSkip: true });
  saveData();
}

/* ---- GST split: CGST+SGST (same state) vs IGST (different state) ---- */

function computeGstSplit(sellerState, buyerState, gstPercent, gstAmount){
  if(!sellerState || !buyerState) return null; // state unknown on one side — can't determine, fall back to a single GST line
  const same = sellerState.trim().toLowerCase() === buyerState.trim().toLowerCase();
  if(same){
    return {
      type: "CGST_SGST",
      cgstPercent: gstPercent / 2, sgstPercent: gstPercent / 2,
      cgstAmount: gstAmount / 2, sgstAmount: gstAmount / 2
    };
  }
  return { type: "IGST", igstPercent: gstPercent, igstAmount: gstAmount };
}

function describeGstSplit(split, gstPercent, gstAmount){
  if(!split) return `GST (${gstPercent}%): ${data.currency}${fmt(gstAmount)}`;
  if(split.type === "CGST_SGST"){
    return `CGST (${split.cgstPercent}%): ${data.currency}${fmt(split.cgstAmount)}  ·  SGST (${split.sgstPercent}%): ${data.currency}${fmt(split.sgstAmount)}`;
  }
  return `IGST (${split.igstPercent}%): ${data.currency}${fmt(split.igstAmount)}`;
}

/* ---- GST helpers ---- */

async function getGstRates(intro){
  if(data.gstRates && data.gstRates.length) return data.gstRates;
  await botSay(intro || "Which GST rates do you use?", { icon: "ph-percent" });
  const pick = await askQuickReply([
    { label: "0, 5, 18, 40", value: "std", icon: "ph-percent" },
    { label: "Enter my own", value: "own", icon: "ph-pencil-simple-line" }
  ]);
  let rates = [0, 5, 18, 40];   // the slabs since GST 2.0 (22 Sep 2025); the old 12% and 28% were removed
  if(pick === "own"){
    await botSay("Enter them as comma-separated percentages, e.g. 0,5,18", { icon: "ph-pencil-simple-line" });
    const raw = await askText("e.g. 0,5,18", { required: true });
    const mine = raw.split(",").map(function(x){ return parseFloat(x.trim()); }).filter(function(n){ return !isNaN(n) && n >= 0 && n <= 100; });
    if(mine.length) rates = mine;
  }
  data.gstRates = Array.from(new Set(rates)).sort(function(a, b){ return a - b; });
  saveData();
  await botSay("Got it — saved. You can change these anytime from the Settings tab.");
  return data.gstRates;
}

async function askGstPercent(){
  const rates = await getGstRates();
  if(rates.length === 1){
    // Only one rate to choose from: fill it in, so it is a single tap on Send (or type another rate)
    await botSay(`GST rate for this bill? ${rates[0]}% is filled in — change it if needed, then send.`, { icon: "ph-percent" });
    const v = parseFloat(await askText("GST %", { numeric: true, required: true, defaultValue: String(rates[0]) }));
    return isNaN(v) ? rates[0] : v;
  }
  await botSay("GST rate for this bill?", { icon: "ph-percent" });
  const opts = rates.map(r => ({ label: `${r}%`, value: String(r) }));
  opts.push({ label: "Custom %", value: "__custom__", icon: "ph-sliders" });
  const choice = await askQuickReply(opts);
  if(choice === "__custom__"){
    const custom = await askText("Enter GST %", { numeric: true, required: true });
    return parseFloat(custom) || 0;
  }
  return parseFloat(choice);
}
