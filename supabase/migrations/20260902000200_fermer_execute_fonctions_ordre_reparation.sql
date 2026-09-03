-- Ordre de Réparation V1 — correctif additif : fermer EXECUTE sur les
-- quatre fonctions trigger.
-- Référence : docs/architecture/ordre-reparation-v1.md (contrat validé),
-- revue de sécurité de la migration 20260902000100_ordres_reparation_v1.sql
-- après application sur Supabase Test (slawilafseganlbghgwx).
--
-- Constat vérifié directement sur Test (pg_proc.proacl, source d'autorité,
-- pas information_schema) : les quatre fonctions trigger de
-- 20260902000100 portaient `revoke execute on function ... from public;`,
-- mais restaient exécutables par anon, authenticated ET service_role —
-- ce projet accorde par défaut le privilège EXECUTE directement aux rôles
-- nommés (anon/authenticated/service_role), pas seulement au pseudo-rôle
-- PUBLIC. `revoke ... from public` seul ne retire donc rien de ces
-- privilèges par défaut, exactement le même mécanisme déjà documenté et
-- corrigé pour les privilèges de TABLE dans
-- 20260831001100_revenue_recovery_fermer_privileges_defaut.sql, mais
-- jamais généralisé aux fonctions de ce lot.
--
-- Portée strictement additive et minimale : cette migration ne fait que
-- fermer explicitement EXECUTE sur les 4 fonctions trigger existantes,
-- pour PUBLIC, anon, authenticated et service_role. Elle ne crée, ne
-- remplace, ne supprime et ne modifie AUCUN autre objet — aucune table,
-- aucune donnée, aucun ACL de table, aucune policy RLS, aucun trigger,
-- aucune fonction, et ne touche à aucune migration existante (notamment
-- pas 20260902000100_ordres_reparation_v1.sql, strictement inchangée).
--
-- Ces quatre fonctions restent toutes `returns trigger` : un appel SQL
-- direct était déjà refusé par Postgres indépendamment du privilège
-- EXECUTE ("trigger functions can only be called as triggers"). Cette
-- migration ferme néanmoins l'écart constaté par rapport à l'intention de
-- conception documentée, par rigueur et cohérence avec le reste du
-- schéma OR.

revoke execute on function public.ordres_reparation_set_updated_at() from public;
revoke execute on function public.ordres_reparation_set_updated_at() from anon;
revoke execute on function public.ordres_reparation_set_updated_at() from authenticated;
revoke execute on function public.ordres_reparation_set_updated_at() from service_role;

revoke execute on function public.ordres_reparation_check_integrite() from public;
revoke execute on function public.ordres_reparation_check_integrite() from anon;
revoke execute on function public.ordres_reparation_check_integrite() from authenticated;
revoke execute on function public.ordres_reparation_check_integrite() from service_role;

revoke execute on function public.ordres_reparation_lignes_check_integrite() from public;
revoke execute on function public.ordres_reparation_lignes_check_integrite() from anon;
revoke execute on function public.ordres_reparation_lignes_check_integrite() from authenticated;
revoke execute on function public.ordres_reparation_lignes_check_integrite() from service_role;

revoke execute on function public.ordres_reparation_log_historique() from public;
revoke execute on function public.ordres_reparation_log_historique() from anon;
revoke execute on function public.ordres_reparation_log_historique() from authenticated;
revoke execute on function public.ordres_reparation_log_historique() from service_role;
