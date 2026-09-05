# Pourquoi ce garage a accès — V1

Migration `20260909000700_acces_motif_v1.sql`.

## Ce qui manquait

Trois états commerciaux existent. La base n'en connaissait que deux.

| État | Avant | |
| --- | --- | --- |
| Essai 14 jours | `essai_fin`, posé par `creer_mon_garage` | fonctionnait |
| Abonnement payé | `abonnement_actif`, écrit par le webhook Stripe | fonctionnait |
| **Mois offert (pilote)** | **rien** | `pilote_debut` existait mais : 0 garage renseigné, 0 fonction le lisait, 0 policy l'utilisait |

Et un **quatrième état existait sans avoir été décidé** : `essai_fin` à `NULL`
vaut accès sans limite. Les garages créés avant `20260909000300` sont dans cet
état — gratuits à vie, sans que rien ne le dise.

On remplace « déduire l'accès de deux colonnes et d'un NULL » par « lire le
motif ». `acces_motif` dit **pourquoi**, `acces_fin` dit **jusqu'à quand**.

## Fermé par défaut

Un garage sans motif n'a pas accès. Sur un contrôle d'accès, l'oubli doit
fermer, jamais ouvrir. Le bloc de vérification s'assure qu'**aucun garage
existant ne se retrouve fermé** par le changement : un contrôle qui ferme trop
est aussi grave qu'un contrôle qui ouvre trop.

Deux contraintes tiennent la cohérence : un motif inconnu est refusé, et un
accès à durée doit porter sa date quand un accès sans limite ne doit pas en
porter — sinon « illimite » avec une date passée devient indéchiffrable six
mois plus tard.

## Le point délicat : l'ordre de déploiement

Une migration fusionnée est appliquée en Production **immédiatement**, alors
que le nouveau code de l'interface arrive quelques minutes plus tard avec le
déploiement Vercel. Pendant cette fenêtre, **l'ancienne interface tourne contre
la nouvelle base**.

`essai_fin` n'est donc **ni supprimée ni renommée**. Elle est conservée et tenue
à jour par un trigger, pour que l'interface encore déployée continue de
fonctionner :

| `acces_motif` | `essai_fin` reçoit | ce que lit l'ancienne interface |
| --- | --- | --- |
| `essai` / `pilote` | la date de fin | un essai en cours |
| `illimite` | `NULL` | accès sans limite |
| `abonnement` | `NULL` | `abonnement_actif` suffit à ouvrir |

Elle deviendra supprimable quand plus rien ne la lira. C'est un lot à part, et
il ne se fait pas le même jour.

## Le mois offert

`accorder_acces_pilote(garage, mois)` est **fermée à `authenticated` et à
`anon`, réservée à `service_role`**. C'est exactement la leçon de
`20260909000600` : une faveur commerciale que le bénéficiaire peut s'accorder
lui-même n'est pas une faveur, c'est une porte ouverte.

Elle **part de la fin d'accès en cours quand elle est future** : un garage à qui
il reste huit jours d'essai ne les perd pas en recevant son mois — il obtient
trente-huit jours, pas trente. Et elle renseigne enfin `pilote_debut`, qui
attendait depuis longtemps d'avoir un sens.

## Ce que l'interface dit maintenant

Le bandeau et l'écran de fin lisent le motif. Annoncer « il vous reste 30 jours
**d'essai** » à un garage à qui on a offert un mois efface le geste commercial ;
lui dire « sur votre **mois offert** » le lui rappelle chaque jour.

Le fragment porte sa préposition — « 5 jours **d'essai** », « 5 jours **sur votre
mois offert** » — parce que « 5 jours de mois offert » ne se dit pas.

## Ce que le webhook Stripe écrit

À l'ouverture d'un abonnement : `acces_motif = 'abonnement'`, `acces_fin = null`.
**À la fermeture, il n'y touche pas.** Un abonnement résilié laisse
`acces_motif = 'abonnement'` avec `abonnement_actif = false`, ce qui se lit
encore six mois plus tard : « il a été abonné, il ne l'est plus ». Écraser le
motif effacerait cette histoire.

## Recette jouée contre Test

| Cas | Résultat |
| --- | --- |
| Création en essai | `acces_fin` à J+8, `essai_fin` miroir à la même date, ouvert |
| Mois offert par-dessus 8 jours restants | **38 jours**, motif `pilote`, `pilote_debut` tracé |
| Essai échu | **fermé** |
| Abonnement actif | ouvert, `essai_fin` à `NULL` |
| `authenticated` appelle `accorder_acces_pilote(12 mois)` | `permission denied for function` |
| `authenticated` se met en `illimite` | `permission denied for table garages` |
| `anon` s'offre un mois | `permission denied for function` |

## Ce que ce lot ne fait pas

`acces_garage_ouvert()` **n'entre toujours pas dans les policies RLS** : le
garde reste côté interface. Mais le garage ne peut plus s'accorder son propre
accès, ce qui était la faiblesse réelle. L'application stricte touche
`current_garage_id()` et ses quinze policies, et reste un lot à part.

Le **forfait n'est toujours pas appliqué** : aucun module n'est masqué selon
l'offre. Il ne le sera pas tant que `STRIPE_SECRET_KEY` et
`STRIPE_WEBHOOK_SECRET` manqueront dans Vercel — `forfait` est `NULL` pour les
quatre garages de Production, et verrouiller sur un forfait nul les fermerait
tous.
