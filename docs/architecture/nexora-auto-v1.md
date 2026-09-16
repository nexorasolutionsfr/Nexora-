# Nexora Auto — plan de construction V1

Décidé par Baptiste le 15 septembre 2026, lancé le 16. Nexora devient l'app
grand public qui s'occupe de la voiture de l'automobiliste, sur le modèle de
TUHU (Chine), YourMechanic (États-Unis) et Fixter. Le logiciel des garages
devient l'outil des garages partenaires.

> **Premier objectif : « J'ajoute ma voiture et Nexora m'aide déjà à mieux la
> gérer. »** Le véhicule, ajouté une fois, devient le point de départ de tout :
> informations, documents, kilométrage, interventions, dépenses, échéances,
> puis les services qui lui correspondent. La réservation viendra enrichir cet
> environnement ; les partenariats ne conditionnent pas sa construction.

---

## A. Où et comment on construit

**Dans ce dépôt et dans la même base Supabase que Nexora Pro.** Une
réservation Nexora Auto devra arriver dans l'agenda du garage partenaire, avec
son client et son véhicule : c'est ce qui fait du tableau de bord actuel
l'outil des partenaires. Deux bases séparées obligeraient à synchroniser deux
systèmes pour chaque commande.

| Espace | Adresse | Pour qui |
| --- | --- | --- |
| Nexora Auto | `/auto` | l'automobiliste, sur téléphone d'abord |
| Nexora Pro | `/dashboard` (existant) | le garage partenaire, quand la réservation existera |
| Admin Nexora | à créer | l'équipe Nexora |

Les pages `/auto` ne sont pas indexées (`robots: noindex`) tant que
l'ouverture au public n'est pas décidée.

## B. Règles de construction

1. **Test d'abord, Production sur feu vert.** Migrations additives, tables
   préfixées `auto_`, aucune table existante modifiée sans nécessité écrite.
2. **Les données de l'automobiliste ne se mélangent pas à celles des garages.**
   `auto_vehicules` appartient à une personne ; `vehicules` à un garage. Jamais
   de rapprochement par la plaque. Le lien naîtra d'une réservation, avec
   l'accord du client.
3. **Provenance.** Tout relevé ou intervention porte `source` :
   `proprietaire` (saisi, modifiable) ou `prestation` (produit par Nexora,
   non modifiable par l'automobiliste). Une information saisie et un
   justificatif restent distingués.
4. **Aucune précision inventée.** Une échéance ne se calcule qu'à partir de ce
   qui est renseigné, et dit sa source ; sinon l'écran demande l'information
   manquante. Un document officiel (procès-verbal) prime sur tout calcul.
5. **Consulter n'est pas réserver.** Un service peut se découvrir avant d'être
   réservable ; l'écran le dit clairement. Aucun prix ni créneau n'est
   présenté comme une offre réelle sans validation d'un partenaire, et les
   données de démonstration restent identifiées et limitées à Test.
6. **Montage commercial.** Le garage vend et facture ; Nexora perçoit une
   commission. La future réservation permettra le paiement au garage ou en
   ligne, avec **la confirmation du rendez-vous et l'état du paiement
   distincts**. Aucun argent réel avant validation du montage par un comptable.
7. **Les opérations critiques sont déterministes, en base** : prix, statuts,
   droits, montants. L'IA ne sert qu'à comprendre un besoin.
8. **Simple devant, rigoureux derrière.** Vocabulaire de l'automobiliste,
   jamais celui du logiciel.

## C. Les lots

| Lot | Contenu | État |
| --- | --- | --- |
| **A** | Accueil, compte, « Mon garage », fiche véhicule : kilométrage daté, historique, échéances du contrôle technique et de la révision | **Fait sur Test**, PR de revue (section D) |
| **B** | Consolider « Mon garage » : plusieurs véhicules et véhicule principal, archivage, documents (factures, carnet, contrôle technique) rattachés aux interventions, historique qui distingue saisie et justificatif, dépenses par véhicule | **Fait sur Test**, PR de revue (section E) |
| **C** | « À prévoir » : contrôle technique et révision, rappels personnalisés, tâches personnelles (pneus, batterie, nettoyage), actions simples, et ce qui reste inconnu | **Fait sur Test**, PR de revue (section F) |
| **D** | Univers des services, reliés au véhicule : entretien et réparation, pneus, lavage et esthétique, contrôle technique, assistance ; modes (chez un professionnel, à domicile, collecte et restitution) distincts des prestations. Chaque fiche explique la prestation et ce qu'il faut pour une future offre ; ajout aux prochaines actions sans doublon ; consulter ≠ réserver | **Fait sur Test**, PR de revue (section G) |
| **E et suivants** | Partenaires et offres, disponibilités, réservation (paiement au garage ou en ligne), côté garage « Commandes Nexora » et travaux supplémentaires, admin Nexora, suivi et notifications, assistant « décrivez le problème » | plus tard, sur ce socle |

---

## D. Lot A — contrat

### Parcours

1. `/auto` sans session : proposition de valeur, « Ajouter mon véhicule ».
2. `/auto/connexion` : création de compte, connexion, mot de passe oublié,
   nouveau mot de passe. Le compte porte `user_metadata.espace = "auto"`. Tous
   les liens d'e-mail reviennent dans `/auto` (`emailRedirectTo`,
   `redirectTo`). Liens expirés et renvoi d'e-mail : décisions reprises de
   `components/connexion/`.
