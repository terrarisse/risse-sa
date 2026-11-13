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
  const KEY = 'rv6_postes', SEED_KEY = 'rv6_postes_seeded', USE_KEY = 'rv6_postes_usage';

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
  function setLocal(items, seeded) { wr(KEY, items); if (seeded) wr(SEED_KEY, seeded); }
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

  window.RPostes = { BASE, merge, list, setLocal, seededLocal, search, used, norm, KEY, SEED_KEY };
})();
