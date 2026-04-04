/* ═══════════════════════════════════════════════════════════
   auth-ui.js — Kingshot Help · Barre d'authentification
   ═══════════════════════════════════════════════════════════
   Injecte la barre login/profil sous le header .hdr
   S'adapte selon la page (calculateur = boutons cloud)
   ═══════════════════════════════════════════════════════════ */

// Détection de la page courante
const _isCalcPage = location.pathname.includes('bear_calculator');

// ═══════════════════════════════════════════════════════════
//  CSS
// ═══════════════════════════════════════════════════════════
(function injectAuthCSS() {
  const s = document.createElement('style');
  s.textContent = `
    #authBar {
      margin-top: 16px;
      padding: 14px 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      font-family: var(--f-body);
      font-size: 13px;
      animation: fadeUp .3s ease both .05s;
    }
    .auth-btn {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-dim);
      font-family: var(--f-mono);
      font-size: 11px;
      letter-spacing: 1px;
      padding: 5px 12px;
      cursor: pointer;
      transition: all .2s;
      white-space: nowrap;
    }
    .auth-btn:hover {
      background: var(--amber-glow);
      border-color: var(--amber);
      color: var(--amber);
    }
    .auth-input {
      width: 100%;
      padding: 6px 8px;
      background: var(--surface2);
      border: 1px solid var(--border);
      font-family: var(--f-body);
      font-size: 13px;
      color: var(--text);
    }
    .auth-input:focus {
      outline: none;
      border-color: var(--amber);
    }
    .auth-label {
      font-size: 10px;
      color: var(--text-dim);
      display: block;
      margin-bottom: 2px;
      font-family: var(--f-mono);
      letter-spacing: 1px;
    }
    .auth-row {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      align-items: end;
    }
    .auth-field { flex: 1; min-width: 90px; }
    #allianceModal {
      position: fixed; inset: 0; z-index: 9998;
      background: rgba(0,0,0,.5);
      display: flex; align-items: center; justify-content: center;
      animation: fadeUp .2s ease;
    }
    #allianceModal .modal-body {
      background: var(--bg);
      border: 1px solid var(--border);
      max-width: 500px; width: 90%;
      max-height: 80vh; overflow-y: auto;
      padding: 20px;
    }
    .ally-card {
      background: var(--surface);
      border: 1px solid var(--border);
      padding: 12px;
      margin-bottom: 8px;
    }
  `;
  document.head.appendChild(s);
})();

// ═══════════════════════════════════════════════════════════
//  INJECTION DU CONTENEUR
// ═══════════════════════════════════════════════════════════
function injectAuthBar() {
  const hdr = document.querySelector('.hdr');
  if (!hdr || document.getElementById('authBar')) return;
  const bar = document.createElement('div');
  bar.id = 'authBar';
  hdr.after(bar);
  renderAuthUI();
}

// ═══════════════════════════════════════════════════════════
//  RENDU PRINCIPAL
// ═══════════════════════════════════════════════════════════
function renderAuthUI() {
  const bar = document.getElementById('authBar');
  if (!bar) return;

  if (isLoggedIn()) {
    renderLoggedIn(bar);
  } else {
    renderLoggedOut(bar);
  }
}

