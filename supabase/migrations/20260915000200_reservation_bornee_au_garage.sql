-- La mise à l'écart d'un document modifié reste dans le périmètre demandé.
--
-- CE QUI ÉTAIT FAUX (revue du 12 septembre 2026)
--
-- `reserver_notifications(p_file, p_limite, p_garages)` borne sa sélection
-- finale par `p_garages`, mais pas les deux UPDATE qui précèdent : ceux qui
-- passent en `bloque` les lignes dont le document ou le destinataire a changé
-- depuis la validation. Un appel restreint à un garage — une recette, par
-- exemple — pouvait donc écrire sur les files d'autres garages.
--
-- Rien d'autre ne change : mêmes conditions de blocage, même motif, même
-- réservation atomique. Quand `p_garages` est nul (le cas du traitement en
-- Production, qui prend toutes les files), le comportement est identique à
-- avant.

create or replace function public.reserver_notifications(
  p_file text, p_limite integer default 10, p_garages uuid[] default null)
returns table (id uuid, doc_id uuid, jeton text, type text, url_publique text)
language plpgsql
security definer
set search_path to ''
as $function$
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

revoke execute on function public.reserver_notifications(text, integer, uuid[]) from public, anon, authenticated;
grant execute on function public.reserver_notifications(text, integer, uuid[]) to service_role;
