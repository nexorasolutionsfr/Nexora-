# Devis multi-lignes → Ordre de Réparation — Contrat de schéma et spécification V1

Statut : **contrat validé, audit de socle réalisé, non implémenté.** Aucune
migration n'est écrite à ce jour. Les faits de la section B proviennent d'un
audit en lecture seule mené le 2026-09-04 sur Test puis sur Production — ils
sont constatés, pas inférés. Ce document fige le périmètre, le schéma cible, les
règles de sécurité et les tests avant toute écriture, sur le modèle de
`docs/architecture/ordre-reparation-v1.md`.

---

## A. Périmètre et décisions V1 (figées)

- Un devis peut porter **plusieurs lignes**, de deux types seulement :
  `main_oeuvre` et `piece` — les deux valeurs déjà employées par
  `ordres_reparation_lignes`.
- **Prix unitaire HT et taux de TVA sont figés sur chaque ligne** au moment de
  la saisie. Ils ne sont jamais relus depuis `prestations` à l'affichage.
- **HT, TVA et TTC sont calculés ligne par ligne, de façon déterministe et
  imposée par la base**, jamais par le code applicatif.
- **Un devis accepté n'est plus modifiable** : ni ses lignes, ni ses totaux.
  Cette garantie doit être réelle et posée en base (voir section G).
- La **conversion devis accepté → OR reste un geste explicite du staff**, jamais
  automatique. Elle existe déjà ; ce lot lui ajoute la reprise des lignes.
- **Les devis historiques, sans ligne, continuent de fonctionner à l'identique**
  et ne sont jamais recalculés.
- **Pas de remise en V1** (voir E.4). Pas de stock, de fournisseur, de commande,
  de paiement, de Stripe, de SMS, d'e-mail ni de n8n.
- **Ce lot ne touche pas `factures`** et n'emploie pas le mot « facture » pour
  désigner un document produit par Nexora (voir section K).

---

## B. Faits du socle existant (constatés, pas inférés)

Audit en lecture seule du 2026-09-04, exécuté **sur Test**
(`slawilafseganlbghgwx`) **puis sur Production** (`omphppsmhmyllapdqevn`).
Les deux schémas sont identiques sur tout ce qui concerne ce lot ; la seule
divergence relevée est signalée en B.9.

- **B.1 — Le socle métier n'est pas versionné.** `clients`, `rendez_vous`,
  `devis`, `factures`, `vehicules`, `garages`, `mecaniciens`, `prestations` et
  `demandes` n'ont aucune migration `CREATE TABLE` dans `supabase/migrations/`.
  Seul `ordres_reparation*` l'est. Les tables sont en revanche bien présentes
  sur Test comme sur Production.

