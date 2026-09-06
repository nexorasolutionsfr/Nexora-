# Reprise de l'ancienne base clients et véhicules — contrat V1

Branche `feature/import-base-clients-v1`, créée depuis `origin/main` (6a67eda).
Rien n'a été appliqué sur Test ni sur Production.

Troisième lot du chantier « mise en service sans intervention de l'éditeur ».

---

## A. Le problème, et ce que fait le marché

Un garage qui change de logiciel arrive avec des années de clients et de
véhicules. Nexora n'offrait aucun chemin pour les reprendre : il fallait tout
ressaisir, ou que l'éditeur le fasse à sa place.

Revue des concurrents, septembre 2026 :

| | Reprise de données | Délai de mise en service |
| --- | --- | --- |
| Tekmetric, Shopmonkey, AutoLeap (US) | équipe humaine dédiée | 1 à 4 semaines |
| Solware / Winmotor Cloud (FR) | « équipe Solware dédiée » | « quelques jours » |
| Nexora avant ce lot | aucune | — |

**Personne ne propose de reprise en self-service.** C'est à la fois l'ouverture
et l'avertissement.

L'ouverture : Nexora n'a pas d'équipe de migration et n'en aura pas. Le
self-service n'est donc pas un luxe, c'est la seule économie viable — et ça
devient un argument que les concurrents ne peuvent pas tenir sans casser leur
propre modèle.

L'avertissement : s'ils y mettent tous des humains, c'est que les fichiers
réels sont sales. Le lot est donc conçu pour **dégrader proprement** plutôt que
pour réussir toujours. D'où l'aperçu obligatoire, les motifs de rejet ligne par
ligne, et la phrase de repli affichée sous l'écran : « si la reprise ne passe
pas, écrivez-nous : on la fait pour vous. » Un import qui échoue en disant
pourquoi vaut mieux qu'un import qui réussit de travers.

## B. Le parcours, en deux gestes

1. Le garage dépose son export CSV.
2. Nexora devine le séparateur, associe les colonnes, montre un aperçu de ses
   vraies lignes.
3. « Vérifier sans rien importer » → compteurs exacts, sans aucune écriture.
4. « Importer N clients » → écriture.

Le garage ne paramètre rien s'il n'y a rien à corriger. Les listes déroulantes
de correspondance sont là pour le cas où la reconnaissance se trompe, pas comme
étape obligatoire.

**L'aperçu n'est pas une politesse, c'est la seule protection du garage.** Le
bouton d'import n'apparaît qu'après lui, et les compteurs de l'aperçu sont
**rigoureusement** ceux de l'import — c'est une propriété tenue par la fonction
SQL, pas une approximation (voir section E).

## C. Répartition entre navigateur et base

| | Où | Pourquoi |
| --- | --- | --- |
| Séparateur, découpage, reconnaissance des colonnes | navigateur | dépend de l'affichage et doit rester instantané ; c'est aussi la partie qu'on peut éprouver par des tests purs |
| Validation, doublons, écriture | base | seule autorité sur ce qui entre réellement |

`components/import/analyseFichier.js` ne touche ni au réseau, ni à React, ni à
Supabase : c'est délibéré. C'est la partie qui décide si un garage réussit sa
reprise ou abandonne, donc c'est la partie qui doit être testée seule. Vingt
cas la couvrent.

La fonction SQL reste **stricte** : elle n'accepte que les huit clés qu'elle
connaît. Le navigateur s'adapte au fichier ; la base ne s'adapte à rien.

### Ce que la reconnaissance sait faire

Séparateur deviné en cherchant celui qui découpe les premières lignes en un
nombre **constant** de colonnes — et non le plus fréquent : une colonne
d'adresses pleine de virgules ferait sinon gagner la virgule sur un fichier
pourtant en point-virgule. Guillemets et guillemets doublés respectés. BOM et
fins de ligne Windows absorbés.

Intitulés reconnus, en français et en anglais, dans leurs formes réelles :
`Nom du client`, `Client`, `Raison sociale`, `Tél. portable`, `N° Immat.`,
`Plaque`, `Compteur`, `Mileage`, `Year`… Deux champs ne peuvent jamais pointer
la même colonne, et l'égalité stricte l'emporte toujours sur la correspondance
partielle.

Piège traité explicitement : une colonne `Client email` ne doit pas devenir le
*nom* du client, alors que « client » est bien un motif du champ nom. L'ordre
de résolution place les champs discriminants avant les champs larges.

## D. Parenté avec la fonction déjà présente sur Test

Une fonction de même nom existe **déjà sur Test**, issue du chantier accès
salariés (migration `20260905001000`, non fusionnée dans `main`). Ce lot en
reprend la structure, qui est bonne, avec deux différences :

1. **Contrôle d'accès.** La version Test s'appuie sur `a_acces_garage()`, qui
   n'existe pas en Production. Celle-ci s'appuie sur `garages.owner_user_id`.
