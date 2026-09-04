-- Accès salariés V1 — 5/6 : les RPC de liens client deviennent conscientes
-- du rôle.
--
-- Six fonctions vérifiaient l'appartenance en dur, par
-- `join garages g on g.id = ... where g.owner_user_id = auth.uid()`. Cette
-- forme aurait refusé le lien client à un dirigeant comme à un salarié
-- d'accueil, alors que l'envoi du lien est précisément le geste de
-- l'accueil.
--
-- Chaque corps est repris À L'IDENTIQUE depuis la définition en base
-- relevée le 2026-09-05 sur Test, à une seule différence près : la
-- condition d'appartenance passe de `g.owner_user_id = auth.uid()` à
-- `public.a_acces_garage(g.id, 'dirigeant', 'accueil')`. Signature, type de
-- retour, SECURITY DEFINER, search_path, durées d'expiration, révocation du
-- jeton précédent et messages d'erreur sont inchangés. `create or replace`
-- préserve les ACL EXECUTE déjà accordées.
--
-- `creer_jeton_facture` n'est volontairement PAS touchée : elle reste
-- réservée au propriétaire et au dirigeant, par `current_garage_id()` et par
-- sa condition existante. La facturation n'entre pas dans le périmètre de
-- l'accueil.
--
-- Voir docs/architecture/acces-salaries-v1.md, section B.5.

create or replace function public.creer_jeton_devis(p_devis_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_garage_id uuid;
  v_token text;
begin
  select d.garage_id into v_garage_id
  from public.devis d
  join public.garages g on g.id = d.garage_id
  where d.id = p_devis_id and public.a_acces_garage(g.id, 'dirigeant', 'accueil')
  for update of d;

  if v_garage_id is null then
    raise exception 'Devis introuvable ou accès refusé';
  end if;

  update public.devis_jetons
    set revoked_at = now()
    where devis_id = p_devis_id and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.devis_jetons (devis_id, garage_id, jeton_hash, expires_at)
  values (p_devis_id, v_garage_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '30 days');

  return v_token;
end;
$function$;

create or replace function public.revoquer_jeton_devis(p_devis_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_garage_id uuid;
begin
  select d.garage_id into v_garage_id
  from public.devis d
  join public.garages g on g.id = d.garage_id
  where d.id = p_devis_id and public.a_acces_garage(g.id, 'dirigeant', 'accueil')
  for update of d;

  if v_garage_id is null then
    raise exception 'Devis introuvable ou accès refusé';
  end if;

  update public.devis_jetons
    set revoked_at = now()
    where devis_id = p_devis_id and revoked_at is null;

  return true;
end;
$function$;

create or replace function public.creer_jeton_atelier(p_rdv_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_garage_id uuid;
  v_date_debut timestamptz;
  v_token text;
begin
  select rv.garage_id, rv.date_debut into v_garage_id, v_date_debut
  from public.rendez_vous rv
  join public.garages g on g.id = rv.garage_id
  where rv.id = p_rdv_id and public.a_acces_garage(g.id, 'dirigeant', 'accueil')
  for update of rv;

  if v_garage_id is null then
    raise exception 'Rendez-vous introuvable ou accès refusé';
  end if;

  update public.atelier_jetons
    set revoked_at = now()
    where rendez_vous_id = p_rdv_id and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.atelier_jetons (rendez_vous_id, garage_id, jeton_hash, expires_at)
  values (p_rdv_id, v_garage_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_date_debut + interval '7 days');

  return v_token;
end;
$function$;

create or replace function public.revoquer_jeton_atelier(p_rdv_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_garage_id uuid;
begin
  select rv.garage_id into v_garage_id
  from public.rendez_vous rv
  join public.garages g on g.id = rv.garage_id
  where rv.id = p_rdv_id and public.a_acces_garage(g.id, 'dirigeant', 'accueil')
  for update of rv;

  if v_garage_id is null then
    raise exception 'Rendez-vous introuvable ou accès refusé';
  end if;

  update public.atelier_jetons
    set revoked_at = now()
    where rendez_vous_id = p_rdv_id and revoked_at is null;

  return true;
end;
$function$;

-- Les deux fonctions d'inspection conservent leur `search_path = 'public'`
-- d'origine et leurs références non qualifiées : les reprendre à
-- l'identique évite d'introduire un changement de résolution de noms au
-- passage.
create or replace function public.creer_jeton_inspection(p_inspection_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_garage_id uuid;
  v_token text;
begin
  select i.garage_id into v_garage_id
  from inspections i
  join garages g on g.id = i.garage_id
  where i.id = p_inspection_id and public.a_acces_garage(g.id, 'dirigeant', 'accueil');

  if v_garage_id is null then
    raise exception 'Inspection introuvable ou accès refusé';
  end if;

  -- Un seul lien actif à la fois par inspection : régénérer en révoque un
  -- éventuel précédent (ex. après réouverture, ou renvoi volontaire).
  update inspections_jetons
    set revoked_at = now()
    where inspection_id = p_inspection_id and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into inspections_jetons (inspection_id, garage_id, jeton_hash, expires_at)
  values (p_inspection_id, v_garage_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '30 days');

  return v_token;
end;
$function$;

create or replace function public.revoquer_jeton_inspection(p_inspection_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_garage_id uuid;
begin
  select i.garage_id into v_garage_id
  from inspections i
  join garages g on g.id = i.garage_id
  where i.id = p_inspection_id and public.a_acces_garage(g.id, 'dirigeant', 'accueil');

  if v_garage_id is null then
    raise exception 'Inspection introuvable ou accès refusé';
  end if;

  update inspections_jetons
    set revoked_at = now()
    where inspection_id = p_inspection_id and revoked_at is null;

  return true;
end;
$function$;
