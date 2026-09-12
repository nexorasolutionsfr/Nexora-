# Le parcours quotidien, rendu lisible — 12 septembre 2026

Chantier UX ouvert après la fusion et le déploiement de la PR #83. Objectif
unique : qu'un garagiste qui ouvre Nexora comprenne, sans aide extérieure, ce
qui se passe aujourd'hui, ce qu'il doit faire maintenant, où en est chaque
véhicule, quelle est l'étape suivante, et si une action envoie quelque chose
au client.

Tout a été joué sur **Supabase Test** avec des données fictives. **Rien n'a été
fusionné ni appliqué en Production.**

## État réel au départ, vérifié

| | |
|---|---|
| `main` | `abef1fa` — exactement la référence attendue ; déploiement Vercel en succès |
| Test (`slawilafseganlbghgwx`) | migrations jusqu'à `20260916000200` |
| Production (`omphppsmhmyllapdqevn`) | mêmes migrations |
| Branche de ce lot | `ux/parcours-quotidien-lisible`, partie de `abef1fa` |

**Trois écarts de la passation avec la réalité**, signalés et corrigés dans ce
lot : elle décrivait la PR #83 comme « non fusionnée », la facture armée comme
une dette ouverte, et « Marquer payée » comme un envoi automatique non traité.
Les trois sont faux depuis la publication du 12 septembre à 10:06 UTC.

## 1. Le parcours observé avant correction

Compte neuf créé par lien synthétique, garage « TEST UX Quotidien — garage
vide », activité Mécanique générale, bureau 1440 px puis mobile 375 px.

Le tableau de bord d'un garage sans aucune donnée affichait, de haut en bas :

| Bloc | Ce qu'il disait |
|---|---|
| En-tête | « Bonjour, <garage> », puis **quatre compteurs à zéro** : 0 Rendez-vous · 0 En atelier · 0 Priorités · 0 € À risque |
| Mise en route | **cinq étapes à plat**, métier et paramétrage mêlés, chacune terminée par un lien « Passer » |
| Votre journée | **Progression atelier : huit zéros alignés** (À VENIR, VÉHICULE DÉPOSÉ, DIAGNOSTIC, EN ATTENTE CLIENT, ATTENTE PIÈCE, EN INTERVENTION, PRÊT, RESTITUÉ) |
| Ce mois-ci | **0 € · RDV facturés 0 · Panier moyen —** |
| Communications | une pastille « **Email — réponses manuelles** » |

Mesure : **15 zéros** sur la page, 1 439 px de hauteur. Le premier geste utile
— ajouter un client — était une ligne de texte parmi cinq, sans bouton nommé.

## 2. Défauts corrigés, par gravité

### P1

| Défaut | Preuve | Correction |
|---|---|---|
| **« Il a accepté » armait un e-mail non relu.** `notifier_devis_maj` insérait la notification d'acceptation avec le statut par défaut `en_attente` : une saisie de comptoir faisait partir « Votre devis a été confirmé » au client, sans relecture. | Trigger lu en base ; ligne `accepte` / `en_attente` observée | La notification naît `sans_lien` (migration `20260917000100`). Vérifié après saisie : `accepte` / `sans_lien`, sans jeton. |
| **Un devis répondu laissait son envoi armé.** L'envoi « un devis vous attend » restait en file ; la réservation le mettait de côté avec « a changé depuis la validation », motif vrai mais muet. | Ligne `nouveau` / `en_attente` après acceptation | Mise à l'écart **dans la même transaction**, motif explicite ; `envoi_en_cours` jamais touché. |
| **Rien ne distinguait une réponse du client d'une saisie du garage.** Les deux écrivaient `statut` + `date_validation` ; l'accueil affichait « Devis accepté par X — reçu à l'instant » dans les deux cas. | Les deux chemins lus en base | Colonne `devis.reponse_origine` (`client` / `garage`), posée dans le même UPDATE que le statut. L'écran dit « saisi au comptoir » ou « depuis son lien ». |
| **Une rangée de zéros tenait lieu d'information.** | 15 zéros mesurés | Compteurs masqués tant qu'ils sont tous à zéro ; ils reviennent au premier chiffre réel. |
| **« Aucun rendez-vous aujourd'hui » était faux.** À 13 h, un garage qui avait reçu une voiture à 9 h lisait « Aucun rendez-vous aujourd'hui » : le compteur ne retient que ce qui est encore à venir. | Rendez-vous de 9 h créé, phrase relevée à 13 h | « Plus de rendez-vous aujourd'hui » quand la journée est passée. |
| **Ordre de réparation terminé, atelier « À venir ».** Deux statuts contradictoires sur deux écrans, sans qu'aucun ne le dise. | OR passé à Terminé, atelier inchangé | Le panneau véhicule détecte la contradiction et l'explique. |
| **« Préparer la fiche atelier » s'affichait même quand l'ordre existait.** | Bouton relevé sur un rendez-vous dont l'OR était terminé | « Ouvrir l'ordre de réparation » quand il existe, « Créer… » sinon. |

