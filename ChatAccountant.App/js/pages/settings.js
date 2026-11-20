/* js/pages/settings.js — Settings page cards */
/* ---- Settings page: real App Lock management + coming-soon note ---- */

function buildBusinessProfileCard(container){
  const card = document.createElement("div");
  card.className = "bg-white border border-slate-200 rounded-xl p-3 shadow-fintech-sm";
  card.innerHTML = `
    <div class="flex items-center gap-2 mb-2">
      <div class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0"><i class="ph-bold ph-storefront text-slate-600"></i></div>
      <div class="text-sm font-semibold text-slate-800">Business Profile</div>
    </div>
    <div class="space-y-2">
      <input id="bp-name" class="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fintech-blue" placeholder="Business / shop name" value="${esc(data.shop.name || "")}">
      <input id="bp-address" class="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fintech-blue" placeholder="Address" value="${esc(data.shop.address || "")}">
      <input id="bp-state" class="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fintech-blue" placeholder="State" value="${esc(data.shop.state || "")}">
      <input id="bp-gst" class="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-fintech-blue" placeholder="GSTIN" value="${esc(data.shop.gstNumber || "")}">
    </div>
    ${Panel.supportsLookup ? `<label class="flex items-start gap-2 mt-2 text-[11px] text-slate-600 leading-snug"><input type="checkbox" id="bp-discover" class="mt-0.5" ${data.shop.discoverable !== false ? "checked" : ""}><span>Let people who have my verified mobile number fetch these business details when they add me as a customer/supplier.</span></label>` : ""}
    <button type="button" id="bp-save" class="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg py-2">Save business profile</button>
    <p id="bp-msg" class="text-[11px] text-emerald-600 font-semibold mt-1.5 h-3"></p>
    <p class="text-[10.5px] text-slate-400 mt-1 leading-relaxed">Your business state is compared against each customer/supplier's state to decide CGST+SGST vs IGST on GST bills.</p>`;
  card.querySelector("#bp-save").onclick = ()=>{
    data.shop = {
      name: card.querySelector("#bp-name").value.trim(),
      address: card.querySelector("#bp-address").value.trim(),
      state: card.querySelector("#bp-state").value.trim(),
      gstNumber: card.querySelector("#bp-gst").value.trim(),
      discoverable: card.querySelector("#bp-discover") ? card.querySelector("#bp-discover").checked : data.shop.discoverable !== false
    };
    saveData();
    const msg = card.querySelector("#bp-msg");
    msg.textContent = "Saved.";
    setTimeout(()=>{ if(msg) msg.textContent = ""; }, 1800);
  };
  container.appendChild(card);
}

