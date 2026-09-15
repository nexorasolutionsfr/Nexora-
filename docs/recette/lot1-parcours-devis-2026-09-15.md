# Recette — Lot 1 « terminer le parcours devis », 15 septembre 2026

Branche `lot1/parcours-devis` (depuis `main` `32f52fe`). Supabase **Test**,
garage fictif « PROTO Atelier 2026-09-14-19h23 », serveur de dev de la branche
(`http://localhost:3000`). Vraies interactions dans Chrome headless piloté par
`scripts/recette/capture.mjs` (session par lien à usage unique, clics et
frappes réelles), bureau 1280 px et téléphone 375 px. Aucun envoi, aucune
autorisation d'envoi, **aucune migration**.

## Défauts reproduits avant correction

| # | Constat (reproduit le 15 sept.) | Cause dans le code |
|---|---|---|
| A | Dossier BB-202-BB › « Réf. 09B786 · Accepté » ouvrait l'écran Devis sans ce devis : l'accepté n'y figurait que dans « Réponses des clients » (sans lignes) et la carte complète affichée était celle d'**un autre** devis, en attente. Retour proposé : « Revenir à Aujourd'hui », pas au dossier. | `DevisView` n'affichait en carte que les `en_attente` ; `devisOuvertId` servait seulement à marquer « nouveau » ; le retour ne mémorisait que la vue. |
| B | Le devis « RECETTE UX » (808293, en attente) reprend le constat `6f5689db` déjà chiffré dans le devis accepté 09b7869c de la même visite. « Préparer le devis » cochait ce point d'office. | `proposerPoints` ne regardait que les lignes du devis réceptacle. |
| C | Écran Devis : réponses, cartes complètes et formulaires empilés. | — |
| D | « Devis sans réponse depuis 0 jour · **Prestation** » dans Aujourd'hui, « Prestation » sur la carte ; montants « 206.40 € » ; 0 € ou total partiel en tête d'un devis incomplet. | repli `prestations?.nom || "Prestation"` ; `toFixed(2)`. |

## Corrections

- **A/C — `DevisView`** : liste compacte (immatriculation, véhicule, client,
  désignation, statut, prochaine action, montant) et **un seul document
  ouvert**, choisi par son id, quel que soit son statut. Modifiable → la
  `DevisCard` existante ; accepté/refusé → `DevisDocumentDecide`, qui réutilise
  `DevisLignesEditor` en lecture seule, `DevisApercuModal` et la règle « fiche
  atelier existante ». Aucun rendu ni calcul dupliqué. Un devis décidé ancien
  ouvert depuis le dossier ou l'historique figure dans la liste.
- **Retour** : `quitterDossierVers` mémorise le dossier ; « Revenir au dossier
  BB-202-BB » rouvre le dossier par-dessus l'écran d'origine. S'applique à
  toutes les sorties du dossier (atelier, factures, agenda…).
- **Historique** : « Ouvrir le devis » sur chaque devis.
- **B — `reprise.js`** : `couvertureDesPoints` (tous les devis du véhicule) ;
  un constat repris ailleurs est décoché d'avance **mais cochable**, avec le
  devis en cause (« Déjà chiffré dans le devis accepté Réf. 09B786 »,
  « Déjà dans le devis Réf. … encore modifiable », « Déjà proposé dans le
  devis refusé … ») et « Ouvrir le devis ». Coché : « Complément : ce point sera
  chiffré à nouveau, le devis … n'est pas modifié ». Le devis accepté de la
  visite est montré verrouillé ; la cible devient « Nouveau devis
  complémentaire pour cette visite ». Rien n'est rattaché automatiquement.
- **D — `calculs.js`** : `designationDevis` (prestation, sinon première ligne,
  sinon rien), `montantPrincipalDevis` (« À chiffrer » en tête, « partiel :
  … TTC » ou « aucune ligne chiffrée » en second), `formatEuro` avec séparateur
  de milliers (« 1 500,00 € »). Utilisés par Aujourd'hui, la liste, la carte,
  l'historique, le dossier et le sélecteur de devis d'origine.

## Parcours joué

| Étape | Rôle | Constat | Preuve |
|---|---|---|---|
| Dossier › devis accepté | dirigeant | le devis 09B786 s'ouvre : client, véhicule, désignation, réponse « depuis son lien », 3 lignes en lecture seule, 308,40 € TTC, « Fiche atelier existante » | `apres-A-dossier-retour.png` |
| Revenir au dossier | dirigeant | dossier BB-202-BB rouvert | idem |
| Dossier › devis en attente | dirigeant | 808293 ouvert, liste en dessous (« Ouvert ci-dessus ») | `apres-A-en-attente-depuis-dossier.png` |
| Même geste à 375 px | dirigeant | aucun débordement, retour présent | `apres-A-accepte-375.png`, `apres-C-devis-en-attente-375.png` |
| Préparer le devis | dirigeant | cible par défaut 808293 : point grisé « Déjà dans ce devis » ; cible nouveau : point décoché, « Déjà chiffré dans le devis accepté Réf. 09B786 », « Ouvrir le devis », bouton inactif tant que rien n'est coché | `apres-B-preparer-nouveau.png` |
| Complément explicite + **double clic** « Créer le devis » | dirigeant | un seul devis créé (b21876df, visite du jour, ligne « Prix à renseigner ») ; second appel : « Cette préparation avait déjà été enregistrée » ; les deux devis existants **identiques** en base (comparaison JSON avant/après) | `apres-B-complement-cree.png` |
| Chiffrage → modèle (double clic) → pièce → lien | dirigeant | 185 € ; « Fixation pare-chocs » inséré une fois (3 lignes) ; « À chiffrer · partiel : 294,00 € » puis 308,40 € TTC ; lien obtenu ; état d'envoi en base `a_valider` (rien autorisé) | `apres-parcours-chiffrage-modele-lien.png` |
| Revenir au dossier | dirigeant | 3 devis listés (Réf. B21876, 808293, 09B786) | idem |
| Aujourd'hui | dirigeant | « Devis sans réponse depuis 0 jour · Pare-chocs avant fendu », « · RECETTE UX — Réparation du pare-chocs » | — |
| Historique › Ouvrir le devis | dirigeant | bascule sur Devis, 09B786 ouvert | `apres-D-historique-ouvrir.png` |
| Écran Devis | accueil | onglets Devis/Factures seulement, liste compacte, accepté en lecture seule sans geste de modification | `apres-A-accueil-devis.png` |

Tests unitaires : 524/524 (`calculs.test.js` : milliers, désignation, montant
principal ; `reprise.test.js` : couverture, priorité accepté, visite).

## Données laissées sur Test (preuves, non supprimées)

Devis b21876df (complément, en attente, 308,40 €) sur BB-202-BB, avec un lien
public actif. Le devis de revue « RECETTE UX » (808293, 206,40 €) et l'accepté
09b7869c (308,40 €) sont inchangés.

## Limites

- Isolation inter-garages : aucune requête ni droit modifié ; non rejouée.
- Le badge « À faire maintenant » du dossier (« 3 devis — à choisir ») reste
  tel quel : on montre, on ne choisit pas.
- « Voir la réponse » / « Ouvrir le devis » depuis Aujourd'hui mènent au
  dossier du véhicule, comme avant.
