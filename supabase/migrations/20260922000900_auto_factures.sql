-- Nexora Auto — lot E (« lot 5 ») : ajouter une facture, enrichir le dossier.
--
-- ================================================================
-- 1. LE BESOIN
-- ================================================================
--
-- La personne dépose la facture qu'elle possède déjà ; Nexora en propose les
-- informations (date, professionnel, opérations, kilométrage, montant) ;
-- elle confirme une seule fois. Sans lecture automatique (pas de clé, budget
-- atteint, format non lisible), la facture est conservée et se renseigne à la
-- main avec le même écran.
--
-- a. `auto_documents.empreinte_sha256` : reconnaître un fichier déjà déposé
--    (unique par voiture). L'écran renvoie vers l'existant, sans nouvel envoi
--    ni nouvelle lecture.
--    `auto_documents.lecture` : la dernière proposition lue (champs et
--    certitudes). Supprimée avec le document.
-- b. `auto_historique.saisie` : 'manuelle' ou 'document' (« d'après votre
--    facture »). La provenance reste la personne (`source` = 'proprietaire') :
--    une lecture automatique ne fait jamais d'une intervention une donnée
--    vérifiée par Nexora.
--    `auto_historique.operations` : les opérations d'une facture. Une facture
--    = une intervention et UN montant total, compté une fois.
-- c. `auto_lectures` : le journal de chaque tentative de lecture (fournisseur,
--    modèle, jetons, coût ESTIMÉ, facturation connue ou non, durée, erreur,
--    corrections faites ensuite). Aucune donnée du document. Sert au budget
--    d'essai et à la mesure de la qualité.
-- d. `auto_lecture_reserver` (service_role) : sous verrou, refuse au-delà des
--    tentatives par document, des lectures par compte sur 24 h ou du budget,
--    puis réserve le pire coût possible. Une ligne restée « en_cours » garde
--    sa réserve : prudence. Une lecture gratuite (réserve 0) passe sans budget.
-- e. `auto_enregistrer_facture` (personne connectée, droits RLS) : en une
--    transaction, crée l'intervention OU rattache la facture à une
--    intervention existante choisie par la personne, puis relie le document.
--    Une intervention ressemblante (même voiture, même date, même montant —
--    ou même type si un montant manque) bloque la création tant que la
--    personne n'a pas choisi « Créer une autre intervention ». Rien n'est
--    fusionné, rien n'est remplacé. Le kilométrage n'écrase aucun relevé : il
--    devient un point daté de l'historique.
--
-- ================================================================
-- 2. DROITS
-- ================================================================
--
-- `auto_lectures` : la personne voit ses tentatives (statut, erreur, dates)
-- sans les colonnes de coût, et ne peut écrire que `confirmee_le` et
-- `corrections` (par auto_enregistrer_facture). Le reste : service_role.
--
-- ================================================================
-- 3. RETOUR ARRIÈRE
-- ================================================================
--
-- Supprimer les fonctions auto_enregistrer_facture, auto_lecture_reserver et
-- auto_operations_valides (après la contrainte qui l'utilise), la table
-- auto_lectures, les colonnes auto_historique.saisie et .operations,
-- auto_documents.empreinte_sha256 et .lecture, et l'index
-- auto_documents_empreinte_unique.

-- ----------------------------------------------------------------
-- a. Documents : empreinte et proposition lue
-- ----------------------------------------------------------------

alter table public.auto_documents
  add column if not exists empreinte_sha256 text,
  add column if not exists lecture jsonb;

alter table public.auto_documents drop constraint if exists auto_documents_empreinte_valide;
alter table public.auto_documents
  add constraint auto_documents_empreinte_valide check (empreinte_sha256 is null or empreinte_sha256 ~ '^[0-9a-f]{64}$');

alter table public.auto_documents drop constraint if exists auto_documents_lecture_objet;
alter table public.auto_documents
  add constraint auto_documents_lecture_objet check (lecture is null or (jsonb_typeof(lecture) = 'object' and pg_column_size(lecture) <= 65536));

create unique index if not exists auto_documents_empreinte_unique
  on public.auto_documents (vehicule_id, empreinte_sha256)
  where empreinte_sha256 is not null;

comment on column public.auto_documents.lecture is
  'Nexora Auto : dernière proposition lue automatiquement (champs, certitudes, opérations). Une proposition, jamais une donnée confirmée.';

-- ----------------------------------------------------------------
-- b. Historique : saisie d'après un document, opérations
-- ----------------------------------------------------------------

create or replace function public.auto_operations_valides(p_operations jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_operations is null or (
    jsonb_typeof(p_operations) = 'array'
    and jsonb_array_length(p_operations) between 1 and 30
    and not exists (
      select 1
      from jsonb_array_elements(p_operations) as e(operation)
      where case
        when jsonb_typeof(e.operation) <> 'object' then true
        else coalesce(e.operation ->> 'type', '') not in (
               'vidange', 'revision', 'controle_technique', 'pneus', 'freinage', 'batterie',
               'distribution', 'climatisation', 'carrosserie', 'reparation', 'lavage', 'autre')
          or length(btrim(coalesce(e.operation ->> 'libelle', ''))) not between 1 and 120
          or (select count(*) from jsonb_object_keys(e.operation)) <> 2
      end
    )
  )
$$;

revoke execute on function public.auto_operations_valides(jsonb) from public, anon;
grant execute on function public.auto_operations_valides(jsonb) to authenticated, service_role;

alter table public.auto_historique
  add column if not exists saisie text not null default 'manuelle',
  add column if not exists operations jsonb;

alter table public.auto_historique drop constraint if exists auto_historique_saisie_valide;
alter table public.auto_historique
  add constraint auto_historique_saisie_valide check (saisie in ('manuelle', 'document'));

alter table public.auto_historique drop constraint if exists auto_historique_operations_valides;
alter table public.auto_historique
  add constraint auto_historique_operations_valides check (public.auto_operations_valides(operations));

comment on column public.auto_historique.saisie is
  'Nexora Auto : manuelle, ou document (proposée d''après une facture fournie par la personne, puis confirmée par elle). Jamais une vérification Nexora.';

-- ----------------------------------------------------------------
-- c. Journal des lectures
-- ----------------------------------------------------------------

create table if not exists public.auto_lectures (
  id uuid primary key default gen_random_uuid(),
  -- set null : le coût d'un compte supprimé reste compté dans le budget.
  proprietaire_id uuid references auth.users(id) on delete set null,
  document_id uuid references public.auto_documents(id) on delete set null,
  fournisseur text not null,
  modele text not null,
  statut text not null default 'en_cours',
  facturation text,
  cout_reserve_micro_usd integer not null,
  cout_estime_micro_usd integer,
  tokens_entree integer,
  tokens_sortie integer,
  duree_ms integer,
  erreur text,
  corrections text[],
  confirmee_le timestamptz,
  created_at timestamptz not null default now(),
  termine_le timestamptz,
  constraint auto_lectures_fournisseur_valide check (fournisseur ~ '^[a-z0-9_]{2,40}$'),
  constraint auto_lectures_modele_valide check (length(modele) between 1 and 80),
  constraint auto_lectures_statut_valide check (statut in ('en_cours', 'reussie', 'echec')),
  constraint auto_lectures_facturation_valide check (facturation is null or facturation in ('facturee', 'non_facturee', 'inconnue')),
  constraint auto_lectures_couts_positifs check (
    cout_reserve_micro_usd >= 0 and (cout_estime_micro_usd is null or cout_estime_micro_usd >= 0)
    and (tokens_entree is null or tokens_entree >= 0) and (tokens_sortie is null or tokens_sortie >= 0)
    and (duree_ms is null or duree_ms >= 0)
  ),
  constraint auto_lectures_erreur_courte check (erreur is null or length(erreur) <= 80),
  constraint auto_lectures_corrections_bornees check (corrections is null or cardinality(corrections) <= 10)
);

create index if not exists auto_lectures_document_idx on public.auto_lectures (document_id);
create index if not exists auto_lectures_proprietaire_idx on public.auto_lectures (proprietaire_id, created_at desc);

comment on table public.auto_lectures is
  'Nexora Auto : une ligne par tentative de lecture automatique. Coût ESTIMÉ (la facture du fournisseur fait foi). Aucune donnée du document.';

alter table public.auto_lectures enable row level security;

drop policy if exists auto_lectures_proprietaire_lecture on public.auto_lectures;
create policy auto_lectures_proprietaire_lecture on public.auto_lectures
  for select to authenticated
  using (proprietaire_id = (select auth.uid()));

drop policy if exists auto_lectures_proprietaire_confirmation on public.auto_lectures;
create policy auto_lectures_proprietaire_confirmation on public.auto_lectures
  for update to authenticated
  using (proprietaire_id = (select auth.uid()))
  with check (proprietaire_id = (select auth.uid()));

revoke all on table public.auto_lectures from public, anon, authenticated;
grant select (id, document_id, statut, erreur, confirmee_le, created_at) on table public.auto_lectures to authenticated;
grant update (confirmee_le, corrections) on table public.auto_lectures to authenticated;
grant all on table public.auto_lectures to service_role;

-- ----------------------------------------------------------------
-- d. Réserver une lecture (serveur seulement)
-- ----------------------------------------------------------------

create or replace function public.auto_lecture_reserver(
  p_proprietaire_id uuid,
  p_document_id uuid,
  p_fournisseur text,
  p_modele text,
  p_cout_reserve_micro_usd integer,
  p_budget_micro_usd bigint,
  p_tentatives_max integer,
  p_lectures_24h_max integer
)
returns table (lecture_id uuid, refus text)
language plpgsql
set search_path = ''
as $$
declare
  v_depense bigint;
  v_id uuid;
begin
  -- Un seul calcul de budget à la fois.
  perform pg_advisory_xact_lock(hashtext('auto_lecture_budget'));

  -- Une lecture gratuite (réserve 0) n'a pas besoin de budget.
  if p_proprietaire_id is null or p_document_id is null or coalesce(p_cout_reserve_micro_usd, -1) < 0
     or (p_cout_reserve_micro_usd > 0 and coalesce(p_budget_micro_usd, 0) <= 0) then
    return query select null::uuid, 'parametres'::text;
    return;
  end if;

  if not exists (
    select 1 from public.auto_documents d
    join public.auto_vehicules v on v.id = d.vehicule_id
    where d.id = p_document_id and v.proprietaire_id = p_proprietaire_id
  ) then
    return query select null::uuid, 'document'::text;
    return;
  end if;

  if (select count(*) from public.auto_lectures l where l.document_id = p_document_id) >= p_tentatives_max then
    return query select null::uuid, 'tentatives'::text;
    return;
  end if;

  if (select count(*) from public.auto_lectures l
      where l.proprietaire_id = p_proprietaire_id and l.created_at > now() - interval '24 hours') >= p_lectures_24h_max then
    return query select null::uuid, 'quota'::text;
    return;
  end if;

  select coalesce(sum(case
           when l.statut = 'en_cours' then l.cout_reserve_micro_usd
           when l.facturation = 'non_facturee' then 0
           when l.cout_estime_micro_usd is not null then l.cout_estime_micro_usd
           else l.cout_reserve_micro_usd
         end), 0)
  into v_depense
  from public.auto_lectures l;

  if p_cout_reserve_micro_usd > 0 and v_depense + p_cout_reserve_micro_usd > p_budget_micro_usd then
    return query select null::uuid, 'budget'::text;
    return;
  end if;

  insert into public.auto_lectures (proprietaire_id, document_id, fournisseur, modele, cout_reserve_micro_usd)
  values (p_proprietaire_id, p_document_id, p_fournisseur, p_modele, p_cout_reserve_micro_usd)
  returning id into v_id;

  return query select v_id, null::text;
end;
$$;

revoke execute on function public.auto_lecture_reserver(uuid, uuid, text, text, integer, bigint, integer, integer) from public, anon, authenticated;
grant execute on function public.auto_lecture_reserver(uuid, uuid, text, text, integer, bigint, integer, integer) to service_role;

-- ----------------------------------------------------------------
-- e. Enregistrer une facture confirmée
-- ----------------------------------------------------------------

create or replace function public.auto_enregistrer_facture(
  p_document_id uuid,
  p_rattacher_a uuid,
  p_realise_le date,
  p_date_facture date,
  p_type text,
  p_operations jsonb,
  p_prestataire text,
  p_kilometrage integer,
  p_montant_ttc numeric,
  p_libelle text,
  p_creer_malgre_ressemblance boolean default false,
  p_lecture_id uuid default null,
  p_corrections text[] default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_document record;
  v_historique uuid;
  v_montant numeric(10,2) := round(p_montant_ttc, 2);
begin
  -- Droits de la personne : un document d'une autre personne est introuvable.
  select d.id, d.vehicule_id, d.historique_id into v_document
  from public.auto_documents d
  where d.id = p_document_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'auto_facture : document introuvable (auto_document_introuvable)';
  end if;
  if v_document.historique_id is not null then
    raise exception using errcode = '23505', message = 'auto_facture : facture déjà enregistrée (auto_facture_deja_enregistree)';
  end if;

  if p_rattacher_a is not null then
    -- Rattacher : la facture justifie une intervention existante, qui n'est
    -- pas modifiée.
    select h.id into v_historique
    from public.auto_historique h
    where h.id = p_rattacher_a and h.vehicule_id = v_document.vehicule_id;
    if v_historique is null then
      raise exception using errcode = 'P0002', message = 'auto_facture : intervention introuvable pour cette voiture (auto_intervention_introuvable)';
    end if;
  else
    if p_realise_le is null or p_type is null then
      raise exception using errcode = '23514', message = 'auto_facture : date et type d''intervention requis (auto_facture_incomplete)';
    end if;
    if not coalesce(p_creer_malgre_ressemblance, false) and exists (
      select 1 from public.auto_historique h
      where h.vehicule_id = v_document.vehicule_id
        and h.realise_le = p_realise_le
        and case
              when v_montant is not null and h.montant_ttc is not null then h.montant_ttc = v_montant
              else h.type = p_type
            end
    ) then
      raise exception using errcode = '23514', message = 'auto_facture : intervention ressemblante à trancher (auto_doublon_potentiel)';
    end if;

    insert into public.auto_historique (vehicule_id, type, realise_le, kilometrage, libelle, prestataire, montant_ttc, saisie, operations)
    values (
      v_document.vehicule_id, p_type, p_realise_le, p_kilometrage,
      nullif(btrim(p_libelle), ''), nullif(btrim(p_prestataire), ''), v_montant, 'document',
      case when jsonb_typeof(p_operations) = 'array' and jsonb_array_length(p_operations) = 0 then null else p_operations end
    )
    returning id into v_historique;
  end if;

  -- Titre lisible dans la liste des documents, s'il n'en a pas déjà un.
  update public.auto_documents d
  set historique_id = v_historique,
      type = 'facture',
      date_document = coalesce(p_date_facture, d.date_document),
      titre = coalesce(d.titre, (
        select left('Facture ' || h.prestataire, 120) from public.auto_historique h
        where h.id = v_historique and nullif(btrim(h.prestataire), '') is not null
      ))
  where d.id = v_document.id;

  if p_lecture_id is not null then
    update public.auto_lectures
    set confirmee_le = now(), corrections = p_corrections
    where id = p_lecture_id and document_id = v_document.id;
  end if;

  return v_historique;
end;
$$;

revoke execute on function public.auto_enregistrer_facture(uuid, uuid, date, date, text, jsonb, text, integer, numeric, text, boolean, uuid, text[]) from public, anon;
grant execute on function public.auto_enregistrer_facture(uuid, uuid, date, date, text, jsonb, text, integer, numeric, text, boolean, uuid, text[]) to authenticated, service_role;
