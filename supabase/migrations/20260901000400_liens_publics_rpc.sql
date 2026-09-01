-- Restauration sécurisée des liens publics atelier/devis/facture — RPC.
-- Même méthode que 20260830000100 (confirmations) et 20260830000700
-- (inspections) : jeton 256 bits, seule l'empreinte SHA-256 est stockée,
-- le jeton en clair n'est jamais journalisé ni relu (irréversible côté
-- base — creer_* le retourne une seule fois, à la création).
--
-- Toutes les fonctions de génération/révocation sont SECURITY DEFINER
-- (les 3 tables *_jetons sont verrouillées, sans policy) et vérifient
-- explicitement `garages.owner_user_id = auth.uid()` — jamais une simple
-- délégation à RLS, qui de toute façon ne s'appliquerait pas à un rôle
-- SECURITY DEFINER. Aucune des fonctions ci-dessous n'utilise de SQL
-- dynamique (pas de EXECUTE), toutes fixent `search_path = public`, et
-- aucune n'accorde EXECUTE à PUBLIC (revoke explicite avant tout grant
-- ciblé).
--
-- Idempotent (create or replace), non destructif.

-- =======================================================================
-- ATELIER — lecture du RDV + changement contrôlé du statut atelier
-- =======================================================================

-- 1) Génération — action manuelle du garage (dashboard : bouton "Générer
--    le lien atelier" / QR à imprimer). Un seul lien actif à la fois par
--    RDV : régénérer révoque explicitement tout jeton actif précédent.
--    Expiration liée au RDV, au plus tard 7 jours après son début.
create or replace function public.creer_jeton_atelier(p_rdv_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_garage_id uuid;
  v_date_debut timestamptz;
  v_token text;
begin
  select rv.garage_id, rv.date_debut into v_garage_id, v_date_debut
  from rendez_vous rv
  join garages g on g.id = rv.garage_id
  where rv.id = p_rdv_id and g.owner_user_id = auth.uid();

  if v_garage_id is null then
    raise exception 'Rendez-vous introuvable ou accès refusé';
  end if;

  update atelier_jetons
    set revoked_at = now()
    where rendez_vous_id = p_rdv_id and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into atelier_jetons (rendez_vous_id, garage_id, jeton_hash, expires_at)
  values (p_rdv_id, v_garage_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_date_debut + interval '7 days');

  return v_token;
end;
$$;
revoke execute on function public.creer_jeton_atelier(uuid) from public, anon;
grant execute on function public.creer_jeton_atelier(uuid) to authenticated;

-- 2) Révocation manuelle (bouton "Révoquer le lien").
create or replace function public.revoquer_jeton_atelier(p_rdv_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_garage_id uuid;
begin
  select rv.garage_id into v_garage_id
  from rendez_vous rv
  join garages g on g.id = rv.garage_id
  where rv.id = p_rdv_id and g.owner_user_id = auth.uid();

  if v_garage_id is null then
    raise exception 'Rendez-vous introuvable ou accès refusé';
  end if;

  update atelier_jetons
    set revoked_at = now()
    where rendez_vous_id = p_rdv_id and revoked_at is null;

  return true;
end;
$$;
revoke execute on function public.revoquer_jeton_atelier(uuid) from public, anon;
grant execute on function public.revoquer_jeton_atelier(uuid) to authenticated;

-- 3) Lecture publique par jeton. Retourne un statut explicite (jamais un
--    simple null) pour que le front distingue clairement inconnu / expiré
--    / révoqué / valide — jamais de détail technique exposé au public.
create or replace function public.lire_atelier_par_jeton(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_jeton atelier_jetons%rowtype;
  v_result jsonb;
begin
  select * into v_jeton from atelier_jetons where jeton_hash = v_hash;

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
    'client', c.nom,
    'vehicule', trim(coalesce(v.marque, '') || ' ' || coalesce(v.modele, '')),
    'prestation', p.nom,
    'statut_atelier', coalesce(rv.statut_atelier, 'a_venir'),
    'date_debut', rv.date_debut,
    'debut', to_char(rv.date_debut, 'HH24:MI'),
    'fin', to_char(rv.date_fin, 'HH24:MI')
  ) into v_result
  from rendez_vous rv
  join garages g on g.id = rv.garage_id
  left join clients c on c.id = rv.client_id
  left join vehicules v on v.id = rv.vehicule_id
  left join prestations p on p.id = rv.prestation_id
  where rv.id = v_jeton.rendez_vous_id;

  return v_result;
end;
$$;
revoke execute on function public.lire_atelier_par_jeton(text) from public;
grant execute on function public.lire_atelier_par_jeton(text) to anon;

-- 4) Changement contrôlé du statut atelier par jeton — transitions
--    limitées à l'étape adjacente (précédente ou suivante) dans l'ordre
--    fixe ci-dessous, jamais un saut arbitraire (ex. "a_venir" -> "restitue"
--    directement est refusé). Même liste et même ordre que WORKSHOP_STAGES
--    côté dashboard (components/NexoraDashboard.jsx).
create or replace function public.avancer_etape_atelier_par_jeton(p_token text, p_nouveau_statut text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_jeton atelier_jetons%rowtype;
  v_etapes text[] := array['a_venir', 'depose', 'diagnostic', 'attente_client', 'attente_piece', 'intervention', 'pret', 'restitue'];
  v_statut_actuel text;
  v_idx_actuel int;
  v_idx_nouveau int;
begin
  select * into v_jeton from atelier_jetons
    where jeton_hash = v_hash and revoked_at is null and expires_at > now()
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'raison', 'invalide');
  end if;

  v_idx_nouveau := array_position(v_etapes, p_nouveau_statut);
  if v_idx_nouveau is null then
    return jsonb_build_object('ok', false, 'raison', 'transition_invalide');
  end if;

  select coalesce(statut_atelier, 'a_venir') into v_statut_actuel
    from rendez_vous where id = v_jeton.rendez_vous_id;
  v_idx_actuel := coalesce(array_position(v_etapes, v_statut_actuel), 1);

  if abs(v_idx_nouveau - v_idx_actuel) <> 1 then
    return jsonb_build_object('ok', false, 'raison', 'transition_invalide');
  end if;

  update rendez_vous set statut_atelier = p_nouveau_statut where id = v_jeton.rendez_vous_id;
  update atelier_jetons set used_at = coalesce(used_at, now()) where id = v_jeton.id;

  return jsonb_build_object('ok', true, 'statut_atelier', p_nouveau_statut);
