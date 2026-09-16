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
version. Rejoué ensuite pour « Nouveau devis », puis sur les fichiers livrés
(tableau du lot H).

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

### Lot G — cadences réelles et débit commun (16 septembre)

Instance isolée repassée aux **cadences proposées** (`*/2` devis, `*/5` les
trois autres), serveur SMTP contrôlé avec réponses retardées à 100 s. Les
16 exécutions ont toutes tourné sur la **version publiée correspondant aux
fichiers générés** (`workflowVersionId` = `activeVersionId`, 24/24/25/24 nœuds,
cadences conformes) : vérifié, 0 exécution sur une autre version.

**G1 — défaut établi, corrigé.** Aucun message n'a atteint le serveur (journal
SMTP vide, 0 accepté) et les 8 lignes sont restées `envoi_en_cours`. Cause
lue dans les données d'exécution : **`No recipients defined`**. En insérant le
nœud de prise de jeton juste avant l'envoi, la réponse de la RPC remplaçait
l'élément courant : le nœud d'envoi ne lisait plus le message composé, donc
aucun destinataire. Deux correctifs :

- nœud **« Reprendre le message »** après la prise de jeton : il remet le
  message de « Vérifier avant envoi » et garde la réponse du débit à côté
  (`debit_ok`, `debit_motif`) ; les paramètres du nœud d'envoi restent
  identiques à l'origine ;
- `classerEchec.js` : les formulations **de n8n lui-même** (« The service
  refused the connection… », « The connection cannot be established… ») et
  celle de nodemailer (« No recipients defined ») sont des échecs **certains**
  — rien n'est parti. Elles étaient classées « incertain », ce qui immobilisait
  la ligne sans raison. 4 tests unitaires ajoutés, dont le contrôle qu'une
  phrase *citant* ces formulations reste incertaine.

Le chevauchement n'a donc pas pu être observé (les envois échouaient en moins
d'une seconde) : rejoué au lot H.

**G2 — débit commun : conforme.** 60 jetons posés pour saturer l'heure, puis
une ligne autorisée :

| Moment | File | Tentatives | Envoi | Journal |
|---|---|---|---|---|
| pendant la saturation | `en_attente`, motif « report : plafond horaire atteint — rien n'est parti » | **0** (la tentative de la réservation est rendue) | aucun | aucun incident : un report est un fonctionnement normal |
| après libération | un jeton repris | 1 | invalidé par le défaut G1 → rejoué au lot H | — |

**Un jeton est consommé par tentative de remise au fournisseur, même quand
elle échoue** : G1 l'a montré (8 jetons pris, 0 message parti). C'est
volontaire — une tentative refusée a bien été soumise au fournisseur — mais
cela veut dire qu'une panne d'envoi consomme du débit. L'effet est borné par
le plafond de 3 tentatives par ligne.

### Lot H — rejeu après correction (16 septembre, cadences réelles)

Les cinq workflows corrigés réimportés et publiés ; les exécutions ont toutes
tourné sur la version publiée correspondante (contrôle `workflowVersionId` =
`activeVersionId`, 25/25/26/25/3 nœuds, `*/2` et `*/5`).

**H1 — file accumulée de 8 lignes, fournisseur lent (100 s).**

| Ce qui était demandé | Ce qui a été observé |
|---|---|
| cadences finales réellement jouées | `*/2` pour les devis, `*/5` pour les trois autres, aux minutes attendues |
| chevauchement | **provoqué et observé** : exécutions 226 (12:22:00 → 12:25:24) et 227 (12:24:00 → 12:25:42) du même workflow, simultanées 1 min 24 s |
| absence de doublon | **8 messages acceptés, 8 destinataires distincts, aucun doublon** — les deux passages simultanés ont pris des lignes différentes (`SKIP LOCKED`) |
| progression de la file | les 8 lignes passent à `envoye`, **1 tentative chacune** ; les passages suivants retrouvent une file vide |
| cohérence du débit | **8 jetons pris pour 8 messages acceptés** |

