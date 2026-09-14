# Point de reprise — cap produit du 14 septembre 2026 (nuit)

Mis à jour aux frontières de lots. Sert à continuer dans une autre session.

## Où l'on en est

- Branche d'intégration : `integ/constat-devis-suivi`, worktree
  `…/nexora-constat-devis`, créée depuis `origin/main` = `15eead5` (PR #100).
  Commits : `d8d16b9` (lots 0+1), `e3806b7` (lot 2 + largeur mobile).
- `.env.local` copié depuis `nexora-video-controle-photo` : vise **Test**
  (`slawilafseganlbghgwx`). `node_modules` copié (pas de lien symbolique).
- Serveur de dev : `.claude/launch.json` de `~/Downloads`, config
  `nexora-constat-devis`, port 3000.
- Miroir Supabase jetable : `scratchpad/miroir-test` (lié à Test, dossier
  `supabase/migrations` vidé après chaque push).
- Migrations **appliquées sur Test** : `20260919000100_constat_vers_devis`,
  `20260919000200_modeles_de_travaux`. Rien en Production.

## Lots 0, 1, 2 : implémentés et recettés sur Test

- Jeu : `scripts/recette/jeu-constat-devis.mjs creer` → garage « PROTO Constat
  2026-09-14-16h26 » (`31578a46-deba-4dd6-9487-7f2d876ec00f`), comptes
  `recette.constat[.accueil|.meca|.revoque].2026091416h26@nexora-recette.invalid`.
- Serveur : `constat-devis-serveur.mjs` 31/31, `modeles-travaux-serveur.mjs` 25/25.
- Unitaires : `node --test $(find components lib -name "*.test.js")` → 491/491.
- Écran (navigateur intégré, dirigeant) : dossier BA-101-AA → « Préparer le
  devis depuis le constat » → devis complété (2 lignes à chiffrer, photo) →
  chiffrage → pièce rattachée au constat → blocs d'envoi revenus. Modèle
  « Plaquettes avant » créé dans Paramètres.
- Mobile : captures headless 430/375 dans
  `docs/recette/captures/constat-devis-2026-09-14/` ; le débordement venait de
  l'en-tête (548 px), corrigé.

## Lot courant : 3 (suivi commun, préparation de suivi, inventaire n8n)

### Prochaine action
- Recette écran de « Ajouter un modèle » / « Enregistrer comme modèle » (Devis).
- Rédiger `docs/recette/constat-devis-2026-09-14.md` (lots 0-2).
- Lot 3A : policy `opportunites_actions` (dirigeant + accueil actif),
  préparation de suivi des travaux différés (migration `20260919000300`),
  inventaire n8n (`docs/architecture/plan-n8n-2026-09-14.md`).

### Blocages
- Aucun.

## Reste après (non commencé)
- Lot 4 (import CSV) conditionnel.
- Feuille de route unique, proposition de publication, compte rendu.
