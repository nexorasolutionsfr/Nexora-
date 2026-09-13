# Recette — une seule liste « À traiter »

14 septembre 2026. Projet **Test**, `http://localhost:3113/dashboard`.
**Aucun envoi réel.** Les adresses `.invalid` ne sont pas considérées comme une
barrière : aucun envoi n'a été déclenché, aucune confirmation cliquée.

> **Recette jouée dans la variante de Production.**
> `NEXT_PUBLIC_COCKPIT_OPPORTUNITES_ACTIF=true` a été reproduit sur Test — c'est
> ce réglage qui faisait cohabiter les deux écrans, et c'est son absence sur
> Test qui avait laissé passer le défaut. Le drapeau ne sélectionne plus rien :
> il n'y a plus qu'un écran, donc plus de variante à comparer.

## Ce qui a quitté l'affichage permanent, et où sa fonction vit

| Retiré | Où ça vit maintenant |
|---|---|
| le **Cockpit séparé** (3 sections) | ses lignes sont dans « À traiter » ; « Marquer traité » et « Reporter » s'ouvrent en dépliant la ligne ; le journal et les reports sont sous « Suivi et reports » |
| les **trois zones** (demandes/devis, prêt à valider, argent à risque) | mêmes lignes, même liste. « Un appel à rappeler » et « Un travail à relancer » restent en accès direct |
| la **liste des arrivées** | celles qui demandent un geste sont dans la liste ; les autres sont dans **Agenda**, joignable en un clic depuis la ligne d'activité |
| la **liste des voitures prêtes** | idem : un message non envoyé ou bloqué est une tâche ; le reste est dans **Atelier** |
| les **quatre compteurs d'atelier** | la ligne d'activité (« 7 voitures au garage · 4 attendues · 2 prêtes »), puis **Atelier** |
| les pastilles **« Nexora a repéré »** | elles répétaient une ligne déjà listée |
| **« Ce mois-ci »** | **Statistiques** |
| **« Comprendre le parcours d'une réparation »** et **« Ce qui part vers vos clients »** | panneau **« Comprendre Nexora »**, en bas de l'écran |
| **« Votre journée »** | supprimé au lot précédent — il comptait l'atelier autrement |

La **mise en route** reste, sous la liste : un réglage manquant bloque de vraies
actions. Un garage installé ne la voit jamais.

## Aucune tâche perdue, aucune comptée deux fois

La correspondance complète est dans `docs/architecture/aujourdhui-a-traiter.md`.
Ce qui a été vérifié à l'écran, sur le garage de recette :

- **19 actions**, issues des deux moteurs, dans **une seule liste** :
  messages bloqué et non envoyé, demande Gmail, deux rappels, devis accepté,
  deux devis sans réponse, quatre arrivées en retard, deux créneaux dépassés,
  une inspection, un travail différé échu, deux factures à établir.
- **L'inspection apparaît une fois**, plus deux.
- **Le devis accepté apparaît une fois** : la ligne du Cockpit est écartée au
  profit de celle qui nomme la voiture (`BC-303-CC`) et ouvre le dossier.
- **Les deux factures de la Clio restent deux tâches**, distinguées par la date
  de leur visite.
- **Un report de RDV et des travaux dépassés sur le même rendez-vous** restent
  deux lignes : ce sont deux gestes.
- **Le compteur est la liste** : 19 annoncées, 19 affichées après dépliage.

### Deux défauts trouvés pendant cette recette, corrigés

1. La ligne d'activité annonçait **« 0 prête »** à côté de deux voitures prêtes
   listées juste au-dessus : `regrouperOperationnel` rend un tableau, pas un
   objet indexé.
2. **Toutes les opportunités du Cockpit partageaient la clé `undefined`** —
   `deriveOpportunites` nomme son identité `key`, la liste unique `cle`. Une
   demande et une inspection fusionnaient en **une seule tâche**. Trouvé par un
   test, pas par l'œil.

