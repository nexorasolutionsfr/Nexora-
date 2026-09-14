-- Le mécanicien documente son intervention : constat et photo, depuis son écran.
--
-- ================================================================
-- 1. CE QUI MANQUAIT
-- ================================================================
--
-- Le parcours cible commence par « le mécanicien documente un problème sur le
-- bon véhicule ». Or le mécanicien ne lit aucune table (20260905000400) : son
-- écran ne connaît que ses fiches, leurs lignes et des notes texte. Le
-- contrôle véhicule (`inspections*`) — celui que « Préparer le devis » reprend —
-- lui était inaccessible, et le stockage des photos aussi.
--
-- Deuxième défaut, trouvé en préparant ce lot : les politiques de stockage de
-- `inspections-photos` (20260830000600) ne visent que le PROPRIÉTAIRE du
-- garage (`owner_user_id = auth.uid()`). L'accueil, qui peut pourtant créer
-- des contrôles et préparer des devis, ne pouvait ni déposer ni afficher une
-- photo : sa fenêtre « Préparer le devis » montrait des constats sans image.
--
-- ================================================================
-- 2. CE QUE FAIT CETTE MIGRATION
-- ================================================================
--
-- a. Stockage : lecture, dépôt et suppression pour le dirigeant et l'accueil
--    actifs (`a_acces_garage`), comme les tables. Pour le mécanicien : lecture
--    et dépôt, UNIQUEMENT sous le dossier d'un contrôle rattaché à une
--    intervention qui lui est affectée — dépôt refusé si le contrôle est
--    verrouillé ou la fiche close. Jamais de suppression.
--
-- b. Trois fonctions, même modèle que `atelier_ajouter_note` : l'affectation
--    est revérifiée à chaque appel contre l'adhésion ACTIVE (révocation
--    immédiate) ; une fiche non affectée est traitée comme inexistante.
--      - `atelier_mes_constats(ordre)`       lecture : le contrôle de la
--        visite, ses points et chemins de photos. Aucun prix, aucun contact.
--      - `atelier_ajouter_constat(ordre, …)`  crée le contrôle de la visite
--        s'il n'existe pas, puis le point. Refus si le contrôle est verrouillé
--        (on ne contourne pas un verrou en créant un second contrôle).
--      - `atelier_ajouter_photo(point, chemin)` enregistre une photo déjà
--        déposée, après vérification du chemin, de l'objet, des limites.
--
-- Les fonctions qui écrivent dans `inspections*` fixent `search_path =
-- public, pg_temp` : les triggers de verrou de ces tables nomment
-- `inspections` sans schéma (20260830000900) et échoueraient sous un
-- `search_path` vide. Les noms sont néanmoins qualifiés partout ici.
--
-- Retour arrière : supprimer les fonctions et recréer les trois politiques de
-- 20260830000600 (ce qui refermerait aussi le stockage à l'accueil).

-- ----------------------------------------------------------------
-- a. Aides au découpage du chemin <garage>/<contrôle>/<uuid>.<ext>
-- ----------------------------------------------------------------

create or replace function public.photo_chemin_segment(p_name text, p_rang integer)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(coalesce(p_name, ''), '/', p_rang) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(p_name, '/', p_rang)::uuid
  end
$$;

comment on function public.photo_chemin_segment(text, integer) is
  'Segment n d''un chemin de photo, converti en uuid s''il en a la forme, NULL sinon. Évite qu''un nom malformé dans le bucket ne fasse échouer l''évaluation d''une politique.';

create or replace function public.photo_chemin_valide(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_name, '') ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic)$'
$$;

create or replace function public.atelier_photo_visible(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.inspections i
      join public.ordres_reparation o
        on o.rendez_vous_id = i.rendez_vous_id and o.garage_id = i.garage_id
     where i.id = public.photo_chemin_segment(p_name, 2)
       and i.garage_id = public.photo_chemin_segment(p_name, 1)
       and o.mecanicien_id is not null
       and o.mecanicien_id = public.mon_mecanicien_id(o.garage_id)
       and o.statut <> 'annule'
  )
$$;

