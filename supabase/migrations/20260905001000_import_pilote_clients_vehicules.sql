-- Import pilote clients et véhicules — V1. MIGRATION NEUTRALISÉE.
--
-- CE QUE CE FICHIER CRÉAIT, ET POURQUOI IL NE LE CRÉE PLUS
--
-- Ce lot créait `public.importer_clients_vehicules(uuid, jsonb, boolean)`.
-- Entre-temps, `20260909000200_import_clients_vehicules_v1.sql` a été fusionnée
-- dans `main` et appliquée en Production : elle crée une fonction de MÊME NOM
-- et de MÊME SIGNATURE, reprise de celle-ci, avec deux différences décrites en
-- section D de docs/architecture/import-base-clients-v1.md.
--
-- Les deux se déclaraient en `create function` — pas `create or replace`. Sur
-- Production, ce fichier s'exécute APRÈS `20260909000200` malgré son numéro
-- plus ancien : il aurait échoué sur « function already exists » et fait
-- planter le déploiement en cours de route.
--
-- POURQUOI LA VERSION DE `main` EST GARDÉE COMME CANONIQUE
--
-- Elle corrige un défaut réel de celle-ci : le rapprochement des doublons ne
-- se faisait que par e-mail ou téléphone. Un client dépourvu des deux était
-- donc recréé à chaque import, si bien que rejouer le même fichier — ce que
-- fait un garage après une première tentative ratée — dupliquait
-- silencieusement toute cette population. La version de `main` ajoute un
-- rapprochement par nom normalisé.
--
-- CE QUE CETTE NEUTRALISATION CHANGE POUR L'UTILISATEUR
--
-- Rien. La version canonique est posée par `20260910000100`, qui reprend le
-- corps de `main` — donc sa correction des doublons — et lui remet la garde
-- par rôle de ce lot-ci : `a_acces_garage(p_garage_id, 'dirigeant',
-- 'accueil')`. `main` s'appuyait sur `garages.owner_user_id` faute de mieux,
-- `a_acces_garage()` n'existant pas encore en Production quand elle a été
-- écrite ; elle y existe une fois ce chantier fusionné.
--
-- L'accueil garde donc le droit d'importer, ce qui est la raison d'être de ce
-- chantier et ce qu'éprouve son banc supabase/tests/import_pilote_v1.sql. Le
-- propriétaire ne perd rien non plus : il est toujours `dirigeant` au sens de
-- `mon_role_garage()`.
--
-- ÉTAT SUR TEST
--
-- Ce fichier ayant DÉJÀ été appliqué sur Test dans sa version précédente, le
-- corriger ici ne le rejoue pas : Test conserve l'ancienne fonction jusqu'à ce
-- qu'elle y soit supprimée à la main, ce que `20260909000200` exige avant de
-- s'appliquer — son garde-fou refuse d'écraser une fonction existante, et
-- c'est voulu. Voir section H du même document.
--
-- Aucun autre objet n'était créé par ce lot : la fonction, son commentaire et
-- ses droits, rien d'autre. Il n'y a donc rien à conserver ici.

do $$
begin
  raise notice 'Migration neutralisee : importer_clients_vehicules est fournie par 20260909000200.';
end;
$$;
