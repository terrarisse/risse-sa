# Risse S.A. — Application Mobile
## Document de référence projet

---

## Statut actuel
Application PWA (Progressive Web App) hébergée sur GitHub Pages.
Installable comme vraie app sur Android (Samsung) et iPhone.

---

## Fichiers GitHub à jour (5 fichiers)
```
index.html          → Application complète (code principal)
manifest.json       → Config PWA (nom, couleurs, icônes)
service-worker.js   → Cache offline
icon-192.png        → Icône app (192x192)
icon-512.png        → Icône app (512x512)
```

---

## Fonctionnalités actuelles (v6)

### Navigation
- 5 onglets bottom bar : Saisie · Chantiers · Entretiens · Rapport · Paramètres

### Saisie
- Menu déroulant machine (pré-enregistrée)
- Date auto (modifiable)
- Compteur début pré-rempli avec dernière fin enregistrée
- Compteur fin + total calculé automatiquement
- Chantier : chips pré-enregistrées + champ libre
- Brouillon sauvegardé automatiquement (survit à la fermeture)

### Chantiers
- 3 derniers chantiers affichés (nom + date + machines sur site)
- Tap → popup bottom sheet avec toutes les machines du chantier
- Par machine : compteur début pré-rempli, date partagée, enregistrement individuel

### Entretiens
- Carnet par machine (Suivi Mecalac MWR7, etc.)
- Tap → historique complet des interventions
- Bouton intervention : type, date (auto), heures (auto), note
- Alertes : 🟠 à 15h depuis dernier entretien, 🔴 à 22h
- Point rouge sur l'onglet quand alerte active
- Types d'entretien configurables dans Paramètres

### Rapport
- Stats : total heures, jours actifs, nb entrées
- Tri par : Date / Machine / Chantier (3 boutons)
- Suppression → corbeille silencieuse (7 jours, restaurable)
- Purge automatique des entrées > 30 jours

### Paramètres
- Gestion machines (ajouter/supprimer)
- Gestion chantiers (ajouter/supprimer)
- Gestion types d'entretien (ajouter/supprimer)
- Réinitialisation complète (double confirmation)

---

## Stack technique
- **HTML/CSS/JS** pur — aucune dépendance externe
- **LocalStorage** pour toutes les données (clés : rv6_e, rv6_m, rv6_c, rv6_d, rv6_t, rv6_mt, rv6_types)
- **PWA** : manifest.json + service-worker.js (cache offline)
- **Hébergement** : GitHub Pages (gratuit)
- **Police** : Inter (Google Fonts)

---

## Design
- Fond blanc / Bleu marine #1B3A6B / Teal #1A7F72 / Jaune #F0A500
- Logo Risse S.A. embarqué en base64 dans index.html
- Icône app : carnet brun + horloge + logo Risse en médaillon

---

## Machines pré-enregistrées
- Mecalac MWR7 (Pelle sur roues) — défaut

## Chantiers pré-enregistrés
- Dépôt · Intern · Concassage · Biolette · Transport

## Types d'entretien pré-enregistrés
- Graissage · Vidange huile · Remplacement filtres
- Vérif. courroies · Vérif. niveaux · Autre

---

## Modules à développer (roadmap)

### Priorité haute
- [ ] **Pointage équipe** — heures employés par chantier
- [ ] **Export PDF/WhatsApp** — rapport hebdo ou mensuel

### Priorité moyenne
- [ ] **Fiches chantiers** — photos, notes, avancement, documents
- [ ] **Stock matériaux** — suivi quantités, alertes stock bas

### Priorité basse
- [ ] **Devis rapide** — calcul prix de revient sur chantier
- [ ] **Multi-utilisateurs** — sync entre téléphones

---

## Organisation de travail
- 1 conversation Claude = 1 module
- Toujours commencer par partager ce fichier PROJET.md
- Code toujours sur GitHub avant de démarrer une nouvelle conv.
- Demander le fichier index.html actuel si modifications nécessaires

---

## APK Android
- PWABuilder génère un .apk depuis l'URL GitHub Pages
- Signature V2 nécessaire pour Samsung (Android 7+)
- Peut être signé par Claude si besoin (uploader l'unsigned.apk)

---

*Dernière mise à jour : juin 2026*
