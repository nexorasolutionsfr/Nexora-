-- Nexora Auto — lot A : le garage virtuel de l'automobiliste.
--
-- ================================================================
-- 1. LE BESOIN
-- ================================================================
--
-- Nexora Auto est l'app grand public : l'automobiliste ajoute sa voiture une
-- fois, puis Nexora garde son kilométrage, son historique et ses échéances.
-- Plan d'ensemble : docs/architecture/nexora-auto-v1.md.
--
-- Ce lot ne pose que le garage virtuel. Ni catalogue, ni réservation, ni
-- paiement : ils viennent aux lots suivants et s'appuieront sur ces tables.
--
-- ================================================================
-- 2. LES RÈGLES DE CONCEPTION
-- ================================================================
--
-- a. Séparé des fiches des garages. `vehicules` et `clients` appartiennent à
--    un garage (`garage_id`). Une voiture d'automobiliste appartient à une
--    personne (`proprietaire_id`). Les deux ne sont JAMAIS rapprochées par la
--    plaque : une plaque identique ne donne accès à aucun historique privé.
--    Le lien avec un garage naîtra d'une réservation, avec l'accord du client.
--
-- b. Provenance. Chaque relevé et chaque intervention porte sa source :
--    `proprietaire` (saisi par l'automobiliste) ou `prestation` (produit par
--    une réservation Nexora, lots suivants). L'automobiliste corrige ou
--    supprime ce qu'il a saisi, jamais ce qu'une prestation a produit.
--
-- c. Aucune précision inventée. Le kilométrage est daté ; les échéances se
--    calculent côté application à partir de ce que la personne a renseigné
--    (lib/auto/echeances.js), jamais d'une valeur par défaut.
--
-- d. Droits : la personne connectée voit et modifie ses seules voitures.
--    `anon` n'a aucun accès. Pas de fonction `security definer` dans ce lot.
--
-- e. `auto_ajouter_vehicule` enregistre la voiture, son kilométrage et son
--    dernier contrôle technique en UNE transaction, sous les droits de
--    l'appelant (`security invoker`) : jamais une voiture à moitié créée.
--
-- Retour arrière : supprimer les trois tables `auto_*` et les trois fonctions
-- `auto_*` ; aucune table ni fonction existante n'est modifiée.

-- ----------------------------------------------------------------
-- a. Les tables
-- ----------------------------------------------------------------

create table if not exists public.auto_vehicules (
  id uuid primary key default gen_random_uuid(),
  proprietaire_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- Normalisée par l'application : majuscules, sans espace ni tiret.
  immatriculation text,
  marque text not null,
  modele text not null,
  annee integer,
  energie text,
  motorisation text,
  -- Case B de la carte grise.
  date_mise_en_circulation date,
  -- Intervalle d'entretien recopié du carnet. NULL = non renseigné : aucune
  -- échéance d'entretien n'est alors affichée.
  intervalle_entretien_km integer,
  intervalle_entretien_mois integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auto_vehicules_marque_non_vide check (length(btrim(marque)) > 0),
  constraint auto_vehicules_modele_non_vide check (length(btrim(modele)) > 0),
  constraint auto_vehicules_annee_bornee check (annee is null or annee between 1900 and 2100),
  constraint auto_vehicules_energie_valide check (
    energie is null
    or energie in ('essence', 'diesel', 'hybride', 'hybride_rechargeable', 'electrique', 'gpl', 'ethanol', 'autre')
  ),
  constraint auto_vehicules_immatriculation_normalisee check (
    immatriculation is null or immatriculation ~ '^[A-Z0-9]{2,12}$'
  ),
  constraint auto_vehicules_intervalle_km_borne check (
    intervalle_entretien_km is null or intervalle_entretien_km between 1000 and 100000
  ),
  constraint auto_vehicules_intervalle_mois_borne check (
    intervalle_entretien_mois is null or intervalle_entretien_mois between 1 and 60
  )
);

create index if not exists auto_vehicules_proprietaire_idx on public.auto_vehicules (proprietaire_id);

-- Une même personne n'enregistre pas deux fois la même plaque. Deux personnes
-- différentes le peuvent (voiture revendue, voiture partagée) : aucune
-- unicité globale, précisément pour ne rien révéler de l'autre.
create unique index if not exists auto_vehicules_plaque_par_proprietaire
  on public.auto_vehicules (proprietaire_id, immatriculation)
  where immatriculation is not null;

create table if not exists public.auto_releves_km (
  id uuid primary key default gen_random_uuid(),
  vehicule_id uuid not null references public.auto_vehicules(id) on delete cascade,
  kilometrage integer not null,
  releve_le date not null default current_date,
  source text not null default 'proprietaire',
  created_at timestamptz not null default now(),
  constraint auto_releves_km_borne check (kilometrage between 0 and 2000000),
  constraint auto_releves_km_date_plausible check (releve_le >= date '1900-01-01'),
  constraint auto_releves_km_source_valide check (source in ('proprietaire', 'prestation'))
);

