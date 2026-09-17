# Nexora Auto — données personnelles : descriptif, projets de textes, décisions

État au 17 septembre 2026. **Document de travail à faire valider.** Il décrit ce
que le code fait réellement (branche `auto/beta-privee`), propose des textes et
liste les décisions. Il **n'invente ni durée de conservation ni garantie** :
tout ce qui n'est pas décidé est marqué **[À DÉCIDER]** ; ce qui doit être
vérifié chez un prestataire est marqué **[À VÉRIFIER]**.

## 1. Qui est responsable, et changement de rôle

**Identité du responsable de traitement.** D'après la politique actuelle
(`app/confidentialite/page.tsx`) : **Baptiste Papoul, entrepreneur
individuel**, exerçant sous le nom commercial « Nexora Solutions »,
21 rue de l'École, 52100 Saint-Dizier, SIREN 108 995 788. « Nexora Solutions »
est un nom commercial, pas une personne morale : c'est l'entrepreneur
individuel qui est responsable, et c'est cette identité qui doit figurer dans
les textes. **[À CONFIRMER]** qu'aucune société n'a été créée depuis, et que
l'adresse et le SIREN sont à jour.

## 1 bis. Changement de rôle

Pour Nexora Pro, la politique actuelle (`app/confidentialite/page.tsx`, section 3)
présente Nexora Solutions comme **sous-traitant** des garages.

Pour Nexora Auto, la personne crée elle-même son compte et son dossier :
Nexora Solutions (Baptiste Papoul, entrepreneur individuel) est **responsable
de traitement**. La politique actuelle ne couvre pas ce cas : elle doit
recevoir une section dédiée avant toute ouverture à une personne extérieure.

## 2. Faits techniques vérifiés

| Élément | Constat | Comment |
| --- | --- | --- |
| Base de données (Test et Production) | Supabase, région `eu-west-1` (Irlande) | `supabase projects list`, métadonnées seulement |
| Exécution des routes serveur en Production | Vercel, région **`dub1` (Dublin, Irlande)** depuis le 17 sept. 2026 ; c'était `iad1` (États-Unis) avant | `/api/auto/environnement` et en-tête `x-vercel-id: cdg1::dub1` |
| Lecture automatique des factures | gratuite, **sur le serveur Nexora** (fonction Vercel) : texte du PDF, aucun prestataire d'IA | `lib/auto/lecture/configuration.js`, `texte-pdf.js` |
| Conséquence | une facture PDF lue automatiquement est **traitée en Irlande**, dans la même région que la base | découle de la ligne ci-dessus |
| Correction **appliquée et confirmée** | `vercel.json` fixe la région à `dub1` (Dublin), la même que les bases. Vérifié en Production le 17 sept. 2026 : `/api/auto/environnement` renvoie `"regionFonction":"dub1"` et l'en-tête montre `cdg1::dub1`. Le réglage vaut pour tout le projet, Nexora Pro compris. **La décision D2 est donc réalisée dans l'option (a)** | mesuré en Production |
| Fichiers privés | servis derrière un cache d'une heure (`Cache-Control: public, max-age=3600`) : après un retrait d'accès, la **même session** peut encore recevoir un fichier déjà téléchargé pendant au plus une heure ; un autre compte est refusé, et un fichier jamais téléchargé aussi | mesuré le 17 sept. 2026, `scripts/recette/fermeture-beta.mjs` |
| Prévisualisations Vercel | reliées à la base de **Production** | lu dans le code servi, voir `nexora-auto-suivi.md` |
| E-mails de compte (confirmation, mot de passe) | Supabase Auth, via le SMTP Brevo déjà utilisé | configuration existante (mémoire « envoi des e-mails en Production ») |
| Mesure d'audience | script chargé par la mise en page générale, mais **aucun événement émis depuis `/auto`** : le filtre `beforeSend` n'accepte que `/` | `lib/analytics/filter-analytics-event.ts`, appelé sur quatre adresses |

## 3. Traitements

Pour chaque traitement, la **base légale est une proposition** à valider.

