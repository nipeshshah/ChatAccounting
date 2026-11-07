/* ============================================================================
   07-print-share.js  -  Bill layouts (thermal/page), amount in words, print, PDF, share
   Classic script: shares the global scope with the other js/*.js files.
   Load order is defined in index.html.
   ============================================================================ */
/* ================= PRINT / SHARE SYSTEM =================
   Bills and statements are built as a "document" { mode, html, title, filename } laid out for the paper size
   chosen in Settings (3 Inch thermal, A4 or A5). The same document can be printed or turned into a PDF to share. */
const PRINT_MODES = {
  thermal: { label: "3 Inch", pageW: 76,  pageH: 0,   padX: 0,  padY: 2 },
  a4:      { label: "A4",     pageW: 210, pageH: 297, padX: 12, padY: 12 },
  a5:      { label: "A5",     pageW: 148, pageH: 210, padX: 9,  padY: 9 }
};
function getPrintMode(){ return PRINT_MODES[data.printMode] ? data.printMode : "thermal"; }

// ---- stylesheets (scoped by `root` so the same design prints from #printArea and renders for the PDF) ----
function thermalCss(root){
  const r = root + " .doc-thermal";
  return `
  ${r}{font-family:'JetBrains Mono','Courier New',monospace;color:#000;max-width:76mm;margin:0 auto;padding:4px 2px;font-size:11px;line-height:1.35;}
  ${r} .ctr{text-align:center;}
  ${r} .shop{font-size:14px;font-weight:700;margin:0;text-align:center;word-break:break-word;}
  ${r} .meta{font-size:10px;text-align:center;word-break:break-word;}
  ${r} .ttl{font-weight:700;text-align:center;letter-spacing:0.04em;margin-top:6px;}
  ${r} .inv{border-top:2px solid #000;border-bottom:2px solid #000;text-align:center;font-weight:700;letter-spacing:0.12em;padding:3px 0;margin:7px 0 5px;font-size:12px;}
  ${r} .lbl{font-size:9.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;text-align:center;}
  ${r} .sep{border-top:1px dashed #000;margin:6px 0;}
  ${r} .nm{font-weight:700;font-size:12px;text-align:center;word-break:break-word;}
  ${r} .row{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;padding:2px 0;page-break-inside:avoid;}
  ${r} .ds{flex:1;min-width:0;text-align:left;word-break:break-word;}
  ${r} .am{white-space:nowrap;text-align:right;}
  ${r} .hd{font-weight:700;border-bottom:1px dotted #000;margin-bottom:2px;}
  ${r} .dt{font-weight:700;margin-top:6px;border-bottom:1px dotted #000;page-break-after:avoid;}
  ${r} .bold{font-weight:700;}
  ${r} .close{border-top:2px solid #000;margin-top:6px;padding-top:5px;display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-weight:700;font-size:14px;}
  ${r} .sub{font-size:10px;text-align:center;margin-top:2px;}
  ${r} .words{font-size:10px;text-align:center;margin-top:5px;font-style:italic;word-break:break-word;}
  ${r} .thx{font-weight:700;text-align:center;margin-top:8px;}
  ${r} .foot{margin-top:6px;font-size:9px;text-align:center;}
  `;
}
function pageCss(root, small){
  const r = root + " .doc-page";
  return `
  ${r}{font-family:'Plus Jakarta Sans',Arial,sans-serif;color:#0B192C;font-size:${small ? 11 : 13}px;line-height:1.45;width:100%;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  ${r} .hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:1.5em;border-bottom:0.25em solid #0066FF;padding-bottom:0.9em;}
  ${r} .bn{font-size:1.7em;font-weight:800;line-height:1.2;}
  ${r} .bm{color:#475569;font-size:0.92em;}
  ${r} .rt{text-align:right;flex-shrink:0;}
  ${r} .dtitle{font-size:1.3em;font-weight:800;color:#0066FF;letter-spacing:0.05em;margin-bottom:0.25em;}
  ${r} .party{margin-top:1.3em;border:1px solid #E2E8F0;border-radius:0.7em;padding:0.8em 1.1em;background:#F8FAFC;}
  ${r} .pl{font-size:0.75em;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#64748B;margin-bottom:0.2em;}
  ${r} .pn{font-size:1.15em;font-weight:700;}
  ${r} table{width:100%;border-collapse:collapse;}
  ${r} table.items{margin-top:1.5em;}
  ${r} th{font-size:0.75em;text-transform:uppercase;letter-spacing:0.06em;color:#64748B;text-align:left;padding:0.6em 0.5em;border-bottom:2px solid #0B192C;}
  ${r} td{padding:0.65em 0.5em;border-bottom:1px solid #E2E8F0;vertical-align:top;}
  ${r} tr{page-break-inside:avoid;}
  ${r} .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
  ${r} .sumwrap{display:flex;justify-content:flex-end;margin-top:0.8em;}
  ${r} table.sum{width:55%;}
  ${r} table.sum td{border-bottom:1px solid #E2E8F0;padding:0.45em 0.5em;}
  ${r} table.sum tr.gt td{border-top:0.2em solid #0066FF;border-bottom:none;font-weight:800;font-size:1.2em;padding-top:0.6em;}
  ${r} .words{margin-top:1em;font-style:italic;color:#334155;}
  ${r} .sign{margin-top:3.2em;text-align:right;}
  ${r} .sign .sl{display:inline-block;min-width:13em;border-top:1px solid #0B192C;padding-top:0.35em;margin-top:2.6em;text-align:center;font-size:0.9em;color:#475569;}
  ${r} .ft{margin-top:2.2em;text-align:center;color:#94A3B8;font-size:0.82em;}
  ${r} .strip{display:flex;gap:0.7em;margin-top:1.2em;}
  ${r} .sb{flex:1;border:1px solid #E2E8F0;border-radius:0.6em;padding:0.55em 0.8em;background:#F8FAFC;}
  ${r} .sb.dark{background:#0B192C;border-color:#0B192C;color:#fff;}
  ${r} .sbl{font-size:0.7em;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#64748B;}
  ${r} .sb.dark .sbl{color:#CBD5E1;}
  ${r} .sbv{font-size:1.1em;font-weight:800;font-variant-numeric:tabular-nums;}
  ${r} table.stm{margin-top:1.3em;}
  ${r} tr.dg td{background:#EEF2FF;font-weight:700;padding:0.4em 0.5em;border-bottom:none;color:#1E3A8A;}
  ${r} tr.tt td{font-weight:800;border-top:2px solid #0B192C;border-bottom:none;}
  ${r} .closeline{display:flex;justify-content:space-between;align-items:baseline;margin-top:0.8em;padding-top:0.7em;border-top:0.2em solid #0066FF;font-weight:800;font-size:1.25em;}
  ${r} .closenote{color:#64748B;font-size:0.8em;font-weight:500;}
  `;
}
function docCss(mode, root, forPrint){
  const pageRule = !forPrint ? "" : mode === "a4" ? "@page{size:A4;margin:12mm;}" : mode === "a5" ? "@page{size:A5;margin:9mm;}" : "@page{margin:3mm;}";
  return pageRule + (mode === "thermal" ? thermalCss(root) : pageCss(root, mode === "a5"));
}

