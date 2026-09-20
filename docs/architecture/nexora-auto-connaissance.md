# Nexora Auto — ce que l'application sait d'une voiture

*Chantier du 20 septembre 2026. Branche `auto/connaissance-vehicule`, empilée
sur `auto/rappel-ct` (PR #139, toujours en brouillon). Test uniquement.*

---

## 1. Le problème qu'on cherchait à résoudre

Jusqu'ici, Nexora Auto attendait. Elle attendait une facture, une date de
révision, un intervalle recopié du carnet. Tant que la personne n'avait rien
donné, l'application n'avait rien à dire — et le 18 septembre, on avait même
**retiré** les « intervalles courants » parce qu'ils se lisaient comme une
préconisation qu'ils n'étaient pas. La règle posée ce jour-là, dans
`components/auto/format.js`, disait précisément à quelle condition on pourrait
revenir :

> Tant qu'une source identifiable **et** une variante précise de véhicule ne
> sont pas disponibles, Nexora demande l'intervalle plutôt que de le suggérer.

Ce chantier n'a pas contourné cette règle. Il est allé chercher **où** la
condition est remplie, et où elle ne l'est pas.

---

## 2. Ce qu'un automobiliste obtient maintenant, sans rien téléverser

Avec **marque et modèle seulement** :

- **Les campagnes de rappel de sécurité publiées** qui nomment ce modèle,
  chacune avec sa date, la période de fabrication visée, le défaut décrit et
  le lien vers la fiche officielle.

En ajoutant **l'énergie et la date de première mise en circulation** (deux
champs du formulaire, facultatifs, pris sur la carte grise) :

- **La classe Crit'Air**, établie et expliquée ;
- **La date du prochain contrôle technique** (déjà en place avant ce chantier).

Et dans tous les cas :

- **Le programme d'entretien du constructeur est déclaré indisponible**, avec
  la raison. Il n'apparaît pas comme un silence.

Constaté à l'écran le 20 septembre 2026 sur le jeu de recette : une **Toyota
Yaris** dont on ne connaît que la marque et le modèle — pas d'énergie, pas de
date, pas de document — affiche **deux campagnes de rappel officielles**.
C'est la première fois qu'une voiture apporte quelque chose à son propriétaire
avant que lui n'ait rien apporté.

---

## 3. Les sources, et ce qu'elles autorisent

Trois sources sont entrées dans le produit. Chacune est déclarée dans
`lib/auto/connaissance/sources.js` avec son éditeur, son adresse, sa version et
**la date de sa dernière relecture humaine**.

| Source | Ce qu'elle donne | Régime |
|---|---|---|
| Arrêté du 21 juin 2016, annexe I (Légifrance) | La nomenclature Crit'Air des voitures | Texte réglementaire, transcrit avec sa référence |
| RappelConso V2 (DGCCRF, data.economie.gouv.fr) | Les fiches de rappel publiées | **Licence Ouverte v2.0** — réutilisation autorisée avec mention de la source |
| service-public.gouv.fr, fiche F2878 | Les règles du contrôle technique | Texte officiel cité ; les règles étaient déjà en place, elles ont été **relues** le 20 septembre |

RappelConso est la seule dont les **données** transitent réellement par
Nexora ; sa licence le permet, et la mention « Source : RappelConso, DGCCRF —
Licence Ouverte v2.0 » s'affiche sous la section. Les deux autres sont
**citées**, pas republiées : on en tire une règle, on ne recopie pas le
document.

Une source non relue depuis plus d'un an cesse d'affirmer quoi que ce soit :
la connaissance passe à l'état « source à relire » et l'écran se tait. C'est
testé (`moteur.test.js`), pas seulement promis.

---

## 4. Décision fournisseur : personne, aujourd'hui

Les quatre fournisseurs cités dans le cadrage ont été examinés le 20 septembre
2026 sur leurs pages publiques. **Aucun n'est utilisable sans contrat, sans
création de compte, ou sans dépense.** Rien n'a été souscrit, personne n'a été
contacté.

