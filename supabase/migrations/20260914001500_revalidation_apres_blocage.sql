-- Une ligne bloquée peut être revalidée.
--
-- Quand un devis change après validation, la réservation le met en `bloque` et
-- demande une nouvelle décision. Encore faut-il pouvoir la prendre :
-- `autoriser_envoi_*` ne regardait que les lignes `sans_lien`, si bien qu'un
-- blocage était définitif. On accepte donc aussi `bloque` — c'est exactement
-- le geste attendu du garage : il a vu le motif, il revalide en connaissance
-- de cause, avec l'empreinte et le destinataire du moment.

create or replace function public.autoriser_envoi_devis(p_devis_id uuid, p_destinataire text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_garage_id uuid; v_client_email text; v_token text; v_deja uuid; v_notif uuid;
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
  if lower(trim(p_destinataire)) is distinct from lower(trim(v_client_email)) then
    return jsonb_build_object('ok', false, 'raison', 'destinataire_different');
  end if;

  select n.id into v_deja from public.notifications_devis n
   where n.devis_id = p_devis_id and n.statut in ('en_attente', 'envoi_en_cours')
   order by n.created_at desc limit 1 for update;
  if v_deja is not null then
    return jsonb_build_object('ok', true, 'deja_autorise', true, 'notification', v_deja);
  end if;

  select n.id into v_notif from public.notifications_devis n
   where n.devis_id = p_devis_id and n.statut in ('sans_lien', 'bloque') and n.envoye = false
   order by n.created_at desc limit 1 for update;
  if v_notif is null then
    return jsonb_build_object('ok', false, 'raison', 'aucune_notification_en_attente');
  end if;

  v_token := public.creer_jeton_devis(p_devis_id);
  update public.notifications_devis
     set jeton = v_token, statut = 'en_attente', derniere_erreur = null,
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
declare v_garage_id uuid; v_client_email text; v_token text; v_deja uuid; v_notif uuid;
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
   where n.facture_id = p_facture_id and n.statut in ('sans_lien', 'bloque') and n.envoye = false
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

revoke execute on function public.autoriser_envoi_devis(uuid, text) from public, anon;
grant execute on function public.autoriser_envoi_devis(uuid, text) to authenticated;
revoke execute on function public.autoriser_envoi_facture(uuid, text) from public, anon;
grant execute on function public.autoriser_envoi_facture(uuid, text) to authenticated;
