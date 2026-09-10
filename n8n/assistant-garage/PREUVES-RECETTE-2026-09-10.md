# Preuves de recette conservées hors de n8n (10 septembre 2026)

Extrait de la base n8n vivante (copie, lecture seule), **sans aucun secret**.

Raison d'être : les huit exécutions qui prouvent la v2 sont réparties sur
**deux** workflows de recette, et l'un des deux doit être supprimé. Quatre
preuves n'existent que là. Ce fichier les met à l'abri **avant** la suppression.

| Workflow | Nœuds | Exécutions | Sort |
|---|---|---|---|
| `eX5THd6tZIYBas8n` | 361 | 18713–18726 | **à supprimer** (import raté) |
| `PICszikUjJIpowgJ` | 121 | 18776–18799 | à conserver |

Les deux portent le même nom — c'est ce qui les rend faciles à confondre.
`eX5THd6tZIYBas8n` n'était pas raté dès l'origine : il a servi de recette
valablement de 23 h 39 à 23 h 42, puis un second « Import from File » y a
**ajouté** les nœuds au lieu de les remplacer (121 → 361 nœuds à 00 h 00).
Le workflow propre a alors été recréé à 00 h 02.

## Ce que chaque exécution prouve


==============================================================================
recette 1 (workflow devenu l'import raté à 361 nœuds)
  workflow eX5THd6tZIYBas8n
==============================================================================

-- exécution 18713 | 2026-09-09 23:39:04 | success | webhook
     envoi « répondre infos manquantes » présent | adresses vues : baptiste.papoul52+socle-alpha@gmail.com, baptiste.papoul52+socle-clientalpha@gmail.com, nexorasolutions.france@gmail.com
     journal entree_sans_garage

-- exécution 18714 | 2026-09-09 23:39:29 | success | webhook
     journal entree_sans_garage

-- exécution 18715 | 2026-09-09 23:39:54 | success | webhook

-- exécution 18720 | 2026-09-09 23:40:20 | success | webhook
     envoi « notifier le garage aucun créneau » présent | adresses vues : baptiste.papoul52+socle-beta@gmail.com, baptiste.papoul52+socle-clientbeta@gmail.com, nexorasolutions.france@gmail.com
     journal entree_sans_garage

-- exécution 18725 | 2026-09-09 23:42:19 | success | webhook
     envoi « Notifier le garage traitement manuel » présent | adresses vues : baptiste.papoul52+socle-beta@gmail.com, baptiste.papoul52+socle-clientbeta@gmail.com, nexorasolutions.france@gmail.com
     journal entree_sans_garage

-- exécution 18726 | 2026-09-09 23:42:48 | error | webhook
     erreur : 18

==============================================================================
recette 2 (workflow de recette propre)
  workflow PICszikUjJIpowgJ
==============================================================================

-- exécution 18776 | 2026-09-10 00:06:35 | success | webhook
     envoi « répondre infos manquantes » présent | adresses vues : baptiste.papoul52+socle-alpha@gmail.com, baptiste.papoul52+socle-clientalpha@gmail.com, nexorasolutions.france@gmail.com

-- exécution 18777 | 2026-09-10 00:07:05 | success | webhook
     journal reponse_non_envoyee

-- exécution 18790 | 2026-09-10 00:12:16 | success | manual
     envoi « relance » présent | adresses vues : baptiste.papoul52+socle-alpha@gmail.com, baptiste.papoul52+socle-beta@gmail.com, baptiste.papoul52+socle-clientalpha@gmail.com, baptiste.papoul52+socle-clientbeta@gmail.com, nexorasolutions.france@gmail.com
     envoi « avis google » présent | adresses vues : baptiste.papoul52+socle-alpha@gmail.com, baptiste.papoul52+socle-beta@gmail.com, baptiste.papoul52+socle-clientalpha@gmail.com, baptiste.papoul52+socle-clientbeta@gmail.com, nexorasolutions.france@gmail.com
     journal avis_non_envoye
     journal relance_non_envoyee

-- exécution 18799 | 2026-09-10 00:16:32 | success | manual
     journal avis_non_envoye
     journal relance_non_envoyee

## Les quatre preuves qui n'existent QUE dans le workflow à supprimer

- **18714** — entrée sans `garage_id` : journal `entree_sans_garage`, aucun traitement.
- **18720** — « aucun créneau » : notification reçue à l'adresse du **garage
  concerné** (`+socle-beta`), pas à une boîte fixe.
- **18725** — « traitement manuel » : idem, `+socle-beta`.
- **18713** — réponse « infos manquantes » vers `+socle-clientalpha` (rejouée
  ensuite en 18776 sur le workflow propre : celle-ci est doublée).

Trois parcours sur quatre ne sont donc **pas** rejoués ailleurs. Deux options,
au choix :

1. **Rejouer** ces trois parcours sur `PICszikUjJIpowgJ` après y avoir
   réimporté `recette-test.json` (nécessaire de toute façon : le fichier compte
   désormais 124 nœuds, avec la résolution du garage par destinataire), puis
   supprimer `eX5THd6tZIYBas8n`.
2. **S'en tenir à ce fichier** comme trace, et supprimer directement.

L'option 1 est préférable : elle re-prouve les parcours sur la version qui sera
publiée, pas sur une version antérieure.
