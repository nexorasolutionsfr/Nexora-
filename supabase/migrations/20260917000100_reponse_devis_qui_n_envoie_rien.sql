-- Répondre à la place du client n'envoie rien, et se voit.
--
-- ================================================================
-- 1. CE QUI ÉTAIT FAUX (revue du 12 septembre 2026, parcours quotidien)
-- ================================================================
--
-- `notifier_devis_maj` insère une notification dès qu'un devis passe
-- `accepte` ou `refuse`. La colonne `statut` de `notifications_devis` vaut
-- `en_attente` par défaut : la ligne naissait donc **armée**, et le traitement
-- « Nouveau devis (socle) » l'envoyait dans les deux minutes.
--
-- Deux chemins mènent à ce changement de statut, et le défaut est plus grave
-- sur le second :
--
--   * le client répond depuis son lien — un accusé de réception se défend,
--     mais il partait sans que le garage l'ait jamais vu ni relu ;
--   * **le garage clique « Il a accepté »** parce que le client a dit oui au
--     téléphone. Là, une simple saisie de comptoir faisait partir au client un
--     « Votre devis a été confirmé » que personne n'avait relu. C'est
--     exactement la règle posée pour la facture le 12 septembre au matin :
--     changer un statut métier n'envoie pas de message.
--
-- Troisième défaut, de conséquence : quand le devis avait déjà un envoi
-- programmé (« Un devis vous attend »), la réponse du client changeait
-- l'empreinte du document. La réservation mettait alors la ligne de côté avec
-- « le document ou le destinataire a changé depuis la validation » — vrai,
-- mais muet sur l'essentiel : ce message proposait un devis auquel le client
-- venait de répondre.
--
-- ================================================================
-- 2. CE QUE FAIT CETTE MIGRATION
-- ================================================================
--
-- a. La notification d'acceptation ou de refus naît `sans_lien`. Elle existe,
--    elle est relisible, elle n'est pas envoyable. Comme pour le devis et la
--    facture, `autoriser_envoi_devis` reste le seul chemin vers un envoi.
--
-- b. Dans la même transaction, l'envoi encore programmé pour ce devis est mis
--    de côté avec un motif que l'écran sait traduire. Il n'existe aucun
--    instant où le client a répondu et où le message « un devis vous attend »
--    est encore armé.
--
-- c. Un envoi **en cours** (`envoi_en_cours`) n'est jamais touché : le
--    fournisseur l'a peut-être accepté. On ne le rejoue pas, on ne le déclare
--    pas bloqué. Même règle que partout ailleurs dans ce socle.
--
-- d. `devis.reponse_origine` dit **qui** a répondu : `client` quand la réponse
--    vient du lien public, `garage` quand elle est saisie au comptoir. Sans
--    cette colonne, l'accueil écrivait « Devis accepté par Julien Recette —
--    reçu à l'instant » dans les deux cas : un horodatage laissait croire que
--    le client avait cliqué alors que le garage avait tapé. Les lignes
--    antérieures gardent `null` — on ne réécrit pas l'histoire, on dit
--    « origine non enregistrée ».

alter table public.devis add column if not exists reponse_origine text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'devis_reponse_origine_check'
  ) then
    alter table public.devis
      add constraint devis_reponse_origine_check
      check (reponse_origine is null or reponse_origine in ('client', 'garage'));
  end if;
end;
$$;

comment on column public.devis.reponse_origine is
  'Qui a répondu au devis : « client » depuis le lien public, « garage » par saisie au comptoir. NULL pour les réponses antérieures au 2026-09-17, dont l''origine n''a pas été enregistrée.';

-- 3. Le déclencheur : une notification qui existe, que rien ne peut envoyer,
--    et la mise à l'écart de l'envoi devenu faux.
create or replace function public.notifier_devis_maj()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.statut not in ('accepte', 'refuse') or old.statut is not distinct from new.statut then
    return new;
  end if;

  -- L'accusé de réception naît non envoyable. Le garage le relit et décide.
  insert into notifications_devis (devis_id, type, statut)
  values (new.id, case when new.statut = 'accepte' then 'accepte' else 'refuse' end, 'sans_lien');

  -- L'envoi encore programmé proposait un devis auquel le client vient de
  -- répondre. On le met de côté ici, dans la transaction qui enregistre la
  -- réponse. `envoi_en_cours` n'est pas touché : issue inconnue, on ne
  -- tranche pas à sa place.
  update notifications_devis n
     set statut = 'bloque',
         derniere_erreur = 'le devis a reçu une réponse avant l''envoi : ce message proposait un devis déjà traité'
   where n.devis_id = new.id
     and n.type = 'nouveau'
     and n.statut = 'en_attente'
     and n.envoye = false;

  return new;
end;
$function$;

-- 4. La réponse du client par son lien s'enregistre comme telle.
create or replace function public.repondre_devis_par_jeton(p_token text, p_reponse text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_jeton public.devis_jetons%rowtype;
  v_statut_actuel text;
begin
  if p_reponse not in ('accepte', 'refuse') then
    return jsonb_build_object('ok', false, 'raison', 'reponse_invalide');
  end if;

  select * into v_jeton from public.devis_jetons
    where jeton_hash = v_hash and revoked_at is null and expires_at > now()
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'raison', 'invalide');
  end if;

  select statut into v_statut_actuel from public.devis where id = v_jeton.devis_id for update;
  if v_statut_actuel is distinct from 'en_attente' then
    return jsonb_build_object('ok', false, 'raison', 'deja_repondu');
  end if;

  -- `reponse_origine` est posée dans le même UPDATE que le statut : après ce
  -- passage, `devis_check_immuabilite` verrouille la ligne et plus rien ne
  -- peut la compléter.
  update public.devis
     set statut = p_reponse, date_validation = now(), reponse_origine = 'client'
   where id = v_jeton.devis_id;
  update public.devis_jetons set used_at = coalesce(used_at, now()) where id = v_jeton.id;

  return jsonb_build_object('ok', true, 'statut', p_reponse);
end;
$function$;

revoke execute on function public.repondre_devis_par_jeton(text, text) from public;
grant execute on function public.repondre_devis_par_jeton(text, text) to anon, authenticated;
