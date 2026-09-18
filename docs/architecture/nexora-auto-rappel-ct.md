# Nexora Auto — le premier rappel : le contrôle technique, par e-mail

Préparé et éprouvé sur **Test** le 18 septembre 2026. **Rien n'est actif en
Production** : la migration n'y est pas appliquée, aucun workflow n'est
importé dans l'instance n8n vive, et le panneau de rappel n'existe que si
`NEXT_PUBLIC_AUTO_RAPPELS=actif` (absent de Vercel).

## 1. Ce que la personne voit

Sous l'échéance du contrôle technique, dans la fiche de la voiture :

- **pas encore activé** : « Être prévenu par e-mail avant cette échéance. » —
  *Activer le rappel* ;
- **formulaire** : *Rappel par e-mail* · **À** l'adresse du compte (« L'adresse
  de votre compte Nexora ») · **Quand** un des moments encore possibles —
  deux mois, un mois (par défaut) ou deux semaines avant, **9 h, heure de
  Paris** · **D'après** l'origine de la date · « Un e-mail avant chaque
  contrôle technique de cette voiture, rien d'autre. Vous pourrez l'arrêter à
  tout moment. » ;
- **activé** : « Rappel par e-mail le 3 oct. 2026 à 9 h — À … » · *Modifier* ·
  *Arrêter le rappel* ;
- **après l'envoi** : « Rappel envoyé le … » ; **adresse du compte changée** :
  « Confirmez pour l'envoyer à … » ; **refusé par le fournisseur** : « Le rappel
  n'a pas pu partir… » · *Réessayer* ; **plus rien à rappeler** (contrôle
  dépassé, contre-visite) : « Rappel actif, aucun e-mail prévu » et la raison.

Un moment qui tomberait aujourd'hui ou avant n'est jamais proposé ; si
l'échéance est à moins de quinze jours : « L'échéance est trop proche pour un
rappel par e-mail : elle reste en tête de « Aujourd'hui ». »

## 2. Le message exact

Produit par `composerRappel()` (`lib/auto/rappels.js`), texte brut, **aucune
pièce jointe**, aucun montant ni document du dossier.

```
De       : Nexora Auto <nexorasolutions.france@gmail.com>
           (Brevo réécrit le domaine d'enveloppe en @11919348.brevosend.com)
Répondre : nexorasolutions.france@gmail.com
Objet    : Contrôle technique de votre Peugeot 208 : avant le 28 oct. 2026

Bonjour,

Le contrôle technique de votre Peugeot 208 (GH-456-JK) est à faire avant le 28 oct. 2026.

D'où vient cette date : date du procès-verbal, renseignée par vous.

Voir l'échéance dans Nexora Auto :
https://nexora-garage.vercel.app/auto/vehicules/<id-de-la-voiture>?action=echeance_ct

Une fois le contrôle fait, enregistrez-le au même endroit : Nexora calculera le suivant.

Vous recevez ce message parce que vous avez demandé ce rappel pour cette voiture. Pour le modifier ou l'arrêter : même lien, rubrique « Rappel par e-mail ».

Nexora Auto
```

La ligne « D'où vient cette date » garde la distinction demandée :

| Date | Ligne du message |
| --- | --- |
| déclarée (procès-verbal saisi) | date du procès-verbal, renseignée par vous. |
| extraite (lue sur un document déposé) | date du procès-verbal, lue sur votre document. |
| calculée (règle) | calcul selon la règle. Validité de 2 ans du contrôle du 29 oct. 2024, règle d'une voiture particulière. La date du procès-verbal fait foi. |

Le lien ramène à l'échéance **après connexion** : sans session, la connexion
garde la destination (`?suite=/auto/vehicules/<id>?action=echeance_ct`), puis
la fiche s'ouvre défilée jusqu'au contrôle technique.

## 3. Comment c'est construit — ce qui est réutilisé

| Brique | Réutilisé tel quel | Ajouté |
| --- | --- | --- |
| Fournisseur | Brevo, identifiant n8n « SMTP Brevo — envois métier » | — |
| File | forme du socle : réservation `SKIP LOCKED`, clôture, issue incertaine jamais reprise, 3 tentatives | `auto_rappels_envois` (créée vide par 20260922000500) devient la file |
| Débit | `prendre_jeton_envoi`, **commun** aux files du compte garage (40/h, 120/j) | une cinquième file, `auto_rappels` |
| Classement des échecs | `classerEchec.js` (relances), embarqué dans le workflow | — |
| Journal | `journaliser_incident` (inchangé), journaliseur d'erreurs du socle | — |
| Racine des liens | `parametres_envois` | clé `auto_url_publique` (Test : `http://localhost:3114`) |
| Consentement | — (rien du compte garage) | `auto_rappels_abonnements` + journal `auto_rappels_decisions` |
| Échéance | `elementControle()` de l'écran, **embarqué à l'identique** dans n8n | `lib/auto/rappels.js`, `n8n/rappels-auto/embarquer.mjs` |