// ---- amount in words (Indian lakh/crore grouping): 1180 -> "Rupees One Thousand One Hundred Eighty Only" ----
const W_ONES = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
const W_TENS = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
function wordsBelow100(x){ return x < 20 ? W_ONES[x] : W_TENS[Math.floor(x / 10)] + (x % 10 ? " " + W_ONES[x % 10] : ""); }
function wordsBelow1000(x){ const h = Math.floor(x / 100), r = x % 100; return (h ? W_ONES[h] + " Hundred" + (r ? " " : "") : "") + (r ? wordsBelow100(r) : ""); }
function indianWords(x){
  if(x === 0) return "Zero";
  const parts = [];
  const crore = Math.floor(x / 1e7); x %= 1e7;
  const lakh = Math.floor(x / 1e5); x %= 1e5;
  const thou = Math.floor(x / 1e3); x %= 1e3;
  if(crore) parts.push(indianWords(crore) + " Crore");
  if(lakh) parts.push(wordsBelow100(lakh) + " Lakh");
  if(thou) parts.push(wordsBelow100(thou) + " Thousand");
  if(x) parts.push(wordsBelow1000(x));
  return parts.join(" ");
}
function amountInWords(n){
  n = Math.round(Number(n) * 100) / 100;
  if(!(n >= 0) || n >= 1e12) return "";
  const rupees = Math.floor(n + 1e-9), paise = Math.round((n - rupees) * 100);
  return "Rupees " + indianWords(rupees) + (paise ? " and " + wordsBelow100(paise) + " Paise" : "") + " Only";
}

