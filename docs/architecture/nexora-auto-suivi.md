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
| H — import plus fluide | `auto/lot-h-import-fluide` | `auto/lot-g-premiere-utilisation` | [#117](https://github.com/nexorasolutionsfr/Nexora-/pull/117) | fait sur Test, migration `20260922001000` appliquée sur Test |
| I — mobile et accessibilité | `auto/lot-i-mobile-accessibilite` | `auto/lot-h-import-fluide` | [#118](https://github.com/nexorasolutionsfr/Nexora-/pull/118) | fait sur Test, sans migration |
| J — kilométrage et rappels | `auto/lot-j-kilometrage-rappels` | `auto/lot-i-mobile-accessibilite` | [#119](https://github.com/nexorasolutionsfr/Nexora-/pull/119) | fait sur Test, sans migration |
| K — maîtrise du dossier | `auto/lot-k-maitrise-dossier` | `auto/lot-j-kilometrage-rappels` | [#120](https://github.com/nexorasolutionsfr/Nexora-/pull/120) | fait sur Test, sans migration |
| L — consolidation technique | `auto/lot-l-consolidation` | `auto/lot-k-maitrise-dossier` | [#121](https://github.com/nexorasolutionsfr/Nexora-/pull/121) | fait sur Test, sans migration |
| Livraison et compte rendu | `auto/livraison` | `auto/lot-l-consolidation` | [#122](https://github.com/nexorasolutionsfr/Nexora-/pull/122) | documents seulement ; rien d'exécuté en Production |
| Bêta privée | `auto/beta-privee` | `auto/livraison` | [#123](https://github.com/nexorasolutionsfr/Nexora-/pull/123) | fait sur Test, migration `20260922001100` appliquée sur Test (mode `beta`) |

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
| R16 | Focus clavier des boutons et liens : contour bleu à 50 % d'opacité, peu visible | **corrigé** (lot I) : contour plein de 2 px |
| R17 | Texte agrandi (150 %, 200 %) : onglets hors de l'écran, pastilles, montants, listes et fieldsets qui débordent ou se coupent | **corrigé** (lot I) : 0 débordement sur 9 écrans |
| R18 | Puces de choix de 30 px ; liens « Compléter » de 20 px | **corrigé** (lot I) : 36 et 40 px |
| R19 | Formulaires de la fiche et de la facture : erreurs non reliées à leur champ, focus laissé sur le bouton | **corrigé** (lot I) |
| R20 | Pas de prise de photo directe ; « Voir » la facture échoue sans rien dire | **corrigé** (lot I) |
| R21 | Un kilométrage mal saisi (234 000 au lieu de 23 400) ne se corrige ni ne se supprime, et fausse la révision (« en retard » de milliers de km) | **corrigé** (lot J) |
| R22 | Contrôle technique dépassé : « Me le rappeler plus tard » le retire de l'accueil | **corrigé** (lot J) : non reportable, en tête |
| R23 | « Pensez à actualiser le kilométrage » affiché même quand il ne sert à rien | **corrigé** (lot J) |
| R24 | Tâches terminées : seules les 10 dernières sont retrouvables | **corrigé** (lot J) |
| R25 | Un document ne se renomme, ne se reclasse ni ne se détache : seulement supprimer et redéposer | **corrigé** (lot K) |
| R26 | Suppressions : les conséquences (dépense, justificatifs, fichiers) ne sont pas dites | **corrigé** (lot K) |
| R27 | Supprimer une voiture laisse les fichiers déposés depuis un autre appareil et ses rappels reportés | **corrigé** (lot K) |
| R28 | Pas de moyen de garder ou transmettre le dossier d'une voiture | **corrigé** (lot K) : export imprimable et tableau |
| R29 | Boutons « Enregistrer / Annuler » hors de l'écran en texte agrandi | **corrigé** (lot K) |
| R30 | Lecture PDF : un fichier au décompte de pages trompeur est entièrement analysé, sans limite de durée | **corrigé** (lot L) |
| R31 | Journal serveur d'une erreur de lecture inattendue : message complet, qui pourrait contenir du texte de facture | **corrigé** (lot L) |
| R32 | Les prévisualisations Vercel des branches utilisent la base de **Production** | **constaté** (bêta) : Nexora Auto s'y ferme de lui-même ; réglage Vercel à corriger par Baptiste |
| R33 | En Production, les routes serveur s'exécutent aux États-Unis (`iad1`) : une facture lue y serait traitée | **constaté** (bêta) : décision D2 |
| R34 | `/auto` serait public dès le déploiement, sans moyen de limiter l'accès | **corrigé** (bêta) : fermé par défaut, bêta sur invitation, contrôle en base |
| R35 | Lint ponctuel seulement, hors dépôt | **corrigé** (bêta) : `npm run lint:auto`, exceptions écrites dans le code |
| R36 | Fichiers privés servis derrière un cache d'une heure : après un retrait d'accès, la même session peut encore recevoir un fichier déjà téléchargé | **mesuré et documenté** (préparation) : un autre compte reste refusé, un fichier jamais téléchargé aussi ; `cacheControl: "0"` n'y change rien |
| R37 | `AUTO_ACCES=ferme` ferme l'application mais pas l'accès direct à la base : une session ouverte lit et écrit encore | **mesuré et documenté** (préparation) : seule la fermeture en base coupe les données |
| R38 | `preferredRegion` déprécié par Next 16 ; une région par fonction impossible sur l'offre Hobby | **corrigé** (préparation) : `vercel.json` avec une région unique, `dub1` |
| R39 | Trois onglets, et « Mon garage » servait d'accueil : rien ne disait à l'automobiliste quoi faire maintenant | **corrigé** (B2C) : quatre espaces, écran « Aujourd'hui » avec une seule action mise en avant |
| R40 | « Rien d'urgent dans les N prochains jours », avec une coche verte, sur la seule absence d'échéance enregistrée | **corrigé** (B2C) : « Aucune échéance …, d'après ce qui est enregistré », sans coche, et ce qui manque est nommé |
| R41 | La voiture consultée n'était gardée que pour l'onglet du navigateur : elle était reperdue à chaque retour | **corrigé** (B2C) : gardée sur l'appareil, oubliée à la déconnexion |
| R42 | Aucun texte de confidentialité propre à Nexora Auto, alors que le rôle y est celui de responsable de traitement | **corrigé** (B2C) : `/auto/confidentialite`, lié depuis l'inscription, l'accueil public et « Compte » |
| R43 | Aucun endroit pour son compte : la déconnexion vivait dans l'en-tête, l'horizon dans « À prévoir » | **corrigé** (B2C) : écran « Compte » |
| R44 | Un lien de confirmation périmé ramenait sur `/auto`, qui ne lisait pas le fragment d'erreur : « Ajoutez votre voiture », sans un mot sur le lien mort | **corrigé** (mise en ligne) : l'accueil applique les décisions déjà testées pour Nexora Pro |
| R45 | Après « Se déconnecter », l'écran de connexion disait « Connectez-vous pour reprendre là où vous en étiez » | **corrigé** (mise en ligne) : un départ voulu renvoie à l'accueil |
| R46 | Aucune sauvegarde restaurable n'est listée pour le projet de Production (`pitr_enabled: false`, `backups: []`) | **constaté** : trois exports pris à la main avant les migrations ; à décider, une politique de sauvegarde |

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

## Lot I — mobile, documents et accessibilité

**Objectif.** L'application reste utilisable sur un petit téléphone, avec le
texte agrandi, au clavier et au lecteur d'écran, et un document se prend en
photo sans détour.

**Méthode.** Jeu de données fictif « extrême » sur le compte de recette :
- kilométrage à 7 chiffres, montant à 5 chiffres ;
- professionnel de 120 caractères, 12 opérations longues ;
- nom de fichier de 100 caractères, facture à vérifier avec 9 opérations ;
- contre-visite en retard, tâche au titre long.

Deux audits sur 9 écrans, rejouables et versés au dépôt :
- `scripts/recette/audit-ecrans.mjs` : 320, 375 et 390 px ; débordement, textes coupés, noms, libellés, cibles, focus visible, titres ;
- `scripts/recette/audit-texte-agrandi.mjs` : texte à 150 % et 200 %.

Les deux s'appuient sur Chrome sans interface et un profil jetable effacé en fin d'audit.

**Fait.**
- **Focus clavier (R16).**
  - Contour plein de 2 px, couleur d'accent, pour les liens, boutons, puces et champs de fichier de Nexora Auto (`app/globals.css`, portée `.espace-auto` : le logiciel garage n'est pas touché).
  - Lien « Aller au contenu » en premier arrêt de tabulation.
- **Texte agrandi (R17).**
  - Les onglets passent à la ligne.
  - Les pastilles, montants, kilométrages, listes de dépenses et en-têtes de section se replient au lieu de déborder, et les fieldsets ne s'élargissent plus.
  - Dans les listes (historique, documents, services), les icônes décoratives s'effacent quand la place mesurée en rem manque (requêtes de conteneur). Les actions passent sous le texte.
  - À taille normale, 320 px compris, la mise en page ne change pas.
- **Cibles (R18).** Style de puce commun (`puce`, `puceEtat`) de 36 px de haut ; « Compléter » et « Vérifier » à 40 px.
- **Erreurs (R19).**
  - Relevé, intervention, correction, intervalle, procès-verbal, mise en circulation et vérification de facture : chaque message est relié à son champ (`aria-describedby`).
  - Après un envoi refusé, le focus va au premier champ à corriger (`focaliserPremiereErreur`). S'il faut trancher une ressemblance, il va au choix « Rattacher / Créer ».
- **Documents et photos (R20).**
  - « Choisir un fichier » et, sur écran tactile, « Prendre une photo » (appareil photo arrière, `capture="environment"`) : facture et « Autre document » (`components/auto/ChoixFichier.jsx`).
  - Le nom et la taille du fichier choisi sont annoncés.
  - Un échec d'ouverture de la facture (« Voir ») affiche un message.

**HEIC : évaluation, sans dépense ni transfert.**
- Une photo prise depuis le bouton « Prendre une photo » arrive en JPEG (comportement des navigateurs mobiles pour une capture directe) : elle s'ouvre partout. À confirmer sur un vrai iPhone lors de la recette téléphone.
- Une photo HEIC choisie dans la photothèque d'un iPhone est acceptée et conservée telle quelle. Elle s'ouvre sur les appareils Apple ; ailleurs, le navigateur la télécharge au lieu de l'afficher.
- Conversion gratuite possible dans le navigateur (bibliothèque libheif compilée en WebAssembly, par exemple heic2any ou heic-to) :
  - rien ne sort de l'appareil, mais environ 1 à 3 Mo de code à charger à la demande et quelques secondes de calcul sur un téléphone ;
  - la licence LGPL de libheif et le décodage HEVC (brevets) sont à examiner avant un usage commercial.
- Côté serveur, les binaires habituels de traitement d'image (sharp/libvips précompilés) ne décodent pas le HEVC.
- **Non retenu pour l'instant.** Piste gratuite à vérifier d'abord sur iPhone : un `accept` sans types HEIC pourrait amener Safari à convertir lui-même en JPEG au moment du choix.

**Vérifié.**
- Audits sur 9 écrans, avec session (accueil, fiche, « À prévoir », services, fiche de service, ajout et vérification de facture, ajout de voiture) et sans session (accueil, connexion) :
  - 320, 375 et 390 px : aucun défaut relevé ;
  - texte à 150 % et 200 % : aucun élément hors de l'écran, aucun contenu coupé (hors lien d'évitement masqué).
- Captures contrôlées : sélecteur de fichier et « Autre document » à 320 et 375 px, historique à 320 px (mise en page d'origine) et à 200 %, focus d'une puce.
- Navigateur :
  - écran tactile : le bouton photo est présent, avec `accept="image/*"` et `capture="environment"`, et le nom du fichier choisi s'affiche ;
  - envoi refusé d'une intervention : focus sur « Type », message relié ;
  - tabulation : « Aller au contenu » d'abord, contour de 2 px, puis le focus arrive dans le contenu.
- 130 tests node ; lint ponctuel sans nouvelle alerte.
- Données fictives retirées de Test, profils Chrome temporaires effacés.

**Limites.**
- Pas d'essai sur de vrais téléphones ni avec un vrai lecteur d'écran (VoiceOver, TalkBack) : les contrôles sont automatiques et au clavier.
- Le réglage « taille du texte » d'iOS n'agrandit pas les pages web ordinaires. L'agrandissement mesuré ici correspond au zoom du texte des navigateurs et au réglage d'Android pour les tailles exprimées en rem ; quelques tailles en pixels (15 px, 13 px) ne suivent que le zoom du navigateur.
- Clavier virtuel ouvert : non mesurable sans appareil ; les champs restent de vrais champs natifs et l'en-tête fixe mesure environ 100 px.

## Lot J — kilométrage et rappels sobres

**Objectif.** Des kilométrages compréhensibles et corrigeables, une estimation
qui ne s'appuie jamais sur des données fausses, et des rappels qui ne
dérangent qu'à bon escient.

**Existant vérifié.**
- Relevé et compteur d'intervention gardent déjà leur date et leur source.
- L'estimation est séparée du relevé, et une vidange seule ne relance pas la révision.
- Une voiture archivée ne produit plus rien, pas même les envois préparés.
- Un report masque le rappel sans changer l'échéance.
- Une tâche de prestation rouverte alors qu'une autre est ouverte est refusée par la base (banc `auto_services_v1`, message clair).

**Fait.**
- **Kilométrages enregistrés** (fiche, « Kilométrages enregistrés »).
  - Chaque relevé et chaque compteur d'intervention est listé avec sa date et sa source : saisi par vous, enregistré par Nexora, intervention.
  - Un relevé saisi se corrige ou se supprime ; celui d'une intervention ouvre la correction de l'intervention.
  - Les relevés Nexora ne sont pas modifiables.
- **Incohérences** (`lib/auto/kilometrage.js`).
  - Compteur qui recule, rythme de plus de 1 500 km par jour, ou deux compteurs très différents le même jour.
  - Elles sont montrées en clair sur la fiche (« 23 400 km le 17 sept. 2026 est inférieur à 234 000 km le 1er juin 2026 ») et marquées « À vérifier » dans la liste. Rien n'est corrigé sans la personne.
- **Estimation suspendue** tant qu'une incohérence demeure : ni rythme, ni kilométrage estimé.
- **Révision au compteur « à vérifier ».**
  - L'urgence ne vient que de la date, avec l'action « Vérifier les kilométrages ».
  - Si l'intervalle n'est qu'en kilomètres, l'élément passe « à compléter » au lieu d'afficher un faux retard.
- **Nouveau relevé qui contredit les autres.** Le message est affiché dans le formulaire et le bouton devient « Enregistrer quand même » ; ce remplacement de `window.confirm` fonctionne au lecteur d'écran.
- **Moins de demandes.** « Actualisez le kilométrage » n'apparaît que si le compteur sert à suivre la révision.
- **Échéance critique** (`aPrevoir.js`).
  - Cas couverts : contrôle technique qui n'est plus valable (date dépassée, ou défaillance critique dont la validité se limitait au jour du contrôle).
  - L'alerte est rouge sur la fiche et dans « À prévoir », sans « Me le rappeler plus tard ».
  - Un ancien report est ignoré, et l'échéance passe en tête des prochaines actions de l'accueil.
  - Règles relues le 17 septembre 2026 sur service-public.gouv.fr (fiche F2878, page vérifiée le 1er janvier 2026) : premier contrôle dans les 6 mois avant les 4 ans, puis tous les 2 ans ; défaillance majeure valable 2 mois ; défaillance critique limitée au jour ; contre-visite sous 2 mois ; circuler sans contrôle valide expose à une amende et à l'immobilisation.
- **Tâches terminées** : toutes retrouvables, les plus récentes d'abord.

**Vérifié.**
- 138 tests node. Nouveaux cas :
  - lignes et sources ;
  - recul, rythme, même jour ;
  - estimation suspendue ;
  - révision sans faux retard ;
  - CT critique non reportable et en tête ;
  - report sans effet sur date, urgence et délai ;
  - vidange contre révision ;
  - 14 tâches terminées retrouvées.
- Navigateur (375 px, compte fictif) :
  - relevé fautif de 234 000 km : alerte sur la fiche, révision « Avant le 1er mars 2027 » sans retard au compteur, action « Vérifier les kilométrages » qui ouvre la liste ;
  - correction à 22 800 km : alerte levée, révision « dans environ 12 600 km ou avant le 1er mars 2027 » ;
  - nouveau relevé de 2 340 km : message puis « Enregistrer quand même », alerte « même jour », suppression depuis la liste ;
  - CT dépassé avec un ancien report : alerte, pas de report proposé, premier des prochaines actions de l'accueil.
- Audits 320/375/390 px et texte agrandi sur la fiche (liste ouverte) et « À prévoir » : aucun défaut. Lint ponctuel sans nouvelle alerte.
- Jeu fictif retiré de Test (le relevé d'origine de la Yaris est rétabli).

**Limites.**
- Le seuil de 1 500 km par jour est une borne de bon sens, pas une règle officielle.
- La révision reste suivie selon l'intervalle recopié par la personne, jamais selon une préconisation constructeur.
- Les rappels hors de l'application (e-mail, notification) restent préparés et non branchés.

## Lot K — maîtrise du dossier personnel

**Objectif.** La personne garde la main sur ce qu'elle a déposé : elle corrige,
détache, comprend ce qu'une suppression emporte, et peut emporter son
dossier.

**Existant vérifié.**
- Les droits de la base permettent déjà à la personne de modifier ses documents : la cohérence voiture, chemin et intervention est contrôlée par un déclencheur.
- Une intervention supprimée laisse ses documents détachés (`on delete set null`).
- Supprimer une voiture efface en cascade historique, relevés, documents et tâches, mais pas les rappels reportés (clé textuelle).
- Archivage et voiture principale passent par des fonctions en base.

**Fait.**
- **Modifier un document** (crayon sur chaque document saisi par la personne) : titre, type, date, et intervention justifiée.
  - Choisir « Aucune » détache le document : l'intervention reste, avec sa dépense, et le formulaire le dit avant d'enregistrer.
  - Une facture détachée redevient « à vérifier » ; la reconfirmer propose de la rattacher (règle du lot E, rien n'est dupliqué).
  - Un titre choisi n'est plus remplacé par le titre automatique.
- **Conséquences dites avant de supprimer.**
  - Document : fichier effacé ; l'intervention justifiée reste, avec sa dépense.
  - Intervention : sa dépense ne compte plus ; ses justificatifs restent, et une facture redevient « à vérifier ».
  - Voiture : nombre d'interventions, de relevés, de documents et de fichiers effacés, caractère irréversible, conseil d'exporter avant ou d'archiver.
- **Pas de fichier orphelin.**
  - Supprimer une voiture vide tout son dossier du stockage, y compris les fichiers qu'un autre appareil aurait ajoutés, puis retire ses rappels reportés.
  - Supprimer un document réessaie une fois le retrait du fichier.
  - Relevé de contrôle en lecture seule : `supabase/tests/auto_fichiers_orphelins.sql`.
- **Exporter le dossier** (« Exporter » sur la fiche, page `/auto/vehicules/<id>/dossier`, `lib/auto/export.js`).
  - Contenu : voiture, interventions avec provenance et opérations, kilométrages avec source, dépenses déclarées, liste des documents.
  - En-tête : « ni un certificat, ni un historique vérifié ».
  - « Imprimer ou enregistrer en PDF » : l'en-tête de l'application et les boutons ne s'impriment pas.
  - « Tableau (CSV) » : séparateur « ; », marque UTF-8, formules neutralisées.
  - Tout est préparé dans le navigateur ; aucun fichier ni lien de document n'est inclus.
- **Texte agrandi** : les rangées « Enregistrer / Annuler » passent à la ligne.

**Vérifié.**
- 141 tests node (export : contenu, provenance, absence de chemins, CSV, nom de fichier).
- Navigateur (compte fictif) :
  - facture renommée et détachée : l'intervention reste, la facture passe « à vérifier » ;
  - document reclassé en procès-verbal et rattaché au contrôle ; facture rattachée de nouveau ;
  - textes de confirmation exacts pour l'intervention et le document ;
  - export : page, tableau (formule neutralisée), impression en PDF contrôlée (2 pages, sans en-tête ni boutons) ;
  - voiture jetable supprimée : 0 fichier restant, y compris un fichier non chargé à l'écran, et 0 rappel reporté ;
  - archivage de la voiture principale : l'autre devient principale, plus rien dans « À prévoir » ; export d'une voiture archivée ; restauration puis « Définir comme principale ».
- Audits 320/375/390 px et texte agrandi (export, fiche, modification de document, relevé) : aucun défaut.
- Fichiers orphelins sur Test après recette : 0 dans un sens comme dans l'autre.
- Données fictives retirées.

**Suppression du compte : décisions à prendre (rien n'est supprimé aujourd'hui).**

Nexora Auto n'a pas encore de suppression de compte. À trancher avant la
production :

1. **Parcours.** Demande depuis l'application, confirmation par le mot de passe ou par un lien e-mail, délai de rétractation (par exemple 7 jours) ou effet immédiat.
2. **Ce qui est effacé.**
   - Voitures, historique, relevés, documents, tâches, rappels reportés et préférences : cascade déjà en place.
   - Fichiers du stockage : à vider par le serveur, dossier `<compte>/`.
   - Compte d'authentification : API d'administration, côté serveur seulement.
3. **Ce qui est conservé.** Le journal des lectures (`auto_lectures`) garde ses lignes sans lien personnel (`proprietaire_id` passe à null) pour le suivi des coûts. À confirmer, ou à effacer aussi.
4. **Export proposé avant la suppression.** L'export du lot K suffit pour une voiture ; un export de toutes les voitures est à ajouter si besoin.
5. **Obligations.** Durée de conservation annoncée dans la politique de confidentialité ; traces techniques (journaux Supabase, sauvegardes : effacement effectif à l'expiration des sauvegardes) ; réponse à une demande d'effacement dans le délai d'un mois (RGPD, articles 12 et 17).
6. **Relation avec Nexora Pro.** Un même e-mail peut avoir un compte garage. La suppression du compte Auto ne doit pas toucher un espace garage : règle à écrire avant d'implémenter.

**Limites.**
- L'export ne couvre qu'une voiture à la fois et n'inclut pas les échéances calculées : elles changent avec le temps et seraient trompeuses une fois imprimées.
- Les rappels hors application n'existent pas encore : rien à nettoyer de ce côté.

## Lot L — consolidation technique

**Objectif.** Prouver, par la vraie API et non par hypothèse, qu'un compte ne
touche jamais au dossier d'un autre, que les fichiers et le contenu non fiable
sont bornés, et qu'aucun échec ne laisse un état trompeur.

**Fait.**
- **Accès croisés, de bout en bout** (`scripts/recette/acces-croises.mjs`). Deux comptes fictifs créés puis supprimés.
  - Alice remplit un dossier complet ; Bruno et un visiteur sans session tentent d'y accéder par la base, les fonctions, le stockage privé et la route de lecture.
  - Deux témoins positifs prouvent que les refus ne sont pas vides de sens : Alice retrouve son fichier et en obtient une adresse signée.
- **Lecture des PDF** (`lib/auto/lecture/texte-pdf.js`).
  - Le nombre de pages est revérifié une fois le PDF réellement ouvert : 4 au plus, `pdf_trop_long`.
  - L'extraction est interrompue après 15 secondes (`delai_depasse`).
  - Ces deux échecs sont non facturés, définitifs et expliqués à l'écran.
- **Journal serveur.** Une erreur de lecture inattendue n'écrit plus que l'identifiant de la tentative et le nom de l'erreur, jamais son message ni sa pile.
- **Relevé des fichiers orphelins** (lot K) rejoué.
- **Scripts de recette relus au lint** : l'audit d'écrans du lot I gardait un contrôle de contour « pâle » inopérant (expression régulière cassée dans une chaîne) et du code mort. Le contrôle est retiré : le changement visible au focus suffit depuis le contour plein de 2 px. Les scripts de recette Auto passent désormais le lint.

**Vérifié.**
- Accès croisés : **47/47** sur Test, avec le serveur local pour la route de lecture.
  - Lecture, modification et suppression refusées sur les 5 tables du dossier.
  - Empreinte et reports invisibles.
  - Aucune écriture possible dans la voiture d'Alice, et Bruno ne peut pas s'attribuer la voiture.
  - Refusées aussi : confirmation de sa facture, voiture principale, archivage, réservation de lecture (serveur seulement).
  - Stockage privé : ni téléchargement, ni adresse signée, ni liste du dossier, ni dépôt, ni effacement.
  - Un visiteur ne lit rien de 6 tables, ni aucun fichier.
  - Route de lecture : 401 sans session ou avec un jeton forgé ; 404 pour le document d'un autre ; aucune tentative journalisée.
  - Le dossier d'Alice reste intact.
  - Compartiment : type `text/html` refusé, fichier de plus de 10 Mo refusé.
- Bancs SQL rejoués sur Test : `auto_mon_vehicule_v1`, `auto_mon_garage_consolide_v1`, `auto_a_prevoir_v1`, `auto_services_v1`, `auto_droits_v1`, `auto_factures_v1`, `auto_import_fluide_v1`. Tous passés ; un échec témoin confirme que l'outil rend bien un code d'erreur.
- Fichiers orphelins sur Test : 0 dans chaque sens.
- Tests node : lecture (vrai PDF de 5 pages refusé après ouverture ; extraction trop lente interrompue), total 143.
- Revue du reste :
  - aucune route de recette dans l'application : les scripts de recette sont hors de `app/` et refusent toute base autre que Test ;
  - aucun `console.log` dans le code Auto ;
  - les routes Auto exigent une session ;
  - la route de configuration ne révèle ni clé, ni budget, ni raison.
- États d'échec, relus :
  - dépôt : le fichier est retiré si la fiche échoue ;
  - confirmation de facture : une seule transaction, verrou par voiture ;
  - suppression : la fiche d'abord, puis le fichier, avec un second essai ;
  - voiture : dossier de stockage vidé ;
  - lecture : chaque tentative est journalisée, réservation comprise ;
  - boutons désactivés pendant l'envoi ; deux lectures au plus par document.

**Limites et décision à prendre.**
- Le compartiment se fie au type annoncé : un client modifié peut déposer un contenu qui n'est pas un PDF. Portée limitée : le fichier n'est servi qu'à son propriétaire, par adresse signée, depuis le domaine du stockage et non depuis celui de l'application ; il n'est jamais lu sans contrôle du contenu. Une vérification au dépôt demanderait un passage par le serveur, limité à 4,5 Mo sur Vercel, ou une fonction de stockage : à décider si besoin.
- **Lint.** Le dépôt n'a pas de configuration ESLint (`npm run lint` échoue aussi sur `main`). Pour ce programme, un lint ponctuel a été passé hors dépôt, avec ESLint 9 et les règles React et Hooks. Il reste 7 alertes `react-hooks/set-state-in-effect`, connues : des chargements lancés dans un effet, sans défaut constaté. Décision : ajouter une configuration limitée à Nexora Auto et un script `lint:auto` ? Cela modifie `package.json` et `pnpm-lock.yaml`, partagés avec Nexora Pro.

## Livraison et compte rendu

- `docs/architecture/nexora-auto-livraison.md` : stratégie en une seule fusion, ordre et compatibilité des migrations, sauvegarde, variables d'environnement, contrôles après déploiement, retour arrière qui préserve les données. Préparé, **non exécuté**.
- `docs/architecture/nexora-auto-compte-rendu.md` : construit, vérifié, disponible sur Test, limites, décisions nécessaires, PR et migrations, prochaine étape.

## Bêta privée et livraison contrôlée

**Objectif.** Pouvoir déployer Nexora Auto sans l'ouvrir, puis l'ouvrir à une
liste courte de personnes, avec un contrôle qui tienne côté serveur et en base,
pas seulement dans l'écran.

**Constats préalables.**
- **Prévisualisations Vercel.** Le code servi par une prévisualisation de branche contient l'adresse Supabase de la **Production**. Vérifié depuis le Chrome de Baptiste, connecté à Vercel, en lisant les scripts de la page, sans rien saisir.
- **Région des routes serveur en Production** : `iad1` (États-Unis), d'après l'en-tête `x-vercel-id` d'une route publique.
- **Bases Supabase Test et Production** : `eu-west-1`.

**Fait.**
- **Accès en base** (migration `20260922001100_auto_acces_beta.sql`).
  - Mode `ferme` (défaut), `beta` ou `ouvert`.
  - Liste des adresses invitées. En bêta, l'adresse du compte doit être invitée **et confirmée** ; elle est lue dans `auth.users`, pas dans le jeton.
  - Politiques **restrictives** sur les 8 tables de données personnelles Auto et sur le compartiment `auto-documents` seulement. Les politiques existantes et les autres compartiments ne changent pas.
  - Réglages lisibles et modifiables par le rôle de service seulement.
- **Côté serveur** (`lib/auto/acces.js`, `lib/auto/acces-serveur.js`).
  - La mise en page `/auto` lit le mode à chaque requête. Fermé : l'écran « Nexora Auto arrive bientôt », aucun autre écran servi.
  - Fermeture forcée par `AUTO_ACCES=ferme`, sur une prévisualisation reliée à la Production, ou si la base est illisible.
  - Route de lecture : 403 si c'est fermé ou si la personne n'est pas autorisée, avant toute lecture ou réservation. Route de configuration : « indisponible » si c'est fermé.
- **Inscription en bêta** (`/api/auto/inscription`).
  - Seule une adresse invitée est inscrite. La réponse est identique, avec un délai minimal de 1,5 s, pour une adresse invitée ou non ; les erreurs de saisie sont vérifiées avant toute consultation de la liste.
  - Aucune adresse dans les journaux.
- **Écran.**
  - Connecté sans accès : « Accès réservé », avec l'adresse du compte.
  - Accueil et connexion signalent la bêta privée. Le bouton de renvoi d'e-mail est masqué après une demande neutre.
- **Outils.**
  - `scripts/recette/beta.mjs` (Test seulement) : état, mode, inviter, retirer, sans rien envoyer.
  - Les scripts de recette qui créent des comptes fictifs les invitent le temps de la recette, puis les retirent.
- **Lint permanent.**
  - `npm run lint:auto` : ESLint 9, règles React, Hooks et Next, limité à Nexora Auto, 0 avertissement toléré ; configuration dans `eslint.auto.config.mjs`.
  - Les 7 exceptions `react-hooks/set-state-in-effect` sont écrites sur place avec leur raison. Une directive devenue inutile ferait échouer le lint.
- **Export.** La page dit ce que fait chaque bouton. « PDF » ouvre l'impression du navigateur, destination « Enregistrer au format PDF » : Nexora ne produit pas de fichier PDF. « Tableau » télécharge un CSV.
- **Documents.**
  - `nexora-auto-donnees-personnelles.md` : traitements, sous-traitants, projets de textes, décisions D1 à D8, sans durée ni garantie inventée.
  - `nexora-auto-recette-beta.md` : recette courte sur vrai téléphone et vraies factures.
  - `nexora-auto-livraison.md` : préalables, recette de la version cumulée, publication fermée puis ouverture progressive, fermeture d'urgence.

**Vérifié.**
- Base jetable :
  - migration jouée deux fois ;
  - banc `auto_acces_v1` : fermé, bêta (invitée et confirmée, non invitée, invitée non confirmée), ouvert, réglages protégés, politiques en place, stockage fermé pour Auto et intact pour un autre compartiment ;
  - contre-épreuve : sans la politique d'une table, le banc échoue ;
  - 7 autres bancs Auto rejoués.
- Test :
  - migration appliquée, puis mode `beta` avec le compte fictif invité ;
  - les 8 bancs passent, et le mode reste `beta` après chaque banc.
- Accès croisés : **55/55**, dont 8 contrôles « confirmée mais non invitée » (lecture, écriture dans son propre compte, stockage, réglages, route de lecture).
- Simultanéité : A 20/20, B 20/20, **C 10/10**. Deux interventions distinctes de même date et de même montant : la seconde est signalée, puis créée sur choix explicite, y compris en simultané.
- Navigateur (serveur local, Test) :
  - compte invité : garage normal ;
  - compte confirmé non invité : « Accès réservé » et route de lecture en 403 ;
  - Test passé en `ferme` : « arrive bientôt » sur `/auto` et `/auto/connexion`, lecture « indisponible », 403 sur lecture et inscription ; puis retour en `beta` ;
  - inscription d'une adresse non invitée : écran neutre en 1,52 s, **aucun compte créé**.
- Non éprouvé de bout en bout : l'inscription d'une adresse invitée, pour ne déclencher aucun e-mail. Couverte par les tests unitaires, avec dépendances simulées.
- Écrans « arrive bientôt » et « Accès réservé » : audits 320/375/390 px et texte à 150 et 200 %, sans défaut ; captures contrôlées.
- `npm run lint:auto` : 0 problème ; un défaut planté exprès est bien détecté. 148 tests node.
- Comptes fictifs créés pour ces vérifications : supprimés.

## Préparation de la mise en ligne (suite du 17 septembre)

**Prévisualisations Vercel.**
- 87 prévisualisations existent, toutes antérieures à la correction, donc **toutes reliées à la base de Production**.
- La procédure exacte (variables par environnement, exceptions par branche, contrôle) est dans `nexora-auto-livraison.md`, section 2. La table couvre **toutes** les variables lues par l'application, pas seulement Supabase : sans quoi une prévisualisation reliée à Test pourrait encore créer un paiement Stripe réel ou envoyer un e-mail réel.
- Nouvelle route de contrôle `/api/auto/environnement` : environnement, base (`production` ou `autre`), identifiant du projet Supabase, région de la fonction, branche, mode d'accès. Aucune clé, rien qui ne soit déjà public ou d'exécution.

**Région d'exécution.**
- `preferredRegion` retiré (déprécié par Next 16). `vercel.json` fixe `regions: ["dub1"]` (Dublin, où sont les bases).
- L'offre Hobby n'autorise qu'une seule région : le réglage vaut pour tout le projet, Nexora Pro compris.
- **Vérifié sur une prévisualisation réelle** (commit `c7b77b4`) : le déploiement réussit, la fonction s'exécute bien à Dublin (`regionFonction: "dub1"`, en-tête `cdg1::dub1`), l'accueil, le tableau de bord et `/auto` répondent 200, et `/auto` affiche « arrive bientôt » — la garde « prévisualisation reliée à la Production » a joué en vrai. Restent à faire par Baptiste : la relecture de la facturation et un parcours Pro connecté.

**Les deux fermetures, mesurées.**
- **En base** (`mode = 'ferme'`, ou adresse retirée) : effet immédiat, y compris pour une session déjà ouverte qui parle directement à Supabase — plus aucune lecture, aucune écriture, aucun fichier nouveau, aucune adresse signée.
- **Applicative** (`AUTO_ACCES=ferme`) : écrans et routes fermés, mais la session ouverte **lit et écrit encore** directement dans la base. Vérifié à la main : lecture d'une ligne et écriture acceptée, alors que `/auto` affichait « arrive bientôt » et que la route de lecture répondait 403.
- **Limite du stockage** : cache d'une heure sur les fichiers privés. Après fermeture, un fichier déjà téléchargé peut encore être servi **à la même session** ; un autre compte est refusé, et un fichier jamais téléchargé aussi.
- Recette rejouable : `scripts/recette/fermeture-beta.mjs` (14 contrôles, remet le mode d'origine, supprime ses comptes fictifs).

**Conservation.** Tableau complet dans `nexora-auto-donnees-personnelles.md`,
section 6 bis : donnée, finalité, durée proposée, justification, déclencheur,
sauvegardes. Aucune suppression automatique n'existe aujourd'hui : chaque
durée proposée indique le mécanisme à construire. Une facture déposée par un
automobiliste n'est pas une facture comptable de Nexora.

**Responsable de traitement.** Baptiste Papoul, entrepreneur individuel,
nom commercial « Nexora Solutions » (SIREN 108 995 788, d'après la politique
actuelle, à confirmer).

**Inscription réelle.** Parcours prêt (`nexora-auto-recette-beta.md`, temps A0),
en attente de l'accord et de l'adresse. Point à vérifier d'abord : sans SMTP
dédié, l'envoi Supabase n'accepte que les adresses membres du projet, 2 par
heure.

## Simplification grand public (17 septembre 2026, avant la livraison)

Demandée avant la mise en ligne. Rien de neuf n'est construit : ce qui existait
est remis dans l'ordre où un automobiliste le cherche.

**Quatre espaces, et pas un de plus.** « Aujourd'hui », « Mon garage »,
« Services », « Compte ». « À prévoir » et « Ajouter une facture » vivent dans
« Aujourd'hui » ; la déconnexion et les préférences dans « Compte ». Le garage
déménage de `/auto` à `/auto/garage`, et les liens « Mon garage » des autres
écrans suivent. À 375 px, les quatre onglets tiennent sur une ligne ; les
icônes s'effacent en dessous de 420 px et quand le texte est agrandi.

**« Aujourd'hui » (`/auto`).** La voiture consultée, nommée en haut avec sa
plaque et son kilométrage. Une seule action mise en avant — la plus urgente,
une échéance critique d'abord —, avec son bouton en toutes lettres
(« Renseigner la mise en circulation », « Enregistrer une révision »). Les
autres échéances tiennent en une ligne cliquable. Quatre raccourcis nommés :
ajouter une facture, actualiser le kilométrage, enregistrer une révision,
ouvrir le dossier. Le choix est pur et testé : `lib/auto/aujourdhui.js`,
8 contrôles (`choisirVoiture`, `etatAujourdhui`).

**Ne jamais rassurer sur ce qu'on ne sait pas.** Un rappel reporté reste
affiché mais ne reprend pas la première place. Quand aucune échéance n'est
calculable, l'écran affiche « À compléter pour que Nexora calcule » et
l'information qui manque, jamais un écran vide ni un bilan. Quand une échéance
est calculée mais qu'une autre manque, la carte le dit en pied
(« 2 échéances ne sont pas encore calculées faute d'informations »).

**La voiture consultée** passe du stockage d'onglet au stockage de l'appareil :
une personne qui n'en a qu'une ne la choisit jamais, et celle qu'elle a ouverte
la veille est encore là au retour. Elle est oubliée à la déconnexion, avec les
brouillons de facture.

**« Compte » (`/auto/compte`).** L'adresse du compte, l'horizon de
« À prévoir » (le même réglage qu'à l'écran « À prévoir », vérifié : changé
depuis « Compte », il est repris), la confidentialité, l'export, ce qui se
supprime soi-même, et la sortie. Aucun réglage qui n'agisse sur rien : les
envois hors de l'application n'existent pas, ils ne sont pas proposés.

**`/auto/confidentialite`.** Écrit à partir des seuls faits vérifiés. Identité
du responsable et adresse de contact reprises de la politique déjà publiée.
Aucune durée annoncée : « aucune suppression automatique n'est en place
aujourd'hui », et les durées pour les comptes inactifs sont dites non arrêtées.
La page nomme ce que Nexora Auto ne fait pas (aucun envoi hors de l'app, aucun
service d'IA, aucune identification par plaque) et conseille de ne pas déposer
de pièce d'identité pendant la bêta.

**Recette.** 157 tests, `lint:auto` sans avertissement, `next build` réussi,
les dix bancs SQL à 0, accès croisés 55/55, fermeture 14/14, simultanéité des
factures 80/80 sans doublon involontaire. Audit d'écrans à 320, 375 et 390 px :
RAS sur les six écrans, sauf les liens e-mail au fil d'une phrase (17 px de
haut) — les liens en ligne dans un paragraphe font exception (WCAG 2.5.8).
Texte agrandi à 150 % et 200 % : deux défauts trouvés et corrigés sur
« Compte » (adresse de contact qui sortait de l'écran, icônes de lignes qui ne
s'effaçaient pas), puis RAS.

## Mise en ligne (17 septembre 2026, au soir)

Autorisée par Baptiste. Les onze migrations sont **appliquées en Production**,
la pile est fusionnée en une fois (PR #124), et `https://nexora-garage.vercel.app/auto`
est en ligne en **mode bêta**, ouvert aux adresses invitées.

**Ce que la mise en ligne a appris.**

- **Sauvegardes** : `supabase backups list` répond `walg_enabled: true`,
  `pitr_enabled: false`, **`backups: []`**. Aucune sauvegarde restaurable n'est
  listée. Trois exports (schéma, rôles, données) ont donc été pris à la main
  avant d'écrire quoi que ce soit, et gardés hors du dépôt. **Une politique de
  sauvegarde reste à décider.**
- **La région est confirmée en Production** : `regionFonction: "dub1"`,
  en-tête `cdg1::dub1`. Les factures sont lues en Irlande, comme les bases.
- **Le schéma `storage` manque à la base jetable** : l'image Supabase ne l'a
  pas, et le dump du schéma public ne le porte pas. Il faut poser la maquette
  `supabase/tests/prelude_stockage_base_jetable.sql` avant les migrations.
- **Un contrôle de sécurité qui échoue se relit avant de se conclure** : un
  dépôt refusé dans le compartiment de Nexora Pro semblait accuser la nouvelle
  politique restrictive ; c'était la politique de Pro elle-même, qui exige
  `<identifiant du garage>/…`. Avec le bon chemin, tout passe.
- **`auth.users.confirmation_token` est lisible en clair** : cela a permis
  d'éprouver le vrai lien de confirmation de bout en bout, sans envoyer
  d'e-mail à personne.
- **La réception d'un e-mail dans une vraie boîte n'a pas été éprouvée** :
  aucun message n'est parti vers une personne réelle. Ce qui est établi :
  Supabase a accepté l'envoi, et l'adresse de retour `/auto` est autorisée.

Détail complet des contrôles : `nexora-auto-livraison.md`, section 6.

## Parcours dégradés (nuit du 17 au 18 septembre 2026)

Le produit est en ligne : il doit tenir debout quand tout ne se passe pas bien.
Banc rejouable `scripts/recette/parcours-degrades.mjs` (Test seulement),
**32 contrôles**, compte fictif et fichiers supprimés à la fin.

**Ce qui est éprouvé, et qui tient :**

| Famille | Contrôles |
| --- | --- |
| Voiture | création avec la marque et le modèle seulement ; modification ; voiture principale changée par `auto_definir_principal` ; **deux principales à la fois refusées par la base** ; archivage qui retire la qualité de principale ; restauration avec le dossier intact ; adresse d'une voiture supprimée : introuvable, sans erreur brute |
| Stockage | fichier de plus de 10 Mo refusé ; type non prévu refusé ; **dépôt dans le dossier de quelqu'un d'autre refusé par les règles de la base** |
| Lecture | PDF illisible : la lecture le dit, **le document et le fichier restent récupérables** ; document sans rapport : rien n'est inventé ; photo : la lecture ne la prétend pas lue, le document est gardé |
| Doublons de fichier | même fichier redéposé sur la même voiture : refusé (index unique sur l'empreinte), et l'existant se retrouve par son empreinte — ce que fait l'écran ; le même fichier sur une **autre** voiture reste possible |
| Facture | proposition rendue avec le montant et le kilométrage lus et les deux opérations ; import abandonné : le document reste, sans intervention ; facture à deux opérations : **montant compté une seule fois** ; correction après enregistrement : dépenses actualisées ; une facture ancienne ne remplace pas un relevé récent |

**Cinq « échecs » du premier passage étaient des erreurs du banc, pas du
produit** — et c'est instructif : un `update principal = true` direct heurte
l'index unique, un `update archive_le` direct heurte la contrainte
« une principale n'est pas archivée », et un fichier redéposé heurte l'index
d'empreinte. Autrement dit, **la base refuse d'elle-même ce que seule la bonne
fonction sait faire proprement**. Le banc a été corrigé pour passer par
`auto_definir_principal` et `auto_archiver_vehicule`, et pour attendre ces
refus.

Rappel des règles déjà tenues par les tests unitaires, non redites ici : une
vidange ne relance pas le suivi de la révision, le kilométrage retenu est le
plus récent, et l'estimation est suspendue quand deux compteurs se
contredisent.

## « Aujourd'hui » répond aussi pour les autres voitures

Défaut de conception relevé en relisant l'écran : « Aujourd'hui » ne montrait
que les échéances de la voiture consultée. Une personne avec deux voitures
pouvait donc ignorer un contrôle technique en retard sur l'autre, simplement
parce qu'elle regardait la première. L'écran répond à « que dois-je savoir
maintenant », pas à « pour cette voiture seulement ».

Une section **« Vos autres voitures »** s'affiche désormais quand une autre
voiture porte une échéance **en retard ou proche**, non reportée. Une ligne par
voiture, avec l'échéance et son délai ; un geste pour basculer dessus. Ni les
échéances lointaines, ni celles à compléter, ni les rappels que la personne a
demandé de repousser : ce serait du bruit. Trois contrôles de plus dans
`lib/auto/aujourdhui.test.js` (11 au total).

## La plaque lue reconnaît la bonne voiture

Trouvé pendant la recette finale, en conditions réelles : une facture portant
la plaque `AB-123-CD` a été enregistrée sur la **Toyota Yaris**, alors que la
plaque est celle de la **Peugeot 308** du même garage. L'écran n'a rien dit.

Pourquoi : l'avertissement existant compare la plaque lue à celle de la voiture
regardée (`plaqueDifferente`). Quand cette voiture **n'a pas de plaque
enregistrée**, il n'y a rien à comparer — et le silence est le pire des cas,
parce que c'est justement la voiture qu'on vient d'ajouter à la hâte.

`voitureDeLaPlaque(vehicules, plaqueLue, voitureCouranteId)` cherche désormais
la plaque lue dans **tout le garage** et nomme la voiture concernée :

> Cette facture porte la plaque AB-123-CD, celle de votre Peugeot 308. Vous
> êtes sur le point de l'enregistrer sur Toyota Yaris.

Pure et testée (six cas : voiture sans plaque, formats différents, déjà la
bonne voiture, plaque inconnue du garage, rien de lu, pas de garage). Les deux
messages affichent maintenant la plaque en clair (`AB-123-CD`, pas `AB123CD`).

Piège de recette au passage : le premier scénario ne montrait rien parce que
la Peugeot n'avait **pas été créée** — `auto_ajouter_vehicule` avait refusé la
plaque `AB-123-CD` et le script ne lisait pas l'erreur. Un scénario qui ne
vérifie pas ses propres écritures teste le vide.

## Le cul-de-sac de l'inscription (18 septembre 2026)

**Première inscription réelle, et elle a échoué.** Baptiste a suivi le gros
bouton de la page d'accueil — « Ajouter ma voiture » —, qui mène à la
*création* de compte. Son adresse ayant déjà un compte (celui de Nexora Pro),
Supabase a répondu comme si tout allait bien, sans rien créer ni envoyer :
c'est sa protection contre l'énumération d'adresses, et elle est juste. L'écran
« Vérifiez vos e-mails », lui, ne parlait que de deux cas — adresse non
invitée, ou faute de frappe. Il a attendu un e-mail qui ne pouvait pas arriver.

**Ce qui était mal posé :** nous savons que ce cas existe, mais nous n'avons
pas le droit de dire à cette personne-là « vous avez déjà un compte ». La
sortie est de le dire **à tout le monde** : c'est une phrase générique, elle ne
révèle rien, et elle débloque exactement celui qui est coincé.

L'écran ajoute donc, sous le message d'attente :

> **Aucun e-mail au bout de quelques minutes ?** Le plus souvent, c'est que
> cette adresse a **déjà un compte** : dans ce cas rien n'est envoyé, et il
> faut se connecter. Sinon, vérifiez les indésirables, puis l'orthographe de
> l'adresse.

Avec deux boutons : **« Se connecter avec cette adresse »**, qui bascule en
gardant l'adresse saisie, et « J'ai oublié mon mot de passe ».

**Ce que ça apprend sur la recette :** tous les parcours d'inscription éprouvés
cette nuit partaient d'une adresse **neuve**. Le premier vrai utilisateur,
lui, avait déjà un compte — le cas le plus banal pour une application greffée
sur un produit existant, et le seul que personne n'avait joué.

## Lot A — un accueil qui choisit une action utile (18 septembre 2026)

Après la revue d'interface de Baptiste sur son propre compte. Situation
reproduite sur Test avec des données fictives (`scenario-corsa`) : Opel Corsa,
kilométrage donné le jour même, contrôle technique favorable il y a trois mois
— donc **échéance dans 21 mois** —, et aucun intervalle d'entretien.

**Le défaut.** L'accueil proposait « Enregistrer un contrôle » en action
dominante. Une échéance à 21 mois occupait le premier écran avec un bouton
d'enregistrement, pendant que la vraie question — « qu'est-ce qui bloque mon
suivi d'entretien ? » — restait au second plan.

**La règle changée**, dans `lib/auto/aujourdhui.js` (pure, 17 contrôles) :

1. la première place revient à une échéance **en retard, proche, ou dans
   l'horizon choisi** ;
2. sinon à une **information manquante** non reportée ;
3. sinon **à rien**. Une échéance lointaine ne prend jamais la première place :
   elle se résume sous « Connu, et sans urgence », avec sa date et sa
   provenance. L'écran a le droit d'être calme.

**Ce que l'accueil affiche maintenant, dans ce cas :**

> Opel Corsa — 231 000 km · renseigné aujourd'hui
>
> **PRÉPARONS LA SUITE** — Votre prochain entretien
> Ajoutez une facture de garage : Nexora y cherchera la date, le kilométrage et
> ce qui a été fait.
> *Une facture ne porte pas toujours l'intervalle prévu par le constructeur. Si
> elle manque, Nexora vous le dira plutôt que de l'inventer.*
> [Ajouter une facture] · Je n'ai pas de facture : renseigner l'intervalle · Plus tard
>
> **CONNU, ET SANS URGENCE** — Contrôle technique, dans 21 mois, avant le
> 18 juin 2028. *Date du procès-verbal, renseignée par vous.*

**Quatre autres corrections du même lot :**

- **« Plus tard » tient.** Le report vit en base (`auto_rappels_reports`), donc
  d'un appareil à l'autre : vérifié, la carte ne revient pas après
  rechargement, et le compteur bascule proprement.
- **Les compteurs se séparent** : « 1 échéance · 1 information à compléter ».
  Une information absente ne se compte plus comme une date connue.
- **Le kilométrage n'est plus réclamé s'il vient d'être donné** :
  `kilometrageFrais` (14 jours). La saisie manuelle reste accessible depuis la
  fiche ; c'est seulement le raccourci qui s'efface.
- **« Date officielle » disparaît.** Le mot laissait croire que Nexora avait
  vérifié le document. `libelleFondement` dit désormais la provenance : « Date
  du procès-verbal, **renseignée par vous** » ou « **lue sur votre document** »,
  selon `auto_historique.source`. Même libellé dans « À prévoir » et dans la
  fiche.

Recette : 187 tests, `lint:auto` sans avertissement, `next build` réussi,
audits d'écrans (320/375/390 px) et de texte agrandi (150 %/200 %) sans défaut
sur l'accueil, « À prévoir » et la fiche.

## Lot B — une entrée commune pour les documents (18 septembre 2026)

**Trois défauts, un seul parcours.**

**1. Deux portes pour la même chose.** « Ajouter une facture » et « Autre
document » ouvraient deux écrans différents — et le second proposait
« Facture » comme type par défaut. Il fallait deviner le classement interne
avant même d'avoir ouvert le fichier. Il n'y a plus qu'une entrée,
**« Ajouter un document »**, qui accepte tout et reconnaît ce qu'elle peut :
une facture PDF est lue et préremplie, le reste est simplement rangé. Le
formulaire direct ne subsiste que pour joindre un justificatif à une
intervention précise, et pour une voiture archivée — deux cas où le contexte
est déjà connu.

**2. Deux limites qui ne se parlaient pas.** Le dépôt accepte **10 Mo** ; la
lecture automatique s'arrête à **5 Mo et 4 pages** — et on ne l'apprenait
qu'**après** avoir envoyé le fichier. `phraseLimites` construit désormais
l'annonce à partir des constantes réelles, avant le dépôt :

> PDF ou photo, 10 Mo au plus. Le fichier reste privé. Nexora lit les PDF de
> moins de 5 Mo, 4 pages au plus ; au-delà, le document est conservé et vous
> renseignez les informations.

Si la lecture automatique est coupée, la phrase ne promet rien : elle s'arrête
à la limite du dépôt.

**3. Une confirmation qui n'annonçait pas ses effets.** L'écran de
vérification demandait d'enregistrer sans dire ce que cela changerait.
`effetsEnregistrement` (pur, testé) énonce les conséquences avant le clic :

> **En enregistrant**
> Une intervention « Révision » du 2 sept. 2026 entre dans l'historique de votre Opel Corsa.
> 335,00 € s'ajoutent à vos dépenses, comptés une seule fois.
> Le compteur est enregistré à 84 500 km, à la date de l'intervention.
> Le document est rangé et rattaché à cette intervention : il en devient le justificatif.

Rien n'est annoncé qui n'arrivera pas : sans montant ni compteur, ces deux
lignes disparaissent ; en mode document, une seule phrase dit ce qui **ne** se
passera pas.

**Piège rencontré**, corrigé avant livraison : `typePrincipal` attend des
opérations, pas la saisie entière. L'écran de vérification plantait
(`operations.map is not a function`) — visible seulement au navigateur, pas au
lint ni aux tests. Le récapitulatif nomme désormais le type retenu
(`saisie.type`), avec repli sur le calcul depuis les opérations.

Recette : 189 tests, `lint:auto` sans avertissement, `next build` réussi,
parcours dégradés **32/32** (dépôt, doublons, lectures en échec, import
abandonné), audits d'écrans et de texte agrandi sans défaut sur l'entrée et la
vérification.
