# Proposition de publication — constat → devis, modèles, suivi et relances

14 septembre 2026. **Proposition pour revue. Rien n'est fusionné, rien n'est
appliqué en Production, rien n'est importé dans n8n.** Les décisions produit
sont celles du brief du 14 septembre ; ce document ne demande que le feu vert
de publication.

## 1. Ce qui serait publié

Branche d'intégration `integ/constat-devis-suivi`, trois commits sur
`15eead5` (PR #100) :

| Commit | Contenu | Migrations |
|---|---|---|
| `d8d16b9` | Lot 0 (devis deviné, inspection sans effet) + lot 1 (constat → devis) | `20260919000100_constat_vers_devis` |
| `e3806b7` | Lot 2 (modèles de travaux) + largeur de page sur téléphone | `20260919000200_modeles_de_travaux` |
| `b7f40ed` | Lot 3 (suivi partagé, relances) + fenêtres en portail + plan n8n | `20260919000300_suivi_partage`, `20260919000400_relances_travaux_differes` |
| _commit suivant_ | Écritures directes fermées + base jetable + recette durcie | `20260919000500_ecritures_directes_fermees` |

Découpage en PR proposé : **trois PR empilées**, dans l'ordre des lots.
`20260919000500` ferme un privilège ouvert par les trois migrations
précédentes : elle part **dans la PR du lot 3**, la dernière, pour que l'état
publié ne porte jamais l'écart. La branche d'intégration permet de tout
tester d'un bloc.

## 2. Comment le dépôt déploie réellement

Vérifié : aucun workflow CI (`.github/workflows` absent), pas de
`vercel.json`. **Vercel déploie l'application à la fusion dans `main` ; il
n'applique aucune migration.** Les migrations se poussent à la main, depuis
un miroir jetable lié au projet, avant le déploiement de l'application qui
les utilise (procédure des 9 et 13 septembre).

## 3. Ordre de publication

1. **Sauvegarde du schéma** de Production (`supabase db dump --linked`) dans
   `~/Nexora_backups/production_<date>_avant-constat-devis/`.
2. **Base jetable depuis le schéma de Production — fait le 14 sept.** :
   `bash docs/recette/base-jetable-2026-09-14.sh` (Production lue seulement :
   un dump de schéma). Les cinq migrations s'appliquent dans l'ordre sans
   erreur ; **53 contrôles, 53 OK** (structure, RLS, droits d'exécution par
   rôle, `search_path` des fonctions SECURITY DEFINER, contrainte « prix à
   renseigner », préparation/report/clôture des relances, borne par garage,
   retrait du jeu synthétique). À **rejouer juste avant** la publication, sur
   un dump frais : le schéma de Production peut avoir bougé.
   _Trouvé par ce contrôle_ : `authenticated` gardait insert/update/delete
   sur `devis_reprises`, `devis_insertions_modeles` et `relances_travaux`
   (privilèges par défaut de Supabase) ; la RLS refusait déjà ces écritures,
   `20260919000500` ferme aussi le privilège.
3. **Relever les files** en Production : `notifications_devis` en
   `en_attente` (autorisées, pas parties). Voir §4.
4. Appliquer, dans l'ordre : `000100` → `000200` → `000300` → `000400` →
   `000500`. Aucune ne transforme de donnée existante ; `000100` remplace
   quatre fonctions du socle (`creer_jeton_devis`, `autoriser_envoi_devis`,
   `lire_devis_par_jeton`, `repondre_devis_par_jeton`) et `empreinte_devis`.
5. Fusionner les trois PR dans l'ordre ; Vercel déploie.
6. Contrôle du code servi sur `nexora-garage.vercel.app` (textes « Préparer le
   devis depuis le constat », « Prix à renseigner », « Modèles de travaux »,
   « Relire la relance »). Une recette cliquée sur le garage réel demande une
   session de Baptiste.
7. **n8n** : importer `n8n/relances-travaux/production.json` dans un workflow
   **neuf** par « Import from File », vérifier les identifiants, laisser
   **inactif**. Activation = décision séparée (§5).

## 4. Population susceptible de recevoir un message

- **Par les migrations seules : personne.** Aucune ligne n'est armée.
- **Effet de bord à compter avant** : `empreinte_devis` change de formule
  (nombre de lignes + état de chiffrage). Toute notification de devis déjà
  **autorisée mais pas encore partie** au moment de l'application sera mise
  de côté (`bloque`, « le devis ou le destinataire a changé depuis la
  validation ») au prochain passage de « Nouveau devis (socle) ». Rien ne
  part à tort ; ces envois attendent une nouvelle autorisation. Au 13 sept.,
  les files étaient à **0 ligne armée** : à revérifier juste avant.
- **Par les relances** : uniquement les clients des travaux différés échus
  dont le garage a **autorisé** la relance, une par une, depuis l'écran — et
  seulement une fois le workflow activé.

## 5. Activation des relances (décision séparée)

1. `select count(*) from relances_travaux;` → 0 attendu.
2. Lancer `preparer_relances_travaux(array['<garage volontaire>'])` à la main ;
   relire les brouillons avec le garage ; comparer l'ensemble exact des
   travaux échus (`travaux_differes` `planifie`/`a_relancer`, `date_relance ≤
   aujourd'hui`) avec les lignes préparées.
3. Activer le workflow ; observer une fenêtre connue (exécutions utiles /
   vides). Ce qui arrive pendant la bascule : une relance autorisée avant
   l'activation reste `en_attente` et part au premier passage — rien d'autre.

## 6. Arrêt sûr et retour arrière

- **Arrêt** : désactiver le workflow de relances. Les lignes `en_attente`
  restent en attente ; rien n'est perdu, rien ne part.
- **Application** : revenir au commit précédent sur Vercel. Les colonnes
  ajoutées sont ignorées par l'ancien code.
- **Base** : les migrations sont additives. En cas de besoin, recréer les
  quatre fonctions du socle depuis `20260917000100` / `20260901000400`,
  recréer `opportunites_actions_isolation` (20260830001100), puis supprimer
  `relances_travaux`, `devis_insertions_modeles`, `modeles_travaux*`,
  `devis_reprises` et les colonnes ajoutées. **Ne jamais** réactiver un envoi
  automatique au passage.
- Point de non-retour : aucun (aucune donnée transformée, aucune contrainte
  resserrée sur l'existant).

## 7. Ce qui reste à faire avant le feu vert

- Rejouer la base jetable sur un dump **frais** du schéma de Production (§3.2).
- `next build` sur la branche.
- Recette clavier réelle des trois nouvelles fenêtres.
- Import et exécution du workflow Test dans une instance n8n **de recette**
  (pas l'instance vive).