2. **Correction d'un défaut réel.** La version Test ne rapproche les doublons
   que par e-mail ou téléphone. Un client dépourvu des deux y est donc **recréé
   à chaque import** : rejouer le même fichier duplique silencieusement toute
   cette population — précisément ce qu'un garage fait après une première
   tentative ratée. Cette version ajoute un troisième niveau de rapprochement,
   sur le nom normalisé.

Le compromis du rapprochement par nom est assumé : deux homonymes réels
dépourvus l'un et l'autre d'e-mail et de téléphone seront fusionnés. Ils sont
de toute façon indiscernables, et l'aperçu affiche le compte de doublons avant
confirmation.

**La migration REFUSE de s'appliquer si une fonction de ce nom existe déjà**,
plutôt que de l'écraser avec `create or replace`. Sur Test, les deux versions
doivent être réconciliées à la main, en connaissance de cause. C'est le prix de
la dérive constatée au lot socle, et il vaut mieux le payer bruyamment que
découvrir plus tard qu'un `create or replace` a effacé le modèle d'accès par
rôle.

## E. Garanties de la fonction SQL

- **Aperçu et import identiques.** Une passe unique, une mémoire des clients et
  plaques déjà vus *dans le fichier*. Sans elle, l'aperçu compterait deux fois
  un client répété alors que l'import n'en créerait qu'un : en mode confirmé, la
  seconde ligne retrouverait le client inséré par la première.
- **Accès.** L'appelant doit être propriétaire du garage visé. `anon` et
  `service_role` sont explicitement fermés.
- **Volume.** 2 000 lignes au maximum : au-delà, la transaction tiendrait un
  verrou trop long sur des tables que le garage utilise pendant ce temps.
- **Immatriculations.** L'index d'unicité est global. Une plaque déjà prise
  ailleurs est refusée **avant** d'écrire, avec un motif qui ne révèle rien du
  garage tiers : « immatriculation non disponible ».
- **Rejets nommés.** Chaque ligne écartée revient avec son numéro, son motif et
  le nom lu, pour que le garage la retrouve dans son propre fichier.
- **Garde-fou de schéma**, comme au lot onboarding : la migration vérifie contre
  la base réelle qu'aucune colonne obligatoire de `clients` ou `vehicules` n'est
  oubliée par l'insertion, et échoue en les nommant. Vérifié au passage sur les
  deux projets : aucune ne manque.

## F. Messages d'erreur

Chaque cause connue a sa phrase. Un message qui envoie le garage corriger ses
colonnes alors que sa session a expiré lui fait perdre son temps sur la
mauvaise piste :

| Cause | Ce que voit le garage |
| --- | --- |
| `PGRST202` (migration non appliquée) | « La reprise n'est pas encore activée sur votre espace. Écrivez-nous. » |
| `42501` / accès refusé | « Vous n'avez pas accès à ce garage, ou votre session a expiré. » |
| `Fichier invalide : …` | le message tel quel |
| autre | repli qui ne prétend rien savoir |

## G. Vérifications faites

- 20 tests sur la reconnaissance, dont les pièges de séparateur, de guillemets
  doublés, de colonnes homonymes et de lignes vides de fin d'export.
- `next build` complet, vert. 115 tests au total dans le dépôt.
- Parcours joué dans un navigateur avec un export réaliste — en-têtes
  `Tél. portable`, `N° Immat.`, `Compteur`, colonne `Code interne` parasite,
  BOM, fins de ligne Windows, guillemets doublés, ligne vide finale. Les huit
  champs sont reconnus, la colonne parasite ignorée, l'aperçu correct.
- Chemin d'erreur vérifié en conditions réelles : la fonction étant absente de
  la base, c'est bien le message `PGRST202` qui s'affiche.

## H. Procédure sûre vers Test

1. **Réconcilier d'abord** la fonction homonyme du chantier accès salariés,
   sinon la migration refuse de s'appliquer — c'est voulu.
2. Appliquer sur Test seulement. Si le garde-fou de schéma échoue, il nomme les
   colonnes manquantes.
3. Importer un fichier de recette, en aperçu d'abord, puis confirmé. Vérifier
   que les compteurs des deux passes sont identiques.
4. Rejouer **le même fichier** une seconde fois : tout doit être compté en
   doublon, rien ne doit être créé. C'est le test qui attrape le défaut corrigé
   en section D.
5. Production seulement ensuite, sur décision séparée.

## I. Ce que ce lot ne fait pas

- **Excel.** `.xlsx` demanderait une bibliothèque de lecture ; le CSV est
  exporté par tous les logiciels de garage. À revoir si des garages butent
  réellement dessus.
- **Historique.** Ni interventions, ni factures, ni devis passés. Les clients et
  les véhicules d'abord : c'est ce qui permet de travailler dès le lendemain.
- **Reprise incrémentale.** Chaque import est complet et idempotent ; il n'y a
  pas de synchronisation continue avec l'ancien logiciel.