// ---- bill markup: 3-inch receipt, and A4/A5 page ----
function billHtmlThermal(entry, kind, shop, party, billNo){
  const title = kind === "sale" ? "TAX INVOICE" : "PURCHASE BILL";
  const partyLabel = kind === "sale" ? "Bill To" : "Bill From";
  const hasGst = entry.taxableAmount !== undefined, sp = entry.taxSplit;
  const row = function(left, right, cls){ return '<div class="row' + (cls ? " " + cls : "") + '"><span class="ds">' + left + '</span><span class="am">' + right + '</span></div>'; };
  let taxRows = "";
  if(hasGst){
    taxRows += row("Taxable value", fmt(entry.taxableAmount));
    if(sp && sp.type === "CGST_SGST") taxRows += row("CGST (" + esc(sp.cgstPercent) + "%)", fmt(sp.cgstAmount)) + row("SGST (" + esc(sp.sgstPercent) + "%)", fmt(sp.sgstAmount));
    else if(sp && sp.type === "IGST") taxRows += row("IGST (" + esc(sp.igstPercent) + "%)", fmt(sp.igstAmount));
    else taxRows += row("GST (" + esc(entry.gstPercent) + "%)", fmt(entry.gstAmount));
  }
  const words = data.currency === "₹" ? amountInWords(entry.amount) : "";
  return `
    <div class="doc doc-thermal">
      <p class="shop">${esc(shop.name) || "Your Business"}</p>
      ${shop.address ? `<div class="meta">${esc(shop.address)}</div>` : ""}
      ${shop.state ? `<div class="meta">State: ${esc(shop.state)}</div>` : ""}
      ${shop.gstNumber ? `<div class="meta">GSTIN: ${esc(shop.gstNumber)}</div>` : ""}
      <div class="inv">${title}</div>
      ${row("Bill No", esc(billNo), "bold")}
      ${row("Date", shortDate(entry.date))}
      <div class="sep"></div>
      <div class="lbl">${partyLabel}</div>
      <div class="nm">${esc(party.name)}</div>
      ${party.address ? `<div class="meta">${esc(party.address)}</div>` : ""}
      ${party.gstNumber ? `<div class="meta">GSTIN: ${esc(party.gstNumber)}</div>` : ""}
      ${party.phone ? `<div class="meta">Mobile: ${esc(party.phone)}</div>` : ""}
      <div class="sep"></div>
      ${row("Description", "Amount", "hd")}
      ${row(esc(entry.description || entry.category), fmt(hasGst ? entry.taxableAmount : entry.amount))}
      <div class="sep"></div>
      ${taxRows}
      <div class="close"><span>TOTAL</span><span>${sm(entry.amount)}</span></div>
      ${words ? `<div class="words">${esc(words)}</div>` : ""}
      <div class="sep"></div>
      <div class="thx">Thank you!</div>
      <div class="meta">Amounts in ${esc(data.currency)}</div>
      <div class="foot">Generated by Chat Accountant</div>
    </div>`;
}
function billHtmlPage(entry, kind, shop, party, billNo, mode){
  const title = kind === "sale" ? "TAX INVOICE" : "PURCHASE BILL";
  const partyLabel = kind === "sale" ? "Bill To" : "Bill From";
  const hasGst = entry.taxableAmount !== undefined, sp = entry.taxSplit;
  const cur = function(n){ return data.currency + fmt(n); };
  const sumRow = function(l, v, cls){ return '<tr' + (cls ? ' class="' + cls + '"' : "") + '><td>' + l + '</td><td class="r">' + v + '</td></tr>'; };
  let sum = "";
  if(hasGst){
    sum += sumRow("Taxable value", cur(entry.taxableAmount));
    if(sp && sp.type === "CGST_SGST") sum += sumRow("CGST (" + esc(sp.cgstPercent) + "%)", cur(sp.cgstAmount)) + sumRow("SGST (" + esc(sp.sgstPercent) + "%)", cur(sp.sgstAmount));
    else if(sp && sp.type === "IGST") sum += sumRow("IGST (" + esc(sp.igstPercent) + "%)", cur(sp.igstAmount));
    else sum += sumRow("GST (" + esc(entry.gstPercent) + "%)", cur(entry.gstAmount));
  }
  sum += sumRow("Total", cur(entry.amount), "gt");
  const words = data.currency === "₹" ? amountInWords(entry.amount) : "";
  return `
    <div class="doc doc-page doc-${mode}">
      <div class="hdr">
        <div>
          <div class="bn">${esc(shop.name) || "Your Business"}</div>
          ${shop.address ? `<div class="bm">${esc(shop.address)}</div>` : ""}
          ${shop.state ? `<div class="bm">State: ${esc(shop.state)}</div>` : ""}
          ${shop.gstNumber ? `<div class="bm">GSTIN: ${esc(shop.gstNumber)}</div>` : ""}
        </div>
        <div class="rt">
          <div class="dtitle">${title}</div>
          <div class="bm">Bill No: <b>${esc(billNo)}</b></div>
          <div class="bm">Date: ${shortDate(entry.date)}</div>
        </div>
      </div>
      <div class="party">
        <div class="pl">${partyLabel}</div>
        <div class="pn">${esc(party.name)}</div>
        ${party.address ? `<div class="bm">${esc(party.address)}</div>` : ""}
        ${party.gstNumber ? `<div class="bm">GSTIN: ${esc(party.gstNumber)}</div>` : ""}
        ${party.phone ? `<div class="bm">Mobile: ${esc(party.phone)}</div>` : ""}
      </div>
      <table class="items">
        <thead><tr><th style="width:2.5em;">#</th><th>Description</th><th class="r">Amount</th></tr></thead>
        <tbody><tr><td>1</td><td>${esc(entry.description || entry.category)}</td><td class="r">${cur(hasGst ? entry.taxableAmount : entry.amount)}</td></tr></tbody>
      </table>
      <div class="sumwrap"><table class="sum">${sum}</table></div>
      ${words ? `<div class="words">Amount in words: ${esc(words)}</div>` : ""}
      <div class="sign"><div>For ${esc(shop.name) || "Your Business"}</div><div class="sl">Authorised Signatory</div></div>
      <div class="ft">Thank you for your business · Generated by Chat Accountant</div>
    </div>`;
}

