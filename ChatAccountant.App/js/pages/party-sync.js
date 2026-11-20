/* js/pages/party-sync.js — sync debtors / creditors from the database by mobile number */
/* ---- Sync debtors/creditors from the database (by mobile number) ---- */

let manageFlash = null, manageFlashTimer = null;

function setManageFlash(msg, kind){
  manageFlash = { msg: msg, kind: kind || "ok" };
  clearTimeout(manageFlashTimer);
  manageFlashTimer = setTimeout(function(){ manageFlash = null; if(currentPage === "manage") renderManageSection(); }, 8000);
}

function canSyncParties(){
  if(Panel.user && Panel.user.phone) return true;
  setManageFlash("Verify your own mobile number in the Profile tab before syncing.", "error");
  renderManageSection();
  return false;
}

// status: "updated" | "unchanged" | "notfound" | "nophone" | "error".  nameConflict: the database name was
// already taken by another record in this list, so the name was kept. Blank values from the database never
// erase what you already have; only shared, non-empty details overwrite (name, address, GSTIN, state).
async function syncParty(party, list){
  const out = { status: "unchanged", nameConflict: false };
  if(!party.phone){ out.status = "nophone"; return out; }
  let f;
  try{ f = await Panel.profiles.lookupByPhone(party.phone); }catch(e){ out.status = "error"; return out; }
  const newName = f ? cleanText(f.name, 80) : "";
  if(!newName){ out.status = "notfound"; return out; }
  let changed = false;
  if(newName !== party.name){
    const clash = list.some(function(x){ return x !== party && partyHasName(x, newName); });
    if(clash) out.nameConflict = true;
    else { renameParty(party, newName); changed = true; }
  }
  const fresh = { address: cleanText(f.address, 160), gstNumber: cleanText(f.gstNumber, 30), state: cleanText(f.state, 60) };
  Object.keys(fresh).forEach(function(k){
    if(fresh[k] && party[k] !== fresh[k]){ party[k] = fresh[k]; changed = true; }
  });
  if(party.gstNumber === undefined){ party.gstNumber = ""; changed = true; }   // fetched once, so billing won't ask again
  out.status = changed ? "updated" : "unchanged";
  return out;
}

async function syncOne(list, index, roleLabel, btn){
  if(!canSyncParties()) return;
  const p = list[index], oldName = p.name;
  btn.disabled = true;
  btn.innerHTML = '<i class="ph-bold ph-arrows-clockwise text-xs animate-spin"></i>';
  const r = await syncParty(p, list);
  if(r.status === "updated") saveData();
  const label = p.name !== oldName ? oldName + " → " + p.name : p.name;
  const msgs = {
    updated:   ["Synced " + label + " — details updated from the database.", "ok"],
    unchanged: [p.name + " is already up to date.", "ok"],
    notfound:  ["No shared profile found for " + p.phone + ". They may not use Chat Accountant, or keep their profile private.", "error"],
    nophone:   ["Add a mobile number for " + p.name + " first (tap edit), then sync.", "error"],
    error:     ["Couldn't reach the database. Try again.", "error"]
  };
  let msg = msgs[r.status][0];
  if(r.nameConflict) msg += " The name was kept because another " + roleLabel + " already uses their database name.";
  setManageFlash(msg, msgs[r.status][1]);
  renderManageSection();
}

async function syncAllParties(list, roleLabel, btn){
  if(!canSyncParties()) return;
  btn.disabled = true;
  btn.innerHTML = '<i class="ph-bold ph-arrows-clockwise text-xs animate-spin"></i> Syncing…';
  const tally = { updated: 0, unchanged: 0, notfound: 0, nophone: 0, error: 0 };
  let conflicts = 0;
  for(const p of list.slice()){ const r = await syncParty(p, list); tally[r.status]++; if(r.nameConflict) conflicts++; }
  if(tally.updated) saveData();
  const parts = [];
  if(tally.updated) parts.push(tally.updated + " updated");
  if(tally.unchanged) parts.push(tally.unchanged + " already up to date");
  if(tally.notfound) parts.push(tally.notfound + " not found");
  if(tally.nophone) parts.push(tally.nophone + " skipped (no mobile number)");
  if(tally.error) parts.push(tally.error + " failed");
  if(conflicts) parts.push(conflicts + " kept their name (duplicate in list)");
  setManageFlash("Sync finished: " + (parts.join(" · ") || "nothing to sync") + ".", (tally.error || (!tally.updated && !tally.unchanged)) ? "error" : "ok");
  renderManageSection();
}
