# Ordre de Réparation (OR) — Contrat de schéma et spécification V1

> **Statut : référence de conception, non exécutable.**
> Ce document ne contient ni migration, ni instruction SQL prête à exécuter, ni dump de schéma réel. Les tableaux ci-dessous décrivent une **cible à valider et à implémenter** — aucune des trois tables `ordres_reparation*` n'existe aujourd'hui, ni en Git, ni en Production.
>
> Base de cette spécification : audit de code (lecture de `origin/main`, SHA `2738d91c18b69fac7335bd62f5b0adf5a421b25c`) et audit de métadonnées Supabase Production (colonnes, contraintes, policies — **aucune donnée métier consultée**), tous deux déjà validés. Aucun UUID, e-mail, nom de personne, secret, ou corps complet de fonction/trigger réel n'est reproduit ici.

---

## A. Périmètre et décisions V1 (figées)

1. L'OR **lit** `rendez_vous.statut_atelier` pour afficher l'étape atelier en cours ; il ne l'écrit **jamais**. Le pilotage du kanban atelier reste la responsabilité exclusive de l'Atelier V1 existant.
2. **Pas de numéro séquentiel** pour l'OR en V1 (pas d'équivalent au `numero` des factures). L'identifiant technique (`id`) suffit.
3. Les lignes de l'OR (main-d'œuvre, pièces) et leurs prix HT sont **estimatifs et à usage strictement interne**. Aucune promesse de stock réel, de commande fournisseur, ni de valeur contractuelle vis-à-vis du client.
4. Un OR **exige un rendez-vous existant** (`rendez_vous_id` obligatoire). Pas de création d'OR « orphelin » sans RDV.
5. Les lignes sont limitées à deux types : `main_oeuvre` et `piece`. Aucune autre catégorie en V1.
6. La transformation d'un devis accepté en OR est une **action manuelle**, initiée par le staff. Aucune automatisation ne déclenche la création d'un OR.
7. Le modèle **mono-compte-par-garage** (un compte authentifié = un garage, pas de notion de « membre » ou de compte mécanicien distinct) est conservé tel quel en V1. L'OR n'introduit aucun nouveau rôle.

---

## B. Faits du socle existant (issus de l'audit déjà validé)

- **Une partie significative du socle métier n'est pas versionnée dans Git.** Les tables `clients`, `rendez_vous`, `devis`, `factures`, `demandes`, `vehicules`, `garages`, `mecaniciens`, `prestations` n'ont aucune migration `CREATE TABLE` dans `supabase/migrations/` — elles proviennent d'un état de schéma antérieur à l'historique de migrations actuel. Toute nouvelle table doit être conçue en tenant compte de cette absence de source de vérité versionnée pour le socle existant.
- **`rendez_vous.statut_atelier` est la source unique de l'étape atelier** (huit valeurs conventionnelles, imposées uniquement côté application — aucune contrainte CHECK en base à ce jour). L'OR ne doit pas créer une deuxième source de vérité pour cette information.
- **`devis` est à prestation unique** (une seule prestation par devis, pas de lignes multiples) **et n'a aucun lien direct vers `rendez_vous`** dans le schéma actuel. Le rapprochement devis ↔ rendez-vous, quand il existe, passe par des champs indirects (client, véhicule) ou par la facture, jamais par une clé étrangère directe entre `devis` et `rendez_vous`.
- **`factures` est liée à la fois au rendez-vous et au devis** (colonnes de rattachement vers les deux), ce qui en fait aujourd'hui le seul point de jonction explicite entre le monde « devis » et le monde « rendez-vous / atelier ».
- **Absence totale de stock, de catalogue pièces et de fournisseurs.** Le seul catalogue existant (`prestations`) ne couvre que la main-d'œuvre nommée/tarifée par le garage — rien d'équivalent n'existe pour des pièces physiques.
- **Absence de comptes mécaniciens.** Les mécaniciens sont de simples enregistrements descriptifs (nom, couleur, actif/inactif) rattachés à un garage — ils ne correspondent à aucun compte authentifiable et n'ont aucun droit d'accès propre.
- **Politiques RLS et modèle d'isolation à réutiliser** : l'isolation par garage repose sur l'appartenance de la ligne au garage du propriétaire du compte authentifié connecté. Le motif à réutiliser pour les nouvelles tables est la forme **versionnée récente** (celle des migrations les plus récentes concernant les tables d'inspections et de travaux différés), **pas** une fonction utilitaire plus ancienne et non versionnée observée par ailleurs sur certaines tables du socle historique (voir section D).
- **Aucune trace d'historique des transitions d'étape atelier** aujourd'hui, contrairement à d'autres domaines du produit (inspections, travaux différés) qui, eux, conservent un journal des changements de statut.

