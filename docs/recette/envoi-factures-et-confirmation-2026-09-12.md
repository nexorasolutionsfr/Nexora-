# Confirmation d'inscription, envoi des factures, revue des dix premières minutes — 12 septembre 2026

Lot ouvert après la fusion de la PR #82. Trois questions, dans cet ordre :
un ancien lien de confirmation qui laisse une erreur dans l'adresse ; la
facture qui partait au client dès sa génération ; et ce qu'un garagiste
comprend, seul, pendant ses dix premières minutes. Tout a été joué sur
**Supabase Test** avec des données fictives. **Rien n'a été fusionné ni
appliqué en Production.**

## Point de départ vérifié

| | |
|---|---|
| `main` | `683c686` (documents de passation du 12 septembre) |
| Test (`slawilafseganlbghgwx`) | migrations jusqu'à `20260915000300`, empreintes des fonctions d'envoi identiques à la Production |
| Production (`omphppsmhmyllapdqevn`) | mêmes migrations, mêmes empreintes ; files de factures : 1 ligne `envoye`, 0 en attente, 0 en cours (lecture seule) |
| Le compte `baptiste.papoul52+essai1209b@gmail.com` (Production) | **non touché** : ni ouvert, ni modifié |

## 1. Le lien de confirmation

### Le mécanisme, vérifié dans supabase-js 2.112.3

À l'ouverture, `GoTrueClient._initialize` lit le fragment de l'URL. S'il y
trouve `error_code`, il lève une erreur et **ne retire pas le fragment** —
il ne l'efface que quand il y trouve une session valide. Une session déjà
enregistrée n'est pas invalidée (« Don't remove existing session on URL login
failure »). D'où le constat de Production : connecté, mais avec
`#error=access_denied&error_code=otp_expired…` qui reste dans l'adresse.

### Ce qui change

`components/connexion/lienConfirmation.js` (pur, testé) décide :

| Situation | Décision | Écran |
|---|---|---|
| fragment d'erreur **et** session valide | `nettoyer` : `history.replaceState` sans le fragment, sans un mot | l'application, connectée |
| fragment d'erreur, pas de session | `expliquer` | « Lien expiré » — « Ce lien n'est plus valable. Demandez un nouvel e-mail de confirmation. », champ e-mail, bouton « Demander un nouvel e-mail de confirmation », lien « Se connecter » |
| fragment de session (`access_token`) | `rien` — **jamais retiré**, c'est lui qui connecte | — |
| pas de fragment, ancre ordinaire | `rien` | — |

Après un renvoi accepté par l'API : « Un nouvel e-mail a été demandé pour
`<adresse>`. Utilisez le dernier message reçu : les liens précédents ne
fonctionnent plus. Il peut mettre une minute à arriver. » Ni « envoyé », ni
« reçu », ni « délivré » : seule l'acceptation par l'API est connue. Le
même texte sert à l'écran « Vérifiez vos e-mails », dont le sous-titre dit
désormais « Un e-mail de confirmation a été demandé pour … » au lieu de
« vient de partir ». Le renvoi porte maintenant `emailRedirectTo` explicite,
comme l'inscription.

### Preuves (Test, port 3112, code de la branche)

