/* ============================================================================
   02-chat-ui.js  -  Chat bubbles, quick replies, text prompts, summary bar
   Classic script: shares the global scope with the other js/*.js files.
   Load order is defined in index.html.
   ============================================================================ */
/* ================= RENDERING PRIMITIVES ================= */
const chatLog = document.getElementById("chatLog");
const composerInput = document.getElementById("composerInput");
const composerSend = document.getElementById("composerSend");
const composerSkip = document.getElementById("composerSkip");
const composerCancel = document.getElementById("composerCancel");
const presetsRow = document.getElementById("presetsRow");
const presetButtons = [...document.querySelectorAll(".preset-btn")];

let lastCard = null; // the most recently opened bot card, so quick-replies land inside it

/* ---- cancel-anytime plumbing ---- */
class CancelFlow extends Error {}
let activePrompt = null; // { reject, cleanup } for whichever askQuickReply/askText is currently pending

function cancelCurrentFlow(){
  if(!activePrompt) return;
  const { reject, cleanup } = activePrompt;
  activePrompt = null;
  cleanup();
  appendUserMessage("Cancel");
  reject(new CancelFlow());
}
composerCancel.addEventListener("click", cancelCurrentFlow);

function setSendEnabled(enabled){
  composerSend.disabled = !enabled;
  composerSend.className = enabled
    ? "h-8 w-8 flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white active:scale-95 transition shadow-md shadow-blue-500/30 flex-shrink-0"
    : "h-8 w-8 flex items-center justify-center rounded-lg bg-slate-200 text-slate-400 active:scale-95 transition flex-shrink-0";
}

function scrollBottom(){ chatLog.scrollTop = chatLog.scrollHeight; }

const ICONS = {
  "income": "ph-arrow-circle-down-right", "expense": "ph-arrow-circle-up-right",
  "cash": "ph-money", "upi": "ph-qr-code", "other": "ph-bank",
  "debtor": "ph-user", "creditor": "ph-user",
  "sale": "ph-receipt", "purchase": "ph-shopping-bag",
  "new": "ph-plus", "custom": "ph-sliders", "back": "ph-arrow-left",
  "continue": "ph-arrow-right", "menu": "ph-list", "cancel": "ph-x"
};
function iconFor(label){
  const l = label.toLowerCase();
  for(const key in ICONS){ if(l.includes(key)) return ICONS[key]; }
  return null;
}

function newBotCard(icon){
  const row = document.createElement("div");
  row.className = "flex items-start gap-2 w-full";
  row.innerHTML = `
    <div class="w-6 h-6 rounded-md bg-corporate-navy flex-shrink-0 flex items-center justify-center text-white text-sm shadow-sm border border-slate-700 mt-0.5">
      <i class="ph-bold ${icon || 'ph-chat-circle-text'} text-blue-400"></i>
    </div>
    <div class="flex-1 flex flex-col items-start min-w-0">
      <div class="bot-card bg-white border border-slate-200/90 rounded-2xl rounded-tl-sm p-2.5 shadow-bubble-bot w-full max-w-full overflow-hidden"></div>
      <span class="text-[10px] font-mono font-medium text-slate-400 mt-1 px-1">${timeNow()}</span>
    </div>`;
  chatLog.appendChild(row);
  const card = row.querySelector(".bot-card");
  lastCard = card;
  scrollBottom();
  return card;
}

function botSay(text, opts = {}){
  return new Promise(resolve=>{
    setTimeout(()=>{
      const card = newBotCard(opts.icon);
      card.innerHTML = `<p class="text-slate-800 text-[13px] leading-snug">${esc(text)}</p>`;
      scrollBottom();
      resolve();
    }, opts.delay !== undefined ? opts.delay : 180);
  });
}

function appendUserMessage(text){
  const row = document.createElement("div");
  row.className = "flex flex-col items-end w-full";
  row.innerHTML = `
    <div class="bg-corporate-navy text-white rounded-2xl rounded-tr-sm px-3 py-1 shadow-bubble-user text-[12.5px] font-medium border border-slate-700 flex items-center gap-1.5 max-w-[85%] break-words">
      <span>${esc(text)}</span>
      <i class="ph-bold ph-check text-blue-400 text-xs flex-shrink-0"></i>
    </div>
    <span class="text-[10px] font-mono text-slate-400 mt-0.5 px-1">${timeNow()}</span>`;
  chatLog.appendChild(row);
  lastCard = null;
  scrollBottom();
}

