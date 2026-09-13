-- La réservation refuse ce qui a changé depuis la validation.
--
-- Suite de 20260918000500. `reserver_notifications` écartait déjà, pour le
-- devis et la facture, une autorisation dont le document ou le destinataire
-- avait changé. La file `atelier` gagne la même garde, plus une troisième
-- raison qui lui est propre : la voiture n'est plus prête.
--
-- Les trois cas mettent la ligne de côté avec un motif distinct, que l'écran
-- sait traduire. La revalidation passe par `autoriser_envoi_atelier` — jamais
-- automatiquement.
--
-- Le reste de la fonction est inchangé.

CREATE OR REPLACE FUNCTION public.reserver_notifications(p_file text, p_limite integer DEFAULT 10, p_garages uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(id uuid, doc_id uuid, jeton text, type text, url_publique text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_table text; v_jointure text; v_url text;
begin
  if p_file not in ('devis', 'factures', 'proposition', 'atelier') then
    raise exception 'File inconnue : %', p_file;
  end if;
  if p_limite is null or p_limite < 1 or p_limite > 200 then
    raise exception 'Limite hors bornes';
  end if;

  select p.valeur into v_url from public.parametres_envois p where p.cle = 'url_publique';
  if v_url is null then
    raise exception 'Réglage url_publique absent : aucun lien ne peut être construit';
  end if;

  -- Les files qui portent une autorisation : on écarte ce qui a bougé depuis,
  -- sans sortir des garages demandés.
  if p_file = 'devis' then
    update public.notifications_devis n
       set statut = 'bloque',
           derniere_erreur = 'le devis ou le destinataire a changé depuis la validation : nouvelle validation nécessaire'
      from public.devis d left join public.clients c on c.id = d.client_id
     where d.id = n.devis_id
       and (p_garages is null or d.garage_id = any(p_garages))
       and n.statut = 'en_attente'
       and n.empreinte_document is not null
       and (n.empreinte_document is distinct from public.empreinte_devis(d.id)
            or n.destinataire_valide is distinct from lower(trim(coalesce(c.email, ''))));
  elsif p_file = 'factures' then
    update public.notifications_factures n
       set statut = 'bloque',
           derniere_erreur = 'la facture ou le destinataire a changé depuis la validation : nouvelle validation nécessaire'
      from public.factures f left join public.clients c on c.id = f.client_id
     where f.id = n.facture_id
       and (p_garages is null or f.garage_id = any(p_garages))
       and n.statut = 'en_attente'
       and n.empreinte_document is not null
       and (n.empreinte_document is distinct from public.empreinte_facture(f.id)
            or n.destinataire_valide is distinct from lower(trim(coalesce(c.email, ''))));
  elsif p_file = 'atelier' then
    -- TROIS RAISONS DE NE PAS EXPÉDIER CE QUI A ÉTÉ VALIDÉ
    --
    -- 1. Le message a changé — le client, la voiture, la plaque, le garage ou
    --    le lien de paiement ne sont plus ceux que le garage avait sous les
    --    yeux. L'empreinte le dit. Même garde que pour le devis et la facture.
    -- 2. Le destinataire a changé. On n'écrit pas à quelqu'un d'autre.
    -- 3. La voiture n'est plus prête. Elle est repassée en intervention parce
    --    qu'un défaut est apparu : « venez la chercher » serait faux, et le
    --    client ferait le déplacement pour rien.
    --
    -- Dans les trois cas la ligne est mise de côté et REVALIDÉE À LA MAIN, par
    -- `autoriser_envoi_atelier`. Rien ne se réarme tout seul.
    --
    -- `destinataire_valide` et `empreinte_document` ne sont PAS réécrits : ils
    -- disent ce que le garage avait validé. Les écraser effacerait la preuve,
    -- et la revalidation porterait sur un état qu'on ne pourrait plus comparer.
    --
    -- Les lignes antérieures à ces migrations portent ces colonnes à NULL et
    -- ne sont donc pas concernées — on ne bloque pas rétroactivement des
    -- envois validés avant.
    update public.notifications_atelier n
       set statut = 'bloque',
           derniere_erreur = case
             when r.statut_atelier is distinct from 'pret'
               then 'le véhicule n''est plus noté prêt : nouvelle validation nécessaire'
             when n.destinataire_valide is not null
                  and n.destinataire_valide is distinct from lower(trim(coalesce(c.email, '')))
               then 'le destinataire a changé depuis la validation : nouvelle validation nécessaire'
             else 'le message a changé depuis la validation : nouvelle validation nécessaire'
           end
      from public.rendez_vous r left join public.clients c on c.id = r.client_id
     where r.id = n.rendez_vous_id
       and (p_garages is null or r.garage_id = any(p_garages))
       and n.statut = 'en_attente'
       and (
         r.statut_atelier is distinct from 'pret'
         or (n.destinataire_valide is not null
             and n.destinataire_valide is distinct from lower(trim(coalesce(c.email, ''))))
         or (n.empreinte_document is not null
             and n.empreinte_document is distinct from public.empreinte_atelier(r.id))
       );
  end if;

  v_table := 'notifications_' || p_file;
  v_jointure := case p_file
    when 'devis'       then 'join public.devis x on x.id = n.devis_id'
    when 'factures'    then 'join public.factures x on x.id = n.facture_id'
    when 'proposition' then 'join public.propositions_rdv x on x.id = n.proposition_id'
    when 'atelier'     then 'join public.rendez_vous x on x.id = n.rendez_vous_id'
  end;

  return query execute format($f$
    with a_prendre as (
      select n.id as notif_id, x.id as doc_id
        from public.%I n %s
       where n.statut = 'en_attente'
         and ($1 is null or x.garage_id = any($1))
       order by n.created_at
       for update of n skip locked
       limit %s
    )
    update public.%I n
       set statut = 'envoi_en_cours',
           tentatives = n.tentatives + 1
      from a_prendre
     where n.id = a_prendre.notif_id
    returning n.id, a_prendre.doc_id, %s, n.type, $2::text
  $f$, v_table, v_jointure, p_limite, v_table,
       case when p_file in ('devis', 'factures') then 'n.jeton' else 'null::text' end)
  using p_garages, v_url;
end;
$function$;
