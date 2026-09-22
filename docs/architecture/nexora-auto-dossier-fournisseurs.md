# Dossier de décision — élargir la couverture d'entretien

*Constitué le 22 septembre 2026. **Rien n'a été envoyé, personne n'a été
contacté, aucun devis n'a été demandé, aucune formule souscrite.** Ce dossier
sert à décider ; la lettre elle-même est ailleurs et reste en attente d'une
instruction d'envoi : `nexora-auto-demande-donnees.md`.*

Ce document ne refait pas le comparatif de marché du 20 septembre, qui vit dans
`nexora-auto-connaissance.md` §4. Il retient trois fournisseurs, vérifie leur
destination de contact, et range ce qu'on sait de chacun sous les seules
rubriques qui décident.

---

## 1. Deux besoins qu'il ne faut jamais confondre

Le comparatif précédent achoppait parce qu'il mêlait deux questions. Elles se
posent séparément, se paient séparément, et l'une sans l'autre ne change rien à
l'écran.

**Besoin A — identifier.** Partir de ce que la personne peut taper (une plaque,
ou marque + modèle + année) et arriver à **une variante technique unique**.
Sans cette étape, aucun plan d'entretien ne peut être attaché à la bonne
voiture : une Corsa 1.3 CDTI et une Corsa 1.4 essence de la même année n'ont
pas le même plan.

**Besoin B — obtenir le programme, et avoir le droit de l'afficher.** Partir de
cette variante et obtenir les opérations et leurs intervalles, **plus la
licence de les montrer à un particulier** et d'en dériver des échéances.

| | A seul | B seul | A + B |
|---|---|---|---|
| Ce que ça donne | Nexora nomme mieux la voiture | Des plans qu'on ne sait pas rattacher | La Corsa obtient enfin son programme |
| Ce que ça change à l'écran | presque rien | rien | tout |

**Seul A + B justifie une dépense.** Un fournisseur qui n'a que A est un
confort ; un fournisseur qui n'a que B est inutilisable.

---

## 2. TecRMI (TecAlliance)

**Destination de contact officielle vérifiée.**
`https://www.tecalliance.net/fr/contact` — formulaire général.
⚠️ L'adresse `/fr/contact-tecrmi/` **redirige** vers cette page : il n'existe
pas de guichet TecRMI distinct. Entité française réelle : **TecAlliance France
SAS, 1 bd Malesherbes, 75008 Paris** (aucun téléphone publié pour la France,
seulement le formulaire).

