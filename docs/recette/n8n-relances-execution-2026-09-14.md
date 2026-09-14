# Relances de travaux différés — exécution réelle du workflow n8n (Test)

14 septembre 2026. **Workflow exécuté avec transport simulé. Réception réelle
non testée.** Aucun message n'est parti : le « fournisseur » est un nœud Code
qui n'appelle rien, et toutes les adresses sont en `.invalid`.

## L'instance

- Conteneur **isolé** `nexora-n8n-recette` (image `n8nio/n8n:2.37.7`), port
  local `127.0.0.1:5679`, volume neuf dans le dossier temporaire de la session,
  clé de chiffrement propre. **Aucun lien avec l'instance vive `nexora-n8n`**,
  qui n'a été ni lue en écriture, ni modifiée, ni arrêtée.
- Contenu importé, et rien d'autre : la variante **Test**
  (`n8n/relances-travaux/test.json`, id `relancestravauxtest0000001`) et **un**
  identifiant `RPC Supabase RECETTE (Test)` construit à partir du `.env.local`
  de Test. Le fichier de secret a été effacé de l'hôte et du conteneur juste
  après l'import. Avant import, vérification automatique : la variante ne
  contient ni l'URL du projet de Production, ni un identifiant de Production.
- Le workflow est borné au garage de recette (`p_garages`). Il a été exécuté
  par `n8n execute --id relancestravauxtest0000001` (déclencheur manuel de la
  variante Test ; le déclencheur horaire `*/15` n'a pas été activé).

Piège rencontré : `n8n execute` démarre son propre relais de tâches et échoue
si le port du relais de l'instance est pris (« Task Broker's port 5679 is
already in use »). Contournement : `-e N8N_RUNNERS_BROKER_PORT=5699`.

## Le jeu

`node scripts/recette/jeu-relances-n8n.mjs creer <garage>` : cinq travaux
différés échus, un client chacun. L'adresse pilote le faux fournisseur :

| Clé | Adresse | Issue simulée |
|---|---|---|
| succes | `client.succes.n8n@nexora-recette.invalid` | accepté |
| echec | `echec.transport@nexora-recette.invalid` | échec **certain** avant envoi |
| incert | `incertain.transport@nexora-recette.invalid` | issue **incertaine** (acceptation possible, non confirmée) |
| report | `client.report.n8n@…` | autorisé, puis travail **reporté** avant le passage |
| annule | `client.annule.n8n@…` | relance **annulée** depuis le dashboard |

## La chaîne jouée

| Étape | Qui | Résultat observé |
|---|---|---|
| Échéance | données | 5 travaux `a_relancer`, `date_relance` = veille |
| **Passage n°1** | n8n | préparation : **5 × `preparee`** ; réservation : **aucune** (rien d'autorisé) |
| Autorisation « succès » | **dashboard**, dirigeant, bouton « Autoriser l'envoi » | ligne : « relance autorisée, départ en attente » |
| Annulation « annule » | **dashboard**, bouton « Ne pas relancer » | relance `annulee`, la ligne revient à son geste habituel |
| Autorisation « echec », « incert », « report » | session accueil (script) | `en_attente` |
| Report « report » | session dirigeant (script) | `date_relance` + 20 jours |
| **Passage n°2** | n8n | préparation : **1 × `obsolete`** (report) ; réservation : **3** lignes ; transport : `envoye` (succes), `a_reprendre` (echec), `incertain` (incert) ; « Clore la relance » × 2 ; « Issue incertaine : rien n'est clos » × 1 |
| **Passage n°3** (répétition) | n8n | préparation : **rien** ; réservation : **1** ligne (echec, reprise bornée) ; aucun doublon ; la ligne incertaine n'est **pas** reprise |

État en base après le passage n°3 :

```
succes  → envoye ×1 (envoye)  « transport simulé (recette) : aucun message réel n'est parti »
echec   → en_attente ×2       « échec certain avant envoi (simulé) »
incert  → envoi_en_cours ×1   (jamais clos, jamais repris)
report  → obsolete            [le travail a été reporté au 04/10/2026 : une nouvelle relance sera préparée à cette date]
annule  → annulee             [le garage a choisi de ne pas relancer]
```

État **visible dans le dashboard** (dirigeant, « À traiter », capture
`captures/constat-devis-2026-09-14/relances-apres-n8n.png`) :

- succès : « relance envoyée le 14/09/2026 » ;
- échec : « relance autorisée, départ en attente » ;
- incertain : « relance : envoi à vérifier » ;
- annulation : plus de mention de relance ;
- report : la ligne n'est plus dans « À traiter » (échéance future).

## Ce que cette exécution prouve, et ce qu'elle ne prouve pas

**Prouvé** : la chaîne réelle base ↔ n8n ↔ dashboard fonctionne de bout en
bout sur Test ; un passage répété ne crée rien deux fois ; un report rend la
relance obsolète ; une annulation n'est pas réservée ; un échec certain est
repris dans la limite des tentatives ; une issue incertaine reste
`envoi_en_cours`, n'est ni close ni reprise, et l'écran dit « envoi à
vérifier ».

**Non prouvé** :

- la **réception** d'un message : aucun SMTP n'a été appelé ;
- le **classement des erreurs SMTP** de la variante Production (nœud
  « Classer l'échec ») : écrit, jamais exécuté ;
- le **déclencheur horaire** et le coût en exécutions sur une durée : non
  mesurés (trois passages manuels) ;
- le **réveil événementiel** (webhook de base) : non testé, aucun tunnel ouvert.

Un point à signaler : dans le dashboard, une relance simulée affiche
« relance envoyée ». Sur Test, avec ce workflow, cela veut dire « le faux
fournisseur l'a acceptée ». Le motif en base le dit ; l'écran ne distingue pas
les deux. Sans objet en Production, où le seul transport est le vrai.
