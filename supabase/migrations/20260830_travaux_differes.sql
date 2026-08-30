-- Travaux différés (V1) : conserver une réparation refusée/reportée, la faire
-- remonter dans "Argent à risque" à l'échéance, mesurer le CA récupéré.
-- Idempotent : create table if not exists, ne recrée rien si déjà présent.
-- Non destructif (aucun DROP). Additif uniquement.

create table if not exists public.travaux_differes (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references public.garages(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  vehicule_id uuid references public.vehicules(id) on delete set null,
  devis_id uuid references public.devis(id) on delete set null,
  intervention text not null,
  montant_ttc numeric(10, 2),
  niveau text not null default 'normal' check (niveau in ('normal', 'important', 'securite')),
  statut text not null default 'planifie' check (
    statut in ('planifie', 'a_relancer', 'contacte_en_attente', 'recupere', 'refus_definitif')
  ),
  date_relance date not null,
  motif text,
  source text not null default 'manuel',
  recupere_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists travaux_differes_garage_statut_idx
  on public.travaux_differes (garage_id, statut, date_relance);

create index if not exists travaux_differes_client_idx
  on public.travaux_differes (client_id);

comment on table public.travaux_differes is
  'Réparations refusées ou reportées, suivies jusqu''à récupération ou refus définitif. Additif, ne modifie aucune table existante.';

-- Historique des changements de statut et de date de relance (jamais d'effacement).
create table if not exists public.travaux_differes_historique (
  id uuid primary key default gen_random_uuid(),
  travail_id uuid not null references public.travaux_differes(id) on delete cascade,
  garage_id uuid not null references public.garages(id) on delete cascade,
  ancien_statut text,
  nouveau_statut text not null,
  ancienne_date_relance date,
  nouvelle_date_relance date,
  created_at timestamptz not null default now()
);

create index if not exists travaux_differes_historique_travail_idx
  on public.travaux_differes_historique (travail_id, created_at);

comment on table public.travaux_differes_historique is
  'Trace chaque changement de statut / date de relance d''un travail différé. Append-only.';

-- updated_at automatique
create or replace function public.travaux_differes_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists travaux_differes_updated_at on public.travaux_differes;
create trigger travaux_differes_updated_at
  before update on public.travaux_differes
  for each row
  execute function public.travaux_differes_set_updated_at();

-- Historisation automatique à chaque changement de statut ou de date de relance.
create or replace function public.travaux_differes_log_historique()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'UPDATE') and (
    new.statut is distinct from old.statut
    or new.date_relance is distinct from old.date_relance
  ) then
    insert into public.travaux_differes_historique (
      travail_id, garage_id, ancien_statut, nouveau_statut,
      ancienne_date_relance, nouvelle_date_relance
    ) values (
      new.id, new.garage_id, old.statut, new.statut,
      old.date_relance, new.date_relance
    );
  end if;
  return new;
end;
$$;

drop trigger if exists travaux_differes_historique_trigger on public.travaux_differes;
create trigger travaux_differes_historique_trigger
  after update on public.travaux_differes
  for each row
  execute function public.travaux_differes_log_historique();

-- RLS : isolation stricte par garage, alignée sur le pattern garages.owner_user_id = auth.uid().
alter table public.travaux_differes enable row level security;
alter table public.travaux_differes_historique enable row level security;

drop policy if exists travaux_differes_isolation on public.travaux_differes;
create policy travaux_differes_isolation on public.travaux_differes
  for all
  using (
    garage_id in (select id from public.garages where owner_user_id = auth.uid())
  )
  with check (
    garage_id in (select id from public.garages where owner_user_id = auth.uid())
  );

drop policy if exists travaux_differes_historique_isolation on public.travaux_differes_historique;
create policy travaux_differes_historique_isolation on public.travaux_differes_historique
  for all
  using (
    garage_id in (select id from public.garages where owner_user_id = auth.uid())
  )
  with check (
    garage_id in (select id from public.garages where owner_user_id = auth.uid())
  );

-- Pas de fixture ici : elle sera insérée après application de cette migration,
-- une fois le garage_id réel de "Garage Démo 2" résolu dans un environnement autorisé.
