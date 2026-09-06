-- L'étape d'atelier, atteignable depuis ce que le mécanicien connaît.
--
-- `atelier_avancer_etape(p_rdv_id, p_statut)` existe depuis le 2026-09-05 et
-- fait exactement ce qu'il faut. Elle est pourtant **inappelable par un
-- mécanicien** : elle demande l'identifiant du rendez-vous, et
-- `atelier_mes_ordres()` ne projette pas cette colonne. Le mécanicien connaît
-- son ordre, jamais le rendez-vous derrière. Constaté le 2026-09-06 en
-- construisant son écran.
--
-- Deux façons de corriger. Ajouter `rendez_vous_id` à la projection de
-- `atelier_mes_ordres()` obligerait à la supprimer puis la recréer — son type
-- de retour change — donc à rejouer ses REVOKE/GRANT, sur une fonction déjà
-- déployée. Ajouter une fonction qui part de l'ordre est strictement additif :
-- rien d'existant n'est touché.
--
-- Aucun droit nouveau : les contrôles sont ceux de la fonction du 09-05,
-- recopiés à l'identique, et `restitue` reste exclu — la restitution ouvre la
-- facturation, elle appartient à l'accueil ou au dirigeant.

create or replace function public.atelier_avancer_etape_par_ordre(
  p_ordre_id uuid,
  p_statut text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rdv_id uuid;
begin
  if p_statut is null or p_statut not in
    ('a_venir', 'depose', 'diagnostic', 'attente_piece', 'attente_client', 'intervention', 'pret')
  then
    raise exception 'Étape atelier invalide';
  end if;

  -- Même critère d'affectation que les quatre autres fonctions d'atelier :
  -- un ordre non affecté est traité comme un ordre inexistant, même message,
  -- aucune fuite d'existence.
  select o.rendez_vous_id into v_rdv_id
  from public.ordres_reparation o
  where o.id = p_ordre_id
    and o.mecanicien_id is not null
    and o.mecanicien_id = public.mon_mecanicien_id(o.garage_id)
    and o.statut <> 'annule';

  if v_rdv_id is null then
    raise exception 'Ordre de réparation introuvable ou accès refusé';
  end if;

  return public.atelier_avancer_etape(v_rdv_id, p_statut);
end;
$$;

comment on function public.atelier_avancer_etape_par_ordre(uuid, text) is
  'Change l''étape atelier à partir de l''ordre affecté, seul identifiant dont dispose un mécanicien. Délègue à atelier_avancer_etape(uuid, text) après le même contrôle d''affectation. Ajoutée le 2026-09-13 : la fonction du 09-05 demandait un rendez_vous_id que la projection du mécanicien ne contient pas.';

revoke execute on function public.atelier_avancer_etape_par_ordre(uuid, text) from public, anon, service_role;
grant execute on function public.atelier_avancer_etape_par_ordre(uuid, text) to authenticated;

do $$
begin
  if to_regprocedure('public.atelier_avancer_etape_par_ordre(uuid, text)') is null then
    raise exception 'Migration 20260913000200 incomplete : la fonction est absente';
  end if;
  if to_regprocedure('public.atelier_avancer_etape(uuid, text)') is null then
    raise exception 'Migration 20260913000200 incomplete : la fonction deleguee du 09-05 est absente';
  end if;
  raise notice 'atelier_avancer_etape_par_ordre posee';
end;
$$;
