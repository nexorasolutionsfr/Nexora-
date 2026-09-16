-- Nexora Auto — consolidation : droits exacts sur toutes les tables `auto_*`.
--
-- ================================================================
-- 1. LE BESOIN
-- ================================================================
--
-- Les droits par défaut du schéma `public` donnent à `anon` et à
-- `authenticated` TOUS les privilèges sur chaque table ou séquence nouvelle.
-- Les lots A à C retiraient ceux de `anon` et accordaient à `authenticated`
-- ce qu'il fallait, sans retirer le reste. Relevé sur Test le 16 sept. 2026 :
--
-- - `authenticated` gardait TRUNCATE, REFERENCES et TRIGGER sur les sept
--   tables des lots A à C (TRUNCATE ignore la RLS) ;
-- - `authenticated` gardait DELETE sur `auto_preferences` (non prévu) ;
-- - `anon` et `authenticated` gardaient l'usage de la séquence du journal
--   d'envois `auto_rappels_envois_id_seq`.
--
-- L'API REST ne permet ni TRUNCATE, ni TRIGGER, ni REFERENCES : aucune donnée
-- n'était exposée. Mais un droit inutile n'a pas à exister avant la
-- Production. Cette migration repart de zéro pour chaque table : tout est
-- retiré à `public`, `anon` et `authenticated`, puis seuls les droits voulus
-- sont rendus. `service_role` garde tout.
--
-- ================================================================
-- 2. DROITS DE `authenticated` APRÈS CETTE MIGRATION
-- ================================================================
--
-- auto_vehicules, auto_releves_km, auto_historique, auto_documents,
-- auto_taches, auto_rappels_reports  : select, insert, update, delete (RLS)
-- auto_preferences                    : select, insert, update (RLS)
-- auto_services, auto_services_modes, auto_offres : select (RLS)
-- auto_rappels_envois et sa séquence  : aucun
-- `anon` : aucun droit sur aucune table ni séquence `auto_*`.
--
-- Le banc supabase/tests/auto_droits_v1.sql compare ces droits, table par
-- table, à la liste attendue : toute table `auto_*` nouvelle sans droits
-- déclarés le fait échouer.
--
-- ================================================================
-- 3. RETOUR ARRIÈRE
-- ================================================================
--
-- Aucun besoin fonctionnel : les droits retirés ne servaient pas. Pour
-- revenir à l'état antérieur, réaccorder `all` à `authenticated` sur les
-- tables des lots A à C et `usage, select, update` sur la séquence à `anon`
-- et `authenticated`.

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'auto_vehicules', 'auto_releves_km', 'auto_historique', 'auto_documents',
    'auto_taches', 'auto_preferences', 'auto_rappels_reports', 'auto_rappels_envois',
    'auto_services', 'auto_services_modes', 'auto_offres'
  ] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', v_table);
    execute format('grant all on table public.%I to service_role', v_table);
  end loop;
end;
$$;

grant select, insert, update, delete on table
  public.auto_vehicules, public.auto_releves_km, public.auto_historique, public.auto_documents,
  public.auto_taches, public.auto_rappels_reports
  to authenticated;
grant select, insert, update on table public.auto_preferences to authenticated;
grant select on table public.auto_services, public.auto_services_modes, public.auto_offres to authenticated;

revoke all on sequence public.auto_rappels_envois_id_seq from public, anon, authenticated;
grant all on sequence public.auto_rappels_envois_id_seq to service_role;
