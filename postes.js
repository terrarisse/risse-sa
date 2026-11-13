// ═══════════════════════════════════════════════════════════════
// POSTES — base de postes de travaux (texte complet style Sorba)
// Partagée par Ressources (gestion) et Rapport (propositions en écrivant).
// Stockage : localStorage rv6_postes (+ rv6_postes_seeded) et Firestore
// ressources/postes { items, seeded, updatedAt }.
// BASE = postes tirés des devis / factures fournis. Chaque poste de la base
// n'est ajouté qu'une fois (id dans « seeded ») : un poste supprimé dans
// Ressources ne revient pas.
// ═══════════════════════════════════════════════════════════════
(function () {
  const KEY = 'rv6_postes', SEED_KEY = 'rv6_postes_seeded', USE_KEY = 'rv6_postes_usage', IGN_KEY = 'rv6_postes_ign', CAT_KEY = 'rv6_postes_cats';

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

  // Fusionne la base dans une liste { items, seeded } → { items, seeded, changed }
  function merge(items, seeded) {
    items = Array.isArray(items) ? items.slice() : [];
    seeded = Array.isArray(seeded) ? seeded.slice() : [];
    const vus = new Set(seeded), ids = new Set(items.map(i => i.id));
    let changed = false;
    BASE.forEach(b => {
      if (vus.has(b.id)) return;
      if (!ids.has(b.id)) items.push({ ...b });
      seeded.push(b.id); changed = true;
    });
    return { items, seeded, changed };
  }
  // Liste locale (avec la base pas encore enregistrée, pour qu'elle soit dispo tout de suite)
  function list() { return merge(rd(KEY, []), rd(SEED_KEY, [])).items; }
  function setLocal(items, seeded, ignores) { wr(KEY, items); if (seeded) wr(SEED_KEY, seeded); if (ignores) wr(IGN_KEY, ignores); }
  function seededLocal() { return rd(SEED_KEY, []); }

  // Recherche : chaque mot tapé doit commencer un mot du poste (sans accents)
  const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/[^a-z0-9/.]+/g, ' ').trim();
  function search(q, n) {
    const qt = norm(q).split(' ').filter(w => w.length >= 2 || /\d/.test(w));
    if (!qt.length) return [];
    const use = rd(USE_KEY, {});
    const res = [];
    list().forEach(p => {
      const words = norm(p.texte + ' ' + (p.cat || '')).split(' ');
      let score = 0;
      for (const w of qt) {
        const i = words.findIndex(x => x.startsWith(w));
        if (i < 0) return;
        score += i;            // mots trouvés tôt dans le texte = mieux
      }
      res.push({ p, s: (use[p.id] || 0) * -1000 + score });
    });
    return res.sort((a, b) => a.s - b.s).slice(0, n || 6).map(r => r.p);
  }
  function used(id) { const u = rd(USE_KEY, {}); u[id] = (u[id] || 0) + 1; wr(USE_KEY, u); }


  // ── Lien Firestore (fourni par chaque module : load() → doc|null, save(doc)) ──
  let io = null;
  function setup(o) { io = o; }
  function payload() { return { items: rd(KEY, []), seeded: rd(SEED_KEY, []), ignores: rd(IGN_KEY, []), cats: rd(CAT_KEY, []), updatedAt: Date.now() }; }
  async function sync() {
    if (!io) return;
    const d = await io.load();
    if (d) { const m = merge(d.items, d.seeded); setLocal(m.items, m.seeded, d.ignores || []); wr(CAT_KEY, d.cats || []); }
  }
  function push() { return io ? Promise.resolve(io.save(payload())).catch(e => console.warn('Postes', e)) : Promise.resolve(); }

  // ── Catégories (créées dans Ressources, + celles utilisées par les postes) ──
  function cats() {
    const s = new Set(rd(CAT_KEY, []).filter(Boolean));
    list().forEach(p => { if (p.cat) s.add(p.cat); });
    return [...s].sort((a, b) => a.localeCompare(b, 'fr'));
  }
  function setCats(c) { wr(CAT_KEY, [...new Set((c || []).filter(Boolean))]); }

  // ── Positions de devis → actions proposées comme postes ───────────────
  // Pour chaque position : actions générées (règles du métier de devis.js +
  // corrections de l'équipe), texte complet du devis, et une catégorie
  // suggérée (existante ou nouvelle). Doublons filtrés, positions refusées
  // une fois = plus proposées.
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
    if (filtre) { A = new Set([...A].filter(w => !VIDES.has(w))); B = new Set([...B].filter(w => !VIDES.has(w))); } if (!A.size || !B.size) return 0;
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
  // Catégories du métier reconnues par mots-clés (ordre = priorité)
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
  // → { cat, nouveau }
  function suggereCat(texte, chT) {
    const exist = cats(), trouve = c => exist.find(x => x.toLowerCase() === c.toLowerCase());
    // 1) mots du métier  2) poste le plus ressemblant (sans les mots passe-partout)  3) chapitre du devis
    const t = texte.toLowerCase();
    for (const [c, re] of REGLES) if (re.test(t)) { const e = trouve(c); return { cat: e || c, nouveau: !e }; }
    let best = null, bs = 0;
    list().forEach(p => { if (!p.cat) return; const s = sim(p.texte, texte, true); if (s > bs) { bs = s; best = p.cat; } });
    if (best && bs >= 0.3) return { cat: best, nouveau: false };
    const ch = catDe(chT);
    if (ch) { const e = trouve(ch); return { cat: e || ch, nouveau: !e }; }
    if (best && bs >= 0.2) return { cat: best, nouveau: false };
    return { cat: '', nouveau: false };
  }
  // Groupes à proposer : [{ pos, options:[texte], cat:{cat,nouveau} }]
  function candidats(positions) {
    const deja = list().map(p => p.texte), ign = new Set(rd(IGN_KEY, [])), out = [];
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
      out.push({ id: p.id || '', texte, raw: p.t, options: opts, cat: suggereCat(texte, p.chT) });
    });
    return out;
  }
  const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // Ouvre la fenêtre de choix. Renvoie le nombre de positions proposées (0 = rien de nouveau).
  async function proposer(positions, titre, onDone) {
    try { await sync(); } catch (e) { console.warn('Postes', e); }
    if (window.RDevis && RDevis.syncMemoire) { try { await RDevis.syncMemoire(); } catch (e) {} }
    const grps = candidats(positions);
    if (!grps.length) return 0;
    const sel = grps.map(() => new Set());
    const catSel = grps.map(g => g.cat.cat);
    const nouvelles = new Set(grps.filter(g => g.cat.nouveau).map(g => g.cat.cat));
    const css = `<style>.rpo-ch{display:inline-flex;align-items:center;gap:6px;border:1.5px solid #D5DBEA;background:#fff;color:#1A2340;border-radius:10px;padding:7px 10px;font:500 13px Inter,sans-serif;line-height:1.3;text-align:left;cursor:pointer;margin:0 6px 6px 0;}
      .rpo-ch.on{background:#1B3A6B;border-color:#1B3A6B;color:#fff;}.rpo-ch.dv{border-style:dashed;}.rpo-ch small{display:block;font-size:10px;opacity:.7;font-weight:700;}
      .rpo-g{padding:12px 4px;border-bottom:1px solid #EEF0F5;}.rpo-pos{font-size:11.5px;color:#4A5878;margin-bottom:8px;line-height:1.35;}
      .rpo-cat{display:flex;align-items:center;gap:6px;margin-top:2px;font-size:11px;color:#9AA3BC;font-weight:700;}
      .rpo-cat select{flex:1;min-width:0;border:1.5px solid #E0E4EF;border-radius:8px;padding:6px 8px;font:600 12px Inter,sans-serif;color:#1A2340;background:#F4F6FB;}</style>`;
    const catOpts = i => {
      const all = [...new Set([...cats(), ...nouvelles])].sort((a, b) => a.localeCompare(b, 'fr'));
      return `<option value="">Sans catégorie</option>` + all.map(c => `<option value="${esc(c)}"${c === catSel[i] ? ' selected' : ''}>${nouvelles.has(c) && !cats().includes(c) ? '✨ ' : ''}${esc(c)}${nouvelles.has(c) && !cats().includes(c) ? ' (nouvelle)' : ''}</option>`).join('')
        + `<option value="__new">➕ Nouvelle catégorie…</option>`;
    };
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9000;display:flex;align-items:flex-end;justify-content:center;font-family:Inter,sans-serif;';
    const body = () => grps.map((g, i) => `<div class="rpo-g" data-g="${i}">
        <div class="rpo-pos">${g.id ? `<b>${esc(g.id)}</b> · ` : ''}${esc(g.texte)}</div>
        <div>${g.options.map((o, k) => `<button type="button" class="rpo-ch${o === g.texte ? ' dv' : ''}${sel[i].has(k) ? ' on' : ''}" data-k="${k}">${o === g.texte ? '<span><small>Texte du devis</small>' + esc(o) + '</span>' : esc(o)}</button>`).join('')}<button type="button" class="rpo-ch" data-autre>✏️ Autre…</button></div>
        <div class="rpo-cat">📁 <select data-cat>${catOpts(i)}</select></div></div>`).join('');
    ov.innerHTML = css + `<div style="background:#fff;width:100%;max-width:640px;max-height:90vh;border-radius:20px 20px 0 0;display:flex;flex-direction:column;">
      <div style="padding:16px 16px 10px;border-bottom:1px solid #E0E4EF;">
        <div style="font-size:17px;font-weight:700;color:#1B3A6B;">📋 Nouveaux postes${titre ? ' — ' + esc(titre) : ''}</div>
        <div style="font-size:12px;color:#4A5878;margin-top:4px;line-height:1.4;">${grps.length} position${grps.length > 1 ? 's' : ''} à classer. Pour chacune, choisis la ou les actions à garder comme postes, et vérifie la catégorie.<br><span style="color:#9AA3BC">Une position sans action choisie ne sera plus proposée.</span></div>
      </div>
      <div data-list style="overflow-y:auto;flex:1;padding:4px 12px;">${body()}</div>
      <div style="display:flex;gap:8px;padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px));border-top:1px solid #E0E4EF;">
        <button data-later style="flex:0 0 auto;border:none;background:#F4F6FB;color:#4A5878;border-radius:12px;padding:13px 16px;font:600 14px Inter,sans-serif;cursor:pointer;">Plus tard</button>
        <button data-ok style="flex:1;border:none;background:#1B3A6B;color:#fff;border-radius:12px;padding:13px;font:700 14px Inter,sans-serif;cursor:pointer;"></button>
      </div></div>`;
    document.body.appendChild(ov);
    const okBtn = ov.querySelector('[data-ok]'), lst = ov.querySelector('[data-list]');
    const maj = () => { const n = sel.reduce((a, s) => a + s.size, 0); okBtn.textContent = n ? `Ajouter ${n} poste${n > 1 ? 's' : ''}` : 'Ne rien ajouter'; };
    const redraw = i => { const el = lst.querySelector(`[data-g="${i}"]`); const tmp = document.createElement('div'); tmp.innerHTML = body(); el.replaceWith(tmp.querySelector(`[data-g="${i}"]`)); };
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
        const c = (prompt('Nom de la nouvelle catégorie :') || '').trim();
        if (c) { nouvelles.add(c); catSel[i] = c; }
        grps.forEach((g, j) => redraw(j)); return;
      }
      catSel[i] = s.value;
    });
    maj();
    const close = () => ov.remove();
    ov.querySelector('[data-later]').onclick = close;
    ov.onclick = e => { if (e.target === ov) close(); };
    okBtn.onclick = async () => {
      const items = list(), ign = rd(IGN_KEY, []), newCats = rd(CAT_KEY, []);
      let n = 0;
      grps.forEach((g, i) => {
        if (!sel[i].size) { ign.push(cle(g.texte)); return; }
        [...sel[i]].sort((a, b) => a - b).forEach(k => {
          items.push({ id: 'p' + Date.now().toString(36) + i + 'x' + k, texte: g.options[k], cat: catSel[i] || '' });
          n++;
        });
        if (catSel[i]) newCats.push(catSel[i]);
      });
      const m = merge(items, rd(SEED_KEY, []));
      setLocal(m.items, m.seeded, ign.slice(-2000)); setCats(newCats);
      close(); await push();
      if (onDone) onDone(n);
    };
    return grps.length;
  }

  window.RPostes = { BASE, merge, list, setLocal, seededLocal, search, used, norm, KEY, SEED_KEY,
    setup, sync, push, payload, candidats, proposer, nettoie, cats, setCats, suggereCat };
})();
