-- Nexora Auto — dernier contrôle avant la transmission d'un rappel.
--
-- ================================================================
-- 1. LE BESOIN
-- ================================================================
--
-- L'arrêt d'urgence (20260922001300) bloque les NOUVELLES réservations. Un
-- rappel déjà réservé — entre sa réservation et sa remise au fournisseur —
-- lui échappait : le workflow l'aurait transmis quand même.
--
-- ================================================================
-- 2. CE QUI CHANGE
-- ================================================================
--
-- `auto_confirmer_transmission(ref)`, appelée par le workflow juste avant le
-- nœud d'envoi, et dont la réponse seule ouvre ce nœud :
--   - rappel toujours « envoi_en_cours » et pas d'arrêt   → { ok: true } ;
--   - arrêt d'urgence posé → { ok: false } et le rappel redevient « prevu »
--     comme s'il n'avait jamais été réservé : tentative rendue, jeton du
--     débit commun rendu, report tracé. À la levée, il repart ;
--   - rappel qui n'est plus « envoi_en_cours » (clos ailleurs) → { ok: false },
--     rien ne change.
--
-- CE QUE CE CONTRÔLE NE PEUT PAS FAIRE : retenir un message dont la
-- transmission a commencé. Entre ce contrôle et l'acceptation par Brevo, il
-- reste la durée d'un échange SMTP ; une fois le message accepté par Brevo,
-- Nexora n'a plus aucun moyen de le retenir.
--
-- ================================================================
-- 3. RETOUR ARRIÈRE
-- ================================================================
--
-- drop function public.auto_confirmer_transmission(uuid) — après avoir remis
-- le workflow sans le nœud « Confirmer la transmission ».

create or replace function public.auto_confirmer_transmission(p_ref uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ligne public.auto_rappels_envois%rowtype;
begin
  select * into v_ligne from public.auto_rappels_envois e where e.ref = p_ref for update;
  if v_ligne.id is null then
    return jsonb_build_object('ok', false, 'raison', 'rappel introuvable');
  end if;
  if v_ligne.statut <> 'envoi_en_cours' then
    return jsonb_build_object('ok', false, 'raison', 'rappel plus en cours d''envoi : ' || v_ligne.statut);
  end if;

  if exists (select 1 from public.parametres_envois p where p.cle = 'auto_rappels_arret' and p.valeur = 'oui') then
    -- Le jeton pris par CETTE réservation (même transaction, même instant).
    delete from public.envois_debit d
     where d.file = 'auto_rappels' and d.notification_id = v_ligne.ref and d.pris_le >= v_ligne.reserve_le;
    update public.auto_rappels_envois e
       set statut = 'prevu', tentatives = greatest(e.tentatives - 1, 0), reserve_le = null, destinataire = null,
           derniere_erreur = 'report : arrêt d''urgence avant la transmission, rien n''est parti', maj_le = now()
     where e.id = v_ligne.id;
    return jsonb_build_object('ok', false, 'raison', 'arrêt d''urgence : rien n''est parti, rappel remis en attente');
  end if;

  return jsonb_build_object('ok', true, 'raison', null);
end;
$$;

revoke all on function public.auto_confirmer_transmission(uuid) from public, anon, authenticated;
grant execute on function public.auto_confirmer_transmission(uuid) to service_role;

comment on function public.auto_confirmer_transmission(uuid) is
  'Dernier contrôle avant la remise d''un rappel au fournisseur : arrêt d''urgence posé → rappel remis en attente, rien ne part. Ne peut rien pour un message déjà transmis.';
