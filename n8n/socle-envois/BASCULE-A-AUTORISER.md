# Bascule à autoriser — fiabilisation du socle d'envois n8n

**État : préparé et testé en recette isolée. Rien n'est actif.** Cette
procédure modifie l'instance n8n vive et la base Production : elle ne se joue
**qu'avec le feu vert explicite de Baptiste**, dans une fenêtre où il est
devant le Mac (Mac éveillé, secteur branché).

Preuves : `docs/recette/n8n-fiabilisation-2026-09-15.md`. Plan :
`docs/architecture/plan-n8n-2026-09-14.md` §9.

## 0. Ce qui change

| Objet | Id | Version publiée relevée le 15 sept. | Après bascule |
|---|---|---|---|
| Base Production | `omphppsmhmyllapdqevn` | migration `20260920000200` | + `20260921000100_journal_incidents_n8n.sql` (journal) et `20260921000200_debit_envois.sql` (débit commun), toutes deux additives |
| 3 - Journalisation erreurs | `erroralerts000000000000000001` | `3a7cef0f-602e-43a2-918a-abb193bf2f51` | `production/journalisation-erreurs.json` |
| Véhicule prêt (socle) | `jXsssqkdKFR3Hnf9` | `9b6fb1b5-674f-4be2-807b-705d4a9eb6e5` | `production/vehicule-pret.json` (25 nœuds), `*/5` |
| Facture (socle) | `9IG1g2ZmHQzhnsMS` | `ea41cf04-1634-41d3-8708-b738808dc372` | `production/facture.json` (25 nœuds), `*/5` |
| Proposition RDV (socle) | `HdO63GrT2WfopDQP` | `c699196a-7d0f-46dc-a202-b82b1166872b` | `production/proposition-rdv.json` (26 nœuds), `*/5` |
| Nouveau devis (socle) | `X39OgaEUulqhv1hO` | `cf5c5af9-3b0c-4378-b821-3e2f4d73e153` | `production/nouveau-devis.json` (25 nœuds), `*/2` |
| 3 - Détection no-show | `jnDj8Aj9DmuLV5Di` | `b27c8f50-dee9-4311-ab10-1a4953c794e5` | **inchangé** |

Non touchés : les workflows archivés ou inactifs, les anciennes notifications
de démonstration (`bloque`), l'historique d'exécution, les identifiants, Brevo,
les réglages de veille du Mac. Aucune purge.

Faits vérifiés en recette sur n8n 2.37.7 qui dictent l'ordre :
- `n8n import:workflow` sur un id existant **remplace** le workflow (même
  nombre de nœuds) et le laisse **dépublié** (`activeVersionId` vide) ;
- `n8n publish:workflow --id` le republie ; l'instance en marche ne prend
  les changements du CLI **qu'après redémarrage** du conteneur.
- Répété sous les **vrais ids** en instance isolée, sans publication, avec les
  fichiers livrés (16 sept.) : originaux (devis 12, facture 12, proposition 13,
  véhicule 12, journal 3) → `production/` (25, 25, 26, 25, 3 ; workflow
  d'erreur rattaché) → originaux (12, 12, 13, 12, 3). **Aucun des cinq n'a été
  publié ni exécuté** : import et publication sont deux gestes distincts.
- Un redémarrage pendant un envoi laisse l'exécution `crashed` ; au démarrage,
  n8n la signale au workflow d'erreur (et peut la re-signaler au redémarrage
  suivant : regroupée dans le journal, pas de doublon).

## 1. Arrêt si l'une de ces conditions est fausse

```bash
export PATH="/Applications/AUTOMATISATION/Docker.app/Contents/Resources/bin:$PATH"
DEPOT=<worktree de la PR>
# a. versions vivantes = versions relevées (sinon : quelqu'un a changé n8n, ne pas écraser)
for id in erroralerts000000000000000001 jXsssqkdKFR3Hnf9 9IG1g2ZmHQzhnsMS HdO63GrT2WfopDQP X39OgaEUulqhv1hO; do
  docker exec nexora-n8n n8n export:workflow --id=$id 2>/dev/null | python3 -c 'import sys,json; r=sys.stdin.read(); w=json.loads(r[r.find("["):])[0]; print(w["id"], w["activeVersionId"])'
done   # doit afficher exactement la colonne « Version publiée » ci-dessus
# b. fichiers à importer vérifiés
node $DEPOT/n8n/socle-envois/construire.mjs && node $DEPOT/n8n/socle-envois/verifier.mjs   # « … OK, 0 KO », code 0
git -C $DEPOT status --short n8n/socle-envois/production   # vide : les fichiers sont ceux de la PR
```