create index if not exists auto_releves_km_vehicule_idx on public.auto_releves_km (vehicule_id, releve_le desc);

create table if not exists public.auto_historique (
  id uuid primary key default gen_random_uuid(),
  vehicule_id uuid not null references public.auto_vehicules(id) on delete cascade,
  type text not null,
  realise_le date not null,
  kilometrage integer,
  libelle text,
  prestataire text,
  montant_ttc numeric(10,2),
  source text not null default 'proprietaire',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auto_historique_type_valide check (
    type in ('vidange', 'revision', 'controle_technique', 'pneus', 'freinage', 'batterie',
             'distribution', 'climatisation', 'carrosserie', 'reparation', 'lavage', 'autre')
  ),
  constraint auto_historique_date_plausible check (realise_le >= date '1900-01-01'),
  constraint auto_historique_km_borne check (kilometrage is null or kilometrage between 0 and 2000000),
  constraint auto_historique_montant_positif check (montant_ttc is null or montant_ttc >= 0),
  constraint auto_historique_source_valide check (source in ('proprietaire', 'prestation'))
);

create index if not exists auto_historique_vehicule_idx on public.auto_historique (vehicule_id, realise_le desc);

comment on table public.auto_vehicules is
  'Nexora Auto : voiture enregistrée par un automobiliste (proprietaire_id). Sans lien avec public.vehicules, qui appartient à un garage. Jamais rapprochée par la plaque.';
comment on table public.auto_releves_km is
  'Nexora Auto : kilométrage daté. source = proprietaire (saisi) ou prestation (produit par une réservation Nexora).';
comment on table public.auto_historique is
  'Nexora Auto : intervention passée sur la voiture. source = proprietaire (saisie, modifiable) ou prestation (produite par Nexora, non modifiable par l''automobiliste).';

-- ----------------------------------------------------------------
-- b. Déclencheurs : horodatage, dates futures
-- ----------------------------------------------------------------

create or replace function public.auto_horodater()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Une date de relevé ou d'intervention dans le futur est une erreur de
-- saisie. Un jour de marge couvre le décalage horaire. Vérifié par
-- déclencheur : une contrainte CHECK ne peut pas dépendre de current_date.
create or replace function public.auto_refuser_date_future()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_date date := (to_jsonb(new) ->> tg_argv[0])::date;
begin
  if v_date is not null and v_date > current_date + 1 then
    raise exception using
      errcode = '23514',
      message = format('%s : la date %s est dans le futur (auto_date_future)', tg_table_name, v_date);
  end if;
  return new;
end;
$$;

drop trigger if exists auto_vehicules_horodater on public.auto_vehicules;
create trigger auto_vehicules_horodater
  before update on public.auto_vehicules
  for each row execute function public.auto_horodater();

drop trigger if exists auto_historique_horodater on public.auto_historique;
create trigger auto_historique_horodater
  before update on public.auto_historique
  for each row execute function public.auto_horodater();

drop trigger if exists auto_releves_km_date_future on public.auto_releves_km;
create trigger auto_releves_km_date_future
  before insert or update on public.auto_releves_km
  for each row execute function public.auto_refuser_date_future('releve_le');

drop trigger if exists auto_historique_date_future on public.auto_historique;
create trigger auto_historique_date_future
  before insert or update on public.auto_historique
  for each row execute function public.auto_refuser_date_future('realise_le');

-- Même fermeture que les fonctions de déclencheur des ordres de réparation
-- (20260902000200) : un déclencheur s'exécute sans que l'appelant ait le
-- droit EXECUTE, personne n'a donc à pouvoir les appeler directement.
revoke execute on function public.auto_horodater() from public, anon, authenticated, service_role;
revoke execute on function public.auto_refuser_date_future() from public, anon, authenticated, service_role;

-- ----------------------------------------------------------------
-- c. Droits
-- ----------------------------------------------------------------

alter table public.auto_vehicules enable row level security;
alter table public.auto_releves_km enable row level security;
alter table public.auto_historique enable row level security;

drop policy if exists auto_vehicules_proprietaire_lecture on public.auto_vehicules;
create policy auto_vehicules_proprietaire_lecture on public.auto_vehicules
  for select to authenticated
  using (proprietaire_id = (select auth.uid()));

drop policy if exists auto_vehicules_proprietaire_insert on public.auto_vehicules;
create policy auto_vehicules_proprietaire_insert on public.auto_vehicules
  for insert to authenticated
  with check (proprietaire_id = (select auth.uid()));

drop policy if exists auto_vehicules_proprietaire_update on public.auto_vehicules;
create policy auto_vehicules_proprietaire_update on public.auto_vehicules
  for update to authenticated
  using (proprietaire_id = (select auth.uid()))
  with check (proprietaire_id = (select auth.uid()));

drop policy if exists auto_vehicules_proprietaire_delete on public.auto_vehicules;
create policy auto_vehicules_proprietaire_delete on public.auto_vehicules
  for delete to authenticated
  using (proprietaire_id = (select auth.uid()));

