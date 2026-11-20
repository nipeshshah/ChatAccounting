/* js/core/state.js — app state (config + ledger), config normalising, saving, working date */
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
  if(d.numberFormat !== "international") d.numberFormat = "indian";
  if(!["cash", "sales", "income", "debt"].includes(d.summaryMode)) d.summaryMode = "cash";
  if(typeof d.setupDone !== "boolean") d.setupDone = false;
  if(typeof d.gstEnabled !== "boolean") d.gstEnabled = true;     // GST on sales (purchases can always carry GST)
  if(typeof d.billCounter !== "number") d.billCounter = 1;
  if(!Array.isArray(d.appliedShares)) d.appliedShares = [];   // request ids already applied to balances
  return d;
}

// Every write goes: app -> Panel (jQuery) -> Database file -> server
function saveData(){ Panel.config.save(data); }

const savePromises = new WeakMap();   // entry -> its pending save, so Undo can wait for it

function addLedgerEntry(entry){
  ledger.push(entry);            // show it on screen immediately
  updateSummary();
  savePromises.set(entry, Panel.ledger.add(entry).done(function(saved){ if(saved && saved.id) entry.id = saved.id; }));
  return entry;
}

/* ---- Working date: defaults to today; overridden via the "Set Date" menu option ---- */

let workingDate = null; // null = use the real today

function currentDate(){ return workingDate || todayISO(); }

function updateDateBanner(){
  updateSummary();                       // the totals strip follows the working date
  const active = !!(workingDate && workingDate !== todayISO());
  const banner = document.getElementById("dateBanner");
  if(!banner) return;
  banner.style.display = active ? "flex" : "none";
  if(active) document.getElementById("dateBannerText").textContent = `Logging transactions as ${workingDate}`;
}
