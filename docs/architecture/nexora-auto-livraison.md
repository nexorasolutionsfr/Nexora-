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
| [#123](https://github.com/nexorasolutionsfr/Nexora-/pull/123) | bêta privée : accès contrôlé, lint permanent, recette et données personnelles | `20260922001100` |

**Hors de l'espace Auto**, la pile ne modifie que :
- `app/globals.css` : une règle de focus limitée à `.espace-auto` ;
- `package.json` et `pnpm-lock.yaml` : `unpdf` en dépendance ; ESLint et ses règles en dépendances de développement ; script `lint:auto` ;
- `eslint.auto.config.mjs` : configuration limitée à Nexora Auto. `npm run lint` n'est pas modifié et échoue toujours faute de configuration globale, comme sur `main` ;
- `supabase/tests/prelude_stockage_base_jetable.sql` : outil de banc.

Aucune table, route ni aucun écran de Nexora Pro n'est modifié. Une politique restrictive est ajoutée sur `storage.objects`, mais elle ne s'applique qu'au compartiment `auto-documents`.

## 2. Préalable 1 : isoler les prévisualisations Vercel (à faire en premier)

**Constat du 17 septembre 2026.** Le code servi par une prévisualisation de
branche contient l'adresse Supabase `omphppsmhmyllapdqevn`, soit la
**Production**. Les variables de l'environnement « Preview » sont donc celles
de la Production, pour Nexora Auto comme pour Nexora Pro.

**Portée.** Nexora Auto se ferme désormais de lui-même sur une prévisualisation
reliée à la Production (`lib/auto/acces.js`). Cette protection ne vaut ni pour
Nexora Pro, ni pour les 87 prévisualisations déjà déployées : elles restent
reliées à la Production. Les réglages de Production ne changent pas.

### 2.1 Réglages à faire (Baptiste, dans Vercel)

Projet `nexora-dashboard` → **Settings** → **Environment Variables**. Pour
chaque variable, ne modifier que la valeur de l'environnement **Preview**
(laisser Production intacte).

| Variable | Lue par | Valeur Preview recommandée |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | navigateur et serveur | l'adresse du projet **Test** (`https://slawilafseganlbghgwx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | navigateur et serveur | clé publique du projet **Test** |
| `SUPABASE_SERVICE_ROLE_KEY` | serveur | clé de service du projet **Test** |
| `NEXT_PUBLIC_APP_URL` | liens absolus, redirections Stripe et Google | vide (le code retombe sur l'adresse de production) ou l'adresse de la prévisualisation |
| `STRIPE_SECRET_KEY` | routes d'abonnement | clé de **test** Stripe, ou vide : sans elle, les routes d'abonnement répondent une erreur au lieu de créer un paiement réel |
| `STRIPE_WEBHOOK_SECRET` | route de rappel Stripe | secret du point d'entrée de test, ou vide |
| `RESEND_API_KEY` | formulaire de démonstration | **vide** : sans elle, la demande n'est pas transmise (message dans les journaux) au lieu d'envoyer un e-mail réel |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_STATE_SECRET`, `NEXT_PUBLIC_GOOGLE_CALENDAR_CONNECT_URL` | connexion d'un agenda Google | vide, ou identifiants d'un client Google de test |
| `NEXT_PUBLIC_COCKPIT_OPPORTUNITES_ACTIF` | ancien indicateur d'affichage | inchangée |
| `AUTO_ACCES` | Nexora Auto | facultative ; `ferme` pour fermer Nexora Auto aussi sur les prévisualisations |
| `AUTO_LECTURE_FOURNISSEUR`, `AUTO_LECTURE_QUOTA_24H` | lecture des factures | absentes (lecture gratuite sur le serveur) |
| `ANTHROPIC_API_KEY`, `AUTO_LECTURE_BUDGET_USD`, `AUTO_LECTURE_PRODUCTION` | lecture payante | **absentes** |

**Points à vérifier pendant l'opération :**
- une variable peut être définie pour plusieurs environnements à la fois : vérifier que la ligne modifiée ne s'applique pas aussi à Production ;
- Vercel permet des valeurs propres à une branche (« Preview » + nom de branche) : parcourir la liste et traiter ces exceptions, sinon une branche continuerait d'utiliser la Production ;
- un changement de variable ne prend effet qu'au **déploiement suivant** : les prévisualisations existantes gardent leurs anciennes valeurs.

### 2.2 Vérifier qu'une prévisualisation est bien sur Test

Une route de contrôle a été ajoutée : **`/api/auto/environnement`**. Elle ne
renvoie aucune clé, seulement ce qui est déjà public ou d'exécution.

1. Pousser un commit sur une branche (ou relancer un déploiement depuis Vercel) **après** le changement de variables.
2. Ouvrir `https://<prévisualisation>.vercel.app/api/auto/environnement` (la protection Vercel s'applique).
3. Attendu :
   ```json
   {"environnement":"preview","base":"autre","projetSupabase":"slawilafseganlbghgwx","regionFonction":"dub1","branche":"…","accesAuto":"…"}
   ```
   `base: "production"` signifie que la prévisualisation est encore reliée à la Production : ne pas s'en servir.
4. Contrôle complémentaire, côté navigateur : la page `/auto/connexion` d'une prévisualisation ne doit plus contenir `omphppsmhmyllapdqevn` dans ses scripts.

### 2.3 Anciennes prévisualisations

- 87 prévisualisations existent (une par commit poussé). Toutes sont antérieures à la correction, donc **toutes reliées à la Production**.
- Elles restent servies tant qu'elles ne sont pas supprimées. À traiter : ne plus s'en servir pour la recette, et, si vous le souhaitez, les supprimer depuis Vercel (Deployments → … → Delete), au moins celles des branches `auto/*`.
- Une seule règle simple : **pour une recette, n'utiliser qu'une prévisualisation créée après la correction et vérifiée par la route ci-dessus.**

## 2 bis. Préalable 2 : région d'exécution en Europe

**Constat.** En Production, les routes serveur s'exécutent en `iad1`
(Washington, États-Unis), d'après l'en-tête `x-vercel-id`. Les deux bases
Supabase sont en `eu-west-1` (Irlande). Une facture lue automatiquement
serait donc traitée aux États-Unis.

**Ce qui est préparé.** `vercel.json` :

```json
{ "$schema": "https://openapi.vercel.sh/vercel.json", "regions": ["dub1"] }
```

- `dub1` est Dublin : la même région que les bases Supabase.
- `export const preferredRegion` (route par route) a été retiré : Next.js 16 l'a déprécié.
- **Une région par fonction n'est pas possible sur l'offre Hobby** : la documentation Vercel indique « Hobby : single region », et déployer plus de régions que l'offre ne permet fait échouer le déploiement. Le réglage est donc **commun à tout le projet**.

**Effet sur Nexora Pro.** Ses routes passeraient aussi en Irlande. Elles
parlent à la même base Supabase (Irlande), donc la latence diminue plutôt
qu'elle n'augmente. Les services externes (Stripe, Brevo, Resend, Google)
sont appelés en HTTPS depuis l'Europe, sans changement de fonctionnement.
État des contrôles (prévisualisation du 17 septembre 2026, commit `c7b77b4`) :

1. **Fait** — le déploiement réussit : l'offre accepte cette région unique.
2. **Fait** — `/api/auto/environnement` renvoie `"regionFonction":"dub1"`, et l'en-tête `x-vercel-id` montre `cdg1::dub1` (entrée à Paris, exécution à Dublin).
3. **À faire par Baptiste** — relire la page de facturation Vercel après le changement : la facturation dépend de l'usage, et `dub1` n'a pas de tarif majoré connu, mais cela reste à confirmer sur votre offre.
4. **Partiellement fait** — sur cette prévisualisation, la page d'accueil, le tableau de bord et `/auto` répondent 200, et `/auto` affiche bien « arrive bientôt » (la prévisualisation étant encore reliée à la Production, la garde de Nexora Auto s'est appliquée). Un parcours Nexora Pro connecté reste à faire par Baptiste, avec ses identifiants.

Si l'un de ces points échoue, retirer `vercel.json` : le projet revient à
`iad1`, et la décision D2 doit alors être écrite explicitement dans la
politique de confidentialité.

## 2 ter. Préalable 3 : textes et décisions

Politique de confidentialité et conditions d'utilisation pour Nexora Auto,
durées de conservation : voir `nexora-auto-donnees-personnelles.md`,
décisions D1 à D8.

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
| Fermeture | `node scripts/recette/fermeture-beta.mjs http://localhost:3114` | 14/14, mode remis à l'identique |
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

## 8. Fermer : deux gestes qui ne font pas la même chose

Mesuré le 17 septembre 2026 sur Test (`scripts/recette/fermeture-beta.mjs`,
14 contrôles, et un essai à la main pour la fermeture applicative).

| | **Fermeture en base** `update auto_acces_parametres set mode = 'ferme'` | **Fermeture applicative** `AUTO_ACCES=ferme` sur Vercel |
| --- | --- | --- |
| Effet | immédiat, sans redéploiement | au redéploiement |
| Écrans `/auto` | « arrive bientôt » | « arrive bientôt » |
| Routes `/api/auto/*` | 403 | 403 |
| Session déjà ouverte, **lecture directe de la base** | **plus rien** (0 ligne) | **continue de fonctionner** |
| Session déjà ouverte, **écriture directe** | refusée | **acceptée** |
| Fichiers jamais téléchargés | refusés | accessibles |
| Nouvelles adresses signées | refusées | délivrées |
| À utiliser pour | **couper l'accès aux données** | retirer l'application de l'affiche |

**La seule fermeture qui protège les données est celle de la base.** La
variable d'environnement ferme l'application, pas la base : un onglet déjà
ouvert parle directement à Supabase.

**Limite mesurée du stockage.** Les fichiers privés sont servis derrière un
cache (`Cache-Control: public, max-age=3600`). Après une fermeture :
- un fichier **jamais téléchargé** est refusé ;
- un **autre compte** est refusé, même sur un fichier déjà mis en cache ;
- mais **la même session** peut encore recevoir un fichier qu'elle avait déjà téléchargé, pendant au plus une heure. Poser `cacheControl: "0"` au dépôt n'y change rien (vérifié).
- Si une révocation doit être immédiate au fichier près : supprimer le document (le fichier part du stockage), ou le déplacer, ce qui change son chemin.

**Retirer une personne de la bêta** (`delete from auto_acces_beta …`) a le
même effet immédiat que la fermeture, pour cette personne seulement : ses
données restent en base, elle n'y accède plus.

## 8 bis. Revenir en arrière

**Code, sans perte de données** : `git revert` du commit de fusion dans `main`.
Les tables `auto_*` et les fichiers restent, inertes.

**Base** : ne rien supprimer par défaut.
- Chaque migration décrit son retour arrière dans son en-tête ; ces retours suppriment des objets, donc ne s'appliquent qu'après un export et sur décision.
- En cas de doute sur les droits : réappliquer `20260922000700` et `20260922001100`, toutes deux idempotentes.

**Région** : retirer `vercel.json` ramène le projet à `iad1`.

**Stockage** : `auto-documents` doit rester privé ; vérifier `public = false` et
les politiques `auto_documents_stockage_*`, sans supprimer le compartiment.

## 9. Ce qui n'est pas livré

- Aucune réservation, aucun paiement, aucun partenaire ni aucune offre.
- Aucune lecture payante.
- Aucun rappel envoyé hors de l'application.
- Aucune invitation envoyée par Nexora.
- Aucune suppression de compte depuis l'application (décision D3).
