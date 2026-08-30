-- Travaux différés — privilèges Data API manquants.
-- "Automatically expose new tables" est désactivé sur ce projet : les GRANT ne sont
-- pas automatiques à la création d'une table. La RLS était active mais authenticated
-- et anon n'avaient aucun privilège SELECT/INSERT/UPDATE, ce qui bloquait le dashboard
-- ("Impossible de charger les travaux différés"). Idempotent, non destructif.

grant select, insert, update on public.travaux_differes to authenticated;
grant select, insert on public.travaux_differes_historique to authenticated;

-- Aucun droit à anon : ces tables ne sont jamais lues côté public.
-- Aucun droit delete : aucune interface V1 ne supprime ces données.
-- RLS existante inchangée (isolation garage_id toujours appliquée sous ces grants).