## Les situations

| Situation | Bureau | Téléphone |
|---|---|---|
| journée chargée, plusieurs sources | `V2-habituelle-bureau.png` | `V2-habituelle-mobile.png` |
| journée chargée, interventions seules | `V2-chargee-bureau.png` | `V2-chargee-mobile.png` |
| garage installé, rien à traiter | `V2-installe-sans-action-bureau.png` | `V2-installe-sans-action-mobile.png` |
| garage neuf | `V2-nouveau-bureau.png` | `V2-nouveau-mobile.png` |

## Les règles de traitement

- **Une tâche ancienne ne disparaît pas.** Vérifié : le garage « installé »
  affichait deux visites closes depuis 11 et 24 jours, toujours à facturer.
  Elles ne sont sorties de l'écran qu'après suppression de leurs rendez-vous.
- **Une relance future n'est pas une tâche du jour** : le travail différé daté
  du 4 octobre n'est pas dans la liste, il est dans **« Suivi et reports »**,
  avec sa date. Il rejoindra la liste ce jour-là, sans geste.
- **« Marquer traité » ne répare rien, ne facture rien, n'envoie rien** : la
  phrase est écrite sous la ligne dépliée, et dans « Comprendre Nexora ».
- **Un clic de navigation ne marque rien** : ouvrir un dossier n'écrit pas dans
  le journal.

Capture de la ligne dépliée : `V2-ligne-depliee.png`. Suivi : `V2-suivi-et-reports.png`.

## Les parcours

| Geste | Résultat | Capture |
|---|---|---|
| « Appeler le client » | le dossier du véhicule, avec son intervention | `V2-parcours-dossier.png` |
| fermer le dossier | retour à la liste, à sa place | `V2-parcours-retour.png` |
| **« Vérifier le message »** | l'aperçu : **date du blocage (23 août), motif, destinataire et texte** — avant toute confirmation. Annulé. | `V2-verifier-le-message.png` |

## Les rôles

| Rôle | Résultat | Capture |
|---|---|---|
| dirigeant (propriétaire) | 19 actions, avec « Marquer traité » et « Reporter » | `V2-habituelle-bureau.png` |
| accueil | **les mêmes 19 actions** — rien ne lui est caché ; Statistiques et Paramètres hors de son menu | `V2-role-accueil.png` |
| mécanicien | « Mon atelier », il n'atteint pas Aujourd'hui | `V2-role-mecanicien.png` |

## Une source illisible n'est pas une source vide

Requête `inspections` coupée au réseau : bandeau **« Une partie de vos tâches
n'a pas pu être lue (les inspections). La liste ci-dessous est donc incomplète —
ne la lisez pas comme "tout est traité" »**, et le compteur passe de 19 à 18.
Capture : `V2-source-illisible.png`.

Requête `rendez_vous` coupée : le bloc rouge « Impossible de charger votre
journée » remplace la liste. Capture : `V2-erreur-chargement.png`.

## Limites restantes

- **Le journal `opportunites_actions` est réservé au propriétaire du garage**
  (`owner_user_id = auth.uid()`). Un compte `accueil` ne voit donc rien de
  masqué : une ligne traitée par le dirigeant lui réapparaît. **C'est le
  comportement actuel du Cockpit**, pas une régression. Le corriger demande une
  migration de politique — hors de ce lot. En attendant, les commandes
  n'apparaissent pas pour lui, plutôt que d'échouer en silence.
- Les dérivations en amont des anciennes zones (`demandesUrgentes`,
  `devisRecents`, `travauxTries`…) subsistent dans `NexoraDashboard.jsx` sans
  être rendues. Elles ne peuvent plus contredire l'écran, mais elles restent à
  nettoyer.
- Deux comptes ont été créés sur Test par une faute de frappe d'adresse pendant
  cette recette, puis **supprimés**.