| Contrôle | Résultat |
|---|---|
| Inscription réelle depuis l'API publique (`baptiste.papoul52+recette-ux-1209@gmail.com`) | e-mail de confirmation **reçu** en boîte à 08:06:41 UTC (expéditeur `noreply@mail.app.supabase.io`) |
| Premier usage du lien | redirection vers `localhost:3112/dashboard#access_token=…&type=signup` ; compte confirmé à 08:07:20 UTC |
| Second usage du même lien | `#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired` — exactement le fragment vu en Production |
| **Lien périmé avec session valide** | connecté par lien magique, puis l'adresse `…/dashboard#error=…otp_expired…` rechargée : `location.href` = `http://localhost:3112/dashboard`, écran « Bienvenue sur Nexora » intact |
| **Lien périmé sans session** | écran « Lien expiré » avec la phrase demandée, à 1440 px et à 375 px |
| **Renvoi limité** (second compte, `+recette-ux-1209b`) | « Trop de demandes en peu de temps : aucun nouvel e-mail ne peut être demandé tout de suite. Réessayez dans une heure. Le dernier message reçu reste valable. », bouton fermé 60 s |
| La phrase « reste valable » est vraie | après ce refus, le premier lien de ce compte a **encore fonctionné** (redirection avec `access_token`), puis, réutilisé, a rendu `otp_expired` |
| **Renvoi accepté** | non rejouable en navigateur sur Test (quota du mailer intégré atteint par les deux inscriptions) ; le message est verrouillé par test unitaire |

Tests : `components/connexion/lienConfirmation.test.js` (10) et
`renvoiConfirmation.test.js` mis à jour — lien périmé sans session, avec
session, fragment de session jamais retiré, renvoi accepté, renvoi limité,
renvoi refusé sans rien révéler du compte.

Les deux comptes `+recette-ux-1209` et `+recette-ux-1209b` existent sur
**Test** seulement, confirmés, sans donnée réelle. Le mot de passe du premier
n'est écrit nulle part dans le dépôt.

## 2. L'envoi des factures

### Le défaut, confirmé des deux côtés

`notifier_nouvelle_facture` (empreinte `e0c5d0ae…`, identique sur Test et
Production) produisait un jeton et mettait la notification `en_attente` dès
« Générer la facture ». Le traitement « Facture (socle) » réserve toute ligne
`en_attente` toutes les deux minutes : le message partait sans relecture ni
geste d'envoi — l'écran Factures n'en avait pas.

Second défaut, trouvé en lisant l'exécution réelle du 12 septembre à 00:04 :
le message envoyé disait « 144 € », l'aperçu du même devis « 144.00 € ». Le
nœud n8n reçoit un nombre JSON et l'interpole en JavaScript ; l'aperçu SQL
concaténait le `numeric`. L'alignement « mot pour mot » de la PR #82 était
donc faux au chiffre près.

### Migration `20260916000100_facture_creee_pas_envoyee.sql`

| Objet | Effet |
|---|---|
| `notifier_nouvelle_facture` | la notification naît `sans_lien`, sans jeton, quel que soit l'appelant |
| `montant_comme_le_traitement(numeric)` | écrit le nombre comme JavaScript : `144`, `144.5`, `100` |
| `apercu_message_devis` | même texte qu'avant, montant écrit comme le traitement |
| `apercu_message_facture(id, jeton, type)` | le message du nœud « Construire le message » de « Facture (socle) », relevé sur la définition vivante : objet « Votre facture <numéro> », texte « … vous transmet la facture <numéro> pour votre <véhicule> (<immat>) : <montant> € TTC. Consultez le détail ici : <lien> … », mêmes replis ; variante `payee` conservée |
| `etat_envoi_facture(id)` | à valider / en attente d'envoi / envoi en cours / envoyé / bloqué, sur la seule file `nouvelle` |
| `autoriser_envoi_facture` | seul chemin vers `en_attente` ; dirigeant **et accueil** ; destinataire montré et empreinte enregistrés ; second appel = `deja_autorise`, rien d'ajouté ; ne regarde que la file `nouvelle` (une confirmation de paiement en attente ne fait plus croire que la facture est programmée) |
| `creer_jeton_facture` | dirigeant et accueil (l'autorisation produit le jeton) ; aucun effet de bord |
| Lignes existantes | **aucune touchée** : ni armée, ni retirée |

Appliquée sur **Test** par `supabase db push` depuis un miroir hors dépôt,
après un dry-run ne proposant qu'elle. **Production : dry-run seulement**
(voir plus bas).

Note sur l'accueil : le droit d'envoi lui est ouvert en base ici, parce que le
lot le demandait explicitement, au même niveau que le devis. L'écran, lui, est
resté fermé jusqu'au second passage — droit sans écran pour l'exercer. C'est
la décision **§ 4.2** qui l'ouvre.

### Écran Factures

- `components/envoi/EnvoiDocument.jsx` : le composant d'envoi du devis,
  généralisé. `EnvoiDevis` et `EnvoiFacture` n'en sont que deux réglages
  (fonctions de base, phrases). Mêmes cinq états, même relecture
  périodique tant qu'un envoi est en suspens, même refus de « Réessayer » sur
  un envoi incertain.
- La fenêtre d'une facture porte, comme la carte devis : « Envoyer au
  client » avec l'état réel ; « Voir ce que verra le client » (nouveau
  composant `FactureVueClient`, **le même que la page publique
  `/facture/[jeton]`**, réécrite dessus) ; « Obtenir un lien à transmettre
  vous-même » + « Ce lien n'envoie rien… » ; « Copier » confirme « Lien
  copié ».
