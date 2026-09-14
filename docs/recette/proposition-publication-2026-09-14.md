# Proposition de publication — constat → devis, modèles, suivi et relances

Mise à jour du 15 septembre 2026 (passe de fiabilisation). **Proposition pour
revue. Rien n'est fusionné, rien n'est appliqué en Production, rien n'est
importé dans l'instance n8n vive.** Deux décisions séparées sont demandées :

1. **publier le dashboard et la base** (ce document, §1 à §6) ;
2. **activer les relances** — *pas proposé* : bloqué, voir §7.

## 1. Ce qui serait publié

PR [#101](https://github.com/nexorasolutionsfr/Nexora-/pull/101), branche
`integ/constat-devis-suivi`, non fusionnée. Le SHA exact de la tête est donné
dans la PR et dans `docs/recette/POINT-DE-REPRISE-2026-09-14.md` ; publier
**cette tête-là**, pas une autre.

Migrations, **dans cet ordre, d'un seul passage** :

| # | Migration | Effet |
|---|---|---|
| 1 | `20260919000100_constat_vers_devis` | constat → devis, « prix à renseigner », remplace 4 fonctions du socle et `empreinte_devis` |
| 2 | `20260919000200_modeles_de_travaux` | modèles, insertion idempotente |
| 3 | `20260919000300_suivi_partage` | suivi traité/reporté partagé dirigeant + accueil |
| 4 | `20260919000400_relances_travaux_differes` | table et fonctions des relances (aucun envoi sans workflow) |
| 5 | `20260919000500_ecritures_directes_fermees` | ferme les écritures directes laissées par les privilèges par défaut |
| 6 | `20260919000600_relances_perimetre_atomique` | réservation bornée au garage et aux lignes demandées |
| 7 | `20260919000700_constats_du_mecanicien` | constat et photo du mécanicien ; **réécrit les 3 politiques de stockage** `inspections_photos_storage_*` |
| 8 | `20260919000800_preuves_devis_public` | preuves figées à la décision, suppression protégée |
| 9 | `20260919000900_preuves_identifiants_opaques` | identifiants opaques côté public |
| 10 | `20260919001000_fiabilisation_envois` | empreinte = contenu lu par le client ; opposition client dans les relances |

Aucune ne transforme de donnée existante. Application : dashboard Vercel (fusion
dans `main`), route nouvelle `POST /api/devis/preuves`. Pas de dépendance npm
nouvelle. Workflow n8n des relances : **non importé** (§7).

## 2. Comment le dépôt déploie réellement

Aucun workflow CI, pas de `vercel.json`. **Vercel déploie l'application à la
fusion dans `main` ; il n'applique aucune migration.** Les migrations se
poussent à la main depuis un miroir jetable lié au projet, **avant** la
fusion : l'ancien code tourne sans erreur sur la nouvelle base (prouvé, §6).

## 3. Répétition avant le jour J (fait le 15 sept., à refaire le jour même)

`bash docs/recette/base-jetable-2026-09-14.sh` — export **frais** du schéma
de Production (`public` **et** `storage`, lecture seule), base jetable, les
10 migrations, contrôles, compatibilité du retour arrière.

- Résultat du 15 sept. : **102 OK, 0 KO, 0 erreur SQL, RÉSULTAT : VERT**.
- Politiques de stockage réellement présentes en Production, relevées par
  l'export : `inspections_photos_storage_read`, `_write`, `_delete` (les trois
  que `000700` remplace) ; le trigger `storage.protect_delete` de la Production
  est chargé et reste actif.
- Le script **échoue** (code ≠ 0) sur une commande en erreur, une migration en
  erreur, une erreur SQL ou un contrôle KO — démontré par échec volontaire
  (`ECHEC_VOLONTAIRE=controle|sql|migration`), voir la recette.

**Point d'arrêt n° 1** : si ce script n'affiche pas `RÉSULTAT : VERT` sur
l'export du jour, on s'arrête là.

## 4. Autorisations d'envoi existantes et changement d'empreinte

`empreinte_devis` change deux fois de formule dans ce lot (`000100`, puis
`001000` qui signe désormais libellés, quantités, prix, TVA, constat et photos
montrés au client). Conséquence : **toute notification de devis autorisée
avant la bascule et pas encore partie** ne correspondra plus ; au passage
suivant de « Nouveau devis (socle) », elle est mise de côté (`bloque`, « le
devis ou le destinataire a changé depuis la validation »). Rien ne part à tort.

Règles :

- **Aucune réautorisation automatique, jamais.** Pas de script qui recalcule
  l'empreinte, pas de remise en `en_attente`. Une autorisation invalidée ne
  redevient valable que par un geste du garage, sur le devis tel qu'il est.
