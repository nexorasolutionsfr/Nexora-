-- Marquer une facture payée n'envoie rien ; l'accueil gère les factures.
--
-- ================================================================
-- 1. « MARQUER PAYÉE » NE DOIT RIEN ENVOYER
-- ================================================================
--
-- CE QUI ÉTAIT FAUX (revue du 12 septembre 2026)
--
-- `notifier_facture_payee` insérait une notification `payee` à chaque passage
-- au statut payé. La colonne `statut` de `notifications_factures` vaut
-- `en_attente` par défaut : la ligne naissait donc **armée**, et le traitement
-- « Facture (socle) » l'envoyait dans les deux minutes — un « Confirmation de
-- paiement » que personne n'avait relu, depuis un écran qui n'en disait rien.
-- C'est le défaut que la migration précédente vient de fermer pour la facture
-- elle-même, resté ouvert sur le paiement.
--
-- Deuxième défaut, de conséquence plus grave : `empreinte_facture` inclut
-- `statut`. Une facture marquée payée alors qu'un envoi était **déjà
-- programmé** voyait son empreinte changer ; la réservation la mettait de côté
-- avec « le document ou le destinataire a changé depuis la validation » —
-- vrai, mais incompréhensible, et le motif ne disait pas l'essentiel : ce
-- message annonçait une facture à régler, désormais réglée.
--
-- CE QUE FAIT CETTE MIGRATION
--
-- a. Le déclencheur disparaît. Marquer payée ne crée plus aucune ligne de
--    file. Aucun parcours de confirmation de paiement n'est construit ici :
--    quand il le sera, ce sera avec un geste explicite du garage, comme pour
--    la facture (`autoriser_envoi_facture`), et sur une notification née
--    `sans_lien`. Pour rétablir l'ancien comportement il faudrait recréer le
--    déclencheur — rien ne dort en attendant, aucun bouton, aucun réglage.
--
-- b. `marquer_facture_payee` remplace l'UPDATE que faisait l'application.
--    Elle fait, dans **une seule transaction** : le contrôle des droits, le
--    passage au statut payé, et la mise à l'écart de l'envoi qui était
--    programmé. Ainsi il n'existe aucun instant où la facture est payée et
--    l'envoi encore armé.
--
-- c. Un envoi **en cours** (`envoi_en_cours`) n'est jamais touché. Le
--    fournisseur l'a peut-être déjà accepté : on ne le rejoue pas, on ne le
--    déclare pas bloqué non plus. La fonction le signale, l'écran le dit, et
--    la décision revient au garage — même règle que partout ailleurs dans ce
--    socle : un envoi incertain se vérifie, il ne se rejoue pas.
--
-- d. La fonction est idempotente : un second appel sur une facture déjà payée
--    ne change rien, ne remet rien de côté, et le dit. Le double clic et deux
--    appels simultanés retombent là.

drop trigger if exists trg_notifier_facture_payee on public.factures;
drop function if exists public.notifier_facture_payee();

