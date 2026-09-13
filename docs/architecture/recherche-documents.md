# Chercher un document par sa référence — ce que le modèle permet

Relevé en base le 13 septembre 2026, sur le projet Test, colonne par colonne.
Rien ici n'est supposé : chaque affirmation vient d'une requête.

## Ce qui est cherchable aujourd'hui

| Document | Référence lisible en base | Cherchable | Pourquoi |
|---|---|---|---|
| **Facture** | `factures.numero`, ex. `F-2026-0003` | **oui, livré** | Posée par le trigger `assigner_numero_facture`, immuable (`factures_check_immuabilite` refuse de la changer), **imprimée sur le document que le client reçoit**. Le garagiste l'a sous les yeux. |
| **Devis** | aucune | non | La table `devis` n'a pas de colonne de numéro. Ni la page publique `/devis/[token]`, ni l'e-mail, ni le PDF n'affichent de référence. |
| **Ordre de réparation** | aucune | non | Idem : `ordres_reparation` ne porte que son `id`. |

## Pourquoi on n'a pas rendu les devis cherchables

Le dossier véhicule affiche « Réf. 3F2A1B » pour un devis non rattaché — six
caractères dérivés de son identifiant technique. C'est un repère d'écran,
utile pour distinguer deux devis dans une liste. Ce n'est pas une référence :

- elle n'est sur aucun document reçu par le client ;
- elle n'existe nulle part ailleurs dans le produit ;
- personne ne peut la taper de mémoire ou la lire sur un papier.

Rendre cherchable un identifiant qu'on ne peut pas connaître donne un champ où
rien ne se tape. Et **inventer** une numérotation de devis à la place serait
pire : un numéro de devis est une pièce qui engage le garage, sa forme et sa
continuité relèvent d'une décision comptable, pas d'une commodité d'interface.

## Le plus petit changement futur qui débloquerait la recherche de devis

Une migration additive, sur le modèle exact de ce que les factures font déjà :

1. `alter table devis add column numero text` ;
2. un trigger `assigner_numero_devis` calqué sur `assigner_numero_facture`,
   avec son propre compteur par garage (`garages.dernier_numero_devis`) et un
   préfixe distinct — `D-2026-0001`, pour qu'un numéro de devis ne puisse
   jamais être confondu avec un numéro de facture ;
3. affichage du numéro sur la page publique du devis et dans l'e-mail, sans
   quoi le client et le garage n'auront toujours pas la même référence ;
4. rattrapage des devis existants dans la même migration — sinon la moitié du
   fichier reste introuvable et la recherche ment par omission.

Le point 3 est le vrai travail : sans lui, les points 1 et 2 ajoutent une
colonne que personne ne lit. Les points 1, 2 et 4 sont une migration de
Production : hors du périmètre d'un lot d'interface.

**Décision à prendre par Baptiste**, pas par le code : un garage veut-il un
numéro de devis sur ses documents ? Certains garages n'en veulent pas, et
préfèrent que le devis n'existe qu'en tant que proposition informelle.

## Portée de la recherche, et ce qui la protège

La recherche est **locale** : elle porte sur les données déjà chargées par le
tableau de bord pour le garage courant. Elle n'a aucun moyen d'atteindre une
ligne d'un autre garage, et ce n'est pas une propriété de l'interface :

- `factures`, `clients` et `vehicules` sont chargés avec
  `.eq("garage_id", garageId)` ;
- les policies RLS (`factures_scope`, `factures_accueil_*`) refusent de leur
  côté toute ligne hors garage, même si un appel oubliait le filtre ;
- `rechercherFactures` ne cherche que dans le tableau qu'on lui donne — un
  test fige cette propriété.

Les factures ne sont proposées à la recherche que pour les rôles qui y ont
droit (`peutFacturer` : dirigeant et accueil). Le mécanicien n'a pas la barre
de recherche du tout : elle est conditionnée à `peutVoir(monRole, "clients")`.

**Limite de volume, déjà documentée** : au-delà de ~2 000 véhicules ou factures
par garage, il faudra passer à une recherche côté base. La limite est connue,
pas contournée en silence.
