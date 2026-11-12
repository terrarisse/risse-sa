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

  // ── Tâches proposées pour une position (règles du métier) ─────────────
  // « Mise à disposition d'un container…, y compris frais de transports »
  //   → « Transport container… », « Replis container… »
  const VERBES = ['installation','déconstruction','démolition','démontage','dépose','suppression','piquage','chargement','évacuation','coupe','coupes','traçage','creuse','remblayage','remblai','compactage','coffrage','ferraillage','bétonnage','pose','fourniture','fermeture','création','obturation','réglage','talochage','crépissage','rhabillage','implantation','établissement','étayage','protection','protections','nettoyage','sciage','carottage','forage','montage','terrassement','repérage','détection','recherche','entreposage','transport','raclage','encollage','signalisation','location','réalisation','façon','construction','percement','scellement','jointoyage','enrobage','curage','dégrappage','découpe','reprise','renforcement','remise en place','mise en place','remise en état','raccordement','exécution','confection','application','préparation','démolition','dallage','pavage','surfaçage','arrosage','sondage','sondages','tringlage','vidange','pompage','débroussaillage','déplacement','abattage','dessouchage','déblaiement','nivellement','talutage','enlèvement','remplissage','scarification','fraisage','sablage','hydrodémolition','injection','ancrage','chevillage','perçage','meulage','ponçage','bouchardage','lissage','repli','replis','déplacements','brossage','lavage','garnissage','toilage','réfection','transplantation','ébarbage','ragréage','dégagement','modification','ajustage'];
  const LIENS = new Set(['et','de','d\'','du','des','la','le','les','l\'','pour','/',',','direct','directe','directs','franche','franches','soigné','soignée','soignés','éventuel','éventuelle','éventuels','éventuelles','ou','à','au','aux','main','machine','main/machine','manuel','manuelle']);
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  function nettoie(t){
    return t.replace(/\s*,?\s*y\s*c(?:ompris|\.)\b.*$/i, '')
      .replace(/\s*,?\s*(selon (estimation|bon( de livraison)?|métré|plans?)|métrée? (en plus[- ]value|selon .*)|cubée?s? sur v[ée]hicules?|\(effectués en régie\)|selon estimation)\.?\s*$/i, '')
      .replace(/\s*,?\s*(selon (estimation|bon( de livraison)?)|cubée?s? sur v[ée]hicules?)\b.*$/i, '')
      .replace(/[\s,.;]+$/, '').trim();
  }
  function objet(o){
    o = o.replace(/\.\s+\(?[A-ZÀ-Ý].*$/, '').replace(/\s+pour (?:l')?évacuation\b.*$/i, '')
         .replace(/\s*\([^()]*\)?/g, m => /\d/.test(m) && !/compris|forfait|compt/i.test(m) ? m : '').replace(/,?\s*\.\.\./g, '').replace(/[\s,.]*(\.\.\.|…)[\s,.]*$/, '').replace(/[\s,;]+$/, '');
    o = o.replace(/,\s+[A-ZÀ-Ý].*$/, '').replace(/^(hors de l'emprise des travaux|sur (?:votre|la) propriété|après le chantier|(?:au )?mortier|sur place|en place|à pied d'oeuvre|(?:pour )?l'ensemble du chantier)\s+(?:(?:de|du|des)\s+|d')?/i, '')
         .replace(/\s+(sur votre propriété|hors de l'emprise).*$/i, '').replace(/^(d'une|d'un|d'|de la|de l'|des|du|de|une|un|la|le|les|l')(?=\s|[a-zàâéèêîôû])\s*/i, '').trim();
    return court(o, 75);
  }
  const VRX = new RegExp('^(' + VERBES.slice().sort((a, b) => b.length - a.length).map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')s?(?=[\\s,/.]|$)', 'i');
  function genere(t){
    let x = nettoie(t), m;
    // Cas particuliers
    if (/^installation de chantier/i.test(x)) return ['Installation de chantier', 'Repli de chantier'];
    if ((m = x.match(/^frais d'installation\s*\/\s*replis? (?:d'une |d'un |de |des )?(.+)$/i))) return ['Installation ' + objet(m[1]), 'Replis ' + objet(m[1])];
    if ((m = x.match(/^(?:mise|montant) à dispos(?:i)?tion (?:d'une |d'un |de |des )(?!travaux|pour)(.+)$/i))) return ['Transport ' + objet(m[1]), 'Replis ' + objet(m[1])];
    if ((m = x.match(/^(?:frais de )?déplacements? et replis? (?:de |des |d')?(.+)$/i))) return ['Amenée ' + objet(m[1]), 'Replis ' + objet(m[1])];
    if ((m = x.match(/^frais (?:et taxes )?(?:de |d')(?:évacuation|décharge) (?:de |des |d'|du )?(.+)$/i))) return ['Évacuation ' + objet(m[1])];
    if ((m = x.match(/^frais (?:et taxes )?(?:de |d')(déchets.+)$/i))) return ['Évacuation ' + objet(m[1])];
    // Préfixes sans action
    x = x.replace(/^(montant à dispos(?:i)?tion pour (?:la |les |l')?|forfait (?:pour |d')?|plus[- ]value pour (?:la |le |les |l')?|frais de )/i, '')
         .replace(/^(travaux (?:éventuels? )?(?:de |d'|des |du )?)/i, '').replace(/^(la |le |les |l')/i, '');
    return analyse(x, t, '');
  }
  // Suite d'actions en tête (« déconstruction et chargement direct pour évacuation de »)
  // puis l'objet ; une 2e action plus loin (« , création de… », « et de chargement… »)
  // donne ses propres tâches.
  function analyse(x, t, objParent){
    x = x.replace(/\s*\([^()]*\)/g, m => /\d/.test(m) ? m : '');
    const verbes = []; let r = x, prov = false;
    for (let n = 0; n < 12; n++) {
      r = r.replace(/^[\s,/]+/, '');
      const mv = r.match(VRX);
      if (mv) { verbes.push(mv[1].toLowerCase()); r = r.slice(mv[0].length); continue; }
      const ml = r.match(/^(et\/ou|et|de la|de l'|d'une|d'un|de|d'|du|des|la|le|les|l'|une|un|pour|ou|à|au|aux|directe?s?|franches?|soignée?s?|éventuel(?:le)?s?|main\/machine|main|machine|manuelle?|provisoires?|travaux|ponctuels?)(?=[\s,/]|$)|^(d'|l')/i);
      if (ml) { if (/^provisoire/i.test(ml[0])) prov = true; r = r.slice(ml[0].length); continue; }
      break;
    }
    if (!verbes.length) return [];
    r = r.replace(/\s+pour (permettre|la réalisation|réaliser|isoler).*$/i, '');
    // 2e action plus loin dans le texte
    let suite = [];
    const ms = r.match(new RegExp('(,\\s*|\\s+(?:et|ou)\\s+(?:de\\s+|d\'|du\\s+|des\\s+)?)' + VRX.source.slice(1), 'i'));
    if (ms) { suite = analyse(r.slice(ms.index + ms[1].length), t, null); r = r.slice(0, ms.index); }
    r = r.replace(/\s+pour (permettre|la réalisation|réaliser|isoler).*$/i, '');
    let obj = objet(r);
    if (!obj && objParent) obj = objParent;
    const vs = [];
    verbes.forEach(v => {
      if (v === 'coupes') v = 'coupe'; if (v === 'protections') v = 'protection';
      if (v === 'chargement' || v === 'évacuation') v = 'chargement et évacuation';
      if (v === 'déplacements') v = 'déplacement'; if (v === 'repli') v = 'replis';
      if (v === 'fourniture' && (verbes.includes('pose') || verbes.includes('mise en place'))) return;
      if ((v === 'réalisation' || v === 'exécution' || v === 'façon' || v === 'confection') && verbes.length > 1 && !verbes.includes('replis')) return;
      if (!vs.includes(v)) vs.push(v);
    });
    if (vs.includes('dépose') && vs.includes('chargement et évacuation')) { vs.splice(vs.indexOf('chargement et évacuation'), 1); vs[vs.indexOf('dépose')] = 'dépose et évacuation'; }
    const out = vs.map(v => cap(v) + (prov ? ' provisoire' : '') + (obj ? ' ' + obj : (objParent === null ? '\u0000' : '')));
    if ((prov || /provisoire|enlèvement après|^location et pose/i.test(t)) && obj && !vs.some(v => /dépose|enlèvement|replis/.test(v)))
      out.push('Dépose ' + (prov ? vs[0] + ' provisoire ' : '') + obj);
    // Les tâches de la 2e action sans objet reprennent celui-ci
    return out.concat(suite.map(s2 => s2.replace('\u0000', obj ? ' ' + obj : '')));
  }
  function taches(p){
    if (!p || !p.t) return [];
    let g = [];
    try { g = genere(p.t); } catch (e) { g = []; }
    return g.filter((v, i, a) => v && v.length > 3 && a.indexOf(v) === i);
  }

  // ── Mémoire des tâches (corrections de l'équipe, partagées) ───────────
  const MKEY = 'rv6_devtaches';
  const cle = t => { const s = nettoie(t).toLowerCase().replace(/[^a-z0-9àâäçéèêëîïôöûüù]+/g, ' ').trim().slice(0, 80); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return 'k' + (h >>> 0).toString(36); };
  function memAll(){ try { return JSON.parse(localStorage.getItem(MKEY) || '{}'); } catch (e) { return {}; } }
  function memoire(p){ return (memAll()[cle(p.t)] || []).slice(); }
  function memSet(p, list){
    const a = memAll(), k = cle(p.t);
    if (list.length) a[k] = list.slice(0, 8); else delete a[k];
    try { localStorage.setItem(MKEY, JSON.stringify(a)); } catch (e) {}
    if (fs && fs.saveTaches) fs.saveTaches(k, list.length ? list.slice(0, 8) : null).catch(e => console.warn('Mémoire tâches', e));
  }
  function retenir(p, tache){ tache = (tache || '').trim(); if (!tache) return; const l = memoire(p).filter(x => x !== tache); l.unshift(tache); memSet(p, l); }
  function oublier(p, tache){ memSet(p, memoire(p).filter(x => x !== tache)); }
  async function syncMemoire(){
    if (!fs || !fs.loadTaches) return;
    try { const m = await fs.loadTaches(); if (m) { const a = memAll(); Object.assign(a, m); localStorage.setItem(MKEY, JSON.stringify(a)); } } catch (e) { console.warn('Mémoire tâches', e); }
  }

  const fmtQ = q => (q == null || isNaN(q)) ? '' : (Math.round(q * 100) / 100).toLocaleString('fr-CH', { maximumFractionDigits: 2 });

  window.RDevis = { parse, parsePages, setup, store, get, fetchRemote, remove, travaux, court, fmtQ, all, taches, memoire, retenir, oublier, syncMemoire, _nettoie: nettoie };
})();
