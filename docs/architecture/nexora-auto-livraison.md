# Nexora Auto — document de livraison

Mis à jour le 17 septembre 2026, avec la bêta privée. **Procédure préparée,
rien n'a été exécuté en Production** : aucune fusion dans `main`, aucune
migration en Production, aucun déploiement, aucune invitation. Chaque étape
attend une décision explicite.

## 1. Ce qui est livré

Treize PR en brouillon, empilées : chacune a pour base la précédente, et #110
a pour base `main` (`349652e`, ancêtre de toute la pile).

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
| [#122](https://github.com/nexorasolutionsfr/Nexora-/pull/122) | livraison et compte rendu | — |
| PR « bêta privée » (`auto/beta-privee`) | accès contrôlé, lint permanent, recette et données personnelles | `20260922001100` |

**Hors de l'espace Auto**, la pile ne modifie que :
- `app/globals.css` : une règle de focus limitée à `.espace-auto` ;
- `package.json` et `pnpm-lock.yaml` : `unpdf` en dépendance ; ESLint et ses règles en dépendances de développement ; script `lint:auto` ;
- `eslint.auto.config.mjs` : configuration limitée à Nexora Auto. `npm run lint` n'est pas modifié et échoue toujours faute de configuration globale, comme sur `main` ;
- `supabase/tests/prelude_stockage_base_jetable.sql` : outil de banc.

Aucune table, route ni aucun écran de Nexora Pro n'est modifié. Une politique restrictive est ajoutée sur `storage.objects`, mais elle ne s'applique qu'au compartiment `auto-documents`.

## 2. Préalables

1. **Prévisualisations Vercel.**
   - Constat du 17 septembre 2026 : elles utilisent la base de **Production** (adresse Supabase `omphppsmhmyllapdqevn` lue dans le code servi).
   - Tant que ce n'est pas corrigé, **aucune recette sur une URL de prévisualisation**. Nexora Auto s'y ferme de lui-même (`lib/auto/acces.js`), mais Nexora Pro reste exposé à la base de Production depuis ces URL.
   - Manipulation (Baptiste, dans Vercel) : projet `nexora-dashboard` → *Settings* → *Environment Variables*. Pour l'environnement **Preview** seulement, remplacer `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` par les valeurs du projet **Test** (`slawilafseganlbghgwx`).
   - Autre possibilité : désactiver les prévisualisations automatiques des branches.
   - Contrôle ensuite : ouvrir une prévisualisation et vérifier que le code servi contient `slawilafseganlbghgwx`. Le contrôle déjà fait lisait les scripts de la page, sans rien saisir.
2. **Région des fonctions Vercel** (décision D2 de `nexora-auto-donnees-personnelles.md`) : aujourd'hui `iad1` (États-Unis). À décider avant d'ouvrir la lecture de factures à des personnes extérieures.
3. **Textes** : politique de confidentialité et conditions d'utilisation pour Nexora Auto (décisions D1 à D7).

## 3. Une seule fusion, jamais la pile PR par PR

Vercel déploie `main` à chaque fusion : fusionner #110, puis #111… publierait
des états intermédiaires incomplets.

1. **Branche finale** : `auto/beta-privee`, qui contient tout. Si `main` a avancé, la mettre à jour avec `main`, puis rejouer la recette complète (section 4) sur Test.
2. **Une seule PR** de cette branche vers `main`, relue en entier. Fermer #110 à #122 et la PR bêta avec la mention « intégrée dans #… ».
3. **Migrations en Production avant la fusion** (section 5). Nexora Auto reste **fermé** : le mode par défaut de `20260922001100` est `ferme`.
4. **Fusion unique** : Vercel déploie une fois l'état final, et `/auto` affiche « Nexora Auto arrive bientôt ».
5. **Ouverture progressive**, séparée du déploiement : bêta interne, puis bêta externe (section 7).

## 4. Recette complète de la version cumulée (sur Test)

À rejouer sur la branche finale juste avant la PR unique :

| Contrôle | Commande | Attendu |
| --- | --- | --- |
| Tests | `node --test lib/auto/*.test.js lib/auto/lecture/*.test.js components/auto/*.test.js` | tout passe (148 au 17 sept.) |
| Lint | `npm run lint:auto` | 0 problème |
| Build | `npx next build` | réussi |
| Bancs SQL | chaque `supabase/tests/auto_*_v1.sql` via `supabase db query --linked -f` | code de sortie 0 |
| Accès croisés et bêta | `node scripts/recette/acces-croises.mjs http://localhost:3114` | 55/55 en mode bêta |
| Simultanéité | `node scripts/recette/factures/concurrence.mjs 20` | A 20/20, B 20/20, C 10/10 |
| Écrans | `audit-ecrans.mjs` et `audit-texte-agrandi.mjs` sur les écrans principaux | aucun défaut |
| Fichiers orphelins | `supabase/tests/auto_fichiers_orphelins.sql` | 0 et 0 |
| Recette humaine | `nexora-auto-recette-beta.md`, temps A | relevés remplis |

## 5. Migrations en Production

**Ordre** : les onze fichiers, de `20260922000100_auto_mon_vehicule.sql` à
`20260922001100_auto_acces_beta.sql`, dans l'ordre d'horodatage. `supabase db push`
les applique dans cet ordre, chacun dans sa transaction.

**Compatibilité.**
- Tout est additif : tables et fonctions `auto_*` nouvelles, compartiment privé `auto-documents` nouveau.
- Aucune table existante n'est modifiée ; `auto_partenaires.garage_id` référence `garages` sans le changer.
- Le code en Production n'utilise aucun de ces objets.
- Ne jamais s'arrêter entre `000600` et `000700`, qui resserre les droits par défaut de Supabase.
- `001100` ferme l'accès par défaut : même si le code arrivait avant la décision d'ouvrir, aucune donnée Nexora Auto ne serait lisible ni modifiable.

**Procédure (sur décision).**
1. **Sauvegarde.** Vérifier la dernière sauvegarde automatique et l'offre Supabase, puis exporter sur un poste de confiance : `supabase db dump`, et `supabase db dump --data-only`. Ces exports ne vont jamais dans le dépôt.
2. **État.** `supabase migration list` sur la Production : aucune migration `202609220…` ne doit apparaître.
3. **Répétition.** Appliquer les onze fichiers sur une base jetable issue du schéma de Production, puis passer les bancs Auto.
4. **Essai à blanc.** `supabase db push --dry-run` : exactement les onze fichiers.
5. **Application.** `supabase db push`.
6. **Contrôles en lecture seule.**
   - `auto_droits_v1.sql`.
   - Relevé des fichiers orphelins.
   - `select mode from public.auto_acces_parametres` doit renvoyer `ferme`.
   - Compartiment `auto-documents` privé, 10 Mo, 6 types.
   - Les autres bancs créent des comptes fictifs dans une transaction annulée : ne pas les passer en Production sans décision.

**Variables d'environnement (Vercel, Production).**
- Existantes : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- `AUTO_ACCES` : absente. `AUTO_ACCES=ferme` est l'interrupteur d'urgence : il ferme Nexora Auto quel que soit le mode en base, et prend effet au redéploiement. Aucune valeur de cette variable n'ouvre l'accès.
- `AUTO_LECTURE_FOURNISSEUR` : absente, ce qui donne la lecture gratuite sur le serveur. `aucun` coupe la lecture automatique.
- `AUTO_LECTURE_QUOTA_24H` : facultative (10 par défaut).
- **Ne pas définir** `ANTHROPIC_API_KEY`, `AUTO_LECTURE_BUDGET_USD` ni `AUTO_LECTURE_PRODUCTION`.

## 6. Contrôles après déploiement, Nexora Auto fermé

- `/auto` et `/auto/connexion` affichent « Nexora Auto arrive bientôt ».
- `GET /api/auto/lecture` renvoie `{"disponible":false,"formats":[],"externe":false}`.
- `POST /api/auto/documents/<uuid>/lecture` renvoie 403 (`acces_ferme`).
- `POST /api/auto/inscription` renvoie 403 (`ferme`).
- Nexora Pro : le tableau de bord d'un garage s'ouvre normalement, et ses fichiers aussi (contrôle de la politique de stockage).

## 7. Ouverture progressive

Les commandes SQL se passent dans l'éditeur SQL du projet de Production, par
Baptiste. **Ajouter une adresse n'envoie aucun message.**

**Bêta interne.**
```sql
update public.auto_acces_parametres set mode = 'beta';
insert into public.auto_acces_beta (email, note) values ('<adresse de Baptiste>', 'bêta interne');
```
Baptiste crée son compte depuis `/auto/connexion?mode=inscription` et reçoit l'e-mail de confirmation habituel. Il déroule ensuite le parcours de `nexora-auto-recette-beta.md`.
- Contrôles : écran « Accès réservé » avec un autre compte non invité ; même message neutre à l'inscription pour une adresse non invitée ; route de lecture en 403 pour ce compte.

**Bêta externe** (après les préalables de la section 2) :
```sql
insert into public.auto_acces_beta (email, note) values ('<adresse>', '<qui, pourquoi>');
```
Baptiste prévient lui-même chaque personne invitée.

**Retirer une personne** :
```sql
delete from public.auto_acces_beta where email = '<adresse>';
```
Son compte et ses données restent, mais elle n'y accède plus (décision D3 pour l'effacement).

