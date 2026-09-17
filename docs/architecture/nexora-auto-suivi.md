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
| F — recette globale et corrections | `auto/lot-f-recette-globale` | `auto/lot-e-factures` | [#115](https://github.com/nexorasolutionsfr/Nexora-/pull/115) | fait sur Test |
| G — première utilisation | `auto/lot-g-premiere-utilisation` | `auto/lot-f-recette-globale` | à ouvrir | fait sur Test |

## Recette globale — constats

Parcours d'un propriétaire qui découvre l'application : compte neuf fictif,
largeurs 320, 375 et 390 px (audit automatique : débordement, textes coupés,
boutons sans nom, champs sans libellé, cibles tactiles), et situations limites.

| # | Constat | Traitement |
| --- | --- | --- |
| R1 | L'accueil ne parle ni des factures, ni de « À prévoir », ni des services | **corrigé** (lot G) |
| R2 | Exemple de l'accueil : échéances coupées à 375 px | **corrigé** (lot F) |
| R3 | Inscription : la règle des 8 caractères n'apparaît qu'après une erreur | **corrigé** (lot F) |
| R4 | Juste après l'ajout d'une voiture : « Information manquante » répété, sections vides, pas de première action claire | **corrigé** (lot G) : mot d'accueil, « Pour bien démarrer », « À compléter » |
| R5 | Les onglets « À prévoir » et « Services » oublient la voiture consultée | **corrigé** (lot G) pour « Services » et « Ajouter une facture » ; « À prévoir » reste une vue de toutes les voitures, filtrable |
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

## Lot G — première utilisation et accueil personnel

**Objectif.** Un nouvel utilisateur crée son premier dossier et comprend sa
prochaine action sans explication extérieure.

**Fait.**
- **Accueil.** La promesse cite les factures (« Ajoutez une facture PDF : Nexora essaie de préremplir… »), l'historique, « À prévoir » et les services.
- **Ajout d'une voiture.**
  - Seuls la marque et le modèle sont visibles, avec l'utilité de chaque champ facultatif (énergie : fiches d'entretien ; plaque : reconnaître la voiture sur les factures).
  - Les informations d'échéance sont repliées sous « Calculer les échéances dès maintenant » et s'ouvrent seules en cas d'erreur.
- **Juste après l'ajout.**
  - La fiche s'ouvre sur « <voiture> est dans votre garage ».
  - L'encart « Pour bien démarrer » propose trois gestes : ajouter une facture, indiquer le kilométrage, ajouter la mise en circulation.
  - Chaque geste disparaît une fois fait. « Plus tard » masque l'encart pour cette voiture (mémorisé dans le navigateur).
  - L'encart n'apparaît que tant que le dossier n'a ni intervention ni document.
- **Vocabulaire.** « Information manquante » devient « À compléter », « Date inconnue » devient « Pas encore calculé ».
- **« Mon garage ».**
  - Chaque carte de voiture affiche sa dernière intervention.
  - Le bouton d'ajout dit « Voiture » (lot F).
- **Voiture conservée.**
  - La voiture consultée est retenue pour la session du navigateur ; « Services » et « Ajouter une facture » la reprennent. Une voiture archivée ou supprimée est ignorée.
  - Sur une fiche de service, le nom de la voiture ramène à sa fiche.

**Vérifié.** Parcours navigateur (375 px, compte fictif) :
- voiture ajoutée avec marque et modèle seulement, puis mot d'accueil et encart ;
- kilométrage saisi depuis l'encart (formulaire amené à l'écran), et le geste disparaît ;
- « Plus tard » tient après rechargement ;
- onglet « Services » et ajout de facture reprennent la Yaris, qui n'est pas la voiture principale.

115 tests node.

**Limites.** La mémoire de la voiture consultée et le masquage de l'encart
vivent dans le navigateur, pas dans le compte.
