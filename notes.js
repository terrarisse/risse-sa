/* Risse S.A. — Notes rapides (popup global)
   Un seul fichier, chargé par chaque module :
   <script type="module" src="../notes.js"></script>   (./notes.js depuis la racine)
   - Bouton 📝 ajouté à côté de la calculatrice (ou bouton flottant s'il n'y en a pas)
   - Notes en liste à cocher ou en texte libre
   - Synchronisées sur les appareils du compte (Firestore notes_perso/{uid})
   - Option « Partager avec l'équipe » par note (Firestore notes_equipe/data)
   - Lien optionnel vers un chantier
*/
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

(function () {
  if (window.__risseNotes) return;
  window.__risseNotes = true;
  if (/login\.html/.test(location.pathname)) return;
  if (window.self !== window.top) return; // pas dans les iframes (ex. plan)
  if (window.firebase) return; // page à SDK « compat » (accueil) : on n'y mélange pas un 2e SDK

  const CONFIG = {
    apiKey: "AIzaSyA5Zk0TBr_Qr4_12CO8_x8oymsxO7u6IEE",
    authDomain: "risse-sa.firebaseapp.com",
    projectId: "risse-sa",
    storageBucket: "risse-sa.firebasestorage.app",
    messagingSenderId: "656425275771",
    appId: "1:656425275771:web:b82c58557e41e6d1deadde"
  };
  const CACHE_KEY = 'rn_notes_cache_v1';
  const TOMBSTONE_MS = 30 * 24 * 3600 * 1000;

  let db = null, user = null, unsubs = [];
  let perso = [], equipe = [];           // notes brutes (avec supprimées)
  let view = 'list', filter = 'all', curId = null, saveTimer = null;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid8 = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const now = () => Date.now();

  /* ───────── CSS ───────── */
  const css = `
  .rn-btn{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.12);border:none;color:#fff;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative}
  .rn-btn:active{background:rgba(255,255,255,.25)}
  .rn-fab{position:fixed;right:14px;bottom:calc(env(safe-area-inset-bottom,0px) + 84px);width:46px;height:46px;border-radius:50%;background:#1B3A6B;color:#fff;border:none;font-size:20px;box-shadow:0 4px 14px rgba(0,0,0,.3);z-index:250;cursor:pointer;display:none;align-items:center;justify-content:center}
  .rn-dot{position:absolute;top:-2px;right:-2px;min-width:15px;height:15px;border-radius:8px;background:#F0A500;color:#1B3A6B;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 3px}
  .rn-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9000;display:none;align-items:flex-end;justify-content:center;font-family:'Inter',system-ui,sans-serif}
  .rn-ov.open{display:flex}
  .rn-sheet{background:#fff;width:100%;max-width:560px;max-height:88vh;border-radius:20px 20px 0 0;display:flex;flex-direction:column;padding-bottom:env(safe-area-inset-bottom,0px);color:#1A2340}
  .rn-hdr{display:flex;align-items:center;gap:8px;padding:14px 16px 8px}
  .rn-title{flex:1;font-size:16px;font-weight:700}
  .rn-ib{border:none;background:#F1F3F7;border-radius:10px;height:34px;min-width:34px;padding:0 10px;font-size:15px;cursor:pointer;color:#1A2340;font-family:inherit;font-weight:600}
  .rn-ib.pri{background:#1B3A6B;color:#fff}
  .rn-ib.dng{color:#C0392B}
  .rn-body{overflow-y:auto;padding:4px 16px 16px;flex:1}
  .rn-chips{display:flex;gap:6px;padding:0 16px 8px}
  .rn-chip{border:1.5px solid #E1E5EC;background:#fff;border-radius:16px;padding:5px 12px;font-size:12px;font-weight:600;color:#5A6478;cursor:pointer;font-family:inherit}
  .rn-chip.on{background:#1B3A6B;border-color:#1B3A6B;color:#fff}
  .rn-card{background:#F6F7FA;border:1px solid #E7EAF0;border-radius:12px;padding:10px 12px;margin-bottom:8px;cursor:pointer}
  .rn-card:active{opacity:.7}
  .rn-ct{font-size:14px;font-weight:700;display:flex;align-items:center;gap:6px}
  .rn-cp{font-size:12px;color:#5A6478;margin-top:3px;white-space:pre-line;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .rn-meta{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
  .rn-pill{font-size:10.5px;font-weight:600;background:#fff;border:1px solid #E1E5EC;border-radius:10px;padding:2px 7px;color:#5A6478}
  .rn-pill.eq{background:rgba(26,127,114,.08);border-color:rgba(26,127,114,.25);color:#1A7F72}
  .rn-empty{text-align:center;color:#8A93A6;font-size:13px;padding:34px 10px}
  .rn-in{width:100%;box-sizing:border-box;border:1.5px solid #E1E5EC;border-radius:10px;padding:10px 12px;font-size:15px;font-family:inherit;background:#F6F7FA;color:#1A2340}
  .rn-in:focus{outline:none;border-color:#1B3A6B;background:#fff}
  .rn-seg{display:flex;gap:6px;margin:10px 0}
  .rn-seg button{flex:1}
  .rn-row{display:flex;align-items:center;gap:8px;margin-bottom:6px}
  .rn-row input[type=checkbox]{width:22px;height:22px;flex-shrink:0;accent-color:#1A7F72}
  .rn-row .rn-in{padding:8px 10px;font-size:14px}
  .rn-row .rn-in.done{text-decoration:line-through;color:#8A93A6}
  .rn-x{border:none;background:none;color:#B0B7C6;font-size:18px;cursor:pointer;padding:2px 6px}
  .rn-add{border:1.5px dashed #C9CFDB;background:none;border-radius:10px;padding:9px;width:100%;color:#5A6478;font-weight:600;font-size:13px;cursor:pointer;font-family:inherit}
  .rn-opt{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 0;border-top:1px solid #EEF0F5;margin-top:12px;font-size:13px;font-weight:600}
  .rn-opt small{display:block;font-weight:400;color:#8A93A6;font-size:11px;margin-top:1px}
  .rn-sw{width:46px;height:26px;border-radius:13px;background:#D5DAE4;position:relative;border:none;cursor:pointer;flex-shrink:0;transition:background .15s}
  .rn-sw::after{content:'';position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:left .15s}
  .rn-sw.on{background:#1A7F72}.rn-sw.on::after{left:23px}
  .rn-opt select{border:1.5px solid #E1E5EC;border-radius:8px;padding:6px 8px;font-size:13px;font-family:inherit;max-width:190px;background:#F6F7FA}
  .rn-st{font-size:11px;color:#8A93A6;text-align:center;padding:2px 0 6px}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  /* ───────── Données ───────── */
  const alive = n => !n.deleted;
  const all = () => [...perso.filter(alive).map(n => ({ ...n, partage: false })), ...equipe.filter(alive).map(n => ({ ...n, partage: true }))]
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const findNote = id => all().find(n => n.id === id);

  function loadCache() {
    try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); if (c.uid) { perso = c.perso || []; equipe = c.equipe || []; } } catch (e) {}
  }
  function saveCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ uid: user && user.uid, perso, equipe })); } catch (e) {}
  }
  function prune(list) { const lim = now() - TOMBSTONE_MS; return list.filter(n => !n.deleted || (n.updatedAt || 0) > lim); }
  function mergeLists(a, b) {
    const m = {};
    [...a, ...b].forEach(n => { if (!m[n.id] || (n.updatedAt || 0) >= (m[n.id].updatedAt || 0)) m[n.id] = n; });
    return prune(Object.values(m));
  }
  const ref = k => k === 'perso' ? doc(db, 'notes_perso', user.uid) : doc(db, 'notes_equipe', 'data');

  // écriture avec fusion (relit le document puis fusionne par id, le plus récent gagne)
  async function push(kind, changed) {
    if (!db || !user) return;
    try {
      const r = ref(kind);
      const snap = await getDoc(r);
      const remote = snap.exists() ? (snap.data().items || []) : [];
      const merged = mergeLists(remote, changed);
      await setDoc(r, { items: merged, updatedAt: now() });
    } catch (e) { console.warn('[notes] sync', e); setStatus('⚠️ Hors ligne — sera synchronisé plus tard'); }
  }

  function startSync() {
    unsubs.forEach(u => u()); unsubs = [];
    const listen = (kind) => onSnapshot(ref(kind), snap => {
      const remote = snap.exists() ? (snap.data().items || []) : [];
      if (kind === 'perso') perso = mergeLists(remote, perso); else equipe = mergeLists(remote, equipe);
      saveCache(); render(); refreshEditor(); updateBadge();
    }, err => console.warn('[notes] listen', kind, err.code));
    unsubs.push(listen('perso'), listen('equipe'));
  }

  /* ───────── Chantiers (lecture seule du cache existant) ───────── */
  function chantiers() {
    try { const a = JSON.parse(localStorage.getItem('rv6_chantiers_v1') || '[]'); return Array.isArray(a) ? a : (a.items || []); } catch (e) { return []; }
  }
  const chantierName = id => { const c = chantiers().find(x => String(x.id) === String(id)); return c ? c.nom : ''; };

  /* ───────── UI ───────── */
  const ov = document.createElement('div');
  ov.className = 'rn-ov';
  ov.addEventListener('click', e => { if (e.target === ov) closeNotes(); });
  document.body.appendChild(ov);

  function setStatus(t) { const el = ov.querySelector('.rn-st'); if (el) el.textContent = t || ''; }

  function progress(n) {
    if (n.type !== 'liste') return '';
    const it = n.items || []; if (!it.length) return '';
    return `${it.filter(x => x.done).length}/${it.length}`;
  }
  function preview(n) {
    if (n.type === 'liste') return (n.items || []).slice(0, 3).map(x => (x.done ? '✓ ' : '• ') + x.t).join('\n');
    return n.texte || '';
  }

  function render() {
    if (!ov.classList.contains('open')) return;
    if (view === 'edit') return; // ne pas écraser la saisie en cours
    const list = all().filter(n => filter === 'all' || (filter === 'eq' ? n.partage : !n.partage));
    ov.innerHTML = `<div class="rn-sheet">
      <div class="rn-hdr"><div class="rn-title">📝 Notes</div><button class="rn-ib pri" id="rn-new">＋ Nouvelle</button><button class="rn-ib" id="rn-close">✕</button></div>
      <div class="rn-chips">${[['all', 'Toutes'], ['me', 'Mes notes'], ['eq', '👥 Équipe']].map(([k, l]) => `<button class="rn-chip${filter === k ? ' on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
      <div class="rn-body">${list.length ? list.map(n => {
        const p = progress(n), cn = n.chantierId ? chantierName(n.chantierId) : '';
        return `<div class="rn-card" data-id="${esc(n.id)}"><div class="rn-ct">${n.type === 'liste' ? '☑️' : '📝'} ${esc(n.titre || 'Sans titre')}</div>
        ${preview(n) ? `<div class="rn-cp">${esc(preview(n))}</div>` : ''}
        <div class="rn-meta">${p ? `<span class="rn-pill">${p}</span>` : ''}${n.partage ? '<span class="rn-pill eq">👥 Équipe</span>' : ''}${cn ? `<span class="rn-pill">🏗️ ${esc(cn)}</span>` : ''}</div></div>`;
      }).join('') : '<div class="rn-empty">Aucune note.<br>Appuie sur « Nouvelle » pour en créer une.</div>'}</div>
      <div class="rn-st"></div></div>`;
    ov.querySelector('#rn-close').onclick = closeNotes;
    ov.querySelector('#rn-new').onclick = () => openEditor(null);
    ov.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; render(); });
    ov.querySelectorAll('.rn-card').forEach(c => c.onclick = () => openEditor(c.dataset.id));
  }

  let draft = null; // note en cours d'édition
  // Met à jour la note ouverte quand quelqu'un d'autre la modifie (sans écraser ce qu'on tape)
  function refreshEditor() {
    if (view !== 'edit' || !draft || draft._new || saveTimer) return;
    const r = findNote(draft.id);
    if (!r || (r.updatedAt || 0) <= (draft._ua || 0)) return;
    const ae = document.activeElement, typing = ae && ov.contains(ae) && /^(INPUT|TEXTAREA)$/.test(ae.tagName) && ae.type !== 'checkbox';
    draft._ua = r.updatedAt;
    if (typing) { // on ne touche pas au texte en cours de frappe : seulement les coches
      if (draft.type === 'liste' && r.type === 'liste' && (r.items || []).length === draft.items.length) {
        r.items.forEach((it, i) => { draft.items[i].done = !!it.done; });
        ov.querySelectorAll('input[type=checkbox]').forEach(c => { const v = draft.items[c.dataset.i]; if (v) { c.checked = v.done; const t = ov.querySelector(`[data-t="${c.dataset.i}"]`); if (t) t.classList.toggle('done', v.done); } });
      }
      return;
    }
    const keep = { _orig: r.partage, _ua: r.updatedAt };
    draft = Object.assign(JSON.parse(JSON.stringify(r)), keep);
    renderEditor();
    setStatus('↻ Mis à jour par un collègue');
  }
  function openEditor(id, preset) {
    view = 'edit';
    if (id) { draft = JSON.parse(JSON.stringify(findNote(id))); draft._orig = draft.partage; draft._ua = draft.updatedAt || 0; }
    else draft = { id: uid8(), titre: '', type: 'liste', texte: '', items: [{ t: '', done: false }], chantierId: (preset && preset.chantierId) || '', partage: false, createdAt: now(), _new: true, _orig: false };
    renderEditor();
  }

  function renderEditor() {
    const d = draft;
    const cs = chantiers();
    ov.innerHTML = `<div class="rn-sheet">
      <div class="rn-hdr"><button class="rn-ib" id="rn-back">‹</button><div class="rn-title">${d._new ? 'Nouvelle note' : 'Note'}</div><button class="rn-ib dng" id="rn-del">🗑</button></div>
      <div class="rn-body">
        <input class="rn-in" id="rn-titre" placeholder="Titre (ex. À prendre demain)" value="${esc(d.titre)}">
        <div class="rn-seg"><button class="rn-chip${d.type === 'liste' ? ' on' : ''}" data-t="liste">☑️ Liste à cocher</button><button class="rn-chip${d.type === 'texte' ? ' on' : ''}" data-t="texte">📝 Texte libre</button></div>
        <div id="rn-content"></div>
        <div class="rn-opt"><div>👥 Partager avec l'équipe<small>Visible et modifiable par tous les comptes</small></div><button class="rn-sw${d.partage ? ' on' : ''}" id="rn-share"></button></div>
        <div class="rn-opt"><div>🏗️ Chantier<small>Optionnel</small></div><select id="rn-ch"><option value="">— aucun —</option>${cs.map(c => `<option value="${esc(c.id)}"${String(c.id) === String(d.chantierId) ? ' selected' : ''}>${esc(c.nom)}</option>`).join('')}</select></div>
      </div><div class="rn-st"></div></div>`;
    renderContent();
    const $ = s => ov.querySelector(s);
    $('#rn-back').onclick = backToList;
    $('#rn-del').onclick = () => { if (confirm('Supprimer cette note ?')) removeNote(); };
    $('#rn-titre').oninput = e => { d.titre = e.target.value; queueSave(); };
    ov.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { d.type = b.dataset.t; if (d.type === 'liste' && !d.items.length) d.items = [{ t: '', done: false }]; renderEditor(); queueSave(); });
    $('#rn-share').onclick = () => { d.partage = !d.partage; $('#rn-share').classList.toggle('on', d.partage); queueSave(); };
    $('#rn-ch').onchange = e => { d.chantierId = e.target.value; queueSave(); };
    if (d._new) setTimeout(() => $('#rn-titre').focus(), 50);
  }

  function renderContent() {
    const d = draft, box = ov.querySelector('#rn-content');
    if (d.type === 'texte') {
      box.innerHTML = `<textarea class="rn-in" id="rn-texte" rows="8" placeholder="Écris ta note…">${esc(d.texte)}</textarea>`;
      box.querySelector('#rn-texte').oninput = e => { d.texte = e.target.value; queueSave(); };
      return;
    }
    box.innerHTML = d.items.map((it, i) => `<div class="rn-row"><input type="checkbox" data-i="${i}"${it.done ? ' checked' : ''}><input class="rn-in${it.done ? ' done' : ''}" data-t="${i}" value="${esc(it.t)}" placeholder="Élément…"><button class="rn-x" data-x="${i}">✕</button></div>`).join('') + '<button class="rn-add" id="rn-add">＋ Ajouter une ligne</button>';
    box.querySelectorAll('input[type=checkbox]').forEach(c => c.onchange = () => { d.items[c.dataset.i].done = c.checked; box.querySelector(`[data-t="${c.dataset.i}"]`).classList.toggle('done', c.checked); queueSave(); });
    box.querySelectorAll('input[data-t]').forEach(inp => {
      inp.oninput = () => { d.items[inp.dataset.t].t = inp.value; queueSave(); };
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addLine(+inp.dataset.t + 1); } };
    });
    box.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { d.items.splice(+b.dataset.x, 1); if (!d.items.length) d.items.push({ t: '', done: false }); renderContent(); queueSave(); });
    box.querySelector('#rn-add').onclick = () => addLine(d.items.length);
  }
  function addLine(at) {
    draft.items.splice(at, 0, { t: '', done: false });
    renderContent();
    const el = ov.querySelector(`[data-t="${at}"]`); if (el) el.focus();
    queueSave();
  }

  /* ───────── Sauvegarde ───────── */
  function queueSave() { clearTimeout(saveTimer); setStatus('…'); saveTimer = setTimeout(commit, 600); }

  async function commit() {
    if (!draft) return;
    clearTimeout(saveTimer); saveTimer = null;
    const d = draft;
    const empty = !d.titre.trim() && !(d.type === 'texte' ? d.texte.trim() : d.items.some(x => x.t.trim()));
    if (empty) { setStatus(''); return; }
    const note = {
      id: d.id, titre: d.titre.trim(), type: d.type, texte: d.texte || '',
      items: (d.items || []).filter(x => x.t.trim() || d.items.length === 1),
      chantierId: d.chantierId || '', createdAt: d.createdAt || now(), updatedAt: now(),
      auteur: (user && (user.displayName || user.email)) || ''
    };
    const toKind = d.partage ? 'equipe' : 'perso';
    const fromKind = d._orig ? 'equipe' : 'perso';
    const put = (list, n) => { const i = list.findIndex(x => x.id === n.id); if (i >= 0) list[i] = n; else list.push(n); };
    if (toKind === 'equipe') put(equipe, note); else put(perso, note);
    const pushes = [push(toKind, [note])];
    if (!d._new && fromKind !== toKind) {            // la note change de « côté » : on supprime l'ancienne copie
      const tomb = { id: d.id, deleted: true, updatedAt: now() };
      if (fromKind === 'equipe') put(equipe, tomb); else put(perso, tomb);
      pushes.push(push(fromKind, [tomb]));
    }
    d._new = false; d._orig = d.partage; d._ua = note.updatedAt;
    saveCache(); updateBadge();
    await Promise.all(pushes);
    setStatus('✓ Enregistré');
  }

  async function removeNote() {
    const d = draft; clearTimeout(saveTimer); saveTimer = null;
    const kind = d._orig ? 'equipe' : 'perso';
    const tomb = { id: d.id, deleted: true, updatedAt: now() };
    const list = kind === 'equipe' ? equipe : perso;
    const i = list.findIndex(x => x.id === d.id); if (i >= 0) list[i] = tomb; else list.push(tomb);
    draft = null; saveCache(); backToList(true); updateBadge();
    await push(kind, [tomb]);
  }

  async function backToList(skipCommit) {
    if (skipCommit !== true) await commit();
    draft = null; view = 'list'; render();
  }

  /* ───────── Ouverture / bouton ───────── */
  function openNotes() { view = 'list'; ov.classList.add('open'); render(); }
  function closeNotes() { if (view === 'edit') { commit(); } clearTimeout(saveTimer); saveTimer = null; draft = null; view = 'list'; ov.classList.remove('open'); }
  window.openNotes = function (o) {
    if (o && o.id && findNote(o.id)) { ov.classList.add('open'); openEditor(o.id); }
    else if (o && o.nouveau) { ov.classList.add('open'); openEditor(null, { chantierId: o.chantierId }); }
    else openNotes();
  };
  window.risseNotes = { forChantier: id => all().filter(n => id && String(n.chantierId) === String(id)) };

  let btns = [];
  function updateBadge() {
    const n = all().length;
    try { window.dispatchEvent(new Event('risse-notes-update')); } catch (e) {}
    btns.forEach(b => { const d = b.querySelector('.rn-dot'); if (d) d.remove(); }); // pas de pastille de compteur
  }
  function mountButton() {
    const calc = document.querySelector('[onclick*="openCalculatrice"]');
    const b = document.createElement('button');
    b.setAttribute('aria-label', 'Notes'); b.title = 'Notes'; b.textContent = '📝';
    b.onclick = openNotes;
    if (calc && calc.parentNode) {
      b.className = (calc.className || '') + ' rn-btn';
      calc.parentNode.insertBefore(b, calc);
    } else {
      b.className = 'rn-fab'; b.style.display = 'flex';
      document.body.appendChild(b);
    }
    btns.push(b); updateBadge();
  }

  /* ───────── Démarrage ───────── */
  function boot() {
    loadCache();
    mountButton();
    const app = getApps()[0] || initializeApp(CONFIG);
    db = getFirestore(app);
    onAuthStateChanged(getAuth(app), u => {
      user = u;
      if (!u) { unsubs.forEach(f => f()); unsubs = []; btns.forEach(b => b.style.display = 'none'); return; }
      btns.forEach(b => b.style.display = b.classList.contains('rn-fab') ? 'flex' : '');
      try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); if (c.uid && c.uid !== u.uid) { perso = []; equipe = []; } } catch (e) {}
      startSync(); updateBadge();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
