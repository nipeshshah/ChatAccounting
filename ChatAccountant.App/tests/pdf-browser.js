/* tests/pdf-browser.js — generates the real bill and statement PDFs in a real (headless) Chromium and checks them.
   Run:  npm run test:pdf     (needs `npm install`; uses a Chromium binary that ships inside an npm package)
   The jsdom smoke test can't draw a canvas, so this is the test that proves the PDFs are not empty. */
const chromium = require("@sparticuz/chromium").default || require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");
const { createServer } = require("../scripts/serve.js");

const MM = 25.4 / 72;
const results = [];
const check = (name, ok, extra) => { results.push(ok); console.log((ok ? "  ok   " : "  FAIL ") + name + (extra ? "  → " + extra : "")); };

(async () => {
  const server = createServer(); await new Promise((r) => server.listen(0, r));
  const browser = await puppeteer.launch({ args: [...chromium.args, "--no-sandbox"], executablePath: await chromium.executablePath(), headless: "shell" });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 800, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto("http://localhost:" + server.address().port + "/index.html", { waitUntil: "load" });
  await page.waitForFunction(() => typeof startApp === "function");

  const expected = { thermal: [76, null], a4: [210, 297], a5: [148, 210] };
  for (const mode of ["thermal", "a4", "a5"]) {
    for (const kind of ["bill", "statement", "long statement", "transactions"]) {
      const r = await page.evaluate(async (mode, kind) => {
        data.printMode = mode;
        data.shop = { name: "Test Shop", address: "12 MG Road, Mumbai", state: "Maharashtra", gstNumber: "27ABCDE1234F1Z5" };
        const party = { name: kind === "long statement" ? "શૈલેશ જાધવ" : "Acme Traders", address: "Pune", phone: "+919876543210", balance: 0 };
        let doc;
        if (kind === "bill") {
          doc = buildBillDoc({ date: "2026-11-10", type: "income", category: "Sale", account: "Acme", party: party.name, description: "Consulting", amount: 1180, taxableAmount: 1000, gstPercent: 18, gstAmount: 180, taxSplit: { type: "CGST_SGST", cgstPercent: 9, sgstPercent: 9, cgstAmount: 90, sgstAmount: 90 }, invoiceNo: "AMB/2025-26/001" }, "sale", data.shop, party);
        } else if (kind === "transactions") {
          ledger.length = 0;
          for (let i = 0; i < 12; i++) ledger.push({ date: "2026-11-" + String(1 + i % 5).padStart(2, "0"), type: i % 2 ? "expense" : "income", category: i % 2 ? "Rent" : "Consulting", account: "Cash", description: i % 4 ? "Entry " + i : "", amount: 250 + i * 10 });
          doc = buildTransactionsDoc(buildTransactionsStatement(statementPeriod("all")));
        } else {
          ledger.length = 0;
          const n = kind === "long statement" ? 90 : 3;
          for (let i = 0; i < n; i++) ledger.push({ date: "2026-10-" + String(1 + i % 28).padStart(2, "0"), type: "income", category: i % 3 ? "Sale" : "Debtor Receipt", account: "x", party: party.name, amount: 100 + i, invoiceNo: i % 3 ? "INV-" + i : undefined });
          doc = buildStatementDoc(buildStatement(party, "debtor", statementPeriod("all")));
        }
        const blob = await getDocPdf(doc);
        const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.readAsDataURL(blob); });
        return { filename: doc.filename, type: blob.type, b64 };
      }, mode, kind);
      const buf = Buffer.from(r.b64, "base64"), txt = buf.toString("latin1");
      const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(txt) || [];
      const w = Math.round(box[1] * MM), h = Math.round(box[2] * MM), pages = (txt.match(/\/Type\s*\/Page[^s]/g) || []).length;
      const label = mode + " " + kind;
      check(label + ": a real PDF with content", buf.slice(0, 5).toString() === "%PDF-" && txt.includes("%%EOF") && buf.length > 20000 && /\/Subtype\s*\/Image/.test(txt), buf.length + " bytes");
      check(label + ": paper size " + expected[mode][0] + " mm wide", w === expected[mode][0] && (expected[mode][1] === null || h === expected[mode][1]), w + "x" + h);
      check(label + ": file name is plain and not empty", /^(Invoice|Statement|Transactions)-[A-Za-z0-9\-_]+\.pdf$/.test(r.filename) && r.type === "application/pdf", r.filename);
      if (kind === "long statement" && mode !== "thermal") check(label + ": spreads over several pages", pages > 1, pages + " pages");
    }
  }
  check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
  await browser.close(); server.close();
  const bad = results.filter((x) => !x).length;
  console.log(bad ? `\n${bad} check(s) failed` : `\nAll ${results.length} checks passed`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log("FAIL", e.message); process.exit(1); });
