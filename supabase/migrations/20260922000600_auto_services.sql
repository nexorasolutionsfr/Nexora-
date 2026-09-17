-- Nexora Auto — lot D : l'univers des services.
--
-- ================================================================
-- 1. LE BESOIN
-- ================================================================
--
-- Depuis sa voiture ou une échéance, la personne découvre une prestation,
-- comprend ce qu'elle contient et peut la garder dans ses prochaines actions.
-- Les partenariats ne sont pas un prérequis : rien ici n'est réservable.
--
-- Trois notions distinctes, et jamais confondues :
--
-- a. `auto_services` : le référentiel des prestations (révision, freinage,
--    pneus…). UNE ligne par prestation. Le texte des fiches vit dans
--    components/auto/services.js ; la base ne garde que ce qu'il faut pour
--    relier tâches et offres, et le test services.test.js vérifie que les
--    deux listes concordent.
--    `suivi` dit comment « À prévoir » suit la prestation :
--    - 'echeance' : calculée à partir du dossier (révision, contrôle
--      technique) ; on ne l'ajoute pas à la main, pour ne pas la doubler ;
--    - 'tache' : la personne peut l'ajouter à ses prochaines actions ;
--    - 'aucun' : l'assistance, qui ne se planifie pas.
-- b. `auto_services_modes` : les façons habituelles de réaliser une
--    prestation (chez un professionnel, à domicile, collecte et
--    restitution). Un mode est une propriété de la prestation, JAMAIS une
--    prestation de plus : une révision à domicile reste la révision. Ce sont
--    des possibilités, pas des disponibilités.
-- c. `auto_taches.service_code` : une tâche peut désigner la prestation dont
--    elle vient. Une seule tâche ouverte par voiture et par prestation
--    (index unique partiel) ; seules les prestations suivies en 'tache' sont
--    acceptées (déclencheur). Les tâches existantes ne changent pas.
-- d. `auto_offres` : une offre RÉELLE, seule capable un jour de rendre une
--    prestation réservable. Elle engage un professionnel inscrit sur Nexora
--    (`garages`), pour une prestation, un mode existant de cette prestation,
--    une zone (codes postaux), éventuellement des énergies, une période.
--    La table est créée VIDE : aucune offre n'existe, aucun prix, aucun
--    créneau. Écriture réservée à `service_role` ; lecture des seules offres
--    actives et en cours de validité. Le prix et la réservation viendront
--    avec le lot qui les construit.
-- e. `auto_vehicules.motorisation` : désormais modifiable par la personne ;
--    bornée à 80 caractères.
--
-- ================================================================
-- 2. RÈGLES
-- ================================================================
--
-- - Aucune donnée fictive : pas d'offre, pas de professionnel, pas de prix.
-- - L'assistance n'a aucun mode : aucune offre ne peut la viser, et l'écran
--   ne propose aucun bouton qui laisserait croire à un dépannage déclenché.
-- - Droits : référentiel lisible par `authenticated` ; offres lisibles par
--   `authenticated` si actives et valables ; rien pour `anon`. Les droits
--   par défaut du schéma donnent tout à `authenticated` sur une table
--   nouvelle : ils sont retirés avant d'accorder la seule lecture.
--
-- ================================================================
-- 3. RETOUR ARRIÈRE
-- ================================================================
--
-- Supprimer `auto_offres`, le déclencheur et l'index de `auto_taches`, la
-- colonne `auto_taches.service_code`, `auto_services_modes`, `auto_services`,
-- la fonction `auto_taches_service_ajoutable` et la contrainte
-- `auto_vehicules_motorisation_courte`. Aucune donnée existante n'est
-- modifiée.

-- ----------------------------------------------------------------
-- a. Référentiel des prestations
-- ----------------------------------------------------------------

create table if not exists public.auto_services (
  code text primary key,
  univers text not null,
  nom text not null,
  suivi text not null,
  ordre integer not null,
  constraint auto_services_code_valide check (code ~ '^[a-z][a-z_]{1,39}$'),
  constraint auto_services_univers_valide check (univers in ('entretien', 'pneus', 'lavage', 'controle_technique', 'assistance')),
  constraint auto_services_suivi_valide check (suivi in ('tache', 'echeance', 'aucun')),
  constraint auto_services_nom_valide check (length(btrim(nom)) between 1 and 80)
);