**H2 — débit commun saturé puis libéré.**

| Moment | File | Tentatives | Envoi | Journal |
|---|---|---|---|---|
| 60 jetons posés (heure saturée) | `en_attente`, motif « report : plafond horaire atteint — rien n'est parti » | **0** : la tentative de la réservation est rendue | aucun | aucun incident (un report est normal) |
| jetons retirés | `envoye` au passage suivant | 1 | 1 message accepté, 1 jeton pris | aucun incident |

Aucun défaut nouveau : les correctifs du lot G sont validés, rien d'autre n'a
été modifié.

### Répétition de bascule et de retour arrière — rejouée sur les fichiers livrés

Dans l'instance isolée, **sans jamais publier** (ces fichiers visent la
Production) :

| Étape | Devis | Facture | Proposition | Véhicule prêt | Journaliseur |
|---|---|---|---|---|---|
| originaux importés | 12 | 12 | 13 | 12 | 3 |
| `production/` sous les mêmes ids | 25 | 25 | 26 | 25 | 3 |
| originaux réimportés (retour arrière) | 12 | 12 | 13 | 12 | 3 |

**0 publié, 0 exécution** sous ces cinq ids : l'import remplace et laisse
dépublié ; la republication est un geste séparé.

### Contrôle d'avant-bascule — éprouvé, et il a mordu

`scripts/n8n/controle-avant-bascule.sh` lit ce qui est réellement dans une
instance n8n **après import et avant publication**. Éprouvé le 16 septembre
dans l'instance isolée, sur les trois états possibles :

| État de l'instance | Résultat | Lecture |
|---|---|---|
| fichiers `production/` sous les vrais ids | **84 OK, 46 KO** | les 46 KO sont **tous** des contrôles « identifiant présent dans l'instance » : les identifiants de Production n'existent pas dans l'instance isolée. Aucun autre contrôle ne tombe (nœuds, cadences, URL, workflow d'erreur, jeton de débit, traces de recette) |
| définitions d'origine | **53 OK, 61 KO** puis « NE PAS PUBLIER » | le contrôle refuse une instance qui ne porte pas les fichiers attendus |
| — | code de sortie ≠ 0 dans les deux cas | il bloque la publication au lieu de la commenter |

**Défaut qu'il a trouvé dans ma propre livraison** : le code du journaliseur
retirait le suffixe « — RECETTE fiabilisation » du nom du workflow pour
retrouver la file — ce littéral se retrouvait donc **dans le fichier de
Production**. Corrigé par une découpe neutre (`split(' — ')[0]`), vérifiée sur
5 cas ; plus aucune occurrence de « RECETTE » dans `production/`.

Sur l'instance **vive**, les 46 contrôles d'identifiants doivent passer : c'est
exactement ce qu'ils vérifient (id, nom et type de chaque identifiant
réellement sélectionné). Le script **n'affiche aucun secret** : `export:credentials`
est appelé sans `--decrypted` et seuls id, nom et type sont lus.

### Plafonds du débit — relevé Brevo du 16 septembre

Relevé par Baptiste dans sa session Brevo (lecture seule, aucun réglage
touché) : **offre Free**, **300 e-mails par jour** marketing *et*
transactionnels confondus, **300/300 restants** au moment du contrôle,
**17 envois sur les 7 derniers jours**. **L'absence d'autres restrictions
transactionnelles n'a pas été établie** : seul le quota a été vérifié.

Plafonds portés de 60/200 à **40 tentatives par heure et 120 par jour**, communs
aux quatre files. Valeurs présentes dans les huit exports générés et dans la
définition publiée en recette (contrôlé), et valeurs par défaut de
`prendre_jeton_envoi` alignées sur Test.

Ce que ces plafonds **ne sont pas** :

- ce ne sont **pas des limites horaires annoncées par Brevo** : Brevo ne publie
  qu'un quota quotidien, le découpage horaire est notre choix ;
