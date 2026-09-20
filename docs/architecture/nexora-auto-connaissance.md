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

Et pour l'entretien, selon ce que le constructeur publie vraiment :

- **Un programme** (Tesla Model 3 et Model Y) : les opérations et leurs
  intervalles, avec leurs conditions ;
- **un repère de marque** (Volkswagen), annoncé comme tel, sans échéance ;
- **ou rien**, et la carte dit alors quelle barrière a été rencontrée.

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

## 4. Décision fournisseur — ce qui est confirmé, ce qui ne l'est pas

*Corrigé le 20 septembre 2026, après une relecture demandée par Baptiste. La
version précédente de ce document concluait « TecRMI n'a aucune entrée
française, aucun contrat n'y change rien ». **Cette conclusion était fausse**,
et pour une raison qu'il faut nommer : elle confondait la liste des codes
d'immatriculation nationaux acceptés par UN point d'entrée avec la couverture
des données d'entretien elles-mêmes. Ce sont deux choses différentes.*

Quatre questions se posent séparément, et les mélanger produit exactement
l'erreur qu'on vient de corriger :

1. **Par quoi identifie-t-on un véhicule ?** (code national, VIN, ou sélection
   marque/modèle/type)
2. **Quelle est la couverture technique** des données pour le marché français ?
3. **Quel est le coût** ?
4. **A-t-on le droit d'afficher ces données à un particulier ?**

### Ce qui est CONFIRMÉ

| Point | Ce que les pages publiques établissent |
|---|---|
| Identification TecRMI par marque/modèle/type | La séquence `MakeList` → `RangeList` → `TypeList` → `type id` est documentée, et de là toute la chaîne d'entretien (`VehicleHasMaintenance` → `BodiesForMaintenance` → `MaintenancePlanData`). |
| Étape de variante obligatoire | `BodiesForMaintenance` rend un `bodyQualColId` requis par tous les appels d'entretien. Aucun chemin ne la contourne. |
| Intégrateurs TecRMI en France | La liste officielle des partenaires TecAlliance montre **deux intégrateurs dont le siège est en France** et qui portent TecRMI (Albalogic SAS, statut GOLD ; Autopartspro, Silver), plus deux autres déclarant la France en région active. |
| Grille tarifaire Auto Ways | Publiée intégralement : 49 €/mois TTC (400 requêtes) → 1 399 €/mois (100 000), 20 crédits d'essai. |

### Ce qui n'est PAS VÉRIFIÉ

- **La couverture géographique des données d'entretien TecRMI.** Ni la doc
  REST ni la page partenaires n'en disent un mot. Le dépliant produit qui
  l'aurait portée **renvoie une erreur 404** : rien n'a pu en être lu.
- **L'identification par VIN chez TecRMI.** La doc REST mentionne un « Vin
  filter » comme clé de filtre, pas un décodeur. Un service VIN séparé existe,
  mais son accès s'obtient sur demande écrite.
- **Les tarifs** d'autobiz, TecRMI et HaynesPro : non publiés, devis.

### Ce qui exige une RÉPONSE FOURNISSEUR

- Les droits d'affichage **grand public**, de mise en cache et de
  redistribution. **Aucun des cinq fournisseurs n'en publie un mot**, et tous
  ciblent des professionnels. C'est le blocage n° 1, avant même le prix.
- La couverture réelle du parc français, chiffrée.
- L'existence et le périmètre d'un décodage VIN pour une voiture française.

**Conclusion corrigée : TecRMI n'est pas à écarter pour la France.** Ce qui
bloque n'est pas le pays — c'est que nous n'avons, sur leurs pages publiques,
ni chiffre de couverture, ni prix, ni droit d'affichage B2C. Ces trois
réponses s'obtiennent en une demande écrite, qui reste à décider.

