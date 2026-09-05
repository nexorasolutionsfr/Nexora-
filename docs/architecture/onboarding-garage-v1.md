# Onboarding garage V1 — contrat

Branche `feature/onboarding-garage-v1`, créée depuis `origin/main` (6a67eda).
Rien n'a été appliqué sur Test ni sur Production.

Premier lot du chantier « mise en service sans intervention de l'éditeur ».

---

## A. Le problème

`components/NexoraDashboard.jsx` résolvait le garage de l'utilisateur ainsi :

```js
supabase.from("garages").select("id").eq("owner_user_id", session.user.id).maybeSingle()
  .then(({ data, error }) => {
    if (error || !data) {
      setGarageError("Aucun garage n'est associe a ce compte. Contactez le support Nexora.");
```

Deux situations distinctes tombaient dans la même branche : une panne de
lecture, et un compte neuf qui n'a simplement pas encore de garage. La seconde
n'est pas une erreur — c'est le premier accès. En l'absence de tout chemin de
création, la ligne `garages` devait être insérée à la main par l'éditeur pour
chaque nouveau client.

C'est le point unique qui empêchait toute mise en service autonome. Tant qu'il
tient, aucun autre travail sur l'inscription, l'import ou les connecteurs ne
change quoi que ce soit au temps passé par personne.

## B. Ce que ce lot livre

| Objet | Nature | Fichier |
| --- | --- | --- |
| `public.profil_activite_valide(text[])` | fonction, règle unique | migration |
| `public.garages.profil_activite` | colonne nullable + CHECK | migration |
| `public.creer_mon_garage(...)` | RPC de création | migration |
| `OnboardingGarage` | écran de mise en service | `components/onboarding/` |
| `PROFILS_ACTIVITE` | vocabulaire côté interface | `components/onboarding/` |

## C. Modèle de données

Une seule colonne ajoutée, sur une table existante, **nullable**.

`garages.profil_activite text[]` — les activités réellement exercées, choisies
à la mise en service. Contrainte `garages_profil_activite_valide` :
`profil_activite is null or public.profil_activite_valide(profil_activite)`.

`NULL` se lit « profil non renseigné », et c'est l'état de tous les garages
antérieurs à ce lot. Leur imposer un profil rétroactivement serait inventer une
donnée métier. Côté interface, `NULL` fait afficher tous les modules,
c'est-à-dire exactement le comportement actuel — le lot n'enlève rien à
personne.

Le vocabulaire compte neuf valeurs, reprises des activités réellement
constatées sur les garages indépendants qualifiés en septembre 2026 :
`mecanique`, `carrosserie`, `diagnostic_electronique`, `pneus`, `vente_vo`,
`depannage`, `vehicules_anciens`, `poids_lourds_agricole`,
`voitures_sans_permis`.

**Le profil n'ouvre ni ne ferme aucun droit.** Il sert à choisir les modules
affichés et le vocabulaire des écrans, rien d'autre. Ce n'est pas un mécanisme
de sécurité et il ne doit jamais en devenir un : un garage qui modifierait son
profil ne doit gagner aucun accès.

## D. La RPC et ses gardes

`creer_mon_garage(p_nom_garage, p_adresse, p_telephone, p_email, p_profil_activite)`
renvoie l'`uuid` du garage créé.

`security definer` est nécessaire et assumé : l'insertion doit être possible
pour un utilisateur qui, par construction, n'est propriétaire d'aucun garage —
donc qu'aucune policy RLS fondée sur l'appartenance ne peut autoriser.

Le contournement de RLS est encadré par trois gardes :

1. `auth.uid()` doit exister, sinon `28000`.
2. `owner_user_id` vaut **toujours** `auth.uid()`, jamais un paramètre.
3. Un compte possédant déjà un garage est refusé, `23505`.

C'est la différence de fond avec la faille fermée le 2026-09-01 sur le
rattachement Gmail : là, l'identité du garage venait d'un paramètre non signé
fourni par l'appelant. Ici elle vient de la session, et d'elle seule.

Privilèges : `authenticated` uniquement. `PUBLIC`, `anon` et `service_role`
sont explicitement fermés. `service_role` n'a aucun usage de cette fonction —
n8n ne crée pas de garages, et lui laisser ce droit reviendrait à rouvrir un
chemin de création qui ne serait plus lié à une session.

### Un compte = un garage

Le verrou est porté par la RPC, pas par une contrainte d'unicité sur
`owner_user_id`. Ce choix est délibéré : ajouter un index unique serait
modifier une table existante au-delà de l'additif, et le comportement des
garages déjà en base n'a pas été audité sur ce point. La RPC étant le seul
chemin de création ouvert aux comptes clients, le verrou y est effectif.

À revoir si un garage doit un jour appartenir à plusieurs comptes : c'est le
chantier « accès salariés », qui a son propre modèle et ne passe pas par ici.

## E. Le garde-fou central de la migration

`public.garages` **n'est décrite par aucune migration de ce dépôt**. Les 44
migrations versionnées couvrent les inspections, les OR, les devis-lignes, les
jetons — jamais le socle. `garages`, `clients`, `vehicules`, `rendez_vous`,
`devis`, `factures` et `prestations` n'existent que dans les projets Supabase
en ligne.

