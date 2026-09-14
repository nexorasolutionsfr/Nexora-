-- Préparation de suivi d'un travail différé : une tâche unique, un brouillon
-- à relire, une autorisation, une réservation, un résultat.
--
-- ================================================================
-- 1. LE BESOIN
-- ================================================================
--
-- « Pneus à changer avant l'hiver », noté en juin avec une date de relance :
-- `travaux_differes` le porte déjà (intervention, niveau, date_relance,
-- statut, source, devis_id). À l'échéance, la ligne monte dans « À traiter »
-- et… c'est tout : rien n'est préparé, le garage rédige, ou n'écrit pas.
--
-- Ce que ce lot ajoute, et rien de plus : à l'échéance, UNE relance par
-- travail et par échéance, avec un brouillon composé en base à partir des
-- données du garage. Le garage la relit, corrige, autorise — ou l'annule.
-- Rien ne part sans autorisation. Un travail reporté déplace la relance ; un
-- travail clos (récupéré, refus définitif) l'annule. Un passage répété ne
-- crée rien deux fois.
--
-- ================================================================
-- 2. LA CHAÎNE, ET QUI FAIT QUOI
-- ================================================================
--
--   candidat (travaux_differes échu)
--     → brouillon à relire        preparer_relances_travaux()   [service_role, tournée n8n]
--     → autorisation              autoriser_envoi_relance_travail() [dirigeant/accueil, écran]
--     → réservation               reserver_relances_travaux()   [service_role, n8n]
--     → tentative fournisseur     n8n (SMTP), hors base
--     → résultat                  terminer_relance_travail()    [service_role, n8n]
--
-- Le MESSAGE est composé UNE fois, en base (`composer_relance_travail`), au
-- moment de la préparation. L'écran montre ce texte-là ; n8n envoie ce
-- texte-là. Pas de second composeur dans le workflow — c'est le défaut relevé
-- sur « véhicule prêt » (deux compositions), qu'on ne reproduit pas ici.
--
-- Mêmes règles que le socle d'envoi (20260914…, 20260918…) :
--   - `destinataire_valide` et `empreinte_document` figent ce que le garage a
--     relu ; la réservation écarte ce qui a bougé depuis ;
--   - `envoi_en_cours` n'est JAMAIS recyclé par un délai : un envoi dont on
--     ignore l'issue reste incertain, un humain tranche ;
--   - `a_reprendre` remet en attente, bornée par `tentatives` (3) ;
--   - aucune promesse « exactement une fois » avec SMTP.
--
-- Retour arrière : supprimer la table et ses fonctions ; `travaux_differes`
-- n'est pas modifiée.

-- ----------------------------------------------------------------
-- a. La table
-- ----------------------------------------------------------------

