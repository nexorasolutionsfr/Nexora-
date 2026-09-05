# L'accueil : ce qu'on comprend en ouvrant — V1

## Le diagnostic, mesuré

L'accueil faisait **1 960 px** pour un écran de 812. Sur une journée calme, le
premier écran contenait :

| Bloc | Hauteur | Ce qu'il disait |
| --- | --- | --- |
| Salutation | 119 px | Bonsoir, la date, l'état d'ouverture |
| 4 compteurs | ~200 px | **0 · 0 · 0 · 0 €** |
| 3 zones de décision | ~275 px | **« rien », « rien », « rien »** |

**Six cents pixels pour dire qu'il ne se passe rien**, avant la première
information réelle — « Ce mois-ci, 174 € » — qui se trouvait à 1 098 px.

Quatre problèmes, du plus au moins grave :

1. **Tout était dit deux fois.** « Rendez-vous du jour : 0 » résumait
   « Votre journée → rien de programmé », juste en dessous.
2. **Rien ne hiérarchisait.** Même fond, même bordure, même rayon partout :
   **le jour où une urgence apparaissait, elle ressemblait à une carte vide.**
3. **Les zones vides occupaient la meilleure place.**
4. **La vue ne changeait jamais de forme**, journée creuse ou surchargée.

## Ce qui a changé

### Une phrase, en haut

`resumeJournee.js`. Ce qu'un associé annoncerait en arrivant :

> *« 3 voitures attendues aujourd'hui, 1 à l'atelier — rien qui bloque. »*
> *« 2 voitures attendues aujourd'hui — 3 décisions vous attendent. »*

**Rien n'est estimé.** Chaque fragment vient d'un compteur déjà calculé et
affiché ailleurs à l'identique. Une phrase de synthèse qui arrondit ou
extrapole devient invérifiable — et le jour où elle se trompe, le garage cesse
de croire tout le reste de l'écran.

Un test interdit explicitement les adjectifs d'appréciation : pas de « belle
journée », pas de « journée chargée ». **Le garage juge, Nexora compte.**

**Une seule alerte à la fois**, la décision avant l'argent : deux alertes dans
la même phrase, et aucune des deux n'est lue.

### Les compteurs rentrent dans l'en-tête

Une ligne de quatre chiffres cliquables au lieu d'une grille de quatre cartes.
La redondance disparaît, et **~140 px** sont récupérés.

### La journée calme se replie

Quand les trois zones sont vides, il ne reste que les deux boutons d'ajout —
seule chose utile de ces cartes. **~200 px** récupérés.

> Répéter « rien à traiter » sous une phrase qui dit déjà « rien qui bloque »,
> sous une pastille qui dit « Fermé aujourd'hui », c'est trois fois la même
> information sur un écran de téléphone. La phrase ne redit d'ailleurs plus la
> fermeture : la pastille s'en charge, trois centimètres plus haut.

### L'urgence se voit

`CommandZone` accepte `accentue`. Quand « À traiter maintenant » contient
quelque chose, la carte prend la couleur de son icône en bordure et un liseré
de 4 px à gauche.

**Une seule zone porte cet accent à la fois** : deux urgences simultanées ne
sont plus une urgence, c'est un décor.

## Résultat mesuré

| | Avant | Après |
| --- | --- | --- |
| Hauteur totale | 1 960 px | **1 594 px** (−19 %) |
| « Votre journée » | 789 px | **422 px** |
| « Ce mois-ci » (1er chiffre réel) | 1 098 px | **731 px** |

Les deux blocs qui portent de l'information sont désormais **sur le premier
écran**.

Et la vue change de forme : avec une décision en attente, la phrase passe en
gras avec une pastille ambre, le compteur « Priorités » monte à 1, la zone
rouge se détache et repousse le reste à 842 px. **Ce qui presse passe devant.**

## Vérifié dans le navigateur

Journée calme puis journée avec une décision en attente, créée par le vrai
parcours d'ajout d'un appel à rappeler. Bordure `rgb(220,38,38)` et liseré
`inset 4px` mesurés sur l'élément. Données de recette supprimées.
