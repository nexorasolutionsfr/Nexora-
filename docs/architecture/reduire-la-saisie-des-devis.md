# Réduire la saisie des devis — audit et conception

13 septembre 2026. **Conception seule : rien de ce document n'est implémenté.**
L'audit vient de requêtes sur la base et de lecture du code, pas de souvenirs.

---

## 1. Audit — ce qui existe déjà

### Le catalogue de prestations

`prestations` : `garage_id`, `nom`, `categorie`, **`duree_minutes` (NOT NULL)**,
`description`, **`prix_ht` (nullable)**.

Mesuré sur Test : **86 prestations réparties sur 11 garages, dont 18
seulement portent un prix.**

C'est le fait le plus important de cet audit. **Le catalogue actuel est un
catalogue de durées, pas de prix.** Il a été conçu pour que l'agenda propose
des créneaux plausibles dès le premier jour (`catalogueParActivite.js`
installe des interventions par activité, avec des durées et **sans prix** —
volontairement : « les durées sont des points de départ raisonnables, pas des
vérités »).

Conséquence directe pour les forfaits : **on ne peut pas composer des forfaits
chiffrés à partir d'un catalogue qui n'a pas de prix.** Le chiffrage est la
première chose à demander au garage, pas la dernière.

### Une prestation = une ligne, et rien de plus

Une prestation n'a aucune composition : pas de sous-lignes, pas de pièces
associées, pas de distinction main-d'œuvre / pièce. C'est un libellé, une
durée, éventuellement un prix.

### Le pré-remplissage existe déjà, et il est correct

`LigneDevisForm` (`components/devis-lignes/DevisLignesEditor.jsx`) propose
« Pré-remplir depuis une prestation » : le choix copie le libellé et le prix
dans la ligne, renseigne `devis_lignes.prestation_id`, et **fige la copie** —
« la prestation n'est plus relue ensuite ». C'est la bonne règle : un devis
envoyé ne doit pas changer parce que le garage a modifié son catalogue après
coup.

Sur Test, `devis_lignes.prestation_id` est renseigné **0 fois sur 21** — mais
c'est parce que les devis d'essai ont été créés par script, pas parce que le
chemin est cassé. **Ce n'est pas un défaut.**

### Le contrôle photo

Chaîne complète et fonctionnelle, à une exception près :

| Élément | État |
|---|---|
| `inspections` (statut, verrouillage) | existe |
| `inspections_points` (`categorie`, `libelle`, `etat`, `commentaire`) | existe |
| `etat` ∈ `ok` / `a_surveiller` / `a_valider_client` / `dommage` | existe |
| `inspections_photos` rattachées **au point** (`point_id`) | existe |
| `soumis_client`, `decision_client` (`valide`/`refuse`), `decision_le` | existe |
| Liste standard posée tout au vert, on ne touche que ce qui cloche | existe |
| **Lien constat → devis** | **n'existe pas** |

`grep -rn "devis" components/inspections/` ne renvoie **rien**. Un point
constaté, photographié et validé par le client doit aujourd'hui être retapé à
la main dans le devis.

Voisin à connaître : `travaux_differes` porte déjà `devis_id`, `intervention`,
`niveau`, `date_relance` et `source`. C'est le mécanisme « travail repoussé,
à relancer » — **pas** le chemin constat → chiffrage.

### Collision de vocabulaire, à trancher avant d'écrire une ligne de code

**`garages.forfait` existe déjà et désigne l'abonnement Stripe du garage.**
`components/tarifs.tsx` emploie « forfait » dans ce sens sur la page publique.
Appeler « forfait » un ensemble de prestations créerait deux sens du même mot
dans le même produit, dont l'un touche à la facturation de Nexora.

**Proposition : « prestation composée ».** Le garage compose une prestation à
partir de lignes ; le mot « forfait » reste à l'abonnement.

---

## 2. Conception — les prestations composées

### Modèle

Deux tables, additives, aucune modification de l'existant :

