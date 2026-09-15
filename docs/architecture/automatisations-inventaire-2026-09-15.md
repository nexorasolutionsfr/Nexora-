# Inventaire des automatisations — 15 septembre 2026

Relevé **en lecture seule**. Rien n'a été importé, activé, désactivé ni modifié
dans l'instance n8n vive (`nexora-n8n`, Docker sur le Mac) ni dans Brevo.
Complète `plan-n8n-2026-09-14.md` avec des mesures du jour.

## Méthode et niveau de preuve

| Source | Ce qui a été lu |
|---|---|
| `n8n list:workflow` (instance vive) | 20 workflows, dont 6 actifs |
| **Copie** de `database.sqlite` (+ wal, shm) prise par `docker cp`, interrogée localement en `sqlite3 -readonly` | exécutions sur 7 jours, erreurs décodées, nœuds, `settings.errorWorkflow` |
| Production `omphppsmhmyllapdqevn`, `supabase db query` (lecture) | files de notifications par statut, relances, journal d'opposition |

« Revérifié aujourd'hui » = mesuré le 15 septembre. « Plan du 14 » = repris de
`plan-n8n-2026-09-14.md`, non revérifié.

## 1. État des workflows (revérifié aujourd'hui)

| Catégorie | Workflows |
|---|---|
| **Actifs et réellement exécutés** | `Nouveau devis (socle)`, `Facture (socle)`, `Proposition RDV (socle)`, `Véhicule prêt (socle)` — chacun ≈ 720 exécutions/jour (`*/2`) ; `3 - Détection no-show` (horaire, 86 exécutions / 7 j) |
| **Actif mais jamais exécuté** | `3 - Journalisation erreurs` : **aucun workflow actif ne le désigne comme workflow d'erreur** (`errorWorkflow` vide pour les 6) → les erreurs du socle ne sont pas journalisées |
| **Inactifs** | `NEXORA \| DEV \| Validation RDV`, `NEXORA \| DEV \| Approval Engine V1`, `DEV - Nexora Core Engine V2.3`, 4 × `Assistant Garage …`, `2 - Notif : …` × 4 (anciennes versions des notifications), `RECETTE — Assistant Garage (communications Brevo)` × 2, `RECETTE TEST — envoi devis` (1 exécution ponctuelle le 12 sept.) |
| **Obsolètes** (remplacés par le socle) | `2 - Notif : Nouveau devis / Facture / Proposition RDV / Véhicule prêt` ; `DEV - …` |
| **Préparés seulement, non importés** | `n8n/relances-travaux/{test,production,recette-smtp}.json` |

Historique d'exécution conservé depuis le **11 sept. 2026** (10 214 exécutions).

### Erreurs sur 7 jours (revérifié, messages décodés)

16 exécutions en erreur, toutes au nœud **« Réserver la file »**, toujours les
4 workflows du socle à la même minute : *Gateway Timeout* (12 sept.),
*ECONNRESET* (13 sept.), *ENOTFOUND* (14 sept. ×2). Ce sont des coupures réseau
du Mac. Relevé Production du jour : **aucune ligne `envoi_en_cours` ni
`en_attente`** — rien n'est resté bloqué. Ces erreurs n'ont été vues que par
lecture de la base n8n (pas de journalisation, voir ci-dessus).

## 2. Volumes réels (revérifié aujourd'hui)

Production, 7 derniers jours : **3 envois** (2 devis, 1 véhicule prêt) ;
0 facture, 0 proposition. Totaux historiques : devis 23 envoyés / 2 bloqués ;
atelier 1 / 3 ; factures 1 ; propositions 2. **1 garage** en Production.
Soit ≈ 18 000 exécutions de sondage pour 3 messages (voir la proposition
séparée `proposition-reduction-sondage-2026-09-15.md`).

## 3. Fiche par parcours

