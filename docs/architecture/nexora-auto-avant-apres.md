# Ce que le conducteur obtient — mesure avant / après

*22 septembre 2026. Point de départ : `main` **f71fc64** (PR #144).
Mesures « après » relevées à l'écran sur la base Test ; mesures « avant »
établies depuis le code de f71fc64, et vérifiables par `git show`.*

**Ce qui est compté, et ce qui ne l'est pas.** Avancer dans des écrans n'est
pas obtenir quelque chose : un parcours de quatre étapes qui finit sur « il
vous manque trois informations » vaut zéro. On compte donc ce que la personne
**emporte**, pas ce qu'elle traverse.

---

## Parcours 1 — Corsa non couverte, sans document

Opel Corsa diesel, aucun programme publié, aucune facture, intervalle inconnu.
C'est la voiture de la recette réelle du 20 septembre.

| | Avant (f71fc64) | Après | |
|---|---|---|---|
| Questions obligatoires | 0 | 0 | = |
| Saisies répétées | — | — | = |
| Écrans avant un résultat | 2 | 2 | = |
| Boutons dans l'action d'accueil | 3 | **2** | −1 |
| **Résultat emporté** | **aucun** | **un résumé de la voiture + 5 questions, copiable** | ✔ |

**Avant.** L'accueil proposait « Voir ce que Nexora sait » (rappels et
Crit'Air — un vrai résultat, mais qui ne parle pas d'entretien), puis
« Compléter le suivi d'entretien » et « Ajouter une facture ». Côté entretien,
l'écran « Entretenir ma voiture » affichait *« Votre suivi d'entretien reste à
préciser »* suivi de **trois manques** et de trois sorties — dont les trois
réclamaient une information que le propriétaire n'a pas. Un mur poli.

**Après.** L'accueil mène à *« Préparer ma visite chez un garage »*. L'écran
rend, sans une seule saisie :

> Voiture : Opel Corsa · Énergie : Diesel · Première mise en circulation :
> 20 mai 2014 · Dernier compteur relevé : 231 000 km (relevé le 22 sept. 2026)
> · Contrôle technique valable jusqu'au : 23 juin 2028
>
> **Ce que je voudrais savoir :** la date de sa dernière révision · tous les
> combien elle doit être révisée · avez-vous accès au plan d'entretien du
> constructeur · quelles opérations pour cette motorisation · y a-t-il des
> points qui se jouent à l'âge plutôt qu'au kilométrage

Copiable d'un bouton, avec un repli « Pourquoi ces questions ? », le geste
pour enregistrer la réponse au retour, et le retour à la voiture.

**Le renversement**, en une phrase : *ce que Nexora ne sait pas devient ce
qu'il faut demander.* Les trois manques ne sont plus trois reproches, ce sont
trois questions — et leur réponse appartient précisément au garage.

---

## Parcours 2 — Tesla Model 3, programme publié applicable

| | Avant | Après | |
|---|---|---|---|
| Questions obligatoires | 0 | 0 | = |
| Questions posées **en trop** | 2 | **0** | −2 |
| Lien vers le programme depuis l'entretien | non | **oui** | ✔ |

**Le défaut que ce cas a révélé** (trouvé en recette, pas par les tests) :
l'écran annonçait *« Le programme du constructeur est publié pour ce
modèle »*… et ne menait nulle part. Annoncer une aide et la retenir.
Désormais un bouton *« Voir le programme publié pour ce modèle »* passe
devant.

Deux questions ont disparu quand le programme est affiché — « avez-vous accès
au plan d'entretien ? » et « quelles opérations pour cette motorisation ? » :
leur réponse est déjà à l'écran, les poser ferait perdre du temps au comptoir.

---

## Parcours 3 — Volkswagen Golf, informations contradictoires

Deux relevés se contredisent : 120 000 km le 12 septembre, 95 000 km le 13.

| | Avant | Après | |
|---|---|---|---|
| Écrans où la contradiction est visible | 2 (fiche, à prévoir) | **3** | +1 |
| Compteur emporté sans sa réserve | — | **jamais** | ✔ |

Le résumé porte le relevé enregistré **et son doute** :

> Dernier compteur relevé : 95 000 km (relevé le 13 sept. 2026 — **à vérifier :
> deux relevés enregistrés se contredisent**)

Emporter « 95 000 km » chez un garagiste alors que l'application sait que deux
compteurs ne concordent pas, ce serait lui transmettre un chiffre auquel elle
ne croit pas elle-même. Les trois états restent séparés partout : **relevé**
(une mesure), **estimation** (un calcul, jamais dans le texte emporté),
**compteur réellement mesuré**.

---

## Efforts supprimés — mesurés, pas estimés

### 1. Une révision enregistrée n'est plus redemandée

Le défaut le plus net, et il était invisible : le formulaire d'intervalle
recevait la ligne brute du véhicule, **sans son historique**. Il concluait donc
que la dernière révision manquait *toujours* — et contredisait la carte
d'échéance située dix lignes au-dessus, qui lit les mêmes règles avec le
dossier complet.

Sur une Corsa dont la révision du 14 novembre 2025 est enregistrée :