## 2. Sauvegarde cohérente (avant tout geste)

```bash
S=~/Nexora_backups/n8n_$(date +%F_%H%M)_avant-fiabilisation; mkdir -p "$S"; chmod 700 "$S"
# base SQLite : copie cohérente EN LIGNE (API de sauvegarde SQLite, WAL compris)
sqlite3 ~/Nexora/n8n_data/database.sqlite ".backup '$S/database.sqlite'"
sqlite3 "$S/database.sqlite" "pragma integrity_check;"          # doit dire ok
# définitions (lisibles) et identifiants (restent chiffrés)
docker exec nexora-n8n n8n export:workflow --all --output=/home/node/.n8n/export-avant-fiab.json
mv ~/Nexora/n8n_data/export-avant-fiab.json "$S/"
# clé de chiffrement : sans elle les identifiants sauvegardés sont illisibles
cp ~/Nexora/secrets/encryption_key "$S/encryption_key"; chmod 600 "$S/encryption_key"
cmp ~/Nexora/secrets/encryption_key "$S/encryption_key" && ls -la "$S"
```
La clé ne quitte pas le Mac et ne va dans aucun dépôt ni message.

## 3. Relevé Production des files (lecture, identifiants seulement)

Depuis un miroir jetable **sans** dossier `migrations` :
```sql
select 'devis' f, id, statut, tentatives from notifications_devis where statut in ('en_attente','envoi_en_cours')
union all select 'factures', id, statut, tentatives from notifications_factures where statut in ('en_attente','envoi_en_cours')
union all select 'proposition', id, statut, tentatives from notifications_proposition where statut in ('en_attente','envoi_en_cours')
union all select 'atelier', id, statut, tentatives from notifications_atelier where statut in ('en_attente','envoi_en_cours');
```
Relevé du 15 sept. : **0 ligne**. S'il y a une ligne `envoi_en_cours` : arrêt,
elle se vérifie à la main d'abord (voir §8). Garder la sortie dans `$S/files-avant.txt`.

## 4. Migration Production (additive)

```bash
M=/tmp/miroir-prod-fiab; rm -rf $M; mkdir -p $M/supabase && cd $M
supabase link --project-ref omphppsmhmyllapdqevn --workdir $M
cp -R $DEPOT/supabase/migrations $M/supabase/migrations
supabase db push --dry-run --workdir $M     # doit lister SEULEMENT 20260921000100_journal_incidents_n8n.sql
                                            # et 20260921000200_debit_envois.sql
supabase db push --workdir $M
rm -rf $M/supabase/migrations
```
Contrôles : `journaliser_incident(jsonb)` rend `jsonb` ; `prendre_jeton_envoi`
et `reporter_notification_debit` existent ; les trois sont exécutables par
`service_role` seulement ; `envois_debit` est vide et fermée (RLS) ;
`select count(*) from erreurs_automatisation` = le nombre d'avant (324 le
15 sept.).

Sans effet sur les envois tant que n8n n'est pas modifié.

## 5. Étape 1 — journaliseur + Véhicule prêt (un seul redémarrage)

Juste après un passage (secondes :10 à :40 d'une minute impaire, pour ne pas
couper une exécution) :
```bash
docker exec nexora-n8n sh -c 'mkdir -p /home/node/.n8n/import-fiab'
cp $DEPOT/n8n/socle-envois/production/journalisation-erreurs.json $DEPOT/n8n/socle-envois/production/vehicule-pret.json ~/Nexora/n8n_data/import-fiab/
docker exec nexora-n8n n8n import:workflow --separate --input=/home/node/.n8n/import-fiab

# CONTRÔLE AVANT PUBLICATION — importé mais pas encore publié : rien ne tourne
bash $DEPOT/scripts/n8n/controle-avant-bascule.sh nexora-n8n   # doit finir « … OK, 0 KO »

docker exec nexora-n8n n8n publish:workflow --id=erroralerts000000000000000001
docker exec nexora-n8n n8n publish:workflow --id=jXsssqkdKFR3Hnf9
docker restart nexora-n8n
rm -rf ~/Nexora/n8n_data/import-fiab
```

`controle-avant-bascule.sh` lit ce qui est **réellement** dans l'instance et
refuse la publication si : un identifiant sélectionné n'est pas celui attendu
(id **et** nom), un identifiant n'existe pas dans l'instance ou n'a pas le bon
type, une URL ne vise pas `omphppsmhmyllapdqevn`, une trace de recette subsiste
(projet Test, `host.docker.internal`, `127.0.0.1`, `localhost`, ports 5680 /
8787 / 8788, `p_garages` borné, nom « RECETTE »), la cadence, le nombre de
nœuds, le workflow d'erreur ou les plafonds de débit ne correspondent pas.
**Il n'affiche aucun secret** : les identifiants ne sont lus que par id, nom et
type (`export:credentials` sans `--decrypted`).

