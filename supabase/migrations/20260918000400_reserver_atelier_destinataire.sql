-- La file atelier gagne la garde de destinataire que les autres ont déjà.
--
-- Suite de 20260918000300. `reserver_notifications` écartait déjà une
-- autorisation de devis ou de facture dont le document ou le destinataire
-- avait changé depuis la validation. La file `atelier` n'avait pas cette
-- garde, faute de destinataire enregistré — elle en a un désormais.
--
-- Concrètement : le garage autorise « votre véhicule est prêt » vers
-- marie@exemple.fr, puis corrige l'adresse du client. Sans cette garde, le
-- message part à la nouvelle adresse sans que personne ne l'ait revalidé.
-- Avec elle, la ligne est mise de côté avec un motif que l'écran sait
-- traduire, et le garage revalide.
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
    -- Même garde que pour le devis et la facture : une autorisation dont le
    -- destinataire a changé depuis n'est pas expédiée à la nouvelle adresse,
    -- elle est mise de côté pour être revalidée. Les lignes antérieures à
    -- 20260918000300 portent `destinataire_valide` à NULL et ne sont donc pas
    -- concernées — on ne réécrit pas l'historique.
    update public.notifications_atelier n
       set statut = 'bloque',
           derniere_erreur = 'le destinataire a changé depuis la validation : nouvelle validation nécessaire'
      from public.rendez_vous r left join public.clients c on c.id = r.client_id
     where r.id = n.rendez_vous_id
       and (p_garages is null or r.garage_id = any(p_garages))
       and n.statut = 'en_attente'
       and n.destinataire_valide is not null
       and n.destinataire_valide is distinct from lower(trim(coalesce(c.email, '')));
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
