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
  const SUPABASE_URL = 'https://ndusomdjunpvabmwvuqr.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kdXNvbWRqdW5wdmFibXd2dXFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMzcwNjYsImV4cCI6MjA5MDkxMzA2Nn0.5AD_2hvmJQlPQnum75R1-vrFgxpQXqYBAgHKwuFApsc';

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
      closePanelAuth();
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

  // ── HELPER : formate un nombre avec séparateur de milliers ──
  function fmtN(n) {
    var v = Number(n);
    if (!v || isNaN(v)) return '0';
    return v.toLocaleString('fr-FR');
  }

  // ── HELPER : calcule les quantités INF/CAV/ARC d'une team depuis calc_state ──
  // Retourne { i, c, a, ri, rc, ra } (quantités + ratios en %)
  function getTeamCounts(cap, exactI, exactC, exactA, ratioI, ratioC, ratioA, stockInf, stockCav, stockArc) {
    cap    = Number(cap    || 0);
    if (cap <= 0) return null;
    exactI = exactI !== undefined && exactI !== '' ? Number(exactI) : undefined;
    exactC = exactC !== undefined && exactC !== '' ? Number(exactC) : undefined;
    exactA = exactA !== undefined && exactA !== '' ? Number(exactA) : undefined;
    ratioI = Number(ratioI || 10);
    ratioC = Number(ratioC || 10);
    ratioA = Number(ratioA || 80);
    var i, c, a;
    if (exactI !== undefined) {
      i = exactI; c = exactC; a = exactA;
    } else {
      i = Math.min(Math.round(cap * ratioI / 100), stockInf || Infinity);
      c = Math.min(Math.round(cap * ratioC / 100), stockCav || Infinity);
      a = cap - i - c;
    }
    // Ratios réels
    var tot = i + c + a;
    var ri = tot > 0 ? Math.round(i / tot * 100) : ratioI;
    var rc = tot > 0 ? Math.round(c / tot * 100) : ratioC;
    var ra = 100 - ri - rc;
    return { i: i, c: c, a: a, ri: ri, rc: rc, ra: ra };
  }

  // ── HELPER : génère le texte brut pour Discord ──
  function buildDiscordText(username, cs) {
    var inf = Number(cs.inf || 0), cav = Number(cs.cav || 0), arc = Number(cs.arc || 0);
    var lines = [];
    lines.push('🐻 **Bear Hunt** — ' + username);
    if (inf || cav || arc) {
      lines.push('**Stocks** : INF ' + fmtN(inf) + ' | CAV ' + fmtN(cav) + ' | ARC ' + fmtN(arc));
    }
    lines.push('');
    // Leader
    var lTeam = getTeamCounts(cs.leadCap, cs.leadExactI, cs.leadExactC, cs.leadExactA, cs.lInf, cs.lCav, cs.lArc, inf, cav, arc);
    if (lTeam) {
      lines.push('👑 **Leader** : ' + fmtN(lTeam.i + lTeam.c + lTeam.a) + ' troupes'
        + ' — INF ' + fmtN(lTeam.i) + ' (' + lTeam.ri + '%) · CAV ' + fmtN(lTeam.c) + ' (' + lTeam.rc + '%) · ARC ' + fmtN(lTeam.a) + ' (' + lTeam.ra + '%)');
    }
    // Joiners
    var joiners = cs.joiners || [];
    var jNum = 0;
    for (var j = 0; j < joiners.length; j++) {
      var jd = joiners[j];
      var jTeam = getTeamCounts(jd.cap, jd.exactI, jd.exactC, jd.exactA, jd.inf, jd.cav, jd.arc, inf, cav, arc);
      if (!jTeam) continue;
      jNum++;
      lines.push('⚡ **Joiner ' + jNum + '** : ' + fmtN(jTeam.i + jTeam.c + jTeam.a) + ' troupes'
        + ' — INF ' + fmtN(jTeam.i) + ' (' + jTeam.ri + '%) · CAV ' + fmtN(jTeam.c) + ' (' + jTeam.rc + '%) · ARC ' + fmtN(jTeam.a) + ' (' + jTeam.ra + '%)');
    }
    lines.push('');
    lines.push('_Bear Hunt Calculator · Kingshot Help_');
    return lines.join('\n');
  }

  // ── HELPER : toggle détail d'un membre ──
  function toggleMemberDetail(idx) {
    var detail = document.getElementById('abDetail_' + idx);
    var arrow  = document.getElementById('abArrow_'  + idx);
    if (!detail) return;
    var open = detail.style.display !== 'none';
    detail.style.display = open ? 'none' : 'block';
    if (arrow) arrow.textContent = open ? '▶' : '▼';
  }
  window._authToggleMember = toggleMemberDetail;

  // ── HELPER : copier le texte Discord d'un membre ──
  function copyMemberDiscord(idx) {
    var btn  = document.getElementById('abCopyBtn_' + idx);
    var area = document.getElementById('abText_' + idx);
    var text = area ? area.value : '';
    if (!text) return;
    navigator.clipboard.writeText(text).then(function() {
      if (btn) { btn.textContent = '✓ Copié !'; btn.style.borderColor = '#1a7a44'; btn.style.color = '#1a7a44'; }
      setTimeout(function() {
        if (btn) { btn.textContent = '▣ Copier pour Discord'; btn.style.borderColor = ''; btn.style.color = ''; }
      }, 2000);
    }).catch(function() { if (btn) btn.textContent = '✗ Erreur'; });
  }
  window._authCopyMember = copyMemberDiscord;

  async function openAllianceModal() {
    var sb = getSb();
    if (!sb || !currentUser?.alliance) { showToast('Renseigne ton alliance dans le profil', 'info'); return; }

    var old = document.getElementById('allianceModal');
    if (old) old.remove();

    var modal = document.createElement('div');
    modal.id = 'allianceModal';
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
    modal.innerHTML = ''
      + '<div class="ab-modal-body">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
      + '<div><div style="font-family:var(--f-mono,monospace);font-size:10px;color:#b86e00;letter-spacing:2px">ALLIANCE</div>'
      + '<div style="font-family:var(--f-display,sans-serif);font-size:1.4rem;font-weight:800;text-transform:uppercase">' + currentUser.alliance + '</div></div>'
      + '<button onclick="document.getElementById(\'allianceModal\').remove()" class="auth-btn">✕ Fermer</button>'
      + '</div>'
      + '<div id="allyList" style="font-size:13px;color:#445068">Chargement…</div>'
      + '</div>';
    document.body.appendChild(modal);

    try {
      var res = await sb.from('alliance_members').select('*').eq('alliance', currentUser.alliance);
      var members = res.data || [];
      var list = document.getElementById('allyList');
      if (!list) return;
      if (members.length === 0) { list.innerHTML = 'Aucun membre trouvé.'; return; }

      // Récupérer calc_state depuis profiles
      var usernames = members.map(function(m) { return m.username; });
      var profilesRes = await sb.from('profiles').select('username, calc_state').in('username', usernames);
      var profilesMap = {};
      (profilesRes.data || []).forEach(function(p) { profilesMap[p.username] = p.calc_state || {}; });

      var html = '<div style="font-family:var(--f-mono,monospace);font-size:10px;color:#8090a8;margin-bottom:10px">' + members.length + ' MEMBRE(S) — clique sur un nom pour voir le détail</div>';

      for (var i = 0; i < members.length; i++) {
        var m = members[i];
        var cs = profilesMap[m.username] || {};
        var isMe = m.username === currentUser.username;

        // Date/heure
        var updatedStr = '';
        if (m.updated_at) {
          var d = new Date(m.updated_at);
          updatedStr = d.toLocaleDateString('fr-FR', {day:'2-digit', month:'short'})
                     + ' ' + d.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});
        }

        // Résumé rapide
        var inf = Number(cs.inf || 0), cav = Number(cs.cav || 0), arc = Number(cs.arc || 0);
        var lead = Number(cs.leadCap || 0);
        var joiners = cs.joiners || [];
        var activeJ = joiners.filter(function(j) { return Number(j.cap || 0) > 0; }).length;
        var quickInfo = [];
        if (lead) quickInfo.push('Lead ' + fmtN(lead));
        if (activeJ) quickInfo.push(activeJ + ' joiner' + (activeJ > 1 ? 's' : ''));
        if (!lead && !activeJ && (inf || cav || arc)) quickInfo.push('Stocks renseignés');
        if (!lead && !activeJ && !inf && !cav && !arc) quickInfo.push('Aucune donnée');

        // Texte Discord complet
        var discordText = buildDiscordText(m.username, cs);
        var hasData = lead > 0 || inf > 0 || cav > 0 || arc > 0;

        // Détail dépliable
        var detailHtml = '';
        if (hasData) {
          // Rendu visuel du compte rendu
          var visualLines = discordText.split('\n').map(function(l) {
            if (l === '') return '<div style="height:6px"></div>';
            var html2 = l
              .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/_(.*?)_/g, '<em style="color:#72767d">$1</em>');
            return '<div style="line-height:1.7">' + html2 + '</div>';
          }).join('');

          detailHtml = '<div id="abDetail_' + i + '" style="display:none;margin-top:10px">'
            // Bloc style Discord
            + '<div style="background:#2f3136;border-radius:4px;padding:12px 14px;font-family:var(--f-mono,monospace);font-size:11.5px;color:#dcddde">'
            + '<div style="font-size:9px;color:#72767d;letter-spacing:1.5px;margin-bottom:8px;text-transform:uppercase">📋 Compte rendu</div>'
            + visualLines
            + '</div>'
            // Textarea caché pour la copie
            + '<textarea id="abText_' + i + '" style="position:absolute;opacity:0;pointer-events:none;height:0" readonly>' + discordText.replace(/</g, '&lt;') + '</textarea>'
            // Bouton copier
            + '<button id="abCopyBtn_' + i + '" onclick="window._authCopyMember(' + i + ')" class="auth-btn" style="margin-top:8px;width:100%;text-align:center;padding:8px">▣ Copier pour Discord</button>'
            + '</div>';
        } else {
          detailHtml = '<div id="abDetail_' + i + '" style="display:none;margin-top:8px;font-size:12px;color:#8090a8;font-style:italic">Ce membre n\'a pas encore sauvegardé de calcul.</div>';
        }

        html += '<div class="ab-ally-card" style="' + (isMe ? 'border-left:3px solid #b86e00;' : '') + 'padding:0">'
          // Ligne cliquable
          + '<div onclick="window._authToggleMember(' + i + ')" style="display:flex;justify-content:space-between;align-items:center;padding:12px;cursor:pointer;user-select:none" onmouseover="this.style.background=\'#f5f7fa\'" onmouseout="this.style.background=\'\'">'
          + '<div style="display:flex;align-items:center;gap:8px">'
          + '<span id="abArrow_' + i + '" style="font-size:10px;color:#b86e00;width:12px">▶</span>'
          + '<strong style="font-size:14px">' + m.username + (isMe ? ' <span style="font-size:10px;color:#b86e00;font-weight:normal">(toi)</span>' : '') + '</strong>'
          + (quickInfo.length ? '<span style="font-family:var(--f-mono,monospace);font-size:10px;color:#8090a8">' + quickInfo.join(' · ') + '</span>' : '')
          + '</div>'
          + '<span style="font-family:var(--f-mono,monospace);font-size:10px;color:#8090a8;white-space:nowrap">' + updatedStr + '</span>'
          + '</div>'
          // Détail dépliable
          + '<div style="padding:0 12px 0">' + detailHtml + '</div>'
          + '</div>';
      }

      list.innerHTML = html;

      // Fix : les textarea ont leur contenu encodé, il faut décoder
      for (var k = 0; k < members.length; k++) {
        var ta = document.getElementById('abText_' + k);
        if (ta) ta.value = buildDiscordText(members[k].username, profilesMap[members[k].username] || {});
      }

    } catch(e) {
      console.error('Alliance modal error:', e);
      var l = document.getElementById('allyList');
      if (l) l.innerHTML = 'Erreur de chargement : ' + e.message;
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
    s.textContent = [
      /* ── NAVBAR BASE ── */
      '#ksNav{position:fixed;top:0;left:0;right:0;z-index:9000;background:rgba(24,32,46,0.97);backdrop-filter:blur(12px);border-bottom:1px solid rgba(184,110,0,0.25);font-family:var(--f-mono,monospace);box-shadow:0 2px 20px rgba(0,0,0,0.25);}',
      /* Ligne 1 : logo + droite */
      '#ksNav .nav-row1{display:flex;align-items:center;height:48px;padding:0 16px;gap:10px;}',
      /* Ligne 2 : liens de nav */
      '#ksNav .nav-row2{display:flex;align-items:center;gap:0;padding:0 10px;height:34px;border-top:1px solid rgba(255,255,255,0.06);overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;}',
      '#ksNav .nav-row2::-webkit-scrollbar{display:none;}',
      '#ksNav .nav-logo{font-family:var(--f-display,"Barlow Condensed",sans-serif);font-size:1.2rem;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#fff;text-decoration:none;white-space:nowrap;flex-shrink:0;}',
      '#ksNav .nav-logo span{color:#b86e00;}',
      '#ksNav .nav-links{display:flex;align-items:center;gap:0;flex:1;}',
      '#ksNav .nav-link{font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:rgba(255,255,255,0.5);text-decoration:none;padding:6px 10px;transition:color .2s;white-space:nowrap;flex-shrink:0;}',
      '#ksNav .nav-link:hover{color:#fff;}',
      '#ksNav .nav-link.active{color:#b86e00;border-bottom:2px solid #b86e00;}',
      '#ksNav .nav-sep{width:1px;height:20px;background:rgba(255,255,255,0.12);margin:0 6px;flex-shrink:0;}',
      '#ksNav .nav-right{display:flex;align-items:center;gap:6px;margin-left:auto;flex-shrink:0;}',
      '#ksNav .nav-user{display:flex;align-items:center;gap:7px;text-decoration:none;flex-shrink:0;}',
      '#ksNav .nav-avatar{width:26px;height:26px;background:rgba(184,110,0,0.2);border:1px solid rgba(184,110,0,0.5);display:flex;align-items:center;justify-content:center;font-family:var(--f-display,"Barlow Condensed",sans-serif);font-size:.9rem;font-weight:900;color:#b86e00;text-transform:uppercase;flex-shrink:0;}',
      '#ksNav .nav-userinfo{display:flex;flex-direction:column;line-height:1.2;}',
      '#ksNav .nav-username{font-size:12px;color:#fff;font-weight:600;letter-spacing:.5px;white-space:nowrap;}',
      '#ksNav .nav-alliance{font-size:9px;color:rgba(184,110,0,0.8);letter-spacing:1px;}',
      '#ksNav .nav-dot{width:7px;height:7px;background:#1a7a44;border-radius:50%;flex-shrink:0;}',
      '#ksNav .nav-btn{background:transparent;border:1px solid rgba(255,255,255,0.18);color:rgba(255,255,255,0.65);font-family:var(--f-mono,monospace);font-size:10px;letter-spacing:1px;text-transform:uppercase;padding:5px 9px;cursor:pointer;transition:all .2s;white-space:nowrap;text-decoration:none;display:inline-block;flex-shrink:0;}',
      '#ksNav .nav-btn:hover{border-color:#b86e00;color:#b86e00;background:rgba(184,110,0,0.1);}',
      '#ksNav .nav-btn.green{border-color:rgba(26,122,68,0.5);color:#4db87a;}',
      '#ksNav .nav-btn.green:hover{border-color:#1a7a44;color:#1a7a44;background:rgba(26,122,68,0.1);}',
      '#ksNav .nav-btn.amber{border-color:rgba(184,110,0,0.55);color:#b86e00;}',
      '#ksNav .nav-btn.red{border-color:rgba(192,57,43,0.45);color:#e05a4a;}',
      '#ksNav .nav-btn.red:hover{border-color:#c0392b;color:#c0392b;background:rgba(192,57,43,0.1);}',
      /* Champs de connexion : cachés sur très petit écran */
      '#ksNav .nav-input{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);color:#fff;font-family:var(--f-mono,monospace);font-size:11px;padding:5px 8px;outline:none;width:90px;transition:border-color .2s;flex-shrink:1;min-width:60px;}',
      '#ksNav .nav-input:focus{border-color:#b86e00;}',
      '#ksNav .nav-input::placeholder{color:rgba(255,255,255,0.28);}',
      '@media(max-width:480px){#ksNav .nav-input{display:none;} #ksNav .nav-hide-mobile{display:none;}}',
      /* Panel inscription */
      '#ksNavRegPanel{display:none;position:fixed;top:82px;right:0;left:0;z-index:8999;background:rgba(20,26,38,0.99);border-bottom:1px solid rgba(184,110,0,0.25);padding:16px;box-shadow:0 8px 32px rgba(0,0,0,0.45);}',
      '@media(min-width:480px){#ksNavRegPanel{left:auto;min-width:300px;top:82px;}}',
      '#ksNavRegPanel .nav-input{width:100%;margin-bottom:8px;display:block;box-sizing:border-box;}',
      '#ksNavRegPanel .nav-label{font-size:9px;color:rgba(255,255,255,0.4);letter-spacing:1.5px;text-transform:uppercase;display:block;margin-bottom:3px;}',
      '#ksNavRegPanel .reg-row{display:flex;gap:6px;}',
      /* Offset body : 48px (row1) + 34px (row2) = 82px */
      'body{padding-top:82px !important;}',
      '.auth-input{width:100%;padding:6px 8px;background:var(--surface2,#edf0f5);border:1px solid var(--border,#ccd4e0);font-family:var(--f-body,sans-serif);font-size:13px;color:var(--text,#18202e);outline:none;}',
      '.auth-input:focus{border-color:#b86e00;}',
      '.auth-label{font-size:10px;color:var(--text-dim,#445068);display:block;margin-bottom:2px;font-family:var(--f-mono,monospace);letter-spacing:1px;}',
      '.auth-btn{background:transparent;border:1px solid var(--border,#ccd4e0);color:var(--text-dim,#445068);font-family:var(--f-mono,monospace);font-size:11px;letter-spacing:1px;padding:5px 12px;cursor:pointer;transition:all .2s;white-space:nowrap;}',
      '.auth-btn:hover{background:rgba(184,110,0,.10);border-color:#b86e00;color:#b86e00;}',
      '.ab-row{display:flex;gap:6px;flex-wrap:wrap;align-items:end;}',
      '.ab-field{flex:1;min-width:90px;}',
      '#allianceModal{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;}',
      '.ab-modal-body{background:var(--bg,#f0f3f7);border:1px solid var(--border,#ccd4e0);max-width:600px;width:94%;max-height:85vh;overflow-y:auto;padding:20px;}',
      '.ab-ally-card{background:var(--surface,#fff);border:1px solid var(--border,#ccd4e0);padding:12px;margin-bottom:10px;}',
      '#authBar{display:none !important;}'
    ].join('');
    document.head.appendChild(s);
  }

  // ═══════════════════════════════════════════════════════
  //  UI RENDERING — NAVBAR
  // ═══════════════════════════════════════════════════════

  function showAuthError(msg) {
    var el = document.getElementById('ksNavAuthErr');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ksNavAuthErr';
      el.style.cssText = 'display:none;margin-top:8px;font-size:11px;color:#e05a4a;font-family:var(--f-mono,monospace);letter-spacing:1px;';
      var panel = document.getElementById('ksNavRegPanel');
      if (panel) panel.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(function() { el.style.display = 'none'; }, 4000);
  }

  function getActivePage() {
    var p = location.pathname;
    if (p.includes('bear_calculator')) return 'calc';
    if (p.includes('profile'))         return 'profile';
    if (p.includes('island-guide'))    return 'island';
    if (p.includes('mystic-trial'))    return 'mystic';
    return 'home';
  }

  function navLnk(href, label, key, active) {
    return '<a href="' + href + '" class="nav-link' + (active === key ? ' active' : '') + '">' + label + '</a>';
  }

  function renderAuthUI() {
    var nav = document.getElementById('ksNav');
    if (!nav) return;
    var active = getActivePage();

    var links = ''
      + navLnk('bear_calculator.html', '🐻 Bear Hunt',    'calc',   active)
      + navLnk('island-guide.html',    '🏝 Île Oasis',    'island', active)
      + navLnk('mystic-trial.html',    '🎯 Mystic Trial', 'mystic', active);

    var row2 = '<div class="nav-row2"><div class="nav-links">' + links + '</div></div>';

    if (isLoggedIn()) {
      var u = currentUser;
      var initial = (u.username || '?')[0].toUpperCase();
      var cloudBtns = IS_CALC
        ? '<button onclick="window._auth.saveToCloud()" class="nav-btn green nav-hide-mobile">☁ Sauver</button>'
          + '<button onclick="window._auth.loadFromCloud()" class="nav-btn nav-hide-mobile">☁ Charger</button>'
        : '';
      var allyBtn = u.alliance
        ? '<button onclick="window._auth.openAllianceModal()" class="nav-btn amber nav-hide-mobile">👥 ' + u.alliance + '</button>'
        : '';

      nav.innerHTML = ''
        + '<div class="nav-row1">'
        +   '<a href="index.html" class="nav-logo">Kingshot <span>Help</span></a>'
        +   '<div class="nav-right">'
        +     cloudBtns
        +     allyBtn
        +     '<div class="nav-dot"></div>'
        +     '<a href="profile.html" class="nav-user">'
        +       '<div class="nav-avatar">' + initial + '</div>'
        +       '<div class="nav-userinfo">'
        +         '<span class="nav-username">' + u.username + '</span>'
        +         (u.alliance ? '<span class="nav-alliance">' + u.alliance + '</span>' : '')
        +       '</div>'
        +     '</a>'
        +     '<button onclick="window._auth.doLogout()" class="nav-btn red">Déco</button>'
        +   '</div>'
        + '</div>'
        + row2;

    } else {
      nav.innerHTML = ''
        + '<div class="nav-row1">'
        +   '<a href="index.html" class="nav-logo">Kingshot <span>Help</span></a>'
        +   '<div class="nav-right">'
        +     '<button onclick="window._auth.togglePanel(\'login\')" class="nav-btn green">Connexion</button>'
        +   '</div>'
        + '</div>'
        + row2;
    }
  }

  // ═══════════════════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════════════════

  function init() {
    injectCSS();

    if (!document.getElementById('ksNav')) {
      var nav = document.createElement('nav');
      nav.id = 'ksNav';
      document.body.prepend(nav);
    }

    if (!document.getElementById('ksNavRegPanel')) {
      var panel = document.createElement('div');
      panel.id = 'ksNavRegPanel';
      panel.innerHTML = ''
        /* Onglets */
        + '<div style="display:flex;gap:0;margin-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.1)">'
        +   '<button id="panelTabLogin" onclick="window._auth.switchPanelTab(\'login\')" style="flex:1;background:transparent;border:none;border-bottom:2px solid #1a7a44;color:#fff;font-family:var(--f-mono,monospace);font-size:11px;letter-spacing:1px;text-transform:uppercase;padding:8px;cursor:pointer">Connexion</button>'
        +   '<button id="panelTabReg" onclick="window._auth.switchPanelTab(\'register\')" style="flex:1;background:transparent;border:none;border-bottom:2px solid transparent;color:rgba(255,255,255,0.4);font-family:var(--f-mono,monospace);font-size:11px;letter-spacing:1px;text-transform:uppercase;padding:8px;cursor:pointer">Inscription</button>'
        + '</div>'
        /* Formulaire connexion */
        + '<div id="panelLogin">'
        +   '<div class="reg-row">'
        +     '<div style="flex:1"><label class="nav-label">Pseudo</label><input id="authUser" type="text" class="nav-input" placeholder="ton_pseudo" style="width:100%" onkeydown="if(event.key===\'Enter\')window._auth.doLogin()"></div>'
        +     '<div style="flex:1"><label class="nav-label">Mot de passe</label><input id="authPwd" type="password" class="nav-input" placeholder="••••" style="width:100%" onkeydown="if(event.key===\'Enter\')window._auth.doLogin()"></div>'
        +   '</div>'
        +   '<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">'
        +     '<button onclick="window._auth.closePanelAuth()" class="nav-btn">Annuler</button>'
        +     '<button onclick="window._auth.doLogin()" class="nav-btn green">Se connecter</button>'
        +   '</div>'
        + '</div>'
        /* Formulaire inscription */
        + '<div id="panelRegister" style="display:none">'
        +   '<div class="reg-row">'
        +     '<div style="flex:1"><label class="nav-label">Pseudo</label><input id="authUser2" type="text" class="nav-input" placeholder="ton_pseudo" style="width:100%"></div>'
        +     '<div style="flex:1"><label class="nav-label">Mot de passe</label><input id="authPwd2" type="password" class="nav-input" placeholder="••••" style="width:100%"></div>'
        +   '</div>'
        +   '<div class="reg-row" style="margin-top:8px">'
        +     '<div style="flex:1"><label class="nav-label">Alliance (optionnel)</label><input id="authAlliance" type="text" class="nav-input" placeholder="[TAG]" style="width:100%"></div>'
        +     '<div style="flex:1"><label class="nav-label">Serveur (optionnel)</label><input id="authServer" type="text" class="nav-input" placeholder="S.1507" style="width:100%"></div>'
        +   '</div>'
        +   '<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">'
        +     '<button onclick="window._auth.closePanelAuth()" class="nav-btn">Annuler</button>'
        +     '<button onclick="window._auth.doRegisterNav()" class="nav-btn amber">Créer le compte</button>'
        +   '</div>'
        + '</div>'
        + '<div id="ksNavAuthErr" style="display:none;margin-top:8px;font-size:11px;color:#e05a4a;font-family:var(--f-mono,monospace)"></div>';
      document.body.appendChild(panel);
    }

    renderAuthUI();

    document.addEventListener('click', function(e) {
      var panel = document.getElementById('ksNavRegPanel');
      if (panel && panel.style.display === 'block') {
        if (!panel.contains(e.target) && !document.getElementById('ksNav').contains(e.target)) {
          panel.style.display = 'none';
        }
      }
    });

    if (IS_CALC && typeof window.saveState === 'function') {
      var orig = window.saveState;
      window.saveState = function() {
        orig();
        if (!window._skipCloudSave) scheduleCloudSave();
      };
      window.resetCalc = function() {
        while (window.jCount > 0) {
          document.getElementById('jtab' + window.jCount).remove();
          document.getElementById('jpanel' + window.jCount).remove();
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
      var fromProfile = location.search.includes('fromProfile=1');
      if (fromProfile) {
        // Venir du profil : bloquer cloud saves, recharger l'état sauvegardé
        window._skipCloudSave = true;
        setTimeout(function() {
          if (typeof window.resetCalc === 'function') window.resetCalc();
          if (typeof window.loadState === 'function') window.loadState();
          window._skipCloudSave = false;
        }, 50);
      } else if (isLoggedIn()) {
        setTimeout(loadFromCloud, 300);
      }
    }

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

  function togglePanel(tab) {
    var panel = document.getElementById('ksNavRegPanel');
    if (!panel) return;
    if (panel.style.display === 'block') {
      panel.style.display = 'none';
    } else {
      panel.style.display = 'block';
      switchPanelTab(tab || 'login');
      setTimeout(function() {
        var inp = document.getElementById(tab === 'register' ? 'authUser2' : 'authUser');
        if (inp) inp.focus();
      }, 50);
    }
  }

  function toggleRegister() { togglePanel('register'); }

  function switchPanelTab(tab) {
    var lp = document.getElementById('panelLogin');
    var rp = document.getElementById('panelRegister');
    var tl = document.getElementById('panelTabLogin');
    var tr = document.getElementById('panelTabReg');
    if (!lp) return;
    if (tab === 'login') {
      lp.style.display = ''; rp.style.display = 'none';
      if (tl) { tl.style.borderBottomColor = '#1a7a44'; tl.style.color = '#fff'; }
      if (tr) { tr.style.borderBottomColor = 'transparent'; tr.style.color = 'rgba(255,255,255,0.4)'; }
    } else {
      lp.style.display = 'none'; rp.style.display = '';
      if (tl) { tl.style.borderBottomColor = 'transparent'; tl.style.color = 'rgba(255,255,255,0.4)'; }
      if (tr) { tr.style.borderBottomColor = '#b86e00'; tr.style.color = '#fff'; }
    }
  }

  function closePanelAuth() {
    var panel = document.getElementById('ksNavRegPanel');
    if (panel) panel.style.display = 'none';
  }

  async function doRegisterNav() {
    var sb = getSb();
    if (!sb) { showAuthError('Service indisponible'); return; }
    var username = (document.getElementById('authUser2').value || '').trim().toLowerCase();
    var password = document.getElementById('authPwd2').value || '';
    var alliance = (document.getElementById('authAlliance').value || '').trim();
    var server   = (document.getElementById('authServer').value   || '').trim();
    if (!username || username.length < 3) { showAuthError('Pseudo : 3 caractères minimum'); return; }
    if (!password || password.length < 4) { showAuthError('Mot de passe : 4 caractères minimum'); return; }
    try {
      var hash = await hashPwd(password);
      var res = await sb.from('profiles').insert({ username: username, password: hash, alliance: alliance, server: server }).select('id, username, alliance, server').single();
      if (res.error) { if (res.error.code === '23505') throw new Error('Ce pseudo est déjà pris'); throw new Error(res.error.message); }
      setUser(res.data);
      showToast('Compte créé !', 'ok');
      toggleRegister();
      if (IS_CALC) setTimeout(saveToCloud, 500);
    } catch(e) { showAuthError(e.message); }
  }

  // ═══════════════════════════════════════════════════════
  //  EXPOSER LES FONCTIONS AU GLOBAL
  // ═══════════════════════════════════════════════════════

  window._auth = {
    doLogin:           doLogin,
    doRegister:        doRegister,
    doRegisterNav:     doRegisterNav,
    doLogout:          doLogout,
    saveToCloud:       saveToCloud,
    loadFromCloud:     loadFromCloud,
    openAllianceModal: openAllianceModal,
    openEditProfile:   openEditProfile,
    toggleRegister:    toggleRegister,
    togglePanel:       togglePanel,
    switchPanelTab:    switchPanelTab,
    closePanelAuth:    closePanelAuth
  };

  init();

})();
