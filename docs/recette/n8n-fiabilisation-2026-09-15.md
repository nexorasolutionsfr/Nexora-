# Recette — fiabilisation n8n du socle d'envois

15 septembre 2026, soir. **Préparé et testé en recette isolée ; rien n'est
actif.** Instance n8n vive (`nexora-n8n`) et Production lues seulement ;
Brevo non touché ; aucun message réel.

Plan et causes : `docs/architecture/plan-n8n-2026-09-14.md` §9. Bascule :
`n8n/socle-envois/BASCULE-A-AUTORISER.md`.

## 1. Montage isolé

| Élément | Ce qui a tourné |
|---|---|
| n8n | conteneur neuf `nexora-n8n-fiab`, image `n8nio/n8n:2.37.7` (celle du vif), volume et clé de chiffrement propres, `127.0.0.1:5680` ; aucun lien avec `nexora-n8n` |
| Workflows | `n8n/socle-envois/recette/*.json`, produits par `construire.mjs` depuis les **mêmes nœuds** que `production/` (`verifier.mjs` : 116 OK, 0 KO — mêmes noms, types, versions, gestion d'erreur, code, connexions ; seuls diffèrent URL, identifiants, borne de garage, déclencheur, id) |
| Déclencheur | `* * * * *` (recette) ; publiés et exécutés par l'horloge, pas à la main — un workflow d'erreur ne se déclenche que sur une exécution déclenchée |
| Base | Supabase **Test**, garage neuf `PROTO Constat N8N 1789498034454` (`3c8779d2-539f-41bf-aa6f-629c41190079`) ; réservations bornées à ce garage (`p_garages`) ; notifications armées par les vraies fonctions d'autorisation avec une session réelle du dirigeant (jeton, destinataire, empreinte) |
| Transport | `scripts/recette/smtp-controle.mjs` sur `127.0.0.1:2525` (joignable du conteneur par `host.docker.internal`) : n'accepte que `@nexora-recette.invalid`, ne relaie rien. **« Accepté par le serveur de recette » n'est pas « reçu ».** |
| Pannes | `scripts/recette/proxy-supabase-controle.mjs` : relais vers Test seulement, pannes par chemin (`coupe_avant`, `sans_reponse_apres`, `http_502`). Port 8787 pour le socle, 8788 pour le journaliseur (recette seulement : couper la réservation sans couper le journal ; en Production les deux visent le même Supabase) |
| Identifiants | 3 identifiants de recette importés par CLI depuis `.env.local` Test, fichier en clair supprimé aussitôt |
| Données | `scripts/recette/jeu-fiabilisation-n8n.mjs` (`creer`, `armer`, `etat`) |

## 2. Base de données

| Preuve | Résultat |
|---|---|
| `base-jetable-journal-incidents-2026-09-15.sh` (export frais du schéma Production, 5 anciennes lignes simulées, migration jouée deux fois) | **13 OK, 0 KO, VERT** (après correction du type de retour, voir lot B) |
| Barrière : `ECHEC_VOLONTAIRE=controle` | 13 OK, 1 KO → **ÉCHEC** |
| Test : `db push --dry-run` puis `db push` | seule `20260921000100` appliquée ; `journaliser_incident` rend `jsonb`, refusée à `anon` et `authenticated` |

Contrôles couverts : regroupement d'une erreur répétée, incident distinct par
workflow et par notification, résolu puis répété → nouvelle ligne, après 24 h
→ nouvelle ligne, entrée invalide acceptée sans échec, textes bornés, anciennes
lignes intactes, RLS active.

## 3. Scénarios

### S1 — file vide
Exécution 1 : `Réserver la file`×1, rien d'autre, succès. Aucun appel de plus.

### Répétition du geste de bascule (import sous le même id)
`fiabrecjournal000001` : avant 3 nœuds, version publiée ; après
`n8n import:workflow` **3 nœuds (remplacé, pas ajouté)**, nouvelle version,
**dépublié** ; après `publish:workflow` + redémarrage : actif sur la nouvelle
version. Rejoué ensuite pour « Nouveau devis » (21 nœuds).

### Lot A — réservation validée, réponse illisible (panne fortuite du relais)
Le relais transmettait un corps gzip sans son en-tête. Exécutions 4, 6, 8, 10 :
erreur à `Réserver la file` (« Invalid JSON in response body ») **après**
réservation en base. Chaque passage n'a réservé qu'**une** ligne : 4 lignes
`envoi_en_cours` (tentatives 1), la 5e restée `en_attente`. Journal SMTP vide.
Journal : **un** incident `reservation_sans_reponse`, 4 occurrences,
intervention requise. Aucune ligne reprise ensuite.

### Lot B — défaut du correctif trouvé
Exécutions 14→22 : erreur au nœud `Prêt à envoyer ?` (test booléen strict à
valeur vide refusé par n8n 2.37). Une ligne par passage immobilisée en
`envoi_en_cours`, **aucun message parti**, un incident `echec_workflow`
(5 occurrences, intervention). Le journaliseur écrivait bien, mais son
exécution échouait : `journaliser_incident` rendait un uuid nu. **Corrigés** :
test en comparaison de texte ; la fonction rend `{id, occurrences}`.

### Lot C — refus, reprise, blocage, coupure

| Cas | File finale | Tentatives | Serveur SMTP contrôlé | Incident |
|---|---|---|---|---|
| accepté | `envoye` | 1 | 250, From « PROTO Constat N8N … » <nexorasolutions.france@gmail.com>, Reply-To garage | aucun |
| 451 une fois | `envoye` | 2 | 451 puis 250 | `refus_temporaire` (sans intervention) |
| 550 | `bloque` « refus définitif … 550 5.1.1 » | 1 | 550 au RCPT | `refus_definitif`, intervention |
| coupure après le message | **`envoi_en_cours`, rien clos** | 1 | message reçu, connexion coupée | `envoi_incertain`, intervention ; **non repris** aux 3 passages suivants |
| 451 permanent | `bloque` « échec temporaire répété (3 tentatives) » | 3 | 451 ×3 | `refus_temporaire` ×2 puis `refus_temporaire_repete`, intervention |

**Défaut trouvé** : la reprise se faisait dans le même passage (2e tentative
une seconde après la 1re). **Corrigé** : « Encore une ? » s'arrête après un
refus temporaire.

### Lot D — deux consommateurs concurrents
Second workflow identique publié. 6 lignes « accepté ». Exécutions 34 et 35 à
la même seconde : chacune a réservé, envoyé et clos **3** lignes. Serveur
SMTP : 6 acceptations, **une par adresse, aucun doublon**. 6 lignes `envoye`,
tentatives 1.

### Lot E — pannes, redémarrage, journaliseur (un seul consommateur)

| Scénario | Ce qui a été provoqué | File | Serveur SMTP | Journal | Verdict |
|---|---|---|---|---|---|
| E1 refus temporaire répété | 451 permanent | `bloque` à la 3e tentative | 451 à 19:18, 19:19, 19:20 : **une tentative par passage** | `refus_temporaire` ×2 puis `refus_temporaire_repete`, intervention | tenu |
| E2 réseau coupé avant réservation | relais du socle arrêté 3 passages | rien réservé | — | incident écrit à chaque passage, regroupé | **défaut** : « The service refused the connection » non reconnu, classé `reservation_sans_reponse` et fusionné avec les réponses perdues → corrigé, rejoué en F1 |
| E3 réservation validée, réponse perdue | réponse retenue par le relais, délai de 20 s | 1 ligne `envoi_en_cours`, jamais reprise | — | `reservation_sans_reponse`, intervention | tenu |
| E4 message accepté, clôture impossible | 502 ×3 sur `terminer_notification` | `envoi_en_cours`, jamais reprise | 250 (accepté une fois) | `cloture_echouee` (exécution 59), intervention | tenu |
| E5 lecture du devis en échec | 502 ×1 sur la lecture | `bloque` « document introuvable » | aucun message | 1 `donnees_invalides` + 4 `echec_avant_envoi` | **défaut grave** : sortie d'erreur + `alwaysOutputData` = deux éléments par lecture, 5 clôtures pour une ligne, faux blocage d'une panne passagère. Rien n'est parti. Corrigé (erreur sur la sortie normale, décision unique dans « Vérifier avant envoi ») → rejoué en F2 |
| E6 journal indisponible dans la branche | 502 sur `journaliser_incident` | `bloque` (550), exécution en succès | 550 | aucun incident écrit (limite attendue) ; `derniere_erreur` en file | tenu |
| E7 journaliseur en panne | les deux relais arrêtés 1 passage | rien réservé | — | journaliseur en erreur (exécution 70), **aucune exécution ensuite** | tenu : pas de boucle |
| E8 redémarrage en plein envoi, file accumulée | n8n arrêté, 6 lignes en attente, démarrage, redémarrage pendant l'attente du serveur SMTP | la ligne en cours reste `envoi_en_cours`, jamais reprise ; les 5 autres `envoye` en 2 passages (3 + 2) | « client parti avant la réponse » ; 5 acceptations, une chacune | exécution 72 `crashed` signalée au redémarrage, puis re-signalée au redémarrage suivant → **regroupée** (×2) | tenu ; **défaut mineur** : classé `echec_workflow` au lieu d'`envoi_incertain` → corrigé, rejoué en F3 |
| E9 les trois autres files | 1 ligne chacune | `envoi_en_cours` | aucun message | `echec_workflow` par workflow | **erreur de méthode** : ces workflows de recette dataient d'avant la correction de « Prêt à envoyer ? » → tous réimportés, rejoué en F4 |

### Lot F — re-test après corrections (les quatre workflows et le journaliseur réimportés)

| Scénario | File | Serveur SMTP | Journal | Verdict |
|---|---|---|---|---|
| F1 réseau coupé avant réservation, 3 passages × 4 workflows | rien réservé | — | 4 incidents `reseau_avant_reservation` (un par workflow, ×3, **sans** intervention, « aucune ligne réservée ») | tenu |
| F2 502 ×1 sur la lecture du devis | **une** clôture « à reprendre », puis `envoye` au passage suivant (2 tentatives) | une acceptation | `echec_avant_envoi` (« Récupérer le devis ») | tenu |
| F3 redémarrage pendant l'envoi | `envoi_en_cours`, non reprise | « client parti avant la réponse » | `envoi_incertain`, intervention | tenu |
| F4 non-régression | devis, facture, véhicule prêt `envoye` ; devis et facture 550 `bloque` | une acceptation par message ; 550 ×2 | `refus_definitif` ×2, intervention | tenu |
| F4 proposition sans prestation (jeu incomplet) | 400 à « Récupérer la prestation » ; une tentative par passage ; `bloque` à la 3e | aucun message | `echec_avant_envoi` puis blocage | sûr ; libellé du plafond corrigé (catégorie d'origine gardée). Production : 3 propositions, **toutes** avec prestation (lecture) |
| F5 proposition avec prestation + devis, après la dernière reconstruction | `envoye` ×2, tentatives 1 | 2 acceptations ; objet UTF-8 intact | aucun incident | tenu |

### Répétition de la bascule et du retour arrière, sous les vrais ids

Dans l'instance isolée, **sans jamais publier** (ces fichiers visent la
Production ; aucune exécution sous ces ids, vérifié) :

| Étape | `jXsssqkdKFR3Hnf9` | `9IG1g2ZmHQzhnsMS` | `HdO63GrT2WfopDQP` | `X39OgaEUulqhv1hO` | journaliseur | `errorWorkflow` |
|---|---|---|---|---|---|---|
| originaux importés | 12 nœuds | 12 | 13 | 12 | 3 | absent |
| `production/` importé sous les mêmes ids | 21 | 21 | 22 | 21 | 3 | rattaché |
| originaux réimportés (retour arrière) | 12 | 12 | 13 | 12 | 3 | absent |

Chaque import **remplace** (aucun nœud dupliqué), crée une nouvelle version et
laisse le workflow **dépublié** : la procédure republie explicitement puis
redémarre.

## 4. Non-régression

| Preuve | Résultat |
|---|---|
| tests unitaires du dépôt (`node --test` sur `components`, `lib`, `n8n`, dont `expurger` 5 et `classerEchec` 8) | **533/533** sur l'état livré |
| `verifier.mjs` (production + recette + secrets) | 116 OK, 0 KO |
| recours `scripts/n8n/incidents-locaux.sh 7` sur l'instance **vive**, lecture seule | les 16 erreurs réseau retrouvées, messages expurgés |

## 5. Bilan

**Testé en recette isolée** : file vide ; réseau coupé avant réservation ;
réservation validée sans réponse ; deux consommateurs concurrents ; refus
temporaire puis reprise ; refus temporaire répété ; refus définitif ; coupure
après transmission ; message accepté et clôture impossible ; lecture impossible
puis reprise ; redémarrage en plein envoi avec file accumulée ; journal
indisponible dans la branche ; journaliseur en panne sans boucle ; regroupement
d'erreurs répétées et incidents distincts ; les quatre files ; import, bascule
et retour arrière sous les vrais ids.

Défauts trouvés **par la recette** et corrigés avant livraison : test booléen
refusé par n8n ; réponse uuid nue du journal ; reprise dans le même passage ;
deux éléments par lecture en échec (5 clôtures, faux blocage) ; refus de
connexion mal classé ; interruption pendant l'envoi mal classée ; libellé du
plafond. Aucun de ces défauts n'a fait partir un message deux fois ni remis en
file une ligne incertaine.

**Non testé** : Brevo réel et réception ; identifiants de Production ; la
cadence `*/5` et `*/2` réelle (la recette tournait à la minute) ; la charge au
plafond Brevo (30/h) ; le Mac en veille réelle (simulée par arrêt et
redémarrage du conteneur).

**Traces sur Test** (conservées comme preuves, aucune purge) : garage
`PROTO Constat N8N 1789498034454` et ses notifications — dont des lignes
`envoi_en_cours` issues des lots A, B, C, E, F et `bloque` ; incidents
« … — RECETTE fiabilisation » dans `erreurs_automatisation`. Instance isolée
arrêtée, conservée (`/tmp/nexora-fiab/recette`).
