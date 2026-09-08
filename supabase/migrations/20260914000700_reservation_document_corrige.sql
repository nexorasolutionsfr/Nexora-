-- Correction de la réservation : l'identifiant du document se lit dans la
-- sélection, pas dans la clause FROM de la mise à jour.
--
-- La version précédente rejoignait le document depuis le FROM de l'UPDATE, ce
-- que Postgres refuse : la cible de la mise à jour ne peut pas être
-- référencée par une jointure de cette clause. La sélection sous verrou porte
-- donc désormais les deux identifiants, et la mise à jour les relit.

drop function if exists public.reserver_notifications(text, integer, uuid[]);

create function public.reserver_notifications(
  p_file text, p_limite integer default 10, p_garages uuid[] default null)
returns table (id uuid, doc_id uuid, jeton text, type text)
language plpgsql
security definer
set search_path to ''
as $function$
declare v_table text; v_jointure text;
begin
  if p_file not in ('devis', 'factures', 'proposition', 'atelier') then
    raise exception 'File inconnue : %', p_file;
  end if;
  if p_limite is null or p_limite < 1 or p_limite > 200 then
    raise exception 'Limite hors bornes';
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
    returning n.id, a_prendre.doc_id, %s, n.type
  $f$, v_table, v_jointure, p_limite, v_table,
       case when p_file in ('devis', 'factures') then 'n.jeton' else 'null::text' end)
  using p_garages;
end;
$function$;

revoke execute on function public.reserver_notifications(text, integer, uuid[]) from public, anon, authenticated;
grant execute on function public.reserver_notifications(text, integer, uuid[]) to service_role;
