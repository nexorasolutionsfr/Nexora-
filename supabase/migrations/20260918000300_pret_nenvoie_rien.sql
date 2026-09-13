-- Marquer une voiture prête enregistre l'état des travaux. Rien de plus.
--
-- ================================================================
-- 1. CE QUI ÉTAIT FAUX
-- ================================================================
--
-- `notifier_vehicule_pret` insère une ligne dans `notifications_atelier` dès
-- que `rendez_vous.statut_atelier` passe à `pret`. La colonne `statut` vaut
-- `en_attente` par défaut : la ligne naissait donc **armée**, et
-- « Véhicule prêt (socle) » — **actif**, exécuté toutes les deux minutes —
-- envoyait « Votre véhicule est prêt ! » au client dans la foulée.
--
-- Personne n'avait relu ce message, ni vu à qui il partait.
--
-- C'est la règle déjà posée pour la facture (20260916000100) et pour la
-- réponse au devis (20260917000100) : **changer un statut métier n'envoie pas
-- de message**. L'atelier était le dernier endroit où elle ne tenait pas.
--
-- CINQ CHEMINS MÈNENT À `pret`, ET C'EST POURQUOI ON CORRIGE EN BASE
--
--   * l'écran Atelier (dirigeant, accueil) ;
--   * `atelier_avancer_etape` et `atelier_avancer_etape_par_ordre` — le
--     mécanicien, depuis son écran ;
--   * `avancer_etape_atelier` ;
--   * `avancer_etape_atelier_par_jeton` — **le lien public**, sans compte.
--
-- Une confirmation ajoutée à un écran n'en couvre qu'un. Le trigger les
-- couvre tous les cinq, y compris les appels directs aux fonctions.
--
-- ================================================================
-- 2. CE QUE FAIT CETTE MIGRATION
-- ================================================================
--
-- a. La notification naît `sans_lien` : elle existe, elle est relisible, elle
--    n'est pas envoyable. `reserver_notifications` ne prend que `en_attente`.
--
-- b. `autoriser_envoi_atelier` devient le seul chemin vers un envoi. Elle est
--    réservée au dirigeant et à l'accueil — le mécanicien note que la voiture
--    est prête, il ne décide pas d'écrire au client.
--
-- c. Elle exige le destinataire que l'appelant a vu. Si l'adresse du client a
--    changé entre l'aperçu et la confirmation, l'autorisation est refusée
--    plutôt que d'écrire à quelqu'un d'autre.
--
-- d. Un envoi déjà autorisé, ou **en cours**, n'est jamais réarmé : double
--    clic et appels simultanés retombent sur la même ligne. Un envoi dont on
--    ignore l'issue ne se rejoue pas — même règle que partout dans ce socle.
--
-- e. `reserver_notifications` met de côté une autorisation dont le
--    destinataire a changé depuis, comme elle le fait déjà pour le devis et
--    la facture.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS
--
-- Elle ne touche **aucune ligne existante**. Les notifications déjà en file
-- gardent leur statut : les réécrire reviendrait à décider à la place du
-- garage du sort de messages déjà validés. Elles restent visibles et
-- traitables comme avant.

begin;

-- ----------------------------------------------------------------
-- a. La ligne naît désarmée
-- ----------------------------------------------------------------

alter table public.notifications_atelier
  add column if not exists destinataire_valide text;

comment on column public.notifications_atelier.destinataire_valide is
  'Adresse que le garage avait sous les yeux en autorisant l''envoi. Sert a refuser l''expedition si l''adresse du client a change depuis. NULL sur les lignes anterieures a 20260918000300 : on ne reecrit pas l''historique.';

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
    -- Une seule ligne en attente d'autorisation par rendez-vous : un
    -- aller-retour pret -> intervention -> pret ne doit pas en empiler deux,
    -- sinon le garage autorise la premiere et la seconde reste a trainer.
    if not exists (
      select 1 from notifications_atelier n
       where n.rendez_vous_id = new.id
         and n.type = 'vehicule_pret'
         and n.envoye = false
         and n.statut in ('sans_lien', 'en_attente', 'envoi_en_cours')
    ) then
      insert into notifications_atelier (rendez_vous_id, type, statut)
      values (new.id, 'vehicule_pret', 'sans_lien');
    end if;
  end if;
  return new;
end;
$function$;

comment on function public.notifier_vehicule_pret() is
  'Prepare une notification "vehicule pret" DESARMEE (sans_lien) au passage a l''etape pret. N''envoie rien : seule autoriser_envoi_atelier peut l''armer. Couvre les cinq chemins qui ecrivent statut_atelier, y compris le lien public par jeton.';

-- ----------------------------------------------------------------
-- b. L'aperçu — exactement le message qui partirait
-- ----------------------------------------------------------------
--
-- Le texte reproduit celui que construit « Véhicule prêt (socle) », nœud
-- « Construire le message ». Un aperçu qui ne serait pas le message réel
-- serait pire que pas d'aperçu : le garage validerait autre chose que ce
-- qu'il a lu. Si le traitement change, cette fonction doit changer avec lui.

