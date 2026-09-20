# « Envoyer le message » ne partait jamais — cause, correctif, recette

**20 septembre 2026.** Branche `fix/prevenir-client-envoi-bloque`, depuis `main` `31557af`.
Projet **Test** seulement. Aucune modification Production, n8n, droits d'accès ou règle
d'autorisation. Aucun envoi réel.

---

## 1. Le défaut

Dans l'écran Atelier (file « Prêtes ») comme dans Aujourd'hui (ligne « Message de
disponibilité non envoyé »), le bouton **« Envoyer le message »** passait à
« Envoi autorisé… » et y restait **indéfiniment**. Aucune erreur, aucune fin.
Et **rien n'arrivait en base** : la notification restait `sans_lien`.

## 2. La cause, mesurée

`components/atelier/usePrevenirClient.js`, avant correctif :

```js
let appt = null;
setPrevenir((p) => { appt = p?.appt || null; return p ? { ...p, enCours: true } : p; });
if (!appt) return;
```

La cible de l'envoi était lue par **effet de bord d'une fonction de mise à jour d'état
React**. React n'exécute pas cette fonction au moment de l'appel : elle court à la phase
de rendu suivante.

Instrumentation temporaire posée dans le navigateur, puis retirée. Journal relevé :

```
[diag] confirmerPrevenir appelé, destinataire = l.moreau@example.com
[diag] après setPrevenir : updaterCouru = 0 | appt = null | + 3 ms
[diag] RETOUR ANTICIPÉ : aucune RPC ne sera appelée
[diag] updater #1 exécuté, p = objet | + 4 ms
```

Trois faits, dans cet ordre :

1. **La fonction de mise à jour n'a pas couru** au moment du test (`updaterCouru = 0`) ;
   `appt` valait donc `null` et la fonction **sortait avant tout appel réseau** ;
2. elle court **1 ms plus tard**, pose `enCours: true`, et c'est ce qui fige le bouton
   sur « Envoi autorisé… » — un état de chargement que plus rien ne lèvera ;
3. **aucune RPC n'est émise.** Vérifié en base après chaque essai : la notification
   restait `sans_lien`. La même RPC, même compte, appelée depuis une session Node
   répondait `{"ok":true}` en 100–140 ms : ni la fonction, ni les droits, ni les données
   n'étaient en cause.

## 3. Jusqu'où va la preuve

Le journal ci-dessus a été relevé **deux fois** :

| Mode | Passages de la fonction de mise à jour | Retour anticipé | RPC émise |
|---|---|---|---|
| `next dev` (StrictMode) | 2, tous **après** le retour | oui | non |
| `next build` + `next start`, **en local**, relié à Test | **1**, après le retour | oui | non |

**Ce qui est établi** : le défaut se reproduit en **build de production local relié à
Test**. Le passage unique de la fonction confirme l'absence de StrictMode — ce n'est donc
pas un artefact du mode développement.

**Ce qui ne l'est pas** : l'**impact sur le site déployé n'a pas été vérifié directement.**
L'écran n'a pas été cliqué sur `nexora-garage.vercel.app` : cela demanderait une session
sur le garage réel, hors périmètre de ce lot. Le code servi est le même, mais ce n'est pas
une observation — c'est une déduction, et elle n'est pas présentée autrement ici.

## 4. Le correctif

**`components/atelier/prevenirClient.js` (nouveau)** — les décisions, sans React ni réseau :

- `cibleDEnvoi(entree)` : la cible est **donnée**, pas devinée. Une cible incomplète rend
  une phrase, jamais un silence.
- `estUnePanneReseau(error)` : une erreur PostgREST porte un `code` ; une requête qui n'est
  jamais partie n'en a pas. Les deux ne méritent pas la même phrase.
- `suiteDeConfirmation({error, data})` : fermer ou rester ouvert avec un message, et faut-il
  relire l'état en base.

**`components/atelier/usePrevenirClient.js`** :

- `confirmerPrevenir({ rendezVousId, destinataire })` reçoit la cible **explicitement** ;
  plus aucune lecture d'état au moment du geste ;
- le verrou du double clic devient une **référence** (`useRef`), posée dans le même tour que
  le clic — un état React serait appliqué au rendu suivant et laisserait passer deux envois ;
- `try/catch/finally` : une promesse rejetée ne peut plus laisser la fenêtre figée ;
- **aucune sortie muette** : chaque chemin ferme la fenêtre ou y écrit une phrase, et remet
  toujours `enCours` à faux.

