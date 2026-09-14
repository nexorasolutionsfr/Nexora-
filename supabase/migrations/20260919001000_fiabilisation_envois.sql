-- Fiabilisation des envois avant publication (revue du 15 septembre 2026).
--
-- 1. L'EMPREINTE DU DEVIS NE VOYAIT PAS CE QUE LE CLIENT LIT
--
-- `empreinte_devis` (20260919000100) signait les montants, le nombre de lignes
-- et l'état de chiffrage. Scénario reproduit sur Test : autoriser l'envoi,
-- renommer une ligne (« Plaquettes avant » → « Disques et plaquettes ») sans
-- toucher au total ni au nombre de lignes, puis réserver : la notification
-- partait avec un lien vers un devis que le garage n'avait pas validé. Même
-- chose pour le texte du constat ou une photo ajoutée au point repris.
--
-- L'empreinte signe désormais la projection publique elle-même : pour chaque
-- ligne, libellé, type, quantité, prix, TVA, « prix à renseigner », constat
-- montré au client et identifiants des photos montrées (`preuves_devis`, qui
-- suit le constat tant que le devis est modifiable et renvoie les photos
-- figées ensuite) ; pour le devis, montants, statut, véhicule et prestation
-- tels qu'affichés.
--
-- Effets, et rien d'autre :
--   - une notification `en_attente` dont le document a changé est mise de côté
--     par `reserver_notifications`, exactement comme avant (motif inchangé) ;
--     le garage revalide ;
--   - un devis accepté ou refusé ne bouge plus : ses photos sont figées
--     (000800), leur suppression reste refusée ; l'empreinte d'un accusé de
--     réception autorisé après la décision reste stable ;
--   - AU PASSAGE DE LA MIGRATION, toute notification de devis déjà autorisée et
--     pas encore partie change d'empreinte et sera mise de côté : voir le plan
--     de publication. Jamais de réautorisation automatique.
--
-- 2. LES RELANCES IGNORAIENT L'OPPOSITION DU CLIENT
--
-- Le mécanisme existant est le journal `revenue_recovery_permissions`
-- (20260831000200 → 001200) : une décision par (garage, client, canal),
-- la plus récente fait foi, écrite seulement par
-- `revenue_recovery_enregistrer_permission`. Aucune fonction des relances de
-- travaux différés ne le lisait. Désormais :
--   - préparation : aucun brouillon pour un client opposé ; un brouillon ou une
--     autorisation encore non partie est annulé (« le client s'est opposé ») ;
--   - autorisation : refusée (`client_oppose`) ;
--   - réservation : une relance autorisée dont le client s'est opposé depuis
--     est mise de côté dans la même instruction atomique, avant la prise.
-- « oppose » et « revoque » bloquent. « inconnu » (aucune ligne) et « expire »
-- ne bloquent pas : la relance reste subordonnée à l'autorisation explicite du
-- garage, message par message. Ce qui manque encore (saisie de l'opposition à
-- l'écran, lien d'opposition dans le message, base légale) est documenté dans
-- le plan n8n et bloque l'ACTIVATION des relances, pas cette migration.
--
-- Additive : aucune donnée transformée, aucune signature changée, droits
-- d'exécution conservés par `create or replace`.

-- ----------------------------------------------------------------
-- 1. Empreinte du devis
-- ----------------------------------------------------------------
create or replace function public.empreinte_devis(p_devis_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(extensions.digest(
    concat_ws('|',
      d.montant_ht, d.montant_ttc, d.statut, d.prestation_id, d.vehicule_id, d.client_id,
      p.nom, v.marque, v.modele,
      (select count(*) from public.devis_lignes l where l.devis_id = d.id),
      public.devis_chiffrage_incomplet(d.id),
      coalesce((
        select string_agg(concat_ws('~', l.id, l.position, l.type, l.libelle, l.quantite,
                                    l.prix_unitaire_ht, l.taux_tva, l.prix_a_renseigner,
                                    l.note_constat, l.inspection_point_id),
                          '¤' order by l.position, l.created_at, l.id)
          from public.devis_lignes l where l.devis_id = d.id), ''),
      coalesce((
        select string_agg(pv.devis_ligne_id::text || '@' || pv.photo_id::text, ','
                          order by pv.devis_ligne_id, pv.rang, pv.photo_id)
          from public.preuves_devis(d.id) pv), '')
    ),
    'sha256'), 'hex')
  from public.devis d
  left join public.prestations p on p.id = d.prestation_id
  left join public.vehicules v on v.id = d.vehicule_id
  where d.id = p_devis_id;
$$;

comment on function public.empreinte_devis(uuid) is
  'Signature de ce que le client lit sur son lien : montants, statut, véhicule, prestation, et pour chaque ligne libellé, quantité, prix, TVA, prix à renseigner, constat et photos montrées. Comparée par reserver_notifications : tout écart met la notification de côté (revalidation). 20260919001000.';

-- ----------------------------------------------------------------
-- 2. Opposition du client aux relances
-- ----------------------------------------------------------------
create or replace function public.client_oppose_relances(p_garage_id uuid, p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p.statut in ('oppose', 'revoque')
      from public.revenue_recovery_permissions p
     where p.garage_id = p_garage_id and p.client_id = p_client_id and p.canal = 'email'
     order by p.created_at desc, p.numero_sequence desc
     limit 1), false);
$$;

revoke all on function public.client_oppose_relances(uuid, uuid) from public, anon, authenticated;

comment on function public.client_oppose_relances(uuid, uuid) is
  'Vrai si la décision la plus récente du journal revenue_recovery_permissions (canal email) est une opposition ou une révocation. Interne aux fonctions des relances de travaux différés.';

create or replace function public.preparer_relances_travaux(
  p_garages uuid[] default null,
  p_aujourdhui date default current_date,
  p_travaux uuid[] default null
)
returns table (action text, relance_id uuid, travail_id uuid, garage_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t record;
  v_msg jsonb;
  v_id uuid;
begin
  for v_t in
    update public.relances_travaux r
       set statut = 'obsolete',
           motif = 'le travail a été reporté au ' || to_char(t.date_relance, 'DD/MM/YYYY') || ' : une nouvelle relance sera préparée à cette date'
      from public.travaux_differes t
     where t.id = r.travail_differe_id
       and (p_garages is null or r.garage_id = any(p_garages))
       and (p_travaux is null or r.travail_differe_id = any(p_travaux))
       and r.statut in ('a_relire', 'en_attente', 'bloque')
       and r.echeance is distinct from t.date_relance
     returning r.id, r.travail_differe_id, r.garage_id
  loop
    action := 'obsolete'; relance_id := v_t.id; travail_id := v_t.travail_differe_id; garage_id := v_t.garage_id;
    return next;
  end loop;

  for v_t in
    update public.relances_travaux r
       set statut = 'annulee',
           motif = case
             when t.statut = 'recupere' then 'travail récupéré : plus rien à relancer'
             when t.statut = 'refus_definitif' then 'refus définitif du client : on n''insiste pas'
             else 'le client s''est opposé aux relances : on n''insiste pas' end
      from public.travaux_differes t
     where t.id = r.travail_differe_id
       and (p_garages is null or r.garage_id = any(p_garages))
       and (p_travaux is null or r.travail_differe_id = any(p_travaux))
       and r.statut in ('a_relire', 'en_attente', 'bloque')
       and (t.statut in ('recupere', 'refus_definitif')
            or public.client_oppose_relances(t.garage_id, t.client_id))
     returning r.id, r.travail_differe_id, r.garage_id
  loop
    action := 'annulee'; relance_id := v_t.id; travail_id := v_t.travail_differe_id; garage_id := v_t.garage_id;
    return next;
  end loop;

  for v_t in
    select t.*
      from public.travaux_differes t
     where (p_garages is null or t.garage_id = any(p_garages))
       and (p_travaux is null or t.id = any(p_travaux))
       and t.statut in ('planifie', 'a_relancer')
       and t.date_relance <= p_aujourdhui
       and not public.client_oppose_relances(t.garage_id, t.client_id)
       and not exists (
         select 1 from public.relances_travaux r
          where r.travail_differe_id = t.id and r.echeance = t.date_relance)
     order by t.date_relance, t.created_at
  loop
    v_msg := public.composer_relance_travail(v_t.id);
    v_id := null;
    insert into public.relances_travaux
      (garage_id, travail_differe_id, client_id, vehicule_id, echeance, statut, sujet, texte, motif)
    values
      (v_t.garage_id, v_t.id, v_t.client_id, v_t.vehicule_id, v_t.date_relance, 'a_relire',
       v_msg->>'sujet', v_msg->>'texte',
       case when coalesce(v_msg->>'destinataire', '') = '' then 'le client n''a pas d''adresse e-mail : à joindre autrement' else null end)
    on conflict (travail_differe_id, echeance) do nothing
    returning id into v_id;
    if v_id is not null then
      action := 'preparee'; relance_id := v_id; travail_id := v_t.id; garage_id := v_t.garage_id;
      return next;
    end if;
  end loop;
end;
$$;

create or replace function public.autoriser_envoi_relance_travail(p_relance_id uuid, p_destinataire text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_r public.relances_travaux%rowtype; v_t public.travaux_differes%rowtype; v_email text;
begin
  select * into v_r from public.relances_travaux r where r.id = p_relance_id for update;
  if not found or not public.a_acces_garage(v_r.garage_id, 'dirigeant', 'accueil') then
    raise exception 'Relance introuvable ou accès refusé';
  end if;
  if v_r.statut in ('en_attente', 'envoi_en_cours') then
    return jsonb_build_object('ok', true, 'deja_autorise', true);
  end if;
  if v_r.statut not in ('a_relire', 'bloque') then
    return jsonb_build_object('ok', false, 'raison', 'statut', 'statut', v_r.statut);
  end if;
  select * into v_t from public.travaux_differes t where t.id = v_r.travail_differe_id;
  if v_t.statut not in ('planifie', 'a_relancer') then
    return jsonb_build_object('ok', false, 'raison', 'travail_clos');
  end if;
  if v_t.date_relance is distinct from v_r.echeance then
    return jsonb_build_object('ok', false, 'raison', 'travail_reporte');
  end if;
  if public.client_oppose_relances(v_r.garage_id, v_t.client_id) then
    return jsonb_build_object('ok', false, 'raison', 'client_oppose');
  end if;
  select lower(trim(c.email)) into v_email from public.clients c where c.id = v_t.client_id;
  if coalesce(v_email, '') = '' then
    return jsonb_build_object('ok', false, 'raison', 'destinataire_absent');
  end if;
  if lower(trim(p_destinataire)) is distinct from v_email then
    return jsonb_build_object('ok', false, 'raison', 'destinataire_different');
  end if;

  update public.relances_travaux
     set statut = 'en_attente', derniere_erreur = null, motif = null,
         destinataire_valide = v_email,
         autorise_par = auth.uid(), autorise_le = now()
   where id = p_relance_id;
  update public.relances_travaux
     set empreinte_document = public.empreinte_relance_travail(p_relance_id)
   where id = p_relance_id;
  return jsonb_build_object('ok', true, 'deja_autorise', false);
end;
$$;

create or replace function public.reserver_relances_travaux(
  p_limite integer default 10,
  p_garages uuid[] default null,
  p_relances uuid[] default null
)
returns table (id uuid, garage_id uuid, sujet text, texte text, destinataire text, expediteur_nom text, repondre_a text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limite is null or p_limite < 1 or p_limite > 200 then
    raise exception 'Limite hors bornes';
  end if;

  update public.relances_travaux r
     set statut = 'bloque',
         derniere_erreur = case
           when t.statut not in ('planifie', 'a_relancer') then 'le travail a été clos après l''autorisation : rien à relancer'
           when t.date_relance is distinct from r.echeance then 'le travail a été reporté après l''autorisation : nouvelle relance à la nouvelle date'
           when public.client_oppose_relances(r.garage_id, t.client_id) then 'le client s''est opposé aux relances après l''autorisation : rien ne part'
           when r.destinataire_valide is distinct from lower(trim(coalesce(c.email, ''))) then 'le destinataire a changé depuis la validation : nouvelle validation nécessaire'
           else 'le message a changé depuis la validation : nouvelle validation nécessaire'
         end
    from public.travaux_differes t left join public.clients c on c.id = t.client_id
   where t.id = r.travail_differe_id
     and (p_garages is null or r.garage_id = any(p_garages))
     and (p_relances is null or r.id = any(p_relances))
     and r.statut = 'en_attente'
     and (t.statut not in ('planifie', 'a_relancer')
          or t.date_relance is distinct from r.echeance
          or public.client_oppose_relances(r.garage_id, t.client_id)
          or r.destinataire_valide is distinct from lower(trim(coalesce(c.email, '')))
          or (r.empreinte_document is not null and r.empreinte_document is distinct from public.empreinte_relance_travail(r.id)));

  return query
  with a_prendre as (
    select r.id
      from public.relances_travaux r
     where r.statut = 'en_attente'
       and (p_garages is null or r.garage_id = any(p_garages))
       and (p_relances is null or r.id = any(p_relances))
       and r.tentatives < 3
     order by r.created_at
     limit p_limite
     for update skip locked
  ), prises as (
    update public.relances_travaux r
       set statut = 'envoi_en_cours', tentatives = r.tentatives + 1
      from a_prendre p
     where r.id = p.id
     returning r.id, r.garage_id, r.sujet, r.texte, r.destinataire_valide
  )
  select p.id, p.garage_id, p.sujet, p.texte, p.destinataire_valide,
         g.nom_garage, lower(trim(coalesce(g.email, '')))
    from prises p join public.garages g on g.id = p.garage_id;
end;
$$;
