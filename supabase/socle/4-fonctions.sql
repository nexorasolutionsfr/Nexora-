-- ATTENTION — CE FICHIER N'EST PAS UNE MIGRATION.
--
-- Il decrit le socle tel qu'il EXISTE, releve en lecture seule sur le projet
-- PROD le 2026-09-05, par interrogation du catalogue Postgres. Il sert a
-- PROVISIONNER UN ENVIRONNEMENT NEUF (recette, bac a sable, reprise apres
-- sinistre), et a servir de reference ecrite au schema.
--
-- Ne jamais l'executer sur Test ni sur Production : ces bases portent deja ces
-- objets. Les `if not exists` le rendent inoffensif sur une base existante,
-- mais ce n'est pas une raison de l'y lancer.
--
-- Ordre d'execution : 1-tables, 2-contraintes, 3-index, 4-fonctions,
-- 5-triggers, 6-rls-policies.
--
-- Genere automatiquement. Ne pas modifier a la main : regenerer.

CREATE OR REPLACE FUNCTION public.assigner_numero_facture()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  nouveau_numero integer;
  begin
    update garages set dernier_numero_facture = dernier_numero_facture + 1
      where id = new.garage_id
        returning dernier_numero_facture into nouveau_numero;
          new.numero := 'F-' || extract(year from now())::text || '-' || lpad(nouveau_numero::text, 4, '0');
            return new;
            end;
            $function$;

