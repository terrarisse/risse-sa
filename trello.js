/* ═══════════════════════════════════════════════════════════════
   Risse S.A. — Liaison Trello (trello.js)  — LECTURE SEULE
   • Connexion : chaque appareil clique une fois sur « Connecter Trello ».
     Le jeton reste sur l'appareil (localStorage), jamais dans le code.
   • Lit le tableau « Programme » : colonnes « Semaine NN du JJ.MM au JJ.MM »
     + « Travaux à réaliser ». Les cartes recopiées d'une semaine à l'autre
     sont regroupées par chantier (même titre).
   • Affiche le bloc « Programme de la semaine » sur l'accueil.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ▼▼▼ Clé API Trello (publique, pas secrète) — à coller ici une fois créée ▼▼▼
  var TRELLO_KEY = 'a3e14c63c958348e4255f81fa61d3440';
  // ▲▲▲ https://trello.com/apps/admin → ta Power-Up → onglet « Trello Auth » ▲▲▲

  // ▼▼▼ Adresse du relais Cloudflare (pour afficher les fichiers dans l'app) ▼▼▼
  var TRELLO_PROXY = 'https://risse-trello.terrarisse.workers.dev';
  // ▲▲▲ ex. 'https://risse-trello.TON-NOM.workers.dev' — voir trello-relais-cloudflare.js ▲▲▲

  var LS = { key: 'rv6_trello_key', token: 'rv6_trello_token', board: 'rv6_trello_board', cache: 'rv6_trello_cache' };
  var API = 'https://api.trello.com/1';

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
  function key() { return TRELLO_KEY || lsGet(LS.key) || ''; }
  function token() { return lsGet(LS.token) || ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ── Retour de l'autorisation Trello : …/index.html#token=XXXX ── */
  (function catchToken() {
    var m = location.hash.match(/[#&]token=([0-9a-zA-Z]+)/);
    if (m) {
      lsSet(LS.token, m[1]);
      history.replaceState(null, '', location.pathname + location.search);
    } else if (/[#&]error=/.test(location.hash)) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  })();

  function connect() {
    var ret = location.origin + location.pathname;
    location.href = 'https://trello.com/1/authorize?expiration=never&scope=read' +
      '&callback_method=fragment&name=' + encodeURIComponent('Risse S.A. — App chantier') +
      '&key=' + encodeURIComponent(key()) + '&return_url=' + encodeURIComponent(ret);
  }
  function disconnect() { lsSet(LS.token, null); lsSet(LS.board, null); lsSet(LS.cache, null); }

  function api(path, params) {
    var q = 'key=' + encodeURIComponent(key()) + '&token=' + encodeURIComponent(token());
    for (var p in params) q += '&' + p + '=' + encodeURIComponent(params[p]);
    return fetch(API + path + (path.indexOf('?') > -1 ? '&' : '?') + q, { cache: 'no-store' }).then(function (r) {
      if (r.status === 401) { var e = new Error('unauthorized'); e.code = 401; throw e; }
      if (!r.ok) throw new Error('Trello ' + r.status);
      return r.json();
    });
  }

  /* ── Lecture du tableau ─────────────────────────────────── */
  function listBoards() { return api('/members/me/boards', { filter: 'open', fields: 'name,prefs' }); }

  function loadBoard(boardId) {
    return Promise.all([
      api('/boards/' + boardId, { fields: 'name,url' }),
      api('/boards/' + boardId + '/lists', { filter: 'open', fields: 'name,pos' }),
      api('/boards/' + boardId + '/cards', {
        filter: 'open', fields: 'name,desc,idList,labels,shortUrl,pos,badges',
        attachments: 'true', attachment_fields: 'name,url,mimeType,bytes,date,isUpload'
      })
    ]).then(function (r) {
      var data = { at: Date.now(), board: r[0], lists: r[1], cards: r[2] };
      lsSet(LS.cache, JSON.stringify(data));
      return data;
    });
  }
  function cached() { try { return JSON.parse(lsGet(LS.cache) || 'null'); } catch (e) { return null; } }

  /* ── Interprétation des titres ──────────────────────────── */
  // « Semaine 45 du 02.11 au 08.11 », « Semaine N° 48 du 23.11 au 29.11 »
  function parseWeek(name, refYear) {
    var m = String(name).match(/du\s*(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\s*au\s*(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/i);
    if (!m) return null;
    var y1 = m[3] ? +(m[3].length === 2 ? '20' + m[3] : m[3]) : null;
    var y2 = m[6] ? +(m[6].length === 2 ? '20' + m[6] : m[6]) : null;
    var d1 = +m[1], mo1 = +m[2], d2 = +m[4], mo2 = +m[5];
    if (!y1 && !y2) {
      // année la plus proche d'aujourd'hui
      var now = new Date(), y = refYear || now.getFullYear();
      var cands = [y - 1, y, y + 1].map(function (yy) { return new Date(yy, mo1 - 1, d1); });
      cands.sort(function (a, b) { return Math.abs(a - now) - Math.abs(b - now); });
      y1 = cands[0].getFullYear();
    }
    y1 = y1 || y2; y2 = y2 || (mo2 < mo1 ? y1 + 1 : y1);
    var wk = String(name).match(/semaine\s*(?:n°\s*)?(\d{1,2})/i);
    return { start: new Date(y1, mo1 - 1, d1), end: new Date(y2, mo2 - 1, d2, 23, 59, 59), num: wk ? +wk[1] : null };
  }
  function norm(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/\(.*?\)/g, ' ').replace(/\bdepuis\b.*$/, ' ').replace(/[^a-z0-9/]+/g, ' ').replace(/\s*\/\s*/g, '/').trim();
  }
  // « Client / Lieu (remarque) »
  function parseTitle(name) {
    var s = String(name), notes = [];
    s = s.replace(/\(([^)]*)\)/g, function (_, n) { notes.push(n.trim()); return ' '; }).replace(/\s+/g, ' ').trim();
    var parts = s.split(/\s+\/\s+|\s\/|\/\s/);
    return { client: (parts[0] || s).trim(), lieu: (parts.slice(1).join(' / ') || '').trim(), note: notes.join(' · ') };
  }

  // Organise les données : semaines datées, colonne « à réaliser », groupes de chantiers
  function organize(data) {
    var lists = data.lists.slice().sort(function (a, b) { return a.pos - b.pos; });
    var byList = {};
    data.cards.forEach(function (c) { (byList[c.idList] = byList[c.idList] || []).push(c); });
    Object.keys(byList).forEach(function (k) { byList[k].sort(function (a, b) { return a.pos - b.pos; }); });
    var weeks = [], others = [];
    lists.forEach(function (l) {
      var w = parseWeek(l.name);
      var entry = { id: l.id, name: l.name, cards: byList[l.id] || [], week: w };
      (w ? weeks : others).push(entry);
    });
    weeks.sort(function (a, b) { return a.week.start - b.week.start; });
    var groups = {};
    data.cards.forEach(function (c) {
      var k = norm(c.name);
      var g = groups[k] = groups[k] || { key: k, cards: [], weeks: [] };
      g.cards.push(c);
    });
    weeks.forEach(function (w) { w.cards.forEach(function (c) { var g = groups[norm(c.name)]; if (g && g.weeks.indexOf(w) < 0) g.weeks.push(w); }); });
    return { weeks: weeks, others: others, groups: groups };
  }
  function currentWeekIndex(weeks) {
    var now = new Date();
    for (var i = 0; i < weeks.length; i++) if (now >= weeks[i].week.start && now <= weeks[i].week.end) return i;
    for (var j = 0; j < weeks.length; j++) if (weeks[j].week.start > now) return j; // prochaine semaine prévue
    return weeks.length - 1;
  }
  function attachmentsOf(group) {
    var seen = {}, out = [];
    group.cards.forEach(function (c) {
      (c.attachments || []).forEach(function (a) {
        var k = (a.name || '') + '|' + (a.bytes || '');
        if (seen[k]) return; seen[k] = 1;
        out.push({ a: a, cardId: c.id });
      });
    });
    return out;
  }

  /* ── Ouverture d'une pièce jointe : visionneuse DANS l'app ── */
  var PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise(function (res, rej) {
      var sc = document.createElement('script'); sc.src = PDFJS + 'pdf.min.js';
      sc.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; res(window.pdfjsLib); };
      sc.onerror = rej; document.head.appendChild(sc);
    });
  }
  function proxy() { return (TRELLO_PROXY || lsGet('rv6_trello_proxy') || '').replace(/\/+$/, ''); }
  function downloadBlob(att, cardId) {
    var path = '/1/cards/' + cardId + '/attachments/' + att.id + '/download/' + encodeURIComponent(att.name || 'fichier');
    var auth = { Authorization: 'OAuth oauth_consumer_key="' + key() + '", oauth_token="' + token() + '"' };
    var direct = function () { return fetch('https://api.trello.com' + path, { headers: auth }); };
    var p = proxy() ? fetch(proxy() + path, { headers: auth }) : direct();
    return p.then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); });
  }

  function kindOf(att) {
    var n = (att.name || '').toLowerCase(), m = att.mimeType || '';
    if (/pdf/.test(m) || /\.pdf$/.test(n)) return 'pdf';
    if (/^image\//.test(m) || /\.(jpe?g|png|webp|gif)$/.test(n)) return 'img';
    return 'other';
  }

  function openAttachment(att, cardId, cardUrl) {
    if (!att.isUpload) { window.open(att.url, '_blank'); return; }
    var kind = kindOf(att);
    var ov = document.createElement('div'); ov.className = 'tv-ov';
    ov.innerHTML = '<div class="tv-hd">' +
      '<button class="tv-b tv-x" aria-label="Fermer">✕</button>' +
      '<div class="tv-n">' + esc(att.name) + '</div>' +
      (kind !== 'other' ? '<button class="tv-b" data-z="-1" aria-label="Dézoomer">−</button><button class="tv-b" data-z="1" aria-label="Zoomer">+</button>' : '') +
      '<a class="tv-b" data-dl aria-label="Télécharger" title="Télécharger" style="display:none">⬇</a>' +
      '<a class="tv-b" href="' + esc(cardUrl) + '" target="_blank" rel="noopener" title="Ouvrir dans Trello">↗</a></div>' +
      '<div class="tv-body"><div class="tv-msg">Chargement…</div></div>';
    document.body.appendChild(ov);
    var body = ov.querySelector('.tv-body'), z = 1, blobUrl = null;
    function close() { ov.remove(); document.removeEventListener('keydown', onKey, true); if (blobUrl) setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 1000); }
    function onKey(e) { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); } }
    document.addEventListener('keydown', onKey, true);
    ov.querySelector('.tv-x').onclick = close;
    function applyZoom() {
      body.querySelectorAll('canvas,img').forEach(function (c) { c.style.width = (z * 100) + '%'; });
    }
    function zoomBy(f) { z = Math.max(1, Math.min(5, z * f)); applyZoom(); }
    ov.querySelectorAll('[data-z]').forEach(function (b) { b.onclick = function () { zoomBy(+b.dataset.z > 0 ? 1.4 : 1 / 1.4); }; });
    // pincement à 2 doigts / Ctrl+molette
    var d0 = 0, z0 = 1;
    function dist(e) { return Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }
    body.addEventListener('touchstart', function (e) { if (e.touches.length === 2) { d0 = dist(e); z0 = z; } }, { passive: true });
    body.addEventListener('touchmove', function (e) { if (e.touches.length === 2 && d0) { e.preventDefault(); z = Math.max(1, Math.min(5, z0 * dist(e) / d0)); applyZoom(); } }, { passive: false });
    body.addEventListener('touchend', function (e) { if (e.touches.length < 2) d0 = 0; });
    body.addEventListener('wheel', function (e) { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.003)); } }, { passive: false });

    function fail() {
      ov.querySelector('[data-dl]').style.display = 'none';
      body.innerHTML = '<div class="tv-msg">Impossible d\'afficher ce fichier dans l\'app.' +
        (proxy() ? '' : '<br><small>Le relais Trello n\'est pas encore configuré.</small>') +
        '<a class="tv-cta" href="' + esc(cardUrl) + '" target="_blank" rel="noopener">Ouvrir la carte dans Trello ↗</a></div>';
    }
    downloadBlob(att, cardId).then(function (blob) {
      blobUrl = URL.createObjectURL(blob);
      var dl = ov.querySelector('[data-dl]'); dl.href = blobUrl; dl.download = att.name || 'fichier'; dl.style.display = '';
      if (kind === 'img') {
        body.innerHTML = '<img src="' + blobUrl + '" alt="">';
      } else if (kind === 'pdf') {
        return loadPdfJs().then(function (lib) { return blob.arrayBuffer().then(function (buf) { return lib.getDocument({ data: buf }).promise; }); })
          .then(function (pdf) {
            body.innerHTML = '';
            var w = Math.min(body.clientWidth - 16, 1400) || 340, dpr = Math.min(window.devicePixelRatio || 1, 2);
            var chain = Promise.resolve();
            for (var i = 1; i <= pdf.numPages; i++) (function (n) {
              chain = chain.then(function () {
                return pdf.getPage(n).then(function (pg) {
                  var vp = pg.getViewport({ scale: (w / pg.getViewport({ scale: 1 }).width) * dpr * 1.5 });
                  var cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
                  body.appendChild(cv); applyZoom();
                  return pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
                });
              });
            })(i);
            return chain;
          });
      } else {
        body.innerHTML = '<div class="tv-msg">Ce type de fichier ne peut pas être affiché dans l\'app.<a class="tv-cta" href="' + blobUrl + '" download="' + esc(att.name || 'fichier') + '">⬇ Télécharger « ' + esc(att.name) + ' »</a></div>';
      }
    }).catch(fail);
  }

  /* ── Interface : bloc « Programme de la semaine » ──────── */
  var CSS = '' +
    '.tw-box{background:#fff;border:1px solid var(--border,#E0E4EF);border-radius:var(--r,14px);box-shadow:var(--sh,0 2px 12px rgba(27,58,107,.1));margin-bottom:28px;overflow:hidden;}' +
    '.tw-hd{display:flex;align-items:center;gap:8px;padding:12px 12px 12px 14px;background:#C0392B;background:linear-gradient(90deg,#B03A2E,#E2622C);color:#fff;}' +
    '.tw-hd-t{flex:1;min-width:0;}.tw-hd-t b{display:block;font-size:14px;}.tw-hd-t small{display:block;font-size:11px;opacity:.8;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.tw-nav{background:rgba(255,255,255,.18);border:none;color:#fff;width:32px;height:32px;border-radius:8px;font-size:18px;cursor:pointer;flex-shrink:0;}' +
    '.tw-nav:disabled{opacity:.35;cursor:default;}' +
    '.tw-tabs{display:flex;gap:6px;padding:10px 12px 0;overflow-x:auto;scrollbar-width:none;}.tw-tabs::-webkit-scrollbar{display:none;}' +
    '.tw-tab{flex-shrink:0;border:1px solid var(--border,#E0E4EF);background:#fff;color:#4A5878;font:600 11px Inter,sans-serif;padding:6px 10px;border-radius:20px;cursor:pointer;}' +
    '.tw-tab.on{background:#1B3A6B;border-color:#1B3A6B;color:#fff;}' +
    '.tw-list{padding:10px 12px 12px;display:grid;gap:8px;}' +
    '.tw-card{display:flex;align-items:center;gap:10px;background:#F4F6FB;border:1px solid transparent;border-radius:10px;padding:10px 12px;cursor:pointer;text-align:left;width:100%;font-family:inherit;}' +
    '.tw-card:active{transform:scale(.98);}' +
    '.tw-card-b{flex:1;min-width:0;}.tw-card-n{font-size:13.5px;font-weight:700;color:#1A2340;line-height:1.25;}' +
    '.tw-card-s{font-size:11.5px;color:#4A5878;margin-top:2px;}.tw-card-m{display:flex;gap:8px;margin-top:5px;font-size:11px;color:#9AA3BC;align-items:center;flex-wrap:wrap;}' +
    '.tw-lbl{display:inline-block;width:26px;height:6px;border-radius:3px;}' +
    '.tw-arrow{color:#9AA3BC;font-size:18px;}' +
    '.tw-empty{padding:18px 14px;text-align:center;color:#9AA3BC;font-size:13px;}' +
    '.tw-cta{display:block;margin:4px 14px 16px;padding:13px;border:none;border-radius:12px;background:#1B3A6B;color:#fff;font:700 14px Inter,sans-serif;cursor:pointer;width:calc(100% - 28px);}' +
    '.tw-foot{display:flex;justify-content:space-between;align-items:center;padding:0 14px 10px;font-size:10.5px;color:#9AA3BC;}' +
    '.tw-foot button{border:none;background:none;color:#4A5878;font:600 11px Inter,sans-serif;cursor:pointer;padding:4px;}' +
    '.tw-input{width:100%;padding:11px 12px;border:1.5px solid #E0E4EF;border-radius:10px;font:14px Inter,sans-serif;margin:0 0 8px;}' +
    /* fiche d'une carte (bottom sheet → centrée sur PC automatiquement) */
    '.tw-ov{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.5);display:flex;align-items:flex-end;font-family:Inter,sans-serif;}' +
    '.tw-sh{background:#fff;border-radius:20px 20px 0 0;width:100%;max-height:88vh;overflow-y:auto;padding:18px 16px calc(20px + env(safe-area-inset-bottom,0px));}' +
    '.tw-sh-hd{display:flex;align-items:flex-start;gap:10px;margin-bottom:6px;}.tw-sh-hd b{flex:1;font-size:17px;color:#1A2340;line-height:1.25;}' +
    '.tw-x{border:none;background:#EAECF4;border-radius:50%;width:32px;height:32px;cursor:pointer;flex-shrink:0;}' +
    '.tw-sec{font-size:10px;font-weight:700;color:#9AA3BC;text-transform:uppercase;letter-spacing:.8px;margin:16px 0 8px;}' +
    '.tw-desc{font-size:13px;color:#4A5878;line-height:1.5;white-space:pre-line;background:#F4F6FB;border-radius:10px;padding:10px 12px;}' +
    '.tw-weeks{display:flex;flex-wrap:wrap;gap:6px;}.tw-wk{font-size:11px;font-weight:700;background:#FFF3E6;color:#B4541A;padding:4px 9px;border-radius:20px;}' +
    '.tw-att{display:flex;align-items:center;gap:12px;padding:11px 12px;border:1px solid #E0E4EF;border-radius:12px;margin-bottom:8px;cursor:pointer;background:#fff;width:100%;text-align:left;font-family:inherit;}' +
    '.tw-att-i{font-size:24px;}.tw-att-b{flex:1;min-width:0;}.tw-att-n{font-size:13px;font-weight:600;color:#1A2340;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.tw-att-m{font-size:11px;color:#9AA3BC;margin-top:2px;}' +
    '.tw-open{display:block;text-align:center;margin-top:14px;padding:13px;border-radius:12px;background:#EAECF4;color:#1B3A6B;font-weight:700;font-size:14px;text-decoration:none;}' +
    'html.dk .tw-card:hover,html.dk .tw-att:hover{border-color:#1B3A6B;background:#fff;}' +
    'html.dk .tw-list{grid-template-columns:repeat(auto-fill,minmax(300px,1fr));}' +
    'html.dk .tw-nav:not(:disabled):hover{background:rgba(255,255,255,.3);}' +
    /* visionneuse */
    '.tv-ov{position:fixed;inset:0;z-index:700;background:#111214;display:flex;flex-direction:column;font-family:Inter,sans-serif;padding-top:env(safe-area-inset-top,0px);}' +
    '.tv-hd{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#1B3A6B;color:#fff;flex-shrink:0;}' +
    '.tv-n{flex:1;min-width:0;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.tv-b{flex-shrink:0;border:none;background:rgba(255,255,255,.15);color:#fff;border-radius:10px;min-width:38px;height:38px;padding:0 10px;font-size:17px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;}' +
    '.tv-body{flex:1;overflow:auto;padding:8px;-webkit-overflow-scrolling:touch;text-align:center;}' +
    '.tv-body canvas,.tv-body img{display:block;width:100%;max-width:none;margin:0 auto 8px;background:#fff;border-radius:4px;box-shadow:0 1px 6px rgba(0,0,0,.4);}' +
    '.tv-msg{color:#C9CED8;font-size:14px;padding:40px 20px;line-height:1.5;}' +
    '.tv-cta{display:block;max-width:320px;margin:18px auto 0;padding:13px;border-radius:12px;background:#F0A500;color:#1B3A6B;font-weight:700;text-decoration:none;}';
  function injectCss() {
    if (document.getElementById('tw-style')) return;
    var st = document.createElement('style'); st.id = 'tw-style'; st.textContent = CSS; document.head.appendChild(st);
  }

  var LABEL_COLORS = { green: '#4BCE97', yellow: '#F5CD47', orange: '#FEA362', red: '#F87168', purple: '#9F8FEF', blue: '#579DFF', sky: '#6CC3E0', lime: '#94C748', pink: '#E774BB', black: '#8590A2' };
  function fileIcon(a) {
    var n = (a.name || '').toLowerCase(), m = a.mimeType || '';
    if (!a.isUpload) return '🔗';
    if (/pdf/.test(m) || /\.pdf$/.test(n)) return '📄';
    if (/^image\//.test(m) || /\.(jpe?g|png|heic|webp|gif)$/.test(n)) return '🖼️';
    if (/\.(xlsx?|csv|ods)$/.test(n)) return '📊';
    if (/\.(docx?|odt|txt)$/.test(n)) return '📝';
    if (/\.(dwg|dxf)$/.test(n)) return '📐';
    return '📎';
  }
  function fmtBytes(b) { if (!b) return ''; return b > 1048576 ? (b / 1048576).toFixed(1) + ' Mo' : Math.max(1, Math.round(b / 1024)) + ' Ko'; }
  function fmtD(d) { return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2); }
  function ago(t) { var m = Math.round((Date.now() - t) / 60000); return m < 1 ? "à l'instant" : m < 60 ? 'il y a ' + m + ' min' : 'il y a ' + Math.round(m / 60) + ' h'; }

  function mountWeek(el) {
    if (!el) return;
    injectCss();
    var state = { view: null, org: null, data: cached(), loading: false, error: '' };

    function render() {
      var h = '';
      if (!key()) {
        h = '<div class="tw-box"><div class="tw-hd"><div class="tw-hd-t"><b>📅 Programme Trello</b><small>Configuration</small></div></div>' +
          '<div class="tw-empty" style="text-align:left">Colle ici la <b>clé API Trello</b> (une seule fois) :</div>' +
          '<div style="padding:0 14px 6px"><input class="tw-input" id="tw-key" placeholder="Clé API (32 caractères)" autocomplete="off"></div>' +
          '<button class="tw-cta" id="tw-savekey">Enregistrer la clé</button></div>';
        el.innerHTML = h;
        el.querySelector('#tw-savekey').onclick = function () { var v = el.querySelector('#tw-key').value.trim(); if (v) { lsSet(LS.key, v); render(); } };
        return;
      }
      if (!token()) {
        el.innerHTML = '<div class="tw-box"><div class="tw-hd"><div class="tw-hd-t"><b>📅 Programme de la semaine</b><small>Depuis Trello</small></div></div>' +
          '<div class="tw-empty">Affiche ici les chantiers prévus cette semaine dans Trello.</div>' +
          '<button class="tw-cta" id="tw-connect">Connecter Trello</button></div>';
        el.querySelector('#tw-connect').onclick = connect;
        return;
      }
      if (!lsGet(LS.board)) { renderBoardPicker(); return; }
      if (!state.data) {
        el.innerHTML = '<div class="tw-box"><div class="tw-hd"><div class="tw-hd-t"><b>📅 Programme de la semaine</b><small>Chargement…</small></div></div><div class="tw-empty">' + (state.error || 'Chargement du tableau Trello…') + '</div></div>';
        return;
      }
      state.org = state.org || organize(state.data);
      var org = state.org, tabs = org.weeks.concat(org.others);
      if (state.view == null) state.view = org.weeks.length ? currentWeekIndex(org.weeks) : 0;
      var cur = tabs[state.view] || tabs[0];
      var isWeek = cur && !!cur.week;
      var title = !cur ? 'Programme' : isWeek ? 'Semaine ' + (cur.week.num || '') : cur.name;
      var sub = !cur ? '' : isWeek ? 'du ' + fmtD(cur.week.start) + ' au ' + fmtD(cur.week.end) + (isThisWeek(cur) ? ' · cette semaine' : '') : cur.cards.length + ' carte(s)';
      h = '<div class="tw-box"><div class="tw-hd">' +
        '<button class="tw-nav" data-nav="-1" ' + (state.view <= 0 ? 'disabled' : '') + ' aria-label="Précédent">‹</button>' +
        '<div class="tw-hd-t"><b>📅 ' + esc(title) + '</b><small>' + esc(sub) + '</small></div>' +
        '<button class="tw-nav" data-nav="1" ' + (state.view >= tabs.length - 1 ? 'disabled' : '') + ' aria-label="Suivant">›</button></div>';
      h += '<div class="tw-tabs">' + tabs.map(function (t, i) {
        var lbl = t.week ? 'S' + (t.week.num || fmtD(t.week.start)) : t.name;
        return '<button class="tw-tab' + (i === state.view ? ' on' : '') + '" data-tab="' + i + '">' + esc(lbl) + ' · ' + t.cards.length + '</button>';
      }).join('') + '</div>';
      if (!cur || !cur.cards.length) h += '<div class="tw-empty">Aucun chantier dans cette colonne.</div>';
      else h += '<div class="tw-list">' + cur.cards.map(function (c) {
        var t = parseTitle(c.name), g = org.groups[norm(c.name)];
        var nAtt = g ? attachmentsOf(g).length : (c.attachments || []).length;
        var labels = (c.labels || []).map(function (l) { return '<span class="tw-lbl" title="' + esc(l.name || '') + '" style="background:' + (LABEL_COLORS[(l.color || '').split('_')[0]] || '#C1C7D0') + '"></span>'; }).join('');
        var cl = c.badges && c.badges.checkItems ? '☑ ' + c.badges.checkItemsChecked + '/' + c.badges.checkItems : '';
        return '<button class="tw-card" data-card="' + c.id + '"><div class="tw-card-b">' +
          '<div class="tw-card-n">' + esc(t.client) + (t.lieu ? ' <span style="font-weight:500;color:#4A5878">· ' + esc(t.lieu) + '</span>' : '') + '</div>' +
          (t.note ? '<div class="tw-card-s">' + esc(t.note) + '</div>' : '') +
          '<div class="tw-card-m">' + labels + (nAtt ? '<span>📎 ' + nAtt + '</span>' : '') + (cl ? '<span>' + cl + '</span>' : '') +
          (g && g.weeks.length > 1 ? '<span>🗓 ' + g.weeks.length + ' sem.</span>' : '') + '</div></div><span class="tw-arrow">›</span></button>';
      }).join('') + '</div>';
      h += '<div class="tw-foot"><span>' + esc(state.data.board && state.data.board.name || '') + ' · mis à jour ' + ago(state.data.at) + (state.loading ? ' · ⟳' : '') + '</span>' +
        '<span><button data-act="refresh">⟳ Actualiser</button><button data-act="settings">⚙</button></span></div></div>';
      el.innerHTML = h;

      el.querySelectorAll('[data-nav]').forEach(function (b) { b.onclick = function () { state.view += +b.dataset.nav; render(); }; });
      el.querySelectorAll('[data-tab]').forEach(function (b) { b.onclick = function () { state.view = +b.dataset.tab; render(); }; });
      el.querySelectorAll('[data-card]').forEach(function (b) { b.onclick = function () { openCard(b.dataset.card); }; });
      el.querySelector('[data-act="refresh"]').onclick = refresh;
      el.querySelector('[data-act="settings"]').onclick = settings;
      var on = el.querySelector('.tw-tab.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    function isThisWeek(w) { var n = new Date(); return n >= w.week.start && n <= w.week.end; }

    function renderBoardPicker() {
      el.innerHTML = '<div class="tw-box"><div class="tw-hd"><div class="tw-hd-t"><b>📅 Choisir le tableau</b><small>Trello</small></div></div><div class="tw-empty">Chargement de tes tableaux…</div></div>';
      listBoards().then(function (boards) {
        var auto = boards.filter(function (b) { return /programme/i.test(b.name); });
        if (auto.length === 1) { lsSet(LS.board, auto[0].id); refresh(); return; }
        el.querySelector('.tw-empty').outerHTML = '<div class="tw-list">' + boards.map(function (b) {
          return '<button class="tw-card" data-board="' + b.id + '"><div class="tw-card-b"><div class="tw-card-n">' + esc(b.name) + '</div></div><span class="tw-arrow">›</span></button>';
        }).join('') + '</div>';
        el.querySelectorAll('[data-board]').forEach(function (b) { b.onclick = function () { lsSet(LS.board, b.dataset.board); refresh(); }; });
      }).catch(handleErr);
    }

    function refresh() {
      var bid = lsGet(LS.board); if (!bid) { render(); return; }
      state.loading = true; if (state.data) render();
      loadBoard(bid).then(function (d) {
        var keepView = state.org && state.view != null && state.data && state.data.board && d.board.id === state.data.board.id;
        state.data = d; state.org = null; state.loading = false; state.error = '';
        if (!keepView) state.view = null;
        render();
      }).catch(handleErr);
    }
    function handleErr(e) {
      state.loading = false;
      if (e && e.code === 401) { disconnect(); state.data = null; render(); return; }
      state.error = navigator.onLine === false ? 'Hors connexion — affichage de la dernière version.' : 'Impossible de joindre Trello pour le moment.';
      render();
    }
    function settings() {
      rsAsk('Trello', [
        { label: '🔁 Changer de tableau', fn: function () { lsSet(LS.board, null); lsSet(LS.cache, null); state.data = null; state.org = null; render(); } },
        { label: '🔌 Déconnecter Trello', fn: function () { disconnect(); state.data = null; state.org = null; render(); } }
      ]);
    }

    function openCard(id) {
      var org = state.org, c = state.data.cards.find(function (x) { return x.id === id; }); if (!c) return;
      var g = org.groups[norm(c.name)] || { cards: [c], weeks: [] };
      var t = parseTitle(c.name), atts = attachmentsOf(g);
      var desc = g.cards.map(function (x) { return x.desc; }).filter(Boolean).sort(function (a, b) { return b.length - a.length; })[0] || '';
      var ov = document.createElement('div'); ov.className = 'tw-ov';
      ov.innerHTML = '<div class="tw-sh">' +
        '<div class="tw-sh-hd"><b>' + esc(t.client) + (t.lieu ? '<br><span style="font-size:13px;font-weight:500;color:#4A5878">📍 ' + esc(t.lieu) + '</span>' : '') + '</b><button class="tw-x" aria-label="Fermer">✕</button></div>' +
        (t.note ? '<div style="font-size:13px;color:#B4541A;font-weight:600">' + esc(t.note) + '</div>' : '') +
        (g.weeks.length ? '<div class="tw-sec">Prévu au programme</div><div class="tw-weeks">' + g.weeks.map(function (w) { return '<span class="tw-wk">S' + (w.week.num || '') + ' · ' + fmtD(w.week.start) + '–' + fmtD(w.week.end) + '</span>'; }).join('') + '</div>' : '') +
        (desc ? '<div class="tw-sec">Description</div><div class="tw-desc">' + esc(desc) + '</div>' : '') +
        '<div class="tw-sec">Pièces jointes (' + atts.length + ')</div>' +
        (atts.length ? atts.map(function (x, i) {
          return '<button class="tw-att" data-att="' + i + '"><span class="tw-att-i">' + fileIcon(x.a) + '</span><span class="tw-att-b"><div class="tw-att-n">' + esc(x.a.name || x.a.url) + '</div>' +
            '<div class="tw-att-m">' + [fmtBytes(x.a.bytes), x.a.date ? new Date(x.a.date).toLocaleDateString('fr-CH') : ''].filter(Boolean).join(' · ') + '</div></span><span class="tw-arrow">›</span></button>';
        }).join('') : '<div class="tw-empty" style="padding:6px 0">Aucune pièce jointe.</div>') +
        '<a class="tw-open" href="' + esc(c.shortUrl) + '" target="_blank" rel="noopener">Ouvrir la carte dans Trello ↗</a></div>';
      function close() { ov.remove(); }
      ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
      ov.querySelector('.tw-x').onclick = close;
      ov.querySelectorAll('[data-att]').forEach(function (b) {
        b.onclick = function () { var x = atts[+b.dataset.att]; var src = g.cards.find(function (cc) { return cc.id === x.cardId; }) || c; openAttachment(x.a, x.cardId, src.shortUrl); };
      });
      document.body.appendChild(ov);
    }

    render();
    if (key() && token() && lsGet(LS.board)) refresh();
  }

  // petit menu d'actions (réutilise le style des confirmations si disponible)
  function rsAsk(title, actions) {
    var ov = document.createElement('div'); ov.className = 'tw-ov';
    ov.innerHTML = '<div class="tw-sh"><div class="tw-sh-hd"><b>' + esc(title) + '</b><button class="tw-x">✕</button></div>' +
      actions.map(function (a, i) { return '<button class="tw-att" data-i="' + i + '"><span class="tw-att-b"><div class="tw-att-n">' + esc(a.label) + '</div></span></button>'; }).join('') + '</div>';
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    ov.querySelector('.tw-x').onclick = function () { ov.remove(); };
    ov.querySelectorAll('[data-i]').forEach(function (b) { b.onclick = function () { ov.remove(); actions[+b.dataset.i].fn(); }; });
    document.body.appendChild(ov);
  }

  window.RTrello = {
    connected: function () { return !!(key() && token()); },
    cached: cached, organize: organize, parseWeek: parseWeek, parseTitle: parseTitle, norm: norm,
    mountWeek: mountWeek, connect: connect, disconnect: disconnect
  };
})();
