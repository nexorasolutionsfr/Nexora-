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
| **C** | « À prévoir » : contrôle technique et révision, rappels personnalisés, tâches personnelles (pneus, batterie, nettoyage), actions simples, et ce qui reste inconnu | à faire |
| **D** | Univers des services, reliés au véhicule : entretien et réparation, pneus, lavage et esthétique, à domicile, collecte et restitution, assistance. Chaque fiche explique la prestation, les informations nécessaires et son intérêt ; statut « à découvrir » ou « réservable » | à faire |
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

**Contrôle technique** — calcul limité à la voiture particulière standard ;
la date officielle est demandée dès que la règle ne suffit pas :

1. Le dernier contrôle porte une date de procès-verbal : **elle fait foi**.
2. Le dernier contrôle a donné lieu à une **contre-visite** : échéance de
   contre-visite à 2 mois, jamais d'échéance à 2 ans.
3. Un contrôle qui suit de près une contre-visite, sans procès-verbal : on
   demande la date officielle.
4. Sinon, **estimation** à 2 ans du dernier contrôle, présentée comme telle.
5. Aucun contrôle : premier contrôle dans les 6 mois précédant le 4e
   anniversaire de la mise en circulation. Voiture de plus de 4 ans sans
   contrôle connu : on le demande.

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