-- Relevés et historique : lisibles si la voiture est à soi ; écrits,
-- modifiés, supprimés seulement quand la source est la saisie du
-- propriétaire.
drop policy if exists auto_releves_km_lecture on public.auto_releves_km;
create policy auto_releves_km_lecture on public.auto_releves_km
  for select to authenticated
  using (exists (
    select 1 from public.auto_vehicules v
    where v.id = auto_releves_km.vehicule_id and v.proprietaire_id = (select auth.uid())
  ));

drop policy if exists auto_releves_km_saisie on public.auto_releves_km;
create policy auto_releves_km_saisie on public.auto_releves_km
  for insert to authenticated
  with check (source = 'proprietaire' and exists (
    select 1 from public.auto_vehicules v
    where v.id = auto_releves_km.vehicule_id and v.proprietaire_id = (select auth.uid())
  ));

drop policy if exists auto_releves_km_correction on public.auto_releves_km;
create policy auto_releves_km_correction on public.auto_releves_km
  for update to authenticated
  using (source = 'proprietaire' and exists (
    select 1 from public.auto_vehicules v
    where v.id = auto_releves_km.vehicule_id and v.proprietaire_id = (select auth.uid())
  ))
  with check (source = 'proprietaire' and exists (
    select 1 from public.auto_vehicules v
    where v.id = auto_releves_km.vehicule_id and v.proprietaire_id = (select auth.uid())
  ));

drop policy if exists auto_releves_km_suppression on public.auto_releves_km;
create policy auto_releves_km_suppression on public.auto_releves_km
  for delete to authenticated
  using (source = 'proprietaire' and exists (
    select 1 from public.auto_vehicules v
    where v.id = auto_releves_km.vehicule_id and v.proprietaire_id = (select auth.uid())
  ));

drop policy if exists auto_historique_lecture on public.auto_historique;
create policy auto_historique_lecture on public.auto_historique
  for select to authenticated
  using (exists (
    select 1 from public.auto_vehicules v
    where v.id = auto_historique.vehicule_id and v.proprietaire_id = (select auth.uid())
  ));

drop policy if exists auto_historique_saisie on public.auto_historique;
create policy auto_historique_saisie on public.auto_historique
  for insert to authenticated
  with check (source = 'proprietaire' and exists (
    select 1 from public.auto_vehicules v
    where v.id = auto_historique.vehicule_id and v.proprietaire_id = (select auth.uid())
  ));

drop policy if exists auto_historique_correction on public.auto_historique;
create policy auto_historique_correction on public.auto_historique
  for update to authenticated
  using (source = 'proprietaire' and exists (
    select 1 from public.auto_vehicules v
    where v.id = auto_historique.vehicule_id and v.proprietaire_id = (select auth.uid())
  ))
  with check (source = 'proprietaire' and exists (
    select 1 from public.auto_vehicules v
    where v.id = auto_historique.vehicule_id and v.proprietaire_id = (select auth.uid())
  ));

drop policy if exists auto_historique_suppression on public.auto_historique;
create policy auto_historique_suppression on public.auto_historique
  for delete to authenticated
  using (source = 'proprietaire' and exists (
    select 1 from public.auto_vehicules v
    where v.id = auto_historique.vehicule_id and v.proprietaire_id = (select auth.uid())
  ));

revoke all on table public.auto_vehicules, public.auto_releves_km, public.auto_historique from public, anon;
grant select, insert, update, delete on table public.auto_vehicules, public.auto_releves_km, public.auto_historique to authenticated;
grant all on table public.auto_vehicules, public.auto_releves_km, public.auto_historique to service_role;

-- ----------------------------------------------------------------
-- d. Ajouter une voiture avec ses premières données, en une fois
-- ----------------------------------------------------------------

create or replace function public.auto_ajouter_vehicule(
  p_marque text,
  p_modele text,
  p_annee integer default null,
  p_energie text default null,
  p_immatriculation text default null,
  p_date_mise_en_circulation date default null,
  p_kilometrage integer default null,
  p_dernier_controle date default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'auto_ajouter_vehicule : session requise';
  end if;

  insert into public.auto_vehicules (marque, modele, annee, energie, immatriculation, date_mise_en_circulation)
  values (btrim(p_marque), btrim(p_modele), p_annee, nullif(btrim(p_energie), ''),
          nullif(btrim(p_immatriculation), ''), p_date_mise_en_circulation)
  returning id into v_id;

  if p_kilometrage is not null then
    insert into public.auto_releves_km (vehicule_id, kilometrage) values (v_id, p_kilometrage);
  end if;

  if p_dernier_controle is not null then
    insert into public.auto_historique (vehicule_id, type, realise_le)
    values (v_id, 'controle_technique', p_dernier_controle);
  end if;

  return v_id;
end;
$$;

revoke all on function public.auto_ajouter_vehicule(text, text, integer, text, text, date, integer, date) from public, anon;
grant execute on function public.auto_ajouter_vehicule(text, text, integer, text, text, date, integer, date) to authenticated;
