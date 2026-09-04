-- Corrige le manque trouvé pendant la recette pilote du 2026-09-04 : le
-- portail public du devis (app/devis/[token]) n'affichait que le montant
-- total, jamais le détail des lignes ni la répartition HT/TVA/TTC — le
-- client acceptait un montant sans jamais voir ce qui le compose.
--
-- create or replace sur une fonction déjà versionnée
-- (20260901000400_liens_publics_rpc.sql) : portée strictement additive à son
-- corps, aucun autre comportement changé. repondre_devis_par_jeton n'est
-- pas touchée.
create or replace function public.lire_devis_par_jeton(p_token text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
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
revoke execute on function public.lire_devis_par_jeton(text) from public;
grant execute on function public.lire_devis_par_jeton(text) to anon;

comment on function public.lire_devis_par_jeton(text) is
  'Lecture publique d''un devis par jeton opaque. Retourne désormais les lignes (libellé, quantité, prix unitaire HT, taux de TVA, montants) et les totaux HT/TVA/TTC, pas seulement le montant TTC global — le client doit voir le détail de ce qu''il accepte. Additif depuis 20260901000400_liens_publics_rpc.sql.';
