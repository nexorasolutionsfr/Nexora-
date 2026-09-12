# Passation pour la revue UI/UX du dashboard — 12 septembre 2026

Ce document donne de quoi ouvrir Nexora, s'y promener et juger les écrans,
sans déclencher d'envoi réel et sans toucher à un compte de prospect. Aucun
secret n'y figure : les accès passent par des outils du dépôt et par des
fichiers `.env.local` non versionnés, déjà en place sur le Mac.

Mis à jour après la livraison de la PR #82 (fusionnée le 12 septembre).

## Où est le code

| | |
|---|---|
| Dépôt | `nexorasolutionsfr/Nexora-` |
| Copie de travail principale | `/Users/Baptiste/Documents/Codex/2026-08-27/files-mentioned-by-the-user-tu/nexora-dashboard` (branche `feature/landing-garage-v1`, modifications en cours — **ne pas s'en servir pour la revue**) |
| Worktree de référence | `…/nexora-dix-minutes-worktree`, branche `ux/dix-premieres-minutes` |
| PR | [#82](https://github.com/nexorasolutionsfr/Nexora-/pull/82), **fusionnée** |
| Commit de fusion sur `main` | `6968684` |
| Dernier commit de la branche avant fusion | `b9bdd08` |
| Commits de la branche | `5313493`, `9b43a72`, `bda8e88`, `d080305`, `389ba05`, `2be1e00`, `f69ab31`, `4f7b2ee`, `3680298`, `e4693d9`, `b9bdd08` |

Le worktree de référence reste sur sa branche, mais celle-ci a été avancée
sur `main` après la fusion : son contenu est donc exactement celui de `main`,
documents compris. C'est lui qui sert l'application Test.

## Où est l'application

| Environnement | Adresse | Base |
|---|---|---|
| Production (vitrine + dashboard) | `https://nexora-garage.vercel.app` (alias `https://nexora-uig6.vercel.app`) | Supabase `omphppsmhmyllapdqevn` |
| Test | **local seulement** : `http://localhost:3111` | Supabase `slawilafseganlbghgwx` |

Il n'existe pas d'application Test hébergée. Pour l'ouvrir :

```bash
cd "/Users/Baptiste/Documents/Codex/2026-08-27/files-mentioned-by-the-user-tu/nexora-dix-minutes-worktree" && ./node_modules/.bin/next dev -p 3111
```

Le `.env.local` de ce worktree vise Test. Le port 3111 compte : c'est celui
qui a servi à la recette. Un serveur peut déjà tourner ; `lsof -iTCP:3111` le dit.

**Le code servi sur 3111 est celui qui est en Production** : même arbre, à la
fusion près. Les deux bases portent les mêmes trois migrations du 15 (voir
plus bas). Ce qu'on juge sur 3111 est donc ce qui est livré — à une réserve
près : Test a le drapeau Cockpit éteint, comme la Production.

## Comptes synthétiques (Test)

Trois rôles sur le garage **« Garage Recette Dix Minutes Apres »**
(`2d52c219-da21-4ce6-a8e4-07d2921b668e`) :

| Rôle | Compte |
|---|---|
| Dirigeant | `recette.dixmin.apres@nexora-recette.invalid` |
| Accueil | `recette.dixmin.accueil@nexora-recette.invalid` |
| Mécanicien | `recette.dixmin.meca@nexora-recette.invalid` |

Un second garage, « Garage Recette Dix Minutes »
(`ceabbbcc-4b44-45fe-a58d-4667cefaaf27`), appartient à
`recette.dixmin.avant@nexora-recette.invalid` : c'est le parcours « avant »
corrections, utile pour comparer.

Ces comptes n'ont **pas de mot de passe** : on entre par un lien de connexion
à usage unique. L'outil est **dans le dépôt**, plus dans un répertoire de
session :

```bash
cd "/Users/Baptiste/Documents/Codex/2026-08-27/files-mentioned-by-the-user-tu/nexora-dix-minutes-worktree"
node scripts/recette/acces-test.mjs comptes
node scripts/recette/acces-test.mjs lien recette.dixmin.accueil@nexora-recette.invalid
```

Le lien produit ouvre directement `http://localhost:3111/dashboard`. Il vaut
une fois et une heure. Trois garde-fous dans le script : refus si le
`.env.local` du worktree ne vise pas le projet Test, refus de toute adresse
hors `@nexora-recette.invalid`, lecture seule pour tout le reste. La clé de
service est lue dans le `.env.local`, jamais écrite dans le dépôt.

Pour changer de rôle dans le même navigateur, se déconnecter d'abord : une
session déjà ouverte reprend la main sur le lien suivant.

## Jeu de démonstration

- **Garage Horizon — Démonstration Nexora** (Test, `b6d72d0e-…`) : cliente
  Claire Bernard, Peugeot 308 SW `DEMO-308-HZ`, contrôle à trois points, devis
  accepté, ordre de réparation en attente de pièce. Remise à zéro :
  `~/Desktop/Nexora - Automatisation/Produit/demo-garage-horizon-remise-a-zero.sql`.
- Déroulé de démonstration et fiche d'une page :
  `Prospection/cold-call-2026-09-07/demo-15-minutes-2026-09-07.md`.

Ce jeu est conservé. Il peut être parcouru sans rien casser ; le remettre à
zéro seulement si une démonstration l'a abîmé.

## Documents à jour

- `docs/recette/livraison-pr82-2026-09-12.md` — ce qui a été publié, ce qui a
  été vérifié, ce qui reste ouvert.
- `docs/recette/dix-premieres-minutes-2026-09-11.md` — le parcours mesuré
  avant/après, le classement des problèmes, ce qui reste imparfait.
- `docs/architecture/` — contrats des lots précédents (devis multi-lignes,
  ordre de réparation, socle d'envois).

## Ce qui peut être manipulé sans déclencher d'envoi

Sur Test, **tout**. Vérifié le 12 septembre : les six workflows n8n actifs
pointent vers la Production ou ne touchent aucune file ; aucun ne lit Test.
Créer des devis, des factures, autoriser des envois, générer des liens : les
lignes restent en file et rien ne part.

Un envoi réel n'a eu lieu qu'une fois, le 12 septembre à 00:04, par un
traitement ponctuel importé pour la recette :

| | |
|---|---|
| Nom | RECETTE TEST — envoi devis (exécution ponctuelle) |
| Identifiant | `recetteenvoitest00000001` |
| Créé le | 2026-09-12T00:02:59Z |
| Actif | non |
| Identifiants utilisés | `Supabase RECETTE (Test)`, `SMTP Brevo — envois métier` |

**À supprimer d'un clic dans l'interface n8n** : la CLI de cette version
n'expose ni `delete` ni `archive` (seulement `import`, `export`, `list`,
`publish`, `unpublish`). Son inactivité a été revérifiée le 12 septembre.

À ne pas faire : ouvrir le compte Clinic Passion, écrire vers une adresse qui
n'est pas celle de Baptiste, activer un workflow n8n.

## Fonctionnalités : ce qui marche, ce qui dort

| État | Détail |
|---|---|
| Disponible | Clients et véhicules, agenda, atelier, devis multi-lignes, liens publics devis/facture, ordres de réparation, contrôle véhicule (drapeau `INSPECTIONS_MODULE_ACTIF`), accès salariés (3 rôles), abonnement Stripe, reprise de fichier CSV |
| Disponible mais sans automatisme | Envoi d'e-mail : la file se remplit sur Test et n'est vidée que par n8n, côté Production |
| Désactivé | SMS et WhatsApp (aucun moteur), relance et demande d'avis (livrées éteintes), entrée IMAP et Assistant Garage (dépubliés le 10 septembre), Google Calendar (drapeau `GOOGLE_CALENDAR_CONFIGURE`), Cockpit Opportunités (drapeau `NEXT_PUBLIC_COCKPIT_OPPORTUNITES_ACTIF`, absent des `.env.local` — l'accueil s'affiche donc en trois zones) |
| Dépendant du Mac | n8n (Docker, conteneur `nexora-n8n`, port 5678), la base Test via le CLI Supabase, l'application Test (serveur local) |

## État des bases

Les trois migrations du 15 sont appliquées **et enregistrées** des deux côtés,
Test et Production, depuis le 12 septembre :

| Version | Effet |
|---|---|
| `20260915000100` | un devis créé n'est plus armé pour l'envoi |
| `20260915000200` | la mise à l'écart d'un document modifié reste bornée aux garages demandés |
| `20260915000300` | l'aperçu montré au garage dit exactement le message envoyé |

Les définitions de `reserver_notifications` et `apercu_message_devis` portent
la même empreinte sur les deux projets.

## Deux dettes connues, à ne pas confondre avec des régressions

- **La facture garde le défaut que le devis n'a plus** : sa notification est
  armée dès la génération. Correctif minimal à construire : la même migration
  que pour le devis (`notifier_nouvelle_facture` → `sans_lien`) **et** le geste
  d'autorisation dans l'écran Factures, qui n'existe pas encore. Tant que ce
  point est ouvert, les envois ne sont pas entièrement sécurisés.
- **Le message part de deux sources** : l'aperçu vient d'une fonction SQL
  (`apercu_message_devis`), le message envoyé est reconstruit dans un nœud de
  code n8n. Ils disent mot pour mot la même chose depuis le 12 septembre ;
  rien n'empêche techniquement qu'ils redivergent.

## Petit écart d'interface, volontairement laissé

Le rôle accueil a le droit `verifier` dans `accesConstants`, mais l'entrée de
menu « Notifications à vérifier » n'est proposée qu'au dirigeant : la table
`NAV_VERS_VUE_ROLE` de `NexoraDashboard.jsx` n'a pas d'entrée pour cette vue,
et sa règle est « ce qui n'est pas listé n'est ouvert qu'au dirigeant ».
C'est une restriction, pas un droit élargi. À trancher comme une question de
produit : l'accueil doit-il traiter les échecs d'envoi ?