### P2

| Défaut | Correction |
|---|---|
| Cinq étapes de mise en route à plat, métier et configuration mêlés | Deux groupes : **Commencer à utiliser Nexora** (client, rendez-vous, devis) puis **Configurer mon garage** (horaires, équipe) |
| Boutons vagues (« Passer », « Ajouter », « Créer ») | Actions nommées : « Ajouter un client », « Planifier un rendez-vous », « Créer un devis », « Configurer les horaires », « Ajouter un mécanicien ». « Passer » devient « Plus tard », et seulement sur la configuration |
| « Progression atelier » : huit zéros | Masquée tant qu'aucune voiture n'est engagée |
| « Ce mois-ci » : 0 € / 0 / — | État vide utile : « Votre chiffre d'affaires s'affichera ici dès votre première facture », avec un accès direct |
| « Email — réponses manuelles » : indicateur adossé à `automatisation_active`, colonne que **rien ne lit** | Quatre lignes qui distinguent saisie manuelle, envoi préparé, envoi automatique et réponse du client. « Envois automatiques — Aucun. Nexora n'écrit jamais à un client sans que vous l'ayez demandé. » |
| « Bonjour , » possible quand le nom du garage est vide ou fait d'espaces | Nom rogné ; sans nom, la salutation se suffit et la virgule disparaît |
| Après avoir créé un client, planifier son rendez-vous obligeait à rouvrir l'agenda et à le rechercher | Bouton « Planifier un rendez-vous » sur la fiche client, avec le client **et** sa voiture déjà repris |
| Vocabulaire : « Créer la fiche atelier » pour un ordre de réparation | « Créer l'ordre de réparation ». Les deux mots ne désignent plus le même objet |
| Le panneau d'un rendez-vous ne connaissait pas les ordres existants | Les ordres sont chargés et relus au changement d'écran |

## 3. Changements visibles, écran par écran

**Accueil, garage vide** — en-tête sans compteurs ; mise en route en deux
groupes, les trois actions métier avec un bouton nommé, la configuration plus
discrète avec « Plus tard » ; pas de progression atelier ; « Ce mois-ci »
remplacé par sa phrase ; bloc « Ce qui part vers vos clients » à quatre lignes.
**15 zéros → 1** (la progression « 0 sur 5 de fait », qui est une information).

**Accueil, garage actif** — les compteurs reviennent, « Ce mois-ci » reprend
ses chiffres, la mise en route ne montre que ce qui reste. Le basculement est
progressif : mesuré à 0, puis 2, puis 3 étapes faites.

**Panneau d'un véhicule** (détail d'un rendez-vous) — un bloc en tête :
l'état, qui doit agir (« À vous de jouer » / « Au client de jouer » / « Rien à
faire »), la prochaine action, et l'avertissement quand deux statuts se
contredisent. Le bouton d'ordre de réparation nomme ce qu'il fait.

**Devis** — « Enregistrer une acceptation reçue autrement » et « Enregistrer
un refus reçu autrement » remplacent « Il a accepté » / « Il a refusé ». Après
la saisie : « Acceptation enregistrée. Aucun message n'a été envoyé au
client. »

**Réponses des clients** — « Accord de <client> enregistré par le garage ·
saisi au comptoir » quand c'est une saisie, « <client> a accepté son devis ·
depuis son lien » quand le client a cliqué, « origine non enregistrée » pour
les réponses antérieures à la colonne.

**Fiche client** — « Planifier un rendez-vous » à côté de « Faire un devis ».

## 4. Règles métier et transitions corrigées

- Changer un statut métier n'envoie plus rien : ni acceptation, ni refus.
- Une réponse rend caduc l'envoi encore programmé ; il est mis de côté avec
  son motif, dans la même transaction, et jamais rejoué.
- Un envoi en cours n'est jamais touché, quel que soit le geste métier.
- L'origine d'une réponse est enregistrée, jamais devinée.
- Une action déjà faite n'est plus proposée comme prochaine action (`filVehicule`).
- Le fil complet : `Rendez-vous → Devis → Acceptation → Ordre de réparation →
  Fiche atelier → Travaux terminés → Facture`, avec à chaque étape l'état, le
  geste suivant et son auteur.

## 5. Preuves navigateur

Parcours complet joué sur Test, bureau 1440 px puis mobile 375 px :

