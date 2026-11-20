/* js/print/whatsapp.js — send a bill to the customer on WhatsApp, as the very same PDF that was generated.
   How it works: the bill is rendered to PDF at the chosen paper size, uploaded to private storage, and WhatsApp is
   opened on the customer's chat with a ready-to-send message containing a link to that PDF (valid for 30 days).
   WhatsApp itself can't be handed a file by a web page, and its "Send" button is always tapped by the user. */

function whatsappUrl(phone, text){
  const digits = String(phone || "").replace(/\D/g, "");             // wa.me wants the number without + or spaces
  return "https://wa.me/" + digits + "?text=" + encodeURIComponent(text);
}

function whatsappMessage(doc, link, days){
  const m = doc.meta;
  return ["Hello " + m.customer + ",", "",
    "Here is your " + (m.gst ? "tax invoice " : "invoice ") + m.billNo + " from " + m.business + ".",
    "Amount: " + m.amount + " · Date: " + m.date, "",
    link || "The PDF is attached below.", "",
    days ? "(This link stays valid for " + days + " days.)" : "",
    "Thank you!"].filter(function(line, i, all){ return !(line === "" && all[i - 1] === ""); }).join("\n");
}

async function whatsappFlow(doc){
  const m = doc.meta;
  // 1. whose WhatsApp? A saved customer number is used as is; otherwise ask (skip = pick the contact inside WhatsApp)
  let phone = m.partyRef && m.partyRef.phone ? m.partyRef.phone : "";
  if(!phone){
    await botSay(m.customer + "'s WhatsApp number? Skip to pick the contact inside WhatsApp.", { icon: "ph-whatsapp-logo" });
    while(true){
      const v = (await askText("e.g. 98765 43210", { allowSkip: true, inputMode: "tel" })).trim();
      if(!v) break;
      if(isPhone(v)){
        phone = normalizePhone(v);
        if(m.partyRef){ m.partyRef.phone = phone; saveData(); }      // remembered for next time
        break;
      }
      await botSay("That doesn't look like a mobile number — try again, or skip.", { icon: "ph-warning" });
    }
  }

  // 2. the bill, exactly as it was generated (same layout, same paper size)
  await botSay("Preparing the bill…", { icon: "ph-file-pdf" });
  let blob;
  try{ blob = await getDocPdf(doc); }
  catch(e){ await botSay("Couldn't prepare the PDF — " + (e && e.message ? e.message : "unknown error") + ".", { icon: "ph-warning" }); return; }

  // 3. host it, so the WhatsApp message can carry a link to it
  if(!Panel.supportsFiles){
    if(isMobileDevice()){
      await botSay("This setup can't host files (demo mode), so I'm opening the share sheet instead — choose WhatsApp there.", { icon: "ph-info" });
      await shareFlow(doc);
    } else {
      // on a computer: save the PDF, then open the customer's chat so it can be attached there
      downloadBlob(blob, doc.filename);
      await botSay("This setup can't host files (demo mode). The PDF was saved to your Downloads folder — attach it in the WhatsApp chat that opens next.", { icon: "ph-info" });
      await openWhatsApp(whatsappUrl(phone, whatsappMessage(doc, null)), "WhatsApp is open on the customer's chat — attach the saved PDF and send.");
    }
    return;
  }
  let up;
  try{ up = await Panel.files.uploadBill(blob, doc.filename); }
  catch(e){
    await botSay("Couldn't upload the bill (" + (e && e.message ? e.message : "unknown error") + "). Opening the share sheet instead.", { icon: "ph-warning" });
    await shareFlow(doc);
    return;
  }

  // 4. open WhatsApp on that customer's chat with the message ready
  await openWhatsApp(whatsappUrl(phone, whatsappMessage(doc, up.url, up.days)), "WhatsApp is open with the bill ready — tap Send there.");
}

// Opens WhatsApp; if the browser blocks the pop-up (too long after the tap), one more tap does it
async function openWhatsApp(url, doneText){
  if(window.open(url, "_blank")){ await botSay(doneText, { icon: "ph-whatsapp-logo" }); return; }
  await botSay("Ready. Tap below to open WhatsApp.", { icon: "ph-whatsapp-logo" });
  const go = await askQuickReply([{ label: "Open WhatsApp", value: "go", icon: "ph-whatsapp-logo" }, { label: "Skip", value: "skip", icon: "ph-x" }]);
  if(go === "go" && !window.open(url, "_blank")) window.location.href = url;
}