| Fournisseur | Ce qu'il rendrait | Tarif publié | Utilisable aujourd'hui |
|---|---|---|---|
| autobizVIN | VIN → caractéristiques, finition, équipements | non publié — devis | Non : aucune API publiée, formulaire de contact |
| autobiz API Match | VIN / plaque → marque, modèle, version | Essai « Free » 50 appels/jour ; payant « Custom » | Non : essai conditionné à un compte |
| Auto Ways | Plaque / VIN → 100+ champs, correspondance TecDoc | **49 €/mois TTC** (400 requêtes) → **1 399 €/mois TTC** (100 000) ; 20 crédits d'essai | Non sans compte — seul fournisseur entièrement chiffrable sans contact |
| TecRMI (TecAlliance) | Plan d'entretien constructeur | non publié — devis | Non : contrat, clé VIN sur demande écrite |
| HaynesPro | Plans d'entretien OEM, temps de réparation | non publié — devis | Non : démo sur demande |

**Deux constats qui changent l'architecture, pas seulement le budget :**

1. **Le trou d'identification côté TecRMI est structurel.** Son énumération
   `kindOfNationalVehicleNo` est publiée et fermée sur l'Allemagne et la
   Suisse. Quel que soit le contrat signé, une **plaque française n'entre pas**
   dans leur arbre véhicule : il faudrait leur service VIN séparé, ou un
   identifieur tiers rendant un `typeId` TecDoc.
2. **Aucun des cinq ne publie quoi que ce soit sur l'affichage grand public,
   le cache ou la redistribution.** Tous ciblent des professionnels. C'est le
   risque juridique n° 1 d'une application B2C, et il devra être levé **par
   écrit** avant tout affichage — avant même de parler de prix.

À noter pour la conception : la séquence d'appels publiée par TecRMI impose une
**étape de variante obligatoire** (`BodiesForMaintenance` → `bodyQualColId`),
paramètre requis de tous les appels d'entretien. Aucun chemin ne la contourne.
Autrement dit, le métier lui-même confirme qu'un programme d'entretien sans
variante précise n'existe pas.

---

## 5. Le programme d'entretien : bloqué, et on dit pourquoi

Les trois constructeurs les plus probables du parc de bêta ont été examinés sur
leurs portails publics, sans identifiant :

- **Renault Clio V** et **Dacia Sandero 3** : les notices sont publiques, par
  modèle et par période d'édition, sans VIN ni connexion. Mais la périodicité
  n'y est pas. Le manuel renvoie, séparément pour l'essence et le Diesel, au
  « document d'entretien du véhicule » — c'est-à-dire au carnet papier.
- **Peugeot 208 II** : le guide public existe (`public.servicebox-parts.com`),
  et ne contient **aucun chapitre « plan d'entretien »**. Le seul outil Peugeot
  qui l'afficherait demande l'immatriculation ou le numéro de série.
- Les pages de marque donnent bien des chiffres — Renault « essence tous les
  10 000 km, diesel tous les 15 000 km », Dacia « tous les ans ou chaque
  20 000 km » — mais **annoncés pour la marque entière**, sans distinction de
  motorisation. C'est exactement l'approximation retirée le 18 septembre.
- Les conditions d'utilisation de Renault, Dacia et Peugeot interdisent la
  reproduction de leurs contenus.

**Conclusion, écrite dans le code** : `PROGRAMMES` est vide et le restera tant
qu'une source ne sera pas à la fois citable et autorisée. Le chemin existe et
est testé — une entrée de programme se rattache à une variante et porte sa clé
de source — mais y ajouter une ligne sera une décision documentée, pas une
amélioration discrète.

À l'écran, cela donne une carte qui dit : *« Nexora n'a pas le programme du
constructeur pour cette version. L'intervalle se lit sur votre carnet
d'entretien. »* Et, si la personne a déjà renseigné son intervalle : *« votre
suivi repose sur l'intervalle que vous avez renseigné »*.

---

## 6. Le moteur

`lib/auto/connaissance/` — modules purs, 29 tests.

