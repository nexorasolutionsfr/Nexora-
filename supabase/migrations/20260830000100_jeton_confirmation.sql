-- Nexora Confirmation RDV — fermeture de l'ancien parcours par UUID + jeton opaque
-- Idempotent, non destructif (aucun DROP).

-- 0) pgcrypto (digest, gen_random_bytes) — schéma "extensions", convention Supabase.
-- Idempotent : ne recrée rien si déjà installée manuellement ou par une autre migration.
create extension if not exists pgcrypto with schema extensions;

-- 1) Fermeture de l'ancien parcours (UUID brut) : révoque l'accès anonyme,
--    et neutralise le corps des fonctions (retour vide / erreur) en défense en profondeur.
revoke execute on function public.lire_confirmation_rdv_public(uuid) from anon;
revoke execute on function public.repondre_confirmation_rdv_public(uuid, text) from anon;

create or replace function public.lire_confirmation_rdv_public(p_rdv_id uuid)
returns table (
  id uuid, client_nom text, vehicule text, prestation text,
  date_debut timestamptz, debut text, fin text,
  garage_nom text, statut_confirmation text
)
language sql security definer set search_path = public as $$
  select null::uuid, null::text, null::text, null::text, null::timestamptz, null::text, null::text, null::text, null::text
  where false;
$$;

create or replace function public.repondre_confirmation_rdv_public(p_rdv_id uuid, p_reponse text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Parcours obsolète : ce lien ne permet plus aucune action.';
end;
$$;

-- 2) Table des jetons opaques (empreinte SHA-256 uniquement, jamais le jeton brut)
create table if not exists public.confirmations_jetons (
  id uuid primary key default gen_random_uuid(),
  rendez_vous_id uuid not null references public.rendez_vous(id),
  garage_id uuid not null references public.garages(id),
  jeton_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.confirmations_jetons enable row level security;
-- Aucune policy : verrouillée pour anon/authenticated, accès uniquement via
-- les fonctions security definer ci-dessous ou en tant que postgres/service_role.

-- 3) Génération (jamais exposée à anon — appelée par le planificateur ou manuellement en test)
create or replace function public.creer_jeton_confirmation(p_rdv_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_token text;
  v_garage_id uuid;
  v_expires timestamptz;
begin
  select garage_id, date_debut into v_garage_id, v_expires from rendez_vous where id = p_rdv_id;
  if v_garage_id is null then
    raise exception 'Rendez-vous introuvable';
  end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into confirmations_jetons (rendez_vous_id, garage_id, jeton_hash, expires_at)
  values (p_rdv_id, v_garage_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_expires);
  return v_token;
end;
$$;
revoke execute on function public.creer_jeton_confirmation(uuid) from anon, authenticated;

-- 4) Lecture publique par jeton — expose uniquement le strict nécessaire
create or replace function public.lire_confirmation_par_jeton(p_token text)
returns table (
  garage_nom text, vehicule text, prestation text,
  date_debut timestamptz, debut text, fin text, statut_confirmation text
)
language sql security definer set search_path = public as $$
  select g.nom_garage,
         trim(coalesce(v.marque,'') || ' ' || coalesce(v.modele,'')),
         p.nom, rv.date_debut,
         to_char(rv.date_debut, 'HH24:MI'), to_char(rv.date_fin, 'HH24:MI'),
         rv.statut_confirmation
  from confirmations_jetons j
  join rendez_vous rv on rv.id = j.rendez_vous_id
  join garages g on g.id = j.garage_id
  left join vehicules v on v.id = rv.vehicule_id
  left join prestations p on p.id = rv.prestation_id
  where j.jeton_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and j.revoked_at is null
    and j.used_at is null
    and j.expires_at > now();
$$;
grant execute on function public.lire_confirmation_par_jeton(text) to anon;

-- 5) Réponse publique par jeton — usage unique, périmètre strict à un seul RDV
create or replace function public.repondre_confirmation_par_jeton(p_token text, p_reponse text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_jeton confirmations_jetons%rowtype;
begin
  if p_reponse not in ('confirme_par_client', 'report_demande', 'annule_par_client') then
    return false;
  end if;
  select * into v_jeton from confirmations_jetons
    where jeton_hash = v_hash and revoked_at is null and used_at is null and expires_at > now()
    for update;
  if not found then
    return false;
  end if;
  update confirmations_jetons set used_at = now() where id = v_jeton.id;
  update rendez_vous
    set statut_confirmation = p_reponse,
        confirmation_repondu_at = now(),
        statut = case when p_reponse = 'annule_par_client' then 'annule' else statut end
    where id = v_jeton.rendez_vous_id;
  return true;
end;
$$;
grant execute on function public.repondre_confirmation_par_jeton(text, text) to anon;

-- 6) Le planificateur génère désormais un jeton au lieu d'exposer l'UUID du RDV
create or replace function public.preparer_rappels_confirmation()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_rdv record;
  v_token text;
begin
  for v_rdv in
    select rv.id, rv.garage_id, rv.date_debut, c.email
    from rendez_vous rv
    join garages g on g.id = rv.garage_id
    left join clients c on c.id = rv.client_id
    where rv.statut = 'confirme'
      and rv.source = 'test'
      and g.rappel_confirmation_actif = true
      and rv.date_debut > now()
      and rv.date_debut - (coalesce(g.delai_confirmation_rdv_h, 24) || ' hours')::interval <= now()
      and not exists (
        select 1 from confirmations_rappels_file f
        where f.rendez_vous_id = rv.id and f.echeance_rdv = rv.date_debut
      )
  loop
    v_token := public.creer_jeton_confirmation(v_rdv.id);
    insert into confirmations_rappels_file (garage_id, rendez_vous_id, echeance_rdv, destinataire_email, lien_public, statut)
    values (v_rdv.garage_id, v_rdv.id, v_rdv.date_debut, v_rdv.email,
            'https://nexora-garage.vercel.app/c/' || v_token, 'prepare');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
