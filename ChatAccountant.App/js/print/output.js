/* js/print/output.js — print, share-as-PDF, and the print/share loop */
// ---- print ----
function printDocument(doc){
  document.getElementById("printArea").innerHTML = '<style>' + pageRule(doc.mode) + '</style>' + doc.html;
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
  if(!window.html2canvas) await loadScriptOnce("assets/vendor/html2canvas/html2canvas.min.js");
  if(!(window.jspdf && window.jspdf.jsPDF)) await loadScriptOnce("assets/vendor/jspdf/jspdf.umd.min.js");
}

// File names stay plain ASCII so every share target accepts them; a name with no usable letters (e.g. a customer
// written in Gujarati or Hindi) falls back to a fixed word instead of ending up as just "_".
function safeFileName(text, fallback){
  const s = String(text == null ? "" : text).replace(/[^A-Za-z0-9\-]+/g, "_").replace(/^_+|_+$/g, "");
  return /[A-Za-z0-9]/.test(s) ? s : fallback;
}

// A mostly-white canvas check: a blank render must never turn into an "empty" PDF
function canvasIsBlank(canvas){
  if(!canvas || !canvas.width || !canvas.height) return true;
  const small = document.createElement("canvas");
  small.width = 64; small.height = Math.max(1, Math.round(64 * canvas.height / canvas.width));
  const ctx = small.getContext("2d");
  ctx.drawImage(canvas, 0, 0, small.width, small.height);
  const px = ctx.getImageData(0, 0, small.width, small.height).data;
  for(let i = 0; i < px.length; i += 4){ if(px[i] < 250 || px[i + 1] < 250 || px[i + 2] < 250) return false; }   // any ink at all
  return true;
}

// Draws the document at the chosen paper width. The first try uses an off-screen stage; if that renders blank
// (some mobile browsers), the second try uses a stage inside the viewport, hidden behind the app.
async function renderDocCanvas(doc, m, inViewport){
  const stage = document.createElement("div");
  stage.id = "shareStage";
  stage.className = "doc-root";
  stage.style.cssText = "background:#fff;box-sizing:border-box;width:" + m.pageW + "mm;padding:0 " + m.padX + "mm 6mm;"
    + (inViewport ? "position:absolute;left:0;top:0;z-index:-1;" : "position:fixed;left:-10000px;top:0;");
  stage.innerHTML = doc.html;
  document.body.appendChild(stage);
  try{
    if(document.fonts && document.fonts.ready) await document.fonts.ready;
    await new Promise(function(r){ requestAnimationFrame(function(){ r(); }); });          // let layout settle first
    const w = stage.offsetWidth, h = stage.offsetHeight;
    const scale = Math.max(1, Math.min(2, Math.sqrt(12e6 / (w * h))));                     // stay under phone canvas limits
    return await window.html2canvas(stage, { scale: scale, backgroundColor: "#ffffff", useCORS: true, width: w, height: h,
                                             windowWidth: Math.max(w, 400), windowHeight: Math.max(h, 400), scrollX: 0, scrollY: 0 });
  } finally { stage.remove(); }
}

// Renders the document and packs it into a PDF (cached on the document). Throws instead of ever returning an empty file.
async function getDocPdf(doc){
  if(doc.blob && doc.blob.size > 800) return doc.blob;
  await ensurePdfLibs();
  const m = PRINT_MODES[doc.mode];
  let canvas = null;
  try{ canvas = await renderDocCanvas(doc, m, false); }catch(e){ canvas = null; }
  if(canvasIsBlank(canvas)) canvas = await renderDocCanvas(doc, m, true);
  if(canvasIsBlank(canvas)) throw new Error("the document rendered blank on this device");

  const jsPDF = window.jspdf.jsPDF;
  const W = canvas.width, H = canvas.height;
  const jpeg = function(c){
    const url = c.toDataURL("image/jpeg", 0.95);
    if(url.indexOf("data:image/jpeg") !== 0 || url.length < 200) throw new Error("couldn't turn the page into an image");
    return url;
  };
  let pdf;
  if(!m.pageH){                                     // 3-inch: one long page
    const hMm = H / W * m.pageW + 2 * m.padY;
    pdf = new jsPDF({ unit: "mm", format: [m.pageW, Math.max(hMm, 30)] });
    pdf.addImage(jpeg(canvas), "JPEG", 0, m.padY, m.pageW, H / W * m.pageW);
  } else {                                          // A4 / A5: slice into pages
    pdf = new jsPDF({ unit: "mm", format: [m.pageW, m.pageH] });
    const sliceMm = m.pageH - 2 * m.padY, slicePx = Math.floor(W * sliceMm / m.pageW);
    for(let y = 0, first = true; y < H; y += slicePx, first = false){
      const h = Math.min(slicePx, H - y);
      const part = document.createElement("canvas");
      part.width = W; part.height = h;
      part.getContext("2d").drawImage(canvas, 0, y, W, h, 0, 0, W, h);
      if(!first) pdf.addPage([m.pageW, m.pageH]);
      pdf.addImage(jpeg(part), "JPEG", 0, m.padY, m.pageW, h / W * m.pageW);
    }
  }
  const bytes = pdf.output("arraybuffer");
  const head = String.fromCharCode.apply(null, new Uint8Array(bytes.slice(0, 5)));
  if(bytes.byteLength < 800 || head !== "%PDF-") throw new Error("the PDF came out empty");
  doc.blob = new Blob([bytes], { type: "application/pdf" });
  return doc.blob;
}
function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
}