create or replace function public.atelier_depot_photo_autorise(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.photo_chemin_valide(p_name) and exists (
    select 1
      from public.inspections i
      join public.ordres_reparation o
        on o.rendez_vous_id = i.rendez_vous_id and o.garage_id = i.garage_id
     where i.id = public.photo_chemin_segment(p_name, 2)
       and i.garage_id = public.photo_chemin_segment(p_name, 1)
       and i.verrouille_le is null
       and o.mecanicien_id is not null
       and o.mecanicien_id = public.mon_mecanicien_id(o.garage_id)
       and o.statut not in ('annule', 'termine')
  )
$$;

revoke all on function public.photo_chemin_segment(text, integer) from public, anon;
revoke all on function public.photo_chemin_valide(text) from public, anon;
revoke all on function public.atelier_photo_visible(text) from public, anon;
revoke all on function public.atelier_depot_photo_autorise(text) from public, anon;
grant execute on function public.photo_chemin_segment(text, integer) to authenticated, service_role;
grant execute on function public.photo_chemin_valide(text) to authenticated, service_role;
grant execute on function public.atelier_photo_visible(text) to authenticated;
grant execute on function public.atelier_depot_photo_autorise(text) to authenticated;

-- ----------------------------------------------------------------
-- b. Politiques du bucket
-- ----------------------------------------------------------------

drop policy if exists inspections_photos_storage_write on storage.objects;
drop policy if exists inspections_photos_storage_read on storage.objects;
drop policy if exists inspections_photos_storage_delete on storage.objects;

create policy inspections_photos_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'inspections-photos'
    and (
      public.a_acces_garage(public.photo_chemin_segment(name, 1), 'dirigeant', 'accueil')
      or public.atelier_photo_visible(name)
    )
  );

create policy inspections_photos_storage_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'inspections-photos'
    and (
      public.a_acces_garage(public.photo_chemin_segment(name, 1), 'dirigeant', 'accueil')
      or public.atelier_depot_photo_autorise(name)
    )
  );

-- La suppression reste au garage ; 20260919000800 y ajoute la protection des
-- photos jointes à un devis décidé.
create policy inspections_photos_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'inspections-photos'
    and public.a_acces_garage(public.photo_chemin_segment(name, 1), 'dirigeant', 'accueil')
  );

-- ----------------------------------------------------------------
-- c. Les fonctions du mécanicien
-- ----------------------------------------------------------------

