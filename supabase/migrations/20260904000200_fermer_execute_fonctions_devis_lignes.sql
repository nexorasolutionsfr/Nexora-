-- Devis multi-lignes V1 — correctif additif : fermer EXECUTE sur les
-- fonctions du lot pour anon et service_role.
-- Référence : docs/architecture/devis-multi-lignes-v1.md (contrat validé),
-- vérification post-migration de 20260904000100_devis_lignes_v1.sql après
-- application officielle (`supabase db push`) sur Supabase Test
-- (slawilafseganlbghgwx), le 2026-09-04.
--
-- Constat vérifié sur Test (has_function_privilege) : devis_statut_modifiable
-- restait exécutable par anon ET service_role, alors que 20260904000100 ne
-- l'accorde qu'à authenticated. Même mécanisme que celui déjà documenté et
-- corrigé pour le lot Ordre de Réparation dans
-- 20260902000200_fermer_execute_fonctions_ordre_reparation.sql : ce projet
-- accorde par défaut EXECUTE directement aux rôles nommés
-- (anon/authenticated/service_role), pas seulement au pseudo-rôle PUBLIC ;
-- `revoke ... from public` seul ne retire donc rien. Le banc local ne
-- pouvait pas le voir : un cluster PostgreSQL vierge n'a pas ces privilèges
-- par défaut.
--
-- Portée strictement additive et minimale : uniquement des REVOKE EXECUTE.
-- Aucune table, donnée, ACL de table, policy, trigger ou fonction créée,
-- remplacée, supprimée ou modifiée ; 20260904000100 reste strictement
-- inchangée.
--
-- devis_statut_modifiable : authenticated CONSERVE EXECUTE. C'est le
-- correctif du P0 de la revue du 2026-09-04 — les deux fonctions trigger
-- SECURITY INVOKER qui l'appellent s'exécutent sous le rôle appelant, qui
-- doit détenir ce privilège. Seuls anon et service_role sont fermés ici.
--
-- Les quatre autres fonctions sont `returns trigger` : un appel SQL direct
-- est déjà refusé par Postgres indépendamment d'EXECUTE ("trigger functions
-- can only be called as triggers"). Fermeture par rigueur et cohérence avec
-- l'intention documentée, comme pour le lot OR.

revoke execute on function public.devis_statut_modifiable(text) from anon;
revoke execute on function public.devis_statut_modifiable(text) from service_role;
-- (authenticated volontairement conservé — voir ci-dessus.)

revoke execute on function public.devis_lignes_set_updated_at() from public;
revoke execute on function public.devis_lignes_set_updated_at() from anon;
revoke execute on function public.devis_lignes_set_updated_at() from authenticated;
revoke execute on function public.devis_lignes_set_updated_at() from service_role;

revoke execute on function public.devis_lignes_check_integrite() from public;
revoke execute on function public.devis_lignes_check_integrite() from anon;
revoke execute on function public.devis_lignes_check_integrite() from authenticated;
revoke execute on function public.devis_lignes_check_integrite() from service_role;

revoke execute on function public.devis_check_immuabilite() from public;
revoke execute on function public.devis_check_immuabilite() from anon;
revoke execute on function public.devis_check_immuabilite() from authenticated;
revoke execute on function public.devis_check_immuabilite() from service_role;

revoke execute on function public.devis_lignes_recalculer_totaux() from public;
revoke execute on function public.devis_lignes_recalculer_totaux() from anon;
revoke execute on function public.devis_lignes_recalculer_totaux() from authenticated;
revoke execute on function public.devis_lignes_recalculer_totaux() from service_role;
