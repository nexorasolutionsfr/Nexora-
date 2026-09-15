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
| Base Production | `omphppsmhmyllapdqevn` | migration `20260920000200` | + `20260921000100_journal_incidents_n8n.sql` (additive) |
| 3 - Journalisation erreurs | `erroralerts000000000000000001` | `3a7cef0f-602e-43a2-918a-abb193bf2f51` | `production/journalisation-erreurs.json` |
| Véhicule prêt (socle) | `jXsssqkdKFR3Hnf9` | `9b6fb1b5-674f-4be2-807b-705d4a9eb6e5` | `production/vehicule-pret.json`, `*/5` |
| Facture (socle) | `9IG1g2ZmHQzhnsMS` | `ea41cf04-1634-41d3-8708-b738808dc372` | `production/facture.json`, `*/5` |
| Proposition RDV (socle) | `HdO63GrT2WfopDQP` | `c699196a-7d0f-46dc-a202-b82b1166872b` | `production/proposition-rdv.json`, `*/5` |
| Nouveau devis (socle) | `X39OgaEUulqhv1hO` | `cf5c5af9-3b0c-4378-b821-3e2f4d73e153` | `production/nouveau-devis.json`, `*/2` |
| 3 - Détection no-show | `jnDj8Aj9DmuLV5Di` | `b27c8f50-dee9-4311-ab10-1a4953c794e5` | **inchangé** |

Non touchés : les workflows archivés ou inactifs, les anciennes notifications
de démonstration (`bloque`), l'historique d'exécution, les identifiants, Brevo,
les réglages de veille du Mac. Aucune purge.

Faits vérifiés en recette sur n8n 2.37.7 qui dictent l'ordre :
- `n8n import:workflow` sur un id existant **remplace** le workflow (même
  nombre de nœuds) et le laisse **dépublié** (`activeVersionId` vide) ;
- `n8n publish:workflow --id` le republie ; l'instance en marche ne prend
  les changements du CLI **qu'après redémarrage** du conteneur.
- Répété sous les **vrais ids** en instance isolée, sans publication :
  originaux (12/12/13/12/3 nœuds) → `production/` (21/21/22/21/3, workflow
  d'erreur rattaché) → originaux (12/12/13/12/3). Aucune exécution sous ces ids.
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
supabase db push --workdir $M
rm -rf $M/supabase/migrations
```
Contrôle : `journaliser_incident(jsonb)` existe, rend `jsonb`, exécutable par
`service_role` seulement ; `select count(*) from erreurs_automatisation` =
le nombre d'avant (324 le 15 sept.).

Sans effet sur les envois tant que n8n n'est pas modifié.

## 5. Étape 1 — journaliseur + Véhicule prêt (un seul redémarrage)

Juste après un passage (secondes :10 à :40 d'une minute impaire, pour ne pas
couper une exécution) :
```bash
docker exec nexora-n8n sh -c 'mkdir -p /home/node/.n8n/import-fiab'
cp $DEPOT/n8n/socle-envois/production/journalisation-erreurs.json $DEPOT/n8n/socle-envois/production/vehicule-pret.json ~/Nexora/n8n_data/import-fiab/
docker exec nexora-n8n n8n import:workflow --separate --input=/home/node/.n8n/import-fiab
docker exec nexora-n8n n8n publish:workflow --id=erroralerts000000000000000001
docker exec nexora-n8n n8n publish:workflow --id=jXsssqkdKFR3Hnf9
docker restart nexora-n8n
rm -rf ~/Nexora/n8n_data/import-fiab
```
Contrôles (10 minutes) :
- `n8n list:workflow --active=true` : les 6 mêmes ids ;
- nœuds : journaliseur 3, Véhicule prêt 21 ; déclencheur `*/5` ; `settings.errorWorkflow` = journaliseur ;
- exécutions de `jXsssqkdKFR3Hnf9` aux minutes multiples de 5, statut `success`, `Réserver la file`×1 (file vide) ;
- les trois autres socle tournent toujours en ancienne version `*/2` ;
- aucune ligne nouvelle en `envoi_en_cours` (requête §3).

## 6. Étape 2 — Facture, Proposition RDV, Nouveau devis

Même geste avec `facture.json`, `proposition-rdv.json`, `nouveau-devis.json`
et les ids `9IG1g2ZmHQzhnsMS`, `HdO63GrT2WfopDQP`, `X39OgaEUulqhv1hO`, puis un
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
- `bash $DEPOT/scripts/n8n/incidents-locaux.sh 1` : aucune nouvelle erreur.

Suivi courant (lecture) :
```sql
select categorie, workflow_nom, noeud, notification_file, notification_id, occurrences, derniere_le, message
  from erreurs_automatisation
 where resolu is not true and categorie is not null and (intervention_requise or occurrences >= 5)
 order by derniere_le desc;
```

## 8. Retour arrière (sans perte de file, sans renvoi)

1. Réimporter l'original **du même id** et le republier :
   ```bash
   cp $DEPOT/n8n/socle-envois/origine-2026-09-15/{nouveau-devis,facture,proposition-rdv,vehicule-pret,journalisation-erreurs}.json ~/Nexora/n8n_data/import-fiab/
   docker exec nexora-n8n n8n import:workflow --separate --input=/home/node/.n8n/import-fiab
   for id in erroralerts000000000000000001 jXsssqkdKFR3Hnf9 9IG1g2ZmHQzhnsMS HdO63GrT2WfopDQP X39OgaEUulqhv1hO; do docker exec nexora-n8n n8n publish:workflow --id=$id; done
   docker restart nexora-n8n
   ```
   (L'original du journaliseur n'était relié à aucun workflow : le republier ne
   réveille rien.)
2. **Ne pas** annuler la migration : elle est additive, l'ancien code l'ignore.
3. Relever les lignes `envoi_en_cours` et `bloque` apparues depuis la bascule
   (requête §3 + `derniere_erreur`). **Aucune n'est remise en attente
   automatiquement** : une ligne `envoi_en_cours` a pu partir. Pour chacune,
   vérifier dans le journal Brevo si le message a été accepté ; seul le garage
   décide d'un nouvel envoi (réautorisation depuis l'écran).
4. En dernier recours seulement (instance inutilisable) : arrêter le conteneur,
   remettre `$S/database.sqlite` à la place de `~/Nexora/n8n_data/database.sqlite`
   (supprimer les `-wal`/`-shm` du moment après les avoir copiés dans `$S`),
   redémarrer. Les files en base Production ne bougent pas.

## 9. Ce que cette bascule ne règle pas

- **Mac endormi ou éteint : rien ne part**, quel que soit l'intervalle ; au réveil,
  la relève reprend ce qui est autorisé (au plus 3 lignes par passage).
- Le journal dépend de Supabase, comme la réservation : si Supabase est
  injoignable, l'incident reste visible dans n8n (`scripts/n8n/incidents-locaux.sh`),
  dans la limite des 10 000 dernières exécutions.
- Les alertes : la requête de suivi existe ; **aucun destinataire n'est choisi,
  rien n'est envoyé**.
