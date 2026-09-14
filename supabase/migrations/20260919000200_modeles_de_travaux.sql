-- Modèles de travaux : un ensemble de lignes que le garage réutilise.
--
-- ================================================================
-- 1. LE BESOIN, ET LE MOT
-- ================================================================
--
-- « Plaquettes avant » revient toutes les semaines : deux lignes (pièce +
-- main-d'œuvre), les mêmes quantités, les mêmes prix, le même ordre. Elles
-- étaient retapées à chaque devis. Le catalogue `prestations` ne le permet
-- pas : une prestation est UNE ligne (nom, durée, prix facultatif), sans
-- composition.
--
-- Le mot est « modèle de travaux ». Pas « forfait » : `garages.forfait` désigne
-- l'abonnement Nexora, et un même mot pour deux choses dont l'une touche à la
-- facturation de Nexora est une source d'erreur. Conception :
-- docs/architecture/reduire-la-saisie-des-devis.md (section 2) et
-- docs/architecture/modeles-de-travaux-v1.md.
--
-- ================================================================
-- 2. CE QUE FAIT CETTE MIGRATION (additive)
-- ================================================================
--
-- a. `modeles_travaux` + `modeles_travaux_lignes` : le modèle et ses lignes,
--    dans la forme d'une ligne de devis. `prix_unitaire_ht` y est NULLABLE :
--    un modèle peut décrire des travaux sans en connaître le prix — et
--    l'insertion produit alors une ligne « Prix à renseigner », jamais un 0.
--    Rien n'est déduit d'une durée de catalogue.
--
-- b. Droits : le dirigeant crée, modifie, archive ; l'accueil lit et insère
--    (ses lignes de devis restent les siennes, le modèle commun ne bouge pas) ;
--    le mécanicien n'y accède pas. L'appartenance parent/lignes au même
--    garage est vérifiée en base, pas seulement par l'écran.
--
-- c. `inserer_modele_dans_devis` : copie par valeur (libellé, quantité, prix
--    connu, TVA, type, ordre) dans un devis modifiable du même garage.
--    Idempotente par identifiant d'insertion (`devis_insertions_modeles`),
--    comme la reprise d'un constat. Peut rattacher le groupe de lignes à un
--    constat (`p_inspection_point_id`) : c'est ainsi qu'un modèle chiffre un
--    constat. La provenance (`devis_lignes.modele_id`, `insertion_id`) est
--    informative : modifier le modèle ensuite ne réécrit aucun devis.
--
-- d. `enregistrer_devis_comme_modele` : le dirigeant tire un modèle des
--    lignes d'un devis (quel que soit son statut : lire n'est pas modifier).
--    Une ligne encore « Prix à renseigner » donne un prix NULL dans le modèle.
--    Rien d'autre ne suit : ni destinataire, ni autorisation, ni état d'envoi,
--    ni décision client, ni photo, ni constat.
--
-- e. Archiver (`actif = false`) ne touche aucun document déjà créé ; un modèle
--    archivé ne s'insère plus, et il se réactive.
--
-- Retour arrière : trois tables et deux colonnes nullables à supprimer ;
-- aucune fonction existante n'est modifiée.

-- ----------------------------------------------------------------
-- a. Les tables
-- ----------------------------------------------------------------

create table if not exists public.modeles_travaux (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references public.garages(id) on delete cascade,
  nom text not null,
  description text,
  actif boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint modeles_travaux_nom_non_vide check (length(btrim(nom)) > 0)
);

create index if not exists modeles_travaux_garage_idx on public.modeles_travaux (garage_id, actif);

create table if not exists public.modeles_travaux_lignes (
  id uuid primary key default gen_random_uuid(),
  modele_id uuid not null references public.modeles_travaux(id) on delete cascade,
  garage_id uuid not null references public.garages(id) on delete cascade,
  type text not null,
  libelle text not null,
  quantite numeric(10,3) not null default 1,
  -- Nullable, et c'est le point : un prix inconnu n'est pas un prix à 0.
  prix_unitaire_ht numeric(12,2),
  taux_tva numeric(5,2) not null default 20,
  position integer not null default 0,
  prestation_id uuid references public.prestations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint modeles_travaux_lignes_type_valide check (type in ('main_oeuvre', 'piece')),
  constraint modeles_travaux_lignes_libelle_non_vide check (length(btrim(libelle)) > 0),
  constraint modeles_travaux_lignes_quantite_positive check (quantite > 0),
  constraint modeles_travaux_lignes_prix_positif check (prix_unitaire_ht is null or prix_unitaire_ht >= 0),
  constraint modeles_travaux_lignes_taux_tva_borne check (taux_tva >= 0 and taux_tva <= 100)
);

