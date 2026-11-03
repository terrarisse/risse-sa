/* ═══════════════════════════════════════════════════════════════
   Risse S.A. — Export des rapports vers Trello (trello-export.js)
   Utilisé par les modules Rapport et Chantiers (nécessite trello.js).

   • Un tap → carte créée dans le tableau Trello « Rapport »,
     dans la colonne du chantier.
   • Statut partagé entre tous les appareils (Firestore : UN seul document
     chantiers/trello_exports → 1 lecture par ouverture, quel que soit le
     nombre de rapports ; entrées de plus d'un an retirées automatiquement) :
       🔵 bleu   = seulement dans l'app
       🟠 orange = exporté sur Trello
       🔵 « modifié » = modifié depuis l'export → le prochain export
          met à jour la MÊME carte (pas de doublon).
   • Correspondance chantier → colonne mémorisée (doc trello_map).
   • Sans réseau : l'export est mis en attente et part au retour du réseau.
   • Photos (onglet Travaux du Rapport) : gardées sur le téléphone (IndexedDB,
     jamais dans Firebase) puis envoyées en pièces jointes sur la carte Trello
     dès qu'elle existe ; effacées du téléphone une fois envoyées.

   Chaque module fournit le stockage via RTrelloRap.setup({ store, user, toast, onChange }).
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var TR = window.RTrello;
  var LSK = { exp: 'rv6_trx_cache', map: 'rv6_trx_map', queue: 'rv6_trx_queue' };
  var cfg = { store: null, user: function () { return ''; }, toast: function () {}, onChange: function () {} };

  function lsJ(k, d) { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } }
  function lsS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) { return TR ? TR.esc(s) : String(s == null ? '' : s); }

  var exportsCache = lsJ(LSK.exp, {});
  var mapCache = lsJ(LSK.map, { lists: {} });
  if (!mapCache.lists) mapCache.lists = {};

  /* ── Identité d'un rapport : reste la même après ✏️ Modifier ── */
  function root(r) { return String(r.trelloRoot || r.id); }
  function chKey(name) {
    var n = TR ? TR.norm(name || '') : String(name || '').toLowerCase();
    return n.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'sans_chantier';
  }

  // 'none' (bleu) · 'done' (orange) · 'modified' (bleu, modifié) · 'pending' (en attente réseau)
  function status(r) {
    var q = lsJ(LSK.queue, []);
    if (q.some(function (x) { return root(x.report) === root(r); })) return { state: 'pending' };
    var rec = exportsCache[root(r)];
    if (!rec) return { state: 'none' };
    if (String(rec.reportId) !== String(r.id)) return { state: 'modified', rec: rec };
    return { state: 'done', rec: rec };
  }

  /* ── Lecture du stockage partagé ── */
  function refresh() {
    if (!cfg.store) return Promise.resolve();
    return Promise.all([
      cfg.store.loadExports().then(function (o) { exportsCache = o || {}; lsS(LSK.exp, exportsCache); }).catch(function () {}),
      cfg.store.loadMap().then(function (m) { mapCache = m || {}; if (!mapCache.lists) mapCache.lists = {}; lsS(LSK.map, mapCache); }).catch(function () {})
    ]).then(function () { cfg.onChange(); });
  }

  function saveMapPatch(patch) {
    Object.keys(patch).forEach(function (k) {
      if (k === 'lists') Object.keys(patch.lists).forEach(function (c) { mapCache.lists[c] = patch.lists[c]; });
      else mapCache[k] = patch[k];
    });
    lsS(LSK.map, mapCache);
    if (cfg.store) cfg.store.saveMap(patch).catch(function (e) { console.warn('Trello map:', e); });
  }

  /* ── Petites fenêtres (même style que le reste de l'app) ── */
  function sheet(title, sub, items, extra) {
    TR.injectCss();
    return new Promise(function (resolve) {
      var ov = document.createElement('div'); ov.className = 'tw-ov';
      ov.innerHTML = '<div class="tw-sh"><div class="tw-sh-hd"><b>' + esc(title) + '</b><button class="tw-x" aria-label="Fermer">✕</button></div>' +
        (sub ? '<div style="font-size:13px;color:#4A5878;margin:0 0 12px;line-height:1.45">' + sub + '</div>' : '') +
        items.map(function (it, i) {
          return '<button class="tw-att" data-i="' + i + '"' + (it.accent ? ' style="border-color:#E2622C;background:#FFF3E6"' : '') + '><span class="tw-att-b"><div class="tw-att-n">' + esc(it.label) + '</div>' +
            (it.sub ? '<div class="tw-att-m">' + esc(it.sub) + '</div>' : '') + '</span><span class="tw-arrow">›</span></button>';
        }).join('') + (extra || '') + '</div>';
      function done(v) { ov.remove(); resolve(v); }
      ov.addEventListener('click', function (e) { if (e.target === ov) done(null); });
      ov.querySelector('.tw-x').onclick = function () { done(null); };
      ov.querySelectorAll('[data-i]').forEach(function (b) { b.onclick = function () { done(items[+b.dataset.i].value); }; });
      document.body.appendChild(ov);
    });
  }

  function askWrite() {
    return sheet('Autoriser Trello', 'Pour créer les cartes, l\'app doit avoir le droit d\'<b>écrire</b> dans Trello. Une seule fois par appareil : tu vas être redirigé vers Trello, clique sur « Autoriser », puis relance l\'export.',
      [{ label: '🔓 Autoriser l\'écriture sur Trello', value: 1, accent: true }]).then(function (v) {
      if (v) TR.connect();
      var e = new Error('redirect'); e.silent = true; throw e;
    });
  }

  /* ── Tableau « Rapport » ── */
  function ensureBoard() {
    if (mapCache.boardId) return Promise.resolve(mapCache.boardId);
    return TR.listBoards().then(function (boards) {
      var auto = boards.filter(function (b) { return /rapport/i.test(b.name); });
      if (auto.length === 1) { saveMapPatch({ boardId: auto[0].id, boardName: auto[0].name }); return auto[0].id; }
      return sheet('Tableau des rapports', 'Dans quel tableau Trello envoyer les rapports ?',
        boards.map(function (b) { return { label: b.name, value: b }; })).then(function (b) {
        if (!b) { var e = new Error('cancel'); e.silent = true; throw e; }
        saveMapPatch({ boardId: b.id, boardName: b.name });
        return b.id;
      });
    });
  }

  /* ── Colonne du chantier ── */
  var listsMemo = null;
  function boardLists(boardId) {
    if (listsMemo && listsMemo.board === boardId) return Promise.resolve(listsMemo.lists);
    return TR.api('/boards/' + boardId + '/lists', { filter: 'open', fields: 'name,pos' }).then(function (l) {
      l.sort(function (a, b) { return a.pos - b.pos; });
      listsMemo = { board: boardId, lists: l };
      return l;
    });
  }
  function ensureList(boardId, chantier) {
    var k = chKey(chantier);
    return boardLists(boardId).then(function (lists) {
      var known = mapCache.lists[k];
      if (known && lists.some(function (l) { return l.id === known.id; })) return known;
      // correspondance automatique par nom
      var n = TR.norm(chantier || ''), g = TR.gkey(chantier || '');
      var cands = lists.filter(function (l) {
        var ln = TR.norm(l.name), lg = TR.gkey(l.name);
        return ln === n || (g && lg === g) || (n.length > 3 && (ln.indexOf(n) > -1 || n.indexOf(ln) > -1) && ln.length > 3);
      });
      if (cands.length === 1) { var v = { id: cands[0].id, name: cands[0].name }; var p = { lists: {} }; p.lists[k] = v; saveMapPatch(p); return v; }
      var items = [{ label: '➕ Créer la colonne « ' + chantier + ' »', value: 'new', accent: true }]
        .concat((cands.length ? cands : lists).map(function (l) { return { label: l.name, value: l }; }));
      if (cands.length) items.push({ label: 'Voir toutes les colonnes…', value: 'all' });
      return sheet('Colonne Trello', 'Dans quelle colonne du tableau ranger les rapports de <b>' + esc(chantier) + '</b> ?<br><small>Choix mémorisé pour ce chantier, sur tous les appareils.</small>', items).then(function (choice) {
        if (!choice) { var e = new Error('cancel'); e.silent = true; throw e; }
        if (choice === 'all') { cands = []; return ensureListAll(boardId, chantier, lists); }
        return pickResult(boardId, chantier, choice);
      });
    });
  }
  function ensureListAll(boardId, chantier, lists) {
    return sheet('Colonne Trello', 'Colonne pour <b>' + esc(chantier) + '</b> :',
      [{ label: '➕ Créer la colonne « ' + chantier + ' »', value: 'new', accent: true }].concat(lists.map(function (l) { return { label: l.name, value: l }; })))
      .then(function (choice) {
        if (!choice) { var e = new Error('cancel'); e.silent = true; throw e; }
        return pickResult(boardId, chantier, choice);
      });
  }
  function pickResult(boardId, chantier, choice) {
    var k = chKey(chantier);
    var pr = choice === 'new'
      ? TR.write('POST', '/lists', { name: chantier, idBoard: boardId, pos: 'bottom' }).then(function (l) { listsMemo = null; return l; })
      : Promise.resolve(choice);
    return pr.then(function (l) { var v = { id: l.id, name: l.name }; var p = { lists: {} }; p.lists[k] = v; saveMapPatch(p); return v; });
  }

  /* ── Carte ── */
  function fmtDate(d) { var p = String(d || '').split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : (d || ''); }
  function cardName(r) { return 'Rapport du ' + fmtDate(r.date) + (r.nom ? ' – ' + r.nom : ''); }

  function pushCard(r, text, list) {
    var rec = exportsCache[root(r)];
    var params = { name: cardName(r), desc: String(text || '').slice(0, 16000), idList: list.id };
    var create = function () { return TR.write('POST', '/cards', Object.assign({ pos: 'top' }, params)); };
    var p = rec && rec.cardId
      ? TR.write('PUT', '/cards/' + rec.cardId, params).catch(function (e) { if (e.code === 404 || e.code === 400) return create(); throw e; })
      : create();
    return p.then(function (card) {
      var nr = {
        type: 'trello_export', root: root(r), reportId: String(r.id), chantier: r.chantier || '',
        date: r.date || '', cardId: card.id, url: card.shortUrl || card.url || (rec && rec.url) || '',
        listId: list.id, listName: list.name, at: Date.now(), by: cfg.user() || ''
      };
      exportsCache[nr.root] = nr;
      var old = Date.now() - 365 * 86400000;
      var stale = Object.keys(exportsCache).filter(function (k) { return (exportsCache[k].at || 0) < old; });
      stale.forEach(function (k) { delete exportsCache[k]; });
      lsS(LSK.exp, exportsCache);
      if (cfg.store) return cfg.store.saveExport(nr, stale).catch(function (e) { console.warn('Statut export:', e); }).then(function () { return nr; });
      return nr;
    });
  }

  function exportOne(r, text) {
    if (!TR || !TR.connected() || !TR.canWrite()) return askWrite();
    return ensureBoard().then(function (bid) { return ensureList(bid, r.chantier || 'Sans chantier'); })
      .then(function (list) { return pushCard(r, text, list); })
      .then(function (rec) { flushPhotos(); return rec; });
  }

  function unqueue(r) { lsS(LSK.queue, lsJ(LSK.queue, []).filter(function (x) { return root(x.report) !== root(r); })); }
  function enqueue(r, text) {
    unqueue(r);
    var q = lsJ(LSK.queue, []); q.push({ report: r, text: text }); lsS(LSK.queue, q);
  }

  function handleErr(e) {
    if (!e || e.silent) return;
    if (e.code === 401) { cfg.toast('⚠️ Autorisation Trello expirée — relance l\'export pour reconnecter'); return; }
    cfg.toast('⚠️ Export Trello impossible pour le moment');
    console.warn('Export Trello:', e);
  }

  // Export d'un rapport (un tap)
  var busy = {};
  function exportReport(r, text) {
    var k = root(r);
    if (busy[k]) return Promise.resolve(null);
    if (navigator.onLine === false && TR && TR.canWrite() && mapCache.boardId && mapCache.lists[chKey(r.chantier)]) {
      enqueue(r, text); cfg.onChange(); cfg.toast('⏳ Pas de réseau — export envoyé dès le retour du réseau');
      return Promise.resolve(null);
    }
    busy[k] = 1; cfg.onChange();
    return exportOne(r, text).then(function (rec) {
      unqueue(r); delete busy[k]; cfg.onChange();
      cfg.toast('🟠 Rapport exporté sur Trello');
      return rec;
    }, function (e) { delete busy[k]; cfg.onChange(); handleErr(e); return null; });
  }

  // Export de plusieurs rapports (un seul choix de colonne par chantier)
  function exportMany(items) {
    var ok = 0, chain = Promise.resolve(), stop = false;
    items.forEach(function (it) {
      chain = chain.then(function () {
        if (stop) return;
        busy[root(it.report)] = 1; cfg.onChange();
        return exportOne(it.report, it.text).then(function () { ok++; unqueue(it.report); }, function (e) { stop = true; handleErr(e); })
          .then(function () { delete busy[root(it.report)]; cfg.onChange(); });
      });
    });
    return chain.then(function () { if (ok) cfg.toast('🟠 ' + ok + ' rapport' + (ok > 1 ? 's' : '') + ' exporté' + (ok > 1 ? 's' : '') + ' sur Trello'); return ok; });
  }

  // File d'attente (hors réseau) → envoi silencieux au retour du réseau
  var flushing = false;
  function flushQueue() {
    var q = lsJ(LSK.queue, []);
    if (flushing || !q.length || navigator.onLine === false || !TR || !TR.canWrite() || !mapCache.boardId) return;
    flushing = true;
    var chain = Promise.resolve(), ok = 0;
    q.forEach(function (it) {
      chain = chain.then(function () {
        var list = mapCache.lists[chKey(it.report.chantier)];
        if (!list) return;
        return pushCard(it.report, it.text, list).then(function () { ok++; unqueue(it.report); }, function () {});
      });
    });
    chain.then(function () { flushing = false; flushPhotos(); cfg.onChange(); if (ok) cfg.toast('🟠 ' + ok + ' rapport' + (ok > 1 ? 's' : '') + ' en attente exporté' + (ok > 1 ? 's' : '') + ' sur Trello'); });
  }
  window.addEventListener('online', function () { setTimeout(function () { flushQueue(); flushPhotos(); }, 1500); });

  /* ── Photos : stockage local jusqu'à l'envoi sur Trello ── */
  var PDB = null, pending = {};
  function pdb() {
    if (PDB) return PDB;
    PDB = new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error('no idb')); return; }
      var q = indexedDB.open('rv6_trx_photos', 1);
      q.onupgradeneeded = function () { q.result.createObjectStore('p'); };
      q.onsuccess = function () { res(q.result); };
      q.onerror = function () { rej(q.error); };
    });
    return PDB;
  }
  function pGet(k) {
    return pdb().then(function (db) { return new Promise(function (res) {
      var r = db.transaction('p').objectStore('p').get(k);
      r.onsuccess = function () { res(r.result || []); }; r.onerror = function () { res([]); };
    }); }).catch(function () { return []; });
  }
  function pSet(k, v) {
    return pdb().then(function (db) { return new Promise(function (res) {
      var t = db.transaction('p', 'readwrite'), st = t.objectStore('p');
      if (v && v.length) st.put(v, k); else st.delete(k);
      t.oncomplete = function () { res(); }; t.onerror = function () { res(); };
    }); }).catch(function () {});
  }
  function pKeys() {
    return pdb().then(function (db) { return new Promise(function (res) {
      var r = db.transaction('p').objectStore('p').getAllKeys();
      r.onsuccess = function () { res(r.result || []); }; r.onerror = function () { res([]); };
    }); }).catch(function () { return []; });
  }
  // Compte les photos en attente par rapport (affichage immédiat)
  function scanPending() {
    return pKeys().then(function (keys) {
      var out = {};
      return Promise.all(keys.filter(function (k) { return /^rep_/.test(k); }).map(function (k) {
        return pGet(k).then(function (l) { if (l.length) out[k.slice(4)] = l.length; });
      })).then(function () { pending = out; });
    });
  }
  var photos = {
    loadDraft: function () { return pGet('draft'); },
    saveDraft: function (list) { return pSet('draft', (list || []).filter(Boolean)); },
    clearDraft: function () { return pSet('draft', null); },
    // À la validation : les photos du brouillon sont rattachées au rapport
    attach: function (r, list) {
      list = (list || []).filter(Boolean);
      if (!list.length) return Promise.resolve();
      var k = 'rep_' + root(r);
      return pGet(k).then(function (old) { return pSet(k, old.concat(list)); })
        .then(function () { pending[root(r)] = (pending[root(r)] || 0) + list.length; });
    }
  };

  function toBlob(dataUrl) { return fetch(dataUrl).then(function (r) { return r.blob(); }); }
  var flushingPh = false;
  // Envoie les photos en attente dont la carte Trello existe déjà
  function flushPhotos() {
    if (flushingPh || navigator.onLine === false || !TR || !TR.canWrite()) return Promise.resolve(0);
    flushingPh = true;
    var sent = 0;
    return pKeys().then(function (keys) {
      var chain = Promise.resolve();
      keys.filter(function (k) { return /^rep_/.test(k); }).forEach(function (k) {
        var rt = k.slice(4), rec = exportsCache[rt];
        if (!rec || !rec.cardId) return;
        chain = chain.then(function () {
          return pGet(k).then(function (list) {
            var i = 0, n = 0, d = String(rec.date || '').split('-').reverse().join('.');
            function next() {
              if (i >= list.length) return Promise.resolve();
              var url = list[i];
              return toBlob(url).then(function (b) { return TR.upload(rec.cardId, b, 'Photo ' + d + ' (' + ((rec.photos || 0) + n + 1) + ').jpg'); })
                .then(function () { i++; n++; sent++; pending[rt] = list.length - i; cfg.onChange(); return pSet(k, list.slice(i)).then(next); });
            }
            return next().catch(function (e) { console.warn('Photo Trello:', e); }).then(function () {
              if (!n) return;
              rec.photos = (rec.photos || 0) + n; rec.at = rec.at || Date.now();
              exportsCache[rt] = rec; lsS(LSK.exp, exportsCache);
              if (cfg.store) return cfg.store.saveExport(rec, []).catch(function () {});
            });
          });
        });
      });
      return chain;
    }).then(function () {
      flushingPh = false; cfg.onChange();
      if (sent) cfg.toast('🟠 ' + sent + ' photo' + (sent > 1 ? 's' : '') + ' envoyée' + (sent > 1 ? 's' : '') + ' sur Trello');
      return sent;
    }, function () { flushingPh = false; return 0; });
  }
  // « 📷 3 » (sur Trello) · « 📷 2 à envoyer » (encore sur le téléphone)
  function photoLabel(r) {
    var rec = exportsCache[root(r)], p = pending[root(r)] || 0, s = (rec && rec.photos) || 0;
    return [s ? '📷 ' + s : '', p ? '📷 ' + p + ' à envoyer' : ''].filter(Boolean).join(' · ');
  }

  function isBusy(r) { return !!busy[root(r)]; }
  function openCard(r) { var st = status(r); if (st.rec && st.rec.url) window.open(st.rec.url, '_blank', 'noopener'); }
  function fmtAt(rec) {
    if (!rec || !rec.at) return '';
    var d = new Date(rec.at);
    return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  // Texte de secours (rapports validés avant cette version, sans texte enregistré)
  function fallbackText(r) {
    var emp = (r.employes || []).filter(function (e) { return parseFloat(e.heures || 0) > 0; });
    var tot = emp.reduce(function (s, e) { return s + parseFloat(e.heures); }, 0);
    var d = new Date((r.date || '') + 'T12:00:00');
    var t = 'RAPPORT JOURNALIER — RISSE S.A.\n' + '─'.repeat(35) + '\n' +
      (isNaN(d) ? (r.date || '') : d.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) + '\n' +
      'Chantier : ' + (r.chantier || '—') + '\nResponsable : ' + (r.nom || '—') + '\n\nMAIN D\'OEUVRE\n';
    t += emp.length ? emp.map(function (e) { return '  ' + e.nom + ' : ' + parseFloat(e.heures).toFixed(2) + ' h\n'; }).join('') + '  Total : ' + tot.toFixed(2) + ' h\n' : '  Aucune\n';
    var loc = Object.values(r.locSelection || {}).filter(function (x) { return x && x.qty > 0; });
    t += '\nLOCATION INTERNE\n' + (loc.length ? loc.map(function (x) { return '  ' + x.label + ' : ' + x.qty + ' ' + (x.unit || '') + '\n'; }).join('') : '  Aucune\n');
    t += '\nTRAVAUX REALISES\n' + (r.travaux ? r.travaux.split('\n').map(function (l) { return '  ' + l + '\n'; }).join('') : '  Aucune description\n');
    var me = r.metres || [];
    if (me.length) t += '\nMETRES\n' + me.map(function (m) { return '  ' + (m.desc || '—') + ' : ' + (m.total != null ? m.total : '') + ' ' + (m.unit || '') + '\n'; }).join('');
    var fo = (r.fournitures_catalogue || []).filter(function (f) { return f.qty && parseFloat(f.qty) > 0; });
    if (fo.length) t += '\nFOURNITURES\n' + fo.map(function (f) { return '  ' + (f.subCat ? f.subCat + ' ' + f.nom : (f.nom || f.cat)) + ' : ' + f.qty + ' ' + (f.unit || '') + '\n'; }).join('');
    var ev = r.evacuations || [];
    if (ev.length) t += '\nEVACUATIONS\n' + ev.map(function (e) { return '  ' + (e.mat || '—') + ' : ' + e.qte + ' ' + (e.unite || '') + '\n'; }).join('');
    if (r.notes) t += '\nNOTES\n  ' + r.notes + '\n';
    return t + '\n' + '─'.repeat(35) + '\nRisse S.A.';
  }
  function textOf(r) { return r.texte || fallbackText(r); }

  /* ── Styles communs : bleu = app, orange = Trello ── */
  var CSS = '' +
    '.trx-btn{display:inline-flex;align-items:center;gap:4px;border:none;border-radius:20px;padding:6px 11px;font:700 12px Inter,sans-serif;cursor:pointer;white-space:nowrap;}' +
    '.trx-btn.go{background:#fff;color:#1B3A6B;}' +
    '.trx-btn.on{background:rgba(255,255,255,.22);color:#fff;}' +
    '.trx-btn.wait{background:rgba(255,255,255,.18);color:#fff;opacity:.85;cursor:default;}' +
    '.trx-btn:active{transform:scale(.95);}' +
    '.trx-orange{background:#C0392B !important;background:linear-gradient(90deg,#B03A2E,#E2622C) !important;}' +
    '.trx-tag{display:inline-block;font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:10px;margin-left:4px;vertical-align:1px;}' +
    '.trx-tag.blue{background:#E6EEF9;color:#1B3A6B;}.trx-tag.orange{background:#FFF3E6;color:#B4541A;}' +
    '.trx-filters{display:flex;gap:6px;margin-bottom:10px;overflow-x:auto;scrollbar-width:none;}.trx-filters::-webkit-scrollbar{display:none;}' +
    '.trx-f{flex-shrink:0;border:1.5px solid #E0E4EF;background:#fff;color:#4A5878;font:700 12px Inter,sans-serif;padding:7px 12px;border-radius:20px;cursor:pointer;}' +
    '.trx-f.on.all{background:#4A5878;border-color:#4A5878;color:#fff;}.trx-f.on.blue{background:#1B3A6B;border-color:#1B3A6B;color:#fff;}.trx-f.on.orange{background:#E2622C;border-color:#E2622C;color:#fff;}' +
    '.trx-all{width:100%;border:none;border-radius:12px;padding:13px;margin-bottom:12px;font:700 14px Inter,sans-serif;color:#fff;cursor:pointer;background:linear-gradient(90deg,#B03A2E,#E2622C);}' +
    '.trx-all:disabled{opacity:.6;cursor:default;}';
  function injectCss() {
    if (document.getElementById('trx-style')) return;
    var st = document.createElement('style'); st.id = 'trx-style'; st.textContent = CSS; document.head.appendChild(st);
  }

  // Bouton à afficher sur un rapport (fond bleu marine ou orange)
  function buttonHtml(r, fnName) {
    var st = status(r), id = esc(String(r.id));
    var call = 'event.stopPropagation();' + fnName + '(\'' + id + '\')';
    if (isBusy(r)) return '<button class="trx-btn wait" onclick="event.stopPropagation()">⟳ Envoi…</button>';
    if (st.state === 'pending') return '<button class="trx-btn wait" onclick="event.stopPropagation()">⏳ En attente</button>';
    if (st.state === 'done') return '<button class="trx-btn on" onclick="' + call + '" title="Ouvrir la carte Trello">↗ Trello</button>';
    if (st.state === 'modified') return '<button class="trx-btn go" onclick="' + call + '" title="Mettre à jour la carte Trello">🔁 Trello</button>';
    return '<button class="trx-btn go" onclick="' + call + '" title="Exporter sur Trello">📤 Trello</button>';
  }

  function setup(o) {
    Object.keys(o || {}).forEach(function (k) { cfg[k] = o[k]; });
    injectCss();
    return Promise.all([refresh(), scanPending()]).then(function () { cfg.onChange(); flushQueue(); flushPhotos(); });
  }

  window.RTrelloRap = {
    setup: setup, refresh: refresh, status: status, root: root, isBusy: isBusy,
    exportReport: exportReport, exportMany: exportMany, openCard: openCard, fmtAt: fmtAt,
    textOf: textOf, buttonHtml: buttonHtml, flushQueue: flushQueue,
    photos: photos, flushPhotos: flushPhotos, photoLabel: photoLabel
  };
})();