**`components/NexoraDashboard.jsx`** :

- la fenêtre passe `{ rendezVousId: appt?.id, destinataire: apercu?.destinataire }` — ce
  qu'elle affichait ;
- le bouton ne se désactive plus sur une erreur : avant, la moindre erreur le condamnait et
  il ne restait qu'« Annuler ».

**Ce qui n'a pas bougé** : `autoriser_envoi_atelier` reste le seul chemin vers un envoi ; la
base vérifie toujours le rôle (dirigeant/accueil), l'étape de la voiture et le destinataire,
et refuse de réarmer une ligne déjà `en_attente` ou `envoi_en_cours`. Les deux protections
contre le double envoi — écran et base — se cumulent.

## 5. Tests

`components/atelier/prevenirClient.test.js` — **17 tests**, `node --test`. Couvrent la cible
explicite (dont le cas exact du défaut), la distinction panne de réseau / refus serveur,
chaque motif de refus, et l'invariant : **aucune réponse possible ne laisse la fenêtre
ouverte et muette**.

```
node --test components/atelier/          → 66 tests, 66 au vert
node --test components/aujourdhui/ …     → 108 tests, 108 au vert (non-régression)
```

## 6. Installation reproductible

`unpdf` **est** déclaré dans `package.json` et présent dans `pnpm-lock.yaml`. L'échec de
compilation constaté la veille venait d'un `node_modules` recopié depuis un worktree plus
ancien, pas du projet.

```
npx pnpm@10.34.5 install --frozen-lockfile   → Done, verrou inchangé
node node_modules/next/dist/bin/next build   → Compiled successfully
```

**Aucun paquet ajouté, aucun verrou modifié.** `git status` ne montre que les quatre fichiers
du lot.

## 7. Recette par le navigateur — build de production relié à Test

Garage de recette isolé `PROTO Atelier 2026-09-20-14h01`
(`dd43e432-ad91-4f95-ae9f-7f94514e4bed`), adresses en `.invalid`, cinq voitures notées
prêtes par le vrai sélecteur d'étape — donc cinq notifications `sans_lien` créées par le
déclencheur, comme chez un garage.

| # | Scénario | Geste | Résultat à l'écran | État en base |
|---|---|---|---|---|
| 1 | Aperçu puis **Annuler** | clic souris, BB-202-BB | fenêtre fermée | `sans_lien` — **rien d'armé** |
| 2 | **Confirmer** | clic souris, BG-707-GG | fenêtre fermée, « Message autorisé » | `en_attente`, `destinataire_valide = paul.ferrand@nexora-recette.invalid` |
| 3 | **Double clic** | double-clic souris, BH-808-HH | fenêtre fermée | **1 seule** notification, `en_attente` |
| 4a | **Refus serveur** | voiture repassée « en intervention » pendant que la fenêtre est ouverte, puis clic souris | « Cette voiture n'est plus notée prête. Aucun message n'a été envoyé. » — **bouton actif** | `sans_lien` — rien d'armé |
| 4b | **Panne de réseau** | requête `autoriser_envoi_atelier` bloquée, puis clic sur le vrai bouton | « La connexion a échoué. Rien n'a été envoyé — réessayez. » — **`disabled=false`** | `sans_lien` — rien d'armé |
| 5 | **Après rechargement** | rechargement de la page | les deux voitures autorisées ont quitté « À traiter », les trois autres y restent | conforme à la base, ligne par ligne |
| 6 | **Réponse perdue après enregistrement** | la réponse du POST est jetée en vol, le POST ayant abouti (200) | aucun message d'erreur, fenêtre fermée, la voiture quitte la liste ; **jamais « rien envoyé »** | **1 seule** notification, `en_attente`, bon destinataire |
| 7 | **Rafraîchissement sans rechargement** | clic souris, BF-606-FF | compteur **12 → 11 actions, 10 → 9 voitures**, la ligne part | `en_attente` |
| 8 | **Le mot juste dans l'Atelier** | écran Atelier | « Message autorisé, départ en attente de traitement. » sur les 4 cartes ; **aucune** occurrence de « envoyé » | — |

Aucun appel direct à la RPC n'a remplacé un clic. Les scénarios 1 à 4a et 7 sont joués à la
**souris** ; les 4b, 6 et 8 le sont par un clic programmatique **sur le vrai bouton**, parce
que couper une requête demande le protocole DevTools — le parcours React est identique,
seule la façon d'appuyer diffère. Captures : `captures/prevenir-client-2026-09-20/`.