- **B.2 — Structure réelle de `devis`, 12 colonnes** (constat, Test et
  Production) :

  | # | Colonne | Type | Null | Défaut |
  |---|---|---|---|---|
  | 1 | `id` | uuid | non | `gen_random_uuid()` |
  | 2 | `garage_id` | uuid | oui | — |
  | 3 | `demande_id` | uuid | oui | → `demandes(id)` |
  | 4 | `client_id` | uuid | oui | — |
  | 5 | `vehicule_id` | uuid | oui | — |
  | 6 | `prestation_id` | uuid | oui | — |
  | 7 | `montant_ht` | `numeric` **sans précision ni échelle** | oui | — |
  | 8 | `montant_ttc` | `numeric` **sans précision ni échelle** | oui | — |
  | 9 | `statut` | text | oui | `'en_attente'::text` |
  | 10 | `message_garage` | text | oui | — |
  | 11 | `date_validation` | timestamptz | oui | — |
  | 12 | `created_at` | timestamptz | oui | `now()` |

  Points à retenir : **il n'existe pas d'`updated_at`** ; **les montants n'ont
  aucune échelle imposée** (rien ne garantit 2 décimales aujourd'hui) ; **toutes
  les colonnes sauf `id` sont nullables**.

- **B.3 — Contraintes : une PK et cinq clés étrangères, rien d'autre.**
  `devis_pkey`, puis `client_id`, `demande_id`, `garage_id`, `prestation_id`,
  `vehicule_id`. **Aucune contrainte `CHECK`, en particulier aucune sur
  `statut`** : c'est du texte libre avec une simple valeur par défaut.

- **B.4 — Deux triggers, tous deux `AFTER` et `SECURITY DEFINER`** :
  `trg_notifier_nouveau_devis` (AFTER INSERT → `notifier_nouveau_devis`) et
  `trg_notifier_devis_maj` (AFTER UPDATE → `notifier_devis_maj`), configurés
  avec `search_path=public`. **Conséquence décisive : un trigger `BEFORE UPDATE`
  ajouté par ce lot s'exécute avant eux ; un refus annule toute la transaction,
  donc aucune notification parasite n'est émise sur une tentative bloquée. Il
  n'y a pas de conflit de timing.**

- **B.5 — Deux fonctions seulement écrivent dans `public.devis`**, et **aucune
  ne touche aux montants** :

  - `repondre_devis_par_jeton` (`SECURITY DEFINER`, `search_path=''`) —
    `update public.devis set statut = ..., date_validation = now() where id = ...`
  - `repondre_devis_public` (`SECURITY DEFINER`, `search_path=public`, `devis`
    **non qualifié**) — même mise à jour, gardée par `and statut = 'en_attente'`

  Elles ne modifient que `statut` et `date_validation`. **Geler `montant_ht`,
  `montant_ttc` et `prestation_id` ne casse donc ni l'acceptation d'un devis, ni
  la réponse client par lien public.** C'est ce qui rend G.2 écrivable.

- **B.6 — Distribution réelle des statuts en Production** (agrégat, aucune
  donnée métier) : `refuse` 7, `en_attente` 4, `accepte` 3 — **14 devis au
  total, et aucun `brouillon`, aucun statut NULL.** Le statut `brouillon`
  n'existe que dans le code applicatif, jamais dans les données.

- **B.7 — Un devis de Production a `montant_ht` NULL et `prestation_id` NULL.**
  Le trigger de totaux ne doit ni échouer ni réécrire ces lignes historiques.

- **B.8 — RLS active sur `devis`, avec une policy unique** :
  `devis_scope FOR ALL TO {public} USING (garage_id = current_garage_id())`.
  `current_garage_id()` est `SECURITY DEFINER`, `search_path=''`, et son corps
  est **entièrement qualifié** (`select id from public.garages where
  owner_user_id = auth.uid()`) : c'est la version corrigée par
  `20260902000300`. Pour un appelant anonyme, `auth.uid()` est NULL, la fonction
  ne retourne aucune ligne, la comparaison vaut NULL et les lignes sont filtrées.

- **B.9 — Seule divergence Test / Production, et elle concerne la sécurité.**
  Privilèges de table sur `devis` :

  | Rôle | Production | Test |
  |---|---|---|
  | `anon` | `TRUNCATE, REFERENCES, TRIGGER` | **tous**, y compris `SELECT/INSERT/UPDATE/DELETE` |
  | `authenticated` | tous | tous |
  | `service_role` | tous | tous |

  Production a donc déjà été partiellement durcie : **`anon` n'y a aucun droit
  DML**. Il conserve en revanche `TRUNCATE`, **que la RLS ne filtre jamais**.
  Cet état contredit le durcissement que le projet s'impose ailleurs
  (`20260831001100_revenue_recovery_fermer_privileges_defaut.sql`).
  **Hors périmètre de ce lot** : à traiter dans un lot de sécurité dédié, sans
  le mélanger au devis multi-lignes (voir L).

- **B.10 — `devis_lignes` n'existe ni sur Test ni sur Production.** Aucune
  collision de nom.

- **B.11 — `devis` est à prestation unique et n'a aucune clé étrangère vers
  `rendez_vous`.** Le pont explicite entre devis et atelier reste `factures`
  (`rendez_vous_id` + `devis_id`) et `ordres_reparation.devis_id`.

- **B.12 — La TVA n'existe nulle part en base.** Elle est un `* 1.2` codé en dur
  dans `components/NexoraDashboard.jsx` (l. 2360, 3391, 5199, 5219, 5287, 5330).

- **B.13 — Trois représentations incohérentes du même besoin** : `devis`
  (scalaires, sans ligne) ; `factures.lignes` (colonne **JSONB** libre, sans
  typage ni contrainte) ; `ordres_reparation_lignes` (table relationnelle typée,
  contrainte, isolée par RLS). **Le modèle correct existe déjà, côté OR.**

- **B.14 — La conversion devis → OR existe déjà et elle est correcte.** Le
  trigger `ordres_reparation_check_integrite` exige `devis.statut = 'accepte'`
  et l'égalité stricte garage / client / véhicule ; côté interface,
  `CreerOrdreModal` et `filtrerDevisAttachables` ne proposent que les devis
  acceptés compatibles. Il ne manque que les lignes à recopier.

- **B.15 — L'immuabilité du devis accepté n'est aujourd'hui qu'applicative.**
  Les mises à jour passent par `.eq("statut", "en_attente")` — filtre serveur
  réel, mais seulement sur les chemins qui l'emploient. Aucun trigger, aucune
  contrainte en base.

- **B.16 — Motif RLS à réutiliser** : la forme versionnée récente
  `garage_id in (select id from public.garages where owner_user_id = auth.uid())`,
  **jamais** `current_garage_id()`.

---

## C. Décision structurante : ne rien modifier du schéma de `devis`

`devis.montant_ht` et `devis.montant_ttc` **existent déjà**. Les totaux sont
donc maintenus par un trigger qui les met à jour — une écriture de données, pas
un changement de schéma. Le lot tient en **une seule table neuve**, sans
`ALTER TABLE` sur le socle non versionné, exactement comme le lot OR.

Conséquence assumée : **pas de colonne `montant_tva` sur `devis`**. La valeur se
déduit (`montant_ttc − montant_ht`) et se lit exactement sur les lignes.
L'ajouter exigerait de modifier `devis` ; ce serait une décision distincte, avec
son propre feu vert.

Cette décision porte sur le **schéma**. Elle n'exempte pas ce lot d'ajouter un
**garde-fou comportemental** sur `devis` (section G) : c'est un trigger, pas une
modification de structure, et il est exigé par le contrat.

---

## D. Contrat cible — `devis_lignes`

| Colonne | Type | Règle |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `devis_id` | `uuid` NOT NULL | → `devis(id)` `ON DELETE CASCADE` |
| `garage_id` | `uuid` NOT NULL | → `garages(id)` `ON DELETE RESTRICT` |
| `type` | `text` NOT NULL | `CHECK (type IN ('main_oeuvre','piece'))` |
| `libelle` | `text` NOT NULL | `CHECK (length(btrim(libelle)) > 0)` |
| `quantite` | `numeric(10,3)` NOT NULL | `CHECK (quantite > 0)` |
| `prix_unitaire_ht` | `numeric(12,2)` NOT NULL | `CHECK (prix_unitaire_ht >= 0)` |
| `taux_tva` | `numeric(5,2)` NOT NULL | `CHECK (taux_tva >= 0 AND taux_tva <= 100)` |
| `position` | `integer` NOT NULL | défaut `0`, ordre d'affichage |
| `prestation_id` | `uuid` NULL | → `prestations(id)` `ON DELETE SET NULL` |
| `montant_ht` | `numeric(12,2)` | `GENERATED ALWAYS AS (round(quantite * prix_unitaire_ht, 2)) STORED` |
| `montant_tva` | `numeric(12,2)` | `GENERATED ALWAYS AS (round(round(quantite * prix_unitaire_ht, 2) * taux_tva / 100, 2)) STORED` |
| `created_at`, `updated_at` | `timestamptz` NOT NULL | `now()`, `updated_at` par trigger |

Index sur `devis_id`, sur `garage_id`, et sur `(devis_id, position)`.

**Notes de contrat**

- **D.1 — Prix et taux figés.** `prestation_id` enregistre une *provenance*, pas
  une source de vérité. Un devis relu dans deux ans affiche les prix du jour où
  il a été composé.
- **D.2 — Colonnes générées `STORED`.** Le calcul par ligne est imposé par
  PostgreSQL. Aucun chemin d'écriture ne peut produire une ligne incohérente.
- **D.3 — Règle d'arrondi, figée.** Arrondi à 2 décimales **par ligne** (HT puis
  TVA), **puis** somme des lignes. Jamais l'inverse. C'est ce qui rend un total
  reproductible.
