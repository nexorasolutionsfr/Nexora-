# Corrections des trois blocants de la recette pilote — Contrat technique V1

Statut : **contrat court, écrit après audit local, avant implémentation.**
Portée : les trois défauts trouvés lors de la recette du 2026-09-04 sur
Supabase Test (`slawilafseganlbghgwx`). Aucune migration n'est encore
appliquée au-delà des deux déjà posées (voir section A). Aucune action sur
Production, aucun push, aucun DVI touché.

---

## A. Migrations Test déjà posées — vérifiées cohérentes

`20260904000300_rendez_vous_demande_id_nullable.sql` et
`20260904000400_rendez_vous_vehicule_id_nullable.sql` retirent la contrainte
`NOT NULL` sur `rendez_vous.demande_id` et `rendez_vous.vehicule_id`. Elles
restent nécessaires et suffisantes pour le point 1 : un rendez-vous manuel
n'a par nature aucune demande d'origine, et son véhicule doit rester
optionnel tant que le formulaire ne permet pas encore de le renseigner. Ce
lot ajoute la partie qui manquait — la capacité de le renseigner — sans
revenir sur ces deux migrations.

---

## B. Point 1 — Création manuelle de rendez-vous

**Constat.** `rendez_vous.vehicule_id` est maintenant nullable, mais
`CreerRdvModal` ne propose aucun champ véhicule : le staff ne peut jamais en
attacher un à la création, même quand le client en a déjà un enregistré. Sans
véhicule sur le rendez-vous, aucun OR ne peut ensuite s'y rattacher pour un
devis lié à un véhicule (déjà observé pendant la recette).

**Décision.** Le véhicule reste facultatif à la création (rien n'oblige à le
connaître dès le premier appel), mais devient **sélectionnable ou créable en
un geste**, sur le modèle déjà éprouvé du bouton « + Nouveau client » du même
formulaire :
- si le client a déjà un ou plusieurs véhicules (`clientChoisi.vehicules`,
  déjà chargé au démarrage), une liste à choix simple s'affiche ;
- un bouton « + Nouveau véhicule » ouvre trois champs (marque, modèle,
  immatriculation), tous facultatifs sauf qu'au moins un identifiant
  (marque/modèle ou immatriculation) doit être renseigné pour créer une
  fiche utile ;
- le véhicule choisi ou créé est transmis tel quel à `handleCreerRdvManuel`,
  qui n'a besoin d'aucune modification : il accepte déjà `vehicule_id`.

**Aucune dépendance invisible restante** : le formulaire n'affiche plus de
champ (prestation) dont l'absence de données (aucune prestation créée)
bloquait silencieusement la création — ce point avait déjà été validé
pendant la recette (créer une prestation au préalable est attendu, visible,
documenté par l'écran Paramètres).

**Fichiers touchés** : `components/NexoraDashboard.jsx` seul (aucune
migration supplémentaire pour ce point).

---

## C. Point 2 — Facturation

**Constat.** `handleGenererFacture` lit `rendez_vous.devis_id`, colonne qui
n'existe pas sur cette table (`rendez_vous` n'a jamais eu de lien direct vers
un devis ; c'est `ordres_reparation.devis_id` qui existe). La condition est
donc toujours fausse, et le code retombe sur `prestation?.prix_ht || 0` —
un prix de catalogue quasi toujours absent, d'où la facture à 0 €.

**Où se trouve la vérité du montant, en l'état du schéma.**

| Objet | Rôle réel | Utilisable tel quel pour facturer ? |
|---|---|---|
| `devis` / `devis_lignes` | Accord commercial du client, verrouillé après acceptation | Non : le devis peut avoir été révisé depuis (contrat devis multi-lignes, section G.4) ; ce n'est pas ce que le mécanicien a réellement fait |
| `ordres_reparation` / `ordres_reparation_lignes` | Ce qui a été réellement exécuté, tenu à jour jusqu'à la restitution | **Oui, une fois `statut = 'termine'`** — c'est le seul objet qui reflète le travail réel, pas l'intention initiale |

Le contrat `ordres_reparation-v1` documente explicitement
`ordres_reparation_lignes.prix_unitaire_ht` comme « une estimation interne
uniquement, jamais une valeur contractuelle » — vrai tant que l'OR n'est pas
`termine`. Une fois terminé, ses lignes non annulées sont la seule
description fidèle du travail facturable : c'est la source que la consigne
demande, et c'est la seule qui soit à la fois disponible et honnête.

**Le manque à combler : la TVA.** `ordres_reparation_lignes` n'a pas de
colonne `taux_tva` — `lignesDevisVersOR()` la jette au passage en reprisant
un devis vers un OR. C'est une perte d'information, pas un choix voulu :
`devis_lignes` porte déjà ce taux avec la même contrainte (0 à 100). Ce lot
ajoute `taux_tva` à `ordres_reparation_lignes`, avec le même défaut 20 %
déjà utilisé partout ailleurs dans le produit (`TAUX_TVA_DEFAUT`), et arrête
de le jeter à la reprise.

**Décision — source de vérité unique pour une facture.**

1. Une facture ne peut être générée que si un ordre de réparation
   `statut = 'termine'` existe pour ce rendez-vous. Sinon : refus explicite
   avec un message actionnable, jamais un montant à zéro.
2. Ses lignes retenues sont celles dont `statut != 'annule'`.
3. Si une ligne retenue n'a pas de prix (`prix_unitaire_ht is null` —
   possible par construction, cf. « estimation interne »), la génération est
   bloquée avec un message qui nomme la ligne à compléter. Jamais de silence,
   jamais de zéro.
