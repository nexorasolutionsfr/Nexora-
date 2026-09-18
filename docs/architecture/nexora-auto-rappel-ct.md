# Nexora Auto — le premier rappel : le contrôle technique, par e-mail

Préparé et éprouvé sur **Test** le 18 septembre 2026. **Rien n'est actif en
Production** : les quatre migrations (`20260922001200` à `001500`) n'y sont pas
appliquées, aucun workflow n'est importé dans l'instance n8n vive, et le
panneau de rappel n'existe que si `NEXT_PUBLIC_AUTO_RAPPELS=actif` (absent de
Vercel). L'essai réel attend votre autorisation : §11.

## 1. Ce que la personne voit

Sous l'échéance du contrôle technique, dans la fiche de la voiture :

- **pas encore activé** : « Être prévenu par e-mail avant cette échéance. » —
  *Activer le rappel* ;
- **formulaire** : *Rappel par e-mail* · **À** l'adresse du compte (« L'adresse
  de votre compte Nexora ») · **Quand** un des moments encore possibles —
  « 60 jours avant », « 30 jours avant » (par défaut) ou « 15 jours avant »,
  chacun suivi de sa date exacte, **9 h, heure de Paris** · **D'après** l'origine de la date · « Un e-mail avant chaque
  contrôle technique de cette voiture, rien d'autre. Vous pourrez l'arrêter à
  tout moment. » ;
- **à l'activation** : « Rappel activé : un e-mail le ‹ date › à 9 h,
  15 jours avant l'échéance du ‹ échéance ›. Destinataire : … » — la date
  calculée, le calcul et l'adresse ;
- **activé** : « Rappel par e-mail le ‹ date › à 9 h — À … » · *Modifier* ·
  *Arrêter le rappel* ;
- **après l'envoi** : « Rappel envoyé le … » ; **adresse du compte changée** :
  « Confirmez pour l'envoyer à … » ; **refusé par le fournisseur** : « Le rappel
  n'a pas pu partir… » · *Réessayer* ; **plus rien à rappeler** (contrôle
  dépassé, contre-visite) : « Rappel actif, aucun e-mail prévu » et la raison.

« N jours avant » veut dire exactement : l'échéance moins N jours, à 9 h (un
libellé « deux semaines » promettait 14 jours pour 15 calculés : corrigé le
18 sept.). Un moment qui tomberait aujourd'hui ou avant n'est jamais proposé ;
si l'échéance tombe dans 15 jours ou moins : « L'échéance est trop proche pour
un rappel par e-mail : elle reste en tête de « Aujourd'hui ». »

## 2. Le message exact

Produit par `composerRappel()` (`lib/auto/rappels.js`), texte brut, **aucune
pièce jointe**, aucun montant ni document du dossier.

