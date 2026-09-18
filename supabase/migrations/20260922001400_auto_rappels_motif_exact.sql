-- Nexora Auto — le motif d'un rappel bloqué dit ce qui l'a bloqué.
--
-- `auto_terminer_rappel` (20260922001200) écrivait « refus définitif du
-- fournisseur » pour tout rappel bloqué, y compris quand rien n'avait été
-- remis au fournisseur : adresse inutilisable, message vide, ou garde de
-- l'essai réel (destinataire non autorisé). La vraie raison n'était que dans
-- `derniere_erreur`. Constaté en répétant l'essai réel, le 18 sept. 2026.
--
-- Désormais le motif reprend le motif classé transmis par n8n (déjà
-- expurgé : ni adresse, ni lien, ni clé), et garde l'ancien libellé à défaut.
-- Le reste du corps est identique.
--
-- Retour arrière : recréer la fonction telle que dans 20260922001200.

create or replace function public.auto_terminer_rappel(p_ref uuid, p_resultat text, p_motif text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ligne public.auto_rappels_envois%rowtype;
  v_statut text;
begin
  if p_resultat is null or p_resultat not in ('envoye', 'bloque', 'a_reprendre') then
    raise exception 'Résultat inconnu : %', p_resultat using errcode = '22023';
  end if;

  select * into v_ligne from public.auto_rappels_envois e where e.ref = p_ref for update;
  if v_ligne.id is null then
    return jsonb_build_object('clos', false, 'raison', 'introuvable');
  end if;
  if v_ligne.statut <> 'envoi_en_cours' then
    return jsonb_build_object('clos', false, 'raison', 'deja_clos', 'statut', v_ligne.statut);
  end if;

  if p_resultat = 'envoye' then
    update public.auto_rappels_envois e
       set statut = 'envoye', envoye_le = now(), derniere_erreur = null, motif = null, maj_le = now()
     where e.id = v_ligne.id;
    v_statut := 'envoye';
  elsif p_resultat = 'a_reprendre' and v_ligne.tentatives < 3 then
    update public.auto_rappels_envois e
       set statut = 'prevu',
           prochain_essai_le = now() + case v_ligne.tentatives when 1 then interval '30 minutes' else interval '2 hours' end,
           derniere_erreur = left(coalesce(p_motif, 'échec temporaire'), 500), maj_le = now()
     where e.id = v_ligne.id;
    v_statut := 'prevu';
  else
    update public.auto_rappels_envois e
       set statut = 'bloque',
           derniere_erreur = left(coalesce(p_motif, 'refus du fournisseur'), 500),
           -- Le motif dit ce qui a bloqué : le fournisseur, une vérification
           -- avant l'envoi (adresse inutilisable, message vide) ou la garde de
           -- l'essai réel. « Refus définitif du fournisseur » en toutes
           -- circonstances était faux (constat du 18 sept. 2026).
           motif = case when p_resultat = 'a_reprendre' then 'trois tentatives sans succès : rien ne part plus sans vérification'
                        else left(coalesce(nullif(btrim(p_motif), ''), 'refus définitif du fournisseur'), 300) end,
           maj_le = now()
     where e.id = v_ligne.id;
    v_statut := 'bloque';
  end if;

  return jsonb_build_object('clos', true, 'statut', v_statut, 'tentatives', v_ligne.tentatives);
end;
$$;

revoke all on function public.auto_terminer_rappel(uuid, text, text) from public, anon, authenticated;
grant execute on function public.auto_terminer_rappel(uuid, text, text) to service_role;
