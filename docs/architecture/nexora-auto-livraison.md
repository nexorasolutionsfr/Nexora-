# Nexora Auto — document de livraison

État au 17 septembre 2026. **Procédure préparée, rien n'a été exécuté en
Production** : aucune fusion dans `main`, aucune migration en Production,
aucun déploiement. Chaque étape ci-dessous attend une décision explicite.

## 1. Ce qui est livré

Douze PR en brouillon, empilées. Chacune a pour base la précédente, et
#110 a pour base `main` (`349652e`, qui est bien l'ancêtre de toute la pile).

| PR | Lot | Migration |
| --- | --- | --- |
| [#110](https://github.com/nexorasolutionsfr/Nexora-/pull/110) | A — garage virtuel | `20260922000100`, `20260922000200` |
| [#111](https://github.com/nexorasolutionsfr/Nexora-/pull/111) | B — « Mon garage » consolidé | `20260922000300`, `20260922000400` |
| [#112](https://github.com/nexorasolutionsfr/Nexora-/pull/112) | C — « À prévoir » | `20260922000500` |
| [#113](https://github.com/nexorasolutionsfr/Nexora-/pull/113) | D — services | `20260922000600`, `20260922000700`, `20260922000800` |
| [#114](https://github.com/nexorasolutionsfr/Nexora-/pull/114) | E — factures, lecture gratuite | `20260922000900` |
| [#115](https://github.com/nexorasolutionsfr/Nexora-/pull/115) | F — recette globale | — |
| [#116](https://github.com/nexorasolutionsfr/Nexora-/pull/116) | G — première utilisation | — |
| [#117](https://github.com/nexorasolutionsfr/Nexora-/pull/117) | H — import plus fluide | `20260922001000` |
| [#118](https://github.com/nexorasolutionsfr/Nexora-/pull/118) | I — mobile et accessibilité | — |
| [#119](https://github.com/nexorasolutionsfr/Nexora-/pull/119) | J — kilométrage et rappels | — |
| [#120](https://github.com/nexorasolutionsfr/Nexora-/pull/120) | K — maîtrise du dossier | — |
| [#121](https://github.com/nexorasolutionsfr/Nexora-/pull/121) | L — consolidation technique | — |

Les migrations de lot et leur contenu sont rappelés à la section 3 ; le
détail est dans `docs/architecture/nexora-auto-v1.md` et
`docs/architecture/nexora-auto-suivi.md`.

**Hors de l'espace Auto**, la pile ne modifie que :
- `app/globals.css` : une règle de focus limitée à `.espace-auto` ;
- `package.json` et `pnpm-lock.yaml` : ajout de `unpdf` 1.8.1, lecture du texte des PDF ;
- `supabase/tests/prelude_stockage_base_jetable.sql` : outil de banc, jamais exécuté en Production.

Aucune table, aucune route ni aucun écran de Nexora Pro n'est modifié.

## 2. Ne pas fusionner la pile PR par PR

Vercel déploie `main` à chaque fusion. Fusionner #110 puis #111… publierait
onze états intermédiaires, dont certains sont incomplets ou incohérents : des
écrans sans leur migration, ou la lecture de facture sans ses corrections.

**Stratégie recommandée : une seule fusion.**
1. Mettre à jour la branche du dernier lot (`auto/lot-l-consolidation`, ou `auto/livraison` qui ne fait qu'y ajouter ce document) avec `main` si `main` a avancé, puis rejouer les tests, le build et la recette sur Test.
2. Ouvrir **une** PR de cette branche vers `main`, relue en entier. Les PR #110 à #121 sont fermées avec la mention « intégrée dans #… » ; elles restent consultables lot par lot.
3. Appliquer les migrations en Production (section 3) **avant** la fusion.
4. Fusionner cette PR unique. Vercel déploie une seule fois l'état final.

Variante : changer la base de chaque PR pour la faire pointer sur la suivante,
puis fusionner en cascade dans la branche du haut, jamais dans `main`. Même
résultat, plus de manipulations.

## 3. Migrations en Production

**Ordre.** Les dix fichiers dans l'ordre de leur horodatage, de
`20260922000100_auto_mon_vehicule.sql` à `20260922001000_auto_import_fluide.sql`.
`supabase db push` les applique dans cet ordre, chacun dans sa propre
transaction.

**Compatibilité.**
- Tout est additif : tables `auto_*` nouvelles, fonctions `auto_*` nouvelles, compartiment de stockage `auto-documents` nouveau et privé.
- Aucune table existante n'est modifiée. `auto_partenaires.garage_id` référence `garages` en lecture seule, sans rien y changer.
- Le code actuellement en Production n'utilise aucun de ces objets : appliquer les migrations avant de déployer le code est sans effet visible.
- Les droits par défaut de Supabase (tout ouvert à `anon` et `authenticated` sur une nouvelle table) sont resserrés par `20260922000700`. **Ne jamais s'arrêter entre `000600` et `000700`** : appliquer l'ensemble en une fois.

**Procédure (à exécuter seulement sur décision).**
1. **Sauvegarde.**
   - Vérifier dans le tableau de bord Supabase la dernière sauvegarde automatique de la Production et son offre (restauration à un instant donné ou non).
   - Faire en plus un export du schéma et des données : `supabase db dump` (schéma), puis `supabase db dump --data-only`, sur un poste de confiance. Le résultat n'est jamais versé dans le dépôt.
2. **Lecture de l'état.** `supabase migration list` sur la Production : confirmer qu'aucune migration `202609220…` n'y figure et qu'aucune migration inattendue n'est en attente.
3. **Répétition.** Appliquer les dix fichiers sur une base jetable restaurée depuis le schéma de Production (méthode : mémoire « base jetable depuis le schéma Production »), puis passer `auto_droits_v1.sql` et les autres bancs Auto.
4. **Essai à blanc.** `supabase db push --dry-run` sur la Production : la liste doit être exactement les dix fichiers.
5. **Application.** `supabase db push`.
6. **Contrôles en lecture seule.**
   - `auto_droits_v1.sql` : compare les droits effectifs à la liste attendue et ne crée rien.
   - Relevé `auto_fichiers_orphelins.sql`.
   - Compartiment `auto-documents` présent, **privé**, 10 Mo, 6 types.
   - Les autres bancs (`auto_*_v1.sql`) créent des comptes fictifs dans une transaction annulée. Ne pas les passer en Production sans décision explicite.

**Variables d'environnement (Vercel, Production).**
- Déjà présentes pour Nexora Pro : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- `AUTO_LECTURE_FOURNISSEUR` : à laisser **absente**. Par défaut, la lecture est gratuite, sur le serveur (texte des PDF). `aucun` désactive toute lecture automatique.
- `AUTO_LECTURE_QUOTA_24H` : facultative, 10 par défaut, entre 1 et 50.
- **Ne pas définir** `ANTHROPIC_API_KEY`, `AUTO_LECTURE_BUDGET_USD` ni `AUTO_LECTURE_PRODUCTION`. La lecture payante est refusée en Production tant que `AUTO_LECTURE_PRODUCTION` ne vaut pas `oui`, et reste impossible sans clé ni budget.
- Route de lecture : `maxDuration = 60` s ; l'extraction s'arrête d'elle-même à 15 s.

## 4. Ordre de mise en ligne

1. Décision de lancement. `/auto` est public dès le déploiement : toute personne peut créer un compte. Il n'y a pas d'interrupteur de lancement : en ajouter un est une décision, voir le compte rendu.
2. Politique de confidentialité et mentions à jour pour Nexora Auto : documents privés, lecture sur le serveur, conservation, suppression du compte.
3. Sauvegarde, puis migrations (section 3).
4. Fusion de la PR unique ; déploiement Vercel.
5. Contrôles après déploiement (section 5).
6. Surveillance les premières heures : journaux Vercel de `/api/auto/*` (qui ne contiennent aucun texte de facture) et erreurs Supabase.

## 5. Contrôles après déploiement

Sans donnée personnelle réelle :

- `GET /api/auto/lecture` renvoie `{"disponible":true,"formats":["application/pdf"],"externe":false}`.
- `/auto` s'affiche sans session : accueil, lien de connexion. `/auto/connexion` s'affiche aussi.
- `/auto/vehicules/pas-un-identifiant` renvoie une page 404, sans appel à la base.
- `POST /api/auto/documents/<uuid>/lecture` sans session répond 401.
- Nexora Pro : le tableau de bord d'un garage s'ouvre normalement (aucun objet Pro n'a changé, contrôle de principe).
- Parcours complet (compte, voiture, facture PDF, confirmation, export, suppression) : seulement avec un **compte de recette en Production**, à décider. Il faudrait l'effacer ensuite, fichiers compris.

## 6. Retour arrière

**Code, sans perte de données.** Annuler la fusion (`git revert` du commit de
fusion dans `main`) ; Vercel redéploie l'état précédent. Les tables `auto_*`
et les fichiers restent en base, inutilisés. Un compte créé entre-temps garde
son dossier, qui revient si Nexora Auto est republié.

**Base.**
- Ne rien supprimer par défaut : les objets `auto_*` sont inertes sans le code.
- Si un défaut de migration impose un retour, chaque fichier décrit son retour arrière dans son en-tête. Par exemple, `20260922001000` recrée la fonction de confirmation sans le verrou, sans aucune donnée à reprendre.
- Ces retours arrière suppriment des objets et donc des données : ils ne s'appliquent qu'après un export (section 3) et sur décision.
- **Priorité en cas d'incident de droits** : réappliquer `20260922000700_auto_droits_resserres.sql`, idempotent, plutôt que défaire.

**Stockage.** Le compartiment `auto-documents` est privé. En cas de doute sur
son exposition : vérifier `public = false` et les politiques
`auto_documents_stockage_*`, sans le supprimer.

## 7. Ce qui n'est pas livré

- Aucune réservation, aucun paiement, aucun partenaire ni aucune offre : `auto_offres` est vide.
- Aucune lecture payante active.
- Aucun rappel envoyé hors de l'application : les rappels sont préparés, non branchés.
- Aucune suppression de compte : décisions listées au lot K du suivi.
