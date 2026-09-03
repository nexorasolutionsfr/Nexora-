# Notifications de devis résilientes V1

Ce document décrit le lot livré côté dépôt, et **prépare** la publication n8n
correspondante. **Aucune publication n8n n'a été faite.** Aucune migration n'a
été appliquée, sur aucun environnement.

## Le problème

`notifications_devis.envoye` est un `boolean NOT NULL DEFAULT false` — vérifié en
lecture seule sur Test **et** Production le 2026-09-03. Il ne porte que deux
états. Une notification dont une donnée intermédiaire manque (devis, client,
véhicule ou garage introuvable) ne peut donc ni partir, ni sortir de la file :
elle reste à `envoye = false` et le workflow n8n la reprend à chaque passage
planifié, en échouant à chaque fois.

Mesure sur Production au 2026-09-03 : `notifications_devis` contient 20 lignes,
dont **2 à `envoye = false`**. Ces deux lignes produisaient à elles seules
environ **1 589 exécutions en erreur sur 7 jours**, soit **~82 % de toutes les
erreurs** de l'instance n8n.

## Ce que ce lot livre

- `supabase/migrations/20260903000100_notifications_devis_statut_traitement.sql`
  — colonnes `statut_traitement` et `incomplet_motif`, reprise explicite depuis
  `envoye`, contrainte des cinq états, contrainte des codes de motif, index, et
  les trois RPC avec leur matrice ACL complète.
- `supabase/tests/notifications_devis_statut_traitement.sql` — banc
  transactionnel autonome pour **Test**, terminé par `rollback` et vérification
  d'absence de résidu.
- `components/notifications-devis/` — la section « Notifications à vérifier »,
  sa logique pure et ses tests unitaires.

`envoye` n'est ni modifié, ni converti, ni remplacé. C'est ce qui rend le retour
arrière purement comportemental.

## Les cinq états

| État | Sens |
|---|---|
| `en_attente` | à traiter au prochain passage planifié |
| `envoye` | notification partie |
| `incomplet` | donnée manquante — visible dans l'interface, action humaine attendue |
| `erreur` | échec technique |
| `abandonne` | sortie définitive décidée par un humain |

## Les codes de motif

Domaine fermé, contraint en base : `devis_absent`, `client_absent`,
`vehicule_absent`, `garage_absent`, `donnees_incompletes`.

n8n n'écrit **jamais** de texte libre dans `incomplet_motif`. C'est ce qui
garantit qu'aucune donnée client ne peut transiter par cette colonne, même si le
workflow était modifié par erreur. La traduction en français lisible est faite
côté interface (`notificationsDevisConstants.js`), et un code inconnu s'affiche
« Raison non précisée » plutôt que d'être rendu tel quel.

---

# Publication n8n — PRÉPARÉE, NON RÉALISÉE

## Prérequis absolu

La migration doit être appliquée sur l'environnement visé **avant** la
publication : le workflow écrira `statut_traitement`, qui n'existe pas encore.

## Une seule publication, jamais deux

Un découpage en deux publications avait été envisagé puis **écarté**, pour deux
raisons qui se cumulent :

1. **La garde seule est inatteignable.** La chaîne échoue sur le nœud `get`
   *avant* d'atteindre la garde placée devant l'e-mail. Publier la garde sans
   rendre les lectures tolérantes ne changerait donc rien : l'exécution
   s'interromprait toujours en amont.
2. **Le filtre non basculé laisse tourner les incomplètes.** Une ligne marquée
   `incomplet` conserve `envoye = false`. Tant que la mise en file lit
   `envoye = false`, elle continue d'être reprise à chaque passage — sans erreur
   désormais, mais inutilement, et en rouvrant la porte à la boucle que ce lot
   supprime.

Les quatre changements ci-dessous partent donc **dans un même Publish**.

## Les quatre changements

### 1. Tolérance des lectures manquantes

Sur chacun des quatre nœuds Supabase `get` de la chaîne (`devis`, `clients`,
`vehicules`, `garages`) : activer **Always Output Data** et régler le
comportement d'erreur sur **Continue**, afin qu'un enregistrement absent
n'interrompe plus l'exécution et laisse la garde décider en aval.

### 2. Garde avant l'e-mail

Un nœud **IF** inséré juste avant le nœud e-mail, vérifiant la présence et la
non-vacuité des données indispensables (devis, client, véhicule, garage).

### 3. Double écriture sur la branche « vrai »

E-mail envoyé, puis mise à jour de `notifications_devis` avec **les deux**
champs : `envoye = true` **et** `statut_traitement = 'envoye'`.

`envoye` reste ainsi la source de vérité pour tout consommateur existant, et le
retour arrière ne demande aucune migration inverse.

### 4. Branche « faux » et bascule du filtre

- Branche fausse : `statut_traitement = 'incomplet'` et `incomplet_motif` =
  le code court correspondant à la donnée manquante. **Ne pas toucher à
  `envoye`.**
- Filtre de mise en file du `getAll` : remplacer `envoye = false` par
  `statut_traitement = 'en_attente'`, **dans la même publication**.

## Vérification, par métriques agrégées seulement

Aucune lecture d'exécution, de log ou de payload — interdiction permanente
depuis l'incident de confidentialité du 2026-09-03.

- **à 1 h** : le workflow ne produit plus d'erreurs en rafale.
- **à 24 h** : les 2 lignes bloquées apparaissent dans « Notifications à
  vérifier » ; aucun e-mail incomplet n'est parti.
- **à 72 h** : taux d'échec de l'instance stabilisé **sous 5 %** (contre ~24 %),
  avec un volume d'exécutions du même ordre qu'avant — la seconde condition
  prouve qu'on n'a pas simplement cessé de travailler.

## Retour arrière

Republier la version n8n précédente depuis l'historique des versions. Les
colonnes restent en place, inertes ; `envoye`, jamais modifié, continue de faire
foi. Aucune migration inverse, aucun `DROP`.

## Ensuite

Après 72 h de métriques stables, le même patron pourra être porté sur
`notifications_proposition` et `notifications_factures`, qui présentent une
structure et un défaut latent identiques. `notifications_atelier` reste hors
périmètre tant que son workflow est inactif.
