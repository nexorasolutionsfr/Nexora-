-- Accès salariés — l'entrée du salarié dans SON garage.
--
-- CE QUE LA RECETTE DU 2026-09-06 A MONTRÉ
--
-- Le lot « accès salariés » est complet côté base : rôles, 25 policies,
-- RPC d'atelier, révocation. Il a été rejoué ce jour sur Test avec deux
-- comptes réels — un rôle `accueil` lit bien les clients de son garage, et
-- perd tout à la seconde où le dirigeant le révoque.
--
-- Il manque pourtant une ligne pour que ce lot serve à quoi que ce soit :
-- **un salarié ne peut pas lire la ligne `garages` de son propre garage.**
-- La policy SELECT de `garages` ne connaît que `owner_user_id`. Mesuré sur
-- Test : un membre `accueil` actif obtient 5 clients, 3 véhicules… et zéro
-- garage. Or l'application résout le garage par cette table avant tout le
-- reste. Le salarié se connecte, aucun garage n'est trouvé, et l'écran de
-- mise en service lui propose d'en créer un second.
--
-- CE QUE CETTE MIGRATION FAIT, ET CE QU'ELLE NE FAIT PAS
--
-- Elle ouvre la LECTURE de la ligne du garage aux adhésions actives, et
-- rien d'autre. Aucune écriture : `garages_self_update` reste réservée au
-- propriétaire, et les privilèges UPDATE de `authenticated` restent ceux
-- posés par 20260909000700. Un salarié ne modifie pas les réglages du
-- garage, ne touche pas à l'abonnement, ne voit rien de plus qu'avant sur
-- les autres tables.
--
-- Comme la policy du propriétaire, celle-ci n'est PAS filtrée par
-- `acces_garage_ouvert()` : à l'échéance du mois offert, le salarié doit
-- voir l'écran « votre accès est terminé » comme le dirigeant, pas une
-- application vide. Le verrou continue de fermer toutes les autres tables.

drop policy if exists garages_membre_select on public.garages;
create policy garages_membre_select on public.garages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.garage_membres m
      where m.garage_id = garages.id
        and m.user_id = auth.uid()
        and m.actif = true
        and m.revoked_at is null
    )
  );

comment on policy garages_membre_select on public.garages is
  'Lecture seule de sa propre ligne garage par un salarié dont l''adhésion est active. Ajoutée le 2026-09-13 : sans elle, un salarié se connecte et l''application lui propose de créer un second garage. Aucune écriture n''est ouverte par cette policy.';

-- ── Le garage du salarié, sans qu'il ait à le connaître ────────────────────
--
-- L'application ne peut pas demander à un salarié l'identifiant du garage
-- qu'il rejoint. Cette fonction le lui rend, avec son rôle, à partir de sa
-- seule session. Elle ne révèle jamais l'existence d'un garage auquel
-- l'appelant n'appartient pas.
create or replace function public.mes_adhesions()
returns table (garage_id uuid, nom_garage text, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.garage_id, g.nom_garage, m.role
  from public.garage_membres m
  join public.garages g on g.id = m.garage_id
  where m.user_id = auth.uid()
    and m.actif = true
    and m.revoked_at is null
  order by m.created_at, m.id
$$;

comment on function public.mes_adhesions() is
  'Les garages où le compte connecté a une adhésion active, avec son rôle. Sert à résoudre le garage d''un salarié, qui n''en est pas propriétaire. Ne dit rien des garages auxquels l''appelant n''appartient pas.';

revoke execute on function public.mes_adhesions() from public, anon, service_role;
grant execute on function public.mes_adhesions() to authenticated;

-- ── Rattacher un compte par son adresse, pas par son UUID ──────────────────
--
-- `inviter_membre_garage` prend un `uuid`. Aucun garage ne connaît l'UUID de
-- son salarié : l'écran de gestion des accès le demandait pourtant tel quel,
-- ce qui rendait la fonctionnalité inutilisable hors console Supabase.
--
-- Cette fonction ne crée aucun compte et n'envoie aucun e-mail — le salarié
-- crée le sien depuis « Créer mon espace ». Elle ne dit pas non plus si une
-- adresse existe ou non chez un autre garage : son message d'échec est le
-- même dans tous les cas où l'adresse n'est pas rattachable.
create or replace function public.inviter_membre_par_email(
  p_garage_id uuid,
  p_email text,
  p_role text,
  p_mecanicien_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.a_acces_garage(p_garage_id, 'dirigeant') then
    raise exception 'Accès refusé';
  end if;

  if v_email = '' then
    raise exception 'Adresse e-mail manquante' using errcode = '22023';
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(u.email) = v_email
  limit 1;

  if v_user_id is null then
    raise exception 'Aucun compte Nexora avec cette adresse. Demandez à la personne de créer son espace, puis recommencez.'
      using errcode = 'P0002';
  end if;

  return public.inviter_membre_garage(p_garage_id, v_user_id, p_role, p_mecanicien_id);
end;
$$;

comment on function public.inviter_membre_par_email(uuid, text, text, uuid) is
  'Rattache un compte existant à un garage à partir de son adresse e-mail, pour le dirigeant de ce garage uniquement. N''envoie aucun e-mail et ne crée aucun compte. Ajoutée le 2026-09-13 : l''écran de gestion des accès demandait un UUID qu''aucun garage ne connaît.';

revoke execute on function public.inviter_membre_par_email(uuid, text, text, uuid) from public, anon, service_role;
grant execute on function public.inviter_membre_par_email(uuid, text, text, uuid) to authenticated;

-- ── Vérification dans la transaction de la migration ───────────────────────
do $$
declare
  v_pb text := '';
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'garages'
      and policyname = 'garages_membre_select' and cmd = 'SELECT'
  ) then
    v_pb := v_pb || E'\n- la policy de lecture du membre est absente';
  end if;

  -- La policy du propriétaire, contrôlée par le verrou 20260909000900, doit
  -- rester en place : cette migration ajoute, elle ne remplace pas.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'garages' and cmd = 'SELECT'
      and coalesce(qual, '') like '%owner_user_id%'
  ) then
    v_pb := v_pb || E'\n- la policy de lecture du proprietaire a disparu';
  end if;

  -- Aucune écriture ne doit avoir été ouverte au passage.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'garages'
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
      and coalesce(qual, '') || coalesce(with_check, '') like '%garage_membres%'
  ) then
    v_pb := v_pb || E'\n- une policy d''ecriture reference garage_membres';
  end if;

  if to_regprocedure('public.mes_adhesions()') is null then
    v_pb := v_pb || E'\n- mes_adhesions() est absente';
  end if;
  if to_regprocedure('public.inviter_membre_par_email(uuid, text, text, uuid)') is null then
    v_pb := v_pb || E'\n- inviter_membre_par_email() est absente';
  end if;

  if v_pb <> '' then
    raise exception 'Migration 20260913000100 incomplete : %', v_pb;
  end if;
  raise notice 'Entree du membre posee : policy de lecture + mes_adhesions() + inviter_membre_par_email()';
end;
$$;