| Étape | Constat |
|---|---|
| Garage vide | 15 zéros → 1 ; deux groupes ; actions nommées |
| Un clic depuis l'accueil | ouvre « Nouveau client » |
| Client + voiture créés | fiche client, bouton « Planifier un rendez-vous » |
| Rendez-vous | client et voiture déjà repris, aucune recherche |
| Devis | créé depuis la fiche, ligne à 90 € HT → 108 € TTC |
| Envoi | relecture, confirmation, « en attente d'envoi » |
| Acceptation saisie | « saisi au comptoir » ; en base : `nouveau` mis de côté avec motif, `accepte` **non armé** |
| Ordre de réparation | rendez-vous et devis préselectionnés ; passage Brouillon → Confirmé → Terminé |
| Contradiction | panneau : « Travaux terminés sur l'ordre de réparation », avertissement « la voiture est encore notée à venir à l'atelier » |
| Restitution | « Voiture restituée — Générez la facture depuis l'écran Facturation » |
| Facture | générée, « Rien n'est parti. Relisez le message, puis confirmez l'envoi » |
| Accueil après facture | compteurs revenus, « Ce mois-ci » à 108 €, 1 RDV facturé |
| Mobile 375 px | aucun débordement (`scrollWidth` = 375), aucun bouton coupé, garage vide comme garage actif |

Situations particulières exigées :

| Situation | Résultat |
|---|---|
| Garage vide | ci-dessus |
| Garage avec un seul véhicule | mise en route à 2 sur 5, compteurs encore masqués |
| Garage avec parcours complet | mode pilotage |
| Double clic sur l'acceptation | une seule ligne modifiée, une seule notification, aucune armée |
| Rafraîchissement de page | état conservé, aucune erreur |
| État contradictoire historique | réponses antérieures : « origine non enregistrée », jamais attribuées au client |
| Autre garage / salarié révoqué | zéro ligne sur clients, devis, rendez-vous, factures et ordres |

## 6. Preuves par rôle

| Rôle | Constat |
|---|---|
| Dirigeant | parcours complet ci-dessus |
| Accueil | menu à 7 entrées, sans Statistiques ni Paramètres ; mise en route réduite à ce qu'il peut ouvrir (le groupe « Configurer mon garage » n'apparaît pas) ; factures accessibles |
| Mécanicien | écran « Mon atelier » inchangé, un seul bouton ; les mots « facture », « statistique » et « paramètre » absents de la page |
| Salarié révoqué | aucune adhésion, zéro ligne du garage sur les cinq tables |

Le modèle de permissions n'a pas été modifié.

## 7. Tests et build

- **341 tests JavaScript** et **29 TypeScript** verts. 43 nouveaux :
  `filVehicule.test.js` (15), `etatDesEnvois.test.js` (6),
  `reponsesClients.test.js` (+4), `miseEnRoute.test.js` (+3),
  `resumeJournee.test.js` (+5), `calculs.test.js` (+1), `etatsEnvoi.test.js` (+1),
  et les assertions d'ordre et de libellés mises à jour.
- `next build` vert.
- Aucun secret dans les fichiers ni dans Git.

## 8. Migration et dry-run Production

`20260917000100_reponse_devis_qui_n_envoie_rien.sql`, appliquée sur **Test
seulement** après un dry-run ne proposant qu'elle.

```
DRY RUN: migrations will *not* be pushed to the database.
Would push these migrations:
 • 20260917000100_reponse_devis_qui_n_envoie_rien.sql
```

Relevé en lecture seule au même moment : la colonne `reponse_origine` est
absente de Production, et les deux files sont à 0 en attente, 0 en cours.

## 9. Défauts volontairement reportés

| Gravité | Défaut |
|---|---|
| P2 | « Priorités » et « À risque » ne sont pas cliquables alors que « Rendez-vous » et « En atelier » le sont |
| P2 | Le fil du véhicule n'est affiché que sur le panneau d'un rendez-vous ; la carte d'un devis et la fenêtre d'une facture gardent leur propre état d'envoi, cohérent mais non unifié |
| P2 | La ligne de devis ne reprend pas l'intervention choisie à la création |
| P3 | « Fiches atelier (OR) » dans le menu contre « ordre de réparation » dans les écrans : le menu n'a pas été renommé pour ne pas déplacer les repères d'un garage en cours d'usage |
| P3 | Bouton « SMS » (`sms:`) inerte sur un ordinateur ; filtre « catégories » en valeurs brutes ; « 108.00 € » à point dans certains en-têtes |

## 10. Ce qui resterait à vérifier après fusion

1. Déploiement Vercel sur le SHA de fusion, puis `db push` de la seule
   migration ci-dessus après un nouveau dry-run identique.
2. En Production, un garage réel qui ouvre son tableau de bord : vérifier que
   les compteurs réapparaissent bien dès la première voiture attendue.
3. Une acceptation saisie au comptoir en Production : vérifier en base que la
   notification `accepte` naît `sans_lien`.
