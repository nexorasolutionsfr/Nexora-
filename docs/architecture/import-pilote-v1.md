# Import pilote clients et véhicules — contrat V1

Établi le 2026-09-05 à partir du schéma réel relevé sur Test
(`slawilafseganlbghgwx`). Objectif : permettre à un garage de démarrer
depuis un export de son ancien logiciel, sans reprise comptable et sans
intervention manuelle.

---

## A. Ce que le schéma permet réellement

`clients` porte `nom`, `email`, `telephone` — et rien d'autre d'utile ici.
Il n'y a pas de colonne d'adresse. `vehicules` porte `marque`, `modele`,
`annee`, `immatriculation`, `kilometrage`. Les six champs demandés existent
donc tous, plus l'année.

Deux constats contraignent l'import, tous deux relevés en base :

**`vehicules.immatriculation` porte un index unique GLOBAL**
(`vehicules_immatriculation_unique`), pas un unique par garage. Une plaque
déjà enregistrée par un autre garage fera échouer l'insertion. L'import doit
donc la détecter avant d'écrire, et la refuser avec un motif générique : dire
« cette plaque appartient à un autre garage » divulguerait l'existence d'un
enregistrement chez un tiers.

**Presque tout est nullable**, y compris `clients.nom` et
`vehicules.garage_id`, ce dernier avec un défaut absurde
(`gen_random_uuid()`). La base ne rejettera donc pas une ligne vide : c'est
l'import qui doit valider, jamais le schéma.

---

## B. Un seul point d'entrée

`public.importer_clients_vehicules(p_garage_id, p_lignes jsonb, p_confirmer boolean)`.

- `security definer`, `search_path = ''`, EXECUTE accordé au seul rôle
  `authenticated`, puis refusé à tout appelant dont
  `a_acces_garage(p_garage_id, 'dirigeant', 'accueil')` est faux. Le
  mécanicien est donc refusé côté serveur, indépendamment de l'interface.
- `p_confirmer = false` : la fonction valide, détecte les doublons, produit
  le rapport complet et **n'écrit rien**. C'est l'aperçu.
- `p_confirmer = true` : même calcul, suivi des écritures. L'appel entier
  étant une transaction, une erreur à la ligne 400 annule les 399
  précédentes.

L'aperçu et l'import exécutent le même code de validation : ce qui est
annoncé est exactement ce qui sera fait.

## C. Validation et atomicité

Une ligne est **rejetée** si le nom du client est vide, si le kilométrage ou
l'année ne sont pas des entiers positifs plausibles, si l'e-mail n'a pas la
forme d'une adresse, ou si l'immatriculation est déjà prise hors du garage.

Le **fichier** est déclaré invalide, et alors rien n'est écrit du tout, dans
trois cas : aucune ligne, aucune ligne valide, ou plus de 2 000 lignes. Un
fichier valide dont certaines lignes sont rejetées s'importe quand même —
les lignes correctes passent, les autres figurent au rapport. C'est la
lecture retenue des deux exigences : atomicité du fichier, tolérance à la
ligne.

## D. Doublons, jamais d'écrasement

Un client est considéré déjà présent si, dans le même garage, un client
partage son e-mail (comparaison en minuscules) ou son téléphone (comparaison
sur les seuls chiffres). Un véhicule est déjà présent si, dans le même
garage, une immatriculation normalisée identique existe.

Un doublon n'est jamais écrasé, ni même complété : la ligne est comptée comme
ignorée. Le véhicule d'une ligne dont le client existait déjà est en revanche
rattaché à ce client existant — c'est le comportement utile, et il n'écrase
rien. V1 ne propose aucune option d'écrasement.

## E. Conservation minimale

Le fichier ne quitte jamais le navigateur. Il y est lu, ses colonnes
associées, puis seules les lignes normalisées partent en JSON vers la
fonction. Aucune table ne conserve le fichier brut, aucun journal n'écrit le
contenu des lignes : le rapport ne renvoie que des compteurs, des numéros de
ligne et des motifs génériques.

## F. Hors périmètre

Aucune reprise d'historique comptable, aucun rendez-vous, devis, facture ni
ordre de réparation importé. Aucune mise à jour d'un enregistrement
existant. Aucun envoi, aucune notification. L'année est acceptée parce que la
colonne existe, mais elle n'est pas demandée dans le modèle.
