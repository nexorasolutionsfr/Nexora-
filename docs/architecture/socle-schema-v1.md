# Socle de schéma V1 — versionner ce qui n'existait qu'en ligne

Branche `chore/socle-schema-v1`, créée depuis `origin/main` (6a67eda).
Aucune écriture n'a été faite sur Test ni sur Production : tout ce qui suit
provient d'une lecture du catalogue Postgres, le 2026-09-05.

Deuxième lot du chantier « mise en service sans intervention de l'éditeur ».

---

## A. Le problème

Les migrations versionnées du dépôt couvrent les inspections, les ordres de
réparation, les devis-lignes, les jetons de liens publics, la reprise de
chiffre d'affaires. Elles ne décrivent **à aucun moment** les tables sur
lesquelles tout cela repose : `garages`, `clients`, `vehicules`, `rendez_vous`,
`devis`, `factures`, `prestations`, `demandes`, `mecaniciens`,
`horaires_garage`, `garages_secrets` et une trentaine d'autres.

Ces tables n'existaient que dans les deux projets Supabase en ligne. Trois
conséquences, toutes vérifiées pendant ce lot :

1. **On ne pouvait pas prouver que Test et Production sont comparables.** Le
   lot 1 a dû embarquer un garde-fou qui interroge la base réelle faute de
   pouvoir lire le schéma dans le dépôt.
2. **On ne pouvait pas créer un environnement neuf.** Ni recette, ni bac à
   sable, ni reprise après sinistre. C'est directement contradictoire avec
   l'objectif « un garage se met en service tout seul ».
3. **Une divergence pouvait s'installer sans que rien ne la signale.** C'est
   arrivé : voir la section D.

## B. Ce que ce lot livre

`supabase/socle/`, sept fichiers exécutables dans l'ordre, plus un prélude :

| Fichier | Contenu | Volume |
| --- | --- | --- |
| `0-prelude-verification.sql` | environnement Supabase minimal, pour vérifier hors ligne | — |
| `1-tables.sql` | 43 tables, 414 colonnes | 542 l. |
| `2-contraintes.sql` | 188 contraintes (clés, unicité, CHECK, clés étrangères) | 376 l. |
| `3-index.sql` | 87 index, dont 34 non portés par une contrainte | 34 l. |
| `4-fonctions.sql` | 71 fonctions `sql` et `plpgsql` | 1 972 l. |
| `5-triggers.sql` | 33 déclencheurs | 33 l. |
| `6-rls-policies.sql` | RLS sur les 43 tables, 45 policies | 416 l. |
| `7-privileges.sql` | 540 privilèges de table et de fonction | 236 l. |

`scripts/generer-socle.py` et `scripts/socle-requetes/` régénèrent l'ensemble.
**Les fichiers de `supabase/socle/` ne se modifient pas à la main : on les
régénère.**

Référence retenue : **la Production**. C'est l'état d'un environnement qui
tourne réellement. Test porte en plus des chantiers non fusionnés (section D).

## C. Ce n'est pas une migration

Aucun fichier de `supabase/socle/` ne doit être exécuté sur Test ni sur
Production : ces bases portent déjà ces objets. Les `if not exists` rendent la
chose inoffensive, mais ce n'est pas une raison de le faire.

Le socle sert à trois choses :

- **provisionner un environnement neuf** — c'est son usage principal, et le
  prérequis du reste du chantier ;
- **servir de référence écrite** au schéma, relisible sans accès à Supabase ;
- **détecter les divergences** : régénérer et comparer au fichier versionné
  fait apparaître toute dérive.

### Comment il a été vérifié

Le socle n'est pas seulement écrit, il est **prouvé**. PostgreSQL 17 local,
base vide, prélude, puis les sept fichiers dans l'ordre. Aucune erreur. Puis le
catalogue de la base reconstruite a été comparé, objet par objet, à celui de la
Production :

| Objet | Production | Reconstruit | Écarts |
| --- | --- | --- | --- |
| Colonnes | 414 | 414 | 0 |
| Contraintes | 188 | 188 | 0 |
| Index | 87 | 87 | 0 |
| Fonctions (corps compris) | 71 | 71 | 0 |
| Déclencheurs | 33 | 33 | 0 |
| Policies (rôles, `using`, `with check`) | 45 | 45 | 0 |
| Privilèges | 540 | 540 | 0 |

Cette vérification a trouvé un vrai défaut, corrigé depuis : la première
version du générateur perdait la clause `identity` de
`revenue_recovery_permissions.numero_sequence`, ce qui l'aurait transformée en
`bigint` obligatoire sans séquence. La colonne serait devenue impossible à
alimenter sans fournir la valeur à la main. C'est exactement le genre de perte
silencieuse qu'un socle non exécuté laisse passer.

Les privilèges méritent d'être dans le socle et pas seulement les policies :
plusieurs lots de sécurité de ce projet ne consistent qu'en `REVOKE`. Un socle
qui reconstruirait les tables sans les droits produirait un environnement
**ouvert par défaut**, soit l'inverse de l'état voulu. `7-privileges.sql`
commence donc par tout fermer avant de n'accorder que le relevé.

## D. Divergence Test ↔ Production, relevée et non corrigée