3. `/auto` avec session : « Mon garage », une carte par voiture avec deux
   pastilles (contrôle technique, révision). Une lecture en échec affiche une
   erreur et « Recharger », jamais un garage vide.
4. `/auto/vehicules/nouveau` : marque et modèle obligatoires ; année, énergie,
   plaque, mise en circulation, dernier contrôle, date du procès-verbal,
   kilométrage facultatifs. Enregistrement par `auto_ajouter_vehicule` : tout
   ou rien.
5. `/auto/vehicules/[id]` : modifier, kilométrage daté, échéances,
   historique (ajout, suppression de ses propres saisies), suppression de la
   voiture.

### Règles de calcul (`lib/auto/echeances.js`, testées)

**Contrôle technique** — règles **corrigées au lot C** d'après service-public.fr
(défaillances majeure et critique, contre-visite favorable, échéance à la
veille) : voir la section F.

**Révision** — uniquement avec l'intervalle recopié du carnet (km et/ou mois)
et une **révision** passée ; une vidange seule ne la remplace pas. L'écran dit
« selon l'intervalle que vous avez renseigné ». Un relevé antérieur à la
révision ne dit rien de ce qui reste.

« Proche » : 60 jours ou 1 500 km. Le plus urgent des deux l'emporte.

### Base

- `20260922000100_auto_mon_vehicule.sql` : `auto_vehicules`,
  `auto_releves_km`, `auto_historique`, `auto_ajouter_vehicule`.
- `20260922000200_auto_controle_technique_proces_verbal.sql` :
  `resultat_controle` (favorable, contre_visite) et `controle_valable_jusqu_au`,
  réservés au contrôle technique ; la fonction reçoit la date du procès-verbal.
- RLS : la personne connectée lit et modifie ses seules voitures ; relevés et
  historique écrits seulement avec `source = 'proprietaire'`. `anon` : aucun
  droit. Plaque normalisée, unique par propriétaire, jamais globalement. Dates
  futures refusées par déclencheur (`auto_date_future`).
- `auto_ajouter_vehicule` : `security invoker`, droits de l'appelant.

### Recette jouée le 16 septembre 2026

| Contrôle | Résultat |
| --- | --- |
| `node --test lib/auto components/auto` | 39 tests au vert |
| `supabase/tests/auto_mon_vehicule_v1.sql` sur base jetable (image Supabase 17.6), migrations jouées deux fois | tous les contrôles passés, aucun résidu |
| Mutations volontaires (RLS coupée, provenance ignorée) | le banc échoue bien |
| Les deux migrations sur **Test** (`db push`) | appliquées |
| Même banc sur **Test**, transaction annulée | passé, aucun résidu |
| Parcours navigateur sur Test : connexion par lien, voiture créée avec kilométrage et contrôle, intervalle, révision, nouveau relevé, date du procès-verbal | « avant le 29 avr. 2027, date inscrite sur le procès-verbal » ; révision « encore 600 km » |
| `next build` | réussi, quatre routes `/auto` |

Compte de recette sur Test : `recette.auto.202609161747@nexora-recette.invalid`,
une Renault Clio V. Ouvrir une session :
`node scripts/recette/compte-auto.mjs lien <adresse>`, puis l'adresse locale
affichée.

