/* tests/smoke.js — end-to-end smoke test in a simulated browser (jsdom).  Run:  npm test
   Serves the project, boots it exactly like a browser would (partials → scripts → app), then drives the chat:
   setup wizard, review/edit/save, undo, credit sale + request withdrawal, received-with-discount, statement, print. */
const { JSDOM, ResourceLoader } = require("jsdom");
const path = require("path");
const { createServer } = require("../scripts/serve.js");

const results = [];
const check = (name, ok, extra) => { results.push(ok); console.log((ok ? "  ok   " : "  FAIL ") + name + (extra ? "  → " + extra : "")); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = createServer();
  await new Promise((r) => server.listen(0, r));
  const origin = "http://localhost:" + server.address().port;
  const failedResources = [];

  class Loader extends ResourceLoader {
    fetch(url, options) {
      if (!url.startsWith(origin) || /\.(css|png|woff2?)(\?|$)/.test(url)) return null;   // only scripts matter here
      const p = super.fetch(url, options);
      p.catch(() => failedResources.push(url));          // observe failures without replacing jsdom's promise
      return p;
    }
  }
  const errors = [];
  const dom = await JSDOM.fromURL(origin + "/index.html", {
    runScripts: "dangerously", resources: new Loader(), pretendToBeVisual: true,
    beforeParse(w) {
      w.fetch = (u, o) => fetch(new URL(u, w.location.href), o);
      w.print = () => { w.__printed = (w.__printed || 0) + 1; };
      w.addEventListener("error", (e) => errors.push("window error: " + e.message));
    }
  });
  const w = dom.window, doc = w.document;
  const g = (code) => w.eval(code);                       // read app globals (data, ledger …)
  const chatText = () => doc.getElementById("chatLog").textContent.replace(/\s+/g, " ");
  const btn = (t) => [...doc.querySelectorAll("#chatLog button")].filter((b) => !b.disabled && b.textContent.replace(/\s+/g, " ").includes(t)).pop();
  async function waitFor(fn, label, t = 6000) { const s = Date.now(); while (Date.now() - s < t) { try { const v = fn(); if (v) return v; } catch (e) {} await sleep(40); } throw new Error("timeout: " + label + "\n…" + chatText().slice(-400)); }
  const tap = async (t) => { (await waitFor(() => btn(t), "button " + t)).click(); await sleep(60); };
  const say = async (v) => { const i = doc.getElementById("composerInput"); await waitFor(() => !i.disabled, "composer"); i.value = v; doc.getElementById("composerSend").click(); await sleep(60); };
  const skip = async () => { const b = doc.getElementById("composerSkip"); await waitFor(() => b.style.display !== "none" && !doc.getElementById("composerInput").disabled, "skip"); b.click(); await sleep(60); };

  try {
    // ---- boot: partials + scripts ----
    await waitFor(() => doc.getElementById("loginScreen") && g("typeof Panel") === "object" && g("typeof startApp") === "function", "boot", 10000);
    const ids = ["appHeader", "chatPage", "managePage", "requestsPage", "profilePage", "settingsPage", "bottomNav", "undoToast", "splashScreen", "lockScreen", "loginScreen", "printArea"];
    check("all partials and screens loaded", ids.every((i) => doc.getElementById(i)), ids.filter((i) => !doc.getElementById(i)).join(","));
    check("no inline <svg> left in the markup", doc.querySelectorAll("svg").length === 0);
    check("images are PNG files", [...doc.querySelectorAll("img")].every((i) => /\.png$/.test(i.getAttribute("src"))));
    await waitFor(() => doc.getElementById("loginScreen").style.display === "flex", "login screen", 6000);
    doc.getElementById("btnGoogleLogin").click();

    // ---- setup wizard ----
    await waitFor(() => chatText().includes("quick steps"), "wizard", 6000);
    await tap("Start setup");
    await waitFor(() => chatText().includes("Do you charge GST"), "GST question");
    await tap("Yes, I charge GST");
    await waitFor(() => chatText().includes("Step 1 of 3"), "step 1");
    await say("Test Shop"); await skip(); await say("Maharashtra"); await say("27ABCDE1234F1Z5");
    await waitFor(() => chatText().includes("Step 2 of 3"), "step 2"); await tap("0, 5, 18, 40");
    await waitFor(() => chatText().includes("Step 3 of 3"), "step 3"); await tap("Keep Cash");
    await waitFor(() => chatText().includes("All set"), "wizard done");
    check("wizard saved business, GST rates, setupDone", g("data.shop.name") === "Test Shop" && g("data.gstRates.join()") === "0,5,18,40" && g("data.setupDone") === true);

    // ---- expense: full screen on start, review, edit, save, undo ----
    await tap("Log Expense");
    check("full screen switches on when a transaction begins", doc.querySelector(".app-frame").classList.contains("chat-full"));
    await tap("Cash"); await tap("Cash"); await tap("Rent"); await say("1180"); await skip();
    await waitFor(() => /Review\s*₹1,180\.00 · Rent · Cash/.test(chatText()), "review");
    check("review shows Indian-formatted summary", true);
    await tap("Edit"); await tap("Amount"); await say("1000");
    await waitFor(() => /₹1,000\.00 · Rent · Cash/.test(chatText()), "review after edit");
    await tap("Save");
    await waitFor(() => doc.getElementById("undoToast").style.display === "block", "undo toast");
    check("saved, toast shown", g("ledger.length") === 1 && /₹1,000\.00/.test(doc.getElementById("sumExpense").textContent));
    await sleep(300); doc.getElementById("undoBtn").click();
    await waitFor(() => chatText().includes("Undone"), "undone"); await sleep(400);
    check("undo removes the entry on screen and in storage", g("ledger.length") === 0 && /^\[\]$/.test(w.localStorage.getItem("dummyDB.ledger.google|108234567890123456789")));

    // ---- credit sale with a request to a verified number; undo withdraws it ----
    await w.Panel.auth.sendPhoneOtp("+919876543210"); await w.Panel.auth.verifyPhoneOtp("+919876543210", "123456"); await sleep(400);
    await tap("Sale"); await tap("Credit"); await say("Acme"); await say("Maharashtra"); await say("9876543210"); await say("1000");
    await tap("18%"); await skip();
    await waitFor(() => /Review\s*₹1,180\.00 · Sale · Acme \(credit\)/.test(chatText()), "sale review");
    check("sale review shows the invoice number it will get", chatText().includes("Invoice no: INV-001"));
    await tap("Save");
    await waitFor(() => chatText().includes("Print bill"), "bill offer", 6000);
    check("sale entry carries its invoice number", g("ledger[0].invoiceNo") === "INV-001" && g("data.billCounter") === 2);
    const shares = () => JSON.parse(w.localStorage.getItem("dummyDB.shares") || "[]").length;
    check("credit sale: balance 1180, request stored", g("data.debtors[0].balance") === 1180 && shares() === 1);
    doc.getElementById("undoBtn").click();
    await waitFor(() => chatText().includes("Undone"), "undone 2"); await sleep(500);
    check("undo restores balance, removes entry, withdraws request", g("data.debtors[0].balance") === 0 && g("ledger.length") === 0 && shares() === 0);
    check("undo gives the invoice number back", g("data.billCounter") === 1);

    // ---- received with a 5% shortfall → discount ----
    g("data.debtors[0].balance = 123456");
    await tap("Received"); await tap("From a Debtor"); await tap("Acme"); await tap("Cash");
    const inp = doc.getElementById("composerInput");
    await waitFor(() => !inp.disabled, "amount prompt");
    check("amount pre-filled with due, decimal keypad", inp.value === "123456.00" && inp.inputMode === "decimal");
    await say("123000"); await waitFor(() => chatText().includes("short of"), "discount question"); await tap("Yes, discount");
    await waitFor(() => /Review\s*₹1,23,000\.00 · Received · Cash/.test(chatText()), "received review");
    await tap("Save"); await waitFor(() => doc.getElementById("undoToast").style.display === "block", "toast 3");
    check("discount entry + payment saved, debt cleared", g("ledger.length") === 2 && g("data.debtors[0].balance") === 0);

    // ---- purchase: supplier invoice number + date are required; date starts as today and can be changed ----
    await tap("Purchase"); await tap("Credit"); await say("Supply Co"); await skip(); await skip();
    const pin = doc.getElementById("composerInput");
    await waitFor(() => !pin.disabled && /invoice no/i.test(pin.placeholder), "invoice number prompt");
    pin.value = ""; doc.getElementById("composerSend").click(); await sleep(200);
    check("empty invoice number is refused", /invoice no/i.test(pin.placeholder) && !chatText().includes("Invoice date?"));
    await say("SUP/77");
    await waitFor(() => pin.type === "date" && !pin.disabled, "invoice date prompt");
    check("invoice date is pre-filled with the current date", pin.value === g("currentDate()"), pin.value);
    pin.value = ""; doc.getElementById("composerSend").click(); await sleep(200);
    check("empty invoice date is refused", pin.type === "date");
    pin.value = "2026-10-15"; doc.getElementById("composerSend").click(); await sleep(60);
    await say("5000"); await tap("18%"); await say("Custom stuff");
    await waitFor(() => /Invoice SUP\/77 · dated/.test(chatText()), "purchase review");
    await tap("Save"); await waitFor(() => g("ledger.length") === 3, "purchase saved");
    const pe = g("ledger[2]");
    check("purchase stored with invoice number, booked on the invoice date", pe.invoiceNo === "SUP/77" && pe.date === "2026-10-15" && pe.description === "Custom stuff", JSON.stringify([pe.invoiceNo, pe.date]));

    // ---- statements show the invoice number, never the custom description ----
    check("creditor statement shows the invoice number only", g("(()=>{const st=buildStatement(data.creditors[0],'creditor',statementPeriod('all'));const h=statementHtml(st);return statementDescription(st.rows[0].e)==='Invoice SUP/77'&&h.includes('Invoice SUP/77')&&!h.includes('Custom stuff');})()"));
    check("statement labels for entries without an invoice", g("[statementDescription({category:'Debtor Receipt',description:'secret'}),statementDescription({category:'Discount Allowed'}),statementDescription({invoiceNo:'INV-009',description:'secret'})].join('|')") === "Payment received|Discount allowed|Invoice INV-009");

    // ---- statement + documents in every print size ----
    const rows = g("buildStatement(data.debtors[0], 'debtor', statementPeriod('all')).rows.length");
    check("statement lists the two entries", rows === 2, "rows=" + rows);
    for (const mode of ["thermal", "a4", "a5"]) {
      g(`data.printMode = "${mode}"`);
      w.eval("printDocument(buildStatementDoc(buildStatement(data.debtors[0], 'debtor', statementPeriod('all'))))");
      const html = doc.getElementById("printArea").innerHTML;
      check("print " + mode + " statement renders without custom descriptions", /doc-(thermal|page)/.test(html) && /@page/.test(html) && /CLOSING|Closing/i.test(html) && !/Custom stuff|Received from Acme/.test(html));
    }
    await sleep(500);
    check("window.print was called for each size", (w.__printed || 0) >= 3, "calls=" + (w.__printed || 0));
    check("PDF libraries load from assets/vendor (no CDN)", /assets\/vendor\/html2canvas/.test(g("ensurePdfLibs.toString()")) && /assets\/vendor\/jspdf/.test(g("ensurePdfLibs.toString()")));

    // ---- compact view hides the Statement shortcut ----
    g('data.viewMode = "compact"');
    check("compact view keeps Statement in the quick menu, without descriptions", g('menuFor([{label:"Statement",value:"statement",hint:"x"},{label:"View",value:"view",hint:"y"}]).map(o=>o.value+":"+o.hint).join()') === "statement:undefined,view:undefined");

    // ---- chat totals are for one day; Reporting covers longer periods ----
    g("ledger.length = 0; data.debtors.length = 0; data.creditors.length = 0");
    const T = g("todayISO()"), FY0 = g("reportPeriod('fy').from");
    const mk = (o) => Object.assign({ account: "Cash", description: "x" }, o);
    const seed = [
      mk({ date: T, type: "income", category: "Sale", account: "Acme", party: "Acme", amount: 1180, taxableAmount: 1000, gstAmount: 180, invoiceNo: "INV-001" }),
      mk({ date: T, type: "income", category: "Sale", amount: 590, taxableAmount: 500, gstAmount: 90 }),
      mk({ date: FY0, type: "expense", category: "Purchase", account: "Supply Co", party: "Supply Co", amount: 2360, taxableAmount: 2000, gstAmount: 360, invoiceNo: "S1" }),
      mk({ date: T, type: "income", category: "Consulting", amount: 3000 }),
      mk({ date: T, type: "expense", category: "Rent", amount: 500 }),
      mk({ date: T, type: "income", category: "Debtor Receipt", party: "Acme", amount: 1000 }),
      mk({ date: T, type: "expense", category: "Discount Allowed", account: "Acme", party: "Acme", amount: 20 }),
      mk({ date: T, type: "expense", category: "Creditor Payment", party: "Supply Co", amount: 360 })
    ];
    w.eval("window.__seed = " + JSON.stringify(seed) + "; ledger.push(...window.__seed); data.debtors.push({name:'Acme',balance:160}); data.creditors.push({name:'Supply Co',balance:2000}); updateSummary();");
    const strip = () => [doc.getElementById("sumLabelA").textContent, doc.getElementById("sumIncome").textContent, doc.getElementById("sumLabelB").textContent, doc.getElementById("sumExpense").textContent, doc.getElementById("sumNet").textContent].join(" | ");
    check("a fresh config defaults the strip to Cash", g("normalizeConfig({}).summaryMode") === "cash");
    check("chat strip defaults to Cash for today: received 4,590 / spent 860 (older purchase left out)", /Received \| ₹4,590\.00 \| Spent \| ₹860\.00 \| ₹3,730\.00/.test(strip()) && /^Today/.test(doc.getElementById("summaryCaption").textContent) && /Cash$/.test(doc.getElementById("summaryCaption").textContent), strip());
    g('data.summaryMode = "sales"; updateSummary()');
    check("strip: Sale / Purchase", /Sale \| ₹1,770\.00 \| Purchase \| ₹0\.00 \| ₹1,770\.00/.test(strip()), strip());
    g('data.summaryMode = "income"; updateSummary()');
    check("strip: Income / Expense (same definitions as Reporting)", /Income \| ₹3,000\.00 \| Expense \| ₹520\.00 \| ₹2,480\.00/.test(strip()), strip());
    g('data.summaryMode = "debt"; updateSummary()');
    check("strip: Debt / Credit as balances, net is negative when you owe more", /Debt \| ₹160\.00 \| Credit \| ₹2,000\.00 \| -₹1,840\.00/.test(strip()) && /^As of today/.test(doc.getElementById("summaryCaption").textContent), strip());
    doc.querySelector('.nav-tab[data-page="settings"]').click(); await sleep(100);
    doc.querySelector('[data-sm="sales"]').click(); await sleep(50);
    check("Settings > Chat totals changes the strip and is remembered in the config", g("data.summaryMode") === "sales" && /^Sale \|/.test(strip()));
    doc.querySelector('[data-sm="cash"]').click(); await sleep(50);
    check("…and switches back to Cash", g("data.summaryMode") === "cash" && /^Received \|/.test(strip()));
    doc.querySelector('.nav-tab[data-page="chat"]').click(); await sleep(50);
    const rt = JSON.parse(g("JSON.stringify(buildReport(reportPeriod('today')))"));
    check("today: sale 1770 (taxable 1500 + GST 270), no purchases", rt.sale.total === 1770 && rt.sale.taxable === 1500 && rt.sale.gst === 270 && rt.purchase.total === 0, JSON.stringify(rt.sale));
    check("today: income 3000, expense 520 (settlements excluded)", rt.income === 3000 && rt.expense === 520, rt.income + "/" + rt.expense);
    check("today: money received 4590, spent 860 (credit entries and discounts moved no money)", rt.received === 4590 && rt.spent === 860, rt.received + "/" + rt.spent);
    check("today: received by category", rt.receivedByCat.Sale === 590 && rt.receivedByCat.Consulting === 3000 && rt.receivedByCat["Debtor Receipt"] === 1000 && rt.spentByCat.Rent === 500 && rt.spentByCat["Creditor Payment"] === 360);
    check("creditors and debtors: totals as of today", rt.debtTotal === 160 && rt.creditTotal === 2000 && rt.debtors.length === 1 && rt.creditors.length === 1, rt.debtTotal + "/" + rt.creditTotal);
    check("debtor sale in the period, creditor purchase outside it", rt.debtors[0].amount === 1180 && rt.debtors[0].count === 1 && rt.creditors[0].amount === 0);
    const rf = JSON.parse(g("JSON.stringify(buildReport(reportPeriod('fy')))"));
    check("current FY: purchase 2360 and the creditor's purchase total", rf.purchase.total === 2360 && rf.purchase.gst === 360 && rf.creditors[0].amount === 2360 && rf.creditors[0].count === 1);
    const lf = g("(()=>{const p=reportPeriod('lastfy'),c=reportPeriod('fy');return p.to<c.from && p.from.slice(5)==='04-01' && p.to.slice(5)==='03-31' && c.to.slice(5)==='03-31';})()");
    check("financial years run 1 April – 31 March", lf === true);
    check("week is Monday–Sunday", g("(()=>{const p=reportPeriod('week');return new Date(p.from+'T00:00:00').getDay()===1 && new Date(p.to+'T00:00:00').getDay()===0;})()"));

    check("six tabs in the bottom bar", doc.querySelectorAll(".nav-tab").length === 6);
    doc.querySelector('.nav-tab[data-page="reporting"]').click(); await sleep(100);
    const rc = () => doc.getElementById("reportContent").textContent.replace(/\s+/g, " ");
    check("Reporting tab shows the overview for Today", !doc.getElementById("reportingPage").classList.contains("hidden") && /Total sale\s*₹1,770\.00/.test(rc()) && /Money received\s*₹4,590\.00/.test(rc()) && /Total purchase\s*₹0\.00/.test(rc()), rc().slice(0, 160));
    doc.querySelector('[data-rp="fy"]').click(); await sleep(100);
    check("changing the period changes the figures", /Total purchase\s*₹2,360\.00/.test(rc()) && /Current financial year/.test(rc()) && doc.querySelector('[data-rp="fy"]').classList.contains("active"));
    check("per-party lists and creditor/debtor totals are shown", /Acme/.test(rc()) && /Supply Co/.test(rc()) && /Total creditors\s*1/.test(rc()) && /Credit \(you owe\)\s*₹2,000\.00/.test(rc()) && /Total debtors\s*1/.test(rc()) && /Total debt \(owed to you\)\s*₹160\.00/.test(rc()));

    // ---- Statement: Today by default, switchable periods, Income & Expense with print/share, View = balances ----
    check("statement periods include Today (same day) and week", g("(()=>{const p=statementPeriod('today');return p.from===p.to&&p.from===todayISO()&&p.label==='Today'&&statementPeriod('week').key==='week';})()"));
    doc.querySelector('.nav-tab[data-page="chat"]').click(); await sleep(100);
    const printsBefore = w.__printed || 0;
    await tap("Statement");
    await waitFor(() => btn("Income & Expense"), "statement types");
    check("Statement asks Debtor / Creditor / Income & Expense", !!btn("Debtor") && !!btn("Creditor") && !!btn("Income & Expense"));
    await tap("Debtor"); await tap("Acme");
    await waitFor(() => /Statement · Acme/.test(chatText()), "today's debtor statement");
    check("Today's statement is shown straight away (period not asked), with invoice number", !/Which period/.test(chatText()) && /Today · /.test(chatText()) && /Invoice INV-001/.test(chatText()));
    check("buttons: Print, Share, other periods, Custom range, Done (no Today button while on Today)", !!btn("Print") && !!btn("Share") && !!btn("This month") && !!btn("All time") && !!btn("Custom range") && !!btn("Done") && !btn("Today"));
    await tap("This month");
    await waitFor(() => /This month · /.test(chatText()), "month statement");
    check("choosing another period draws that statement and offers Today again", !!btn("Today") && !btn("This month"));
    await tap("Print"); await sleep(500);
    check("Print from the statement view prints it", (w.__printed || 0) === printsBefore + 1);
    await tap("Done");

    await tap("Statement"); await tap("Income & Expense");
    await waitFor(() => /Income & Expense statement/.test(chatText()), "I&E statement");
    const txt = chatText().slice(chatText().lastIndexOf("Income & Expense statement"));
    check("Income & Expense: today's entries with totals in / out / net", /Consulting/.test(txt) && /Rent/.test(txt) && /Total in\s*₹5,770\.00/.test(txt) && /Total out\s*₹880\.00/.test(txt) && /Net\s*₹4,890\.00/.test(txt), txt.slice(0, 160));
    check("…and the older purchase is not in Today", !/Purchase/.test(txt.replace(/Purchases/g, "")));
    await tap("All time");
    await waitFor(() => /All time/.test(chatText().slice(chatText().lastIndexOf("Income & Expense statement"))), "all time");
    check("All time adds the older entries", /Total out\s*₹3,240\.00/.test(chatText().slice(chatText().lastIndexOf("Income & Expense statement"))));
    for (const mode of ["thermal", "a4", "a5"]) {
      g(`data.printMode = "${mode}"`);
      w.eval("printDocument(buildTransactionsDoc(buildTransactionsStatement(statementPeriod('all'))))");
      const h = doc.getElementById("printArea").innerHTML;
      check("print " + mode + " Income & Expense statement renders with totals", /INCOME &amp; EXPENSE STATEMENT/.test(h) && /@page/.test(h) && /Total in|Total out|>Total</.test(h) && (mode === "thermal" ? /<b>(IN|OUT)<\/b>/.test(h) : /Consulting|Rent/.test(h)));
    }
    check("Income & Expense file name is plain", g("buildTransactionsDoc(buildTransactionsStatement(statementPeriod('today'))).filename") === "Transactions-Today-" + g("todayISO()") + ".pdf");
    await tap("Done");
    await tap("View");
    await waitFor(() => /Debtors \(owe you\)/.test(chatText()), "balances");
    check("View now goes straight to balances (no Transactions choice)", !/View what\?/.test(chatText().slice(chatText().lastIndexOf("Debtors (owe you)") - 400)));
    await tap("Back to menu");
    doc.querySelector('.nav-tab[data-page="manage"]').click(); await sleep(100);
    doc.querySelector(".stmt-btn").click(); await sleep(100);
    check("Manage statement view starts on Today", doc.querySelector('[data-period="today"]').className.includes("bg-corporate-navy") && /Today · /.test(doc.getElementById("manageContent").textContent));
    doc.querySelector('.nav-tab[data-page="chat"]').click(); await sleep(100);

    // ---- GST as a feature ----
    check("GST feature defaults to on for existing accounts", g("normalizeConfig({}).gstEnabled") === true);
    doc.querySelector('.nav-tab[data-page="chat"]').click(); await sleep(100);
    g("data.gstEnabled = true; data.gstRates = [18]");
    await tap("Sale"); await tap("Cash"); await tap("Cash"); await say("1000");
    const gin = doc.getElementById("composerInput");
    await waitFor(() => !gin.disabled && /GST %/.test(gin.placeholder), "single-rate prompt");
    check("only one GST rate: it is pre-filled (18), numeric keypad, no extra buttons", gin.value === "18" && gin.inputMode === "decimal" && !btn("Custom %") && /18% is filled in/.test(chatText()), gin.value);
    doc.getElementById("composerSend").click(); await sleep(60); await skip();
    await waitFor(() => /Review\s*₹1,180\.00 · Sale · Cash/.test(chatText()), "review with 18%");
    await tap("Save"); await tap("No thanks");
    check("GST on: the sale carries GST fields", g("ledger[ledger.length-1].gstPercent") === 18 && g("ledger[ledger.length-1].gstAmount") === 180);

    g("data.gstEnabled = false");
    await tap("Sale"); await tap("Cash"); await tap("Cash"); await say("500");
    const din = doc.getElementById("composerInput");
    await waitFor(() => !din.disabled && /Counter sale/.test(din.placeholder), "description prompt");
    check("GST off: a sale asks no GST question", !/GST/.test(chatText().slice(chatText().lastIndexOf("Sale amount?"))));
    await skip();
    await waitFor(() => /Review\s*₹500\.00 · Sale · Cash/.test(chatText()), "review without GST");
    check("GST off: review shows no tax lines", !/Taxable/.test(chatText().slice(chatText().lastIndexOf("Review"))));
    await tap("Save"); await tap("No thanks");
    const ls = g("JSON.stringify(ledger[ledger.length-1])"), lse = JSON.parse(ls);
    check("GST off: sale stored with the plain amount and no GST fields", lse.category === "Sale" && lse.amount === 500 && lse.taxableAmount === undefined && lse.gstAmount === undefined && lse.invoiceNo, ls);
    const planHtml = g("buildBillDoc(ledger[ledger.length-1], 'sale', data.shop, { name: 'Walk-in' }).html");
    check("GST off: the bill is a plain INVOICE, not a TAX INVOICE", /INVOICE/.test(planHtml) && !/TAX INVOICE/.test(planHtml) && !/CGST|SGST|IGST|Taxable/.test(planHtml));

    await tap("Purchase"); await tap("Cash"); await tap("Cash"); await say("PINV-1");
    await waitFor(() => din.type === "date" && !din.disabled, "invoice date");
    doc.getElementById("composerSend").click(); await sleep(60); await say("100");
    await waitFor(() => !din.disabled && /GST %/.test(din.placeholder), "purchase GST prompt");
    check("GST off: purchases still ask for GST (single rate pre-filled)", din.value === "18");
    doc.getElementById("composerSend").click(); await sleep(60); await skip();
    await waitFor(() => /Review\s*₹118\.00 · Purchase · Cash/.test(chatText()), "purchase review with GST");
    await tap("Save"); await sleep(200);
    check("…and the purchase is stored with its GST", g("ledger[ledger.length-1].gstAmount") === 18 && g("ledger[ledger.length-1].category") === "Purchase");

    doc.querySelector('.nav-tab[data-page="settings"]').click(); await sleep(100);
    check("Settings has a GST on sales switch", !!doc.querySelector('[data-gst="on"]') && /GST off/.test(doc.getElementById("settingsPage").textContent));
    doc.querySelector('[data-gst="on"]').click(); await sleep(50);
    check("…and it turns GST back on", g("data.gstEnabled") === true);

    // ---- WhatsApp: the generated bill goes to the customer's chat, no share sheet ----
    // (jsdom can't draw a canvas, and there is no real storage or WhatsApp here — those three are stubbed)
    w.eval("getDocPdf = async function(doc){ doc.blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' }); return doc.blob; }");
    const opened = []; w.open = (u) => { opened.push(u); return {}; };
    const uploads = []; w.Panel.supportsFiles = true;
    w.Panel.files = { uploadBill: async (blob, name) => { uploads.push({ name, size: blob.size }); return { url: "https://files.example/signed/" + name + "?token=abc", days: 30 }; } };
    doc.querySelector('.nav-tab[data-page="chat"]').click(); await sleep(100);
    g("data.gstEnabled = true; data.gstRates = [18]; data.debtors[0].phone = '+919876543210'; data.debtors[0].gstNumber = ''");
    const counterBefore = g("data.billCounter");
    await tap("Sale"); await tap("Credit"); await tap("Acme"); await say("2000");
    await waitFor(() => !doc.getElementById("composerInput").disabled && /GST %/.test(doc.getElementById("composerInput").placeholder), "gst prompt");
    doc.getElementById("composerSend").click(); await sleep(60); await skip();
    await waitFor(() => /Review\s*₹2,360\.00 · Sale · Acme/.test(chatText()), "wa sale review");
    await tap("Save");
    await waitFor(() => btn("WhatsApp"), "WhatsApp option on the bill offer");
    check("bill offer has Print / Share / WhatsApp", !!btn("Print bill") && !!btn("Share bill") && !!btn("WhatsApp"));
    await tap("WhatsApp");
    await waitFor(() => opened.length === 1, "WhatsApp opened");
    const inv = g("ledger[ledger.length-1].invoiceNo");
    const msg1 = decodeURIComponent(opened[0].split("?text=")[1]);
    check("opens the customer's WhatsApp chat directly", opened[0].startsWith("https://wa.me/919876543210?text="), opened[0].slice(0, 40));
    check("message names the customer, invoice, amount and carries the bill link", /Hello Acme/.test(msg1) && msg1.includes(inv) && /₹2,360\.00/.test(msg1) && msg1.includes("https://files.example/signed/Invoice-") && /valid for 30 days/.test(msg1), msg1.replace(/\n/g, " / ").slice(0, 120));
    check("the uploaded file is the generated bill PDF", uploads.length === 1 && uploads[0].name === "Invoice-" + inv.replace(/[^\w\-]+/g, "_") + ".pdf" && uploads[0].size > 0, JSON.stringify(uploads));
    await tap("Done");

    // pop-up blocked → one extra tap on "Open WhatsApp"; reprinting must not use up a new invoice number
    const counterMid = g("data.billCounter");
    w.open = () => { opened.push("blocked"); return null; };
    await tap("Print Bill"); await tap("₹2,360.00"); await tap("WhatsApp");
    await waitFor(() => btn("Open WhatsApp"), "Open WhatsApp button");
    w.open = (u) => { opened.push(u); return {}; };
    await tap("Open WhatsApp");
    await waitFor(() => opened[opened.length - 1].startsWith("https://wa.me/919876543210"), "reopened");
    check("blocked pop-up falls back to an Open WhatsApp button", opened.includes("blocked") && opened[opened.length - 1].startsWith("https://wa.me/919876543210"));
    check("reprinting reuses the same invoice number", g("data.billCounter") === counterMid && counterMid === counterBefore + 1);
    await tap("Done");

    // no file hosting (demo mode), on a phone → share sheet instead
    w.Panel.supportsFiles = false; w.eval("isMobileDevice = () => true; window.__shared = 0; window.__origShare = sharePdfBlob; sharePdfBlob = async function(){ window.__shared++; return 'shared'; }");
    await tap("Print Bill"); await tap("₹2,360.00"); await tap("WhatsApp");
    await waitFor(() => w.__shared === 1, "share sheet fallback");
    check("without file hosting it falls back to the share sheet", /can't host files/.test(chatText()) && w.__shared === 1);
    await tap("Done");

    // …and on a computer: no share sheet (Outlook gets an empty "no_name" file from it) — the PDF is saved and the WhatsApp chat opens
    w.eval("isMobileDevice = () => false; window.__saved = []; downloadBlob = function(b, n){ window.__saved.push([n, b.size]); }");
    const nOpen = opened.length;
    await tap("Print Bill"); await tap("₹2,360.00"); await tap("WhatsApp");
    await waitFor(() => opened.length === nOpen + 1, "desktop WhatsApp");
    check("computer: PDF saved to Downloads, share sheet not used", w.__saved.length === 1 && /^Invoice-/.test(w.__saved[0][0]) && w.__saved[0][1] > 0 && w.__shared === 1, JSON.stringify(w.__saved));
    check("computer: WhatsApp chat opens with a message that has no broken link", opened[nOpen].startsWith("https://wa.me/919876543210?text=") && /attached below/.test(decodeURIComponent(opened[nOpen])) && !/files\.example/.test(opened[nOpen]));
    await tap("Done");
    // the helper itself: navigator.share must not be called on a computer, and a phone still uses it
    w.eval("sharePdfBlob = window.__origShare; isMobileDevice = () => false; window.__shareCalls = 0; navigator.canShare = () => true; navigator.share = async () => { window.__shareCalls++; };");
    const rDesk = await w.eval("sharePdfBlob(new Blob(['%PDF-1.4 x'], {type:'application/pdf'}), 'a.pdf', 't')");
    w.eval("isMobileDevice = () => true");
    const rMob = await w.eval("sharePdfBlob(new Blob(['%PDF-1.4 x'], {type:'application/pdf'}), 'a.pdf', 't')");
    check("share sheet: skipped on a computer (saved instead), used on a phone", rDesk === "downloaded" && rMob === "shared" && w.__shareCalls === 1, rDesk + "/" + rMob + "/" + w.__shareCalls);
    w.eval("isMobileDevice = () => false");


    // walk-in customer: asks for the number; skipping opens WhatsApp's own contact picker
    w.Panel.supportsFiles = true; const n0 = opened.length;
    await tap("Print Bill"); await tap("₹500.00"); await tap("WhatsApp");
    const nin = doc.getElementById("composerInput");
    await waitFor(() => !nin.disabled && /98765/.test(nin.placeholder), "number prompt");
    await say("98765 43211");
    await waitFor(() => opened.length === n0 + 1, "walk-in opened");
    check("walk-in: number is asked and normalised", opened[n0].startsWith("https://wa.me/919876543211?text="), opened[n0].slice(0, 36));
    await tap("WhatsApp");
    await waitFor(() => !nin.disabled && /98765/.test(nin.placeholder), "number prompt 2"); await skip();
    await waitFor(() => opened.length === n0 + 2, "contact picker");
    check("skipping the number lets you pick the contact inside WhatsApp", opened[n0 + 1].startsWith("https://wa.me/?text="));
    await tap("Done");
    check("whatsapp message builder is tidy (no double blank lines)", !/\n\n\n/.test(g("whatsappMessage({meta:{customer:'A',billNo:'B',business:'C',gst:false,amount:'₹1',date:'d'}}, 'http://x', 0)")));

    check("no script errors, no failed resources", errors.length === 0 && failedResources.length === 0, errors.concat(failedResources).join(" | "));
  } catch (e) {
    check("scenario completed", false, e.message);
  }
  server.close();
  const bad = results.filter((r) => !r).length;
  console.log(bad ? `\n${bad} check(s) failed` : `\nAll ${results.length} checks passed`);
  process.exit(bad ? 1 : 0);
})();