create table if not exists public.relances_travaux (
  id uuid primary key default gen_random_uuid(),
  garage_id uuid not null references public.garages(id) on delete cascade,
  travail_differe_id uuid not null references public.travaux_differes(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  vehicule_id uuid references public.vehicules(id) on delete set null,
  -- L'échéance pour laquelle cette relance a été préparée : la date_relance
  -- du travail au moment de la préparation. Un report la rend obsolète.
  echeance date not null,
  statut text not null default 'a_relire',
  sujet text not null,
  texte text not null,
  destinataire_valide text,
  empreinte_document text,
  autorise_par uuid,
  autorise_le timestamptz,
  tentatives integer not null default 0,
  envoye boolean not null default false,
  derniere_erreur text,
  motif text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint relances_travaux_statut_connu check (statut in ('a_relire', 'en_attente', 'envoi_en_cours', 'envoye', 'bloque', 'annulee', 'obsolete')),
  constraint relances_travaux_une_par_echeance unique (travail_differe_id, echeance)
);

create index if not exists relances_travaux_garage_statut_idx on public.relances_travaux (garage_id, statut);

comment on table public.relances_travaux is
  'Relance préparée pour un travail différé, à une échéance. Une seule par (travail, échéance). Naît à_relire : rien ne part sans autoriser_envoi_relance_travail. Voir 20260919000400.';

alter table public.relances_travaux enable row level security;

drop policy if exists relances_travaux_equipe_select on public.relances_travaux;
create policy relances_travaux_equipe_select on public.relances_travaux
  for select to authenticated
  using (public.a_acces_garage(garage_id, 'dirigeant', 'accueil'));
-- Aucune écriture directe : tout passe par les fonctions ci-dessous.
revoke all on table public.relances_travaux from public, anon;
grant select on table public.relances_travaux to authenticated;
grant all on table public.relances_travaux to service_role;

create or replace function public.relances_travaux_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;
drop trigger if exists relances_travaux_updated_at on public.relances_travaux;
create trigger relances_travaux_updated_at before update on public.relances_travaux
  for each row execute function public.relances_travaux_set_updated_at();

-- ----------------------------------------------------------------
-- b. Le message, composé une fois
-- ----------------------------------------------------------------

create or replace function public.composer_relance_travail(p_travail_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'sujet', 'Un point sur votre ' || coalesce(nullif(btrim(coalesce(v.marque,'') || ' ' || coalesce(v.modele,'')), ''), 'véhicule'),
    'texte',
      'Bonjour ' || coalesce(c.nom, '') || ',' || E'\n\n' ||
      'Lors de votre dernier passage chez ' || coalesce(g.nom_garage, 'votre garage') || ', nous avions noté : ' ||
      t.intervention ||
      case when t.montant_ttc is not null then ' (estimation : ' || to_char(t.montant_ttc, 'FM999G999D00') || ' € TTC)' else '' end || '.' || E'\n\n' ||
      case t.niveau
        when 'securite' then 'Ce point touche à votre sécurité : nous vous conseillons de ne pas trop attendre.'
        when 'important' then 'Ce point mérite d''être traité prochainement.'
        else 'Si vous le souhaitez, nous pouvons le planifier à votre convenance.'
      end || E'\n\n' ||
      'Répondez à ce message ou appelez-nous' || case when g.telephone is not null then ' au ' || g.telephone else '' end || '.' || E'\n\n' ||
      coalesce(g.nom_garage, ''),
    'destinataire', lower(trim(coalesce(c.email, ''))),
    'client_nom', c.nom,
    'vehicule', nullif(btrim(coalesce(v.marque,'') || ' ' || coalesce(v.modele,'') || ' ' || coalesce(v.immatriculation,'')), ''),
    'garage_nom', g.nom_garage
  )
  from public.travaux_differes t
  join public.garages g on g.id = t.garage_id
  left join public.clients c on c.id = t.client_id
  left join public.vehicules v on v.id = t.vehicule_id
  where t.id = p_travail_id;
$$;

revoke all on function public.composer_relance_travail(uuid) from public, anon, authenticated;

create or replace function public.empreinte_relance_travail(p_relance_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(extensions.digest(
    coalesce(r.sujet,'') || '|' || coalesce(r.texte,'') || '|' || coalesce(r.echeance::text,'') || '|' ||
    coalesce(t.statut,'') || '|' || coalesce(t.date_relance::text,'') || '|' || lower(trim(coalesce(c.email,''))),
    'sha256'), 'hex')
  from public.relances_travaux r
  join public.travaux_differes t on t.id = r.travail_differe_id
  left join public.clients c on c.id = t.client_id
  where r.id = p_relance_id;
$$;

revoke all on function public.empreinte_relance_travail(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------
-- c. La préparation : idempotente, bornée aux garages demandés
-- ----------------------------------------------------------------

create or replace function public.preparer_relances_travaux(
  p_garages uuid[] default null,
  p_aujourdhui date default current_date
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
  -- 1. Le travail a été REPORTÉ : la relance préparée pour l'ancienne
  --    échéance ne correspond plus à rien. Seulement si elle attendait encore
  --    une relecture ou une autorisation ; un envoi parti reste parti.
  for v_t in
    update public.relances_travaux r
       set statut = 'obsolete',
           motif = 'le travail a été reporté au ' || to_char(t.date_relance, 'DD/MM/YYYY') || ' : une nouvelle relance sera préparée à cette date'
      from public.travaux_differes t
     where t.id = r.travail_differe_id
       and (p_garages is null or r.garage_id = any(p_garages))
       and r.statut in ('a_relire', 'en_attente', 'bloque')
       and r.echeance is distinct from t.date_relance
     returning r.id, r.travail_differe_id, r.garage_id
  loop
    action := 'obsolete'; relance_id := v_t.id; travail_id := v_t.travail_differe_id; garage_id := v_t.garage_id;
    return next;
  end loop;

  -- 2. Le travail est CLOS (récupéré, ou refus définitif) : on n'écrit plus.
  for v_t in
    update public.relances_travaux r
       set statut = 'annulee',
           motif = case t.statut when 'recupere' then 'travail récupéré : plus rien à relancer'
                                 else 'refus définitif du client : on n''insiste pas' end
      from public.travaux_differes t
     where t.id = r.travail_differe_id
       and (p_garages is null or r.garage_id = any(p_garages))
       and r.statut in ('a_relire', 'en_attente', 'bloque')
       and t.statut in ('recupere', 'refus_definitif')
     returning r.id, r.travail_differe_id, r.garage_id
  loop
    action := 'annulee'; relance_id := v_t.id; travail_id := v_t.travail_differe_id; garage_id := v_t.garage_id;
    return next;
  end loop;

  -- 3. Échéance atteinte, rien de préparé pour cette échéance : on prépare.
  --    `contacte_en_attente` n'est pas relancé : le garage a déjà écrit.
  for v_t in
    select t.*
      from public.travaux_differes t
     where (p_garages is null or t.garage_id = any(p_garages))
       and t.statut in ('planifie', 'a_relancer')
       and t.date_relance <= p_aujourdhui
       and not exists (
         select 1 from public.relances_travaux r
          where r.travail_differe_id = t.id and r.echeance = t.date_relance)
     order by t.date_relance, t.created_at
  loop
    v_msg := public.composer_relance_travail(v_t.id);
    insert into public.relances_travaux
      (garage_id, travail_differe_id, client_id, vehicule_id, echeance, statut, sujet, texte,
       motif)
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

revoke all on function public.preparer_relances_travaux(uuid[], date) from public, anon, authenticated;
grant execute on function public.preparer_relances_travaux(uuid[], date) to service_role;

comment on function public.preparer_relances_travaux(uuid[], date) is
  'Tournée de préparation (n8n, service_role). Rend obsolète ce que le report a déplacé, annule ce que la clôture a clos, prépare une relance à_relire par (travail, échéance) atteinte. Idempotente : un second passage ne rend rien. N''envoie rien.';

-- ----------------------------------------------------------------
-- d. Les gestes du garage : relire, corriger, autoriser, annuler
-- ----------------------------------------------------------------

create or replace function public.modifier_relance_travail(p_relance_id uuid, p_sujet text, p_texte text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_r public.relances_travaux%rowtype;
begin
  select * into v_r from public.relances_travaux r where r.id = p_relance_id for update;
  if not found or not public.a_acces_garage(v_r.garage_id, 'dirigeant', 'accueil') then
    raise exception 'Relance introuvable ou accès refusé';
  end if;
  if v_r.statut not in ('a_relire', 'bloque') then
    return jsonb_build_object('ok', false, 'raison', 'statut', 'statut', v_r.statut);
  end if;
  if coalesce(btrim(p_sujet), '') = '' or coalesce(btrim(p_texte), '') = '' then
    return jsonb_build_object('ok', false, 'raison', 'texte_vide');
  end if;
  update public.relances_travaux set sujet = btrim(p_sujet), texte = btrim(p_texte) where id = p_relance_id;
  return jsonb_build_object('ok', true);
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

create or replace function public.annuler_relance_travail(p_relance_id uuid, p_motif text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_r public.relances_travaux%rowtype;
begin
  select * into v_r from public.relances_travaux r where r.id = p_relance_id for update;
  if not found or not public.a_acces_garage(v_r.garage_id, 'dirigeant', 'accueil') then
    raise exception 'Relance introuvable ou accès refusé';
  end if;
  if v_r.statut not in ('a_relire', 'en_attente', 'bloque') then
    return jsonb_build_object('ok', false, 'raison', 'statut', 'statut', v_r.statut);
  end if;
  update public.relances_travaux
     set statut = 'annulee', motif = coalesce(nullif(btrim(p_motif), ''), 'annulée par le garage')
   where id = p_relance_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.modifier_relance_travail(uuid, text, text) from public, anon;
revoke all on function public.autoriser_envoi_relance_travail(uuid, text) from public, anon;
revoke all on function public.annuler_relance_travail(uuid, text) from public, anon;
grant execute on function public.modifier_relance_travail(uuid, text, text) to authenticated;
grant execute on function public.autoriser_envoi_relance_travail(uuid, text) to authenticated;
grant execute on function public.annuler_relance_travail(uuid, text) to authenticated;

-- ----------------------------------------------------------------
-- e. Réservation et clôture (n8n, service_role) — mêmes règles que le socle
-- ----------------------------------------------------------------

create or replace function public.reserver_relances_travaux(p_limite integer default 10, p_garages uuid[] default null)
returns table (id uuid, garage_id uuid, sujet text, texte text, destinataire text, expediteur_nom text, repondre_a text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limite is null or p_limite < 1 or p_limite > 200 then
    raise exception 'Limite hors bornes';
  end if;

  -- Les conditions sont RELUES au moment de réserver : travail encore ouvert
  -- et non reporté, destinataire inchangé, message inchangé.
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
     and r.statut = 'en_attente'
     and (t.statut not in ('planifie', 'a_relancer')
          or t.date_relance is distinct from r.echeance
          or r.destinataire_valide is distinct from lower(trim(coalesce(c.email, '')))
          or (r.empreinte_document is not null and r.empreinte_document is distinct from public.empreinte_relance_travail(r.id)));

  -- Une réservation prend une ligne une fois : SKIP LOCKED contre deux
  -- consommateurs simultanés ; `envoi_en_cours` n'est jamais repris ici.
  return query
  with a_prendre as (
    select r.id
      from public.relances_travaux r
     where r.statut = 'en_attente'
       and (p_garages is null or r.garage_id = any(p_garages))
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

revoke all on function public.reserver_relances_travaux(integer, uuid[]) from public, anon, authenticated;
grant execute on function public.reserver_relances_travaux(integer, uuid[]) to service_role;

create or replace function public.terminer_relance_travail(p_id uuid, p_resultat text, p_motif text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_resultat not in ('envoye', 'bloque', 'a_reprendre') then
    raise exception 'Résultat inconnu : %', p_resultat;
  end if;
  update public.relances_travaux
     set envoye = (p_resultat = 'envoye'),
         statut = case p_resultat when 'a_reprendre' then 'en_attente' else p_resultat end,
         derniere_erreur = p_motif
   where id = p_id and statut = 'envoi_en_cours';
end;
$$;

revoke all on function public.terminer_relance_travail(uuid, text, text) from public, anon, authenticated;
grant execute on function public.terminer_relance_travail(uuid, text, text) to service_role;

comment on function public.reserver_relances_travaux(integer, uuid[]) is
  'Réservation atomique (service_role, n8n) : relit les conditions, met de côté ce qui a bougé, prend jusqu''à p_limite lignes en_attente (tentatives < 3) et les passe envoi_en_cours. Ne reprend jamais une ligne envoi_en_cours.';
