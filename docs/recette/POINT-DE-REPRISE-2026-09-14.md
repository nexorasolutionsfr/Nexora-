# Point de reprise — PR #101 (constat → devis, modèles, suivi, relances)

Mis à jour le 15 septembre 2026, nuit, pendant le parcours au navigateur. Sert à
continuer dans une autre session. **Ne présente comme fait que ce qui est listé
sous « Fait ».**

## État

- Branche `integ/constat-devis-suivi`, **PR #101 ouverte, non fusionnée**
  (https://github.com/nexorasolutionsfr/Nexora-/pull/101).
- Poussé : `acecd56` (passe de fiabilisation) puis `7fbf99e` (point de reprise).
- **Non commité au moment de cette note** : les corrections du parcours au
  navigateur (frictions 1 à 9 de `parcours-navigateur-2026-09-15.md`), l'outil
  de capture, les captures `parcours-2026-09-15/`. À committer après un
  `next build` vert.
- Migrations **appliquées sur Test** : `20260919000100` → `001000`. **Rien en Production.**
- n8n : instance vive intacte ; instance isolée `nexora-n8n-recette` (inactive).

## Fait

| Lot | Résultat | Détail |
|---|---|---|
| Passe de fiabilisation (5 points) | corrigé et vérifié | `fiabilisation-envois-2026-09-15.md` |
| Parcours complet au navigateur (mécanicien → dirigeant → client → garage → suivi partagé) | joué sur Test, garage isolé | `parcours-navigateur-2026-09-15.md` |
| Frictions du parcours | 9 corrigées, vérifiées bureau et/ou 375 px | idem |
| Tests | unitaires 512/512 | — |

## Défaut préexistant trouvé (aussi en Production)

« Marquer traité » / « Reporter » sur une réponse de client échouait
(`reponse_devis` refusé par la contrainte d'`opportunites_actions`). Corrigé côté
application dans cette PR, sans migration.

## Prochaine action

1. `next build` vert, puis commit et push, description de la PR.
2. Feuille de route (Bureau) et plan n8n : état constaté par catégorie.
3. Livraison : PR + SHA, captures, gestes à vérifier au réveil, recommandation
   dashboard/base et relances séparées.

## Accès recette (Test)

Serveur local `http://localhost:3000` (config `nexora-constat-devis`).
Lien de connexion : `node scripts/recette/acces-test.mjs lien <email> 3000`.
Garage du parcours : comptes `recette.proto.atelier[.accueil|.meca].2026091419h23@nexora-recette.invalid`.

## Non commencé

Lot 4 (import CSV). Saisie de l'opposition à l'écran. Avis Google, IMAP.