```
De       : Nexora Auto <nexorasolutions.france@11919348.brevosend.com>
           (demandé : nexorasolutions.france@gmail.com, expéditeur vérifié
           chez Brevo ; Brevo garde le nom et réécrit le domaine d'une
           adresse Gmail, constaté le 12 sept.)
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

Migrations (Test seulement) : `20260922001200_auto_rappel_controle_technique.sql`,
`20260922001300_auto_rappels_arret.sql` (arrêt d'urgence, §9),
`20260922001400_auto_rappels_motif_exact.sql` (un blocage garde son motif),
`20260922001500_auto_rappels_controle_transmission.sql` (dernier contrôle
avant la transmission, §9). Workflow : `n8n/rappels-auto/construire.mjs` →
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

Bancs : `supabase/tests/auto_rappels_v1.sql` (16 groupes de contrôles, arrêt d'urgence, motif exact et contrôle avant transmission compris, sur la
base jetable puis Test, témoin d'échec vérifié) ; 9 bancs Auto à 0 sur Test ;
751 tests JS ; `lint:auto` sans avertissement ; audits d'écrans 320/375/390 px
et texte agrandi 150 %/200 % sans défaut, formulaire ouvert compris.

## 5. Correction d'un compte rendu : la « table accessible sans connexion »

Le compte rendu du 18 septembre disait qu'« une petite table interne était
accessible sans connexion ». C'était inexact, sur trois points :

| | Ce qui est vrai |
| --- | --- |
| Quoi | une **séquence** (le compteur des numéros de ligne du journal des décisions, `auto_rappels_decisions_id_seq`), pas une table de données |
| Données | **aucune** : une séquence ne contient qu'un nombre. La table du journal elle-même n'a jamais été ouverte (lecture réservée à la personne connectée, sur ses seules lignes) |
| Où | **seulement dans la base jetable locale** (Docker sur ce Mac, inaccessible d'Internet), quelques minutes : le banc des droits l'a relevé, la migration a été corrigée **avant** son application sur Test |
| Test | vérifié le 18 sept. : aucun droit pour `anon` ni `authenticated` sur la séquence |
| Production | vérifié en lecture seule le 18 sept. : ni la table ni la séquence n'existent (migration non appliquée) ; aucun objet `auto_*` n'accorde quoi que ce soit à `anon` |

Le mécanisme, lui, est réel et durable : les droits par défaut de Supabase
ouvrent toute nouvelle séquence. Chaque migration qui crée une séquence doit
la refermer, et le banc `auto_droits_v1` le vérifie.

## 6. Test accessible sur téléphone : la Preview de cette branche, reliée à Test

Aujourd'hui, toute prévisualisation lit les variables de la Production.
Correction ciblée : des variables propres à la seule branche `auto/rappel-ct`,
qui priment sur les autres variables Preview pour cette branche seulement.
Aucune variable Production n'est touchée.

**Ce qui coupe les envois et les paiements : le code, pas des valeurs
factices.** Une clé remplacée par `desactive` ne coupe rien : l'appel part
quand même et c'est le fournisseur qui le refuse. `lib/integrations.js` coupe
tout sur un déploiement que Vercel marque « preview » (variable système
`VERCEL_ENV`, lue à l'exécution ; la Production la lit « production »,
vérifié le 18 sept.). Les cinq routes qui peuvent écrire à quelqu'un ou faire
payer — demande de démo (Resend), abonnement et portail (Stripe), connexion
Gmail aller et retour (Google) — et la lecture payante (Anthropic) refusent
avant tout appel, quelles que soient les clés présentes. Un test fait échouer
la recette si un fichier de l'application appelle un service sortant sans
passer par cet interrupteur (témoin vérifié). Éprouvé sur un serveur local qui
se croit prévisualisation, clés factices présentes : demande de démo 503
(« Prévisualisation : demande de démo non transmise »), connexion Google 503,
retour Google renvoyé avant tout échange. En Production : inchangé.

Ce qui reste possible depuis cette prévisualisation, et ce qui le borne :

| Chemin | Ce qui le borne |
| --- | --- |
| E-mails d'authentification (inscription, mot de passe oublié) | envoyés par Supabase Test lui-même, pas par l'application ; service par défaut, qui n'écrit qu'aux membres de l'équipe Supabase, 2 par heure (quota observé sur Test). C'est ce chemin qui enverra la confirmation de votre compte d'essai |
| Automatisations n8n | aucune des 6 automatisations actives de l'instance vive ne lit Test : identifiants de Production seulement (vérifié le 18 sept., versions publiées) |
| Base Test | ni `pg_net`, ni webhook, ni fonction Edge ; une seule tâche planifiée, purement SQL |
| Liens `mailto:`, `tel:`, `sms:`, WhatsApp | ils ouvrent l'application de la personne ; rien ne part sans elle |

**Le contrôle : la page `/environnement`** (absente en Production). Elle
confirme le projet exact des deux côtés, sans afficher aucune clé :

- **navigateur** : l'adresse Supabase du client de l'application, le projet et
  le rôle inscrits dans sa clé publique, la réponse de Test à cette clé ;
- **serveur** : l'adresse du code, celle du client de service, celle des
  variables d'exécution ; le projet et le rôle de chaque clé ; la réponse de
  Test à chacune ; l'identifiant du projet qui a répondu (en-tête
  `sb-project-ref`) ;
- verdict « Projet Test confirmé : slawilafseganlbghgwx, côté navigateur et
  côté serveur » seulement si tout concorde, sinon la liste des écarts ; puis
  l'état de l'interrupteur des intégrations sortantes.

Éprouvé en local : tout concorde → confirmé ; clé publique d'un autre projet →
« Pas confirmé », les deux côtés le disent (clé refusée, 401) ; en mode
Production → page absente (404). Sur la vraie Preview, encore reliée à la
Production (18 sept., soir) : tout vise `omphppsmhmyllapdqevn`, intégrations
coupées — l'interrupteur agit donc bien sur Vercel. Lire un « 403 » sur la clé
de service sans l'extrapoler : clé reconnue, mais la table sondée n'est pas
lisible par ce rôle (en Production, le rôle de service n'a pas le droit de
lire `parametres_envois` ; sur Test, si). Ce n'est pas un état de toute la base.

**État réel relevé le 18 sept.** (API du tableau de bord Vercel, métadonnées
seulement) : 30 variables ; pour Preview, 9 variables générales aux valeurs de
Production et une seule exception de branche
(`NEXT_PUBLIC_COCKPIT_OPPORTUNITES_ACTIF`, `feature/cockpit-opportunites-v1`) ;
**aucune** pour `auto/rappel-ct`, aucune `NEXT_PUBLIC_AUTO_RAPPELS`. Supabase
Test : URL du site `http://localhost:3000`, **aucune** URL de retour autorisée
— l'adresse de la Preview y a été ajoutée le 18 sept. (étape 4 faite, vérifiée :
retour accepté vers la Preview, adresse non autorisée → URL du site).

