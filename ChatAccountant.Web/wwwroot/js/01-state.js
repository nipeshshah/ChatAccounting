/* ============================================================================
   01-state.js  -  App state, config model, PIN helpers, working date
   Classic script: shares the global scope with the other js/*.js files.
   Load order is defined in index.html.
   ============================================================================ */
/* ================= DATA MODEL (unchanged logic) ================= */
const DEFAULT_DATA = {
  currency: "₹",
  categories: {
    income: ["Consulting", "Salary", "Interest Income", "Other Income"],
    expense: ["Rent", "Utilities", "Salaries & Wages", "Office Supplies", "Marketing", "Travel", "Software & Subscriptions", "Bank Fees", "Miscellaneous"]
  },
  accounts: ["Cash", "UPI", "Other"],
  debtors: [],
  creditors: [],
  gstRates: [],
  billCounter: 1,
  invoiceFormat: "INV-[INDEX]",
  shop: { name: "", address: "", state: "", gstNumber: "" }
};

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

/* ---- App state: loaded through Panel after sign-in ---- */
let data = JSON.parse(JSON.stringify(DEFAULT_DATA));
let ledger = [];

function normalizeConfig(cfg){
  const d = Object.assign(JSON.parse(JSON.stringify(DEFAULT_DATA)), cfg || {});
  d.categories = Object.assign({ income: [], expense: [] }, d.categories || {});
  // "Sales"/"Purchases" as plain categories are retired — Sale/Purchase now only happen via the dedicated flow
  d.categories.income = (d.categories.income || []).filter(c => c !== "Sales");
  d.categories.expense = (d.categories.expense || []).filter(c => c !== "Purchases");
  d.shop = Object.assign({ name: "", address: "", state: "", gstNumber: "", discoverable: true }, d.shop || {});
  if(!Array.isArray(d.accounts)) d.accounts = ["Cash", "UPI", "Other"];
  if(!Array.isArray(d.debtors)) d.debtors = [];
  if(!Array.isArray(d.creditors)) d.creditors = [];
  if(!Array.isArray(d.gstRates)) d.gstRates = [];
  if(!d.invoiceFormat) d.invoiceFormat = "INV-[INDEX]";
  if(d.viewMode !== "compact") d.viewMode = "regular";
  if(!PRINT_MODES[d.printMode]) d.printMode = "thermal";
  if(typeof d.billCounter !== "number") d.billCounter = 1;
  if(!Array.isArray(d.appliedShares)) d.appliedShares = [];   // request ids already applied to balances
  return d;
}

// Every write goes: app -> Panel (jQuery) -> Database file -> server
function saveData(){ Panel.config.save(data); }
function addLedgerEntry(entry){
  ledger.push(entry);            // show it on screen immediately
  updateSummary();
  Panel.ledger.add(entry).done(function(saved){ if(saved && saved.id) entry.id = saved.id; });
  return entry;
}

function localISO(d){ return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function todayISO(){ return localISO(new Date()); }

/* ---- Working date: defaults to today; overridden via the "Set Date" menu option ---- */
let workingDate = null; // null = use the real today
function currentDate(){ return workingDate || todayISO(); }
function updateDateBanner(){
  const active = !!(workingDate && workingDate !== todayISO());
  const banner = document.getElementById("dateBanner");
  if(!banner) return;
  banner.style.display = active ? "flex" : "none";
  if(active) document.getElementById("dateBannerText").textContent = `Logging transactions as ${workingDate}`;
}
function fmt(n){ return (Math.round(n*100)/100).toFixed(2); }
function timeNow(){
  const d = new Date();
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2,"0");
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12; if(h === 0) h = 12;
  return `${h}:${m} ${ap}`;
}
