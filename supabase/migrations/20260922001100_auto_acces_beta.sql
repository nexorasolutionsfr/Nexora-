-- Nexora Auto — accès contrôlé : fermé par défaut, bêta privée, ouvert.
--
-- ================================================================
-- 1. LE BESOIN
-- ================================================================
--
-- Nexora Auto doit pouvoir être déployé sans être ouvert au public, puis
-- ouvert à une liste courte de personnes invitées. Le contrôle ne peut pas
-- vivre seulement dans l'écran : l'application parle directement à la base
-- (supabase-js). Il est donc posé ICI, sur les données elles-mêmes.
--
-- a. `auto_acces_parametres` (une seule ligne) : `mode` parmi
--    - 'ferme'  : personne n'accède aux données Nexora Auto (DÉFAUT) ;
--    - 'beta'   : seulement les comptes dont l'adresse CONFIRMÉE figure dans
--                 `auto_acces_beta` ;
--    - 'ouvert' : tout compte connecté.
-- b. `auto_acces_beta` : les adresses invitées (en minuscules). Ajouter une
--    adresse n'envoie rien à personne.
-- c. `auto_acces_autorise()` : la règle ci-dessus pour la personne connectée.
--    Elle lit l'adresse et sa confirmation dans `auth.users`, jamais dans le
--    jeton : une adresse invitée non confirmée n'ouvre rien.
-- d. Politiques RESTRICTIVES (combinées en ET avec les politiques existantes,
--    qui ne changent pas) sur toutes les tables de données personnelles Auto
--    et sur les fichiers du compartiment `auto-documents` : sans accès, rien
--    ne se lit, ne s'écrit, ne se modifie ni ne se supprime. Les fonctions
--    Auto (droits de la personne) y sont soumises d'office. Le catalogue des
--    prestations (`auto_services`, `auto_services_modes`, `auto_offres`,
--    `auto_partenaires`) reste lisible : il ne contient aucune donnée
--    personnelle.
-- e. `auto_etat_acces()` : ce que l'écran doit afficher (mode, autorisé).
--
-- ================================================================
-- 2. DROITS
-- ================================================================
--
-- Les deux tables : service_role seulement (tableau de bord Supabase ou
-- serveur). `auto_acces_autorise` et `auto_etat_acces` : exécutables par
-- `authenticated`, jamais par `anon`.
--
-- ================================================================
-- 3. EFFET SUR UNE BASE EXISTANTE
-- ================================================================
--
-- Le mode par défaut est 'ferme' : sur une base où Nexora Auto était déjà
-- utilisé (Test), il faut ensuite choisir le mode, par exemple :
--   update public.auto_acces_parametres set mode = 'beta';
--   insert into public.auto_acces_beta (email, note) values ('…', '…');
-- Aucune donnée n'est modifiée ni supprimée.
--
-- ================================================================
-- 4. RETOUR ARRIÈRE
-- ================================================================
--
-- Supprimer les politiques `auto_acces_restreint` (tables listées plus bas)
-- et `auto_documents_stockage_acces` (storage.objects), puis les fonctions
-- `auto_etat_acces` et `auto_acces_autorise`, puis les tables
-- `auto_acces_beta` et `auto_acces_parametres`. Les données Auto restent.

-- ----------------------------------------------------------------
-- a et b. Paramètres et liste des adresses invitées
-- ----------------------------------------------------------------

create table if not exists public.auto_acces_parametres (
  unique_ligne boolean primary key default true,
  mode text not null default 'ferme',
  updated_at timestamptz not null default now(),
  constraint auto_acces_parametres_une_ligne check (unique_ligne),
  constraint auto_acces_parametres_mode_valide check (mode in ('ferme', 'beta', 'ouvert'))
);

insert into public.auto_acces_parametres (unique_ligne, mode) values (true, 'ferme')
on conflict (unique_ligne) do nothing;

comment on table public.auto_acces_parametres is
  'Nexora Auto : mode d''accès (ferme par défaut, beta, ouvert). Une seule ligne. Modifiable par le rôle de service seulement.';

create table if not exists public.auto_acces_beta (
  email text primary key,
  note text,
  ajoute_le timestamptz not null default now(),
  constraint auto_acces_beta_email_minuscule check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  constraint auto_acces_beta_note_courte check (note is null or length(note) <= 200)
);

comment on table public.auto_acces_beta is
  'Nexora Auto : adresses invitées à la bêta privée (en minuscules). Aucune invitation n''est envoyée par la base.';

drop trigger if exists auto_acces_parametres_horodater on public.auto_acces_parametres;
create trigger auto_acces_parametres_horodater
  before update on public.auto_acces_parametres
  for each row execute function public.auto_horodater();

alter table public.auto_acces_parametres enable row level security;
alter table public.auto_acces_beta enable row level security;
revoke all on table public.auto_acces_parametres, public.auto_acces_beta from public, anon, authenticated;
grant all on table public.auto_acces_parametres, public.auto_acces_beta to service_role;

-- ----------------------------------------------------------------
-- c. La règle d'accès
-- ----------------------------------------------------------------

create or replace function public.auto_acces_autorise()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case p.mode
      when 'ouvert' then (select auth.uid()) is not null
      when 'beta' then exists (
        select 1
        from auth.users u
        join public.auto_acces_beta b on b.email = lower(u.email)
        where u.id = (select auth.uid()) and u.email_confirmed_at is not null
      )
      else false
    end
    from public.auto_acces_parametres p
    where p.unique_ligne
  ), false)
$$;

revoke execute on function public.auto_acces_autorise() from public, anon;
grant execute on function public.auto_acces_autorise() to authenticated, service_role;

-- ----------------------------------------------------------------
-- d. Politiques restrictives
-- ----------------------------------------------------------------

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'auto_vehicules', 'auto_releves_km', 'auto_historique', 'auto_documents',
    'auto_taches', 'auto_preferences', 'auto_rappels_reports', 'auto_lectures'
  ] loop
    execute format('drop policy if exists auto_acces_restreint on public.%I', v_table);
    execute format(
      'create policy auto_acces_restreint on public.%I as restrictive for all to authenticated '
      'using ((select public.auto_acces_autorise())) with check ((select public.auto_acces_autorise()))',
      v_table
    );
  end loop;
end;
$$;

-- Fichiers : seul le compartiment Nexora Auto est concerné ; les autres
-- compartiments (Nexora Pro) ne changent pas.
drop policy if exists auto_documents_stockage_acces on storage.objects;
create policy auto_documents_stockage_acces on storage.objects
  as restrictive
  for all
  to authenticated
  using (bucket_id <> 'auto-documents' or (select public.auto_acces_autorise()))
  with check (bucket_id <> 'auto-documents' or (select public.auto_acces_autorise()));

-- ----------------------------------------------------------------
-- e. Ce que l'écran doit afficher
-- ----------------------------------------------------------------

create or replace function public.auto_etat_acces()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'mode', coalesce((select p.mode from public.auto_acces_parametres p where p.unique_ligne), 'ferme'),
    'autorise', public.auto_acces_autorise()
  )
$$;

revoke execute on function public.auto_etat_acces() from public, anon;
grant execute on function public.auto_etat_acces() to authenticated, service_role;