```sql
-- Une prestation composée : un nom, appartenant à un garage.
create table prestations_composees (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references garages(id),
  nom text not null,
  description text,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ses lignes : la même forme qu'une ligne de devis, sans le devis.
create table prestations_composees_lignes (
  id uuid primary key default gen_random_uuid(),
  prestation_composee_id uuid not null references prestations_composees(id) on delete cascade,
  garage_id uuid not null references garages(id),
  type text not null check (type in ('main_oeuvre','piece')),
  libelle text not null,
  quantite numeric not null default 1 check (quantite > 0),
  prix_unitaire_ht numeric not null default 0 check (prix_unitaire_ht >= 0),
  taux_tva numeric not null default 20 check (taux_tva between 0 and 100),
  position integer not null default 0,
  prestation_id uuid references prestations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

**Pourquoi deux tables plutôt qu'un `jsonb` sur `prestations`** : les lignes se
réordonnent, se modifient une à une et se comptent. Un `jsonb` rend chacune de
ces opérations plus fragile qu'une ligne de table, sans rien gagner. Et la
forme est volontairement **celle de `devis_lignes`**, pour que l'insertion dans
un devis soit une copie champ à champ, sans traduction.

**RLS** : strictement calquée sur `prestations` — `garage_id = current_garage_id()`,
plus une policy accueil si l'accueil doit pouvoir composer. À trancher.

### Le geste

1. **Paramètres → Prestations**, un onglet « Prestations composées ».
2. « Nouvelle prestation composée » : un nom, puis des lignes. Chaque ligne
   s'ajoute soit en saisie libre, soit **depuis le catalogue existant**
   (le sélecteur de `LigneDevisForm`, réutilisé tel quel).
3. Dans un devis : « Ajouter une prestation composée » insère **toutes ses
   lignes d'un coup**, chacune modifiable ensuite, aucune ne verrouillée.

### Les règles, et pourquoi

- **Copie par valeur, toujours.** Insérer une prestation composée copie ses
  lignes dans le devis. Modifier la composition plus tard ne touche aucun
  devis existant. C'est déjà la règle du pré-remplissage, et c'est la seule
  qui tienne : un devis est une proposition datée.
- **Aucun prix inventé.** Une prestation composée n'a que les prix que le
  garage y a mis. Aucun barème, aucun temps constructeur, aucune compatibilité
  de pièce ne sont proposés — Nexora n'en possède aucun, et les acheter est
  exclu.
- **Aucun document accepté n'est modifié.** Garanti par la base, pas par
  l'écran : `devis_check_immuabilite` refuse toute modification d'un devis dont
  le statut n'est ni `brouillon` ni `en_attente`. Rien à ajouter.
- **Réutilisation, pas réécriture** : `DevisLignesEditor`, `calculerTotaux`,
  `normaliserLigneDevis`, `validerLigneDevisForm`, `trierLignes` sont repris
  tels quels. Le seul code neuf est l'écran de composition et l'insertion en
  lot.

### Critères d'acceptation

1. Un garage crée une prestation composée de 3 lignes, la retrouve après
   rechargement, en modifie une ligne, en supprime une, réordonne les deux
   restantes.
2. L'insérer dans un devis brouillon ajoute exactement ses lignes, dans
   l'ordre, avec les bons montants — total du devis recalculé.
3. Modifier ensuite la prestation composée **ne change pas** le devis déjà
   établi. Vérifié en base, pas seulement à l'écran.
4. Un devis accepté refuse l'insertion — message explicite, pas une erreur
   technique.
5. Un garage ne voit jamais la prestation composée d'un autre garage : vérifié
   sous deux sessions distinctes, pas par lecture de policy.
6. L'accueil peut (ou ne peut pas — selon l'arbitrage) composer ; le
   mécanicien ne voit jamais cet écran, il n'a pas les prix.
7. Une prestation composée sans ligne ne s'insère pas et le dit.
8. Supprimer une prestation composée ne touche aucun devis existant.

### Pourquoi aucun incrément n'est livré dans ce lot

Les deux tables ci-dessus sont une **migration**. Toute migration ajoutée au
dépôt part en Production au déploiement suivant — et la consigne de ce lot est
« aucune migration Production ». Il n'existe pas de version sans migration :
une prestation composée doit être **stockée**, sinon elle n'est pas réutilisable,
et c'est tout son objet.

**Alternative sans migration, si Baptiste veut un gain immédiat** :
« Reprendre les lignes d'un devis précédent de ce véhicule » — les devis passés
du garage sont déjà une bibliothèque d'ensembles de lignes, et le motif de
copie par valeur existe déjà (`lignesDevisVersOR`). C'est moins qu'un forfait,
mais c'est livrable sans toucher au modèle. **À arbitrer.**

---

## 3. Conception — photo → constat → prestation à chiffrer → ligne de devis

### La frontière à ne jamais franchir

**Un constat n'est pas un accord sur un devis.** Ce sont deux décisions
différentes, prises à deux moments, et le modèle les sépare déjà :

- `inspections_points.decision_client` = le client accepte **que ce point soit
  chiffré** ;
- `devis.statut = 'accepte'` = le client accepte **le prix proposé**.

Le chemin ci-dessous relie les deux **sans les confondre** : il transforme un
constat en **ligne de devis à chiffrer**, jamais en engagement.

### Le chemin, étape par étape

| Étape | Ce qui se passe | Ce qui est écrit |
|---|---|---|
| 1 | Le mécanicien note un point `a_valider_client` ou `dommage`, avec photo | `inspections_points`, `inspections_photos` — existe |
| 2 | Le point est soumis au client (`soumis_client`) | existe |
| 3 | Le client valide ou refuse **le constat** | `decision_client` — existe |
| 4 | **Nouveau** : le garage choisit les points validés et clique « Chiffrer » | rien encore |
| 5 | **Nouveau** : une ligne de devis est créée par point retenu, **à 0 €**, libellé repris du point | `devis_lignes` |
| 6 | Le garage chiffre chaque ligne, à la main ou depuis le catalogue | existe |

**La ligne naît à 0 €, jamais à un prix deviné.** Un montant apparu tout seul
dans un devis est le plus sûr moyen d'envoyer un prix que personne n'a validé.
Zéro se voit ; un prix plausible ne se voit pas.

### Le point le plus délicat : la traçabilité

Relier une ligne de devis à son constat suppose une colonne
`devis_lignes.inspection_point_id` — **donc une migration**. Sans elle :

- on ne peut pas empêcher de chiffrer deux fois le même constat ;
- on ne peut pas montrer la photo à côté de la ligne, ce qui est pourtant
  l'argument commercial entier du contrôle photo ;
- le client reçoit un devis dont les lignes ne renvoient à rien.

**Conclusion : le lien constat → devis n'est pas faisable proprement sans
migration.** Le faire sans traçabilité produirait un doublonnage silencieux —
exactement le genre de défaut que ce chantier passe son temps à corriger.
**Non commencé, conformément à la consigne.**

### Critères d'acceptation (pour quand ce sera ouvert)

1. Seuls les points `a_valider_client` ou `dommage` **validés par le client**
   sont proposés au chiffrage.
2. Chiffrer crée une ligne par point, à 0 €, dans un devis **brouillon** — sur
   un devis accepté, c'est refusé avec un message clair.
3. Un point déjà chiffré n'est plus proposé, et l'écran dit pourquoi.
4. La photo du constat est consultable depuis la ligne de devis.
5. Rien n'est envoyé au client par ce geste : ni le devis, ni une notification.
6. Refuser le constat ne crée aucune ligne, et le point reste consultable.
7. Supprimer la ligne de devis ne supprime pas le constat.

---

## 4. Ce que ce plan ne fait pas, et ne fera pas

- **Aucun catalogue payant.** Ni barèmes de temps, ni bases pièces, ni
  compatibilités véhicule. Nexora n'en possède aucun, et la consigne l'exclut.
- **Aucun prix, temps ou compatibilité inventé.** Tout chiffre vient du garage.
- **Le garage reste responsable de la validation.** Rien ne part sans qu'il
  ait relu.
- **Constat ≠ accord sur le devis.** Deux décisions, deux moments, deux
  colonnes.
- **Aucun document accepté n'est modifié en silence** — la base l'interdit.

## 5. Décisions qui restent à Baptiste

1. **Le mot.** « Prestation composée » ou autre — mais pas « forfait », déjà
   pris par l'abonnement.
2. **Le chiffrage du catalogue.** 18 prestations sur 86 ont un prix. Les
   forfaits n'ont d'intérêt que si le garage accepte de chiffrer son catalogue.
   Faut-il le lui demander à la mise en route ?
3. **L'accueil compose-t-il ?** Ou seulement le dirigeant ?
4. **Accepte-t-on les deux migrations** (`prestations_composees` ×2, puis
   `devis_lignes.inspection_point_id`) ? Sans elles, aucun des deux chantiers
   n'est faisable proprement.
5. **L'alternative sans migration** (« reprendre les lignes d'un devis
   précédent ») vaut-elle la peine en attendant ?