| Fournisseur | Ce qu'il rendrait | Tarif publié | Utilisable aujourd'hui |
|---|---|---|---|
| autobizVIN | VIN → caractéristiques, finition, équipements | non publié — devis | Non : aucune API publiée |
| autobiz API Match | VIN / plaque → marque, modèle, version | Essai « Free » 50 appels/jour ; payant « Custom » | Non : essai conditionné à un compte |
| Auto Ways | Plaque / VIN → 100+ champs, correspondance TecDoc | **49 → 1 399 €/mois TTC** | Non sans compte — seul fournisseur entièrement chiffrable sans contact |
| TecRMI (TecAlliance) | Plan d'entretien constructeur | non publié — devis | Non : contrat. **Deux intégrateurs français existent.** |
| HaynesPro | Plans d'entretien OEM, temps de réparation | non publié — devis | Non : démo sur demande |

---

## 5. L'entretien : ce qu'on a trouvé, marque par marque

*Corrigé le 20 septembre 2026. La version précédente disait « aucun
constructeur ne publie son programme ». **Examiner trois marques n'autorise
pas à conclure pour tous**, et surtout : « on n'a pas trouvé », « c'est
derrière un compte », « c'est payant » et « on n'a pas le droit de le
réutiliser » sont quatre problèmes différents.*

| Marque | Ce qui est publié | Barrière rencontrée |
|---|---|---|
| **Tesla** | **Un vrai programme, par modèle nommé** : opérations et intervalles, en français, sur une page publique (`service.tesla.com/docs/Public/…`) | Aucune pour lire. Conditions de réutilisation non examinées. |
| **Volkswagen** | Un calendrier public : entretien annuel ou 15 000 km, « Long Life » jusqu'à 30 000 km ou 2 ans | **Portée « votre Volkswagen »** : aucun modèle, aucune motorisation nommée. Ce n'est pas un programme. |
| **Toyota** | Une périodicité de marque (« tous les 15 000 km ou tous les ans, **variable selon les modèles** ») | Valeur par modèle **simplement absente** ; renvoi au carnet et au tunnel de rendez-vous. |
| **Renault, Dacia** | Notices publiques par modèle et par période, sans VIN ni compte | La **périodicité n'y figure pas** : renvoi au « document d'entretien du véhicule », c'est-à-dire au carnet papier. CGU interdisant la reproduction. |
| **Peugeot** | Guide public sans chapitre « plan d'entretien » | L'outil qui l'afficherait demande **immatriculation ou numéro de série**. |
| **Citroën** | Rien sur le site grand public | **VIN obligatoire ET espace « Services abonnés »** : double barrière. CGU interdisant la reproduction. |

**Ce qui en est fait dans le produit — trois niveaux qui ne se confondent
pas :**

1. **Programme** — Tesla Model 3 et Model Y : les opérations et leurs
   intervalles s'affichent, avec la portée citée par Tesla elle-même
   (« s'ils s'appliquent à votre véhicule ») et les conditions d'usage.
2. **Repère de marque** — Volkswagen : affiché comme un repère, **jamais
   converti en échéance**, avec cette phrase à l'écran : « ce n'est pas la
   préconisation de VOTRE voiture ; votre carnet fait foi ».
3. **Non publié** — les autres : la carte le dit, **nomme la barrière
   rencontrée** (carnet papier, VIN, abonnement) et passe en dernier dans la
   section. Elle ne domine jamais l'écran.

`PROGRAMMES` reste une liste courte et explicite. Y ajouter une entrée est une
décision documentée : chaque entrée porte sa clé de source, et sa source porte
la date de sa dernière relecture humaine.

---

## 6. Le moteur

`lib/auto/connaissance/` — modules purs, 44 tests.

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

### Cinq précautions nées des données réelles

1. **« 208 » ne doit pas attraper « 2008 ».** Le modèle est cherché comme un
   mot entier.