**Fait le 18 sept. 2026, soir** (CLI Vercel 59.23.2, connecté par Baptiste,
compte `nexorasolutionsfr`, équipe `nexorasolutionsfr-4999s-projects`, projet
`nexora-dashboard` `prj_kboLUFbmih8il6LBpcayjFl92pmD`) : les quatre variables
posées pour **Preview / `auto/rappel-ct` seulement** — adresse et clé publique
de Test en *Config* (Vercel refuse le type *Secret* pour un nom
`NEXT_PUBLIC_…`, exposé au navigateur par nature), clé de service de Test en
*Secret*, `NEXT_PUBLIC_AUTO_RAPPELS=actif` en *Config* ; valeurs passées par
l'entrée standard, jamais affichées. Relu après coup : 34 variables = 30
inchangées (Production 11, Preview générales 9) + 4. Redéploiement
`dpl_3Ljq2TokU2E5bwkhyuWk5oW9No6z`, servi par l'adresse de la branche ;
Production inchangée (`dpl_3VFvMes8…`, 16 h). `/environnement` sur ce
déploiement : **Projet Test confirmé : slawilafseganlbghgwx, côté navigateur et
côté serveur**, intégrations sortantes coupées, accès Nexora Auto « bêta » ; le
navigateur n'a contacté que la Preview et Supabase Test. Pages de connexion et
d'inscription : affichées en mode bêta, tous les liens sur la Preview ; aucune
inscription, aucun e-mail.

**Manipulation exacte** (historique : faite ci-dessus par le CLI) :

1. Supabase → projet **Test** (`slawilafseganlbghgwx`) → *Project Settings* →
   *API Keys* : la clé **anon** et la clé **service_role**.
2. Vercel → projet `nexora-dashboard` → *Settings* → *Environment Variables* →
   *Add*. Pour chacune des quatre lignes : environnement **Preview**
   seulement, puis **la branche `auto/rappel-ct`** (pas « All Preview
   Branches ») :

   | Nom | Valeur |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://slawilafseganlbghgwx.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la clé **anon** de Test |
   | `SUPABASE_SERVICE_ROLE_KEY` | la clé **service_role** de Test |
   | `NEXT_PUBLIC_AUTO_RAPPELS` | `actif` |

3. *Deployments* → le dernier déploiement de `auto/rappel-ct` → *Redeploy*
   (une variable ne vaut que pour les déploiements suivants).
4. Supabase → projet **Test** → *Authentication* → *URL Configuration* →
   *Redirect URLs* → ajouter
   `https://nexora-dashboard-git-au-fcb83e-nexorasolutionsfr-4999s-projects.vercel.app/**`.
5. Ouvrir
   `https://nexora-dashboard-git-au-fcb83e-nexorasolutionsfr-4999s-projects.vercel.app/environnement` :
   les deux bandeaux doivent être verts. Sinon, ne rien créer et m'envoyer
   la page.

**Sur le téléphone** : Vercel demande une fois votre connexion. Laissez cette
protection active : les autres prévisualisations lisent encore la Production.

## 7. L'essai d'envoi isolé — comment, et ce qui le borne