---

## C. Contrat cible des trois nouvelles tables

> Ces trois tables **n'existent pas encore**. Aucune n'a de migration, aucune n'est présente en Production. Ce qui suit est la cible à faire valider avant toute écriture.

### C.1 `ordres_reparation`

| Champ | Type | Nullabilité | Défaut | Notes |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | généré | Clé primaire |
| `garage_id` | uuid | NOT NULL | — | FK → `garages(id)` |
| `rendez_vous_id` | uuid | NOT NULL | — | FK → `rendez_vous(id)`, **contrainte d'unicité** (un seul OR par rendez-vous) |
| `vehicule_id` | uuid | NOT NULL | — | FK → `vehicules(id)`, dénormalisé et figé à la création |
| `client_id` | uuid | NOT NULL | — | FK → `clients(id)`, dénormalisé et figé à la création |
| `devis_id` | uuid | NULL | — | FK → `devis(id)`, origine facultative (transformation manuelle d'un devis accepté) |
| `mecanicien_id` | uuid | NULL | — | FK → `mecaniciens(id)`, même sémantique que sur `rendez_vous` |
| `statut` | text | NOT NULL | `brouillon` | Valeurs autorisées : `brouillon`, `confirme`, `termine`, `annule` — cycle de vie du **document**, indépendant de `statut_atelier` |
| `notes_internes` | text | NULL | — | Ne doit jamais être exposé en dehors du dashboard garage |
| `created_by` | uuid | NULL | — | Traçabilité de l'auteur (compte authentifié à l'origine de la création) |
| `created_at` | timestamptz | NOT NULL | maintenant | |
| `updated_at` | timestamptz | NOT NULL | maintenant | |

**Règles de suppression** : `ON DELETE` de `rendez_vous_id`/`vehicule_id`/`client_id`/`devis_id`/`mecanicien_id` — à fixer explicitement lors de l'écriture de la migration réelle (recommandation de conception, non actée : restriction ou `SET NULL` selon la colonne, jamais de suppression en cascade d'un OR déclenchée par la suppression d'un rendez-vous, pour préserver la traçabilité).

**Index attendus** : unique sur `rendez_vous_id` ; index sur `garage_id` (isolation) ; index sur `devis_id` et `mecanicien_id` (recherche).

### C.2 `ordres_reparation_lignes`

| Champ | Type | Nullabilité | Défaut | Notes |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | généré | Clé primaire |
| `ordre_reparation_id` | uuid | NOT NULL | — | FK → `ordres_reparation(id)`, suppression en cascade avec l'OR parent |
| `garage_id` | uuid | NOT NULL | — | Dénormalisé pour isolation RLS directe (convention déjà en usage sur les tables de points d'inspection) |
| `type` | text | NOT NULL | — | Valeurs autorisées : `main_oeuvre`, `piece` uniquement |
| `libelle` | text | NOT NULL | — | Description libre |
| `quantite` | numeric | NOT NULL | `1` | |
| `prix_unitaire_ht` | numeric | NULL | — | **Estimation interne uniquement** |
| `duree_minutes` | integer | NULL | — | Renseigné uniquement pour `type = main_oeuvre` |
| `prestation_id` | uuid | NULL | — | FK → `prestations(id)`, réutilisation facultative du catalogue existant |
| `statut` | text | NOT NULL | `prevu` | Valeurs autorisées : `prevu`, `fait`, `annule` |
| `created_at` | timestamptz | NOT NULL | maintenant | |
| `updated_at` | timestamptz | NOT NULL | maintenant | |

**Règles de suppression** : suppression en cascade avec l'`ordre_reparation_id` parent. `prestation_id` en `SET NULL` si la prestation catalogue est supprimée (ne doit jamais entraîner la suppression d'une ligne déjà écrite).