Migration : `supabase/migrations/20260922001200_auto_rappel_controle_technique.sql`
(Test seulement). Workflow : `n8n/rappels-auto/construire.mjs` →
`production.json` (**inactif**) ; variantes de recette et d'essai écrites hors
du dépôt.

À chaque passage (tous les quarts d'heure) : lire les dossiers abonnés →
décider avec les règles de l'écran → programmer → réserver **un** rappel dû →
Brevo → classer → clore → journaliser ce qui n'est pas « envoyé ». Trois
rappels au plus par passage ; un refus temporaire arrête le passage.

Garde au moment de partir (`auto_reserver_rappel`), même si le programmateur
n'est pas repassé : abonnement arrêté, voiture archivée, **dossier modifié
depuis la programmation** (empreinte), échéance atteinte, accès retiré →
annulé ; adresse du compte différente de l'adresse consentie → bloqué jusqu'à
confirmation.

## 4. Recette sur Test — ce qui a été exécuté

Aucun message n'a pu atteindre une vraie personne : les comptes fictifs sont
en `@nexora-recette.invalid`, et le serveur SMTP de recette
(`scripts/recette/smtp-controle.mjs`) refuse tout autre domaine et ne relaie
rien. Instance n8n **neuve et isolée** (`nexora-n8n-rappels`, 127.0.0.1:5681,
fuseau de la machine UTC), vrai nœud d'envoi SMTP, vraie base Test.

| Exigence | Comment | Résultat |
| --- | --- | --- |
| Absence de consentement → aucun envoi | voiture sans rappel ; banc SQL §1 | aucune ligne, aucun message |
| Date corrigée → programmation recalculée | procès-verbal corrigé après programmation | ancien rappel annulé, nouveau au bon moment ; banc §5 : annulé au départ même sans repassage |
| Nouveau contrôle → ancien rappel annulé | contrôle enregistré | ancien annulé, rappel sur 2028 |
| Voiture archivée / supprimée | archivage, suppression | annulé ; plus aucune ligne |
| Double exécution → aucun doublon | deux exécutions n8n simultanées ; 8 réservations simultanées en base | **1** message ; **1** ligne réservée sur 8 |
| Échec temporaire → reprise bornée, tracée | 451 au RCPT | reprise à 30 min puis 2 h, bloqué à la 3e ; 3 × 451 au serveur, incidents `refus_temporaire` puis `refus_temporaire_repete` |
| Refus définitif | 550 | bloqué, incident à vérifier |
| Issue incertaine | coupure après le message | rien de clos, jamais rejoué, incident `envoi_incertain` |
| Désactivation → aucun nouvel envoi | depuis l'écran et par la fonction | rappel programmé annulé, journal « active → desactive » |
| Europe/Paris | programmateur dans un conteneur **UTC** | 9 h à Paris : 07:00 UTC l'été, 08:00 UTC l'hiver, jours de changement d'heure compris |
| Lien après connexion | `scripts/recette/lien-rappel.mjs` (Chrome sans interface) | 3/3 : sans session, après connexion, session ouverte |
| Aucune promesse en Production | compilation de production **sans** drapeau, `next start` | aucun panneau, aucun mot « Rappel », même avec un rappel en base |

Bancs : `supabase/tests/auto_rappels_v1.sql` (13 groupes de contrôles, sur la
base jetable puis Test, témoin d'échec vérifié) ; 9 bancs Auto à 0 sur Test ;
751 tests JS ; `lint:auto` sans avertissement ; audits d'écrans 320/375/390 px
et texte agrandi 150 %/200 % sans défaut, formulaire ouvert compris.

## 5. Premier essai réel — à autoriser

Ce qui n'est **pas** prouvé : la remise par Brevo dans une vraie boîte, son
classement (réception ou indésirables), le rendu dans un vrai client de
messagerie. Proposition, sans toucher ni à la Production ni à votre Corsa :

1. **Sur Test** : créer un compte à votre adresse (aucun e-mail n'est envoyé
   par cette création), l'inviter dans la bêta de Test, y ajouter une voiture
   fictive « Peugeot 208 — essai » dont le contrôle technique tombe dans
   40 jours.
2. **Vous** activez le rappel vous-même, depuis la fiche (application de Test
   sur ce Mac, `http://localhost:3114`, lien de session d'une heure que je vous
   donne) : vous verrez votre adresse et le moment avant de valider.
3. Je rends ce rappel dû (seule écriture technique, sur Test).
4. Dans l'instance n8n **vive** : importer `essai-reel.json` — **inactif**,
   déclenchement manuel seulement, borné à ce seul compte de Test, identifiant
   Brevo existant (1 e-mail sur 300 par jour, aucun coût). D'abord un passage
   « à blanc » (rien de dû) pour vérifier l'accès à Test ; puis un passage réel.
5. Vous vérifiez : dossier de réception, expéditeur affiché, objet, texte,
   lien. **Limite de cet essai** : le lien ouvre l'application de Test sur ce
   Mac seulement (Test n'a pas d'adresse publique ; les prévisualisations
   Vercel pointent vers la Production).
6. Nettoyage : workflow d'essai supprimé de l'instance vive, compte de Test
   supprimé.

Construction du workflow d'essai, une fois l'identifiant du compte connu :

```bash
ESSAI_PROPRIETAIRE=<uuid du compte Test> RECETTE_SORTIE=<dossier hors dépôt> node n8n/rappels-auto/construire.mjs
```

Relevé du 18 sept. 2026 (noms et types seulement) : dans l'instance vive,
l'identifiant « RPC Supabase RECETTE (Test) » est de type **Header Auth** ; la
variante d'essai le cite sous ce type.

## 6. Activation réelle en Production — conditions restantes

1. L'essai réel du §5 est concluant (reçu, bien classé, lien correct).
2. **Hébergement de n8n** : l'instance vive tourne sur ce Mac. Un rappel ne
   part que si le Mac est allumé et Docker lancé ; au retour, les rappels en
   retard partent encore s'ils sont utiles (avant le jour de l'échéance),
   sinon ils sont annulés avec leur motif. L'hébergement sur le VPS OVH (déjà
   étudié) supprime cette dépendance.
