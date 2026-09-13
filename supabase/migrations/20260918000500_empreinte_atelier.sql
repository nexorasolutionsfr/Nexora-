-- Ce qui a été validé est ce qui part. Sinon, on revalide.
--
-- ================================================================
-- CE QUI MANQUAIT
-- ================================================================
--
-- 20260918000300 enregistrait le destinataire au moment de l'autorisation, et
-- 20260918000400 refusait d'expédier si l'adresse avait changé depuis. C'est
-- la moitié de la garantie.
--
-- Le message « votre véhicule est prêt » ne parle pas que du destinataire. Il
-- nomme le client, la voiture, la plaque, le garage, et peut porter un lien de
-- paiement. Tout cela pouvait changer entre la validation et le départ sans
-- que rien ne s'y oppose : le garage validait un message pour « Renault Master
-- (BE-505-EE) » et Nexora en envoyait un pour « Renault Trafic (BZ-101-ZZ) ».
--
-- Et une voiture pouvait cesser d'être prête — repassée en intervention parce
-- qu'un défaut était apparu — sans que l'autorisation déjà donnée soit remise
-- en cause. Le client recevait « venez la chercher » pour une voiture sur le
-- pont.
--
-- ================================================================
-- CE QUE FAIT CETTE MIGRATION
-- ================================================================
--
-- a. `empreinte_atelier` — la signature des champs QUI COMPOSENT LE MESSAGE,
--    sur le modèle de `empreinte_devis` et `empreinte_facture`. Même mécanisme,
--    même schéma de nommage : on réutilise, on n'invente pas un second.
--
-- b. `autoriser_envoi_atelier` l'enregistre au moment de valider.
--
-- c. `reserver_notifications` met la ligne de côté — `bloque`, avec un motif
--    que l'écran sait traduire — quand l'empreinte a changé, quand le
--    destinataire a changé, ou quand la voiture n'est plus prête.
--
--    Elle NE RÉÉCRIT PAS `destinataire_valide` ni `empreinte_document` : ces
--    colonnes disent ce que le garage avait sous les yeux. Les écraser
--    effacerait la preuve de ce qui avait été validé, et la revalidation
--    porterait alors sur un état qu'on ne pourrait plus comparer.
--
-- d. La revalidation passe par le même chemin que la première fois :
--    `autoriser_envoi_atelier` reprend une ligne `bloque` et la réarme avec la
--    nouvelle empreinte et le nouveau destinataire. Rien n'est automatique.
--
-- CE QU'ELLE NE FAIT PAS
--
-- Elle ne touche aucune ligne existante : les notifications déjà en file
-- gardent `empreinte_document` à NULL et ne sont donc pas concernées par la
-- garde — on ne réécrit pas l'histoire, et on ne bloque pas rétroactivement
-- des envois que le garage a validés avant.

begin;

alter table public.notifications_atelier
  add column if not exists empreinte_document text;

comment on column public.notifications_atelier.empreinte_document is
  'Signature des champs qui composent le message, au moment ou le garage l''a valide. Sert a refuser l''expedition si le message a change depuis. NULL sur les lignes anterieures a 20260918000500 : elles ne sont pas concernees.';

