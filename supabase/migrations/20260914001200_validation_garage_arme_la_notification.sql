-- Le devis créé par l'Assistant part quand le garage le décide, pas avant.
--
-- LE TROU
--
-- L'Assistant Garage crée des devis avec le rôle de service, sans session
-- utilisateur. Le déclencheur ne peut donc produire aucun jeton sous des
-- droits légitimes : la notification naît `sans_lien`, non envoyable. Le seul
-- parcours réellement automatique du produit était ainsi celui qui ne
-- notifiait personne.
--
-- LE GESTE RÉEL
--
-- Dans l'application, `genererLienDevis` appelle `creer_jeton_devis` quand le
-- garagiste demande le lien depuis sa liste de devis. C'est là qu'il décide
-- d'envoyer : c'est donc là qu'on arme la notification. La création du devis
-- par l'Assistant ne suffit toujours pas — et cela n'a rien à voir avec
-- l'acceptation du devis par le client, qui vient plus tard et ailleurs.
--
-- LE BORNAGE
--
-- Aucune fonction nouvelle, aucun droit rouvert. L'armement se fait dans la
-- fonction qui vient de vérifier l'accès, et ne touche que les notifications
-- **du document passé en argument** — donc du même garage. Aucun identifiant
-- arbitraire ne circule : l'appelant ne désigne pas la notification, il
-- désigne son devis, et la fonction retrouve la file elle-même.
--
-- Double clic : le premier armement met la notification en `en_attente` avec
-- son jeton ; le second retombe sur la branche « un envoi est en partance »
-- et rend le même jeton, sans créer de seconde ligne. Un seul envoi.

create or replace function public.creer_jeton_devis(p_devis_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_garage_id uuid;
  v_token text;
  v_en_file text;
begin
  select d.garage_id into v_garage_id
  from public.devis d where d.id = p_devis_id for update of d;

  if v_garage_id is null or not public.a_acces_garage(v_garage_id, 'dirigeant', 'accueil') then
    raise exception 'Devis introuvable ou accès refusé';
  end if;

  select n.jeton into v_en_file
  from public.notifications_devis n
  where n.devis_id = p_devis_id and n.jeton is not null
    and n.statut in ('en_attente', 'envoi_en_cours')
  order by n.created_at desc limit 1;
  if v_en_file is not null then
    return v_en_file;
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.devis_jetons (devis_id, garage_id, jeton_hash, expires_at)
  values (p_devis_id, v_garage_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '90 days');

  -- Armement : la notification en attente de validation reçoit son lien.
  update public.notifications_devis
     set jeton = v_token, statut = 'en_attente'
   where devis_id = p_devis_id and statut = 'sans_lien';

  return v_token;
end;
$function$;

create or replace function public.creer_jeton_facture(p_facture_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_garage_id uuid;
  v_token text;
  v_en_file text;
begin
  select f.garage_id into v_garage_id
  from public.factures f where f.id = p_facture_id for update of f;

  if v_garage_id is null or not public.a_acces_garage(v_garage_id, 'dirigeant') then
    raise exception 'Facture introuvable ou accès refusé';
  end if;

  select n.jeton into v_en_file
  from public.notifications_factures n
  where n.facture_id = p_facture_id and n.jeton is not null
    and n.statut in ('en_attente', 'envoi_en_cours')
  order by n.created_at desc limit 1;
  if v_en_file is not null then
    return v_en_file;
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.factures_jetons (facture_id, garage_id, jeton_hash, expires_at)
  values (p_facture_id, v_garage_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '90 days');

  update public.notifications_factures
     set jeton = v_token, statut = 'en_attente'
   where facture_id = p_facture_id and statut = 'sans_lien';

  return v_token;
end;
$function$;

revoke execute on function public.creer_jeton_devis(uuid) from public, anon;
grant execute on function public.creer_jeton_devis(uuid) to authenticated;
revoke execute on function public.creer_jeton_facture(uuid) from public, anon;
grant execute on function public.creer_jeton_facture(uuid) to authenticated;
