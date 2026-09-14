# Recette — passe de fiabilisation avant publication (PR #101)

15 septembre 2026, nuit. Supabase **Test** et environnements de recette
isolés seulement. Aucun envoi réel, aucune modification de Production (deux
exports de schéma en lecture), aucune activation n8n vive, aucune fusion.

## 1. Détection des modifications du devis — corrigé et vérifié

**Constat vérifié.** `empreinte_devis` ne signait ni le contenu des lignes, ni
le constat, ni les photos. Reproduit sur Test **avant** la correction
(`scripts/recette/fiabilisation-envois-serveur.mjs`, sortie gardée) : autoriser
l'envoi, renommer une ligne sans changer le total, modifier le constat, ajouter
une photo, réserver → les trois notifications sont **réservées** (parties si un
workflow tournait).

**Correction** : `20260919001000_fiabilisation_envois.sql` — l'empreinte signe la
projection publique (libellé, type, quantité, prix, TVA, prix à renseigner,
constat montré, identifiants des photos montrées, véhicule, prestation,
montants, statut). Blocage et motif inchangés ; revalidation par le garage.

| Contrôle (Test, sessions réelles, garage neuf) | Avant | Après |
|---|---|---|
| libellé modifié après l'autorisation → mis de côté | ✖ réservé | ✔ |
| constat modifié → mis de côté | ✖ réservé | ✔ |
| photo ajoutée → mis de côté | ✖ réservé | ✔ |
| témoin sans changement → réservé | ✔ | ✔ |
| revalidation par le garage → réservé | ✖ | ✔ |
| devis accepté : photo ajoutée ensuite, accusé réservé (preuve figée) | ✔ | ✔ |
| photo figée toujours protégée contre la suppression | ✔ | ✔ |

Base jetable : « empreinte_devis change avec le libellé, le constat et les
photos, et reste stable sans changement » — OK.

## 2. Transport réel des relances — corrigé et vérifié (réception réelle non testée)

**Constats vérifiés.** `fromEmail` valait l'adresse du garage (`repondre_a`) :
Brevo aurait refusé ou réécrit un expéditeur non vérifié. Le classement cherchait
`\b4\d\d\b` / `\b5\d\d\b` n'importe où dans le message.

**Corrections** (`n8n/relances-travaux/construire.mjs`) :
- nœud « Composer l'expéditeur » : `"<nom du garage>" <nexorasolutions.france@gmail.com>`
  — l'identité du socle des envois (`n8n/socle-envois/nouveau-devis.json`),
  vérifiée chez Brevo le 8 sept. ; Reply-To = e-mail du garage s'il est valide,
  sinon aucun ;
- `classerEchec.js` : ne lit que des formulations nodemailer situées dans
  l'échange SMTP et ancrées en début de message ; tout le reste est incertain.
  8 tests unitaires, dont « 550 € » ou « Erreur interne 503 » → incertain.

**Exécution de la vraie variante** : `recette-smtp.json` (mêmes nœuds que
`production.json`, vérifié par script), importée dans l'instance n8n **isolée**
`nexora-n8n-recette`, identifiant SMTP visant `scripts/recette/smtp-controle.mjs`
(écoute 127.0.0.1, n'accepte que `@nexora-recette.invalid`, ne relaie rien),
garage neuf `PROTO Constat SMTP …`, quatre relances autorisées par le dirigeant.

| Cas | Journal SMTP | Passage 1 | Passage 2 |
|---|---|---|---|
| accepte | 250 après le message, `From: "PROTO Constat SMTP …" <nexorasolutions.france@gmail.com>`, `Reply-To: recette.smtp.…@nexora-recette.invalid` | `envoye`, 1 tentative | rien renvoyé |
| temporaire | 451 au RCPT TO | `en_attente`, 1 tentative, motif « refus temporaire du fournisseur avant le message : … 451 … » | repris, 2 tentatives |
| definitif | 550 au RCPT TO | `bloque`, motif « refus définitif … 550 … » | non repris |
| coupure | message reçu, connexion coupée sans réponse | `envoi_en_cours`, rien clos (« Connection closed unexpectedly » → incertain) | **non repris** |

Constat sur n8n : l'erreur transmise au nœud d'échec est `{ "error": "<texte>" }`
seulement, sans `responseCode` ni `command`.

## 3. Conditions d'envoi des relances — corrigé côté base, activation bloquée

**Mécanismes existants identifiés** :
- autorisation du garage : `autoriser_envoi_relance_travail`, message par
  message (dirigeant, accueil) ; il n'existe **pas** d'autorisation au niveau
  du garage ;
- opposition du client : journal `revenue_recovery_permissions` (canal e-mail,
  la décision la plus récente fait foi), écrit par
  `revenue_recovery_enregistrer_permission` (propriétaire). **Aucune fonction
  des relances ne le lisait.**

Ces relances ne sont pas des messages transactionnels : les notifications de
devis, factures, RDV et véhicule prêt ne sont pas concernées.

**Correction** (`001000`) : opposition (`oppose`, `revoque`) vérifiée à la
préparation (aucun brouillon ; brouillon existant annulé), à l'autorisation
(`client_oppose`, message à l'écran) et à la réservation (mise de côté dans
l'instruction atomique si l'opposition arrive entre les deux).

| Contrôle (Test) | Avant | Après |
|---|---|---|
| opposition enregistrée par la fonction existante | ✔ | ✔ |
| autorisation refusée pour un client opposé | ✖ | ✔ |
| client sans opposition : autorisation acceptée | ✔ | ✔ |
| opposition entre autorisation et réservation → rien réservé, mis de côté | ✖ réservé | ✔ |
| réautorisation refusée ensuite | ✖ | ✔ |
| préparation : aucun brouillon pour un client opposé | ✖ | ✔ |
| préparation : brouillon existant annulé | ✖ | ✔ |

Total : **9/19 avant, 19/19 après.**

**Manques qui gardent l'activation bloquée** (chantiers distincts, non
commencés) : aucun écran pour enregistrer une opposition ; aucun moyen de
s'opposer dans le message ; base légale à confirmer ; autorisation par garage.

