-- Contrôle véhicule digital / inspection avant intervention (V1).
-- Documente l'état d'un véhicule avant intervention, fait signer des décisions
-- explicites au client point par point via un lien sécurisé (voir migration
-- 20260830000600_inspections_jetons.sql). Aucun envoi automatique.
-- Idempotent (create if not exists), additif uniquement, aucun DROP.
-- N'ALTÈRE PAS travaux_differes* (gelé).

-- Client/véhicule/RDV existants sont facultatifs : une inspection peut démarrer
-- avec uniquement un libellé véhicule / immatriculation saisis à la main, puis
-- être rattachée aux fiches existantes quand elles sont disponibles.
create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references public.garages(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  vehicule_id uuid references public.vehicules(id) on delete set null,
  rendez_vous_id uuid references public.rendez_vous(id) on delete set null,
  client_nom_libre text,
  vehicule_libelle_libre text,
  immatriculation_libre text,
  kilometrage integer,
  niveau_carburant text check (
    niveau_carburant is null or niveau_carburant in ('reserve', 'un_quart', 'moitie', 'trois_quarts', 'plein')
  ),
  statut text not null default 'brouillon' check (
    statut in (
      'brouillon', 'en_attente_client', 'consulte',
      'partiellement_valide', 'valide', 'refuse', 'finalisee_sans_decision'
    )
  ),
  verrouille_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inspections_garage_statut_idx
  on public.inspections (garage_id, statut, created_at);

create index if not exists inspections_client_idx
  on public.inspections (client_id);

comment on table public.inspections is
  'Contrôle véhicule digital avant intervention (V1). Additif, ne modifie aucune table existante, notamment travaux_differes*.';

-- Points de contrôle (kilométrage/carburant traités sur la fiche parente ; ici :
-- extérieur, pneus, voyants, objets/observations, etc.)
create table if not exists public.inspections_points (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  garage_id uuid not null references public.garages(id) on delete cascade,
  categorie text not null check (
    categorie in ('exterieur', 'pneus', 'voyants', 'objets', 'autre')
  ),
  libelle text not null,
  etat text not null check (etat in ('ok', 'a_surveiller', 'a_valider_client', 'dommage')),
  commentaire text,
  -- Un point n'est soumis à décision client que si le garage l'a explicitement
  -- sélectionné en revue ET qu'il est classé "à valider avec le client".
  -- Un constat "dommage" reste visible mais ne peut pas être présenté comme une
  -- validation de travaux : voir contrainte ci-dessous.
  soumis_client boolean not null default false,
  decision_client text check (decision_client is null or decision_client in ('valide', 'refuse')),
  decision_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspections_points_soumission_valide check (
    soumis_client = false or etat = 'a_valider_client'
  ),
  constraint inspections_points_decision_si_soumis check (
    decision_client is null or soumis_client = true
  )
);

create index if not exists inspections_points_inspection_idx
  on public.inspections_points (inspection_id);

comment on table public.inspections_points is
  'Points de contrôle d''une inspection. Seuls les points soumis_client=true et etat=a_valider_client peuvent recevoir une décision client.';

-- Photos rattachées à un point (ou à l'inspection en général si point_id est nul).
create table if not exists public.inspections_photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  garage_id uuid not null references public.garages(id) on delete cascade,
  point_id uuid references public.inspections_points(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists inspections_photos_inspection_idx
  on public.inspections_photos (inspection_id);

-- Historique append-only : traçabilité complète, y compris les modifications
-- après verrouillage (réouverture explicite obligatoire, jamais d'altération
-- silencieuse). Voir fonction reouvrir_inspection dans 20260830000700_inspections_rpc.sql.
create table if not exists public.inspections_historique (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  garage_id uuid not null references public.garages(id) on delete cascade,
  action text not null default 'changement_statut',
  ancien_statut text,
  nouveau_statut text,
  motif text,
  created_at timestamptz not null default now()
);

create index if not exists inspections_historique_inspection_idx
  on public.inspections_historique (inspection_id, created_at);

comment on table public.inspections_historique is
  'Trace chaque changement de statut d''une inspection, dont les réouvertures (avec motif obligatoire). Append-only.';

-- updated_at automatique (inspections + points)
create or replace function public.inspections_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists inspections_updated_at on public.inspections;
create trigger inspections_updated_at
  before update on public.inspections
  for each row
  execute function public.inspections_set_updated_at();

drop trigger if exists inspections_points_updated_at on public.inspections_points;
create trigger inspections_points_updated_at
  before update on public.inspections_points
  for each row
  execute function public.inspections_set_updated_at();

-- Historisation automatique à chaque changement de statut de l'inspection.
create or replace function public.inspections_log_historique()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'UPDATE') and (new.statut is distinct from old.statut) then
    insert into public.inspections_historique (
      inspection_id, garage_id, action, ancien_statut, nouveau_statut
    ) values (
      new.id, new.garage_id, 'changement_statut', old.statut, new.statut
    );
  end if;
  return new;
end;
$$;

drop trigger if exists inspections_historique_trigger on public.inspections;
create trigger inspections_historique_trigger
  after update on public.inspections
  for each row
  execute function public.inspections_log_historique();

-- RLS : isolation stricte par garage, alignée sur le pattern existant
-- (garages.owner_user_id = auth.uid()).
alter table public.inspections enable row level security;
alter table public.inspections_points enable row level security;
alter table public.inspections_photos enable row level security;
alter table public.inspections_historique enable row level security;

drop policy if exists inspections_isolation on public.inspections;
create policy inspections_isolation on public.inspections
  for all
  using (garage_id in (select id from public.garages where owner_user_id = auth.uid()))
  with check (garage_id in (select id from public.garages where owner_user_id = auth.uid()));

drop policy if exists inspections_points_isolation on public.inspections_points;
create policy inspections_points_isolation on public.inspections_points
  for all
  using (garage_id in (select id from public.garages where owner_user_id = auth.uid()))
  with check (garage_id in (select id from public.garages where owner_user_id = auth.uid()));

drop policy if exists inspections_photos_isolation on public.inspections_photos;
create policy inspections_photos_isolation on public.inspections_photos
  for all
  using (garage_id in (select id from public.garages where owner_user_id = auth.uid()))
  with check (garage_id in (select id from public.garages where owner_user_id = auth.uid()));

drop policy if exists inspections_historique_isolation on public.inspections_historique;
create policy inspections_historique_isolation on public.inspections_historique
  for all
  using (garage_id in (select id from public.garages where owner_user_id = auth.uid()))
  with check (garage_id in (select id from public.garages where owner_user_id = auth.uid()));