### Le scénario 6 en détail — celui qui manquait

Pour qu'il soit vrai, il faut que **le serveur enregistre** et que **seule la réponse se
perde**. Deux pièges rencontrés :

1. bloquer l'URL (`Network.setBlockedURLs`) empêche la requête de partir : c'est le
   scénario 4b, pas celui-ci ;
2. intercepter au stade `Response` avec un motif `requestMethod: "POST"` attrape quand même
   la **pré-vérification CORS** (OPTIONS) : le POST ne part jamais. Chrome ignore ce filtre
   dans le motif — le tri doit se faire dans le gestionnaire.

La bonne recette : `Fetch.enable` au stade `Response` sans filtre de méthode, puis, à
chaque interception, `Fetch.continueResponse` pour OPTIONS et `Fetch.failRequest`
(`ConnectionAborted`) pour le POST. Journal de l'exécution :

```
requêtes interceptées : [{"methode":"OPTIONS","statut":200},{"methode":"POST","statut":200}]
libellés observés sur le bouton : Autorisation en cours… | Envoyer le message
message à l'écran : AUCUN
fenêtre encore ouverte : false
compteur : 12 actions à traiter  (13 avant)
```

Le POST a bien été servi (200) avant que sa réponse ne soit jetée. Le navigateur a vu une
coupure, a relu l'état, a constaté que l'autorisation était là, a fermé la fenêtre — et
**n'a pas réautorisé** : la base ne porte qu'une seule ligne pour cette voiture.

## 8. Isolation des envois, revérifiée avant la recette

Quatre vérifications, toutes en lecture seule, **sans toucher à `reserver_notifications`** :

