-- Revenue Recovery V1 — fondations (lot 1/2 : activation).
-- Migration additive, idempotente, non destructive : aucune table existante
-- n'est modifiée. Module derrière un dispositif fermé par défaut, distinct
-- d'une simple variable NEXT_PUBLIC_* : un flag frontend seul ne peut pas
-- limiter un pilote à un garage précis, l'autorité doit être côté serveur.
--
-- Un garage n'apparaît dans cette table qu'une fois explicitement autorisé
-- par un acteur habilité, hors application (intervention directe en
-- environnement autorisé — même méthode que les fixtures déjà pratiquées
-- sur ce projet). Absence de ligne, ou autorise=false, signifie fermé.

create table if not exists public.revenue_recovery_garages_autorises (
  garage_id uuid primary key references public.garages(id) on delete cascade,
  autorise boolean not null default false,
  motif text,
  autorise_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.revenue_recovery_garages_autorises is
  'Autorisation serveur du module Revenue Recovery, par garage. Absence de ligne ou autorise=false = fermé. Écriture réservée à un acteur habilité hors application : aucun garage ne peut s''auto-activer.';

create or replace function public.revenue_recovery_garages_autorises_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists revenue_recovery_garages_autorises_updated_at on public.revenue_recovery_garages_autorises;
create trigger revenue_recovery_garages_autorises_updated_at
  before update on public.revenue_recovery_garages_autorises
  for each row
  execute function public.revenue_recovery_garages_autorises_set_updated_at();

-- RLS : un garage peut seulement lire SA propre ligne d'autorisation.
alter table public.revenue_recovery_garages_autorises enable row level security;

drop policy if exists revenue_recovery_garages_autorises_lecture on public.revenue_recovery_garages_autorises;
create policy revenue_recovery_garages_autorises_lecture on public.revenue_recovery_garages_autorises
  for select
  to authenticated
  using (
    garage_id in (select id from public.garages where owner_user_id = auth.uid())
  );

-- Volontairement AUCUN grant insert/update/delete à `authenticated` : seule
-- une intervention hors application peut activer ou désactiver un garage.
-- Le frontend n'est jamais la source d'autorité finale.
grant select on public.revenue_recovery_garages_autorises to authenticated;

-- Pas de fixture ici : insérée après application de cette migration, une
-- fois le garage pilote choisi en environnement autorisé (même pattern que
-- travaux_differes et le Cockpit).