create or replace function public.marquer_facture_payee(p_facture_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_garage_id uuid;
  v_statut text;
  v_date_paiement timestamptz;
  v_annules integer := 0;
  v_incertain boolean := false;
begin
  -- Le verrou est pris sur la facture, comme dans `autoriser_envoi_facture` :
  -- les deux gestes se sérialisent, jamais l'un au milieu de l'autre.
  select f.garage_id, f.statut, f.date_paiement
    into v_garage_id, v_statut, v_date_paiement
  from public.factures f
  where f.id = p_facture_id
  for update of f;

  if v_garage_id is null or not public.a_acces_garage(v_garage_id, 'dirigeant', 'accueil') then
    raise exception 'Facture introuvable ou accès refusé';
  end if;

  -- Un envoi en cours reste en cours : on le signale sans y toucher.
  select exists (
    select 1 from public.notifications_factures n
    where n.facture_id = p_facture_id and n.statut = 'envoi_en_cours'
  ) into v_incertain;

  if v_statut = 'payee' then
    return jsonb_build_object(
      'ok', true, 'deja_payee', true, 'envois_mis_de_cote', 0,
      'envoi_incertain', v_incertain, 'date_paiement', v_date_paiement);
  end if;

  -- L'envoi qui était programmé annonçait une facture à régler. Il est mis de
  -- côté avec un motif que l'écran sait traduire, et reste revalidable : si le
  -- garage veut quand même transmettre la facture acquittée, c'est son geste,
  -- pas un automatisme.
  with mises_de_cote as (
    update public.notifications_factures n
       set statut = 'bloque',
           derniere_erreur = 'facture marquée payée avant l''envoi : le message annonçait une facture à régler'
     where n.facture_id = p_facture_id
       and n.type = 'nouvelle'
       and n.statut = 'en_attente'
       and n.envoye = false
    returning 1
  )
  select count(*)::integer into v_annules from mises_de_cote;

  update public.factures
     set statut = 'payee', date_paiement = now()
   where id = p_facture_id
  returning date_paiement into v_date_paiement;

  return jsonb_build_object(
    'ok', true, 'deja_payee', false, 'envois_mis_de_cote', v_annules,
    'envoi_incertain', v_incertain, 'date_paiement', v_date_paiement);
end;
$function$;

comment on function public.marquer_facture_payee(uuid) is
  'Passe une facture au statut payé et met de côté, dans la même transaction, l''envoi qui était programmé — lequel annonçait une facture à régler. N''envoie rien, n''arme rien, ne touche jamais un envoi en cours. Idempotente.';

revoke execute on function public.marquer_facture_payee(uuid) from public, anon;
grant execute on function public.marquer_facture_payee(uuid) to authenticated;

-- ================================================================
-- 2. LE RÔLE ACCUEIL GÈRE LES FACTURES
-- ================================================================
--
-- DÉCISION PRODUIT DU 12 SEPTEMBRE 2026
--
-- L'accueil établit les devis et les envoie ; il tient le comptoir, donc il
-- encaisse et transmet les factures. Les fonctions d'envoi lui étaient déjà
-- ouvertes par `20260916000100` — mais la table, non : `factures` ne portait
-- que `factures_scope`, `garage_id = current_garage_id()`, et
-- `current_garage_id()` ne rend un garage qu'au propriétaire ou à un membre
-- **dirigeant**. Un compte accueil ne voyait donc aucune facture : il avait le
-- droit d'envoyer ce qu'il ne pouvait pas lire.
--
-- On suit le modèle des autres tables du lot accès salariés : une policy
-- distincte, nommée `_accueil`, appuyée sur `a_acces_garage` — le prédicat
-- unique, qui exige le rôle ET un accès de garage ouvert. Les policies
-- s'additionnent : celle du dirigeant n'est pas touchée.
--
-- Comme pour `ordres_reparation`, les droits sont **détaillés** plutôt que
-- `ALL` : lire, créer, modifier. Pas de suppression — une facture est une
-- pièce comptable, et rien dans l'écran ne la supprime. Ce qui n'est pas
-- accordé ici reste refusé en base, quel que soit l'affichage.
--
-- Ce que l'accueil ne gagne pas : les statistiques, les paramètres, la
-- gestion des accès, l'historique des devis. Aucune policy n'est ajoutée pour
-- eux. Le mécanicien et le salarié révoqué restent refusés partout :
-- `a_acces_garage` rend faux pour un rôle qui ne figure pas dans la liste,
-- pour une adhésion révoquée ou inactive, et pour un garage fermé.

drop policy if exists factures_accueil_select on public.factures;
create policy factures_accueil_select on public.factures
  for select to authenticated
  using (public.a_acces_garage(garage_id, 'accueil'));

drop policy if exists factures_accueil_insert on public.factures;
create policy factures_accueil_insert on public.factures
  for insert to authenticated
  with check (public.a_acces_garage(garage_id, 'accueil'));

drop policy if exists factures_accueil_update on public.factures;
create policy factures_accueil_update on public.factures
  for update to authenticated
  using (public.a_acces_garage(garage_id, 'accueil'))
  with check (public.a_acces_garage(garage_id, 'accueil'));

-- La révocation du lien public était restée sur la propriété du garage, alors
-- que sa création est ouverte au dirigeant et à l'accueil depuis
-- `20260916000100` : l'accueil pouvait produire un lien sans pouvoir le
-- couper. Même règle pour les deux gestes.
create or replace function public.revoquer_jeton_facture(p_facture_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_garage_id uuid;
begin
  select f.garage_id into v_garage_id
  from public.factures f
  where f.id = p_facture_id
  for update of f;

  if v_garage_id is null or not public.a_acces_garage(v_garage_id, 'dirigeant', 'accueil') then
    raise exception 'Facture introuvable ou accès refusé';
  end if;

  update public.factures_jetons
    set revoked_at = now()
    where facture_id = p_facture_id and revoked_at is null;

  return true;
end;
$function$;

revoke execute on function public.revoquer_jeton_facture(uuid) from public, anon;
grant execute on function public.revoquer_jeton_facture(uuid) to authenticated;