function setComposerIdle(){
  composerInput.disabled = true;
  setSendEnabled(false);
  composerInput.value = "";
  composerInput.placeholder = "Tap an option above ↑";
  composerSkip.style.display = "none";
  presetsRow.style.display = "none";
}

function askQuickReply(options, layout){
  layout = layout || "wrap";
  setComposerIdle();
  return new Promise((resolve, reject)=>{
    const card = lastCard || newBotCard();
    const wrap = document.createElement("div");
    wrap.className = layout === "grid"
      ? "grid grid-cols-2 gap-1.5 mt-1.5"
      : "flex flex-wrap gap-1 mt-1.5";

    function disableAll(){
      [...wrap.children].forEach(b=>{ b.disabled = true; b.classList.add("opacity-40","pointer-events-none"); });
    }
    const thisPrompt = { reject, cleanup: disableAll };
    activePrompt = thisPrompt;

    options.forEach(opt=>{
      const btn = document.createElement("button");
      btn.type = "button";
      const icon = opt.icon || iconFor(opt.label);
      const isNew = icon === "ph-plus" || icon === "ph-sliders";
      let base, iconWrapClass = "";
      if(layout === "grid"){
        let tint = "bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700";
        if(opt.variant === "income") tint = "bg-slate-50 border border-emerald-200 hover:bg-emerald-50 text-slate-700";
        if(opt.variant === "expense") tint = "bg-slate-50 border border-rose-200 hover:bg-rose-50 text-slate-700";
        iconWrapClass = opt.variant === "income" ? "bg-emerald-100 text-emerald-700" : opt.variant === "expense" ? "bg-rose-100 text-rose-700" : "bg-blue-100 text-blue-700";
        base = `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-left transition active:scale-[0.98] ${tint}`;
        btn.className = base;
        btn.innerHTML = `<div class="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${iconWrapClass}">
            <i class="ph-bold ${icon || 'ph-dot'} text-sm"></i>
          </div>
          <div class="min-w-0">
            <div class="leading-none text-[12px] truncate">${esc(opt.label)}</div>
            ${opt.hint ? `<span class="text-[9px] font-mono ${opt.variant === 'expense' ? 'text-rose-600' : 'text-emerald-600'}">${esc(opt.hint)}</span>` : ""}
          </div>`;
      } else {
        if(isNew){
          base = "px-2.5 py-1 rounded-lg bg-blue-50/70 border border-dashed border-blue-300 text-fintech-blue text-xs font-semibold hover:bg-blue-100/70 active:scale-95 transition flex items-center gap-1";
        } else if(opt.variant === "income"){
          base = "px-3 py-1 rounded-lg bg-slate-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-xs font-medium active:scale-95 transition flex items-center gap-1.5";
        } else if(opt.variant === "expense"){
          base = "px-3 py-1 rounded-lg bg-slate-50 border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-medium active:scale-95 transition flex items-center gap-1.5";
        } else {
          base = "px-3 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-medium active:scale-95 transition flex items-center gap-1.5";
        }
        btn.className = base;
        btn.innerHTML = `${icon ? `<i class="ph-bold ${icon} text-xs"></i>` : ""}<span>${esc(opt.label)}</span>`;
      }

      btn.onclick = ()=>{
        if(activePrompt === thisPrompt) activePrompt = null;
        [...wrap.children].forEach(b=>{ b.disabled = true; b.classList.add("opacity-40","pointer-events-none"); });
        btn.classList.remove("opacity-40","pointer-events-none");
        btn.classList.add("!bg-corporate-navy","!text-white","!border-corporate-navy","ring-2","ring-blue-500/40");
        appendUserMessage(opt.label);
        resolve(opt.value);
      };
      wrap.appendChild(btn);
    });

    card.appendChild(wrap);
    lastCard = null;
    scrollBottom();
  });
}

