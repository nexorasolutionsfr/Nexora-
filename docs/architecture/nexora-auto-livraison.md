# Nexora Auto — document de livraison

Mis à jour le 17 septembre 2026, au soir, **pendant la mise en ligne**
autorisée par Baptiste.

**Où nous en sommes.**

| Étape | État |
| --- | --- |
| Simplification grand public (quatre espaces, « Aujourd'hui », « Compte », confidentialité) | **faite** |
| Sauvegarde de la Production (schéma, rôles, données) | **faite** |
| Répétition des onze migrations sur une copie du schéma réel de Production | **faite**, 11/11 |
| Migrations en Production | **appliquées** le 17 septembre 2026 ; Nexora Auto reste **fermé** (`mode = 'ferme'`) |
| Fusion unique dans `main` et déploiement | **faite** : PR [#124](https://github.com/nexorasolutionsfr/Nexora-/pull/124), puis deux correctifs trouvés par la recette ([#125](https://github.com/nexorasolutionsfr/Nexora-/pull/125), [#126](https://github.com/nexorasolutionsfr/Nexora-/pull/126)) |
| Ouverture de l'accès | **faite en mode `beta`** : `https://nexora-garage.vercel.app/auto` est en ligne, ouvert aux adresses invitées (section 7) |
| Variables « Preview » de Vercel | **à faire par Baptiste** (section 2) : aucun jeton d'API Vercel n'est disponible ici |

## 1. Ce qui est livré

Quatorze PR en brouillon, empilées : chacune a pour base la précédente, et #110
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
| — (branche `auto/livraison-b2c`) | simplification grand public : quatre espaces, « Aujourd'hui », « Compte », confidentialité | — |

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

### 2.1 Réglages à faire — la liste exacte, relevée dans Vercel

**Relevé le 17 septembre 2026** dans `nexora-dashboard` → Settings →
Environment Variables, filtre « Preview ». Aucune valeur n'a été lue : seuls
les noms, les environnements et les dates. **L'environnement Preview compte
exactement dix variables** :

| # | Variable | Dernière modification | Ce qu'il faut en faire |
| --- | --- | --- | --- |
| 1 | `NEXT_PUBLIC_SUPABASE_URL` | 14 août | **remplacer** par l'adresse du projet **Test** |
| 2 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 14 août | **remplacer** par la clé publique de **Test** |
| 3 | `SUPABASE_SERVICE_ROLE_KEY` | 26 août | **remplacer** par la clé de service de **Test** |
| 4 | `RESEND_API_KEY` | 5 sept. | **supprimer** la ligne Preview : sans elle, la demande de démonstration est journalisée au lieu d'être envoyée. Une prévisualisation ne peut plus écrire à personne |
| 5 | `STRIPE_SECRET_KEY` | 5 sept. | **supprimer** la ligne Preview, ou mettre une clé de **test** Stripe : sans elle, les routes d'abonnement répondent une erreur au lieu de créer un paiement réel |
| 6 | `STRIPE_WEBHOOK_SECRET` | 5 sept. | **supprimer** la ligne Preview, ou le secret du point d'entrée de test |
| 7 | `GOOGLE_CLIENT_ID` | 26 août | laisser, ou vider si vous ne testez pas l'agenda |
| 8 | `GOOGLE_CLIENT_SECRET` | 29 août | idem |
| 9 | `OAUTH_STATE_SECRET` | 27 août | laisser (c'est un secret de signature, pas un accès à des données) |
| 10 | `NEXT_PUBLIC_COCKPIT_OPPORTUNITES_ACTIF` | 31 août | **laisser** : c'est la seule exception par branche, sur `feature/cockpit-opportunites-v1`, et c'est un simple indicateur d'affichage |

**Deux constats qui simplifient le travail :**

- **Aucune variable Supabase n'a d'exception par branche.** La seule exception
  qui existe porte sur un indicateur d'affichage. Il n'y a donc rien à
  traquer : les trois lignes Supabase « Preview » gouvernent toutes les
  prévisualisations.
- Chaque variable a **une ligne par environnement** (Production, Preview,
  Development séparées). Modifier la ligne « Preview » ne touche donc pas la
  Production — vérifiez tout de même l'étiquette de la ligne avant d'agir.

**Ce que je n'ai pas fait, et pourquoi.** Les trois premières demandent
d'écrire des clés : je ne saisis pas vos secrets. Les lignes 4 à 6 se
règlent par une suppression, sans secret — mais supprimer trois clés de votre
projet Vercel sans que vous soyez devant, à partir d'une liste filtrée que je
ne peux pas revérifier au moment du clic, met en jeu le paiement et les envois
de Nexora Pro si je me trompe de ligne. Je m'arrête donc ici : ces six gestes
prennent deux minutes avec la liste ci-dessus sous les yeux.

**Effet immédiat, à ne pas oublier** : un changement de variable ne s'applique
qu'au **déploiement suivant**. Les prévisualisations déjà construites gardent
leurs anciennes valeurs.

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

## 5. Migrations en Production — **appliquées le 17 septembre 2026**

**Ordre** : les onze fichiers, de `20260922000100_auto_mon_vehicule.sql` à
`20260922001100_auto_acces_beta.sql`, dans l'ordre d'horodatage. `supabase db push`
les applique dans cet ordre, chacun dans sa transaction.

**Compatibilité, vérifiée avant l'application.**
- Tout est additif : tables et fonctions `auto_*` nouvelles, compartiment privé `auto-documents` nouveau.
- Relevé des instructions : hors de l'espace Auto, les onze fichiers ne contiennent que l'insertion du compartiment `auto-documents` et quatre politiques `auto_documents_stockage_*` sur `storage.objects`. Tous les `grant` et `revoke` portent sur des tables `auto_*`.
- La politique **restrictive** ajoutée sur `storage.objects` permet tout ce qui n'est pas dans `auto-documents` (`bucket_id <> 'auto-documents' or …`) : les fichiers de Nexora Pro ne sont pas concernés.
- `auto_partenaires.garage_id` référence `garages` sans le modifier.
- Le code alors en Production n'utilisait aucun de ces objets.
- `001100` ferme l'accès par défaut : même si le code arrivait avant la décision d'ouvrir, aucune donnée Nexora Auto ne serait lisible ni modifiable.

**Ce qui a été fait, dans cet ordre.**

1. **Sauvegardes.** `supabase backups list --project-ref omphppsmhmyllapdqevn` répond
   `walg_enabled: true`, `pitr_enabled: false`, et **`backups: []`** — aucune
   sauvegarde restaurable n'est listée pour ce projet. Trois exports ont donc
   été pris avant toute écriture : schéma (10 175 lignes), rôles, et données
   (41 tables, dont `garages`, `clients`, `vehicules`, `factures`, `auth.users`).
   Ils contiennent des données réelles : ils sont restés **hors du dépôt**, sur
   le poste de Baptiste, avec leurs empreintes SHA-256. Base de 16 Mo.
2. **État.** `supabase migration list` : dernière migration `20260921000200`, aucune
   `202609220…`, et **aucune table `auto_`** (`information_schema.tables` : « AUCUNE »).
   Le diff local/distant donnait exactement les onze fichiers, et rien d'autre
   n'était en attente.
3. **Répétition.** Base jetable neuve (image `supabase/postgres:17.6.1.166`)
   chargée avec le **schéma réel de la Production** (55 tables, 150 fonctions,
   90 politiques), maquette `auth.users.email_confirmed_at` et maquette minimale
   du schéma `storage` (`supabase/tests/prelude_stockage_base_jetable.sql` — l'image
   n'a pas de schéma `storage`, et le dump du schéma public ne le porte pas),
   droits ramenés à l'état déclaré par la Production. Résultat : **11 migrations
   sur 11 appliquées**, 15 tables `auto_`, 33 politiques `auto_`, compartiment
   privé de 10 Mo et 6 types, mode par défaut `ferme`, **8 bancs SQL Auto à 0**,
   et Nexora Pro intact (55 tables, 90 politiques). Script rejouable :
   `repetition-prod.sh` (hors dépôt, décrit ici).
4. **Essai à blanc.** `supabase db push --dry-run` : exactement les onze fichiers,
   aucune graine, aucun rôle.
5. **Application.** `supabase db push` depuis un miroir jetable hors dépôt, dont
   le dossier `supabase/migrations` a été **vidé juste après**, pour qu'aucun
   `push` accidentel n'ait de quoi s'appliquer.
6. **Contrôles en lecture, sur la Production.**

| Contrôle | Attendu | Constaté |
| --- | --- | --- |
| Tables `auto_` | 15 | **15** |
| Politiques `auto_` (schéma public) | 33 | **33** |
| Politiques `auto_*` sur `storage.objects` | 4 | **4** |
| Mode d'accès | `ferme` | **`ferme`** |
| Adresses invitées | 0 | **0** |
| Compartiment `auto-documents` | privé, 10 Mo, 6 types | **privé, 10 485 760 octets, 6 types** |
| Banc `auto_droits_v1.sql` | code 0 | **code 0** |
| Fichiers orphelins | 0 et 0 | **0 et 0** |
| Tables de Nexora Pro | 57, inchangées | **57** |
| Politiques de Nexora Pro | 90, inchangées | **90** |
| Données de Nexora Pro | inchangées | **1 garage, 4 clients, 9 véhicules, 1 facture, 16 devis, 1 compte** |

**Variables d'environnement (Vercel, Production).**
- Existantes : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- `AUTO_ACCES` : absente. `AUTO_ACCES=ferme` est l'interrupteur d'urgence : il ferme Nexora Auto quel que soit le mode en base, et prend effet au redéploiement. Aucune valeur de cette variable n'ouvre l'accès.
- `AUTO_LECTURE_FOURNISSEUR` : absente, ce qui donne la lecture gratuite sur le serveur. `aucun` coupe la lecture automatique.
- `AUTO_LECTURE_QUOTA_24H` : facultative (10 par défaut).
- **Ne pas définir** `ANTHROPIC_API_KEY`, `AUTO_LECTURE_BUDGET_USD` ni `AUTO_LECTURE_PRODUCTION`.

## 6. Après le déploiement : ce qui a été vérifié en vrai

### 6.1 Nexora Auto fermé (juste après la fusion)

| Contrôle | Attendu | Constaté |
| --- | --- | --- |
| `/auto` et `/auto/connexion` | « Nexora Auto arrive bientôt » | **oui**, 200 |
| `GET /api/auto/lecture` | `{"disponible":false,…}` | **`{"disponible":false,"formats":[],"externe":false}`** |
| `POST /api/auto/documents/<uuid>/lecture` | 403 | **403 `{"etat":"acces_ferme"}`** |
| `POST /api/auto/inscription` | 403 | **403 `{"etat":"ferme"}`** (aucun e-mail parti) |
| `/api/auto/environnement` | production, base production, `dub1` | **`{"environnement":"production","base":"production","projetSupabase":"omphppsmhmyllapdqevn","regionFonction":"dub1","branche":"main","accesAuto":"ferme"}`** |
| Nexora Pro : `/`, `/dashboard`, `/confidentialite`, `/mentions-legales` | 200 | **200** ; pages dynamiques exécutées à Dublin (`cdg1::dub1`) |
| `nexorasolutions.fr` | 200 | **200** |

**La région est confirmée en Production** : `dub1`. La décision D2 est donc
applicable telle qu'écrite, et la page de confidentialité peut dire « Vercel,
en Irlande ».

### 6.2 Nexora Pro et la politique restrictive du stockage

Éprouvé **sur la Production**, dans une transaction annulée, avec le rôle
`authenticated` et l'identité du dirigeant du garage réel :

| Contrôle | Attendu | Constaté |
| --- | --- | --- |
| Dépôt d'une photo dans `inspections-photos`, au chemin du garage | accepté | **accepté** |
| Relecture de cette photo | lisible | **lisible** |
| Dépôt dans `auto-documents`, Nexora Auto fermé | refusé | **refusé** |
| Lecture de `auto_vehicules`, Nexora Auto fermé | 0 ligne | **0 ligne** |
| Écriture dans `auto_vehicules`, Nexora Auto fermé | refusée | **refusée** |

Piège rencontré : un premier essai avec un chemin quelconque a été refusé — non
par la politique de Nexora Auto, mais par celle de Nexora Pro, qui exige
`<identifiant du garage>/…`. Le refus prouvait donc que Pro garde sa propre
règle, pas qu'Auto l'avait cassée. Un contrôle de sécurité qui échoue se relit
avant de se conclure.

### 6.3 Parcours complet sur l'URL publique, Nexora Auto en bêta

Compte fictif `…@nexora-recette.invalid`, invité puis supprimé.

| # | Contrôle | Constaté |
| --- | --- | --- |
| 1 | Accueil public | « Votre voiture. Une seule app. », pastille « bêta privée » |
| 2 | Inscription d'une adresse **non invitée** | réponse identique `{"etat":"demande_recue"}`, et **aucun compte créé** |
| 3 | Inscription d'une adresse **invitée** | compte créé, `confirmation_sent_at` renseigné : l'envoi a été accepté |
| 4 | Lien de confirmation réel | 303 vers `…/auto#access_token=…` : compte confirmé, session ouverte |
| 5 | Ajout d'une voiture avec **marque et modèle seulement** | dossier créé, écrans « à compléter » honnêtes |
| 6 | Import d'une facture PDF fictive | lu gratuitement sur le serveur : date, kilométrage (84 500), montant (335 €), « révision » ; le prestataire mal lu était marqué « à vérifier » et corrigé à la main |
| 7 | Historique, montant, document | une intervention, **335 € comptés une fois**, document rattaché, titre suivant le prestataire corrigé |
| 8 | Document privé | URL publique et URL brute : **400** ; adresse signée de **5 minutes** : 200, fichier identique au bit près ; jeton altéré : **400** |
| 9 | Déconnexion et reconnexion | session effacée, voiture consultée oubliée, reconnexion ramenant à l'écran quitté |
| 10 | Affichage mobile (375 px) | les quatre onglets sur une ligne, aucun défaut |
| 11 | Suppression de la voiture | avertissement nommant ce qui sera effacé, puis 0 voiture, 0 document, **0 fichier**, 0 orphelin |

**Deux défauts trouvés par cette recette, corrigés et redéployés :**

1. Un lien de confirmation périmé ramenait sur `/auto`, qui ne savait pas lire
   le fragment d'erreur : la personne voyait « Ajoutez votre voiture » sans un
   mot sur le lien mort (PR #125).
2. Après « Se déconnecter », l'écran de connexion disait « Connectez-vous pour
   reprendre là où vous en étiez » — le message d'une session expirée, pas d'un
   départ voulu (PR #126).

### 6.3 bis Recette finale, depuis une session neuve (nuit du 17 au 18 sept.)

Compte créé **par l'inscription publique**, confirmé par le **vrai lien de
confirmation**, puis supprimé avec toutes ses données.

| # | Contrôle | Constaté |
| --- | --- | --- |
| 1 | Découvrir l'accueil | « Votre voiture. Une seule app. », pastille « bêta privée », l'exemple et les quatre promesses |
| 2 | Se connecter | le lien de confirmation ouvre la session sur `/auto`, fragment nettoyé, écran « Bienvenue / Ajouter ma voiture » |
| 3 | Ajouter deux voitures | une complète (marque, modèle, année, plaque), une **avec la marque et le modèle seulement** ; la première est « principale » |
| 4 | Ajouter un document | facture PDF lue gratuitement : date, kilométrage 84 500, montant 335 €, « révision », deux opérations |
| 5 | Confirmer l'intervention | prestataire mal lu marqué « à vérifier », corrigé à la main, puis enregistré |
| 6 | Dépenses et historique | une intervention, **335 € comptés une fois**, kilométrage repris, document rattaché |
| 7 | Comprendre « Aujourd'hui » | la voiture consultée, une seule action mise en avant, « 1 autre échéance », quatre raccourcis |
| 8 | Retrouver le document | présent dans le dossier et dans l'export, avec la mention « justifie : Révision du 2 sept. 2026 » |
| 9 | Quitter puis revenir | déconnexion vers l'accueil, reconnexion par mot de passe, **dossier intact** ; la voiture consultée est oubliée à la sortie (appareil partagé) |
| 10 | Dossier incomplet | les deux voitures affichent « CT à compléter », « Révision à compléter » — jamais « tout va bien » |
| 11 | Plusieurs voitures | pastilles de choix, et « Vos autres voitures » quand une autre porte une échéance qui presse |

**Un défaut trouvé par cette recette, corrigé :** la facture portait la plaque
de la Peugeot 308 et a été enregistrée sur la Toyota Yaris sans un mot. La
voiture regardée n'ayant pas de plaque, la comparaison existante n'avait rien
à comparer. L'écran cherche désormais la plaque lue dans **tout le garage** et
nomme la voiture concernée.

**Nettoyage :** compte, voitures, document, fichier supprimés. Production
vérifiée après coup : 0 compte fictif, 0 voiture, 0 document, 0 fichier,
0 journal rattaché à une personne.

### 6.4 Ce qui n'a pas pu être vérifié

**La réception d'un e-mail dans une vraie boîte.** Aucun message n'a été
envoyé à une personne réelle. Ce qui est établi : Supabase a **accepté**
l'envoi (`confirmation_sent_at` renseigné, ce que le service par défaut
refuserait pour une adresse hors équipe), l'adresse de retour `/auto` est bien
autorisée dans Supabase (une adresse non autorisée retombe sur `/dashboard`),
et le lien de confirmation fonctionne de bout en bout. Le seul maillon non
éprouvé est le trajet Brevo → boîte de réception ; la première inscription de
Baptiste le prouvera en une fois.

## 7. Ouverture progressive

Les commandes SQL se passent dans l'éditeur SQL du projet de Production.
**Ajouter une adresse n'envoie aucun message.**

**État au 18 septembre 2026** : mode `beta`, deux adresses invitées —
`nexorasolutions.france@gmail.com` et `baptiste.papoul52@gmail.com`. Aucun
message n'a été envoyé.

**Les deux adresses n'entrent pas par la même porte**, et c'est important :

| Adresse | Ce qu'il faut faire | Pourquoi |
| --- | --- | --- |
| `baptiste.papoul52@gmail.com` | **« J'ai déjà un compte » → Se connecter**, avec le mot de passe Nexora habituel | ce compte **existe déjà** en Production (c'est celui de Nexora Pro), confirmé et déjà utilisé. Vérifié sans s'y connecter, dans une transaction annulée : `auto_etat_acces()` rend `{"mode":"beta","autorise":true}`. Aucun e-mail n'est nécessaire, l'accès est immédiat |
| `nexorasolutions.france@gmail.com` | **« Créer mon compte »**, puis confirmer l'e-mail reçu | aucun compte n'existe pour cette adresse |

Passer par « Créer mon compte » avec une adresse qui a **déjà** un compte ne
mène nulle part : par protection contre l'énumération, Supabase répond comme
si tout allait bien et n'envoie pas de lien utilisable.

**Conséquence à assumer :** avec la première adresse, le même compte ouvre
Nexora Pro et Nexora Auto. Les données restent séparées (tables `auto_*`,
règles par personne), mais c'est une seule connexion. Pour les séparer, il
faudrait un second compte avec une autre adresse.

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
