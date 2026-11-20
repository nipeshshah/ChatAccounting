/* js/pages/manage.js — Manage page: debtors, creditors, categories, accounts */
function renderPartyList(container, list, roleLabel){
  const header = document.createElement("div");
  header.className = "flex items-center justify-between mb-1";
  header.innerHTML = `<span class="text-xs font-semibold text-slate-500 uppercase tracking-wide">${list.length} ${roleLabel}${list.length === 1 ? "" : "s"}</span>`;
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1";
  addBtn.innerHTML = `<i class="ph-bold ph-plus text-xs"></i> Add ${roleLabel}`;
  addBtn.onclick = ()=> openPartyForm(list, roleLabel, null);
  const actions = document.createElement("div");
  actions.className = "flex items-center gap-1.5";
  if(Panel.supportsLookup && list.length){
    const syncAllBtn = document.createElement("button");
    syncAllBtn.type = "button";
    syncAllBtn.className = "px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1";
    syncAllBtn.title = "Sync every " + roleLabel + " that has a mobile number";
    syncAllBtn.innerHTML = '<i class="ph-bold ph-arrows-clockwise text-xs"></i> Sync all';
    syncAllBtn.onclick = ()=> syncAllParties(list, roleLabel, syncAllBtn);
    actions.appendChild(syncAllBtn);
  }
  actions.appendChild(addBtn);
  header.appendChild(actions);
  container.appendChild(header);
  if(manageFlash){
    const bad = manageFlash.kind === "error";
    const flash = document.createElement("div");
    flash.className = "rounded-lg border px-3 py-2 text-[12px] font-medium " + (bad ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-emerald-50 border-emerald-200 text-emerald-700");
    flash.textContent = manageFlash.msg;
    container.appendChild(flash);
  }

  if(list.length === 0){
    const empty = document.createElement("p");
    empty.className = "text-xs text-slate-400 italic py-6 text-center";
    empty.textContent = `No ${roleLabel}s yet.`;
    container.appendChild(empty);
    return;
  }

  list.forEach((p, i)=>{
    const card = document.createElement("div");
    card.className = "bg-white border border-slate-200 rounded-xl p-3 shadow-fintech-sm";
    card.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="font-semibold text-sm text-slate-800 truncate">${esc(p.name)}</div>
          <div class="text-xs font-mono ${p.balance >= 0 ? "text-emerald-600" : "text-rose-600"} mt-0.5">
            ${data.currency}${fmt(Math.abs(p.balance))} ${p.balance >= 0 ? (roleLabel === "debtor" ? "owed to you" : "you owe") : "credit balance"}
          </div>
          ${p.state ? `<div class="text-[11px] text-slate-500 mt-1">${esc(p.state)}${p.address ? " · " + esc(p.address) : ""}</div>` : (p.address ? `<div class="text-[11px] text-slate-500 mt-1">${esc(p.address)}</div>` : "")}
          ${p.gstNumber ? `<div class="text-[11px] text-slate-500">GSTIN: ${esc(p.gstNumber)}</div>` : ""}
          ${p.phone ? `<div class="text-[11px] text-slate-500 flex items-center gap-1 truncate"><i class="ph-bold ph-device-mobile text-[11px] flex-shrink-0"></i><span class="truncate">${esc(p.phone)}</span></div>` : ""}
        </div>
        <div class="flex gap-1 flex-shrink-0">
          <button class="edit-btn h-7 w-7 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600"><i class="ph-bold ph-pencil-simple text-xs"></i></button>
          <button class="stmt-btn h-7 w-7 flex items-center justify-center rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-600" title="Statement" aria-label="Statement"><i class="ph-bold ph-scroll text-xs"></i></button>
          ${Panel.supportsLookup ? `<button class="sync-btn h-7 w-7 flex items-center justify-center rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 ${p.phone ? "" : "opacity-40"}" title="Sync from database (uses mobile number)" aria-label="Sync from database"><i class="ph-bold ph-arrows-clockwise text-xs"></i></button>` : ""}
          <button class="del-btn h-7 w-7 flex items-center justify-center rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600"><i class="ph-bold ph-trash text-xs"></i></button>
        </div>
      </div>`;
    card.querySelector(".edit-btn").onclick = ()=> openPartyForm(list, roleLabel, i);
    const syncBtn = card.querySelector(".sync-btn");
    if(syncBtn) syncBtn.onclick = ()=> syncOne(list, i, roleLabel, syncBtn);
    card.querySelector(".stmt-btn").onclick = ()=> openStatementView(list, i, roleLabel);
    card.querySelector(".del-btn").onclick = ()=>{
      if(confirm(`Remove ${p.name}? Past ledger entries are unaffected.`)){
        list.splice(i, 1);
        saveData();
        renderManageSection();
      }
    };
    container.appendChild(card);
  });
}

function openPartyForm(list, roleLabel, index){
  const isNew = index === null;
  const existing = isNew ? { name: "", balance: 0, state: "", address: "", gstNumber: "" } : list[index];
  const el = document.getElementById("manageContent");
  const form = document.createElement("div");
  form.className = "bg-white border-2 border-blue-200 rounded-xl p-3 shadow-md space-y-2";
  form.innerHTML = `
    <div class="text-xs font-bold text-blue-700 uppercase tracking-wide">${isNew ? "New" : "Edit"} ${roleLabel}</div>
    <input class="f-name w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fintech-blue" placeholder="Name" value="${esc(existing.name || "")}">
    <input class="f-balance w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-fintech-blue" type="number" inputmode="decimal" step="any" placeholder="Opening balance" value="${esc(existing.balance || 0)}">
    <input class="f-state w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fintech-blue" placeholder="State (for CGST/SGST vs IGST)" value="${esc(existing.state || "")}">
    <input class="f-address w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fintech-blue" placeholder="Address (optional)" value="${esc(existing.address || "")}">
    <input class="f-gst w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fintech-blue" placeholder="GSTIN (optional)" value="${esc(existing.gstNumber || "")}">
    ${Panel.supportsShares ? `<input class="f-phone w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fintech-blue" type="tel" inputmode="tel" placeholder="Mobile number (optional) — requests go here" value="${esc(existing.phone || "")}">` : ""}
    <div class="flex gap-2 pt-1">
      <button type="button" class="save-btn flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg py-2">Save</button>
      <button type="button" class="cancel-btn flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-lg py-2">Cancel</button>
    </div>`;
  el.insertBefore(form, el.children[1] || null);
  form.querySelector(".save-btn").onclick = ()=>{
    const name = form.querySelector(".f-name").value.trim();
    if(!name){ alert("Name is required."); return; }
    const balance = parseFloat(form.querySelector(".f-balance").value) || 0;
    const state = form.querySelector(".f-state").value.trim();
    const address = form.querySelector(".f-address").value.trim();
    const gstNumber = form.querySelector(".f-gst").value.trim();
    const phoneEl = form.querySelector(".f-phone");
    const rawPhone = phoneEl ? phoneEl.value.trim() : String(existing.phone || "");
    if(rawPhone && !isPhone(rawPhone)){ alert("That mobile number doesn't look right."); return; }
    const phone = normalizePhone(rawPhone);
    if(isNew) list.push({ name, balance, state, address, gstNumber, phone });
    else { renameParty(list[index], name); Object.assign(list[index], { name, balance, state, address, gstNumber, phone }); }
    saveData();
    if(currentPage === "chat") updateSummary();
    renderManageSection();
  };
  form.querySelector(".cancel-btn").onclick = ()=> renderManageSection();
}

function renderCategoriesManager(el){
  ["income","expense"].forEach(type=>{
    const wrap = document.createElement("div");
    wrap.className = "bg-white border border-slate-200 rounded-xl p-3 shadow-fintech-sm";
    wrap.innerHTML = `
      <div class="text-xs font-bold uppercase tracking-wide ${type === "income" ? "text-emerald-600" : "text-rose-600"} mb-2">${type === "income" ? "Income categories" : "Expense categories"}</div>
      <div class="chips flex flex-wrap gap-1.5 mb-2"></div>
      <div class="flex gap-1.5">
        <input class="new-cat flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fintech-blue" placeholder="New category">
        <button type="button" class="add-cat bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg px-3">Add</button>
      </div>`;
    const chipsEl = wrap.querySelector(".chips");
    function renderChips(){
      chipsEl.innerHTML = "";
      data.categories[type].forEach((cat, i)=>{
        const chip = document.createElement("span");
        chip.className = "inline-flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-full pl-3 pr-1.5 py-1 text-xs font-medium text-slate-700";
        chip.innerHTML = `${cat} <button type="button" class="ml-0.5 h-4 w-4 flex items-center justify-center rounded-full hover:bg-rose-100 hover:text-rose-600"><i class="ph-bold ph-x text-[10px]"></i></button>`;
        chip.querySelector("button").onclick = ()=>{
          data.categories[type].splice(i, 1);
          saveData();
          renderChips();
        };
        chipsEl.appendChild(chip);
      });
    }
    renderChips();
    wrap.querySelector(".add-cat").onclick = ()=>{
      const input = wrap.querySelector(".new-cat");
      const val = input.value.trim();
      if(val && !data.categories[type].includes(val)){
        data.categories[type].push(val);
        saveData();
        input.value = "";
        renderChips();
      }
    };
    el.appendChild(wrap);
  });
}

function renderAccountsManager(el){
  const wrap = document.createElement("div");
  wrap.className = "bg-white border border-slate-200 rounded-xl p-3 shadow-fintech-sm";
  wrap.innerHTML = `
    <div class="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Payment accounts</div>
    <div class="chips flex flex-wrap gap-1.5 mb-2"></div>
    <div class="flex gap-1.5">
      <input class="new-acc flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fintech-blue" placeholder="New account (e.g. Bank)">
      <button type="button" class="add-acc bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg px-3">Add</button>
    </div>`;
  const chipsEl = wrap.querySelector(".chips");
  function renderChips(){
    chipsEl.innerHTML = "";
    data.accounts.forEach((acc, i)=>{
      const chip = document.createElement("span");
      chip.className = "inline-flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-full pl-3 pr-1.5 py-1 text-xs font-medium text-slate-700";
      chip.innerHTML = `${acc} <button type="button" class="ml-0.5 h-4 w-4 flex items-center justify-center rounded-full hover:bg-rose-100 hover:text-rose-600"><i class="ph-bold ph-x text-[10px]"></i></button>`;
      chip.querySelector("button").onclick = ()=>{
        data.accounts.splice(i, 1);
        saveData();
        renderChips();
      };
      chipsEl.appendChild(chip);
    });
  }
  renderChips();
  wrap.querySelector(".add-acc").onclick = ()=>{
    const input = wrap.querySelector(".new-acc");
    const val = input.value.trim();
    if(val && !data.accounts.includes(val)){
      data.accounts.push(val);
      saveData();
      input.value = "";
      renderChips();
    }
  };
  el.appendChild(wrap);
}
