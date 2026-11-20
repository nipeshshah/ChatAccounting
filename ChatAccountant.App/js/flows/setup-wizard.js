/* js/flows/setup-wizard.js — first-launch setup wizard (GST yes/no, business, GST rates, accounts) */
/* ================= FIRST-LAUNCH SETUP WIZARD ================= */

// Asked once, right after the first sign-in, so the first sale isn't interrupted by setup questions.
function needsSetup(){
  return !data.setupDone && (!(data.shop && data.shop.name) || (data.gstEnabled !== false && !(data.gstRates && data.gstRates.length)));
}

async function setupAccounts(){
  await botSay("Which payment accounts do you use? They appear as options whenever you record a cash or bank payment.", { icon: "ph-bank" });
  const pick = await askQuickReply([
    { label: "Keep " + data.accounts.join(", "), value: "keep", icon: "ph-check" },
    { label: "Add my own", value: "own", icon: "ph-plus" }
  ]);
  if(pick !== "own") return;
  await botSay("Type them separated by commas, e.g. Cash, UPI, HDFC Bank", { icon: "ph-pencil-simple-line" });
  const raw = await askText("Cash, UPI, HDFC Bank", { required: true });
  const list = [];
  raw.split(",").forEach(function(s){
    const n = cleanText(s, 30);
    if(n && !list.some(function(x){ return x.toLowerCase() === n.toLowerCase(); })) list.push(n);
  });
  if(list.length){ data.accounts = list; saveData(); }
}

async function setupWizard(){
  try{
    await botSay("Let's get you set up — a few quick steps: GST, your business, GST rates and payment accounts. It takes about a minute, and it means your first sale won't be interrupted by questions.", { icon: "ph-rocket-launch" });
    const go = await askQuickReply([
      { label: "Start setup", value: "go", icon: "ph-play" },
      { label: "Skip for now", value: "skip", icon: "ph-arrow-right" }
    ]);
    if(go === "skip"){
      data.setupDone = true; saveData();
      await botSay("No problem — I'll ask for anything I need when you first use it. You can change everything later in Settings.", { icon: "ph-info" });
      return;
    }
    await botSay("Do you charge GST on your sales? If not, sales won't ask any GST questions (purchases can still carry GST).", { icon: "ph-percent" });
    const gst = await askQuickReply([
      { label: "Yes, I charge GST", value: "yes", icon: "ph-check" },
      { label: "No GST on sales", value: "no", icon: "ph-x" }
    ]);
    data.gstEnabled = gst === "yes"; saveData();
    const total = data.gstEnabled ? 3 : 2;     // business, (GST rates), accounts
    let n = 1;
    if(!(data.shop && data.shop.name)) await getShopDetails(`Step ${n} of ${total} · Your business. These details appear on every printed bill.`);
    n++;
    if(data.gstEnabled && !(data.gstRates && data.gstRates.length)) await getGstRates(`Step ${n++} of ${total} · Which GST rates do you use?`);
    await botSay(`Step ${n} of ${total} · Payment accounts`, { icon: "ph-bank" });
    await setupAccounts();
    data.setupDone = true; saveData();
    await botSay("All set! Your details are saved to your account and you can edit them any time in Settings.", { icon: "ph-check-circle" });
  }catch(err){
    if(!(err instanceof CancelFlow)) throw err;
    data.setupDone = true; saveData();
    await botSay("Setup skipped — I'll ask for anything I need when you first use it, and you can fill it in from Settings.", { icon: "ph-info" });
  }
}

async function startChat(){
  try{ if(needsSetup()) await setupWizard(); }catch(e){ console.error(e); }
  mainMenu();
}
