# Point de reprise — cap produit du 14 septembre 2026 (nuit)

Mis à jour aux frontières de lots. Sert à continuer dans une autre session.

## Où l'on en est

- Branche d'intégration : `integ/constat-devis-suivi`, worktree
  `…/nexora-constat-devis`, créée depuis `origin/main` = `15eead5` (PR #100).
- `.env.local` copié depuis `nexora-video-controle-photo` : vise **Test**
  (`slawilafseganlbghgwx`). `node_modules` copié (pas de lien symbolique).
- Serveur de dev : `.claude/launch.json` de `~/Downloads`, config
  `nexora-constat-devis`, port 3000.
- Miroir Supabase jetable : `scratchpad/miroir-test` (lié à Test, dossier
  `supabase/migrations` vidé après chaque push).

## Lot courant : 1 (constat → devis) — lot 0 en cours dans la même PR

### Fait
- Inventaire (schéma Test dumpé : `scratchpad/miroir-test/schema-test-public.sql`).
- Défaut « inspection modifiée sans effet » **reproduit** : rôle `mecanicien`
  → UPDATE 204, 0 ligne, aucune erreur ; dirigeant/accueil sur contrôle
  verrouillé → erreur levée mais l'écran garde la valeur optimiste.
- Migration `20260919000100_constat_vers_devis.sql` écrite et **appliquée sur
  Test** (dry-run puis push, 14 sept.).
- Jeu de recette `scripts/recette/jeu-constat-devis.mjs` (garage « PROTO
  Constat … »).

### Prochaine action
- Écran : bouton « Préparer le devis » dans le dossier véhicule + fenêtre de
  reprise (`components/devis-lignes/PreparerDevisDepuisConstat.jsx`) ; état
  « Prix à renseigner » dans `DevisLignesEditor` ; suppression du `find` par
  `vehicule_id` (`AujourdhuiJour.jsx:189`, `NexoraDashboard.jsx:6656`) au
  profit de `devis.rendez_vous_id` / `ordre.devis_id`.
- Lot 0 : `InspectionsSection.jsx` — sauvegardes avec `.select()` et retour
  arrière de l'état optimiste ; modale de saisie à 375/430 px.

### Tests accomplis
- Aucun test automatisé encore lancé sur cette branche.

### Blocages
- Aucun.

## Lots suivants
- Lot 2 : modèles de travaux (migration `20260919000200`).
- Lot 3 : suivi partagé (`opportunites_actions`), préparation de suivi des
  travaux différés, inventaire n8n.
- Lot 4 : conditionnel.