// Allocates the bill number ONCE; the same document can then be printed and/or shared without using up more numbers.
function buildBillDoc(entry, kind, shop, party){
  const billNo = nextBillNo(), mode = getPrintMode();
  const html = mode === "thermal" ? billHtmlThermal(entry, kind, shop, party, billNo) : billHtmlPage(entry, kind, shop, party, billNo, mode);
  const safe = String(billNo).replace(/[^\w\-]+/g, "_");
  return { mode: mode, html: html, title: (kind === "sale" ? "Invoice " : "Bill ") + billNo + " · " + party.name, filename: (kind === "sale" ? "Invoice-" : "Bill-") + safe + ".pdf" };
}

// ---- print ----
function printDocument(doc){
  document.getElementById("printArea").innerHTML = '<style>' + docCss(doc.mode, "#printArea", true) + '</style>' + doc.html;
  // A short delay lets the browser lay out the freshly-injected content before printing.
  setTimeout(function(){ window.print(); }, 150);
}

// ---- share (as a PDF) ----
function loadScriptOnce(src){
  return new Promise(function(resolve, reject){
    const s = document.createElement("script");
    s.src = src; s.onload = resolve;
    s.onerror = function(){ reject(new Error("couldn't load the PDF library — check your internet connection")); };
    document.head.appendChild(s);
  });
}
async function ensurePdfLibs(){
  if(!window.html2canvas) await loadScriptOnce("lib/pdf/html2canvas.min.js");
  if(!(window.jspdf && window.jspdf.jsPDF)) await loadScriptOnce("lib/pdf/jspdf.umd.min.js");
}
// Renders the document off-screen at the chosen paper width and packs it into a PDF (cached on the document).
async function getDocPdf(doc){
  if(doc.blob) return doc.blob;
  await ensurePdfLibs();
  const m = PRINT_MODES[doc.mode];
  const stage = document.createElement("div");
  stage.style.cssText = "position:fixed;left:-10000px;top:0;background:#fff;box-sizing:border-box;width:" + m.pageW + "mm;padding:0 " + m.padX + "mm;";
  stage.id = "shareStage";
  stage.innerHTML = '<style>' + docCss(doc.mode, "#shareStage", false) + '</style>' + doc.html;
  document.body.appendChild(stage);
  try{
    if(document.fonts && document.fonts.ready) await document.fonts.ready;
    const canvas = await window.html2canvas(stage, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const jsPDF = window.jspdf.jsPDF;
    const W = canvas.width, H = canvas.height;
    let pdf;
    if(!m.pageH){                                     // 3-inch: one long page
      const hMm = H / W * m.pageW + 2 * m.padY;
      pdf = new jsPDF({ unit: "mm", format: [m.pageW, Math.max(hMm, 30)] });
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, m.padY, m.pageW, H / W * m.pageW);
    } else {                                          // A4 / A5: slice into pages
      pdf = new jsPDF({ unit: "mm", format: [m.pageW, m.pageH] });
      const sliceMm = m.pageH - 2 * m.padY, slicePx = Math.floor(W * sliceMm / m.pageW);
      for(let y = 0, first = true; y < H; y += slicePx, first = false){
        const h = Math.min(slicePx, H - y);
        const part = document.createElement("canvas");
        part.width = W; part.height = h;
        part.getContext("2d").drawImage(canvas, 0, y, W, h, 0, 0, W, h);
        if(!first) pdf.addPage([m.pageW, m.pageH]);
        pdf.addImage(part.toDataURL("image/jpeg", 0.95), "JPEG", 0, m.padY, m.pageW, h / W * m.pageW);
      }
    }
    doc.blob = pdf.output("blob");
    return doc.blob;
  } finally { stage.remove(); }
}
function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
}
// "shared" | "cancelled" | "blocked" (browser wants a fresh tap) | "downloaded" (no file sharing here)
async function sharePdfBlob(blob, filename, title){
  const file = new File([blob], filename, { type: "application/pdf" });
  if(navigator.canShare && navigator.canShare({ files: [file] })){
    try{ await navigator.share({ files: [file], title: title }); return "shared"; }
    catch(e){
      if(e && e.name === "AbortError") return "cancelled";
      if(e && e.name === "NotAllowedError") return "blocked";
    }
  }
  downloadBlob(blob, filename);
  return "downloaded";
}

