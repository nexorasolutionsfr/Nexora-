# Constat → devis sans ressaisie — v1

14 septembre 2026. Remplace, sur deux arbitrages, la conception du 13 septembre
(`reduire-la-saisie-des-devis.md`, section 3) : le brouillon se prépare **avant**
la réponse du client au contrôle, et une ligne non chiffrée porte un **état**
explicite, pas un zéro silencieux.

Implémenté sur la branche `integ/constat-devis-suivi`, migration
`20260919000100_constat_vers_devis.sql` appliquée sur **Test seulement**.

---

## 1. Le parcours

1. Le contrôle existe (écran « Contrôle véhicule », inchangé) : des points, des
   états, des commentaires, des photos. C'est le **constat du mécanicien**.
2. Depuis le **dossier du véhicule**, l'accueil ou le dirigeant clique
   **« Préparer le devis depuis le constat »**. Le véhicule, le client et la
   visite courante sont déjà connus : la fenêtre ne les redemande pas.
3. La fenêtre montre trois blocs, dans l'ordre où le garage pense :
   - **Demande du client** — la prestation et les notes du rendez-vous ;
   - **Constat du mécanicien** — les points du contrôle (hors « OK »), avec
     état, commentaire et photos ; cochés d'avance sauf refus du client ou
     point déjà repris dans ce devis ;
   - **Travaux proposés** — dans quel devis les lignes naissent : un devis
     existant encore modifiable de cette voiture, ou un nouveau.
4. La base crée une ligne main-d'œuvre **« Prix à renseigner »** par point,
   libellé et commentaire copiés par valeur. Le devis s'ouvre dans l'écran
   Devis, sur la carte du bon devis.
5. L'accueil chiffre chaque ligne (bouton « Chiffrer ») et peut ajouter une
   pièce rattachée au même constat. Les photos du constat suivent la ligne.
6. Tant qu'une ligne est « Prix à renseigner », **rien ne part** : pas de lien
   public, pas d'autorisation d'envoi, pas de lecture ni de réponse par jeton.

Ce que ce geste **ne fait pas** : il n'envoie rien, n'arme aucune notification,
ne devine aucun prix, ne modifie pas le contrôle.

## 2. Le modèle

| Objet | Ce qui est ajouté | Pourquoi |
|---|---|---|
| `devis.rendez_vous_id` | relation de **préparation**, nullable, trigger de cohérence garage/client/véhicule | Un devis sait pour quelle visite il a été préparé. Distinct de l'OR (exécution, devis accepté requis). Aucune réassociation de l'historique. |
| `devis_lignes.inspection_point_id` | le constat d'origine, `on delete set null`, contrôlé par trigger (même garage, même véhicule que le devis) | Provenance et photos. Pas d'unicité : un constat peut donner pièce + main-d'œuvre. |
| `devis_lignes.reprise_id` | l'opération qui a créé la ligne | Idempotence. Jamais une règle métier. |
| `devis_lignes.note_constat` | copie par valeur du commentaire au moment de la reprise | Interne au garage, jamais projeté sur le devis public. |
| `devis_lignes.prix_a_renseigner` | état « pas encore chiffré », CHECK `prix = 0` quand vrai | Le 0 est un espace réservé, et il se voit partout. |
| `devis_reprises` | id fourni par l'écran, garage, devis, contrôle, visite, points | L'identité stable d'un geste. |
| `preparer_devis_depuis_constat(p_reprise_id, p_inspection_id, p_points, p_devis_id?, p_rendez_vous_id?)` | SECURITY DEFINER, `search_path = ''`, exécutable par `authenticated` seulement | Le seul chemin d'écriture de la reprise. |

### Idempotence et concurrence

L'écran tire un uuid **une fois** à l'ouverture de la fenêtre. La fonction
prend un verrou consultatif transactionnel sur cet identifiant
(`pg_advisory_xact_lock`), puis lit `devis_reprises` : si la reprise existe,
elle rend son résultat sans rien écrire. Deux clics ou deux requêtes
simultanées se sérialisent ; une seule crée. Vérifié par
`scripts/recette/constat-devis-serveur.mjs` (contrôle 1 : deux appels
`Promise.all`, une reprise, deux lignes, une notification `sans_lien`).

Un point déjà présent **dans ce devis** (par `inspection_point_id`) est rendu
dans `deja_reprises`, jamais dupliqué. Le même point dans un **autre** devis
(révision) est une autre opération : il passe.

### Refus, dans cet ordre

| Situation | Réponse |
|---|---|
| appelant sans rôle `dirigeant`/`accueil` sur le garage du contrôle (mécanicien, révoqué, autre garage) | exception « Contrôle introuvable ou accès refusé » |
| devis d'un autre garage | exception « Devis introuvable ou accès refusé » |
| devis accepté / refusé | `{ ok: false, raison: 'devis_verrouille' }` |
| devis d'un autre véhicule ou d'un autre client | `vehicule_different` / `client_different` |
| contrôle sans client, devis à créer | `client_inconnu` |
| rendez-vous fourni incohérent | `rendez_vous_incoherent` |
| point refusé par le client | signalé dans `refuses`, non inclus |
| point hors de ce contrôle | signalé dans `hors_controle` |

