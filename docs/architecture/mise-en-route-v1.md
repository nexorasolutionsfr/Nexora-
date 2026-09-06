# La mise en route du garage — V1

## Le problème

Un garage qui vient de s'inscrire arrive sur un tableau de bord vide, avec
**treize onglets** dans le menu et aucune idée de par où commencer. Le
catalogue de prestations est posé automatiquement, l'essai court — mais rien ne
lui dit que ses horaires ne sont pas renseignés, que **son agenda proposera donc
des créneaux les jours de fermeture**, et qu'il a une base clients à reprendre.

## Trois règles que ce module s'impose

### L'état est DÉDUIT des données, jamais stocké

Pas de colonne `onboarding_termine` à tenir à jour, qui finirait par mentir.
Si le garage a trois mécaniciens, l'étape est faite ; s'il les supprime tous,
elle redevient à faire. **La liste dit toujours la vérité.**

### Ce qui est passé ne va pas en base non plus

Un garage qui travaille seul ne doit pas voir « Votre équipe » indéfiniment.
Mais le fait de passer une étape est une **préférence d'affichage**, pas une
donnée métier : elle vit dans le navigateur, et son absence ou sa corruption ne
casse rien — la liste réapparaît, c'est tout.

### La liste disparaît quand elle n'a plus rien à dire

Une liste de mise en route affichée six mois devient du décor. Tout fait ou
tout passé, elle s'efface — et on rappelle une fois où retrouver ces réglages :
*Paramètres, onglet Mon garage*.

## L'ordre des étapes n'est pas décoratif

| # | Étape | Pourquoi à cette place |
| --- | --- | --- |
| 1 | Horaires d'ouverture | Sans eux, l'agenda propose des créneaux les jours de fermeture. C'est le réglage qui rend le reste **juste**. |
| 2 | L'équipe | Pour affecter les véhicules et voir qui fait quoi. |
| 3 | Clients et véhicules | Le plus long et le plus rentable — une seule fois. |
| 4 | Premier rendez-vous | N'a de sens qu'une fois le reste en place. |

Les prestations n'y figurent pas : le catalogue est déjà posé à l'inscription
selon le profil d'activité. La liste démarre donc sur quelque chose de faisable
plutôt que sur une montagne.

## L'accès direct au bon onglet

« Vos clients et véhicules » n'ouvre pas Paramètres puis laisse chercher :
elle ouvre **Paramètres → Reprise de données**, zone de dépôt visible.
`ParametresView` accepte un `ongletInitial`, et l'accueil le lui passe.

C'était la demande explicite du porteur du projet : *« simplifier son accès au
dashboard »*. Nommer un réglage puis faire chercher où il se trouve, c'est
déplacer le problème d'un écran.

## Ce que la mise en page a coûté

Première version : **588 px**, soit 72 % d'un écran de téléphone — pour une
carte censée ne pas surcharger.

| Version | Hauteur | Ce qui a changé |
| --- | --- | --- |
| Initiale | 588 px | bouton d'action sous chaque ligne |
| Compactée | 501 px | bouton remonté sur la ligne, textes resserrés |
| **Finale** | **414 px** | **la ligne entière devient la cible, un chevron remplace le bouton** |

Sur 375 px, un bouton « Ouvrir l'agenda » mangeait un tiers de la largeur et
faisait tenir le texte sur quatre lignes. Un chevron suffit à dire que ça mène
quelque part, et la cible tactile devient toute la ligne — plus grande, pas
plus petite.

La ligne est un `div role="button"` et non un `<button>` : « Passer » vit à
l'intérieur, et un bouton dans un bouton n'est pas du HTML valide. Le clavier
est géré à la main (Entrée et Espace).

## Vérifié dans le navigateur

Sur un garage réellement neuf, créé sur Test via la vraie RPC d'inscription :

- Les quatre étapes s'affichent, compteur à `0 sur 4`
- « Vos clients et véhicules » atterrit sur **Paramètres → Reprise de données**
- « Passer » retire la ligne, l'enregistre, et **survit au rechargement**
- Passer n'incrémente pas le compteur : **passer n'est pas faire**
- Tout passé → la carte disparaît
- `localStorage` corrompu → la carte revient et l'accueil s'affiche normalement