**Réponse : oui.** L'instance n8n de **recette** peut utiliser le transport
existant sans qu'aucun workflow soit importé dans l'instance qui sert Nexora
Pro :

1. l'instance de recette démarre en lisant **le fichier de clé de
   chiffrement** de l'instance vive (`/Users/Baptiste/Nexora/secrets/encryption_key`),
   monté en lecture seule — la clé n'est ni lue ni affichée ;
2. l'identifiant « SMTP Brevo — envois métier » est **exporté chiffré** de
   l'instance vive (une lecture : aucun changement, aucun import là-bas) ;
3. il est importé dans l'instance de recette, qui sait le déchiffrer grâce à
   la même clé. Aucun mot de passe n'apparaît en clair à aucune étape.

**Répétition du 18 septembre, sans aucun message réel** : deux instances
jetables partageant un fichier de clé jetable ; un identifiant de même nom et
de même numéro, pointé vers le serveur SMTP contrôlé, exporté chiffré (ni
l'hôte ni le mot de passe lisibles dans l'export), importé dans la seconde,
qui l'a utilisé pour envoyer. Résultats :

| Contrôle | Résultat |
| --- | --- |
| Passage à blanc, le jour de l'activation | 1 dossier lu (le seul autorisé), rappel programmé pour **le lendemain 9 h**, 0 message |
| Exécution une fois dû | **1** message, conforme au §2, clos « envoyé » |
| Deuxième exécution | rien à réserver, 0 message |
| Destinataire différent de l'adresse autorisée | bloqué **avant** l'envoi, 0 message, motif exact |
| Panne dans le workflow après la réservation (défaut trouvé et corrigé) | 0 message, ligne restée « en cours d'envoi », **jamais renvoyée** |
| Arrêt d'urgence posé **après** la réservation (répétition du 18 sept., soir) | contrôle avant transmission refusé, **0** message, rappel remis « programmé », tentative 0 |
| Arrêt toujours posé, puis levé | rien de réservé ; après la levée, le même rappel part, **1** message |

**Six bornes, dont aucune ne dépend des autres** : déclenchement **manuel**
seulement (aucune planification, workflow jamais publié) ; **un** compte
(`p_proprietaires`) ; **un** rappel dû possible (une voiture, une échéance, un
seul rappel par échéance en base) ; **une** réservation par exécution (aucune
boucle) ; **une** adresse autorisée, comparée au destinataire réservé ;
**première tentative** seulement. Après l'essai, l'instance de recette et ses
données — identifiant Brevo compris — sont supprimées.

