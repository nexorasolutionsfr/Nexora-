# Élargir la couverture d'entretien — demande fournisseur, prête à envoyer

*Préparée le 20 septembre 2026. **Rien n'a été envoyé, personne n'a été
contacté, aucune formule n'a été souscrite.** Ce document attend une
instruction d'envoi.*

---

## 1. Pourquoi cette demande, et pourquoi maintenant

La couverture d'entretien de Nexora Auto est aujourd'hui de **deux modèles**
(Tesla Model 3 et Model Y), parce que ce sont les seuls pour lesquels un
constructeur publie ses intervalles sur une page librement accessible. La
chaîne fonctionne — source → modèle → programme affichable — mais elle n'a que
deux entrées.

Les cinq fournisseurs professionnels examinés le 20 septembre 2026 ne publient
**aucune condition d'affichage grand public**. Ce n'est pas un refus : c'est
une information absente de leurs pages. Elle s'obtient en une demande écrite,
et c'est la seule question qui bloque vraiment — avant le prix, avant la
couverture.

**Ce qu'on cherche à savoir n'est pas « combien ça coûte ».** C'est :
avons-nous le droit d'afficher ces préconisations à un particulier, et d'en
dériver des rappels ? Si la réponse est non, le prix n'a aucune importance.

## 2. À qui

**TecRMI (TecAlliance)** en premier : c'est le seul des cinq dont la chaîne
technique jusqu'au plan d'entretien soit documentée publiquement, et deux
intégrateurs de leur réseau ont leur siège en France.

Contact officiel : <https://www.tecalliance.net/fr/contact-tecrmi/>

**HaynesPro** ensuite, ou directement l'un des intégrateurs français, si la
réponse directe ne convient pas au volume d'un pilote. La question est la
même : la fiche du §4 se remplit à l'identique pour chacun.

## 3. Le texte de la demande

> Bonjour,
>
> Je développe Nexora, une application web destinée aux propriétaires de
> voitures en France, actuellement en phase pilote.
>
> Nous souhaitons identifier précisément un véhicule, présenter son programme
> d'entretien applicable et calculer des rappels à partir des informations
> disponibles. L'accès de base serait gratuit pour l'automobiliste.
>
> Pourriez-vous préciser :
>
> - Votre couverture du parc français et le niveau d'identification requis :
>   modèle, motorisation, année, VIN ou immatriculation.
> - La possibilité contractuelle d'afficher des préconisations aux particuliers
>   et de produire des rappels dérivés.
> - Les droits de stockage, de mise en cache et de conservation, ainsi que les
>   obligations d'attribution et de mise à jour.
> - Les modalités techniques : API, environnement d'essai et exemples de
>   réponses.
> - Les coûts fixes, minimums contractuels et coûts variables pour un pilote de
>   100 véhicules, puis 1 000 véhicules.
> - L'existence d'une formule d'évaluation sans engagement ou adaptée à un
>   projet en démarrage.
>
> Nous distinguons bien le programme constructeur de l'historique réellement
> connu : notre application ne présenterait pas une intervention comme
> réalisée sans information correspondante.
>
> Si votre offre directe ne convient pas à ce volume ou à cet usage,
> pourriez-vous nous orienter vers un intégrateur disposant d'une licence
> appropriée ?
>
> Merci,
> Baptiste
> Nexora

La demande couvre d'un seul tenant les quatre dimensions — **faisabilité
technique, licence, coût, pilote** — parce que les séparer ferait quatre
échanges là où un seul suffit.

## 4. Fiche de comparaison, à remplir avec les réponses

Une colonne par fournisseur. Les lignes en gras sont éliminatoires : une
réponse négative sur l'une d'elles clôt le sujet, quel que soit le reste.

| Question | TecRMI | HaynesPro | Intégrateur |
|---|---|---|---|
| **Affichage des préconisations à un particulier : autorisé ?** | | | |
| **Rappels dérivés (dates calculées à partir des intervalles) : autorisés ?** | | | |
| Couverture du parc français, chiffrée | | | |
| Identification exigée : modèle / motorisation / année / VIN / plaque | | | |
| Une plaque française suffit-elle à atteindre le plan d'entretien ? | | | |
| Étape de variante : comment la résoudre sans intervention humaine ? | | | |
| Stockage et mise en cache : durée autorisée | | | |
| Attribution obligatoire : formulation exacte | | | |
| Fraîcheur : délai de mise à jour garanti | | | |
| Environnement d'essai : existe-t-il, à quelles conditions ? | | | |
| Coût fixe mensuel ou annuel | | | |
| Minimum contractuel et durée d'engagement | | | |
| Coût variable : 100 véhicules actifs / mois | | | |
| Coût variable : 1 000 véhicules actifs / mois | | | |
| Formule d'évaluation sans engagement | | | |
| Conditions de sortie | | | |

**Ce que la réponse doit permettre de décider**, et rien de plus : est-ce que
l'élargissement de la couverture est finançable et licite ? Si oui, à quel
seuil de véhicules actifs le coût devient-il supportable ? Si non, Nexora
continue avec les sources publiques et le carnet de la personne — ce qui
fonctionne déjà, en plus étroit.

## 5. Ce que Nexora s'engage à faire des données, quoi qu'il arrive

Ces trois règles sont déjà tenues par le code, et elles figurent dans la
demande parce qu'elles rassurent sur l'usage :

1. **Le programme du constructeur et l'historique réellement connu ne sont
   jamais confondus.** Un intervalle publié dit « tous les 2 ans » ; il ne dit
   pas « le 4 mars prochain ». Sans la date de la dernière opération, aucune
   échéance n'est affichée.
2. **Aucune intervention n'est présentée comme réalisée** sans une information
   correspondante — saisie par la personne, ou lue sur un document qu'elle a
   fourni.
3. **Chaque affirmation porte sa source**, sa version et la date de sa
   dernière relecture humaine. Passé un an sans relecture, l'affirmation
   s'efface au lieu de vieillir en silence.
