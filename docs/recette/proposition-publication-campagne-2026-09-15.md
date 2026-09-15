# Proposition de publication — campagne du 15 septembre 2026 (PR #103 à #107)

**Proposition pour décision. Rien n'est fusionné, rien n'est appliqué en
Production.** Le réglage du sondage n8n et la journalisation des erreurs n8n
sont une **décision séparée** (`docs/architecture/proposition-reduction-sondage-2026-09-15.md`),
hors de cette publication.

## 1. Ce qui serait publié

| Ordre de fusion | PR | Tête à fusionner | Migrations |
|---|---|---|---|
| 1 | [#103](https://github.com/nexorasolutionsfr/Nexora-/pull/103) parcours devis | `0c8ca3f` | — |
| 2 | [#104](https://github.com/nexorasolutionsfr/Nexora-/pull/104) cohérence des documents | tête de la PR au moment de la fusion (code identique à `b239bd7`, documentation ajoutée ensuite) | `20260920000100_facture_une_par_ordre`, `20260920000200_inspections_client_vehicule_coherents` |
| 3 | [#105](https://github.com/nexorasolutionsfr/Nexora-/pull/105) atelier au téléphone | `2fb888a` | — |
| 4 | [#106](https://github.com/nexorasolutionsfr/Nexora-/pull/106) premières minutes | `4dc776d` | — |
| 5 | [#107](https://github.com/nexorasolutionsfr/Nexora-/pull/107) relances : prérequis | `1ff780c` | — |

C'est l'ordre recetté (`integration-lots-2026-09-15.md`, tête `f268b22` : 528
tests, build, parcours au navigateur). Un autre ordre produirait des commits de
fusion différents, non recettés : **garder celui-ci**. Chaque fusion est faite
avec `--match-head-commit` sur la tête contrôlée.

## 2. Pourquoi les migrations passent AVANT les fusions

- Le code actuel (`main`) insère les factures directement : avec la migration
  1, une seconde facture pour une même fiche est refusée — il affiche alors
  « Impossible de générer la facture » (message générique, aucun doublon). Le
  nouveau code (#104) relit la facture existante.
- Le code actuel ne propose pas de changer le véhicule d'un contrôle ; il crée
  des contrôles avec un véhicule du client choisi : la migration 2 ne gêne pas
  ce chemin.
- Aucune des deux ne transforme de donnée existante.

## 3. Relevés préalables en Production (lecture seule), à refaire le jour J

Relevé du 15 sept. : 0 fiche avec plusieurs factures, 0 visite avec plusieurs
factures, 1 facture sans fiche, statuts `en_attente` ; 0 contrôle dont le client
diffère du propriétaire du véhicule ; 0 contrôle avec un véhicule d'un autre
garage ; 1 garage.

```sql
select 'factures par fiche > 1', count(*) from (select ordre_reparation_id from factures where ordre_reparation_id is not null group by 1 having count(*) > 1) x
union all select 'contrôles client ≠ propriétaire du véhicule', count(*) from inspections i join vehicules v on v.id = i.vehicule_id where i.client_id is not null and v.client_id is not null and v.client_id <> i.client_id
union all select 'contrôles véhicule d''un autre garage', count(*) from inspections i join vehicules v on v.id = i.vehicule_id where v.garage_id <> i.garage_id;
```

Un résultat non nul **n'empêche pas** l'application (les triggers ne valident
pas l'existant) mais doit être signalé : ces lignes ne pourraient plus changer
de client ou de véhicule sans être mises en cohérence par un geste explicite.

## 4. Protocole

0. Cible Production `omphppsmhmyllapdqevn` reconfirmée ; têtes des PR et
   `origin/main` = `32f52fe` (sinon arrêt) ; checks Vercel verts.
1. Sauvegarde du schéma : `~/Nexora_backups/production_<date>_avant-campagne/`.
2. Répétition : `bash docs/recette/base-jetable-lot2-2026-09-15.sh` sur export
   frais du jour — **arrêt si pas « RÉSULTAT : VERT »** (16 OK attendus).
3. Relevés §3.
4. Miroir jetable = `git archive <tête #104> supabase/migrations` (historique
   complet, 118 fichiers) ; `supabase migration list --linked` : seules
   manquent les deux `20260920*`.
5. `supabase db push --linked --dry-run` : **exactement** les deux, dans
   l'ordre ; sinon arrêt. Pas de `--include-all`, pas de `migration repair`.
6. `supabase db push --linked` ; suppression du dossier `migrations` du miroir.
   Rappel vérifié le 15 sept. : une transaction **par fichier**. Si la seconde
   échoue, la première reste appliquée : relever
   `select version from supabase_migrations.schema_migrations where version >= '20260920000000'`,
   **ne pas fusionner**, ne rien retirer, analyser sur base jetable. La
   migration 1 seule est sans risque pour le code actuel (§2).
7. Contrôles après : deux triggers présents, fonctions non exécutables par
   `anon`/`authenticated`, relevés §3 identiques.
8. Fusions dans l'ordre §1, une par une, en vérifiant après chacune que le
   déploiement Vercel de `main` est `success`.
9. Contrôle du **code servi** sur `nexora-garage.vercel.app` : textes « Revenir
   au dossier », « Nouveau devis complémentaire pour cette visite »,
   « Génération… », « Fermer la saisie du contrôle », « Le client refuse les
   relances », « Vos réglages s'appliquent au tableau de bord ».
10. Pas de recette cliquée en Production sans compte de démonstration dédié ;
    la dire comme telle si elle est faite.

## 5. Retour arrière

- **Application** : redéployer sur Vercel le déploiement précédent. Aucune
  donnée à reprendre.
- **Base** : ne pas supprimer les triggers pour « revenir » — ils n'ajoutent que
  des refus. Si un refus légitime apparaissait (ex. besoin d'avoirs), la
  correction est une migration nouvelle qui introduit le type de document, pas
  la suppression du garde-fou.

## 6. Hors de cette publication

- n8n : sondage `*/5` et workflow d'erreur rattaché — décision séparée.
- Relances : restent indisponibles (base juridique, lien d'arrêt, activation
  par garage volontaire).
- Fenêtre de facture : montants « 50.00 € » (défaut antérieur, non traité).
