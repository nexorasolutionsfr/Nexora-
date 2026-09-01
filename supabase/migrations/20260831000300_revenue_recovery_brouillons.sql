-- Revenue Recovery V1 — fondations (lot 2/2 : brouillons).
-- Migration additive, idempotente, non destructive.
--
-- Un brouillon est l'état courant, modifiable, d'une relance en
-- préparation — distinct de la tentative figée (revenue_recovery_tentatives,
-- migration suivante) qui porte le contenu réellement envoyé. Une même
-- table ne peut pas être à la fois append-only et librement modifiable :
-- ce fichier ne gère que la partie mutable, jamais un contenu envoyé.

create table if not exists public.revenue_recovery_brouillons (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references public.garages(id) on delete cascade,
  -- CASCADE ici (contrairement aux tables de preuve suivantes) : un
  -- brouillon jamais envoyé n'a aucune valeur de preuve une fois son
  -- travail différé source supprimé.
  travail_differe_id uuid not null references public.travaux_differes(id) on delete cascade,
  canal text not null check (canal in ('email')),
  contenu text not null,
  statut text not null default 'brouillon' check (statut in ('brouillon', 'abandonne', 'transforme_en_tentative')),
  cree_par uuid not null,
  modifie_par uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un seul brouillon actif à la fois par travail différé : empêche déjà, au
-- niveau base, l'ouverture de deux brouillons concurrents (ex. deux onglets)
-- sur le même travail différé.
create unique index if not exists revenue_recovery_brouillons_actif_unique
  on public.revenue_recovery_brouillons (travail_differe_id)
  where statut = 'brouillon';

comment on table public.revenue_recovery_brouillons is
  'Brouillon de relance, modifiable tant que statut=brouillon. Une fois abandonné ou transformé en tentative, verrouillé (voir trigger ci-dessous) — ne contient jamais un contenu réellement envoyé.';

create or replace function public.revenue_recovery_brouillons_identite_insert()
returns trigger
language plpgsql
as $$
begin
  new.cree_par := auth.uid();
  new.modifie_par := auth.uid();
  new.created_at := now();
  new.updated_at := now();
  -- Cohérence inter-garages : travail_differe_id doit appartenir au même
  -- garage_id (le RLS seul ne le garantit pas — voir même contrôle sur
  -- revenue_recovery_permissions).
  if not exists (
    select 1 from public.travaux_differes
    where id = new.travail_differe_id and garage_id = new.garage_id
  ) then
    raise exception 'travail_differe_id % n''appartient pas au garage %', new.travail_differe_id, new.garage_id;
  end if;
  return new;
end;
$$;

drop trigger if exists revenue_recovery_brouillons_avant_insert on public.revenue_recovery_brouillons;
create trigger revenue_recovery_brouillons_avant_insert
  before insert on public.revenue_recovery_brouillons
  for each row
  execute function public.revenue_recovery_brouillons_identite_insert();

-- Verrouillage : un brouillon déjà fermé (abandonné ou transformé) ne peut
-- plus être modifié, quel que soit le champ visé. Les colonnes d'origine
-- (garage/travail/créateur/date de création) sont également figées pour
-- empêcher un déplacement déguisé en modification de contenu.
create or replace function public.revenue_recovery_brouillons_verrouiller()
returns trigger
language plpgsql
as $$
begin
  if old.statut <> 'brouillon' then
    raise exception 'Brouillon verrouillé (statut=%) : modification refusée', old.statut;
  end if;
  new.modifie_par := auth.uid();
  new.updated_at := now();
  new.garage_id := old.garage_id;
  new.travail_differe_id := old.travail_differe_id;
  new.cree_par := old.cree_par;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists revenue_recovery_brouillons_avant_update on public.revenue_recovery_brouillons;
create trigger revenue_recovery_brouillons_avant_update
  before update on public.revenue_recovery_brouillons
  for each row
  execute function public.revenue_recovery_brouillons_verrouiller();

alter table public.revenue_recovery_brouillons enable row level security;

drop policy if exists revenue_recovery_brouillons_isolation on public.revenue_recovery_brouillons;
create policy revenue_recovery_brouillons_isolation on public.revenue_recovery_brouillons
  for all
  using (garage_id in (select id from public.garages where owner_user_id = auth.uid()))
  with check (garage_id in (select id from public.garages where owner_user_id = auth.uid()));

-- select/insert/update : un brouillon doit rester réécrivable tant qu'il
-- est ouvert (le trigger ci-dessus interdit la réécriture une fois fermé).
-- Aucun delete : même un brouillon abandonné reste traçable dans son statut.
grant select, insert, update on public.revenue_recovery_brouillons to authenticated;