function buildInvoiceNumberingCard(container){
  const card = document.createElement("div");
  card.className = "bg-white border border-slate-200 rounded-xl p-3 shadow-fintech-sm";
  const currentFormat = data.invoiceFormat || "INV-[INDEX]";
  card.innerHTML = `
    <div class="flex items-center gap-2 mb-2">
      <div class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0"><i class="ph-bold ph-hash text-slate-600"></i></div>
      <div class="text-sm font-semibold text-slate-800">Invoice Numbering</div>
    </div>
    <div class="space-y-2">
      <div>
        <label class="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wide">Format — use [INDEX] as the number placeholder</label>
        <input id="inv-format" class="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm font-mono mt-1 focus:outline-none focus:ring-2 focus:ring-fintech-blue" placeholder="e.g. AMB/2025-26/[INDEX]" value="${esc(currentFormat)}">
      </div>
      <div>
        <label class="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wide">Next invoice number</label>
        <input id="inv-start" type="number" inputmode="numeric" min="1" step="1" class="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm font-mono mt-1 focus:outline-none focus:ring-2 focus:ring-fintech-blue" value="${esc(data.billCounter)}">
      </div>
    </div>
    <p class="text-[11px] text-slate-500 mt-2">Preview: <span id="inv-preview" class="font-mono font-semibold text-slate-700"></span></p>
    <button type="button" id="inv-save" class="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg py-2">Save numbering</button>
    <p id="inv-msg" class="text-[11px] text-emerald-600 font-semibold mt-1.5 h-3"></p>`;
  function updatePreview(){
    const fmtStr = card.querySelector("#inv-format").value.trim() || "INV-[INDEX]";
    const num = parseInt(card.querySelector("#inv-start").value, 10) || 1;
    const padded = String(num).padStart(3, "0");
    card.querySelector("#inv-preview").textContent = fmtStr.includes("[INDEX]") ? fmtStr.replace("[INDEX]", padded) : fmtStr + padded;
  }
  card.querySelector("#inv-format").addEventListener("input", updatePreview);
  card.querySelector("#inv-start").addEventListener("input", updatePreview);
  updatePreview();
  card.querySelector("#inv-save").onclick = ()=>{
    data.invoiceFormat = card.querySelector("#inv-format").value.trim() || "INV-[INDEX]";
    data.billCounter = parseInt(card.querySelector("#inv-start").value, 10) || 1;
    saveData();
    const msg = card.querySelector("#inv-msg");
    msg.textContent = "Saved — the next bill will use this.";
    setTimeout(()=>{ if(msg) msg.textContent = ""; }, 2200);
  };
  container.appendChild(card);
}

function buildGstRatesCard(container){
  const card = document.createElement("div");
  card.className = "bg-white border border-slate-200 rounded-xl p-3 shadow-fintech-sm";
  card.innerHTML = `
    <div class="flex items-center gap-2 mb-2">
      <div class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0"><i class="ph-bold ph-percent text-slate-600"></i></div>
      <div class="text-sm font-semibold text-slate-800">GST Rates</div>
    </div>
    <p class="text-[10.5px] text-slate-500 mb-2">Shown as quick-pick options on Credit Sale / Credit Purchase.</p>
    <div class="chips flex flex-wrap gap-1.5 mb-2"></div>
    <div class="flex gap-1.5">
      <input class="new-rate flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-fintech-blue" type="number" inputmode="decimal" min="0" max="100" step="any" placeholder="e.g. 18">
      <button type="button" class="add-rate bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg px-3">Add</button>
    </div>`;
  const chipsEl = card.querySelector(".chips");
  function renderChips(){
    chipsEl.innerHTML = "";
    if(!Array.isArray(data.gstRates)) data.gstRates = [];
    data.gstRates.forEach((rate, i)=>{
      const chip = document.createElement("span");
      chip.className = "inline-flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-full pl-3 pr-1.5 py-1 text-xs font-mono font-medium text-slate-700";
      chip.innerHTML = `${rate}% <button type="button" class="ml-0.5 h-4 w-4 flex items-center justify-center rounded-full hover:bg-rose-100 hover:text-rose-600"><i class="ph-bold ph-x text-[10px]"></i></button>`;
      chip.querySelector("button").onclick = ()=>{
        data.gstRates.splice(i, 1);
        saveData();
        renderChips();
      };
      chipsEl.appendChild(chip);
    });
    if(data.gstRates.length === 0){
      const empty = document.createElement("span");
      empty.className = "text-xs text-slate-400 italic";
      empty.textContent = "No rates yet — add one below.";
      chipsEl.appendChild(empty);
    }
  }
  renderChips();
  card.querySelector(".add-rate").onclick = ()=>{
    const input = card.querySelector(".new-rate");
    const val = parseFloat(input.value);
    if(!isNaN(val) && val >= 0 && val <= 100 && !data.gstRates.includes(val)){
      data.gstRates.push(val);
      data.gstRates.sort((a,b)=>a-b);
      saveData();
      input.value = "";
      renderChips();
    }
  };
  container.appendChild(card);
}

