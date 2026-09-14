# Point de reprise — cap produit du 14 septembre 2026

Mis à jour le 14 sept. au soir, lots 0–3 terminés. Sert à continuer dans une
autre session.

## État

- Branche `integ/constat-devis-suivi`, poussée ; **PR #101 ouverte, non
  fusionnée** (https://github.com/nexorasolutionsfr/Nexora-/pull/101).
  Tête du travail : `defbf3f` (sur `30e233d`, lui-même sur `15eead5`).
- Migrations **appliquées sur Test** : `20260919000100` → `000900`.
  **Rien en Production.** Base jetable (schéma Production, dump frais) :
  9 migrations, **78/78**, 0 erreur.
- n8n : variante Test importée et exécutée **dans une instance isolée**
  (`nexora-n8n-recette`, arrêtée ensuite) ; instance vive intacte.
  Production : export généré, **non importé**.

## Preuves

| Quoi | Résultat |
|---|---|
| `next build` (tête) | OK |
| Unitaires | 496 / 496 |
| `constats-mecanicien-serveur.mjs` | 35 / 35 |
| `preuves-devis-serveur.mjs` | 20 / 20 |
| `modeles-travaux-serveur.mjs` | 27 / 27 |
| `relances-travaux-serveur.mjs` | 34 / 34 |
| n8n Test, transport simulé | 3 passages — `n8n-relances-execution-2026-09-14.md` |
| Clavier natif 375 px | mécanicien, devis public + visionneuse, « Préparer le devis », fenêtre de relance |

## Essayer (Test)

Serveur local `http://localhost:3000` (config `nexora-constat-devis`).
Accès : `node scripts/recette/acces-test.mjs lien <email> 3000`, comptes
`recette.constat[.accueil|.meca].2026091416h26@nexora-recette.invalid`,
garage `31578a46-deba-4dd6-9487-7f2d876ec00f`.

## Limites connues

- **Réception réelle non testée** ; classement SMTP de la variante Production
  non exécuté.
- Relance `fb259234…` laissée `bloque` comme trace de l'incident
  (`incident-relance-2026-09-14.md`) : ne pas la « réparer ».

## Prochaine action (pour Baptiste)

Relire `proposition-publication-2026-09-14.md` et la PR #101. Rien n'est
publié sans feu vert.

## Non commencé

Lot 4 (import CSV). Avis Google, IMAP par garage.
