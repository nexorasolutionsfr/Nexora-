# Recette — la photo d'un constat s'ouvre en grand (page client)

Branche `feat/photo-constat-en-grand`, base `a818b86`. Application servie en local sur la base **Test**
(`slawilafseganlbghgwx`). Aucune écriture en Production, aucun envoi, aucun garde-fou contourné.

## Jeu d'essai

Garage fictif « Garage Démo Vidéo », cliente fictive Claire Bernard, Peugeot 308 SW `DM-208-XY`.

- Contrôle de recette `5e40c1aa-91d7-4c02-8f65-2b6d0a7f31c4`, créé pour ce lot : un point avec **deux** photos
  (une paysage 1600 × 1200, une portrait 1100 × 2008 — deux recadrages de la même photo libre) et un second point
  **sans** photo, pour vérifier que la mention d'agrandissement n'apparaît que là où il y a une photo.
- Contrôle du film `7d1c0f52-…` (une seule photo) laissé tel quel : il était déjà **verrouillé**, et le
  déclencheur `inspections_photos_verrou` refuse d'y ajouter une photo sans réouverture explicite. Garde-fou
  respecté : le jeu d'essai a été créé à côté, pas en forçant celui-là.
- Finalisation et lien client obtenus par les **vrais boutons** (« Finaliser le contrôle », « Préparer le lien
  client »).

## Ce qui a été vérifié, et comment

| # | Vérification | Résultat |
|---|---|---|
| 1 | Vignettes rendues comme boutons, libellé lu par un lecteur d'écran | 2 boutons « Voir la photo en grand — Autre · Disque de frein avant gauche (recette) (1 sur 2 / 2 sur 2) » |
| 2 | Mention « Touchez la photo pour l'agrandir » seulement sur un point qui porte une photo | 1 seule occurrence sur la page (le point « Pneu avant droit » n'en a pas) |
| 3 | **Clic souris réel** sur la vignette | fenêtre ouverte, `role="dialog"`, `aria-modal="true"`, `aria-label="Photo du constat : …"` |
| 4 | Photo entière, proportions conservées (bureau 1024 × 768) | source 1600 × 1200 → affichée 746 × 560, entièrement dans l'écran |
| 5 | Navigation entre les deux photos (bouton « Suivante », puis flèches du clavier) | compteur « 1 / 2 » → « 2 / 2 » puis retour ; portrait 1100 × 2008 → 307 × 560, ratio conservé |
| 6 | **Échap** ferme | fenêtre fermée, défilement de la page rendu |
| 7 | Focus rendu à la vignette d'origine | `document.activeElement` = le bouton « (1 sur 2) » exactement |
| 8 | **Entrée** sur la vignette rouvre | fenêtre ouverte, une seule instance, focus placé sur « Fermer la photo » |
| 9 | Focus maintenu dans la fenêtre | 5 × Tab puis 2 × Maj+Tab : le focus reste dans la fenêtre et boucle entre « Fermer », « Précédente », « Suivante » |
| 10 | Fermeture par le bouton « Fermer » et par clic sur le fond | fermées dans les deux cas |
| 11 | **Format téléphone 375 × 812** | paysage 351 × 263, portrait 320 × 585, photo entièrement visible, bouton « Fermer » ≥ 44 px visible, aucun défilement horizontal |
| 12 | Aucune régression sur la décision | « Valider ce point » → « Confirmer / Annuler » → « Annuler » : retour à l'état initial, **aucune décision écrite** |
| 13 | Aucune écriture en base | `inspections_points.decision_client` reste `null` sur les deux contrôles ; `inspections_historique` ne contient que les transitions attendues (brouillon → en attente client → consulté) |
| 14 | Stockage toujours privé | accès public direct à l'objet : **HTTP 400**. La fenêtre réutilise l'URL signée de la vignette (aucune route, aucun droit, aucune migration) |
| 15 | Échec de chargement | voir ci-dessous |
| 16 | Tests unitaires | `node --test components/inspections/photoEnGrand.test.js` — 8 tests, 8 passés |

Les clics et les frappes des points 3 à 12 sont de **vrais événements** du navigateur (pas des `.click()` en
JavaScript), sauf mention contraire.

### Point 8 — pourquoi une activation clavier explicite

Avec un `<button>` seul, la touche Entrée n'ouvrait pas la fenêtre alors que l'événement `keydown` arrivait bien
(`isTrusted: true`) : l'activation native dépend de l'action par défaut de l'événement, qui n'est pas toujours
délivrée. Le composant gère donc Entrée et Espace explicitement, avec `preventDefault` — jamais de double
ouverture (vérifié : une seule fenêtre dans le DOM). La touche Espace n'a pas pu être émise correctement par
l'outil de pilotage (touche vide) ; elle est couverte par les tests unitaires.

### Point 15 — échec de chargement

Le message ne conclut jamais à l'expiration du lien : « Cette photo n'a pas pu être affichée. Vérifiez votre
connexion, puis réessayez. Si le problème persiste, rechargez la page ou redemandez le lien à votre garage. »
Deux boutons : « Réessayer » (recharge l'image, sans toucher à l'URL signée) et « Recharger la page ».

## Limites

- Recette menée sur **Test**, en local. Rien n'est déployé en Production.
- Les écrans garage (détail du contrôle, saisie) n'ont pas été raccordés : hors lot.
- Pas de test automatisé de rendu (le dépôt n'a pas d'outil de test React) : la logique pure est couverte par
  `node --test`, le reste est vérifié à la main comme ci-dessus.
