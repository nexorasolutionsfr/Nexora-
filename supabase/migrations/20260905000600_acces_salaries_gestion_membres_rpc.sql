-- Accès salariés V1 — 6/6 : gestion des accès, réservée au dirigeant.
--
-- `garage_membres` n'a aucune policy d'écriture (migration 1) et les
-- privilèges INSERT/UPDATE/DELETE y ont été révoqués pour `authenticated`.
-- La seule façon de créer, modifier ou révoquer un accès est donc d'appeler
-- l'une des fonctions ci-dessous, qui vérifient toutes que l'appelant est
-- dirigeant du garage visé.
--
-- Aucune de ces fonctions n'envoie quoi que ce soit. Elles ne créent aucun
-- compte, n'appellent aucune API Auth, ne déclenchent aucun e-mail, aucun
-- webhook, aucun n8n. L'utilisateur doit déjà exister dans `auth.users` :
-- le raccordement à un vrai mécanisme d'invitation par e-mail est
-- explicitement hors V1 et demande un feu vert.
--
-- Voir docs/architecture/acces-salaries-v1.md, section B.6.

create function public.lister_membres_garage(p_garage_id uuid)
returns table (
  membre_id uuid,
  user_id uuid,
  email text,
  role text,
  mecanicien_id uuid,
  mecanicien_nom text,
  actif boolean,
  revoked_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.a_acces_garage(p_garage_id, 'dirigeant') then
    raise exception 'Accès refusé';
  end if;

  return query
    select m.id,
           m.user_id,
           u.email::text,
           m.role,
           m.mecanicien_id,
           mec.nom,
           m.actif,
           m.revoked_at,
           m.created_at
    from public.garage_membres m
    join auth.users u on u.id = m.user_id
    left join public.mecaniciens mec on mec.id = m.mecanicien_id
    where m.garage_id = p_garage_id
    order by m.actif desc, m.created_at;
end;
$$;

comment on function public.lister_membres_garage(uuid) is
  'Membres d''un garage, réservé au dirigeant. Expose l''e-mail de connexion du membre — donnée nécessaire pour l''administrer — et rien d''autre de auth.users.';

create function public.inviter_membre_garage(
  p_garage_id uuid,
  p_user_id uuid,
  p_role text,
  p_mecanicien_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membre_id uuid;
begin
  if not public.a_acces_garage(p_garage_id, 'dirigeant') then
    raise exception 'Accès refusé';
  end if;

  if p_role is null or p_role not in ('dirigeant', 'accueil', 'mecanicien') then
    raise exception 'Rôle invalide';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'Utilisateur inconnu : le compte doit exister avant d''être rattaché';
  end if;

  -- Une fiche mécanicien ne peut venir que du garage visé, et seul le rôle
  -- mecanicien en porte une. La contrainte CHECK de la table le garantit
  -- aussi, mais un message explicite vaut mieux qu'une violation brute.
  if p_role = 'mecanicien' then
    if p_mecanicien_id is null then
      raise exception 'Une fiche mécanicien est obligatoire pour ce rôle';
    end if;
    if not exists (
      select 1 from public.mecaniciens m
      where m.id = p_mecanicien_id and m.garage_id = p_garage_id
    ) then
      raise exception 'Fiche mécanicien introuvable dans ce garage';
    end if;
  elsif p_mecanicien_id is not null then
    raise exception 'Seul le rôle mecanicien porte une fiche mécanicien';
  end if;

  insert into public.garage_membres
    (garage_id, user_id, role, mecanicien_id, invite_par)
  values (p_garage_id, p_user_id, p_role, p_mecanicien_id, auth.uid())
  on conflict (garage_id, user_id) do update
    set role = excluded.role,
        mecanicien_id = excluded.mecanicien_id,
        actif = true,
        revoked_at = null
  returning id into v_membre_id;

  return v_membre_id;
end;
$$;

comment on function public.inviter_membre_garage(uuid, uuid, text, uuid) is
  'Rattache un compte auth existant à un garage, ou réactive et met à jour une adhésion existante. N''envoie aucun e-mail et ne crée aucun compte : l''invitation sortante est hors V1.';

create function public.changer_role_membre(p_membre_id uuid, p_role text, p_mecanicien_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_garage_id uuid;
begin
  select m.garage_id into v_garage_id
  from public.garage_membres m
  where m.id = p_membre_id
  for update;

  if v_garage_id is null or not public.a_acces_garage(v_garage_id, 'dirigeant') then
    raise exception 'Membre introuvable ou accès refusé';
  end if;

  if p_role is null or p_role not in ('dirigeant', 'accueil', 'mecanicien') then
    raise exception 'Rôle invalide';
  end if;

  if p_role = 'mecanicien' and (
    p_mecanicien_id is null or not exists (
      select 1 from public.mecaniciens m
      where m.id = p_mecanicien_id and m.garage_id = v_garage_id
    )
  ) then
    raise exception 'Fiche mécanicien introuvable dans ce garage';
  end if;

  update public.garage_membres
    set role = p_role,
        mecanicien_id = case when p_role = 'mecanicien' then p_mecanicien_id else null end
    where id = p_membre_id;

  return true;
end;
$$;

create function public.revoquer_membre_garage(p_membre_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_garage_id uuid;
  v_user_id uuid;
begin
  select m.garage_id, m.user_id into v_garage_id, v_user_id
  from public.garage_membres m
  where m.id = p_membre_id
  for update;

  if v_garage_id is null or not public.a_acces_garage(v_garage_id, 'dirigeant') then
    raise exception 'Membre introuvable ou accès refusé';
  end if;

  -- Le propriétaire du garage ne peut pas être révoqué : son accès ne vient
  -- pas d'une adhésion mais de garages.owner_user_id. Révoquer sa ligne
  -- n'aurait aucun effet et laisserait croire le contraire.
  if exists (
    select 1 from public.garages g
    where g.id = v_garage_id and g.owner_user_id = v_user_id
  ) then
    raise exception 'Le propriétaire du garage ne peut pas être révoqué';
  end if;

  update public.garage_membres
    set actif = false, revoked_at = now()
    where id = p_membre_id and actif = true;

  return true;
end;
$$;

comment on function public.revoquer_membre_garage(uuid) is
  'Désactive une adhésion. L''effet est immédiat : tous les prédicats d''accès sont réévalués à chaque requête, sans attendre l''expiration du jeton de session du membre.';

revoke execute on function public.lister_membres_garage(uuid) from public;
revoke execute on function public.inviter_membre_garage(uuid, uuid, text, uuid) from public;
revoke execute on function public.changer_role_membre(uuid, text, uuid) from public;
revoke execute on function public.revoquer_membre_garage(uuid) from public;

grant execute on function public.lister_membres_garage(uuid) to authenticated;
grant execute on function public.inviter_membre_garage(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.changer_role_membre(uuid, text, uuid) to authenticated;
grant execute on function public.revoquer_membre_garage(uuid) to authenticated;
