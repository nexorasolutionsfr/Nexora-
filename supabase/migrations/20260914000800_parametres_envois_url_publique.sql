-- L'adresse publique des liens devient un réglage, pas une constante écrite
-- dans chaque automatisation.
--
-- POURQUOI
--
-- `https://nexora-garage.vercel.app` était recopié dans le code de chaque
-- message. Un banc d'essai ne pouvait donc pas produire un lien ouvrable sur
-- son propre environnement, et un changement de domaine demanderait de
-- rouvrir tous les workflows. La valeur vit désormais en base, à un seul
-- endroit, et la réservation la rend avec la ligne.
--
-- La table est verrouillée (RLS sans policy) : seul le traitement interne la
-- lit. Ce n'est pas un secret, mais ce n'est pas non plus une donnée de
-- garage : personne n'a à la modifier depuis l'application.

create table if not exists public.parametres_envois (
  cle text primary key,
  valeur text not null,
  maj_le timestamptz not null default now()
);
alter table public.parametres_envois enable row level security;
revoke all on table public.parametres_envois from anon, authenticated;

insert into public.parametres_envois (cle, valeur)
values ('url_publique', 'https://nexora-garage.vercel.app')
on conflict (cle) do nothing;

comment on table public.parametres_envois is
  'Réglages du traitement des envois. `url_publique` : racine des liens publics envoyés aux clients.';

drop function if exists public.reserver_notifications(text, integer, uuid[]);

create function public.reserver_notifications(
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