**Index attendus** : index sur `ordre_reparation_id` ; index sur `garage_id`.

**Contraintes métier de la ligne — contrôlées côté base, pas seulement par le formulaire** :
- `quantite` strictement positive (`quantite > 0`).
- `prix_unitaire_ht`, quand renseigné, nul ou positif (jamais négatif).
- `duree_minutes` strictement positive **uniquement** pour `type = main_oeuvre` ; une ligne `type = piece` ne porte **aucune** durée (`duree_minutes` doit rester nulle pour ce type).
- Ces règles doivent être portées par des contraintes CHECK dans la future migration de création de la table, et non laissées à la seule validation du formulaire — un contournement de l'interface (appel direct, script, autre client) ne doit jamais pouvoir produire une ligne incohérente.

### C.3 `ordres_reparation_historique`

| Champ | Type | Nullabilité | Défaut | Notes |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | généré | Clé primaire |
| `ordre_reparation_id` | uuid | NOT NULL | — | FK → `ordres_reparation(id)`, suppression en cascade |
| `garage_id` | uuid | NOT NULL | — | Dénormalisé pour isolation RLS |
| `action` | text | NOT NULL | — | Valeurs V1 : `creation`, `changement_statut`, `changement_mecanicien`, `annulation` — liste fermée, voir note ci-dessous |
| `ancien_statut` | text | NULL | — | |
| `nouveau_statut` | text | NULL | — | |
| `motif` | text | NULL | — | |
| `effectue_par` | uuid | NULL | — | Identifiant du compte authentifié à l'origine de l'action, renseigné **quand cet identifiant est disponible** au moment de l'écriture ; peut rester nul si l'action est produite par un mécanisme sans compte utilisateur direct |
| `created_at` | timestamptz | NOT NULL | maintenant | |

**Portée V1 de l'historique — à ne pas dépasser dans les écrans ou la communication produit** : seules quatre catégories d'événements sont tracées — création de l'OR, changement de son statut document, changement de mécanicien assigné, annulation. **Les modifications de lignes (ajout, édition, suppression) restent explicitement hors historique détaillé en V1** — ce contrat ne doit jamais laisser entendre qu'un audit exhaustif des lignes existe tant que cette portée n'est pas élargie par une décision produit ultérieure.

**Caractère append-only** : tant que l'OR parent existe, aucune ligne d'historique n'est jamais modifiée ni supprimée individuellement — seule la suppression de l'OR parent entraîne, par cascade, la disparition de son historique.

**Règles de suppression** : suppression en cascade uniquement si l'OR parent est supprimé. Aucune suppression individuelle d'une ligne d'historique.

**Index attendus** : index sur `ordre_reparation_id` ; index sur `garage_id`.

### C.4 Intégrité inter-garage — contrat transversal aux trois tables

Cette règle s'applique à `ordres_reparation` et `ordres_reparation_lignes` et doit être respectée par toute future migration, pas seulement par l'interface :

- Un `ordres_reparation` ne peut référencer que des `rendez_vous_id`, `client_id`, `vehicule_id`, `devis_id` et `mecanicien_id` appartenant **au même `garage_id`** que l'OR lui-même. Un OR d'un garage ne doit jamais pouvoir pointer vers une ressource d'un autre garage.
- Une `ordres_reparation_lignes` ne peut référencer qu'un `ordre_reparation_id` et, le cas échéant, un `prestation_id` appartenant **au même `garage_id`**.
- Cette cohérence doit être **appliquée côté base** dans les futures migrations, pas seulement vérifiée côté interface :
  - lorsque c'est possible avec une contrainte déclarative simple (colonnes `garage_id` dénormalisées et cohérentes entre table et ligne, contrainte d'unicité composite le cas échéant) ;
  - et, pour les relations croisées qu'une contrainte déclarative ne peut pas exprimer seule (ex. vérifier que le `garage_id` du `rendez_vous_id` référencé correspond bien au `garage_id` de l'OR), par une **validation serveur ou un trigger versionné dans une migration** — jamais par une vérification laissée uniquement à l'interface.
