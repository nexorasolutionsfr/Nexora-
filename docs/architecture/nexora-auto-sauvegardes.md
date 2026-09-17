# Sauvegardes Nexora — ce qui existe, ce qui manque, comment restaurer

Établi le 17 septembre 2026, en **éprouvant** les exports plutôt qu'en les
décrivant.

## 1. Le point de départ : il n'y a pas de filet

```
supabase backups list --project-ref omphppsmhmyllapdqevn
→ {"walg_enabled": true, "pitr_enabled": false, "backups": []}
```

**Aucune sauvegarde restaurable n'est listée** pour le projet de Production.
`walg_enabled` dit que l'archivage interne de Supabase tourne, mais rien ne
nous est proposé à la restauration, et la restauration dans le temps (PITR)
est désactivée. Tant que cela ne change pas, **la seule sauvegarde est celle
que nous prenons nous-mêmes.**

## 2. Prendre une sauvegarde

```bash
bash scripts/sauvegarde/sauvegarder.sh production ~/Sauvegardes/nexora
```

Quatre parties, dans un dossier daté, avec un manifeste :

| Fichier | Contenu |
| --- | --- |
| `schema.sql` | le schéma **public** (70 tables au 17 sept.) |
| `roles.sql` | les rôles de la base |
| `donnees.sql` | les données de `public`, `auth` et `storage` |
| `stockage/` | **les fichiers eux-mêmes**, compartiment par compartiment |

Le script refuse d'écrire dans le dépôt, refuse de démarrer sans Docker (sans
lui, `supabase db dump` laisse des fichiers **vides** en silence), et refuse de
se déclarer réussi si un export est vide. Il ne parle à aucun service
extérieur : tout reste dans le dossier indiqué.

**Éprouvé le 17 septembre 2026 sur Test** : 70 tables, 61 tables portant des
lignes, **33 fichiers** descendus. Et sur la Production : 70 tables, 49 tables
portant des lignes, 0 fichier (le compartiment `auto-documents` est encore
vide).

## 3. Ce qu'une sauvegarde couvre, et ce qu'elle ne couvre pas

| | Couvert ? |
| --- | --- |
| Données métier (garages, clients, véhicules, devis, factures, dossiers Auto) | **oui** |
| Comptes : adresses, **mots de passe hachés**, métadonnées, identités, sessions | **oui**, dans `donnees.sql` |
| Fichiers déposés (factures, photos d'inspection) | **oui**, depuis ce script — **non** avec un simple `db dump` |
| Schéma `public`, fonctions, politiques RLS | **oui** |
| Schéma des espaces `auth` et `storage` | **non** — Supabase les fournit lui-même |
| Réglages du projet : SMTP, adresses de redirection, secrets | **non** — à noter à part |
| Variables d'environnement Vercel | **non** — à noter à part |
| Journaux des prestataires | **non** |

## 4. La restauration, éprouvée et non éprouvée

**Éprouvé le 17 septembre 2026** : les exports rechargés dans une base jetable
(image `supabase/postgres:17.6.1.166`, ni la Production ni Test touchées).

| Résultat | Détail |
| --- | --- |
| **Schéma public : restauré** | 55 tables, 90 politiques, 150 fonctions |
| **Données métier : restaurées à l'identique** | 1 garage, 4 clients, 9 véhicules, 16 devis, 1 facture, 3 ordres de réparation — les mêmes qu'en Production |
| **Comptes : NON restaurés** | 7 erreurs, toutes sur `auth` et `storage` : `auth.identities`, `auth.sessions`, `auth.one_time_tokens`, `auth.mfa_amr_claims` et `storage.buckets` n'existent pas dans l'image, et `auth.users` y manque des colonnes (`email_confirmed_at`) |

**Ce que cela signifie, sans l'arrondir :** une base Postgres nue ne sait pas
accueillir les comptes. Ils se restaurent dans un **projet Supabase**, qui
fournit `auth` et `storage`. Cette restauration-là **n'est pas vérifiée** :
elle demanderait un troisième projet Supabase, et je n'en crée pas — cela
engagerait une offre. Écraser Test pour l'essayer détruirait la recette en
cours.

**Donc, honnêtement : les données métier sont sauvegardées et leur
restauration est prouvée. La restauration des comptes est préparée mais pas
prouvée.** En cas de sinistre réel, le pire scénario connu est : les dossiers
reviennent, les personnes doivent refaire un mot de passe.

## 5. Procédure de restauration (à ne dérouler que sur décision)

1. **Ne pas écraser**. Créer un projet Supabase neuf (offre gratuite) ou
   demander à Supabase la restauration interne (`walg_enabled: true`).
2. Charger dans l'ordre : `roles.sql`, `schema.sql`, `donnees.sql`.
3. Recréer les compartiments de stockage, puis renvoyer `stockage/` avec
   `supabase storage cp -r <dossier> ss:///<compartiment> --experimental`.
4. Refaire à la main ce que la sauvegarde ne couvre pas : SMTP, adresses de
   redirection, variables Vercel.
5. Repointer `NEXT_PUBLIC_SUPABASE_URL` et les clés vers le nouveau projet.
6. Passer les bancs `supabase/tests/auto_*_v1.sql` avant de rouvrir l'accès.

## 6. Où garder les sauvegardes, sans rien dépenser

Elles contiennent des **données personnelles réelles** : adresses, mots de
passe hachés, coordonnées de clients, et un jour les factures des
automobilistes. Elles ne vont jamais dans le dépôt, ne se partagent pas, et ne
s'envoient pas à un service tiers sans décision.

Proposition, à budget nul :

1. **Sur le Mac**, dans `~/Sauvegardes/nexora` (le dossier est créé en
   `drwx------`, lisible par vous seul). C'est fait : une sauvegarde de
   Production y est datée du 17 septembre 2026.
2. **Une copie hors du Mac**, sur un disque externe ou une clé que vous
   branchez de temps en temps. C'est ce qui protège d'un vol ou d'une panne.
3. **Chiffrer** avant toute copie ailleurs, si vous vouliez un jour un
   stockage en ligne : `tar -czf - <dossier> | openssl enc -aes-256-cbc -pbkdf2 -out nexora.tar.gz.enc`.
   Sans cela, une sauvegarde en ligne est une fuite qui attend son heure.
4. **Rythme proposé** : à chaque livraison, et une fois par semaine tant que la
   bêta vit. Garder les quatre dernières, supprimer les plus anciennes.

**Ce qui reste à décider (vous)** : le rythme, le nombre de copies gardées, et
si vous voulez activer la restauration dans le temps chez Supabase — ce qui
dépend de l'offre et **coûte**, donc n'a pas été touché.
