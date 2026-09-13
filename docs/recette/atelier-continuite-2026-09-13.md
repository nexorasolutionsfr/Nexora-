# Recette — continuité Aujourd'hui → Atelier → Dossier véhicule

13 septembre 2026, sur **Test** uniquement. Aucune écriture en Production,
aucun envoi vers une adresse réelle.

Tout ce qui suit a été **cliqué dans le navigateur**, pas déduit d'un test
unitaire. Les valeurs chiffrées sont mesurées (`document.body.scrollHeight`,
comptages d'éléments), pas estimées.

## Le jeu de données

Garage `PROTO Atelier 2026-09-13-08h38 — données fictives`
(`76147ea8-4071-4bf5-a135-969324c24c13`), créé par
`scripts/recette/jeu-atelier.mjs`. **12 véhicules, 15 rendez-vous.**

Toutes les adresses client sont en `@nexora-recette.invalid` : le domaine
n'existe pas par norme (RFC 2606), un envoi accidentel ne peut atteindre
personne.

| Situation demandée | Couverte par |
|---|---|
| Garage vide | `TEST UX Mobile — garage vide` (`ad7a0e51…`) |
| Journée réaliste, ~12 véhicules | 12 véhicules, 15 rendez-vous |
| Véhicule attendu | `BA-101-AA` 08:00, `BK-111-KK` 17:00 |
| Véhicule déposé | `BB-202-BB` |
| Diagnostic | `BF-606-FF` |
| Attente client | `BD-404-DD` |
| Attente pièce | `BE-505-EE` |
| Intervention | `BC-303-CC` |
| Véhicule prêt | `BG-707-GG`, `BH-808-HH` |
| Restitution | `BI-909-II`, facture en attente |
| Devis accepté | `BJ-010-JJ` et `BC-303-CC` |
| Devis refusé | `BK-111-KK` |
| Envoi en attente / envoyé / incertain | devis de `BD-404-DD` / `BE-505-EE` / `BC-303-CC` |
| Plusieurs interventions, même véhicule | `BB-202-BB` — 4 visites, dont une facturée et payée |

Cas limites glissés dans le jeu, tous vérifiés à l'écran :
véhicule **sans plaque** (Dacia Sandero), véhicule **sans marque ni modèle**
(`BF-606-FF`), **client sans téléphone ni e-mail** (Yanis Cherif), **nom de
client très long** (Marie-Alexandrine de Kervasdoué-Lestrange), **nom de
mécanicien très long** (Jean-Baptiste de La Rochefoucauld-Montmorency),
**prestation très longue** (« Remplacement de l'embrayage sur boîte
automatique à double embrayage »), **téléphone au format +33**, **rendez-vous
entrés la veille et l'avant-veille**.

## Le parcours, joué de bout en bout

| # | Geste | Résultat observé |
|---|---|---|
| 1 | Retrouver une voiture — frappe `BE-505` dans la barre | La ligne annonce la plaque, le client, **et l'état** : « En attente d'une pièce · À vous ». |
| 2 | Comprendre sa situation sans ouvrir | La carte de l'atelier dit : plaque, voiture, client, travail, **« Attente de la pièce commandée »**, mécanicien, date du rendez-vous. |
| 3 | Ouvrir son dossier | Le panneau s'ouvre **par-dessus** l'Atelier. Filtre, files repliées et position de défilement intacts derrière. |
| 4 | Faire la prochaine action autorisée | Le dossier propose **une** action, cohérente avec la carte. |
| 5 | Revenir à la liste | Fermeture : on retrouve le filtre, le repli et la position (mesuré : défilement 1 100 avant, 1 100 après). Départ vers un autre écran : un bouton **« Revenir à Atelier en direct »** ramène au même endroit. |

Chaîne complète vérifiée : Atelier (filtre Sofia M., défilement 500)
→ dossier `BJ-010-JJ` → « Ouvrir le devis » → écran Devis → « Revenir à
Atelier en direct » → **défilement 500, filtre « Tous les mécaniciens »,
barre de retour disparue**.

## Ce que le changement d'étape déclenche, et ce qu'il ne déclenche pas

Vérifié en base, pas supposé : `trg_notifier_vehicule_pret` est **le seul**
trigger sur `rendez_vous`, et il ne se déclenche que sur le passage à `pret`.

| Geste | File d'envoi avant | Après | Écran |
|---|---|---|---|
| `diagnostic` → `pret`, **annulé** | 0 | **0** | Étape en base inchangée (`diagnostic`) |
| `diagnostic` → `pret`, **confirmé** | 0 | **1** ligne `vehicule_pret` en attente | « Étape mise à jour » |
| `depose` → `intervention` | 0 | **0** | Aucune confirmation demandée, aucun envoi |

La confirmation dit ce qu'elle fait sans promettre un envoi — le workflow
« Véhicule prêt » est inactif, sa file se remplit sans se vider. Annoncer
l'envoi serait faux ; taire la mise en file le serait aussi.

La ligne de file créée pendant l'essai a été supprimée, et les étapes remises
dans leur état documenté.

## Ordinateur, téléphone, rôles

| | Résultat |
|---|---|
| **Ordinateur (1280 × 900)** | 4 files. Hauteur de page pour 14 rendez-vous : **2 896 px avant → 2 335 px après** (−19 %). |
| **Téléphone (375 × 812)** | Liste en une colonne, **aucun débordement horizontal** (`scrollWidth` = `innerWidth`), aucune carte plus large que l'écran. **5 208 px avant → 3 678 px après** (−29 %), et **2 170 px** en repliant trois files. |
| **Dirigeant** | Écran complet. Change les étapes, cherche voitures et factures. |
| **Accueil** | Même écran Atelier, barre latérale réduite (ni Statistiques, ni Paramètres). **Change bien une étape** — « Étape mise à jour », policy `rendez_vous_accueil`. **Cherche bien les factures**. |
| **Mécanicien** | N'atteint pas cet écran : il a le sien, « Mon atelier », qui ne montre que les fiches qui lui sont affectées, sans prix ni coordonnées client. Rien de ce lot ne lui est exposé, et la barre de recherche ne lui est pas proposée. |

## Garage vide

Quatre cadres vides sur presque deux hauteurs d'écran — corrigé : une carte,
une phrase, un bouton « Ouvrir l'agenda ». Quand c'est le **filtre** qui vide
l'écran, l'écran le dit et propose de le retirer, au lieu de laisser croire
que l'atelier est vide.

## Deux défauts trouvés en recette, corrigés dans la foulée

1. **La carte disait « Attente de la réponse du client », le dossier disait
   « À vous de jouer »** (`BD-404-DD`). Les six étapes engagées renvoyaient la
   même phrase dans `filVehicule`. Corrigé : les deux attentes ont leur état,
   leur phrase et leur acteur.
2. **« Ouvrir la fiche atelier » menait à la liste de l'atelier**, sur une
   voiture qui n'a aucun ordre de réparation — le mot « fiche atelier » est
   réservé à la vue d'un ordre. Corrigé en « Voir dans l'Atelier ».

## Limites du modèle rencontrées, non contournées

- **Un jeu de recette ne se supprime pas entièrement.** `devis_check_immuabilite`
  interdit de supprimer un devis accepté ou refusé ; `ordres_reparation`
  n'accorde `DELETE` à aucun rôle applicatif. Un garage de recette qui a porté
  un devis accepté reste sur Test. C'est une protection juridique, pas un
  oubli : `purger` annonce ce qu'il n'a pas pu supprimer au lieu de le taire.
- **`vehicules_immatriculation_unique` est globale, pas par garage.** Deux
  garages ne peuvent pas détenir la même plaque. Rencontré en créant le jeu
  de données. Voir le rapport : c'est un défaut de multi-tenant à traiter
  **avant le deuxième garage**, hors du périmètre d'un lot d'interface.
- **Un devis non accepté ne se rattache à aucune visite** — limite déjà
  connue et déjà énoncée à l'écran (« Devis sans intervention associée »).