**Test est en avance sur Production de quinze migrations**, dont aucune n'est
fusionnée dans `main`. Elles sont donc invisibles depuis le dépôt.

| Version | Nom enregistré | Chantier |
| --- | --- | --- |
| `20260905000100` → `000800` | `acces_salaries_*` | accès salariés |
| `20260905001000` | `import_pilote_clients_vehicules` | import pilote |
| `20260906000100` | `versionner_rls_auto_enable` | sécurité |
| `20260906000200` | `stripe_search_path_et_droits` | sécurité |
| `20260906000300` | `garages_secrets_truncate` | sécurité |
| `20260907000100` | `creer_jeton_confirmation_confiner` | sécurité |
| `20260908000100` | `revoquer_service_role_trois_fonctions` | sécurité |

Ce que cela produit concrètement :

- **3 tables sur Test seulement** : `garage_membres`,
  `garage_membres_historique`, `ordres_reparation_notes`.
- **16 fonctions sur Test seulement**, dont `a_acces_garage`,
  `importer_clients_vehicules`, et les six RPC de gestion des membres.
- **24 policies supplémentaires** sur des tables communes, toutes de la forme
  `a_acces_garage(garage_id, 'accueil')` — le modèle d'accès par rôle.
- **9 fonctions communes au corps différent.** Deux familles :
  - `current_garage_id`, `creer_jeton_atelier` / `_devis` / `_inspection` et
    leurs `revoquer_*` : étendues sur Test pour reconnaître un membre du garage
    et pas seulement son propriétaire ;
  - `set_stripe_secret_key` et `stripe_configure_pour_mon_garage` : durcies sur
    Test avec `search_path = ''` et objets qualifiés. **La Production est
    encore sur l'ancienne version, avec `search_path = 'public'`.**

**Aucun objet n'existe en Production sans exister sur Test.** La dérive est
donc à sens unique, ce qui est le sens le moins dangereux : Test est un
sur-ensemble.

Rien de tout cela n'est corrigé ici. Ce lot **constate et écrit**. Deux
décisions en découlent, à prendre séparément :

1. **Les lots de sécurité `20260906000200` à `20260908000100` sont appliqués
   sur Test et pas en Production.** Leurs branches existent
   (`security/anon-execute-stripe-v1`, `security/creer-jeton-confirmation-v1`)
   et ne sont pas fusionnées. La Production reste donc sur les versions non
   durcies. C'est le point le plus important de ce document.
2. **Le chantier accès salariés est appliqué sur Test sans être dans `main`.**
   Tant que c'est le cas, tout socle régénéré depuis Test contiendrait un
   modèle d'accès que le dépôt ne décrit pas.

## E. Ce que le socle ne couvre pas

Honnêtement délimité, pour que personne ne le croie complet :

- **Les schémas `auth`, `storage`, `extensions`, `realtime`, `cron`** — gérés
  par Supabase, hors de notre responsabilité. `0-prelude-verification.sql` n'en
  reconstitue qu'un ersatz, suffisant pour vérifier `public` hors ligne, et
  **pas destiné à un vrai environnement**.
- **Les tâches planifiées `pg_cron`**, dont celle qui déclenche
  `preparer_rappels_confirmation` toutes les dix minutes en Production.
- **Les données.** Aucune ligne métier n'a été lue ni reproduite : uniquement
  des définitions.
- **Les secrets.** `garages_secrets` est décrite comme table ; son contenu n'a
  jamais été consulté.
- **Les buckets de stockage** et leurs policies.

## F. Comment régénérer

```bash
# 1. Extraire le catalogue (lecture seule)
bash scripts/sqx.sh <project-ref> scripts/socle-requetes/<requete>.sql

# 2. Générer
python3 scripts/generer-socle.py prod

# 3. Vérifier sur une base neuve, jamais sur Test ni Production
psql -d <base_vide> -v ON_ERROR_STOP=1 \
  -f supabase/socle/0-prelude-verification.sql \
  -f supabase/socle/1-tables.sql   -f supabase/socle/2-contraintes.sql \
  -f supabase/socle/3-index.sql    -f supabase/socle/4-fonctions.sql \
  -f supabase/socle/5-triggers.sql -f supabase/socle/6-rls-policies.sql \
  -f supabase/socle/7-privileges.sql
```

Le `diff` entre la sortie régénérée et les fichiers versionnés **est** le
rapport de dérive. S'il n'est pas vide, quelqu'un a modifié la base sans
migration.

## G. Ce que ce lot débloque

- Le garde-fou du lot 1 n'est plus la seule protection : le schéma de `garages`
  est désormais lisible dans le dépôt. Vérification faite au passage,
  `nom_garage` est bien la seule colonne `NOT NULL` sans défaut, sur les deux
  projets — la RPC `creer_mon_garage` passera.
- Le lot 3 (import de l'ancienne base) peut s'appuyer sur des définitions
  écrites de `clients` et `vehicules`. À noter : `importer_clients_vehicules`
  **existe déjà sur Test**, issue du chantier import pilote. Le lot 3
  commencera par l'auditer plutôt que par réécrire.
- Un environnement de recette devient créable, ce qui est le prérequis d'une
  mise en service qui ne demande l'intervention de personne.
