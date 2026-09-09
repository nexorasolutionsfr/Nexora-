-- Le lien du message, et la réservation d'une notification.
--
-- 1. LE LIEN
--
-- Les pages publiques `/devis/[token]` et `/facture/[token]` attendent un
-- jeton opaque, pas l'identifiant de la ligne. Les automatisations écrivaient
-- l'identifiant : tous les liens envoyés étaient morts.
--
-- Le jeton est produit **au moment où le document est créé**, dans la
-- transaction de l'utilisateur qui le crée — donc sous ses droits, par le
-- parcours applicatif déjà en place. Aucune fonction n'est ouverte au rôle de
-- service. Si le producteur n'a pas de session (import, robot), le jeton ne
-- peut pas être produit : la notification est créée `sans_lien`, non
-- envoyable, et ce parcours reste indisponible tant qu'il n'a pas été borné
-- explicitement. On ne simule pas `auth.uid()`.
--
-- Le jeton en clair est un secret d'accès : il n'est lisible que par le
-- traitement interne (les tables portent RLS sans policy, donc seul un rôle
-- qui contourne RLS y accède), il n'apparaît dans aucun journal, et il est
-- effacé de la file dès l'envoi réussi.

alter table public.notifications_devis    add column if not exists jeton text;
alter table public.notifications_factures add column if not exists jeton text;

comment on column public.notifications_devis.jeton is
  'Jeton de lien public, en clair, le temps de l''envoi. Secret d''accès : effacé par terminer_notification dès que le message est parti.';
comment on column public.notifications_factures.jeton is
  'Jeton de lien public, en clair, le temps de l''envoi. Secret d''accès : effacé par terminer_notification dès que le message est parti.';

-- Les déclencheurs produisent le lien avant de rendre la ligne envoyable.
create or replace function public.notifier_nouveau_devis()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_jeton text;
begin
  if new.statut <> 'en_attente' then
    return new;
  end if;

  -- Sans session utilisateur, aucun jeton ne peut être produit sous des
  -- droits légitimes. La notification existe, mais n'est pas envoyable.
  if auth.uid() is null then
    insert into notifications_devis (devis_id, type, statut)
    values (new.id, 'nouveau', 'sans_lien');
    return new;
  end if;

  v_jeton := public.creer_jeton_devis(new.id);
  insert into notifications_devis (devis_id, type, statut, jeton)
  values (new.id, 'nouveau', 'en_attente', v_jeton);
  return new;
end;
$function$;

create or replace function public.notifier_nouvelle_facture()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_jeton text;
begin
  if auth.uid() is null then
    insert into notifications_factures (facture_id, type, statut)
    values (new.id, 'nouvelle', 'sans_lien');
    return new;
  end if;

  v_jeton := public.creer_jeton_facture(new.id);
  insert into notifications_factures (facture_id, type, statut, jeton)
  values (new.id, 'nouvelle', 'en_attente', v_jeton);
  return new;
end;
$function$;

-- 2. LA RÉSERVATION
--
-- Deux exécutions simultanées lisaient la même ligne et envoyaient deux fois.
-- `reserver_notifications` fait la sélection et la prise en une seule
-- opération, sous verrou : la seconde exécution ne voit plus la ligne.
-- `for update skip locked` évite qu'elle attende ; elle repart les mains vides,
-- ce qui est le comportement voulu.
--
-- Ce n'est pas une garantie « exactement une fois » : SMTP n'en offre aucune.
-- C'est une garantie « au plus une réservation », et un envoi incertain reste
-- incertain — il ne repart jamais tout seul.

create or replace function public.reserver_notifications(p_file text, p_limite integer default 10)
returns table (id uuid, jeton text)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if p_file not in ('devis', 'factures', 'proposition', 'atelier') then
    raise exception 'File inconnue : %', p_file;
  end if;
  if p_limite is null or p_limite < 1 or p_limite > 200 then
    raise exception 'Limite hors bornes';
  end if;

  return query execute format($f$
    with a_prendre as (
      select n.id from public.%I n
      where n.statut = 'en_attente'
      order by n.created_at
      for update skip locked
      limit %s
    )
    update public.%I n
       set statut = 'envoi_en_cours',
           tentatives = n.tentatives + 1
      from a_prendre
     where n.id = a_prendre.id
    returning n.id, %s
  $f$, 'notifications_' || p_file, p_limite, 'notifications_' || p_file,
       case when p_file in ('devis', 'factures') then 'n.jeton' else 'null::text' end);
end;
$function$;

revoke execute on function public.reserver_notifications(text, integer) from public, anon, authenticated;
grant execute on function public.reserver_notifications(text, integer) to service_role;

-- 3. LA CLÔTURE
--
-- Trois issues, et une seule marque « envoyé ». Le jeton est effacé dès que le
-- message est parti : il a servi, il n'a plus à traîner dans la file.

create or replace function public.terminer_notification(
  p_file text, p_id uuid, p_resultat text, p_motif text default null)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if p_file not in ('devis', 'factures', 'proposition', 'atelier') then
    raise exception 'File inconnue : %', p_file;
  end if;
  if p_resultat not in ('envoye', 'bloque', 'a_reprendre') then
    raise exception 'Résultat inconnu : %', p_resultat;
  end if;

  execute format($f$
    update public.%I
       set envoye = ($1 = 'envoye'),
           statut = case $1 when 'a_reprendre' then 'en_attente' else $1 end,
           derniere_erreur = $2
           %s
     where id = $3 and statut = 'envoi_en_cours'
  $f$, 'notifications_' || p_file,
       case when p_file in ('devis', 'factures')
            then ', jeton = case when $1 = ''envoye'' then null else jeton end' else '' end)
  using p_resultat, p_motif, p_id;
end;
$function$;

revoke execute on function public.terminer_notification(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.terminer_notification(text, uuid, text, text) to service_role;
