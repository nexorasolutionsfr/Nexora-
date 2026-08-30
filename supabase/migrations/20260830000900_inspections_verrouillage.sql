-- Durcissement : le verrouillage d'une inspection finalisée ne doit pas
-- reposer uniquement sur l'UI. Ces garde-fous bloquent au niveau base toute
-- modification des points, photos et informations de contenu d'une
-- inspection verrouillée (verrouille_le is not null).
-- Idempotent (create or replace / drop trigger if exists), non destructif.
--
-- Seules exceptions autorisées, toutes déjà en place :
--  - la décision client sur un point soumis (decision_client/decision_le),
--    via repondre_point_inspection_par_jeton — c'est l'objet même du
--    verrouillage, pas une brèche ;
--  - le flux explicite reouvrir_inspection (motif obligatoire, historique),
--    qui déverrouille D'ABORD (voir 20260830000700_inspections_rpc.sql)
--    avant toute autre écriture, donc jamais bloqué par ces triggers.

-- 1) Points de contrôle : aucun ajout/suppression pendant le verrouillage ;
--    en modification, seules les colonnes de décision client peuvent changer.
create or replace function public.inspections_points_bloquer_si_verrouillee()
returns trigger
language plpgsql
as $$
declare
  v_verrouille timestamptz;
begin
  select verrouille_le into v_verrouille
    from inspections where id = coalesce(new.inspection_id, old.inspection_id);

  if tg_op = 'INSERT' then
    if v_verrouille is not null then
      raise exception 'Inspection verrouillée : impossible d''ajouter un point sans réouverture explicite.';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if v_verrouille is not null then
      raise exception 'Inspection verrouillée : impossible de retirer un point sans réouverture explicite.';
    end if;
    return old;
  end if;

  -- UPDATE
  if v_verrouille is not null then
    if new.categorie is distinct from old.categorie
      or new.libelle is distinct from old.libelle
      or new.etat is distinct from old.etat
      or new.commentaire is distinct from old.commentaire
      or new.soumis_client is distinct from old.soumis_client
      or new.inspection_id is distinct from old.inspection_id
      or new.garage_id is distinct from old.garage_id
    then
      raise exception 'Inspection verrouillée : ce point ne peut plus être modifié sans réouverture explicite.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists inspections_points_verrou on public.inspections_points;
create trigger inspections_points_verrou
  before insert or update or delete on public.inspections_points
  for each row
  execute function public.inspections_points_bloquer_si_verrouillee();

-- 2) Photos : aucun ajout/suppression/modification pendant le verrouillage,
--    sans exception (aucun flux applicatif n'a besoin d'en modifier une fois
--    l'inspection verrouillée).
create or replace function public.inspections_photos_bloquer_si_verrouillee()
returns trigger
language plpgsql
as $$
declare
  v_verrouille timestamptz;
begin
  select verrouille_le into v_verrouille
    from inspections where id = coalesce(new.inspection_id, old.inspection_id);

  if v_verrouille is not null then
    raise exception 'Inspection verrouillée : impossible de modifier les photos sans réouverture explicite.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists inspections_photos_verrou on public.inspections_photos;
create trigger inspections_photos_verrou
  before insert or update or delete on public.inspections_photos
  for each row
  execute function public.inspections_photos_bloquer_si_verrouillee();

-- 3) Inspection elle-même : les informations de contenu (kilométrage,
--    carburant, rattachements client/véhicule/RDV) ne peuvent plus changer
--    tant que l'inspection reste verrouillée. Le statut et verrouille_le
--    restent modifiables (c'est le mécanisme de verrouillage/décision lui-même).
create or replace function public.inspections_bloquer_contenu_si_verrouillee()
returns trigger
language plpgsql
as $$
begin
  if old.verrouille_le is not null and new.verrouille_le is not null then
    if new.kilometrage is distinct from old.kilometrage
      or new.niveau_carburant is distinct from old.niveau_carburant
      or new.client_id is distinct from old.client_id
      or new.vehicule_id is distinct from old.vehicule_id
      or new.rendez_vous_id is distinct from old.rendez_vous_id
      or new.client_nom_libre is distinct from old.client_nom_libre
      or new.vehicule_libelle_libre is distinct from old.vehicule_libelle_libre
      or new.immatriculation_libre is distinct from old.immatriculation_libre
    then
      raise exception 'Inspection verrouillée : ces informations ne peuvent plus être modifiées sans réouverture explicite.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists inspections_verrou_contenu on public.inspections;
create trigger inspections_verrou_contenu
  before update on public.inspections
  for each row
  execute function public.inspections_bloquer_contenu_si_verrouillee();
