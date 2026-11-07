/* ============================================================================
   06-gst-billing.js  -  Shop profile, party details, GST maths
   Classic script: shares the global scope with the other js/*.js files.
   Load order is defined in index.html.
   ============================================================================ */
/* ---- Shop (business) profile — asked once, saved to your account ---- */
async function getShopDetails(){
  if(data.shop && data.shop.name) return data.shop;
  await botSay("First, let's set up your business details — these appear on every printed bill (one-time setup).", { icon: "ph-storefront" });
  const name = await askText("Business / shop name", { required: true });
  await botSay("Business address:", { icon: "ph-map-pin" });
  const address = await askText("e.g. 12 MG Road, Mumbai", { allowSkip: true });
  await botSay("State:", { icon: "ph-map-pin" });
  const state = await askText("e.g. Maharashtra", { allowSkip: true });
  await botSay("GST number (GSTIN):", { icon: "ph-identification-badge" });
  const gstNumber = await askText("e.g. 27ABCDE1234F1Z5", { allowSkip: true });
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
      const v = (await askText("e.g. 98765 43210", { allowSkip: true })).trim();
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
  party.gstNumber = await askText(`${roleLabel[0].toUpperCase() + roleLabel.slice(1)} GSTIN (if registered)`, { allowSkip: true });
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
async function getGstRates(){
  if(data.gstRates && data.gstRates.length) return data.gstRates;
  await botSay("What GST rates do you use? Enter as comma-separated percentages, e.g. 0,5,12,18,28", { icon: "ph-percent" });
  const raw = await askText("e.g. 0,5,12,18,28", { required: true });
  let rates = raw.split(",").map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
  if(!rates.length) rates = [0, 5, 12, 18, 28];
  data.gstRates = rates;
  saveData();
  await botSay("Got it — saved. You can change these anytime from the Settings tab.");
  return data.gstRates;
}

async function askGstPercent(){
  const rates = await getGstRates();
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
