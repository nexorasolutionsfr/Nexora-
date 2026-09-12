-- Une facture créée n'est pas une facture envoyée.
--
-- CE QUI ÉTAIT FAUX (dette laissée ouverte par la PR #82, 12 septembre 2026)
--
-- `notifier_nouvelle_facture` produisait un jeton et mettait la notification
-- en `en_attente` dès que le garage cliquait « Générer la facture ». Le
-- traitement « Facture (socle) » réserve toute ligne `en_attente` : le
-- message partait au client dans les deux minutes, sans que le garage ait vu
-- le destinataire ni le texte, et sans aucun geste d'envoi — l'écran Factures
-- n'en proposait pas. Le devis a été corrigé le 15 (`20260915000100`) ; la
-- facture gardait exactement ce défaut.
--
-- CE QUE FAIT CETTE MIGRATION
--
-- 1. La notification de facture naît toujours `sans_lien`, sans jeton.
--    `autoriser_envoi_facture` reste le seul chemin vers un envoi.
-- 2. `apercu_message_facture` compose le message **tel que le traitement
--    l'écrit** (relevé sur la définition vivante du workflow « Facture
--    (socle) », nœud « Construire le message », le 12 septembre 2026) : même
--    objet, même texte, mêmes repli quand un nom manque. L'écran relit ce qui
--    partira, au lien près, qui n'existe qu'au moment de l'envoi.
-- 3. `etat_envoi_facture` dit la vérité de la file à l'écran, comme
--    `etat_envoi_devis` : à valider, en attente, envoi à vérifier, envoyé,
--    bloqué. Seules les notifications de type `nouvelle` comptent — la
--    confirmation de paiement (`payee`) est une autre file, non concernée.
-- 4. Le montant s'écrit comme le traitement l'écrit. Le nœud n8n reçoit le
--    montant en nombre JSON et l'interpole en JavaScript : `144`, pas
--    `144.00`. L'aperçu SQL concaténait le `numeric` : « 144.00 € ». Vérifié
--    sur l'exécution réelle du 12 septembre à 00:04 (« 144 € » reçu) contre
--    l'aperçu du même devis (« 144.00 € »). `montant_comme_le_traitement`
--    écrit le nombre comme JavaScript le fait, et `apercu_message_devis`
--    l'emploie désormais aussi : ce qui est relu est ce qui part, au chiffre
--    près.
-- 5. Droits : dirigeant et accueil peuvent préparer et autoriser l'envoi
--    d'une facture, comme pour un devis. Mécanicien, membre révoqué et
--    autre garage sont refusés par `a_acces_garage`, en base — jamais par
--    un libellé de bouton. `creer_jeton_facture` suit, puisque l'autorisation
--    produit le jeton.
--
-- CE QU'ELLE NE FAIT PAS
--
-- Les notifications de factures déjà en file ne sont pas touchées, ni armées
-- ni retirées : les retirer reviendrait à décider à la place des garages
-- concernés. Rien n'est envoyé par cette migration. Le traitement n8n n'est
-- pas modifié.

-- 1. Le déclencheur : une notification qui existe, mais que rien ne peut
--    envoyer tant que le garage ne l'a pas décidé.
create or replace function public.notifier_nouvelle_facture()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into notifications_factures (facture_id, type, statut)
  values (new.id, 'nouvelle', 'sans_lien');
  return new;
end;
$function$;

-- 2. Le montant comme le traitement l'écrit.
--
-- PostgREST sérialise un `numeric` en nombre JSON ; le nœud de code n8n
-- l'interpole avec `${facture.montant_ttc}`. JavaScript n'écrit ni zéro
-- inutile ni point final : 144.00 → « 144 », 144.50 → « 144.5 », 100 → « 100 ».
create or replace function public.montant_comme_le_traitement(p_montant numeric)
returns text
language sql
immutable
set search_path to ''
as $function$
  select case
    when p_montant is null then ''
    when p_montant::text like '%.%' then rtrim(rtrim(p_montant::text, '0'), '.')
    else p_montant::text
  end;
$function$;