- **D.4 — `taux_tva` en plage, pas en liste blanche.** Une liste figée
  (20 / 10 / 5,5) bloquerait des taux légitimes, notamment outre-mer. La plage
  `[0, 100]` avec commentaire est le bon niveau de contrainte en base ;
  l'interface propose les taux courants.
- **D.5 — `type` identique à l'OR.** Mêmes deux valeurs que
  `ordres_reparation_lignes` : la conversion devient une copie, sans traduction.

---

## E. Totaux du devis — déterministes

**E.1** Trigger `AFTER INSERT / UPDATE / DELETE` sur `devis_lignes` :

```
montant_ht  = coalesce(sum(l.montant_ht), 0)
montant_ttc = coalesce(sum(l.montant_ht + l.montant_tva), 0)
```

écrits dans `devis` pour le `devis_id` concerné.

**E.2** Fonction `SECURITY DEFINER`, `set search_path = ''`, toutes références
entièrement qualifiées (`public.*`, `auth.*`) — motif imposé par
`20260902000300_fixer_search_path_current_garage_id.sql`.

**E.3** Un devis **sans aucune ligne** vaut `0`, jamais `NULL`. Le trigger ne
s'exécute que lorsqu'une ligne est écrite : **un devis historique sans ligne
n'est jamais recalculé ni écrasé.** C'est le point de non-régression numéro un
de ce lot.

