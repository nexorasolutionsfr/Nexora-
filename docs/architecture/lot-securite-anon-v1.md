# Lot de sécurité — exécution ouverte à `anon` (V1)

Lot **séparé** du chantier accès salariés et import pilote. Branche
`security/anon-execute-stripe-v1`, créée depuis `origin/main` (5cf895f).
Aucun fichier commun avec `feature/acces-salaries-v1`.

Audit du 2026-09-05, en lecture seule sur Test (`slawilafseganlbghgwx`) et
Production (`omphppsmhmyllapdqevn`), par consultation du catalogue Postgres
et du dépôt. Aucun secret, aucune valeur de configuration, aucune donnée
métier n'est reproduite ici.

---

## Phase 1 — inventaire des fonctions exécutables par `anon`

Quarante-deux fonctions de `public` accordent EXECUTE à `anon`, sur les deux
projets, avec une liste identique. Vingt-deux d'entre elles renvoient
`trigger` ou `event_trigger` : PostgreSQL n'autorise pas leur appel direct et
PostgREST ne peut pas les exposer. **Elles ne sont pas des RPC et ne sont pas
traitées comme telles.** Restent vingt fonctions réellement appelables.

### A. Endpoint public intentionnel et nécessaire — 9 fonctions

Chacune n'accepte qu'un jeton opaque et est appelée par une page publique du
portail client, avec la clé anonyme. Le rôle produit est prouvé par le site
d'appel. **Aucune ne doit être révoquée.**

| Fonction | Page qui l'appelle |
| --- | --- |
| `lire_devis_par_jeton`, `repondre_devis_par_jeton` | `app/devis/[token]` |
| `lire_facture_par_jeton` | `app/facture/[token]` |
| `lire_atelier_par_jeton`, `avancer_etape_atelier_par_jeton` | `app/atelier/[token]` |
| `lire_inspection_par_jeton`, `repondre_point_inspection_par_jeton` | `app/i/[token]` |
| `lire_confirmation_par_jeton`, `repondre_confirmation_par_jeton` | `app/c/[token]` |

`lire_inspection_par_jeton` est en outre appelée par
`app/api/inspections/photos/route.ts`, avec la clé anonyme ; cette route
n'emploie le rôle de service que pour signer les fichiers du stockage, après
revalidation du jeton.

### B. Endpoint authentifié, ouvert à `anon` par erreur — 7 fonctions

Toutes sont appelées depuis le tableau de bord authentifié, ou par un
mécanisme interne à la base. Aucune n'a d'appelant anonyme.

| Fonction | Appelant réel | Ce que ferait un appel anonyme |
| --- | --- | --- |
| `set_stripe_secret_key` | réglages du tableau de bord | exception, aucune écriture |
| `stripe_configure_pour_mon_garage` | réglages du tableau de bord | renvoie faux |
| `creer_jeton_inspection` | `components/inspections` | exception |
| `revoquer_jeton_inspection` | `components/inspections` | exception |
| `reouvrir_inspection` | `components/inspections` | exception |
| `finaliser_inspection` | `components/inspections` | aucune ligne visible (fonction INVOKER, soumise à RLS) |
| `preparer_rappels_confirmation` | tâche `pg_cron` toutes les 10 minutes, en Production | exécuterait la préparation des rappels |

### C. Non appelable hors mécanisme PostgreSQL — 23 fonctions

Les vingt-deux corps de déclencheur, plus `rls_auto_enable` qui renvoie
`event_trigger`. Le droit accordé est sans effet : ces fonctions ne peuvent
être invoquées que par le moteur de déclencheurs.

### Cas particuliers, à ne pas traiter comme les autres

**`current_garage_id()`** est appelable, mais renvoie `null` sans session.
Elle est surtout invoquée **à l'intérieur des policies RLS**, dont plusieurs
sont déclarées `to public`. Lui retirer EXECUTE pour `anon` ferait échouer
l'évaluation de ces policies sur une requête anonyme, au lieu de la rendre
simplement vide. Elle est donc **exclue de tout lot de révocation** tant
qu'un banc dédié n'aura pas mesuré cet effet.

**`lire_confirmation_rdv_public`** et **`repondre_confirmation_rdv_public`**
sont des vestiges déjà neutralisés : la première renvoie un ensemble vide par
construction, la seconde lève systématiquement « parcours obsolète ». Leur
corps a été vérifié. Elles ne présentent aucun risque et ne justifient aucune
action urgente.

### Constat à traiter dans un lot ultérieur, hors de celui-ci

