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

revoke all on function public.revenue_recovery_definir_autorisation_garage(uuid, boolean, text) from public;
-- Volontairement AUCUN grant à authenticated ni anon : appelable
-- uniquement via service_role ou un accès direct habilité (SQL Editor).

comment on function public.revenue_recovery_definir_autorisation_garage(uuid, boolean, text) is
  'Point d''entrée unique pour activer/désactiver un garage. Non exposé à authenticated/anon : reste opéré manuellement (SQL Editor / service_role) tant qu''aucun back-office n''existe. Remplace un UPDATE manuel improvisé, sans en changer le mode opératoire actuel.';
