// ═══════════════════════════════════════════════════════════════
// POSTES — base de postes de travaux (texte complet style Sorba)
// Partagée par Ressources (gestion) et Rapport (propositions en écrivant).
// Stockage (comme les autres listes de Ressources) :
//  - postes     : localStorage rv6_postes, Firestore ressources/postes { items }
//                 item = { id, nom (texte complet), catId, subCatId, icon, photo }
//  - catégories : rv6_res_categories.postes (Firestore ressources/_categories),
//                 avec sous-catégories (children), gérées par ⊞ Catégories
//  - méta       : ressources/postes_meta { seeded, ignores }
// BASE = postes tirés des devis / factures fournis. Chaque poste de la base
// n'est ajouté qu'une fois (id dans « seeded ») : un poste supprimé dans
// Ressources ne revient pas.
// ═══════════════════════════════════════════════════════════════
(function () {
  const KEY = 'rv6_postes', SEED_KEY = 'rv6_postes_seeded', USE_KEY = 'rv6_postes_usage', IGN_KEY = 'rv6_postes_ign', CATS_KEY = 'rv6_res_categories', HAB_KEY = 'rv6_postes_hab';

  // Pour ajouter des postes : nouvelles lignes avec un id jamais utilisé.
  const BASE = [
    // ── Installation de chantier
    ['pb001', 'Installation de chantier', "Installation de chantier, déplacements, déplacement de matériel et outillage à pied d'œuvre"],
    ['pb002', 'Installation de chantier', 'Déplacements et replis de machines de terrassement'],
    ['pb003', 'Installation de chantier', "Signalisation de chantier pour l'ensemble des travaux"],
    ['pb004', 'Installation de chantier', 'Implantation des lignes et établissement des niveaux'],
    // ── Terrassement / fondation
    ['pb010', 'Terrassement', 'Travaux de préparation et de réglage, compactage soigné des surfaces, y compris chargement direct des matériaux excédentaires pour évacuation'],
    ['pb011', 'Terrassement', "Travaux de creuse de l'encaissement, y compris chargement direct des gravats pour évacuation"],
    ['pb012', 'Terrassement', 'Plus-value pour le réglage des niveaux et compactage soigné des planies'],
    ['pb013', 'Terrassement', "Fourniture et mise en place d'une natte géotextile"],
    ['pb014', 'Terrassement', 'Fourniture et mise en place de tout-venant recyclé 0/32 mm dans les encaissements, cubé sur véhicule'],
    ['pb015', 'Terrassement', 'Fourniture et mise en place de 3 à 5 cm de gravier 4/8 mm pour le réglage des surfaces, prêt à recevoir des dalles de jardin ou un pavage'],
    // ── Évacuations
    ['pb020', 'Évacuations', "Taxes et frais d'évacuation de terre ou gravats excédentaires, cubés sur véhicule"],
    ['pb021', 'Évacuations', "Frais et taxes d'évacuation de déblais terreux non pollués, cubés sur véhicule"],
    ['pb022', 'Évacuations', "Frais et taxes d'évacuation de déblais terreux pollués avec de la terre cuite, cubés sur véhicule"],
    // ── Enrobé
    ['pb030', 'Enrobé', "Forfait pour matériel, machines et outillage nécessaires à la mise en œuvre de l'enrobé bitumineux"],
    ['pb031', 'Enrobé', "Réalisation de coupes franches dans de l'enrobé bitumineux"],
    ['pb032', 'Enrobé', "Dégrappage et chargement direct pour évacuation de l'enrobé bitumineux"],
    ['pb033', 'Enrobé', "Frais de concassage sur place de l'enrobé bitumineux et de mise en place"],
    ['pb034', 'Enrobé', "Fourniture et pose à la main d'un enrobé de type ACT 11 N, ~8 cm après compactage, y compris tous raccords avec l'existant"],
    ['pb035', 'Enrobé', "Plus-value pour le coffrage d'arrêts francs"],
    // ── Aménagements extérieurs
    ['pb040', 'Aménagements extérieurs', 'Fourniture et mise en place au grappin de terre végétale, cubé sur véhicule'],
    ['pb041', 'Aménagements extérieurs', 'Travaux de réglage, mise en place et affinage de la terre végétale et ensemencement'],
    ['pb042', 'Aménagements extérieurs', 'Dépose, raclage et entreposage des dalles sur la propriété ou chargement direct pour évacuation'],
    ['pb043', 'Aménagements extérieurs', 'Pose ou repose de pavés ou dalles de jardin sur gravier'],
    ['pb044', 'Aménagements extérieurs', 'Plus-value pour coupes et ajustages de dalles de jardin ou pavages'],
    ['pb045', 'Aménagements extérieurs', "Fourniture à pied d'œuvre de pavés, y compris frais de transport et de manutention"],
    ['pb046', 'Aménagements extérieurs', "Fourniture et mise en place de bordurette en acier de 5 mm d'épaisseur sur un lit de mortier, y compris toutes fournitures"],
    ['pb047', 'Aménagements extérieurs', 'Fourniture et mise en place de bordurette acier de 20 cm de largeur'],
    ['pb048', 'Aménagements extérieurs', "Fourniture et mise en place d'un liseré de pavés posé sur un lit de mortier, y compris toutes fournitures"],
    ['pb049', 'Aménagements extérieurs', "Réalisation d'un liseré de pavés granit"],
    ['pb050', 'Aménagements extérieurs', 'Fourniture et mise en place de boulets 16/32 mm entre la façade et la bordurette en acier, cubé sur véhicule'],
    ['pb051', 'Aménagements extérieurs', 'Travaux de remise en état des aménagements extérieurs, fourniture et mise en place de terre végétale, ensemencement, fourniture et mise en place de boulets en pied de façade ainsi que de gravier le long de la bordurette acier'],
    // ── Canalisations
    ['pb060', 'Canalisations', "Fourniture et pose sur béton d'un caniveau Birco Sir type NW 150 avec grille caillebotis en acier galvanisé"],
    ['pb061', 'Canalisations', "Plus-value pour plaque d'about et travaux de raccordement"],
    // ── Démolition
    ['pb070', 'Démolition', 'Travaux de suppression par piquage au moyen de marteaux électriques de diverses surfaces en béton'],
    ['pb071', 'Démolition', "Travaux de suppression de semelles, couronnement d'ancien mur et socles en béton"],
  ].map(a => ({ id: a[0], cat: a[1], texte: a[2] }));


  const rd = (k, def) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? def : v; } catch (e) { return def; } };
  const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const PALETTE = ['#E53935','#E67E22','#F0A500','#2E7D32','#1A7F72','#1B3A6B','#6C3483','#1565C0','#00838F','#4E342E'];

  // ── Catégories (arbre partagé avec le gestionnaire ⊞ Catégories de Ressources) ──
  function tree() { const a = rd(CATS_KEY, {}); return Array.isArray(a.postes) ? a.postes : []; }
  function setTree(t) { const a = rd(CATS_KEY, {}) || {}; a.postes = t; wr(CATS_KEY, a); }
  // « Catégorie » ou « Catégorie › Sous-catégorie » → { catId, subCatId } (créées si besoin dans t)
  function ensureCat(name, t) {
    const [cn, sn] = String(name || '').split('›').map(x => x.trim());
    if (!cn) return { catId: '', subCatId: '' };
    let c = t.find(x => (x.name || '').toLowerCase() === cn.toLowerCase());
    if (!c) { c = { id: 'cat' + uid(), name: cn, color: PALETTE[t.length % PALETTE.length], emoji: '', image: '' }; t.push(c); }
    if (!sn) return { catId: c.id, subCatId: '' };
    c.children = c.children || [];
    let s = c.children.find(x => (x.name || '').toLowerCase() === sn.toLowerCase());
    if (!s) { s = { id: 'sub' + uid(), name: sn }; c.children.push(s); }
    return { catId: c.id, subCatId: s.id };
  }
  function label(p, t) {
    const c = (t || tree()).find(x => x.id === p.catId); if (!c) return '';
    const s = p.subCatId && (c.children || []).find(x => x.id === p.subCatId);
    return c.name + (s ? ' › ' + s.name : '');
  }
  // Anciens postes { texte, cat } → { nom, catId, subCatId }
  function normalise(items, t) {
    return (items || []).filter(Boolean).map(p => {
      if (p.texte == null && p.cat == null) return p;
      const q = { id: p.id, nom: p.nom || p.texte || '', catId: p.catId || '', subCatId: p.subCatId || '', icon: p.icon || '', photo: p.photo || '' };
      if (!q.catId && p.cat) Object.assign(q, ensureCat(p.cat, t));
      return q;
    });
  }
  // Ajoute les postes de base pas encore ajoutés (t est complété si besoin)
  function merge(items, seeded, t) {
    items = normalise(items, t);
    seeded = Array.isArray(seeded) ? seeded.slice() : [];
    const vus = new Set(seeded), ids = new Set(items.map(i => i.id));
    let changed = false;
    BASE.forEach(b => {
      if (vus.has(b.id)) return;
      if (!ids.has(b.id)) items.push({ id: b.id, nom: b.texte, ...ensureCat(b.cat, t), icon: '', photo: '' });
      seeded.push(b.id); changed = true;
    });
    return { items, seeded, changed };
  }
  // Liste pour l'affichage / la recherche : { id, nom, texte (= nom), cat (libellé), catId, subCatId }
  function list() {
    const t = JSON.parse(JSON.stringify(tree()));
    return merge(rd(KEY, []), rd(SEED_KEY, []), t).items.map(p => ({ ...p, texte: p.nom, cat: label(p, t), metre: metreDe(p) }));
  }
  function seededLocal() { return rd(SEED_KEY, []); }

  // ── Métré associé (ouvert automatiquement dans le Rapport) ────────────
  // p.metre : 'coupe' (ml) | 'surface' (m²) | 'volume' (m³) | 'none' | absent/'auto' = deviné
  function devineMetre(texte, unite) {
    const u = String(unite || '').toLowerCase().trim();
    if (u) { if (/m3|m³/.test(u)) return 'volume'; if (/m2|m²/.test(u)) return 'surface'; if (/^(ml|m)$/.test(u)) return 'coupe'; return ''; }
    const t = String(texte || '').toLowerCase();
    if (/^(forfait|installation|d[ée]placements?|signalisation|implantation|travaux de remise en [ée]tat)|fourniture (à|a) pied|pour plaque/.test(t)) return '';
    if (/\bcub[ée]|\bm3\b|m³/.test(t)) return 'volume';
    if (/bordur|coupes?\b|\bml\b|liser|caniveau|tuyau|canalis|bande|arr[êe]ts? francs|joint/.test(t)) return 'coupe';
    if (/creuse|fouille|remblai|d[ée]blai|concassage/.test(t)) return 'volume';
    if (/surface|pav[ée]|pavage|dalle|enrob|r[ée]glage|compactage|planie|cr[ée]pi|enduit|g[ée]otextile|ensemencement|chape|\bmurs?\b|isolation|piquage/.test(t)) return 'surface';
    return '';
  }
  function metreDe(p) { const m = p && p.metre; return m && m !== 'auto' ? (m === 'none' ? '' : m) : devineMetre(p && p.nom); }

  // Recherche : chaque mot tapé doit commencer un mot du poste (sans accents)
  const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/[^a-z0-9/.]+/g, ' ').trim();
  function search(q, n) {
    const qt = norm(q).split(' ').filter(w => w.length >= 2 || /\d/.test(w));
    if (!qt.length) return [];
    const use = rd(USE_KEY, {});
    const res = [];
    list().forEach(p => {
      const words = norm(p.nom + ' ' + (p.cat || '')).split(' ');
      let score = 0;
      for (const w of qt) {
        const i = words.findIndex(x => x.startsWith(w));
        if (i < 0) return;
        score += i;
      }
      res.push({ p, s: (use[p.id] || 0) * -1000 + score });
    });
    return res.sort((a, b) => a.s - b.s).slice(0, n || 6).map(r => r.p);
  }
  function used(id) { const u = rd(USE_KEY, {}); u[id] = (u[id] || 0) + 1; wr(USE_KEY, u); }

  // ── Lien Firestore, fourni par chaque module ──────────────────────────
  // load() → { items, seeded, ignores, tree?, legacyCats? } | null
  // saveItems(items), saveMeta({seeded, ignores}), saveCats(tree) → Promise
  let io = null;
  function setup(o) { io = o; }
  function push(quoi) {
    if (!io) return Promise.resolve();
    const q = quoi || { items: 1, meta: 1, cats: 1 }, all = [];
    if (q.items && io.saveItems) all.push(io.saveItems(rd(KEY, [])));
    if (q.meta && io.saveMeta) all.push(io.saveMeta({ seeded: rd(SEED_KEY, []), ignores: rd(IGN_KEY, []), updatedAt: Date.now() }));
    if (q.cats && io.saveCats) all.push(io.saveCats(tree()));
    return Promise.all(all).catch(e => console.warn('Postes', e));
  }
  // Cloud → local (+ ajout des postes de base, migration de l'ancien format)
  async function sync() {
    if (!io || !io.load) return false;
    const d = await io.load(); if (!d) return false;
    const t = Array.isArray(d.tree) ? JSON.parse(JSON.stringify(d.tree)) : tree();
    const avant = JSON.stringify(t);
    (d.legacyCats || []).forEach(c => ensureCat(c, t));
    const m = merge(d.items, d.seeded, t);
    const migre = (d.items || []).some(p => p && (p.texte != null || p.cat != null));
    wr(KEY, m.items); wr(SEED_KEY, m.seeded); wr(IGN_KEY, d.ignores || []); setTree(t);
    if (d.hab) wr(HAB_KEY, d.hab);
    const catsChg = JSON.stringify(t) !== avant;
    if (m.changed || migre || d.metaManquante || catsChg) await push({ items: m.changed || migre, meta: 1, cats: catsChg });
    return m.changed || migre || catsChg;
  }

  // ── Fournitures / évacuations liées à un poste (proposées dans le Rapport) ──
  // Mélange de 3 sources, dans cet ordre :
  //  1. manuel   : p.fourn = ['f:<id matériau>', 'e:<id évacuation>'] (fiche du poste)
  //  2. habitude : ce que l'équipe met dans les rapports avec ce poste
  //                (au moins 2 fois et dans au moins la moitié des rapports)
  //  3. texte    : matériaux (et évacuations si le poste parle d'évacuation)
  //                dont le nom se retrouve dans le texte du poste
  function ressources(t) { return rd(t === 'f' ? 'rv6_materials' : 'rv6_evacuations', []); }
  function nomDans(nom, texte) {
    const tw = norm(texte).split(' ').filter(Boolean);
    const nw = norm(nom).split(' ').filter(w => w.length >= 3 || /\d/.test(w));
    if (!nw.length) return false;
    return nw.every(w => tw.some(x => x === w || (w.length >= 4 && x.length >= 4 && (x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5))))));
  }
  function liees(p, exclure) {
    if (!p) return [];
    const out = [], vu = new Set(exclure || []);
    const add = (t, id, src) => {
      const k = t + ':' + id; if (vu.has(k)) return;
      const it = ressources(t).find(x => x.id === id); if (!it) return;
      vu.add(k); out.push({ t, id, k, nom: it.nom, unite: it.unite || '', src });
    };
    (p.fourn || []).forEach(k => { const i = k.indexOf(':'); add(k.slice(0, i), k.slice(i + 1), 'manuel'); });
    const h = rd(HAB_KEY, {})[p.id] || {}, n = h._n || 0;
    Object.entries(h).filter(([k, v]) => k !== '_n' && v >= 2 && v >= n * 0.5).sort((a, b) => b[1] - a[1])
      .forEach(([k]) => { const i = k.indexOf(':'); add(k.slice(0, i), k.slice(i + 1), 'habitude'); });
    ressources('f').forEach(it => { if (nomDans(it.nom, p.nom)) add('f', it.id, 'texte'); });
    if (/[ée]vacu|d[ée]charg|\btaxes?\b|d[ée]grapp|d[ée]moli/i.test(p.nom)) ressources('e').forEach(it => { if (nomDans(it.nom, p.nom)) add('e', it.id, 'texte'); });
    return out.slice(0, 6);
  }
  // Rapport validé : chaque poste choisi « apprend » les fournitures / évacuations du rapport
  function retenirHab(pids, keys) {
    pids = [...new Set(pids || [])]; if (!pids.length) return;
    const h = rd(HAB_KEY, {}), upd = {};
    pids.forEach(pid => { const e = h[pid] = h[pid] || {}; e._n = (e._n || 0) + 1; keys.forEach(k => { e[k] = (e[k] || 0) + 1; }); upd[pid] = keys; });
    wr(HAB_KEY, h);
    if (io && io.saveHab) Promise.resolve(io.saveHab(upd)).catch(e => console.warn('Habitudes postes', e));
  }

  // ── Import d'une liste préparée (dossier imports/, ex. chapitres du CAN) ──
  // rows : [{ id, nom, cat: 'Catégorie' ou 'Catégorie › Sous-catégorie', metre, src }]
  function importer(rows) {
    const t = tree(), avant = JSON.stringify(t);
    const items = normalise(rd(KEY, []), t), ids = new Set(items.map(i => i.id));
    let n = 0;
    (rows || []).forEach(r => {
      if (!r || !r.nom || ids.has(r.id)) return;
      items.push({ id: r.id, nom: nettoie(r.nom), ...ensureCat(r.cat, t), metre: r.metre || 'auto', src: r.src || '', icon: '', photo: '' });
      ids.add(r.id); n++;
    });
    wr(KEY, items); setTree(t);
    return push({ items: n > 0, cats: JSON.stringify(t) !== avant }).then(() => n);
  }
  function existe(id) { return rd(KEY, []).some(p => p.id === id); }
  function doublon(nom) { return list().find(p => proche(p.nom, nom)) || null; }

  // ── Positions de devis → actions proposées comme postes ───────────────
  function nettoie(t) {
    return String(t || '').replace(/\s+/g, ' ').replace(/\b([dlj]|qu)' +/gi, "$1'").replace(/d'oeuvre/gi, "d'œuvre")
      .replace(/\s+([,.;])/g, '$1').replace(/\. (?=[a-zà-ÿ])/g, ', ').replace(/compacatge/gi, 'compactage').replace(/liserai\b/gi, 'liseré')
      .replace(/\bgravas\b/gi, 'gravats').replace(/\baprés\b/gi, 'après').trim().replace(/[\s.;,]+$/, '');
  }
  const mots = t => new Set(norm(t).split(' ').filter(w => w.length >= 3).map(w => w.replace(/(es|s|e)$/, '')));
  const cle = t => [...mots(t)].sort().join(' ');
  const VIDES = new Set('pour avec dans des les une sur par travaux fourniture mise place compri chargement direct evacuation frai plu valu toute tou pos realisation duree vehicul cub selon'.split(' '));
  function sim(a, b, filtre) {
    let A = mots(a), B = mots(b);
    if (filtre) { A = new Set([...A].filter(w => !VIDES.has(w))); B = new Set([...B].filter(w => !VIDES.has(w))); }
    if (!A.size || !B.size) return 0;
    let n = 0; A.forEach(w => { if (B.has(w)) n++; });
    return n / (A.size + B.size - n);
  }
  const proche = (a, b) => sim(a, b) >= 0.8;
  function catDe(chT) {
    let c = String(chT || '').replace(/^[\d.\s]+/, '').trim();
    if (!c || /^(travaux (envisag|effectu|suppl)|divers|r[ée]capitulation|prix|tarif)/i.test(c)) return '';
    if (c === c.toUpperCase()) c = c.charAt(0) + c.slice(1).toLowerCase();
    return c;
  }
  const REGLES = [
    ['Installation de chantier', /installation de chantier|signalisation|implantation|container|baraque|wc |repli|barri[èe]re de chantier|cl[ôo]ture de chantier/],
    ['Enrobé', /enrob|bitum/],
    ['Démolition', /d[ée]moli|piquage|suppression|d[ée]montage|sciage|carottage|percement/],
    ['Canalisations', /canalis|tuyau|pvc|\bpe\b|regard|caniveau|drainage|chambre|collecteur|raccordement/],
    ['Échafaudage', /[ée]chafaud/],
    ['Isolation', /isolation|\bxps\b|\beps\b|laine de/],
    ['Évacuations', /\btaxes?\b|frais d'[ée]vacuation|d[ée]charge/],
    ['Aménagements extérieurs', /pav[ée]s?\b|pavage|dalles? de jardin|bordur|terre v[ée]g[ée]tale|gazon|ensemencement|boulets?|plantation/],
    ['Béton / coffrage', /coffrage|armature|treillis|radier|semelle|ferraill|b[ée]ton(?! concass)/],
    ['Maçonnerie', /ma[çc]onn|\bmurs?\b|plots?\b|brique|cr[ée]pi|enduit|mortier|tablette|linteau/],
    ['Terrassement', /terrass|fouille|creuse|remblai|encaissement|tout-venant|g[ée]otextile|planie|compactage|r[ée]glage/],
  ];

  // Valeur de catégorie : '' | 'catId' | 'catId|subId' | 'new:Nom'
  function valDeNom(nom, t) {
    const n = nom.toLowerCase();
    const c = t.find(x => (x.name || '').toLowerCase() === n); if (c) return c.id;
    for (const x of t) { const s = (x.children || []).find(y => (y.name || '').toLowerCase() === n); if (s) return x.id + '|' + s.id; }
    return 'new:' + nom;
  }
  function suggereCat(texte, chT) {
    const t = tree(), low = texte.toLowerCase();
    // 1) mots du métier  2) poste le plus ressemblant  3) chapitre du devis
    for (const [c, re] of REGLES) if (re.test(low)) return valDeNom(c, t);
    let best = null, bs = 0;
    list().forEach(p => { if (!p.catId) return; const s = sim(p.nom, texte, true); if (s > bs) { bs = s; best = p.catId + (p.subCatId ? '|' + p.subCatId : ''); } });
    if (best && bs >= 0.3) return best;
    const ch = catDe(chT); if (ch) return valDeNom(ch, t);
    if (best && bs >= 0.2) return best;
    return '';
  }
  function candidats(positions) {
    const deja = list().map(p => p.nom), ign = new Set(rd(IGN_KEY, [])), out = [];
    (positions || []).forEach(p => {
      if (!p || p.regie || p.cache) return;
      const texte = nettoie(p.t);
      if (texte.length < 15 || /^(montant (à|a) disposition|position de r[ée]serve|report\b)/i.test(texte)) return;
      if (ign.has(cle(texte)) || out.some(g => proche(g.texte, texte))) return;
      let opts = [];
      if (window.RDevis) {
        try { opts = opts.concat(RDevis.memoire(p) || []); } catch (e) {}
        try { opts = opts.concat(RDevis.taches(p) || []); } catch (e) {}
      }
      opts = opts.map(nettoie).filter(o => o.length > 3);
      opts.push(texte);
      opts = opts.filter((o, i) => opts.findIndex(x => x.toLowerCase() === o.toLowerCase()) === i)
                 .filter(o => !deja.some(x => proche(x, o)));
      if (!opts.length) return;
      out.push({ id: p.id || '', texte, raw: p.t, u: p.u || '', options: opts, cat: suggereCat(texte, p.chT) });
    });
    return out;
  }
  const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Fenêtre de choix. Renvoie le nombre de positions proposées (0 = rien de nouveau).
  async function proposer(positions, titre, onDone) {
    try { await sync(); } catch (e) { console.warn('Postes', e); }
    if (window.RDevis && RDevis.syncMemoire) { try { await RDevis.syncMemoire(); } catch (e) {} }
    const grps = candidats(positions);
    if (!grps.length) return 0;
    const sel = grps.map(() => new Set());
    const catSel = grps.map(g => g.cat);
    const nouvelles = new Set(catSel.filter(v => v.startsWith('new:')).map(v => v.slice(4)));
    const css = `<style>.rpo-ch{display:inline-flex;align-items:center;gap:6px;border:1.5px solid #D5DBEA;background:#fff;color:#1A2340;border-radius:10px;padding:7px 10px;font:500 13px Inter,sans-serif;line-height:1.3;text-align:left;cursor:pointer;margin:0 6px 6px 0;}
      .rpo-ch.on{background:#1B3A6B;border-color:#1B3A6B;color:#fff;}.rpo-ch.dv{border-style:dashed;}.rpo-ch small{display:block;font-size:10px;opacity:.7;font-weight:700;}
      .rpo-g{padding:12px 4px;border-bottom:1px solid #EEF0F5;}.rpo-pos{font-size:11.5px;color:#4A5878;margin-bottom:8px;line-height:1.35;}
      .rpo-cat{display:flex;align-items:center;gap:6px;margin-top:2px;}
      .rpo-cat select{flex:1;min-width:0;border:1.5px solid #E0E4EF;border-radius:8px;padding:6px 8px;font:600 12px Inter,sans-serif;color:#1A2340;background:#F4F6FB;}</style>`;
    const catOpts = i => {
      const t = tree(), v = catSel[i];
      let h = `<option value="">Sans catégorie</option>`;
      t.forEach(c => {
        h += `<option value="${esc(c.id)}"${v === c.id ? ' selected' : ''}>${c.emoji ? c.emoji + ' ' : ''}${esc(c.name)}</option>`;
        (c.children || []).forEach(s => { const k = c.id + '|' + s.id; h += `<option value="${esc(k)}"${v === k ? ' selected' : ''}>&nbsp;&nbsp;↳ ${esc(s.name)}</option>`; });
      });
      [...nouvelles].forEach(n => { h += `<option value="${esc('new:' + n)}"${v === 'new:' + n ? ' selected' : ''}>✨ ${esc(n)} (nouvelle)</option>`; });
      return h + `<option value="__new">➕ Nouvelle catégorie…</option>`;
    };
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9000;display:flex;align-items:flex-end;justify-content:center;font-family:Inter,sans-serif;';
    const grpHTML = i => { const g = grps[i]; return `<div class="rpo-g" data-g="${i}">
        <div class="rpo-pos">${g.id ? `<b>${esc(g.id)}</b> · ` : ''}${esc(g.texte)}</div>
        <div>${g.options.map((o, k) => `<button type="button" class="rpo-ch${o === g.texte ? ' dv' : ''}${sel[i].has(k) ? ' on' : ''}" data-k="${k}">${o === g.texte ? '<span><small>Texte du devis</small>' + esc(o) + '</span>' : esc(o)}</button>`).join('')}<button type="button" class="rpo-ch" data-autre>✏️ Autre…</button></div>
        <div class="rpo-cat">📁 <select data-cat>${catOpts(i)}</select></div></div>`; };
    ov.innerHTML = css + `<div style="background:#fff;width:100%;max-width:640px;max-height:90vh;border-radius:20px 20px 0 0;display:flex;flex-direction:column;">
      <div style="padding:16px 16px 10px;border-bottom:1px solid #E0E4EF;">
        <div style="font-size:17px;font-weight:700;color:#1B3A6B;">📋 Nouveaux postes${titre ? ' — ' + esc(titre) : ''}</div>
        <div style="font-size:12px;color:#4A5878;margin-top:4px;line-height:1.4;">${grps.length} position${grps.length > 1 ? 's' : ''} à classer. Pour chacune, choisis la ou les actions à garder comme postes, et vérifie la catégorie.<br><span style="color:#9AA3BC">Une position sans action choisie ne sera plus proposée.</span></div>
      </div>
      <div data-list style="overflow-y:auto;flex:1;padding:4px 12px;">${grps.map((g, i) => grpHTML(i)).join('')}</div>
      <div style="display:flex;gap:8px;padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px));border-top:1px solid #E0E4EF;">
        <button data-later style="flex:0 0 auto;border:none;background:#F4F6FB;color:#4A5878;border-radius:12px;padding:13px 16px;font:600 14px Inter,sans-serif;cursor:pointer;">Plus tard</button>
        <button data-ok style="flex:1;border:none;background:#1B3A6B;color:#fff;border-radius:12px;padding:13px;font:700 14px Inter,sans-serif;cursor:pointer;"></button>
      </div></div>`;
    document.body.appendChild(ov);
    const okBtn = ov.querySelector('[data-ok]'), lst = ov.querySelector('[data-list]');
    const maj = () => { const n = sel.reduce((a, s) => a + s.size, 0); okBtn.textContent = n ? `Ajouter ${n} poste${n > 1 ? 's' : ''}` : 'Ne rien ajouter'; };
    const redraw = i => { const el = lst.querySelector(`[data-g="${i}"]`); const tmp = document.createElement('div'); tmp.innerHTML = grpHTML(i); el.replaceWith(tmp.firstElementChild); };
    lst.addEventListener('click', e => {
      const b = e.target.closest('.rpo-ch'); if (!b) return;
      const i = +b.closest('[data-g]').dataset.g;
      if (b.hasAttribute('data-autre')) {
        const t = prompt('Action pour cette position :', grps[i].options[0] || '');
        if (!t || !nettoie(t)) return;
        grps[i].options.unshift(nettoie(t));
        sel[i] = new Set([...sel[i]].map(k => k + 1)); sel[i].add(0);
        if (window.RDevis && RDevis.retenir) { try { RDevis.retenir({ t: grps[i].raw }, nettoie(t)); } catch (er) {} }
        redraw(i); maj(); return;
      }
      const k = +b.dataset.k;
      if (sel[i].has(k)) sel[i].delete(k); else sel[i].add(k);
      b.classList.toggle('on', sel[i].has(k)); maj();
    });
    lst.addEventListener('change', e => {
      const s = e.target.closest('[data-cat]'); if (!s) return;
      const i = +s.closest('[data-g]').dataset.g;
      if (s.value === '__new') {
        const c = (prompt('Nom de la nouvelle catégorie (ou « Catégorie › Sous-catégorie ») :') || '').trim();
        if (c) { const v = valDeNom(c, tree()); if (v.startsWith('new:')) nouvelles.add(c); catSel[i] = v; }
        grps.forEach((g, j) => redraw(j)); return;
      }
      catSel[i] = s.value;
    });
    maj();
    const close = () => ov.remove();
    ov.querySelector('[data-later]').onclick = close;
    ov.onclick = e => { if (e.target === ov) close(); };
    okBtn.onclick = async () => {
      const t = tree(), items = normalise(rd(KEY, []), t), ign = rd(IGN_KEY, []);
      const avant = JSON.stringify(t);
      let n = 0;
      grps.forEach((g, i) => {
        if (!sel[i].size) { ign.push(cle(g.texte)); return; }
        const v = catSel[i] || '';
        const c = v.startsWith('new:') ? ensureCat(v.slice(4), t) : { catId: v.split('|')[0] || '', subCatId: v.split('|')[1] || '' };
        [...sel[i]].sort((a, b) => a - b).forEach(k => { items.push({ id: 'p' + uid(), nom: g.options[k], ...c, metre: devineMetre(g.options[k], g.u) || 'none', icon: '', photo: '' }); n++; });
      });
      wr(KEY, items); wr(IGN_KEY, ign.slice(-2000)); setTree(t);
      close(); await push({ items: n > 0, meta: 1, cats: JSON.stringify(t) !== avant });
      if (onDone) onDone(n);
    };
    return grps.length;
  }

  window.RPostes = { BASE, list, search, used, norm, setup, sync, push, candidats, proposer, nettoie, tree, label, seededLocal, KEY, devineMetre, metreDe, liees, retenirHab, ressources, importer, existe, doublon };
})();
