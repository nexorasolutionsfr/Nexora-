# Nexora Auto — plan de la nuit du 17 au 18 septembre 2026

Établi après la mise en ligne, en vérifiant l'état réel plutôt qu'en relisant
un ancien plan. Chaque ligne « fait » a sa preuve dans
`nexora-auto-livraison.md` (section 5 pour les migrations, section 6 pour les
contrôles) ou dans `nexora-auto-suivi.md`.

## 1. État réel, vérifié ce soir

| Point | Constat | Preuve |
| --- | --- | --- |
| Branche | `auto/livraison-b2c`, arbre propre | `git status` |
| `main` | contient toute la pile | fusions #124, #125, #126, #127 |
| PR empilées | #110 à #123 **fermées**, « intégrée dans #124 » | GitHub |
| Migrations en Production | les onze `202609220…` **appliquées** | `migration list`, 15 tables `auto_` |
| Migrations en Test | les mêmes, appliquées depuis les lots | bancs SQL à 0 |
| Dernière version déployée | `main`, branche `main` renvoyée par la route de contrôle | `/api/auto/environnement` |
| Base utilisée par la Production | `omphppsmhmyllapdqevn` | même route |
| Région des fonctions | `dub1` (Dublin) | même route, en-tête `cdg1::dub1` |
| Base utilisée par les **prévisualisations** | **encore la Production** | code servi, constat du 17 sept. |
| Ouverture de Nexora Auto | **`beta`**, deux adresses invitées | `auto_acces_parametres` |
| Authentification | e-mail + mot de passe, confirmation exigée ; l'envoi est **accepté** par Supabase | `confirmation_sent_at` renseigné |
| Lecture des factures | **gratuite**, sur le serveur, sans prestataire d'IA | `/api/auto/lecture` : `"externe":false` |
| Nexora Pro | intact : 57 tables, 90 politiques, données inchangées, dépôt de fichier accepté | contrôles en lecture et transaction annulée |

## 2. Terminé

- Simplification grand public : quatre espaces, « Aujourd'hui », « Compte », `/auto/confidentialite`.
- Sauvegardes (schéma, rôles, données) avant migration, hors dépôt.
- Répétition des onze migrations sur une copie du schéma réel de Production.
- Migrations appliquées, fusion unique, déploiement, ouverture en bêta.
- Recette après déploiement : onze contrôles, dont le parcours complet.
- Deux défauts trouvés par cette recette, corrigés et redéployés (#125, #126).

## 3. À corriger ou à vérifier cette nuit

1. **Parcours dégradés** (§6 de la consigne) : connexion, véhicules, factures,
   données dérivées. C'est la priorité : le produit est en ligne, il doit
   tenir debout quand tout ne se passe pas bien.
2. **Détails visibles** (§7) : petit écran, texte agrandi, vocabulaire,
   confirmations, focus.
3. **Exploitation** (§9) : aucune route ni outil de recette accessible
   publiquement en Production ; procédure courte de fermeture.
4. **Recette finale depuis une session neuve** (§12), y compris un dossier
   incomplet et plusieurs voitures.

## 4. Ce que je ne peux pas faire, et ce qu'il faut faire à ma place

**Les variables « Preview » de Vercel.** Elles pointent encore vers la base de
Production. La correction demande d'écrire des clés dans l'interface Vercel :
aucun jeton d'API Vercel n'existe sur ce poste, et saisir des clés à la place
de Baptiste n'est pas quelque chose que je fais. La marche à suivre exacte,
variable par variable, est en section 2 de `nexora-auto-livraison.md`.

Conséquence tant que ce n'est pas fait : **aucune recette sur une
prévisualisation**. Nexora Auto s'y ferme de lui-même (garde
« prévisualisation reliée à la Production »), mais Nexora Pro, lui, n'a pas
cette garde.

**La réception d'un e-mail dans une vraie boîte.** Aucun message n'a été
envoyé à une personne réelle, et je n'en enverrai pas. La première inscription
de Baptiste le prouvera en une fois.