comment on table public.auto_services is
  'Nexora Auto : une ligne par prestation (jamais une par mode). Textes des fiches : components/auto/services.js.';

-- Une ligne par prestation : code, univers, nom, suivi, ordre.
insert into public.auto_services (code, univers, nom, suivi, ordre) values
  ('revision', 'entretien', 'Révision', 'echeance', 10),
  ('vidange', 'entretien', 'Vidange et filtre à huile', 'tache', 20),
  ('freinage', 'entretien', 'Freinage', 'tache', 30),
  ('batterie', 'entretien', 'Batterie 12 V', 'tache', 40),
  ('diagnostic', 'entretien', 'Diagnostic', 'tache', 50),
  ('climatisation', 'entretien', 'Climatisation', 'tache', 60),
  ('pneus_remplacement', 'pneus', 'Remplacement de pneus', 'tache', 70),
  ('pneus_saisonniers', 'pneus', 'Pneus hiver ou été', 'tache', 80),
  ('geometrie', 'pneus', 'Géométrie et parallélisme', 'tache', 90),
  ('lavage_complet', 'lavage', 'Lavage intérieur et extérieur', 'tache', 100),
  ('detailing', 'lavage', 'Detailing', 'tache', 110),
  ('controle_technique', 'controle_technique', 'Contrôle technique', 'echeance', 120),
  ('assistance_panne', 'assistance', 'Panne, crevaison ou accident', 'aucun', 130)
on conflict (code) do update
  set univers = excluded.univers, nom = excluded.nom, suivi = excluded.suivi, ordre = excluded.ordre;

alter table public.auto_services enable row level security;

drop policy if exists auto_services_lecture on public.auto_services;
create policy auto_services_lecture on public.auto_services
  for select to authenticated
  using (true);

revoke all on table public.auto_services from public, anon, authenticated;
grant select on table public.auto_services to authenticated;
grant all on table public.auto_services to service_role;

-- ----------------------------------------------------------------
-- b. Modes possibles de chaque prestation
-- ----------------------------------------------------------------

create table if not exists public.auto_services_modes (
  service_code text not null references public.auto_services(code) on delete cascade,
  mode text not null,
  primary key (service_code, mode),
  constraint auto_services_modes_mode_valide check (mode in ('chez_un_professionnel', 'a_domicile', 'collecte'))
);

comment on table public.auto_services_modes is
  'Nexora Auto : façons habituelles de réaliser une prestation. Une possibilité, pas une disponibilité ; jamais une prestation de plus.';

-- Une ligne par couple prestation-mode envisageable.
insert into public.auto_services_modes (service_code, mode) values
  ('revision', 'chez_un_professionnel'),
  ('revision', 'a_domicile'),
  ('revision', 'collecte'),
  ('vidange', 'chez_un_professionnel'),
  ('vidange', 'a_domicile'),
  ('vidange', 'collecte'),
  ('freinage', 'chez_un_professionnel'),
  ('freinage', 'a_domicile'),
  ('freinage', 'collecte'),
  ('batterie', 'chez_un_professionnel'),
  ('batterie', 'a_domicile'),
  ('batterie', 'collecte'),
  ('diagnostic', 'chez_un_professionnel'),
  ('diagnostic', 'a_domicile'),
  ('diagnostic', 'collecte'),
  ('climatisation', 'chez_un_professionnel'),
  ('climatisation', 'collecte'),
  ('pneus_remplacement', 'chez_un_professionnel'),
  ('pneus_remplacement', 'a_domicile'),
  ('pneus_remplacement', 'collecte'),
  ('pneus_saisonniers', 'chez_un_professionnel'),
  ('pneus_saisonniers', 'a_domicile'),
  ('pneus_saisonniers', 'collecte'),
  ('geometrie', 'chez_un_professionnel'),
  ('geometrie', 'collecte'),
  ('lavage_complet', 'chez_un_professionnel'),
  ('lavage_complet', 'a_domicile'),
  ('detailing', 'chez_un_professionnel'),
  ('detailing', 'a_domicile'),
  ('detailing', 'collecte'),
  ('controle_technique', 'chez_un_professionnel'),
  ('controle_technique', 'collecte')
on conflict do nothing;

alter table public.auto_services_modes enable row level security;

