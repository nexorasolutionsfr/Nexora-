-- Nexora Auto — le premier rappel : le contrôle technique, par e-mail.
--
-- ================================================================
-- 1. LE BESOIN
-- ================================================================
--
-- La personne doit pouvoir choisir d'être prévenue avant l'échéance de son
-- contrôle technique, sans devoir ouvrir l'application pour y penser.
--
-- Rien n'est envoyé sans qu'elle l'ait demandé ICI, dans Nexora Auto : aucun
-- consentement ni réglage du compte garage (Nexora Pro) n'est repris.
--
-- ================================================================
-- 2. CE QUI EST RÉUTILISÉ, CE QUI EST AJOUTÉ
-- ================================================================
--
-- Réutilisé tel quel, du socle d'envois du compte garage :
--   - le fournisseur (Brevo, par l'identifiant SMTP de n8n) ;
--   - la forme de file : réserver une ligne sous SKIP LOCKED, la remettre au
--     fournisseur, la clore ; issue incertaine jamais reprise ;
--   - le plafond de tentatives (3) ;
--   - le débit COMMUN (`prendre_jeton_envoi`, 20260921000200) : l'offre Brevo
--     Free est partagée entre toutes les files, celle-ci comprise ;
--   - le journal des incidents (`journaliser_incident`), inchangé ;
--   - `parametres_envois` pour la racine des liens.
--
-- Ajouté :
--   a. `auto_rappels_abonnements` : le consentement, propre à Nexora Auto,
--      une ligne par voiture et par sujet. Il porte l'adresse MONTRÉE à la
--      personne quand elle a activé le rappel.
--   b. `auto_rappels_decisions` : le journal de ses décisions (activer,
--      modifier, confirmer, arrêter), jamais réécrit.
--   c. `auto_rappels_envois` (créé vide par 20260922000500, jamais utilisé)
--      devient la file : un rappel = une ligne, avec son moment, son état,
--      ses tentatives et le texte exact qui partira.
--   d. `auto_empreinte_ct` : la signature des données dont dépend l'échéance.
--      Un rappel programmé porte l'empreinte des données lues au moment de
--      le programmer ; s'il ne correspond plus au dossier au moment de
--      partir (date corrigée, nouveau contrôle, voiture archivée), il est
--      annulé — même si le programmateur n'est pas repassé entre-temps.
--   e. Les fonctions de l'écran (activer, arrêter, lire l'état) et celles du
--      service d'envoi (lire les dossiers, programmer, réserver, clore).
--   f. `prendre_jeton_envoi` accepte une cinquième file, `auto_rappels`.
--      Seule la liste des files change ; le reste du corps est identique.
--
-- ================================================================
-- 3. OÙ SE CALCULE LA DATE
-- ================================================================
--
-- PAS ici. L'échéance du contrôle technique suit des règles (procès-verbal,
-- contre-visite, deux ans, premier contrôle à quatre ans) qui vivent dans
-- lib/auto/echeances.js et components/auto/aPrevoir.js, testées, et que
-- l'écran affiche. Les recopier en SQL ferait deux vérités. Le programmateur
-- (lib/auto/rappels.js) les exécute tels quels — le workflow n8n embarque ce
-- même code — et rend ici des lignes déjà décidées : date, texte, fondement.
-- La base, elle, garde ce qu'elle sait faire sûrement : l'heure de Paris,
-- l'unicité, les verrous, et le refus d'envoyer sur des données changées.
--
-- ================================================================
-- 4. HEURE
-- ================================================================
--
-- Un rappel part à 9 h, heure de Paris, le jour choisi. La conversion se fait
-- en base (`at time zone 'Europe/Paris'`), qui connaît les changements
-- d'heure. Un passage en retard (n8n arrêté) envoie encore le rappel tant
-- que l'échéance n'est pas atteinte ; le jour de l'échéance ou après, il est
-- annulé avec son motif.
--
-- ================================================================
-- 5. DROITS
-- ================================================================
--
-- Écran (authenticated) : lire son abonnement et ses décisions ; tout le
-- reste passe par les fonctions, qui vérifient l'accès à Nexora Auto, la
-- propriété de la voiture et l'adresse du compte.
-- Service d'envoi : `service_role` seulement, comme le socle.
-- La file n'est lisible par personne d'autre que le service.
--
-- ================================================================
-- 6. RETOUR ARRIÈRE
-- ================================================================
--
--   drop function les fonctions ajoutées ; drop table
--   auto_rappels_decisions, auto_rappels_abonnements ; la file peut rester
--   (vide en Production) ; `prendre_jeton_envoi` : recréer la version de
--   20260921000200 et remettre la contrainte `envois_debit_file_check` à
--   quatre files (sans effet si aucune ligne `auto_rappels` n'a été prise).

-- ----------------------------------------------------------------
-- 0. Garde : la file doit être vide pour changer de forme
-- ----------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.auto_rappels_envois) then
    raise exception 'auto_rappels_envois contient déjà des lignes : cette migration suppose une table vide, à revoir avant de l''appliquer';
  end if;
