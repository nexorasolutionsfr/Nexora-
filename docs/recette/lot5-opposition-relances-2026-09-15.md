# Recette — Lot 5 « préparer des automatisations fiables, sans les activer », 15 septembre 2026

Branche `lot5/relances-prerequis-inventaire` (depuis `main` `32f52fe`,
**indépendante des lots 1 à 4**). **Aucune migration, aucune activation,
aucun import dans n8n, aucun envoi.** Instance n8n vive et Brevo intouchés.

Livrables :
- `docs/architecture/automatisations-inventaire-2026-09-15.md` — inventaire
  réel (lecture seule) et état de chaque prérequis des relances ;
- `docs/architecture/proposition-reduction-sondage-2026-09-15.md` — proposition
  séparée, fondée sur les volumes mesurés ;
- l'écran d'**opposition du client aux relances** (ci-dessous).

## L'écran d'opposition

Fiche client (Clients › client) : bloc « Relances par e-mail ».
- Aucune ligne au journal → « aucune opposition enregistrée » et, pour le
  titulaire du garage, « Le client refuse les relances » (confirmation).
- Enregistrement par `revenue_recovery_enregistrer_permission` (`statut =
  oppose`, origine « déclaratif garage (demande du client) ») : machine à
  états et contrôle du titulaire faits par la base.
- Opposé → « Refuse les relances par e-mail — Enregistré le … Aucune relance
  de travaux ne lui sera préparée ni envoyée ». Aucun geste pour lever
  l'opposition (preuve nouvelle requise, base juridique à valider).

## Défaut trouvé en recette et corrigé

Le journal n'est lisible que par le titulaire du garage
(`revenue_recovery_permissions_isolation`). Premier essai : l'accueil lisait
« aucune opposition enregistrée » **pour un client opposé**. Correction : le
bloc ne s'affiche qu'au titulaire (session comparée à `garages.owner_user_id`).
Rien plutôt qu'une information fausse ; ouvrir la lecture à l'équipe = migration.

## Vérifications (Test, garage fictif PROTO Atelier)

| Étape | Rôle | Résultat |
|---|---|---|
| Transports Delaunay, avant | titulaire | « aucune opposition enregistrée », bouton présent |
| « Le client refuse les relances » | titulaire | « Refuse les relances par e-mail », bouton retiré ; journal : `oppose`, origine déclarative |
| Préparation des relances (rôle de service), 2 travaux différés échus créés : Transports Delaunay (opposé) et Sonia Bahri (témoin) | base | opposé : **0 relance** ; témoin : `a_relire` (non autorisée, rien envoyé) |
| Transports Delaunay, après correction | accueil | **aucun bloc** (plus d'affirmation fausse), fiche visible |
| Camille Perrin | titulaire | « aucune opposition enregistrée », bouton présent (non cliqué) |

Tests unitaires : `components/clients/opposition.test.js` 4/4.

## Données laissées sur Test

Opposition `oppose` de Transports Delaunay ; travaux différés « RECETTE LOT 5 —
opposition (oppose / temoin) » ; relance `a_relire` du témoin. Aucune
autorisation d'envoi, aucun workflow.

## Non fait (voir l'inventaire, §4)

Lien d'arrêt dans le message ; activation bornée à un garage volontaire ;
lecture de l'opposition par l'accueil ; recette de concurrence dans n8n isolé ;
validation juridique. Les relances restent **indisponibles**
(`CAPACITES.relanceTravauxDifferes`, PR #101).
