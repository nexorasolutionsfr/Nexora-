-- Inspections — privilèges Data API pour le dashboard garage (authenticated).
-- "Automatically expose new tables" est désactivé sur ce projet : sans ce GRANT
-- explicite, RLS seule ne suffit pas et authenticated n'a aucun privilège
-- (même problème déjà rencontré et corrigé sur travaux_differes, cf.
-- 20260830000300_travaux_differes_grants.sql). Idempotent, non destructif.

grant select, insert, update, delete on public.inspections_points to authenticated;
grant select, insert, update on public.inspections to authenticated;
grant select, insert, update, delete on public.inspections_photos to authenticated;
grant select, insert on public.inspections_historique to authenticated;

-- Aucun droit à anon sur ces tables : le portail client public ne lit/écrit
-- jamais directement les tables, uniquement via les fonctions security definer
-- de 20260830000700_inspections_rpc.sql.
-- Aucun droit delete sur inspections/inspections_historique : une inspection
-- n'est jamais supprimée. delete autorisé sur inspections_points/inspections_photos
-- uniquement pour corriger un brouillon avant finalisation (l'UI bloque la
-- suppression une fois l'inspection verrouillée ; à faire respecter côté RLS
-- si un futur V2 l'exige).