end;
$$;

-- ----------------------------------------------------------------
-- a. Le consentement, propre à Nexora Auto
-- ----------------------------------------------------------------
create table if not exists public.auto_rappels_abonnements (
  id uuid primary key default gen_random_uuid(),
  proprietaire_id uuid not null references auth.users(id) on delete cascade,
  vehicule_id uuid not null references public.auto_vehicules(id) on delete cascade,
  sujet text not null default 'controle_technique',
  canal text not null default 'email',
  delai_jours integer not null default 30,
  actif boolean not null default true,
  adresse_consentie text not null,
  consenti_le timestamptz not null default now(),
  desactive_le timestamptz,
  maj_le timestamptz not null default now(),
  constraint auto_rappels_abonnements_sujet_valide check (sujet in ('controle_technique')),
  constraint auto_rappels_abonnements_canal_valide check (canal in ('email')),
  constraint auto_rappels_abonnements_delai_valide check (delai_jours in (15, 30, 60)),
  constraint auto_rappels_abonnements_etat_coherent check (actif = (desactive_le is null)),
  constraint auto_rappels_abonnements_adresse check (adresse_consentie = lower(btrim(adresse_consentie)) and adresse_consentie like '%@%'),
  constraint auto_rappels_abonnements_un_par_sujet unique (vehicule_id, sujet, canal)
);

create index if not exists auto_rappels_abonnements_proprietaire_idx on public.auto_rappels_abonnements (proprietaire_id);

comment on table public.auto_rappels_abonnements is
  'Nexora Auto : rappel demandé par la personne, une ligne par voiture et par sujet. adresse_consentie = l''adresse affichée au moment de l''activation. Écrit seulement par auto_activer_rappel / auto_desactiver_rappel. Aucun lien avec les réglages du compte garage.';

alter table public.auto_rappels_abonnements enable row level security;

drop policy if exists auto_rappels_abonnements_lecture on public.auto_rappels_abonnements;
create policy auto_rappels_abonnements_lecture on public.auto_rappels_abonnements
  for select to authenticated
  using (proprietaire_id = (select auth.uid()));

drop policy if exists auto_acces_restreint on public.auto_rappels_abonnements;
create policy auto_acces_restreint on public.auto_rappels_abonnements
  as restrictive for all to authenticated
  using ((select public.auto_acces_autorise()))
  with check ((select public.auto_acces_autorise()));

revoke all on table public.auto_rappels_abonnements from public, anon, authenticated;
grant select on table public.auto_rappels_abonnements to authenticated;
grant all on table public.auto_rappels_abonnements to service_role;

-- ----------------------------------------------------------------
-- b. Le journal des décisions
-- ----------------------------------------------------------------
create table if not exists public.auto_rappels_decisions (
  id bigint generated always as identity primary key,
  abonnement_id uuid not null references public.auto_rappels_abonnements(id) on delete cascade,
  proprietaire_id uuid not null references auth.users(id) on delete cascade,
  decision text not null,
  delai_jours integer,
  adresse text,
  decide_le timestamptz not null default now(),
  constraint auto_rappels_decisions_valide check (decision in ('active', 'modifie', 'confirme', 'desactive'))
);

create index if not exists auto_rappels_decisions_abonnement_idx on public.auto_rappels_decisions (abonnement_id, decide_le desc);

comment on table public.auto_rappels_decisions is
  'Nexora Auto : chaque décision de la personne sur un rappel (activer, modifier le moment, confirmer une nouvelle adresse, arrêter), avec l''adresse affichée. Jamais modifié.';

alter table public.auto_rappels_decisions enable row level security;

drop policy if exists auto_rappels_decisions_lecture on public.auto_rappels_decisions;
create policy auto_rappels_decisions_lecture on public.auto_rappels_decisions
  for select to authenticated
  using (proprietaire_id = (select auth.uid()));

drop policy if exists auto_acces_restreint on public.auto_rappels_decisions;
create policy auto_acces_restreint on public.auto_rappels_decisions
  as restrictive for all to authenticated
  using ((select public.auto_acces_autorise()))
  with check ((select public.auto_acces_autorise()));

