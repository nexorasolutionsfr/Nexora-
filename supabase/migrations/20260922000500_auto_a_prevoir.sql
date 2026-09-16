-- Nexora Auto — lot C : « À prévoir ».
--
-- ================================================================
-- 1. LE BESOIN
-- ================================================================
--
-- Nexora se sert de ce qui est déjà enregistré pour dire à la personne ce
-- qu'elle a à faire, sans lui faire recréer ce qu'il sait. Les échéances du
-- contrôle technique et de la révision NE SONT PAS stockées : elles se
-- calculent à chaque lecture à partir du dossier de la voiture
-- (components/auto/aPrevoir.js). Une intervention enregistrée les actualise
-- donc d'elle-même, sans doublon. Cette migration ne stocke que ce que la
-- personne décide :
--
-- a. `auto_taches` : ses tâches personnelles, facultatives (titre, voiture,
--    date éventuelle, note), à terminer ou reporter. Jamais closes par une
--    intervention.
-- b. `auto_preferences` : l'horizon d'affichage (30, 60 ou 90 jours).
--    `rappels_externes` reste à faux : aucun envoi hors de l'app n'existe
--    encore, et aucun écran ne le propose.
-- c. `auto_rappels_reports` : « me le rappeler plus tard » sur une échéance.
--    La clé contient la date de l'échéance : quand l'échéance change, le
--    report ne s'applique plus.
-- d. `auto_rappels_envois` : le journal des futurs envois externes. Un même
--    palier (30 jours, 7 jours, retard) ne part qu'une fois par échéance et
--    par canal (contrainte d'unicité). Réservé au service d'envoi.
--
-- Droits : RLS par propriétaire, aucun droit pour `anon` ; le journal
-- d'envois n'est ouvert qu'à `service_role`.
--
-- Retour arrière : supprimer les quatre tables ; rien d'existant n'est touché.

-- ----------------------------------------------------------------
-- a. Tâches personnelles
-- ----------------------------------------------------------------

create table if not exists public.auto_taches (
  id uuid primary key default gen_random_uuid(),
  vehicule_id uuid not null references public.auto_vehicules(id) on delete cascade,
  titre text not null,
  note text,
  echeance date,
  statut text not null default 'a_faire',
  terminee_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auto_taches_titre_valide check (length(btrim(titre)) between 1 and 120),
  constraint auto_taches_note_courte check (note is null or length(note) <= 500),
  constraint auto_taches_statut_valide check (statut in ('a_faire', 'terminee')),
  constraint auto_taches_terminee_datee check ((statut = 'terminee') = (terminee_le is not null)),
  constraint auto_taches_echeance_plausible check (echeance is null or echeance >= date '2000-01-01')
);

create index if not exists auto_taches_vehicule_idx on public.auto_taches (vehicule_id, statut, echeance);

comment on table public.auto_taches is
  'Nexora Auto : tâche personnelle facultative sur une voiture (pneus, nettoyage…). Jamais créée ni close automatiquement.';

drop trigger if exists auto_taches_horodater on public.auto_taches;
create trigger auto_taches_horodater
  before update on public.auto_taches
  for each row execute function public.auto_horodater();

alter table public.auto_taches enable row level security;

drop policy if exists auto_taches_proprietaire on public.auto_taches;
create policy auto_taches_proprietaire on public.auto_taches
  for all to authenticated
  using (exists (
    select 1 from public.auto_vehicules v
    where v.id = auto_taches.vehicule_id and v.proprietaire_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.auto_vehicules v
    where v.id = auto_taches.vehicule_id and v.proprietaire_id = (select auth.uid())
  ));

revoke all on table public.auto_taches from public, anon;
grant select, insert, update, delete on table public.auto_taches to authenticated;
grant all on table public.auto_taches to service_role;

-- ----------------------------------------------------------------
-- b. Préférences
-- ----------------------------------------------------------------

create table if not exists public.auto_preferences (
  proprietaire_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  horizon_jours integer not null default 60,
  rappels_externes boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint auto_preferences_horizon_valide check (horizon_jours in (30, 60, 90))
);

comment on column public.auto_preferences.rappels_externes is
  'Nexora Auto : envois hors de l''app (e-mail). Non exploité et non proposé tant que l''envoi n''existe pas.';

drop trigger if exists auto_preferences_horodater on public.auto_preferences;
create trigger auto_preferences_horodater
  before update on public.auto_preferences
  for each row execute function public.auto_horodater();

alter table public.auto_preferences enable row level security;

drop policy if exists auto_preferences_proprietaire on public.auto_preferences;
create policy auto_preferences_proprietaire on public.auto_preferences
  for all to authenticated
  using (proprietaire_id = (select auth.uid()))
  with check (proprietaire_id = (select auth.uid()));

revoke all on table public.auto_preferences from public, anon;
grant select, insert, update on table public.auto_preferences to authenticated;
grant all on table public.auto_preferences to service_role;

-- ----------------------------------------------------------------
-- c. Rappels reportés
-- ----------------------------------------------------------------

create table if not exists public.auto_rappels_reports (
  proprietaire_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cle text not null,
  reporte_jusqu_au date not null,
  created_at timestamptz not null default now(),
  primary key (proprietaire_id, cle),
  constraint auto_rappels_reports_cle_valide check (length(cle) between 3 and 200)
);

comment on table public.auto_rappels_reports is
  'Nexora Auto : « me le rappeler plus tard ». La clé porte la date de l''échéance : une échéance actualisée n''est plus reportée.';

alter table public.auto_rappels_reports enable row level security;

drop policy if exists auto_rappels_reports_proprietaire on public.auto_rappels_reports;
create policy auto_rappels_reports_proprietaire on public.auto_rappels_reports
  for all to authenticated
  using (proprietaire_id = (select auth.uid()))
  with check (proprietaire_id = (select auth.uid()));

revoke all on table public.auto_rappels_reports from public, anon;
grant select, insert, update, delete on table public.auto_rappels_reports to authenticated;
grant all on table public.auto_rappels_reports to service_role;

-- ----------------------------------------------------------------
-- d. Journal des envois externes (préparé, non branché)
-- ----------------------------------------------------------------

create table if not exists public.auto_rappels_envois (
  id bigint generated always as identity primary key,
  proprietaire_id uuid not null references auth.users(id) on delete cascade,
  cle text not null,
  palier text not null,
  canal text not null,
  envoye_le timestamptz not null default now(),
  constraint auto_rappels_envois_palier_valide check (palier in ('j30', 'j7', 'retard')),
  constraint auto_rappels_envois_canal_valide check (canal in ('email', 'sms')),
  constraint auto_rappels_envois_une_fois unique (proprietaire_id, cle, palier, canal)
);

comment on table public.auto_rappels_envois is
  'Nexora Auto : journal des rappels envoyés hors de l''app. Un palier par échéance et par canal, une seule fois. Réservé au service d''envoi (service_role).';

alter table public.auto_rappels_envois enable row level security;

revoke all on table public.auto_rappels_envois from public, anon, authenticated;
grant all on table public.auto_rappels_envois to service_role;
