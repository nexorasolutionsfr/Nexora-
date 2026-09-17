# Nexora Auto — suivi du programme autonome

Document de suivi du travail mené en autonomie à partir du 17 septembre 2026,
à la demande de Baptiste (« NEXORA AUTO — CONTINUATION AUTONOME DU PROJET »).
Il est mis à jour à chaque lot. Le contrat détaillé de chaque lot reste dans
`nexora-auto-v1.md`.

## Règles tenues pendant tout le programme

- Rien en Production : aucune fusion dans `main`, aucun déploiement, aucune
  migration Production. Toutes les migrations sont appliquées sur **Test**.
- Aucune dépense : aucun appel payant ; la lecture de factures reste la lecture
  gratuite du texte des PDF, Claude Haiku reste désactivé.
- Aucun message envoyé à une vraie personne. Aucune donnée réelle : comptes de
  recette en `@nexora-recette.invalid`, documents fictifs.
- Aucun résultat simulé présenté comme réel.

## État de départ vérifié (17 sept. 2026)

- Worktree `nexora-auto`, aucune modification non enregistrée.
- PR empilées, toutes en brouillon et fusionnables : #110 (lot A, base `main`)
  → #111 → #112 → #113 → #114 (lot 5, factures). Le lot A contient le dernier
  `main` (`349652e`).
- Migrations Auto `20260922000100` → `20260922000900` appliquées sur Test.
- Le dépôt n'a ni fichier d'instructions (CLAUDE.md, AGENTS.md) ni lint en
  place (voir section G du plan).

## PR du programme

| Lot | Branche | Base | PR | État |
| --- | --- | --- | --- | --- |
| F — recette globale et corrections | `auto/lot-f-recette-globale` | `auto/lot-e-factures` | à ouvrir | en cours |

## Recette globale — constats

Parcours d'un propriétaire qui découvre l'application : compte neuf fictif,
largeurs 320, 375 et 390 px (audit automatique : débordement, textes coupés,
boutons sans nom, champs sans libellé, cibles tactiles), et situations limites.

| # | Constat | Traitement |
| --- | --- | --- |
| R1 | L'accueil ne parle ni des factures, ni de « À prévoir », ni des services | lot G (première utilisation) |
| R2 | Exemple de l'accueil : échéances coupées à 375 px | **corrigé** (lot F) |
| R3 | Inscription : la règle des 8 caractères n'apparaît qu'après une erreur | **corrigé** (lot F) |
| R4 | Juste après l'ajout d'une voiture : « Information manquante » répété, sections vides, pas de première action claire | lot G |
| R5 | Les onglets « À prévoir » et « Services » oublient la voiture consultée | lot G |
| R6 | Bouton « Ajouter » de « Mon garage » ambigu | **corrigé** : « Voiture », nom accessible « Ajouter une voiture » |
| R7 | Retour sur la connexion après expiration : aucune explication | **corrigé** : « Connectez-vous pour reprendre là où vous en étiez » |
| R8 | Lecture de facture refusée faute de session : écran muet | **corrigé** : message explicite |
| R9 | Un fichier annoncé PDF n'est pas contrôlé : un contenu qui n'est pas un PDF est accepté | lot H (import) |
| R10 | Vérification de facture : les corrections saisies sont perdues si l'on quitte l'écran | lot H |
| R11 | Cibles tactiles de 20 px (« Tout voir », « À prévoir », « Justificatif », « Joindre un justificatif », « Voir dans À prévoir », « Annuler ») | **corrigé** : 32 à 40 px |
| R12 | Titres de document coupés dès 375 px ; titre de tâche coupé à 320 px | **corrigé** : deux lignes au plus |

Vérifié sans défaut : aucune page ne déborde à 320 px ; écrans sans voiture
(chacun propose d'ajouter une voiture) ; session expirée au chargement
(redirection vers la connexion avec retour prévu) ; coupure réseau pendant un
enregistrement (message clair, saisie conservée, bouton de nouveau actif) ;
fichier non accepté (message de format) ; destination conservée après
connexion.
