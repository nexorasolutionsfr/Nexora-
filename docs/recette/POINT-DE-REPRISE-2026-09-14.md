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
- **Avant toute activation future des relances** : inventorier les
  autorisations déjà enregistrées par cette RPC encore accessible
  (`relances_travaux` en `en_attente`, `bloque`, `envoi_en_cours`, avec
  `autorise_le`, garage, destinataire), vérifier pour chacune sa validité
  (empreinte, destinataire, opposition du client, travail toujours ouvert) et
  son périmètre (garage volontaire seulement). **Aucune reprise ni
  réautorisation automatique** : une autorisation douteuse est annulée ou
  refaite par un geste du garage.
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

---

## Reprise du 15 septembre 2026 (soir) — fiabilisation n8n

Branche `fiab/n8n-erreurs-reprise` (depuis `main` `569869c`). **Préparé et
testé en recette isolée ; rien d'actif** : instance n8n vive et Production lues
seulement.

| Élément | Préparé | Testé | Actif |
|---|---|---|---|
| Workflows du socle corrigés (`n8n/socle-envois/production/`) | oui | instance isolée, Supabase Test, SMTP contrôlé (`docs/recette/n8n-fiabilisation-2026-09-15.md`) | **non** |
| Journaliseur corrigé et rattaché | oui | idem | **non** |
| Migration `20260921000100_journal_incidents_n8n.sql` | oui | base jetable (schéma Production) + **appliquée sur Test** | **non** (Production) |
| Cadences `*/5` (facture, proposition, véhicule prêt), `*/2` gardé (devis) | oui | forme vérifiée ; la cadence réelle n'a tourné qu'en `* * * * *` de recette | **non** |
| Recours `scripts/n8n/incidents-locaux.sh` | oui | lu sur l'instance vive (lecture seule) | — |

À faire par Baptiste : lire la procédure `n8n/socle-envois/BASCULE-A-AUTORISER.md`
et donner, ou non, le feu vert. Traces laissées sur Test : garage
`PROTO Constat N8N 1789498034454` et ses notifications (dont des lignes
`envoi_en_cours` volontairement laissées comme preuves), incidents
« … — RECETTE fiabilisation » dans `erreurs_automatisation`.

---

## Bascule effectuée le 16 septembre 2026 — la fiabilisation n8n est ACTIVE

PR [#108](https://github.com/nexorasolutionsfr/Nexora-/pull/108) fusionnée
(`6522340`), tête basculée `1fdb0e5`. Déroulé suivi :
`n8n/socle-envois/BASCULE-A-AUTORISER.md`.

| Élément | État |
|---|---|
| Migrations `20260921000100` (journal) et `20260921000200` (débit commun) | **appliquées en Production** ; `journaliser_incident` rend `jsonb`, `prendre_jeton_envoi` avec défauts 40/120, droits au seul `service_role`, `envois_debit` vide et sous RLS |
| Workflows du socle (`X39OgaEUulqhv1hO`, `9IG1g2ZmHQzhnsMS`, `HdO63GrT2WfopDQP`, `jXsssqkdKFR3Hnf9`) | **actifs**, 25/25/26/25 nœuds, `*/2` pour le devis, `*/5` pour les trois autres, workflow d'erreur rattaché |
| Journaliseur `erroralerts000000000000000001` | **actif**, 3 nœuds, corrigé (plus de garage en dur, messages expurgés, regroupement) |
| `3 - Détection no-show` | **inchangé**, hors périmètre |
| Débit commun | 40 tentatives/heure, 120/jour — **limites prudentes de Nexora**, pas des limites Brevo |
| Files avant/après | identiques : 0 ligne `en_attente` ou `envoi_en_cours` ; `bloque` conservées (2 devis, 3 atelier), **aucune réarmée** |
| Envois pendant la bascule | **aucun** : 7 passages observés, tous à vide, 0 jeton de débit pris |

Sauvegarde d'avant bascule (base n8n, 20 définitions, clé de chiffrement,
schémas `public` et `storage` de Production, relevé des files) :
`~/Nexora_backups/n8n_2026-09-16_1648_avant-fiabilisation/`.

**Non prouvé à ce stade** : aucun envoi réel n'a eu lieu depuis la bascule —
donc ni acceptation Brevo, ni réception client. Le premier envoi réel se
produira quand un garage autorisera une notification.

**Reste ouvert** : dépendance au Mac (endormi = rien ne part) ; le journal
dépend de Supabase comme la réservation (recours
`scripts/n8n/incidents-locaux.sh`) ; alertes préparées sans destinataire ;
relances de travaux différés toujours **non importées**.