revoke all on table public.auto_rappels_decisions from public, anon, authenticated;
grant select on table public.auto_rappels_decisions to authenticated;
grant all on table public.auto_rappels_decisions to service_role;
-- Les droits par défaut de Supabase ouvrent toute nouvelle séquence à anon et
-- authenticated : le banc des droits l'a relevé. Seule la fonction écrit.
revoke all on sequence public.auto_rappels_decisions_id_seq from public, anon, authenticated;
grant usage, select on sequence public.auto_rappels_decisions_id_seq to service_role;

-- ----------------------------------------------------------------
-- c. La file : auto_rappels_envois change de forme
-- ----------------------------------------------------------------
-- Elle a été créée comme un journal « envoyé le » (une ligne = un envoi
-- fait). Elle devient la file complète : une ligne est programmée, réservée,
-- puis envoyée, annulée ou bloquée. L'unicité d'origine est gardée — un
-- palier par échéance et par canal, une seule fois — : c'est elle qui rend
-- un doublon impossible, quel que soit le nombre de passages simultanés.
alter table public.auto_rappels_envois
  alter column envoye_le drop not null,
  alter column envoye_le drop default;

alter table public.auto_rappels_envois
  add column if not exists ref uuid not null default gen_random_uuid(),
  add column if not exists abonnement_id uuid references public.auto_rappels_abonnements(id) on delete cascade,
  add column if not exists vehicule_id uuid references public.auto_vehicules(id) on delete cascade,
  add column if not exists sujet_rappel text not null default 'controle_technique',
  add column if not exists echeance date,
  add column if not exists prevu_le timestamptz,
  add column if not exists statut text not null default 'prevu',
  add column if not exists tentatives integer not null default 0,
  add column if not exists prochain_essai_le timestamptz,
  add column if not exists derniere_erreur text,
  add column if not exists motif text,
  add column if not exists fondement text,
  add column if not exists provenance text,
  add column if not exists objet text,
  add column if not exists texte text,
  add column if not exists empreinte text,
  add column if not exists destinataire text,
  add column if not exists reserve_le timestamptz,
  add column if not exists cree_le timestamptz not null default now(),
  add column if not exists maj_le timestamptz not null default now();

alter table public.auto_rappels_envois drop constraint if exists auto_rappels_envois_palier_valide;
alter table public.auto_rappels_envois add constraint auto_rappels_envois_palier_valide
  check (palier in ('j7', 'j15', 'j30', 'j60', 'retard'));

alter table public.auto_rappels_envois drop constraint if exists auto_rappels_envois_statut_valide;
alter table public.auto_rappels_envois add constraint auto_rappels_envois_statut_valide
  check (statut in ('prevu', 'envoi_en_cours', 'envoye', 'annule', 'bloque'));

alter table public.auto_rappels_envois drop constraint if exists auto_rappels_envois_forme;
alter table public.auto_rappels_envois add constraint auto_rappels_envois_forme
  check (abonnement_id is not null and vehicule_id is not null and echeance is not null and prevu_le is not null
         and objet is not null and texte is not null and empreinte is not null);

alter table public.auto_rappels_envois drop constraint if exists auto_rappels_envois_envoye_date;
alter table public.auto_rappels_envois add constraint auto_rappels_envois_envoye_date
  check ((statut = 'envoye') = (envoye_le is not null));

alter table public.auto_rappels_envois drop constraint if exists auto_rappels_envois_tentatives;
alter table public.auto_rappels_envois add constraint auto_rappels_envois_tentatives
  check (tentatives between 0 and 3);

create unique index if not exists auto_rappels_envois_ref_idx on public.auto_rappels_envois (ref);
create index if not exists auto_rappels_envois_a_envoyer_idx on public.auto_rappels_envois (prevu_le) where statut = 'prevu';
create index if not exists auto_rappels_envois_abonnement_idx on public.auto_rappels_envois (abonnement_id, cree_le desc);

comment on table public.auto_rappels_envois is
  'Nexora Auto : file des rappels externes. Une ligne par palier, par échéance (cle) et par canal, une seule fois (unicité). prevu → envoi_en_cours → envoye | annule | bloque. Une ligne restée envoi_en_cours est une issue incertaine : jamais reprise, à vérifier. Réservée au service d''envoi.';

