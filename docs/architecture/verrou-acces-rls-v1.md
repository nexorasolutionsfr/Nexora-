# Le verrou d'accès en base — V1

Migration `20260909000900_verrou_acces_rls_v1.sql`.

## Ce qui existait

`acces_garage_ouvert()` était écrite, testée, et utilisée par **zéro policy**.
Le garde vivait uniquement dans `NexoraDashboard.jsx` — dont le commentaire
affirmait pourtant « l'autorité reste la base ». Elle ne l'était pas : un essai
échu n'empêchait aucune lecture ni aucune écriture par l'API.

## Le piège de l'inventaire

Fermer `current_garage_id()` semblait suffire. **L'inventaire a montré que ça
n'aurait couvert que la moitié des tables.**

| Famille | Policies | Tables |
| --- | --- | --- |
| via `current_garage_id()` | 15 | clients, vehicules, rendez_vous, devis, factures, prestations, mecaniciens, demandes, propositions_rdv, actions_ia, liste_attente, notifications_atelier |
| **sous-requête en clair** | **20** | **inspections\*, ordres_reparation\*, devis_lignes, travaux_differes\*, revenue_recovery_\*, opportunites_actions, rappels_manques, erreurs_automatisation** |

Ne traiter que la première aurait laissé **les ordres de réparation et les
contrôles véhicule entièrement ouverts** — le cœur du produit.

Les 20 policies de la seconde famille portaient toutes **exactement la même**
expression, ce qui a rendu la réécriture mécanisable :

```sql
garage_id IN (SELECT garages.id FROM garages WHERE garages.owner_user_id = auth.uid())
```

La réécriture est chirurgicale : une expression régulière ne remplace que la
sous-requête, laissant intact tout ce qui l'entoure. Une policy portant une
condition supplémentaire la conserve.

## La porte unique

```sql
create function public.mes_garages_ouverts() returns setof uuid ...
  select g.id from public.garages g
  where g.owner_user_id = auth.uid()
    and public.acces_garage_ouvert(g.id)
```

Elle **appelle** la règle d'accès au lieu de la recopier. Deux définitions de
« l'accès est ouvert » finiraient par diverger, et le jour où elles divergent,
l'une laisse passer ce que l'autre refuse.

`current_garage_id()` en devient un simple `select * from
mes_garages_ouverts() limit 1`, ce qui ferme la première famille sans toucher à
ses 15 policies.

## Le piège rencontré : `anon` doit pouvoir appeler ces fonctions

**22 policies du schéma s'appliquent au rôle `public`**, donc à `anon`. Une
requête anonyme sur ces tables évalue la policy, donc appelle la fonction.

La première version de cette migration révoquait `anon`. Résultat, vérifié sur
Test :

```
anon → clients     : ERREUR 401 · permission denied for function current_garage_id
anon → rendez_vous : ERREUR 401 · permission denied for function current_garage_id
```

Une **erreur bruyante** là où le comportement correct est « tu ne vois rien ».
Le droit est donc accordé, et il ne fuit rien : la fonction filtre sur
`owner_user_id = auth.uid()`, qui vaut `NULL` pour un visiteur anonyme.

La vérification finale l'exige désormais explicitement, pour que personne ne
refasse l'erreur.

## Ce qui reste ouvert, et pourquoi

**`garages`** — le garage lit toujours sa propre ligne. Sans ça, l'écran
« votre accès est terminé » ne saurait pas quoi afficher et la route de
paiement ne pourrait plus le retrouver pour le réabonner. **Fermer cette table
enfermerait le garage dehors sans porte.** La vérification refuse la migration
si cette policy devenait conditionnée à l'accès.

**Les liens publics** (devis, facture, atelier, contrôle par jeton) sont des
fonctions `SECURITY DEFINER` qui ne passent par aucune de ces policies. Un
client qui a reçu un devis ne doit pas être puni parce que l'essai de son
garagiste a expiré : il n'y est pour rien.

**`service_role`** porte `rolbypassrls` — il ne traverse jamais ces policies.
Les traitements serveur et le webhook Stripe continuent d'écrire, ce qui est
indispensable : c'est le webhook qui **rouvre** l'accès quand le garage paie.

## Recette jouée contre Test

Garage créé par la vraie RPC d'inscription, client posé à la clé de service.

| État | clients lus | écriture | sa ligne `garages` |
| --- | --- | --- | --- |
| Essai en cours | 1 | acceptée | 1 |
| **Essai échu** | **0** | **refusée (403)** | **1** |
| Passé en abonnement | 2 | acceptée | 1 |

**Les données ne sont pas perdues, seulement masquées** : elles reviennent
intactes dès que l'accès rouvre. Un verrou à sens unique serait pire que pas de
verrou.

Le chemin anonyme rend `0 ligne, pas d'erreur` sur `clients`, `rendez_vous`,
`prestations` et `inspections`. `ordres_reparation` rend `401` — mais parce
qu'`anon` n'a **aucun droit sur la table**, ce qui est antérieur à cette
migration et plus fort que RLS.

## Idempotence

Le bloc de réécriture ne lève pas d'exception s'il ne trouve rien à réécrire :
c'est le cas normal d'une migration rejouée. C'est la vérification finale qui
juge du résultat — zéro contournement restant, et au moins une policy passant
par la porte.
