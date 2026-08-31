-- Revenue Recovery V1 — fondations (lot 2/2 : journal d'événements).
-- Migration additive, idempotente, non destructive.
--
-- Journal immuable de la chronologie complète brouillon → tentative →
-- (futur) envoi/réponse. Distinct des tables précédentes : celles-ci
-- portent l'état (mutable pour le brouillon, figé pour la tentative),
-- celle-ci trace chaque décision, y compris celles qui ne créent ni ne
-- modifient de ligne ailleurs (ex. une réponse client reçue).

create table if not exists public.revenue_recovery_evenements (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references public.garages(id) on delete cascade,
  -- RESTRICT, même raisonnement que revenue_recovery_tentatives : ce
  -- journal est lui-même une pièce de preuve, jamais effacée en silence.
  travail_differe_id uuid not null references public.travaux_differes(id) on delete restrict,
  brouillon_id uuid references public.revenue_recovery_brouillons(id) on delete set null,
  tentative_id uuid references public.revenue_recovery_tentatives(id) on delete set null,
  type_evenement text not null check (type_evenement in (
    'brouillon_cree', 'brouillon_modifie', 'brouillon_abandonne',
    'tentative_creee', 'envoi_reussi', 'envoi_echec', 'reponse_recue'
  )),
  detail text,
  acteur uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists revenue_recovery_evenements_travail_idx
  on public.revenue_recovery_evenements (garage_id, travail_differe_id, created_at);

comment on table public.revenue_recovery_evenements is
  'Journal append-only de tous les événements du cycle de vie brouillon → tentative → (futur) envoi. Jamais modifié ni supprimé.';

create or replace function public.revenue_recovery_evenements_forcer_identite()
returns trigger
language plpgsql
as $$
begin
  new.acteur := auth.uid();
  new.created_at := now();
  -- Cohérence inter-garages : travail_differe_id, et brouillon_id/
  -- tentative_id si fournis, doivent appartenir au même garage_id — même
  -- contrôle que sur les autres tables Revenue Recovery.
  if not exists (
    select 1 from public.travaux_differes
    where id = new.travail_differe_id and garage_id = new.garage_id
  ) then
    raise exception 'travail_differe_id % n''appartient pas au garage %', new.travail_differe_id, new.garage_id;
  end if;
  if new.brouillon_id is not null and not exists (
    select 1 from public.revenue_recovery_brouillons
    where id = new.brouillon_id and garage_id = new.garage_id
  ) then
    raise exception 'brouillon_id % n''appartient pas au garage %', new.brouillon_id, new.garage_id;
  end if;
  if new.tentative_id is not null and not exists (
    select 1 from public.revenue_recovery_tentatives
    where id = new.tentative_id and garage_id = new.garage_id
  ) then
    raise exception 'tentative_id % n''appartient pas au garage %', new.tentative_id, new.garage_id;
  end if;
  return new;
end;
$$;

drop trigger if exists revenue_recovery_evenements_avant_insert on public.revenue_recovery_evenements;
create trigger revenue_recovery_evenements_avant_insert
  before insert on public.revenue_recovery_evenements
  for each row
  execute function public.revenue_recovery_evenements_forcer_identite();

alter table public.revenue_recovery_evenements enable row level security;

drop policy if exists revenue_recovery_evenements_isolation on public.revenue_recovery_evenements;
create policy revenue_recovery_evenements_isolation on public.revenue_recovery_evenements
  for all
  using (garage_id in (select id from public.garages where owner_user_id = auth.uid()))
  with check (garage_id in (select id from public.garages where owner_user_id = auth.uid()));

-- select/insert uniquement : journal immuable, jamais update/delete.
grant select, insert on public.revenue_recovery_evenements to authenticated;
