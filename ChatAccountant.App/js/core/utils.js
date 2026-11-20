/* js/core/utils.js — small shared helpers: dates, number/phone formatting, text cleaning, escaping, party-name matching */
function localISO(d){ return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

function todayISO(){ return localISO(new Date()); }

function fmtRaw(n){ return (Math.round(Number(n) * 100) / 100).toFixed(2); }   // plain 1234.50 — for input boxes and CSV

// Indian grouping 1,23,456 (default) or international 123,456 — chosen in Settings
function groupDigits(int, mode){
  mode = mode || (data && data.numberFormat);
  if(mode === "international") return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if(int.length <= 3) return int;
  return int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + int.slice(-3);
}

function fmt(n){
  const raw = fmtRaw(n), neg = raw.charAt(0) === "-", parts = raw.replace("-", "").split(".");
  return (neg ? "-" : "") + groupDigits(parts[0]) + "." + parts[1];
}

function timeNow(){
  const d = new Date();
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2,"0");
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12; if(h === 0) h = 12;
  return `${h}:${m} ${ap}`;
}

function sm(n){ return n < 0 ? "-" + data.currency + fmt(-n) : data.currency + fmt(n); }

function shortDate(iso){
  const p = String(iso).split("-").map(Number);
  const d = new Date(p[0], p[1] - 1, p[2]);
  return isNaN(d.getTime()) ? esc(iso) : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" });
}

/* ---- Party names: a renamed party remembers its old names, because saved ledger entries still carry them ---- */

function partyHasName(p, name){
  const n = String(name == null ? "" : name).trim().toLowerCase();
  return !!n && (String(p.name).trim().toLowerCase() === n || (Array.isArray(p.aliases) && p.aliases.some(function(a){ return String(a).trim().toLowerCase() === n; })));
}

function renameParty(p, newName){
  if(!newName || newName === p.name) return;
  const aliases = (Array.isArray(p.aliases) ? p.aliases : []).filter(function(a){ return a !== newName && a !== p.name; });
  aliases.push(p.name);
  p.aliases = aliases.slice(-10);
  p.name = newName;
}

function round2(n){ return Math.round(Number(n) * 100) / 100; }

function cleanText(v, max){
  return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max || 120);
}

function normalizePhone(v){
  var s = String(v == null ? "" : v).trim();
  if(!s) return "";
  var d = s.replace(/\D/g, "");
  if(s.charAt(0) !== "+"){
    if(d.length === 11 && d.charAt(0) === "0") d = "91" + d.slice(1);
    else if(d.length === 10) d = "91" + d;
  }
  return /^[1-9]\d{7,14}$/.test(d) ? "+" + d : "";
}

function isPhone(v){ return !!normalizePhone(v); }

function toNum(v){ if(v === null || v === undefined || v === "") return null; const n = Number(v); return isFinite(n) ? n : null; }

function esc(v){
  return String(v == null ? "" : v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function initials(name){
  return (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(function(w){ return w[0].toUpperCase(); }).join("") || "?";
}

function fmtDateTime(iso){
  if(!iso) return "—";
  var d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}
