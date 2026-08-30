-- Fonctions de la fonctionnalité "Contrôle véhicule digital / inspection".
-- Idempotent (create or replace), non destructif.

-- 1) Génération du lien — action manuelle du garage ("Copier le lien client"),
--    jamais appelée automatiquement. Security definer car inspections_jetons
--    est verrouillée (aucune policy) ; l'appartenance au garage est donc
--    vérifiée explicitement ici au lieu de compter sur RLS.
create or replace function public.creer_jeton_inspection(p_inspection_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_garage_id uuid;
  v_token text;
begin
  select i.garage_id into v_garage_id
  from inspections i
  join garages g on g.id = i.garage_id
  where i.id = p_inspection_id and g.owner_user_id = auth.uid();

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
$$;
revoke execute on function public.creer_jeton_inspection(uuid) from anon;
grant execute on function public.creer_jeton_inspection(uuid) to authenticated;

-- 2) Révocation manuelle du lien (ex. bouton "Révoquer le lien" côté garage,
--    en plus de la révocation automatique faite par reouvrir_inspection).
create or replace function public.revoquer_jeton_inspection(p_inspection_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_garage_id uuid;
begin
  select i.garage_id into v_garage_id
  from inspections i
  join garages g on g.id = i.garage_id
  where i.id = p_inspection_id and g.owner_user_id = auth.uid();

  if v_garage_id is null then
    raise exception 'Inspection introuvable ou accès refusé';
  end if;

  update inspections_jetons
    set revoked_at = now()
    where inspection_id = p_inspection_id and revoked_at is null;

  return true;
end;
$$;
revoke execute on function public.revoquer_jeton_inspection(uuid) from anon;
grant execute on function public.revoquer_jeton_inspection(uuid) to authenticated;

-- 3) Finalisation — verrouille l'inspection et calcule le statut global
--    uniquement à partir des points explicitement soumis au client (jamais
--    à partir des simples constats "dommage"). Security invoker : respecte
--    la RLS existante (garage propriétaire uniquement).
create or replace function public.finaliser_inspection(p_inspection_id uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_total int;
  v_new_statut text;
begin
  select count(*) into v_total
  from inspections_points
  where inspection_id = p_inspection_id and soumis_client = true;

  v_new_statut := case when v_total = 0 then 'finalisee_sans_decision' else 'en_attente_client' end;

  update inspections
    set statut = v_new_statut, verrouille_le = now()
    where id = p_inspection_id;

  if not found then
    raise exception 'Inspection introuvable ou accès refusé';
  end if;

  return v_new_statut;
end;
$$;
-- Security invoker : la RLS de "inspections" bloquerait déjà un appel anon
-- (auth.uid() n'y correspond à aucun garage), mais on révoque explicitement
-- l'exécution pour rester cohérent avec le reste de cette fonctionnalité
-- (défense en profondeur, jamais uniquement RLS).
revoke execute on function public.finaliser_inspection(uuid) from anon;
grant execute on function public.finaliser_inspection(uuid) to authenticated;

-- 4) Réouverture explicite — motif obligatoire, révoque le lien existant
--    AVANT toute modification possible, trace l'action en historique.
--    Security definer pour pouvoir révoquer le jeton (table verrouillée),
--    mais vérifie explicitement la propriété du garage.
create or replace function public.reouvrir_inspection(p_inspection_id uuid, p_motif text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_garage_id uuid;
  v_ancien_statut text;
begin
  if p_motif is null or length(trim(p_motif)) = 0 then
    raise exception 'Un motif est obligatoire pour réouvrir une inspection';
  end if;

  select i.garage_id, i.statut into v_garage_id, v_ancien_statut
  from inspections i
  join garages g on g.id = i.garage_id
  where i.id = p_inspection_id and g.owner_user_id = auth.uid();

  if v_garage_id is null then
    raise exception 'Inspection introuvable ou accès refusé';
  end if;

  -- Révocation du lien existant avant toute modification.
  update inspections_jetons
    set revoked_at = now()
    where inspection_id = p_inspection_id and revoked_at is null;

  -- Une décision client est immuable tant que l'inspection reste verrouillée
  -- (voir repondre_point_inspection_par_jeton). La réouverture est l'unique
  -- porte de sortie explicite : elle réinitialise les décisions des points
  -- soumis pour permettre une nouvelle finalisation et un nouveau lien.
  -- Conséquence assumée et tracée par cette même action, jamais silencieuse.
  update inspections_points
    set decision_client = null, decision_le = null
    where inspection_id = p_inspection_id and decision_client is not null;

  insert into inspections_historique (inspection_id, garage_id, action, ancien_statut, nouveau_statut, motif)
  values (p_inspection_id, v_garage_id, 'reouverture', v_ancien_statut, 'brouillon', trim(p_motif));

  update inspections
    set statut = 'brouillon', verrouille_le = null
    where id = p_inspection_id;

  return true;
end;
$$;
revoke execute on function public.reouvrir_inspection(uuid, text) from anon;
grant execute on function public.reouvrir_inspection(uuid, text) to authenticated;

-- 5) Lecture publique par jeton — portail client. Marque "consulté" au
--    premier accès. N'expose que le strict nécessaire ; les points non
--    soumis_client sont inclus en lecture seule (dont les "dommage") mais
--    sans jamais suggérer qu'une décision leur est demandée.
create or replace function public.lire_inspection_par_jeton(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_jeton inspections_jetons%rowtype;
  v_result jsonb;
begin
  select * into v_jeton from inspections_jetons
    where jeton_hash = v_hash and revoked_at is null and expires_at > now();
  if not found then
    return null;
  end if;

  update inspections
    set statut = 'consulte'
    where id = v_jeton.inspection_id and statut = 'en_attente_client';

  select jsonb_build_object(
    'garage_nom', g.nom_garage,
    'vehicule_libelle', coalesce(nullif(trim(coalesce(v.marque, '') || ' ' || coalesce(v.modele, '')), ''), i.vehicule_libelle_libre),
    'immatriculation', coalesce(v.immatriculation, i.immatriculation_libre),
    'kilometrage', i.kilometrage,
    'niveau_carburant', i.niveau_carburant,
    'statut', i.statut,
    'verrouille_le', i.verrouille_le,
    'points', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'categorie', p.categorie,
        'libelle', p.libelle,
        'etat', p.etat,
        'commentaire', p.commentaire,
        'soumis_client', p.soumis_client,
        'decision_client', p.decision_client,
        'decision_le', p.decision_le,
        'photos', coalesce((
          select jsonb_agg(ph.storage_path order by ph.created_at) from inspections_photos ph where ph.point_id = p.id
        ), '[]'::jsonb)
      ) order by p.created_at)
      from inspections_points p where p.inspection_id = i.id
    ), '[]'::jsonb)
  ) into v_result
  from inspections i
  join garages g on g.id = i.garage_id
  left join vehicules v on v.id = i.vehicule_id
  where i.id = v_jeton.inspection_id;

  return v_result;
