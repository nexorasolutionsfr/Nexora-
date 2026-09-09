-- Un seul endroit construit le message du devis.
--
-- L'aperçu montré au garagiste et l'e-mail réellement envoyé étaient écrits à
-- deux endroits — l'écran d'un côté, le code d'un nœud n8n de l'autre. Deux
-- textes qui divergent, c'est un garage qui valide un message et son client
-- qui en reçoit un autre.
--
-- `apercu_message_devis` construit le texte, et **les deux** s'en servent :
-- l'écran pour l'aperçu, le traitement pour l'envoi. Le jeton est passé en
-- argument : sans lui, l'aperçu montre l'adresse publique suivie de « … »,
-- puisque le lien n'existe pas encore. Le message reste identique par
-- ailleurs — c'est bien le même texte qui sera reçu.
--
-- Accès : les rôles autorisés du garage pour l'aperçu ; le traitement interne
-- (sans session) pour l'envoi. On ne simule aucune identité : quand
-- `auth.uid()` est nul, l'appelant est déjà un rôle de service, qui lit ces
-- tables de toute façon.

create or replace function public.apercu_message_devis(p_devis_id uuid, p_jeton text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_garage_id uuid; v_type text;
  v_nom_client text; v_email text; v_nom_garage text; v_vehicule text;
  v_montant numeric; v_url text; v_lien text; v_sujet text; v_texte text;
begin
  select d.garage_id, d.montant_ttc,
         coalesce(c.nom, ''), coalesce(c.email, ''),
         coalesce(g.nom_garage, 'Votre garage'),
         trim(coalesce(v.marque, '') || ' ' || coalesce(v.modele, ''))
    into v_garage_id, v_montant, v_nom_client, v_email, v_nom_garage, v_vehicule
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
    v_texte := 'Bonjour ' || v_nom_client || E',\n\nVotre devis pour ' || v_vehicule ||
               ' (' || v_montant || E' € TTC) a bien été confirmé. Nous vous contacterons pour planifier l''intervention.\n\nÀ bientôt,\n' || v_nom_garage;
  elsif v_type = 'refuse' then
    v_sujet := 'À propos de votre devis';
    v_texte := 'Bonjour ' || v_nom_client || E',\n\nVotre devis pour ' || v_vehicule ||
               E' n''a pas été confirmé. N''hésitez pas à nous recontacter si vous souhaitez en discuter.\n\n' || v_nom_garage;
  else
    v_sujet := 'Un devis vous attend';
    v_texte := 'Bonjour ' || v_nom_client || E',\n\n' || v_nom_garage || ' vous propose un devis pour ' ||
               v_vehicule || ' : ' || v_montant || E' €.\n\nPour accepter ou refuser ce devis, cliquez ici : ' ||
               v_lien || E'\n\nÀ bientôt,\n' || v_nom_garage;
  end if;

  return jsonb_build_object('ok', true, 'type', v_type, 'destinataire', v_email,
                            'sujet', v_sujet, 'texte', v_texte, 'garage', v_nom_garage);
end;
$function$;

revoke execute on function public.apercu_message_devis(uuid, text) from public, anon;
grant execute on function public.apercu_message_devis(uuid, text) to authenticated, service_role;
