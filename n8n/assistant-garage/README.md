# Assistant Garage — communications v2 (Brevo, garage authentique)

Suivi unique des communications de l'ancien Assistant, établi le 10 septembre
2026 à partir de la définition **vivante** dans n8n (`base.json`, 125 nœuds,
aucun secret). Le comptage « neuf e-mails, un migré, six restants » était
faux : voici ce qui existait vraiment.

## Ce que faisaient les neuf envois, avant

| Envoi | Déclencheur | Destinataire | Garage | Transport | État réel avant | Anti-doublon |
|---|---|---|---|---|---|---|
| confirmer devis | webhook `devis-accepte` | client | aucun | Gmail perso | **mort** — plus rien ne l'appelle (0 exécution webhook en 30 j) ; le dashboard écrit le statut en base et le trigger `trg_notifier_devis_maj` fait envoyer le socle | — |
| devis refusé | webhook `devis-refuse` | client | aucun | Gmail perso | **mort**, idem | — |
| confirmer rdv | webhook `proposition-acceptee` | client | aucun | Gmail perso | **mort** et nœud désactivé ; couvert par `trg_notifier_proposition_maj` | — |
| refus proposition | webhook `proposition-refusee` | client | aucun | Gmail perso | **mort** et nœud désactivé | — |
| répondre infos manquantes | message entrant (site, WhatsApp, IMAP) | client | `garage_id` du message, **repli en dur** sur un garage de démo pour l'IMAP | Gmail perso | **nœud désactivé** : n'a jamais envoyé | statut `infos_manquantes` sur la demande |
| Notifier le garage traitement manuel | message entrant non rdv/devis | **boîte fixe du fondateur**, pas le garage | id présent, non utilisé | Gmail perso | **nœud désactivé** | — |
| notifier le garage aucun créneau | demande rdv sans créneau | **boîte fixe du fondateur** | garage lu (horaires) | Gmail perso | **nœud désactivé** | — |
| relance entretien | tous les jours 9 h | client | aucun | Gmail perso | actif mais **dormant** : exige un rendez-vous terminé depuis ≥ 12 mois (aucun n'existe avant août 2027) | `relance_envoyee` posé après envoi |
| avis Google | tous les jours 18 h 30 | client | garage lu | **Brevo** depuis le 9 sept. | actif ; 39 erreurs « No recipients » corrigées le 9 sept. | `avis_demande` posé après envoi |

**Bilan honnête avant cette nuit : aucun e-mail client ne partait plus de
Gmail.** Les quatre webhooks étaient morts, trois nœuds étaient désactivés,
la relance ne peut pas se déclencher avant 2027, et l'avis était déjà migré.
Le risque réel était ailleurs : un **garage par défaut codé en dur** sur
l'entrée IMAP, des notifications internes vers une boîte personnelle, et
quatre branches qui auraient **doublonné le socle** si quelqu'un avait
rebranché le dashboard sur les webhooks.

## Ce que fait la v2 (`construire.py` → `recette-test.json`, `production.json`)

| Envoi | v2 |
|---|---|
| 4 webhooks accepté/refusé | **supprimés** (27 nœuds) — le socle est la seule voie |
| répondre infos manquantes | rallumé ; garage lu en base sur **les deux chemins** (demande créée / mise à jour) ; From « Nom du garage », Reply-To = e-mail du garage ; Brevo ; **soumis à `garages.automatisation_active`** ; sans e-mail client, sans garage ou automatisation coupée → journal `actions_ia` avec motif |
| notifications internes (×2) | rallumées ; envoyées à **l'adresse du garage concerné** depuis « Nexora » ; garage sans adresse → journal |
| relance entretien | recontrôle le rendez-vous **à l'instant de l'envoi** (statut encore `termine`, pas déjà relancé, client avec e-mail, garage trouvé) ; From/Reply-To du garage ; mention pour se désinscrire en répondant ; **déclencheur désactivé en Production** : c'est une sollicitation commerciale et il n'existe ni désinscription enregistrée ni interrupteur par garage |
| avis Google | n'est envoyé que si le client a un e-mail **et** si le garage a renseigné `lien_avis_google` ; sinon journal avec motif et ligne marquée pour ne plus être reprise ; signature au nom du garage ; plus de repli `google.com` |
| entrée IMAP | **plus de garage par défaut** ; un message sans garage est journalisé (`entree_sans_garage`) et non traité ; le déclencheur IMAP est désactivé en Production (boîte partagée = garage inconnu) |
| retour de boucle | défaut préexistant corrigé : le résultat SMTP du dernier envoi revenait dans la file d'entrée comme un faux message |

Aucun e-mail n'a été ajouté au périmètre, aucun destinataire nouveau, aucune
promotion dans un message transactionnel.

## Preuves (recette Test, 10 septembre 2026, 01 h 39 – 02 h 17)

Recette importée **par fichier** (`recette-test.json`, workflow `PICszikUjJIpowgJ`),
identifiants Test, garde-fou qui refuse tout destinataire hors des quatre boîtes
de recette. Deux garages fictifs : SOCLE Garage Alpha (lien d'avis renseigné,
automatisation active) et SOCLE Garage Beta (sans lien d'avis, automatisation
coupée, horaires vides). Le n8n vivant et la Production n'ont rien vu passer.

| Parcours | Événement | Exécution | Résultat vérifié |
|---|---|---|---|
| Réponse infos manquantes | formulaire site, garage Alpha, message vague | 18713, 18776 | e-mail reçu sur `+socle-clientalpha` ; `From: "SOCLE Garage Alpha"`, `Reply-To: +socle-alpha`, DKIM/SPF/DMARC pass, accents corrects, signature au nom du garage |
| Réponse bloquée | même message, garage Beta (automatisation coupée) | 18777 | aucun e-mail ; journal `reponse_non_envoyee` « l'automatisation IA est désactivée pour ce garage » |
| Entrée sans garage | formulaire sans `garage_id` | 18714 | aucun traitement ; journal `entree_sans_garage` |
| Notification interne « traitement manuel » | question de diagnostic, garage Beta | 18725 | e-mail reçu sur `+socle-beta` (l'adresse du garage), depuis « Nexora » |
| Notification interne « aucun créneau » | demande de vidange, garage Beta aux horaires vides | 18720 | e-mail reçu sur `+socle-beta` |
| Relance entretien | 4 rendez-vous terminés depuis 13 mois + 1 annulé | 18790, 18799 | 2 envoyées (Alpha, Beta ; `From` et `Reply-To` du bon garage, mention de désinscription), 2 bloquées « client sans adresse », l'annulé **exclu de la sélection** (18799) après correction du filtre |
| Avis Google | mêmes rendez-vous | 18790, 18799 | envoyé pour Alpha (lien renseigné), bloqué « aucun lien d'avis » pour Beta, bloqué « sans adresse », statut non terminé exclu ; lignes marquées pour ne plus être reprises |
| Lien à jeton ouvert | facture Test `F-2026-0001` | app locale sur Test, port 3111 | page rendue : « SOCLE Garage Alpha — Facture F-2026-0001 — Peugeot 308 — 120,00 € TTC » |

**Ce que la recette a révélé et corrigé en chemin** (les deux sont dans
`construire.py`) :

1. le retour de boucle : après chaque envoi, le résultat SMTP revenait dans la
   file d'entrée et était traité comme un nouveau message ;
2. les deux sélections de rendez-vous combinaient leurs filtres en **OU** — un
   rendez-vous annulé sortait comme « terminé ». En Production, la v2 aurait
   marqué des rendez-vous futurs comme « avis demandé ». Forcé en ET, et le
   statut est revérifié à l'instant de l'envoi.

**Limites de preuve.** La page a été ouverte depuis une application locale
reliée à Test, pas depuis l'extérieur : les préversions Vercel exigent une
connexion. L'IMAP n'a pas été testé (désactivé à dessein). La relance a été
testée sur Test mais est livrée **désactivée** en Production.

## Relevé du 10 septembre 2026 (base n8n vivante, lecture seule)

Fait sur une **copie** de `database.sqlite` du conteneur `nexora-n8n`, pas sur
l'instance. Il corrige et complète le tableau ci-dessus.

### Les sept workflows actifs, et les « cinq vivants »

| Workflow | id | Nœuds | Envoie des e-mails ? |
|---|---|---|---|
| 1 - Assistant Garage Avancé | `rw69Oin74O5UwQlc` | 125 | oui — 4 nœuds d'envoi sur 9 encore allumés |
| Véhicule prêt (socle) | `jXsssqkdKFR3Hnf9` | 12 | oui — 1 |
| Proposition RDV (socle) | `HdO63GrT2WfopDQP` | 13 | oui — 1 |
| Facture (socle) | `9IG1g2ZmHQzhnsMS` | 12 | oui — 1 |
| Nouveau devis (socle) | `X39OgaEUulqhv1hO` | 12 | oui — 1 |
| 3 - Détection no-show | `jnDj8Aj9DmuLV5Di` | 4 | **non** — aucun nœud d'envoi |
| 3 - Journalisation erreurs | `erroralerts…0001` | 3 | **non** — aucun nœud d'envoi |

« **Cinq workflows vivants** » = les cinq premiers, ceux qui peuvent écrire à
quelqu'un. Les deux derniers sont actifs mais muets. C'est ce comptage-là qu'il
faut retenir : *sept actifs, cinq qui envoient*.

### Un workflow actif n'a pas tous ses nœuds actifs

Dans l'Assistant publié, sur 13 déclencheurs, 12 sont allumés ; sur 9 nœuds
d'envoi, 4 seulement. Un envoi ne part que si un **déclencheur allumé** le
rejoint **sans traverser un nœud coupé**. En appliquant ce critère à la
définition vivante :

| Nœud d'envoi (publié) | Nœud | Atteignable ? |
|---|---|---|
| confirmer devis | allumé | **oui**, depuis `devis-accepte` (webhook allumé) |
| devis refusé | allumé | **oui**, depuis `devis-refuse` |
| relance | allumé | oui, depuis le cron 9 h — mais la sélection est vide avant août 2027 |
| avis google | allumé | **oui**, cron 18 h 30, transport Brevo |
| confirmer rdv / refus proposition / répondre infos manquantes / les 2 notifications internes | **coupés** | non |

Les deux premiers ne sont donc pas « morts » au sens du nœud : ils sont
**armés**. Ce qui les rend inoffensifs, c'est que **plus personne n'appelle**
ces webhooks — vérifié deux fois : aucune occurrence de `devis-accepte`,
`devis-refuse`, `proposition-acceptee`, `proposition-refusee` dans tout le code
du dashboard, et **zéro exécution** de ces quatre webhooks sur 30 jours. La
nuance compte : ce sont des chemins ouverts que rien n'emprunte, pas des
chemins fermés. La v2 les supprime, ce qui ferme la porte.

### L'IMAP n'est pas dormant : il tourne

Contrairement à ce qui était écrit, `Email Trigger (IMAP)` est **allumé** dans
le workflow publié et **a relevé 8 messages le 8 septembre** (exécutions
`success`). Aucune n'a atteint un nœud d'envoi — `répondre infos manquantes`
est coupé — mais chaque message a été **rattaché au garage de démonstration
codé en dur**, parce que rien sur un message IMAP ne porte de `garage_id`.
C'est une erreur d'attribution en base, sur des données réelles, aujourd'hui.
(36 échecs d'authentification IMAP le 6 septembre, puis plus rien : la
connexion a été réparée entre-temps.)

Exécutions de l'Assistant publié sur 30 jours : 8 IMAP (`success`), 3 crons
18 h 30 (`error` : « No recipients », corrigé le 9), 2 crons 9 h (`success`,
sans envoi), 36 erreurs d'authentification IMAP. **Aucune exécution de webhook.**

### Ce qui identifie le garage, et pourquoi

| Entrée | Donnée | Fiable ? |
|---|---|---|
| Formulaire du site | `body.garage_id` posté par le dashboard | oui : c'est le site du garage qui l'émet |
| WhatsApp | `body.To` (numéro **appelé**) → `garages.numero_whatsapp` | oui : c'est le numéro du garage, choisi par le client |
| E-mail entrant | **le destinataire** : `Delivered-To` / `X-Original-To` / `To` → `garages.gmail_adresse` | oui **si** chaque garage a son adresse à lui |
| E-mail entrant (Gmail OAuth) | `garage_id` de la ligne `email_connections_avec_app` | oui, mais **zéro connexion enregistrée** |

L'expéditeur n'apprend rien : un même client peut écrire à plusieurs garages,
et une adresse d'envoi se falsifie. Seul le **destinataire** dit à qui le
client s'adressait — c'est exactement le raisonnement déjà appliqué à WhatsApp.

La v2 fait donc, pour l'e-mail, ce que WhatsApp faisait déjà : elle lit le
destinataire et cherche `garages.gmail_adresse`. **Résolution certaine ou
refus** : zéro correspondance *ou plusieurs* → `garage_id` nul, journal
`entree_sans_garage` avec le motif et l'adresse, rien n'est traité. Aucun repli.

**L'IMAP reste néanmoins livré désactivé**, parce que la donnée manque :
`gmail_adresse` est **vide pour tous les garages** et `gmail_connecte` est faux
partout. Une boîte unique partagée ne peut pas remplir cette colonne — il faut
une adresse de réception par garage. Le mécanisme est prêt et attend cette
donnée ; il ne s'invente pas de garage en attendant.

### Nature des messages : ce qui a droit à quoi

On ne met pas la même condition sur une réponse qu'on nous a demandée et sur
une sollicitation qu'on envoie de nous-mêmes.

| Envoi | Nature | Accord du garage | Retrait offert au client |
|---|---|---|---|
| répondre infos manquantes | **transactionnel** — réponse à un message que le client vient d'envoyer | `automatisation_active` | non, et c'est normal : c'est une réponse |
| notifications internes (×2) | **interne** — Nexora vers le garage | — | sans objet |
| relance entretien (12 mois) | **sollicitation** — le client n'a rien demandé | *manquant* | mention présente, mais **rien pour l'enregistrer** |
| avis Google | **sollicitation** | `lien_avis_google` : sans lien renseigné, rien ne part | mention **ajoutée** ce jour |

`clients` n'a **aucune colonne de désinscription** (vérifié : `created_at,
email, est_professionnel, garage_id, id, nom, siren, telephone`). Un client qui
répond « STOP » écrit au garage via le Reply-To ; personne ne peut le retenir
dans le produit. C'est la raison de fond qui tient la relance désactivée — et
non le fait que son code serait douteux : il est recetté.

La demande d'avis, elle, **est active en Production depuis le 9 septembre** et
tombe dans la même catégorie. Elle a un accord par garage (le lien d'avis) mais
n'offrait aucun retrait : la mention y a été ajoutée. Le manque de
désinscription enregistrée reste entier — **c'est une décision à prendre**, pas
un défaut technique de ce lot.

### Le piège d'identifiant, corrigé

`production.json` portait `"id": "rw69Oin74O5UwQlc"` — **l'identifiant du
workflow vivant et actif** — et `recette-test.json` portait
`"id": "eX5THd6tZIYBas8n"`, celui de l'import raté à 361 nœuds. Un
`n8n import:workflow` aurait écrasé, ou fusionné, exactement ce qu'on voulait
préserver ; c'est la même mécanique qui a produit les 361 nœuds. Corrigé :
production porte un identifiant neuf (`assistantv2brevo0000001`, aucun workflow
ne le porte), recette porte celui du workflow de recette **prouvé**
(`PICszikUjJIpowgJ`). `verifier.py` refuse désormais les deux identifiants
interdits.

## Ce qui a été corrigé le 10 septembre (sur la branche, non publié)

1. **Identifiants de publication** — ci-dessus.
2. **Résolution du garage à l'entrée e-mail** — destinataire → `gmail_adresse`,
   une seule correspondance acceptée, motif journalisé sinon. IMAP toujours
   désactivé.
3. **Mention de retrait sur la demande d'avis** — la seule sollicitation active
   en Production porte désormais le même retrait que la relance. Les messages
   transactionnels ne le portent pas, et `verifier.py` le vérifie dans les deux
   sens.
4. **Contrôle de syntaxe JS** — `verifier.py` passe chaque nœud Code à
   `node --check`. Il a immédiatement attrapé une apostrophe mal échappée
   introduite pendant ce même correctif : un JS cassé ne se voyait jusqu'ici
   qu'à l'exécution, en Production.

Preuves de ces correctifs (n8n étant hors d'accès, elles sont **partielles** et
portent sur les deux bouts du mécanisme, pas sur la chaîne complète) :

- extraction du destinataire exécutée sous `node` sur 6 formes de message
  réelles (`Delivered-To`, `X-Original-To`, objet mailparser, `To` avec
  chevrons, `To` multiple, `metadata.headers`) : les 6 rendent l'adresse
  attendue ; un message sans destinataire rend `""` et part au refus ;
- la requête exacte du nœud (`garages?gmail_adresse=eq.…`) jouée sur Test :
  1 résultat pour `garage.alpha@nexora-recette.fr` (posé sur SOCLE Garage
  Alpha), 0 pour une adresse inconnue ;
- `verifier.py` : les deux variantes OK, contrôle JS compris.

**Non prouvé** : la chaîne complète dans n8n (relevé IMAP réel → résolution →
garde), faute d'accès à l'instance.

## Recette finale du 10 septembre 2026 (instance n8n dédiée)

Rejouée **hors de l'instance vivante** : un conteneur `recette-n8n` à part
(port 5679, volume propre, même clé de chiffrement pour relire les
identifiants), workflow importé sous un identifiant neuf
`recetteassistantv2b001`, cinq identifiants seulement — aucun ne vise la
Production. Deux instruments n'existent que dans la variante de recette :
`recette-email-entrant` (qui alimente le **vrai** `Normaliser (Gmail)`, donc la
vraie fonction d'extraction du destinataire) et `recette-tournees`.

L'export déployé a été recomparé au fichier du dépôt : **empreinte identique**
(`2191000a8485`, 127 nœuds). Ce qui a été éprouvé est bien ce qui est livré.

| Scénario | Attendu | Observé |
|---|---|---|
| Résolution **certaine** — message à l'adresse d'Alpha | garage Alpha, réponse envoyée | `garage_id` = Alpha, `motif_resolution` vide ; `From: SOCLE Garage Alpha`, `Reply-To: +socle-alpha`, SMTP `accepted`, `rejected: []` |
| Résolution **absente** — adresse inconnue | refus explicite | journal `entree_sans_garage` — « aucun garage pour cette adresse de réception (destinataire : …) » |
| Résolution **ambiguë** — deux garages sur la même adresse | refus explicite | journal `entree_sans_garage` — « adresse de réception partagée par 2 garages » |
| **Aucun garage par défaut** | rien n'est traité sans garage | les deux cas ci-dessus n'écrivent ni demande ni client |
| **Automatisation coupée** (Beta) | aucun envoi, motif journalisé | journal `reponse_non_envoyee` — « l'automatisation IA est désactivée pour ce garage » |
| **Encodage et contenu** | accents et euro intacts | reçu : « Bonjour Élodie Prêtre », « véhicule », « à bientôt » |
| **Relance** | 2 envoyées, 2 bloquées, annulé exclu | exactement cela ; le rendez-vous annulé reste `relance_envoyee = false` |
| **Avis** | 1 envoyé (Alpha), 3 bloqués | garde : 1 sortie vraie, 3 fausses ; motifs « sans adresse » (×2) et « aucun lien d'avis » |
| **Mention de retrait sur l'avis** | présente | reçue : « Si vous ne souhaitez plus recevoir ce type de message… » |
| **Branches éteintes dans l'export Production** | relance, avis, IMAP, Gmail OAuth | les quatre `disabled: true` ; seuls les deux webhooks du site et de WhatsApp restent allumés |

**Un défaut trouvé et corrigé en cours de recette.** La résolution du garage
était placée **après** « Point d'entrée unifié ». Or plusieurs nœuds en aval
relisent ce nœud (`$('Point d'entrée unifié')`) : ils y retrouvaient le garage
d'**avant** résolution, c'est-à-dire nul, et la branche mourait sur
`invalid input syntax for type uuid: "null"`. La résolution a été déplacée
**avant** « Point d'entrée unifié », sur le seul chemin e-mail (le site et
WhatsApp entrent directement et ne sont pas concernés). Scénario rejoué : vert.

**La demande d'avis est désormais livrée éteinte**, au même titre que la
relance. Ce n'est pas un défaut de son code — il est recetté et fonctionne :
c'est une **sollicitation**, et `clients` n'a aucune colonne de désinscription.
Le « stop » d'un client arrive au garage par le Reply-To et n'est enregistré
nulle part.

**Limite qui demeure.** Le routage IMAP multigarage n'est pas prouvé : la
recette injecte un message dont le destinataire est connu, ce qui éprouve
l'extraction et la correspondance, mais pas une vraie chaîne de livraison. Les
huit messages réels du 8 septembre le montrent — leur `Delivered-To` valait la
boîte partagée, pas une adresse de garage. Le mécanisme n'est valable que si
chaque garage a **sa propre boîte relevée directement**, pas derrière un
transfert. `Email Trigger (IMAP)` reste éteint.

## Plan de passage en Production (à ne pas dérouler sans feu vert)

**La fusion Git et l'activation n8n sont deux gestes séparés, et dans cet
ordre-là seulement par convenance.** Le workflow n8n ne lit pas le dépôt : il
est importé depuis un fichier. Fusionner #81 ne change donc **rien** au
comportement de Production — aucune migration, et les fichiers `n8n/` ne sont
pas déployés. Inversement, on *pourrait* importer la v2 sans fusionner. La
seule dépendance réelle est humaine : garder une version de référence de ce qui
tourne. **Recommandation : fusionner d'abord, activer plus tard, séparément.**

### A. Fusion Git (sans effet sur les envois)

Rien à préparer : aucune migration, aucun secret, Vercel verte. Le seul effet
visible est le dépôt lui-même.

### B. Activation n8n (le geste qui compte)

1. **Version à importer** : `n8n/assistant-garage/production.json`, 120 nœuds,
   `"active": false`, `"id": "assistantv2brevo0000001"` (aucun workflow ne le
   porte : l'import crée un workflow **neuf** à côté du vivant). Aucun secret :
   seules des références d'identifiants n8n.
2. **Import par fichier** (n8n → Import from File), **jamais par collage** : le
   collage corrompt les accents et l'euro. Ne jamais importer dans un workflow
   déjà ouvert : l'import **ajoute** les nœuds au lieu de remplacer — c'est
   ainsi que la recette est passée de 121 à 361 nœuds.
3. **Identifiants à sélectionner** (référencés par nom, à choisir à la main) :
   `Supabase account` (`C90K7jXD8RR1HJKP`), `SMTP Brevo — envois métier`
   (`6opiCKNWBLDnvYKJ`), `Header Auth account` (`vqps9Wb05BI7Z6BO`, Anthropic).
   Vérifier que `Supabase account` vise bien la Production.
4. **Anciens déclencheurs à suspendre — d'abord.** Suspendre
   `1 - Assistant Garage Avancé` (`rw69Oin74O5UwQlc`) et attendre 5 min. Les
   chemins `demande-site` et `demande-whatsapp` ne peuvent être actifs que sur
   **un seul** workflow : sans cela l'activation de la v2 échoue, ou pire, les
   deux se marchent dessus. Suspendre l'ancien **coupe aussi le relevé IMAP**
   qui tourne aujourd'hui — c'est voulu, et c'est le seul comportement qui
   s'arrête.
5. **Branches qui resteront désactivées** dans la v2 : `Tous les jours à 9h`
   (relance), `Email Trigger (IMAP)`, `Polling Gmail OAuth (2 min)`. Aucune ne
   doit être allumée en même temps que le reste.
6. **Files et messages qui deviendraient éligibles.** L'Assistant n'a pas de
   file propre : il ne dépile rien à l'activation. Deux tournées à surveiller,
   à contrôler **avant** d'activer :
   - `rendez_vous` avec `statut='termine'`, `avis_demande=false`, dont le
     garage a un `lien_avis_google` **et** le client un e-mail → partiraient le
     soir même à 18 h 30. Compter la ligne avant d'activer ;
   - `rendez_vous` terminés depuis ≥ 12 mois avec `relance_envoyee=false` :
     sans objet, le cron 9 h est éteint.
   Les six anciennes notifications restent bloquées : ce lot n'y touche pas.
7. **Activer** la v2. Contrôles après activation :
   - immédiatement : aucune exécution en erreur, webhooks `demande-site` /
     `demande-whatsapp` bien enregistrés sur la v2 et sur elle seule ;
   - à 18 h 30 : exécution avis `success`, nombre d'envois **égal** au compte
     fait à l'étape 6, journal `actions_ia` cohérent, zéro destinataire
     inattendu ;
   - à 24 h : aucune ligne `entree_sans_garage` inexpliquée.
8. **Retour arrière** (30 secondes, sans perte) : suspendre la v2, réactiver
   `1 - Assistant Garage Avancé`. L'ancien n'est ni modifié ni supprimé — c'est
   pour cela que la v2 doit porter un identifiant neuf. Ne supprimer l'ancien
   qu'après plusieurs jours sans incident.