| Fichier | Rôle |
|---|---|
| `sources.js` | Le registre des sources et leur péremption |
| `critair.js` | L'annexe I transcrite, et le classement |
| `campagnes.js` | L'appariement d'une fiche officielle à une voiture |
| `campagnes-serveur.js` | La lecture de la base officielle (serveur) |
| `moteur.js` | Règles + faits → connaissances, avec leurs états |

**Six états, et « je ne sais pas » en est un :** `applicable`, `a_verifier`,
`donnees_insuffisantes`, `non_applicable`, `indisponible`, `source_a_relire`.

Le moteur **ne calcule aucune échéance** : c'est déjà le travail de
`lib/auto/echeances.js` et `components/auto/aPrevoir.js`. Il répond à la
question d'avant — *qu'est-ce qui s'applique à cette voiture, d'après quelle
source, et qu'est-ce qui manque pour le dire ?*

### Ce que le moteur refuse de faire

- Il n'affirme jamais qu'une campagne concerne **votre** voiture. La phrase est
  toujours conditionnelle, et un test échoue si elle cesse de l'être.
- Il ne présente jamais une absence comme une garantie : *« Nexora ne lit que
  les fiches publiées sur RappelConso. Une absence n'est pas une garantie. »*
- Une base injoignable donne *« Rien n'est affirmé sur cette voiture »*, et non
  *« aucune campagne »*. Les deux ne se ressemblent pas.
- Aucune huile, aucune pression, aucun intervalle, aucune distribution n'est
  déduit d'un nom de modèle. Un test le vérifie littéralement.

### Quatre précautions nées des données réelles

1. **« 208 » ne doit pas attraper « 2008 ».** Le modèle est cherché comme un
   mot entier. En revanche « 208 v2 » **est** une 208 : les fiches numérotent
   les générations, et ce marqueur est reconnu.
2. **« C3 » trouve « C3 Aircross ».** Impossible à éviter — le champ est du
   texte libre. La fiche est donc affichée avec **son propre libellé de
   modèle**, et signalée « plusieurs modèles ».
3. **Un libellé de voiture n'est pas un nom de catalogue.** Les gens écrivent
   « 208 (essai) », « Clio IV », « C3 Picasso ». Les fiches officielles
   écrivent « 208 v2 » ou « clio ». Chercher le libellé entier ne trouverait
   rien, et Nexora conclurait à tort « aucune campagne ». On cherche donc du
   plus précis au plus large — le libellé nettoyé de ses parenthèses, puis son
   premier mot — et **l'écran dit toujours quand la recherche a été élargie**.
4. **La période publiée est une période de fabrication, pas
   d'immatriculation.** Une voiture faite en décembre s'immatricule en janvier.
   La fenêtre est donc élargie de douze mois par la fin, jamais par le début —
   et une fiche hors période est **écartée de la liste principale, pas
   supprimée**.

### Une question posée seulement quand elle change la réponse

L'arrêté range les hybrides non rechargeables selon leur carburant : essence
d'un côté, gazole de l'autre, et la classe n'est pas la même. Plutôt que
d'ajouter un champ au formulaire, l'écran affiche **les deux issues** — « Si
essence : Crit'Air 1 / Si gazole : Crit'Air 2 ». La personne reconnaît la
sienne d'un coup d'œil, et Nexora n'a toujours rien affirmé.

---

## 7. Ce qui a changé à l'écran

- **Fiche véhicule** : une section « Ce que Nexora sait de cette voiture »,
  après les échéances. Trois cartes au plus, chacune avec son état, sa source
  dépliable et ses limites. Au plus trois campagnes visibles ; le reste est à
  un clic.
- **Accueil** : **une seule ligne**, et seulement s'il y a vraiment quelque
  chose. Elle ne prend jamais la place de l'action principale, réservée à ce
  qui a une date. Pendant la recherche, en cas de panne de la base, ou quand
  rien ne concerne la voiture, cette ligne n'existe pas.
- **Formulaire d'ajout** : la **date de première mise en circulation** est
  sortie du repli « calculer les échéances ». C'est devenu le champ facultatif
  qui débloque le plus de réponses d'un coup — le contrôle technique **et** la
  classe Crit'Air — et l'aide le dit. Aucun champ n'a été ajouté.

