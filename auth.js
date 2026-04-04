/* ═══════════════════════════════════════════════════════════
   auth.js — Kingshot Help · Module Supabase partagé
   ═══════════════════════════════════════════════════════════
   Ce fichier gère : connexion, inscription, session,
   sauvegarde/chargement cloud, vue alliance.
   
   Chargé par TOUTES les pages du site.
   ═══════════════════════════════════════════════════════════ */

// ── CONFIG — À REMPLIR ──
const SUPABASE_URL = https://ndusomdjunpvabmwvuqr.supabase.co 'https://XXXXXXX.supabase.co';   // ← ton URL
const SUPABASE_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kdXNvbWRqdW5wdmFibXd2dXFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMzcwNjYsImV4cCI6MjA5MDkxMzA2Nn0.5AD_2hvmJQlPQnum75R1-vrFgxpQXqYBAgHKwuFApsc 'eyJhb.....';                     // ← ta clé anon/public

let _sb = null;

function initSupabase() {
  if (typeof supabase !== 'undefined' && !_sb) {
    _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return _sb;
}

// ═══════════════════════════════════════════════════════════
//  SESSION LOCALE (partagée via localStorage sur tout le domaine)
// ═══════════════════════════════════════════════════════════
let _currentUser = JSON.parse(localStorage.getItem('ksUser') || 'null');
// { id, username, alliance, server }

function isLoggedIn() { return !!_currentUser; }

function setUser(u) {
  _currentUser = u;
  if (u) localStorage.setItem('ksUser', JSON.stringify(u));
  else   localStorage.removeItem('ksUser');
  // Déclencher le rendu UI si la fonction existe (chargée par auth-ui.js)
  if (typeof renderAuthUI === 'function') renderAuthUI();
}

function getCurrentUser() { return _currentUser; }

// ═══════════════════════════════════════════════════════════
//  HASH MOT DE PASSE (SHA-256)
// ═══════════════════════════════════════════════════════════
async function hashPwd(pwd) {
  const buf = await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(pwd + '_kingshot_help_2026'));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// ═══════════════════════════════════════════════════════════
//  INSCRIPTION
// ═══════════════════════════════════════════════════════════
async function authRegister(username, password, alliance, server) {
  initSupabase();
  username = username.trim().toLowerCase();
  if (!username || username.length < 3)
    throw new Error('Pseudo : 3 caractères minimum');
  if (!password || password.length < 4)
    throw new Error('Mot de passe : 4 caractères minimum');

  const hash = await hashPwd(password);

  const { data, error } = await _sb
    .from('profiles')
    .insert({
      username,
      password: hash,
      alliance: (alliance || '').trim(),
      server:   (server || '').trim()
    })
    .select('id, username, alliance, server')
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('Ce pseudo est déjà pris');
    throw new Error(error.message);
  }
  setUser(data);
  return data;
}

// ═══════════════════════════════════════════════════════════
//  CONNEXION
// ═══════════════════════════════════════════════════════════
async function authLogin(username, password) {
  initSupabase();
  username = username.trim().toLowerCase();
  const hash = await hashPwd(password);

  const { data, error } = await _sb
    .from('profiles')
    .select('id, username, alliance, server')
    .eq('username', username)
    .eq('password', hash)
    .single();

  if (error || !data) throw new Error('Pseudo ou mot de passe incorrect');
  setUser(data);
  return data;
}

// ═══════════════════════════════════════════════════════════
//  DÉCONNEXION
// ═══════════════════════════════════════════════════════════
function authLogout() {
  setUser(null);
  showToast('Déconnecté', 'info');
}

// ═══════════════════════════════════════════════════════════
//  MISE À JOUR PROFIL (alliance, serveur)
// ═══════════════════════════════════════════════════════════
async function authUpdateProfile(fields) {
  initSupabase();
  if (!isLoggedIn()) return;
  const { error } = await _sb
    .from('profiles')
    .update(fields)
    .eq('id', _currentUser.id);
  if (error) throw error;
  Object.assign(_currentUser, fields);
  localStorage.setItem('ksUser', JSON.stringify(_currentUser));
  if (typeof renderAuthUI === 'function') renderAuthUI();
}

// ═══════════════════════════════════════════════════════════
//  SAUVEGARDE CLOUD (pour le calculateur)
// ═══════════════════════════════════════════════════════════
let _cloudSaveTimer = null;

async function saveToCloud() {
  initSupabase();
  if (!isLoggedIn()) return;
  const raw = localStorage.getItem('bearCalcState');
  if (!raw) { showToast('Rien à sauvegarder', 'info'); return; }

  try {
    const { error } = await _sb
      .from('profiles')
      .update({ calc_state: JSON.parse(raw) })
      .eq('id', _currentUser.id);
    if (error) throw error;
    showToast('☁️ Sauvegardé', 'ok');
  } catch (e) {
    console.error('Cloud save error:', e);
    showToast('Erreur sauvegarde cloud', 'err');
  }
}

function scheduleCloudSave() {
  if (!isLoggedIn()) return;
  clearTimeout(_cloudSaveTimer);
  _cloudSaveTimer = setTimeout(saveToCloud, 5000);
}

// ═══════════════════════════════════════════════════════════
//  CHARGEMENT CLOUD (pour le calculateur)
// ═══════════════════════════════════════════════════════════
async function loadFromCloud() {
  initSupabase();
  if (!isLoggedIn()) return false;

  try {
    const { data, error } = await _sb
      .from('profiles')
      .select('calc_state')
      .eq('id', _currentUser.id)
      .single();

    if (error) throw error;
    if (data?.calc_state && Object.keys(data.calc_state).length > 0) {
      localStorage.setItem('bearCalcState', JSON.stringify(data.calc_state));
      // Si on est sur le calculateur, recharger l'UI
      if (typeof resetCalc === 'function' && typeof loadState === 'function') {
        resetCalc();
        loadState();
      }
      showToast('☁️ Profil chargé', 'ok');
      return true;
    }
  } catch (e) {
    console.error('Cloud load error:', e);
  }
  return false;
}

// ═══════════════════════════════════════════════════════════
//  ALLIANCE — Voir les membres
// ═══════════════════════════════════════════════════════════
async function fetchAllianceMembers() {
  initSupabase();
  if (!isLoggedIn() || !_currentUser.alliance) return [];

  const { data, error } = await _sb
    .from('alliance_members')
    .select('*')
    .eq('alliance', _currentUser.alliance);

  if (error) { showToast('Erreur chargement alliance', 'err'); return []; }
  return data || [];
}

// ═══════════════════════════════════════════════════════════
//  TOAST (notification visuelle)
// ═══════════════════════════════════════════════════════════
function showToast(msg, type) {
  let t = document.getElementById('ksToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'ksToast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
      'padding:10px 20px;border-radius:4px;font-family:var(--f-mono);font-size:12px;' +
      'letter-spacing:1px;z-index:9999;transition:opacity .4s;pointer-events:none;opacity:0';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  const colors = { ok: 'var(--green)', err: 'var(--red)', info: 'var(--amber)' };
  t.style.background = colors[type] || colors.info;
  t.style.color = '#fff';
  t.style.opacity = '1';
  clearTimeout(t._t);
  t._t = setTimeout(() => t.style.opacity = '0', 2500);
}