- « Générer la facture » ouvre la facture et dit : « Facture générée. Rien
  n'est envoyé au client : relisez-la, puis décidez de l'envoi. »
- Badge « En attente » (ambigu face à « En attente d'envoi ») → « Non payée » ;
  bouton « Voir » → « Ouvrir ».

### Preuves en base (`scripts/recette/envoi-factures-droits.mjs`, 49 contrôles verts)

Script ajouté au dépôt, mêmes garde-fous que `acces-test.mjs` (Test
seulement, comptes `@nexora-recette.invalid`). Sessions obtenues par
`generateLink` + `verifyOtp`, sans mot de passe. Fixtures : un membre
révoqué `recette.dixmin.revoque@…`, un client avec e-mail, une Dacia
Sandero `DEMO-FAC-01`, trois factures dans le garage synthétique « Apres ».

| Règle | Preuve |
|---|---|
| Créer une facture n'arme rien | les trois factures naissent `sans_lien`, sans jeton, sans destinataire ni empreinte |
| Produire un lien n'arme rien | `creer_jeton_facture` puis relecture : toujours `sans_lien`, jeton nul |
| Seul le geste explicite arme | `autoriser_envoi_facture` avec l'adresse montrée → `en_attente`, jeton, destinataire, empreinte ; avec une autre adresse → `destinataire_different` |
| Double clic idempotent | second appel → `deja_autorise: true`, même identifiant, **une seule ligne** |
| Dirigeant, accueil autorisés | les deux préparent, lisent l'état et autorisent |
| Mécanicien, révoqué, autre garage, sans session refusés | état et aperçu → `acces_refuse` ou erreur ; autorisation et lien → exception, 16 refus sur 16 ; la facture reste `sans_lien` |
| Facture modifiée après autorisation | `reserver_notifications` bornée au garage la met `bloque` avec motif « a changé depuis la validation », ne la réserve pas ; revalidation → `en_attente`, motif effacé |
| Cinq états visibles | à valider, en attente d'envoi, envoi à vérifier (ligne réservée), envoyé (clôture simulée, jeton effacé), bloqué |
| « Envoyé » ne se réarme pas | `autoriser` sur une facture envoyée → `aucune_notification_en_attente` |
| Rien ne reste en file | 0 `en_attente`, 0 `envoi_en_cours` pour le garage à la fin |

Aucun message n'est parti : rien ne lit la file de Test (revérifié : les six
workflows actifs visent la Production), et les lignes réservées par le script
ont été closes par la fonction même du traitement, avec un motif explicite.

### Preuves à l'écran (Test, dirigeant du garage neuf)

- Facture `F-2026-0001` générée depuis un RDV restitué : en base
  `sans_lien`, jeton nul, **avec** une session utilisateur (le cas qui armait
  avant).