Éprouvé le 16 septembre dans l'instance isolée : avec les fichiers `production/`
il rend **84 OK, 46 KO**, les 46 étant les seuls contrôles de *présence*
d'identifiant — les identifiants de Production n'existent pas dans une instance
de recette. **Sur l'instance vive, ces 46 doivent passer** ; s'ils ne passent
pas, un identifiant attendu manque ou porte un autre nom, et il ne faut pas
publier. Avec les définitions d'origine, il rend 53 OK / 61 KO et refuse.
Il a trouvé un vrai défaut de livraison : un littéral « RECETTE » embarqué dans
le code du journaliseur de Production, corrigé avant livraison.
Contrôles (10 minutes) :
- `n8n list:workflow --active=true` : les 6 mêmes ids ;
- nœuds : journaliseur 3, Véhicule prêt 25 ; déclencheur `*/5` ; `settings.errorWorkflow` = journaliseur ;
- exécutions de `jXsssqkdKFR3Hnf9` aux minutes multiples de 5, statut `success`, `Réserver la file`×1 (file vide) ;
- les trois autres socle tournent toujours en ancienne version `*/2` ;
- aucune ligne nouvelle en `envoi_en_cours` (requête §3).

## 6. Étape 2 — Facture, Proposition RDV, Nouveau devis

Même geste avec `facture.json`, `proposition-rdv.json`, `nouveau-devis.json`
et les ids `9IG1g2ZmHQzhnsMS`, `HdO63GrT2WfopDQP`, `X39OgaEUulqhv1hO` :
import, **puis `controle-avant-bascule.sh`**, puis publication, puis un seul
redémarrage.

## 7. Contrôles après bascule

- 6 actifs, mêmes ids ; cadences `*/2` (devis) et `*/5` (les trois autres) ;
- file identique au relevé §3 ; aucun message inattendu dans Brevo (journal
  d'envoi : rien de nouveau si aucune notification n'a été autorisée) ;
- premier envoi réel (quand un garage autorise) : ligne `envoye`, `tentatives` 1 ;
- journal joignable : **uniquement** si Baptiste l'accepte, un appel manuel de
  contrôle écrit une ligne marquée résolue :
  `select public.journaliser_incident('{"categorie":"inconnu","noeud":"contrôle de bascule","message":"contrôle de bascule"}');`
  puis `update erreurs_automatisation set resolu = true where noeud = 'contrôle de bascule';`
- `bash $DEPOT/scripts/n8n/incidents-locaux.sh 1` : aucune nouvelle erreur ;
- débit, les deux fenêtres (plafonds **40/heure** et **120/jour**) :
  ```sql
  select count(*) filter (where pris_le > now() - interval '1 hour')  as heure,
         count(*) filter (where pris_le > now() - interval '24 hours') as jour
    from envois_debit;
  ```
  0 tant qu'aucun garage n'a autorisé d'envoi. **Regarder le quotidien
  d'abord** : c'est lui qui borne la journée. Ces compteurs mesurent les
  **tentatives de remise**, pas les e-mails décomptés par Brevo — les deux ne
  sont pas équivalents. Le quota du compte se lit dans Brevo, pas ici.

Suivi courant (lecture) :
```sql
select categorie, workflow_nom, noeud, notification_file, notification_id, occurrences, derniere_le, message
  from erreurs_automatisation
 where resolu is not true and categorie is not null and (intervention_requise or occurrences >= 5)
 order by derniere_le desc;
```

## 8. En cas d'anomalie : suspendre d'abord

**La première réponse n'est jamais de réimporter quoi que ce soit.** C'est de
**suspendre le consommateur concerné**, et lui seul. Les files, l'historique et
le journal sont conservés.

```bash
docker exec nexora-n8n n8n unpublish:workflow --id=<id du workflow concerné>
docker restart nexora-n8n        # le CLI ne prend effet qu'au redémarrage
docker exec nexora-n8n n8n list:workflow --active=true   # le workflow ne doit plus y être
```

Effets : plus aucune réservation pour cette file ; les lignes `en_attente`
restent en attente et repartiront à la reprise ; une ligne `envoi_en_cours`
reste telle quelle — elle a pu partir. **Rien n'est purgé, rien n'est renvoyé.**

Ensuite, et seulement ensuite, établir ce qui s'est passé :

