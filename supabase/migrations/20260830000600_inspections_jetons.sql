-- Lien sécurisé du portail client d'inspection — même pattern que
-- confirmations_jetons (20260830000100_jeton_confirmation.sql) : jeton opaque
-- 256 bits, seule l'empreinte SHA-256 est stockée, jamais le jeton brut.
-- Idempotent, non destructif.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.inspections_jetons (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  garage_id uuid not null references public.garages(id) on delete cascade,
  jeton_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists inspections_jetons_inspection_idx
  on public.inspections_jetons (inspection_id);

alter table public.inspections_jetons enable row level security;
-- Aucune policy : verrouillée pour anon/authenticated, accès uniquement via
-- les fonctions security definer de 20260830000700_inspections_rpc.sql.

comment on table public.inspections_jetons is
  'Jetons opaques du portail client d''inspection. used_at marque la fin de la décision (toutes les décisions rendues), pas un usage unique : le client peut revenir consulter le rapport tant que le lien n''est pas expiré/révoqué.';

-- Bucket de stockage des photos d'inspection. Public en lecture : les chemins
-- sont des UUID non devinables (garage_id/inspection_id/uuid.jpg), même modèle
-- de sécurité "lien opaque" que le reste de cette fonctionnalité — pas de
-- listing possible, pas d'énumération. Écriture/suppression réservées au
-- garage propriétaire.
insert into storage.buckets (id, name, public)
values ('inspections-photos', 'inspections-photos', true)
on conflict (id) do nothing;

drop policy if exists inspections_photos_storage_write on storage.objects;
create policy inspections_photos_storage_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'inspections-photos'
    and (storage.foldername(name))[1]::uuid in (select id from public.garages where owner_user_id = auth.uid())
  );

drop policy if exists inspections_photos_storage_read on storage.objects;
create policy inspections_photos_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'inspections-photos'
    and (storage.foldername(name))[1]::uuid in (select id from public.garages where owner_user_id = auth.uid())
  );

drop policy if exists inspections_photos_storage_delete on storage.objects;
create policy inspections_photos_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'inspections-photos'
    and (storage.foldername(name))[1]::uuid in (select id from public.garages where owner_user_id = auth.uid())
  );