## 4. Publication et retour arrière — plan corrigé et compatibilité vérifiée

`docs/recette/proposition-publication-2026-09-14.md` réécrit : ordre des
10 migrations, trois points d'arrêt, relevés avant/après, pas de
réautorisation automatique, **retour arrière = suspension + redéploiement
applicatif, base conservée** (la suppression des nouveaux objets est
explicitement écartée).

`docs/recette/compat-retour-arriere-2026-09-15.sql` (base jetable, vrai schéma
`storage` de Production) : données créées par les nouvelles fonctions, puis
gestes de `main` rejoués sous `authenticated` — 15 contrôles OK (tableau dans la
proposition, §6). Premier passage : un KO **dans le test lui-même** (suppression
directe dans `storage.objects`, interdite en Production par
`storage.protect_delete`) ; corrigé pour passer comme l'API Storage.

## 5. Fiabilité de la recette automatisée — corrigé et démontré

`docs/recette/base-jetable-2026-09-14.sh` :
- `set -Eeuo pipefail` + piège d'erreur par étape ; `ON_ERROR_STOP=1` partout ;
- export **frais** à chaque passage (`public` et `storage`) ;
- contrôles comptés en début de ligne **et** dans les `NOTICE` (l'ancien
  comptage ignorait les KO émis par `raise notice`) ;
- code de sortie ≠ 0 si commande, migration, SQL ou contrôle en échec.

Constat de l'export : en Production, `storage.objects` porte exactement les
trois politiques `inspections_photos_storage_*` et le trigger
`protect_objects_delete`. L'ordre de chargement compte (storage après public) —
trouvé par la barrière elle-même au premier passage.

| Passage | Résultat |
|---|---|
| répétition finale, export frais | 10 migrations OK, **102 OK, 0 KO, 0 erreur SQL, VERT, code 0** |
| `ECHEC_VOLONTAIRE=controle` | 102 OK, 1 KO → **ÉCHEC, code 1** |
| `ECHEC_VOLONTAIRE=sql` | 1 erreur SQL → **ÉCHEC, code 1** |
| `ECHEC_VOLONTAIRE=migration` | arrêt à l'étape 5 → **ÉCHEC, code 1** |

## 6. Non-régression

| Preuve | Résultat |
|---|---|
| unitaires | 504/504 |
| `relances-travaux-serveur.mjs` | 34/34 |
| `modeles-travaux-serveur.mjs` | 27/27 |
| `preuves-devis-serveur.mjs` | 20/20 |
| `constats-mecanicien-serveur.mjs` | 35/35 — après avoir rendu la recette rejouable (elle réutilisait une fiche terminée par son propre passage précédent ; elle prend désormais une visite dont la fiche n'est pas terminée, sinon en crée une) |

## Traces laissées sur Test

Garages de recette `PROTO Constat Fiabilisation …` (3, dont un vide après un
arrêt sur une catégorie invalide) et `PROTO Constat SMTP …` : notifications
`envoi_en_cours` et relances dans leurs états finaux, gardées comme preuves.
Aucune donnée d'un autre garage lue ou modifiée par ces scripts.
