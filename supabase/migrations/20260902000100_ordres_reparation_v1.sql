-- Ordre de Réparation (OR) V1 — schéma additif.
-- Référence : docs/architecture/ordre-reparation-v1.md (contrat validé).
-- Additif uniquement : crée trois tables neuves (ordres_reparation,
-- ordres_reparation_lignes, ordres_reparation_historique) et leurs objets
-- associés. Ne modifie, n'altère et ne supprime AUCUNE table existante
-- (rendez_vous, devis, factures, clients, vehicules, garages, mecaniciens,
-- prestations) ni l'historique de migrations. Idempotent : create table if
-- not exists, drop policy/trigger if exists avant recréation. Aucun DROP de
-- table ni de données, aucun SQL de réparation.

-- =====================================================================
-- 1. Table ordres_reparation
-- =====================================================================

create table if not exists public.ordres_reparation (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references public.garages(id) on delete restrict,
  rendez_vous_id uuid not null references public.rendez_vous(id) on delete restrict,
  vehicule_id uuid not null references public.vehicules(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  devis_id uuid references public.devis(id) on delete set null,
  mecanicien_id uuid references public.mecaniciens(id) on delete set null,
  statut text not null default 'brouillon' check (
    statut in ('brouillon', 'confirme', 'termine', 'annule')
  ),
  notes_internes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ordres_reparation_rendez_vous_unique unique (rendez_vous_id)
);

-- rendez_vous_id / vehicule_id / client_id / garage_id sont "figés à la
-- création" (contrat C.1) : ON DELETE RESTRICT préserve la traçabilité en
-- empêchant la suppression d'un rendez-vous, véhicule, client ou garage
-- référencé par un OR. devis_id / mecanicien_id restent facultatifs et
-- passent à NULL si la ressource référencée disparaît.

create index if not exists ordres_reparation_garage_idx
  on public.ordres_reparation (garage_id);

create index if not exists ordres_reparation_devis_idx
  on public.ordres_reparation (devis_id);

create index if not exists ordres_reparation_mecanicien_idx
  on public.ordres_reparation (mecanicien_id);

comment on table public.ordres_reparation is
  'Ordre de Réparation V1 : relie un rendez-vous existant à son contenu itemisé (lignes) et à son suivi. Ne pilote jamais rendez_vous.statut_atelier, ne le lit qu''en lecture. Statut = cycle de vie du document (brouillon/confirme/termine/annule) ; aucune suppression, seule une annulation par statut est possible (voir ordres_reparation_lignes, ordres_reparation_historique).';

-- =====================================================================
-- 2. Table ordres_reparation_lignes
-- =====================================================================

create table if not exists public.ordres_reparation_lignes (
  id uuid primary key default gen_random_uuid(),
  ordre_reparation_id uuid not null references public.ordres_reparation(id) on delete cascade,
  garage_id uuid not null references public.garages(id) on delete restrict,
  type text not null check (type in ('main_oeuvre', 'piece')),
  libelle text not null,
  quantite numeric not null default 1 check (quantite > 0),
  prix_unitaire_ht numeric check (prix_unitaire_ht is null or prix_unitaire_ht >= 0),
  duree_minutes integer,
  prestation_id uuid references public.prestations(id) on delete set null,
  statut text not null default 'prevu' check (statut in ('prevu', 'fait', 'annule')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ordres_reparation_lignes_duree_check check (
    (type = 'main_oeuvre' and (duree_minutes is null or duree_minutes > 0))
    or (type = 'piece' and duree_minutes is null)
  )
);

create index if not exists ordres_reparation_lignes_ordre_idx
  on public.ordres_reparation_lignes (ordre_reparation_id);

create index if not exists ordres_reparation_lignes_garage_idx
  on public.ordres_reparation_lignes (garage_id);

comment on table public.ordres_reparation_lignes is
  'Lignes main-d''œuvre / pièces d''un Ordre de Réparation. prix_unitaire_ht est une estimation interne uniquement, jamais une valeur contractuelle ni un stock réel. quantite > 0, prix HT nul ou positif, duree_minutes strictement positive seulement pour type = main_oeuvre (nulle pour type = piece), imposé par contrainte CHECK.';

-- =====================================================================
-- 3. Table ordres_reparation_historique (append-only)
-- =====================================================================

create table if not exists public.ordres_reparation_historique (
  id uuid primary key default gen_random_uuid(),
  ordre_reparation_id uuid not null references public.ordres_reparation(id) on delete restrict,
  garage_id uuid not null references public.garages(id) on delete restrict,
  action text not null check (
    action in ('creation', 'changement_statut', 'changement_mecanicien', 'annulation')
  ),
  ancien_statut text,
  nouveau_statut text,
  motif text,
  effectue_par uuid,
  created_at timestamptz not null default now()
);

-- ordre_reparation_id est volontairement en ON DELETE RESTRICT (pas CASCADE) :
-- un OR n'est jamais supprimé en V1 (aucune policy DELETE plus bas), donc
-- cette relation ne doit jamais avoir à se comporter comme une suppression
-- en cascade. Elle joue un rôle protecteur : elle atteste que tout OR ayant
-- un historique reste, lui aussi, présent en base.

create index if not exists ordres_reparation_historique_ordre_idx
  on public.ordres_reparation_historique (ordre_reparation_id, created_at);

create index if not exists ordres_reparation_historique_garage_idx
  on public.ordres_reparation_historique (garage_id);

comment on table public.ordres_reparation_historique is
  'Historique append-only d''un Ordre de Réparation. Portée V1 strictement limitée à 4 actions : creation, changement_statut, changement_mecanicien, annulation — les modifications de lignes ne sont pas tracées en détail ici. Écrite exclusivement par le trigger ordres_reparation_log_historique (voir plus bas) ; aucune policy INSERT/UPDATE/DELETE directe pour le rôle garage authentifié.';

-- =====================================================================
-- 4. updated_at automatique (ordres_reparation, ordres_reparation_lignes)
-- =====================================================================

create or replace function public.ordres_reparation_set_updated_at()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ordres_reparation_updated_at on public.ordres_reparation;
create trigger ordres_reparation_updated_at
  before update on public.ordres_reparation
  for each row
  execute function public.ordres_reparation_set_updated_at();

drop trigger if exists ordres_reparation_lignes_updated_at on public.ordres_reparation_lignes;
create trigger ordres_reparation_lignes_updated_at
  before update on public.ordres_reparation_lignes
  for each row
  execute function public.ordres_reparation_set_updated_at();

-- =====================================================================
-- 5. Intégrité inter-garage (contrat C.4) — fonctions SECURITY INVOKER.
-- Pas de SECURITY DEFINER ici : ces fonctions ne font que relire des
-- tables (rendez_vous, devis, mecaniciens, prestations, ordres_reparation)
-- déjà isolées par garage via leurs propres policies RLS existantes ou
-- créées ci-dessous — la visibilité de l'appelant est donc déjà bornée à
-- son propre garage, et l'égalité est en plus vérifiée explicitement.
-- =====================================================================

create or replace function public.ordres_reparation_check_integrite()
returns trigger
language plpgsql
set search_path = 'public'
as $$
declare
  v_rdv_garage uuid;
  v_rdv_client uuid;
  v_rdv_vehicule uuid;
  v_devis_statut text;
  v_devis_garage uuid;
  v_devis_client uuid;
  v_devis_vehicule uuid;
  v_mecanicien_garage uuid;
begin
  if tg_op = 'UPDATE' then
    if new.rendez_vous_id is distinct from old.rendez_vous_id
      or new.vehicule_id is distinct from old.vehicule_id
      or new.client_id is distinct from old.client_id
      or new.garage_id is distinct from old.garage_id
    then
      raise exception
        'ordres_reparation: rendez_vous_id, vehicule_id, client_id et garage_id sont figes a la creation';
    end if;
  end if;

  select garage_id, client_id, vehicule_id
    into v_rdv_garage, v_rdv_client, v_rdv_vehicule
    from public.rendez_vous
    where id = new.rendez_vous_id;

  if not found then
    raise exception 'ordres_reparation: rendez_vous introuvable ou hors garage';
  end if;

  if v_rdv_garage is distinct from new.garage_id
    or v_rdv_client is distinct from new.client_id
    or v_rdv_vehicule is distinct from new.vehicule_id
  then
    raise exception
      'ordres_reparation: le rendez_vous ne correspond pas au garage, client ou vehicule de cet ordre de reparation';
  end if;

  if new.devis_id is not null then
    select statut, garage_id, client_id, vehicule_id
      into v_devis_statut, v_devis_garage, v_devis_client, v_devis_vehicule
      from public.devis
      where id = new.devis_id;

    if not found then
      raise exception 'ordres_reparation: devis introuvable ou hors garage';
    end if;

    if v_devis_statut is distinct from 'accepte' then
      raise exception
        'ordres_reparation: le devis doit etre accepte pour etre rattache a un ordre de reparation';
    end if;

    if v_devis_garage is distinct from new.garage_id
      or v_devis_client is distinct from new.client_id
      or v_devis_vehicule is distinct from new.vehicule_id
    then
      raise exception
        'ordres_reparation: le devis ne correspond pas au garage, client ou vehicule de cet ordre de reparation';
    end if;
  end if;

  if new.mecanicien_id is not null then
    select garage_id into v_mecanicien_garage
      from public.mecaniciens
      where id = new.mecanicien_id;

    if not found or v_mecanicien_garage is distinct from new.garage_id then
      raise exception 'ordres_reparation: mecanicien hors garage';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists ordres_reparation_check_integrite_trigger on public.ordres_reparation;
create trigger ordres_reparation_check_integrite_trigger
  before insert or update on public.ordres_reparation
  for each row
  execute function public.ordres_reparation_check_integrite();

create or replace function public.ordres_reparation_lignes_check_integrite()
returns trigger
language plpgsql
set search_path = 'public'
as $$
declare
  v_or_garage uuid;
  v_prestation_garage uuid;
begin
  select garage_id into v_or_garage
    from public.ordres_reparation
    where id = new.ordre_reparation_id;

  if not found then
    raise exception 'ordres_reparation_lignes: ordre de reparation introuvable ou hors garage';
  end if;

  if v_or_garage is distinct from new.garage_id then
    raise exception
      'ordres_reparation_lignes: garage_id incoherent avec l''ordre de reparation parent';
  end if;

  if new.prestation_id is not null then
    select garage_id into v_prestation_garage
      from public.prestations
      where id = new.prestation_id;

    if not found or v_prestation_garage is distinct from new.garage_id then
      raise exception 'ordres_reparation_lignes: prestation hors garage';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists ordres_reparation_lignes_check_integrite_trigger on public.ordres_reparation_lignes;
create trigger ordres_reparation_lignes_check_integrite_trigger
  before insert or update on public.ordres_reparation_lignes
  for each row
  execute function public.ordres_reparation_lignes_check_integrite();

-- =====================================================================
-- 6. Historique automatique (SECURITY DEFINER — seule fonction de ce
-- lot à en avoir réellement besoin : c'est le mécanisme qui garantit que
-- ordres_reparation_historique n'est écrite QUE par ce trigger, jamais
-- par une insertion directe du rôle garage authentifié — voir section 7,
-- aucune policy INSERT n'est accordée à authenticated sur cette table).
-- search_path fermé, corps minimal, ne lit/écrit que public.*.
-- =====================================================================

create or replace function public.ordres_reparation_log_historique()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ordres_reparation_historique (
      ordre_reparation_id, garage_id, action, nouveau_statut, effectue_par
    ) values (
      new.id, new.garage_id, 'creation', new.statut, coalesce(new.created_by, auth.uid())
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.statut is distinct from old.statut then
      insert into public.ordres_reparation_historique (
        ordre_reparation_id, garage_id, action, ancien_statut, nouveau_statut, effectue_par
      ) values (
        new.id,
        new.garage_id,
        case when new.statut = 'annule' then 'annulation' else 'changement_statut' end,
        old.statut,
        new.statut,
        auth.uid()
      );
    end if;

    if new.mecanicien_id is distinct from old.mecanicien_id then
      insert into public.ordres_reparation_historique (
        ordre_reparation_id, garage_id, action, effectue_par
      ) values (
        new.id, new.garage_id, 'changement_mecanicien', auth.uid()
      );
    end if;

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists ordres_reparation_log_historique_trigger on public.ordres_reparation;
create trigger ordres_reparation_log_historique_trigger
  after insert or update on public.ordres_reparation
  for each row
  execute function public.ordres_reparation_log_historique();

-- =====================================================================
-- 7. RLS — isolation par garage, motif versionné récent
-- (garage_id in (select id from public.garages where owner_user_id = auth.uid())).
-- Aucune dépendance à current_garage_id() (non versionnée). Aucune policy
-- pour anon. Aucun accès public, aucun jeton.
-- =====================================================================

alter table public.ordres_reparation enable row level security;
alter table public.ordres_reparation_lignes enable row level security;
alter table public.ordres_reparation_historique enable row level security;

-- ordres_reparation : SELECT / INSERT / UPDATE pour authenticated,
-- volontairement AUCUNE policy DELETE (voir A.8 et D du contrat :
-- l'annulation passe uniquement par UPDATE statut = 'annule').

drop policy if exists ordres_reparation_select on public.ordres_reparation;
create policy ordres_reparation_select on public.ordres_reparation
  for select
  to authenticated
  using (
    garage_id in (select id from public.garages where owner_user_id = auth.uid())
  );

drop policy if exists ordres_reparation_insert on public.ordres_reparation;
create policy ordres_reparation_insert on public.ordres_reparation
  for insert
  to authenticated
  with check (
    garage_id in (select id from public.garages where owner_user_id = auth.uid())
  );

drop policy if exists ordres_reparation_update on public.ordres_reparation;
create policy ordres_reparation_update on public.ordres_reparation
  for update
  to authenticated
  using (
    garage_id in (select id from public.garages where owner_user_id = auth.uid())
  )
  with check (
    garage_id in (select id from public.garages where owner_user_id = auth.uid())
  );

-- ordres_reparation_lignes : CRUD complet pour authenticated (ajout,
-- modification, suppression de lignes librement autorisés par le contrat,
-- seul l'OR parent est protégé contre la suppression).

drop policy if exists ordres_reparation_lignes_isolation on public.ordres_reparation_lignes;
create policy ordres_reparation_lignes_isolation on public.ordres_reparation_lignes
  for all
  to authenticated
  using (
    garage_id in (select id from public.garages where owner_user_id = auth.uid())
  )
  with check (
    garage_id in (select id from public.garages where owner_user_id = auth.uid())
  );

-- ordres_reparation_historique : SELECT uniquement pour authenticated.
-- Aucune policy INSERT/UPDATE/DELETE : les écritures passent exclusivement
-- par le trigger SECURITY DEFINER ordres_reparation_log_historique_trigger,
-- qui s'exécute avec les privilèges du propriétaire de la fonction (exempté
-- de RLS sur cette table en tant que propriétaire), et non ceux du rôle
-- garage authentifié.

drop policy if exists ordres_reparation_historique_select on public.ordres_reparation_historique;
create policy ordres_reparation_historique_select on public.ordres_reparation_historique
  for select
  to authenticated
  using (
    garage_id in (select id from public.garages where owner_user_id = auth.uid())
  );
