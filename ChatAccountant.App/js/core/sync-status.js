/* js/core/sync-status.js — header sync indicator (saving / saved / error) */
/* ================= SYNC STATUS (header) ================= */

var syncTimer = null;

function setSync(state){
  var text = Panel.isDemo ? "Demo mode · dummy data" : "Synced to your account";
  var color = "#34d399";
  if(state === "saving"){ text = "Saving…"; color = "#fbbf24"; }
  else if(state === "saved"){ text = "Saved ✓"; }
  else if(state === "error"){ text = "Couldn't save — will retry on next change"; color = "#f87171"; }
  $("#syncText").text(text);
  $("#syncDot, #syncPing, #hdrDot").css("background", color);
  clearTimeout(syncTimer);
  if(state === "saved") syncTimer = setTimeout(function(){ setSync("idle"); }, 1600);
}

Panel.on("saving", function(){ setSync("saving"); })
     .on("saved", function(){ setSync("saved"); })
     .on("error", function(p){ if(p.write) setSync("error"); });