create index if not exists modeles_travaux_lignes_modele_idx on public.modeles_travaux_lignes (modele_id, position);

comment on table public.modeles_travaux is
  'Ensemble de lignes réutilisables propre à un garage (« modèle de travaux »). Ne pas confondre avec garages.forfait (abonnement Nexora). Créé/modifié/archivé par le dirigeant, inséré par l''accueil ou le dirigeant.';
comment on column public.modeles_travaux_lignes.prix_unitaire_ht is
  'NULL = prix non connu : l''insertion produit une ligne « Prix à renseigner ». Jamais déduit d''une durée.';

-- Cohérence parent / lignes / prestation, en base.
create or replace function public.modeles_travaux_lignes_check_integrite()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_modele_garage uuid; v_prestation_garage uuid;
begin
  select m.garage_id into v_modele_garage from public.modeles_travaux m where m.id = new.modele_id;
  if not found then
    raise exception 'modeles_travaux_lignes: modele introuvable';
  end if;
  if v_modele_garage is distinct from new.garage_id then
    raise exception 'modeles_travaux_lignes: garage_id incoherent avec le modele';
  end if;
  if new.prestation_id is not null then
    select p.garage_id into v_prestation_garage from public.prestations p where p.id = new.prestation_id;
    if not found or v_prestation_garage is distinct from new.garage_id then
      raise exception 'modeles_travaux_lignes: prestation hors garage';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists modeles_travaux_lignes_check_integrite_trigger on public.modeles_travaux_lignes;
create trigger modeles_travaux_lignes_check_integrite_trigger
  before insert or update on public.modeles_travaux_lignes
  for each row execute function public.modeles_travaux_lignes_check_integrite();

create or replace function public.modeles_travaux_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists modeles_travaux_updated_at on public.modeles_travaux;
create trigger modeles_travaux_updated_at
  before update on public.modeles_travaux
  for each row execute function public.modeles_travaux_set_updated_at();

-- ----------------------------------------------------------------
-- b. Droits
-- ----------------------------------------------------------------

alter table public.modeles_travaux enable row level security;
alter table public.modeles_travaux_lignes enable row level security;

drop policy if exists modeles_travaux_lecture on public.modeles_travaux;
create policy modeles_travaux_lecture on public.modeles_travaux
  for select to authenticated
  using (public.a_acces_garage(garage_id, 'dirigeant', 'accueil'));

drop policy if exists modeles_travaux_dirigeant_insert on public.modeles_travaux;
create policy modeles_travaux_dirigeant_insert on public.modeles_travaux
  for insert to authenticated
  with check (public.a_acces_garage(garage_id, 'dirigeant'));

drop policy if exists modeles_travaux_dirigeant_update on public.modeles_travaux;
create policy modeles_travaux_dirigeant_update on public.modeles_travaux
  for update to authenticated
  using (public.a_acces_garage(garage_id, 'dirigeant'))
  with check (public.a_acces_garage(garage_id, 'dirigeant'));

drop policy if exists modeles_travaux_dirigeant_delete on public.modeles_travaux;
create policy modeles_travaux_dirigeant_delete on public.modeles_travaux
  for delete to authenticated
  using (public.a_acces_garage(garage_id, 'dirigeant'));

drop policy if exists modeles_travaux_lignes_lecture on public.modeles_travaux_lignes;
create policy modeles_travaux_lignes_lecture on public.modeles_travaux_lignes
  for select to authenticated
  using (public.a_acces_garage(garage_id, 'dirigeant', 'accueil'));

drop policy if exists modeles_travaux_lignes_dirigeant on public.modeles_travaux_lignes;
create policy modeles_travaux_lignes_dirigeant on public.modeles_travaux_lignes
  for all to authenticated
  using (public.a_acces_garage(garage_id, 'dirigeant'))
  with check (public.a_acces_garage(garage_id, 'dirigeant'));

