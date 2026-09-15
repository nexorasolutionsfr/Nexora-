# Entrer chez un garage déjà équipé — une page

14 septembre 2026. **Lot 4 du cap produit : non implémenté cette nuit**, par
choix d'ordre (lots 0 à 3 d'abord, terminés et prouvés). Ce document fixe ce
qui existe, ce qui manque, et l'ordre des futurs connecteurs.

## Ce qui existe déjà (vérifié dans le code)

`components/import/ImportClients.jsx` + `analyseFichier.js` (testé) + la
fonction SQL d'import (contrat : `docs/architecture/import-base-clients-v1.md`) :

- dépôt d'un CSV, séparateur deviné, **association des colonnes** proposée et
  corrigeable ;
- **aperçu** sur les vraies lignes, « Vérifier sans rien importer » avec
  compteurs identiques à l'import ;
- motifs de rejet **ligne par ligne** ;
- plaque unique **par garage** (20260918000100), plus globale.

## Ce qui manque, dans l'ordre où cela compte

1. **Mémoriser la correspondance de colonnes** par garage (le prochain export
   du même logiciel ne demande plus rien).
2. **Identifiant externe** `(garage_id, source, id_externe)` quand l'export en
   fournit un : un second import identique met à jour au lieu de dupliquer.
   Une plaque seule n'est jamais un identifiant de client, ni une permission
   de fusionner.
3. **Conflits signalés** : une donnée locale plus récente n'est jamais écrasée
   en silence ; la ligne est listée « à arbitrer ».
4. **Export CSV** des données prises en charge, nommé génériquement, avec
   neutralisation des formules (`=`, `+`, `-`, `@` en tête de cellule
   préfixés d'une apostrophe) pour l'ouverture dans Excel.

Hors périmètre, explicitement : historique comptable importé comme documents
Nexora ; écriture dans un logiciel tiers.

## Vocabulaire commercial

Dire : « **import CSV sous réserve de compatibilité** ». Ne jamais dire
« connecté à EBP / Winmotor / … » sans un essai sur un vrai export, version
identifiée.

## Le futur connecteur, par ordre de préférence

| Ordre | Voie | Condition d'entrée | Preuve exigée | Retour arrière |
|---|---|---|---|---|
| 1 | **API officielle** de l'éditeur | API documentée, droit d'usage écrit, compte de test | lecture d'un client et d'un véhicule, puis écriture d'un champ inoffensif, sur le compte de test | révocation du jeton ; aucune écriture tant que non validé |
| 2 | **Export / import de fichiers** | un vrai export fourni par un garage, version du logiciel notée | import à blanc (aperçu) = compte exact des lignes ; second import = 0 doublon | l'import est additif ; lot supprimable par identifiant d'import |
| 3 | **Automatisation Windows** (type RPA) | environnement Windows fourni par le garage, scénario borné (un écran, une action), licence d'usage vérifiée | journal et rejeu d'une exécution ; aucune action destructive | arrêt du poste ; aucune écriture sans relecture humaine |

Pas de projet « connecteur universel ». Chaque connecteur commence par un
garage réel qui fournit son export ou son environnement.

## Trois questions pour le prochain appel

1. « Où retapez-vous les informations aujourd'hui ? »
2. « Quels travaux reviennent assez souvent pour être préparés ? »
3. « Quel export votre logiciel actuel vous permet-il de sortir ? »
