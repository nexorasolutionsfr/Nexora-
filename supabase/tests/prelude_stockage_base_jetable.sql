-- Maquette MINIMALE du schéma `storage` de Supabase, pour éprouver les
-- migrations Nexora Auto sur une base jetable (image supabase/postgres, dont
-- le schéma `storage` est vide).
--
-- ⚠️ JAMAIS sur Test ni sur Production : ces bases ont le vrai schéma, et
-- `create or replace function storage.foldername` remplacerait la fonction
-- de Supabase.
--
-- Ne reproduit que ce que les règles de auto-documents utilisent : les deux
-- tables, la RLS sur les objets et storage.foldername().

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language plpgsql
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end;
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