**Identification du véhicule proposée.** Par sélection : `MakeList` →
`RangeList` → `TypeList` → `type id`, puis une **étape de variante
obligatoire** (`BodiesForMaintenance` rend un `bodyQualColId` exigé par tous
les appels d'entretien). Aucun chemin ne la contourne. Un « Vin filter » existe
comme clé de filtre, **pas comme décodeur** ; le service VIN est séparé et
s'obtient sur demande. Pas de plaque documentée en direct.

**Données d'entretien disponibles.** Oui, et c'est le seul dont la chaîne est
documentée publiquement jusqu'au bout : `VehicleHasMaintenance` →
`BodiesForMaintenance` → `MaintenancePlanData`.

**Licence d'affichage aux particuliers.** **À confirmer.** Rien de publié.
TecAlliance présente des intégrations pour le commerce en ligne et les places
de marché, ce qui rend la question ouverte — pas résolue.

**Droit de calculer des échéances et de conserver les résultats.** **Inconnu.**
Aucune mention de cache, de durée de conservation ni d'œuvre dérivée.

**Coût.** Non publié — devis.

**Pilote.** Non annoncé. À demander.

**Questions encore sans réponse.** (1) Couverture chiffrée du parc français,
et notamment des modèles d'avant 2010. (2) Comment résoudre l'étape de variante
**sans intervention humaine**, à partir de ce qu'un particulier sait de sa
voiture. (3) Licence B2C. (4) Droit de cache et d'échéance dérivée. (5) Prix.

---

## 3. HaynesPro (Infopro Digital Automotive)

**Destination de contact officielle vérifiée.**
`https://www.infopro-digital-automotive.com/form-get-a-demo/` — formulaire de
démonstration. C'est le seul chemin proposé : aucune tarification, aucun essai
en libre-service.

**Identification du véhicule proposée.** **Non publiée.** La page produit ne
mentionne ni VIN, ni plaque, ni immatriculation, ni méthode d'identification.
C'est une lacune de la documentation publique, pas un refus — mais on ne peut
rien en conclure aujourd'hui.

**Données d'entretien disponibles.** Oui, annoncées comme OEM : entretien,
méthodes de réparation, temps de main-d'œuvre, schémas, gestion des défauts,
**base véhicules électriques incluse**, données hybrides et EV explicitement
citées. Couverture annoncée **de façon contradictoire sur la même page** :
« 80 marques » dans un encart, « 127 marques couvertes » dans un autre, et
« 99 % des véhicules européens en circulation ». À faire préciser.

**Licence d'affichage aux particuliers.** **À confirmer**, et le public visé
est explicitement professionnel : réseaux d'ateliers, distributeurs de pièces,
constructeurs, gestionnaires de flotte, fabricants d'outils de diagnostic.
Un point mérite d'être posé en clair : le palier « portail à portail » prévoit
qu'**un utilisateur final connecté à votre application** accède aux versions en
ligne de HaynesPro par authentification unique. C'est le seul énoncé public
proche d'un usage grand public — mais il décrit un accès à l'interface de
HaynesPro, pas un droit d'afficher leurs données dans la nôtre.

**Droit de calculer des échéances et de conserver les résultats.** **Inconnu.**
Trois modes de livraison sont publiés (portail à portail, services web,
solution autonome) ; aucun ne précise les droits dérivés.

**Coût.** Non publié — devis après démonstration.

**Pilote.** Une démonstration est le point d'entrée annoncé. Pilote chiffré :
à demander.

**Questions encore sans réponse.** (1) Par quoi identifie-t-on un véhicule ?
(2) Laquelle des trois couvertures annoncées est la bonne. (3) Le palier
« services web » autorise-t-il l'affichage dans notre propre interface, à un
particulier ? (4) Droit de cache et d'échéance dérivée. (5) Prix.

---

## 4. Albalogic (intégrateur français TecAlliance)

**Destination de contact officielle vérifiée.**
`https://albalogic.fr/contact/` — page de contact, et **téléphone publié :
01 83 64 68 58, du lundi au vendredi 9 h – 18 h**. C'est le seul des trois à
publier une ligne directe.
⚠️ Les boutons « Demander un devis » de leur propre page pointent vers
`https://www.uat.albalogic.fr/contact/` — un sous-domaine de recette laissé en
production. Utiliser l'adresse canonique.

**Identification du véhicule proposée.** **Par plaque d'immatriculation ET par
VIN, pour la France et l'Europe**, service annoncé comme nativement intégré à
leurs solutions. C'est le seul des trois à publier explicitement
l'identification par plaque française. **Répond au besoin A.**

**Données d'entretien disponibles.** Oui, **par TecRMI** : « données techniques
constructeur (réparations, maintenance, diagnostics), conformes aux standards
OEM en matière de maintenance ». Plus le catalogue TecDoc (pièces) et TecCom
(stocks et prix fournisseurs), dont Nexora n'a pas besoin aujourd'hui.
Partenariat TecAlliance annoncé depuis plus de 15 ans.

**Licence d'affichage aux particuliers.** **À confirmer**, mais c'est ici que
l'énoncé public va le plus loin : « vous pouvez proposer à **vos utilisateurs
finaux** ou à vos clients un accès rapide et précis aux pièces compatibles,
aux **données techniques constructeur** », et « tout en gardant la maîtrise de
votre propre interface et de votre parcours utilisateur (brandé, personnalisé,
intégré à vos processus) ». Un affichage en marque blanche dans notre interface
est donc un mode envisagé. Reste à savoir si « utilisateurs finaux » couvre un
particulier ou seulement l'acheteur professionnel d'un distributeur.

**Droit de calculer des échéances et de conserver les résultats.** **Inconnu**,
et vraisemblablement adossé au contrat TecAlliance sous-jacent. À poser
frontalement : une licence d'intégrateur ne se sous-licencie pas d'office.

**Coût.** Non publié — devis. Public visé : distributeurs, garages,
e-commerçants, professionnels de la pièce et de la réparation.

**Pilote.** Non annoncé, mais c'est le seul interlocuteur joignable par
téléphone, ce qui rend une question de cadrage peu coûteuse.

**Questions encore sans réponse.** (1) « Utilisateurs finaux » inclut-il un
particulier propriétaire ? (2) Le service plaque couvre-t-il une Corsa de
2007 ? (3) La licence TecRMI qu'ils détiennent autorise-t-elle la
sous-licence d'affichage B2C ? (4) Droit de cache et d'échéance. (5) Prix.

---

## 5. Ce que le dossier fait apparaître

**Albalogic est le seul à répondre publiquement au besoin A**, pour la France,
par plaque *et* par VIN. Et il porte TecRMI, c'est-à-dire le besoin B.
C'est donc le seul des trois chez qui A et B sont annoncés au même endroit —
et le seul joignable autrement que par un formulaire.

**Le blocage reste identique pour les trois, et il n'est pas le prix.** Aucun
ne publie un mot sur le droit d'afficher ces données à un particulier, ni sur
le droit d'en dériver une échéance et de la conserver. Ce sont les deux seules
questions éliminatoires : une réponse négative clôt le sujet quel que soit le
reste.

**Ordre de contact suggéré** : Albalogic d'abord (téléphone, France, A + B),
TecAlliance ensuite si la sous-licence B2C est refusée à l'intégrateur,
HaynesPro en troisième — leur documentation publique ne dit rien de
l'identification, donc l'échange partirait de plus loin.

---

## 6. Grille d'évaluation — les cas à faire trancher

Six voitures, décrites **uniquement par des caractéristiques publiques**.
Aucune plaque, aucun VIN, aucune donnée personnelle ne figure ici ni ne doit
figurer dans un échange fournisseur. La question posée n'est jamais « que
savez-vous de cette voiture-là ? » mais « que rendez-vous pour une voiture
**de ce type** ? ».

| # | Voiture | Énergie | Pourquoi ce cas |
|---|---|---|---|
| **1** | **Opel Corsa D 1.3 CDTI, 2007** | diesel | **Cas prioritaire.** La voiture réelle qui n'obtient rien aujourd'hui. Teste l'ancienneté : un modèle de 19 ans est-il encore couvert ? |
| 2 | Renault Clio IV 1.5 dCi, 2015 | diesel | Le diesel français le plus courant du parc. Teste la couverture de masse. |
| 3 | Peugeot 208 1.2 PureTech, 2021 | essence | Motorisation à variantes nombreuses. Teste la résolution de variante sans intervention humaine. |
| 4 | Toyota Yaris Hybride 1.5, 2019 | hybride non rechargeable | L'entretien d'une hybride ne suit pas celui d'un thermique. Teste si le plan en tient compte. |
| 5 | Renault Zoe R110, 2020 | électrique | Plan d'entretien très différent (pas de vidange, freins peu sollicités). Teste la base EV. |
| 6 | Tesla Model 3, 2022 | électrique | **Témoin.** Nexora la couvre déjà gratuitement par la page publique Tesla. Mesure ce qu'un fournisseur payant ajoute — s'il n'ajoute rien ici, c'est un signal. |

### Ce que chaque fournisseur doit démontrer, cas par cas

Pour chacune des six, quatre réponses, et elles se lisent dans cet ordre :

| Question | Ce qu'une réponse acceptable contient |
|---|---|
| **A1. Identification** | À partir de quoi ? Une plaque française suffit-elle ? Sinon, quels champs exactement ? |
| **A2. Variante** | Combien de variantes restent après identification, et comment l'ambiguïté se résout **sans qu'un humain choisisse** ? |
| **B1. Programme** | Les opérations et leurs intervalles sont-ils rendus ? Un exemple de réponse réelle pour ce type de voiture. |
| **B2. Droits** | Affichage à un particulier : oui / non. Échéance dérivée : oui / non. Conservation : combien de temps. |

**Une réponse « non » sur B2 clôt le dossier pour ce fournisseur**, quels que
soient A1, A2 et B1. C'est pourquoi B2 se pose dès la première lettre, et pas
après la démonstration.

### Ce qu'on fera des réponses

- **Si un fournisseur répond oui à B2 et couvre le cas 1** — la Corsa obtient
  son programme. On chiffre le pilote et on décide sur le prix.
- **Si B2 est oui mais le cas 1 non couvert** — on sait que l'élargissement
  sert le parc récent, pas le parc ancien. Décision différente : elle se prend
  sur les cas 2 à 5, et la Corsa reste sur le carnet de son propriétaire.
- **Si B2 est non partout** — Nexora continue avec les sources publiques et le
  carnet de la personne. Ce qui fonctionne déjà, en plus étroit. Le parcours du
  lot 2 est construit pour que ce cas reste utilisable.

---

## 7. L'interface côté code — ce qui existe déjà, et rien de plus

**Aucun système générique n'a été construit, et il ne faut pas en construire.**
La couture existe déjà et elle est minimale :

```js
// lib/auto/connaissance/moteur.js
programmePour(vehicule, programmes = PROGRAMMES)
```

Un seul point de recherche, une table injectable. Le jour où une source
autorisée arrive, elle remplit cette table — elle ne remplace pas le moteur.

Ce qu'un fournisseur devra livrer, c'est donc exactement la forme d'une entrée
de `PROGRAMMES`, et rien d'autre :

| Champ | Ce qu'il contient | Obligatoire |
|---|---|---|
| `cle` | identifiant stable de l'entrée | oui |
| `correspond` | `{ marque, modeles: [...] }` — comment l'entrée s'apparie | oui |
| `source` | clé dans `sources.js`, avec éditeur, URL, licence, **date de relecture humaine** | oui |
| `portee` | ce que l'entrée couvre, et ce qu'elle ne couvre pas | oui |
| `operations[]` | `{ libelle, intervalle: {mois?, km?}, depuis, besoin[], condition? }` | oui |
| `operations[].depuis` | le point de départ **propre à cette opération** | oui |
| `operations[].condition` | `{ nature: "frequence" \| "applicabilite", texte }` | non |
| `reserves[]` | ce que la source elle-même met en garde | non |

Un test de contrat (`moteur.test.js`) vérifie cette forme sur toutes les
entrées : une entrée mal formée échoue au lieu de s'afficher de travers. C'est
la seule chose ajoutée au code au titre de ce lot, et elle sert dès aujourd'hui.

**Ce qui n'est pas fait, volontairement** : pas d'abstraction « fournisseur »,
pas d'adaptateur, pas de configuration. Tant qu'il n'existe qu'une source
autorisée, une deuxième couche ne servirait qu'à deviner ce que la première
demandera.

---

## 8. Les messages

Le corps de la demande est écrit et ne bouge pas :
`nexora-auto-demande-donnees.md` §3. Ce dossier ajoute seulement, par
destinataire, **où l'envoyer** et **quelles questions y accrocher** :

| Destinataire | Destination vérifiée | À ajouter au corps commun |
|---|---|---|
| Albalogic | `https://albalogic.fr/contact/` · 01 83 64 68 58 | « Utilisateurs finaux » inclut-il un particulier ? Votre licence TecRMI permet-elle la sous-licence d'affichage ? Le service plaque couvre-t-il un véhicule de 2007 ? |
| TecAlliance / TecRMI | `https://www.tecalliance.net/fr/contact` | Résolution de la variante sans intervention humaine ; couverture chiffrée du parc français ancien ; VIN pour la France |
| HaynesPro | `https://www.infopro-digital-automotive.com/form-get-a-demo/` | Par quoi identifie-t-on un véhicule ? 80, 127 ou 99 % — laquelle ? Le palier « services web » autorise-t-il l'affichage dans notre interface ? |

**Aucun de ces messages n'a été envoyé.** Ils attendent une instruction
d'envoi explicite, destinataire par destinataire.
