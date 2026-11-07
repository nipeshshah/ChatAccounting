/* ============================================================================
   13-pin-settings.js  -  PIN lock screen and Settings page
   Classic script: shares the global scope with the other js/*.js files.
   Load order is defined in index.html.
   ============================================================================ */
/* ================= SPLASH & PIN LOCK SCREEN ================= */
const splashScreen = document.getElementById("splashScreen");
const lockScreen = document.getElementById("lockScreen");
const lockIcon = document.getElementById("lockIcon");
const lockTitle = document.getElementById("lockTitle");
const lockSubtitle = document.getElementById("lockSubtitle");
const pinDots = document.getElementById("pinDots");
const pinMessage = document.getElementById("pinMessage");
const pinKeypad = document.getElementById("pinKeypad");
const lockFooterLink = document.getElementById("lockFooterLink");

let pinBuffer = "";
let pinMode = null; // "setup1" | "setup2" | "unlock"
let firstPinEntry = "";

function renderPinDots(){
  pinDots.innerHTML = "";
  for(let i = 0; i < 4; i++){
    const dot = document.createElement("div");
    dot.className = `w-3.5 h-3.5 rounded-full border-2 ${i < pinBuffer.length ? "bg-blue-600 border-blue-600" : "border-slate-300"}`;
    pinDots.appendChild(dot);
  }
}

function shakePinDots(){
  let n = 0;
  const iv = setInterval(()=>{
    pinDots.style.transform = n % 2 === 0 ? "translateX(-6px)" : "translateX(6px)";
    n++;
    if(n > 5){ clearInterval(iv); pinDots.style.transform = "translateX(0)"; }
  }, 40);
}

function buildKeypad(){
  pinKeypad.innerHTML = "";
  const keys = ["1","2","3","4","5","6","7","8","9","","0","back"];
  keys.forEach(k=>{
    const btn = document.createElement("button");
    btn.type = "button";
    if(k === ""){
      btn.className = "invisible";
      btn.disabled = true;
    } else if(k === "back"){
      btn.className = "h-14 rounded-2xl bg-slate-100 hover:bg-slate-200 active:scale-95 transition flex items-center justify-center text-slate-600";
      btn.innerHTML = `<i class="ph-bold ph-backspace text-lg"></i>`;
      btn.onclick = ()=>{ pinBuffer = pinBuffer.slice(0, -1); renderPinDots(); pinMessage.textContent = ""; };
    } else {
      btn.className = "h-14 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 active:scale-95 transition text-lg font-semibold text-slate-800 shadow-fintech-sm";
      btn.textContent = k;
      btn.onclick = ()=> onPinDigit(k);
    }
    pinKeypad.appendChild(btn);
  });
}

function onPinDigit(d){
  if(pinBuffer.length >= 4) return;
  pinBuffer += d;
  renderPinDots();
  if(pinBuffer.length === 4) setTimeout(handlePinComplete, 120);
}

function handlePinComplete(){
  if(pinMode === "setup1"){
    firstPinEntry = pinBuffer;
    pinBuffer = "";
    renderPinDots();
    pinMode = "setup2";
    lockTitle.textContent = "Confirm your PIN";
    pinMessage.textContent = "";
  } else if(pinMode === "setup2"){
    if(pinBuffer === firstPinEntry){
      setPin(pinBuffer);
      unlockApp();
    } else {
      pinMessage.textContent = "PINs didn't match — try again.";
      shakePinDots();
      pinBuffer = ""; firstPinEntry = ""; pinMode = "setup1";
      lockTitle.textContent = "Create a PIN";
      renderPinDots();
    }
  } else if(pinMode === "unlock"){
    if(simpleHash(pinBuffer) === getPinHash()){
      unlockApp();
    } else {
      pinMessage.textContent = "Incorrect PIN — try again.";
      shakePinDots();
      pinBuffer = "";
      renderPinDots();
    }
  }
}

function startPinSetup(){
  pinMode = "setup1";
  pinBuffer = ""; firstPinEntry = "";
  lockIcon.className = "ph-bold ph-lock-key text-2xl text-white";
  lockTitle.textContent = "Create a PIN";
  lockSubtitle.textContent = "Adds a quick lock screen on this device. It doesn't encrypt your data — it only gates the app screen.";
  pinMessage.textContent = "";
  renderPinDots();
  lockFooterLink.innerHTML = `<button type="button" id="cancelPinBtn" class="text-[12.5px] font-semibold text-slate-500 hover:text-slate-700">Cancel</button>`;
  document.getElementById("cancelPinBtn").onclick = ()=>{ lockScreen.style.display = "none"; };
}

function startPinUnlock(){
  pinMode = "unlock";
  pinBuffer = "";
  lockIcon.className = "ph-bold ph-lock-key text-2xl text-white";
  lockTitle.textContent = "Enter your PIN";
  lockSubtitle.textContent = "Your ledger is locked on this device.";
  pinMessage.textContent = "";
  renderPinDots();
  lockFooterLink.innerHTML = `<button type="button" id="forgotPinBtn" class="text-[12.5px] font-semibold text-slate-500 hover:text-rose-600">Forgot PIN? Sign out</button>`;
  document.getElementById("forgotPinBtn").onclick = ()=>{
    if(confirm("Sign out and remove the PIN on this device? Your saved data is not deleted — just sign in with Google again.")){
      clearPin();
      Panel.auth.logout().always(()=> location.reload());
    }
  };
}

function unlockApp(){
  lockScreen.style.display = "none";
  if(currentPage === "settings") buildSettingsPage();
}

function showLockScreen(){
  buildKeypad();
  startPinUnlock();
  lockScreen.style.display = "flex";
}

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
        <input id="inv-start" type="number" min="1" step="1" class="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm font-mono mt-1 focus:outline-none focus:ring-2 focus:ring-fintech-blue" value="${esc(data.billCounter)}">
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
      <input class="new-rate flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-fintech-blue" type="number" min="0" max="100" step="any" placeholder="e.g. 18">
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
      + '<p class="text-[10.5px] text-slate-500 mt-2 leading-relaxed">Regular shows a short description under each quick-menu button. Compact shows only the icon and title, and leaves out the Statement shortcut (it stays in Manage &gt; Debtors / Creditors).</p>';
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

function buildSettingsPage(){
  const el = document.getElementById("settingsPage");
  el.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "p-3 space-y-2.5";

  buildBusinessProfileCard(wrap);
  buildInvoiceNumberingCard(wrap);
  buildGstRatesCard(wrap);
  if(window.PWA) PWA.buildInstallCard(wrap);
  buildDisplayCard(wrap);
  buildPrintSizeCard(wrap);

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
