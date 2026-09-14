# Point de reprise — cap produit du 14 septembre 2026 (nuit)

Mis à jour à la fin de la mission. Sert à continuer dans une autre session.

## État

- Branche d'intégration : `integ/constat-devis-suivi`, worktree
  `…/nexora-constat-devis`, depuis `origin/main` = `15eead5` (PR #100).
  Commits : `d8d16b9` (lots 0+1), `e3806b7` (lot 2 + largeur mobile),
  `b7f40ed` (lot 3 + portail + plan n8n), puis le commit final (écritures
  directes fermées, base jetable, recette durcie, docs). **Rien de poussé,
  aucune PR ouverte, rien de fusionné.**
- `.env.local` vise **Test** ; `node_modules` copié ; serveur de dev par
  `~/Downloads/.claude/launch.json` (config `nexora-constat-devis`, port 3000).
- Migrations **appliquées sur Test** : `20260919000100` → `000500`.
  **Rien en Production.** Base jetable depuis le schéma de Production :
  5 migrations OK, **53/53** (`docs/recette/base-jetable-2026-09-14.sh`).
- n8n : **rien importé ni activé**. Exports générés dans `n8n/relances-travaux/`.

## Preuves

| Quoi | Résultat |
|---|---|
| Unitaires | 491 / 491 |
| `constat-devis-serveur.mjs` | 31 / 31 |
| `modeles-travaux-serveur.mjs` | 25 / 25 |
| `relances-travaux-serveur.mjs` | 32 / 32 |
| Base jetable (schéma Production) | 53 / 53 |
| Écran | parcours dirigeant (constat → devis → chiffrage → pièce rattachée → modèle) ; parcours accueil (relance relue et autorisée) ; captures 430/375 |

Détail : `docs/recette/constat-devis-2026-09-14.md`.

## Jeu de recette (Test)

Garage « PROTO Constat 2026-09-14-16h26 » `31578a46-deba-4dd6-9487-7f2d876ec00f`,
comptes `recette.constat[.accueil|.meca|.revoque].2026091416h26@nexora-recette.invalid`.
Accès : `node scripts/recette/acces-test.mjs lien <email> 3000`.

État laissé : devis `6FB658` complété et chiffré (4 lignes) ; modèle
« Plaquettes avant » (3 lignes, dont 1 sans prix) ; travail différé « Pneus
arrière à remplacer » avec une relance `bloque` (réservée par erreur par le
script, aucun transport — voir la recette, écart n° 2).

## Prochaine action (pour Baptiste)

1. Relire `docs/recette/proposition-publication-2026-09-14.md`.
2. Avant tout feu vert : `next build`, clavier réel sur les trois nouvelles
   fenêtres, base jetable sur un dump frais, import du workflow Test dans une
   instance n8n **de recette**.
3. Ouvrir les trois PR empilées (lot 1, lot 2, lot 3 avec `000500`).

## Non commencé

Lot 4 (import CSV : mémoire des colonnes, identifiant externe, conflits,
export neutralisé) — `docs/architecture/coexistence-logiciels-existants.md`.
Preuve photo sur le devis public. Saisie du constat par le mécanicien.
Avis Google, IMAP par garage.
