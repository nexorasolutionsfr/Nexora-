-- Nexora Auto — arrêt d'urgence des rappels, indépendant de l'écran et de n8n.
--
-- ================================================================
-- 1. LE BESOIN
-- ================================================================
--
-- Pouvoir arrêter TOUT envoi de rappel en une instruction, sans dépendre :
--   - du panneau (NEXT_PUBLIC_AUTO_RAPPELS ne fait que l'afficher ou le
--     masquer : il n'arrête pas un rappel déjà programmé) ;
--   - de n8n (dépublier le workflow suppose d'avoir la main sur l'instance, et
--     une ancienne version réimportée repartirait).
--
-- Le seul passage obligé de tout envoi est la réservation. L'arrêt y est posé.
--
-- ================================================================
-- 2. CE QUI CHANGE
-- ================================================================
--
-- `auto_reserver_rappel` rend une réservation vide tant que
-- `parametres_envois` porte ('auto_rappels_arret', 'oui'). Le corps est
-- celui de 20260922001200, à ce seul test près.
--
--   Arrêter :  insert into public.parametres_envois (cle, valeur)
--                values ('auto_rappels_arret', 'oui')
--              on conflict (cle) do update set valeur = 'oui', maj_le = now();
--   Reprendre : update public.parametres_envois set valeur = 'non', maj_le = now()
--                where cle = 'auto_rappels_arret';
--
-- Pendant l'arrêt : le programmateur continue de tenir la file à jour (il
-- n'envoie rien), aucun jeton du débit commun n'est pris, aucune tentative
-- n'est consommée, aucune ligne n'est annulée. `parametres_envois` n'est
-- lisible ni modifiable par personne d'autre que le service et l'éditeur SQL.
--
-- ================================================================
-- 3. RETOUR ARRIÈRE
-- ================================================================
--
-- Recréer `auto_reserver_rappel` tel que dans 20260922001200.

create or replace function public.auto_reserver_rappel(
  p_proprietaires uuid[] default null,
  p_limite_heure integer default 40,
  p_limite_jour integer default 120,
  p_workflow_id text default null)
returns table (ref uuid, destinataire text, objet text, texte text, tentatives integer, echeance date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ligne public.auto_rappels_envois%rowtype;
  v_email text;
  v_jeton jsonb;
  v_aujourdhui date := (now() at time zone 'Europe/Paris')::date;
begin
  -- ARRÊT D'URGENCE (20260922001300) : rien n'est réservé, donc rien ne part,
  -- quel que soit l'état de n8n ou de l'écran. Rien n'est annulé non plus :
  -- à la levée, les rappels encore utiles repartent, les autres sont annulés
  -- par les gardes ci-dessous avec leur motif.
  if exists (select 1 from public.parametres_envois p where p.cle = 'auto_rappels_arret' and p.valeur = 'oui') then
    return;
  end if;

  update public.auto_rappels_envois e
     set statut = case
           when not a.actif or v.archive_le is not null or e.echeance <= v_aujourdhui
             or e.empreinte is distinct from public.auto_empreinte_ct(e.vehicule_id)
             or not public.auto_acces_autorise_pour(e.proprietaire_id)
           then 'annule'
           else 'bloque'
         end,
         motif = case
           when not a.actif then 'rappel arrêté par la personne'
           when v.archive_le is not null then 'voiture archivée : plus de rappel'
           when e.echeance <= v_aujourdhui then 'échéance atteinte avant l''envoi : trop tard pour être utile'
           when e.empreinte is distinct from public.auto_empreinte_ct(e.vehicule_id) then 'dossier modifié depuis la programmation : rappel recalculé au passage suivant'
           when not public.auto_acces_autorise_pour(e.proprietaire_id) then 'accès à Nexora Auto retiré : rien ne part'
           else 'adresse du compte changée depuis l''activation : la personne doit confirmer le rappel'
         end,
         maj_le = now()
    from public.auto_rappels_abonnements a, public.auto_vehicules v
   where a.id = e.abonnement_id and v.id = e.vehicule_id
     and e.statut = 'prevu' and e.prevu_le <= now()
     and (p_proprietaires is null or e.proprietaire_id = any(p_proprietaires))
     and (not a.actif
          or v.archive_le is not null
          or e.echeance <= v_aujourdhui
          or e.empreinte is distinct from public.auto_empreinte_ct(e.vehicule_id)
          or not public.auto_acces_autorise_pour(e.proprietaire_id)
          or a.adresse_consentie is distinct from (select lower(btrim(u.email)) from auth.users u where u.id = e.proprietaire_id));

  select * into v_ligne
    from public.auto_rappels_envois e
   where e.statut = 'prevu' and e.prevu_le <= now()
     and (e.prochain_essai_le is null or e.prochain_essai_le <= now())
     and e.tentatives < 3
     and (p_proprietaires is null or e.proprietaire_id = any(p_proprietaires))
   order by e.prevu_le, e.id
   limit 1
   for update skip locked;

  if v_ligne.id is null then
    return;
  end if;

  v_jeton := public.prendre_jeton_envoi('auto_rappels', v_ligne.ref, p_limite_heure, p_limite_jour, p_workflow_id);
  if not coalesce((v_jeton->>'ok')::boolean, false) then
    update public.auto_rappels_envois e
       set derniere_erreur = left('report : ' || coalesce(v_jeton->>'motif', 'débit d''envoi atteint'), 500), maj_le = now()
     where e.id = v_ligne.id;
    return;
  end if;

  select lower(btrim(u.email)) into v_email from auth.users u where u.id = v_ligne.proprietaire_id;

  update public.auto_rappels_envois e
     set statut = 'envoi_en_cours', tentatives = e.tentatives + 1, reserve_le = now(),
         destinataire = v_email, maj_le = now()
   where e.id = v_ligne.id;

  ref := v_ligne.ref; destinataire := v_email; objet := v_ligne.objet; texte := v_ligne.texte;
  tentatives := v_ligne.tentatives + 1; echeance := v_ligne.echeance;
  return next;
end;
$$;

revoke all on function public.auto_reserver_rappel(uuid[], integer, integer, text) from public, anon, authenticated;
grant execute on function public.auto_reserver_rappel(uuid[], integer, integer, text) to service_role;
