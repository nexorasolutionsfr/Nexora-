# Point de reprise — PR #101 (constat → devis, modèles, suivi, relances)

Mis à jour le 15 septembre 2026, fin de nuit. Sert à continuer dans une autre
session. **Ne présente comme fait que ce qui est listé sous « Fait ».**

## État

- Branche `integ/constat-devis-suivi`, **PR #101 ouverte, non fusionnée**
  (https://github.com/nexorasolutionsfr/Nexora-/pull/101).
- Commits de la nuit : `acecd56` (fiabilisation), `2012d39` (parcours au
  navigateur et frictions), puis ce point de reprise.
- Migrations **appliquées sur Test** : `20260919000100` → `001000`.
  **Rien en Production, rien fusionné, aucun envoi réel.**
- n8n : instance vive intacte ; instance isolée `nexora-n8n-recette` arrêtée ;
  serveur SMTP de recette arrêté.

## Fait

| Lot | Résultat | Détail |
|---|---|---|
| Passe de fiabilisation (5 points) | corrigé et vérifié | `fiabilisation-envois-2026-09-15.md` |
| Parcours complet au navigateur | joué sur Test, garage isolé | `parcours-navigateur-2026-09-15.md` |
| Frictions du parcours | 9 corrigées, vérifiées au bureau et/ou à 375 px | idem |
| Build de production | vert sur `2012d39` | — |
| Tests unitaires | 512/512 | — |
| Feuille de route et plan n8n | état constaté par catégorie | Bureau ; `docs/architecture/plan-n8n-2026-09-14.md` |

## Gestes à vérifier au réveil (10 minutes)

1. PR #101 : tête `2012d39` (ou le commit de ce point de reprise juste après).
2. `docs/recette/proposition-publication-2026-09-14.md` : les trois points
   d'arrêt et la règle « jamais de réautorisation automatique ».
3. `docs/recette/parcours-navigateur-2026-09-15.md` : les 9 frictions et le
   défaut préexistant de « Marquer traité » (aussi en Production).
4. Captures : `docs/recette/captures/parcours-2026-09-15/`.
5. Si vous voulez rejouer : serveur local `http://localhost:3000`, puis
   `node scripts/recette/acces-test.mjs lien recette.proto.atelier.2026091419h23@nexora-recette.invalid 3000`.

## Recommandations — deux décisions séparées

- **Dashboard et base : publier**, selon la proposition (répétition sur export
  du jour, relevé avant/après, 10 migrations d'un passage, fusion, contrôle du
  code servi).
- **Relances : ne pas activer.** Manquent la saisie de l'opposition à l'écran,
  un moyen de s'opposer dans le message, la base légale, l'activation par
  garage, une preuve de réception Brevo, et un hébergement hors du Mac.

## Accès recette (Test)

Garage du parcours « PROTO Atelier 2026-09-14-19h23 » : comptes
`recette.proto.atelier[.accueil|.meca].2026091419h23@nexora-recette.invalid`.

## Non commencé

Lot 4 (import CSV). Saisie de l'opposition à l'écran. Avis Google, IMAP.
