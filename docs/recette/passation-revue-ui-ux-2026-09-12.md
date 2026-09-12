# Passation pour la revue UI/UX du dashboard — 12 septembre 2026

Ce document donne de quoi ouvrir Nexora, s'y promener et juger les écrans,
sans déclencher d'envoi réel et sans toucher à un compte de prospect. Aucun
secret n'y figure : les accès passent par des outils déjà en place sur le Mac.

## Où est le code

| | |
|---|---|
| Dépôt | `nexorasolutionsfr/Nexora-` |
| Copie de travail principale | `/Users/Baptiste/Documents/Codex/2026-08-27/files-mentioned-by-the-user-tu/nexora-dashboard` (branche `feature/landing-garage-v1`, modifications en cours — **ne pas s'en servir pour la revue**) |
| Worktree de référence | `…/nexora-dix-minutes-worktree`, branche `ux/dix-premieres-minutes` |
| PR | [#82](https://github.com/nexorasolutionsfr/Nexora-/pull/82) |
| Commits de la branche | `5313493`, `9b43a72`, `bda8e88`, `d080305`, `389ba05`, `2be1e00`, `f69ab31`, `4f7b2ee` |
| État au 12 septembre | **non fusionnée** ; `main` reste à `c92dba1`, qui est aussi le SHA servi en Production |

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
à usage unique, produit par la clé de service de Test. La méthode, sans
secret dans la conversation :

```bash
node "/private/tmp/claude-503/-Users-Baptiste-Downloads/0115e6e4-2d4c-4e67-8f6f-96fdd2cc546c/scratchpad/recette-test.mjs" lien recette.dixmin.apres@nexora-recette.invalid
```

Le lien renvoie vers `localhost:3000` : il suffit d'ouvrir l'adresse obtenue,
puis de remplacer `3000` par `3111` dans la barre d'adresse — le fragment qui
porte la session se transplante d'un port à l'autre. Ce script vit dans un
répertoire de session temporaire ; s'il a disparu, il tient en vingt lignes
autour de `auth.admin.generateLink`, avec la clé de service lue dans le
`.env.local` du worktree.

## Jeu de démonstration

- **Garage Horizon — Démonstration Nexora** (Test, `b6d72d0e-…`) : cliente
  Claire Bernard, Peugeot 308 SW `DEMO-308-HZ`, contrôle à trois points, devis
  accepté, ordre de réparation en attente de pièce. Remise à zéro :
  `~/Desktop/Nexora - Automatisation/Produit/demo-garage-horizon-remise-a-zero.sql`.
- Déroulé de démonstration et fiche d'une page :
  `Prospection/cold-call-2026-09-07/demo-15-minutes-2026-09-07.md`.

## Documents à jour

- `docs/recette/dix-premieres-minutes-2026-09-11.md` — le parcours mesuré
  avant/après, le classement des problèmes, ce qui reste imparfait.
- `docs/architecture/` — contrats des lots précédents (devis multi-lignes,
  ordre de réparation, socle d'envois).

## Ce qui peut être manipulé sans déclencher d'envoi

Sur Test, **tout** : aucun traitement ne consomme les files de Test. Créer des
devis, des factures, autoriser des envois, générer des liens : les lignes
restent en file et rien ne part. Les quatre workflows n8n qui envoient
réellement sont branchés sur la **Production** uniquement.

Un envoi réel n'a eu lieu qu'une fois, le 12 septembre à 00:04, par un
traitement ponctuel importé pour la recette : « RECETTE TEST — envoi devis
(exécution ponctuelle) », identifiant `recetteenvoitest00000001`, **inactif**.
La CLI n8n ne sait pas supprimer : à retirer d'un clic dans l'interface.

À ne pas faire : ouvrir le compte Clinic Passion, écrire vers une adresse qui
n'est pas celle de Baptiste, activer un workflow n8n.

## Fonctionnalités : ce qui marche, ce qui dort

| État | Détail |
|---|---|
| Disponible | Clients et véhicules, agenda, atelier, devis multi-lignes, liens publics devis/facture, ordres de réparation, contrôle véhicule (drapeau `INSPECTIONS_MODULE_ACTIF`), accès salariés (3 rôles), abonnement Stripe, reprise de fichier CSV |
| Disponible mais sans automatisme | Envoi d'e-mail : la file se remplit sur Test et n'est vidée que par n8n, côté Production |
| Désactivé | SMS et WhatsApp (aucun moteur), relance et demande d'avis (livrées éteintes), entrée IMAP et Assistant Garage (dépubliés le 10 septembre), Google Calendar (drapeau `GOOGLE_CALENDAR_CONFIGURE`), Cockpit Opportunités (drapeau `NEXT_PUBLIC_COCKPIT_OPPORTUNITES_ACTIF`, absent des `.env.local` — l'accueil s'affiche donc en trois zones) |
| Dépendant du Mac | n8n (Docker, conteneur `nexora-n8n`, port 5678), la base Test via le CLI Supabase, l'application Test (serveur local) |

## Deux choses en attente côté base

- `20260915000200` (bornage de la mise à l'écart) et `20260915000300` (aperçu
  aligné sur le message envoyé) sont appliquées sur **Test**, pas encore en
  Production : les commandes ont été refusées à la session de l'agent.
- La facture garde le défaut que le devis n'a plus : sa notification est armée
  dès la génération. Correctif à prévoir, avec un geste d'autorisation dans
  l'interface, comme pour le devis.