function askText(placeholder, opts = {}){
  if(lastCard){
    const hint = document.createElement("p");
    hint.className = "text-[11px] text-slate-500 mt-1.5 flex items-center gap-1";
    hint.innerHTML = `<i class="ph-bold ph-arrow-down text-slate-400"></i> Type your answer below and tap send`;
    lastCard.appendChild(hint);
    lastCard = null;
  }
  composerInput.disabled = false;
  setSendEnabled(true);
  composerInput.type = opts.dateInput ? "date" : (opts.numeric ? "number" : "text");
  if(opts.numeric) composerInput.step = "any"; else composerInput.removeAttribute("step");
  composerInput.value = opts.dateInput ? currentDate() : (opts.defaultValue !== undefined ? String(opts.defaultValue) : "");
  composerInput.placeholder = placeholder;
  composerSkip.style.display = opts.allowSkip ? "inline-flex" : "none";
  presetsRow.style.display = opts.showPresets ? "flex" : "none";
  composerInput.focus();
  if(opts.defaultValue !== undefined){ try{ composerInput.select(); }catch(e){} }   // typing replaces the suggestion

  return new Promise((resolve, reject)=>{
    function cleanup(){
      composerSend.removeEventListener("click", submit);
      composerInput.removeEventListener("keydown", onKeydown);
      composerSkip.removeEventListener("click", skip);
      presetButtons.forEach(b=>b.removeEventListener("click", onPreset));
      setComposerIdle();
    }
    const thisPrompt = { reject, cleanup };
    activePrompt = thisPrompt;
    function submit(){
      const val = composerInput.value.trim();
      if(opts.required && !val){
        composerInput.classList.add("ring-2","ring-rose-400");
        setTimeout(()=>composerInput.classList.remove("ring-2","ring-rose-400"), 400);
        composerInput.focus();
        return;
      }
      if(activePrompt === thisPrompt) activePrompt = null;
      cleanup();
      appendUserMessage(val || "(skipped)");
      resolve(val);
    }
    function skip(){
      if(activePrompt === thisPrompt) activePrompt = null;
      cleanup();
      appendUserMessage("(skipped)");
      resolve("");
    }
    function onPreset(e){
      const current = parseFloat(composerInput.value) || 0;
      const round = e.currentTarget.dataset.round;
      if(round === "up") composerInput.value = Math.ceil(round2(current));           // 1020.40 -> 1021
      else if(round === "down") composerInput.value = Math.floor(round2(current));   // 1020.60 -> 1020
      else composerInput.value = round2(current + (parseFloat(e.currentTarget.dataset.amt) || 0));
      composerInput.focus();
    }
    function onKeydown(e){ if(e.key === "Enter"){ e.preventDefault(); submit(); } }

    composerSend.addEventListener("click", submit);
    composerInput.addEventListener("keydown", onKeydown);
    composerSkip.addEventListener("click", skip);
    presetButtons.forEach(b=>b.addEventListener("click", onPreset));
  });
}

function updateSummary(){
  let income = 0, expense = 0;
  ledger.forEach(e=>{
    if(e.type === "income") income += e.amount; else expense += e.amount;
  });
  document.getElementById("sumIncome").textContent = data.currency + fmt(income);
  document.getElementById("sumExpense").textContent = data.currency + fmt(expense);
  const net = income - expense;
  document.getElementById("sumNet").textContent = data.currency + fmt(net);

  const maxVal = Math.max(income, expense, 1);
  document.getElementById("barIncome").style.width = Math.min(100, (income / maxVal) * 100) + "%";
  document.getElementById("barExpense").style.width = Math.min(100, (expense / maxVal) * 100) + "%";

  const marginPct = income > 0 ? Math.round((net / income) * 100) : 0;
  const marginWrap = document.getElementById("netMarginWrap");
  const marginEl = document.getElementById("netMargin");
  const netLabel = document.getElementById("netLabel");
  marginEl.textContent = (marginPct >= 0 ? "+" : "") + marginPct + "%";
  if(net >= 0){
    marginWrap.className = "flex items-center gap-0.5 text-[9px] font-bold text-emerald-300 bg-emerald-950/70 px-1 py-0.5 rounded border border-emerald-500/30";
    netLabel.textContent = net === 0 ? "Break-even" : "Profitable surplus";
  } else {
    marginWrap.className = "flex items-center gap-0.5 text-[9px] font-bold text-rose-300 bg-rose-950/70 px-1 py-0.5 rounded border border-rose-500/30";
    netLabel.textContent = "Running deficit";
  }
}