**E.4 — Pas de remise en V1.** Avec plusieurs taux de TVA sur un même devis, une
remise globale n'a pas de ventilation unique et correcte. Se tromper là-dessus
se paie plus tard, précisément sur le terrain juridique que ce lot cherche à ne
pas engager. Un garage qui remise saisit un prix unitaire déjà remisé, ou une
ligne au libellé explicite. Les montants négatifs sont **volontairement**
interdits par `CHECK (prix_unitaire_ht >= 0)`. À rouvrir dans un lot dédié si le
besoin est avéré.

---

## F. Sécurité

**F.1 — ACL au moindre privilège**, sur le modèle de la section 7 du lot OR :
révocation totale pour `public`, `anon`, `authenticated` **et** `service_role`
d'abord, puis octroi explicite et minimal.

```
grant select, insert, update, delete on public.devis_lignes to authenticated;
```

Aucun droit pour `anon`. Aucun droit pour `service_role` : aucun besoin backend
n8n n'est validé pour ce lot ; un besoin futur passera par une migration dédiée
qui l'assumera.

**F.2 — RLS** activée, policy `FOR ALL` pour `authenticated`, motif versionné
récent en `using` **et** `with check` :
`garage_id in (select id from public.garages where owner_user_id = auth.uid())`.

**F.3 — Intégrité inter-garage**, trigger `BEFORE INSERT OR UPDATE`, copie
conforme de `ordres_reparation_lignes_check_integrite` :
`devis_lignes.garage_id` doit égaler `devis.garage_id`, et `prestation_id`, s'il
est fourni, doit appartenir au même garage.

**F.4 — Aucune exposition publique.** `devis_lignes` n'apparaît dans aucune RPC
de lien public. Le parcours client par jeton continue de n'exposer que
`prestation`, `montant_ttc` et `statut` — comportement inchangé, à vérifier en
non-régression.

---

## G. Immuabilité réelle du devis accepté — **exigence, pas option**

Un garde-fou qui ne protégerait que les lignes serait incohérent : les totaux
resteraient modifiables directement, et la promesse produit « un devis accepté
ne change pas » serait fausse. Le contrat exige donc **les deux volets**.

**G.1 — Sur les lignes.** Trigger `BEFORE INSERT OR UPDATE OR DELETE` sur
`devis_lignes` : refus explicite si le devis parent n'est pas dans un statut
modifiable. Message d'erreur nommant le statut bloquant.

**G.2 — Sur `devis` lui-même.** Trigger `BEFORE UPDATE` sur `public.devis`
interdisant la modification de `montant_ht`, `montant_ttc` et `prestation_id`
dès lors que `old.statut <> 'en_attente'`, tout en **laissant passer les
transitions de statut légitimes** — au minimum le passage à `accepte` / `refuse`
avec `date_validation`, qui est le chemin normal de l'application et de la RPC
de réponse client par lien public.

**G.3 — Condition préalable : levée.** L'audit de la section B a établi que
les deux seuls chemins d'écriture applicatifs sur `devis` (B.5) ne touchent que
`statut` et `date_validation`, et que les deux triggers existants sont `AFTER`
(B.4). **G.2 peut donc être écrit sans risque de casser l'acceptation d'un
devis, la réponse client par lien public ou la génération de facture.** La
formulation retenue gèle `montant_ht`, `montant_ttc` et `prestation_id`, et ne
contraint jamais `statut` ni `date_validation`.

**G.4 — Statuts modifiables, figés sur constat.** L'audit (B.6) montre qu'en
Production les seuls statuts existants sont `refuse` (7), `en_attente` (4) et
`accepte` (3), sur 14 devis — **aucun `brouillon`, aucun NULL**. La règle
produit est donc :