- **Relevé frais juste avant** (point d'arrêt n° 2) :
  ```sql
  select n.id, n.devis_id, d.garage_id, n.type, n.statut, n.autorise_le, n.tentatives
    from notifications_devis n join devis d on d.id = n.devis_id
   where n.statut in ('en_attente', 'envoi_en_cours')
   order by n.created_at;
  ```
  Même requête pour `notifications_factures` (non concernée par le changement,
  relevée pour comparer). Conserver la sortie dans le dossier de sauvegarde.
  S'il y a des lignes `envoi_en_cours` : attendre qu'elles soient closes, ou
  s'arrêter.
- **Relevé après**, même requête : chaque ligne `en_attente` du relevé avant
  est soit partie **avant** l'application (horodatage antérieur), soit
  `bloque` ensuite. Le garage concerné est prévenu qu'une validation est à
  refaire. Toute autre différence : s'arrêter et analyser.
- **Changements pendant la bascule** : un devis autorisé entre le relevé et
  l'application tombe dans le même cas — c'est pour cela qu'on refait le relevé
  après. Appliquer les 10 migrations d'un seul passage, hors heures
  d'ouverture. Ne pas suspendre « Nouveau devis » : une ligne qui part avant
  l'application part avec l'ancienne empreinte, valide.

## 5. Ordre de publication

1. Sauvegarde du schéma de Production dans
   `~/Nexora_backups/production_<date>_avant-constat-devis/`.
2. Répétition sur export du jour (§3) — **point d'arrêt n° 1**.
3. Relevé des files (§4) — **point d'arrêt n° 2**.
4. Appliquer `000100` → `001000` depuis un miroir jetable lié à la Production,
   puis supprimer le dossier `supabase/migrations` du miroir.
5. Relevé après (§4) — **point d'arrêt n° 3** : écart inexpliqué = on
   n'ouvre pas le nouveau code, on analyse (l'ancien code fonctionne, §6).
6. Fusionner la PR #101 ; Vercel déploie.
7. Contrôle du code servi sur `nexora-garage.vercel.app` : textes « Préparer le
   devis depuis le constat », « Prix à renseigner », « Constats du véhicule »,
   « Constat du garage ».
8. Ne **rien** importer dans n8n (§7).

## 6. Suspension et retour arrière — sans perte, sans retirer de protection

**Ce qui n'est pas un retour arrière sûr** : recréer les anciennes fonctions
puis supprimer les nouveaux objets. Après utilisation, cela détruirait
modèles, constats du mécanicien, preuves figées, suivi partagé et relances, et
rouvrirait des failles corrigées (écritures directes, stockage). **À ne pas
faire.** Les migrations sont gardées ; le retour se fait côté application.

**Suspendre le nouveau traitement** :
- relances : aucun workflow importé ; si un jour importé, le désactiver. Les
  lignes `en_attente` restent en attente, rien ne part ;
- notifications de devis : « Nouveau devis (socle) » continue ; l'empreinte ne
  laisse partir que ce que le garage a validé.

**Retour applicatif** : redéployer sur Vercel le déploiement précédent
(`main` actuel), sans toucher à la base. Vérifié sur la base jetable avec des
données créées par les nouvelles fonctions (`compat-retour-arriere-2026-09-15.sql`,
jeu synthétique, sous le rôle `authenticated`, avec le vrai schéma `storage`) :

| Geste de l'ancien code | Résultat |
|---|---|
| créer un devis, ajouter et modifier une ligne | OK |
| modifier un devis issu d'un modèle | OK |
| déposer et relire une photo au chemin de `main` (`.heif`) | OK |
| supprimer une photo libre (par l'API Storage) | OK |
| supprimer une photo figée d'un devis décidé | **refusé** (protection conservée ; l'ancien écran affiche son erreur générique) |
| lire et écrire le suivi | OK |
| acceptation au comptoir | OK |
| lien public (clés d'origine) | OK |
| après tout cela : modèles, insertions, reprises, constats, preuve figée, suivi | **intacts** |
| envois | **aucun réarmé** : 0 notification en attente, relance inchangée |

Ce que l'ancien code ne montre plus pendant le retour : le constat du
mécanicien (les données restent), les modèles, les preuves sur le lien public
(la page de `main` ignore les nouvelles clés). Les revoir = redéployer la PR.

## 7. Activation des relances — BLOQUÉE (décision séparée)

Prouvé : la vraie variante du workflow (`n8n/relances-travaux/recette-smtp.json`,
mêmes nœuds que `production.json`) exécutée dans une instance n8n isolée contre
un serveur SMTP contrôlé : accepté → `envoye` ; 451 → `a_reprendre` puis repris ;
550 → `bloque` ; connexion coupée après le message → `envoi_en_cours`, jamais
repris. Expéditeur `"<nom du garage>" <nexorasolutions.france@gmail.com>`,
Reply-To = adresse du garage. **Réception réelle non testée** (aucun envoi Brevo).

Encore bloquant (détail : `docs/architecture/plan-n8n-2026-09-14.md`) :

1. **Opposition du client** : vérifiée par la base (préparation, autorisation,
   réservation) mais **aucun écran ne permet de l'enregistrer**, et le message
   ne contient **aucun moyen de s'opposer**. Chantier distinct.
2. **Base légale** de la relance commerciale d'un client existant : à
   confirmer (le journal le dit lui-même : « pas un avis juridique »).
3. **Autorisation du garage au niveau du garage** : aujourd'hui l'autorisation
   est message par message ; le workflow Production prend tous les garages
   (`p_garages: null`). Activer seulement pour un garage volontaire, borné.
4. **Hébergement** : l'instance n8n vive tourne sur le Mac ; Mac éteint =
   relances en retard (rien ne part deux fois).
5. Une preuve de réception réelle via Brevo sur une boîte de test.

## 8. Contrôles après publication

- Relevé des files à J+1 : aucune ligne `envoi_en_cours` ancienne.
- Un devis de démonstration : préparer depuis un constat, chiffrer, partager,
  ouvrir le lien public, vérifier photo et constat.
