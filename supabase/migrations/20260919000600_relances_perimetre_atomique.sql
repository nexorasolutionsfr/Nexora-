-- Relances de travaux différés : un périmètre explicite, DANS l'opération.
--
-- ================================================================
-- 1. L'INCIDENT QUI L'A MONTRÉ (14 septembre 2026)
-- ================================================================
--
-- Le script de recette serveur appelait `reserver_relances_travaux` borné au
-- seul garage de recette. Une relance autorisée depuis l'écran dans ce même
-- garage (`fb259234-68bb-4aa0-ae1a-86ab34dead73`) a donc été réservée par le
-- script et passée `envoi_en_cours`, sans transport. Trace complète :
-- docs/recette/incident-relance-2026-09-14.md.
--
-- Un contrôle préalable côté script (« aucune autre relance en attente »)
-- ne suffit pas : une ligne peut être autorisée entre ce contrôle et la
-- réservation. La borne doit être dans la même instruction SQL que la prise.
--
-- ================================================================
-- 2. CE QUE FAIT CETTE MIGRATION
-- ================================================================
--
-- a. `reserver_relances_travaux(p_limite, p_garages, p_relances)` : quand
--    `p_relances` est fourni, la mise de côté ET la réservation ne touchent
--    que ces lignes. Un tableau vide ne prend rien. `NULL` (valeur par
--    défaut, celle du workflow de Production) garde exactement le
--    comportement de 20260919000400 : rien n'est affaibli.
--
-- b. `preparer_relances_travaux(p_garages, p_aujourdhui, p_travaux)` : même
--    borne, pour la mise en obsolescence, l'annulation et la préparation.
--    Une recette ne rend plus obsolète ni n'annule la relance d'un travail
--    qui n'est pas le sien.
--
-- Les signatures changent (paramètre ajouté) : les anciennes sont supprimées
-- pour qu'aucun appel nommé ne devienne ambigu, puis les droits sont reposés
-- à l'identique (service_role seul).
--
-- Retour arrière : recréer les deux fonctions depuis 20260919000400.

drop function if exists public.reserver_relances_travaux(integer, uuid[]);
drop function if exists public.preparer_relances_travaux(uuid[], date);

create function public.preparer_relances_travaux(
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
           motif = case t.statut when 'recupere' then 'travail récupéré : plus rien à relancer'
                                 else 'refus définitif du client : on n''insiste pas' end
      from public.travaux_differes t
     where t.id = r.travail_differe_id
       and (p_garages is null or r.garage_id = any(p_garages))
       and (p_travaux is null or r.travail_differe_id = any(p_travaux))
       and r.statut in ('a_relire', 'en_attente', 'bloque')
       and t.statut in ('recupere', 'refus_definitif')
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

create function public.reserver_relances_travaux(
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

revoke all on function public.preparer_relances_travaux(uuid[], date, uuid[]) from public, anon, authenticated;
revoke all on function public.reserver_relances_travaux(integer, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.preparer_relances_travaux(uuid[], date, uuid[]) to service_role;
grant execute on function public.reserver_relances_travaux(integer, uuid[], uuid[]) to service_role;

comment on function public.reserver_relances_travaux(integer, uuid[], uuid[]) is
  'Réservation atomique (service_role, n8n). p_relances NULL = toutes les lignes en_attente des garages demandés (Production) ; p_relances fourni = ces lignes seulement, pour la mise de côté comme pour la prise (recette). Ne reprend jamais une ligne envoi_en_cours.';
comment on function public.preparer_relances_travaux(uuid[], date, uuid[]) is
  'Tournée de préparation (service_role). p_travaux NULL = tous les travaux des garages demandés ; fourni = ces travaux seulement. Idempotente, n''envoie rien.';