- « Voir ce que verra le client » : garage, « Facture F-2026-0001 », véhicule ·
  motif, 96.00 € TTC, « En attente de paiement », détail — le dessin de la page
  publique.
- « Envoyer au client par e-mail… » : À `client.recette.ux@…`, Objet « Votre
  facture F-2026-0001 », message « … vous transmet la facture F-2026-0001 pour
  votre Peugeot 308 (UX-101-RC) : 96 € TTC. … » — le texte du nœud n8n, au
  lien près.
- Deux clics synchrones sur « Oui, envoyer ce message » : une seule ligne
  `en_attente`, `tentatives = 0` ; écran « en attente d'envoi », destinataire
  affiché.
- Rôle accueil : menu à 7 entrées, pas d'onglet Factures ; la carte devis
  garde son bloc d'envoi (même composant).

## 3. Les dix premières minutes, rejouées (bureau 1440 px, puis 375 px)

Compte neuf créé par l'inscription publique, garage « TEST Recette UX — ne
pas contacter », activité « Mécanique générale ». Aucune explication
extérieure. Le panneau du navigateur étant masqué, une partie des gestes a été
déclenchée par clic DOM ; les durées ne sont pas mesurées.

| # | Étape | Constat |
|---|---|---|
| 1 | Inscription, confirmation | formulaire à deux champs, e-mail reçu, lien ouvert, session ; le fragment périmé est traité (voir § 1) |
| 2 | Garage, activité | « Deux questions, et votre garage est ouvert » ; nom seul obligatoire ; neuf activités |
| 3 | Tableau de bord vide | 0/5, cinq lignes guidées, pas de pastille d'ouverture ; menu à 9 entrées |
| 4 | Client + voiture | une fenêtre depuis la ligne guidée ; plaque mise en majuscules ; « Client et véhicule enregistrés » |
| 5 | Rendez-vous | « + Ajouter » sur un créneau ; client trouvé ; **la seule voiture du client n'était pas prise d'office** (corrigé) ; « Rendez-vous créé » |
| 6 | Devis | depuis la fiche client ; « Rien n'est envoyé au client à cette étape » ; ligne 80 € HT → 96 € TTC |
| 7 | Lien, autorisation | aperçu « 96 € » (aligné), « Oui, envoyer ce message » → « En attente d'envoi » ; lien « n'envoie rien » |
| 8 | OR, atelier | « Il a accepté » → « Créer la fiche atelier » ; **la fenêtre demandait de choisir le seul rendez-vous possible** (corrigé) ; OR Brouillon → Confirmé → Terminé ; atelier « Restitué » |
| 9 | Facture | « Générer la facture » → fenêtre ouverte, « Rien n'est envoyé au client » |
| 10 | Envoi facture | aperçu, confirmation, état — voir § 2 |

Mobile 375 px : accueil, « Lien expiré », fenêtre facture — aucun débordement
horizontal de la page (`scrollWidth` = 375).

### Défauts trouvés et gravité

Corrigés dans ce lot :

| Gravité | Défaut | Correction |
|---|---|---|
| P1 | facture armée dès la génération, aucun geste d'envoi | § 2 |
| P1 | aperçu du devis ≠ message envoyé (« 144.00 » / « 144 ») | `montant_comme_le_traitement` |
| P1 | lien de confirmation périmé : erreur laissée dans l'adresse, aucune explication sans session | § 1 |
| P1 | champ « Lien de paiement » dans le détail atelier : enregistré, **lu par rien** (ni page publique, ni « Véhicule prêt », qui attend une valeur que rien ne remplit) — un réglage sans effet | plus affiché (composant et colonne conservés) |
| P2 | « En attente » sur une facture non payée, à côté de « En attente d'envoi » | « Non payée » |
| P2 | rendez-vous : voiture unique à choisir à la main, sinon RDV « sans véhicule » | prise d'office |
| P2 | fiche atelier depuis un devis accepté : liste d'un seul rendez-vous à choisir | pris d'office |
| P2 | « Générer la facture » ne montrait ni la facture ni ce qu'il en advient | fenêtre ouverte + message |
| P2 | « Copier » le lien facture sans retour | « Lien copié » |
| P2 | « Un message vient de partir vers … » / « Nouvel e-mail envoyé » | « a été demandé » |

