# Listes de postes à importer

Chaque fichier `*.json` est une liste de postes (par ex. un chapitre du CAN),
importable depuis **Ressources › Postes › 📥 Importer une liste**, avec un écran
de tri (cocher, modifier le texte, renommer les catégories, choisir le métré).

`index.json` :
```json
{ "listes": [ { "id": "can-113", "titre": "CAN 113 — Installation de chantier", "fichier": "can-113.json" } ] }
```

Fichier de liste :
```json
{
  "id": "can-113",
  "titre": "CAN 113 — Installation de chantier",
  "postes": [
    { "id": "can113-111", "num": "111", "cat": "113 Installation de chantier", "sub": "Baraques",
      "nom": "Texte court du poste", "metre": "none" }
  ]
}
```
- `id` du poste : unique et stable (sert à savoir ce qui est déjà importé).
- `metre` : `none` | `coupe` (ml) | `surface` (m²) | `volume` (m³) | `auto`.
