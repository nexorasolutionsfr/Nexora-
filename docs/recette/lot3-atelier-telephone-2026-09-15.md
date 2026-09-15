# Recette — Lot 3 « faciliter le travail dans l'atelier », 15 septembre 2026

Branche `lot3/atelier-telephone` (depuis `main` `32f52fe`, **indépendante des
lots 1 et 2**). Supabase **Test**, garage fictif « PROTO Atelier
2026-09-14-19h23 », comptes mécanicien, accueil et dirigeant existants. Chrome
headless à **375 × 812** (vraie session, vrais clics). Aucune migration.

## Parcours audités

| Parcours | Ce qui a été fait | Constat |
|---|---|---|
| Mécanicien — « Mon atelier » | liste des fiches | lisible, fiche en cours en tête, aucun débordement, aucun bouton < 36 px |
| Mécanicien — fiche BB-202-BB | ouverture, lecture de l'étape, des constats, du formulaire d'ajout | aucun débordement ; champs à 309 px. **Obstacle** : les six étapes « Où en est le véhicule » et « ← Revenir à mes fiches » font **32 px** de haut |
| Accueil — Aujourd'hui | lecture | aucun débordement. Raccourcis (« Voir toutes », « Agenda », « Ajouter un rappel »…) sous 36 px — **non modifiés** (consigne : ne pas refaire Aujourd'hui) |
| Saisie du contrôle au téléphone (dirigeant) | Contrôle véhicule › BB-202-BB › « Reprendre la saisie », **étapes 1 à 7** | **débordement signalé non reproduit** : 0 élément hors écran à chaque étape. **Obstacles** : croix de fermeture sans nom accessible, zone tactile limitée à l'icône ; à l'étape « Autre », corbeille « Retirer ce point » et suppression de photo à **15 px**, sans nom (seulement un `title`) |

## Corrections

- `AtelierMecanicienScreen.jsx` : étapes et lien de retour à 40 px minimum.
- `InspectionCaptureFlow.jsx` : croix de fermeture 40 × 40 avec
  « Fermer la saisie du contrôle » ; corbeille 40 × 40 avec « Retirer le point
  … » ; suppression de photo 28 × 28 avec « Supprimer la photo — … » (vignette
  passée de 56 à 64 px pour la contenir) ; « Signaler » et « Replier » à 40 px.

## Vérification après correction (375 px)

| Écran | Mesure | Geste réel |
|---|---|---|
| Fiche mécanicien | 6 étapes à 40 px, retour à 40 px, aucun débordement | « Diagnostic » → étape active « Diagnostic », puis remise sur « Véhicule déposé » |
| Saisie, étape 6 | fermeture 40×40, corbeille 40×40, photo 28×28, noms présents, aucun débordement | navigation Suivant ×5 (aucune suppression) |

Captures : `captures/lot3-2026-09-15/` (`mecanicien-*`, `dirigeant-saisie-*`,
`apres-*`).

## Limites

- Un petit bouton sans nom subsiste hors de la saisie (probablement la croix du
  menu mobile du dashboard) : non traité.
- Parcours accueil « retrouver le véhicule / revenir au travail en cours » :
  couvert par le lot 1 (retour au dossier) ; pas de nouveau défaut relevé ici.
- L'ajout réel d'un constat avec photo par le mécanicien avait été joué le
  15 sept. (recette de #101) ; non rejoué dans ce lot, le formulaire n'ayant
  pas changé.
