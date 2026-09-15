# Recette d'intégration — les cinq lots et les corrections finales, 15 septembre 2026

La compilation sans conflit n'est pas une recette : cette note rejoue au
navigateur **la tête d'intégration exacte**, servie par le serveur de dev
(`http://localhost:3000`, Supabase **Test**, les deux migrations `20260920*`
appliquées sur Test).

## Ordre d'intégration et SHA testés

Base : `main` `32f52fe`. Fusions dans un clone jetable, chaque SHA vérifié
avant fusion, arrêt au premier écart :

| Ordre | Branche | SHA | Tête après fusion |
|---|---|---|---|
| 1 | `lot1/parcours-devis` (#103) | `0c8ca3f` | `0c8ca3f` (avance rapide) |
| 2 | `lot2/coherence-documents` (#104) | `b239bd7` | `c925a98` |
| 3 | `lot3/atelier-telephone` (#105) | `2fb888a` | `bd6a5b3` |
| 4 | `lot4/premieres-minutes` (#106) | `4dc776d` | `2de1a55` |
| 5 | `lot5/relances-prerequis-inventaire` (#107) | `1ff780c` | **`f268b22`** |

Aucun conflit ; **528/528 tests** ; **build de production vert** sur `f268b22`.
`f268b22` n'est pas poussée : elle a servi de code de recette.

Après cette recette, la branche du lot 2 reçoit un commit **de documentation
seule** (cette note, la proposition de publication, les captures) ; le code
testé est inchangé (vérifiable par `git diff b239bd7 <tête lot 2> -- ':!docs'`).

## Parcours rejoués sur `f268b22`

| Parcours | Rôle / largeur | Gestes réels | Résultat |
|---|---|---|---|
| Ouverture et retour du devis | dirigeant, 1280 px | recherche « BB-202 » › Entrée › « Réf. 09B786 · Accepté » › « Revenir au dossier BB-202-BB » | devis accepté ouvert, lignes en lecture seule ; dossier rouvert |
| Complément explicite | dirigeant, 1280 px | dossier › « Préparer le devis depuis le constat » › « Nouveau devis complémentaire pour cette visite » › case du constat | décoché d'avance, « Déjà chiffré dans le devis accepté Réf. 09B786 » ; coché → « Complément : ce point sera chiffré à nouveau… », « Créer le devis » actif ; **annulé sans créer** |
| Génération de facture | dirigeant, 1280 px | Facturation › Factures › **trois clics** « Générer la facture » (BH-808-HH) | fenêtre F-2026-0007 ; en base : **1 facture** pour la fiche, compteur 7, F-2026-0001 à 0006 intactes |
| Commandes mobiles — mécanicien | mécanicien, 375 px | fiche BB-202-BB › « Diagnostic » › « Véhicule déposé » | six étapes et retour à 40 px, étape changée puis remise, aucun débordement |
| Commandes mobiles — saisie du contrôle | dirigeant, 375 px | Contrôle véhicule › BB-202-BB › Reprendre la saisie › Suivant ×5 | étape 6 : fermeture 40×40, corbeille 40×40, photo 28×28, noms présents, aucun débordement |
| Premier client | garage neuf, 1280 px | Aujourd'hui › « Ajouter un client » | « Nouveau client » ouvert, focus sur le nom ; **annulé sans enregistrer** |
| Opposition — titulaire | dirigeant titulaire, 1280 px | Clients › Transports Delaunay | « Refuse les relances par e-mail », pas de bouton |
| Opposition — accueil | accueil, 1280 px | Clients › Transports Delaunay | **aucun bloc** d'opposition, fiche visible |

Garanties serveur prouvées hors navigateur sur Test (voir
`lot2-coherence-documents-2026-09-15.md`) : deux sessions concurrentes → une
facture ; contrôle incohérent refusé.

Captures : `captures/integration-2026-09-15/integ-*.png`.

## Ce qui n'a pas été rejoué sur l'intégration

- Création réelle d'un devis complément, chiffrage, modèle et lien : joués sur
  la branche du lot 1 (`lot1-parcours-devis-2026-09-15.md`), pas à nouveau ici.
- Enregistrement d'une nouvelle opposition : joué sur la branche du lot 5.
- Rôle accueil sur l'écran Devis compact : joué sur la branche du lot 1.