drop policy if exists auto_services_modes_lecture on public.auto_services_modes;
create policy auto_services_modes_lecture on public.auto_services_modes
  for select to authenticated
  using (true);

revoke all on table public.auto_services_modes from public, anon, authenticated;
grant select on table public.auto_services_modes to authenticated;
grant all on table public.auto_services_modes to service_role;

-- ----------------------------------------------------------------
-- c. Une tâche peut venir d'une prestation, sans doublon
-- ----------------------------------------------------------------

alter table public.auto_taches
  add column if not exists service_code text references public.auto_services(code);

comment on column public.auto_taches.service_code is
  'Nexora Auto : prestation dont vient la tâche (« Ajouter à mes prochaines actions »). NULL pour une tâche libre.';

create unique index if not exists auto_taches_service_une_ouverte
  on public.auto_taches (vehicule_id, service_code)
  where service_code is not null and statut = 'a_faire';

-- Révision et contrôle technique sont déjà calculés par « À prévoir » ;
-- l'assistance ne se planifie pas. Seules les prestations suivies en tâche
-- s'ajoutent.
create or replace function public.auto_taches_service_ajoutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.service_code is not null and not exists (
    select 1 from public.auto_services s where s.code = new.service_code and s.suivi = 'tache'
  ) then
    raise exception using errcode = '23514', message = 'auto_taches : prestation suivie autrement qu''en tâche (auto_service_non_ajoutable)';
  end if;
  return new;
end;
$$;

revoke execute on function public.auto_taches_service_ajoutable() from public, anon, authenticated, service_role;

drop trigger if exists auto_taches_service_ajoutable on public.auto_taches;
create trigger auto_taches_service_ajoutable
  before insert or update of service_code on public.auto_taches
  for each row execute function public.auto_taches_service_ajoutable();

-- ----------------------------------------------------------------
-- d. Offres réelles (table vide)
-- ----------------------------------------------------------------

create table if not exists public.auto_offres (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references public.garages(id) on delete cascade,
  service_code text not null,
  mode text not null,
  codes_postaux text[] not null,
  energies text[],
  valable_du date not null default current_date,
  valable_jusqu_au date,
  actif boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auto_offres_service_mode_existant foreign key (service_code, mode)
    references public.auto_services_modes (service_code, mode),
  constraint auto_offres_zone_valide check (
    cardinality(codes_postaux) between 1 and 500
    and array_position(codes_postaux, null) is null
    and array_to_string(codes_postaux, ',') ~ '^[0-9]{5}(,[0-9]{5})*$'
  ),
  constraint auto_offres_energies_valides check (
    energies is null
    or (
      cardinality(energies) >= 1
      and energies <@ array['essence', 'diesel', 'hybride', 'hybride_rechargeable', 'electrique', 'gpl', 'ethanol', 'autre']::text[]
    )
  ),
  constraint auto_offres_periode_valide check (valable_jusqu_au is null or valable_jusqu_au >= valable_du)
);

create index if not exists auto_offres_recherche_idx on public.auto_offres (service_code, mode) where actif;

comment on table public.auto_offres is
  'Nexora Auto : offre réelle d''un professionnel pour une prestation, un mode, une zone. Seule source possible de « Réserver ». Vide tant qu''aucun partenaire n''est engagé.';

drop trigger if exists auto_offres_horodater on public.auto_offres;
create trigger auto_offres_horodater
  before update on public.auto_offres
  for each row execute function public.auto_horodater();

alter table public.auto_offres enable row level security;

drop policy if exists auto_offres_lecture_valables on public.auto_offres;
create policy auto_offres_lecture_valables on public.auto_offres
  for select to authenticated
  using (actif and valable_du <= current_date and (valable_jusqu_au is null or valable_jusqu_au >= current_date));

revoke all on table public.auto_offres from public, anon, authenticated;
grant select on table public.auto_offres to authenticated;
grant all on table public.auto_offres to service_role;

-- ----------------------------------------------------------------
-- e. Motorisation modifiable, bornée
-- ----------------------------------------------------------------

alter table public.auto_vehicules drop constraint if exists auto_vehicules_motorisation_courte;
alter table public.auto_vehicules
  add constraint auto_vehicules_motorisation_courte
  check (motorisation is null or length(btrim(motorisation)) between 1 and 80);
