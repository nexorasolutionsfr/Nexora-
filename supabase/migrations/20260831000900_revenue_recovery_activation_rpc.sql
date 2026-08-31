-- Revenue Recovery V1 — correctif : point d'entrée validé pour
-- l'activation par garage.
-- Migration additive, idempotente, non destructive.
--
-- Ne construit AUCUN back-office : personne n'appelle cette fonction
-- aujourd'hui, elle n'est accordée à aucun rôle applicatif (authenticated,
-- anon). L'activation reste opérée manuellement via SQL Editor / accès
-- direct (service_role ou postgres), exactement comme aujourd'hui. Ce que
-- ça change : remplacer un UPDATE manuel improvisé par un point d'entrée
-- validé (upsert propre, autorise_le cohérent) — pour que l'équipe Nexora
-- puisse, plus tard, brancher un back-office minimal sur cette fonction
-- sans nouvelle migration ni nouvelle réflexion sur les garde-fous.

create or replace function public.revenue_recovery_definir_autorisation_garage(
  p_garage_id uuid,
  p_autorise boolean,
  p_motif text default null
)
returns public.revenue_recovery_garages_autorises
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.revenue_recovery_garages_autorises;
begin
  if not exists (select 1 from public.garages where id = p_garage_id) then
    raise exception 'Garage % introuvable', p_garage_id;
  end if;

  insert into public.revenue_recovery_garages_autorises (garage_id, autorise, motif, autorise_le)
  values (p_garage_id, p_autorise, p_motif, case when p_autorise then now() else null end)
  on conflict (garage_id) do update
    set autorise = excluded.autorise,
        motif = excluded.motif,
        autorise_le = case when excluded.autorise then now() else null end
  returning * into v_row;

  return v_row;
end;
$$;

-- Vulnérabilité démontrée sur le projet de test isolé : ce projet Supabase
-- accorde EXECUTE par défaut à anon, authenticated ET service_role au
-- moment de la création d'une fonction dans le schéma public (privilèges
-- par défaut configurés au niveau du schéma) — pas seulement à PUBLIC.
-- `revoke all ... from public` seul laissait donc anon (et authenticated,
-- et service_role) directement capables d'appeler cette fonction sur
-- n'importe quel garage, sans JWT ni vérification de propriété. Chaque
-- rôle applicatif doit être révoqué explicitement, avant tout GRANT.
revoke all on function public.revenue_recovery_definir_autorisation_garage(uuid, boolean, text) from public;
revoke all on function public.revenue_recovery_definir_autorisation_garage(uuid, boolean, text) from anon;
revoke all on function public.revenue_recovery_definir_autorisation_garage(uuid, boolean, text) from authenticated;
revoke all on function public.revenue_recovery_definir_autorisation_garage(uuid, boolean, text) from service_role;
-- Aucun GRANT à personne : appelable uniquement par un rôle qui n'est
-- soumis à aucun de ces REVOKE (postgres / le propriétaire de la base, via
-- un accès direct habilité — SQL Editor en tant que postgres, jamais via
-- la Data API applicative). C'est un choix délibéré : même service_role,
-- qui pourrait légitimement outrepasser le RLS, n'a pas besoin d'appeler
-- cette fonction tant qu'aucun back-office ne l'orchestre.

comment on function public.revenue_recovery_definir_autorisation_garage(uuid, boolean, text) is
  'Point d''entrée unique pour activer/désactiver un garage. Fermée à anon/authenticated/service_role explicitement (pas seulement à PUBLIC) : reste opérée manuellement (SQL Editor en tant que postgres) tant qu''aucun back-office n''existe.';