- ils **ne réservent rien** : la marge (300 − 120) reste ouverte à tout autre
  consommateur ;
- **une tentative comptée par Nexora n'équivaut pas à un e-mail décompté par
  Brevo** — l'équivalence n'est pas établie, les deux compteurs ne sont pas
  interchangeables ;
- **le plafond horaire seul ne protège pas une journée déjà épuisée** : 40/heure
  autoriserait 960 remises en 24 h ; c'est le plafond quotidien qui borne la
  journée, et c'est lui qu'il faut regarder en premier.

Authentification Supabase et tout autre envoi restent **hors régulateur**.

**Rejeu ciblé avec ces plafonds (lot I, 16 septembre)** — une seule ligne
autorisée, suivie de bout en bout ; cadence réelle `*/2` :

| Temps | Débit posé | File | Tentatives | Transport | Motif inscrit |
|---|---|---|---|---|---|
| I1 heure saturée | 40 jetons datés de l'heure en cours | `en_attente` | **0** | aucun échange SMTP | « report : plafond horaire atteint — rien n'est parti » |
| I2 journée saturée, **heure libre** | 120 jetons vieux de 90 min | `en_attente` | **0** | aucun échange SMTP | « report : **plafond quotidien** atteint — rien n'est parti » |
| I3 libération | jetons retirés | `envoye` | **1** | 1 message accepté | — |

I2 est la preuve directe qu'un plafond horaire seul ne protégerait pas une
journée déjà épuisée : l'heure était libre, et la ligne a quand même été
reportée. La tentative de la réservation est rendue à chaque report — 0 après
deux reports successifs — puis comptée une seule fois à l'envoi réel. Un seul
jeton pris pour un seul message.

Seuls ces contrôles ont été rejoués : les scénarios déjà réussis (pannes,
concurrence, chevauchement, redémarrage, journalisation) n'ont pas été
recommencés, le changement de plafond ne les affecte pas.

## 4. Non-régression

| Preuve | Résultat |
|---|---|
| tests unitaires du dépôt (`node --test` sur `components`, `lib`, `n8n`, dont `expurger` 5 et `classerEchec` 12) | **536/536** sur l'état livré |
| `verifier.mjs` (production + recette + secrets) | **140 OK, 0 KO** |
| base jetable, migrations `20260921000100` + `20260921000200` jouées deux fois | **24 OK, 0 KO** ; barrière d'échec démontrée |
| recours `scripts/n8n/incidents-locaux.sh 7` sur l'instance **vive**, lecture seule | les 16 erreurs réseau retrouvées, messages expurgés |

## 5. Bilan

**Testé en recette isolée** : cadences finales `*/2` et `*/5` avec file
accumulée et fournisseur lent ; chevauchement réel de deux passages sans
doublon ; débit commun saturé (report sans tentative consommée) puis libéré ;
file vide ; réseau coupé avant réservation ;
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
plafond ; **élément courant écrasé par la RPC de débit (envoi sans
destinataire)** ; **formulations d'échec certain de n8n et de nodemailer
classées « incertain »** ; **littéral « RECETTE » embarqué dans les fichiers de
Production** (trouvé par le contrôle d'avant-bascule lui-même). Aucun de ces défauts n'a fait partir un message deux fois ni remis en
file une ligne incertaine.

**Non testé** : Brevo réel et réception ; identifiants de Production ; le plan
réel du compte Brevo et donc le débit qu'il accepte (à relever dans l'interface
Brevo, voir plan §9.4) ; le Mac en veille réelle (simulée par arrêt et
redémarrage du conteneur).

**Traces sur Test** (conservées comme preuves, aucune purge) : garage
`PROTO Constat N8N 1789498034454` et ses notifications — dont des lignes
`envoi_en_cours` issues des lots A, B, C, E, F et `bloque` ; incidents
« … — RECETTE fiabilisation » dans `erreurs_automatisation`. Instance isolée
arrêtée, conservée (`/tmp/nexora-fiab/recette`).