3. **Expéditeur** : adresse Gmail vérifiée chez Brevo, réécrite en
   `@11919348.brevosend.com`, DMARC signalé non conforme sur un domaine
   Freemail. Acceptable pour un essai ; un vrai domaine Nexora est nécessaire
   avant un volume réel.
4. **Quota Brevo Free** : 300 e-mails par jour, partagés avec les e-mails de
   connexion et les envois du compte garage. Le débit commun borne Nexora à
   120 par jour.
5. Gestes, dans l'ordre, avec votre feu vert : appliquer
   `20260922001200` en Production (vérifié : la file y est vide, la migration
   refuse sinon) ; importer `n8n/rappels-auto/production.json` dans
   l'instance vive (inactif), le publier ; fusionner la PR ; ajouter
   `NEXT_PUBLIC_AUTO_RAPPELS=actif` dans Vercel (Production seulement) et
   redéployer. En bêta, seules les adresses invitées voient le panneau.
6. Politique de confidentialité de Nexora Auto : y ajouter le rappel par
   e-mail (finalité, base : consentement, arrêt à tout moment, Brevo comme
   sous-traitant d'envoi).

Retour arrière : retirer le drapeau Vercel (le panneau disparaît) ; dépublier
le workflow (plus rien ne part) ; la base peut rester (voir l'en-tête de la
migration pour la suppression complète).

## 7. Factures réelles — prêtes, en attente de vos fichiers

Deux façons de les évaluer ; dans les deux, **aucun service de lecture
extérieur** n'est appelé : la lecture payante (Anthropic) n'a pas de clé dans
l'environnement local et exige de toute façon quatre conditions dont un
réglage explicite. La lecture est celle, gratuite, du texte contenu dans le
PDF (`unpdf`, logiciel libre, exécuté localement).

| | Lecture locale (`lecture-locale.mjs`) | Parcours réel sur Test (`lecture-essai.mjs`) |
| --- | --- | --- |
| Où le PDF est lu | ce Mac | ce Mac (serveur local de l'application) |
| Où le PDF est stocké | nulle part ailleurs que votre dossier | **notre hébergement** : stockage privé Supabase du projet Test (AWS, Irlande, eu-west-1), le temps de l'essai |
| Ce qui est éprouvé | l'extraction, champ par champ | le dépôt, les vérifications du serveur, la lecture, la proposition |
| Après l'essai | rien à supprimer | compte fictif, fichiers et données supprimés ; restent des lignes de journal **sans contenu ni lien vers une personne** (`auto_lectures`, statut et durée) |
| Rapport | `rapport-lecture-locale.json` dans votre dossier, valeurs comprises | `rapport-lecture.json` dans votre dossier, valeurs comprises |

« Sans service extérieur » veut donc dire : **aucun tiers d'extraction**. Dans
le parcours réel, le fichier transite bien par notre infrastructure hébergée
(Supabase), comme il le ferait en Production (où la lecture s'exécute sur
Vercel, région Dublin).

Ce qu'il me faut : 3 à 5 factures de garage en PDF, dans un dossier que vous
m'indiquez. Je relève moi-même, sur chaque facture, les valeurs justes
(`attendus.json`) — je lirai donc vos factures — puis je mesure ce que Nexora
trouve, manque, se trompe ou invente. Je ne cherche aucun document ailleurs, et
aucune facture fictive ne remplace cette validation.