-- ----------------------------------------------------------------
-- d. Ce dont dépend l'échéance, signé
-- ----------------------------------------------------------------
-- Tout ce que lit la règle du contrôle technique pour une voiture : sa mise
-- en circulation, son archivage, et chaque contrôle enregistré (date,
-- résultat, nature, date du procès-verbal, provenance). Deux lectures
-- différentes donnent deux empreintes différentes.
create or replace function public.auto_empreinte_ct(p_vehicule_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select md5(concat_ws('|',
    v.id, v.date_mise_en_circulation, v.archive_le,
    coalesce((
      select string_agg(concat_ws('~', h.id, h.realise_le, h.resultat_controle, h.nature_controle, h.controle_valable_jusqu_au, h.source),
                        '¤' order by h.realise_le, h.id)
        from public.auto_historique h
       where h.vehicule_id = v.id and h.type = 'controle_technique'), '')
  ))
  from public.auto_vehicules v
  where v.id = p_vehicule_id
$$;

revoke all on function public.auto_empreinte_ct(uuid) from public, anon, authenticated;
grant execute on function public.auto_empreinte_ct(uuid) to service_role;

comment on function public.auto_empreinte_ct(uuid) is
  'Signature des données dont dépend l''échéance du contrôle technique d''une voiture. Comparée au moment de réserver un rappel : tout écart l''annule. 20260922001200.';

-- ----------------------------------------------------------------
-- e. La règle d'accès, pour un compte donné (contexte du service)
-- ----------------------------------------------------------------
-- `auto_acces_autorise()` lit la session ; le service d'envoi n'en a pas.
-- Même règle, pour un identifiant explicite. Les deux doivent rester
-- identiques (20260922001100, section c).
create or replace function public.auto_acces_autorise_pour(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case p.mode
      when 'ouvert' then exists (select 1 from auth.users u where u.id = p_uid)
      when 'beta' then exists (
        select 1
        from auth.users u
        join public.auto_acces_beta b on b.email = lower(u.email)
        where u.id = p_uid and u.email_confirmed_at is not null
      )
      else false
    end
    from public.auto_acces_parametres p
    where p.unique_ligne
  ), false)
$$;

revoke all on function public.auto_acces_autorise_pour(uuid) from public, anon, authenticated;
grant execute on function public.auto_acces_autorise_pour(uuid) to service_role;

-- L'heure de Paris : 9 h le jour dit, ou le prochain 9 h s'il est passé.
create or replace function public.auto_rappel_neuf_heures(p_jour date)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when ((p_jour::timestamp + time '09:00') at time zone 'Europe/Paris') > now()
      then (p_jour::timestamp + time '09:00') at time zone 'Europe/Paris'
    when (now() at time zone 'Europe/Paris')::time < time '09:00'
      then ((now() at time zone 'Europe/Paris')::date::timestamp + time '09:00') at time zone 'Europe/Paris'
    else (((now() at time zone 'Europe/Paris')::date + 1)::timestamp + time '09:00') at time zone 'Europe/Paris'
  end
$$;

revoke all on function public.auto_rappel_neuf_heures(date) from public, anon, authenticated;
grant execute on function public.auto_rappel_neuf_heures(date) to service_role;

