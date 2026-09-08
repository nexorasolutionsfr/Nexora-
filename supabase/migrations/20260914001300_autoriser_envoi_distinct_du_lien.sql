-- Créer un lien n'est pas autoriser un envoi.
--
-- CE QUI ÉTAIT FAUX
--
-- La migration 20260914001200 armait la notification depuis
-- `creer_jeton_devis`. Or l'application appelle cette fonction pour
-- « Générer le lien » et pour « Copier le lien » — des gestes de consultation.
-- Ouvrir un aperçu pouvait donc rendre une notification envoyable, et le
-- message partait sans que personne ne l'ait demandé. C'était une confusion
-- de ma part entre produire un lien et décider d'écrire au client.
--
-- CE QUE FAIT CETTE MIGRATION
--
-- 1. `creer_jeton_devis` et `creer_jeton_facture` redeviennent inoffensives :
--    elles produisent un lien, rien d'autre. Plusieurs liens valides,
--    expiration propre à chacun, révocation explicite : inchangés.
-- 2. Une opération dédiée autorise l'envoi : `autoriser_envoi_devis` et
--    `autoriser_envoi_facture`. C'est le seul chemin qui rend une notification
--    envoyable. La séparation est en base, pas dans le libellé d'un bouton.
-- 3. L'autorisation porte sur **ce qui a été montré** : le destinataire
--    affiché et la version du document. Les deux sont enregistrés sur la
--    ligne de file ; le traitement refuse d'envoyer si l'un a changé depuis.
--    Un devis modifié après validation ne part pas en silence.
-- 4. `etat_envoi_devis` permet à l'interface de dire « en attente d'envoi »
--    plutôt que « envoyé » : la file est verrouillée, l'application ne peut
--    pas la lire directement.
--
-- L'acceptation du devis par le client reste un tout autre geste, ailleurs.

alter table public.notifications_devis    add column if not exists destinataire_valide text;
alter table public.notifications_devis    add column if not exists empreinte_document text;
alter table public.notifications_factures add column if not exists destinataire_valide text;
alter table public.notifications_factures add column if not exists empreinte_document text;

comment on column public.notifications_devis.destinataire_valide is
  'Adresse montrée au garage au moment où il a autorisé l''envoi. Le traitement refuse d''écrire ailleurs.';
comment on column public.notifications_devis.empreinte_document is
  'Empreinte de la version du document autorisée. Si elle change, l''envoi est bloqué plutôt que silencieusement différent.';

