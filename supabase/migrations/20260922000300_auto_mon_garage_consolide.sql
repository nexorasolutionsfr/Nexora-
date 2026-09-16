-- Nexora Auto — lot B : consolider « Mon garage ».
--
-- ================================================================
-- 1. LE BESOIN
-- ================================================================
--
-- « J'ajoute ma voiture et Nexora m'aide déjà à mieux la gérer. » Après le
-- lot A (voiture, kilométrage, historique, échéances), la personne doit
-- pouvoir :
--   - gérer plusieurs voitures et désigner sa voiture principale ;
--   - archiver une voiture sans perdre son historique ;
--   - conserver ses documents (factures, carnet, procès-verbal, carte grise,
--     assurance) et les rattacher aux interventions qu'ils justifient.
-- Les dépenses se calculent côté application à partir des montants de
-- l'historique (lib/auto/depenses.js) : aucune donnée nouvelle.
--
-- ================================================================
-- 2. CE QUE FAIT CETTE MIGRATION (additive)
-- ================================================================
--
-- a. `auto_vehicules.principal` : une seule voiture principale par personne
--    (index unique partiel), jamais une voiture archivée. La première voiture
--    ajoutée devient principale ; `auto_definir_principal` change de voiture
--    principale en une transaction.
-- b. `auto_vehicules.archive_le` : une voiture archivée quitte la liste
--    courante mais garde tout son dossier ; elle se restaure.
--    `auto_archiver_vehicule` archive ou restaure en gardant une voiture
--    principale : si la principale part aux archives, la plus ancienne voiture
--    active prend sa place ; une voiture restaurée sans principale le devient.
-- c. `auto_documents` + compartiment privé `auto-documents` : le fichier vit
--    sous `<propriétaire>/<voiture>/<fichier>`. Les règles du stockage et de
--    la table vérifient toutes deux que ce chemin appartient à la personne
--    connectée. Un document peut justifier une intervention de la même
--    voiture (`historique_id`), jamais d'une autre.
--
-- Droits : `security invoker` partout, RLS par propriétaire, aucun droit pour
-- `anon`. Le compartiment n'est jamais public : un fichier s'ouvre par une
-- adresse signée de courte durée.
--
-- Retour arrière : supprimer `auto_documents`, les politiques
-- `auto_documents_stockage_*`, le compartiment `auto-documents` (vide),
-- `auto_definir_principal`, `auto_archiver_vehicule`, les colonnes `principal`
-- et `archive_le`, et
-- recréer `auto_ajouter_vehicule` telle que dans 20260922000200.

-- ----------------------------------------------------------------
-- a. Voiture principale et archivage
-- ----------------------------------------------------------------

alter table public.auto_vehicules
  add column if not exists principal boolean not null default false,
  add column if not exists archive_le timestamptz;

alter table public.auto_vehicules drop constraint if exists auto_vehicules_principal_actif;
alter table public.auto_vehicules add constraint auto_vehicules_principal_actif
  check (not (principal and archive_le is not null));

create unique index if not exists auto_vehicules_un_principal
  on public.auto_vehicules (proprietaire_id)
  where principal;

-- Les voitures déjà enregistrées : la plus ancienne voiture active de chaque
-- personne devient principale, si elle n'en a aucune.
update public.auto_vehicules v
set principal = true
where v.id in (
  select distinct on (x.proprietaire_id) x.id
  from public.auto_vehicules x
  where x.archive_le is null
  order by x.proprietaire_id, x.created_at, x.id
)
and not exists (
  select 1 from public.auto_vehicules p where p.proprietaire_id = v.proprietaire_id and p.principal
);

comment on column public.auto_vehicules.principal is
  'Nexora Auto : voiture principale de la personne (une au plus, jamais archivée).';
comment on column public.auto_vehicules.archive_le is
  'Nexora Auto : date d''archivage. Une voiture archivée garde tout son dossier et se restaure.';