create or replace function public.apercu_message_atelier(p_rendez_vous_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_garage_id uuid;
  v_nom_client text; v_email text; v_nom_garage text; v_nom_affiche text;
  v_vehicule text; v_immat text; v_lien_paiement text; v_texte text;
begin
  select r.garage_id,
         coalesce(c.nom, ''), coalesce(c.email, ''),
         coalesce(nullif(g.nom_garage, ''), 'notre garage'),
         trim(regexp_replace(coalesce(nullif(g.nom_garage, ''), 'Votre garage'), '["\\]', ' ', 'g')),
         trim(coalesce(v.marque, '') || ' ' || coalesce(v.modele, '')),
         case when coalesce(v.immatriculation, '') = '' then '' else ' (' || v.immatriculation || ')' end,
         nullif(trim(coalesce(r.lien_paiement, '')), '')
    into v_garage_id, v_nom_client, v_email, v_nom_garage, v_nom_affiche, v_vehicule, v_immat, v_lien_paiement
  from public.rendez_vous r
  left join public.clients c on c.id = r.client_id
  left join public.garages g on g.id = r.garage_id
  left join public.vehicules v on v.id = r.vehicule_id
  where r.id = p_rendez_vous_id;

  if v_garage_id is null then
    return jsonb_build_object('ok', false, 'raison', 'rendez_vous_introuvable');
  end if;
  if auth.uid() is not null and not public.a_acces_garage(v_garage_id, 'dirigeant', 'accueil') then
    return jsonb_build_object('ok', false, 'raison', 'acces_refuse');
  end if;

  v_texte := 'Bonjour ' || v_nom_client || E',\n\nVotre véhicule ' || v_vehicule || v_immat ||
             ' est prêt, vous pouvez venir le récupérer chez ' || v_nom_garage || '.';
  if v_lien_paiement is not null then
    v_texte := v_texte || E'\n\nVous pouvez régler en ligne dès maintenant : ' || v_lien_paiement;
  end if;
  v_texte := v_texte || E'\n\nÀ bientôt,\n' || v_nom_affiche;

  return jsonb_build_object(
    'ok', true,
    'destinataire', v_email,
    'sujet', 'Votre véhicule est prêt !',
    'texte', v_texte);
end;
$function$;

comment on function public.apercu_message_atelier(uuid) is
  'Le message "vehicule pret" tel qu''il partirait, reproduit a l''identique du noeud "Construire le message" du traitement. Lecture seule.';

-- ----------------------------------------------------------------
-- c. L'autorisation — le seul chemin vers un envoi
-- ----------------------------------------------------------------

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

  select n.id into v_notif from public.notifications_atelier n
   where n.rendez_vous_id = p_rendez_vous_id and n.type = 'vehicule_pret'
     and n.statut in ('sans_lien', 'bloque') and n.envoye = false
   order by n.created_at desc limit 1 for update;

  -- Aucune ligne preparee : c'est le cas d'une voiture passee a 'pret' avant
  -- cette migration. On la cree ici plutot que de rendre le geste impossible.
  if v_notif is null then
    insert into public.notifications_atelier (rendez_vous_id, type, statut)
    values (p_rendez_vous_id, 'vehicule_pret', 'sans_lien')
    returning id into v_notif;
  end if;

  update public.notifications_atelier
     set statut = 'en_attente',
         derniere_erreur = null,
         destinataire_valide = lower(trim(v_client_email))
   where id = v_notif;

  return jsonb_build_object('ok', true, 'deja_autorise', false, 'notification', v_notif);
end;
$function$;

comment on function public.autoriser_envoi_atelier(uuid, text) is
  'Seul chemin vers un envoi "vehicule pret". Reserve au dirigeant et a l''accueil. Exige que la voiture soit a l''etape pret et que le destinataire soit celui que l''appelant a vu. Idempotente : un envoi deja autorise ou en cours n''est jamais rearme.';

revoke all on function public.autoriser_envoi_atelier(uuid, text) from public, anon;
grant execute on function public.autoriser_envoi_atelier(uuid, text) to authenticated;
revoke all on function public.apercu_message_atelier(uuid) from public, anon;
grant execute on function public.apercu_message_atelier(uuid) to authenticated;

-- ----------------------------------------------------------------
-- d. L'état, pour que l'écran dise la vérité
-- ----------------------------------------------------------------

create or replace function public.etat_envoi_atelier(p_rendez_vous_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v_garage_id uuid; v_n record;
begin
  select r.garage_id into v_garage_id from public.rendez_vous r where r.id = p_rendez_vous_id;
  if v_garage_id is null or not public.a_acces_garage(v_garage_id, 'dirigeant', 'accueil') then
    return jsonb_build_object('ok', false, 'raison', 'acces_refuse');
  end if;

  select n.statut, n.envoye, n.tentatives, n.derniere_erreur, n.destinataire_valide
    into v_n
  from public.notifications_atelier n
  where n.rendez_vous_id = p_rendez_vous_id and n.type = 'vehicule_pret'
  order by n.created_at desc limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'etat', 'aucune');
  end if;

  return jsonb_build_object(
    'ok', true,
    'etat', case v_n.statut
              when 'sans_lien'      then 'a_valider'
              when 'en_attente'     then 'en_attente_envoi'
              when 'envoi_en_cours' then 'envoi_en_cours'
              when 'envoye'         then 'envoye'
              when 'bloque'         then 'bloque'
              else v_n.statut end,
    'destinataire', v_n.destinataire_valide,
    'tentatives', v_n.tentatives,
    'motif', v_n.derniere_erreur);
end;
$function$;

revoke all on function public.etat_envoi_atelier(uuid) from public, anon;
grant execute on function public.etat_envoi_atelier(uuid) to authenticated;

commit;