- Une vérification uniquement côté formulaire/UI **n'est jamais suffisante** pour cette règle : elle doit résister à un appel direct contournant l'interface.

---

## D. Règles de sécurité

- **Isolation RLS par garage**, appliquée aux trois tables, avec le **motif versionné récent** (celui déjà utilisé par les migrations les plus récentes du produit pour l'isolation par garage), et non une fonction utilitaire plus ancienne (`current_garage_id()`) identifiée comme **non versionnée dans Git** lors de l'audit — pour ne pas faire dépendre les nouvelles tables d'un objet dont l'origine n'est pas traçable dans l'historique du dépôt.
- **Aucun accès `anon`** sur les trois tables. Aucune policy pour un rôle non authentifié.
- **Aucun lien public / jeton OR en V1.** L'OR reste un objet strictement interne au dashboard garage — pas de nouvelle route publique, pas de nouveau jeton, pas de réutilisation d'UUID brut dans une URL.
- **`notes_internes` ne doit jamais être exposable** en dehors du dashboard garage authentifié — à traiter comme une contrainte de conception permanente, y compris si un accès client à l'OR était envisagé dans une version future (ce champ resterait alors explicitement exclu de toute projection publique).
- **Aucune nouvelle dépendance** vers la fonction non versionnée identifiée dans l'audit. Toute logique d'isolation nécessaire aux nouvelles tables doit être écrite dans les migrations qui les créent, de façon autonome et traçable.

---

## E. Parcours UX

### Points d'entrée
1. **Depuis un rendez-vous** : une action « Créer un ordre de réparation » proposée au niveau du détail d'un rendez-vous existant. Nécessite que le rendez-vous existe déjà (règle A.4).
2. **Depuis le Dossier Véhicule** : un accès à l'OR (existant ou à créer) au même niveau que les accès déjà présents vers l'atelier et les devis du véhicule.
3. **Transformation manuelle d'un devis accepté** : une action explicite, déclenchée par le staff, qui pré-remplit un nouvel OR (client, véhicule, référence au devis, éventuellement une première ligne) à partir d'un devis dont le statut est accepté. Cette action ne se déclenche jamais automatiquement.
   - Le schéma actuel ne fait apparaître **aucun lien direct** entre `devis` et `rendez_vous` (voir section B) : la transformation ne peut donc jamais déduire seule le rendez-vous cible.
   - Le staff **choisit obligatoirement et explicitement** le rendez-vous auquel l'OR issu de ce devis doit être rattaché — jamais de sélection implicite ou automatique.
   - Ce choix est **limité aux rendez-vous du même client, du même véhicule et du même garage** que le devis transformé — aucun rendez-vous d'un autre client, d'un autre véhicule ou d'un autre garage ne doit être proposable.
   - La création est **refusée** si le devis n'est pas au statut `accepte`, ou si un OR existe déjà pour le rendez-vous cible choisi (voir C.1, contrainte d'unicité).

### Écran OR
- Identification : client, véhicule concernés.
- **Étape atelier affichée en lecture seule**, reflet direct de `rendez_vous.statut_atelier` — aucun contrôle de modification à cet endroit ; un renvoi vers l'écran Atelier existant pour toute modification de l'étape.
- Mécanicien assigné : sélection parmi les mécaniciens du garage, même logique que l'affectation déjà existante sur les rendez-vous.
- Liste des lignes (main-d'œuvre / pièces) : ajout, modification, suppression, avec un total estimé affiché à titre indicatif uniquement.
- Zone de notes internes, non exposée en dehors du dashboard.
- Référence au devis d'origine si l'OR provient d'une transformation (E.3).
- Accès vers la facture existante liée au rendez-vous si elle existe déjà — l'OR ne crée pas de facture, il pointe seulement vers celle qui existe le cas échéant.

### États vides et cas d'erreur
- **Aucun OR pour ce véhicule/rendez-vous** : message explicite invitant à en créer un, avec l'action de création disponible seulement si un rendez-vous existe (sinon, message expliquant qu'un rendez-vous est nécessaire au préalable — pas de création possible dans l'absolu).
- **Tentative de création d'un second OR pour un même rendez-vous** : refus explicite, avec redirection vers l'OR déjà existant pour ce rendez-vous.
- **Devis non accepté** : l'action de transformation manuelle n'est pas proposée tant que le devis n'est pas au statut accepté.
- **Transformation d'un devis accepté sans rendez-vous cible choisi** : la création reste bloquée tant que le staff n'a pas explicitement sélectionné, dans la liste restreinte au même client/véhicule/garage, le rendez-vous auquel rattacher l'OR.
- **Transformation vers un rendez-vous déjà pourvu d'un OR** : refus explicite, avec redirection vers l'OR déjà existant pour ce rendez-vous — même comportement que la tentative de double création directe.
- **Aucune ligne dans l'OR** : état affiché comme valide (un OR sans ligne encore renseignée n'est pas une erreur), avec une invitation à ajouter une première ligne.

