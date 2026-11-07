/* ============================================================================
   03-export.js  -  CSV export / share
   Classic script: shares the global scope with the other js/*.js files.
   Load order is defined in index.html.
   ============================================================================ */
/* ================= CSV EXPORT ================= */
function buildCSV(){
  const rows = [["Date","Type","Category","Account","Description","Debit","Credit","Taxable Amount","GST %","GST Amount","CGST Amount","SGST Amount","IGST Amount"]];
  // Sort oldest-first by date; entries logged on the same date keep the order they were recorded in
  // (stable sort). This matters now that "Set Date" lets a transaction be back-dated after the fact.
  const sorted = ledger.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  sorted.forEach(e=>{
    const split = e.taxSplit;
    rows.push([
      e.date, e.type, e.category, e.account,
      (e.description || "").replace(/"/g,'""'),
      e.type === "expense" ? fmt(e.amount) : "",
      e.type === "income" ? fmt(e.amount) : "",
      e.taxableAmount !== undefined ? fmt(e.taxableAmount) : "",
      e.gstPercent !== undefined ? e.gstPercent : "",
      e.gstAmount !== undefined ? fmt(e.gstAmount) : "",
      split && split.type === "CGST_SGST" ? fmt(split.cgstAmount) : "",
      split && split.type === "CGST_SGST" ? fmt(split.sgstAmount) : "",
      split && split.type === "IGST" ? fmt(split.igstAmount) : ""
    ]);
  });
  return rows.map(r => r.map(cell => `"${cell}"`).join(",")).join("\r\n");
}

function csvFileName(){ return `ledger_${todayISO()}.csv`; }

// Mobile browsers — iOS Safari in particular — don't reliably honor the <a download> attribute;
// tapping it often just opens/displays the file instead of saving it. The Web Share API (already
// used for "Send") is the mechanism mobile OSes actually support for saving a file, so route
// mobile downloads through it first and only fall back to the raw anchor-click method when
// Web Share isn't available (which is still the right approach on desktop).
function isMobileDevice(){
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.platform));
}

function downloadCSV(csv){
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = csvFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function shareCSV(csv){
  try{
    const file = new File([csv], csvFileName(), { type: "text/csv" });
    if(navigator.canShare && navigator.canShare({ files: [file] })){
      await navigator.share({ files: [file], title: "Ledger export", text: `Ledger CSV export — ${todayISO()}` });
      return true;
    }
  }catch(e){
    if(e && e.name === "AbortError") return true; // user cancelled the native share sheet — not an error
  }
  return false;
}

function openEmailDraft(){
  const subject = encodeURIComponent(`Ledger export ${todayISO()}`);
  const body = encodeURIComponent("Your ledger CSV was just downloaded to this device — please attach it here before sending (email links can't attach files automatically).");
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

async function exportCSV(){
  const csv = buildCSV();
  if(isMobileDevice()){
    const shared = await shareCSV(csv);
    if(shared) return "share";
  }
  downloadCSV(csv);
  return "download";
}
