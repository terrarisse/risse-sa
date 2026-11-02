/* ═══════════════════════════════════════════════════════════════
   Risse S.A. — Couche PC (desktop.js)
   S'active UNIQUEMENT sur grand écran + souris (≥1100px, pointer:fine).
   Sur téléphone/tablette : ne fait strictement rien.
   Ajoute : barre latérale de navigation, raccourcis clavier,
   clic droit, Échap pour fermer, clavier sur la calculatrice.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var MQ = window.matchMedia('(min-width:1100px) and (pointer:fine)');
  var OFF_KEY = 'rv6_dk_off';
  var root = document.documentElement;
  var BASE = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? new URL('./', s).href : new URL('./', location.href).href;
  })();

  function userOff() { try { return localStorage.getItem(OFF_KEY) === '1'; } catch (e) { return false; } }
  function setUserOff(v) { try { v ? localStorage.setItem(OFF_KEY, '1') : localStorage.removeItem(OFF_KEY); } catch (e) {} }
  function eligible() { return MQ.matches; }
  function active() { return root.classList.contains('dk'); }

  // Appliqué tout de suite (script chargé dans <head>) pour éviter un flash de la vue mobile
  function apply() {
    var on = eligible() && !userOff();
    root.classList.toggle('dk', on);
    root.classList.toggle('dk-eligible', eligible());
    if (document.body) { buildSidebar(); }
  }
  apply();
  if (MQ.addEventListener) MQ.addEventListener('change', apply); else MQ.addListener(apply);

  /* ── Barre latérale ─────────────────────────────────────── */
  var MODULES = [
    { href: 'index.html',               icon: '🏠', label: 'Accueil',        home: true },
    { href: 'rapport/index.html',       icon: '📋', label: 'Rapport' },
    { href: 'chantiers/index.html',     icon: '📁', label: 'Chantiers' },
    { href: 'machine/index.html',       icon: '🚜', label: 'Machines' },
    { href: 'carnet/index.html',        icon: '🗓', label: "Carnet d'heure" },
    { href: 'calculatrice/index.html',  icon: '🧮', label: 'Calculatrice' },
    { href: 'bons/index.html',          icon: '📦', label: 'Bons de régie' },
    { href: 'ressources/index.html',    icon: '📚', label: 'Ressources' }
  ];

  function isCurrent(m) {
    var here = location.pathname.replace(/index\.html$/, '');
    var target = new URL(m.href, BASE).pathname.replace(/index\.html$/, '');
    if (m.home) return here === target;
    return here.indexOf(target) === 0;
  }

  function buildSidebar() {
    if (document.querySelector('.dk-side')) return;
    var nav = document.createElement('nav');
    nav.className = 'dk-side';
    nav.setAttribute('aria-label', 'Modules');
    var html = '<a class="dk-brand" href="' + new URL('index.html', BASE).href + '">' +
      '<img src="' + new URL('icon-192.png', BASE).href + '" alt="">' +
      '<span><b>Risse S.A.</b><small>Gestion de chantier</small></span></a>' +
      '<div class="dk-nav">';
    MODULES.forEach(function (m, i) {
      html += '<a class="dk-item' + (isCurrent(m) ? ' on' : '') + '" href="' + new URL(m.href, BASE).href + '" title="' + m.label + (i < 9 ? ' (Alt+' + (i + 1) + ')' : '') + '">' +
        '<span class="dk-ic">' + m.icon + '</span><span class="dk-lb">' + m.label + '</span>' +
        (i < 9 ? '<kbd>' + (i + 1) + '</kbd>' : '') + '</a>';
    });
    html += '</div><div class="dk-foot">' +
      '<button type="button" class="dk-help-btn" title="Raccourcis clavier (?)">⌨️ Raccourcis</button>' +
      '<button type="button" class="dk-mobile-btn" title="Revenir à l\'affichage téléphone">📱 Vue mobile</button></div>';
    nav.innerHTML = html;
    document.body.appendChild(nav);
    nav.querySelector('.dk-mobile-btn').onclick = function () { setUserOff(true); apply(); };
    nav.querySelector('.dk-help-btn').onclick = toggleHelp;

    var back = document.createElement('button');
    back.type = 'button';
    back.className = 'dk-back-pc';
    back.textContent = '🖥 Vue PC';
    back.title = "Revenir à l'affichage PC";
    back.onclick = function () { setUserOff(false); apply(); };
    document.body.appendChild(back);
  }

  /* ── Aide raccourcis ────────────────────────────────────── */
  function toggleHelp() {
    var h = document.getElementById('dk-help');
    if (h) { h.remove(); return; }
    h = document.createElement('div');
    h.id = 'dk-help';
    h.className = 'dk-help-ov open';
    h.innerHTML = '<div class="dk-help-box"><div class="dk-help-hd"><b>⌨️ Raccourcis clavier</b><button type="button" class="dk-help-x">✕</button></div>' +
      '<table>' +
      '<tr><td><kbd>Alt</kbd> + <kbd>1</kbd>…<kbd>8</kbd></td><td>Changer de module</td></tr>' +
      '<tr><td><kbd>/</kbd></td><td>Rechercher</td></tr>' +
      '<tr><td><kbd>Échap</kbd></td><td>Fermer la fenêtre ouverte</td></tr>' +
      '<tr><td>Clic droit</td><td>Menu (remplace l\'appui long)</td></tr>' +
      '<tr><td><kbd>0</kbd>…<kbd>9</kbd> <kbd>+</kbd> <kbd>-</kbd> <kbd>*</kbd> <kbd>/</kbd> <kbd>Entrée</kbd> <kbd>⌫</kbd></td><td>Calculatrice</td></tr>' +
      '<tr><td><kbd>?</kbd></td><td>Afficher cette aide</td></tr>' +
      '</table></div>';
    h.addEventListener('click', function (e) { if (e.target === h || e.target.classList.contains('dk-help-x')) h.remove(); });
    document.body.appendChild(h);
  }

  /* ── Fermer la fenêtre du dessus avec Échap ─────────────── */
  var OV_SEL = '.open[class*="-ov"], .open[class*="overlay"], .open[class*="modal"], .open[class*="sheet"], #menu-ov, #pdf-viewer, .dk-help-ov';

  function visible(el) {
    if (!el || !el.isConnected) return false;
    var cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
  }
  function topOverlay() {
    var list = Array.prototype.slice.call(document.querySelectorAll(OV_SEL)).filter(function (el) {
      if (!visible(el)) return false;
      var p = getComputedStyle(el).position;
      return p === 'fixed' || p === 'absolute';
    });
    if (!list.length) return null;
    var best = null, bz = -Infinity;
    list.forEach(function (el, i) {
      var z = parseInt(getComputedStyle(el).zIndex, 10); if (isNaN(z)) z = 0;
      if (z >= bz) { bz = z; best = el; }
    });
    return best;
  }
  function stillOpen(el) { return el.isConnected && visible(el) && (el.classList.contains('open') || el.id === 'menu-ov' || el.id === 'pdf-viewer' || el.id === 'dk-help'); }

  function closeTop() {
    // Plan en plein écran (Chantiers)
    var exitPlan = document.getElementById('plan-exit-btn');
    if (exitPlan && visible(exitPlan)) { exitPlan.click(); return true; }

    var ov = topOverlay();
    if (!ov) return false;
    if (ov.id === 'dk-help') { ov.remove(); return true; }
    // 1. Clic sur le fond (la plupart des fenêtres se ferment ainsi)
    ov.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    if (!stillOpen(ov)) return true;
    // 2. Bouton de fermeture
    var btns = ov.querySelectorAll('.modal-close, .ov-close, .close-btn, .sheet-close, .back-btn, [onclick*="close" i], [onclick*="fermer" i], [aria-label*="ermer"]');
    for (var i = 0; i < btns.length; i++) {
      if (visible(btns[i])) { btns[i].click(); if (!stillOpen(ov)) return true; break; }
    }
    // 3. En dernier recours
    if (ov.id === 'menu-ov') { ov.remove(); return true; }
    ov.classList.remove('open');
    return true;
  }

  /* ── Clavier ─────────────────────────────────────────────── */
  function typing(t) {
    if (!t) return false;
    var tag = t.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
  }
  function calcOpen() {
    var c = document.querySelector('.overlay-calc.open, #overlay-calc.open');
    return c && visible(c) ? c : null;
  }
  function flash(sel) {
    // petit retour visuel sur la touche équivalente à l'écran
    var c = calcOpen(); if (!c) return;
    var b = c.querySelector(sel); if (!b) return;
    b.classList.add('dk-press'); setTimeout(function () { b.classList.remove('dk-press'); }, 120);
  }

  document.addEventListener('keydown', function (e) {
    if (!active()) return;
    var k = e.key;

    if (k === 'Escape') {
      if (document.activeElement && typing(document.activeElement) && !topOverlay()) { document.activeElement.blur(); return; }
      if (closeTop()) { e.preventDefault(); }
      return;
    }

    // Alt + chiffre : changer de module
    if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-9]$/.test(k)) {
      var m = MODULES[+k - 1]; if (m) { e.preventDefault(); location.href = new URL(m.href, BASE).href; }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (typing(e.target)) return;

    // Calculatrice ouverte : saisie au clavier
    var calc = calcOpen();
    if (calc) {
      var w = window;
      if (/^[0-9]$/.test(k) && w.calcDigit) { w.calcDigit(k); flash('[onclick="calcDigit(\'' + k + '\')"]'); e.preventDefault(); return; }
      if ((k === '.' || k === ',') && w.calcDigit) { w.calcDigit('.'); flash('[onclick="calcDigit(\'.\')"]'); e.preventDefault(); return; }
      if ('+-*/'.indexOf(k) > -1 && w.calcOp) { w.calcOp(k); flash('[onclick="calcOp(\'' + k + '\')"]'); e.preventDefault(); return; }
      if ((k === 'x' || k === 'X') && w.calcOp) { w.calcOp('*'); e.preventDefault(); return; }
      if ((k === 'Enter' || k === '=') && w.calcEquals) { w.calcEquals(); flash('.calc-btn.eq'); e.preventDefault(); return; }
      if (k === 'Backspace' && w.calcBackspace) { w.calcBackspace(); e.preventDefault(); return; }
      if ((k === 'Delete' || k === 'c' || k === 'C') && w.calcClear) { w.calcClear(); e.preventDefault(); return; }
      return;
    }

    if (k === '?') { toggleHelp(); e.preventDefault(); return; }
    if (k === '/' && !topOverlay()) {
      var s = document.querySelector('input[type="search"], .search-input, input[placeholder*="echercher"]');
      if (s && visible(s)) { e.preventDefault(); s.focus(); s.select && s.select(); }
    }
  });

  /* ── Clic droit = appui long ────────────────────────────── */
  // Liste des éléments pour lesquels le clic droit ouvre le menu de l'app.
  var CTX = [
    { sel: '.chantier-card', fn: function (el) { if (window.openMenu && el.dataset.id && !document.querySelector('.reorder-bar')) { window.openMenu(el.dataset.id); return true; } } }
  ];
  window.DK = window.DK || {};
  window.DK.onContext = function (sel, fn) { CTX.push({ sel: sel, fn: fn }); };

  // Empêche le minuteur d'appui long de démarrer sur un clic droit (évite un double menu)
  document.addEventListener('pointerdown', function (e) {
    if (!active() || e.pointerType !== 'mouse' || e.button === 0) return;
    for (var i = 0; i < CTX.length; i++) if (e.target.closest && e.target.closest(CTX[i].sel)) { e.stopPropagation(); return; }
  }, true);
  document.addEventListener('contextmenu', function (e) {
    if (!active()) return;
    for (var i = 0; i < CTX.length; i++) {
      var el = e.target.closest && e.target.closest(CTX[i].sel);
      if (el && CTX[i].fn(el, e)) { e.preventDefault(); e.stopPropagation(); return; }
    }
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
})();
