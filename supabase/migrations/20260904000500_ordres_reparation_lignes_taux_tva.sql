-- Corrige le manque trouvé pendant la recette pilote du 2026-09-04 : une
-- facture ne peut pas calculer de TVA depuis un ordre de réparation, parce
-- que ordres_reparation_lignes n'a jamais porté ce taux. lignesDevisVersOR()
-- le jetait au passage en reprisant un devis vers un OR — perte
-- d'information, jamais un choix voulu. devis_lignes porte déjà ce taux avec
-- la même contrainte (0 à 100) ; ce lot l'étend à sa table sœur.
--
-- Additif : colonne nouvelle avec défaut, aucune ligne existante réécrite
-- autrement que par le défaut (20 %, TAUX_TVA_DEFAUT déjà utilisé partout
-- ailleurs dans le produit — pas une valeur inventée pour l'occasion).
-- prix_unitaire_ht reste nullable et « estimation interne, jamais une valeur
-- contractuelle » tant que l'OR n'est pas termine (comment de
-- 20260902000100_ordres_reparation_v1.sql, inchangé) : ce taux ne rend pas
-- une ligne contractuelle à lui seul, il permet seulement de calculer une
-- TVA quand la ligne a un prix et que l'OR est terminé.
alter table public.ordres_reparation_lignes
  add column taux_tva numeric(5, 2) not null default 20
    constraint ordres_reparation_lignes_taux_tva_borne check (taux_tva >= 0 and taux_tva <= 100);

comment on column public.ordres_reparation_lignes.taux_tva is
  'Taux de TVA de la ligne, en pourcentage. Même plage et même défaut que devis_lignes.taux_tva. Nécessaire pour calculer une facture depuis un OR terminé (contrat recette-pilote-corrections-v1.md, section C).';
