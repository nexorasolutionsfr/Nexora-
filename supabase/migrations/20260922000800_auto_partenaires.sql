-- Nexora Auto — consolidation : une offre portée par un partenaire, quel que
-- soit son métier.
--
-- ================================================================
-- 1. LE BESOIN
-- ================================================================
--
-- Le lot D rattachait chaque offre à `garages`. Or `garages` est le compte
-- d'abonnement Nexora Pro (facturation, Stripe, Gmail, numérotation des
-- factures) : un centre de contrôle technique, un laveur ou un mécanicien à
-- domicile n'en aura pas forcément. Les offres doivent pouvoir être portées
-- par des professionnels de métiers différents.
--
-- a. `auto_partenaires` : le professionnel qui propose des prestations aux
--    automobilistes. Un métier parmi :
--      garage, mecanicien_mobile, centre_controle_technique,
--      lavage_detailing, centre_pneus.
--    `garage_id` (facultatif, unique) relie le partenaire à son compte
--    Nexora Pro quand il en a un : ce compte servira de back-office, quel
--    que soit le métier. Créé inactif ; aucun partenaire n'existe.
-- b. `auto_offres.partenaire_id` remplace `auto_offres.garage_id`. La table
--    est vide (aucune offre n'a jamais été créée) : la migration le vérifie
--    et s'arrête sinon.
-- c. Cohérence métier ↔ offre (déclencheur `auto_offres_coherence`) :
--    - « chez un professionnel » suppose un lieu d'accueil : pas pour un
--      mécanicien à domicile ;
--    - un centre de contrôle technique ne propose que le contrôle technique
--      (l'activité de contrôle est incompatible avec la réparation) ;
--    - le contrôle technique « chez un professionnel » n'est proposé que par
--      un centre de contrôle technique.
--    Avec collecte et restitution, un autre professionnel peut convoyer la
--    voiture vers un centre.
--
-- ================================================================
-- 2. DROITS
-- ================================================================
--
-- `auto_partenaires` : lecture des partenaires actifs par `authenticated`
-- (nom et métier affichés avec une offre) ; écriture `service_role`. Rien
-- pour `anon`.
--
-- ================================================================
-- 3. RETOUR ARRIÈRE
-- ================================================================
--
-- Tant qu'aucune offre n'existe : supprimer le déclencheur et la fonction
-- `auto_offres_coherence`, la colonne `auto_offres.partenaire_id`, recréer
-- `auto_offres.garage_id uuid not null references public.garages(id) on
-- delete cascade`, puis supprimer `auto_partenaires`.

-- ----------------------------------------------------------------
-- a. Partenaires
-- ----------------------------------------------------------------

create table if not exists public.auto_partenaires (
  id uuid primary key default gen_random_uuid(),
  metier text not null,
  nom text not null,
  siren text,
  garage_id uuid unique references public.garages(id) on delete set null,
  actif boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auto_partenaires_metier_valide check (
    metier in ('garage', 'mecanicien_mobile', 'centre_controle_technique', 'lavage_detailing', 'centre_pneus')
  ),
  constraint auto_partenaires_nom_valide check (length(btrim(nom)) between 1 and 120),
  constraint auto_partenaires_siren_valide check (siren is null or siren ~ '^[0-9]{9}$')
);

comment on table public.auto_partenaires is
  'Nexora Auto : professionnel qui porte des offres (garage, mécanicien à domicile, centre de contrôle technique, lavage, pneus). garage_id : son compte Nexora Pro, s''il en a un.';

drop trigger if exists auto_partenaires_horodater on public.auto_partenaires;
create trigger auto_partenaires_horodater
  before update on public.auto_partenaires
  for each row execute function public.auto_horodater();

alter table public.auto_partenaires enable row level security;

drop policy if exists auto_partenaires_lecture_actifs on public.auto_partenaires;
create policy auto_partenaires_lecture_actifs on public.auto_partenaires
  for select to authenticated
  using (actif);

revoke all on table public.auto_partenaires from public, anon, authenticated;
grant select on table public.auto_partenaires to authenticated;
grant all on table public.auto_partenaires to service_role;

-- ----------------------------------------------------------------
-- b. L'offre est portée par un partenaire
-- ----------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'auto_offres' and column_name = 'garage_id'
  ) then
    if exists (select 1 from public.auto_offres) then
      raise exception 'auto_offres contient des offres : reprise des garages vers auto_partenaires à écrire avant cette migration';
    end if;
    alter table public.auto_offres drop column garage_id;
  end if;
end;
$$;

alter table public.auto_offres
  add column if not exists partenaire_id uuid not null references public.auto_partenaires(id) on delete cascade;

create index if not exists auto_offres_partenaire_idx on public.auto_offres (partenaire_id);

comment on table public.auto_offres is
  'Nexora Auto : offre réelle d''un partenaire (tout métier) pour une prestation, un mode, une zone. Seule source possible de « Réserver ». Vide tant qu''aucun partenaire n''est engagé.';

-- ----------------------------------------------------------------
-- c. Cohérence entre le métier et l'offre
-- ----------------------------------------------------------------

create or replace function public.auto_offres_coherence()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_metier text;
begin
  select p.metier into v_metier from public.auto_partenaires p where p.id = new.partenaire_id;
  if v_metier is null then
    return new; -- la clé étrangère refusera un partenaire inexistant
  end if;
  if v_metier = 'mecanicien_mobile' and new.mode = 'chez_un_professionnel' then
    raise exception using errcode = '23514', message = 'auto_offres : un mécanicien à domicile n''accueille pas les voitures (auto_offre_incoherente)';
  end if;
  if v_metier = 'centre_controle_technique' and new.service_code <> 'controle_technique' then
    raise exception using errcode = '23514', message = 'auto_offres : un centre de contrôle technique ne propose que le contrôle technique (auto_offre_incoherente)';
  end if;
  if new.service_code = 'controle_technique' and new.mode = 'chez_un_professionnel' and v_metier <> 'centre_controle_technique' then
    raise exception using errcode = '23514', message = 'auto_offres : le contrôle technique se passe dans un centre agréé (auto_offre_incoherente)';
  end if;
  return new;
end;
$$;

revoke execute on function public.auto_offres_coherence() from public, anon, authenticated, service_role;

drop trigger if exists auto_offres_coherence on public.auto_offres;
create trigger auto_offres_coherence
  before insert or update of partenaire_id, service_code, mode on public.auto_offres
  for each row execute function public.auto_offres_coherence();
