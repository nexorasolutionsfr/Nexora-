-- Nexora Confirmation RDV — file de préparation des rappels (simulation)
-- Idempotent : reconnaît les objets déjà appliqués en production, ne les recrée pas.
-- NE PAS exécuter aveuglément : ce script documente un état déjà en place le 2026-08-30.

create table if not exists public.confirmations_rappels_file (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references public.garages(id),
  rendez_vous_id uuid not null references public.rendez_vous(id),
  echeance_rdv timestamptz not null,
  destinataire_email text,
  lien_public text not null,
  statut text not null default 'prepare' check (statut in ('prepare','envoye','erreur')),
  erreur_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rendez_vous_id, echeance_rdv)
);

-- RLS activée sans policy = verrouillée par défaut (aucun accès anon/authenticated,
-- seul service_role/postgres via fonctions security definer y accède). État vérifié en prod.
alter table public.confirmations_rappels_file enable row level security;

create extension if not exists pg_cron with schema extensions;

create or replace function public.preparer_rappels_confirmation()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  insert into confirmations_rappels_file (garage_id, rendez_vous_id, echeance_rdv, destinataire_email, lien_public, statut)
  select rv.garage_id, rv.id, rv.date_debut, c.email,
         'https://nexora-garage.vercel.app/confirmation/' || rv.id::text,
         'prepare'
  from rendez_vous rv
  join garages g on g.id = rv.garage_id
  left join clients c on c.id = rv.client_id
  where rv.statut = 'confirme'
    and rv.source = 'test'
    and g.rappel_confirmation_actif = true
    and rv.date_debut > now()
    and rv.date_debut - (coalesce(g.delai_confirmation_rdv_h, 24) || ' hours')::interval <= now()
    and not exists (
      select 1 from confirmations_rappels_file f
      where f.rendez_vous_id = rv.id and f.echeance_rdv = rv.date_debut
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Planification idempotente : ne (re)programme le job que s'il n'existe pas déjà.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'preparer-rappels-confirmation') then
    perform cron.schedule('preparer-rappels-confirmation', '*/10 * * * *', $cron$select public.preparer_rappels_confirmation();$cron$);
  end if;
end;
$$;

-- BLOQUANT SÉCURITÉ CONNU (non corrigé dans cette migration, voir rapport) :
-- app/confirmation/[id]/page.tsx utilise l'UUID brut du rendez-vous comme unique clé
-- d'accès au parcours public (confirmer/reporter/annuler), pas un jeton opaque dédié,
-- ni expirable, ni révocable. Correctif proposé, non implémenté ici : table
-- confirmations_jetons (token aléatoire non devinable, rdv_id, expires_at, revoked_at),
-- les fonctions publiques prennent le token en paramètre au lieu de l'id du RDV.