**Ouverture à tous** (décision distincte) : `update public.auto_acces_parametres set mode = 'ouvert';`

## 8. Fermer en urgence, revenir en arrière

**Fermer sans redéployer** : `update public.auto_acces_parametres set mode = 'ferme';`.
Effet immédiat sur les données, et sur les écrans à la requête suivante.

**Fermer sans toucher à la base** : variable `AUTO_ACCES=ferme` sur Vercel, puis
redéploiement.

**Code, sans perte de données** : `git revert` du commit de fusion dans `main`.
Les tables `auto_*` et les fichiers restent, inertes.

**Base** : ne rien supprimer par défaut.
- Chaque migration décrit son retour arrière dans son en-tête ; ces retours suppriment des objets, donc ne s'appliquent qu'après un export et sur décision.
- En cas de doute sur les droits : réappliquer `20260922000700` et `20260922001100`, toutes deux idempotentes.

**Stockage** : `auto-documents` doit rester privé ; vérifier `public = false` et
les politiques `auto_documents_stockage_*`, sans supprimer le compartiment.

## 9. Ce qui n'est pas livré

- Aucune réservation, aucun paiement, aucun partenaire ni aucune offre.
- Aucune lecture payante.
- Aucun rappel envoyé hors de l'application.
- Aucune invitation envoyée par Nexora.
- Aucune suppression de compte depuis l'application (décision D3).