// ── ÉTAT CONNECTÉ ──
function renderLoggedIn(bar) {
  const u = getCurrentUser();

  // Boutons cloud uniquement sur la page calculateur
  const cloudBtns = _isCalcPage
    ? `<button onclick="saveToCloud()" class="auth-btn" style="border-color:var(--green);color:var(--green)">☁ Sauver</button>
       <button onclick="loadFromCloud()" class="auth-btn">☁ Charger</button>`
    : '';

  const allianceBtn = u.alliance
    ? `<button onclick="openAllianceModal()" class="auth-btn" style="border-color:var(--amber);color:var(--amber)">👥 Alliance</button>`
    : '';

  bar.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-family:var(--f-mono);font-size:10px;color:var(--green);letter-spacing:2px">● ONLINE</span>
        <strong style="font-size:14px">${u.username}</strong>
        ${u.alliance ? `<span style="font-family:var(--f-mono);font-size:11px;color:var(--amber)">${u.alliance}</span>` : ''}
        ${u.server ? `<span style="font-family:var(--f-mono);font-size:10px;color:var(--text-faint)">${u.server}</span>` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${cloudBtns}
        ${allianceBtn}
        <button onclick="openEditProfile()" class="auth-btn">⚙ Profil</button>
        <button onclick="authLogout()" class="auth-btn" style="border-color:var(--red);color:var(--red)">Déco</button>
      </div>
    </div>`;
}

// ── ÉTAT DÉCONNECTÉ ──
function renderLoggedOut(bar) {
  bar.innerHTML = `
    <div style="font-family:var(--f-mono);font-size:10px;color:var(--text-faint);letter-spacing:2px;margin-bottom:10px">
      COMPTE · SAUVEGARDE CLOUD
    </div>
    <div class="auth-row">
      <div class="auth-field">
        <label class="auth-label">Pseudo</label>
        <input id="authUser" type="text" class="auth-input" placeholder="ton pseudo"
               onkeydown="if(event.key==='Enter')doLogin()">
      </div>
      <div class="auth-field">
        <label class="auth-label">Mot de passe</label>
        <input id="authPwd" type="password" class="auth-input" placeholder="••••"
               onkeydown="if(event.key==='Enter')doLogin()">
      </div>
      <button onclick="doLogin()" class="auth-btn" style="border-color:var(--green);color:var(--green);padding:6px 14px">
        Connexion
      </button>
      <button onclick="toggleRegister()" class="auth-btn" style="padding:6px 14px">
        Inscription
      </button>
    </div>

    <div id="authRegExtra" style="display:none;margin-top:10px">
      <div class="auth-row">
        <div class="auth-field">
          <label class="auth-label">Alliance (optionnel)</label>
          <input id="authAlliance" type="text" class="auth-input" placeholder="[TAG]">
        </div>
        <div class="auth-field">
          <label class="auth-label">Serveur (optionnel)</label>
          <input id="authServer" type="text" class="auth-input" placeholder="S.1507">
        </div>
        <button onclick="doRegister()" class="auth-btn"
                style="border-color:var(--amber);color:var(--amber);padding:6px 14px">
          Créer le compte
        </button>
      </div>
    </div>

    <div id="authError" style="display:none;margin-top:8px;font-size:12px;color:var(--red)"></div>`;
}

// ═══════════════════════════════════════════════════════════
//  ACTIONS
// ═══════════════════════════════════════════════════════════
function toggleRegister() {
  const el = document.getElementById('authRegExtra');
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function showAuthError(msg) {
  const el = document.getElementById('authError');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 4000);
}

async function doLogin() {
  try {
    await authLogin(
      document.getElementById('authUser')?.value || '',
      document.getElementById('authPwd')?.value || ''
    );
    showToast('Connecté !', 'ok');
    // Si on est sur le calculateur, charger le profil cloud
    if (_isCalcPage) loadFromCloud();
  } catch (e) {
    showAuthError(e.message);
  }
}

async function doRegister() {
  try {
    await authRegister(
      document.getElementById('authUser')?.value || '',
      document.getElementById('authPwd')?.value || '',
      document.getElementById('authAlliance')?.value || '',
      document.getElementById('authServer')?.value || ''
    );
    showToast('Compte créé !', 'ok');
    // Si on est sur le calculateur, sauver l'état actuel
    if (_isCalcPage) setTimeout(saveToCloud, 500);
  } catch (e) {
    showAuthError(e.message);
  }
}

// ═══════════════════════════════════════════════════════════
//  EDIT PROFIL (prompt simple)
// ═══════════════════════════════════════════════════════════
async function openEditProfile() {
  const u = getCurrentUser();
  const alliance = prompt('Tag alliance :', u.alliance || '');
  if (alliance === null) return;
  const server = prompt('Serveur :', u.server || '');
  if (server === null) return;

  try {
    await authUpdateProfile({
      alliance: alliance.trim(),
      server: (server || '').trim()
    });
    showToast('Profil mis à jour', 'ok');
  } catch (e) {
    showToast('Erreur : ' + e.message, 'err');
  }
}

// ═══════════════════════════════════════════════════════════
//  ALLIANCE MODAL
// ═══════════════════════════════════════════════════════════
async function openAllianceModal() {
  const u = getCurrentUser();
  if (!u?.alliance) {
    showToast('Renseigne ton alliance dans le profil', 'info');
    return;
  }

  // Créer le modal
  let modal = document.getElementById('allianceModal');
  if (modal) modal.remove();
  modal = document.createElement('div');
  modal.id = 'allianceModal';
  modal.onclick = e => { if (e.target === modal) modal.remove(); };

  modal.innerHTML = `
    <div class="modal-body">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div>
          <div style="font-family:var(--f-mono);font-size:10px;color:var(--amber);letter-spacing:2px">ALLIANCE</div>
          <div style="font-family:var(--f-display);font-size:1.4rem;font-weight:800;text-transform:uppercase">${u.alliance}</div>
        </div>
        <button onclick="document.getElementById('allianceModal').remove()" class="auth-btn">✕ Fermer</button>
      </div>
      <div id="allyList" style="font-size:13px;color:var(--text-dim)">Chargement…</div>
    </div>`;
  document.body.appendChild(modal);

  // Charger les membres
  const members = await fetchAllianceMembers();
  const list = document.getElementById('allyList');
  if (!list) return;

  if (members.length === 0) {
    list.innerHTML = 'Aucun membre trouvé.';
    return;
  }

  let html = `<div style="font-family:var(--f-mono);font-size:10px;color:var(--text-faint);margin-bottom:8px">${members.length} MEMBRE(S)</div>`;

  for (const m of members) {
    const stocks = [
      m.stock_inf ? `INF ${Number(m.stock_inf).toLocaleString()}` : null,
      m.stock_cav ? `CAV ${Number(m.stock_cav).toLocaleString()}` : null,
      m.stock_arc ? `ARC ${Number(m.stock_arc).toLocaleString()}` : null,
    ].filter(Boolean).join(' · ');

    const heroNames = (m.heroes || [])
      .map(h => h.heroKey)
      .filter(Boolean)
      .map(k => k.charAt(0).toUpperCase() + k.slice(1))
      .join(', ');

    const lead = m.lead_cap ? `Lead ${Number(m.lead_cap).toLocaleString()}` : '';
    const updated = m.updated_at
      ? new Date(m.updated_at).toLocaleDateString('fr-FR', { day:'numeric', month:'short' })
      : '';
    const isMe = m.username === u.username;

    html += `
    <div class="ally-card" ${isMe ? 'style="border-left:3px solid var(--amber)"' : ''}>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong style="font-family:var(--f-display);font-size:1.1rem;letter-spacing:1px;text-transform:uppercase">
          ${m.username} ${isMe ? '<span style="font-size:10px;color:var(--amber)">(toi)</span>' : ''}
        </strong>
        <span style="font-family:var(--f-mono);font-size:9px;color:var(--text-faint)">${updated}</span>
      </div>
      ${stocks ? `<div style="font-size:12px;color:var(--text-dim);margin-top:4px">${stocks}${lead ? ' · ' + lead : ''}</div>` : ''}
      ${heroNames ? `<div style="font-size:11px;color:var(--text-faint);margin-top:2px">Héros : ${heroNames}</div>` : ''}
    </div>`;
  }

  list.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════
//  INIT — Injection automatique au chargement
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  injectAuthBar();
});

// Si le DOM est déjà ready (script chargé en defer/bas de page)
if (document.readyState !== 'loading') {
  injectAuthBar();
}