// Chat: share a document
async function shareFlow(doc){
  await botSay("Preparing the PDF…", { icon: "ph-file-pdf" });
  let blob;
  try{ blob = await getDocPdf(doc); }
  catch(e){ await botSay("Couldn't prepare the PDF — " + (e && e.message ? e.message : "unknown error") + ".", { icon: "ph-warning" }); return; }
  let r = await sharePdfBlob(blob, doc.filename, doc.title);
  if(r === "blocked"){
    await botSay("PDF ready. Tap below to open the share sheet.", { icon: "ph-share-network" });
    const go = await askQuickReply([{ label: "Share file", value: "go", icon: "ph-share-network" }, { label: "Skip", value: "skip", icon: "ph-x" }]);
    if(go !== "go") return;
    r = await sharePdfBlob(blob, doc.filename, doc.title);
  }
  if(r === "shared") await botSay("Shared.", { icon: "ph-check-circle" });
  else if(r === "downloaded") await botSay("This browser can't share files, so the PDF was downloaded instead.", { icon: "ph-download" });
}

// Chat: print / share loop for one document (the bill number is only used once)
async function outputDocument(doc, firstAction, noun){
  let action = firstAction, asked = !!firstAction;
  while(true){
    if(!action){
      await botSay(asked ? `Anything else with this ${noun}?` : `Print or share the ${noun}?`, { icon: "ph-printer" });
      action = await askQuickReply([
        { label: "Print", value: "print", icon: "ph-printer" },
        { label: "Share", value: "share", icon: "ph-share-network" },
        { label: "Done", value: "done", icon: "ph-check" }
      ]);
    }
    if(action === "print"){
      printDocument(doc);
      await botSay(`Sent to print (${PRINT_MODES[doc.mode].label}).`, { icon: "ph-check-circle" });
    } else if(action === "share"){
      await shareFlow(doc);
    } else return;
    asked = true; action = null;
  }
}

async function offerBill(entry, kind, party){
  const choice = await askQuickReply([
    { label: "Print bill", value: "print", icon: "ph-printer" },
    { label: "Share bill", value: "share", icon: "ph-share-network" },
    { label: "No thanks", value: "no", icon: "ph-x" }
  ]);
  if(choice === "no") return;
  const shop = await getShopDetails();
  if(party) await ensurePartyDetails(party, kind);
  else party = { name: "Walk-in Customer" };
  await outputDocument(buildBillDoc(entry, kind, shop, party), choice, "bill");
}