**`creer_jeton_confirmation(p_rdv_id uuid)`** accepte un identifiant brut de
rendez-vous, **sans aucune vérification d'appartenance**, et renvoie un jeton
de confirmation valide. C'est exactement la classe de faiblesse fermée le
2026-09-01 pour les parcours atelier, devis et facture ; celle-ci a été
manquée parce qu'elle émet un jeton au lieu de lire directement. Un
identifiant de rendez-vous qui fuiterait suffirait à fabriquer un lien
client. L'appelant légitime est interne : `preparer_rappels_confirmation`
l'appelle depuis son propre corps `security definer`, donc en tant que
propriétaire — fermer `anon` et `authenticated` ne casserait pas la tâche
planifiée. **Non traité dans ce lot** parce qu'il touche un parcours client
et demande votre arbitrage.

---

## Phase 2 — ce que ce lot prépare, sans l'appliquer

Trois migrations, une seule intention par fichier, et un banc de test. Rien
n'a été appliqué sur Test ni sur Production.

1. **`20260906000100`** verse `rls_auto_enable()` dans l'historique versionné,
   à l'identique. `create or replace` préserve ses privilèges. Le déclencheur
   `ensure_rls` n'est ni créé, ni modifié, ni supprimé.
2. **`20260906000200`** redéclare les deux fonctions Stripe avec
   `search_path = ''` et des objets qualifiés par leur schéma, **sans
   changer leur logique**, puis ferme `PUBLIC`, `anon` et `service_role` et
   ne conserve que `authenticated`. La migration vérifie elle-même le
   résultat et échoue si un privilège subsiste.
3. **`20260906000300`** retire `TRUNCATE` sur la table des secrets pour
   `anon` et `authenticated`, après audit d'impact.

### Pourquoi `search_path = ''`

Les deux fonctions Stripe sont `security definer` et appartiennent à
`postgres`. Leur `search_path` vaut `public`, ce qui laisse le schéma
temporaire implicitement consulté en premier pour les tables : c'est le
vecteur de substitution classique sur ce type de fonction. Le dépôt a déjà
tranché en faveur de `search_path = ''` avec objets qualifiés, lors de la
correction de `current_garage_id()` le 2026-09-02. Ce lot applique la même
règle. Les corps sont repris ligne à ligne, seules les références de tables
sont qualifiées.

### Pourquoi `authenticated` seulement

Les deux fonctions ne sont appelées que par le composant de réglages du
tableau de bord, dans `NexoraDashboard.jsx`, sous session authentifiée. Aucun
appel anonyme, aucun appel depuis une route serveur, aucun appel avec le rôle
de service dans le dépôt.

**Une hypothèse reste à confirmer par le porteur du projet** : les workflows
n8n vivent hors du dépôt et n'ont pas été inspectés, conformément aux
consignes. Si l'un d'eux appelait ces fonctions avec le rôle de service, la
révocation de `service_role` le casserait. Le geste métier — saisir sa clé
Stripe — est un geste d'interface, ce qui rend l'hypothèse peu probable,
mais elle n'est pas vérifiée. La migration isole cette révocation sur deux
lignes commentées, faciles à retirer si vous préférez conserver
`service_role`.

### Audit du privilège `TRUNCATE`

Sur la table des secrets, RLS est active et aucune policy n'existe, sur les
deux projets : aucune lecture ni écriture par ligne n'est possible depuis le
client. Mais `TRUNCATE` **n'est pas filtré par RLS**, et ce privilège reste
accordé à `anon` et `authenticated` sur les deux projets.

Impact d'une révocation : nul. PostgREST n'expose pas `TRUNCATE`, aucun
code du dépôt n'émet cet ordre, et aucune fonction `security definer` ne
l'exécute — vérifié par recherche sur l'ensemble des migrations et du code
applicatif. Le privilège est donc inutile, et sa fermeture est sans effet
fonctionnel.

Divergence relevée au passage, **non traitée dans ce lot** : sur Test, `anon`
et `authenticated` conservent en plus `SELECT`, `INSERT`, `UPDATE` et
`DELETE` sur cette table, là où la Production les a déjà retirés. RLS les
neutralise aujourd'hui, mais l'écart mérite une convergence dans un lot
ultérieur.

---

## Divergence Test / Production, documentée sans être corrigée

Le déclencheur d'événement `ensure_rls`, qui active automatiquement RLS sur
toute table créée dans `public`, **existe en Production et est absent de
Test**. La fonction `rls_auto_enable()` est présente et identique sur les
deux projets ; seul l'enregistrement du déclencheur diffère.

Conséquence : une table créée sur Test sans `enable row level security`
explicite resterait sans protection, alors que la même table serait couverte
en Production. Toutes les migrations du dépôt activent RLS explicitement,
donc aucune table existante n'est concernée.

Conformément à la consigne, ce lot **ne touche pas** à `ensure_rls` et se
contente de consigner l'écart.