---

## F. Plan futur de migrations (aucune action immédiate)

- Les migrations à venir se limiteront à des **ajouts de nouvelles tables** (`ordres_reparation`, `ordres_reparation_lignes`, `ordres_reparation_historique`) et de leurs objets associés (contraintes, index, policies RLS). **Aucune modification de `rendez_vous`, `devis`, `factures`, ni de l'historique de migrations existant** n'est prévue par ce plan.
- Toute migration future devra d'abord être **validée sur l'environnement Supabase de test** dédié, jamais directement en Production.
- Une **revue critique indépendante est obligatoire** avant toute écriture sur un environnement distant, quel qu'il soit.
- **Stratégie de rollback, en deux temps distincts** :
  - **Avant toute donnée réelle sur l'environnement Test** (tables neuves encore vides) : la suppression des trois tables neuves elles-mêmes reste possible, dans l'ordre inverse de leur création (`ordres_reparation_historique` puis `ordres_reparation_lignes` puis `ordres_reparation`).
  - **Après déploiement en Production, ou dès qu'une donnée réelle a été créée** (sur Test ou en Production) : **aucune suppression automatique** des tables n'est plus autorisée. Toute correction nécessaire passe uniquement par une **migration corrective additive**, décidée avec un **feu vert explicite**, jamais par un rollback silencieux ou automatique.
  - Dans tous les cas, **aucun rollback ne touche une table historique** (`ordres_reparation_historique`, ni aucune table d'historique existante par ailleurs) — un historique, une fois écrit, n'est jamais annulé.
  - Sans aucun impact sur les tables existantes puisque aucune n'est modifiée par ce plan.
- Aucune réparation silencieuse de l'historique de migrations existant n'est envisagée à quelque étape que ce soit.

---

## G. Critères d'acceptation et tests de non-régression

**Acceptation fonctionnelle**
- Impossible de créer un second OR pour un même rendez-vous.
- La suppression d'un OR ne supprime jamais le rendez-vous, le devis ou la facture qui lui sont liés.
- L'étape atelier affichée dans l'écran OR correspond toujours exactement à `rendez_vous.statut_atelier` au moment de la consultation — jamais une valeur mise en cache ou dupliquée.
- Un OR sans ligne reste un état valide et consultable.
- La transformation d'un devis en OR ne peut être déclenchée que sur un devis au statut accepté, et reste une action volontaire du staff.

**Non-régression**
- Aucun changement de comportement de l'Atelier V1 existant : les calculs et regroupements par étape doivent produire des résultats identiques avant et après l'introduction de l'OR.
- Aucun changement de comportement du Dossier Véhicule existant : les informations déjà calculées (statut global, prochaine action, chronologie) ne doivent pas être altérées par l'ajout de l'accès à l'OR.
- Aucun changement de comportement du parcours client par lien public (atelier, devis, facture, inspection) — l'OR reste invisible de ces parcours en V1.
- Vérification que ni un rôle non authentifié, ni un compte d'un autre garage, ne peuvent lire ou écrire dans les trois nouvelles tables.

---

## H. Limites explicites (hors V1)

- Pas de gestion de stock réel.
- Pas de commande fournisseur.
- Pas de paiement rattaché à l'OR.
- Pas d'automatisation SMS ou e-mail déclenchée par l'OR.
- Pas de facture juridiquement certifiée générée depuis l'OR.
- Pas de signature électronique.
- Pas de portail ou de lien public permettant à un client de consulter un OR.