**Comment le rappel devient dû, sans toucher à aucune horloge ni à aucune
file de Production** : tout se passe sur **Test**. La voiture fictive a son
contrôle dans 16 jours ; le seul moment proposé est « 15 jours avant » —
l'échéance moins 15 jours, donc **le lendemain à 9 h**. La date exacte
s'affiche dans le formulaire et à l'activation. Le jour de l'activation, un passage à
blanc programme le rappel (aucun envoi possible : rien n'est dû) ; le
lendemain après 9 h, **une** exécution manuelle l'envoie. Aucune ligne n'est
modifiée à la main. (Si vous préférez le jour même : avancer l'heure prévue
de cette seule ligne, sur Test — c'est ce que la répétition a fait.)

**À savoir** : n8n ne lance pas le journaliseur d'erreurs pour une exécution
manuelle. Pendant l'essai, je lis donc moi-même le résultat de chaque
exécution ; une panne laisse la ligne « en cours d'envoi » sans renvoi.

## 8. Exploitation permanente

**Ce qui existe réellement côté OVH : aucun serveur trouvé.** Aucune machine
connue de ce Mac (configuration SSH, hôtes connus), aucune session OVH ouverte
dans Chrome. Le projet ne garde qu'une **offre étudiée** — VPS-1, 4,57 € TTC
par mois, prix d'un engagement de 12 mois — et une pile d'hébergement préparée
(`infra/n8n-heberge/`), répétée en local le 10 septembre. La vérification
définitive demande votre connexion à l'espace client OVH (*Bare Metal Cloud* →
*VPS*). Un VPS serait une **nouvelle dépense**.

**Ce qui pourrait héberger le programmateur sans nouvelle dépense** (rien
n'est déployé) :

| Option | Coût | Ce que ça demande | Limite |
| --- | --- | --- | --- |
| Ce Mac, tel quel | 0 | empêcher la mise en veille sur secteur, Docker au démarrage | Mac éteint ou en voyage : rien ne part |
| Vercel Cron (offre Hobby) | inclus | une route de l'application qui programme et envoie ; l'accès Brevo placé dans Vercel | **une** exécution par jour, à ±59 min ; reprises le lendemain |
| Supabase Cron + Edge Function | 500 000 appels/mois inclus | la même logique en fonction Deno ; l'accès Brevo placé dans Supabase | disponibilité de Cron sur l'offre gratuite à confirmer |
| GitHub Actions planifié | 2 000 min/mois incluses | un script Node ; l'accès Brevo dans les secrets GitHub | à l'heure : ≈ 720 min/mois |

Toutes les options sans dépense quittent n8n et demandent de placer l'accès
Brevo ailleurs : c'est un chantier à décider, pas une bascule. La seule façon
de garder le mécanisme actuel tel quel, en continu, est un hébergement
permanent de n8n (OVH : payant).

**Après une interruption** (programmateur arrêté, Mac en veille) :

- rien n'est perdu : les rappels restent programmés en base ;
- au redémarrage, le premier passage (sous 15 min) envoie les rappels dus, les
  plus anciens d'abord, 3 par passage au plus (12 par heure), dans le débit
  commun (40 par heure, 120 par jour) ;
- un rappel en retard part **tant que l'échéance n'est pas atteinte** (date de
  Paris antérieure au jour de l'échéance). Le message donne une date absolue
  (« avant le 4 oct. »), jamais « dans N jours » : il reste exact en retard ;
- **trop ancien** : le jour de l'échéance ou après, le rappel est **annulé** au
  moment de partir, avec le motif « échéance atteinte avant l'envoi : trop tard
  pour être utile ». Le panneau dit alors « aucun e-mail prévu » (corrigé le
  18 sept. : la veille après 9 h, il promettait encore « le prochain matin ») ;
- un rappel réservé dont l'issue est inconnue (arrêt brutal pendant l'envoi)
  reste « en cours d'envoi », **n'est jamais renvoyé**, et se repère par la
  requête de contrôle du §9. Seul un humain conclut, d'après le journal Brevo.

Le seuil « jusqu'à la veille » se règle en un seul endroit
(`auto_reserver_rappel`) si vous préférez couper plus tôt.

## 9. Activation en Production — procédure complète

À n'engager qu'après un essai réel concluant et votre feu vert.

**Ordre** (chaque étape se vérifie avant la suivante) :

1. Sauvegarde de la Production (`scripts/sauvegarde/sauvegarder.sh`).
2. **Poser l'arrêt d'urgence d'abord** (voir plus bas) : tout ce qui suit se
   fait sans qu'aucun rappel puisse partir.
3. Appliquer `20260922001200`, `20260922001300`, `20260922001400`,
   `20260922001500` (`db push --dry-run`, puis `db push`). La première refuse de s'appliquer si
   la file n'est pas vide (vérifié vide le 18 sept.).
4. **Activer le programmateur** dans l'instance vive. Sur ce Mac, la
   commande `docker` du chemin par défaut est un lien cassé (Docker Desktop
   est rangé dans `/Applications/AUTOMATISATION/`) : on nomme le vrai binaire.
   ```bash
   DOCKER=/Applications/AUTOMATISATION/Docker.app/Contents/Resources/bin/docker
   $DOCKER cp n8n/rappels-auto/production.json nexora-n8n:/tmp/rappels.json
   $DOCKER exec nexora-n8n n8n import:workflow --input=/tmp/rappels.json
   $DOCKER exec nexora-n8n n8n publish:workflow --id=rappelsautoprod00001
   $DOCKER restart nexora-n8n
   $DOCKER exec nexora-n8n n8n list:workflow --active=true
   ```
   Le redémarrage suspend une vingtaine de secondes les workflows du compte
   garage ; ils sont faits pour reprendre. La dernière commande doit lister
   `rappelsautoprod00001`.
5. **Vérifier son exécution** (lecture seule) — sous 15 minutes :
   ```bash
   sqlite3 "file:/Users/Baptiste/Nexora/n8n_data/database.sqlite?mode=ro" \
     "select id, mode, status, startedAt from execution_entity where workflowId = 'rappelsautoprod00001' order by id desc limit 5;"
   ```
   attendu : une exécution `trigger` / `success` par quart d'heure (heures en
   UTC ; lecture seule, éprouvée sur la base vive le 18 sept.). Puis, en SQL :
   ```sql
   -- état de la file
   select statut, count(*), min(prevu_le) filter (where statut = 'prevu') as prochain
     from public.auto_rappels_envois group by statut;
   -- rien de bloqué « en cours d'envoi » depuis plus de 30 minutes
   select ref, reserve_le from public.auto_rappels_envois
    where statut = 'envoi_en_cours' and reserve_le < now() - interval '30 minutes';
   -- incidents non résolus du programmateur
   select categorie, occurrences, intervention_requise, derniere_le, left(message, 120)
     from public.erreurs_automatisation
    where workflow_id = 'rappelsautoprod00001' and resolu is not true order by derniere_le desc;
   -- débit pris par les rappels sur 24 h, et arrêt d'urgence
   select count(*) from public.envois_debit where file = 'auto_rappels' and pris_le > now() - interval '24 hours';
   select valeur from public.parametres_envois where cle = 'auto_rappels_arret';
   ```
6. Fusionner la PR ; ajouter `NEXT_PUBLIC_AUTO_RAPPELS=actif` dans Vercel pour
   **Production seulement**, redéployer. En bêta, seules les adresses invitées
   voient le panneau.
7. Vous activez votre rappel ; sous 15 min, une ligne `prevu` apparaît à la
   date affichée à l'activation (requête ci-dessus).
8. **Lever l'arrêt d'urgence.**

**Arrêt d'urgence — ce qu'il garantit, et sa limite** (migrations
`20260922001300` et `20260922001500`) :

```sql
-- arrêter
insert into public.parametres_envois (cle, valeur) values ('auto_rappels_arret', 'oui')
on conflict (cle) do update set valeur = 'oui', maj_le = now();
-- reprendre
update public.parametres_envois set valeur = 'non', maj_le = now() where cle = 'auto_rappels_arret';
```

Effet immédiat, que n8n tourne ou non, quel que soit l'affichage :

| Où en est le rappel quand l'arrêt tombe | Effet |
| --- | --- |
| Il attend son heure, ou il est dû mais pas encore réservé | rien n'est réservé, rien ne part ; rien n'est annulé |
| Réservé, pas encore transmis | le dernier contrôle, juste avant le nœud d'envoi, refuse : le rappel redevient « programmé », tentative et jeton de débit rendus ; rien ne part |
| Transmission commencée (échange SMTP en cours) ou message accepté par Brevo | **rien ne peut le retenir** : le message part |

**La limite, sans l'arrondir** : la fenêtre non couverte va du dernier contrôle
à l'acceptation par Brevo — la durée d'un échange SMTP, de l'ordre de la
seconde —, pour au plus un message par exécution en cours (le workflow traite
les rappels un par un). Une fois le message accepté par Brevo, Nexora n'a plus
aucun moyen de le retenir. Si la base ne répond pas au dernier contrôle, rien
n'est transmis : l'exécution s'arrête, la ligne reste « en cours d'envoi » et
l'incident nomme le nœud « Confirmer la transmission » — dans ce cas précis,
rien n'est parti ; la ligne peut être remise « programmée » à la main.

Éprouvé : banc SQL (groupes 14 et 16, témoin d'échec vérifié) ; répétition n8n
(instance jetable, serveur SMTP contrôlé, §7) : arrêt posé après la
réservation → 0 message ; arrêt toujours posé → rien de réservé ; levée → le
même rappel part, une fois.

Deux autres niveaux : dépublier le workflow
(`$DOCKER exec nexora-n8n n8n unpublish:workflow --id=rappelsautoprod00001`,
puis `$DOCKER restart nexora-n8n`) ; fermer Nexora Auto
(`auto_acces_parametres.mode = 'ferme'`), qui annule chaque rappel au moment
où il devient dû. Retirer la variable Vercel **ne fait que masquer le
panneau** : elle n'arrête aucun envoi.

## 10. Factures réelles — prêtes, en attente de vos fichiers

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

## 11. L'essai réel — scénario retenu, exécution non autorisée

Scénario retenu le 18 sept. : **option A**. L'exécution reste à autoriser,
séparément, **après** la vérification de la Preview (§6, étape 5). Rien n'est
engagé : aucun compte à votre adresse, aucune voiture, aucune copie de l'accès
Brevo, aucun message.

**Pourquoi A.** Le projet Test envoie ses e-mails d'inscription par le service
par défaut de Supabase, qui n'écrit qu'aux membres de l'équipe Supabase (pour
toute autre adresse : *Email address not authorized*, documentation Supabase).
`nexorasolutions.france@gmail.com` en est membre : aucun réglage à changer.
Ni cette adresse ni `baptiste.papoul52@gmail.com` n'ont de compte sur Test
(vérifié le 18 sept.).

| | A (retenue) — `nexorasolutions.france@gmail.com` |
| --- | --- |
| Messages réels | **2** : la confirmation d'inscription (Supabase Test), puis **le rappel** |
| Réglage à changer | aucun |

**Les dates** : aucune n'est fixée d'avance. Le jour où la voiture fictive est
créée (jour J, heure de Paris) : contrôle réalisé à J − 714, valable jusqu'à
J + 16 ; le seul moment proposé est « 15 jours avant », soit J + 1 à 9 h. La
date exacte s'affiche dans le formulaire et à l'activation (« Rappel activé :
un e-mail le …, 15 jours avant l'échéance du … »), et le script de préparation
l'écrit au même moment, calculée par le même module.

**Le message exact** (entre chevrons, ce qui dépend du jour J) :

```
De       : Nexora Auto <nexorasolutions.france@11919348.brevosend.com>
Répondre : nexorasolutions.france@gmail.com
À        : nexorasolutions.france@gmail.com, et aucune autre adresse
Objet    : Contrôle technique de votre Peugeot 208 (essai) : avant le <J + 16>

Bonjour,

Le contrôle technique de votre Peugeot 208 (essai) est à faire avant le <J + 16>.

D'où vient cette date : date du procès-verbal, renseignée par vous.

Voir l'échéance dans Nexora Auto :
https://nexora-dashboard-git-au-fcb83e-nexorasolutionsfr-4999s-projects.vercel.app/auto/vehicules/<identifiant de la voiture>?action=echeance_ct

Une fois le contrôle fait, enregistrez-le au même endroit : Nexora calculera le suivant.

Vous recevez ce message parce que vous avez demandé ce rappel pour cette voiture. Pour le modifier ou l'arrêter : même lien, rubrique « Rappel par e-mail ».

Nexora Auto
```

Texte brut, sans pièce jointe, produit par le module réel ; relu tel que reçu
par le serveur SMTP contrôlé lors de la répétition du 18 sept.

**Les données fictives** (Test seulement) : un compte Nexora Auto **créé par
vous** sur la Preview, avec un mot de passe que je ne vois pas ; son
invitation à la bêta de Test ; une voiture « Peugeot 208 (essai) », sans
immatriculation, année 2018, contrôle périodique favorable aux dates
ci-dessus ; le rappel **activé par vous**. Ni votre voiture personnelle, ni
document, ni facture, ni montant.

**L'environnement du lien** : la Preview de la branche `auto/rappel-ct`, reliée
à Test et confirmée par `/environnement`, protégée par Vercel. Pour l'essai,
la racine des liens de Test (`auto_url_publique`) passe de
`http://localhost:3114` à cette adresse ; elle est remise ensuite.

**L'envoi** : l'instance n8n de recette du §7, déclenchement manuel. Jour J :
passage à blanc (programme le rappel, n'envoie rien). J + 1 après 9 h, à votre
signal : **une** exécution → **un** message. Je lis le résultat ; vous ouvrez
l'e-mail sur le téléphone, touchez le lien, vous connectez, et me dites où
vous arrivez. Ensuite : instance de recette et copie de l'accès Brevo
supprimées ; compte d'essai supprimé si vous le souhaitez. Toute anomalie
arrête l'essai, rien n'est rejoué.

**À autoriser, le moment venu** : inviter l'adresse sur Test ; y changer
`auto_url_publique` ; créer la voiture fictive dans votre compte d'essai ;
exporter chiffré l'identifiant Brevo de l'instance vive (une lecture) ;
envoyer **un** rappel à `nexorasolutions.france@gmail.com`.