Relevés, non corrigés (hors périmètre ou à trancher) :

| Gravité | Défaut |
|---|---|
| ~~P1~~ | ~~« Marquer payée » arme une « Confirmation de paiement » automatique, et le changement d'empreinte bloque un envoi déjà programmé~~ — **corrigé, voir § 4.1** |
| ~~P1~~ | ~~accueil : droit d'envoi de facture ouvert en base, écran fermé~~ — **corrigé, voir § 4.2** |
| P2 | OR « Terminé » alors que l'atelier dit « À venir » ; le détail atelier propose « Préparer la fiche atelier » alors qu'un OR existe : trois états pour une même voiture (devis, OR, atelier) qui ne se parlent pas |
| P2 | vocabulaire : « Fiches atelier (OR) » dans le menu, « Nouvel ordre de réparation » dans la fenêtre, « fiche atelier » sur le bouton ; « Travail différé » ; « Générer le lien atelier » |
| P2 | la ligne de devis ne reprend pas l'intervention choisie à la création (à retaper ou « Pré-remplir ») — déjà relevé le 11 |
| P2 | la réponse « Il a accepté » au comptoir arme un e-mail « Votre devis a été confirmé » que le garage ne relit pas — déjà relevé le 12 |
| P2 | après acceptation, le devis quitte la liste et son état d'envoi devient invisible ; la ligne `nouveau` restée `en_attente` sera bloquée à la réservation (empreinte changée), donc ne partira pas : correct mais muet |
| P3 | accueil : « Bonjour, <nom du garage> » ; tuiles « Priorités » / « À risque » à zéro sur un garage neuf ; « CA client enregistré : À renseigner » ; bouton « SMS » (`sms:`) inerte sur un ordinateur ; en-tête de l'écran OR = nom du garage ; filtre « catégories » en valeurs brutes (`diagnostic`, `entretien`) ; « 96.00 € » à point dans les en-têtes, virgule dans les lignes |

## 4. Les deux décisions de clôture (second passage, même PR)

Demandées après la première lecture de la PR. Les deux points restés ouverts
sont fermés ; aucun autre chantier n'a été ouvert.

### 4.1 « Marquer payée » n'envoie rien

**Ce qui était faux.** `notifier_facture_payee` insérait une notification
`payee` à chaque passage au statut payé, et la colonne `statut` de
`notifications_factures` vaut `en_attente` par défaut : la ligne naissait
**armée**, et le traitement l'envoyait dans les deux minutes. Encaisser
écrivait au client, sans relecture, depuis un écran qui n'en disait rien.

**Le conflit d'empreinte, audité.** `empreinte_facture` inclut `statut`. Une
facture marquée payée alors qu'un envoi était déjà programmé voyait son
empreinte changer : la réservation la mettait de côté avec « le document ou le
destinataire a changé depuis la validation ». Techniquement juste, mais
incompréhensible pour un garagiste, et surtout muet sur l'essentiel — ce
message annonçait une facture à régler, désormais réglée.

**Comportement final** (migration `20260916000200`) :

| Situation au moment du clic | Ce qui se passe |
|---|---|
| aucune notification | statut payé, rien de créé — le déclencheur n'existe plus |
| notification `sans_lien` (non armée) | statut payé, la ligne dormante reste intacte |
| envoi **programmé** (`en_attente`) | statut payé **et** ligne passée `bloque` dans la même transaction, motif « facture marquée payée avant l'envoi : le message annonçait une facture à régler ». La réservation ne la reprend plus. Elle reste revalidable par un geste explicite. |
| envoi **en cours** (`envoi_en_cours`) | statut payé ; la ligne n'est **pas touchée** — ni rejouée, ni déclarée bloquée. L'écran le signale et renvoie vers le client. |
| second clic | « déjà payée », rien remis de côté, date de paiement inchangée |