### T1. Compte Nexora Auto
- **Données :** adresse e-mail, mot de passe (haché par Supabase Auth), dates de création, de dernière connexion et de confirmation, marqueur `espace: auto`.
- **Finalité :** permettre à la personne d'accéder à son dossier sur ses appareils.
- **Base légale proposée :** exécution du contrat (conditions d'utilisation à rédiger **[À DÉCIDER]**).
- **Lieu :** Supabase Auth (Irlande). Les e-mails passent par Brevo.
- **Destinataires :** Nexora Solutions ; Supabase et Brevo comme sous-traitants.
- **Conservation :** **[À DÉCIDER]** (durée d'inactivité avant suppression ou relance ; sort à la suppression du compte, voir décision D4).

### T2. Accès à la bêta privée
- **Données :** adresse e-mail invitée, note libre de 200 caractères au plus (qui a invité, pourquoi), date d'ajout (`auto_acces_beta`).
- **Finalité :** limiter l'accès pendant la bêta.
- **Base légale proposée :** intérêt légitime, ou mesure précontractuelle à la demande de la personne invitée.
- **Rédaction de la note :** ne rien y écrire de sensible **[À DÉCIDER]** (consigne de rédaction).
- **Conservation :** **[À DÉCIDER]** (jusqu'à la fin de la bêta, puis suppression de la liste).
- **Particularités :**
  - ajouter une adresse n'envoie aucun message ;
  - le formulaire d'inscription ne révèle pas si une adresse est invitée : réponse identique et délai minimal constant.

### T3. Dossier de la voiture
- **Données :**
  - voiture : marque, modèle, motorisation, année, énergie, immatriculation, date de mise en circulation, intervalle d'entretien, voiture principale, archivage ;
  - kilométrages datés ;
  - interventions : type, date, kilométrage, professionnel, montant, détail, opérations, résultat du contrôle technique, provenance ;
  - tâches et rappels reportés ;
  - préférences : horizon, rappels hors application préparés mais inactifs.
- **Données indirectes :**
  - l'immatriculation, le nom du garage et les montants renseignent sur la personne (lieu de vie, habitudes, dépenses) ;
  - l'historique du contrôle technique peut révéler un défaut du véhicule.
- **Finalité :** tenir le dossier, calculer « À prévoir », les dépenses et l'export.
- **Base légale proposée :** exécution du contrat.
- **Lieu :** Supabase (Irlande).
- **Accès :** la personne seule (règles de la base, vérifiées par `acces-croises.mjs`, 55/55) ; Nexora Solutions par le rôle de service, pour l'exploitation **[À DÉCIDER : règles d'accès administrateur et traçabilité]**.
- **Conservation :** tant que le compte existe **[À DÉCIDER : après suppression du compte, et pour une voiture archivée]**.

### T4. Documents (factures, procès-verbaux, carte grise, assurance…)
- **Données :** le fichier (PDF ou photo) et tout ce qu'il contient : nom, adresse, immatriculation, numéro VIN, montants, coordonnées du garage ; titre, type, date, empreinte SHA-256 du fichier, lien avec une intervention.
- **Données sensibles possibles :** une carte grise ou une attestation d'assurance contient des données d'identité. **[À DÉCIDER]** : faut-il déconseiller à l'écran d'y déposer une pièce d'identité ?
- **Finalité :** conserver les justificatifs et préremplir les interventions.
- **Lieu :** stockage privé Supabase (Irlande), accessible seulement par la personne, par adresse signée de 5 minutes.
- **Conservation :** tant que la personne ne supprime pas le document ou son compte **[À DÉCIDER : après suppression du compte]**.

### T5. Lecture automatique des factures PDF
- **Données :** contenu textuel du PDF, lu le temps de la requête, puis proposition enregistrée avec le document (`auto_documents.lecture`). Journal par tentative (`auto_lectures`) : statut, durée, erreur, champs corrigés, **sans aucune valeur de la facture**.
- **Finalité :** préremplir, la personne confirmant toujours elle-même.
- **Base légale proposée :** exécution du contrat.
- **Lieu du traitement :** fonction Vercel, **aujourd'hui `iad1` (États-Unis)** : voir D2. Aucun prestataire d'IA : la lecture payante est désactivée et impossible en Production sans décision explicite.
- **Conservation :**
  - proposition : avec le document ;
  - journal : `proprietaire_id` passe à « null » à la suppression du compte **[À DÉCIDER : durée du journal]**.
- **Pas de décision automatique** : aucune donnée n'est enregistrée sans confirmation (article 22 du RGPD non concerné, à confirmer).

### T6. Données sur l'appareil
- **Session :** jeton Supabase dans le stockage local du navigateur, strictement nécessaire.
- **Brouillon d'une facture en cours de vérification :** stockage local, 7 jours au plus, effacé à l'enregistrement et à la déconnexion.
- **Préférences d'affichage :** « Pour bien démarrer » masqué dans le stockage local ; **voiture consultée gardée dans le stockage local de l'appareil** (depuis la simplification grand public du 17 sept. : elle survit à la fermeture de l'onglet, et elle est effacée à la déconnexion, avec les brouillons).
- **Export :** préparé dans le navigateur, rien n'est envoyé.
- **Traceurs :** stockage strictement nécessaire au service demandé (exemption de consentement, à confirmer).

### T7. Journaux techniques et mesure d'audience
- **Journaux :** journaux Vercel des routes `/api/auto/*`. Le code n'y écrit ni adresse e-mail ni contenu de facture : seulement l'identifiant d'une tentative et la nature d'une erreur. Journaux Supabase (API, Auth).
- **Durée des journaux :** **[À VÉRIFIER]** selon l'offre de chaque prestataire.
- **Mesure d'audience : AUCUNE sur Nexora Auto.** Vérifié le 17 sept. 2026 en appelant le filtre `lib/analytics/filter-analytics-event.ts` : il est fermé par défaut et ne laisse passer que la seule page d'accueil publique `/`. `/auto`, `/auto/compte`, `/auto/vehicules/<id>` sont **rejetés**. Le script Vercel Analytics est chargé par la mise en page générale, mais aucun événement n'est émis depuis Nexora Auto.

## 4. Sous-traitants

| Prestataire | Rôle pour Nexora Auto | À vérifier avant ouverture |
| --- | --- | --- |
| Supabase | base, authentification, stockage des fichiers (Irlande) | accord de sous-traitance (DPA) accepté, sous-traitants ultérieurs |
| Vercel | hébergement de l'application, exécution des routes (`iad1`) | DPA, encadrement du transfert vers les États-Unis, région des fonctions |
| Brevo | e-mails de compte | DPA, déjà en service pour Nexora Pro |
| Anthropic | **aucun** : lecture payante désactivée | à reprendre seulement si la lecture payante est un jour décidée |

## 5. Sécurité : ce qui est en place

Uniquement ce qui est vérifié :
- données isolées par personne au niveau de la base (politiques RLS) ;
- accès fermé par défaut, bêta sur liste d'adresses confirmées (politiques restrictives) ;
- stockage privé, adresses signées de 5 minutes ;
- contenu des fichiers contrôlé avant dépôt et avant lecture ;
- lecture PDF bornée (5 Mo, 4 pages, 15 s) ;
- journaux sans contenu de facture ;
- recettes : `acces-croises.mjs`, bancs SQL `auto_*_v1.sql`.

**Pas de garantie à écrire au-delà.** En particulier, aucun chiffrement propre
à Nexora n'est ajouté au chiffrement fourni par Supabase.

## 6. Projets de textes (à valider, rien n'est publié)

### 6.0 Ce qui est publié (17 septembre 2026)

Une page dédiée existe : **`/auto/confidentialite`**, liée depuis l'écran
d'inscription, l'accueil public de Nexora Auto et « Compte ». Elle reprend
l'identité du responsable et l'adresse de contact de la politique déjà
publiée, décrit les sept traitements réels, dit où tout est traité (Supabase
Irlande, Vercel Dublin, Brevo), et **n'annonce aucune durée** : elle écrit que
rien n'est supprimé automatiquement aujourd'hui, et que les durées pour les
comptes inactifs ne sont pas arrêtées. Elle conseille de ne pas déposer de
pièce d'identité pendant la bêta (décision D5, option « déconseiller »
appliquée). Le projet de texte ci-dessous reste la référence pour ce qu'il
faudra ajouter quand les décisions D1, D3 et D6 seront prises.

### 6.1 Section à ajouter à la politique de confidentialité

> **Nexora Auto**
>
> Nexora Auto vous permet de tenir le dossier de vos voitures. Pour ce service, Nexora Solutions est responsable du traitement de vos données.
>
> **Données traitées.**
> - Votre adresse e-mail et votre mot de passe.
> - Les informations de vos voitures, kilométrages, interventions, montants, tâches et rappels que vous enregistrez.
> - Les documents que vous déposez (factures, procès-verbaux…) et les informations qu'ils contiennent.
>
> **Finalités.** Vous permettre de retrouver et d'organiser le dossier de vos voitures, de calculer ce qui est à prévoir et, si vous le souhaitez, de préremplir une intervention à partir d'une facture PDF. Aucune information n'est enregistrée sans votre confirmation.
>
> **Base légale.** L'exécution du service que vous avez demandé. [À VALIDER]
>
> **Lecture des factures.** Le texte de vos factures PDF est lu par nos serveurs, sans intervention humaine et sans service d'intelligence artificielle extérieur. [Lieu du traitement : À COMPLÉTER selon la décision D2]
>
> **Destinataires.** Vous seul accédez à votre dossier. Nos prestataires techniques (Supabase, hébergé dans l'Union européenne ; Vercel ; Brevo pour les e-mails de compte) traitent ces données pour notre compte.
>
> **Durées de conservation.** [À DÉCIDER : compte actif, compte inactif, après suppression du compte, journaux]
>
> **Bêta privée.** Pendant la bêta, nous conservons la liste des adresses invitées, uniquement pour ouvrir l'accès. [Durée : À DÉCIDER]
>
> **Vos droits.** Vous pouvez supprimer vos documents, vos interventions et vos voitures depuis l'application, et exporter le dossier d'une voiture. Pour tout autre droit (accès, rectification, effacement du compte, portabilité, opposition), écrivez à [adresse de contact]. [Suppression du compte depuis l'application : À DÉCIDER]

### 6.2 Mentions à l'écran (courtes)

- **Création de compte :** « En créant votre compte, vous acceptez [les conditions d'utilisation]. Vos données sont traitées comme décrit dans [la politique de confidentialité]. »
- **Dépôt d'un document :** « Le fichier reste privé : vous seul pouvez l'ouvrir. » (déjà affiché)
- **Lecture automatique :** « Nexora lit le texte de votre PDF sur ses serveurs pour vous proposer les informations. Vous vérifiez avant d'enregistrer. » **[À COMPLÉTER : lieu, décision D2]**

## 6 bis. Durées de conservation : proposition

**Principe.** Une durée ne vaut que si un mécanisme l'applique. Aujourd'hui,
**aucune suppression automatique n'existe** : toutes les lignes « mécanisme à
créer » sont des engagements à ne pas écrire dans la politique avant d'avoir
le mécanisme. Les durées ci-dessous sont des **propositions**, à valider
(décision D1).

| Donnée | Finalité | Durée proposée | Justification | Déclencheur de suppression | Sauvegardes |
| --- | --- | --- | --- | --- | --- |
| Compte (adresse, mot de passe haché) | accéder à son dossier | tant que le compte sert ; **24 mois sans connexion** → avertissement, puis suppression | un carnet d'entretien se consulte rarement : un an est trop court, dix ans n'a pas de finalité | à créer : relevé des comptes inactifs, e-mail d'avertissement, suppression | disparaît des sauvegardes à leur expiration (voir plus bas) |
| Voitures, kilométrages, interventions, tâches, préférences | tenir le dossier | même durée que le compte | le dossier n'a pas de sens sans le compte | suppression du compte, ou suppression de la voiture par la personne (immédiate, déjà en place) | idem |
| Documents déposés et leurs fichiers | garder ses justificatifs | même durée que le compte | c'est la personne qui décide de garder ou non ses factures ; **ce ne sont pas les factures comptables de Nexora** et la règle des 10 ans ne s'y applique pas | suppression par la personne (immédiate, en place) ou suppression du compte | idem |
| Fichier déposé puis abandonné (import interrompu, jamais confirmé) | reprendre un import | **30 jours**, puis suppression du fichier et de sa fiche si aucune intervention n'y est rattachée | au-delà, il ne sert plus à rien et n'a pas été voulu | à créer : relevé des documents sans intervention et sans ouverture depuis 30 jours | idem |
| Brouillon de vérification (sur l'appareil) | ne rien perdre en quittant l'écran | **7 jours** | déjà en place, dans le navigateur | automatique : à la lecture du brouillon, et à la déconnexion | aucune : rien n'est envoyé au serveur |
| Proposition de lecture (`auto_documents.lecture`) | montrer ce qui a été proposé, et ne pas relire | vie du document | sans elle, une relecture serait nécessaire | suppression du document | avec la base |
| Journal des lectures (`auto_lectures`, sans donnée de facture) | suivre coûts, échecs et qualité | **12 mois** | un an couvre le suivi de qualité et des dépenses ; au-delà, aucune finalité | à créer : purge mensuelle ; le lien personnel est déjà coupé à la suppression du compte | avec la base |
| Liste des adresses invitées (`auto_acces_beta`) | ouvrir l'accès pendant la bêta | jusqu'à la fin de la bêta, **3 mois** au plus après | la liste n'a plus d'objet une fois l'accès ouvert ou la bêta arrêtée | à la main, ou purge à la fin de la bêta | avec la base |
| Journaux techniques (Vercel, Supabase) | exploitation, sécurité | durée du prestataire **[À VÉRIFIER]** selon l'offre | non paramétrable par nous ; ils ne contiennent ni adresse ni contenu de facture (vérifié) | automatique, chez le prestataire | sans objet |
| Mesure d'audience | sans objet pour Nexora Auto | **aucune donnée collectée** | le filtre rejette toutes les adresses `/auto` | sans objet | sans objet |
| Données supprimées présentes dans les sauvegardes | pouvoir restaurer après incident | durée de rétention des sauvegardes Supabase **[À VÉRIFIER]** (dépend de l'offre) | une sauvegarde sans rétention ne protège de rien ; la suppression y devient effective à l'expiration | automatique, par rotation des sauvegardes | **à écrire dans la politique** : « une donnée supprimée disparaît des sauvegardes au plus tard au bout de N jours » |

**Ce qui est déjà immédiat, sans mécanisme à créer :** suppression d'un
document, d'une intervention, d'un relevé, d'une tâche ou d'une voiture par la
personne ; retrait de la liste bêta ; fermeture de l'accès. La suppression du
compte lui-même n'existe pas encore (décision D3).

## 7. Décisions à prendre

| # | Décision | Options | Recommandation |
| --- | --- | --- | --- |
| D1 | Durées de conservation (**la plus pressante** : la page publiée dit qu'aucune durée n'est arrêtée) | valider ou corriger le tableau de la section 6 bis, durée par durée, et décider quels mécanismes de suppression construire | valider les durées avant la bêta externe ; ne publier une durée qu'avec son mécanisme |
| D2 | Lieu de lecture des factures | **tranchée et appliquée** le 17 sept. 2026, option (a) : `vercel.json` avec `regions: ["dub1"]`, confirmé en Production (`cdg1::dub1`). Reste à Baptiste : relire la page de facturation Vercel, et dérouler un parcours Pro connecté avec ses identifiants |
| D3 | Suppression du compte | depuis l'application, ou sur demande par e-mail pendant la bêta ; effacement des fichiers ; sort du journal des lectures ; compte Nexora Pro partagé | sur demande pendant la bêta, traitée à la main avec une procédure écrite |
| D4 | Accès administrateur aux dossiers | aucun sans demande de la personne, ou accès d'exploitation tracé | aucun accès sans demande, écrit dans la politique |
| D5 | Pièces d'identité (carte grise…) | **appliquée** : `/auto/confidentialite` conseille de ne pas déposer de pièce d'identité pendant la bêta | à confirmer, ou à durcir |
| D6 | Conditions d'utilisation | à rédiger (service gratuit, bêta, pas de garantie sur les échéances calculées) | nécessaires avant la bêta externe |
| D7 | Vercel Analytics sur `/auto` | **sans objet** : vérifié le 17 sept. 2026, le filtre rejette déjà toutes les adresses `/auto`. Écrit dans la page de confidentialité | rien à faire |
| D8 | Vraies factures sur la base Test | autorisé pour Baptiste seul (ses propres factures) ou non ; suppression après la recette | seulement les vôtres, supprimées après mesure. **Nexora Auto est désormais en ligne sur la Production** : ses propres factures y ont leur place, c'est son dossier |
