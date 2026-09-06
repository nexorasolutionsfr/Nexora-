-- Accès salariés V1 — 2/6 : résolution des rôles, en un seul endroit.
--
-- Deux fonctions nouvelles, et une seule fonction existante étendue.
--
-- `public.current_garage_id()` est remplacée par `create or replace`. C'est
-- la deuxième exception volontaire à l'interdiction habituelle de remplacer
-- une fonction, après 20260902000300 qui avait corrigé son search_path. Elle
-- est justifiée ici parce que cette fonction est le point d'entrée de 15
-- policies sur 12 tables : l'étendre au dirigeant donne la parité de droits
-- voulue sans réécrire ces 15 policies, donc sans risque de régression sur
-- des expressions qui fonctionnent aujourd'hui.
--
-- Sémantique préservée pour le propriétaire : la branche propriétaire est
-- évaluée en premier et court-circuite la seconde. Un utilisateur qui
-- possède un garage obtient exactement le même identifiant qu'avant cette
-- migration, quelles que soient ses adhésions par ailleurs. `limit 1` rend
-- le résultat déterministe là où l'ancienne écriture aurait renvoyé une
-- ligne arbitraire si un utilisateur possédait deux garages.
--
-- Signature, type de retour, STABLE, SECURITY DEFINER et search_path sont
-- conservés à l'identique. `create or replace` préserve l'ACL EXECUTE déjà
-- accordée (anon, authenticated, service_role) : aucun grant n'est requis.
--
-- Le rôle `accueil` et le rôle `mecanicien` ne sont volontairement PAS
-- résolus par cette fonction. Ils n'héritent donc d'aucun des droits
-- historiques, et n'obtiennent que ce que les migrations 3 à 5 accordent
-- explicitement. C'est le refus par défaut exigé par le contrat.
--
-- Voir docs/architecture/acces-salaries-v1.md, section B.2.

create function public.mon_role_garage(p_garage_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_garage_id is null or auth.uid() is null then null
    when exists (
      select 1 from public.garages g
      where g.id = p_garage_id and g.owner_user_id = auth.uid()
    ) then 'dirigeant'
    else (
      select m.role
      from public.garage_membres m
      where m.garage_id = p_garage_id
        and m.user_id = auth.uid()
        and m.actif = true
        and m.revoked_at is null
      limit 1
    )
  end
$$;

comment on function public.mon_role_garage(uuid) is
  'Rôle de l''appelant sur ce garage : dirigeant s''il en est le propriétaire, sinon le rôle de son adhésion active, sinon NULL. Le propriétaire est toujours dirigeant, y compris si une adhésion contradictoire existait.';

create function public.a_acces_garage(p_garage_id uuid, variadic p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.mon_role_garage(p_garage_id) = any (p_roles), false)
$$;

comment on function public.a_acces_garage(uuid, text[]) is
  'Prédicat unique des policies et des RPC : vrai si le rôle de l''appelant sur ce garage figure parmi ceux passés en argument. Faux pour un garage inconnu, un utilisateur non connecté, une adhésion révoquée ou inactive.';

create or replace function public.current_garage_id()
returns uuid
language sql
stable security definer
set search_path = ''
as $$
  select coalesce(
    (
      select g.id
      from public.garages g
      where g.owner_user_id = auth.uid()
      order by g.created_at, g.id
      limit 1
    ),
    (
      select m.garage_id
      from public.garage_membres m
      where m.user_id = auth.uid()
        and m.role = 'dirigeant'
        and m.actif = true
        and m.revoked_at is null
      order by m.created_at, m.id
      limit 1
    )
  )
$$;

comment on function public.current_garage_id() is
  'Garage courant de l''appelant : son garage possédé en priorité, à défaut celui où il est dirigeant actif. Étendue le 2026-09-05 par le chantier accès salariés ; le comportement du propriétaire est inchangé. Les rôles accueil et mecanicien ne sont jamais résolus ici.';

revoke execute on function public.mon_role_garage(uuid) from public;
revoke execute on function public.a_acces_garage(uuid, text[]) from public;
grant execute on function public.mon_role_garage(uuid) to authenticated;
grant execute on function public.a_acces_garage(uuid, text[]) to authenticated;
