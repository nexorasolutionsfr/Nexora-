# Nexora Auto — le premier rappel : le contrôle technique, par e-mail

Préparé et éprouvé sur **Test** le 18 septembre 2026. **Rien n'est actif en
Production** : les trois migrations (`20260922001200` à `001400`) n'y sont pas
appliquées, aucun workflow n'est importé dans l'instance n8n vive, et le
panneau de rappel n'existe que si `NEXT_PUBLIC_AUTO_RAPPELS=actif` (absent de
Vercel). L'essai réel attend votre autorisation : §11.

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
`20260922001400_auto_rappels_motif_exact.sql` (un blocage garde son motif). Workflow : `n8n/rappels-auto/construire.mjs` →
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

Bancs : `supabase/tests/auto_rappels_v1.sql` (15 groupes de contrôles, arrêt d'urgence et motif exact compris, sur la
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

## 6. Test accessible sur téléphone : la correction ciblée des variables Preview

Aujourd'hui, toute prévisualisation Vercel lit les variables **de la
Production** (constat du 17 septembre). Correction **ciblée** : des variables
propres à la seule branche `auto/rappel-ct`. Vercel les fait primer sur les
autres variables Preview, pour cette branche seulement ; les autres
prévisualisations et la Production ne changent pas (documentation Vercel,
« Preview environment variables », relue le 18 sept.).

**Manipulation exacte** (je ne saisis pas de clés à votre place) :

1. Supabase → projet **Test** (`slawilafseganlbghgwx`) → *Project Settings* →
   *API Keys* : gardez sous les yeux la clé **anon** (publique) et la clé
   **service_role** (secrète).
2. Vercel → projet `nexora-dashboard` → *Settings* → *Environment Variables* →
   *Add Environment Variable*. Pour **chacune** des lignes ci-dessous :
   environnement **Preview** seulement, puis choisir **la branche
   `auto/rappel-ct`** (pas « All Preview Branches »), puis *Save*.

   | Nom | Valeur |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://slawilafseganlbghgwx.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la clé **anon** de Test |
   | `SUPABASE_SERVICE_ROLE_KEY` | la clé **service_role** de Test |
   | `NEXT_PUBLIC_AUTO_RAPPELS` | `actif` |
   | `RESEND_API_KEY` | `desactive` |
   | `STRIPE_SECRET_KEY` | `desactive` |
   | `STRIPE_WEBHOOK_SECRET` | `desactive` |

   Les trois dernières neutralisent, sur cette branche seulement, les clés de
   Production héritées : aucune demande de démonstration envoyée, aucun
   paiement possible. **Aucune ligne « Production » n'est touchée.**
3. Vercel → *Deployments* → le dernier déploiement de `auto/rappel-ct` →
   *Redeploy* (une variable ne vaut que pour les déploiements suivants).
4. Supabase → projet **Test** → *Authentication* → *URL Configuration* →
   *Redirect URLs* → ajouter
   `https://nexora-dashboard-git-au-fcb83e-nexorasolutionsfr-4999s-projects.vercel.app/**`
   (l'adresse stable de la branche ; sans elle, un lien de confirmation
   d'e-mail n'y ramènerait pas).
5. Contrôle : ouvrir
   `https://nexora-dashboard-git-au-fcb83e-nexorasolutionsfr-4999s-projects.vercel.app/api/auto/environnement`
   → attendu `"base":"autre"`, `"projetSupabase":"slawilafseganlbghgwx"`.
   `"base":"production"` : ne pas s'en servir, revoir l'étape 2.

**Sur le téléphone** : l'adresse est protégée par l'authentification Vercel
(offre Hobby). Le plus simple : s'y connecter une fois avec votre compte
Vercel, qui a accès au projet ; un cookie est alors posé pour cette adresse.
Alternative : Vercel permet sur Hobby **un seul** lien de partage par compte
(*Share* → *Anyone with the link*), révocable.

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

**Six bornes, dont aucune ne dépend des autres** : déclenchement **manuel**
seulement (aucune planification, workflow jamais publié) ; **un** compte
(`p_proprietaires`) ; **un** rappel dû possible (une voiture, une échéance, un
seul rappel par échéance en base) ; **une** réservation par exécution (aucune
boucle) ; **une** adresse autorisée, comparée au destinataire réservé ;
**première tentative** seulement. Après l'essai, l'instance de recette et ses
données — identifiant Brevo compris — sont supprimées.

**Comment le rappel devient dû, sans toucher à aucune horloge ni à aucune
file de Production** : tout se passe sur **Test**. La voiture fictive a son
contrôle dans 16 jours ; le seul moment proposé est « Deux semaines avant »,
c'est-à-dire **le lendemain à 9 h**. Le jour de l'activation, un passage à
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
3. Appliquer `20260922001200`, `20260922001300`, `20260922001400`
   (`db push --dry-run`, puis `db push`). La première refuse de s'appliquer si
   la file n'est pas vide (vérifié vide le 18 sept.).
4. **Activer le programmateur** dans l'instance vive :
   ```bash
   docker cp n8n/rappels-auto/production.json nexora-n8n:/tmp/rappels.json
   docker exec nexora-n8n n8n import:workflow --input=/tmp/rappels.json
   docker exec nexora-n8n n8n publish:workflow --id=rappelsautoprod00001
   docker restart nexora-n8n
   docker exec nexora-n8n n8n list:workflow --active=true
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
   bonne date (requête ci-dessus).
8. **Lever l'arrêt d'urgence.**

**Arrêt d'urgence — indépendant du panneau** (migration `20260922001300`) :

```sql
-- arrêter : plus rien n'est réservé, donc plus rien ne part
insert into public.parametres_envois (cle, valeur) values ('auto_rappels_arret', 'oui')
on conflict (cle) do update set valeur = 'oui', maj_le = now();
-- reprendre
update public.parametres_envois set valeur = 'non', maj_le = now() where cle = 'auto_rappels_arret';
```

Effet immédiat, que n8n tourne ou non, quel que soit l'affichage : aucune
réservation, aucun jeton pris, aucune tentative consommée, **rien d'annulé** —
à la reprise, les rappels encore utiles partent. Éprouvé en base (banc,
groupe 14). Deux autres niveaux : dépublier le workflow
(`n8n unpublish:workflow --id=rappelsautoprod00001`, puis redémarrer) ;
fermer Nexora Auto (`auto_acces_parametres.mode = 'ferme'`), qui **annule**
les rappels programmés. Retirer la variable Vercel **ne fait que masquer le
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

## 11. Demande d'autorisation de l'essai réel

Rien de ce qui suit n'est engagé : aucun compte à votre adresse, aucun
message. Tout se passe sur **Test** ; rien ne touche la Production.

**Un préalable découvert en préparant cette demande.** Le projet Test envoie
ses e-mails d'inscription par le service par défaut de Supabase (quota de 2
par heure observé sur Test) ; ce service n'écrit **qu'aux membres de l'équipe
Supabase** — pour toute autre adresse : *Email address not authorized*
(documentation Supabase, relue le 18 sept.). L'adresse destinataire décide
donc du chemin :

| | A — `nexorasolutions.france@gmail.com` (recommandé) | B — `baptiste.papoul52@gmail.com` |
| --- | --- | --- |
| Pourquoi | membre de l'équipe Supabase : Test peut lui écrire | adresse personnelle, hors équipe |
| Ce qu'il faut en plus | rien | couper « Confirm email » sur Test le temps de l'inscription (*Authentication* → *Sign In / Providers* → *Email*), puis le remettre |
| Messages réels | **2** : la confirmation d'inscription (Supabase Test), puis **le rappel** | **1** : le rappel |

**Le message exact** (dates d'une activation le samedi 19 septembre ; elles
suivent le jour réel de l'activation, échéance = activation + 16 jours) :

```
De       : Nexora Auto <nexorasolutions.france@11919348.brevosend.com>
Répondre : nexorasolutions.france@gmail.com
À        : l'adresse choisie (A ou B), et aucune autre
Objet    : Contrôle technique de votre Peugeot 208 (essai) : avant le 5 oct. 2026

Bonjour,

Le contrôle technique de votre Peugeot 208 (essai) est à faire avant le 5 oct. 2026.

D'où vient cette date : date du procès-verbal, renseignée par vous.

Voir l'échéance dans Nexora Auto :
https://nexora-dashboard-git-au-fcb83e-nexorasolutionsfr-4999s-projects.vercel.app/auto/vehicules/<identifiant de la voiture>?action=echeance_ct

Une fois le contrôle fait, enregistrez-le au même endroit : Nexora calculera le suivant.

Vous recevez ce message parce que vous avez demandé ce rappel pour cette voiture. Pour le modifier ou l'arrêter : même lien, rubrique « Rappel par e-mail ».

Nexora Auto
```

Texte brut, aucune pièce jointe. Produit par le module réel
(`planifierRappel`) avec les données ci-dessous.

**Les données fictives** (Test seulement) :

- un compte Nexora Auto **créé par vous**, par l'inscription sur l'adresse de
  prévisualisation, avec un mot de passe **que vous choisissez** et que je ne
  vois pas ; son invitation à la bêta de Test, posée par moi ;
- une voiture **« Peugeot 208 (essai) »**, sans immatriculation, année 2018,
  créée par moi dans ce compte le jour de l'activation ; un contrôle
  technique périodique favorable **réalisé le 5 oct. 2024, valable jusqu'au
  5 oct. 2026** (dates d'une activation le 19 sept.). Ni votre voiture
  personnelle, ni document, ni facture, ni montant ;
- le rappel, **activé par vous** dans le panneau de la fiche : un seul moment
  est proposé, « Deux semaines avant — le 20 sept. 2026 à 9 h ».

**L'environnement du lien** : la prévisualisation Vercel de la branche
`auto/rappel-ct` (le code de la PR #139), reliée à **Test** une fois les
variables du §6 posées — le contrôle `/api/auto/environnement` doit dire
`"base":"autre"` **avant** votre inscription, sinon le compte naîtrait en
Production. Elle reste protégée par l'authentification Vercel : sur le
téléphone, Vercel demande une fois votre connexion (ne désactivez pas cette
protection : les autres prévisualisations lisent encore la Production). La
racine des liens de Test (`auto_url_publique`) passe, pour l'essai, de
`http://localhost:3114` à cette adresse.

**L'envoi** : l'instance n8n de recette du §7, sur ce Mac, écoutant
127.0.0.1 seulement ; déclenchement manuel, une exécution. Le 19 : passage à
blanc (programme le rappel, n'envoie rien). Le 20 après 9 h : **une**
exécution → **un** message. Je lis le résultat, puis vous ouvrez l'e-mail sur
le téléphone, touchez le lien, vous connectez, et me dites où vous arrivez.

**Après l'essai** : instance de recette supprimée avec sa copie de
l'identifiant Brevo ; `auto_url_publique` de Test remis à
`http://localhost:3114` ; le compte d'essai et sa voiture supprimés si vous le
souhaitez. Toute anomalie arrête l'essai : rien n'est rejoué, je vous rends
compte.

**Ce qu'il me faut de vous** : (1) la manipulation du §6 ; (2) le choix A ou
B ; (3) le jour de l'activation ; (4) votre accord explicite pour : inviter
l'adresse sur Test, y changer `auto_url_publique`, créer la voiture fictive
dans votre compte d'essai, exporter chiffré l'identifiant Brevo de l'instance
vive (une lecture) et envoyer **un** rappel à l'adresse choisie.