-- a. L'empreinte : exactement ce que le message montre.
--
--    Le lien de paiement en fait partie : il apparaît dans le texte quand il
--    existe. L'ajouter ou le retirer change le message, donc l'empreinte.
create or replace function public.empreinte_atelier(p_rendez_vous_id uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select encode(extensions.digest(
    coalesce(r.garage_id::text, '') || '|' ||
    coalesce(r.vehicule_id::text, '') || '|' ||
    coalesce(r.client_id::text, '') || '|' ||
    coalesce(c.nom, '') || '|' ||
    coalesce(v.marque, '') || '|' || coalesce(v.modele, '') || '|' ||
    coalesce(v.immatriculation, '') || '|' ||
    coalesce(g.nom_garage, '') || '|' ||
    coalesce(nullif(btrim(coalesce(r.lien_paiement, '')), ''), ''), 'sha256'), 'hex')
  from public.rendez_vous r
  left join public.clients c on c.id = r.client_id
  left join public.vehicules v on v.id = r.vehicule_id
  left join public.garages g on g.id = r.garage_id
  where r.id = p_rendez_vous_id;
$function$;

comment on function public.empreinte_atelier(uuid) is
  'Signature des champs qui composent le message "vehicule pret" : garage, vehicule, client, leurs libelles, et le lien de paiement. Meme mecanisme que empreinte_devis et empreinte_facture.';

revoke all on function public.empreinte_atelier(uuid) from public, anon;
grant execute on function public.empreinte_atelier(uuid) to authenticated;

-- a bis. UNE LIGNE BLOQUÉE EST DÉJÀ EN ATTENTE D'UNE DÉCISION
--
-- Trouvé en recette le 13 septembre : le garde-fou anti-empilement de
-- `notifier_vehicule_pret` ne connaissait que `sans_lien`, `en_attente` et
-- `envoi_en_cours`. Une ligne mise de côté en `bloque` n'en faisait pas
-- partie : il suffisait que la voiture repasse par `intervention` puis `pret`
-- — ce qui arrive précisément quand un défaut apparaît, donc exactement dans
-- le cas qui avait causé le blocage — pour qu'une SECONDE ligne naisse.
--
-- `autoriser_envoi_atelier` prenant la plus récente, la ligne bloquée restait
-- alors en arrière-plan pour toujours, et le garage ne revalidait jamais ce
-- qu'il croyait revalider.
create or replace function public.notifier_vehicule_pret()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.statut_atelier = 'pret' and (old.statut_atelier is distinct from 'pret') then
    -- `sans_lien` : la notification existe et se relit, mais aucun traitement
    -- ne la prendra. Seule `autoriser_envoi_atelier` peut l'armer.
    --
    -- `bloque` compte comme « deja en attente » : c'est une ligne qui attend
    -- une revalidation, pas une ligne consommee. En ouvrir une seconde
    -- masquerait la premiere.
    if not exists (
      select 1 from notifications_atelier n
       where n.rendez_vous_id = new.id
         and n.type = 'vehicule_pret'
         and n.envoye = false
         and n.statut in ('sans_lien', 'bloque', 'en_attente', 'envoi_en_cours')
    ) then
      insert into notifications_atelier (rendez_vous_id, type, statut)
      values (new.id, 'vehicule_pret', 'sans_lien');
    end if;
  end if;
  return new;
end;
$function$;

-- b. L'autorisation enregistre l'empreinte en même temps que le destinataire.
create or replace function public.autoriser_envoi_atelier(p_rendez_vous_id uuid, p_destinataire text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_garage_id uuid; v_etape text; v_client_email text;
  v_deja uuid; v_envoye uuid; v_notif uuid;
begin
  select r.garage_id, r.statut_atelier, c.email
    into v_garage_id, v_etape, v_client_email
  from public.rendez_vous r
  left join public.clients c on c.id = r.client_id
  where r.id = p_rendez_vous_id
  for update of r;

  -- Le mecanicien n'a pas 'dirigeant' ni 'accueil' : il note que la voiture
  -- est prete, il n'ecrit pas au client.
  if v_garage_id is null or not public.a_acces_garage(v_garage_id, 'dirigeant', 'accueil') then
    raise exception 'Rendez-vous introuvable ou accès refusé' using errcode = '42501';
  end if;

  -- On ne previent pas qu'une voiture est prete si elle ne l'est pas. L'etat
  -- des travaux reste la source ; ce geste-ci ne le change jamais.
  if v_etape is distinct from 'pret' then
    return jsonb_build_object('ok', false, 'raison', 'vehicule_pas_pret');
  end if;

  if coalesce(nullif(trim(v_client_email), ''), '') = '' then
    return jsonb_build_object('ok', false, 'raison', 'destinataire_absent');
  end if;
  -- L'adresse que l'appelant a vue doit etre celle d'aujourd'hui. Sinon il
  -- confirmerait un envoi vers quelqu'un d'autre que celui qu'il a lu.
  if lower(trim(coalesce(p_destinataire, ''))) is distinct from lower(trim(v_client_email)) then
    return jsonb_build_object('ok', false, 'raison', 'destinataire_different');
  end if;

  -- Deja autorise, ou en cours de traitement : on ne recommence pas. Double
  -- clic, deux onglets et deux appels simultanes retombent tous ici. Un envoi
  -- dont on ignore l'issue ne se rejoue jamais.
  select n.id into v_deja from public.notifications_atelier n
   where n.rendez_vous_id = p_rendez_vous_id and n.type = 'vehicule_pret'
     and n.statut in ('en_attente', 'envoi_en_cours')
   order by n.created_at desc limit 1 for update;
  if v_deja is not null then
    return jsonb_build_object('ok', true, 'deja_autorise', true, 'notification', v_deja);
  end if;

  -- Deja parti : on ne renvoie pas sans une decision explicite, qui n'existe
  -- pas encore. Mieux vaut le dire que d'ecrire deux fois au client.
  select n.id into v_envoye from public.notifications_atelier n
   where n.rendez_vous_id = p_rendez_vous_id and n.type = 'vehicule_pret'
     and (n.statut = 'envoye' or n.envoye = true)
   order by n.created_at desc limit 1;
  if v_envoye is not null then
    return jsonb_build_object('ok', false, 'raison', 'deja_envoye', 'notification', v_envoye);
  end if;

  -- `bloque` est repris ici : c'est le chemin de REVALIDATION. Une ligne mise
  -- de cote parce que le message avait change se rearme en repassant par ce
  -- geste, avec la nouvelle empreinte — jamais automatiquement.
  select n.id into v_notif from public.notifications_atelier n
   where n.rendez_vous_id = p_rendez_vous_id and n.type = 'vehicule_pret'
     and n.statut in ('sans_lien', 'bloque') and n.envoye = false
   order by n.created_at desc limit 1 for update;

  -- Aucune ligne preparee : c'est le cas d'une voiture passee a 'pret' avant
  -- 20260918000300. On la cree ici plutot que de rendre le geste impossible.
  if v_notif is null then
    insert into public.notifications_atelier (rendez_vous_id, type, statut)
    values (p_rendez_vous_id, 'vehicule_pret', 'sans_lien')
    returning id into v_notif;
  end if;

  update public.notifications_atelier
     set statut = 'en_attente',
         derniere_erreur = null,
         destinataire_valide = lower(trim(v_client_email)),
         empreinte_document = public.empreinte_atelier(p_rendez_vous_id)
   where id = v_notif;

  return jsonb_build_object('ok', true, 'deja_autorise', false, 'notification', v_notif);
end;
$function$;

commit;
