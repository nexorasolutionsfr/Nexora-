# Proposition — réduire le sondage n8n sans perdre d'envoi

15 septembre 2026. **Proposition pour décision, rien n'est changé.** Pas de
bascule d'architecture pendant cette campagne.

## Constat mesuré

| Mesure | Valeur | Source |
|---|---|---|
| Workflows de socle actifs | 4, chacun `*/2` | instance vive, lecture |
| Exécutions socle par jour | ≈ 2 600 (1 863 à 2 864 selon les jours) | copie SQLite n8n |
| Envois réels en 7 jours (Production) | **3** | files Production |
| Erreurs en 7 jours | 16, toutes réseau (Mac), au nœud « Réserver la file » | copie SQLite, messages décodés |
| Garages en Production | 1 | Production |

Rapport : ≈ 6 000 sondages vides pour un envoi. Le coût n'est pas monétaire
(n8n auto-hébergé, Supabase gratuit à ce volume) : il est **opérationnel** —
bruit dans l'historique (10 214 exécutions conservées en 4 jours), sollicitations
réseau d'un Mac, erreurs non journalisées noyées dans les succès.

## Ce qui ne doit pas changer

La base garde les files et les états ; n8n réserve ce qui est autorisé et
transporte. Toute proposition doit conserver : réservation atomique
(`SKIP LOCKED`), `envoi_en_cours` jamais recyclé, reprise bornée des échecs
certains, et **rattrapage** de ce qui a été autorisé pendant une coupure.

## Options

| Option | Principe | Rattrapage | Risque | Effort |
|---|---|---|---|---|
| **A. Espacer le sondage** (`*/2` → `*/5`, ou `*/10` la nuit) | même workflow, cron plus lent | intact : la file est relue au passage suivant | délai d'envoi jusqu'à 5 min | faible (modifier 4 crons dans l'instance vive) |
| **B. Un seul workflow de réservation** pour les 4 files | un cron, une requête qui dit s'il y a quelque chose à faire, puis appel des sous-workflows | intact | refonte de 4 workflows vifs, recette complète | moyen |
| **C. Réveil par événement + relève lente** | webhook de base Supabase à l'autorisation, **plus** relève `*/15` pour ce qui a été manqué | assuré par la relève | tunnel public vers le Mac (non souhaitable) ; dépend de l'hébergement | élevé ; **non testé** |
| **D. Garde « rien à faire » en tête** | une requête légère (`count` des lignes `en_attente` réservables) avant le reste ; sortie immédiate si 0 | intact | ne réduit pas le nombre d'exécutions, seulement leur coût | faible |

## Recommandation

1. **Maintenant, sans risque** : A (`*/5`) — divise par 2,5 les exécutions,
   délai acceptable pour un devis ou une facture. **Et** rattacher le workflow
   de journalisation des erreurs (voir l'inventaire) : aujourd'hui les
   coupures ne se voient qu'en lisant la base n8n.
2. **À l'hébergement permanent** : C, avec la relève lente comme filet. Le
   réveil par événement n'a de sens que sur un hôte joignable ; sur le Mac il
   ajouterait un tunnel sans garantie.
3. Mesurer avant/après sur une fenêtre connue (7 jours) : exécutions, délai
   autorisation → envoi, erreurs.

Décision attendue de Baptiste : appliquer A et la journalisation des erreurs
dans l'instance vive (hors de cette campagne, qui s'interdit de la modifier).