revoke all on table public.modeles_travaux, public.modeles_travaux_lignes from public, anon;
grant select, insert, update, delete on table public.modeles_travaux, public.modeles_travaux_lignes to authenticated;
grant all on table public.modeles_travaux, public.modeles_travaux_lignes to service_role;

-- ----------------------------------------------------------------
-- c. Insertion dans un devis — idempotente, copiée par valeur
-- ----------------------------------------------------------------

alter table public.devis_lignes
  add column if not exists modele_id uuid references public.modeles_travaux(id) on delete set null,
  add column if not exists insertion_id uuid;

comment on column public.devis_lignes.modele_id is
  'Modèle de travaux d''où la ligne a été copiée. Informatif : le modèle n''est plus relu ensuite.';
comment on column public.devis_lignes.insertion_id is
  'Opération d''insertion (devis_insertions_modeles.id) qui a créé la ligne. Idempotence seulement.';

create table if not exists public.devis_insertions_modeles (
  id uuid primary key,
  garage_id uuid not null references public.garages(id),
  devis_id uuid not null references public.devis(id) on delete cascade,
  modele_id uuid not null references public.modeles_travaux(id),
  inspection_point_id uuid references public.inspections_points(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.devis_insertions_modeles enable row level security;
drop policy if exists devis_insertions_modeles_lecture on public.devis_insertions_modeles;
create policy devis_insertions_modeles_lecture on public.devis_insertions_modeles
  for select to authenticated
  using (public.a_acces_garage(garage_id, 'dirigeant', 'accueil'));
revoke all on table public.devis_insertions_modeles from public, anon;
grant select on table public.devis_insertions_modeles to authenticated;
grant all on table public.devis_insertions_modeles to service_role;

create or replace function public.inserer_modele_dans_devis(
  p_insertion_id uuid,
  p_devis_id uuid,
  p_modele_id uuid,
  p_inspection_point_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_devis public.devis%rowtype;
  v_modele public.modeles_travaux%rowtype;
  v_ligne public.modeles_travaux_lignes%rowtype;
  v_point_garage uuid;
  v_point_vehicule uuid;
  v_position integer;
  v_id uuid;
  v_creees jsonb := '[]'::jsonb;
  v_nb integer := 0;
begin
  if p_insertion_id is null then
    raise exception 'insertion: identifiant requis';
  end if;

  select * into v_devis from public.devis d where d.id = p_devis_id for update;
  if not found or not public.a_acces_garage(v_devis.garage_id, 'dirigeant', 'accueil') then
    raise exception 'Devis introuvable ou accès refusé';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_insertion_id::text, 0));
  if exists (select 1 from public.devis_insertions_modeles i where i.id = p_insertion_id) then
    return jsonb_build_object(
      'ok', true, 'deja_jouee', true, 'devis_id', p_devis_id,
      'lignes_creees', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'libelle', l.libelle) order by l.position)
                                 from public.devis_lignes l where l.insertion_id = p_insertion_id), '[]'::jsonb));
  end if;

  if not public.devis_statut_modifiable(v_devis.statut) then
    return jsonb_build_object('ok', false, 'raison', 'devis_verrouille', 'statut', v_devis.statut);
  end if;

  select * into v_modele from public.modeles_travaux m where m.id = p_modele_id;
  if not found or v_modele.garage_id is distinct from v_devis.garage_id then
    raise exception 'Modèle introuvable ou accès refusé';
  end if;
  if not v_modele.actif then
    return jsonb_build_object('ok', false, 'raison', 'modele_archive');
  end if;
  select count(*) into v_nb from public.modeles_travaux_lignes l where l.modele_id = v_modele.id;
  if v_nb = 0 then
    return jsonb_build_object('ok', false, 'raison', 'modele_vide');
  end if;

  if p_inspection_point_id is not null then
    select p.garage_id, i.vehicule_id into v_point_garage, v_point_vehicule
      from public.inspections_points p join public.inspections i on i.id = p.inspection_id
     where p.id = p_inspection_point_id;
    if not found or v_point_garage is distinct from v_devis.garage_id then
      raise exception 'Constat introuvable ou accès refusé';
    end if;
    if v_devis.vehicule_id is not null and v_point_vehicule is not null and v_point_vehicule is distinct from v_devis.vehicule_id then
      return jsonb_build_object('ok', false, 'raison', 'vehicule_different');
    end if;
  end if;

  insert into public.devis_insertions_modeles (id, garage_id, devis_id, modele_id, inspection_point_id)
  values (p_insertion_id, v_devis.garage_id, v_devis.id, v_modele.id, p_inspection_point_id);

  select coalesce(max(l.position), -1) + 1 into v_position from public.devis_lignes l where l.devis_id = v_devis.id;

  for v_ligne in
    select * from public.modeles_travaux_lignes l where l.modele_id = v_modele.id order by l.position, l.created_at
  loop
    insert into public.devis_lignes
      (devis_id, garage_id, type, libelle, quantite, prix_unitaire_ht, taux_tva, position, prestation_id,
       prix_a_renseigner, modele_id, insertion_id, inspection_point_id)
    values
      (v_devis.id, v_devis.garage_id, v_ligne.type, v_ligne.libelle, v_ligne.quantite,
       coalesce(v_ligne.prix_unitaire_ht, 0), v_ligne.taux_tva, v_position, v_ligne.prestation_id,
       v_ligne.prix_unitaire_ht is null, v_modele.id, p_insertion_id, p_inspection_point_id)
    returning id into v_id;
    v_creees := v_creees || jsonb_build_object('id', v_id, 'libelle', v_ligne.libelle, 'prix_a_renseigner', v_ligne.prix_unitaire_ht is null);
    v_position := v_position + 1;
  end loop;

  return jsonb_build_object('ok', true, 'deja_jouee', false, 'devis_id', v_devis.id, 'modele', v_modele.nom, 'lignes_creees', v_creees);