1. les quatre workflows du socle ne visent que `omphppsmhmyllapdqevn` (Production) ;
2. tout ce qui vise Test est inactif (inventaire du 15 septembre) ;
3. la base de Test **ne peut pas émettre** : ni `pg_net` ni `http` installés, **aucun
   déclencheur** sur les tables `notifications*`, une seule tâche `pg_cron`
   (`preparer_rappels_confirmation`, qui prépare et n'envoie pas) ;
4. **21 lignes armées depuis 15,9 jours n'ont jamais été réservées** — rien ne sonde Test.

## 9. Notifications armées sur Test — à ne jamais laisser partir

### Ce que comptent 26, 6 et 63

Trois compteurs, trois périmètres différents — ils ne s'additionnent pas entre eux.

| Nombre | Périmètre | Ce qu'il dit |
|---|---|---|
| **26** | **tout le projet Test**, les trois files (atelier, devis, factures) | lignes **`en_attente`** : armées, et **jamais prises par personne**. La plus ancienne date du 4 septembre, soit 15,9 jours. C'est ce compteur qui prouve l'isolation : si un traitement sondait Test, elles seraient parties. |
| **37** | idem | lignes **`envoi_en_cours`** : réservées une fois, par l'instance de recette isolée des 15-16 septembre (locale, SMTP contrôlé). Le socle ne les rejoue jamais — un envoi incertain ne se rejoue pas. |
| **63** | idem | **le total armé = 26 + 37.** C'est la liste ci-dessous, identifiant par identifiant. |
| **6** | **les deux passes de recette du 20 septembre** | lignes que CETTE recette a ajoutées au total armé : **4 atelier** (scénarios 2, 3, 6, 7) et **2 devis** (semées par `jeu-atelier.mjs creer`, pas par un geste d'écran). |

**Aucune ligne n'a disparu** : 57 armées avant la recette, 63 après, et les 57 d'origine sont
toutes encore là. **Aucune n'a été supprimée ni réactivée.**

### Le garage de recette lui-même

`PROTO Atelier 2026-09-20-14h01` (`dd43e432-ad91-4f95-ae9f-7f94514e4bed`) porte au total
**8 notifications** :

- **5 atelier** — une par voiture prête : 4 `en_attente` (BB-202-BB, BG-707-GG, BH-808-HH
  autorisées par les scénarios, et l'une d'elles par le scénario 6) et 1 `sans_lien`
  (BC-303-CC, dont l'autorisation a été refusée à juste titre) ;
- **3 devis** — semées par le jeu de données, jamais touchées par un geste d'écran.

Toutes les adresses de ce garage sont en `.invalid` : un envoi accidentel ne pourrait
atteindre personne, le domaine n'existe pas par norme (RFC 2606).

Relevé du 2026-09-20T14:27:47.606Z — projet Test.

**`notifications_atelier`** — 6 `en_attente`, 1 `envoi_en_cours`

<details><summary>6 × en_attente</summary>

- `27ef1aff-ad94-4bc3-93a4-daf801119003` — créée 2026-09-20
- `15204c8f-9421-4d7f-9226-60439046f549` — créée 2026-09-20
- `e190c734-bed2-498e-9ae8-c906787b697c` — créée 2026-09-20
- `ddb518b9-6160-48fb-b02e-ee44233c7f14` — créée 2026-09-20
- `e808a9b2-afa8-4352-905e-386bd057429c` — créée 2026-09-20
- `773e86d9-6485-4b79-8159-7a43e17a1183` — créée 2026-09-20

</details>

<details><summary>1 × envoi_en_cours</summary>

- `10f5accd-5227-44b9-91fb-6cb149e2ad03` — créée 2026-09-15

</details>

**`notifications_devis`** — 17 `en_attente`, 33 `envoi_en_cours`

<details><summary>17 × en_attente</summary>

- `c1c5c79a-1c3c-482c-9a06-489559ae67ee` — créée 2026-09-04
- `f804f6e4-5926-4f05-823a-648321ab2d5e` — créée 2026-09-04
- `7fad3d46-0989-4e59-8ad3-557fdb13365d` — créée 2026-09-04
- `ed8102f4-2e08-4a75-b797-8ac86e91b8f4` — créée 2026-09-04
- `b60d6054-b989-4e7b-bb9e-84f1029def96` — créée 2026-09-04
- `5e5ea6b0-ae64-4fb8-bc87-0ffea4afe644` — créée 2026-09-04
- `e16af5e7-f019-49cb-b7f2-434654ce6f6d` — créée 2026-09-07
- `dd3be527-b77e-4c04-9665-a07662d1623a` — créée 2026-09-07
- `3ea38bc4-bcef-440d-ae64-48b6ffd99381` — créée 2026-09-07
- `6f5c0d53-91e6-4c9f-b4d3-fc53fcb6ddf8` — créée 2026-09-07
- `da06eef9-7e74-4da0-af5a-4583d2d70648` — créée 2026-09-11
- `4cabf95e-2bcc-4283-a537-68b5e5c79f2a` — créée 2026-09-12
- `20ce3291-090b-410d-8a9c-ef440b0af194` — créée 2026-09-12
- `4dc25d40-b642-4817-8d3b-178a2f9f49da` — créée 2026-09-12
- `49c54fad-eaf9-46c3-b556-82a284578bbc` — créée 2026-09-13
- `393de389-37db-453e-b66d-a041980e59a6` — créée 2026-09-14
- `fcb0a06b-85a5-4ed1-af45-7d3ee7210127` — créée 2026-09-20

</details>

<details><summary>33 × envoi_en_cours</summary>

- `3b9d25ac-54d2-47d7-83fd-bdd374dcdf14` — créée 2026-09-13
- `ded9b3e7-3112-4704-a50a-0cac2541a926` — créée 2026-09-14
- `9a706887-6584-4cba-88fa-29bfb3925858` — créée 2026-09-14
- `a7e8dfa0-f9ab-4ab6-98a9-7a57bfcf07d6` — créée 2026-09-14
- `7c43b62d-d90f-4e95-8826-52ce9d19c8c1` — créée 2026-09-14
- `88508599-0937-4972-95a4-a5a2147454dc` — créée 2026-09-14
- `cf1914ce-add7-474b-8b99-06a42a93afae` — créée 2026-09-14
- `879d5aa4-c23b-4632-8db4-1c52102f3769` — créée 2026-09-14
- `7015d638-a45c-4911-a63b-2992e613c4b3` — créée 2026-09-14
- `2a4d2372-999a-4995-966b-0dff11abbb46` — créée 2026-09-14
- `815782a4-a45b-4a5e-ac9e-a312766a18c8` — créée 2026-09-15
- `4c469d9a-afc9-4873-868c-c199963f8313` — créée 2026-09-15
- `015fc4a2-936c-4f39-8fdb-788c011d8c67` — créée 2026-09-15
- `ea4eb838-49ea-4a95-afcb-81bc6192a192` — créée 2026-09-15
- `7bc19fc4-3f21-490a-8835-46a27e5b0706` — créée 2026-09-15
- `989458e5-44b6-4721-85aa-b084e945996c` — créée 2026-09-15
- `09cbdcaf-20bf-49d3-a3c7-f95e59b797d0` — créée 2026-09-15
- `0c271023-a827-4484-9859-c1d3398cab24` — créée 2026-09-15
- `fb044253-c0e4-464b-9864-aa90c62d6ce4` — créée 2026-09-15
- `1a9f41a4-5d58-48a4-a61e-b02ff123ff02` — créée 2026-09-15
- `837de99e-5dfe-4c10-8dc8-33f0f99da176` — créée 2026-09-15
- `be853282-aa0b-4578-ad03-a07cac9614dd` — créée 2026-09-15
- `796f3a89-0fe9-4355-b773-f9575a351dfd` — créée 2026-09-15
- `7e6d54ec-e7ea-46e2-94c3-52a32ee8a541` — créée 2026-09-15
- `b38e9202-980b-4f58-a838-246fe1ad09d3` — créée 2026-09-15
- `6a5a0dae-1ba5-4f80-8fd6-50c96b96c877` — créée 2026-09-16
- `6d155e42-0773-44b0-9b55-13274ee20787` — créée 2026-09-16
- `6f002145-c132-4775-89b8-9bfaea79a844` — créée 2026-09-16
- `c1db3ceb-d56b-440e-8a1d-70532db73cae` — créée 2026-09-16
- `d34e6f34-cb5d-49b3-86f8-6275fd9ff5ab` — créée 2026-09-16
- `44b386a7-1872-4a38-a32b-09859a4dded4` — créée 2026-09-16
- `21edae6d-d91c-4915-a7b5-071d17a9bb8d` — créée 2026-09-16
- `8da7c78a-dd8e-4d9c-943a-4b9b12379d8f` — créée 2026-09-20

</details>

**`notifications_factures`** — 3 `en_attente`, 3 `envoi_en_cours`

<details><summary>3 × en_attente</summary>

- `400ee673-a178-4cc9-86d2-44a575551676` — créée 2026-09-04
- `f72ed1ef-1f82-42d5-b97a-6e548f0fec5f` — créée 2026-09-04
- `980c7b44-b5c6-4554-ac9a-2a4cbdab0e29` — créée 2026-09-04

</details>

<details><summary>3 × envoi_en_cours</summary>

- `175c3b77-f8a5-44a8-bd7c-dd15293c70da` — créée 2026-09-15
- `dbe89131-84ad-4fd1-b76f-a3b5bec4928f` — créée 2026-09-16
- `adddab10-0612-4fb7-a8ec-abe41caadb21` — créée 2026-09-16

</details>

**Total : 63 lignes armées.** Aucune ne doit partir.

---

## 10. Seconde passe — trois corrections de plus

**a. Le libellé pendant l'appel.** Le bouton affichait « Envoi autorisé… » *avant* la
réponse du serveur : une confirmation annoncée d'avance, et c'est précisément ce qui a fait
croire que le geste avait abouti. Il dit désormais **« Autorisation en cours… »**.
L'autorisation n'est affirmée qu'une fois la base d'accord. Vérifié dans le bundle servi :
« Autorisation en cours » présent, **« Envoi autorisé » absent**.

**b. Une réponse perdue n'est plus un échec.** Le message disait « La connexion a échoué.
Rien n'a été envoyé — réessayez. » C'était une affirmation gratuite : la requête a pu
aboutir et seule la réponse se perdre. Désormais :

- on affiche **« Impossible de confirmer l'autorisation. Vérifiez l'état avant de
  réessayer. »** ;
- puis on relit l'état avec **le mécanisme existant** (`etat_envoi_atelier`, via `lireEtat`),
  et c'est lui qui tranche : autorisation présente → on ferme et on le dit ; absente → on le
  dit aussi et on peut réessayer ; état illisible → le doute reste affiché, tel quel.

**Rien n'est réautorisé automatiquement**, et `autoriser_envoi_atelier` garde son refus de
réarmer une ligne déjà `en_attente` ou `envoi_en_cours`.

**c. La liste se rafraîchit sans rechargement.** `AujourdhuiJour` lisait les états d'envoi
pour son compte, et sa lecture ne se rejouait qu'au changement de la liste des voitures
prêtes. Les états relus par le module partagé lui sont maintenant passés (`etatsEnvoiFrais`)
et le plus frais gagne. Les deux valeurs viennent de la même fonction de base : aucune n'est
déduite, et `etat` est recopié tel quel — **`en_attente_envoi` reste « autorisé / en
attente », jamais « envoyé »** (vérifié à l'écran, scénario 8).