end;
$$;
revoke execute on function public.avancer_etape_atelier_par_jeton(text, text) from public, authenticated;
grant execute on function public.avancer_etape_atelier_par_jeton(text, text) to anon;

-- =======================================================================
-- DEVIS — consultation et réponse acceptée/refusée
-- =======================================================================

create or replace function public.creer_jeton_devis(p_devis_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_garage_id uuid;
  v_token text;
begin
  select d.garage_id into v_garage_id
  from devis d
  join garages g on g.id = d.garage_id
  where d.id = p_devis_id and g.owner_user_id = auth.uid();

  if v_garage_id is null then
    raise exception 'Devis introuvable ou accès refusé';
  end if;

  update devis_jetons
    set revoked_at = now()
    where devis_id = p_devis_id and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into devis_jetons (devis_id, garage_id, jeton_hash, expires_at)
  values (p_devis_id, v_garage_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '30 days');

  return v_token;
end;
$$;
revoke execute on function public.creer_jeton_devis(uuid) from public, anon;
grant execute on function public.creer_jeton_devis(uuid) to authenticated;

create or replace function public.revoquer_jeton_devis(p_devis_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_garage_id uuid;
begin
  select d.garage_id into v_garage_id
  from devis d
  join garages g on g.id = d.garage_id
  where d.id = p_devis_id and g.owner_user_id = auth.uid();

  if v_garage_id is null then
    raise exception 'Devis introuvable ou accès refusé';
  end if;

  update devis_jetons
    set revoked_at = now()
    where devis_id = p_devis_id and revoked_at is null;

  return true;
end;
$$;
revoke execute on function public.revoquer_jeton_devis(uuid) from public, anon;
grant execute on function public.revoquer_jeton_devis(uuid) to authenticated;

create or replace function public.lire_devis_par_jeton(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_jeton devis_jetons%rowtype;
  v_result jsonb;
begin
  select * into v_jeton from devis_jetons where jeton_hash = v_hash;

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
    'montant_ttc', d.montant_ttc,
    'statut', d.statut
  ) into v_result
  from devis d
  join garages g on g.id = d.garage_id
  left join vehicules v on v.id = d.vehicule_id
  left join prestations p on p.id = d.prestation_id
  where d.id = v_jeton.devis_id;

  return v_result;
end;
$$;
revoke execute on function public.lire_devis_par_jeton(text) from public;
grant execute on function public.lire_devis_par_jeton(text) to anon;

-- Réponse client — usage protégé par `statut = 'en_attente'` : une réponse
-- déjà posée (accepte/refuse) ne peut jamais être écrasée par une seconde
-- réponse (répétée ou tardive), retour explicite 'deja_repondu'.
create or replace function public.repondre_devis_par_jeton(p_token text, p_reponse text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_jeton devis_jetons%rowtype;
  v_statut_actuel text;
begin
  if p_reponse not in ('accepte', 'refuse') then
    return jsonb_build_object('ok', false, 'raison', 'reponse_invalide');
  end if;

  select * into v_jeton from devis_jetons
    where jeton_hash = v_hash and revoked_at is null and expires_at > now()
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'raison', 'invalide');
  end if;

  select statut into v_statut_actuel from devis where id = v_jeton.devis_id for update;
  if v_statut_actuel is distinct from 'en_attente' then
    return jsonb_build_object('ok', false, 'raison', 'deja_repondu');
  end if;

  update devis set statut = p_reponse, date_validation = now() where id = v_jeton.devis_id;
  update devis_jetons set used_at = coalesce(used_at, now()) where id = v_jeton.id;

  return jsonb_build_object('ok', true, 'statut', p_reponse);
end;
$$;
revoke execute on function public.repondre_devis_par_jeton(text, text) from public, authenticated;
grant execute on function public.repondre_devis_par_jeton(text, text) to anon;

-- =======================================================================
-- FACTURE — consultation en lecture seule
-- =======================================================================

create or replace function public.creer_jeton_facture(p_facture_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_garage_id uuid;
  v_token text;
begin
  select f.garage_id into v_garage_id
  from factures f
  join garages g on g.id = f.garage_id
  where f.id = p_facture_id and g.owner_user_id = auth.uid();

  if v_garage_id is null then
    raise exception 'Facture introuvable ou accès refusé';
  end if;

  update factures_jetons
    set revoked_at = now()
    where facture_id = p_facture_id and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into factures_jetons (facture_id, garage_id, jeton_hash, expires_at)
  values (p_facture_id, v_garage_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '90 days');

  return v_token;
end;
$$;
revoke execute on function public.creer_jeton_facture(uuid) from public, anon;
grant execute on function public.creer_jeton_facture(uuid) to authenticated;

create or replace function public.revoquer_jeton_facture(p_facture_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_garage_id uuid;
begin
  select f.garage_id into v_garage_id
  from factures f
  join garages g on g.id = f.garage_id
  where f.id = p_facture_id and g.owner_user_id = auth.uid();

  if v_garage_id is null then
    raise exception 'Facture introuvable ou accès refusé';
  end if;

  update factures_jetons
    set revoked_at = now()
    where facture_id = p_facture_id and revoked_at is null;

  return true;
end;
$$;
revoke execute on function public.revoquer_jeton_facture(uuid) from public, anon;
grant execute on function public.revoquer_jeton_facture(uuid) to authenticated;

create or replace function public.lire_facture_par_jeton(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_jeton factures_jetons%rowtype;
  v_result jsonb;
begin
  select * into v_jeton from factures_jetons where jeton_hash = v_hash;

  if not found then
    return jsonb_build_object('ok', false, 'raison', 'inconnu');
  end if;
  if v_jeton.revoked_at is not null then
    return jsonb_build_object('ok', false, 'raison', 'revoque');
  end if;
  if v_jeton.expires_at <= now() then
    return jsonb_build_object('ok', false, 'raison', 'expire');
  end if;

  update factures_jetons set used_at = coalesce(used_at, now()) where id = v_jeton.id;

  select jsonb_build_object(
    'ok', true,
    'garage_nom', g.nom_garage,
    'numero', f.numero,
    'vehicule', trim(coalesce(v.marque, '') || ' ' || coalesce(v.modele, '')),
    'motif', f.motif,
    'montant_ttc', f.montant_ttc,
    'statut', f.statut,
    'lignes', coalesce(to_jsonb(f.lignes), '[]'::jsonb),
    'created_at', f.created_at
  ) into v_result
  from factures f
  join garages g on g.id = f.garage_id
  left join vehicules v on v.id = f.vehicule_id
  where f.id = v_jeton.facture_id;

  return v_result;
end;
$$;
revoke execute on function public.lire_facture_par_jeton(text) from public;
grant execute on function public.lire_facture_par_jeton(text) to anon;
