# Abonnement Stripe — contrat V1

Migration `20260909000600_abonnement_stripe_v1.sql`.

## Le problème que ce lot ferme

L'essai de quatorze jours existait, la page tarifaire existait, la session de
paiement Stripe existait. Il manquait le retour : rien ne réécrivait
`garages.abonnement_actif`. Un garage pouvait payer et rester à la porte, et
seul un geste manuel dans la console Supabase lui ouvrait l'accès.

Deux obstacles se tenaient devant ce retour, tous deux invisibles depuis la
page tarifaire.

**La session de paiement ne portait aucun garage.** Elle était ouverte depuis
la page publique, par un visiteur qui n'était pas connecté. Un événement
`checkout.session.completed` serait arrivé avec une adresse e-mail et rien
d'autre. Le rattachement se serait fait à la main, ce qui annulait tout
l'intérêt de l'automatiser.

**Le garage pouvait déjà écrire son propre accès.** La policy
`garages_self_update` accordait `UPDATE` sur toute la table, sans `with check`.
Depuis le navigateur, avec la seule clé anonyme :

```js
supabase.from('garages').update({ abonnement_actif: true }).eq('id', monGarage)
```

Brancher Stripe sur une colonne que le client peut écrire lui-même n'aurait
rien prouvé. C'est pourquoi ce lot déplace d'abord le privilège de la table
vers une liste blanche de colonnes.

## Le parcours, désormais

| Où | Qui | Ce qui se passe |
| --- | --- | --- |
| Page tarifaire, visiteur | anonyme | Le bouton mène à l'inscription. L'inscription ouvre l'essai — c'est bien ce que le bouton promet. |
| Page tarifaire, connecté | `authenticated` | `POST /api/abonnement/checkout` avec son jeton. Le garage est **déduit du jeton**, jamais lu dans la requête. |
| Stripe | — | Session avec `client_reference_id` **et** `subscription_data[metadata][garage_id]`. |
| `POST /api/abonnement/webhook` | Stripe, signé | Vérifie la signature, traduit l'événement, écrit avec la clé de service. |
| `/abonnement/merci` | le garage | N'affiche rien d'autre qu'un message. Ne vérifie rien : le navigateur n'est pas une preuve de paiement. |

## Ce que la base garantit maintenant

`authenticated` a `UPDATE` sur dix-neuf colonnes de `garages` — celles de
l'écran Paramètres — et sur aucune autre. Hors de sa portée :

| Colonne | Pourquoi |
| --- | --- |
| `id`, `created_at` | identité de la ligne |
| `owner_user_id` | donner son garage à un autre compte |
| `essai_fin`, `abonnement_actif`, `abonnement_statut`, `abonnement_maj_le` | son propre accès |
| `forfait`, `abonnement_periodicite`, `stripe_customer_id`, `stripe_subscription_id` | ce qu'il paie |
| `dernier_numero_facture` | la numérotation, dont `20260904001000` a fait une donnée immuable |
| `pilote_debut` | l'offre pilote est une décision commerciale |

La liste est **blanche** : une colonne ajoutée demain n'est pas modifiable par
le garage tant que quelqu'un ne l'a pas décidé. C'est l'inverse d'une liste
noire, qu'on oublie de tenir.

`garages_self_update` porte enfin un `with check`. `using` filtre la ligne
visée, `with check` filtre la ligne obtenue ; sans le second, une mise à jour
peut produire une ligne qu'on n'aurait pas eu le droit de viser.

## Le bug que la recette a fait sortir

Une contrainte `CHECK` s'évalue avec les droits de **celui qui écrit**, et
PostgreSQL réévalue toutes les contraintes de la ligne à chaque `UPDATE`, même
portant sur une colonne sans rapport. `garages` et `clients` en portent deux qui
appellent des fonctions :

```sql
check (profil_activite is null or profil_activite_valide(profil_activite))
check (siren is null or siren_valide(siren))
```

Les lots de durcissement (PR #40, PR #50) ont retiré `execute` à `service_role`
sur toutes les fonctions neuves, celles-ci comprises. **Aucune écriture par la
clé de service ne passait donc sur `garages` ni sur `clients`, sur les deux
projets, Production comprise.** Rien ne l'avait révélé parce que rien n'écrivait
encore ces tables côté serveur.

Le message d'erreur, `permission denied for function siren_valide`, ne laisse
pas deviner qu'il s'agit d'une contrainte de table. La migration corrige par une
règle plutôt que par deux lignes : toute fonction appelée par une contrainte de
`public` doit être exécutable par `service_role`, et la vérification le
réaffirme pour celles qui viendront.

## Les quatre pièges du webhook

**Le corps doit rester brut.** La signature porte sur les octets reçus.
`request.json()` les reformate, et aucune signature valide ne passe plus. La
route lit `request.text()`, vérifie, puis analyse.

**Stripe ne livre pas dans l'ordre, et rejoue.** Un « abonnement annulé » du
mois dernier arrivant après un « abonnement actif » d'aujourd'hui refermerait
un compte payant. `abonnement_maj_le` porte la date de l'événement appliqué, et
le filtre est **dans la requête d'écriture**, pas dans une lecture préalable :
deux événements livrés en parallèle ne peuvent pas se doubler.

**Le paiement n'ouvre pas l'accès ; l'abonnement l'ouvre.**
`checkout.session.completed` noue le garage à Stripe et rien de plus. C'est
`customer.subscription.*` qui décide, parce que lui seul porte un statut.

**Une carte refusée ne ferme pas l'atelier.** `past_due` reste ouvert : Stripe
relance environ trois semaines. Couper un garage de ses factures pour une carte
expirée provoquerait exactement l'appel au support qu'on cherche à supprimer.
Quand Stripe renonce, le statut devient `unpaid` ou `canceled`, et là l'accès se
ferme et le forfait est effacé.

## L'essai n'est pas offert deux fois

Un garage qui s'abonne au troisième jour de son essai ne doit ni perdre les onze
jours restants, ni en recevoir quatorze de plus. La session Stripe reçoit donc
`subscription_data[trial_end]` calé sur `garages.essai_fin`, la date qui fait
déjà autorité. Stripe refusant une échéance à moins de quarante-huit heures, un
garage qui s'abonne la veille de la fin est facturé immédiatement — ce qu'il
demande en s'abonnant.

## Variables d'environnement

| Clé | Sans elle |
| --- | --- |
| `STRIPE_SECRET_KEY` | `/api/abonnement/checkout` répond `503`, l'interface bascule sur la demande de démo |
| `STRIPE_WEBHOOK_SECRET` | `/api/abonnement/webhook` répond `503`. **Volontairement pas `200`** : Stripe rejoue l'événement une fois la clé posée, au lieu de le considérer comme traité et de le perdre |
| `SUPABASE_SERVICE_ROLE_KEY` | le webhook ne peut pas écrire |

L'URL à déclarer chez Stripe est `https://<domaine>/api/abonnement/webhook`,
abonnée à `checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`.

## Ce que ce lot ne fait pas

Le forfait est **écrit**, il n'est pas encore **appliqué** : aucun module n'est
masqué selon l'offre payée. C'est un lot à part.

`acces_garage_ouvert()` n'entre toujours pas dans les policies RLS. Le garde
reste côté interface — mais le garage ne peut plus se l'accorder lui-même, ce
qui était la faiblesse réelle. L'application stricte touche `current_garage_id()`
et les quinze policies qui en dépendent, et reste un lot à part.