---

## 8. Ce qui n'a pas changé, volontairement

- **Aucune migration, aucune table, aucune colonne.** La connaissance publique
  n'est pas une donnée personnelle : elle vit dans le code, versionnée,
  relisible en revue, sans RLS ni droits à redéclarer. Une colonne `variante`
  aurait été du schéma pour rien tant qu'aucun programme n'a de source.
- **Aucune refonte.** Les quatre entrées restent Aujourd'hui, Mon garage,
  Services, Compte. Les cartes d'échéances n'ont pas bougé.
- **Aucun secret, aucune dépense, aucune écriture externe.**

---

## 9. Vie privée

Ce qui part de Nexora vers la base officielle : **un nom de marque**. Rien
d'autre. Ni plaque, ni numéro de série, ni adresse, ni identifiant de compte,
ni date personnelle.

L'appel passe par **le serveur** alors que la base publique accepterait un
appel direct depuis le navigateur. C'est délibéré : sinon l'adresse IP de la
personne partirait chez un tiers au moment où elle consulte sa propre voiture.
Le filtrage par modèle se fait côté serveur pour ne pas faire voyager 150
fiches jusqu'à un téléphone, et la date de mise en circulation ne quitte jamais
le navigateur — c'est lui qui situe la voiture dans la période.

Cette lecture n'est pas une « intégration sortante » au sens de
`lib/integrations.js` : aucun secret, aucun envoi, aucune dépense, aucune
écriture. Elle reste donc active en prévisualisation — sinon la page serait
invérifiable là, précisément, où on la recette. L'exception est **déclarée dans
le garde-fou** (`lib/integrations.test.js`) : tout autre fichier qui
atteindrait cette adresse ferait échouer le test.

---

## 10. Recette

**Automatique** — 329 tests au vert, dont 29 nouveaux. Les cas de référence de
Crit'Air ne rejouent pas la formule : ce sont les **dates charnières lues dans
l'annexe I** avec la classe attendue. Un test balaie tous les mois de 1990 à
2026 pour vérifier qu'aucune période ne se chevauche ni ne laisse de trou. Les
fiches de test d'appariement sont **recopiées des données réelles**, avec leurs
formats bizarres (tiret long, jour sur un chiffre, plusieurs lignes).

**Au navigateur**, sur le jeu de recette (Test, comptes en `.invalid`, aucun
e-mail) :

| Cas | Voiture du jeu | Résultat constaté |
|---|---|---|
| Marque et modèle seuls | Toyota Yaris | 2 campagnes réelles ; Crit'Air « à compléter » avec les deux manques et leurs gestes |
| Dossier complet | Citroën C3 2016 essence | Crit'Air 1 ; 10 campagnes retenues, 10 écartées hors période ; « plusieurs modèles » signalé |
| Diesel plus ancien | Opel Corsa 2014 diesel | Crit'Air 2 — conforme au tableau |
| Sans date de mise en circulation | VW Golf 2018 diesel | Crit'Air « à compléter » ; la même date est demandée par le contrôle technique, et le pourquoi le dit |
| Base indisponible | — | Couvert par test : « Rien n'est affirmé », le reste de la page continue |
| Mobile 375 px | Citroën C3 | Lisible, pas de débordement, trois campagnes visibles |

---

## 11. Ce qui reste ouvert

1. **Le programme d'entretien personnalisé** reste bloqué faute de source
   autorisée. Le débloquer suppose un contrat *et* un droit d'affichage grand
   public obtenu par écrit. Rien ne presse : le carnet de la personne fait foi,
   et Nexora sait déjà s'en servir.
2. **L'identification par plaque** reste absente, pour la même raison. La
   sélection marque/modèle n'est pas un repli honteux : elle suffit aux
   campagnes de rappel, qui sont la valeur immédiate.
3. **L'hébergement du programmateur de rappels** (voir
   `nexora-auto-rappel-ct.md`, §8) reste la décision qui bloque une
   proactivité réelle. Elle est indépendante de ce chantier.