end;
$$;
grant execute on function public.lire_inspection_par_jeton(text) to anon;

-- 6) Décision client par point — la validation d'un point ne vaut jamais
--    autorisation générale : chaque décision est rattachée à un seul point.
--    Décision immuable une fois posée (correction = réouverture explicite
--    côté garage, jamais une modification silencieuse).
create or replace function public.repondre_point_inspection_par_jeton(p_token text, p_point_id uuid, p_decision text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_jeton inspections_jetons%rowtype;
  v_point inspections_points%rowtype;
  v_total int;
  v_decided int;
  v_valide int;
  v_refuse int;
  v_new_statut text;
begin
  if p_decision not in ('valide', 'refuse') then
    return false;
  end if;

  select * into v_jeton from inspections_jetons
    where jeton_hash = v_hash and revoked_at is null and expires_at > now()
    for update;
  if not found then
    return false;
  end if;

  select * into v_point from inspections_points
    where id = p_point_id and inspection_id = v_jeton.inspection_id and soumis_client = true
    for update;
  if not found then
    return false;
  end if;

  if v_point.decision_client is not null then
    return false;
  end if;

  update inspections_points set decision_client = p_decision, decision_le = now() where id = p_point_id;

  select count(*), count(decision_client),
         count(*) filter (where decision_client = 'valide'),
         count(*) filter (where decision_client = 'refuse')
    into v_total, v_decided, v_valide, v_refuse
    from inspections_points
    where inspection_id = v_jeton.inspection_id and soumis_client = true;

  if v_decided = 0 then
    v_new_statut := 'consulte';
  elsif v_decided = v_total and v_valide = v_total then
    v_new_statut := 'valide';
  elsif v_decided = v_total and v_refuse = v_total then
    v_new_statut := 'refuse';
  else
    v_new_statut := 'partiellement_valide';
  end if;

  update inspections set statut = v_new_statut where id = v_jeton.inspection_id;

  if v_decided = v_total then
    update inspections_jetons set used_at = now() where id = v_jeton.id and used_at is null;
  end if;

  return true;
end;
$$;
grant execute on function public.repondre_point_inspection_par_jeton(text, uuid, text) to anon;
