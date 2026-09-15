# Recette — Lot 2 « incohérences métier avérées », 15 septembre 2026

Branche `lot2/coherence-documents` (depuis `main` `32f52fe`, **indépendante du
lot 1**). Supabase **Test**, garage fictif « PROTO Atelier 2026-09-14-19h23 ».
Règle suivie : ne corriger que ce qui est reproduit. **Deux migrations, appliquées
sur Test uniquement** (`20260920000100`, `20260920000200`), ajoutées le 15 sept.
après revue — voir « Garanties en base » ci-dessous.

## Périmètre audité et verdicts

| Point examiné | Méthode | Verdict |
|---|---|---|
| Sélection d'un devis par le véhicule seul | lecture de `selectionnerInterventionCourante`, `devisDeLaVisite`, `AujourdhuiJour`, `reprise.js` ; recherche des « plus récent » | **Non reproduit.** Le dossier et Aujourd'hui passent par `ordre.devis_id` ou `devis.rendez_vous_id`. `trouverDevisEnAttente` (le plus récent du véhicule) est calculé mais **lu par aucun écran**. Rien à corriger. |
| Changement du véhicule d'une inspection « annoncé réussi mais non enregistré » | contrôle synthétique non verrouillé (`c13c2f2c…`) sous session dirigeant : insertion, changement de véhicule, relecture ; droits par colonne, triggers et politiques relevés sur Test | **Non reproduit.** Le changement est enregistré (1 ligne, relu). L'écran vérifie déjà les lignes touchées et revient en arrière avec un message (corrigé le 14 sept.). Un contrôle verrouillé lève une erreur explicite. **Diagnostic consigné** : la base accepte un véhicule d'un autre client que celui du contrôle ; aucun écran ne propose ce geste (le choix du véhicule n'existe qu'à la création, filtré par client). Contrôle remis sur son véhicule d'origine. |
| Bouton de création alors que le document existe | lecture des conditions | **Non reproduit** : « Générer la facture » exclut les visites facturées ; « Créer depuis un rendez-vous » exclut les visites qui ont une fiche (`filtrerRendezVousEligibles`, et unicité `ordres_reparation_rendez_vous_unique` en base) ; « Créer la fiche atelier » d'un devis accepté déjà corrigé (#101). |
| Double clic « Marquer accepté / refusé » | lecture de `noterReponseDevis` | **Protégé** : mise à jour conditionnée à `statut = en_attente`, second clic → « Ce devis a déjà reçu une réponse ». |
| Double clic « Préparer le devis », « Ajouter un modèle » | recette du lot 1 | **Protégé** en base (identifiant de reprise / d'insertion). |
| **Double clic « Générer la facture »** | reproduction au navigateur | **REPRODUIT puis corrigé**, ci-dessous. |
| États contradictoires Aujourd'hui / dossier / Atelier | — | **Non audité en profondeur** dans cette passe. |

## Le défaut reproduit : deux factures pour une visite

Préparation (Test, mêmes écritures que l'écran des fiches atelier) : visite
restituée du 31 juillet 2026 de BB-202-BB, fiche atelier `17d9cd7f` avec une
ligne « RECETTE LOT 2 — contrôle double facture » à 50 € HT, terminée.

**Avant correction** (code de `main`) : Facturation › Factures › « Générer la
facture » cliqué deux fois de suite → **F-2026-0003 et F-2026-0004**, même
visite, 20 ms d'écart (`avant-double-facture.png`). Cause : `insert` direct sans
garde, bouton toujours actif ; en base, ni contrainte d'unicité sur
`factures.rendez_vous_id` ni contrôle dans `factures_check_integrite`.

**Correction** (`NexoraDashboard.jsx`) :
- un seul traitement à la fois par visite (`facturesEnCours`) : les clics
  suivants sont ignorés ;
- relecture juste avant l'insertion : si la visite a déjà sa facture, rien
  n'est créé, la facture existante rejoint la liste et le message le dit ;
- bouton désactivé pendant le traitement (« Génération… »), zone tactile 40 px.

**Après correction** : seconde visite préparée à l'identique (18 mars 2026,
fiche `d49281a9`), **trois clics** rapides → **une seule facture**, F-2026-0005
(`apres-une-seule-facture.png`, comptage en base).

## Garanties en base (ajoutées après revue)

### 1. Une facture par fiche atelier — `20260920000100_facture_une_par_ordre`

**Règles métier vérifiées d'abord** : une fiche atelier par visite
(`ordres_reparation_rendez_vous_unique`) ; génération de facture depuis la fiche
terminée, par un seul chemin dans le code ; aucun avoir, acompte ni facture
rectificative dans le schéma (statuts `emise`, `en_attente`, `payee`) ; une
facture se corrige elle-même avant encaissement ; des factures **sans** fiche
existent (Test 22, Production 1). La clé retenue est donc **la fiche atelier**,
pas la visite ; les factures sans fiche restent libres.

**Mécanisme** : trigger `BEFORE INSERT` (SECURITY DEFINER), verrou consultatif
de transaction sur la fiche, puis refus si une facture existe déjà pour elle
(« cet ordre de reparation a deja sa facture »). Aucune ligne existante lue pour
validation ni modifiée ; le trigger passe avant la numérotation, aucun numéro
n'est consommé par un refus. L'écran relit la facture existante et le dit.

### 2. Cohérence client / véhicule d'un contrôle — `20260920000200_inspections_client_vehicule_coherents`

Constat **distinct** du « modification sans effet » (non reproduit) : sous la
session du dirigeant, un contrôle non verrouillé acceptait le véhicule d'un
**autre client** et gardait son client d'origine — **reproduit sur Test avant
migration** (`c13c2f2c` → BE-505-EE : enregistré, client conservé ; remis en
état). Trigger `BEFORE INSERT OR UPDATE OF client_id, vehicule_id, garage_id` :
refuse un véhicule d'un autre garage ou d'un autre client ; ne corrige, ne
réaffecte ni ne valide aucune ligne existante ; s'exécute après
`inspections_verrou_contenu`, dont le refus reste inchangé pour un contrôle
verrouillé. Relevé préalable : 0 contrôle incohérent sur Test et en Production.
L'écran nomme les deux refus.

### Preuves

**Base jetable, schéma frais de Production** (`base-jetable-lot2-2026-09-15.sh`,
avant/après) : AVANT, deux sessions concurrentes → **2 factures** pour la même
fiche, contrôle incohérent accepté ; APRÈS → **16 OK, 0 KO** : une facture et un
refus explicite en concurrence, compteur de numérotation +1 seulement, doublon
antérieur préservé et refusant une troisième facture, factures sans fiche
libres, facture existante toujours marquable payée ; changement et création
incohérents refusés sans modification, autre véhicule du même client et saisie
libre acceptés, véhicule d'un autre garage refusé, contrôle verrouillé intact
avec son propre refus, fonctions non exécutables par `anon`/`authenticated`.

**Test, après application** (dry-run exact des deux migrations, miroir des 118
migrations de `b239bd7`) :

| Preuve | Résultat |
|---|---|
| Deux **sessions distinctes** du dirigeant insèrent au même instant la facture de la fiche de BD-404-DD | session 1 : **F-2026-0006** ; session 2 : refus « cet ordre de reparation a deja sa facture » ; 1 facture pour la fiche ; compteur 5 → 6 |
| Factures existantes | F-2026-0001 à 0005 inchangées, doublon F-2026-0003/0004 préservé |
| Contrôle `c13c2f2c` → véhicule d'un autre client | refusé, contrôle inchangé |
| Création d'un contrôle incohérent | refusée |
| Modification ordinaire (kilométrage) | acceptée |
| Navigateur (intégration) : trois clics sur « Générer la facture » (BH-808-HH) | une facture, F-2026-0007 ; compteur 7 |

## Données laissées sur Test (preuves)

BB-202-BB : fiches atelier `17d9cd7f` (31 juillet) et `d49281a9` (18 mars),
terminées ; factures F-2026-0003, F-2026-0004 (doublon de la reproduction,
conservé), F-2026-0005. BD-404-DD : fiche atelier terminée, F-2026-0006.
BH-808-HH : visite passée « restitué », fiche `9828a1cb`, F-2026-0007. Contrôle
synthétique `c13c2f2c` (BA-101-AA, brouillon). Aucun envoi autorisé.

## Limites

- Fenêtre de facture : montants au format « 50.00 € » et désignation longue
  collée au montant — défauts antérieurs, non traités ici.
- Cas « un autre poste a facturé entre-temps » : couvert en base (deux sessions
  prouvées) ; le message de l'écran dans ce cas n'a pas été rejoué au navigateur.
- Si des avoirs ou acomptes sont introduits un jour, la règle « une facture par
  fiche » devra porter un type de document.
