# Nexora Auto — compte rendu du programme autonome

17 septembre 2026. Programme « continuation autonome » : lots F à L, puis
livraison. Il fait suite aux lots A à E (PR #110 à #114). Tout est sur
**Test** et en PR brouillon. **Rien n'est fusionné, déployé ni migré en
Production.** Aucune dépense, aucun appel payant, aucun message à une vraie
personne. Données fictives uniquement.

Détail par lot : `nexora-auto-suivi.md`. Mise en ligne : `nexora-auto-livraison.md`.

## Construit

- **F — Recette globale.** Parcours d'un nouveau propriétaire à 320, 375 et 390 px ; 12 constats, tous traités.
- **G — Première utilisation.**
  - Accueil qui promet factures, historique, « À prévoir » et services.
  - Ajout d'une voiture avec la marque et le modèle seulement, puis mot d'accueil et « Pour bien démarrer ».
  - Voiture consultée reprise par « Services » et par l'ajout de facture.
- **H — Import plus fluide.**
  - Contenu réel des fichiers contrôlé.
  - Brouillon de vérification repris après un départ.
  - États « proposée / à renseigner / justifie ».
  - Doublon reconnu, y compris sur une autre voiture.
  - Correction d'une intervention après confirmation, avec la provenance conservée.
  - Course sur les confirmations simultanées corrigée par un verrou (migration `20260922001000`).
- **I — Mobile et accessibilité.**
  - Focus visible et lien d'évitement.
  - Texte agrandi à 150 et 200 % sans débordement.
  - Cibles de 36 à 40 px.
  - Erreurs reliées à leur champ, focus sur la première.
  - « Prendre une photo ».
  - Deux audits rejouables.
- **J — Kilométrage et rappels.**
  - Kilométrages listés, corrigeables et supprimables.
  - Incohérences montrées, estimation suspendue, révision « à vérifier » au lieu d'un faux retard.
  - Compteur demandé seulement s'il sert.
  - CT plus valable : alerte, non reportable, en tête.
  - Toutes les tâches terminées retrouvables.
- **K — Maîtrise du dossier.**
  - Document renommé, reclassé, détaché ou rattaché.
  - Conséquences dites avant chaque suppression.
  - Suppression d'une voiture sans fichier orphelin.
  - Export : page imprimable (« PDF » = impression du navigateur, aucun fichier PDF produit par Nexora) et tableau CSV téléchargé, sans fichier joint, avec provenance.
  - Décisions sur la suppression de compte documentées.
- **L — Consolidation.**
  - Recette d'accès croisés de bout en bout.
  - PDF bornés (pages revérifiées, délai d'extraction).
  - Journal serveur sans contenu de facture.
  - Scripts de recette propres au lint.
- **Livraison.** Procédure de mise en ligne en une seule fusion, avec migrations, contrôles et retour arrière : préparée, **non exécutée**.

## Vérifié

- **143 tests node**, dont règles de lecture, brouillon, corrections, kilométrage, « À prévoir », export, contenu des fichiers.
- **Bancs SQL Auto** (7) rejoués sur Test : tous passés. Un échec témoin prouve que l'outil signale bien une erreur.
- **Accès croisés** entre deux comptes fictifs, par la vraie API : **47/47**.
  - Base, fonctions, stockage privé, route de lecture, visiteur sans session.
  - Témoins positifs compris.
- **Confirmations simultanées** : 16 doublons sur 20 avant correction, **0 sur 30** après.
- **Audits d'écrans** à 320, 375 et 390 px, et texte à 150 et 200 %, sur les 10 écrans Auto (accueil, connexion, fiche avec ses formulaires, « À prévoir », services, fiche de service, ajout et vérification de facture, ajout de voiture, dossier) : aucun défaut restant.
- **Parcours navigateur** avec compte et factures fictifs, pour chaque lot.
  - Ce qui a été fait : clics, saisies, rechargements, second « appareil », impression PDF contrôlée.
  - La liste est dans le suivi.
- **Fichiers orphelins** sur Test : 0 dans un sens comme dans l'autre.
- **`next build`** réussi à chaque lot.

## Disponible sur Test

- Base Test `slawilafseganlbghgwx` : les dix migrations Auto `20260922000100` → `20260922001000`.
- Code : branches `auto/lot-*` et `auto/livraison`, servi en local (`next dev`, port 3114) contre la base Test. Vercel construit en plus une prévisualisation privée de chaque branche (voir « Décisions », point 6).
- Compte fictif conservé pour la suite : `recette.auto.202609171124@nexora-recette.invalid` (Dacia Sandero principale, Toyota Yaris). Dossier vidé ; on s'y connecte avec `scripts/recette/compte-auto.mjs lien`.
- Outils de recette :
  - `scripts/recette/telephone.mjs` : téléphone sur le même Wi-Fi ;
  - `factures/bilan-reel.mjs` : mesure sur de vraies factures ;
  - `factures/concurrence.mjs` ;
  - `acces-croises.mjs` ;
  - `audit-ecrans.mjs` et `audit-texte-agrandi.mjs`.

## Limites

- **Aucune vraie facture mesurée** : la lecture gratuite n'est éprouvée que sur des factures fictives, 67 champs présents extraits sur 67 et aucun inventé. Les photos et les scans ne sont pas lus.
- **Aucun vrai téléphone** ni lecteur d'écran (VoiceOver, TalkBack). Le comportement HEIC d'un iPhone et la photo prise directement sont à confirmer sur appareil.
- **Stockage** : le compartiment se fie au type annoncé. Le contenu est contrôlé à l'écran et avant toute lecture ; un client modifié pourrait déposer un faux PDF, servi seulement à son propriétaire.
- Le seuil d'incohérence de 1 500 km par jour est une borne de bon sens.
- Pas de rappel hors application, pas de suppression de compte, pas de réservation, de paiement ni de partenaire : volontairement.
- 7 alertes de lint `react-hooks/set-state-in-effect` connues, sans défaut constaté. Aucune configuration de lint dans le dépôt.

## Décisions nécessaires

Mises à jour le 17 septembre, après la préparation de la bêta privée
(section « Mise à jour » plus bas).

1. **Prévisualisations Vercel : à corriger en priorité.** Elles utilisent la base de **Production** (constaté) ; 87 prévisualisations existantes sont concernées. La procédure complète (toutes les variables, exceptions par branche, contrôle par `/api/auto/environnement`) est dans `nexora-auto-livraison.md`, section 2. D'ici là, aucune recette sur une URL Vercel.
2. **Région de lecture des factures** (D2) : `vercel.json` prêt avec `dub1` (Dublin). L'offre Hobby n'autorisant qu'une région, cela déplace aussi Nexora Pro ; quatre contrôles à faire avant de retenir ce réglage.
3. **Textes et conservation** (D1, D3 à D7) : durées, suppression de compte, accès administrateur, conditions d'utilisation, mesure d'audience.
4. **Inscription réelle** (temps A0) : votre accord et l'adresse à utiliser. Sans SMTP dédié sur Test, seules les adresses membres du projet reçoivent les e-mails, 2 par heure.
5. **Recette interne** (temps A) : votre téléphone et 3 à 5 de vos factures sur Test, supprimées après la mesure (D8).
6. **Mise en ligne contrôlée** : migrations et fusion unique Nexora Auto **fermé**, puis bêta interne, puis 3 à 5 personnes invitées (temps B).
7. **Compte de recette en Production** : prévu dans la procédure (votre adresse en bêta interne), à créer seulement le moment venu.
8. **Contrôle du contenu au dépôt côté serveur** : utile ou non, vu la portée limitée.
9. **Lecture payante** : reste désactivée.

## PR et migrations

| PR | Lot | Base | Migration (Test seulement) |
| --- | --- | --- | --- |
| [#110](https://github.com/nexorasolutionsfr/Nexora-/pull/110) | A | `main` | `000100`, `000200` |
| [#111](https://github.com/nexorasolutionsfr/Nexora-/pull/111) | B | #110 | `000300`, `000400` |
| [#112](https://github.com/nexorasolutionsfr/Nexora-/pull/112) | C | #111 | `000500` |
| [#113](https://github.com/nexorasolutionsfr/Nexora-/pull/113) | D | #112 | `000600`, `000700`, `000800` |
| [#114](https://github.com/nexorasolutionsfr/Nexora-/pull/114) | E | #113 | `000900` |
| [#115](https://github.com/nexorasolutionsfr/Nexora-/pull/115) | F | #114 | — |
| [#116](https://github.com/nexorasolutionsfr/Nexora-/pull/116) | G | #115 | — |
| [#117](https://github.com/nexorasolutionsfr/Nexora-/pull/117) | H | #116 | `001000` |
| [#118](https://github.com/nexorasolutionsfr/Nexora-/pull/118) | I | #117 | — |
| [#119](https://github.com/nexorasolutionsfr/Nexora-/pull/119) | J | #118 | — |
| [#120](https://github.com/nexorasolutionsfr/Nexora-/pull/120) | K | #119 | — |
| [#121](https://github.com/nexorasolutionsfr/Nexora-/pull/121) | L | #120 | — |
| [#122](https://github.com/nexorasolutionsfr/Nexora-/pull/122) | livraison et compte rendu | #121 | — |
| [#123](https://github.com/nexorasolutionsfr/Nexora-/pull/123) | bêta privée : accès contrôlé, lint permanent, recette, données personnelles | #122 | `001100` |

Toutes les migrations portent le préfixe `20260922`. Production : aucune.

## Prochaine étape

1. **Relire** la pile dans son état final : branche `auto/livraison`, en une seule lecture, plutôt que PR par PR.
2. **Faire la recette réelle** (décision 2) : `node scripts/recette/telephone.mjs` sur le même Wi-Fi, puis quelques vraies factures anonymisées. `bilan-reel.mjs` mesure alors champs extraits, manqués, erronés et inventés, sans rien afficher des valeurs.
3. **Trancher** les décisions 1, 4 et 6, puis dérouler `nexora-auto-livraison.md`.

## Mise à jour du 17 septembre : préparation de la bêta privée

Branche `auto/beta-privee`, migration `20260922001100` (Test seulement).
Détail : section « Bêta privée et livraison contrôlée » du suivi.

- **Constats.**
  - Les prévisualisations Vercel utilisent la base de Production.
  - Les routes serveur de Production s'exécutent aux États-Unis ; les bases Supabase sont en Irlande.
- **Construit.**
  - Accès fermé par défaut, bêta sur invitation ou ouvert, contrôlé en base (politiques restrictives) et côté serveur (écran fermé, routes en 403).
  - Inscription en bêta sans révéler qui est invité.
  - Écran « Accès réservé ».
  - Outil `beta.mjs` pour Test.
  - Lint permanent `npm run lint:auto`, avec 7 exceptions écrites dans le code.
  - Libellés de l'export clarifiés.
  - Documents : données personnelles (D1 à D8), recette courte, livraison contrôlée.
- **Vérifié.**
  - Bancs SQL, dont `auto_acces_v1`, sur base jetable et sur Test, avec contre-épreuve.
  - Accès croisés 55/55.
  - Simultanéité : A, B et C (interventions distinctes créées sur choix explicite, 10/10).
  - Navigateur en modes bêta et fermé ; inscription neutre sans compte créé.
  - Audits des nouveaux écrans ; lint et 148 tests.
- **Non fait volontairement.**
  - Aucune invitation, aucun e-mail.
  - Aucun réglage Vercel modifié.
  - Aucune fusion, aucune migration en Production.

## Suite du 17 septembre : préparation de la mise en ligne

- **Prévisualisations** : procédure complète écrite, route de contrôle `/api/auto/environnement` ajoutée, 87 anciennes prévisualisations recensées comme reliées à la Production. Aucun réglage Vercel modifié.
- **Région** : `preferredRegion` retiré (déprécié), `vercel.json` prêt avec Dublin ; effets sur Nexora Pro examinés et contrôles listés.
- **Fermetures** : la fermeture en base coupe les données pour une session déjà ouverte ; la fermeture applicative non — mesuré, documenté, et rejouable (`fermeture-beta.mjs`, 14/14). Limite du cache de stockage mesurée (une heure, même session).
- **Conservation** : tableau donnée par donnée, avec durée proposée, justification, déclencheur et sort des sauvegardes ; aucune durée n'est publiée sans son mécanisme.
- **Inscription réelle** : parcours prêt, en attente de votre accord et de l'adresse.