-- L'empreinte : ce qui, s'il change, change le message reçu par le client.
create or replace function public.empreinte_devis(p_devis_id uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select encode(extensions.digest(
    coalesce(d.montant_ht::text,'') || '|' || coalesce(d.montant_ttc::text,'') || '|' ||
    coalesce(d.statut,'') || '|' || coalesce(d.prestation_id::text,'') || '|' ||
    coalesce(d.vehicule_id::text,'') || '|' || coalesce(d.client_id::text,''), 'sha256'), 'hex')
  from public.devis d where d.id = p_devis_id;
$function$;

create or replace function public.empreinte_facture(p_facture_id uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select encode(extensions.digest(
    coalesce(f.numero,'') || '|' || coalesce(f.montant_ht::text,'') || '|' ||
    coalesce(f.montant_ttc::text,'') || '|' || coalesce(f.statut,'') || '|' ||
    coalesce(f.vehicule_id::text,'') || '|' || coalesce(f.client_id::text,''), 'sha256'), 'hex')
  from public.factures f where f.id = p_facture_id;
$function$;

-- 1. Les fonctions de lien : plus aucun effet de bord.
create or replace function public.creer_jeton_devis(p_devis_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare v_garage_id uuid; v_token text;
begin
  select d.garage_id into v_garage_id from public.devis d where d.id = p_devis_id for update of d;
  if v_garage_id is null or not public.a_acces_garage(v_garage_id, 'dirigeant', 'accueil') then
    raise exception 'Devis introuvable ou accès refusé';
  end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.devis_jetons (devis_id, garage_id, jeton_hash, expires_at)
  values (p_devis_id, v_garage_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '90 days');
  return v_token;
end;
$function$;

create or replace function public.creer_jeton_facture(p_facture_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare v_garage_id uuid; v_token text;
begin
  select f.garage_id into v_garage_id from public.factures f where f.id = p_facture_id for update of f;
  if v_garage_id is null or not public.a_acces_garage(v_garage_id, 'dirigeant') then
    raise exception 'Facture introuvable ou accès refusé';
  end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.factures_jetons (facture_id, garage_id, jeton_hash, expires_at)
  values (p_facture_id, v_garage_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '90 days');
  return v_token;
end;
$function$;

-- 2. L'autorisation d'envoi, seul chemin vers une notification envoyable.
create or replace function public.autoriser_envoi_devis(p_devis_id uuid, p_destinataire text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_garage_id uuid; v_client_email text; v_token text; v_deja uuid; v_notif uuid;
begin
  select d.garage_id, c.email into v_garage_id, v_client_email
  from public.devis d left join public.clients c on c.id = d.client_id
  where d.id = p_devis_id for update of d;

  if v_garage_id is null or not public.a_acces_garage(v_garage_id, 'dirigeant', 'accueil') then
    raise exception 'Devis introuvable ou accès refusé';
  end if;

  if coalesce(nullif(trim(v_client_email), ''), '') = '' then
    return jsonb_build_object('ok', false, 'raison', 'destinataire_absent');
  end if;

  -- L'autorisation porte sur l'adresse qui a été montrée.
  if lower(trim(p_destinataire)) is distinct from lower(trim(v_client_email)) then
    return jsonb_build_object('ok', false, 'raison', 'destinataire_different');
  end if;

  -- Un envoi déjà autorisé et non traité : on ne recommence pas. Le double
  -- clic et deux appels simultanés retombent ici.
  select n.id into v_deja from public.notifications_devis n
   where n.devis_id = p_devis_id and n.statut in ('en_attente', 'envoi_en_cours')
   order by n.created_at desc limit 1
   for update;
  if v_deja is not null then
    return jsonb_build_object('ok', true, 'deja_autorise', true, 'notification', v_deja);
  end if;

  select n.id into v_notif from public.notifications_devis n
   where n.devis_id = p_devis_id and n.statut = 'sans_lien'
   order by n.created_at desc limit 1
   for update;
  if v_notif is null then
    return jsonb_build_object('ok', false, 'raison', 'aucune_notification_en_attente');
  end if;

  v_token := public.creer_jeton_devis(p_devis_id);

  update public.notifications_devis
     set jeton = v_token,
         statut = 'en_attente',
         destinataire_valide = lower(trim(v_client_email)),
         empreinte_document = public.empreinte_devis(p_devis_id)
   where id = v_notif;

  return jsonb_build_object('ok', true, 'deja_autorise', false, 'notification', v_notif);
end;
$function$;

create or replace function public.autoriser_envoi_facture(p_facture_id uuid, p_destinataire text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_garage_id uuid; v_client_email text; v_token text; v_deja uuid; v_notif uuid;
begin
  select f.garage_id, c.email into v_garage_id, v_client_email
  from public.factures f left join public.clients c on c.id = f.client_id
  where f.id = p_facture_id for update of f;

  if v_garage_id is null or not public.a_acces_garage(v_garage_id, 'dirigeant') then
    raise exception 'Facture introuvable ou accès refusé';
  end if;
  if coalesce(nullif(trim(v_client_email), ''), '') = '' then
    return jsonb_build_object('ok', false, 'raison', 'destinataire_absent');
  end if;
  if lower(trim(p_destinataire)) is distinct from lower(trim(v_client_email)) then
    return jsonb_build_object('ok', false, 'raison', 'destinataire_different');
  end if;

  select n.id into v_deja from public.notifications_factures n
   where n.facture_id = p_facture_id and n.statut in ('en_attente', 'envoi_en_cours')
   order by n.created_at desc limit 1 for update;
  if v_deja is not null then
    return jsonb_build_object('ok', true, 'deja_autorise', true, 'notification', v_deja);
  end if;

  select n.id into v_notif from public.notifications_factures n
   where n.facture_id = p_facture_id and n.statut = 'sans_lien'
   order by n.created_at desc limit 1 for update;
  if v_notif is null then
    return jsonb_build_object('ok', false, 'raison', 'aucune_notification_en_attente');
  end if;

  v_token := public.creer_jeton_facture(p_facture_id);
  update public.notifications_factures
     set jeton = v_token, statut = 'en_attente',
         destinataire_valide = lower(trim(v_client_email)),
         empreinte_document = public.empreinte_facture(p_facture_id)
   where id = v_notif;

  return jsonb_build_object('ok', true, 'deja_autorise', false, 'notification', v_notif);
end;
$function$;

revoke execute on function public.autoriser_envoi_devis(uuid, text) from public, anon;
grant execute on function public.autoriser_envoi_devis(uuid, text) to authenticated;
revoke execute on function public.autoriser_envoi_facture(uuid, text) from public, anon;
grant execute on function public.autoriser_envoi_facture(uuid, text) to authenticated;

-- 3. L'état d'envoi, pour que l'interface dise la vérité.
create or replace function public.etat_envoi_devis(p_devis_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v_garage_id uuid; v_n record;
begin
  select d.garage_id into v_garage_id from public.devis d where d.id = p_devis_id;
  if v_garage_id is null or not public.a_acces_garage(v_garage_id, 'dirigeant', 'accueil') then
    return jsonb_build_object('ok', false, 'raison', 'acces_refuse');
  end if;
  select n.statut, n.envoye, n.tentatives, n.derniere_erreur, n.destinataire_valide
    into v_n
  from public.notifications_devis n where n.devis_id = p_devis_id
  order by n.created_at desc limit 1;
  if not found then
    return jsonb_build_object('ok', true, 'etat', 'aucune');
  end if;
  return jsonb_build_object(
    'ok', true,
    'etat', case v_n.statut
              when 'sans_lien'      then 'a_valider'
              when 'en_attente'     then 'en_attente_envoi'
              when 'envoi_en_cours' then 'envoi_en_cours'
              when 'envoye'         then 'envoye'
              when 'bloque'         then 'bloque'
              else v_n.statut end,
    'destinataire', v_n.destinataire_valide,
    'tentatives', v_n.tentatives,
    'motif', v_n.derniere_erreur);
end;
$function$;

revoke execute on function public.etat_envoi_devis(uuid) from public, anon;
grant execute on function public.etat_envoi_devis(uuid) to authenticated;