// Why the last share attempt failed — shown to the user instead of failing silently
let lastShareError = null;
function shareErrorText(){ const e = lastShareError; return e ? (e.name || "Error") + (e.message ? ": " + e.message : "") : ""; }

// "shared" | "cancelled" | "blocked" (the browser refused: no fresh tap, or no share sheet) | "downloaded" (no file sharing here)
async function sharePdfBlob(blob, filename, title){
  if(!blob || !blob.size) throw new Error("the PDF is empty");
  const file = new File([blob], filename || "document.pdf", { type: "application/pdf", lastModified: Date.now() });
  lastShareError = null;
  // The share sheet is only used on phones and tablets. On a computer (Windows especially) email apps such as Outlook
  // receive the shared file as an EMPTY attachment called "no_name", so there the PDF is saved for you to attach.
  if(isMobileDevice() && navigator.canShare && navigator.canShare({ files: [file] })){
    // some share targets choke on a title next to a file, so the second attempt sends the file alone
    const attempts = [{ files: [file], title: title }, { files: [file] }];
    for(let i = 0; i < attempts.length; i++){
      try{ await navigator.share(attempts[i]); return "shared"; }
      catch(e){
        if(!lastShareError) lastShareError = e;                       // keep the FIRST reason
        if(e && e.name === "AbortError") return "cancelled";
        if(e && e.name === "NotAllowedError") return "blocked";
      }
    }
    return "blocked";
  }
  downloadBlob(blob, filename || "document.pdf");
  return "downloaded";
}

// A phone only opens the share sheet straight after a tap, and drawing the PDF takes a moment. So on phones the PDF is
// prepared in the background while the bill / statement is on screen, and Share can then open the sheet inside the tap.
function warmPdf(doc){
  if(!isMobileDevice() || doc.warming) return doc;
  doc.warming = getDocPdf(doc).catch(function(){ return null; });      // problems are reported when the user taps Share
  return doc;
}
function openPdf(blob){
  const url = URL.createObjectURL(blob);
  if(!window.open(url, "_blank")) window.location.href = url;
  setTimeout(function(){ URL.revokeObjectURL(url); }, 120000);
}

// Chat: share a document
async function shareFlow(doc){
  let blob = doc.blob && doc.blob.size > 800 ? doc.blob : null;
  if(!blob && doc.warming) blob = await doc.warming;                   // being prepared right now
  if(!blob){
    await botSay("Preparing the PDF…", { icon: "ph-file-pdf" });
    try{ blob = await getDocPdf(doc); }
    catch(e){ await botSay("Couldn't prepare the PDF — " + (e && e.message ? e.message : "unknown error") + ".", { icon: "ph-warning" }); return; }
  }
  const kb = Math.max(1, Math.round(blob.size / 1024));
  let r = await sharePdfBlob(blob, doc.filename, doc.title), tries = 1;
  while(r === "blocked"){
    const why = shareErrorText();
    await botSay(tries === 1
      ? "PDF ready (" + kb + " KB). Tap Share file to open the share sheet."
      : "The share sheet didn't open" + (why ? " (" + why + ")" : "") + ". Save or open the PDF and share it from there. If you opened this app from inside another app (WhatsApp, Instagram …), open it in Chrome or Safari instead.", { icon: "ph-share-network" });
    const act = await askQuickReply([
      { label: tries === 1 ? "Share file" : "Try again", value: "go", icon: "ph-share-network" },
      { label: "Save PDF", value: "save", icon: "ph-download" },
      { label: "Open PDF", value: "open", icon: "ph-file-pdf" },
      { label: "Skip", value: "skip", icon: "ph-x" }
    ]);
    if(act === "save"){ downloadBlob(blob, doc.filename); await botSay("PDF saved to this device (Downloads).", { icon: "ph-check-circle" }); return; }
    if(act === "open"){ openPdf(blob); await botSay("Opened the PDF — use the viewer's share or download button.", { icon: "ph-check-circle" }); return; }
    if(act !== "go") return;
    r = await sharePdfBlob(blob, doc.filename, doc.title);             // straight after the tap, so the browser allows it
    tries++;
  }
  if(r === "shared") await botSay("Shared.", { icon: "ph-check-circle" });
  else if(r === "cancelled") await botSay("Share cancelled.", { icon: "ph-info" });
  else if(r === "downloaded") await botSay(isMobileDevice()
    ? "This browser can't share files, so the PDF was saved to this device instead."
    : "The PDF was saved to your Downloads folder. Attach it from there — sharing straight from a computer into email often arrives as an empty file.", { icon: "ph-download" });
}

// Chat: print / share loop for one document (the bill number is only used once)
async function outputDocument(doc, firstAction, noun){
  let action = firstAction, asked = !!firstAction;
  while(true){
    if(!action){
      await botSay(asked ? `Anything else with this ${noun}?` : `Print or share the ${noun}?`, { icon: "ph-printer" });
      const options = [
        { label: "Print", value: "print", icon: "ph-printer" },
        { label: "Share", value: "share", icon: "ph-share-network" },
        { label: "Done", value: "done", icon: "ph-check" }
      ];
      if(doc.meta) options.splice(2, 0, { label: "WhatsApp", value: "whatsapp", icon: "ph-whatsapp-logo" });   // bills only
      action = await askQuickReply(options);
    }
    if(action === "print"){
      printDocument(doc);
      await botSay(`Sent to print (${PRINT_MODES[doc.mode].label}).`, { icon: "ph-check-circle" });
    } else if(action === "share"){
      await shareFlow(doc);
    } else if(action === "whatsapp"){
      await whatsappFlow(doc);
    } else return;
    asked = true; action = null;
  }
}