### Chiffrage incomplet, côté serveur

`devis_chiffrage_incomplet(devis)` (interne) est lue par :

- `creer_jeton_devis` → exception « Devis incomplet : des lignes attendent
  encore leur prix » ;
- `autoriser_envoi_devis` → `{ ok: false, raison: 'chiffrage_incomplet' }`,
  avant même le contrôle du destinataire ;
- `lire_devis_par_jeton` → `{ ok: false, raison: 'chiffrage_incomplet' }`
  (un jeton posé avant l'ajout d'une ligne ne montre plus un 0 € qui n'est pas
  un prix) ;
- `repondre_devis_par_jeton` → idem : on n'accepte pas un prix inexistant.

`empreinte_devis` intègre désormais le **nombre de lignes** et l'**état de
chiffrage**. Sans cela, une ligne à 0 € ne changeait pas les montants, donc
pas l'empreinte, et un envoi déjà autorisé serait parti.

> **Conséquence à la publication** : l'empreinte de TOUS les devis change.
> Toute notification de devis `en_attente` (autorisée, pas encore partie) au
> moment de la migration sera mise de côté par `reserver_notifications`
> (« le document a changé depuis la validation »). Le plan de publication
> doit compter ces lignes avant et les réautoriser après, à la main.

## 3. L'écran

- `components/vehicle-case-file/VehicleCaseFileView.jsx` — le bouton, visible
  si le rôle chiffre (`peutFacturer`), si le module contrôle est actif, et
  tant que la visite n'est ni facturée ni terminée. La ligne « Devis » de
  l'intervention liste **plusieurs devis préparés pour la même visite** avec
  référence, date, montant et statut : on montre, on ne choisit pas.
- `components/devis-lignes/PreparerDevisDepuisConstat.jsx` — la fenêtre.
  Contrôle par défaut : le seul, ou celui de la visite ; sinon un choix.
  Devis par défaut : « Nouveau », sauf si **exactement un** devis est déjà
  préparé pour cette visite (`reprise.js`, testé).
- `components/devis-lignes/DevisLignesEditor.jsx` — la ligne « Prix à
  renseigner » (badge, « — » en prix, bouton **Chiffrer**), la provenance
  (chip Constat, note, vignettes signées à la consultation, agrandissement
  par `PhotoEnGrand`), les totaux **partiels** tant que c'est incomplet, et
  « Constat concerné » pour rattacher une pièce ajoutée à la main.
  Dans le formulaire, un prix laissé **vide** garde l'état ; **0 tapé** est un
  prix nul confirmé.
- `DevisCard` (`NexoraDashboard.jsx`) — badge « À chiffrer » ; les trois blocs
  envoi / lien / réponse sont remplacés par une seule phrase tant que le
  devis est incomplet.

## 4. Lot 0 : ce qui a été corrigé en passant

- **Devis deviné par `vehicule_id`** — supprimé dans `AujourdhuiJour.jsx`,
  `filDuRendezVous` et `selectionnerInterventionCourante`. Seules deux
  relations comptent : `ordre.devis_id`, puis `devis.rendez_vous_id`.
  Plusieurs devis pour une visite → aucun choisi, liste rendue
  (`devisCandidats`), le fil dit « vérifiez » (`devisDeLaVisite`, testée).
  Sans rendez-vous : un devis seul est retenu, plusieurs sont listés dans
  « Devis sans intervention associée ».
- **Inspection modifiée sans effet** — reproduit : un UPDATE refusé par la
  politique d'accès revient en 204, 0 ligne, sans erreur ; l'écran gardait la
  valeur. `InspectionsSection.jsx` demande désormais `select('id')` sur
  chaque écriture, revient à l'état précédent si 0 ligne ou erreur, et dit
  pourquoi (verrou, ou accès perdu). Un contrôle verrouillé reste verrouillé.

## 5. Ce qui reste (et n'est pas prétendu livré)

- ~~Preuve visible côté client~~ — **livré le 14 sept. (soir)** :
  `20260919000800` et `000900`. La page publique montre, par ligne, le texte
  du constat et ses photos. Elle ne reçoit que des identifiants opaques ;
  `/api/devis/preuves` revalide le jeton et signe les chemins. **Décision** :
  à l'acceptation ou au refus, les photos sont figées dans `devis_preuves` et
  protégées ; avant, la preuve suit le constat.
- ~~Le rôle mécanicien ne documente pas encore de contrôle~~ — **livré** :
  `20260919000700`. Fonctions `atelier_mes_constats`, `atelier_ajouter_constat`,
  `atelier_ajouter_photo`, bornées à l'intervention affectée, au garage, au
  salarié actif, au contrôle non verrouillé ; stockage réécrit sur les mêmes
  bornes. Aucun accès financier.
- **Notes structurées 3 C** : les trois blocs de la fenêtre sont une
  présentation des champs existants (rendez-vous, points, lignes), pas de
  nouvelles colonnes.
