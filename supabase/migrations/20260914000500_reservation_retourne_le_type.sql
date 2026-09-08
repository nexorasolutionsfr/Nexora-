-- La réservation rend l'identifiant du document, son type et son jeton.
--
-- Le traitement n'a alors plus rien à deviner : il lit le document par
-- l'identifiant rendu, choisit le gabarit d'après le type, et construit le
-- lien avec le jeton. Trois valeurs, une seule opération.
--
-- Le message dépend du type (« nouvelle » facture ou facture « payée »,
-- devis « nouveau » ou « accepté »). Tant que la réservation ne le rendait
-- pas, le traitement retombait sur le gabarit par défaut et pouvait envoyer
-- le mauvais texte. On le renvoie donc avec l'identifiant et le jeton.

-- Postgres refuse de changer le type de retour d'une fonction existante :
-- on la supprime d'abord. Aucune dépendance ne la référence (elle n'est
-- appelée que par le traitement, jamais par une vue ou une contrainte).
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
      select n.id from public.%I n %s
      where n.statut = 'en_attente'
        and ($1 is null or x.garage_id = any($1))
      order by n.created_at
      for update of n skip locked
      limit %s
    )
    update public.%I n
       set statut = 'envoi_en_cours',
           tentatives = n.tentatives + 1
      from a_prendre %s
     where n.id = a_prendre.id
    returning n.id, x.id, %s, n.type
  $f$, v_table, v_jointure, p_limite, v_table, v_jointure,
       case when p_file in ('devis', 'factures') then 'n.jeton' else 'null::text' end)
  using p_garages;
end;
$function$;

revoke execute on function public.reserver_notifications(text, integer, uuid[]) from public, anon, authenticated;
grant execute on function public.reserver_notifications(text, integer, uuid[]) to service_role;
