-- La preuve du constat sur le devis public, figée au moment de la décision.
--
-- ================================================================
-- 1. CE QUI MANQUAIT, ET LA DÉCISION DE MODÈLE
-- ================================================================
--
-- Une ligne reprise d'un constat portait `inspection_point_id` et
-- `note_constat`, mais la page publique `/devis/<jeton>` ne montrait ni photo
-- ni constat. Et la photo, elle, restait vivante : après une réouverture du
-- contrôle, le garage pouvait la supprimer ou en ajouter — le devis déjà
-- accepté aurait alors montré autre chose que ce que le client avait vu.
--
-- Décision retenue :
--
--   * Le TEXTE du constat est `devis_lignes.note_constat`, copié à la reprise
--     (20260919000100). Modifier le point ensuite ne le change pas.
--   * Tant que le devis est MODIFIABLE (brouillon, en attente), ses photos
--     sont lues en direct sur le point, comme ses lignes, qui sont elles-mêmes
--     modifiables. Aucune décision n'a encore été prise.
--   * Au moment où le devis devient DÉCIDÉ (accepté ou refusé, quel que soit
--     le chemin : lien du client ou saisie du garage), un trigger fige la
--     liste des photos de chaque ligne dans `devis_preuves`, dans la même
--     transaction que le changement de statut. La page publique d'un devis
--     décidé ne lit plus que cette liste.
--   * Une photo figée ne se supprime plus : ni la ligne `inspections_photos`,
--     ni l'objet du stockage (politique de suppression). Le constat reste
--     modifiable ; la preuve jointe au devis, non.
--
-- Ce que le client voit d'une ligne : son libellé, le constat copié, et les
-- photos de CE point. Jamais les autres points du contrôle, jamais les notes
-- internes de l'ordre, jamais le contrôle entier.
--
-- `note_constat` était commenté « jamais projeté sur le devis public ». Ce
-- n'est plus vrai : c'est le commentaire du point, que le portail du contrôle
-- montre déjà au client. Le commentaire de colonne est corrigé ci-dessous.
--
-- Retour arrière : supprimer le trigger, la table et les fonctions ajoutées,
-- recréer `lire_devis_par_jeton` depuis 20260919000100 et la politique de
-- suppression depuis 20260919000700.

create table if not exists public.devis_preuves (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references public.garages(id) on delete cascade,
  devis_id uuid not null references public.devis(id) on delete cascade,
  devis_ligne_id uuid not null references public.devis_lignes(id) on delete cascade,
  inspection_point_id uuid,
  storage_path text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists devis_preuves_ligne_idx on public.devis_preuves (devis_ligne_id, position);
create index if not exists devis_preuves_chemin_idx on public.devis_preuves (storage_path);

comment on table public.devis_preuves is
  'Photos de constat figées sur les lignes d''un devis au moment où il est accepté ou refusé. Écrite uniquement par le trigger devis_figer_preuves. Lue par lire_devis_par_jeton pour un devis décidé.';

alter table public.devis_preuves enable row level security;
drop policy if exists devis_preuves_lecture on public.devis_preuves;
create policy devis_preuves_lecture on public.devis_preuves
  for select to authenticated
  using (public.a_acces_garage(garage_id, 'dirigeant', 'accueil'));
revoke all on table public.devis_preuves from public, anon, authenticated;
grant select on table public.devis_preuves to authenticated;
grant all on table public.devis_preuves to service_role;

comment on column public.devis_lignes.note_constat is
  'Commentaire du constat tel qu''il était au moment de la reprise. Montré au client sur le devis public avec la ligne (c''est le commentaire que le portail du contrôle lui montre déjà). Modifier le point ensuite ne le change pas.';

-- ----------------------------------------------------------------
-- Le gel, au passage à « décidé »
-- ----------------------------------------------------------------

create or replace function public.devis_figer_preuves()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.devis_statut_modifiable(old.statut) and not public.devis_statut_modifiable(new.statut) then
    delete from public.devis_preuves where devis_id = new.id;
    insert into public.devis_preuves (garage_id, devis_id, devis_ligne_id, inspection_point_id, storage_path, position)
    select l.garage_id, l.devis_id, l.id, l.inspection_point_id, ph.storage_path,
           (row_number() over (partition by l.id order by ph.created_at, ph.id))::integer - 1
      from public.devis_lignes l
      join public.inspections_photos ph on ph.point_id = l.inspection_point_id
     where l.devis_id = new.id
       and l.inspection_point_id is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists devis_figer_preuves_trigger on public.devis;
create trigger devis_figer_preuves_trigger
  after update of statut on public.devis
  for each row execute function public.devis_figer_preuves();

revoke all on function public.devis_figer_preuves() from public, anon, authenticated;

-- ----------------------------------------------------------------
-- Une photo figée ne se supprime ni ne se déplace
-- ----------------------------------------------------------------

create or replace function public.photo_figee(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.devis_preuves pr
      join public.devis d on d.id = pr.devis_id
     where pr.storage_path = p_name
       and not public.devis_statut_modifiable(d.statut)
  )
$$;

revoke all on function public.photo_figee(text) from public, anon;
grant execute on function public.photo_figee(text) to authenticated, service_role;

create or replace function public.inspections_photos_proteger_preuve()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'DELETE' or new.storage_path is distinct from old.storage_path or new.point_id is distinct from old.point_id)
     and public.photo_figee(old.storage_path) then
    raise exception 'Photo jointe à un devis accepté ou refusé : elle ne peut plus être retirée ni déplacée';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists inspections_photos_proteger_preuve_trigger on public.inspections_photos;
create trigger inspections_photos_proteger_preuve_trigger
  before update or delete on public.inspections_photos
  for each row execute function public.inspections_photos_proteger_preuve();

revoke all on function public.inspections_photos_proteger_preuve() from public, anon, authenticated;

drop policy if exists inspections_photos_storage_delete on storage.objects;
create policy inspections_photos_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'inspections-photos'
    and public.a_acces_garage(public.photo_chemin_segment(name, 1), 'dirigeant', 'accueil')
    and not public.photo_figee(name)
  );

-- ----------------------------------------------------------------
-- La lecture publique, ligne par ligne
-- ----------------------------------------------------------------

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
        'montant_ttc', dl.montant_ht + dl.montant_tva,
        'preuve', case
          when dl.inspection_point_id is null
               and not exists (select 1 from public.devis_preuves pr where pr.devis_ligne_id = dl.id)
            then null
          else jsonb_build_object(
            'constat', dl.note_constat,
            'photos', case
              when public.devis_statut_modifiable(d.statut) then coalesce((
                select jsonb_agg(ph.storage_path order by ph.created_at, ph.id)
                  from public.inspections_photos ph
                 where ph.point_id = dl.inspection_point_id), '[]'::jsonb)
              else coalesce((
                select jsonb_agg(pr.storage_path order by pr.position)
                  from public.devis_preuves pr
                 where pr.devis_ligne_id = dl.id), '[]'::jsonb)
            end)
        end
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