| Statut | Lignes et montants |
|---|---|
| `en_attente` | **modifiables** |
| `brouillon` | **modifiables** — aucune ligne existante ne porte ce statut, l'autoriser ne déverrouille donc rien ; c'est une précaution si l'application venait à en créer |
| `accepte` | **verrouillés** |
| `refuse` | **verrouillés** |
| toute autre valeur, ou NULL | **verrouillés** — `statut` n'ayant aucune contrainte `CHECK` (B.3), la règle est fermée par défaut : ce qui n'est pas explicitement modifiable ne l'est pas |

Verrouiller `accepte` et `refuse` couvre 10 des 14 devis de Production. Aucune
donnée existante ne devient modifiable du fait de cette règle.

---

## H. Audit préalable — fait, et ses suites

L'audit exigé avant toute migration a été **réalisé le 2026-09-04, en lecture
seule, sur Test puis sur Production**. Ses résultats sont intégrés à la section
B et ne sont pas répétés ici. Les huit questions initiales sont toutes closes,
sauf mention contraire ci-dessous.

**H.1 — Ce que l'audit a changé dans ce contrat**

- `demande_id` et `message_garage` existent : ils manquaient à l'inférence
  initiale (B.2).
- `devis` n'a **pas** d'`updated_at`, et ses montants n'ont **aucune échelle**
  imposée (B.2).
- `statut` n'a **aucune contrainte `CHECK`** (B.3) : la règle G.4 est donc
  fermée par défaut plutôt qu'énumérative.
- Les triggers existants sont `AFTER` (B.4) : G.2 est sûr, la réserve G.3 est
  levée.
- `brouillon` n'existe dans aucune donnée (B.6) : G.4 est tranché sur constat.

**H.2 — Limite de l'audit Test.** `devis` est **vide sur Test** (0 ligne).
Aucune vérification de distribution, de cohérence ou de volumétrie n'y est
possible ; ces réponses viennent toutes de Production, en agrégat.

**H.3 — Reste à vérifier au moment de la migration**, sur Test d'abord : que le
trigger de totaux (E.1) peut effectivement écrire dans `devis` sans effet de
bord, en conditions réelles. C'est le seul point que l'inspection du catalogue
ne peut pas trancher, parce qu'il dépend de l'exécution.

**H.4 — Constat de sécurité sorti du périmètre.** Les privilèges résiduels de
`anon` sur `devis` (B.9, `TRUNCATE` notamment, que la RLS ne filtre jamais) sont
réels mais **ne relèvent pas de ce lot**. Ils sont consignés ici pour mémoire et
doivent faire l'objet d'un lot de sécurité distinct.

---

## I. Parcours UX

**Écran devis.** Un tableau de lignes : type, libellé, quantité, PU HT, taux de
TVA, total HT de la ligne. Ajouter, supprimer, réordonner. Un pied à trois
chiffres — **HT, TVA, TTC** — recalculés à l'affichage depuis les lignes. Le
sélecteur de prestation **pré-remplit** libellé et prix, puis se laisse écraser.

**Devis accepté.** Lignes et totaux en lecture seule, avec un bandeau qui dit
*pourquoi*. Jamais un champ grisé sans explication.

**Écran OR.** À la création d'un OR depuis un devis accepté, la liste des lignes
à reprendre est proposée, cochée par défaut, décochable. Copie **par valeur**
(type, libellé, quantité, prix unitaire), en `statut = 'prevu'` : l'OR devient
indépendant du devis. Jamais automatique.

**Devis historique sans ligne.** Affiché exactement comme aujourd'hui, avec ses
montants existants. Aucun recalcul, aucune migration de données, aucun bandeau
d'avertissement.

---

## J. Critères d'acceptation et tests

**Tests SQL** — `supabase/tests/devis_lignes_v1.sql`, au format des tests OR :

- isolation inter-garage en lecture **et** en écriture ;
- `anon` et `service_role` sans aucun accès ;
- `quantite <= 0` rejetée ; `prix_unitaire_ht < 0` rejeté ;
- `taux_tva` hors `[0, 100]` rejeté ; libellé vide ou blanc rejeté ;
- `garage_id` incohérent avec le devis parent rejeté ;
- `prestation_id` d'un autre garage rejetée ;
- écriture de lignes rejetée aux **trois** opérations sur un devis `accepte` et
  sur un devis `refuse` (G.1) ;
- écriture de lignes **acceptée** sur un devis `en_attente` et sur un devis
  `brouillon` (G.4) ;
