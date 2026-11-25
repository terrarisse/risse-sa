/* ═══════════════════════════════════════════════════════════════
   Rapport — disposition PC (façon Sorba)
   Active uniquement quand desktop.js pose html.dk (grand écran + souris).
   Sur téléphone : ne fait rien, la page reste identique.

   3 colonnes :
   • gauche  : les rapports du même chantier, jour par jour (+ le brouillon)
   • centre  : la saisie habituelle (onglets M.O., Location, Fournit., …)
   • droite  : la description des travaux, toujours modifiable,
               et le rapport mis en page, mis à jour en direct.
               Un clic sur un autre jour l'affiche à la place (lecture).
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var root = document.documentElement;
  var built = false, descMark = null, viewing = null;
  var archive = {};          // cid → rapports archivés dans le module Chantiers
  var lastFetch = {};        // cid → horodatage du dernier chargement Firestore
  var liveTimer = null, daysTimer = null, dvxKey = '';

  function $(id) { return document.getElementById(id); }
  function on() { return root.classList.contains('dk'); }
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? 0 : n; }
  function lsJSON(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }

  /* ── Construction / démontage de la mise en page ─────────── */
  function build() {
    if (built) return;
    var ms = $('main-scroll'), tx = $('tx-travaux');
    if (!ms || !tx) return;
    var wrap = document.createElement('div');
    wrap.id = 'dk-rap';
    wrap.innerHTML =
      '<aside id="dk-days" aria-label="Rapports du chantier">' +
        '<div class="dkd-hd"><b>Rapports</b><span id="dkd-ch"></span></div>' +
        '<div id="dkd-list"></div>' +
      '</aside>' +
      '<div id="dk-mid"></div>' +
      '<aside id="dk-right">' +
        '<div id="dk-desc-slot"></div>' +
        '<div id="dk-doc-box">' +
          '<div id="dk-doc-bar"></div>' +
          '<div id="dk-doc-scroll"><div id="dk-doc"></div></div>' +
        '</div>' +
      '</aside>';
    ms.parentNode.insertBefore(wrap, ms);
    $('dk-mid').appendChild(ms);
    var card = tx.closest('.card');
    descMark = document.createComment('dk-desc');
    card.parentNode.insertBefore(descMark, card);
    card.classList.add('dk-desc-card');
    $('dk-desc-slot').appendChild(card);
    var dv = document.createElement('div');
    dv.id = 'dk-dvx';
    var s3 = $('sec-3'); s3.insertBefore(dv, s3.firstChild);
    built = true;
    viewing = null; dvxKey = '';
    renderDays(); renderDoc(); fetchArchive(false); renderDvxPanel(true); markTab();
    if (typeof autoGrowTravaux === 'function') autoGrowTravaux();
  }

  function unbuild() {
    if (!built) return;
    var wrap = $('dk-rap'), ms = $('main-scroll'), card = $('tx-travaux').closest('.card');
    if (descMark && descMark.parentNode) { descMark.parentNode.insertBefore(card, descMark); descMark.remove(); }
    card.classList.remove('dk-desc-card');
    wrap.parentNode.insertBefore(ms, wrap);
    wrap.remove();
    var dv = $('dk-dvx'); if (dv) dv.remove();
    built = false; viewing = null;
    if (typeof autoGrowTravaux === 'function') autoGrowTravaux();
  }

  // Onglet Travaux : la colonne de droite (description + rapport) s'élargit jusqu'au panneau du devis
  function markTab() {
    var w = $('dk-rap'), s3 = $('sec-3');
    if (w) w.classList.toggle('dk-tx', !!(s3 && s3.classList.contains('active')));
  }

  function sync() { if (on()) build(); else unbuild(); }

  /* ── Chantier courant et ses rapports ─────────────────────── */
  function chantierNom() { var el = $('rj-chantier'); return el ? el.value.trim() : ''; }
  function chantierObj() {
    var nm = chantierNom().toLowerCase(); if (!nm) return null;
    return lsJSON('rv6_chantiers_v1', []).find(function (x) { return (x.nom || '').trim().toLowerCase() === nm; }) || null;
  }
  function sameChantier(r) { return (r.chantier || '').trim().toLowerCase() === chantierNom().toLowerCase(); }

  function reportsDuChantier() {
    var nm = chantierNom(); if (!nm) return [];
    var map = {};
    var c = chantierObj();
    var arch = c ? (archive[c.id] || (lsJSON('rv6_ch_rapports', {})[c.id]) || []) : [];
    arch.forEach(function (r) { if (r && r.id != null) map[String(r.id)] = { r: r, local: false }; });
    // Les rapports du module (30 jours) passent devant : statut Trello, export, etc.
    (typeof getReports === 'function' ? getReports() : []).filter(sameChantier)
      .forEach(function (r) { map[String(r.id)] = { r: r, local: true }; });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
      var d = String(b.r.date || '').localeCompare(String(a.r.date || ''));
      return d || (new Date(b.r.savedAt || 0) - new Date(a.r.savedAt || 0));
    });
  }

  function fetchArchive(force) {
    var c = chantierObj();
    if (!c || typeof _db === 'undefined' || typeof _auth === 'undefined' || !_auth.currentUser) return;
    if (!force && lastFetch[c.id] && Date.now() - lastFetch[c.id] < 60000) return;
    lastFetch[c.id] = Date.now();
    _db.collection('chantiers').where('chantierId', '==', c.id).get().then(function (s) {
      archive[c.id] = s.docs.map(function (d) { return d.data(); })
        .filter(function (x) { return x.type === 'rapport' && x.report; })
        .map(function (x) { return x.report; });
      if (built) renderDays();
    }).catch(function (e) { console.warn('Rapports du chantier', e); });
  }

  /* ── Colonne de gauche : les jours ─────────────────────────── */
  function dayParts(date) {
    var d = new Date((date || '') + 'T12:00:00');
    if (isNaN(d)) return { day: '?', month: '', wd: '' };
    return {
      day: d.toLocaleDateString('fr-CH', { day: '2-digit' }),
      month: d.toLocaleDateString('fr-CH', { month: 'short' }).replace('.', ''),
      wd: d.toLocaleDateString('fr-CH', { weekday: 'short' }).replace('.', ''),
      year: d.getFullYear()
    };
  }
  function moTotal(r) { return (r.employes || []).reduce(function (s, e) { return s + num(e.heures); }, 0); }

  function renderDays() {
    if (!built) return;
    var nm = chantierNom();
    $('dkd-ch').textContent = nm || '';
    var list = $('dkd-list');
    var draftDate = ($('rj-date') || {}).value;
    var dp = dayParts(draftDate);
    var h = '<button type="button" class="dkd-item draft' + (viewing ? '' : ' on') + '" data-k="draft" title="Brouillon en cours">' +
      '<span class="dkd-date"><b>' + esc(dp.day) + '</b><small>' + esc(dp.month) + '</small></span>' +
      '<span class="dkd-meta"><b>✏️ Brouillon</b><small>' + esc(dp.wd) + ' · en cours</small></span></button>';
    if (!nm) {
      h += '<div class="dkd-empty">Choisis un chantier dans l\'onglet En-tête pour voir ses autres rapports.</div>';
    } else {
      var rows = reportsDuChantier();
      var TRX = window.RTrelloRap, yr = new Date().getFullYear();
      if (!rows.length) h += '<div class="dkd-empty">Aucun autre rapport pour ce chantier.</div>';
      rows.forEach(function (x) {
        var r = x.r, p = dayParts(r.date), mo = moTotal(r);
        var trx = false; try { trx = !!(TRX && x.local && TRX.status(r).state === 'done'); } catch (e) {}
        var isOn = viewing && String(viewing.id) === String(r.id);
        h += '<button type="button" class="dkd-item' + (isOn ? ' on' : '') + (trx ? ' trx' : '') + '" data-k="' + esc(r.id) + '" title="' + esc(p.wd + ' ' + p.day + ' ' + p.month + (p.year !== yr ? ' ' + p.year : '')) + '">' +
          '<span class="dkd-date"><b>' + esc(p.day) + '</b><small>' + esc(p.month) + (p.year !== yr ? ' ' + String(p.year).slice(2) : '') + '</small></span>' +
          '<span class="dkd-meta"><b>' + esc(p.wd) + (mo ? ' · ' + mo.toFixed(2) + ' h' : '') + '</b>' +
          '<small>' + esc(r.nom || '—') + (trx ? ' · 🟠 Trello' : '') + '</small></span></button>';
      });
    }
    list.innerHTML = h;
  }

  function onDayClick(e) {
    var b = e.target.closest && e.target.closest('.dkd-item'); if (!b) return;
    var k = b.dataset.k;
    if (k === 'draft') viewing = null;
    else {
      var x = reportsDuChantier().find(function (y) { return String(y.r.id) === k; });
      viewing = x ? x.r : null;
      if (viewing) viewing._local = x.local;
    }
    renderDays(); renderDoc();
    $('dk-doc-scroll').scrollTop = 0;
  }

  /* ── Colonne de droite : le rapport mis en page ───────────── */
  function rows(list) {
    return '<table class="dkr-t">' + list.map(function (x) {
      return '<tr' + (x[2] ? ' class="tot"' : '') + '><td>' + esc(x[0]) + '</td><td>' + esc(x[1]) + '</td></tr>';
    }).join('') + '</table>';
  }
  function sec(title, body) { return '<section class="dkr-s"><h5>' + title + '</h5>' + body + '</section>'; }
  var NONE = function (t) { return '<p class="dkr-none">' + t + '</p>'; };

  function docHTML(r) {
    var d = new Date((r.date || '') + 'T12:00:00');
    var dateStr = isNaN(d) ? '—' : d.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    var allLoc = [];
    try { allLoc = [].concat(LOC_VEHICULES, LOC_MATERIEL, LOC_ENGINS); } catch (e) {}
    var h = '<header class="dkr-hd"><div><b>Rapport journalier</b><small>Risse S.A.</small></div>' +
      '<div class="dkr-hd-r"><b>' + esc(dateStr.charAt(0).toUpperCase() + dateStr.slice(1)) + '</b>' +
      '<span>Chantier : ' + esc(r.chantier || '—') + '</span><span>Responsable : ' + esc(r.nom || '—') + '</span></div></header>';

    var emp = (r.employes || []).filter(function (e) { return num(e.heures) > 0; });
    var mo = emp.map(function (e) { return [e.nom, num(e.heures).toFixed(2) + ' h']; });
    if (emp.length) mo.push(['Total', moTotal(r).toFixed(2) + ' h', true]);
    h += sec("👷 Main d'œuvre", emp.length ? rows(mo) : NONE("Aucune main d'œuvre"));

    var loc = Object.keys(r.location || {}).filter(function (k) { return num(r.location[k]) > 0; }).map(function (k) {
      var l = typeof getLocLabel === 'function' ? getLocLabel(r, k, allLoc) : { label: k, unit: '' };
      return [l.label, r.location[k] + ' ' + (l.unit || '')];
    });
    h += sec('🔧 Location interne', loc.length ? rows(loc) : NONE('Aucune location'));

    h += sec('🏗️ Travaux réalisés', r.travaux ? '<p class="dkr-txt">' + esc(r.travaux) + '</p>' : NONE('Aucune description'));

    if ((r.metres || []).length && typeof metresDetailHTML === 'function') h += sec('📐 Métrés', metresDetailHTML(r.metres));

    var f = (r.fournitures_catalogue || []).filter(function (x) { return num(x.qty) > 0; })
      .map(function (x) { return [(x.subCat ? x.subCat + ' ' : '') + (x.nom || x.cat || ''), x.qty + ' ' + (x.unit || '')]; });
    h += sec('📦 Fournitures', f.length ? rows(f) : NONE('Aucune fourniture'));

    var ev = (r.evacuations || []).map(function (x) { return [x.mat || '—', x.qte + ' ' + (x.unite || '')]; });
    if (ev.length) h += sec('🚛 Évacuations', rows(ev));

    if (r.notes) h += sec('💬 Notes', '<p class="dkr-txt">' + esc(r.notes) + '</p>');
    return h;
  }

  function renderDoc() {
    if (!built) return;
    var bar = $('dk-doc-bar'), doc = $('dk-doc');
    if (!viewing) {
      var data = {}; try { data = collectData(); } catch (e) {}
      bar.className = 'live';
      bar.innerHTML = '<span><b>Aperçu du brouillon</b><small>mis à jour en direct</small></span>' +
        '<button type="button" class="dkb-ok" onclick="finaliserRapport()">✅ Valider</button>';
      doc.className = 'live';
      doc.innerHTML = docHTML(data);
      return;
    }
    var r = viewing, TRX = window.RTrelloRap;
    var p = dayParts(r.date);
    bar.className = 'past';
    bar.innerHTML = '<span><b>Rapport du ' + esc(p.wd + ' ' + p.day + ' ' + p.month) + '</b><small>lecture seule</small></span>' +
      '<button type="button" class="dkb-x" data-a="back" title="Revenir au brouillon">✕</button>';
    doc.className = 'past';
    var actions = '<div class="dkr-act">' +
      '<button type="button" data-a="copy">📝 Copier le texte</button>' +
      '<button type="button" data-a="pdf">📄 PDF</button>' +
      '<button type="button" data-a="edit">✏️ Modifier</button>' +
      (TRX && r._local ? TRX.buttonHtml(r, 'rapTrello') : '') + '</div>';
    doc.innerHTML = docHTML(r) + actions;
  }

  function onDocAction(e) {
    var b = e.target.closest && e.target.closest('[data-a]'); if (!b) return;
    var a = b.dataset.a, r = viewing;
    if (a === 'back') { viewing = null; renderDays(); renderDoc(); return; }
    if (!r) return;
    var txt = function () { try { return r.texte || rapportToTexte(r); } catch (x) { return ''; } };
    if (a === 'copy') copyToClipboard(txt());
    else if (a === 'pdf' && typeof partagerPDF === 'function') partagerPDF(r);
    else if (a === 'edit' && typeof modifierRapport === 'function') {
      Promise.resolve(modifierRapport({ stopPropagation: function () {} }, r.id, r)).then(function () {
        viewing = null; renderDays(); renderDoc();
      });
    }
  }

  /* ── Onglet Travaux : positions du devis ouvertes en permanence ──
     Même fonctionnement que la fenêtre « Depuis le devis » du téléphone
     (mêmes fonctions dvxTap / dvxPick / addDvx…), mais affichée dans la page. */
  function renderDvxPanel(force) {
    var el = $('dk-dvx'); if (!built || !el) return;
    var cid = typeof dvxChantierId === 'function' ? dvxChantierId() : null;
    var d = cid && window.RDevis ? RDevis.get(cid) : null;
    var pos = d ? RDevis.travaux(d) : [];
    var deja = (typeof devisLignes !== 'undefined' ? devisLignes : []).map(function (l) { return l.id; });
    var key = (cid || '') + '|' + pos.length + '|' + deja.join(',');
    if (!force && key === dvxKey) return;
    // Ne pas effacer une sélection en cours
    if (!force && document.querySelector('#dk-dvx .dvx-list') && Object.keys(window.dvxSel || {}).length) return;
    dvxKey = key;
    if (!pos.length) {
      el.className = 'dk-dvx-empty';
      el.innerHTML = cid ? '📄 Aucun devis lu pour ce chantier (à importer depuis la fiche du chantier).' : '📄 Choisis un chantier pour voir les positions de son devis.';
      return;
    }
    try { dvxSel = {}; } catch (e) {}
    if (!window._dvxMemSync && RDevis.syncMemoire) { window._dvxMemSync = 1; RDevis.syncMemoire(); }
    var q = ($('dvx-q') || {}).value || '';
    el.className = 'dvx-sh dk-dvx';
    el.innerHTML = '<div class="dvx-hd"><h3>📄 Positions du devis</h3><span class="dk-dvx-src">' + pos.length + ' positions' + (d.src ? ' · ' + esc(d.src) : '') + '</span></div>' +
      '<input class="dvx-q" id="dvx-q" type="search" placeholder="Rechercher (ex. carrelage, container…)" oninput="dvxFilter()" value="' + esc(q) + '">' +
      '<div class="dvx-list" id="dk-dvx-list"></div>' +
      '<div class="dvx-ft"><button class="dvx-go" id="dvx-go" disabled onclick="addDvx()">Choisis une ou plusieurs positions</button></div>';
    var set = {}; deja.forEach(function (i) { set[i] = 1; });
    var h = '', last = null;
    pos.forEach(function (p) {
      if (p.chT !== last) { last = p.chT; h += '<div class="dvx-ch" data-ch>' + esc(p.chT) + '</div>'; }
      var dq = p.q != null ? RDevis.fmtQ(p.q) + ' ' + esc(p.u || '') : esc(p.u || '');
      h += '<div class="dvx-it" data-id="' + esc(p.id) + '" data-s="' + esc((p.id + ' ' + p.t).toLowerCase()) + '" onclick="dvxTap(this)" title="Double-clic : ajouter directement">' +
        '<div class="dvx-top"><span>' + esc(p.t) + (set[p.id] ? ' <b style="color:var(--teal)">✓</b>' : '') + '</span><span class="dvx-dq">' + (dq ? 'devis ' + dq : '') + '</span></div>' +
        '<div class="dvx-tk" onclick="event.stopPropagation()"></div>' +
        '<div class="dvx-qty" onclick="event.stopPropagation()">Fait aujourd\'hui <input type="text" inputmode="decimal" placeholder="—" oninput="dvxQty(this)"> ' + esc(p.u || '') + '</div></div>';
    });
    // dvxFilter / dvxTaches cherchent #dvx-list : on lui donne cet id
    var list = $('dk-dvx-list'); list.id = 'dvx-list'; list.innerHTML = h;
    if (q) dvxFilter();
  }
  // Double-clic sur une position = ajout direct avec la tâche proposée
  function onDvxDbl(e) {
    var it = e.target.closest && e.target.closest('#dk-dvx .dvx-it'); if (!it) return;
    if (e.target.closest('.dvx-tk, .dvx-qty')) return;
    var id = it.dataset.id;
    if (!(window.dvxSel || {})[id]) dvxTap(it);
    addDvx();
  }

  /* ── Mises à jour automatiques ─────────────────────────────── */
  function queueLive() {
    if (!built || viewing) return;
    clearTimeout(liveTimer);
    liveTimer = setTimeout(renderDoc, 160);
  }
  function queueDays() {
    if (!built) return;
    clearTimeout(daysTimer);
    daysTimer = setTimeout(function () {
      if (viewing && !sameChantier(viewing)) { viewing = null; renderDoc(); }
      renderDays(); fetchArchive(false);
    }, 350);
  }

  // Après validation / suppression / modification : la liste des jours suit
  function wrap(name, after) {
    var f = window[name]; if (typeof f !== 'function' || f._dk) return;
    var w = function () { var res = f.apply(this, arguments); try { after(); } catch (e) {} return res; };
    w._dk = true; window[name] = w;
  }

  function init() {
    sync();
    new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['class'] });

    document.addEventListener('click', function (e) {
      if (!built) return;
      if ($('dk-days').contains(e.target)) { onDayClick(e); return; }
      if ($('dk-doc-box').contains(e.target)) { onDocAction(e); return; }
      queueLive();
    });
    ['input', 'change', 'keyup'].forEach(function (t) { document.addEventListener(t, queueLive, true); });
    document.addEventListener('input', function (e) { if (e.target && e.target.id === 'rj-chantier') queueDays(); }, true);
    document.addEventListener('change', function (e) { if (e.target && (e.target.id === 'rj-chantier' || e.target.id === 'rj-date')) queueDays(); }, true);

    wrap('renderHistoriqueInline', function () { if (built) { renderDays(); renderDoc(); } });
    wrap('resetRapport', function () { if (built) { viewing = null; renderDays(); renderDoc(); renderDvxPanel(true); } });
    wrap('updateHeader', queueDays);
    wrap('goSection', markTab);
    wrap('renderDvBar', function () { renderDvxPanel(false); });
    wrap('addDvx', function () { renderDvxPanel(true); });
    wrap('delDvx', function () { renderDvxPanel(true); });
    document.addEventListener('dblclick', function (e) { if (built) onDvxDbl(e); });
    // Sur PC, « Depuis le devis » mène au panneau de l'onglet Travaux
    var od = window.openDvx;
    if (typeof od === 'function') window.openDvx = function () {
      if (!built) return od.apply(this, arguments);
      goSection(3); renderDvxPanel(true); var q = $('dvx-q'); if (q) q.focus();
    };

    // Les rapports archivés arrivent après la connexion
    if (typeof _auth !== 'undefined') _auth.onAuthStateChanged(function (u) { if (u && built) { renderDays(); renderDoc(); fetchArchive(true); } });
    // Retour sur l'onglet après un passage dans Chantiers : on recharge
    document.addEventListener('visibilitychange', function () { if (!document.hidden && built) { renderDays(); fetchArchive(false); } });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
