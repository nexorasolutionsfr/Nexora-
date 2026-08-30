-- Durcissement : le bucket des photos d'inspection passe en privé.
-- Un chemin UUID non devinable ne constitue pas une protection suffisante
-- pour des données sensibles (état d'un véhicule, rattachable à un client).
-- Idempotent, non destructif : ne touche à aucune autre donnée.

update storage.buckets set public = false where id = 'inspections-photos';

-- Les policies "authenticated" créées dans 20260830000600_inspections_jetons.sql
-- (lecture/écriture/suppression scoping strict par garage_id) suffisent
-- désormais réellement à protéger les objets en LECTURE aussi : un bucket
-- public ignorait la RLS pour les téléchargements, un bucket privé la fait
-- respecter. Le dashboard garage continue de fonctionner via des URLs
-- signées générées côté navigateur avec la session authenticated (autorisée
-- par ces mêmes policies).
--
-- Aucune policy anon n'existe et aucune n'est ajoutée ici : le portail
-- client public n'a plus aucun accès direct au bucket. Il obtient des URLs
-- signées de courte durée via la route serveur app/api/inspections/photos
-- (service role), uniquement après revalidation du jeton d'inspection
-- correspondant. Voir aussi 20260830000700_inspections_rpc.sql pour la
-- lecture du rapport (métadonnées, sans accès aux fichiers).
