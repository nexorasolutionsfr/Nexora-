# Recette — Lot 2 « incohérences métier avérées », 15 septembre 2026

Branche `lot2/coherence-documents` (depuis `main` `32f52fe`, **indépendante du
lot 1**). Supabase **Test**, garage fictif « PROTO Atelier 2026-09-14-19h23 ».
Règle suivie : ne corriger que ce qui est reproduit. **Aucune migration.**

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

## Décision attendue — verrou en base

Les gardes de l'écran ne couvrent pas deux onglets ou deux postes au même
instant. Le verrou complet serait un index unique partiel
`factures (rendez_vous_id) where rendez_vous_id is not null`, ou un trigger
avec verrou consultatif. Relevé **en lecture** sur la Production le 15 sept. :
aucune facture n'y est encore rattachée à une visite, donc aucun doublon qui
empêcherait l'index. Sur Test, les deux factures de la reproduction le
bloqueraient (pas de suppression de donnée sans décision). Avoirs ou factures
rectificatives par visite : aucun statut de ce type n'existe aujourd'hui.
**Non fait** : c'est une migration, à décider.

## Données laissées sur Test (preuves)

BB-202-BB : fiches atelier `17d9cd7f` (31 juillet) et `d49281a9` (18 mars),
terminées ; factures F-2026-0003, F-2026-0004 (doublon de la reproduction),
F-2026-0005. Contrôle synthétique `c13c2f2c` (BA-101-AA, brouillon). Aucun envoi
autorisé.

## Limites

- Fenêtre de facture : montants au format « 50.00 € » et désignation longue
  collée au montant — défauts antérieurs, non traités ici.
- Cas « relecture avant insertion » (autre poste qui facture entre-temps) :
  code en place, non rejoué au navigateur.
