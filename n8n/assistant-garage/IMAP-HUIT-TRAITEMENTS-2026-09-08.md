# Les huit traitements IMAP du 8 septembre 2026 — effet établi

Examen fait le 10 septembre sur une **copie en lecture seule** de la base n8n
vivante. Aucune donnée réelle n'a été supprimée, réattribuée ni rejouée.
Aucun corps d'e-mail, aucune adresse et aucun nom ne figurent ici : les
références `msg:`, `exp:`, `dest:`, `gar:` sont des empreintes SHA-256
tronquées, stables d'une ligne à l'autre.

Périmètre : les 8 exécutions de `1 - Assistant Garage Avancé`
(`rw69Oin74O5UwQlc`) déclenchées par `Email Trigger (IMAP)`, le 8 septembre
2026 entre 06 h 33 et 06 h 58 — exécutions **17548, 17573, 17574, 17575,
17576, 17577, 17578, 17581**.

## 1. Huit messages distincts, mais pas huit demandes

| Indice | Constat |
|---|---|
| Empreintes de `Message-ID` | **8 distinctes** → 8 messages, pas 8 reprises du même |
| Expéditeur | **1 seul**, identique aux 8 (`exp:0735af2f`) |
| Sujet | **1 seul**, identique aux 8 (`suj:bccf1ebe`) |
| En-tête `Auto-Submitted` | `auto-replied` sur les 8 |
| En-tête `In-Reply-To` | présent sur les 8 |
| Horodatage | 5 des 8 en 5 secondes (06:56:29 → 06:56:33) |

Ce ne sont pas des demandes de clients : ce sont des **réponses
automatiques** — même expéditeur, même objet, `Auto-Submitted: auto-replied`,
et une référence à un message antérieur — arrivées en rafale.

## 2. Garage attribué, et garage attendu

**Attribué** : les 8 ont reçu le **garage codé en dur**
(`bcd7f692-1c28-435c-87d1-92f84aa0e6bb`), le repli que la v2 supprime.

**Attendu** : *indéterminable*, et c'est là tout le défaut. L'en-tête
`Delivered-To` des 8 messages vaut `dest:cce081bf`, empreinte de la **boîte
partagée historique du fondateur** — la même que le champ `To`. Cette boîte
n'appartient à aucun garage. Aucune donnée du message ne désigne un garage :
- `garages.gmail_adresse` est vide pour tous les garages ;
- `email_connections_avec_app` (connexions Gmail par garage) est vide ;
- l'expéditeur ne dit rien : il peut écrire à n'importe quel garage.

Le comportement correct aurait été de **refuser** ces messages. C'est
exactement ce que fait la v2 : journal `entree_sans_garage`, aucun traitement.

## 3. Données créées ou modifiées : aucune

Chemin parcouru, identique aux 8 (13 nœuds) :

| Nœud | Nature | Table |
|---|---|---|
| Email Trigger (IMAP) | relevé | — |
| Normaliser (Gmail) | code | — |
| Traiter un email à la fois | boucle | — |
| Point d'entrée unifié | code | — |
| **Récupérer les clients du garage** | **LECTURE (getAll)** | `clients` |
| Identifier le client existant | code | — |
| Client déjà connu ? | condition | — |
| Pas de contexte (nouveau client) | code | — |
| Classifier et extraire (IA) | appel HTTP | — |
| Parser la réponse IA | code | — |
| Type = rdv ou devis ? | condition | — |
| Est-ce pertinent pour le garage ? | condition | — |
| **Ignorer (non pertinent)** | fin de branche | — |

**Aucun nœud Supabase `create`, `update` ou `delete` n'a été traversé, sur
aucune des 8 exécutions.** Rien n'a été écrit : ni demande, ni client, ni
rendez-vous, ni ligne de journal. Le classement IA a conclu « non pertinent »
et la branche s'est arrêtée — ce qui est correct pour une réponse automatique.

**Rien à réparer en base.** Il n'y a pas de donnée à réattribuer.

## 4. Messages sortants : aucun

Aucun nœud d'envoi n'a été traversé (`répondre infos manquantes` était coupé,
les notifications internes aussi, relance et avis ne sont pas sur ce chemin).
Zéro e-mail parti, donc zéro résultat d'envoi à examiner.

Une seule transmission est sortie de n8n : l'appel de classification vers
`api.anthropic.com`. Les champs injectés dans cette requête sont
`nom, email, telephone, message, source` — c'est-à-dire **les données du
message entrant lui-même**, celles de son propre expéditeur. La liste des
clients lue à l'étape 5 **n'y figure pas** (vérifié sur la définition du
nœud). Cet appel est le fonctionnement normal de l'Assistant pour tout
message entrant ; il est indépendant du défaut d'attribution.

## 5. Des données ont-elles été accessibles à un autre garage ?

Il faut séparer deux conclusions, de force très différente.

**Défaut certain — attribution fautive.** Les 8 messages ont été rattachés à
un garage qui n'était pas le leur, par un repli codé en dur. Établi sans
ambiguïté, sur les 8.

**Fuite inter-garages — non démontrée, et rien ne la soutient.** Ce qui
serait nécessaire pour parler de fuite, et ce qu'on observe :

| Condition d'une fuite | Observé |
|---|---|
| Des données d'un garage écrites chez un autre | **non** — aucune écriture |
| Des données d'un garage envoyées à un tiers | **non** — aucun envoi |
| Des données d'un garage transmises hors de n8n | **non** — l'appel IA ne porte que le message entrant |
| Des données d'un garage rendues visibles dans l'application à un autre | **non** — rien n'a été écrit, donc rien n'est apparu dans un tableau de bord |

Le seul fait défavorable : **3 lignes de la table `clients` appartenant au
garage codé en dur ont été chargées** dans l'exécution, pour tenter de
reconnaître l'expéditeur. Aucune n'a correspondu (le flux est passé par
« Pas de contexte (nouveau client) »), et elles n'ont ni été écrites, ni
envoyées, ni transmises. C'est une **sur-lecture interne**, pas une
divulgation.

**Conclusion : défaut d'attribution certain, fuite inter-garages non
démontrée — et les quatre conditions qui la caractériseraient sont
négatives.**

## 6. Ce que cet examen apprend pour la v2

La fonction `destinataire()` de la v2 a été confrontée à la forme **réelle**
de ces messages : `Delivered-To` s'y trouve bien (dans `metadata`), et la
fonction le lit. Le mécanisme fonctionne sur cette forme.

Mais il ne prouve **pas** le routage multigarage, et ces 8 messages le
montrent : `Delivered-To` vaut ici la **boîte partagée**, pas une adresse de
garage. Le mécanisme n'est valable que si **chaque garage a sa propre boîte,
relevée directement**. Si une boîte unique recevait des **transferts**
d'adresses par garage, `Delivered-To` porterait la boîte d'arrivée et non
l'adresse d'origine — cas non testé, et non testable sans une vraie chaîne de
transfert.

**L'entrée IMAP reste donc désactivée, et cette preuve est marquée manquante.**