Conséquence directe pour ce lot : on ne peut pas prouver par lecture du code
que les six colonnes écrites par la RPC suffisent. Si `garages` porte une autre
colonne `NOT NULL` sans valeur par défaut, la fonction compilerait sans erreur
et échouerait au premier appel réel — devant un client, à la seconde même où il
découvre le produit.

La migration vérifie donc cette hypothèse **contre la base réelle**, dans sa
propre transaction, et échoue en nommant les colonnes fautives plutôt que de
laisser passer une bombe à retardement. C'est le bloc 4.3.

Cette dépendance disparaîtra avec le lot 2 (versionnement du socle par
rétro-ingénierie du schéma réel), qui devient de ce fait le prérequis de tout
travail structurel ultérieur.

## F. Parcours

**Étape 1 — identité.** Nom du garage (obligatoire), adresse, téléphone,
e-mail de contact (facultatifs). Les champs facultatifs vides sont stockés
`NULL`, jamais `""` : une chaîne vide se propage ensuite dans les écrans et les
messages comme si elle était une valeur.

**Étape 2 — activités.** Sélection multiple, au moins une.

Puis le tableau de bord s'ouvre. Rien d'autre n'est demandé : horaires,
prestations, logo et notifications se règlent dans Paramètres, sur un outil
déjà ouvert. Un garage doit pouvoir entrer et voir son produit avant qu'on lui
demande de le configurer.

## G. Correctif de sécurité inclus

`DEFAULT_GARAGE_ID = "bcd7f692-1c28-435c-87d1-92f84aa0e6bb"` servait de valeur
initiale à l'état `garageId`. Cet UUID désigne un garage réel. Le rendu du
tableau de bord était bien conditionné à `garageReady`, donc rien ne fuitait —
mais un repli en dur vers le garage d'autrui n'attend qu'un rendu prématuré ou
un remaniement pour devenir une fuite entre clients. L'état initial vaut
désormais `null`.

Ce correctif entre dans ce lot parce qu'il porte sur les lignes mêmes que la
mise en service modifie, et parce qu'un compte neuf est exactement le cas où
`garageId` reste à sa valeur initiale le plus longtemps.

## H. Cas limites couverts par le banc de test

`supabase/tests/onboarding_garage_v1.sql`, même convention que les bancs
précédents : transactionnel, autonome, réversible, preuve d'absence de résidu
après `rollback`. Marqueur `RECETTE ONBOARDING V1`.

| Cas | Attendu |
| --- | --- |
| Compte neuf, entrées valides | garage créé, `owner_user_id = auth.uid()` |
| Espaces de bordure, e-mail vide | valeurs détourées, e-mail `NULL` |
| Compte possédant déjà un garage | `23505`, aucun second garage |
| Nom vide | `22023` |
| Profil hors vocabulaire, vide, `NULL` | `22023` |
| Aucun garage laissé après un refus | 0 ligne |
| Appel `anon` | `42501` |
| `authenticated` sans session | `28000` — prouve que la garde ne repose pas sur les seuls `GRANT` |
| `UPDATE` direct hors vocabulaire | `23514` sur la contrainte de table |
| `profil_activite = NULL` | accepté |

Le cas « `authenticated` sans session » est le plus important des dix : il
prouve que la fonction se défend elle-même, et pas seulement par le système de
privilèges.

## I. Rollback

Trois objets neufs et une colonne neuve, sans dépendance ni donnée reprise :

```sql
drop function public.creer_mon_garage(text, text, text, text, text[]);
alter table public.garages drop constraint garages_profil_activite_valide;
alter table public.garages drop column profil_activite;
drop function public.profil_activite_valide(text[]);
```

Côté interface, le retour en arrière est le revert du commit : l'écran de mise
en service disparaît et le message « Contactez le support Nexora » revient.

## J. Procédure sûre vers Test

Rien de ce qui suit n'a été fait, et rien ne doit l'être sans accord explicite.

1. Appliquer `20260905000100_onboarding_garage_v1.sql` **sur Test seulement**.
   Si le bloc 4.3 fait échouer la migration, il nomme les colonnes manquantes :
   les ajouter à l'insertion de la RPC, puis recommencer. Cet échec est le
   résultat utile de la migration, pas un incident.
2. Exécuter `supabase/tests/onboarding_garage_v1.sql` sur Test. Les dix cas
   doivent passer et le bloc 8 ne rien signaler.
3. Créer un compte de recette sur Test, sans garage, et dérouler l'écran.
4. Vérifier qu'un garage existant, `profil_activite` à `NULL`, ouvre son
   tableau de bord exactement comme avant.
5. Production seulement ensuite, et sur décision séparée.

## K. Ce que ce lot ne fait pas

- Il ne crée pas de compte : `supabase.auth.signUp` n'est pas ouvert, une
  inscription libre est une décision commerciale et non technique.
- Il ne modifie aucun écran du tableau de bord en fonction du profil : c'est le
  lot 4, qui a besoin du découpage du monolithe.
- Il n'importe aucune donnée : lot 3.
- Il ne touche à aucun connecteur : lot 5.
