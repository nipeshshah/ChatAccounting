/* ============================================================================
   12-navigation.js  -  Bottom-tab navigation
   Classic script: shares the global scope with the other js/*.js files.
   Load order is defined in index.html.
   ============================================================================ */
/* ================= PAGE NAVIGATION ================= */
let currentPage = "chat";
let manageSection = "debtors";

function buildPlaceholder(container, icon, title, message){
  container.innerHTML = `<div class="flex flex-col items-center justify-center text-center py-20 px-8 h-full">
    <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
      <i class="ph-bold ${icon} text-3xl text-slate-400"></i>
    </div>
    <h2 class="text-base font-bold text-slate-700 mb-1">${title}</h2>
    <p class="text-sm text-slate-500 max-w-xs leading-relaxed">${message}</p>
    <span class="mt-4 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-semibold">
      <i class="ph-bold ph-clock text-xs"></i> Coming soon
    </span>
  </div>`;
}

function showPage(page){
  currentPage = page;
  ["chatPage","managePage","requestsPage","profilePage","settingsPage"].forEach(id=>{
    document.getElementById(id).classList.toggle("hidden", id !== page + "Page");
  });
  document.querySelectorAll(".nav-tab").forEach(btn=>{
    btn.classList.toggle("active", btn.dataset.page === page);
  });
  if(page === "manage") renderManageSection();
  if(page === "requests"){ renderRequests(); refreshRequests(); }
  if(page === "profile") buildProfilePage();
  if(page === "settings") buildSettingsPage();
  applyFullChat();
  if(page === "chat") scrollBottom();
}

document.querySelectorAll(".nav-tab").forEach(btn=>{
  btn.onclick = ()=> showPage(btn.dataset.page);
});