L'application n'écrit plus la table directement : elle appelle
`marquer_facture_payee(uuid)`, qui prend le verrou sur la facture comme
`autoriser_envoi_facture` — les deux gestes se sérialisent, jamais l'un au
milieu de l'autre. Il n'existe donc aucun instant où la facture est payée et
le message « à régler » encore armé.

**Ce que dit l'écran**, vérifié en navigateur sur Test :

- « Facture marquée payée. Aucun message n'a été envoyé. »
- avec un envoi programmé : la même phrase, suivie de « L'envoi qui était
  programmé a été mis de côté : il annonçait une facture à régler. »
- avec un envoi en cours : suivie de « Un envoi était en cours au moment du
  paiement : vérifiez avec le client ce qu'il a reçu avant de lui écrire à
  nouveau. »
- la carte d'envoi passe alors à « E-mail au client : bloqué — Cette facture a
  été marquée payée : le message préparé annonçait une facture à régler.
  Relisez-le avant de l'envoyer quand même. » Sans cette traduction, l'écran
  affichait le message passe-partout « L'envoi n'a pas pu se faire ».

Aucun parcours de confirmation de paiement n'a été construit : aucun bouton,
aucun réglage, aucune ligne dormante. La migration écrit comment le rebâtir
le jour venu.

### 4.2 Le rôle accueil gère les factures

`factures` ne portait que `factures_scope` (`garage_id =
current_garage_id()`), et `current_garage_id()` ne rend un garage qu'au
propriétaire ou à un membre **dirigeant** : l'accueil avait depuis
`20260916000100` le droit d'envoyer des factures qu'il ne pouvait pas lire.

Trois policies dédiées (`factures_accueil_select`, `_insert`, `_update`),
modèle des autres tables du lot accès salariés, appuyées sur `a_acces_garage`.
**Pas de suppression** : une facture est une pièce comptable, et rien dans
l'écran ne la supprime. Côté application : `peutFacturer` inclut l'accueil,
`factures` entre dans ses vues, et la table `NAV_VERS_VUE_ROLE` gagne l'entrée
`facturation` — sans elle, l'entrée de menu disparaissait pour tout rôle
restreint. `revoquer_jeton_facture` est alignée sur `creer_jeton_facture`
(dirigeant et accueil) : l'accueil pouvait produire un lien sans pouvoir le
couper.

Ce que l'accueil ne gagne pas : statistiques, paramètres, gestion des accès,
historique des devis. Aucune policy n'est ajoutée pour eux.

### 4.3 Preuves par rôle

`scripts/recette/facture-payee-et-accueil.mjs` — **47 contrôles verts** sur
Test, données fictives, rejouable :

| Contrôle | Résultat |
|---|---|
| Les cinq situations de « Marquer payée » | conformes au tableau ci-dessus |
| Aucune notification `payee` sur tout le projet Test | 0 |
| Double clic | `deja_payee`, date de paiement inchangée, file inchangée |
| Dirigeant, accueil | acceptés |
| Mécanicien, salarié révoqué, autre garage, sans session | refusés, 4 sur 4 ; la facture reste non payée |
| Accueil : lire, créer, modifier ses factures | oui |
| Accueil : supprimer | refusé, la facture est toujours là |
| Accueil : parcours d'envoi complet (aperçu, lien, révocation, autorisation) | oui |
| Accueil : facture dans un autre garage | refusé |
| Mécanicien, révoqué, autre garage : lecture des factures du garage A | 0 ligne |
| Isolation | le garage B ne voit que ses propres factures |

À l'écran, sur Test (1440 px puis 375 px) :