create or replace function public.atelier_mes_constats(p_ordre_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_o public.ordres_reparation%rowtype;
  v_i public.inspections%rowtype;
begin
  select o.* into v_o
    from public.ordres_reparation o
   where o.id = p_ordre_id
     and o.mecanicien_id is not null
     and o.mecanicien_id = public.mon_mecanicien_id(o.garage_id)
     and o.statut <> 'annule';
  if not found then
    raise exception 'Ordre de réparation introuvable ou accès refusé';
  end if;

  select i.* into v_i
    from public.inspections i
   where i.rendez_vous_id = v_o.rendez_vous_id and i.garage_id = v_o.garage_id
   order by i.created_at desc
   limit 1;

  if not found then
    return jsonb_build_object('controle', null, 'points', '[]'::jsonb,
      'peut_ajouter', v_o.statut <> 'termine', 'motif', case when v_o.statut = 'termine' then 'fiche_terminee' end);
  end if;

  return jsonb_build_object(
    'controle', jsonb_build_object('id', v_i.id, 'statut', v_i.statut, 'verrouille', v_i.verrouille_le is not null, 'garage_id', v_i.garage_id),
    'peut_ajouter', v_o.statut <> 'termine' and v_i.verrouille_le is null,
    'motif', case when v_o.statut = 'termine' then 'fiche_terminee'
                  when v_i.verrouille_le is not null then 'controle_verrouille' end,
    'points', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'categorie', p.categorie, 'libelle', p.libelle, 'etat', p.etat,
        'commentaire', p.commentaire, 'created_at', p.created_at,
        'photos', coalesce((select jsonb_agg(jsonb_build_object('id', ph.id, 'chemin', ph.storage_path) order by ph.created_at)
                              from public.inspections_photos ph where ph.point_id = p.id), '[]'::jsonb)
      ) order by p.created_at)
      from public.inspections_points p
     where p.inspection_id = v_i.id
       -- Les points « OK » du contrôle standard n'apprennent rien au
       -- mécanicien sur ce qu'il doit regarder : on ne montre que les constats.
       and (p.etat <> 'ok' or exists (select 1 from public.inspections_photos ph where ph.point_id = p.id))
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.atelier_ajouter_constat(
  p_ordre_id uuid,
  p_libelle text,
  p_etat text,
  p_commentaire text default null,
  p_categorie text default 'autre'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_o public.ordres_reparation%rowtype;
  v_i public.inspections%rowtype;
  v_point uuid;
begin
  if coalesce(btrim(p_libelle), '') = '' or length(btrim(p_libelle)) > 200 then
    raise exception 'Constat : un libellé de 1 à 200 caractères est obligatoire';
  end if;
  if p_etat is null or p_etat not in ('a_surveiller', 'a_valider_client', 'dommage') then
    raise exception 'Constat : état invalide';
  end if;
  if p_categorie is null or p_categorie not in ('exterieur', 'pneus', 'voyants', 'objets', 'autre') then
    raise exception 'Constat : catégorie invalide';
  end if;

  select o.* into v_o
    from public.ordres_reparation o
   where o.id = p_ordre_id
     and o.mecanicien_id is not null
     and o.mecanicien_id = public.mon_mecanicien_id(o.garage_id)
     and o.statut <> 'annule'
   for update of o;
  if not found then
    raise exception 'Ordre de réparation introuvable ou accès refusé';
  end if;
  if v_o.statut = 'termine' then
    raise exception 'Cette fiche est terminée : elle ne se modifie plus';
  end if;

  -- Le verrou `for update` sur l'ordre sérialise deux ajouts simultanés : un
  -- seul contrôle est créé pour la visite.
  select i.* into v_i
    from public.inspections i
   where i.rendez_vous_id = v_o.rendez_vous_id and i.garage_id = v_o.garage_id
   order by i.created_at desc
   limit 1;

  if found and v_i.verrouille_le is not null then
    raise exception 'Contrôle finalisé : demandez au garage de le rouvrir avant d''ajouter un constat';
  end if;

  if not found then
    insert into public.inspections (garage_id, client_id, vehicule_id, rendez_vous_id, statut)
    values (v_o.garage_id, v_o.client_id, v_o.vehicule_id, v_o.rendez_vous_id, 'brouillon')
    returning * into v_i;
  end if;

  insert into public.inspections_points (inspection_id, garage_id, categorie, libelle, etat, commentaire, soumis_client)
  values (v_i.id, v_i.garage_id, p_categorie, btrim(p_libelle), p_etat, nullif(btrim(coalesce(p_commentaire, '')), ''), false)
  returning id into v_point;

  return jsonb_build_object('point_id', v_point, 'inspection_id', v_i.id, 'garage_id', v_i.garage_id);
end;
$$;

create or replace function public.atelier_ajouter_photo(p_point_id uuid, p_chemin text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_point public.inspections_points%rowtype;
  v_i public.inspections%rowtype;
  v_id uuid;
begin
  select p.* into v_point from public.inspections_points p where p.id = p_point_id;
  if not found then
    raise exception 'Constat introuvable ou accès refusé';
  end if;
  select i.* into v_i from public.inspections i where i.id = v_point.inspection_id for update of i;

  if not exists (
    select 1 from public.ordres_reparation o
     where o.rendez_vous_id = v_i.rendez_vous_id and o.garage_id = v_i.garage_id
       and o.mecanicien_id is not null
       and o.mecanicien_id = public.mon_mecanicien_id(o.garage_id)
       and o.statut not in ('annule', 'termine')
  ) then
    raise exception 'Constat introuvable ou accès refusé';
  end if;
  if v_i.verrouille_le is not null then
    raise exception 'Contrôle finalisé : demandez au garage de le rouvrir avant d''ajouter une photo';
  end if;
  if not public.photo_chemin_valide(p_chemin)
     or public.photo_chemin_segment(p_chemin, 1) is distinct from v_i.garage_id
     or public.photo_chemin_segment(p_chemin, 2) is distinct from v_i.id then
    raise exception 'Photo : chemin non conforme';
  end if;
  if not exists (select 1 from storage.objects so where so.bucket_id = 'inspections-photos' and so.name = p_chemin) then
    raise exception 'Photo : fichier introuvable, déposez-le d''abord';
  end if;
  if (select count(*) from public.inspections_photos ph where ph.point_id = p_point_id) >= 4 then
    raise exception 'Photo : limite de 4 photos atteinte pour ce constat';
  end if;
  if (select count(*) from public.inspections_photos ph where ph.inspection_id = v_i.id) >= 24 then
    raise exception 'Photo : limite de 24 photos atteinte pour ce contrôle';
  end if;
  if exists (select 1 from public.inspections_photos ph where ph.storage_path = p_chemin) then
    select ph.id into v_id from public.inspections_photos ph where ph.storage_path = p_chemin;
    return v_id;
  end if;

  insert into public.inspections_photos (inspection_id, garage_id, point_id, storage_path)
  values (v_i.id, v_i.garage_id, p_point_id, p_chemin)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.atelier_mes_constats(uuid) from public, anon;
revoke all on function public.atelier_ajouter_constat(uuid, text, text, text, text) from public, anon;
revoke all on function public.atelier_ajouter_photo(uuid, text) from public, anon;
grant execute on function public.atelier_mes_constats(uuid) to authenticated;
grant execute on function public.atelier_ajouter_constat(uuid, text, text, text, text) to authenticated;
grant execute on function public.atelier_ajouter_photo(uuid, text) to authenticated;

comment on function public.atelier_ajouter_constat(uuid, text, text, text, text) is
  'Le mécanicien affecté ajoute un constat au contrôle de la visite de sa fiche (créé s''il n''existe pas). Refusé : fiche non affectée, autre garage, adhésion révoquée, fiche terminée, contrôle verrouillé. N''expose et n''écrit aucune donnée financière.';
