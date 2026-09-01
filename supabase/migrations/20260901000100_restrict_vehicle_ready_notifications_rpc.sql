-- Sécurité : confine l'accès à la fonction SECURITY DEFINER
-- public.notifications_vehicule_pret_en_attente().
--
-- Cette fonction ne prend aucun paramètre et ne filtre pas par garage : elle
-- retourne l'intégralité des notifications "véhicule prêt" non envoyées,
-- tous garages confondus (nom et email client, libellé véhicule, lien de
-- paiement). Elle était exécutable par PUBLIC/anon/authenticated (privilège
-- EXECUTE par défaut de PostgreSQL à la création d'une fonction), alors
-- qu'elle est destinée à un usage interne/automatisation, jamais à un appel
-- client direct.
--
-- Correctif validé au préalable sur le projet Supabase de test isolé
-- (slawilafseganlbghgwx) : après application, un appel anonyme retourne
-- HTTP 401 / code PostgreSQL 42501 (permission denied), sans exposer de
-- donnée. Aucune donnée métier n'est modifiée par cette migration.
--
-- service_role reste explicitement autorisé (accès interne/automatisation),
-- ainsi que le propriétaire de la fonction. Ni le corps, ni le propriétaire,
-- ni le search_path de la fonction ne sont modifiés.

begin;

revoke execute
on function public.notifications_vehicule_pret_en_attente()
from public, anon, authenticated;

grant execute
on function public.notifications_vehicule_pret_en_attente()
to service_role;

commit;