end;
$$;

revoke all on function public.inserer_modele_dans_devis(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.inserer_modele_dans_devis(uuid, uuid, uuid, uuid) to authenticated;

comment on function public.inserer_modele_dans_devis(uuid, uuid, uuid, uuid) is
  'Copie les lignes d''un modèle de travaux dans un devis modifiable du même garage. Idempotente sur p_insertion_id. Prix NULL → ligne « Prix à renseigner ». Peut rattacher le groupe à un constat. Ne copie ni destinataire, ni autorisation, ni état d''envoi, ni décision, ni photo.';

-- ----------------------------------------------------------------
-- d. Un devis devient un modèle (dirigeant)
-- ----------------------------------------------------------------

create or replace function public.enregistrer_devis_comme_modele(p_devis_id uuid, p_nom text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_devis public.devis%rowtype;
  v_modele_id uuid;
  v_nb integer;
begin
  if p_nom is null or length(btrim(p_nom)) = 0 then
    raise exception 'Un nom est obligatoire pour le modèle';
  end if;
  select * into v_devis from public.devis d where d.id = p_devis_id;
  if not found or not public.a_acces_garage(v_devis.garage_id, 'dirigeant') then
    raise exception 'Devis introuvable ou accès refusé';
  end if;
  select count(*) into v_nb from public.devis_lignes l where l.devis_id = v_devis.id;
  if v_nb = 0 then
    raise exception 'Ce devis n''a pas de lignes : rien à enregistrer comme modèle';
  end if;

  insert into public.modeles_travaux (garage_id, nom, created_by)
  values (v_devis.garage_id, btrim(p_nom), auth.uid())
  returning id into v_modele_id;

  insert into public.modeles_travaux_lignes (modele_id, garage_id, type, libelle, quantite, prix_unitaire_ht, taux_tva, position, prestation_id)
  select v_modele_id, v_devis.garage_id, l.type, l.libelle, l.quantite,
         case when l.prix_a_renseigner then null else l.prix_unitaire_ht end,
         l.taux_tva, row_number() over (order by l.position, l.created_at) - 1,
         l.prestation_id
    from public.devis_lignes l
   where l.devis_id = v_devis.id;

  return v_modele_id;
end;
$$;

revoke all on function public.enregistrer_devis_comme_modele(uuid, text) from public, anon;
grant execute on function public.enregistrer_devis_comme_modele(uuid, text) to authenticated;

comment on function public.enregistrer_devis_comme_modele(uuid, text) is
  'Le dirigeant tire un modèle de travaux des lignes d''un devis (tout statut : lire n''est pas modifier). Une ligne « Prix à renseigner » donne un prix NULL. Rien d''autre n''est copié.';