CREATE OR REPLACE FUNCTION public.avancer_etape_atelier(rdv_id uuid, nouveau_statut text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if nouveau_statut not in ('a_venir','depose','diagnostic','attente_client','attente_piece','intervention','pret','restitue') then
    raise exception 'Statut invalide';
  end if;
  update rendez_vous set statut_atelier = nouveau_statut where id = rdv_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.avancer_etape_atelier_par_jeton(p_token text, p_nouveau_statut text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_jeton public.atelier_jetons%rowtype;
  v_etapes text[] := array['a_venir', 'depose', 'diagnostic', 'attente_client', 'attente_piece', 'intervention', 'pret', 'restitue'];
  v_statut_actuel text;
  v_idx_actuel int;
  v_idx_nouveau int;
begin
  select * into v_jeton from public.atelier_jetons
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
    from public.rendez_vous where id = v_jeton.rendez_vous_id;
  v_idx_actuel := coalesce(array_position(v_etapes, v_statut_actuel), 1);

  if abs(v_idx_nouveau - v_idx_actuel) <> 1 then
    return jsonb_build_object('ok', false, 'raison', 'transition_invalide');
  end if;

  update public.rendez_vous set statut_atelier = p_nouveau_statut where id = v_jeton.rendez_vous_id;
  update public.atelier_jetons set used_at = coalesce(used_at, now()) where id = v_jeton.id;

  return jsonb_build_object('ok', true, 'statut_atelier', p_nouveau_statut);
end;
$function$;

CREATE OR REPLACE FUNCTION public.creer_jeton_atelier(p_rdv_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_garage_id uuid;
  v_date_debut timestamptz;
  v_token text;
begin
  select rv.garage_id, rv.date_debut into v_garage_id, v_date_debut
  from public.rendez_vous rv
  join public.garages g on g.id = rv.garage_id
  where rv.id = p_rdv_id and g.owner_user_id = auth.uid()
  for update of rv;

  if v_garage_id is null then
    raise exception 'Rendez-vous introuvable ou accès refusé';
  end if;

  update public.atelier_jetons
    set revoked_at = now()
    where rendez_vous_id = p_rdv_id and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.atelier_jetons (rendez_vous_id, garage_id, jeton_hash, expires_at)
  values (p_rdv_id, v_garage_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_date_debut + interval '7 days');

  return v_token;
end;
$function$;

CREATE OR REPLACE FUNCTION public.creer_jeton_confirmation(p_rdv_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_token text;
  v_garage_id uuid;
  v_expires timestamptz;
begin
  select garage_id, date_debut into v_garage_id, v_expires from rendez_vous where id = p_rdv_id;
  if v_garage_id is null then
    raise exception 'Rendez-vous introuvable';
  end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into confirmations_jetons (rendez_vous_id, garage_id, jeton_hash, expires_at)
  values (p_rdv_id, v_garage_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_expires);
  return v_token;
end;
$function$;

CREATE OR REPLACE FUNCTION public.creer_jeton_devis(p_devis_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_garage_id uuid;
  v_token text;
begin
  select d.garage_id into v_garage_id
  from public.devis d
  join public.garages g on g.id = d.garage_id
  where d.id = p_devis_id and g.owner_user_id = auth.uid()
  for update of d;

  if v_garage_id is null then
    raise exception 'Devis introuvable ou accès refusé';
  end if;

  update public.devis_jetons
    set revoked_at = now()
    where devis_id = p_devis_id and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.devis_jetons (devis_id, garage_id, jeton_hash, expires_at)
  values (p_devis_id, v_garage_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '30 days');

  return v_token;
end;
$function$;

CREATE OR REPLACE FUNCTION public.creer_jeton_facture(p_facture_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_garage_id uuid;
  v_token text;
begin
  select f.garage_id into v_garage_id
  from public.factures f
  join public.garages g on g.id = f.garage_id
  where f.id = p_facture_id and g.owner_user_id = auth.uid()
  for update of f;

  if v_garage_id is null then
    raise exception 'Facture introuvable ou accès refusé';
  end if;

  update public.factures_jetons
    set revoked_at = now()
    where facture_id = p_facture_id and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.factures_jetons (facture_id, garage_id, jeton_hash, expires_at)
  values (p_facture_id, v_garage_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '90 days');

  return v_token;
end;
$function$;

CREATE OR REPLACE FUNCTION public.creer_jeton_inspection(p_inspection_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_garage_id uuid;
  v_token text;
begin
  select i.garage_id into v_garage_id
  from inspections i
  join garages g on g.id = i.garage_id
  where i.id = p_inspection_id and g.owner_user_id = auth.uid();

  if v_garage_id is null then
    raise exception 'Inspection introuvable ou accès refusé';
  end if;

  -- Un seul lien actif à la fois par inspection : régénérer en révoque un
  -- éventuel précédent (ex. après réouverture, ou renvoi volontaire).
  update inspections_jetons
    set revoked_at = now()
    where inspection_id = p_inspection_id and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into inspections_jetons (inspection_id, garage_id, jeton_hash, expires_at)
  values (p_inspection_id, v_garage_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '30 days');

  return v_token;
end;
$function$;

CREATE OR REPLACE FUNCTION public.current_garage_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select id from public.garages where owner_user_id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.devis_check_immuabilite()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if public.devis_statut_modifiable(old.statut) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception
      'devis: un devis verrouille (statut=%) ne peut pas etre supprime',
      coalesce(old.statut, 'NULL');
  end if;

  raise exception
    'devis: un devis verrouille (statut=%) ne peut plus etre modifie',
    coalesce(old.statut, 'NULL');
end;
$function$;

CREATE OR REPLACE FUNCTION public.devis_lignes_check_integrite()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_devis_garage uuid;
  v_devis_statut text;
  v_prestation_garage uuid;
  v_devis_id uuid;
  v_trouve boolean;
begin
  v_devis_id := case when tg_op = 'DELETE' then old.devis_id else new.devis_id end;

  select d.garage_id, d.statut, true
    into v_devis_garage, v_devis_statut, v_trouve
    from public.devis d
    where d.id = v_devis_id;

  -- Suppression en cascade : lorsqu'un devis modifiable est supprimé, ses
  -- lignes sont retirées APRÈS la ligne parente, qui n'existe donc plus ici.
  -- On laisse passer — ce n'est pas un trou, la suppression d'un devis
  -- verrouillé est déjà refusée en amont par devis_check_immuabilite, donc une
  -- cascade ne peut provenir que d'un devis modifiable (contrat G.1).
  if not coalesce(v_trouve, false) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    raise exception 'devis_lignes: devis introuvable ou hors garage';
  end if;

  -- Immuabilité (contrat G.1) : aucune écriture de ligne sur un devis
  -- verrouillé, ni insertion, ni modification, ni suppression.
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

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.devis_lignes_recalculer_totaux()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_devis_id uuid;
  v_ht numeric;
  v_ttc numeric;
begin
  v_devis_id := case when tg_op = 'DELETE' then old.devis_id else new.devis_id end;

  select coalesce(sum(l.montant_ht), 0),
         coalesce(sum(l.montant_ht + l.montant_tva), 0)
    into v_ht, v_ttc
    from public.devis_lignes l
   where l.devis_id = v_devis_id;

  -- L'UPDATE n'est émis QUE si un total change réellement. Un UPDATE sans
  -- effet déclencherait quand même les triggers AFTER de devis : c'est le
  -- couplage que cette clause coupe. Aujourd'hui notifier_devis_maj ne réagit
  -- qu'aux transitions de statut et resterait donc muette de toute façon ;
  -- cette clause fait que le lot ne dépend pas de ce détail d'implémentation
  -- d'une fonction qu'il ne possède pas.
  update public.devis d
     set montant_ht = v_ht,
         montant_ttc = v_ttc
   where d.id = v_devis_id
     and (d.montant_ht is distinct from v_ht
          or d.montant_ttc is distinct from v_ttc);

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

CREATE OR REPLACE FUNCTION public.devis_lignes_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.devis_statut_modifiable(p_statut text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select p_statut is not null and p_statut in ('brouillon', 'en_attente');
$function$;

CREATE OR REPLACE FUNCTION public.factures_check_immuabilite()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- a. Ancrages figés dès la création.
  if new.garage_id is distinct from old.garage_id then
    raise exception 'factures: le garage d''une facture ne peut plus changer';
  end if;
  if new.ordre_reparation_id is distinct from old.ordre_reparation_id then
    raise exception 'factures: l''ordre de reparation de reference ne peut plus changer';
  end if;
  if new.rendez_vous_id is distinct from old.rendez_vous_id then
    raise exception 'factures: le rendez_vous d''une facture ne peut plus changer';
  end if;
  if new.client_id is distinct from old.client_id
    or new.vehicule_id is distinct from old.vehicule_id
  then
    raise exception 'factures: le client et le vehicule d''une facture ne peuvent plus changer';
  end if;
  if new.numero is distinct from old.numero then
    raise exception 'factures: le numero d''une facture ne peut plus changer';
  end if;

  -- c. Statut financier monotone.
  if old.statut = 'payee' and new.statut is distinct from 'payee' then
    raise exception 'factures: une facture payee ne peut pas revenir a un statut non paye';
  end if;
  if old.date_paiement is not null and new.date_paiement is null then
    raise exception 'factures: la date de paiement d''une facture payee ne peut pas etre effacee';
  end if;

  -- b. Contenu financier figé une fois la facture payée.
  if old.statut = 'payee' then
    if new.lignes is distinct from old.lignes
      or new.montant_ht is distinct from old.montant_ht
      or new.montant_ttc is distinct from old.montant_ttc
    then
      raise exception 'factures: une facture payee est definitive, ses lignes et ses montants ne peuvent plus etre modifies';
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.factures_check_integrite()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_or_garage uuid;
  v_or_rdv uuid;
begin
  if new.ordre_reparation_id is not null then
    select garage_id, rendez_vous_id
      into v_or_garage, v_or_rdv
      from public.ordres_reparation
      where id = new.ordre_reparation_id;

    if not found then
      raise exception 'factures: ordre de reparation introuvable';
    end if;

    if v_or_garage is distinct from new.garage_id then
      raise exception 'factures: l''ordre de reparation appartient a un autre garage';
    end if;

    -- Une facture et son OR décrivent la même intervention : si la facture
    -- porte un rendez-vous, ce doit être celui de l'OR.
    if new.rendez_vous_id is not null and v_or_rdv is distinct from new.rendez_vous_id then
      raise exception 'factures: l''ordre de reparation ne correspond pas au rendez_vous de cette facture';
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finaliser_inspection(p_inspection_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_total int;
  v_new_statut text;
begin
  select count(*) into v_total
  from inspections_points
  where inspection_id = p_inspection_id and soumis_client = true;

  v_new_statut := case when v_total = 0 then 'finalisee_sans_decision' else 'en_attente_client' end;

  update inspections
    set statut = v_new_statut, verrouille_le = now()
    where id = p_inspection_id;

  if not found then
    raise exception 'Inspection introuvable ou accès refusé';
  end if;

  return v_new_statut;
end;
$function$;

CREATE OR REPLACE FUNCTION public.inspections_bloquer_contenu_si_verrouillee()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.inspections_log_historique()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if (tg_op = 'UPDATE') and (new.statut is distinct from old.statut) then
    insert into public.inspections_historique (
      inspection_id, garage_id, action, ancien_statut, nouveau_statut
    ) values (
      new.id, new.garage_id, 'changement_statut', old.statut, new.statut
    );
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.inspections_photos_bloquer_si_verrouillee()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.inspections_points_bloquer_si_verrouillee()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.inspections_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.lire_atelier_par_jeton(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_jeton public.atelier_jetons%rowtype;
  v_result jsonb;
begin
  select * into v_jeton from public.atelier_jetons where jeton_hash = v_hash;

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
  from public.rendez_vous rv
  join public.garages g on g.id = rv.garage_id
  left join public.clients c on c.id = rv.client_id
  left join public.vehicules v on v.id = rv.vehicule_id
  left join public.prestations p on p.id = rv.prestation_id
  where rv.id = v_jeton.rendez_vous_id;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.lire_confirmation_par_jeton(p_token text)
 RETURNS TABLE(garage_nom text, vehicule text, prestation text, date_debut timestamp with time zone, debut text, fin text, statut_confirmation text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select g.nom_garage,
         trim(coalesce(v.marque,'') || ' ' || coalesce(v.modele,'')),
         p.nom, rv.date_debut,
         to_char(rv.date_debut, 'HH24:MI'), to_char(rv.date_fin, 'HH24:MI'),
         rv.statut_confirmation
  from confirmations_jetons j
  join rendez_vous rv on rv.id = j.rendez_vous_id
  join garages g on g.id = j.garage_id
  left join vehicules v on v.id = rv.vehicule_id
  left join prestations p on p.id = rv.prestation_id
  where j.jeton_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and j.revoked_at is null
    and j.used_at is null
    and j.expires_at > now();
$function$;

CREATE OR REPLACE FUNCTION public.lire_confirmation_rdv_public(p_rdv_id uuid)
 RETURNS TABLE(id uuid, client_nom text, vehicule text, prestation text, date_debut timestamp with time zone, debut text, fin text, garage_nom text, statut_confirmation text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select null::uuid, null::text, null::text, null::text, null::timestamptz, null::text, null::text, null::text, null::text
  where false;
$function$;

CREATE OR REPLACE FUNCTION public.lire_devis_par_jeton(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.lire_devis_public(p_devis_id uuid)
 RETURNS TABLE(client_nom text, vehicule text, prestation text, montant_ttc numeric, statut text, garage_nom text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select c.nom, concat(v.marque, ' ', v.modele), p.nom, d.montant_ttc, d.statut, g.nom_garage from devis d left join clients c on c.id = d.client_id left join vehicules v on v.id = d.vehicule_id left join prestations p on p.id = d.prestation_id left join garages g on g.id = d.garage_id where d.id = p_devis_id; $function$;

CREATE OR REPLACE FUNCTION public.lire_etape_atelier(rdv_id uuid)
 RETURNS TABLE(client text, vehicule text, prestation text, statut_atelier text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.nom, concat(v.marque, ' ', v.modele), p.nom, r.statut_atelier
  from rendez_vous r
  left join clients c on c.id = r.client_id
  left join vehicules v on v.id = r.vehicule_id
  left join prestations p on p.id = r.prestation_id
  where r.id = rdv_id;
$function$;

CREATE OR REPLACE FUNCTION public.lire_facture_par_jeton(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_jeton public.factures_jetons%rowtype;
  v_result jsonb;
begin
  select * into v_jeton from public.factures_jetons where jeton_hash = v_hash;

  if not found then
    return jsonb_build_object('ok', false, 'raison', 'inconnu');
  end if;
  if v_jeton.revoked_at is not null then
    return jsonb_build_object('ok', false, 'raison', 'revoque');
  end if;
  if v_jeton.expires_at <= now() then
    return jsonb_build_object('ok', false, 'raison', 'expire');
  end if;

  update public.factures_jetons set used_at = coalesce(used_at, now()) where id = v_jeton.id;

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
  from public.factures f
  join public.garages g on g.id = f.garage_id
  left join public.vehicules v on v.id = f.vehicule_id
  where f.id = v_jeton.facture_id;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.lire_facture_publique(p_facture_id uuid)
 RETURNS TABLE(numero text, garage_nom text, vehicule text, motif text, montant_ht numeric, montant_ttc numeric, statut text, lignes jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ begin return query select f.numero, g.nom_garage, trim(concat(v.marque, ' ', v.modele)), f.motif, f.montant_ht, f.montant_ttc, f.statut, f.lignes from factures f join garages g on g.id = f.garage_id left join vehicules v on v.id = f.vehicule_id where f.id = p_facture_id; end; $function$;

CREATE OR REPLACE FUNCTION public.lire_inspection_par_jeton(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_jeton inspections_jetons%rowtype;
  v_result jsonb;
begin
  select * into v_jeton from inspections_jetons
    where jeton_hash = v_hash and revoked_at is null and expires_at > now();
  if not found then
    return null;
  end if;

  update inspections
    set statut = 'consulte'
    where id = v_jeton.inspection_id and statut = 'en_attente_client';

  select jsonb_build_object(
    'garage_nom', g.nom_garage,
    'vehicule_libelle', coalesce(nullif(trim(coalesce(v.marque, '') || ' ' || coalesce(v.modele, '')), ''), i.vehicule_libelle_libre),
    'immatriculation', coalesce(v.immatriculation, i.immatriculation_libre),
    'kilometrage', i.kilometrage,
    'niveau_carburant', i.niveau_carburant,
    'statut', i.statut,
    'verrouille_le', i.verrouille_le,
    'points', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'categorie', p.categorie,
        'libelle', p.libelle,
        'etat', p.etat,
        'commentaire', p.commentaire,
        'soumis_client', p.soumis_client,
        'decision_client', p.decision_client,
        'decision_le', p.decision_le,
        'photos', coalesce((
          select jsonb_agg(ph.storage_path order by ph.created_at) from inspections_photos ph where ph.point_id = p.id
        ), '[]'::jsonb)
      ) order by p.created_at)
      from inspections_points p where p.inspection_id = i.id
    ), '[]'::jsonb)
  ) into v_result
  from inspections i
  join garages g on g.id = i.garage_id
  left join vehicules v on v.id = i.vehicule_id
  where i.id = v_jeton.inspection_id;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notification_abandonner(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_garage uuid;
begin
  v_garage := public.current_garage_id();
  if v_garage is null then
    raise exception 'Aucun garage associe au compte connecte';
  end if;

  update public.notifications_devis n
  set statut_traitement = 'abandonne'
  from public.devis d
  where n.id = p_id
    and d.id = n.devis_id
    and d.garage_id = v_garage
    and n.statut_traitement = 'incomplet';

  if not found then
    raise exception 'Notification introuvable, deja traitee, ou hors perimetre';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notification_reessayer(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_garage uuid;
begin
  v_garage := public.current_garage_id();
  if v_garage is null then
    raise exception 'Aucun garage associe au compte connecte';
  end if;

  update public.notifications_devis n
  set statut_traitement = 'en_attente',
      incomplet_motif   = null
  from public.devis d
  where n.id = p_id
    and d.id = n.devis_id
    and d.garage_id = v_garage
    and n.statut_traitement = 'incomplet';

  if not found then
    raise exception 'Notification introuvable, deja traitee, ou hors perimetre';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notifications_a_verifier()
 RETURNS TABLE(id uuid, cree_le timestamp with time zone, motif text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_garage uuid;
begin
  v_garage := public.current_garage_id();
  if v_garage is null then
    raise exception 'Aucun garage associe au compte connecte';
  end if;

  return query
    select n.id, n.created_at, n.incomplet_motif
    from public.notifications_devis n
    join public.devis d on d.id = n.devis_id
    where n.statut_traitement = 'incomplet'
      and d.garage_id = v_garage
    order by n.created_at asc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notifications_vehicule_pret_en_attente()
 RETURNS TABLE(notification_id uuid, rendez_vous_id uuid, client_nom text, client_email text, vehicule text, garage_nom text, lien_paiement text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select n.id, r.id, c.nom, c.email, concat(v.marque, ' ', v.modele), g.nom_garage, r.lien_paiement from notifications_atelier n join rendez_vous r on r.id = n.rendez_vous_id left join clients c on c.id = r.client_id left join vehicules v on v.id = r.vehicule_id left join garages g on g.id = r.garage_id where n.envoye = false and n.type = 'vehicule_pret'; $function$;

CREATE OR REPLACE FUNCTION public.notifier_devis_maj()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
      begin
        if new.statut = 'accepte' and old.statut is distinct from 'accepte' then    insert into notifications_devis (devis_id, type) values (new.id, 'accepte');
          elsif new.statut = 'refuse' and old.statut is distinct from 'refuse' then    insert into notifications_devis (devis_id, type) values (new.id, 'refuse');
            end if;
              return new;
              end;
              $function$;

CREATE OR REPLACE FUNCTION public.notifier_facture_payee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ begin if new.statut = 'payee' and old.statut is distinct from 'payee' then insert into notifications_factures (facture_id, type) values (new.id, 'payee'); end if; return new; end; $function$;

CREATE OR REPLACE FUNCTION public.notifier_nouveau_devis()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.statut = 'en_attente' then    insert into notifications_devis (devis_id, type) values (new.id, 'nouveau');
    end if;
      return new;
      end;
      $function$;

CREATE OR REPLACE FUNCTION public.notifier_nouvelle_facture()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ begin insert into notifications_factures (facture_id, type) values (new.id, 'nouvelle'); return new; end; $function$;

CREATE OR REPLACE FUNCTION public.notifier_proposition_maj()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ begin if new.statut = 'accepte' and (old.statut is distinct from 'accepte') then insert into notifications_proposition (proposition_id, type) values (new.id, 'accepte'); elsif new.statut = 'refuse' and (old.statut is distinct from 'refuse') then insert into notifications_proposition (proposition_id, type) values (new.id, 'refuse'); elsif new.statut = 'en_attente' and old.statut = 'en_attente' and (new.date_debut_proposee is distinct from old.date_debut_proposee) then insert into notifications_proposition (proposition_id, type) values (new.id, 'reschedule'); end if; return new; end; $function$;

CREATE OR REPLACE FUNCTION public.notifier_vehicule_pret()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ begin if new.statut_atelier = 'pret' and (old.statut_atelier is distinct from 'pret') then insert into notifications_atelier (rendez_vous_id, type) values (new.id, 'vehicule_pret'); end if; return new; end; $function$;

CREATE OR REPLACE FUNCTION public.opportunites_actions_forcer_identite()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.effectue_par := auth.uid();
  new.created_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ordres_reparation_check_integrite()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  if tg_op = 'INSERT' then
    -- L'auteur est toujours celui de la session courante : un appel client
    -- ne peut jamais choisir un autre auteur en fournissant sa propre
    -- valeur de created_by. Sous service_role (pas de JWT), auth.uid() est
    -- NULL et created_by reste NULL — aucun compte n'est inventé.
    new.created_by := auth.uid();

    -- Validation complète, une seule fois, à la création : le rendez-vous
    -- (et donc client/véhicule/garage qu'il porte) ne pourra plus changer
    -- ensuite (immuabilité vérifiée ci-dessous sur UPDATE), il n'y a donc
    -- jamais besoin de le revalider après coup.
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
  end if;

  if tg_op = 'UPDATE' then
    -- rendez_vous_id / vehicule_id / client_id / garage_id / created_by
    -- sont figés à la création : aucune revalidation du rendez-vous n'est
    -- donc jamais nécessaire après coup, sa cohérence a été prouvée une
    -- fois pour toutes à l'INSERT et ne peut plus se dégrader.
    if new.rendez_vous_id is distinct from old.rendez_vous_id
      or new.vehicule_id is distinct from old.vehicule_id
      or new.client_id is distinct from old.client_id
      or new.garage_id is distinct from old.garage_id
      or new.created_by is distinct from old.created_by
    then
      raise exception
        'ordres_reparation: rendez_vous_id, vehicule_id, client_id, garage_id et created_by sont figes a la creation';
    end if;

    -- Le devis n'est revalidé QUE si devis_id change dans cet UPDATE — un
    -- simple changement de statut de l'OR (notamment l'annulation) ne doit
    -- jamais échouer parce que le devis déjà rattaché a, depuis, changé de
    -- statut ou été modifié : un OR doit toujours pouvoir être annulé.
    if new.devis_id is distinct from old.devis_id and new.devis_id is not null then
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

    -- Le mécanicien n'est revalidé QUE si mecanicien_id change dans cet
    -- UPDATE, pour la même raison : un changement de statut ne doit jamais
    -- redéclencher une validation sur une affectation déjà en place.
    if new.mecanicien_id is distinct from old.mecanicien_id and new.mecanicien_id is not null then
      select garage_id into v_mecanicien_garage
        from public.mecaniciens
        where id = new.mecanicien_id;

      if not found or v_mecanicien_garage is distinct from new.garage_id then
        raise exception 'ordres_reparation: mecanicien hors garage';
      end if;
    end if;

    return new;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ordres_reparation_lignes_check_integrite()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.ordres_reparation_log_historique()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    insert into public.ordres_reparation_historique (
      ordre_reparation_id, garage_id, action, nouveau_statut, effectue_par
    ) values (
      new.id, new.garage_id, 'creation', new.statut, new.created_by
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
$function$;

CREATE OR REPLACE FUNCTION public.ordres_reparation_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.preparer_rappels_confirmation()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count integer := 0;
  v_rdv record;
  v_token text;
begin
  for v_rdv in
    select rv.id, rv.garage_id, rv.date_debut, c.email
    from rendez_vous rv
    join garages g on g.id = rv.garage_id
    left join clients c on c.id = rv.client_id
    where rv.statut = 'confirme'
      and rv.source = 'test'
      and g.rappel_confirmation_actif = true
      and rv.date_debut > now()
      and rv.date_debut - (coalesce(g.delai_confirmation_rdv_h, 24) || ' hours')::interval <= now()
      and not exists (
        select 1 from confirmations_rappels_file f
        where f.rendez_vous_id = rv.id and f.echeance_rdv = rv.date_debut
      )
  loop
    v_token := public.creer_jeton_confirmation(v_rdv.id);
    insert into confirmations_rappels_file (garage_id, rendez_vous_id, echeance_rdv, destinataire_email, lien_public, statut)
    values (v_rdv.garage_id, v_rdv.id, v_rdv.date_debut, v_rdv.email,
            'https://nexora-garage.vercel.app/c/' || v_token, 'prepare');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reouvrir_inspection(p_inspection_id uuid, p_motif text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_garage_id uuid;
  v_ancien_statut text;
begin
  if p_motif is null or length(trim(p_motif)) = 0 then
    raise exception 'Un motif est obligatoire pour réouvrir une inspection';
  end if;

  select i.garage_id, i.statut into v_garage_id, v_ancien_statut
  from inspections i
  join garages g on g.id = i.garage_id
  where i.id = p_inspection_id and g.owner_user_id = auth.uid();

  if v_garage_id is null then
    raise exception 'Inspection introuvable ou accès refusé';
  end if;

  -- Révocation du lien existant avant toute modification.
  update inspections_jetons
    set revoked_at = now()
    where inspection_id = p_inspection_id and revoked_at is null;

  -- Déverrouille D'ABORD l'inspection : les garde-fous de
  -- 20260830000900_inspections_verrouillage.sql interdisent toute écriture
  -- sur ses points tant que verrouille_le n'est pas nul (à l'exception de la
  -- décision client elle-même). Réinitialiser les décisions ci-dessous doit
  -- donc se faire après ce déverrouillage, pas avant.
  update inspections
    set statut = 'brouillon', verrouille_le = null
    where id = p_inspection_id;

  -- Une décision client est immuable tant que l'inspection reste verrouillée
  -- (voir repondre_point_inspection_par_jeton). La réouverture est l'unique
  -- porte de sortie explicite : elle réinitialise les décisions des points
  -- soumis pour permettre une nouvelle finalisation et un nouveau lien.
  -- Conséquence assumée et tracée par cette même action, jamais silencieuse.
  update inspections_points
    set decision_client = null, decision_le = null
    where inspection_id = p_inspection_id and decision_client is not null;

  insert into inspections_historique (inspection_id, garage_id, action, ancien_statut, nouveau_statut, motif)
  values (p_inspection_id, v_garage_id, 'reouverture', v_ancien_statut, 'brouillon', trim(p_motif));

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.repondre_confirmation_par_jeton(p_token text, p_reponse text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_jeton confirmations_jetons%rowtype;
begin
  if p_reponse not in ('confirme_par_client', 'report_demande', 'annule_par_client') then
    return false;
  end if;
  select * into v_jeton from confirmations_jetons
    where jeton_hash = v_hash and revoked_at is null and used_at is null and expires_at > now()
    for update;
  if not found then
    return false;
  end if;
  update confirmations_jetons set used_at = now() where id = v_jeton.id;
  update rendez_vous
    set statut_confirmation = p_reponse,
        confirmation_repondu_at = now(),
        statut = case when p_reponse = 'annule_par_client' then 'annule' else statut end
    where id = v_jeton.rendez_vous_id;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.repondre_confirmation_rdv_public(p_rdv_id uuid, p_reponse text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  raise exception 'Parcours obsolète : ce lien ne permet plus aucune action.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.repondre_devis_par_jeton(p_token text, p_reponse text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  update public.devis set statut = p_reponse, date_validation = now() where id = v_jeton.devis_id;
  update public.devis_jetons set used_at = coalesce(used_at, now()) where id = v_jeton.id;

  return jsonb_build_object('ok', true, 'statut', p_reponse);
end;
$function$;

CREATE OR REPLACE FUNCTION public.repondre_devis_public(p_devis_id uuid, p_reponse text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ begin if p_reponse not in ('accepte', 'refuse') then raise exception 'Reponse invalide'; end if; update devis set statut = p_reponse, date_validation = now() where id = p_devis_id and statut = 'en_attente'; end; $function$;

CREATE OR REPLACE FUNCTION public.repondre_point_inspection_par_jeton(p_token text, p_point_id uuid, p_decision text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_jeton inspections_jetons%rowtype;
  v_point inspections_points%rowtype;
  v_total int;
  v_decided int;
  v_valide int;
  v_refuse int;
  v_new_statut text;
begin
  if p_decision not in ('valide', 'refuse') then
    return false;
  end if;

  select * into v_jeton from inspections_jetons
    where jeton_hash = v_hash and revoked_at is null and expires_at > now()
    for update;
  if not found then
    return false;
  end if;

  select * into v_point from inspections_points
    where id = p_point_id and inspection_id = v_jeton.inspection_id and soumis_client = true
    for update;
  if not found then
    return false;
  end if;

  if v_point.decision_client is not null then
    return false;
  end if;

  update inspections_points set decision_client = p_decision, decision_le = now() where id = p_point_id;

  select count(*), count(decision_client),
         count(*) filter (where decision_client = 'valide'),
         count(*) filter (where decision_client = 'refuse')
    into v_total, v_decided, v_valide, v_refuse
    from inspections_points
    where inspection_id = v_jeton.inspection_id and soumis_client = true;

  if v_decided = 0 then
    v_new_statut := 'consulte';
  elsif v_decided = v_total and v_valide = v_total then
    v_new_statut := 'valide';
  elsif v_decided = v_total and v_refuse = v_total then
    v_new_statut := 'refuse';
  else
    v_new_statut := 'partiellement_valide';
  end if;

  update inspections set statut = v_new_statut where id = v_jeton.inspection_id;

  if v_decided = v_total then
    update inspections_jetons set used_at = now() where id = v_jeton.id and used_at is null;
  end if;

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revenue_recovery_brouillons_identite_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.cree_par := auth.uid();
  new.modifie_par := auth.uid();
  new.created_at := now();
  new.updated_at := now();
  -- Cohérence inter-garages : travail_differe_id doit appartenir au même
  -- garage_id (le RLS seul ne le garantit pas — voir même contrôle sur
  -- revenue_recovery_permissions).
  if not exists (
    select 1 from public.travaux_differes
    where id = new.travail_differe_id and garage_id = new.garage_id
  ) then
    raise exception 'travail_differe_id % n''appartient pas au garage %', new.travail_differe_id, new.garage_id;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revenue_recovery_brouillons_verrouiller()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if old.statut <> 'brouillon' then
    raise exception 'Brouillon verrouillé (statut=%) : modification refusée', old.statut;
  end if;
  new.modifie_par := auth.uid();
  new.updated_at := now();
  new.garage_id := old.garage_id;
  new.travail_differe_id := old.travail_differe_id;
  new.cree_par := old.cree_par;
  new.created_at := old.created_at;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revenue_recovery_definir_autorisation_garage(p_garage_id uuid, p_autorise boolean, p_motif text DEFAULT NULL::text)
 RETURNS revenue_recovery_garages_autorises
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row public.revenue_recovery_garages_autorises;
begin
  if not exists (select 1 from public.garages where id = p_garage_id) then
    raise exception 'Garage % introuvable', p_garage_id;
  end if;

  insert into public.revenue_recovery_garages_autorises (garage_id, autorise, motif, autorise_le)
  values (p_garage_id, p_autorise, p_motif, case when p_autorise then now() else null end)
  on conflict (garage_id) do update
    set autorise = excluded.autorise,
        motif = excluded.motif,
        autorise_le = case when excluded.autorise then now() else null end
  returning * into v_row;

  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revenue_recovery_enregistrer_permission(p_garage_id uuid, p_client_id uuid, p_canal text, p_statut text, p_origine text, p_travail_differe_id uuid DEFAULT NULL::uuid, p_base_eligibilite text DEFAULT NULL::text, p_preuve_reference text DEFAULT NULL::text, p_motif text DEFAULT NULL::text)
 RETURNS revenue_recovery_permissions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row public.revenue_recovery_permissions;
  v_actuel record;
  v_derniere_autorisation record;
begin
  if p_canal <> 'email' then
    raise exception 'Canal non supporté : %', p_canal;
  end if;
  if p_statut not in ('inconnu', 'autorise', 'oppose', 'expire', 'revoque') then
    raise exception 'Statut invalide : %', p_statut;
  end if;
  if p_origine is null or length(trim(p_origine)) = 0 then
    raise exception 'origine est obligatoire';
  end if;

  if not exists (
    select 1 from public.garages where id = p_garage_id and owner_user_id = auth.uid()
  ) then
    raise exception 'Accès refusé au garage %', p_garage_id;
  end if;

  if not exists (
    select 1 from public.clients where id = p_client_id and garage_id = p_garage_id
  ) then
    raise exception 'Client % n''appartient pas au garage %', p_client_id, p_garage_id;
  end if;

  if p_travail_differe_id is not null and not exists (
    select 1 from public.travaux_differes where id = p_travail_differe_id and garage_id = p_garage_id
  ) then
    raise exception 'travail_differe_id % n''appartient pas au garage %', p_travail_differe_id, p_garage_id;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_garage_id::text || ':' || p_client_id::text || ':' || p_canal, 0)
  );

  select statut into v_actuel
  from public.revenue_recovery_permissions_courant
  where garage_id = p_garage_id and client_id = p_client_id and canal = p_canal;

  if v_actuel.statut is null then
    v_actuel.statut := 'inconnu';
  end if;

  if p_statut = 'inconnu' and v_actuel.statut <> 'inconnu' then
    raise exception 'Transition refusée : impossible de revenir à "inconnu" depuis "%"', v_actuel.statut;
  end if;

  if p_statut = 'autorise' then
    if p_base_eligibilite is null or length(trim(p_base_eligibilite)) = 0
       or p_preuve_reference is null or length(trim(p_preuve_reference)) = 0 then
      raise exception 'Transition refusée : "autorise" exige base_eligibilite et preuve_reference';
    end if;

    if v_actuel.statut in ('oppose', 'expire', 'revoque') then
      -- Comparaison contre la DERNIÈRE ligne "autorise" réelle, retrouvée
      -- par le même ordre total que la vue (created_at desc, numero_sequence
      -- desc) — jamais par id, qui ne reflète pas l'ordre réel d'écriture.
      select preuve_reference into v_derniere_autorisation
      from public.revenue_recovery_permissions
      where garage_id = p_garage_id and client_id = p_client_id and canal = p_canal
        and statut = 'autorise'
      order by created_at desc, numero_sequence desc
      limit 1;

      if v_derniere_autorisation.preuve_reference is not null
         and p_preuve_reference is not distinct from v_derniere_autorisation.preuve_reference then
        raise exception 'Transition refusée : une nouvelle autorisation après "%" exige une preuve distincte de la dernière autorisation (pas de la ligne d''opposition, qui n''en porte pas)', v_actuel.statut;
      end if;
    end if;
  end if;

  insert into public.revenue_recovery_permissions
    (garage_id, client_id, travail_differe_id, canal, statut, base_eligibilite, origine, preuve_reference, motif)
  values
    (p_garage_id, p_client_id, p_travail_differe_id, p_canal, p_statut, p_base_eligibilite, p_origine, p_preuve_reference, p_motif)
  returning * into v_row;
  -- enregistre_par/created_at restent forcés par le trigger existant sur la
  -- table ; numero_sequence est alimenté automatiquement par l'identité,
  -- jamais fourni ni contrôlable ici.

  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revenue_recovery_evenements_forcer_identite()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.acteur := auth.uid();
  new.created_at := now();
  if new.travail_differe_id is null then
    raise exception 'travail_differe_id est obligatoire à la création d''un événement';
  end if;
  if not exists (
    select 1 from public.travaux_differes
    where id = new.travail_differe_id and garage_id = new.garage_id
  ) then
    raise exception 'travail_differe_id % n''appartient pas au garage %', new.travail_differe_id, new.garage_id;
  end if;
  if new.brouillon_id is not null and not exists (
    select 1 from public.revenue_recovery_brouillons
    where id = new.brouillon_id and garage_id = new.garage_id
  ) then
    raise exception 'brouillon_id % n''appartient pas au garage %', new.brouillon_id, new.garage_id;
  end if;
  if new.tentative_id is not null and not exists (
    select 1 from public.revenue_recovery_tentatives
    where id = new.tentative_id and garage_id = new.garage_id
  ) then
    raise exception 'tentative_id % n''appartient pas au garage %', new.tentative_id, new.garage_id;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revenue_recovery_garages_autorises_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revenue_recovery_marquer_tentative(p_tentative_id uuid, p_statut text, p_erreur text DEFAULT NULL::text)
 RETURNS revenue_recovery_tentatives
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tentative public.revenue_recovery_tentatives;
begin
  if p_statut not in ('envoyee', 'echec') then
    raise exception 'Statut cible invalide : % (seuls envoyee/echec sont atteignables depuis cette fonction)', p_statut;
  end if;

  -- Verrou de ligne : sérialise deux appels concurrents sur la même
  -- tentative (ex. retry réseau qui se chevauche avec le traitement
  -- original) — l'un des deux échouera sur la vérification de statut
  -- ci-dessous plutôt que de créer un état incohérent.
  select * into v_tentative
  from public.revenue_recovery_tentatives
  where id = p_tentative_id
  for update;

  if not found then
    raise exception 'Tentative % introuvable', p_tentative_id;
  end if;

  -- SECURITY DEFINER contourne le RLS : la vérification d'appartenance au
  -- garage de l'appelant doit donc être refaite explicitement ici.
  if not exists (
    select 1 from public.garages
    where id = v_tentative.garage_id and owner_user_id = auth.uid()
  ) then
    raise exception 'Accès refusé à la tentative %', p_tentative_id;
  end if;

  -- Transition autorisée uniquement depuis en_preparation : un état
  -- terminal (envoyee/echec) ne peut plus être modifié, même vers lui-même.
  if v_tentative.statut <> 'en_preparation' then
    raise exception 'Transition refusée : tentative % déjà au statut définitif %', p_tentative_id, v_tentative.statut;
  end if;

  update public.revenue_recovery_tentatives
  set statut = p_statut, erreur = p_erreur
  where id = p_tentative_id
  returning * into v_tentative;

  -- Le journal d'événements est mis à jour dans la même transaction que le
  -- changement de statut : jamais désynchronisé, jamais oublié par un futur
  -- appelant. Le trigger existant sur revenue_recovery_evenements force de
  -- toute façon acteur/created_at et revérifie la cohérence garage.
  insert into public.revenue_recovery_evenements
    (garage_id, travail_differe_id, tentative_id, type_evenement, detail)
  values (
    v_tentative.garage_id,
    v_tentative.travail_differe_id,
    v_tentative.id,
    case when p_statut = 'envoyee' then 'envoi_reussi' else 'envoi_echec' end,
    p_erreur
  );

  return v_tentative;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revenue_recovery_permissions_forcer_identite()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.enregistre_par := auth.uid();
  new.created_at := now();
  -- Cohérence inter-garages : le RLS vérifie que garage_id appartient à
  -- l'appelant, mais ne vérifie pas que travail_differe_id référence bien
  -- un travail différé du MÊME garage. Sans ce contrôle, un client_id et
  -- un garage_id valides pourraient être associés à un travail différé
  -- d'un autre garage.
  if new.travail_differe_id is not null then
    if not exists (
      select 1 from public.travaux_differes
      where id = new.travail_differe_id and garage_id = new.garage_id
    ) then
      raise exception 'travail_differe_id % n''appartient pas au garage %', new.travail_differe_id, new.garage_id;
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revenue_recovery_tentatives_forcer_identite()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.cree_par := auth.uid();
  new.created_at := now();
  if new.travail_differe_id is null then
    raise exception 'travail_differe_id est obligatoire à la création d''une tentative';
  end if;
  if not exists (
    select 1 from public.travaux_differes
    where id = new.travail_differe_id and garage_id = new.garage_id
  ) then
    raise exception 'travail_differe_id % n''appartient pas au garage %', new.travail_differe_id, new.garage_id;
  end if;
  if new.brouillon_id is not null and not exists (
    select 1 from public.revenue_recovery_brouillons
    where id = new.brouillon_id and garage_id = new.garage_id
  ) then
    raise exception 'brouillon_id % n''appartient pas au garage %', new.brouillon_id, new.garage_id;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revoquer_jeton_atelier(p_rdv_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_garage_id uuid;
begin
  select rv.garage_id into v_garage_id
  from public.rendez_vous rv
  join public.garages g on g.id = rv.garage_id
  where rv.id = p_rdv_id and g.owner_user_id = auth.uid()
  for update of rv;

  if v_garage_id is null then
    raise exception 'Rendez-vous introuvable ou accès refusé';
  end if;

  update public.atelier_jetons
    set revoked_at = now()
    where rendez_vous_id = p_rdv_id and revoked_at is null;

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revoquer_jeton_devis(p_devis_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_garage_id uuid;
begin
  select d.garage_id into v_garage_id
  from public.devis d
  join public.garages g on g.id = d.garage_id
  where d.id = p_devis_id and g.owner_user_id = auth.uid()
  for update of d;

  if v_garage_id is null then
    raise exception 'Devis introuvable ou accès refusé';
  end if;

  update public.devis_jetons
    set revoked_at = now()
    where devis_id = p_devis_id and revoked_at is null;

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revoquer_jeton_facture(p_facture_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_garage_id uuid;
begin
  select f.garage_id into v_garage_id
  from public.factures f
  join public.garages g on g.id = f.garage_id
  where f.id = p_facture_id and g.owner_user_id = auth.uid()
  for update of f;

  if v_garage_id is null then
    raise exception 'Facture introuvable ou accès refusé';
  end if;

  update public.factures_jetons
    set revoked_at = now()
    where facture_id = p_facture_id and revoked_at is null;

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.revoquer_jeton_inspection(p_inspection_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_garage_id uuid;
begin
  select i.garage_id into v_garage_id
  from inspections i
  join garages g on g.id = i.garage_id
  where i.id = p_inspection_id and g.owner_user_id = auth.uid();

  if v_garage_id is null then
    raise exception 'Inspection introuvable ou accès refusé';
  end if;

  update inspections_jetons
    set revoked_at = now()
    where inspection_id = p_inspection_id and revoked_at is null;

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_stripe_secret_key(p_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare v_garage_id uuid; begin select id into v_garage_id from garages where owner_user_id = auth.uid(); if v_garage_id is null then raise exception 'Aucun garage associe a cet utilisateur'; end if; insert into garages_secrets (garage_id, stripe_secret_key, updated_at) values (v_garage_id, p_key, now()) on conflict (garage_id) do update set stripe_secret_key = excluded.stripe_secret_key, updated_at = now(); end; $function$;

CREATE OR REPLACE FUNCTION public.stripe_configure_pour_mon_garage()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select exists (select 1 from garages_secrets gs join garages g on g.id = gs.garage_id where g.owner_user_id = auth.uid() and gs.stripe_secret_key is not null and gs.stripe_secret_key != ''); $function$;

CREATE OR REPLACE FUNCTION public.travaux_differes_log_historique()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if (tg_op = 'UPDATE') and (
    new.statut is distinct from old.statut
    or new.date_relance is distinct from old.date_relance
  ) then
    insert into public.travaux_differes_historique (
      travail_id, garage_id, ancien_statut, nouveau_statut,
      ancienne_date_relance, nouvelle_date_relance
    ) values (
      new.id, new.garage_id, old.statut, new.statut,
      old.date_relance, new.date_relance
    );
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.travaux_differes_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;
