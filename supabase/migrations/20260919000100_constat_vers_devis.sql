-- Constat → devis sans ressaisie, et rattachement explicite d'un devis à une visite.
--
-- ================================================================
-- 1. CE QUI MANQUAIT
-- ================================================================
--
-- Un point constaté au contrôle (« plaquettes avant à 2 mm », photo à
-- l'appui) devait être retapé à la main dans le devis. Rien ne reliait une
-- ligne de devis au constat dont elle vient : impossible de savoir si un
-- constat avait déjà été chiffré, impossible de montrer la photo à côté de la
-- ligne. Conception dans docs/architecture/reduire-la-saisie-des-devis.md
-- (13 sept. 2026) ; les arbitrages du 14 sept. la remplacent sur deux points :
-- le brouillon se prépare AVANT la réponse du client au contrôle, et une
-- ligne non chiffrée porte un état explicite plutôt qu'un zéro silencieux.
--
-- Et un devis ne savait pas à quelle visite il se rapportait : `devis` n'a
-- pas de lien vers `rendez_vous`, seul l'ordre de réparation (qui exige un
-- devis accepté) faisait le pont. L'écran devinait donc « le devis du
-- véhicule » par `find` sur `vehicule_id` — faux dès la deuxième visite.
--
-- ================================================================
-- 2. CE QUE FAIT CETTE MIGRATION (additive, rien n'est réécrit)
-- ================================================================
--
-- a. `devis.rendez_vous_id` : la relation de PRÉPARATION. « Ce devis a été
--    préparé pour cette visite. » Distincte de l'OR, qui reste la relation
--    d'exécution et exige toujours un devis accepté. Cohérence garage /
--    client / véhicule vérifiée par trigger. Aucune réassociation de
--    l'historique : les devis existants restent sans visite, et l'écran les
--    montre comme tels.
--
-- b. `devis_lignes` reçoit sa provenance : `inspection_point_id` (le constat),
--    `reprise_id` (l'opération qui l'a créée), `note_constat` (copie par
--    valeur du commentaire du mécanicien au moment de la reprise) et
--    `prix_a_renseigner`. Pas d'unicité sur `inspection_point_id` : un constat
--    peut donner une pièce ET une main-d'œuvre.
--
-- c. `prix_a_renseigner = true` est l'état « chiffrage à compléter ». La
--    contrainte impose alors un prix à 0 : ce zéro n'est pas un prix, c'est
--    un espace réservé, et il se voit partout. Tant qu'une ligne est dans cet
--    état, le devis ne se partage pas (`creer_jeton_devis`), ne s'autorise
--    pas à l'envoi (`autoriser_envoi_devis`), ne se lit pas par jeton
--    (`lire_devis_par_jeton`) et ne se répond pas (`repondre_devis_par_jeton`).
--    Un vrai prix à zéro reste possible : il suffit de poser
--    `prix_a_renseigner = false` avec 0 — geste explicite du garage.
--
-- d. `devis_reprises` + `preparer_devis_depuis_constat` : l'opération de
--    reprise, identifiée par un uuid que l'écran tire une fois à l'ouverture
--    de la fenêtre. Deux clics ou deux requêtes simultanées avec le même
--    identifiant ne créent qu'une reprise (verrou consultatif transactionnel
--    sur l'identifiant, puis lecture). Un point déjà repris dans CE devis est
--    signalé, pas dupliqué ; un point refusé par le client est signalé, pas
--    inclus. Une reprise dans un autre devis (révision) est une autre
--    opération, avec un autre identifiant : elle passe.
--
-- e. `empreinte_devis` intègre le nombre de lignes et l'état de chiffrage.
--    Sans cela, ajouter une ligne à 0 € ne changeait pas les montants, donc
--    pas l'empreinte : un envoi déjà autorisé serait parti avec un lien vers
--    un devis que la page publique refuse désormais d'afficher.
--
-- ================================================================
-- 3. CE QUE CETTE MIGRATION NE FAIT PAS
-- ================================================================
--
-- - Aucune notification n'est armée par une reprise. Un devis créé ici naît
--   `en_attente` comme tout devis créé par l'écran, et sa notification naît
--   `sans_lien` (trigger `notifier_nouveau_devis`, inchangé) : rien ne part.
-- - La photo du constat n'est pas copiée : la ligne garde `inspection_point_id`
--   et l'écran signe une URL au moment de la consultation, avec les droits
--   du garage. La projection publique (page /devis/<jeton>) ne montre PAS
--   la photo : c'est un incrément séparé, voir docs/architecture/constat-vers-devis-v1.md.
-- - Aucun prix n'est deviné. Ni depuis une durée de catalogue, ni depuis un
--   devis précédent.
--
-- Retour arrière : les colonnes sont additives et nullables (ou à défaut
-- faux) ; les fonctions retrouvent leur version 20260917000100 /
-- 20260901000400 ; `devis_reprises` se supprime sans toucher aux devis.

-- ----------------------------------------------------------------
-- a. devis.rendez_vous_id — relation de préparation
-- ----------------------------------------------------------------

alter table public.devis
  add column if not exists rendez_vous_id uuid references public.rendez_vous(id) on delete set null;

create index if not exists devis_rendez_vous_id_idx
  on public.devis (rendez_vous_id) where rendez_vous_id is not null;

comment on column public.devis.rendez_vous_id is
  'Visite pour laquelle ce devis a été PRÉPARÉ. Relation de préparation, distincte de ordres_reparation.devis_id (exécution, devis accepté requis). Nulle pour les devis antérieurs au 2026-09-19 : jamais réassociée par supposition.';

create or replace function public.devis_check_rendez_vous()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_rdv record;
begin
  if new.rendez_vous_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.rendez_vous_id is not distinct from old.rendez_vous_id then
    return new;
  end if;

  select r.garage_id, r.client_id, r.vehicule_id
    into v_rdv
    from public.rendez_vous r
   where r.id = new.rendez_vous_id;

  if not found then
    raise exception 'devis: rendez-vous introuvable';
  end if;
  if v_rdv.garage_id is distinct from new.garage_id then
    raise exception 'devis: rendez-vous d''un autre garage';
  end if;
  if new.client_id is not null and v_rdv.client_id is distinct from new.client_id then
    raise exception 'devis: rendez-vous d''un autre client';
  end if;
  if new.vehicule_id is not null and v_rdv.vehicule_id is not null
     and v_rdv.vehicule_id is distinct from new.vehicule_id then
    raise exception 'devis: rendez-vous d''un autre véhicule';
  end if;
  return new;
end;
$$;

drop trigger if exists devis_check_rendez_vous_trigger on public.devis;
create trigger devis_check_rendez_vous_trigger
  before insert or update of rendez_vous_id, garage_id, client_id, vehicule_id on public.devis
  for each row execute function public.devis_check_rendez_vous();

-- ----------------------------------------------------------------
-- b + c. devis_lignes — provenance et état de chiffrage
-- ----------------------------------------------------------------

alter table public.devis_lignes
  add column if not exists inspection_point_id uuid references public.inspections_points(id) on delete set null,
  add column if not exists reprise_id uuid,
  add column if not exists note_constat text,
  add column if not exists prix_a_renseigner boolean not null default false;

alter table public.devis_lignes
  drop constraint if exists devis_lignes_prix_a_renseigner_zero;
alter table public.devis_lignes
  add constraint devis_lignes_prix_a_renseigner_zero
  check (not prix_a_renseigner or prix_unitaire_ht = 0);

create index if not exists devis_lignes_inspection_point_idx
  on public.devis_lignes (inspection_point_id) where inspection_point_id is not null;
create index if not exists devis_lignes_reprise_idx
  on public.devis_lignes (reprise_id) where reprise_id is not null;

comment on column public.devis_lignes.inspection_point_id is
  'Constat dont cette ligne provient. Informatif et copié par valeur au moment de la reprise : modifier le constat ensuite ne réécrit pas la ligne. Plusieurs lignes peuvent pointer le même constat (pièce + main-d''œuvre).';
comment on column public.devis_lignes.reprise_id is
  'Opération de reprise (devis_reprises.id) qui a créé la ligne. Sert à l''idempotence, jamais à une règle métier.';
comment on column public.devis_lignes.note_constat is
  'Commentaire du mécanicien tel qu''il était au moment de la reprise. Interne au garage : jamais projeté sur le devis public.';
comment on column public.devis_lignes.prix_a_renseigner is
  'Vrai tant que le garage n''a pas chiffré cette ligne. Le prix est alors 0 par contrainte, et ce 0 n''est pas un prix : partage, envoi, lecture et réponse par jeton sont refusés tant qu''une ligne est dans cet état.';

-- Intégrité : la version 20260904000100 + le constat doit être du même
-- garage, et du même véhicule que le devis quand les deux sont connus.
create or replace function public.devis_lignes_check_integrite()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_devis_garage uuid;
  v_devis_statut text;
  v_devis_vehicule uuid;
  v_prestation_garage uuid;
  v_devis_id uuid;
  v_trouve boolean;
  v_point_garage uuid;
  v_point_vehicule uuid;
begin
  v_devis_id := case when tg_op = 'DELETE' then old.devis_id else new.devis_id end;

  select d.garage_id, d.statut, d.vehicule_id, true
    into v_devis_garage, v_devis_statut, v_devis_vehicule, v_trouve
    from public.devis d
    where d.id = v_devis_id;

  -- Suppression en cascade : la ligne parente n'existe plus, on laisse passer
  -- (un devis verrouillé ne se supprime pas, cf. devis_check_immuabilite).
  if not coalesce(v_trouve, false) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    raise exception 'devis_lignes: devis introuvable ou hors garage';
  end if;

  if not public.devis_statut_modifiable(v_devis_statut) then
    raise exception
      'devis_lignes: le devis est verrouille (statut=%), ses lignes ne peuvent plus etre modifiees',
      coalesce(v_devis_statut, 'NULL');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if v_devis_garage is distinct from new.garage_id then
    raise exception 'devis_lignes: garage_id incoherent avec le devis parent';
  end if;

  if new.prestation_id is not null then
    select p.garage_id into v_prestation_garage
      from public.prestations p
      where p.id = new.prestation_id;
    if not found or v_prestation_garage is distinct from new.garage_id then
      raise exception 'devis_lignes: prestation hors garage';
    end if;
  end if;

  if new.inspection_point_id is not null
     and (tg_op = 'INSERT' or new.inspection_point_id is distinct from old.inspection_point_id) then
    select p.garage_id, i.vehicule_id
      into v_point_garage, v_point_vehicule
      from public.inspections_points p
      join public.inspections i on i.id = p.inspection_id
      where p.id = new.inspection_point_id;
    if not found or v_point_garage is distinct from new.garage_id then
      raise exception 'devis_lignes: constat hors garage';
    end if;
    if v_devis_vehicule is not null and v_point_vehicule is not null
       and v_point_vehicule is distinct from v_devis_vehicule then
      raise exception 'devis_lignes: constat d''un autre vehicule';
    end if;
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------
-- d. devis_reprises — l'opération, identifiée par l'appelant
-- ----------------------------------------------------------------

create table if not exists public.devis_reprises (
  id uuid primary key,
  garage_id uuid not null references public.garages(id),
  devis_id uuid not null references public.devis(id) on delete cascade,
  inspection_id uuid not null references public.inspections(id),
  rendez_vous_id uuid references public.rendez_vous(id) on delete set null,
  points uuid[] not null default '{}',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

comment on table public.devis_reprises is
  'Une reprise = un geste « Préparer le devis » depuis un contrôle. L''id vient de l''écran, tiré une fois par ouverture de la fenêtre : rejouer le même id ne recrée rien. Écrite uniquement par preparer_devis_depuis_constat.';

alter table public.devis_reprises enable row level security;

drop policy if exists devis_reprises_lecture on public.devis_reprises;
create policy devis_reprises_lecture on public.devis_reprises
  for select to authenticated
  using (public.a_acces_garage(garage_id, 'dirigeant', 'accueil'));

revoke all on table public.devis_reprises from public, anon;
grant select on table public.devis_reprises to authenticated;
-- Comme les autres tables : la clé de service (n8n, scripts de recette) y
-- accède sans RLS ; aucun rôle applicatif n'écrit autrement que par la fonction.
grant all on table public.devis_reprises to service_role;

create or replace function public.preparer_devis_depuis_constat(
  p_reprise_id uuid,
  p_inspection_id uuid,
  p_points uuid[],
  p_devis_id uuid default null,
  p_rendez_vous_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_insp public.inspections%rowtype;
  v_devis public.devis%rowtype;
  v_rdv record;
  v_point public.inspections_points%rowtype;
  v_reprise public.devis_reprises%rowtype;
  v_position integer;
  v_id uuid;
  v_ligne_id uuid;
  v_libelle text;
  v_cree boolean := false;
  v_creees jsonb := '[]'::jsonb;
  v_deja jsonb := '[]'::jsonb;
  v_refuses jsonb := '[]'::jsonb;
  v_hors jsonb := '[]'::jsonb;
begin
  if p_reprise_id is null then
    raise exception 'reprise: identifiant requis';
  end if;

  -- Le contrôle, et le droit de l'appelant sur son garage. Le mécanicien
  -- (rôle sans chiffrage) est refusé ici : la fonction ne lui est pas ouverte.
  select * into v_insp from public.inspections i where i.id = p_inspection_id;
  if not found or not public.a_acces_garage(v_insp.garage_id, 'dirigeant', 'accueil') then
    raise exception 'Contrôle introuvable ou accès refusé';
  end if;

  -- Idempotence : deux appels simultanés avec le même identifiant se
  -- sérialisent ici ; le second lit la reprise que le premier a écrite.
  perform pg_advisory_xact_lock(hashtextextended(p_reprise_id::text, 0));

  select * into v_reprise from public.devis_reprises r where r.id = p_reprise_id;
  if found then
    if v_reprise.garage_id is distinct from v_insp.garage_id then
      raise exception 'Contrôle introuvable ou accès refusé';
    end if;
    return jsonb_build_object(
      'ok', true,
      'deja_jouee', true,
      'devis_id', v_reprise.devis_id,
      'devis_cree', false,
      'lignes_creees', coalesce((
        select jsonb_agg(jsonb_build_object('id', l.id, 'inspection_point_id', l.inspection_point_id, 'libelle', l.libelle) order by l.position)
        from public.devis_lignes l where l.reprise_id = p_reprise_id), '[]'::jsonb),
      'deja_reprises', '[]'::jsonb,
      'refuses', '[]'::jsonb,
      'hors_controle', '[]'::jsonb
    );
  end if;

  if p_devis_id is null then
    -- Un devis se rapporte à un client : un contrôle « client libre » ne peut
    -- pas en produire un. L'écran demande d'abord de rattacher le contrôle.
    if v_insp.client_id is null then
      return jsonb_build_object('ok', false, 'raison', 'client_inconnu');
    end if;
    if p_rendez_vous_id is not null then
      select r.garage_id, r.client_id, r.vehicule_id into v_rdv
        from public.rendez_vous r where r.id = p_rendez_vous_id;
      if not found
         or v_rdv.garage_id is distinct from v_insp.garage_id
         or v_rdv.client_id is distinct from v_insp.client_id
         or (v_rdv.vehicule_id is not null and v_insp.vehicule_id is not null
             and v_rdv.vehicule_id is distinct from v_insp.vehicule_id) then
        return jsonb_build_object('ok', false, 'raison', 'rendez_vous_incoherent');
      end if;
    end if;
    insert into public.devis (garage_id, client_id, vehicule_id, montant_ht, montant_ttc, statut, rendez_vous_id)
    values (v_insp.garage_id, v_insp.client_id, v_insp.vehicule_id, 0, 0, 'en_attente', p_rendez_vous_id)
    returning * into v_devis;
    v_cree := true;
  else
    select * into v_devis from public.devis d where d.id = p_devis_id for update;
    if not found or v_devis.garage_id is distinct from v_insp.garage_id then
      raise exception 'Devis introuvable ou accès refusé';
    end if;
    if not public.devis_statut_modifiable(v_devis.statut) then
      return jsonb_build_object('ok', false, 'raison', 'devis_verrouille', 'statut', v_devis.statut);
    end if;
    if v_devis.vehicule_id is not null and v_insp.vehicule_id is not null
       and v_devis.vehicule_id is distinct from v_insp.vehicule_id then
      return jsonb_build_object('ok', false, 'raison', 'vehicule_different');
    end if;
    if v_devis.client_id is not null and v_insp.client_id is not null
       and v_devis.client_id is distinct from v_insp.client_id then
      return jsonb_build_object('ok', false, 'raison', 'client_different');
    end if;
  end if;

  insert into public.devis_reprises (id, garage_id, devis_id, inspection_id, rendez_vous_id, points)
  values (p_reprise_id, v_insp.garage_id, v_devis.id, v_insp.id,
          case when v_cree then p_rendez_vous_id else v_devis.rendez_vous_id end,
          coalesce(p_points, '{}'::uuid[]));

  select coalesce(max(l.position), -1) + 1 into v_position
    from public.devis_lignes l where l.devis_id = v_devis.id;

  foreach v_id in array coalesce(p_points, '{}'::uuid[]) loop
    select * into v_point from public.inspections_points p
     where p.id = v_id and p.inspection_id = v_insp.id and p.garage_id = v_insp.garage_id;
    if not found then
      v_hors := v_hors || to_jsonb(v_id);
      continue;
    end if;
    -- Un refus explicite du client reste un refus : il se voit, il ne se
    -- reprend pas ici. La reprise d'un point refusé passe par une révision.
    if v_point.decision_client = 'refuse' then
      v_refuses := v_refuses || jsonb_build_object('inspection_point_id', v_point.id, 'libelle', v_point.libelle);
      continue;
    end if;
    if exists (select 1 from public.devis_lignes l
                where l.devis_id = v_devis.id and l.inspection_point_id = v_point.id) then
      v_deja := v_deja || jsonb_build_object('inspection_point_id', v_point.id, 'libelle', v_point.libelle);
      continue;
    end if;

    v_libelle := btrim(v_point.libelle);
    insert into public.devis_lignes
      (devis_id, garage_id, type, libelle, quantite, prix_unitaire_ht, taux_tva, position,
       inspection_point_id, reprise_id, note_constat, prix_a_renseigner)
    values
      (v_devis.id, v_insp.garage_id, 'main_oeuvre', v_libelle, 1, 0, 20, v_position,
       v_point.id, p_reprise_id, nullif(btrim(coalesce(v_point.commentaire, '')), ''), true)
    returning id into v_ligne_id;
    v_creees := v_creees || jsonb_build_object('id', v_ligne_id, 'inspection_point_id', v_point.id, 'libelle', v_libelle);
    v_position := v_position + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'deja_jouee', false,
    'devis_id', v_devis.id,
    'devis_cree', v_cree,
    'lignes_creees', v_creees,
    'deja_reprises', v_deja,
    'refuses', v_refuses,
    'hors_controle', v_hors
  );
end;
$$;

revoke all on function public.preparer_devis_depuis_constat(uuid, uuid, uuid[], uuid, uuid) from public, anon;
grant execute on function public.preparer_devis_depuis_constat(uuid, uuid, uuid[], uuid, uuid) to authenticated;

comment on function public.preparer_devis_depuis_constat(uuid, uuid, uuid[], uuid, uuid) is
  'Crée (ou complète) un devis brouillon à partir de points d''un contrôle : une ligne main-d''œuvre « Prix à renseigner » par point, libellé et commentaire copiés par valeur. Idempotente sur p_reprise_id. Refuse : rôle sans chiffrage, autre garage, devis verrouillé, autre véhicule/client, contrôle sans client. Signale sans inclure : points refusés par le client, points déjà repris dans ce devis. N''arme aucune notification.';

-- ----------------------------------------------------------------
-- e. Chiffrage incomplet : refusé au partage, à l'envoi, à la lecture, à la réponse
-- ----------------------------------------------------------------

create or replace function public.devis_chiffrage_incomplet(p_devis_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.devis_lignes l
    where l.devis_id = p_devis_id and l.prix_a_renseigner
  );
$$;

revoke all on function public.devis_chiffrage_incomplet(uuid) from public, anon, authenticated;

comment on function public.devis_chiffrage_incomplet(uuid) is
  'Vrai si au moins une ligne du devis attend encore son prix. Interne : appelée par les fonctions de partage, d''envoi et de lecture publique ; pas exposée à l''application, qui a les lignes sous les yeux.';

-- Empreinte : les montants ne bougent pas quand on ajoute une ligne à 0 €.
-- Le nombre de lignes et l'état de chiffrage entrent donc dans la signature,
-- pour qu'un envoi autorisé avant la reprise soit mis de côté par
-- reserver_notifications (« le document a changé depuis la validation »).
create or replace function public.empreinte_devis(p_devis_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(extensions.digest(
    coalesce(d.montant_ht::text,'') || '|' || coalesce(d.montant_ttc::text,'') || '|' ||
    coalesce(d.statut,'') || '|' || coalesce(d.prestation_id::text,'') || '|' ||
    coalesce(d.vehicule_id::text,'') || '|' || coalesce(d.client_id::text,'') || '|' ||
    coalesce((select count(*) from public.devis_lignes l where l.devis_id = d.id), 0)::text || '|' ||
    public.devis_chiffrage_incomplet(d.id)::text,
    'sha256'), 'hex')
  from public.devis d where d.id = p_devis_id;
$$;

create or replace function public.creer_jeton_devis(p_devis_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_garage_id uuid; v_token text;
begin
  select d.garage_id into v_garage_id from public.devis d where d.id = p_devis_id for update of d;
  if v_garage_id is null or not public.a_acces_garage(v_garage_id, 'dirigeant', 'accueil') then
    raise exception 'Devis introuvable ou accès refusé';
  end if;
  if public.devis_chiffrage_incomplet(p_devis_id) then
    raise exception 'Devis incomplet : des lignes attendent encore leur prix';
  end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.devis_jetons (devis_id, garage_id, jeton_hash, expires_at)
  values (p_devis_id, v_garage_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '90 days');
  return v_token;
end;
$$;

create or replace function public.autoriser_envoi_devis(p_devis_id uuid, p_destinataire text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_garage_id uuid; v_client_email text; v_token text; v_deja uuid; v_notif uuid;
begin
  select d.garage_id, c.email into v_garage_id, v_client_email
  from public.devis d left join public.clients c on c.id = d.client_id
  where d.id = p_devis_id for update of d;

  if v_garage_id is null or not public.a_acces_garage(v_garage_id, 'dirigeant', 'accueil') then
    raise exception 'Devis introuvable ou accès refusé';
  end if;
  if public.devis_chiffrage_incomplet(p_devis_id) then
    return jsonb_build_object('ok', false, 'raison', 'chiffrage_incomplet');
  end if;
  if coalesce(nullif(trim(v_client_email), ''), '') = '' then
    return jsonb_build_object('ok', false, 'raison', 'destinataire_absent');
  end if;
  if lower(trim(p_destinataire)) is distinct from lower(trim(v_client_email)) then
    return jsonb_build_object('ok', false, 'raison', 'destinataire_different');
  end if;

  select n.id into v_deja from public.notifications_devis n
   where n.devis_id = p_devis_id and n.statut in ('en_attente', 'envoi_en_cours')
   order by n.created_at desc limit 1 for update;
  if v_deja is not null then
    return jsonb_build_object('ok', true, 'deja_autorise', true, 'notification', v_deja);
  end if;

  select n.id into v_notif from public.notifications_devis n
   where n.devis_id = p_devis_id and n.statut in ('sans_lien', 'bloque') and n.envoye = false
   order by n.created_at desc limit 1 for update;
  if v_notif is null then
    return jsonb_build_object('ok', false, 'raison', 'aucune_notification_en_attente');
  end if;

  v_token := public.creer_jeton_devis(p_devis_id);
  update public.notifications_devis
     set jeton = v_token, statut = 'en_attente', derniere_erreur = null,
         destinataire_valide = lower(trim(v_client_email)),
         empreinte_document = public.empreinte_devis(p_devis_id)
   where id = v_notif;
  return jsonb_build_object('ok', true, 'deja_autorise', false, 'notification', v_notif);
end;
$$;

create or replace function public.lire_devis_par_jeton(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_jeton public.devis_jetons%rowtype;
  v_result jsonb;
begin
  select * into v_jeton from public.devis_jetons where jeton_hash = v_hash;

  if not found then
    return jsonb_build_object('ok', false, 'raison', 'inconnu');
  end if;
  if v_jeton.revoked_at is not null then
    return jsonb_build_object('ok', false, 'raison', 'revoque');
  end if;
  if v_jeton.expires_at <= now() then
    return jsonb_build_object('ok', false, 'raison', 'expire');
  end if;
  -- Un jeton posé avant qu'une ligne « à chiffrer » soit ajoutée ne doit pas
  -- montrer un 0 € qui n'est pas un prix.
  if public.devis_chiffrage_incomplet(v_jeton.devis_id) then
    return jsonb_build_object('ok', false, 'raison', 'chiffrage_incomplet');
  end if;

  select jsonb_build_object(
    'ok', true,
    'garage_nom', g.nom_garage,
    'vehicule', trim(coalesce(v.marque, '') || ' ' || coalesce(v.modele, '')),
    'prestation', p.nom,
    'montant_ht', d.montant_ht,
    'montant_ttc', d.montant_ttc,
    'statut', d.statut,
    'lignes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', dl.id,
        'type', dl.type,
        'libelle', dl.libelle,
        'quantite', dl.quantite,
        'prix_unitaire_ht', dl.prix_unitaire_ht,
        'taux_tva', dl.taux_tva,
        'montant_ht', dl.montant_ht,
        'montant_tva', dl.montant_tva,
        'montant_ttc', dl.montant_ht + dl.montant_tva
      ) order by dl.position, dl.created_at)
      from public.devis_lignes dl
      where dl.devis_id = d.id
    ), '[]'::jsonb)
  ) into v_result
  from public.devis d
  join public.garages g on g.id = d.garage_id
  left join public.vehicules v on v.id = d.vehicule_id
  left join public.prestations p on p.id = d.prestation_id
  where d.id = v_jeton.devis_id;

  return v_result;
end;
$$;

create or replace function public.repondre_devis_par_jeton(p_token text, p_reponse text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_jeton public.devis_jetons%rowtype;
  v_statut_actuel text;
begin
  if p_reponse not in ('accepte', 'refuse') then
    return jsonb_build_object('ok', false, 'raison', 'reponse_invalide');
  end if;

  select * into v_jeton from public.devis_jetons
    where jeton_hash = v_hash and revoked_at is null and expires_at > now()
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'raison', 'invalide');
  end if;

  select statut into v_statut_actuel from public.devis where id = v_jeton.devis_id for update;
  if v_statut_actuel is distinct from 'en_attente' then
    return jsonb_build_object('ok', false, 'raison', 'deja_repondu');
  end if;
  -- On n'accepte ni ne refuse un prix qui n'existe pas encore.
  if public.devis_chiffrage_incomplet(v_jeton.devis_id) then
    return jsonb_build_object('ok', false, 'raison', 'chiffrage_incomplet');
  end if;

  update public.devis
     set statut = p_reponse, date_validation = now(), reponse_origine = 'client'
   where id = v_jeton.devis_id;
  update public.devis_jetons set used_at = coalesce(used_at, now()) where id = v_jeton.id;

  return jsonb_build_object('ok', true, 'statut', p_reponse);
end;
$$;
