-- Preuves du devis public : des identifiants opaques, pas des chemins.
--
-- Trouvé par la recette serveur du 14 septembre 2026 (preuves-devis-serveur.mjs) :
-- 20260919000800 rendait au lecteur anonyme les CHEMINS de stockage des photos,
-- de la forme <garage>/<contrôle>/<photo>. Le bucket est privé et un chemin
-- n'ouvre rien à lui seul — mais le lien d'un devis révélait ainsi
-- l'identifiant du contrôle et du garage, que rien ne justifie de publier.
--
-- Désormais :
--   * `lire_devis_par_jeton` rend, par ligne, des IDENTIFIANTS de photo :
--     `inspections_photos.id` tant que le devis est modifiable,
--     `devis_preuves.id` une fois décidé. Aucun chemin, aucun identifiant de
--     contrôle.
--   * `chemins_preuves_devis(jeton)` — réservée au rôle de service, donc à la
--     route serveur /api/devis/preuves — revalide le jeton et rend, pour ce
--     même ensemble et lui seul, la correspondance identifiant → chemin à
--     signer.
--
-- Retour arrière : recréer `lire_devis_par_jeton` depuis 20260919000800 et
-- supprimer `chemins_preuves_devis`.

-- L'ensemble exact des photos d'un devis, une seule définition pour la
-- lecture publique et la route : identifiant opaque, chemin, ligne, ordre.
create or replace function public.preuves_devis(p_devis_id uuid)
returns table (photo_id uuid, chemin text, devis_ligne_id uuid, rang integer)
language sql
stable
security definer
set search_path = ''
as $$
  select ph.id, ph.storage_path, l.id,
         (row_number() over (partition by l.id order by ph.created_at, ph.id))::integer - 1
    from public.devis d
    join public.devis_lignes l on l.devis_id = d.id
    join public.inspections_photos ph on ph.point_id = l.inspection_point_id
   where d.id = p_devis_id and public.devis_statut_modifiable(d.statut)
  union all
  select pr.id, pr.storage_path, pr.devis_ligne_id, pr.position
    from public.devis d
    join public.devis_preuves pr on pr.devis_id = d.id
   where d.id = p_devis_id and not public.devis_statut_modifiable(d.statut)
$$;

revoke all on function public.preuves_devis(uuid) from public, anon, authenticated;

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
            'photos', coalesce((
              select jsonb_agg(pv.photo_id order by pv.rang)
                from public.preuves_devis(d.id) pv
               where pv.devis_ligne_id = dl.id), '[]'::jsonb))
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

create or replace function public.chemins_preuves_devis(p_token text)
returns table (photo_id uuid, chemin text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jeton public.devis_jetons%rowtype;
begin
  select * into v_jeton from public.devis_jetons
   where jeton_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and revoked_at is null and expires_at > now();
  if not found or public.devis_chiffrage_incomplet(v_jeton.devis_id) then
    return;
  end if;
  return query select pv.photo_id, pv.chemin from public.preuves_devis(v_jeton.devis_id) pv;
end;
$$;

revoke all on function public.chemins_preuves_devis(text) from public, anon, authenticated;
grant execute on function public.chemins_preuves_devis(text) to service_role;

comment on function public.chemins_preuves_devis(text) is
  'Réservée au rôle de service (route /api/devis/preuves). Revalide le jeton et rend identifiant opaque → chemin pour les seules photos des lignes de ce devis (vivantes tant qu''il est modifiable, figées ensuite). Rien pour un jeton inconnu, révoqué, expiré ou un chiffrage incomplet.';