function buildDisplayCard(container){
  const card = document.createElement("div");
  card.className = "bg-white border border-slate-200 rounded-xl p-3 shadow-fintech-sm";
  function render(){
    const compact = isCompact();
    const btn = function(mode, label){
      const on = (mode === "compact") === compact;
      return '<button type="button" data-mode="' + mode + '" class="flex-1 text-xs font-semibold rounded-lg py-2 border ' + (on ? "bg-corporate-navy text-white border-corporate-navy" : "bg-slate-100 text-slate-600 border-transparent") + '">' + label + '</button>';
    };
    card.innerHTML = '<div class="flex items-center gap-2 mb-2">'
      + '<div class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0"><i class="ph-bold ph-squares-four text-slate-600"></i></div>'
      + '<div class="text-sm font-semibold text-slate-800">Quick menu view</div></div>'
      + '<div class="flex gap-2">' + btn("regular", "Regular") + btn("compact", "Compact") + '</div>'
      + '<p class="text-[10.5px] text-slate-500 mt-2 leading-relaxed">Regular shows a short description under each quick-menu button. Compact shows only the icon and title. All the same buttons stay in the menu, Statement included.</p>';
    card.querySelectorAll("[data-mode]").forEach(function(b){
      b.onclick = function(){ data.viewMode = b.getAttribute("data-mode"); saveData(); render(); };
    });
  }
  render();
  container.appendChild(card);
}

function buildPrintSizeCard(container){
  const card = document.createElement("div");
  card.className = "bg-white border border-slate-200 rounded-xl p-3 shadow-fintech-sm";
  function render(){
    const cur = getPrintMode();
    const btns = Object.keys(PRINT_MODES).map(function(k){
      const on = k === cur;
      return '<button type="button" data-pm="' + k + '" class="flex-1 text-xs font-semibold rounded-lg py-2 border ' + (on ? "bg-corporate-navy text-white border-corporate-navy" : "bg-slate-100 text-slate-600 border-transparent") + '">' + PRINT_MODES[k].label + '</button>';
    }).join("");
    card.innerHTML = '<div class="flex items-center gap-2 mb-2">'
      + '<div class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0"><i class="ph-bold ph-printer text-slate-600"></i></div>'
      + '<div class="text-sm font-semibold text-slate-800">Print size</div></div>'
      + '<div class="flex gap-2">' + btns + '</div>'
      + '<p class="text-[10.5px] text-slate-500 mt-2 leading-relaxed">Bills and statements are laid out for this paper when you print or share them. 3 Inch is a compact receipt for thermal printers; A4 and A5 use a full invoice page.</p>';
    card.querySelectorAll("[data-pm]").forEach(function(b){
      b.onclick = function(){ data.printMode = b.getAttribute("data-pm"); saveData(); render(); };
    });
  }
  render();
  container.appendChild(card);
}

function refreshPresetLabels(){
  presetButtons.forEach(function(b){ if(b.dataset.amt) b.textContent = "+" + data.currency + groupDigits(b.dataset.amt); });
}

