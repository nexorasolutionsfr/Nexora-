# Recette — parcours complet au navigateur (PR #101), nuit du 15 septembre 2026

Supabase **Test**, garage fictif isolé « PROTO Atelier 2026-09-14-19h23 »
(`2141e000-65b2-48e3-a012-d2d7eb61a5d0`, créé par `scripts/recette/jeu-atelier.mjs`),
serveur de dev de **cette branche** (`http://localhost:3000`). Vraies interactions :
navigateur intégré au bureau (1280 px) et Chrome headless à 375 px
(`scripts/recette/capture.mjs`, `PORT_APP=3000`). Aucun message envoyé : le lien
client a été obtenu par « Obtenir un lien à transmettre vous-même ».

## Le parcours

| Étape | Qui | Geste réel | Vérifié en base |
|---|---|---|---|
| 0. Fiche atelier | dirigeant | « Fiches atelier (OR) › Créer depuis un rendez-vous » : visite du jour de BB-202-BB (09:00, déposée) ; « Mécanicien assigné » = Karim B. | une seule fiche `b2e3bf70…` sur ce rendez-vous, affectée à Karim, sans devis |
| 1. Constat | mécanicien | « Mon atelier » › fiche du jour › « Constats du véhicule » : « Pare-chocs avant fendu », « Dommage constaté », précision | `atelier_mes_constats` (session du mécanicien) : point `6f5689db…` sur le contrôle `afbb371b…` de cette fiche |
| 1 bis. Photo | mécanicien, **375 px** | « Ajouter une photo » (sélection de fichier native) → « Photo ajoutée. », miniature, aucun débordement | 1 photo sur le point |
| 2. Devis | dirigeant | recherche BB-202 › dossier › « Préparer le devis depuis le constat » (constat coché, photo, « Nouveau devis pour cette visite ») › « Créer le devis » | devis `09b7869c…` rattaché au **rendez-vous du jour** (même client, même véhicule), ligne liée au constat, « prix à renseigner », notification `sans_lien` |
| 2 bis. Prix | dirigeant | « Chiffrer la ligne » › 185 € › « Enregistrer la ligne » | 185 € HT, plus de « prix à renseigner » |
| 3. Modèle | dirigeant | Paramètres › « Nouveau modèle » « Fixation pare-chocs » : main-d'œuvre 60 €, pièce sans prix | modèle `45665b0c…`, 2 lignes, prix 60 / vide |
| 3 bis. Insertion | dirigeant | carte du devis › « Ajouter un modèle » › « Fixation pare-chocs », « Pour chiffrer un constat » = le pare-chocs › **double clic** « Ajouter au devis » | 3 lignes, **une seule insertion**, lignes du modèle liées au constat ; lien public et autorisation d'envoi **refusés** (« Devis incomplet… », `chiffrage_incomplet`) |
| 3 ter. Prix manquant | dirigeant | « Chiffrer la ligne » sur la pièce › 12 € | 257 € HT / 308,40 € TTC |
| 4. Lien | dirigeant | « Obtenir un lien à transmettre vous-même » (« Ce lien n'envoie rien… ») | lecture anonyme `lire_devis_par_jeton` : ce devis, 3 lignes, aucun chemin ni identifiant interne |
| 5. Client | client, bureau et **375 px** | lien ouvert : garage, voiture, lignes, « Constat du garage », photo ; Entrée ouvre la photo, Échap rend le focus ; « Accepter » → « Vous avez accepté ce devis. » | `accepte`, `reponse_origine = client`, 3 preuves figées, accusé `sans_lien` : rien d'armé |
| 6. Réponse | dirigeant | Aujourd'hui : « BB-202-BB · Devis accepté · reçu à l'instant · Pare-chocs avant fendu › Voir la réponse » → dossier : Devis « Accepté », Fiche atelier « Ouverte », « Suivez l'avancement depuis l'écran Atelier » | — |
| 7. Suivi partagé | dirigeant puis **accueil** | dirigeant : ligne BC-303-CC › « Marquer traité » (« Marqué traité — rien n'a été envoyé ni facturé ») ; accueil (autre session) : ligne absente, « Suivi et reports (1) » : « Devis accepté par … · marqué traité · Remettre » | une action `devis` / `traite` écrite par le dirigeant |

## Frictions trouvées et corrigées

| # | Constat | Correction | Preuve après |
|---|---|---|---|
| 1 | **« Marquer traité » / « Reporter » échouaient** sur toute réponse de client (« Impossible d'enregistrer cette action ») : `reponse_devis` refusé par la contrainte d'`opportunites_actions` — **même contrainte en Production** (export du 15 sept.) — et clé d'affichage `reponse-devis:` jamais rapprochée du journal | la réponse s'écrit sous `devis` (`sourceJournal`) ; rapprochement par clé de journal ; une marque antérieure à la réponse ne la masque pas. Sans migration | 5 tests (`deriveOpportunites.test.js`) ; parcours étape 7, bureau, dirigeant et accueil |
| 2 | **Éditeur de modèle** : dans Paramètres (carte de 410 px à 1280 px), le libellé tombait à **22 px**, recouvert par la quantité — impossible à cliquer, la frappe partait dans un champ numérique | deux rangées (type + libellé, puis quantité / prix / TVA plafonnés) | libellé 270 px au bureau, 127 px à 375 px, cliquable, corbeille dans son cadre |
| 3 | **« Créer l'ordre de réparation »** proposé pour un devis déjà porté par une fiche (BC-303-CC) ou pour le devis d'une visite dont la fiche existait (BB-202-BB) — le formulaire n'offrait alors aucun rendez-vous | « Fiche atelier existante » dans « Réponses des clients » et « Historique » | BJ-010-JJ (sans fiche) garde le bouton ; BB-202-BB et BC-303-CC ne l'ont plus |
| 4 | **Devis client** : « Constat du garage » répété sur chaque ligne ajoutée pour chiffrer le constat, deux fois vide, même photo | la preuve reste sur la première ligne ; une ligne suivante la garde si elle a son texte ou une photo nouvelle | 3 tests (`vueClient.test.js`) ; 1 bloc, 1 miniature au bureau et à 375 px |
| 5 | **Devis client** : « — » seul sous le véhicule quand le devis n'a pas de prestation | rien n'est affiché | test ; en-tête « garage · véhicule · montant » |
| 6 | **Aujourd'hui** : « Devis accepté · reçu … · Prestation » — mot générique | nom de la prestation, sinon première ligne du devis | « … · Pare-chocs avant fendu » |
| 7 | **Mécanicien, « Mon atelier »** : la visite de l'an dernier en tête, la voiture du jour en bas ; « 0/0 fait » sur une fiche sans ligne | fiches en cours d'abord (la plus récente en tête), terminées ensuite avec « Terminée » ; pas de compteur sans ligne | bureau et 375 px |
| 8 | **Mécanicien** : section « Notes techniques » disant « Aucun constat… / Ajouter un constat » sous « Constats du véhicule » | vocabulaire de note | bureau |
| 9 | **Focus** : « Chiffrer la ligne », « Nouveau modèle », « Ajouter un modèle » laissaient le focus sur la page | focus sur le champ utile à l'ouverture (`autoFocus`, geste explicite) | frappe directe du prix ; liste des modèles active à l'ouverture |

Aucune de ces corrections ne modifie la base. Tests : `vueClient` 8/8,
`deriveOpportunites` 5/5, suite unitaire 512/512 ; compilation de production
relancée sur l'arbre final (voir la PR).

## Outil de recette corrigé (pas l'application)

`scripts/recette/capture.mjs` visait par défaut le port **3113**, servi par un
autre worktree (`nexora-atelier-continuite`) : une capture sans `PORT_APP`
mesurait un autre code, sans erreur. Défaut ramené à 3000, URL affichée à chaque
capture ; geste `fichier:` (sélection de fichier native) ; sous-dossiers créés.
Relevé des captures de la PR : toutes prises sur le port 3000 ; les exécutions
sur 3113 sont des essais ratés de cette nuit, non livrés.

## Ce qui reste, sans correction cette nuit

- Fermer le dossier ouvert depuis « Voir la réponse » rend le focus à la page (la
  ligne d'origine a été re-rendue entre-temps).
- « origine non enregistrée » sur les réponses du jeu de démonstration (réponses
  antérieures au 17 sept., libellé existant).
- La catégorie « Autre » s'affiche en petit sous le constat dans « Préparer le devis ».
- Après acceptation, le dossier propose toujours « Préparer le devis depuis le
  constat » (un devis complémentaire reste possible) : laissé tel quel.

## Captures

`docs/recette/captures/parcours-2026-09-15/` : `mecanicien-photo-375.png`,
`mecanicien-liste-375.png`, `modele-editeur-375.png`, `client-devis-375.png`,
`accueil-suivi-partage.png`.
