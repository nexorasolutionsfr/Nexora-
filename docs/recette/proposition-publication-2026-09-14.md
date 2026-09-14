# Proposition de publication — constat → devis, modèles, suivi et relances

14 septembre 2026. **Proposition pour revue. Rien n'est fusionné, rien n'est
appliqué en Production, rien n'est importé dans l'instance n8n vive.** Les
décisions produit sont celles du brief du 14 septembre ; ce document ne
demande que le feu vert de publication.

## 1. Ce qui serait publié

Branche `integ/constat-devis-suivi` (PR non fusionnée), sur `15eead5` :

| Contenu | Migrations |
|---|---|
| Lot 0 (devis deviné, inspection sans effet) + lot 1 (constat → devis) | `20260919000100_constat_vers_devis` |
| Lot 2 (modèles de travaux) | `20260919000200_modeles_de_travaux` |
| Lot 3 (suivi partagé, relances) | `20260919000300_suivi_partage`, `20260919000400_relances_travaux_differes` |
| Écritures directes fermées | `20260919000500_ecritures_directes_fermees` |
| Relances : réservation bornée au garage **et** aux lignes demandées, dans l'opération atomique | `20260919000600_relances_perimetre_atomique` |
| Constat et photo par le mécanicien, depuis son écran | `20260919000700_constats_du_mecanicien` |
| Preuve photo sur le devis public, figée à la décision | `20260919000800_preuves_devis_public` |
| Identifiants opaques pour les photos publiques | `20260919000900_preuves_identifiants_opaques` |

Découpage proposé : **trois PR empilées** dans l'ordre des lots ; `000500` et
`000600` partent dans la PR du lot 3, `000700`–`000900` dans celle du lot 1
(ou une quatrième PR « preuve et mécanicien » si la revue le préfère).

## 2. Comment le dépôt déploie réellement

Aucun workflow CI, pas de `vercel.json`. **Vercel déploie l'application à la
fusion dans `main` ; il n'applique aucune migration.** Les migrations se
poussent à la main depuis un miroir jetable lié au projet, **avant** le
déploiement du code qui les utilise.

## 3. Ordre de publication

1. **Sauvegarde du schéma** de Production dans
   `~/Nexora_backups/production_<date>_avant-constat-devis/`.
2. **Base jetable sur un dump frais** : `bash docs/recette/base-jetable-2026-09-14.sh`
   (Production lue seulement). Dernier passage, 14 sept. au soir : les
   **neuf** migrations s'appliquent dans l'ordre, **78 contrôles, 78 OK,
   0 erreur SQL**. À rejouer juste avant la publication.
3. **Relevé frais des files, juste avant** (voir §4) : `notifications_devis`
   par statut, avec la liste exacte des lignes `en_attente` (id, devis,
   garage, `autorise_le`). Le conserver dans le dossier de sauvegarde.
4. Appliquer `000100` → `000900` dans l'ordre, d'un seul passage.
5. **Relevé après** : même requête. Comparer ligne à ligne (§4).
6. Fusionner les PR dans l'ordre ; Vercel déploie.
7. Contrôle du code servi sur `nexora-garage.vercel.app` (« Préparer le devis
   depuis le constat », « Prix à renseigner », « Constats du véhicule »,
   « Constat du garage »).
8. **n8n** : importer `n8n/relances-travaux/production.json` dans un workflow
   **neuf**, vérifier les identifiants, **laisser inactif**. Activation =
   décision séparée (§5).

## 4. Autorisations d'envoi existantes : le changement d'empreinte

`empreinte_devis` change de formule (nombre de lignes + état de chiffrage).
Conséquence : **toute notification de devis autorisée avant la bascule et
pas encore partie ne correspondra plus à son empreinte**. Au passage suivant
de « Nouveau devis (socle) », elle est mise de côté (`bloque`, « le devis ou
le destinataire a changé depuis la validation »). Rien ne part à tort.

Règles :

- **Aucune réautorisation automatique, jamais.** Pas de script qui recalcule
  l'empreinte, pas de remise en `en_attente`. Une autorisation invalidée ne
  redevient valable que par un geste du garage dans l'écran, sur le devis tel
  qu'il est.
- **Relevé frais avant, relevé après** (§3.3 et §3.5). Toute ligne
  `en_attente` du relevé avant est suivie nominativement : elle est soit
  partie **avant** l'application (statut `envoye`, horodatage antérieur), soit
  mise de côté ensuite. Le garage concerné est prévenu qu'une validation est à
  refaire.
- **Changements pendant la bascule** : un devis autorisé entre le relevé et
  l'application tombe dans le même cas — c'est pourquoi on refait le relevé
  après. Pour réduire la fenêtre, appliquer les migrations d'un seul passage,
  hors des heures d'ouverture ; ne pas suspendre « Nouveau devis » (une ligne
  qui part avant l'application part avec l'ancienne empreinte, valide).
- Au 13 sept., les files étaient à **0 ligne armée** ; ce chiffre est périmé
  et ne dispense pas du relevé.

Autres populations :

- **Par les migrations seules : personne.** Aucune ligne n'est armée.
- **Par les relances** : uniquement les travaux différés échus dont le garage
  a **autorisé** la relance, une par une — et seulement une fois le workflow
  activé.
- **Devis public** : les photos d'un constat relié à une ligne deviennent
  visibles du client porteur du lien. `note_constat` est désormais montrée au
  client (commentaire de colonne mis à jour). À signaler aux garages : le
  constat écrit pour le client doit être rédigé comme tel.

## 5. Activation des relances (décision séparée)

1. `select count(*) from relances_travaux;` → 0 attendu.
2. Préparer à la main pour un garage volontaire ; relire les brouillons avec
   lui ; comparer l'ensemble exact des travaux échus avec les lignes préparées.
3. Activer le workflow ; observer une fenêtre connue. Une relance autorisée
   avant l'activation reste `en_attente` et part au premier passage — rien
   d'autre. Une issue **incertaine** reste `envoi_en_cours`, visible « envoi à
   vérifier », **sans reprise automatique**.

## 6. Arrêt sûr et retour arrière

- **Arrêt** : désactiver le workflow de relances. Rien ne part, rien n'est perdu.
- **Application** : revenir au commit précédent sur Vercel.
- **Base** : migrations additives. Retour : recréer les fonctions du socle
  depuis `20260917000100` / `20260901000400` et les politiques de stockage
  `inspections_photos_storage_*` d'origine, puis supprimer les objets ajoutés.
  **Ne jamais** réautoriser un envoi au passage.
- Point de non-retour : aucune donnée transformée. Seule exception de fait :
  les photos figées d'un devis décidé ne sont plus supprimables tant que la
  migration `000800` est en place (voulu).

## 7. Vérifié / restant avant le feu vert

Vérifié le 14 sept. : base jetable 78/78 ; `next build` ; 496 tests unitaires ;
recettes serveur (mécanicien 35/35, preuves 20/20, modèles 27/27, relances
34/34) ; workflow n8n **exécuté avec transport simulé** dans une instance de
recette isolée (`docs/recette/n8n-relances-execution-2026-09-14.md`).

Restant : **réception réelle non testée** ; classement des erreurs SMTP de la
variante Production non exécuté ; relevé frais des files le jour J.
