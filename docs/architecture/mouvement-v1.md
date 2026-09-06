# Le mouvement dans Nexora — V1

## Une seule source

Tout ce qui bouge est défini dans `app/globals.css`, sous le titre
**MOUVEMENT NEXORA**. Éparpiller des animations dans les composants produit
toujours la même dérive : quatre durées différentes pour le même geste, et une
correction faite à trois endroits sur quatre.

## Trois règles

### 1. Le mouvement sert à comprendre, jamais à décorer

Il dit d'où vient un élément, ou qu'une valeur a changé. **Ce qui ne dit rien ne
bouge pas.** Il n'y a donc ni parallaxe, ni carte qui pivote, ni compteur qui
défile de 0 à 12 — un garagiste veut lire un chiffre, pas le regarder arriver.

### 2. Court : 150 à 260 ms

Un garagiste ouvre son tableau de bord vingt fois par jour, entre deux voitures.
**Une animation qu'on remarque à la vingtième est une animation trop lente.**
Rien n'est jamais masqué en attendant : tout est lisible pendant que ça finit de
se placer.

L'accélération est `cubic-bezier(.16,1,.3,1)` — très rapide au départ, arrivée
en douceur. L'élément semble arriver avant d'avoir fini de bouger.

### 3. `prefers-reduced-motion` coupe tout

Ce n'est pas une option. Certaines personnes ont des vertiges avec les
animations, et un logiciel de travail n'a pas le droit d'être un obstacle.

**Le piège associé** : un élément animé en `both` reste figé sur son état de
départ si l'animation est simplement désactivée — donc invisible. Chaque règle
de mouvement réduit remet donc explicitement `opacity: 1` et `transform: none`.

## Le vocabulaire

| Classe | Ce qu'elle dit |
| --- | --- |
| `.nx-apparait` | ce bloc vient d'arriver — monte de 8 px en se révélant |
| `.nx-cascade` | ses enfants arrivent dans l'ordre de lecture, 40 ms d'écart, 5 crans maximum |
| `.nx-souffle` | **cette valeur vient de changer** |
| `.nx-squelette` | ça charge, et voici la forme de ce qui arrive |
| `.nx-pressable` | c'est touchable — s'enfonce d'un pixel |
| `.nx-monte` | ce message vient du bas de l'écran |
| `.nx-voile` / `.nx-panneau` | une modale s'ouvre |
| `.nx-vue` | on a changé d'onglet |

**8 px et pas 20** pour l'apparition : au-delà, l'œil suit le déplacement au
lieu de lire le contenu. **`scale(.98)` et pas `.9`** pour les modales : au-delà,
le contenu paraît sauter à la figure.

**5 crans de cascade** : au-delà, le dernier élément arrive si tard qu'on croit
à un défaut de chargement.

## Le souffle : la seule animation qui porte de l'information

Les compteurs de l'accueil et de l'atelier comparent leur valeur à la
précédente. Quand elle change — une voiture arrive, un devis bascule — le
chiffre se dilate de 6 % pendant 260 ms.

**Pourquoi ça compte** : l'atelier en direct est le seul écran qu'on laisse
ouvert sur un coin de l'établi. Le chiffre bouge sans que personne ne regarde ;
ce souffle est ce qui le fait remarquer **au coup d'œil suivant**, sans
notification, sans badge, sans son.

## Les squelettes ont la forme de ce qu'ils annoncent

`components/garage-os/Squelettes.jsx`.

Un rond qui tourne dit « attendez » et rien d'autre. Un squelette dit « voici ce
qui arrive, et où » : l'œil se place avant que le contenu n'existe, et **la page
ne saute pas** au moment où il arrive. Sur un tableau de bord ouvert vingt fois
par jour, cette absence de saut est ce qui donne l'impression que le logiciel est
rapide — plus encore que sa vitesse réelle.

**La règle** : un rectangle générique de la mauvaise hauteur est pire que rien,
parce qu'il promet une mise en page puis la contredit. Chaque squelette reprend
donc la structure réelle du bloc qu'il remplace.

L'onde qui traverse remplace le clignotement d'opacité : elle indique un sens de
lecture et se lit comme « ça arrive » au lieu de « ça clignote ».

## Le changement d'onglet

120 ms, un fondu, **aucun déplacement**. On change d'onglet bien plus souvent
qu'on ne charge la page : une transition qu'on attend devient une lenteur. Et un
glissement latéral donnerait le mal de mer à qui navigue vite.

Le conteneur porte `key={view}` — sans cette clé, React réutiliserait le nœud et
l'animation ne jouerait qu'une fois, au premier affichage.