function buildNumberFormatCard(container){
  const card = document.createElement("div");
  card.className = "bg-white border border-slate-200 rounded-xl p-3 shadow-fintech-sm";
  function render(){
    const cur = data.numberFormat === "international" ? "international" : "indian";
    const opt = function(mode, label){
      const on = mode === cur;
      return '<button type="button" data-nf="' + mode + '" class="flex-1 rounded-lg py-2 border ' + (on ? "bg-corporate-navy text-white border-corporate-navy" : "bg-slate-100 text-slate-600 border-transparent") + '">'
        + '<div class="text-xs font-semibold">' + label + '</div><div class="text-[11px] font-mono opacity-80">' + esc(data.currency) + groupDigits("123456", mode) + '.00</div></button>';
    };
    card.innerHTML = '<div class="flex items-center gap-2 mb-2">'
      + '<div class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0"><i class="ph-bold ph-currency-inr text-slate-600"></i></div>'
      + '<div class="text-sm font-semibold text-slate-800">Number &amp; currency</div></div>'
      + '<div class="flex gap-2">' + opt("indian", "Indian") + opt("international", "International") + '</div>'
      + '<div class="flex gap-1.5 mt-2"><input id="cur-symbol" maxlength="4" class="w-24 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-fintech-blue" value="' + esc(data.currency) + '" aria-label="Currency symbol">'
      + '<button type="button" id="cur-save" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg">Save currency symbol</button></div>'
      + '<p class="text-[10.5px] text-slate-500 mt-2 leading-relaxed">Indian groups digits as 1,23,456.00; International as 123,456.00. The symbol is used everywhere amounts are shown. Amount-in-words on bills is printed only for ₹.</p>';
    card.querySelectorAll("[data-nf]").forEach(function(b){
      b.onclick = function(){ data.numberFormat = b.getAttribute("data-nf"); saveData(); updateSummary(); refreshPresetLabels(); render(); };
    });
    card.querySelector("#cur-save").onclick = function(){
      const v = cleanText(card.querySelector("#cur-symbol").value, 4);
      if(!v) return;
      data.currency = v; saveData(); updateSummary(); refreshPresetLabels(); render();
    };
  }
  render();
  container.appendChild(card);
}

function buildSummaryModeCard(container){
  const card = document.createElement("div");
  card.className = "bg-white border border-slate-200 rounded-xl p-3 shadow-fintech-sm";
  function render(){
    const cur = summaryMode();
    const btns = Object.keys(SUMMARY_MODES).map(function(k){
      const on = k === cur;
      return '<button type="button" data-sm="' + k + '" class="rounded-lg py-2 px-2 border text-xs font-semibold ' + (on ? "bg-corporate-navy text-white border-corporate-navy" : "bg-slate-100 text-slate-600 border-transparent") + '">' + SUMMARY_MODES[k].name + '</button>';
    }).join("");
    card.innerHTML = '<div class="flex items-center gap-2 mb-2">'
      + '<div class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0"><i class="ph-bold ph-chart-line-up text-slate-600"></i></div>'
      + '<div class="text-sm font-semibold text-slate-800">Chat totals</div></div>'
      + '<div class="grid grid-cols-2 gap-2">' + btns + '</div>'
      + '<p class="text-[10.5px] text-slate-500 mt-2 leading-relaxed"><b>' + SUMMARY_MODES[cur].name + ':</b> ' + SUMMARY_MODES[cur].hint + ' The three cards at the top of the chat show this for the current day.</p>';
    card.querySelectorAll("[data-sm]").forEach(function(b){
      b.onclick = function(){ data.summaryMode = b.getAttribute("data-sm"); saveData(); updateSummary(); render(); };
    });
  }
  render();
  container.appendChild(card);
}

function buildGstFeatureCard(container){
  const card = document.createElement("div");
  card.className = "bg-white border border-slate-200 rounded-xl p-3 shadow-fintech-sm";
  function render(){
    const on = data.gstEnabled !== false;
    const btn = function(v, label){ return '<button type="button" data-gst="' + v + '" class="flex-1 text-xs font-semibold rounded-lg py-2 border ' + ((v === "on") === on ? "bg-corporate-navy text-white border-corporate-navy" : "bg-slate-100 text-slate-600 border-transparent") + '">' + label + '</button>'; };
    card.innerHTML = '<div class="flex items-center gap-2 mb-2">'
      + '<div class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0"><i class="ph-bold ph-percent text-slate-600"></i></div>'
      + '<div><div class="text-sm font-semibold text-slate-800">GST on sales</div><div class="text-[11px] ' + (on ? "text-emerald-600" : "text-slate-500") + ' font-semibold">' + (on ? "On" : "Off") + '</div></div></div>'
      + '<div class="flex gap-2">' + btn("on", "GST on") + btn("off", "GST off") + '</div>'
      + '<p class="text-[10.5px] text-slate-500 mt-2 leading-relaxed">' + (on
        ? 'Sales ask for a GST rate, and invoices show CGST + SGST or IGST. Purchases can always carry GST.'
        : 'Sales are recorded without any GST questions and print as a plain invoice. Purchases can still carry GST.') + '</p>';
    card.querySelectorAll("[data-gst]").forEach(function(b){
      b.onclick = function(){ data.gstEnabled = b.getAttribute("data-gst") === "on"; saveData(); render(); };
    });
  }
  render();
  container.appendChild(card);
}