-- Changer de voiture principale : deux ordres dans une transaction, car un
-- index unique se vérifie ligne à ligne.
create or replace function public.auto_definir_principal(p_vehicule_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'auto_definir_principal : session requise';
  end if;
  if not exists (
    select 1 from public.auto_vehicules v
    where v.id = p_vehicule_id and v.proprietaire_id = (select auth.uid()) and v.archive_le is null
  ) then
    raise exception using errcode = 'P0002', message = 'auto_definir_principal : voiture introuvable ou archivée (auto_principal_impossible)';
  end if;

  update public.auto_vehicules
  set principal = false
  where proprietaire_id = (select auth.uid()) and principal and id <> p_vehicule_id;

  update public.auto_vehicules
  set principal = true
  where id = p_vehicule_id;
end;
$$;

revoke all on function public.auto_definir_principal(uuid) from public, anon;
grant execute on function public.auto_definir_principal(uuid) to authenticated;

create or replace function public.auto_archiver_vehicule(p_vehicule_id uuid, p_archiver boolean default true)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_etait_principal boolean;
  v_suivant uuid;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'auto_archiver_vehicule : session requise';
  end if;
  select v.principal into v_etait_principal
  from public.auto_vehicules v
  where v.id = p_vehicule_id and v.proprietaire_id = (select auth.uid());
  if not found then
    raise exception using errcode = 'P0002', message = 'auto_archiver_vehicule : voiture introuvable (auto_vehicule_introuvable)';
  end if;

  if p_archiver then
    update public.auto_vehicules
    set archive_le = coalesce(archive_le, now()), principal = false
    where id = p_vehicule_id;
    if v_etait_principal then
      select v.id into v_suivant
      from public.auto_vehicules v
      where v.proprietaire_id = (select auth.uid()) and v.archive_le is null
      order by v.created_at, v.id
      limit 1;
      if v_suivant is not null then
        update public.auto_vehicules set principal = true where id = v_suivant;
      end if;
    end if;
  else
    update public.auto_vehicules set archive_le = null where id = p_vehicule_id;
    if not exists (
      select 1 from public.auto_vehicules v where v.proprietaire_id = (select auth.uid()) and v.principal
    ) then
      update public.auto_vehicules set principal = true where id = p_vehicule_id;
    end if;
  end if;
end;
$$;

revoke all on function public.auto_archiver_vehicule(uuid, boolean) from public, anon;
grant execute on function public.auto_archiver_vehicule(uuid, boolean) to authenticated;

-- La première voiture d'une personne devient sa voiture principale. Même
-- signature que 20260922000200 : seul le corps change.
create or replace function public.auto_ajouter_vehicule(
  p_marque text,
  p_modele text,
  p_annee integer default null,
  p_energie text default null,
  p_immatriculation text default null,
  p_date_mise_en_circulation date default null,
  p_kilometrage integer default null,
  p_dernier_controle date default null,
  p_controle_valable_jusqu_au date default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'auto_ajouter_vehicule : session requise';
  end if;
  if p_controle_valable_jusqu_au is not null and p_dernier_controle is null then
    raise exception using errcode = '22023', message = 'auto_ajouter_vehicule : date du procès-verbal sans date de contrôle (auto_controle_incomplet)';
  end if;

  insert into public.auto_vehicules (marque, modele, annee, energie, immatriculation, date_mise_en_circulation, principal)
  values (
    btrim(p_marque), btrim(p_modele), p_annee, nullif(btrim(p_energie), ''),
    nullif(btrim(p_immatriculation), ''), p_date_mise_en_circulation,
    not exists (select 1 from public.auto_vehicules x where x.proprietaire_id = (select auth.uid()) and x.principal)
  )
  returning id into v_id;

  if p_kilometrage is not null then
    insert into public.auto_releves_km (vehicule_id, kilometrage) values (v_id, p_kilometrage);
  end if;

  if p_dernier_controle is not null then
    insert into public.auto_historique (vehicule_id, type, realise_le, controle_valable_jusqu_au)
    values (v_id, 'controle_technique', p_dernier_controle, p_controle_valable_jusqu_au);
  end if;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------
-- b. Documents
-- ----------------------------------------------------------------

create table if not exists public.auto_documents (
  id uuid primary key default gen_random_uuid(),
  vehicule_id uuid not null references public.auto_vehicules(id) on delete cascade,
  -- L'intervention que ce document justifie, s'il y en a une.
  historique_id uuid references public.auto_historique(id) on delete set null,
  type text not null,
  titre text,
  date_document date,
  -- `<propriétaire>/<voiture>/<fichier>` dans le compartiment auto-documents.
  chemin text not null,
  nom_fichier text not null,
  type_mime text not null,
  taille_octets integer not null,
  source text not null default 'proprietaire',
  created_at timestamptz not null default now(),
  constraint auto_documents_chemin_unique unique (chemin),
  constraint auto_documents_type_valide check (
    type in ('facture', 'carnet_entretien', 'proces_verbal_ct', 'carte_grise', 'assurance', 'autre')
  ),
  constraint auto_documents_taille_bornee check (taille_octets between 1 and 10485760),
  constraint auto_documents_format_accepte check (
    type_mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')
  ),
  constraint auto_documents_titre_court check (titre is null or length(titre) <= 120),
  constraint auto_documents_nom_court check (length(nom_fichier) between 1 and 200),
  constraint auto_documents_source_valide check (source in ('proprietaire', 'prestation'))
);

create index if not exists auto_documents_vehicule_idx on public.auto_documents (vehicule_id, created_at desc);
create index if not exists auto_documents_historique_idx on public.auto_documents (historique_id) where historique_id is not null;

comment on table public.auto_documents is
  'Nexora Auto : document d''une voiture (facture, carnet, procès-verbal, carte grise, assurance). Fichier privé dans le compartiment auto-documents, sous <propriétaire>/<voiture>/.';

-- Cohérence : le chemin désigne bien le propriétaire et la voiture de la
-- ligne, et l'intervention justifiée est celle de la même voiture.
create or replace function public.auto_documents_coherence()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_proprietaire uuid;
begin
  select v.proprietaire_id into v_proprietaire from public.auto_vehicules v where v.id = new.vehicule_id;
  if v_proprietaire is null then
    raise exception using errcode = '23514', message = 'auto_documents : voiture introuvable (auto_document_incoherent)';
  end if;
  if split_part(new.chemin, '/', 1) <> v_proprietaire::text
     or split_part(new.chemin, '/', 2) <> new.vehicule_id::text
     or split_part(new.chemin, '/', 3) = ''
     or split_part(new.chemin, '/', 4) <> '' then
    raise exception using errcode = '23514', message = 'auto_documents : chemin hors du dossier de la voiture (auto_document_incoherent)';
  end if;
  if new.historique_id is not null and not exists (
    select 1 from public.auto_historique h where h.id = new.historique_id and h.vehicule_id = new.vehicule_id
  ) then
    raise exception using errcode = '23514', message = 'auto_documents : intervention d''une autre voiture (auto_document_incoherent)';
  end if;
  return new;
end;
$$;

drop trigger if exists auto_documents_coherence on public.auto_documents;
create trigger auto_documents_coherence
  before insert or update on public.auto_documents
  for each row execute function public.auto_documents_coherence();

drop trigger if exists auto_documents_date_future on public.auto_documents;
create trigger auto_documents_date_future
  before insert or update on public.auto_documents
  for each row execute function public.auto_refuser_date_future('date_document');

revoke execute on function public.auto_documents_coherence() from public, anon, authenticated, service_role;

alter table public.auto_documents enable row level security;

drop policy if exists auto_documents_lecture on public.auto_documents;
create policy auto_documents_lecture on public.auto_documents
  for select to authenticated
  using (exists (
    select 1 from public.auto_vehicules v
    where v.id = auto_documents.vehicule_id and v.proprietaire_id = (select auth.uid())
  ));

drop policy if exists auto_documents_ajout on public.auto_documents;
create policy auto_documents_ajout on public.auto_documents
  for insert to authenticated
  with check (source = 'proprietaire' and exists (
    select 1 from public.auto_vehicules v
    where v.id = auto_documents.vehicule_id and v.proprietaire_id = (select auth.uid())
  ));

drop policy if exists auto_documents_correction on public.auto_documents;
create policy auto_documents_correction on public.auto_documents
  for update to authenticated
  using (source = 'proprietaire' and exists (
    select 1 from public.auto_vehicules v
    where v.id = auto_documents.vehicule_id and v.proprietaire_id = (select auth.uid())
  ))
  with check (source = 'proprietaire' and exists (
    select 1 from public.auto_vehicules v
    where v.id = auto_documents.vehicule_id and v.proprietaire_id = (select auth.uid())
  ));

drop policy if exists auto_documents_suppression on public.auto_documents;
create policy auto_documents_suppression on public.auto_documents
  for delete to authenticated
  using (source = 'proprietaire' and exists (
    select 1 from public.auto_vehicules v
    where v.id = auto_documents.vehicule_id and v.proprietaire_id = (select auth.uid())
  ));

revoke all on table public.auto_documents from public, anon;
grant select, insert, update, delete on table public.auto_documents to authenticated;
grant all on table public.auto_documents to service_role;

-- ----------------------------------------------------------------
-- c. Le compartiment privé et ses règles
-- ----------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'auto-documents', 'auto-documents', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists auto_documents_stockage_lecture on storage.objects;
create policy auto_documents_stockage_lecture on storage.objects
  for select to authenticated
  using (
    bucket_id = 'auto-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Déposer seulement dans le dossier d'une de ses voitures.
drop policy if exists auto_documents_stockage_depot on storage.objects;
create policy auto_documents_stockage_depot on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'auto-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.auto_vehicules v
      where v.id::text = (storage.foldername(name))[2] and v.proprietaire_id = (select auth.uid())
    )
  );

drop policy if exists auto_documents_stockage_suppression on storage.objects;
create policy auto_documents_stockage_suppression on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'auto-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