revoke execute on function public.montant_comme_le_traitement(numeric) from public, anon;
grant execute on function public.montant_comme_le_traitement(numeric) to authenticated, service_role;

-- 3. L'aperçu du devis écrit le montant comme le message envoyé.
--    Texte inchangé par ailleurs (20260915000300).
create or replace function public.apercu_message_devis(p_devis_id uuid, p_jeton text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_garage_id uuid; v_type text;
  v_nom_client text; v_email text; v_nom_garage text; v_vehicule text; v_immat text;
  v_montant text; v_url text; v_lien text; v_sujet text; v_texte text;
begin
  select d.garage_id, public.montant_comme_le_traitement(d.montant_ttc),
         coalesce(c.nom, ''), coalesce(c.email, ''),
         coalesce(g.nom_garage, 'Votre garage'),
         trim(coalesce(v.marque, '') || ' ' || coalesce(v.modele, '')),
         case when coalesce(v.immatriculation, '') = '' then '' else ' (' || v.immatriculation || ')' end
    into v_garage_id, v_montant, v_nom_client, v_email, v_nom_garage, v_vehicule, v_immat
  from public.devis d
  left join public.clients c on c.id = d.client_id
  left join public.garages g on g.id = d.garage_id
  left join public.vehicules v on v.id = d.vehicule_id
  where d.id = p_devis_id;

  if v_garage_id is null then
    return jsonb_build_object('ok', false, 'raison', 'devis_introuvable');
  end if;
  if auth.uid() is not null and not public.a_acces_garage(v_garage_id, 'dirigeant', 'accueil') then
    return jsonb_build_object('ok', false, 'raison', 'acces_refuse');
  end if;

  select n.type into v_type from public.notifications_devis n
   where n.devis_id = p_devis_id and n.envoye = false
   order by n.created_at desc limit 1;
  v_type := coalesce(v_type, 'nouveau');

  select p.valeur into v_url from public.parametres_envois p where p.cle = 'url_publique';
  v_lien := coalesce(v_url, '') || '/devis/' || coalesce(p_jeton, '…');

  if v_type = 'accepte' then
    v_sujet := 'Votre devis a été confirmé';
    v_texte := 'Bonjour ' || v_nom_client || E',\n\nVotre devis pour ' || v_vehicule || v_immat ||
               ' (' || v_montant || E' € TTC) a bien été confirmé. Nous vous contacterons pour planifier l''intervention.\n\nÀ bientôt,\n' || v_nom_garage;
  elsif v_type = 'refuse' then
    v_sujet := 'À propos de votre devis';
    v_texte := 'Bonjour ' || v_nom_client || E',\n\nVotre devis pour ' || v_vehicule || v_immat ||
               E' n''a pas été confirmé. N''hésitez pas à nous recontacter si vous souhaitez en discuter.\n\n' || v_nom_garage;
  else
    v_sujet := 'Un devis vous attend';
    v_texte := 'Bonjour ' || v_nom_client || E',\n\n' || v_nom_garage || ' vous propose un devis pour votre ' ||
               v_vehicule || v_immat || ' : ' || v_montant || E' €.\n\nPour accepter ou refuser ce devis, cliquez ici : ' ||
               v_lien || E'\n\nÀ bientôt,\n' || v_nom_garage;
  end if;

  return jsonb_build_object('ok', true, 'type', v_type, 'destinataire', v_email,
                            'sujet', v_sujet, 'texte', v_texte, 'garage', v_nom_garage);
end;
$function$;

revoke execute on function public.apercu_message_devis(uuid, text) from public, anon;
grant execute on function public.apercu_message_devis(uuid, text) to authenticated, service_role;

-- 4. L'aperçu de la facture : le message du traitement, mot pour mot.
--
-- Relevé du nœud « Construire le message » de « Facture (socle) » :
--   nomAffiche  = (nom_garage || 'Votre garage') sans guillemets ni barres obliques inverses, rogné
--   nomVehicule = trim(marque + ' ' + modele)
--   immat       = immatriculation ? ' (' + immatriculation + ')' : ''
--   nouvelle    : objet « Votre facture <numéro> »
--                 « Bonjour <client>,⏎⏎<garage> vous transmet la facture <numéro> pour votre
--                   <véhicule><immat> : <montant> € TTC.⏎⏎Consultez le détail ici : <lien>⏎⏎À bientôt,⏎<nomAffiche> »
--   payee       : objet « Confirmation de paiement »
--                 « Bonjour <client>,⏎⏎Nous confirmons la bonne réception de votre paiement pour la facture
--                   <numéro> — votre <véhicule><immat> — d'un montant de <montant> € TTC.⏎⏎Merci de votre
--                   confiance,⏎L'équipe <garage ou « du garage »> »
create or replace function public.apercu_message_facture(
  p_facture_id uuid, p_jeton text default null, p_type text default 'nouvelle')
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_garage_id uuid;
  v_nom_client text; v_email text; v_nom_garage text; v_nom_affiche text;
  v_vehicule text; v_immat text; v_numero text; v_montant text;
  v_url text; v_lien text; v_sujet text; v_texte text;
begin
  if p_type not in ('nouvelle', 'payee') then
    return jsonb_build_object('ok', false, 'raison', 'type_inconnu');
  end if;

  select f.garage_id, coalesce(f.numero, ''), public.montant_comme_le_traitement(f.montant_ttc),
         coalesce(c.nom, ''), coalesce(c.email, ''),
         coalesce(nullif(g.nom_garage, ''), 'Votre garage'),
         trim(regexp_replace(coalesce(nullif(g.nom_garage, ''), 'Votre garage'), '["\\]', ' ', 'g')),
         trim(coalesce(v.marque, '') || ' ' || coalesce(v.modele, '')),
         case when coalesce(v.immatriculation, '') = '' then '' else ' (' || v.immatriculation || ')' end
    into v_garage_id, v_numero, v_montant, v_nom_client, v_email, v_nom_garage, v_nom_affiche, v_vehicule, v_immat
  from public.factures f
  left join public.clients c on c.id = f.client_id
  left join public.garages g on g.id = f.garage_id
  left join public.vehicules v on v.id = f.vehicule_id
  where f.id = p_facture_id;

  if v_garage_id is null then
    return jsonb_build_object('ok', false, 'raison', 'facture_introuvable');
  end if;
  if auth.uid() is not null and not public.a_acces_garage(v_garage_id, 'dirigeant', 'accueil') then
    return jsonb_build_object('ok', false, 'raison', 'acces_refuse');
  end if;

  select p.valeur into v_url from public.parametres_envois p where p.cle = 'url_publique';
  v_lien := coalesce(v_url, '') || '/facture/' || coalesce(p_jeton, '…');

  if p_type = 'payee' then
    v_sujet := 'Confirmation de paiement';
    v_texte := 'Bonjour ' || v_nom_client || E',\n\nNous confirmons la bonne réception de votre paiement pour la facture ' ||
               v_numero || ' — votre ' || v_vehicule || v_immat || ' — d''un montant de ' || v_montant ||
               E' € TTC.\n\nMerci de votre confiance,\nL''équipe ' ||
               coalesce(nullif(v_nom_garage, 'Votre garage'), 'du garage');
  else
    v_sujet := 'Votre facture ' || v_numero;
    v_texte := 'Bonjour ' || v_nom_client || E',\n\n' || v_nom_garage || ' vous transmet la facture ' || v_numero ||
               ' pour votre ' || v_vehicule || v_immat || ' : ' || v_montant ||
               E' € TTC.\n\nConsultez le détail ici : ' || v_lien || E'\n\nÀ bientôt,\n' || v_nom_affiche;
  end if;

  return jsonb_build_object('ok', true, 'type', p_type, 'destinataire', v_email,
                            'sujet', v_sujet, 'texte', v_texte, 'garage', v_nom_garage);
end;
$function$;

revoke execute on function public.apercu_message_facture(uuid, text, text) from public, anon;
grant execute on function public.apercu_message_facture(uuid, text, text) to authenticated, service_role;

-- 5. L'état d'envoi de la facture, pour que l'écran dise la vérité.
create or replace function public.etat_envoi_facture(p_facture_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v_garage_id uuid; v_n record;
begin
  select f.garage_id into v_garage_id from public.factures f where f.id = p_facture_id;
  if v_garage_id is null or not public.a_acces_garage(v_garage_id, 'dirigeant', 'accueil') then
    return jsonb_build_object('ok', false, 'raison', 'acces_refuse');
  end if;
  select n.statut, n.envoye, n.tentatives, n.derniere_erreur, n.destinataire_valide
    into v_n
  from public.notifications_factures n
  where n.facture_id = p_facture_id and n.type = 'nouvelle'
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

revoke execute on function public.etat_envoi_facture(uuid) from public, anon;
grant execute on function public.etat_envoi_facture(uuid) to authenticated;

-- 6. Le lien : dirigeant et accueil, comme pour le devis. Sans autre effet.
create or replace function public.creer_jeton_facture(p_facture_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare v_garage_id uuid; v_token text;
begin
  select f.garage_id into v_garage_id from public.factures f where f.id = p_facture_id for update of f;
  if v_garage_id is null or not public.a_acces_garage(v_garage_id, 'dirigeant', 'accueil') then
    raise exception 'Facture introuvable ou accès refusé';
  end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.factures_jetons (facture_id, garage_id, jeton_hash, expires_at)
  values (p_facture_id, v_garage_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '90 days');
  return v_token;
end;
$function$;

revoke execute on function public.creer_jeton_facture(uuid) from public, anon;
grant execute on function public.creer_jeton_facture(uuid) to authenticated;

-- 7. L'autorisation d'envoi : seul chemin vers une notification envoyable.
--    Ne regarde que la file `nouvelle` : une confirmation de paiement en
--    attente ne doit pas faire croire que la facture est déjà programmée.
create or replace function public.autoriser_envoi_facture(p_facture_id uuid, p_destinataire text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_garage_id uuid; v_client_email text; v_token text; v_deja uuid; v_notif uuid;
begin
  select f.garage_id, c.email into v_garage_id, v_client_email
  from public.factures f left join public.clients c on c.id = f.client_id
  where f.id = p_facture_id for update of f;

  if v_garage_id is null or not public.a_acces_garage(v_garage_id, 'dirigeant', 'accueil') then
    raise exception 'Facture introuvable ou accès refusé';
  end if;
  if coalesce(nullif(trim(v_client_email), ''), '') = '' then
    return jsonb_build_object('ok', false, 'raison', 'destinataire_absent');
  end if;
  if lower(trim(p_destinataire)) is distinct from lower(trim(v_client_email)) then
    return jsonb_build_object('ok', false, 'raison', 'destinataire_different');
  end if;

  -- Un envoi déjà autorisé et non traité : on ne recommence pas. Le double
  -- clic et deux appels simultanés retombent ici.
  select n.id into v_deja from public.notifications_factures n
   where n.facture_id = p_facture_id and n.type = 'nouvelle'
     and n.statut in ('en_attente', 'envoi_en_cours')
   order by n.created_at desc limit 1 for update;
  if v_deja is not null then
    return jsonb_build_object('ok', true, 'deja_autorise', true, 'notification', v_deja);
  end if;

  select n.id into v_notif from public.notifications_factures n
   where n.facture_id = p_facture_id and n.type = 'nouvelle'
     and n.statut in ('sans_lien', 'bloque') and n.envoye = false
   order by n.created_at desc limit 1 for update;
  if v_notif is null then
    return jsonb_build_object('ok', false, 'raison', 'aucune_notification_en_attente');
  end if;

  v_token := public.creer_jeton_facture(p_facture_id);
  update public.notifications_factures
     set jeton = v_token, statut = 'en_attente', derniere_erreur = null,
         destinataire_valide = lower(trim(v_client_email)),
         empreinte_document = public.empreinte_facture(p_facture_id)
   where id = v_notif;
  return jsonb_build_object('ok', true, 'deja_autorise', false, 'notification', v_notif);
end;
$function$;

revoke execute on function public.autoriser_envoi_facture(uuid, text) from public, anon;
grant execute on function public.autoriser_envoi_facture(uuid, text) to authenticated;