function buildSettingsPage(){
  const el = document.getElementById("settingsPage");
  el.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "p-3 space-y-2.5";

  buildBusinessProfileCard(wrap);
  buildInvoiceNumberingCard(wrap);
  buildGstFeatureCard(wrap);
  buildGstRatesCard(wrap);
  buildSummaryModeCard(wrap);
  buildDisplayCard(wrap);
  buildPrintSizeCard(wrap);
  buildNumberFormatCard(wrap);

  const lockCard = document.createElement("div");
  lockCard.className = "bg-white border border-slate-200 rounded-xl p-3 shadow-fintech-sm";
  function renderLockCard(){
    const on = hasPinSet();
    lockCard.innerHTML = `
      <div class="flex items-center gap-2 mb-1">
        <div class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0"><i class="ph-bold ph-lock-key text-slate-600"></i></div>
        <div class="min-w-0">
          <div class="text-sm font-semibold text-slate-800">App Lock (PIN)</div>
          <div class="text-[11px] text-slate-500">${on ? "Enabled on this device" : "Not set on this device"}</div>
        </div>
      </div>
      <div class="flex gap-2 mt-2">
        ${on
          ? `<button type="button" id="changePinBtn" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg py-2">Change PIN</button>
             <button type="button" id="removePinBtn" class="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold rounded-lg py-2">Remove PIN</button>`
          : `<button type="button" id="addPinBtn" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg py-2">Set up a PIN</button>`
        }
      </div>
      <p class="text-[10.5px] text-slate-400 mt-2 leading-relaxed">A PIN only locks this app's screen — it does not encrypt your data.</p>`;
    if(on){
      lockCard.querySelector("#changePinBtn").onclick = ()=>{
        buildKeypad();
        startPinSetup();
        lockScreen.style.display = "flex";
      };
      lockCard.querySelector("#removePinBtn").onclick = ()=>{
        if(confirm("Remove the PIN lock from this device?")){
          clearPin();
          renderLockCard();
        }
      };
    } else {
      lockCard.querySelector("#addPinBtn").onclick = ()=>{
        buildKeypad();
        startPinSetup();
        lockScreen.style.display = "flex";
      };
    }
  }
  renderLockCard();
  wrap.appendChild(lockCard);

  const more = document.createElement("div");
  buildPlaceholder(more, "ph-gear-six", "More settings", "Currency symbol, backups, and theme options are coming soon.");
  wrap.appendChild(more);

  el.appendChild(wrap);
}

/* ---- Manage page: Debtors / Creditors / Categories / Accounts ---- */

document.querySelectorAll(".manage-tab").forEach(btn=>{
  btn.onclick = ()=>{ manageSection = btn.dataset.section; renderManageSection(); };
});

function renderManageSection(){
  document.querySelectorAll(".manage-tab").forEach(btn=>{
    btn.classList.toggle("active", btn.dataset.section === manageSection);
  });
  const el = document.getElementById("manageContent");
  el.innerHTML = "";
  if(manageSection === "debtors") renderPartyList(el, data.debtors, "debtor");
  else if(manageSection === "creditors") renderPartyList(el, data.creditors, "creditor");
  else if(manageSection === "categories") renderCategoriesManager(el);
  else if(manageSection === "accounts") renderAccountsManager(el);
}
