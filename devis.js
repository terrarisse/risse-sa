// ═══════════════════════════════════════════════════════════════════════
// devis.js — lecture des devis Sorba (PDF exporté) → positions du devis
// Partagé par les modules Chantiers (lecture + stockage) et Rapport (proposition
// de lignes dans l'onglet Travaux).
//
// Une position = { id:'1.05', ch:'1', chT:'Travaux envisagés', n:'05',
//                  t:'texte complet', u:'ml', q:37, pu:25, regie?, cache? }
//  - regie : position de la section « Prix / tarifs de régie » (pour plus tard :
//            onglet Location / M.O.) → pas proposée dans Travaux
//  - cache : Arrondi, part déduite, Divers et imprévus → pas proposée
//
// Stockage : localStorage 'rv6_devpos' { [chantierId]: doc } + Firestore
//            chantiers/devpos_<chantierId> (synchronisé entre appareils, supprimé
//            avec le chantier car il porte chantierId).
// ═══════════════════════════════════════════════════════════════════════
(function(){
  const LKEY = 'rv6_devpos';
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  let _pdfP = null;

  function loadPdfJs(){
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (_pdfP) return _pdfP;
    _pdfP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = PDFJS + 'pdf.min.js';
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; res(window.pdfjsLib); };
      s.onerror = () => { _pdfP = null; rej(new Error('pdf.js indisponible (réseau ?)')); };
      document.head.appendChild(s);
    });
    return _pdfP;
  }

  // ── Extraction : PDF → pages de lignes [{y, toks:[{x,s}]}] ──────────────
  async function extractPages(src){
    const lib = await loadPdfJs();
    const data = src instanceof Blob ? new Uint8Array(await src.arrayBuffer()) : src;
    const pdf = await lib.getDocument(typeof data === 'string' ? data : { data }).promise;
    const pages = [];
    for (let p = 1; p <= pdf.numPages; p++){
      const tc = await (await pdf.getPage(p)).getTextContent();
      pages.push(tc.items.filter(i => i.str && i.str.trim()).map(i => ({ x: i.transform[4], y: i.transform[5], s: i.str.trim() })));
    }
    return pages;
  }
  function toLines(items){
    const lines = [];
    items.slice().sort((a, b) => b.y - a.y || a.x - b.x).forEach(it => {
      const l = lines.find(L => Math.abs(L.y - it.y) < 2.5);
      if (l) l.toks.push(it); else lines.push({ y: it.y, toks: [it] });
    });
    lines.forEach(l => l.toks.sort((a, b) => a.x - b.x));
    return lines;
  }

  // ── Découpage des positions (format Sorba) ────────────────────────────
  const NUM = /^-?\d{1,3}(?:[ '’]\d{3})*\.\d+$/;
  const mode = arr => { const m = {}; arr.forEach(v => { const k = Math.round(v); m[k] = (m[k] || 0) + 1; }); let b = null, n = 0; for (const k in m) if (m[k] > n) { n = m[k]; b = +k; } return b; };
  const num = s => parseFloat(String(s).replace(/[ '’]/g, ''));

  function parsePages(pages){
    const all = pages.map(toLines);
    // La page 1 (lettre + récapitulation) est ignorée si elle contient la récap.
    const body = all.filter((ls, i) => !(i === 0 && ls.some(l => l.toks.some(t => /^Récapitulation/i.test(t.s)))));
    const lines = [].concat(...body);
    // Colonnes : n° de position (2 chiffres) puis texte → x du n° et du texte
    const posXs = [], descXs = [];
    lines.forEach(l => { const [a, b] = l.toks; if (a && b && /^\d{2,3}$/.test(a.s) && !NUM.test(b.s) && b.x - a.x > 10) { posXs.push(a.x); descXs.push(b.x); } });
    if (!posXs.length) return [];
    const posX = mode(posXs), descX = mode(descXs);
    const near = (x, ref) => Math.abs(x - ref) < 6;

    const out = []; let ch = '', chT = '', top = '', topT = '', cur = null, recap = false, inTitle = false, pending = [];
    const skipLine = l => l.toks.some(t => /^(Report|Page:|Risse SA)$/i.test(t.s) || /^Page:/.test(t.s)) || (l.toks.length === 1 && /^\d\d\.\d\d\.\d{4}$/.test(l.toks[0].s)) || (l.toks[0].x < posX - 5 && /^DV/i.test(l.toks[0].s));
    lines.forEach(l => {
      if (skipLine(l)) { return; }
      // Repère isolé à gauche d'un n° de position (ex. « 3 » devant « 37 ») → ignoré
      if (l.toks.length > 2 && l.toks[0].x < posX - 5 && near(l.toks[1].x, posX) && /^\d{2,3}$/.test(l.toks[1].s) && /^\d{1,2}$/.test(l.toks[0].s)) l = { y: l.y, toks: l.toks.slice(1) };
      const t0 = l.toks[0];
      // Récapitulation de fin de chapitre : ignorée jusqu'au prochain vrai chapitre
      if (l.toks.some(t => /^Récapitulation/i.test(t.s))) { recap = true; cur = null; inTitle = false; pending = []; return; }
      // Chapitre / sous-chapitre : numéro à gauche de la colonne des positions
      if (t0.x < posX - 5 && /^\d{1,2}(\.\d{1,2})*$/.test(t0.s)) {
        if (l.toks.some(t => NUM.test(t.s))) { recap = true; cur = null; inTitle = false; return; } // ligne de récap (montant)
        recap = false; inTitle = true; pending = [];
        const title = l.toks.slice(1).filter(t => !NUM.test(t.s)).map(t => t.s).join(' ');
        if (!t0.s.includes('.')) { top = t0.s; topT = title; }
        ch = t0.s; chT = t0.s.includes('.') && topT ? topT + ' · ' + title : title;
        cur = null; return;
      }
      if (recap) return;
      // Titre de chapitre sur 2 lignes
      if (inTitle && !cur && near(t0.x, descX) && !l.toks.some(t => NUM.test(t.s))) {
        const more = l.toks.map(t => t.s).join(' ');
        chT += ' ' + more; if (!ch.includes('.')) topT = chT; return;
      }
      inTitle = false;
      let toks = l.toks;
      if (near(t0.x, posX) && /^\d{2,3}$/.test(t0.s)) {
        // Texte imprimé au-dessus du n° (Sorba le fait parfois) → début de cette position
        cur = { id: (ch || '0') + '.' + t0.s, ch, top, chT, n: t0.s, d: pending, u: '', q: null, pu: null };
        pending = []; out.push(cur); toks = toks.slice(1);
      } else if (!cur || t0.x < descX - 5) { return; }
      else if (cur.done && !l.toks.some(t => NUM.test(t.s))) { l.toks.forEach(t => pending.push(t.s)); return; }
      else if (cur.done) {
        // Position dont Sorba n'a pas imprimé le n° → n° suivant déduit
        const n = String(parseInt(cur.n, 10) + 1).padStart(cur.n.length, '0');
        cur = { id: (ch || '0') + '.' + n, ch, top, chT, n, d: pending, u: '', q: null, pu: null };
        pending = []; out.push(cur);
      }
      // Depuis la droite : montants (pu, total), quantité (3 décimales), unité
      const nums = [];
      while (toks.length && NUM.test(toks[toks.length - 1].s) && toks[toks.length - 1].x > descX + 60) nums.unshift(toks.pop());
      if (nums.length && toks.length) {
        const u = toks[toks.length - 1];
        if (u.x > descX + 120 && u.s.length <= 5 && !/\s/.test(u.s)) { cur.u = u.s; toks = toks.slice(0, -1); }
      }
      if (nums.length) {
        let i = 0;
        if (/\.\d{3}$/.test(nums[0].s)) { cur.q = num(nums[0].s); i = 1; }
        if (nums[i]) cur.pu = num(nums[i].s);
        cur.done = true;
      }
      toks.forEach(t => cur.d.push(t.s));
    });

    return out.map(p => {
      const t = p.d.join(' ').replace(/\s+/g, ' ').replace(/\s+([,.)])/g, '$1').replace(/'\s+/g, "'").trim();
      const it = { id: p.id, ch: p.ch, chT: p.chT, n: p.n, t, u: p.u };
      if (p.q != null) it.q = p.q;
      if (p.pu != null) it.pu = p.pu;
      const topT = (p.chT || '').split(' · ')[0];
      if (/r[ée]gie/i.test(topT)) it.regie = true;
      if (/^arrondi/i.test(t) || /divers et impr/i.test(topT) || (it.q != null && it.q < 0) || (it.pu != null && it.pu < 0) || /^position de r[ée]serve/i.test(t)) it.cache = true;
      return it;
    }).filter(p => p.t);
  }

  async function parse(src){
    const pages = await extractPages(src);
    const textLen = pages.reduce((n, p) => n + p.length, 0);
    if (textLen < 20) { const e = new Error('Ce PDF est un scan (image) : pas de texte à lire. Utilise l\'export PDF direct de Sorba.'); e.scan = true; throw e; }
    const items = parsePages(pages);
    if (!items.length) throw new Error('Aucune position reconnue (format de devis inconnu ?)');
    return items;
  }

  // ── Stockage local + Firestore ───────────────────────────────────────
  function all(){ try { return JSON.parse(localStorage.getItem(LKEY) || '{}'); } catch (e) { return {}; } }
  function get(cid){ return all()[cid] || null; }
  function setLocal(cid, d){ const a = all(); if (d) a[cid] = d; else delete a[cid]; try { localStorage.setItem(LKEY, JSON.stringify(a)); } catch (e) { console.warn('devpos local', e); } }

  // fs = { save(cid, doc) → Promise, load(cid) → Promise<doc|null>, del(cid) }
  let fs = null;
  function setup(adapter){ fs = adapter; }
  async function store(cid, src, name){
    const items = await parse(src);
    const d = { type: 'devispos', chantierId: cid, src: name || 'Devis.pdf', at: Date.now(), items };
    setLocal(cid, d);
    if (fs) { try { await fs.save(cid, d); } catch (e) { console.warn('Sync positions devis', e); } }
    return d;
  }
  async function fetchRemote(cid){
    if (!fs || !cid) return get(cid);
    try { const d = await fs.load(cid); if (d && d.items) { setLocal(cid, d); return d; } if (d === null) { /* rien sur le cloud */ } } catch (e) { console.warn('Lecture positions devis', e); }
    return get(cid);
  }
  async function remove(cid){ setLocal(cid, null); if (fs && fs.del) { try { await fs.del(cid); } catch (e) {} } }

  // Positions à proposer dans l'onglet Travaux du Rapport
  function travaux(d){ return ((d && d.items) || []).filter(p => !p.regie && !p.cache); }
  // Texte court d'une position (pour la ligne de rapport)
  function court(t, max){ max = max || 90; if (t.length <= max) return t; const c = t.slice(0, max); return c.slice(0, Math.max(c.lastIndexOf(' '), 40)).replace(/[ ,;(]+$/, '') + '…'; }
  const fmtQ = q => (q == null || isNaN(q)) ? '' : (Math.round(q * 100) / 100).toLocaleString('fr-CH', { maximumFractionDigits: 2 });

  window.RDevis = { parse, parsePages, setup, store, get, fetchRemote, remove, travaux, court, fmtQ, all };
})();
