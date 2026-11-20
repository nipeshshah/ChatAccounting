/* js/print/modes.js — print sizes: 3 Inch / A4 / A5 */
/* ================= PRINT / SHARE SYSTEM =================
   Bills and statements are built as a "document" { mode, html, title, filename } laid out for the paper size
   chosen in Settings (3 Inch thermal, A4 or A5). The same document can be printed or turned into a PDF to share. */

const PRINT_MODES = {
  thermal: { label: "3 Inch", pageW: 76,  pageH: 0,   padX: 0,  padY: 2 },
  a4:      { label: "A4",     pageW: 210, pageH: 297, padX: 12, padY: 12 },
  a5:      { label: "A5",     pageW: 148, pageH: 210, padX: 9,  padY: 9 }
};

function getPrintMode(){ return PRINT_MODES[data.printMode] ? data.printMode : "thermal"; }

// Paper size for the browser's print dialog. The document designs themselves are static CSS in css/documents.css.
function pageRule(mode){
  return mode === "a4" ? "@page{size:A4;margin:12mm;}" : mode === "a5" ? "@page{size:A5;margin:9mm;}" : "@page{margin:3mm;}";
}