2. **Yaris, Yaris Cross et GR Yaris ne sont pas la même voiture.** Une fiche
   est classée `exacte`, `generation` ou `voisine` selon ce qui entoure le nom
   dans son texte — et seul un mot collé par une espace compte : dans
   « aygo, aygo x, yaris, gr yaris », la virgule après « yaris » clôt le nom,
   donc la fiche nomme bien la Yaris **en plus** de la GR Yaris. Une
   génération (« 208 v2 ») s'affiche au lieu d'être avalée.
3. **Un libellé de voiture n'est pas un nom de catalogue.** « 208 (essai) »,
   « Clio IV », « C3 Picasso ». Le libellé est **lu**, pas découpé : ce qui est
   entre parenthèses est une annotation de la personne et ne part jamais dans
   une recherche. Si le nom complet ne trouve rien, on descend d'un palier —
   et **l'écran dit que la recherche est devenue moins précise**, parce
   qu'élargir augmente les résultats ET les faux positifs, jamais la certitude.
4. **La période publiée est une période de fabrication, pas
   d'immatriculation.** Une voiture faite en décembre s'immatricule en janvier.
   La fenêtre est élargie de douze mois par la fin, jamais par le début — et
   une fiche hors période est **écartée de la liste principale, pas
   supprimée**. L'écran écrit « fabriquées du … au … », jamais « concernées ».
5. **Trois absences différentes.** « Aucune fiche ne nomme ce modèle », « la
   base n'a pas répondu » et « aucun rappel ne concerne votre voiture » ne se
   disent pas pareil — et le troisième, Nexora ne peut **jamais** l'affirmer.
   Dans tous les cas, la carte propose le seul geste qui tranche : le numéro
   de série, case E de la carte grise, auprès du réseau de la marque.

### Une question posée seulement quand elle change la réponse

L'arrêté range les hybrides non rechargeables selon leur carburant : essence
d'un côté, gazole de l'autre, et la classe n'est pas la même. Plutôt que
d'ajouter un champ au formulaire, l'écran affiche **les deux issues** — « Si
essence : Crit'Air 1 / Si gazole : Crit'Air 2 ». La personne reconnaît la
sienne d'un coup d'œil, et Nexora n'a toujours rien affirmé.

### Crit'Air : la norme Euro prime, la date n'est que le repli

*Corrigé le 20 septembre 2026.* L'article 1 de l'arrêté classe « lorsque
l'information est disponible, en fonction de la norme "Euro" figurant dans la
rubrique V.9 ; ou, **à défaut**, en fonction de la date de première
immatriculation ». L'ordre compte : un diesel réceptionné Euro 4 mais
immatriculé en janvier 2011 est **Crit'Air 3**, alors que la date seule le
dirait Crit'Air 2 — c'est-à-dire **mieux classé qu'il ne l'est**, ce qui
exposerait quelqu'un à une amende en zone à faibles émissions.

Le moteur applique donc les deux critères dans le bon ordre, et le teste.
Nexora ne collecte pas encore la norme Euro — lui ajouter un champ
obligatoire serait exactement ce qu'on cherche à éviter. En attendant, elle ne
fait pas semblant : la carte affiche « classée d'après la date de première
immatriculation, faute de connaître la norme Euro », dit ce que cela peut
coûter, et renvoie au **simulateur officiel**, qui la prend en compte. Elle
rappelle aussi qu'elle lit la colonne « Voitures » (catégorie M1), et qu'une
lecture de la nomenclature **n'est pas une certification**.



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

**Automatique** — 344 tests au vert, dont 44 nouveaux. Les cas de référence de
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
| Mobile 375 px | Citroën C3 | Lisible, pas de débordement, trois fiches visibles |
| Programme publié | Tesla Model 3 (Test) | 6 opérations, leurs intervalles, leurs conditions, la portée citée par Tesla ; Crit'Air E ; une fiche nommant exactement le modèle |
| Repère de marque | VW Golf | « Repère de marque », aucune échéance dérivée, « votre carnet fait foi » |
| Version voisine | VW Golf | La fiche « golf a7 » est marquée « nomme une version voisine » |

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
