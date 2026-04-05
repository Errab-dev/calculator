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
      var res = await sb.from('profiles').select('calc_state, bonus_stats, heroes_data').eq('id', currentUser.id).single();
      if (res.error) throw res.error;
      // Charger les bonus stats dans localStorage pour le calculateur
      if (res.data?.bonus_stats && Object.keys(res.data.bonus_stats).length > 0) {
        localStorage.setItem('bearBonusStats', JSON.stringify(res.data.bonus_stats));
      }
      if (res.data?.heroes_data && Object.keys(res.data.heroes_data).length > 0) {
        localStorage.setItem('bearHeroesData', JSON.stringify(res.data.heroes_data));
      }
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
      /* ── NAVBAR ── */
      '#ksNav{position:fixed;top:0;left:0;right:0;z-index:9000;height:48px;background:rgba(24,32,46,0.97);backdrop-filter:blur(12px);border-bottom:1px solid rgba(184,110,0,0.25);display:flex;align-items:center;padding:0 16px;font-family:var(--f-mono,monospace);box-shadow:0 2px 20px rgba(0,0,0,0.25);}',
      '#ksNav .nav-logo{font-family:var(--f-display,"Barlow Condensed",sans-serif);font-size:1.2rem;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#fff;text-decoration:none;white-space:nowrap;flex-shrink:0;}',
      '#ksNav .nav-logo span{color:#b86e00;}',
      '#ksNav .nav-right{display:flex;align-items:center;gap:8px;margin-left:auto;flex-shrink:0;}',
      '#ksNav .nav-dot{width:7px;height:7px;background:#1a7a44;border-radius:50%;flex-shrink:0;}',
      '#ksNav .nav-user{display:flex;align-items:center;gap:7px;text-decoration:none;flex-shrink:0;}',
      '#ksNav .nav-avatar{width:26px;height:26px;background:rgba(184,110,0,0.2);border:1px solid rgba(184,110,0,0.5);display:flex;align-items:center;justify-content:center;font-family:var(--f-display,"Barlow Condensed",sans-serif);font-size:.9rem;font-weight:900;color:#b86e00;text-transform:uppercase;flex-shrink:0;}',
      '#ksNav .nav-userinfo{display:flex;flex-direction:column;line-height:1.2;}',
      '#ksNav .nav-username{font-size:12px;color:#fff;font-weight:600;letter-spacing:.5px;white-space:nowrap;}',
      '#ksNav .nav-alliance{font-size:9px;color:rgba(184,110,0,0.8);letter-spacing:1px;}',
      /* Bouton hamburger */
      '#ksNav .nav-burger{background:transparent;border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.8);font-size:16px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:all .2s;}',
      '#ksNav .nav-burger:hover{border-color:#b86e00;color:#b86e00;}',
      /* Boutons inline */
      '#ksNav .nav-btn{background:transparent;border:1px solid rgba(255,255,255,0.18);color:rgba(255,255,255,0.65);font-family:var(--f-mono,monospace);font-size:10px;letter-spacing:1px;text-transform:uppercase;padding:5px 9px;cursor:pointer;transition:all .2s;white-space:nowrap;text-decoration:none;display:inline-block;flex-shrink:0;}',
      '#ksNav .nav-btn:hover{border-color:#b86e00;color:#b86e00;background:rgba(184,110,0,0.1);}',
      '#ksNav .nav-btn.green{border-color:rgba(26,122,68,0.5);color:#4db87a;}',
      '#ksNav .nav-btn.green:hover{border-color:#1a7a44;color:#1a7a44;background:rgba(26,122,68,0.1);}',
      '#ksNav .nav-input{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);color:#fff;font-family:var(--f-mono,monospace);font-size:11px;padding:5px 8px;outline:none;width:90px;transition:border-color .2s;flex-shrink:1;min-width:60px;}',
      '#ksNav .nav-input:focus{border-color:#b86e00;}',
      '#ksNav .nav-input::placeholder{color:rgba(255,255,255,0.28);}',
      /* Menu déroulant hamburger */
      '#ksNavMenu{display:none;position:fixed;top:48px;right:0;z-index:8999;background:rgba(20,26,38,0.99);backdrop-filter:blur(12px);border-left:1px solid rgba(184,110,0,0.2);border-bottom:1px solid rgba(184,110,0,0.2);min-width:220px;box-shadow:-4px 4px 24px rgba(0,0,0,0.4);}',
      '#ksNavMenu .mn-section{padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);}',
      '#ksNavMenu .mn-section:last-child{border-bottom:none;}',
      '#ksNavMenu .mn-label{font-size:9px;color:rgba(255,255,255,0.28);letter-spacing:2px;text-transform:uppercase;padding:6px 16px 2px;}',
      '#ksNavMenu .mn-item{display:flex;align-items:center;gap:10px;width:100%;padding:10px 16px;background:transparent;border:none;color:rgba(255,255,255,0.75);font-family:var(--f-mono,monospace);font-size:11px;letter-spacing:.5px;text-decoration:none;cursor:pointer;transition:background .15s,color .15s;text-align:left;box-sizing:border-box;}',
      '#ksNavMenu .mn-item:hover{background:rgba(255,255,255,0.06);color:#fff;}',
      '#ksNavMenu .mn-item.amber{color:#b86e00;}',
      '#ksNavMenu .mn-item.amber:hover{background:rgba(184,110,0,0.1);}',
      '#ksNavMenu .mn-item.red{color:#e05a4a;}',
      '#ksNavMenu .mn-item.red:hover{background:rgba(192,57,43,0.1);color:#ff6b5a;}',
      '#ksNavMenu .mn-item.green{color:#4db87a;}',
      '#ksNavMenu .mn-item.green:hover{background:rgba(26,122,68,0.1);}',
      '#ksNavMenu .mn-user-block{padding:12px 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid rgba(255,255,255,0.06);}',
      '#ksNavMenu .mn-avatar{width:32px;height:32px;background:rgba(184,110,0,0.2);border:1px solid rgba(184,110,0,0.5);display:flex;align-items:center;justify-content:center;font-family:var(--f-display,"Barlow Condensed",sans-serif);font-size:1rem;font-weight:900;color:#b86e00;text-transform:uppercase;flex-shrink:0;}',
      '#ksNavMenu .mn-uname{font-size:13px;color:#fff;font-weight:600;}',
      '#ksNavMenu .mn-ualliance{font-size:10px;color:rgba(184,110,0,0.8);letter-spacing:1px;}',
      /* Modale connexion overlay */
      '#ksNavRegPanel{display:none;position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);align-items:center;justify-content:center;padding:16px;}',
      '#ksNavRegPanel.open{display:flex;}',
      '#ksNavRegPanel .login-box{background:rgba(20,26,38,0.99);border:1px solid rgba(184,110,0,0.3);border-top:2px solid #b86e00;width:100%;max-width:320px;padding:24px;box-shadow:0 24px 64px rgba(0,0,0,0.6);}',
      '#ksNavRegPanel .login-title{font-family:var(--f-display,"Barlow Condensed",sans-serif);font-size:1.5rem;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#fff;margin-bottom:2px;}',
      '#ksNavRegPanel .login-sub{font-family:var(--f-mono,monospace);font-size:9px;color:rgba(255,255,255,0.3);letter-spacing:2px;text-transform:uppercase;margin-bottom:18px;}',
      '#ksNavRegPanel .login-tabs{display:flex;border-bottom:1px solid rgba(255,255,255,0.1);margin-bottom:16px;}',
      '#ksNavRegPanel .login-tab{flex:1;background:transparent;border:none;border-bottom:2px solid transparent;color:rgba(255,255,255,0.3);font-family:var(--f-mono,monospace);font-size:10px;letter-spacing:1px;text-transform:uppercase;padding:8px;cursor:pointer;margin-bottom:-1px;transition:color .15s,border-color .15s;}',
      '#ksNavRegPanel .login-tab.active{color:#4db87a;border-bottom-color:#4db87a;}',
      '#ksNavRegPanel .nav-label{font-family:var(--f-mono,monospace);font-size:9px;color:rgba(255,255,255,0.35);letter-spacing:1.5px;text-transform:uppercase;display:block;margin-bottom:4px;}',
      '#ksNavRegPanel .nav-input{width:100%;padding:9px 10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#fff;font-family:var(--f-body,sans-serif);font-size:14px;outline:none;margin-bottom:10px;display:block;box-sizing:border-box;transition:border-color .2s;}',
      '#ksNavRegPanel .nav-input:focus{border-color:#b86e00;}',
      '#ksNavRegPanel .nav-input::placeholder{color:rgba(255,255,255,0.2);}',
      '#ksNavRegPanel .reg-row{display:flex;gap:8px;}',
      '#ksNavRegPanel .reg-row>div{flex:1;}',
      '#ksNavRegPanel .login-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:4px;}',
      '#ksNavRegPanel .login-btn{background:transparent;border:1px solid rgba(255,255,255,0.18);color:rgba(255,255,255,0.5);font-family:var(--f-mono,monospace);font-size:10px;letter-spacing:1px;text-transform:uppercase;padding:8px 14px;cursor:pointer;transition:all .2s;}',
      '#ksNavRegPanel .login-btn:hover{border-color:rgba(255,255,255,0.4);color:#fff;}',
      '#ksNavRegPanel .login-btn.primary{border-color:rgba(26,122,68,0.6);color:#4db87a;background:rgba(26,122,68,0.1);}',
      '#ksNavRegPanel .login-btn.primary:hover{background:rgba(26,122,68,0.2);}',
      '#ksNavAuthErr{display:none;margin-top:10px;font-size:11px;color:#e05a4a;font-family:var(--f-mono,monospace);letter-spacing:.5px;}',
      /* body offset */
      'body{padding-top:48px !important;}',
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
    if (p.includes('alliance'))        return 'alliance';
    return 'home';
  }

  function renderAuthUI() {
    var nav = document.getElementById('ksNav');
    if (!nav) return;

    if (isLoggedIn()) {
      var u = currentUser;
      var initial = (u.username || '?')[0].toUpperCase();
      var cloudBtns = IS_CALC
        ? '<button onclick="window._auth.saveToCloud()" class="nav-btn green">☁ Sauver</button>'
        : '';

      nav.innerHTML = ''
        + '<a href="index.html" class="nav-logo">Kingshot <span>Help</span></a>'
        + '<div class="nav-right">'
        +   cloudBtns
        +   '<div class="nav-dot"></div>'
        +   '<a href="profile.html" class="nav-user">'
        +     '<div class="nav-avatar">' + initial + '</div>'
        +     '<div class="nav-userinfo">'
        +       '<span class="nav-username">' + u.username + '</span>'
        +       (u.alliance ? '<span class="nav-alliance">' + u.alliance + '</span>' : '')
        +     '</div>'
        +   '</a>'
        +   '<button class="nav-burger" onclick="window._auth.toggleMenu()">☰</button>'
        + '</div>';
    } else {
      nav.innerHTML = ''
        + '<a href="index.html" class="nav-logo">Kingshot <span>Help</span></a>'
        + '<div class="nav-right">'
        +   '<button onclick="window._auth.togglePanel(\'login\')" class="nav-btn green">Connexion</button>'
        +   '<button class="nav-burger" onclick="window._auth.toggleMenu()">☰</button>'
        + '</div>';
    }
    buildMenu();
  }

  function buildMenu() {
    var menu = document.getElementById('ksNavMenu');
    if (!menu) return;
    var active = getActivePage();

    function mi(href, icon, label, key) {
      return '<a href="' + href + '" class="mn-item' + (active === key ? ' amber' : '') + '" onclick="window._auth.closeMenu()">'
        + '<span>' + icon + '</span><span>' + label + '</span></a>';
    }

    if (isLoggedIn()) {
      var u = currentUser;
      var initial = (u.username || '?')[0].toUpperCase();
      var cloudSection = IS_CALC
        ? '<div class="mn-section">'
          + '<button onclick="window._auth.saveToCloud();window._auth.closeMenu();" class="mn-item green"><span>☁</span><span>Sauvegarder</span></button>'
          + '<button onclick="window._auth.loadFromCloud();window._auth.closeMenu();" class="mn-item"><span>☁</span><span>Charger depuis le cloud</span></button>'
          + '</div>'
        : '';
      var allySection = u.alliance
        ? '<button onclick="window._auth.openAllianceModal();window._auth.closeMenu();" class="mn-item amber"><span>👥</span><span>' + u.alliance + ' — Alliance</span></button>'
        : '';

      menu.innerHTML = ''
        + '<div class="mn-user-block">'
        +   '<div class="mn-avatar">' + initial + '</div>'
        +   '<div><div class="mn-uname">' + u.username + '</div>'
        +   (u.alliance ? '<div class="mn-ualliance">' + u.alliance + (u.server ? ' · ' + u.server : '') + '</div>' : '')
        +   '</div>'
        + '</div>'
        + '<div class="mn-section">'
        +   '<div class="mn-label">Navigation</div>'
        +   mi('index.html',           '🏠', 'Accueil',      'home')
        +   mi('bear_calculator.html', '🐻', 'Bear Hunt',    'calc')
        +   mi('island-guide.html',    '🏝', 'Île Oasis',    'island')
        +   mi('mystic-trial.html',    '🎯', 'Mystic Trial', 'mystic')
        + '</div>'
        + '<div class="mn-section">'
        +   '<div class="mn-label">Mon compte</div>'
        +   mi('profile.html',  '👤', 'Mon profil',  'profile')
        +   mi('alliance.html', '🏰', 'Mon alliance', 'alliance')
        +   allySection
        + '</div>'
        + cloudSection
        + '<div class="mn-section">'
        +   '<button onclick="window._auth.doLogout()" class="mn-item red"><span>⏻</span><span>Déconnexion</span></button>'
        + '</div>';

    } else {
      menu.innerHTML = ''
        + '<div class="mn-section">'
        +   '<div class="mn-label">Navigation</div>'
        +   mi('index.html',           '🏠', 'Accueil',      'home')
        +   mi('bear_calculator.html', '🐻', 'Bear Hunt',    'calc')
        +   mi('island-guide.html',    '🏝', 'Île Oasis',    'island')
        +   mi('mystic-trial.html',    '🎯', 'Mystic Trial', 'mystic')
        + '</div>'
        + '<div class="mn-section">'
        +   '<button onclick="window._auth.togglePanel(\'login\');window._auth.closeMenu();" class="mn-item green"><span>→</span><span>Connexion</span></button>'
        + '</div>';
    }
  }

  function toggleMenu() {
    var menu = document.getElementById('ksNavMenu');
    if (!menu) return;
    var open = menu.style.display === 'block';
    menu.style.display = open ? 'none' : 'block';
    var burger = document.querySelector('#ksNav .nav-burger');
    if (burger) burger.textContent = open ? '☰' : '✕';
  }

  function closeMenu() {
    var menu = document.getElementById('ksNavMenu');
    if (menu) menu.style.display = 'none';
    var burger = document.querySelector('#ksNav .nav-burger');
    if (burger) burger.textContent = '☰';
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
    if (!document.getElementById('ksNavMenu')) {
      var menu = document.createElement('div');
      menu.id = 'ksNavMenu';
      menu.style.display = 'none';
      document.body.appendChild(menu);
    }

    if (!document.getElementById('ksNavRegPanel')) {
      var panel = document.createElement('div');
      panel.id = 'ksNavRegPanel';
      panel.style.display = 'none';
      // Fermer si clic sur l'overlay
      panel.addEventListener('click', function(e) {
        if (e.target === panel) window._auth.closePanelAuth();
      });
      panel.innerHTML = ''
        + '<div class="login-box">'
        +   '<div class="login-title">Connexion</div>'
        +   '<div class="login-sub">// Kingshot Help</div>'
        +   '<div class="login-tabs">'
        +     '<button id="panelTabLogin" class="login-tab active" onclick="window._auth.switchPanelTab(\'login\')">Connexion</button>'
        +     '<button id="panelTabReg"   class="login-tab"        onclick="window._auth.switchPanelTab(\'register\')">Inscription</button>'
        +   '</div>'
        +   '<div id="panelLogin">'
        +     '<label class="nav-label">Pseudo</label>'
        +     '<input id="authUser" type="text" class="nav-input" placeholder="ton_pseudo" onkeydown="if(event.key===\'Enter\')window._auth.doLogin()">'
        +     '<label class="nav-label">Mot de passe</label>'
        +     '<input id="authPwd" type="password" class="nav-input" placeholder="••••" onkeydown="if(event.key===\'Enter\')window._auth.doLogin()">'
        +     '<div class="login-actions">'
        +       '<button onclick="window._auth.closePanelAuth()" class="login-btn">Annuler</button>'
        +       '<button onclick="window._auth.doLogin()" class="login-btn primary">Se connecter</button>'
        +     '</div>'
        +   '</div>'
        +   '<div id="panelRegister" style="display:none">'
        +     '<div class="reg-row">'
        +       '<div><label class="nav-label">Pseudo</label><input id="authUser2" type="text" class="nav-input" placeholder="ton_pseudo"></div>'
        +       '<div><label class="nav-label">Mot de passe</label><input id="authPwd2" type="password" class="nav-input" placeholder="••••"></div>'
        +     '</div>'
        +     '<div class="reg-row">'
        +       '<div><label class="nav-label">Alliance (optionnel)</label><input id="authAlliance" type="text" class="nav-input" placeholder="[TAG]"></div>'
        +       '<div><label class="nav-label">Serveur (optionnel)</label><input id="authServer" type="text" class="nav-input" placeholder="S.1507"></div>'
        +     '</div>'
        +     '<div class="login-actions">'
        +       '<button onclick="window._auth.closePanelAuth()" class="login-btn">Annuler</button>'
        +       '<button onclick="window._auth.doRegisterNav()" class="login-btn primary">Créer le compte</button>'
        +     '</div>'
        +   '</div>'
        +   '<div id="ksNavAuthErr"></div>'
        + '</div>';
      document.body.appendChild(panel);
    }

    renderAuthUI();

    document.addEventListener('click', function(e) {
      // Panel connexion : fermeture gérée par l'overlay lui-même (clic sur fond)
      var mnu = document.getElementById('ksNavMenu');
      if (mnu && mnu.style.display === 'block') {
        if (!mnu.contains(e.target) && !document.getElementById('ksNav').contains(e.target)) {
          closeMenu();
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
        // Priorité : sessionStorage écrit par profile.html
        var profileData = sessionStorage.getItem('bearCalcLoad');
        if (profileData) {
          localStorage.setItem('bearCalcState', profileData);
          sessionStorage.removeItem('bearCalcLoad');
        }
        // Bloquer cloud saves et recharger
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
    if (panel.classList.contains('open')) {
      panel.classList.remove('open');
      panel.style.display = 'none';
    } else {
      panel.style.display = '';
      panel.classList.add('open');
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
    if (panel) { panel.classList.remove('open'); panel.style.display = 'none'; }
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
    closePanelAuth:    closePanelAuth,
    toggleMenu:        toggleMenu,
    closeMenu:         closeMenu,
    buildMenu:         buildMenu
  };

  init();

})();
