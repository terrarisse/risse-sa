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
  const KEY = 'rv6_postes', SEED_KEY = 'rv6_postes_seeded', USE_KEY = 'rv6_postes_usage', IGN_KEY = 'rv6_postes_ign';

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
  function payload() { return { items: rd(KEY, []), seeded: rd(SEED_KEY, []), ignores: rd(IGN_KEY, []), updatedAt: Date.now() }; }
  async function sync() {
    if (!io) return;
    const d = await io.load();
    if (d) { const m = merge(d.items, d.seeded); setLocal(m.items, m.seeded, d.ignores || []); }
  }
  function push() { return io ? Promise.resolve(io.save(payload())).catch(e => console.warn('Postes', e)) : Promise.resolve(); }

  // ── Positions de devis → nouveaux postes proposés ─────────────────────
  // Texte nettoyé (espaces, apostrophes Sorba « d' oeuvre »), doublons filtrés
  // (même mots à peu de chose près), positions refusées une fois = plus proposées.
  function nettoie(t) {
    return String(t || '').replace(/\s+/g, ' ').replace(/\b([dlj]|qu)' +/gi, "$1'").replace(/d'oeuvre/gi, "d'œuvre")
      .replace(/\s+([,.;])/g, '$1').replace(/\. (?=[a-zà-ÿ])/g, ', ').replace(/compacatge/gi, 'compactage').replace(/liserai\b/gi, 'liseré').trim().replace(/[\s.;,]+$/, '');
  }
  const mots = t => new Set(norm(t).split(' ').filter(w => w.length >= 3).map(w => w.replace(/(es|s|e)$/, '')));
  const cle = t => [...mots(t)].sort().join(' ');
  function proche(a, b) {
    const A = mots(a), B = mots(b); if (!A.size || !B.size) return false;
    let n = 0; A.forEach(w => { if (B.has(w)) n++; });
    return n / (A.size + B.size - n) >= 0.8;
  }
  function catDe(chT) {
    let c = String(chT || '').replace(/^[\d.\s]+/, '').trim();
    if (!c || /^(travaux (envisag|effectu|suppl)|divers|r[ée]capitulation|prix|tarif)/i.test(c)) return '';
    if (c === c.toUpperCase()) c = c.charAt(0) + c.slice(1).toLowerCase();
    return c;
  }
  function candidats(positions) {
    const deja = list().map(p => p.texte), ign = new Set(rd(IGN_KEY, [])), out = [];
    (positions || []).forEach(p => {
      if (!p || p.regie || p.cache) return;
      const texte = nettoie(p.t);
      if (texte.length < 15 || /^(montant (à|a) disposition|position de r[ée]serve|report\b)/i.test(texte)) return;
      if (ign.has(cle(texte))) return;
      if (deja.some(x => proche(x, texte)) || out.some(x => proche(x.texte, texte))) return;
      out.push({ texte, cat: catDe(p.chT) });
    });
    return out;
  }
  const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // Ouvre la liste à cocher. Renvoie le nombre de positions proposées (0 = rien de nouveau).
  async function proposer(positions, titre, onDone) {
    try { await sync(); } catch (e) { console.warn('Postes', e); }
    const cands = candidats(positions);
    if (!cands.length) return 0;
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9000;display:flex;align-items:flex-end;justify-content:center;font-family:Inter,sans-serif;';
    ov.innerHTML = `<div style="background:#fff;width:100%;max-width:640px;max-height:88vh;border-radius:20px 20px 0 0;display:flex;flex-direction:column;">
      <div style="padding:16px 16px 10px;border-bottom:1px solid #E0E4EF;">
        <div style="font-size:17px;font-weight:700;color:#1B3A6B;">📋 Nouveaux postes ?</div>
        <div style="font-size:12px;color:#4A5878;margin-top:4px;line-height:1.4;">${cands.length} position${cands.length > 1 ? 's' : ''} ${esc(titre ? 'de ' + titre : 'des devis')} pas encore dans les postes. Coche celles à ajouter.<br><span style="color:#9AA3BC">Celles non cochées ne seront plus proposées.</span></div>
        <button data-all style="margin-top:8px;border:1.5px solid #1B3A6B;background:#fff;color:#1B3A6B;border-radius:16px;padding:5px 12px;font:600 12px Inter,sans-serif;cursor:pointer;">Tout cocher</button>
      </div>
      <div style="overflow-y:auto;flex:1;padding:8px 12px;">${cands.map((c, i) => `
        <label style="display:flex;gap:10px;align-items:flex-start;padding:10px 6px;border-bottom:1px solid #EEF0F5;cursor:pointer;">
          <input type="checkbox" data-i="${i}" style="width:20px;height:20px;flex-shrink:0;margin-top:1px;accent-color:#1B3A6B;">
          <span style="font-size:13px;line-height:1.4;color:#1A2340;">${esc(c.texte)}${c.cat ? `<small style="display:block;color:#9AA3BC;font-weight:600;margin-top:2px;">${esc(c.cat)}</small>` : ''}</span>
        </label>`).join('')}</div>
      <div style="display:flex;gap:8px;padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px));border-top:1px solid #E0E4EF;">
        <button data-later style="flex:0 0 auto;border:none;background:#F4F6FB;color:#4A5878;border-radius:12px;padding:13px 16px;font:600 14px Inter,sans-serif;cursor:pointer;">Plus tard</button>
        <button data-ok style="flex:1;border:none;background:#1B3A6B;color:#fff;border-radius:12px;padding:13px;font:700 14px Inter,sans-serif;cursor:pointer;">Valider</button>
      </div></div>`;
    document.body.appendChild(ov);
    const boxes = [...ov.querySelectorAll('input[type=checkbox]')];
    const okBtn = ov.querySelector('[data-ok]');
    const maj = () => { const n = boxes.filter(b => b.checked).length; okBtn.textContent = n ? `Ajouter ${n} poste${n > 1 ? 's' : ''}` : 'Ne rien ajouter'; };
    boxes.forEach(b => b.onchange = maj); maj();
    ov.querySelector('[data-all]').onclick = () => { const all = boxes.every(b => b.checked); boxes.forEach(b => b.checked = !all); maj(); };
    const close = () => ov.remove();
    ov.querySelector('[data-later]').onclick = close;
    ov.onclick = e => { if (e.target === ov) close(); };
    okBtn.onclick = async () => {
      const items = list(), ign = rd(IGN_KEY, []);
      let n = 0;
      cands.forEach((c, i) => {
        if (boxes[i].checked) { items.push({ id: 'p' + Date.now().toString(36) + i, texte: c.texte, cat: c.cat }); n++; }
        else ign.push(cle(c.texte));
      });
      const m = merge(items, rd(SEED_KEY, []));
      setLocal(m.items, m.seeded, ign.slice(-2000));
      close(); await push();
      if (onDone) onDone(n);
    };
    return cands.length;
  }

  window.RPostes = { BASE, merge, list, setLocal, seededLocal, search, used, norm, KEY, SEED_KEY,
    setup, sync, push, payload, candidats, proposer, nettoie };
})();