- écriture de lignes rejetée sur un statut inconnu et sur un statut NULL — la
  règle est fermée par défaut (G.4) ;
- modification directe de `montant_ht`, `montant_ttc` ou `prestation_id` sur un
  devis `accepte` ou `refuse` rejetée (G.2) ;
- transition de statut `en_attente → accepte` et `en_attente → refuse`
  **toujours possible**, y compris via `repondre_devis_par_jeton` et
  `repondre_devis_public` (G.2, B.5) ;
- mise à jour de `date_validation` **jamais bloquée** (G.2) ;
- un devis historique dont `montant_ht` est NULL n'est ni recalculé ni mis en
  erreur tant qu'aucune ligne ne lui est ajoutée (B.7, E.3) ;
- totaux corrects après insertion, modification, suppression, et suppression de
  la dernière ligne (→ `0`, pas `NULL`).

**Tests JS déterministes** — `node:test`, au format de `lib/analytics/` :

- arrondi par ligne puis somme, sur cas piégeux (`0.005`, quantités décimales,
  taux mixtes 20 % / 10 %) ;
- totaux d'un devis vide ;
- conversion devis → lignes d'OR à l'identique.

**Non-régression**

- Les devis existants sans ligne affichent exactement leurs montants actuels.
- Le parcours client par lien public (atelier, devis, facture, inspection) est
  inchangé ; `devis_lignes` y reste invisible.
- La génération de facture existante n'est pas modifiée par ce lot.
- L'acceptation et le refus d'un devis, y compris par la RPC de réponse client,
  continuent de fonctionner.

---

## K. Limite juridique — ce que ce lot ne prétend pas être

Ce lot produit un **document commercial interne**. Il ne produit pas, et ne doit
pas être présenté comme produisant, une **facture légale**.

Restent hors d'atteinte tant que l'identité légale complète, la domiciliation et
les règles de numérotation ne sont pas arrêtées — et à faire valider par un
professionnel du droit, ce document n'en tenant pas lieu :

- employer le mot « facture » pour un document émis par Nexora ;
- la numérotation séquentielle continue et inaltérable, qui est une contrainte
  de **conception** et non un champ ajouté après coup ;
- les mentions obligatoires (identité, SIREN, adresse, numéro de TVA
  intracommunautaire, conditions de paiement, pénalités de retard) ;
- la conservation et l'inaltérabilité des documents émis ;
- la facturation électronique B2B en cours de déploiement en France.

**Conséquence de conception** : `factures` n'est pas touchée par ce lot et
conserve sa colonne `lignes` JSONB en l'état. Aligner la facture sur le modèle
de lignes relationnel est un lot **ultérieur**, à ouvrir **après** la
domiciliation, parce que la numérotation en change la conception.

---

## L. Hors périmètre, explicitement

Stock réel, catalogue pièces, fournisseurs, commandes, Stripe, paiement, SMS,
e-mail, n8n, signature électronique, lien public vers un devis multi-lignes,
remise, modification de `factures`, modification du **schéma** de `devis`.

**Explicitement hors périmètre également : la révocation des privilèges
résiduels de `anon` sur `devis` (B.9).** C'est un vrai sujet de défense en
profondeur, mais le mélanger à ce lot brouillerait la revue des deux. Lot de
sécurité dédié.

---

## M. Plan de migrations (aucune action immédiate)

- Une **seule migration additive** : création de `public.devis_lignes` et de ses
  objets (contraintes, index, triggers, ACL, policies RLS), plus les deux
  triggers de la section G, dont **G.2 se pose sur `devis`** et ne peut être
  rédigé qu'après l'audit H.
- Migration **non idempotente**, sur le modèle du lot OR : aucun
  `IF NOT EXISTS`, aucun `OR REPLACE`, aucun `DROP ... IF EXISTS`. En cas de
  collision de nom, elle doit échouer bruyamment.
- Validation obligatoire sur **Test** avant toute écriture en Production.
- **Revue critique indépendante obligatoire** avant écriture sur un
  environnement distant, quel qu'il soit.
- **Rollback, en deux temps** : tant que la table neuve est vide sur Test, sa
  suppression reste possible ; dès qu'une donnée réelle existe, ou après
  déploiement en Production, toute correction passe par une **migration
  corrective additive** avec feu vert explicite. Aucun rollback ne touche jamais
  une table d'historique.
- Aucune réparation silencieuse de l'historique de migrations existant.
