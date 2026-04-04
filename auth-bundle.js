/* ═══════════════════════════════════════════════════════════
   auth-bundle.js — Kingshot Help
   ═══════════════════════════════════════════════════════════
   Fichier unique : logique + UI + CSS
   Remplace auth.js + auth-ui.js + auth-calc.js
   
   INTÉGRATION :
   Chaque page HTML → ajouter avant </body> :
   <script src="auth-bundle.js"></script>
   
   C'est tout. Le SDK Supabase est chargé automatiquement.
   ═══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  // ── CONFIG — À REMPLIR ──
  const SUPABASE_URL = https://ndusomdjunpvabmwvuqr.supabase.co 'https://XXXXXXX.supabase.co';
  const SUPABASE_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kdXNvbWRqdW5wdmFibXd2dXFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMzcwNjYsImV4cCI6MjA5MDkxMzA2Nn0.5AD_2hvmJQlPQnum75R1-vrFgxpQXqYBAgHKwuFApsc'eyJhb.....';

  // ── DÉTECTION PAGE ──
  const IS_CALC = location.pathname.includes('bear_calculator');

  // ── SESSION ──
  var currentUser = null;
  try { currentUser = JSON.parse(localStorage.getItem('ksUser') || 'null'); } catch(e) {}

  // ── SUPABASE CLIENT (chargé à la demande) ──
  var sbClient = null;

  function getSb() {
    if (!sbClient && typeof supabase !== 'undefined') {
      try { sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch(e) { console.error('Supabase init error:', e); }
    }
    return sbClient;
  }

  function isLoggedIn() { return !!currentUser; }
  function getUser() { return currentUser; }

  function setUser(u) {
    currentUser = u;
    if (u) localStorage.setItem('ksUser', JSON.stringify(u));
    else   localStorage.removeItem('ksUser');
    renderAuthUI();
  }

  // ── HASH ──
  async function hashPwd(pwd) {
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pwd + '_kingshot_help_2026'));
    return Array.from(new Uint8Array(buf)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  // ── TOAST ──
  function showToast(msg, type) {
    var t = document.getElementById('ksToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'ksToast';
      t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:4px;font-family:var(--f-mono,monospace);font-size:12px;letter-spacing:1px;z-index:9999;transition:opacity .4s;pointer-events:none;opacity:0';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    var c = {ok:'#1a7a44', err:'#c0392b', info:'#b86e00'};
    t.style.background = c[type] || c.info;
    t.style.color = '#fff';
    t.style.opacity = '1';
    clearTimeout(t._t);
    t._t = setTimeout(function() { t.style.opacity = '0'; }, 2500);
  }

  // ═══════════════════════════════════════════════════════
  //  AUTH FUNCTIONS
  // ═══════════════════════════════════════════════════════

  async function doRegister() {
    var sb = getSb();
    if (!sb) { showToast('Supabase non chargé, réessaie', 'err'); return; }

    var username = (document.getElementById('authUser')?.value || '').trim().toLowerCase();
    var password = document.getElementById('authPwd')?.value || '';
    var alliance = (document.getElementById('authAlliance')?.value || '').trim();
    var server   = (document.getElementById('authServer')?.value || '').trim();

    if (!username || username.length < 3) { showAuthError('Pseudo : 3 caractères minimum'); return; }
    if (!password || password.length < 4) { showAuthError('Mot de passe : 4 caractères minimum'); return; }

    try {
      var hash = await hashPwd(password);
      var res = await sb.from('profiles').insert({ username: username, password: hash, alliance: alliance, server: server }).select('id, username, alliance, server').single();
      if (res.error) {
        if (res.error.code === '23505') throw new Error('Ce pseudo est déjà pris');
        throw new Error(res.error.message);
      }
      setUser(res.data);
      showToast('Compte créé !', 'ok');
      if (IS_CALC) setTimeout(saveToCloud, 500);
    } catch(e) {
      showAuthError(e.message);
    }
  }

  async function doLogin() {
    var sb = getSb();
    if (!sb) { showToast('Supabase non chargé, réessaie', 'err'); return; }

    var username = (document.getElementById('authUser')?.value || '').trim().toLowerCase();
    var password = document.getElementById('authPwd')?.value || '';

    try {
      var hash = await hashPwd(password);
      var res = await sb.from('profiles').select('id, username, alliance, server').eq('username', username).eq('password', hash).single();
      if (res.error || !res.data) throw new Error('Pseudo ou mot de passe incorrect');
      setUser(res.data);
      showToast('Connecté !', 'ok');
      if (IS_CALC) loadFromCloud();
    } catch(e) {
      showAuthError(e.message);
    }
  }

  function doLogout() {
    setUser(null);
    showToast('Déconnecté', 'info');
  }

  // ═══════════════════════════════════════════════════════
  //  CLOUD SAVE / LOAD
  // ═══════════════════════════════════════════════════════

  var cloudTimer = null;

  async function saveToCloud() {
    var sb = getSb();
    if (!sb || !isLoggedIn()) return;
    var raw = localStorage.getItem('bearCalcState');
    if (!raw) { showToast('Rien à sauvegarder', 'info'); return; }
    try {
      var res = await sb.from('profiles').update({ calc_state: JSON.parse(raw) }).eq('id', currentUser.id);
      if (res.error) throw res.error;
      showToast('☁️ Sauvegardé', 'ok');
    } catch(e) {
      console.error('Cloud save error:', e);
      showToast('Erreur sauvegarde cloud', 'err');
    }
  }

  function scheduleCloudSave() {
    if (!isLoggedIn()) return;
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(saveToCloud, 5000);
  }

  async function loadFromCloud() {
    var sb = getSb();
    if (!sb || !isLoggedIn()) return;
    try {
      var res = await sb.from('profiles').select('calc_state').eq('id', currentUser.id).single();
      if (res.error) throw res.error;
      if (res.data?.calc_state && Object.keys(res.data.calc_state).length > 0) {
        localStorage.setItem('bearCalcState', JSON.stringify(res.data.calc_state));
        if (typeof window.resetCalc === 'function' && typeof window.loadState === 'function') {
          window.resetCalc();
          window.loadState();
        }
        showToast('☁️ Profil chargé', 'ok');
      }
    } catch(e) {
      console.error('Cloud load error:', e);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  ALLIANCE
  // ═══════════════════════════════════════════════════════

  async function openAllianceModal() {
    var sb = getSb();
    if (!sb || !currentUser?.alliance) { showToast('Renseigne ton alliance dans le profil', 'info'); return; }

    var old = document.getElementById('allianceModal');
    if (old) old.remove();

    var modal = document.createElement('div');
    modal.id = 'allianceModal';
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
    modal.innerHTML = '<div class="ab-modal-body"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px"><div><div style="font-family:var(--f-mono,monospace);font-size:10px;color:#b86e00;letter-spacing:2px">ALLIANCE</div><div style="font-family:var(--f-display,sans-serif);font-size:1.4rem;font-weight:800;text-transform:uppercase">' + currentUser.alliance + '</div></div><button onclick="document.getElementById(\'allianceModal\').remove()" class="auth-btn">✕ Fermer</button></div><div id="allyList" style="font-size:13px;color:#445068">Chargement…</div></div>';
    document.body.appendChild(modal);

    try {
      var res = await sb.from('alliance_members').select('*').eq('alliance', currentUser.alliance);
      var members = res.data || [];
      var list = document.getElementById('allyList');
      if (!list) return;

      if (members.length === 0) { list.innerHTML = 'Aucun membre trouvé.'; return; }

      var html = '<div style="font-family:var(--f-mono,monospace);font-size:10px;color:#8090a8;margin-bottom:8px">' + members.length + ' MEMBRE(S)</div>';
      for (var i = 0; i < members.length; i++) {
        var m = members[i];
        var stocks = [m.stock_inf ? 'INF ' + Number(m.stock_inf).toLocaleString() : null, m.stock_cav ? 'CAV ' + Number(m.stock_cav).toLocaleString() : null, m.stock_arc ? 'ARC ' + Number(m.stock_arc).toLocaleString() : null].filter(Boolean).join(' · ');
        var heroes = (m.heroes || []).map(function(h) { return h.heroKey; }).filter(Boolean).join(', ');
        var lead = m.lead_cap ? 'Lead ' + Number(m.lead_cap).toLocaleString() : '';
        var updated = m.updated_at ? new Date(m.updated_at).toLocaleDateString('fr-FR', {day:'numeric',month:'short'}) : '';
        var isMe = m.username === currentUser.username;
        html += '<div class="ab-ally-card"' + (isMe ? ' style="border-left:3px solid #b86e00"' : '') + '><div style="display:flex;justify-content:space-between"><strong>' + m.username + (isMe ? ' <span style="font-size:10px;color:#b86e00">(toi)</span>' : '') + '</strong><span style="font-size:9px;color:#8090a8">' + updated + '</span></div>' + (stocks ? '<div style="font-size:12px;margin-top:4px">' + stocks + (lead ? ' · ' + lead : '') + '</div>' : '') + (heroes ? '<div style="font-size:11px;color:#8090a8;margin-top:2px">Héros : ' + heroes + '</div>' : '') + '</div>';
      }
      list.innerHTML = html;
    } catch(e) {
      var l = document.getElementById('allyList');
      if (l) l.innerHTML = 'Erreur de chargement.';
    }
  }

  async function openEditProfile() {
    var alliance = prompt('Tag alliance :', currentUser?.alliance || '');
    if (alliance === null) return;
    var server = prompt('Serveur :', currentUser?.server || '');
    if (server === null) return;
    var sb = getSb();
    if (!sb) return;
    try {
      var res = await sb.from('profiles').update({ alliance: alliance.trim(), server: (server||'').trim() }).eq('id', currentUser.id);
      if (res.error) throw res.error;
      currentUser.alliance = alliance.trim();
      currentUser.server = (server||'').trim();
      localStorage.setItem('ksUser', JSON.stringify(currentUser));
      renderAuthUI();
      showToast('Profil mis à jour', 'ok');
    } catch(e) {
      showToast('Erreur : ' + e.message, 'err');
    }
  }

  // ═══════════════════════════════════════════════════════
  //  CSS INJECTION
  // ═══════════════════════════════════════════════════════

  function injectCSS() {
    var s = document.createElement('style');
    s.textContent = '\
#authBar{margin-top:16px;padding:14px 16px;background:var(--surface,#fff);border:1px solid var(--border,#ccd4e0);font-family:var(--f-body,sans-serif);font-size:13px}\
.auth-btn{background:transparent;border:1px solid var(--border,#ccd4e0);color:var(--text-dim,#445068);font-family:var(--f-mono,monospace);font-size:11px;letter-spacing:1px;padding:5px 12px;cursor:pointer;transition:all .2s;white-space:nowrap}\
.auth-btn:hover{background:rgba(184,110,0,.10);border-color:#b86e00;color:#b86e00}\
.auth-input{width:100%;padding:6px 8px;background:var(--surface2,#edf0f5);border:1px solid var(--border,#ccd4e0);font-family:var(--f-body,sans-serif);font-size:13px;color:var(--text,#18202e)}\
.auth-input:focus{outline:none;border-color:#b86e00}\
.auth-label{font-size:10px;color:var(--text-dim,#445068);display:block;margin-bottom:2px;font-family:var(--f-mono,monospace);letter-spacing:1px}\
.ab-row{display:flex;gap:6px;flex-wrap:wrap;align-items:end}\
.ab-field{flex:1;min-width:90px}\
#allianceModal{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center}\
.ab-modal-body{background:var(--bg,#f0f3f7);border:1px solid var(--border,#ccd4e0);max-width:500px;width:90%;max-height:80vh;overflow-y:auto;padding:20px}\
.ab-ally-card{background:var(--surface,#fff);border:1px solid var(--border,#ccd4e0);padding:12px;margin-bottom:8px}\
';
    document.head.appendChild(s);
  }

  // ═══════════════════════════════════════════════════════
  //  UI RENDERING
  // ═══════════════════════════════════════════════════════

  function showAuthError(msg) {
    var el = document.getElementById('authError');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(function() { el.style.display = 'none'; }, 4000);
  }

  function renderAuthUI() {
    var bar = document.getElementById('authBar');
    if (!bar) return;

    if (isLoggedIn()) {
      var u = currentUser;
      var cloudBtns = IS_CALC
        ? '<button onclick="window._auth.saveToCloud()" class="auth-btn" style="border-color:#1a7a44;color:#1a7a44">☁ Sauver</button><button onclick="window._auth.loadFromCloud()" class="auth-btn">☁ Charger</button>'
        : '';
      var allyBtn = u.alliance
        ? '<button onclick="window._auth.openAllianceModal()" class="auth-btn" style="border-color:#b86e00;color:#b86e00">👥 Alliance</button>'
        : '';

      bar.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">'
        + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
        + '<span style="font-family:var(--f-mono,monospace);font-size:10px;color:#1a7a44;letter-spacing:2px">● ONLINE</span>'
        + '<strong style="font-size:14px">' + u.username + '</strong>'
        + (u.alliance ? '<span style="font-family:var(--f-mono,monospace);font-size:11px;color:#b86e00">' + u.alliance + '</span>' : '')
        + (u.server ? '<span style="font-family:var(--f-mono,monospace);font-size:10px;color:#8090a8">' + u.server + '</span>' : '')
        + '</div>'
        + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
        + cloudBtns + allyBtn
        + '<button onclick="window._auth.openEditProfile()" class="auth-btn">⚙ Profil</button>'
        + '<button onclick="window._auth.doLogout()" class="auth-btn" style="border-color:#c0392b;color:#c0392b">Déco</button>'
        + '</div></div>';
    } else {
      bar.innerHTML = '<div style="font-family:var(--f-mono,monospace);font-size:10px;color:var(--text-faint,#8090a8);letter-spacing:2px;margin-bottom:10px">COMPTE · SAUVEGARDE CLOUD</div>'
        + '<div class="ab-row">'
        + '<div class="ab-field"><label class="auth-label">Pseudo</label><input id="authUser" type="text" class="auth-input" placeholder="ton pseudo" onkeydown="if(event.key===\'Enter\')window._auth.doLogin()"></div>'
        + '<div class="ab-field"><label class="auth-label">Mot de passe</label><input id="authPwd" type="password" class="auth-input" placeholder="••••" onkeydown="if(event.key===\'Enter\')window._auth.doLogin()"></div>'
        + '<button onclick="window._auth.doLogin()" class="auth-btn" style="border-color:#1a7a44;color:#1a7a44;padding:6px 14px">Connexion</button>'
        + '<button onclick="window._auth.toggleRegister()" class="auth-btn" style="padding:6px 14px">Inscription</button>'
        + '</div>'
        + '<div id="authRegExtra" style="display:none;margin-top:10px">'
        + '<div class="ab-row">'
        + '<div class="ab-field"><label class="auth-label">Alliance (optionnel)</label><input id="authAlliance" type="text" class="auth-input" placeholder="[TAG]"></div>'
        + '<div class="ab-field"><label class="auth-label">Serveur (optionnel)</label><input id="authServer" type="text" class="auth-input" placeholder="S.1507"></div>'
        + '<button onclick="window._auth.doRegister()" class="auth-btn" style="border-color:#b86e00;color:#b86e00;padding:6px 14px">Créer le compte</button>'
        + '</div></div>'
        + '<div id="authError" style="display:none;margin-top:8px;font-size:12px;color:#c0392b"></div>';
    }
  }

  // ═══════════════════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════════════════

  function init() {
    // CSS
    injectCSS();

    // Créer la barre
    var hdr = document.querySelector('.hdr');
    if (!hdr) { console.warn('auth-bundle: .hdr not found'); return; }
    if (document.getElementById('authBar')) return;

    var bar = document.createElement('div');
    bar.id = 'authBar';
    hdr.after(bar);

    // Remplir
    renderAuthUI();

    // Hook calculateur : greffer la sauvegarde cloud sur saveState()
    if (IS_CALC && typeof window.saveState === 'function') {
      var orig = window.saveState;
      window.saveState = function() {
        orig();
        scheduleCloudSave();
      };

      // Fonction resetCalc pour le rechargement cloud
      window.resetCalc = function() {
        while (window.jCount > 0) {
          document.getElementById('jtab' + window.jCount)?.remove();
          document.getElementById('jpanel' + window.jCount)?.remove();
          window.jCount--;
        }
        if (typeof window.syncJCtrl === 'function') window.syncJCtrl();
        var idle = document.getElementById('jIdleMsg');
        if (idle) idle.style.display = '';
        window.heroSlots = [];
        window.heroSlotCount = 0;
        var hc = document.getElementById('heroSlots');
        if (hc) hc.innerHTML = '';
        var ba = document.getElementById('btnAddHero');
        if (ba) ba.disabled = false;
        if (typeof window.updateHeroSummary === 'function') window.updateHeroSummary();
      };

      // Charger le profil cloud si connecté
      if (isLoggedIn()) setTimeout(loadFromCloud, 300);
    }

    // Charger le SDK Supabase en async (si pas déjà chargé)
    if (typeof supabase === 'undefined') {
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      script.onload = function() { console.log('Supabase SDK loaded'); };
      document.head.appendChild(script);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  TOGGLE REGISTER
  // ═══════════════════════════════════════════════════════

  function toggleRegister() {
    var el = document.getElementById('authRegExtra');
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
  }

  // ═══════════════════════════════════════════════════════
  //  EXPOSER LES FONCTIONS AU GLOBAL (pour les onclick)
  // ═══════════════════════════════════════════════════════

  window._auth = {
    doLogin: doLogin,
    doRegister: doRegister,
    doLogout: doLogout,
    saveToCloud: saveToCloud,
    loadFromCloud: loadFromCloud,
    openAllianceModal: openAllianceModal,
    openEditProfile: openEditProfile,
    toggleRegister: toggleRegister
  };

  // Lancer l'init
  init();

})();