### Ce que le lot ne fait pas

- Pas de lecture automatique de la plaque : **reportée**, marque et modèle
  suffisent ; les informations utiles à un devis seront demandées au moment
  du choix d'un service.
- Pas de documents, pas de dépenses, pas de rappels : lots B et C.
- Le tableau de bord garage n'est pas modifié. Un compte automobiliste qui
  ouvrirait `/dashboard` se verrait proposer de créer un garage : à traiter
  avant l'ouverture au public.

### Avant la Production

- Vérifier que `https://nexora-garage.vercel.app/auto` est une redirection
  autorisée de Supabase Auth en **Production** (vérifié sur Test pour
  `localhost`). Sinon, les liens de confirmation retombent sur `/dashboard`.
- Décider de l'adresse publique de l'app.

### Retour arrière

Supprimer les tables `auto_historique`, `auto_releves_km`, `auto_vehicules` et
les fonctions `auto_ajouter_vehicule`, `auto_refuser_date_future`,
`auto_horodater`. Aucun objet existant n'est touché.

---

## E. Lot B — contrat

### Ce que la personne peut faire

- **Plusieurs voitures, une principale.** La première voiture ajoutée devient
  principale ; « Définir comme principale » en change. La principale est en
  tête de « Mon garage ».
- **Archiver sans perdre.** Une voiture archivée quitte la liste courante,
  garde tout son dossier, et se restaure. Si la principale part aux archives,
  la plus ancienne voiture active prend sa place ; une voiture restaurée
  alors qu'il n'y a plus de principale le devient. La suppression définitive
  reste possible, avec un avertissement qui propose l'archivage.
