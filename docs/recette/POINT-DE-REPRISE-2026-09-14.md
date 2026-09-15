# Point de reprise — PR #101 (constat → devis, modèles, suivi, relances)

Mis à jour le 15 septembre 2026, 03 h (Paris), après publication. **Ne présente
comme fait que ce qui est listé sous « Fait ».**

## État

- **PR #101 fusionnée** (https://github.com/nexorasolutionsfr/Nexora-/pull/101) :
  tête validée `2c277ff`, fusion `3aa2186` dans `main` (parents `15eead5`,
  `2c277ff`), le 15 sept. à 01:00 UTC.
- **Déploiement Vercel Production `success` sur `3aa2186`.** Code servi
  contrôlé sur `nexora-garage.vercel.app` (textes du lot présents dans les
  bundles). **Pas de recette cliquée en Production.**
- **Dix migrations appliquées en Production** (`omphppsmhmyllapdqevn`) :
  `20260919000100` → `20260919001000`, par un seul `db push`, 00:58 UTC,
  **avant** la fusion. Toutes enregistrées.
- **Relances de travaux différés : non disponibles.** Aucun workflow importé,
  écran « Aujourd'hui » sans « Autoriser l'envoi »
  (`CAPACITES.relanceTravauxDifferes.disponible = false`).
- Sauvegarde et relevés : `~/Nexora_backups/production_2026-09-15_avant-constat-devis/`.

## Fait

| Étape | Résultat | Détail |
|---|---|---|
| Relances annoncées indisponibles | corrigé, recette Test dirigeant + accueil | `indisponibilite-relances-2026-09-15.md` |
| Protocole de publication et interruption partielle | complété ; `db push` = une transaction **par fichier** (vérifié) | `proposition-publication-2026-09-14.md` §5, §5 bis |
| Tests unitaires sur `2c277ff` | 517/517 | extraction propre de la tête |
| Build de production sur `2c277ff` | vert | idem |
| Checks PR sur `2c277ff` | Vercel `SUCCESS`, fusionnable `CLEAN` | — |
| Répétition sur export frais de Production | **102 OK, 0 KO, 0 erreur SQL, VERT** | `repetition-export-du-jour.log` (sauvegarde) |
| Historiques | 106 migrations des deux côtés, aucune distante absente en local | `migration-list-avant.txt` |
| Dry-run | exactement les dix, dans l'ordre | — |
| Files avant / après | identiques : 2 notifications de devis `bloque` (6 sept., inchangées), 0 `en_attente`, 0 `envoi_en_cours` ; `relances_travaux` vide | `files-avant.txt`, `files-apres.txt` |
| Droits après | `anon` n'exécute aucune fonction du lot ; préparation/réservation/fin des relances réservées au service ; 6 tables nouvelles, toutes RLS, aucune écriture directe `authenticated` ; 3 politiques `inspections_photos_storage_*` | `controles-droits-apres.txt` |
| Réautorisation | **aucune** | — |
| Parcours complet au navigateur (nuit précédente) | joué sur Test, garage isolé | `parcours-navigateur-2026-09-15.md` |

## Nature des preuves

- Compatibilité du retour arrière : **appels de l'ancien code rejoués en SQL**
  sur la base jetable, pas une recette de l'ancienne interface au navigateur.
- Production : code servi contrôlé ; aucune session ouverte, aucun clic.

## Limites restantes

- `autoriser_envoi_relance_travail` reste appelable par un utilisateur
  authentifié **hors interface** : la ligne passerait `en_attente`, rien ne la
  réserve (aucun workflow). La fermer = une migration de plus.
- Activation des relances bloquée : opposition client à l'écran et dans le
  message, base légale, activation par garage, preuve de réception Brevo,
  hébergement hors du Mac.
- Défauts d'ergonomie laissés ouverts : voir `parcours-navigateur-2026-09-15.md`,
  « Ce qui reste ».

## À vérifier par Baptiste dans le dashboard (Production)

1. Aujourd'hui : un travail différé échu se suit à la main (« Ouvrir la
   fiche », « Marquer traité », « Reporter ») ; aucun « Autoriser l'envoi ».
2. Dossier d'un véhicule avec constat : « Préparer le devis depuis le
   constat », une ligne « Prix à renseigner » à chiffrer.
3. Lien public du devis (« Obtenir un lien à transmettre vous-même ») :
   « Constat du garage » et la photo, sans rien envoyer.

## Non commencé

Lot 4 (import CSV). Saisie de l'opposition à l'écran. Avis Google, IMAP.
