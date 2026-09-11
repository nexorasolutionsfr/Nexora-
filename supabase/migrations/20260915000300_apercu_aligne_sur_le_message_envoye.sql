-- L'aperçu montré au garage dit exactement ce que le client recevra.
--
-- CE QUI ÉTAIT FAUX (relevé du 12 septembre 2026, sur la définition vivante
-- du workflow « Nouveau devis (socle) »)
--
-- Le traitement ne passe pas par `apercu_message_devis` : il reconstruit le
-- texte dans un nœud de code. Les deux textes ne disaient pas la même chose —
-- le message envoyé porte l'immatriculation et écrit « pour votre <véhicule> »,
-- l'aperçu ni l'un ni l'autre. Un garage validait donc un texte légèrement
-- différent de celui reçu.
--
-- Cette migration aligne l'aperçu sur le message réellement envoyé, mot pour
-- mot. Elle ne touche pas au traitement : `apercu_message_devis` n'est appelée
-- que par l'application. Tant que les deux textes vivent à deux endroits, ils
-- peuvent redivorcer : la suite est de faire composer le message par cette
-- fonction, côté traitement — chantier distinct.

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
  v_montant numeric; v_url text; v_lien text; v_sujet text; v_texte text;
begin
  select d.garage_id, d.montant_ttc,
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