| | Avant | Après |
|---|---|---|
| Manques annoncés | `derniere_intervention`, `intervalle` | `intervalle` |
| Phrase affichée | « Il manque **deux choses** » | « Il manque **une seule chose** » |
| Bloc facture promu | **oui** | non |
| « Nexora sait déjà que votre dernière révision date du… » | **jamais affichée** | affichée |

La phrase censée prouver que Nexora se souvient était du code mort depuis son
écriture.

### 2. « Plus tard » tient vraiment

La clé d'un report portait le motif du manque :
`revision:<id>:a_completer:dernier_entretien_a_renseigner`. Combler une
information sur deux faisait basculer la clé vers `…:intervalle_a_renseigner`,
le report ne correspondait plus, et **la carte reportée revenait dans la
minute**. Idem pour le contrôle technique, dont le motif a trois valeurs.

« Plus tard » porte sur la demande, pas sur la façon dont elle était formulée
ce jour-là. La clé ne porte plus le motif.

*Conséquence à la publication :* les reports déjà enregistrés portent l'ancienne
clé et ne correspondront plus. Chaque rappel concerné réapparaît **une fois**,
et peut être reporté à nouveau — sur une clé qui, cette fois, tiendra.

### 3. Un report est respecté partout

L'écran Services ne recevait pas les reports : un élément mis à « plus tard »
s'y représentait intact, alors que l'accueil et « À prévoir » le respectaient.

### 4. La voiture choisie reste la même

Choisir une autre voiture dans « Ajouter un document » ne la mémorisait pas :
on déposait un document sur la voiture B, et l'accueil rouvrait sur la A.

### 5. « Je ne sais pas » mène quelque part

Cette sortie disait que l'échéance serait calculée « le jour où vous aurez ces
informations », **sans dire comment les obtenir**. Elle mène désormais à la
préparation — exactement ce qu'un garage sait.

### 6. Une situation, une seule phrase

L'accueil et l'écran d'entretien décrivaient la situation avec deux textes
écrits séparément, qui auraient divergé au premier changement. Ils lisent
maintenant la même fonction.

---

## Ce qui n'a pas bougé, et reste vrai

- **La couverture d'entretien est toujours de deux modèles** (Tesla Model 3 et
  Model Y). Rien ici ne crée la donnée qui manque : ces changements rendent le
  parcours utilisable **sans** elle. C'est la décision fournisseur qui tranchera
  (`nexora-auto-dossier-fournisseurs.md`).
- **Aucun diagnostic, aucune pièce, aucun prix, aucun créneau.** Le module ne
  produit que des questions, et un test le vérifie ligne par ligne.
- **Aucun rappel n'est jamais confirmé** pour un véhicule précis.
- **La classe Crit'Air reste une estimation** tant que la norme Euro est
  inconnue.
- **Aucune lecture automatique par la plaque** n'est promise, aucune
  géolocalisation, aucune connexion constructeur, aucun boîtier.

---

## Grille d'observation — cinq testeurs

*À utiliser en observation directe, sans aide. **Aucun contact n'a été pris,
aucune invitation n'a été envoyée.** Cette grille attend une instruction.*

**Consigne unique donnée au testeur**, et rien de plus : *« Votre voiture est
dans l'application. Débrouillez-vous pour savoir ce qu'il faut faire pour son
entretien. »* Puis on se tait.

| # | À observer | Ce qu'on note |
|---|---|---|
| 1 | Où va-t-il en premier depuis l'accueil ? | le libellé exact du premier clic |
| 2 | Combien de temps avant son premier clic ? | secondes |
| 3 | Arrive-t-il à un résultat sans aide ? | oui / non, et où il s'arrête |
| 4 | Comprend-il « aucun programme trouvé dans les sources examinées » ? | sa reformulation, mot pour mot |
| 5 | Voit-il les questions à poser ? les lit-il ? | oui / non |
| 6 | Dirait-il ces questions à un garagiste ? | oui / non / « pas comme ça » |
| 7 | Trouve-t-il le bouton « Copier » ? l'utilise-t-il ? | oui / non |
| 8 | Que croit-il que Nexora sait de sa voiture ? | ses mots |
| 9 | Croit-il qu'un rappel le concerne ? | **verbatim** — le piège à surveiller |
| 10 | Qu'attendait-il qui n'est pas là ? | ses mots |

**Trois choses à ne jamais faire pendant l'observation** : expliquer un écran,
défendre un choix, ou poser une question fermée. Si le testeur demande de
l'aide, noter l'endroit et attendre dix secondes avant de répondre.

**Le signal d'échec le plus important est la ligne 9.** Si un testeur sort en
croyant que sa voiture est rappelée, c'est le défaut le plus grave que ce
produit puisse avoir — plus grave qu'un parcours abandonné.

**Ce que cinq testeurs peuvent établir**, et rien de plus : si le premier clic
tombe au bon endroit, si le vocabulaire passe, et si la ligne 9 se déclenche.
Cinq personnes ne mesurent pas une préférence, ne valident pas une mise en page
et ne disent rien d'un taux.