- **Documents.** Facture, procès-verbal de contrôle technique, carnet, carte
  grise, assurance : PDF ou photo, 10 Mo au plus, privés. Un document peut
  justifier une intervention de la même voiture (« Joindre un justificatif »
  depuis l'historique).
- **Historique lisible.** Chaque intervention dit si elle a été « Saisie par
  vous » ou « Enregistrée par Nexora », et si un justificatif l'accompagne.
- **Dépenses.** Total des 12 derniers mois, depuis la première dépense, par
  année et par type, calculé à partir des montants saisis. Les interventions
  sans montant ne sont pas comptées, et l'écran le dit.

### Base (`20260922000300_auto_mon_garage_consolide.sql`)

- `auto_vehicules.principal` (index unique partiel par personne, jamais
  archivée) et `archive_le` ; reprise : la plus ancienne voiture active de
  chaque personne devient principale.
- `auto_definir_principal`, `auto_archiver_vehicule` : `security invoker`,
  invariants tenus en base ; `auto_ajouter_vehicule` rend principale la
  première voiture.
- `auto_documents` : RLS par propriétaire ; déclencheur de cohérence (le
  chemin est `<propriétaire>/<voiture>/<fichier>` de la voiture de la ligne,
  l'intervention justifiée est de la même voiture) ; formats et taille bornés ;
  date non future. Supprimer l'intervention garde le document, détaché.
- Compartiment `auto-documents` **privé** (10 Mo, 6 formats) ; règles
  `auto_documents_stockage_*` : lire et supprimer dans son dossier, déposer
  seulement sous une de ses voitures. Ouverture par adresse signée de 5 min.
- Côté écran : le fichier part d'abord, puis sa fiche ; si la fiche échoue,
  le fichier est retiré. À la suppression, la fiche part d'abord, puis le
  fichier (au pire un fichier orphelin invisible, jamais une fiche sans
  fichier).

### Recette jouée le 16 septembre 2026

| Contrôle | Résultat |
| --- | --- |
| `node --test lib/auto components/auto` | 47 tests au vert (dépenses en centimes, documents, échéances…) |
| `supabase/tests/auto_mon_garage_consolide_v1.sql` sur base jetable, migrations jouées deux fois | passé, aucun résidu |
| Mutations volontaires (index de la principale retiré, cohérence des documents coupée) | le banc échoue bien |
| `supabase/tests/auto_documents_stockage_base_jetable.sql` (maquette `prelude_stockage_base_jetable.sql`) | passé |
| Migration sur **Test** ; bancs A et B rejoués sur Test | passés, aucun résidu |
| `node scripts/recette/stockage-auto.mjs` : vraie API Storage de Test, deux comptes | 10 vérifications sur 10 : dépôt, isolation (dépôt, lecture, liste, signature, suppression), adresse signée, aucun accès public, format refusé ; comptes nettoyés |
| Parcours navigateur sur Test | principale en tête ; dépenses « 189,90 € sur 12 mois, 1 intervention sans montant » ; justificatif déposé et rattaché à la révision ; 208 définie principale puis archivée, la Clio redevient principale |

Sur le compte de recette, la Peugeot 208 archivée et la facture de révision
restent en place pour la démonstration.

### Ce que le lot ne fait pas

- Pas de lecture du contenu des documents (aucune extraction automatique).
- Pas de rappels ni de tâches : lot C « À prévoir ».
- Pas de partage de documents avec un garage : viendra avec la réservation.

### Retour arrière

Vider le compartiment `auto-documents` puis le supprimer ; supprimer
`auto_documents`, les politiques `auto_documents_stockage_*`,
`auto_definir_principal`, `auto_archiver_vehicule`, les colonnes `principal`
et `archive_le` ; recréer `auto_ajouter_vehicule` telle que dans
`20260922000200`.

---

## F. Lot C — « À prévoir »

### Le principe

Nexora se sert de ce qui est déjà enregistré : la personne ne recrée rien.
Les échéances du contrôle technique et de la révision **ne sont pas stockées** :
elles se calculent à chaque lecture depuis le dossier de chaque voiture
active (`components/auto/aPrevoir.js`). Une intervention enregistrée les
actualise donc d'elle-même, sans doublon, et ne ferme aucune tâche. Une
voiture archivée ne produit plus rien.

Chaque élément répond à trois questions : **quoi faire** (titre), **pour
quand** (date, délai ou kilomètres) et **sur quelles informations**, avec un
fondement affiché :

| Fondement | Quand |
| --- | --- |
| Date officielle | date inscrite sur le procès-verbal |
| Calcul selon la règle | règle du contrôle technique appliquée aux dates connues |
| Selon l'intervalle renseigné | révision calculée avec l'intervalle du carnet et le dernier compteur |
| Estimation | révision calculée avec un kilométrage estimé |
| Votre tâche | tâche personnelle |
| Information manquante | l'élément dit ce qu'il faut renseigner, sans date inventée |

Chaque élément propose ses gestes (« Actualiser le kilométrage », « Enregistrer
une révision », « Enregistrer la contre-visite », « Indiquer la date du
procès-verbal »…), qui ouvrent directement le bon formulaire sur la fiche
(`/auto/vehicules/[id]?action=…`). La fiche et « À prévoir » affichent les
mêmes phrases.

### Contrôle technique : règles relues le 16 septembre 2026

Service-public.fr, F2878 (voiture particulière, 3,5 t au plus) :

| Situation | Échéance |
| --- | --- |
| Premier contrôle | dans les 6 mois avant le 4e anniversaire : mise en circulation le 1er oct. 2022 → entre le 1er avril et le 30 sept. 2026 |
| Favorable | valable 2 ans : contrôle du 14 mai 2025 → jusqu'au 13 mai 2027 |
| Défavorable, défaillance majeure | valable 2 mois : 14 mai 2026 → 13 juillet 2026 |
| Défavorable, défaillance critique | validité limitée au jour du contrôle |
| Contre-visite (les deux cas) | au plus tard 2 mois après le contrôle : 13 juillet 2026 |
| Contre-visite favorable | 2 ans à compter du contrôle défavorable initial : 5 juin 2026 → 4 juin 2028 |

La date du procès-verbal prime toujours. Quand la règle ne permet pas de
conclure (contre-visite sans contrôle initial retrouvé, contrôle « périodique »
tombant dans le délai d'une contre-visite), l'écran demande la date officielle.
Migration `20260922000400` : `resultat_controle` (favorable,
defavorable_majeure, defavorable_critique), `nature_controle` (periodique,
contre_visite), validité possible le jour même.

### Kilométrage (`lib/auto/kilometrage.js`)

Chaque relevé garde sa date et sa source. L'**estimation** reste distincte du
compteur : rythme observé entre deux points espacés d'au moins 30 jours ;
proposée seulement si le dernier relevé a entre 14 jours et un an. Au-delà de
60 jours, l'écran propose d'actualiser le compteur quand il sert à une échéance.

### Rappels

- **Dans l'app** : « Mon garage » montre au plus trois prochaines actions (en
  retard ou dans l'horizon choisi : 30, 60 ou 90 jours).
- **« Me le rappeler plus tard »** (1 semaine, 1 mois) retire l'élément du
  rappel sans le retirer de la liste. La clé du report porte la date de
  l'échéance : une échéance actualisée n'est plus reportée.
- **Envois externes : préparés, non branchés.** `auto_preferences.rappels_externes`
  reste à faux et aucun écran ne le propose. `rappelsADeclencher` choisit les
  paliers (30 jours, 7 jours, retard) et `auto_rappels_envois` interdit qu'un
  palier parte deux fois pour la même échéance et le même canal (réservé à
  `service_role`).

### Ce que Nexora ne fait pas

Aucun besoin de pneus, de freins ou de batterie n'est déduit sans information
qui le justifie : ces besoins viennent de la personne (tâche) ou, plus tard,
d'un constat professionnel.

### Base (`20260922000500_auto_a_prevoir.sql`)

`auto_taches` (titre, voiture, date éventuelle, note ; terminée datée),
`auto_preferences` (horizon), `auto_rappels_reports`, `auto_rappels_envois`.
RLS par propriétaire ; journal d'envois fermé aux personnes.

### Recette jouée le 16 septembre 2026

| Contrôle | Résultat |
| --- | --- |
| `node --test lib/auto components/auto` | 66 tests au vert, dont les exemples officiels du contrôle technique |
| `supabase/tests/auto_a_prevoir_v1.sql` sur base jetable, migrations jouées deux fois ; bancs A et B rejoués | passés, aucun résidu |
| Mutations volontaires (RLS des tâches coupée, journal d'envois ouvert) | le banc échoue bien |
| Migrations sur **Test** ; bancs A, B, C rejoués sur Test | passés |
| Parcours navigateur sur Test | « Mon garage » : trois prochaines actions ; « À prévoir » : révision (selon l'intervalle renseigné), contrôle technique (date officielle) ; tâche ajoutée ; rappel reporté (retiré de l'accueil, gardé dans la liste) ; gestes menant au formulaire ouvert ; défaillance majeure → contre-visite au plus tard le 9 nov. 2026 ; contre-visite favorable → avant le 9 sept. 2028 (contrôles de test supprimés ensuite) |

### Retour arrière

Supprimer `auto_rappels_envois`, `auto_rappels_reports`, `auto_preferences`,
`auto_taches` ; pour `20260922000400`, supprimer `nature_controle` et recréer
les contraintes de `20260922000200`.

---

## G. Lot D — Services

### Le principe

Depuis sa voiture ou une échéance, la personne découvre une prestation, comprend
ce qu'elle contient et la garde dans ses prochaines actions. Les partenariats ne
sont pas un prérequis : rien n'est réservable aujourd'hui, et l'écran le dit.

Trois notions, jamais confondues :

| Notion | Où | Ce que c'est |
| --- | --- | --- |
| **Service** (prestation) | `components/auto/services.js`, table `auto_services` | une seule fiche par prestation : révision, vidange, freinage, batterie 12 V, diagnostic, climatisation, pneus (remplacement, saisonniers, géométrie), lavage, detailing, contrôle technique, assistance |
| **Mode** | `auto_services_modes` | façon habituelle de réaliser une prestation : chez un professionnel, à domicile ou au travail, collecte et restitution. Un filtre du catalogue, jamais une prestation de plus ; une possibilité, pas une disponibilité |
| **Offre** | `auto_offres` (vide), `lib/auto/offres.js` | un professionnel inscrit (`garages`), une prestation, un mode existant de cette prestation, une zone (codes postaux), éventuellement des énergies, une période. Seule une offre active et valable pourra rendre « Réserver » possible |

Le test `services.test.js` vérifie que la base et les fiches décrivent les mêmes
prestations et les mêmes modes.

### Chaque fiche

- **Reprend la voiture** choisie (`?vehicule=`, sinon la principale), changeable
  d'un geste ; la navigation reste possible sans voiture, sans compte, ou avec
  un dossier incomplet.
- **S'adapte à ce qui est connu** : énergie (une vidange ne concerne pas une
  électrique ; batterie 12 V de servitude sur une hybride), motorisation.
  Énergie inconnue : « la compatibilité reste à vérifier », jamais présumée.
  Aucune recommandation fondée sur l'âge ou le kilométrage, aucun diagnostic.
- **Dit** à quoi sert la prestation, ce qu'elle comprend habituellement, ce qui
  dépend du véhicule ou reste à vérifier, les informations d'une future offre
  (déjà dans le dossier / à compléter, avec le lien vers le bon formulaire / à
  préciser le moment venu), et les modes possibles.
- **Aucun prix, aucun créneau, aucun professionnel** (vérifié par test).

### Prochaines actions et réservation

| Situation | Ce que montre la fiche |
| --- | --- |
| Révision, contrôle technique | « Déjà suivi dans « À prévoir » » avec l'échéance calculée, et « Voir dans À prévoir » (la carte est mise en évidence) |
| Tâche ouverte pour cette prestation et cette voiture | « Dans vos prochaines actions », date ou « Sans date », « Voir dans À prévoir » |
| Sinon | « Ajouter à mes prochaines actions » : date facultative, rien d'autre |
| Prestation qui ne concerne pas la voiture | aucun ajout |
| Toujours (hors assistance) | « Réservation non disponible actuellement », sans date de lancement ni formulaire |
| Assistance | « Nexora ne déclenche pas de dépannage » : 112, assistance du contrat, lien vers les documents. Aucun bouton, aucun mode, aucune offre possible |

Depuis « À prévoir » et la fiche véhicule, chaque échéance ou tâche issue d'une
prestation mène à sa fiche (« La prestation »). La fiche véhicule propose
« Services pour cette voiture ».

### Base (`20260922000600_auto_services.sql`)

- `auto_services` (13 lignes ; `suivi` : `echeance` pour révision et contrôle
  technique, `tache`, `aucun` pour l'assistance) et `auto_services_modes`
  (32 couples) : lecture seule pour `authenticated`.
- `auto_taches.service_code` : index unique partiel (une tâche ouverte par
  voiture et prestation) ; déclencheur `auto_taches_service_ajoutable` : seules
  les prestations suivies en tâche s'ajoutent.
- `auto_offres` : vide ; inactive par défaut ; mode obligatoirement existant
  pour la prestation (clé étrangère) ; zone et énergies contrôlées ; écriture
  réservée à `service_role` ; lecture des seules offres actives et valables.
- `auto_vehicules.motorisation` : modifiable, 80 caractères au plus.
- Les droits par défaut du schéma donnent tout à `authenticated` sur une table
  nouvelle : ils sont retirés avant d'accorder la lecture.

### Recette jouée le 16 septembre 2026

| Contrôle | Résultat |
| --- | --- |
| `node --test lib/auto components/auto` | 79 tests au vert (catalogue, modes, compatibilité, informations, doublons, offres, concordance base/fiches) |
| `supabase/tests/auto_services_v1.sql` sur base jetable, migration jouée deux fois ; bancs A, B, C rejoués | passés, aucun résidu |
| Mutations volontaires (index anti-doublon retiré, déclencheur retiré, offres inactives lisibles) | le banc échoue bien |
| Migration sur **Test** ; banc D rejoué sur Test | passé ; 13 prestations, 32 modes, 0 offre, lecture seule |
| Parcours navigateur sur Test | catalogue par univers et filtre « à domicile » (sans contrôle technique, climatisation, géométrie ni assistance) ; freinage ajouté pour le 10 oct. puis « Dans vos prochaines actions » ; « Voir dans À prévoir » met la carte en évidence ; révision « déjà suivie » ; motorisation complétée depuis la fiche ; 208 sans énergie « à vérifier » puis bascule vers la Clio ; assistance sans bouton ; consultation sans compte ; code inconnu → 404 ; aucun débordement à 320 et 375 px (tâche de test supprimée ensuite) |
| `next build` | réussi, routes `/auto/services` et `/auto/services/[code]` |

### Ce que le lot ne fait pas

Pas de prix, de créneau, de partenaire, de demande de devis ni de réservation.
Une tâche libre existante (« Monter les pneus hiver ») n'est pas rattachée
automatiquement à la prestation correspondante.

### Retour arrière

Supprimer `auto_offres`, le déclencheur, l'index et la colonne `service_code`
de `auto_taches`, `auto_services_modes`, `auto_services`, la fonction
`auto_taches_service_ajoutable` et la contrainte
`auto_vehicules_motorisation_courte`.