| Parcours | Déclencheur | Autorisation | Destinataire | Expéditeur | État de file | Reprise | Preuve disponible |
|---|---|---|---|---|---|---|---|
| **Devis** (socle, actif) | cron `*/2`, `reserver_notifications('devis')` | `autoriser_envoi_devis` (dirigeant/accueil) ; refus si chiffrage incomplet ; empreinte = contenu lu par le client | `destinataire_valide` figé à l'autorisation | identité Brevo du socle, nom du garage, Reply-To garage (plan du 14 / mémo Brevo, non revérifié) | sans_lien → en_attente → envoi_en_cours → envoye / bloque / a_reprendre | échec certain repris ; `envoi_en_cours` jamais recyclé | envoi réel 8-9 sept. (mémo) ; 2 envois / 7 j en Production (revérifié) |
| **Facture** (socle, actif) | cron `*/2` | `autoriser_envoi_facture` | figé | idem | idem | idem | **réception Brevo non prouvée** (mémo 12 sept.) ; 1 envoi historique |
| **Proposition de rendez-vous** (socle, actif) | cron `*/2` | à revérifier dans le socle (plan du 14) | e-mail client | idem | idem | idem | 2 envois historiques |
| **Véhicule prêt** (socle, actif) | cron `*/2` | `autoriser_envoi_atelier` (naît `sans_lien`) | `destinataire_valide` | idem | idem | idem | envoi réel 11 sept. (mémo) ; 1 envoi / 7 j ; **deux composeurs** (nœud Code et `apercu_message_atelier`) |
| **Confirmation / modification / annulation RDV** | aucun (branches archivées de l'Assistant) | — | — | — | tables présentes | — | aucune ; `CAPACITES.rappelConfirmation = false` |
| **Relances de travaux différés** | aucun (non importé) ; prévu `*/15` borné | message par message ; opposition respectée à la préparation, l'autorisation et la réservation | figé, relu à la réservation | identité du socle, nom du garage, Reply-To garage (prévu) | a_relire → en_attente → envoi_en_cours → envoye / bloque / a_reprendre ; obsolete / annulee | 4xx repris ×3, 5xx bloqué, incertain jamais repris | SMTP contrôlé 15 sept. ; **aucune réception réelle** ; Production : 0 relance, 0 travail échu |
| **Avis Google** | aucun (branche archivée) | — | — | — | — | — | aucune ; `CAPACITES.demandeAvis = false` |
| **Demandes entrantes (IMAP / formulaire / WhatsApp)** | aucun (archivé) | — | — | — | — | — | preuves du 10 sept. (mémo) ; routage par expéditeur jugé inacceptable |
| **Détection no-show** (actif) | horaire | aucune (pas d'envoi) | — | — | marque les RDV absents | — | 86 exécutions / 7 j |

## 4. Prérequis des nouvelles relances — où l'on en est

| Prérequis | État au 15 sept. | Preuve |
|---|---|---|
| Enregistrer l'opposition du client | **Fait (PR du lot 5)** : fiche client, titulaire du garage, par `revenue_recovery_enregistrer_permission` ; la préparation respecte l'opposition | Test : opposé → 0 relance ; témoin → `a_relire` |
| Voir l'opposition depuis l'accueil | **Non** : le journal n'est lisible que par le titulaire ; le bloc est masqué aux autres rôles plutôt que de dire « aucune opposition » | politique `revenue_recovery_permissions_isolation` |
| Moyen de demander l'arrêt dans le message | **Non commencé** : lien public à jeton + page d'arrêt + migration | — |
| Activation bornée à un garage volontaire | **Non commencé** : le workflow Production prévoit `p_garages: null` ; il faut une liste de garages volontaires lue par la réservation (migration) | — |
| Vérifier préférences et validité à la réservation | **Existant** (001000) : travail ouvert, échéance, destinataire, texte, opposition | 34 + 19 contrôles serveur (14-15 sept.) |
| Inventaire des autorisations anciennes avant activation | **Requête prête**, Production : 0 ligne `relances_travaux` au 15 sept. | ci-dessous |
| Recette en instance isolée (succès, refus, coupure, concurrence, reprise, opposition après autorisation, obsolète) | **Partiel** (14-15 sept.) : succès, 451, 550, coupure, obsolète, opposition après autorisation (serveur) ; **concurrence n8n non rejouée**, rien de nouveau aujourd'hui | `n8n-relances-execution-2026-09-14.md`, `fiabilisation-envois-2026-09-15.md` |
| Base juridique d'une relance commerciale | **À valider par Baptiste / un juriste** — ce n'est pas un choix technique | — |

Requête d'inventaire à jouer **avant** toute activation (lecture) :

```sql
select r.id, r.garage_id, r.statut, r.autorise_le, r.destinataire_valide,
       t.statut as travail, t.date_relance, r.echeance,
       public.client_oppose_relances(r.garage_id, r.client_id) as client_oppose
  from relances_travaux r join travaux_differes t on t.id = r.travail_differe_id
 where r.statut in ('en_attente', 'bloque', 'envoi_en_cours')
 order by r.garage_id, r.autorise_le;
```

Toute ligne dont le garage n'est pas volontaire, dont le client s'oppose, dont
le travail est clos ou l'échéance changée : annulée ou revalidée **par un geste
du garage**, jamais réautorisée automatiquement. (`client_oppose_relances` est
réservée au service : jouer la requête avec le rôle de service.)

## 5. Dépendances restantes (non traitées, instance vive intouchée)

- **Journalisation des erreurs** : rattacher `3 - Journalisation erreurs` comme
  workflow d'erreur des 4 workflows du socle — modification de l'instance vive,
  à décider.
- **Hébergement** : Mac éteint ou sans réseau = sondage en erreur, envois en retard.
- **Avis Google, IMAP** : après les relances fiabilisées ; aucun routage entrant
  avec garage par défaut.