| Rôle | Constat |
|---|---|
| Dirigeant | facture dont l'envoi était programmé → « Payée », carte « bloqué » avec la phrase du paiement ; en base `bloque`, `envoye = false`, motif explicite, aucune ligne `payee` créée |
| Accueil | menu à 7 entrées, « Facturation » (plus « Devis » seul), onglets Devis + Factures sans Historique, ni Statistiques ni Paramètres ; 13 factures listées ; armement d'un envoi puis encaissement → les deux phrases attendues |
| Mécanicien | écran « Mon atelier » inchangé, un seul bouton (déconnexion), le mot « facture » absent de la page |
| Mobile 375 px | écran Factures sans débordement horizontal (`scrollWidth` = 375) |

Tests unitaires : **306 JavaScript + 29 TypeScript** verts, dont 6 nouveaux
sur les phrases du paiement et 2 mis à jour sur les droits du rôle accueil.

## Vérifications

| | |
|---|---|
| Migration depuis l'état de Production | Test était à l'état exact de Production (mêmes migrations, mêmes empreintes) avant ce lot ; les deux migrations y ont été appliquées dans l'ordre, et le dry-run de Production propose exactement la même paire, dans le même ordre |
| Tests | 300 JavaScript + 29 TypeScript verts (`node --test`) ; 18 nouveaux |
| Build | `next build` vert après chaque série de modifications |
| Recette navigateur | ci-dessus, bureau et mobile |
| Isolation entre garages | dirigeant d'un autre garage refusé sur les quatre fonctions ; rien d'un autre garage affiché |
| Rôles | dirigeant (parcours complet), accueil (écran, et fonctions en base), mécanicien / révoqué (refus en base) |
| Notifications | aucune vers une adresse non autorisée : rien ne lit Test ; seuls deux e-mails de confirmation Supabase sont partis, vers des alias de Baptiste |
| Secrets | aucun dans les fichiers ni dans Git (`.env.local` ignoré ; mot de passe de recette hors dépôt) |
| n8n Production | lu (exports des définitions « Facture (socle) », « Nouveau devis (socle) », « Véhicule prêt (socle) »), **rien modifié** |

## Production : dry-run exact

Depuis un miroir hors dépôt lié à `omphppsmhmyllapdqevn`, avec l'historique
complet des migrations de la branche :

```
DRY RUN: migrations will *not* be pushed to the database.
Would push these migrations:
 • 20260916000100_facture_creee_pas_envoyee.sql
 • 20260916000200_payee_nenvoie_rien_et_factures_accueil.sql
```

Relevé en lecture seule au même moment : le déclencheur
`trg_notifier_facture_payee` est **toujours en place en Production** — le
défaut y est donc vivant — et les deux files sont à 0 en attente, 0 en cours.
Appliquer ces deux migrations ne perturberait aucun envoi en vol.

Le dossier de migrations du miroir a été vidé après coup. Rien n'a été
appliqué.

## Ce qui resterait à vérifier après fusion

1. Déploiement Vercel sur le SHA de fusion, puis `db push` de la seule
   migration ci-dessus après un nouveau dry-run identique.
2. En Production, avec le compte `TEST Baptiste — ne pas contacter` : générer
   une facture, vérifier en base `sans_lien` sans jeton ; **ne pas** confirmer
   l'envoi tant que le client de test n'est pas une adresse de Baptiste.
3. Un envoi réel de facture de bout en bout (Brevo, réception, lien ouvert)
   comme celui du devis le 12 septembre à 00:04.
4. En Production, avec un compte accueil réel : vérifier qu'il voit l'écran
   Factures de son garage, et lui seul.
5. Pour mémoire, trois lignes `en_attente` datées du 4 septembre subsistent
   sur Test (garages « GARAGE TEST RECETTE » et « Garage Démo Vidéo ») :
   antérieures à ce lot, d'autres jeux d'essai, jamais touchées ici. Rien ne
   lit la file de Test.
