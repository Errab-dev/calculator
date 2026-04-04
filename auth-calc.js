/* ═══════════════════════════════════════════════════════════
   auth-calc.js — Hook spécifique au Bear Hunt Calculator
   ═══════════════════════════════════════════════════════════
   Ce fichier est chargé UNIQUEMENT par bear_calculator.html
   Il greffe la sauvegarde cloud sur saveState() et ajoute
   la fonction resetCalc() pour le rechargement de profil.
   ═══════════════════════════════════════════════════════════ */

// ── Reset UI du calculateur (avant un loadState frais) ──
function resetCalc() {
  // Supprimer les joiners
  while (jCount > 0) {
    document.getElementById(`jtab${jCount}`)?.remove();
    document.getElementById(`jpanel${jCount}`)?.remove();
    jCount--;
  }
  syncJCtrl();
  document.getElementById('jIdleMsg').style.display = '';

  // Reset héros
  heroSlots = [];
  heroSlotCount = 0;
  const heroContainer = document.getElementById('heroSlots');
  if (heroContainer) heroContainer.innerHTML = '';
  const btnAdd = document.getElementById('btnAddHero');
  if (btnAdd) btnAdd.disabled = false;
  updateHeroSummary();
}

// ── Hook : saveState() → sauvegarde cloud auto ──
const _origSaveState = saveState;
saveState = function () {
  _origSaveState();        // localStorage (comportement existant)
  scheduleCloudSave();     // + cloud avec debounce 5s
};

// ── Au chargement : si connecté, charger le profil cloud ──
if (isLoggedIn()) {
  // Petit délai pour laisser le temps au DOM d'être prêt
  setTimeout(() => loadFromCloud(), 300);
}
