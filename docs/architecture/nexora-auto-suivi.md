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
| G — première utilisation | `auto/lot-g-premiere-utilisation` | `auto/lot-f-recette-globale` | [#116](https://github.com/nexorasolutionsfr/Nexora-/pull/116) | fait sur Test |
| H — import plus fluide | `auto/lot-h-import-fluide` | `auto/lot-g-premiere-utilisation` | à ouvrir | fait sur Test, migration `20260922001000` appliquée sur Test |

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
| R9 | Un fichier annoncé PDF n'est pas contrôlé : un contenu qui n'est pas un PDF est accepté | **corrigé** (lot H) : contenu contrôlé avant envoi et avant lecture |
| R10 | Vérification de facture : les corrections saisies sont perdues si l'on quitte l'écran | **corrigé** (lot H) : brouillon repris sur l'appareil |
| R11 | Cibles tactiles de 20 px (« Tout voir », « À prévoir », « Justificatif », « Joindre un justificatif », « Voir dans À prévoir », « Annuler ») | **corrigé** : 32 à 40 px |
| R12 | Titres de document coupés dès 375 px ; titre de tâche coupé à 320 px | **corrigé** : deux lignes au plus |
| R13 | Deux fichiers de la même facture confirmés au même moment : deux interventions, dépense comptée deux fois (16 cas sur 20 sur Test) | **corrigé** (lot H) : verrou par voiture, 0 sur 30 |
| R14 | Déconnexion depuis un écran privé : renvoi vers « Connectez-vous pour reprendre là où vous en étiez » | **corrigé** (lot H) : retour à l'accueil |
| R15 | Formulaire d'intervention à 320 px : date coupée, étiquettes décalées | **corrigé** (lot H) : champs empilés sous 360 px ; les autres formulaires sont revus au lot I |

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

## Lot H — import des documents plus fluide

**Objectif.** Déposer une facture ne fait jamais perdre de travail, ne crée
jamais de doublon, et une erreur se corrige après confirmation.

**Existant vérifié avant de coder.**
- La facture est conservée avant toute lecture ; la proposition lue est en base (`auto_documents.lecture`) et réutilisée sans nouvel appel.
- Le même fichier (empreinte SHA-256) renvoie vers l'existant ; les droits de la base ne montrent jamais le document d'une autre personne.
- La même facture confirmée deux fois : refusée (verrou de la ligne du document).
- Rien ne permettait de corriger une intervention : seulement la supprimer.
- Les dépenses, le kilométrage et « À prévoir » se déduisent de l'historique à chaque affichage : aucune donnée dérivée à recalculer après une correction.

**Fait.**
- **Contenu des fichiers (R9).**
  - Avant tout envoi, les premiers octets doivent être ceux d'un PDF, JPEG, PNG, WebP ou HEIC/HEIF (`lib/auto/documents.js`, `formatReel`). Un faux PDF est refusé sans aucune requête.
  - Une photo mal nommée (un PNG appelé .jpg) garde son vrai format.
  - Même contrôle côté serveur avant une lecture : un contenu qui ne correspond pas au type enregistré n'est ni réservé ni lu (`raison: "contenu"`).
  - « Autre document » bénéficie du même contrôle et de l'empreinte : le même fichier n'est plus rangé deux fois.
- **Reprendre une vérification (R10).**
  - Ce que la personne modifie est gardé en brouillon sur l'appareil (`lib/auto/brouillon.js`) : par document, 7 jours au plus, contenu vérifié à la relecture.
  - Au retour : « Vos modifications non enregistrées ont été reprises », avec « Revenir à la proposition ».
  - Le brouillon est effacé à l'enregistrement, quand le document est gardé tel quel, si la lecture est relancée, et à la déconnexion.
- **Trois états distincts dans les documents.**
  - Facture conservée, informations proposées : « Informations proposées, à vérifier » et « Vérifier ».
  - Facture conservée, rien de lu : « Intervention à renseigner » et « Compléter ».
  - Intervention confirmée : « Justifie : <intervention> ».
- **Même fichier déposé à nouveau.** Le message dit dans quel dossier il est (« le dossier de Toyota Yaris »), s'il justifie déjà une intervention ou reste à vérifier, et que rien n'a été envoyé à nouveau. Un doublon déposé au même moment dans un autre onglet est reconnu de la même façon.
- **Confirmations simultanées (R13).**
  - `auto_enregistrer_facture` prend un verrou par voiture avant de chercher une intervention ressemblante (migration `20260922001000_auto_import_fluide.sql`).
  - La facture confirmée entre-temps ailleurs affiche « Facture déjà enregistrée : elle a déjà été confirmée, peut-être depuis un autre appareil. Rien n'a été compté deux fois. »
- **Corriger après confirmation.**
  - « Corriger » sur chaque intervention saisie par la personne : type, date, kilométrage, professionnel, montant et, pour une intervention issue d'une facture, ses opérations (`lib/auto/corrections.js`).
  - La provenance ne change pas : « D'après votre facture, corrigée par vous » ; la facture reste jointe ; la dépense reste comptée une fois ; le détail suit les opérations.
  - Une ressemblance avec une autre intervention ou un kilométrage incohérent sont signalés, jamais bloquants ; seules les colonnes modifiées sont écrites.
  - Le titre donné automatiquement à la facture (« Facture <professionnel> ») suit la correction du professionnel ; un titre choisi par la personne n'est jamais touché (déclencheur `auto_historique_titre_documents`).
- **Déconnexion (R14).** Une déconnexion volontaire ramène à l'accueil.

**Vérifié.**
- 130 tests node (nouveaux : contenu des fichiers, brouillon, corrections, lecture refusée sur contenu).
- Bancs SQL sur base jetable puis sur Test :
  - `auto_import_fluide_v1` : correction, provenance, titre automatique ou choisi, formes refusées, autre personne, verrou présent, droits ;
  - `auto_factures_v1` et `auto_droits_v1` rejoués.
- Simultanéité mesurée sur Test (`scripts/recette/factures/concurrence.mjs`, compte fictif créé puis supprimé) :
  - avant la migration : même facture 20/20 correct, deux fichiers de la même facture **16 doublons sur 20** ;
  - après : 30/30 et 30/30, 60 interventions pour 60 attendues.
- Navigateur (375 et 320 px, compte fictif, factures fictives) :
  - faux PDF refusé sans requête ;
  - facture fictive lue, montant et professionnel modifiés, page quittée puis rechargée : modifications reprises, aucune nouvelle lecture ;
  - « Revenir à la proposition », puis enregistrement : brouillon effacé ;
  - même fichier choisi pour l'autre voiture : « déjà dans le dossier de Toyota Yaris », aucun envoi ;
  - correction de la date, du kilométrage, du professionnel, du montant et des opérations : titre de la facture, dépenses et historique suivent, aucune intervention en plus ;
  - confirmation par un « autre appareil » juste avant l'enregistrement : écran « déjà enregistrée », aucune double dépense ;
  - déconnexion : brouillons effacés, retour à l'accueil ;
  - aucune page ne déborde à 320 px.
- Build de production sans erreur ; lint ponctuel : aucune alerte nouvelle.
- Données de recette retirées de Test (documents, interventions, fichiers, fichiers de préparation).

**Limites.**
- Le brouillon vit sur l'appareil : commencé sur le téléphone, il ne se reprend pas sur l'ordinateur (la facture et sa proposition, elles, sont en base).
- Le contrôle du contenu à l'écran est un garde-fou, pas une barrière : un client modifié peut déposer directement dans le stockage. Le compartiment reste limité par type et par taille, les fichiers ne sont servis qu'à leur propriétaire par adresse signée, et la lecture serveur revérifie le contenu. À reprendre au lot L.
- Pas de mesure sur de vraies factures : aucune n'a été fournie.