```sql
-- ce qui attend une décision humaine
select categorie, workflow_nom, noeud, notification_file, notification_id,
       occurrences, premiere_le, derniere_le, message
  from erreurs_automatisation
 where resolu is not true and categorie is not null
 order by derniere_le desc;

-- les lignes dont l'issue est incertaine
select 'devis' f, id, statut, tentatives, derniere_erreur from notifications_devis where statut = 'envoi_en_cours'
union all select 'factures', id, statut, tentatives, derniere_erreur from notifications_factures where statut = 'envoi_en_cours'
union all select 'proposition', id, statut, tentatives, derniere_erreur from notifications_proposition where statut = 'envoi_en_cours'
union all select 'atelier', id, statut, tentatives, derniere_erreur from notifications_atelier where statut = 'envoi_en_cours';
```

Chaque ligne `envoi_en_cours` se tranche **une par une**, en comparant avec le
journal d'envoi Brevo. Aucune n'est remise en file automatiquement : seul le
garage, depuis son écran, peut réautoriser un envoi.

### Restauration des versions d'avant — conditions

Les définitions de `origine-2026-09-15/` portent les défauts établis (§0 du
plan §9.2) : un refus SMTP y immobilise jusqu'à dix lignes réservées, dont des
lignes jamais tentées, et aucune erreur n'est journalisée. **Les restaurer est
un recul, pas un retour à la normale.** Elles ne sont donc restaurées que si
**toutes** ces conditions sont réunies :

1. la suspension seule ne suffit pas (le parcours doit continuer de tourner) ;
2. l'anomalie est imputée à la nouvelle version, pas à une panne extérieure
   (réseau, Supabase, Brevo) — le journal et `incidents-locaux.sh` le disent ;
3. Baptiste l'accepte explicitement, en sachant qu'il reprend les défauts.

Le geste, dans cet ordre :

```bash
cp $DEPOT/n8n/socle-envois/origine-2026-09-15/<workflow>.json ~/Nexora/n8n_data/import-fiab/
docker exec nexora-n8n n8n import:workflow --separate --input=/home/node/.n8n/import-fiab
```

**L'import laisse le workflow dépublié : c'est voulu, et il faut le laisser
ainsi** jusqu'à ce que les files aient été relevées (requêtes ci-dessus) et que
les lignes incertaines aient été tranchées. La republication est un geste
séparé et délibéré :

```bash
docker exec nexora-n8n n8n publish:workflow --id=<id>
docker restart nexora-n8n
```

Ne jamais importer avec `--activeState=fromJson` : les fichiers d'origine
portent `active: true` et seraient réactivés sans contrôle.

Ce qui est conservé dans tous les cas : les deux migrations (additives,
ignorées par l'ancien code), le journal des incidents, la table du débit,
l'historique n8n, les files et leurs `derniere_erreur`.

En dernier recours seulement (instance inutilisable) : arrêter le conteneur,
remettre `$S/database.sqlite` à la place de `~/Nexora/n8n_data/database.sqlite`
(après avoir copié les `-wal`/`-shm` du moment dans `$S`), redémarrer. Cela
**perd le journal d'exécution depuis la sauvegarde** ; les files en base
Production, elles, ne bougent pas.

## 9. Ce que cette bascule ne règle pas

- **Mac endormi ou éteint : rien ne part**, quel que soit l'intervalle ; au réveil,
  la relève reprend ce qui est autorisé (au plus 3 lignes par passage).
- Le journal dépend de Supabase, comme la réservation : si Supabase est
  injoignable, l'incident reste visible dans n8n (`scripts/n8n/incidents-locaux.sh`),
  dans la limite des 10 000 dernières exécutions.
- Les alertes : la requête de suivi existe ; **aucun destinataire n'est choisi,
  rien n'est envoyé**.
- Le débit commun (**40/heure, 120/jour**) est une **limite prudente de
  Nexora**, pas une limite horaire annoncée par Brevo (relevé du 16 sept. :
  offre Free, **300 e-mails/jour** marketing et transactionnels confondus,
  300/300 restants, 17 envois sur 7 jours). Il borne ce que Nexora remet au
  fournisseur et **ne garantit pas le quota du compte** : authentification et
  autres consommateurs restent **hors régulateur**, et la marge laissée n'est
  réservée à personne. **Une tentative comptée par Nexora n'équivaut pas à un
  e-mail décompté par Brevo.** C'est le plafond **quotidien** qui borne la
  journée : baisser le seul plafond horaire ne protégerait pas un quota déjà
  épuisé. Les deux valeurs se règlent dans `construire.mjs` (voir plan §9.4).