-- ----------------------------------------------------------------
-- f. Les gestes de la personne
-- ----------------------------------------------------------------
-- Activer, modifier le moment, confirmer une nouvelle adresse : un seul
-- geste, qui enregistre l'adresse AFFICHÉE (celle du compte à cet instant).
-- Tout rappel programmé ou bloqué de l'abonnement est annulé : le
-- programmateur recrée au passage suivant celui qui correspond au choix.
create or replace function public.auto_activer_rappel(p_vehicule_id uuid, p_delai_jours integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_vehicule public.auto_vehicules%rowtype;
  v_email text;
  v_ancien public.auto_rappels_abonnements%rowtype;
  v_abonnement public.auto_rappels_abonnements%rowtype;
  v_decision text;
begin
  if v_uid is null or not public.auto_acces_autorise() then
    raise exception 'Accès à Nexora Auto refusé' using errcode = '42501';
  end if;
  if p_delai_jours is null or p_delai_jours not in (15, 30, 60) then
    raise exception 'Moment du rappel invalide' using errcode = '22023';
  end if;

  select * into v_vehicule from public.auto_vehicules v where v.id = p_vehicule_id and v.proprietaire_id = v_uid;
  if not found then
    raise exception 'Voiture introuvable' using errcode = 'P0002';
  end if;
  if v_vehicule.archive_le is not null then
    return jsonb_build_object('ok', false, 'raison', 'voiture_archivee');
  end if;

  select lower(btrim(u.email)) into v_email from auth.users u where u.id = v_uid and u.email_confirmed_at is not null;
  if coalesce(v_email, '') = '' then
    return jsonb_build_object('ok', false, 'raison', 'adresse_absente');
  end if;

  select * into v_ancien from public.auto_rappels_abonnements a
   where a.vehicule_id = p_vehicule_id and a.sujet = 'controle_technique' and a.canal = 'email'
   for update;

  v_decision := case
    when v_ancien.id is null or not v_ancien.actif then 'active'
    when v_ancien.delai_jours <> p_delai_jours then 'modifie'
    when v_ancien.adresse_consentie <> v_email then 'confirme'
    else null
  end;

  if v_decision is null then
    return jsonb_build_object('ok', true, 'inchange', true, 'abonnement_id', v_ancien.id, 'adresse', v_email, 'delai_jours', v_ancien.delai_jours);
  end if;

  insert into public.auto_rappels_abonnements as a
    (proprietaire_id, vehicule_id, sujet, canal, delai_jours, actif, adresse_consentie, consenti_le, desactive_le, maj_le)
  values (v_uid, p_vehicule_id, 'controle_technique', 'email', p_delai_jours, true, v_email, now(), null, now())
  on conflict (vehicule_id, sujet, canal) do update
     set delai_jours = excluded.delai_jours, actif = true, adresse_consentie = excluded.adresse_consentie,
         consenti_le = now(), desactive_le = null, maj_le = now()
  returning * into v_abonnement;

  update public.auto_rappels_envois e
     set statut = 'annule', motif = 'rappel modifié par la personne : nouvelle programmation', maj_le = now()
   where e.abonnement_id = v_abonnement.id and e.statut in ('prevu', 'bloque');

  insert into public.auto_rappels_decisions (abonnement_id, proprietaire_id, decision, delai_jours, adresse)
  values (v_abonnement.id, v_uid, v_decision, p_delai_jours, v_email);

  return jsonb_build_object('ok', true, 'inchange', false, 'decision', v_decision, 'abonnement_id', v_abonnement.id, 'adresse', v_email, 'delai_jours', p_delai_jours);
end;
$$;

revoke all on function public.auto_activer_rappel(uuid, integer) from public, anon;
grant execute on function public.auto_activer_rappel(uuid, integer) to authenticated;

create or replace function public.auto_desactiver_rappel(p_vehicule_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_abonnement public.auto_rappels_abonnements%rowtype;
  v_annules integer;
begin
  if v_uid is null or not public.auto_acces_autorise() then
    raise exception 'Accès à Nexora Auto refusé' using errcode = '42501';
  end if;

  update public.auto_rappels_abonnements a
     set actif = false, desactive_le = now(), maj_le = now()
   where a.vehicule_id = p_vehicule_id and a.proprietaire_id = v_uid and a.sujet = 'controle_technique' and a.actif
  returning * into v_abonnement;

  if v_abonnement.id is null then
    return jsonb_build_object('ok', true, 'deja_inactif', true);
  end if;

  update public.auto_rappels_envois e
     set statut = 'annule', motif = 'rappel arrêté par la personne', maj_le = now()
   where e.abonnement_id = v_abonnement.id and e.statut in ('prevu', 'bloque');
  get diagnostics v_annules = row_count;

  insert into public.auto_rappels_decisions (abonnement_id, proprietaire_id, decision, delai_jours, adresse)
  values (v_abonnement.id, v_uid, 'desactive', v_abonnement.delai_jours, v_abonnement.adresse_consentie);

  return jsonb_build_object('ok', true, 'deja_inactif', false, 'annules', v_annules);
end;
$$;

revoke all on function public.auto_desactiver_rappel(uuid) from public, anon;
grant execute on function public.auto_desactiver_rappel(uuid) to authenticated;

-- Ce que l'écran affiche : l'abonnement, l'adresse actuelle du compte, et le
-- rappel qui compte (le prochain à partir, sinon le dernier parti). Jamais
-- le texte ni les erreurs techniques.
create or replace function public.auto_etat_rappel(p_vehicule_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_abonnement public.auto_rappels_abonnements%rowtype;
  v_email text;
  v_prochain jsonb;
  v_dernier jsonb;
begin
  if v_uid is null or not public.auto_acces_autorise() then
    raise exception 'Accès à Nexora Auto refusé' using errcode = '42501';
  end if;
  if not exists (select 1 from public.auto_vehicules v where v.id = p_vehicule_id and v.proprietaire_id = v_uid) then
    raise exception 'Voiture introuvable' using errcode = 'P0002';
  end if;

  select lower(btrim(u.email)) into v_email from auth.users u where u.id = v_uid;
  select * into v_abonnement from public.auto_rappels_abonnements a
   where a.vehicule_id = p_vehicule_id and a.sujet = 'controle_technique' and a.canal = 'email';

  if v_abonnement.id is not null then
    select jsonb_build_object('statut', e.statut, 'prevu_le', e.prevu_le, 'echeance', e.echeance, 'palier', e.palier, 'motif', e.motif)
      into v_prochain
      from public.auto_rappels_envois e
     where e.abonnement_id = v_abonnement.id and e.statut in ('prevu', 'envoi_en_cours', 'bloque')
     order by e.prevu_le
     limit 1;
    select jsonb_build_object('envoye_le', e.envoye_le, 'echeance', e.echeance, 'destinataire', e.destinataire)
      into v_dernier
      from public.auto_rappels_envois e
     where e.abonnement_id = v_abonnement.id and e.statut = 'envoye'
     order by e.envoye_le desc
     limit 1;
  end if;

  return jsonb_build_object(
    'adresse_compte', v_email,
    'abonnement', case when v_abonnement.id is null then null else jsonb_build_object(
      'actif', v_abonnement.actif, 'delai_jours', v_abonnement.delai_jours,
      'adresse_consentie', v_abonnement.adresse_consentie, 'consenti_le', v_abonnement.consenti_le,
      'desactive_le', v_abonnement.desactive_le) end,
    'prochain', v_prochain,
    'dernier_envoye', v_dernier
  );
end;
$$;

revoke all on function public.auto_etat_rappel(uuid) from public, anon;
grant execute on function public.auto_etat_rappel(uuid) to authenticated;

-- ----------------------------------------------------------------
-- g. Le service d'envoi
-- ----------------------------------------------------------------

-- 1. Les dossiers à programmer : une ligne par abonnement actif, voiture non
--    archivée, compte encore autorisé. Tout ce que la règle lit, plus
--    l'empreinte de CETTE lecture.
create or replace function public.auto_rappels_a_planifier(p_proprietaires uuid[] default null)
returns table (
  abonnement_id uuid, proprietaire_id uuid, delai_jours integer,
  vehicule jsonb, historique jsonb, empreinte text, url_base text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.proprietaire_id, a.delai_jours,
         jsonb_build_object('id', v.id, 'marque', v.marque, 'modele', v.modele, 'immatriculation', v.immatriculation,
                            'date_mise_en_circulation', v.date_mise_en_circulation),
         coalesce((select jsonb_agg(jsonb_build_object(
                     'type', h.type, 'realise_le', h.realise_le, 'resultat_controle', h.resultat_controle,
                     'nature_controle', h.nature_controle, 'controle_valable_jusqu_au', h.controle_valable_jusqu_au,
                     'source', h.source) order by h.realise_le, h.id)
                     from public.auto_historique h
                    where h.vehicule_id = v.id and h.type = 'controle_technique'), '[]'::jsonb),
         public.auto_empreinte_ct(v.id),
         coalesce((select p.valeur from public.parametres_envois p where p.cle = 'auto_url_publique'),
                  (select p.valeur from public.parametres_envois p where p.cle = 'url_publique'))
    from public.auto_rappels_abonnements a
    join public.auto_vehicules v on v.id = a.vehicule_id and v.proprietaire_id = a.proprietaire_id
   where a.actif
     and v.archive_le is null
     and (p_proprietaires is null or a.proprietaire_id = any(p_proprietaires))
     and public.auto_acces_autorise_pour(a.proprietaire_id)
$$;

revoke all on function public.auto_rappels_a_planifier(uuid[]) from public, anon, authenticated;
grant execute on function public.auto_rappels_a_planifier(uuid[]) to service_role;

-- 2. Programmer. `p_plans` : ce que rend planifierRappels() (lib/auto/rappels.js).
--    { abonnement_id, aucun: true, raison }  → plus rien à rappeler : ce qui
--                                              était programmé est annulé ;
--    { abonnement_id, cle, echeance, jour, palier, fondement, provenance,
--      objet, texte, empreinte }              → LE rappel qui doit exister.
--
--    Règles :
--      - un rappel déjà envoyé (ou en cours) pour cette échéance ne se
--        reprogramme jamais : un seul rappel par échéance ;
--      - un rappel déjà programmé GARDE son moment : seuls son texte et son
--        empreinte se rafraîchissent. Sinon un passage en retard repousserait
--        indéfiniment un rappel dû ;
--      - un rappel annulé revit (réactivation, retour de l'accès) avec un
--        nouveau moment ; un nouveau rappel est créé s'il n'y en a aucun ;
--      - dans ces deux cas seulement, un moment qui tomberait le jour de
--        l'échéance ou après n'est pas programmé : trop tard pour être utile ;
--      - un rappel bloqué (adresse à confirmer, trois échecs) n'est jamais
--        relancé ici : il attend la personne ou une vérification.
create or replace function public.auto_planifier_rappels(p_plans jsonb, p_proprietaires uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan jsonb;
  v_abonnement public.auto_rappels_abonnements%rowtype;
  v_existant public.auto_rappels_envois%rowtype;
  v_echeance date;
  v_prevu timestamptz;
  v_n integer;
  v_annules integer := 0;
  v_programmes integer := 0;
  v_rafraichis integer := 0;
  v_ignores integer := 0;
begin
  if jsonb_typeof(p_plans) is distinct from 'array' then
    raise exception 'p_plans : tableau attendu' using errcode = '22023';
  end if;

  -- Ce qui ne doit plus partir, même sans plan : rappel arrêté, voiture
  -- archivée. (La réservation le vérifie aussi ; ici, l'écran le voit tout
  -- de suite.)
  update public.auto_rappels_envois e
     set statut = 'annule',
         motif = case when not a.actif then 'rappel arrêté par la personne' else 'voiture archivée : plus de rappel' end,
         maj_le = now()
    from public.auto_rappels_abonnements a, public.auto_vehicules v
   where a.id = e.abonnement_id and v.id = e.vehicule_id and e.statut = 'prevu'
     and (not a.actif or v.archive_le is not null)
     and (p_proprietaires is null or e.proprietaire_id = any(p_proprietaires));
  get diagnostics v_n = row_count;
  v_annules := v_annules + v_n;

  for v_plan in select * from jsonb_array_elements(p_plans)
  loop
    select * into v_abonnement from public.auto_rappels_abonnements a
     where a.id = (v_plan->>'abonnement_id')::uuid and a.actif
       and (p_proprietaires is null or a.proprietaire_id = any(p_proprietaires));
    if v_abonnement.id is null then
      v_ignores := v_ignores + 1;
      continue;
    end if;

    if coalesce((v_plan->>'aucun')::boolean, false) then
      update public.auto_rappels_envois e
         set statut = 'annule', motif = left('plus rien à rappeler : ' || coalesce(v_plan->>'raison', 'échéance non calculable'), 300), maj_le = now()
       where e.abonnement_id = v_abonnement.id and e.statut = 'prevu';
      get diagnostics v_n = row_count;
      v_annules := v_annules + v_n;
      continue;
    end if;

    v_echeance := (v_plan->>'echeance')::date;

    -- Ce qui était programmé pour une autre échéance ou un autre moment.
    update public.auto_rappels_envois e
       set statut = 'annule', motif = 'échéance ou moment modifiés : remplacé par un nouveau rappel', maj_le = now()
     where e.abonnement_id = v_abonnement.id and e.statut = 'prevu'
       and (e.cle is distinct from v_plan->>'cle' or e.palier is distinct from v_plan->>'palier');
    get diagnostics v_n = row_count;
    v_annules := v_annules + v_n;

    -- Un seul rappel par échéance.
    if exists (select 1 from public.auto_rappels_envois e
                where e.abonnement_id = v_abonnement.id and e.cle = v_plan->>'cle'
                  and e.statut in ('envoye', 'envoi_en_cours')) then
      continue;
    end if;

    select * into v_existant from public.auto_rappels_envois e
     where e.proprietaire_id = v_abonnement.proprietaire_id and e.cle = v_plan->>'cle'
       and e.palier = v_plan->>'palier' and e.canal = 'email'
     for update;

    if v_existant.id is not null and v_existant.statut = 'prevu' then
      update public.auto_rappels_envois e
         set abonnement_id = v_abonnement.id, fondement = v_plan->>'fondement', provenance = v_plan->>'provenance',
             objet = left(v_plan->>'objet', 200), texte = left(v_plan->>'texte', 2000), empreinte = v_plan->>'empreinte',
             maj_le = now()
       where e.id = v_existant.id;
      v_rafraichis := v_rafraichis + 1;
      continue;
    end if;
    if v_existant.id is not null and v_existant.statut <> 'annule' then
      continue; -- bloqué : attend la personne ou une vérification
    end if;

    v_prevu := public.auto_rappel_neuf_heures((v_plan->>'jour')::date);
    if (v_prevu at time zone 'Europe/Paris')::date >= v_echeance then
      continue; -- trop tard pour être utile
    end if;

    if v_existant.id is not null then
      update public.auto_rappels_envois e
         set statut = 'prevu', prevu_le = v_prevu, tentatives = 0, prochain_essai_le = null, derniere_erreur = null,
             motif = null, reserve_le = null, destinataire = null, abonnement_id = v_abonnement.id,
             fondement = v_plan->>'fondement', provenance = v_plan->>'provenance',
             objet = left(v_plan->>'objet', 200), texte = left(v_plan->>'texte', 2000), empreinte = v_plan->>'empreinte',
             maj_le = now()
       where e.id = v_existant.id;
    else
      insert into public.auto_rappels_envois
        (proprietaire_id, cle, palier, canal, abonnement_id, vehicule_id, sujet_rappel, echeance, prevu_le, statut,
         fondement, provenance, objet, texte, empreinte)
      values
        (v_abonnement.proprietaire_id, v_plan->>'cle', v_plan->>'palier', 'email', v_abonnement.id, v_abonnement.vehicule_id,
         'controle_technique', v_echeance, v_prevu, 'prevu',
         v_plan->>'fondement', v_plan->>'provenance', left(v_plan->>'objet', 200), left(v_plan->>'texte', 2000), v_plan->>'empreinte')
      on conflict (proprietaire_id, cle, palier, canal) do nothing;
      get diagnostics v_n = row_count;
      if v_n = 0 then
        continue; -- un passage simultané l'a créé : rien de plus à faire
      end if;
    end if;
    v_programmes := v_programmes + 1;
  end loop;

  return jsonb_build_object('programmes', v_programmes, 'rafraichis', v_rafraichis, 'annules', v_annules, 'ignores', v_ignores);
end;
$$;

revoke all on function public.auto_planifier_rappels(jsonb, uuid[]) from public, anon, authenticated;
grant execute on function public.auto_planifier_rappels(jsonb, uuid[]) to service_role;

-- 3. Réserver UN rappel dû. D'abord, dans la même instruction pour chaque
--    garde, écarter ce qui ne doit plus partir — avec le motif :
--      abonnement arrêté → annulé ; voiture archivée → annulé ;
--      données changées depuis la programmation → annulé (reprogrammé au
--      passage suivant) ; échéance atteinte → annulé ;
--      accès à Nexora Auto retiré → annulé (il revit si l'accès revient) ;
--      adresse du compte différente de l'adresse consentie → bloqué : la
--      personne doit confirmer, rien ne le relance d'ici là.
--    Puis prendre une ligne sous SKIP LOCKED et un jeton du débit commun :
--    sans jeton, la ligne reste programmée, sans tentative consommée.
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

-- 4. Clore. N'agit que sur une ligne `envoi_en_cours` : la rejouer ne change
--    rien de plus. 'a_reprendre' remet la ligne en file avec un délai
--    croissant (30 min, puis 2 h) ; à la troisième tentative, elle est
--    bloquée. Une issue incertaine ne se clôt pas : n8n n'appelle pas ceci.
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
           motif = case when p_resultat = 'a_reprendre' then 'trois tentatives sans succès : rien ne part plus sans vérification'
                        else 'refus définitif du fournisseur' end,
           maj_le = now()
     where e.id = v_ligne.id;
    v_statut := 'bloque';
  end if;

  return jsonb_build_object('clos', true, 'statut', v_statut, 'tentatives', v_ligne.tentatives);
end;
$$;

revoke all on function public.auto_terminer_rappel(uuid, text, text) from public, anon, authenticated;
grant execute on function public.auto_terminer_rappel(uuid, text, text) to service_role;

-- ----------------------------------------------------------------
-- h. Le débit commun accepte la file des rappels Auto
-- ----------------------------------------------------------------
alter table public.envois_debit drop constraint if exists envois_debit_file_check;
alter table public.envois_debit add constraint envois_debit_file_check
  check (file in ('devis', 'factures', 'proposition', 'atelier', 'auto_rappels'));

-- Corps identique à 20260921000200, liste des files mise à part.
create or replace function public.prendre_jeton_envoi(
  p_file text,
  p_id uuid,
  p_limite_heure integer default 40,
  p_limite_jour integer default 120,
  p_workflow_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_heure integer;
  v_jour integer;
begin
  if p_file is null or p_file not in ('devis', 'factures', 'proposition', 'atelier', 'auto_rappels') then
    raise exception 'file inconnue : %', p_file using errcode = '22023';
  end if;
  if p_limite_heure is null or p_limite_heure < 1 or p_limite_jour is null or p_limite_jour < 1 then
    raise exception 'plafonds invalides' using errcode = '22023';
  end if;

  -- Un seul demandeur à la fois, quelle que soit la file : c'est ce qui rend
  -- le plafond commun vrai face à quatre workflows simultanés.
  perform pg_advisory_xact_lock(hashtext('nexora:debit_envois'));

  select count(*) into v_heure from public.envois_debit where pris_le > now() - interval '1 hour';
  select count(*) into v_jour from public.envois_debit where pris_le > now() - interval '24 hours';

  if v_heure >= p_limite_heure or v_jour >= p_limite_jour then
    return jsonb_build_object(
      'ok', false,
      'restant_heure', greatest(p_limite_heure - v_heure, 0),
      'restant_jour', greatest(p_limite_jour - v_jour, 0),
      'motif', case when v_jour >= p_limite_jour then 'plafond quotidien atteint' else 'plafond horaire atteint' end);
  end if;

  insert into public.envois_debit (file, notification_id, workflow_id) values (p_file, p_id, left(p_workflow_id, 64));
  return jsonb_build_object('ok', true, 'restant_heure', p_limite_heure - v_heure - 1, 'restant_jour', p_limite_jour - v_jour - 1);
end;
$$;
