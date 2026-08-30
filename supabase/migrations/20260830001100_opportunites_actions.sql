-- Cockpit Opportunités V1 — journal append-only des actions "traiter /
-- reporter / réactiver" posées sur une opportunité du Command Center.
-- Les opportunités elles-mêmes ne sont jamais stockées : elles sont dérivées
-- à la volée des tables existantes (rappels_manques, demandes, rendez_vous,
-- inspections, travaux_differes, clients). Seule la trace des décisions du
-- garage sur ces opportunités est persistée ici.
-- Idempotent, non destructif. N'ALTÈRE AUCUNE table existante (notamment
-- travaux_differes*, gelé).

create table if not exists public.opportunites_actions (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references public.garages(id) on delete cascade,
  -- Type de la source réelle Nexora concernée — une opportunité renvoie
  -- toujours vers un événement existant, jamais une tâche générique.
  source_type text not null check (source_type in (
    'rappel', 'demande', 'proposition', 'devis',
    'rdv_confirmation', 'inspection', 'travail_differe', 'client_dormant'
  )),
  source_id uuid not null,
  action text not null check (action in ('traite', 'reporte', 'reactiver')),
  motif text,
  -- Obligatoire uniquement pour "reporte" : jusqu'à quand masquer l'opportunité.
  masquer_jusqu_au timestamptz,
  -- Identité et horodatage de qui a posé l'action — jamais fournis par le
  -- client, toujours forcés serveur par le trigger ci-dessous.
  effectue_par uuid not null,
  created_at timestamptz not null default now(),
  constraint opportunites_actions_reporte_complet check (
    action <> 'reporte' or (
      motif is not null and length(trim(motif)) > 0 and masquer_jusqu_au is not null
    )
  )
);

create index if not exists opportunites_actions_source_idx
  on public.opportunites_actions (garage_id, source_type, source_id, created_at desc);

comment on table public.opportunites_actions is
  'Journal append-only des actions traiter/reporter/réactiver sur les opportunités du Command Center. La ligne la plus récente par (garage_id, source_type, source_id) fait foi pour l''état visible/masqué. Jamais de update ni delete (voir migration de grants).';

-- effectue_par/created_at forcés côté serveur, quoi que le client envoie :
-- garantit l'identité et l'horodatage réels de l'action, jamais falsifiables.
create or replace function public.opportunites_actions_forcer_identite()
returns trigger
language plpgsql
as $$
begin
  new.effectue_par := auth.uid();
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists opportunites_actions_avant_insert on public.opportunites_actions;
create trigger opportunites_actions_avant_insert
  before insert on public.opportunites_actions
  for each row
  execute function public.opportunites_actions_forcer_identite();

-- RLS : isolation stricte par garage, pattern identique au reste du projet.
alter table public.opportunites_actions enable row level security;

drop policy if exists opportunites_actions_isolation on public.opportunites_actions;
create policy opportunites_actions_isolation on public.opportunites_actions
  for all
  using (garage_id in (select id from public.garages where owner_user_id = auth.uid()))
  with check (garage_id in (select id from public.garages where owner_user_id = auth.uid()));
