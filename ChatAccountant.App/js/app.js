/* js/app.js — boot: splash -> sign-in -> load data -> start the app, plus global event bindings */
/* ================= BOOT: splash -> Google sign-in -> load data -> app ================= */

var appStarted = false;

function hideSplash(done){
  var $splash = $("#splashScreen");
  $splash.css("opacity", "0");
  setTimeout(function(){ $splash.hide(); if(done) done(); }, 300);
}

function setGoogleBusy(busy){
  $("#btnGoogleLogin").prop("disabled", busy).css("opacity", busy ? 0.6 : 1);
  $("#googleBtnText").text(busy ? "Signing in…" : "Continue with Google");
}

function showLogin(message){
  $("#loginMessage").text(message || "");
  $("#demoNotice").toggle(Panel.isDemo);
  setGoogleBusy(false);
  $("#loginScreen").css("display", "flex");
}

function enterApp(){
  Panel.loadAll()
    .done(function(res){
      data = normalizeConfig(res.config);
      ledger = res.ledger || [];
      $("#loginScreen").hide();
      startApp();
    })
    .fail(function(){
      $("#loginScreen").css("display", "flex");
      setGoogleBusy(false);
      $("#demoNotice").toggle(Panel.isDemo);
      $("#loginMessage").text("Couldn't load your data. Tap the button to retry.");
    });
}

function startApp(){
  if(appStarted) return;
  appStarted = true;

  $("#footerNote").text(Panel.isDemo ? "Demo mode • your data stays in this browser only" : "Your data is saved securely to your account");
  setSync("idle");
  refreshPresetLabels();
  updateSummary();
  updateDateBanner();
  showPage("chat");
  // the day changes at midnight: keep the totals strip honest
  setInterval(updateSummary, 60000);
  document.addEventListener("visibilitychange", function(){ if(document.visibilityState === "visible") updateSummary(); });
  $("#navRequests").css("display", Panel.supportsShares ? "" : "none");
  if(Panel.supportsShares){
    refreshRequests();
    setInterval(function(){ if(document.visibilityState === "visible") refreshRequests(); }, 60000);
    document.addEventListener("visibilitychange", function(){ if(document.visibilityState === "visible") refreshRequests(); });
    $("#btnRefreshRequests").on("click", function(){ refreshRequests(); });
  }

  var u = Panel.user || {};
  var first = u.givenName || (u.name ? u.name.split(/\s+/)[0] : "");
  var card = newBotCard("ph-robot");
  card.innerHTML = '<p class="font-medium text-slate-900 mb-0.5">' + (first ? "Welcome back, " + esc(first) : "Welcome to Chat Accountant") + '</p>'
    + '<p class="text-slate-600 text-[13px]">Hi — I\'m your bookkeeping copilot. Tap an action below to record income, expenses, credit sales/purchases with GST, and keep your ledger up to date.</p>';
  scrollBottom();
  startChat();

  if(hasPinSet()) showLockScreen();   // optional device lock, on top of Google sign-in
}

$("#btnGoogleLogin").on("click", function(){
  setGoogleBusy(true);
  $("#loginMessage").text("");
  var step = Panel.user ? $.Deferred().resolve(Panel.user).promise() : Panel.auth.loginWithGoogle();
  step.done(function(){ enterApp(); })
      .fail(function(){ setGoogleBusy(false); $("#loginMessage").text("Sign-in failed. Please try again."); });
});

$("#undoBtn").on("click", performUndo);
$("#summaryReport").on("click", function(){ showPage("reporting"); });

$("#hdrExit").on("click", function(){ setFullChat(false); });

$("#dateBannerReset").on("click", function(){ workingDate = null; updateDateBanner(); });

$("#btnExport").on("click", exportCSV);

$("#btnReset").on("click", function(){
  var extra = Panel.isDemo ? " (this demo account will go back to a blank ledger)" : "";
  if(confirm("This deletes all logged transactions, customers and settings" + extra + ". Continue?")){
    Panel.resetAll()
      .done(function(){ location.reload(); })
      .fail(function(){ alert("Couldn't reset right now. Please try again."); });
  }
});

$(function(){
  var minSplash = $.Deferred();
  setTimeout(function(){ minSplash.resolve(); }, 1100);
  $.when(Panel.auth.session(), minSplash)
    .done(function(user){
      hideSplash(function(){ if(user) enterApp(); else showLogin(); });
    })
    .fail(function(){
      hideSplash(function(){ showLogin("Couldn't check your sign-in. Please try again."); });
    });
});