4. Le montant de la facture est calculé ligne par ligne avec la même règle
   d'arrondi que le devis (`calculerLigne`/`calculerTotaux`, déjà partagées
   dans `components/devis-lignes/calculs.js`) : HT arrondi, TVA calculée sur
   le HT arrondi, sommée ligne à ligne — jamais un arrondi du total.
5. **Snapshot figé.** `factures.lignes` (jsonb, déjà existante, vide par
   défaut) reçoit une copie complète des lignes au moment de la facturation
   — libellé, type, quantité, prix unitaire HT, taux de TVA, montants
   calculés. Une modification ultérieure de l'OR ou du devis n'affecte
   jamais une facture déjà émise : c'est la garantie demandée.
6. `factures.ordre_reparation_id` (nouvelle colonne, nullable, FK) trace la
   provenance sans dépendre de `rendez_vous.devis_id` inexistant. `devis_id`
   reste rempli quand l'OR en a un, pour la traçabilité, mais n'est plus lu
   pour calculer quoi que ce soit.

**Fichiers touchés** :
`supabase/migrations/20260904000500_ordres_reparation_lignes_taux_tva.sql`,
`supabase/migrations/20260904000600_factures_ordre_reparation_id.sql`,
`components/NexoraDashboard.jsx` (`handleGenererFacture`,
`lignesDevisVersOR` déjà importée depuis `calculs.js`),
`components/devis-lignes/calculs.js` (`lignesDevisVersOR` conserve
`taux_tva`), `components/ordre-reparation/OrdresReparationSection.jsx`
(le formulaire d'ajout de ligne gagne un sélecteur de TVA, comme celui du
devis).

---

## D. Point 3 — Portail devis

**Constat.** `lire_devis_par_jeton` ne renvoie que `montant_ttc` et le nom de
la prestation d'origine — jamais les lignes, jamais le détail HT/TVA. La
page `/devis/[token]` ne peut donc afficher que ce total.

**Décision.** La fonction renvoie en plus `devis_lignes` (déjà lisibles par
le staff, jamais par une politique RLS puisque cette table est verrouillée
comme `devis_jetons` — l'accès passe uniquement par cette fonction
`security definer`) et les totaux `montant_ht` / `montant_tva` du devis
parent. Portée strictement additive à une fonction déjà versionnée :
`create or replace function`, sans toucher au reste de son corps ni à
`repondre_devis_par_jeton`.

La page affiche un tableau des lignes (libellé, quantité, prix unitaire HT,
TVA) puis un pied HT / TVA / TTC, au-dessus des boutons Accepter/Refuser
existants — aucun changement de logique d'acceptation.

**Fichiers touchés** :
`supabase/migrations/20260904000700_devis_par_jeton_lignes.sql`,
`app/devis/[token]/page.tsx`.

---

## E. Cas limites couverts par les tests

- Rendez-vous : client avec 0, 1, plusieurs véhicules ; création d'un
  véhicule inline ; capacité mécanicien toujours respectée (inchangé).
- Facturation : aucun OR pour le rendez-vous → refus explicite. OR existant
  mais pas `termine` → refus explicite. Ligne retenue sans prix → refus
  explicite nommant la ligne. Ligne `annulée` → exclue du calcul. Montant
  final identique à la somme des lignes de l'OR terminé, TVA à 20 % par
  défaut sur les lignes reprises d'un devis.
- Portail devis : lignes affichées correspondent exactement aux lignes du
  devis accepté pendant la recette, totaux HT/TVA/TTC cohérents avec
  `calculerTotaux`.

## F. Hors périmètre, explicitement

DVI (aucun fichier de `components/dvi-recommandations` ni
`app/prototypes/dvi-v2` touché). Aucune modification de Production. Aucun
push, aucune PR. Le manque de purge/gestion multi-véhicule avancée (fusion
de doublons, édition ultérieure du véhicule) reste hors périmètre : ce lot
ajoute la création, pas la gestion complète d'une fiche véhicule.
