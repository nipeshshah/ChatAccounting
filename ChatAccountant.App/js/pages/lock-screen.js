/* js/pages/lock-screen.js — optional PIN screen lock */
const PIN_KEY_BASE = "ledgerChat.pinHash";

// Lightweight local hash (cyrb53) — good enough to gate a screen lock,
// NOT cryptographic encryption. The PIN never leaves this device.
function simpleHash(str){
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for(let i = 0; i < str.length; i++){
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

// The PIN is a per-device, per-user screen lock. It is stored locally and is NOT sent to the server.
function pinKey(){ return PIN_KEY_BASE + "." + (Panel.user ? Panel.user.id : "anon"); }

function getPinHash(){ return localStorage.getItem(pinKey()); }

function hasPinSet(){ return !!getPinHash(); }

function setPin(pin){ localStorage.setItem(pinKey(), simpleHash(pin)); }

function clearPin(){ localStorage.removeItem(pinKey()); }

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
