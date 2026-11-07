/* ============================================================================
   16-profile.js  -  Profile page and mobile verification
   Classic script: shares the global scope with the other js/*.js files.
   Load order is defined in index.html.
   ============================================================================ */
/* ================= PROFILE PAGE (details from the Google login) ================= */
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

function phoneCardHtml(u){
  if(!Panel.supportsPhone) return "";
  const verified = !!u.phone;
  return '<div class="bg-white border border-slate-200 rounded-xl p-3 shadow-fintech-sm" id="phoneCard">'
    + '<div class="flex items-center gap-2 mb-2">'
    +   '<div class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0"><i class="ph-bold ph-device-mobile text-slate-600"></i></div>'
    +   '<div class="min-w-0"><div class="text-sm font-semibold text-slate-800">Mobile number</div>'
    +   '<div class="text-[11px] ' + (verified ? "text-emerald-600 font-semibold" : "text-slate-500") + '">' + (verified ? "Verified: " + esc(u.phone) : "Needed to send and receive transaction requests") + '</div></div>'
    + '</div>'
    + '<div class="flex gap-1.5">'
    +   '<input id="phoneInput" type="tel" inputmode="tel" autocomplete="tel" class="flex-1 min-w-0 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-fintech-blue" placeholder="' + (verified ? "Change number" : "+91 98765 43210") + '">'
    +   '<button type="button" id="phoneSend" class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg px-3">Send code</button>'
    + '</div>'
    + '<div id="phoneStep2" class="flex gap-1.5 mt-2" style="display:none;">'
    +   '<input id="phoneCode" type="text" inputmode="numeric" maxlength="8" class="flex-1 min-w-0 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-fintech-blue" placeholder="6-digit code">'
    +   '<button type="button" id="phoneVerify" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg px-3">Verify</button>'
    + '</div>'
    + '<p id="phoneMsg" class="text-[11px] font-semibold mt-1.5 min-h-[14px]"></p>'
    + (Panel.isDemo ? '<p class="text-[10.5px] text-amber-700 mt-0.5">Demo mode: no SMS is sent — the code is 123456.</p>' : '')
    + '</div>';
}

function bindPhoneCard(){
  if(!Panel.supportsPhone) return;
  let pending = "";
  const $msg = $("#phoneMsg");
  function say(t, bad){ $msg.text(t || "").toggleClass("text-rose-600", !!bad).toggleClass("text-emerald-600", !bad); }
  $("#phoneSend").on("click", function(){
    const p = normalizePhone($("#phoneInput").val());
    if(!p){ say("Enter a valid mobile number, e.g. +91 98765 43210.", true); return; }
    $("#phoneSend").prop("disabled", true);
    say("Sending code…");
    Panel.auth.sendPhoneOtp(p)
      .done(function(){ pending = p; $("#phoneStep2").css("display", "flex"); $("#phoneCode").focus(); say("Code sent to " + p + "."); })
      .fail(function(err){ say((err && err.message) || "Couldn't send the code.", true); })
      .always(function(){ $("#phoneSend").prop("disabled", false); });
  });
  $("#phoneVerify").on("click", function(){
    const code = $("#phoneCode").val().trim();
    if(!pending || !code){ say("Enter the code you received.", true); return; }
    $("#phoneVerify").prop("disabled", true);
    Panel.auth.verifyPhoneOtp(pending, code)
      .done(function(){ buildProfilePage(); refreshRequests(); })
      .fail(function(err){ say((err && err.message) || "Couldn't verify that code.", true); })
      .always(function(){ $("#phoneVerify").prop("disabled", false); });
  });
}

function buildProfilePage(){
  var u = Panel.user || {};
  var avatar = u.picture
    ? '<img src="' + esc(u.picture) + '" alt="" referrerpolicy="no-referrer" class="w-20 h-20 rounded-full object-cover border-2 border-white shadow-md">'
    : '<div class="w-20 h-20 rounded-full bg-corporate-navy text-white flex items-center justify-center text-2xl font-bold shadow-md border-2 border-white">' + esc(initials(u.name)) + '</div>';

  var rows = [
    ["Name", u.name],
    ["Email", u.email],
    ["Mobile", u.phone || "Not verified"],
    ["Sign-in method", "Google"],
    ["Account ID", u.id],
    ["Last sign-in", fmtDateTime(u.lastSignInAt)],
    ["Member since", fmtDateTime(u.createdAt)],
    ["Data storage", Panel.label]
  ];
  var rowsHtml = rows.map(function(r){
    return '<div class="flex items-start justify-between gap-3 py-2 border-b border-slate-100 last:border-0">'
      + '<span class="text-[11.5px] text-slate-500 flex-shrink-0">' + esc(r[0]) + '</span>'
      + '<span class="text-[12px] font-medium text-slate-800 text-right break-all">' + esc(r[1] || "—") + '</span></div>';
  }).join("");

  var html = ''
    + '<div class="p-3 space-y-2.5">'
    +   '<div class="bg-white border border-slate-200 rounded-2xl p-5 shadow-fintech-sm flex flex-col items-center text-center">'
    +     avatar
    +     '<div class="mt-3 text-base font-bold text-slate-800">' + esc(u.name || "Signed-in user") + '</div>'
    +     '<div class="text-[12.5px] text-slate-500 break-all">' + esc(u.email || "") + '</div>'
    +     '<div class="mt-2 flex items-center gap-1.5 flex-wrap justify-center">'
    +       '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-[10.5px] font-semibold"><i class="ph-bold ph-google-logo text-[11px]"></i> Google account</span>'
    +       (u.emailVerified ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10.5px] font-semibold"><i class="ph-bold ph-seal-check text-[11px]"></i> Verified</span>' : '')
    +       (Panel.isDemo ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10.5px] font-semibold">Demo account</span>' : '')
    +     '</div>'
    +   '</div>'
    +   '<div class="bg-white border border-slate-200 rounded-xl px-3.5 py-1.5 shadow-fintech-sm">' + rowsHtml + '</div>'
    + phoneCardHtml(u)
    +   '<div class="bg-white border border-slate-200 rounded-xl p-3 shadow-fintech-sm">'
    +     '<div class="flex items-center gap-2 mb-2.5">'
    +       '<div class="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0"><i class="ph-bold ph-crown-simple text-amber-600"></i></div>'
    +       '<div><div class="text-sm font-semibold text-slate-800">Subscription</div><div class="text-[11px] text-slate-500">Current plan: Free</div></div>'
    +     '</div>'
    +     '<button type="button" id="btnSubscribe" disabled class="w-full bg-slate-100 text-slate-500 text-xs font-semibold rounded-lg py-2.5 flex items-center justify-center gap-2 cursor-not-allowed">'
    +       'Subscribe <span class="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold">Coming soon</span>'
    +     '</button>'
    +   '</div>'
    +   '<button type="button" id="btnSignOut" class="w-full bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold rounded-xl py-2.5 flex items-center justify-center gap-2">'
    +     '<i class="ph-bold ph-sign-out text-sm"></i> Sign out'
    +   '</button>'
    + '</div>';

  $("#profilePage").html(html);
  bindPhoneCard();
  $("#btnSignOut").on("click", function(){
    if(confirm("Sign out of this device?")){
      Panel.auth.logout().always(function(){ location.reload(); });
    }
  });
}
