-- Notifications de devis résilientes V1 — banc de test AUTONOME et RÉVERSIBLE.
--
-- Convention reprise à l'identique de
-- supabase/tests/ordres_reparation_v1.sql : table temporaire
-- `_fixture_ids` (`on commit drop`), helpers `pg_temp.fid` et
-- `pg_temp.assert`, impersonation par `set_config('request.jwt.claims', …)`
-- + `set local role …` puis `reset role;`, `rollback;` final et
-- vérification post-rollback de l'absence de résidu.
--
-- CE FICHIER N'EST PAS UNE MIGRATION : il n'est jamais appliqué
-- automatiquement, et il N'A PAS ÉTÉ EXÉCUTÉ dans la session qui l'a
-- écrit (aucune écriture distante autorisée). Il présuppose que
-- supabase/migrations/20260903000100_notifications_devis_statut_traitement.sql
-- a déjà été appliquée sur l'environnement où on l'exécute.
--
-- ENVIRONNEMENT : Supabase TEST uniquement. Production ne reçoit rien
-- avant dry-run Test, application Test, exécution de ce banc sur Test, et
-- validation humaine explicite.
--
-- NE PRÉSUPPOSE PAS QUE TEST EST IDENTIQUE À PRODUCTION : la section 1
-- vérifie explicitement, sur l'environnement courant, la structure et les
-- contraintes dont dépendent les scénarios qui suivent. Un écart fait
-- échouer le banc au lieu de produire un faux vert. Écart connu et
-- volontairement NON traité ici (voir rapport) : sur les quatre files de
-- notification, anon/authenticated disposent de tous les privilèges de
-- table en Test alors qu'ils n'ont que REFERENCES/TRIGGER/TRUNCATE en
-- Production. La RLS sans policy neutralise cet écart aujourd'hui ; la
-- section 5 le démontre plutôt que de le supposer.
--
-- FIXTURES NEUVES UNIQUEMENT : aucune ligne préexistante n'est lue,
-- modifiée ni supposée présente. Aucune donnée réelle, aucune donnée
-- personnelle. Marqueurs déterministes propres à ce fichier :
-- « RECETTE NOTIF DEVIS V1 », marque « MarqueTestNotifV1 »,
-- notifications_devis.type = « recette_notif_v1 ».

begin;

-- =====================================================================
-- 0. Échafaudage
-- =====================================================================

create temporary table _fixture_ids (
  cle text primary key,
  valeur uuid not null
) on commit drop;

create function pg_temp.fid(p_cle text) returns uuid
language sql security definer set search_path = '' as $$
  select valeur from pg_temp._fixture_ids where cle = p_cle;
$$;
revoke execute on function pg_temp.fid(text) from public;
grant execute on function pg_temp.fid(text) to authenticated, anon;

create function pg_temp.assert(p_condition boolean, p_message text) returns void
language plpgsql set search_path = '' as $$
begin
  if p_condition is not true then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
end;
$$;
revoke execute on function pg_temp.assert(boolean, text) from public;
grant execute on function pg_temp.assert(boolean, text) to authenticated, anon;

insert into _fixture_ids (cle, valeur) values
  ('user_a', gen_random_uuid()),          -- propriétaire du garage A
  ('user_b', gen_random_uuid()),          -- propriétaire du garage B
  ('user_c', gen_random_uuid()),          -- authentifié SANS garage
  ('garage_a', gen_random_uuid()),
  ('garage_b', gen_random_uuid()),
  ('client_a', gen_random_uuid()),
  ('client_b', gen_random_uuid()),
  ('vehicule_a', gen_random_uuid()),
  ('vehicule_b', gen_random_uuid()),
  ('prestation_a', gen_random_uuid()),
  ('prestation_b', gen_random_uuid()),
  ('devis_a', gen_random_uuid()),
  ('devis_b', gen_random_uuid()),
  ('notif_a_incomplete', gen_random_uuid()),
  ('notif_a_en_attente', gen_random_uuid()),
  ('notif_a_envoyee', gen_random_uuid()),
  ('notif_b_incomplete', gen_random_uuid());

-- =====================================================================
-- 1. Vérification de structure SUR L'ENVIRONNEMENT COURANT
--    (la migration doit avoir été appliquée ; on ne suppose rien)
-- =====================================================================

do $$
declare
  v_type text;
  v_null text;
  v_def  text;
begin
  -- envoye : le postulat central de toute la migration
  select data_type, is_nullable, coalesce(column_default, '')
    into v_type, v_null, v_def
    from information_schema.columns
   where table_schema = 'public' and table_name = 'notifications_devis'
     and column_name = 'envoye';
  perform pg_temp.assert(v_type = 'boolean',
    'envoye doit etre boolean (constate: ' || coalesce(v_type, 'ABSENTE') || ')');
  perform pg_temp.assert(v_null = 'NO', 'envoye doit rester NOT NULL');

  -- statut_traitement : ajouté par la migration
  select data_type, is_nullable, coalesce(column_default, '')
    into v_type, v_null, v_def
    from information_schema.columns
   where table_schema = 'public' and table_name = 'notifications_devis'
     and column_name = 'statut_traitement';
  perform pg_temp.assert(v_type = 'text',
    'statut_traitement doit exister en text — migration appliquee ?');
  perform pg_temp.assert(v_null = 'NO', 'statut_traitement doit etre NOT NULL');
  perform pg_temp.assert(v_def like '%en_attente%',
    'statut_traitement doit avoir le defaut en_attente');

  -- incomplet_motif
  select data_type, is_nullable
    into v_type, v_null
    from information_schema.columns
   where table_schema = 'public' and table_name = 'notifications_devis'
     and column_name = 'incomplet_motif';
  perform pg_temp.assert(v_type = 'text', 'incomplet_motif doit exister en text');
  perform pg_temp.assert(v_null = 'YES', 'incomplet_motif doit rester nullable');

  -- devis_id nullable : les fixtures et la jointure des RPC en dependent
  select is_nullable into v_null
    from information_schema.columns
   where table_schema = 'public' and table_name = 'notifications_devis'
     and column_name = 'devis_id';
  perform pg_temp.assert(v_null = 'YES', 'devis_id doit rester nullable');

  -- devis.garage_id : seul chemin de rattachement au garage
  perform pg_temp.assert(
    exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'devis'
               and column_name = 'garage_id'),
    'devis.garage_id doit exister — les RPC en dependent');

  -- Les deux contraintes de domaine
  perform pg_temp.assert(
    exists (select 1 from pg_constraint
             where conrelid = 'public.notifications_devis'::regclass
               and conname = 'notifications_devis_statut_traitement_check'),
    'la contrainte des cinq etats doit exister');
  perform pg_temp.assert(
    exists (select 1 from pg_constraint
             where conrelid = 'public.notifications_devis'::regclass
               and conname = 'notifications_devis_incomplet_motif_check'),
    'la contrainte des codes de motif doit exister');

  -- RLS active et AUCUNE policy : la fermeture par defaut est le socle
  perform pg_temp.assert(
    (select relrowsecurity from pg_class where oid = 'public.notifications_devis'::regclass),
    'la RLS doit rester active sur notifications_devis');
  perform pg_temp.assert(
    (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'notifications_devis') = 0,
    'aucune policy ne doit etre ajoutee sur notifications_devis');

  -- current_garage_id() : dependance directe des trois RPC
  perform pg_temp.assert(
    (select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'current_garage_id') is true,
    'current_garage_id() doit rester SECURITY DEFINER');
  perform pg_temp.assert(
    (select p.provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'current_garage_id') = 's',
    'current_garage_id() doit rester STABLE');
end;
$$;

-- =====================================================================
-- 2. ACL des trois RPC : authenticated seulement
-- =====================================================================

do $$
declare
  v_fn text;
  v_noms text[] := array[
    'notifications_a_verifier',
    'notification_reessayer',
    'notification_abandonner'
  ];
begin
  foreach v_fn in array v_noms loop
    perform pg_temp.assert(
      has_function_privilege('authenticated', p.oid, 'EXECUTE'),
      v_fn || ' : authenticated doit avoir EXECUTE')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn;

    perform pg_temp.assert(
      not has_function_privilege('anon', p.oid, 'EXECUTE'),
      v_fn || ' : anon ne doit PAS avoir EXECUTE')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn;

    perform pg_temp.assert(
      not has_function_privilege('service_role', p.oid, 'EXECUTE'),
      v_fn || ' : service_role ne doit PAS avoir EXECUTE')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn;

    perform pg_temp.assert(
      (select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = v_fn) is true,
      v_fn || ' doit etre SECURITY DEFINER');

    perform pg_temp.assert(
      (select 'search_path=' = any (
                select left(cfg, 12) from unnest(p.proconfig) as cfg)
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = v_fn) is true,
      v_fn || ' doit fixer search_path');
  end loop;
end;
$$;

-- =====================================================================
-- 3. Règle de reprise, vérifiée comme règle (et non comme historique)
--
--    La migration ayant déjà été appliquée, la reprise réelle appartient
--    au passé. On valide donc l'EXPRESSION de reprise sur une table
--    temporaire de même forme. La reprise réelle sur données existantes
--    est vérifiée séparément par un dry-run `begin … rollback` de la
--    migration, avant toute application.
-- =====================================================================

create temporary table _reprise (envoye boolean not null, statut text) on commit drop;
insert into _reprise (envoye) values (true), (false), (false);

update _reprise set statut = case when envoye then 'envoye' else 'en_attente' end;

select pg_temp.assert(
  (select count(*) from _reprise where statut is null) = 0,
  'reprise : aucune ligne ne doit rester sans statut');
select pg_temp.assert(
  (select count(*) from _reprise where envoye and statut = 'envoye') =
  (select count(*) from _reprise where envoye),
  'reprise : envoye=true doit devenir envoye');
select pg_temp.assert(
  (select count(*) from _reprise where not envoye and statut = 'en_attente') =
  (select count(*) from _reprise where not envoye),
  'reprise : envoye=false doit devenir en_attente');

-- =====================================================================
-- 4. Fixtures synthétiques
-- =====================================================================

insert into auth.users
  (id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (pg_temp.fid('user_a'), 'authenticated', 'authenticated',
   'recette-notif-a-' || pg_temp.fid('user_a')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture', now(),
   '{}'::jsonb, '{}'::jsonb, now(), now()),
  (pg_temp.fid('user_b'), 'authenticated', 'authenticated',
   'recette-notif-b-' || pg_temp.fid('user_b')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture', now(),
   '{}'::jsonb, '{}'::jsonb, now(), now()),
  (pg_temp.fid('user_c'), 'authenticated', 'authenticated',
   'recette-notif-c-' || pg_temp.fid('user_c')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture', now(),
   '{}'::jsonb, '{}'::jsonb, now(), now());

insert into garages (id, owner_user_id, nom_garage) values
  (pg_temp.fid('garage_a'), pg_temp.fid('user_a'), 'RECETTE NOTIF DEVIS V1 — GARAGE A'),
  (pg_temp.fid('garage_b'), pg_temp.fid('user_b'), 'RECETTE NOTIF DEVIS V1 — GARAGE B');
-- user_c n'a volontairement aucun garage : current_garage_id() renverra NULL.

insert into clients (id, garage_id, nom) values
  (pg_temp.fid('client_a'), pg_temp.fid('garage_a'), 'RECETTE NOTIF DEVIS V1 — CLIENT A'),
  (pg_temp.fid('client_b'), pg_temp.fid('garage_b'), 'RECETTE NOTIF DEVIS V1 — CLIENT B');

insert into vehicules (id, garage_id, client_id, marque, modele) values
  (pg_temp.fid('vehicule_a'), pg_temp.fid('garage_a'), pg_temp.fid('client_a'), 'MarqueTestNotifV1', 'ModeleTest-A'),
  (pg_temp.fid('vehicule_b'), pg_temp.fid('garage_b'), pg_temp.fid('client_b'), 'MarqueTestNotifV1', 'ModeleTest-B');

insert into prestations (id, garage_id, nom, duree_minutes) values
  (pg_temp.fid('prestation_a'), pg_temp.fid('garage_a'), 'RECETTE NOTIF DEVIS V1 — PRESTATION A', 30),
  (pg_temp.fid('prestation_b'), pg_temp.fid('garage_b'), 'RECETTE NOTIF DEVIS V1 — PRESTATION B', 30);

insert into devis (id, garage_id, client_id, vehicule_id, prestation_id, montant_ht, montant_ttc, statut, message_garage) values
  (pg_temp.fid('devis_a'), pg_temp.fid('garage_a'), pg_temp.fid('client_a'), pg_temp.fid('vehicule_a'), pg_temp.fid('prestation_a'), 100, 120, 'en_attente', 'RECETTE NOTIF DEVIS V1'),
  (pg_temp.fid('devis_b'), pg_temp.fid('garage_b'), pg_temp.fid('client_b'), pg_temp.fid('vehicule_b'), pg_temp.fid('prestation_b'), 100, 120, 'en_attente', 'RECETTE NOTIF DEVIS V1');

insert into notifications_devis (id, devis_id, envoye, type, statut_traitement, incomplet_motif) values
  (pg_temp.fid('notif_a_incomplete'), pg_temp.fid('devis_a'), false, 'recette_notif_v1', 'incomplet', 'vehicule_absent'),
  (pg_temp.fid('notif_a_en_attente'), pg_temp.fid('devis_a'), false, 'recette_notif_v1', 'en_attente', null),
  (pg_temp.fid('notif_a_envoyee'),    pg_temp.fid('devis_a'), true,  'recette_notif_v1', 'envoye',     null),
  (pg_temp.fid('notif_b_incomplete'), pg_temp.fid('devis_b'), false, 'recette_notif_v1', 'incomplet', 'client_absent');

-- =====================================================================
-- 5. Défaut et contraintes de domaine
-- =====================================================================

do $$
declare
  v_statut text;
begin
  insert into notifications_devis (devis_id, envoye, type)
  values (pg_temp.fid('devis_a'), false, 'recette_notif_v1')
  returning statut_traitement into v_statut;

  perform pg_temp.assert(v_statut = 'en_attente',
    'le defaut statut_traitement doit etre en_attente (constate: ' || coalesce(v_statut, 'NULL') || ')');
end;
$$;

-- Les cinq états sont acceptés
do $$
declare
  v_etat text;
begin
  foreach v_etat in array array['en_attente', 'envoye', 'incomplet', 'erreur', 'abandonne'] loop
    update notifications_devis set statut_traitement = v_etat
     where id = pg_temp.fid('notif_a_envoyee');
  end loop;
  -- remise en etat pour la suite
  update notifications_devis set statut_traitement = 'envoye'
   where id = pg_temp.fid('notif_a_envoyee');
end;
$$;

-- Un état hors domaine est rejeté
do $$
begin
  begin
    update notifications_devis set statut_traitement = 'etat_invente'
     where id = pg_temp.fid('notif_a_envoyee');
    perform pg_temp.assert(false, 'un statut hors domaine aurait du etre rejete');
  exception when check_violation then
    null;  -- comportement attendu
  end;
end;
$$;

-- Un motif hors domaine est rejeté ; NULL et les codes autorisés passent
do $$
declare
  v_code text;
begin
  begin
    update notifications_devis set incomplet_motif = 'texte libre avec donnee client'
     where id = pg_temp.fid('notif_a_incomplete');
    perform pg_temp.assert(false, 'un motif hors domaine aurait du etre rejete');
  exception when check_violation then
    null;  -- comportement attendu
  end;

  foreach v_code in array array['devis_absent', 'client_absent', 'vehicule_absent', 'garage_absent', 'donnees_incompletes'] loop
    update notifications_devis set incomplet_motif = v_code
     where id = pg_temp.fid('notif_a_incomplete');
  end loop;

  update notifications_devis set incomplet_motif = 'vehicule_absent'
   where id = pg_temp.fid('notif_a_incomplete');
end;
$$;

-- =====================================================================
-- 6. anon : aucun accès, ni à la table ni aux RPC
-- =====================================================================

select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
set local role anon;

select pg_temp.assert(
  (select count(*) from public.notifications_devis) = 0,
  'anon ne doit voir aucune ligne (RLS active sans policy)');

do $$
begin
  begin
    perform public.notifications_a_verifier();
    perform pg_temp.assert(false, 'anon ne doit pas pouvoir executer notifications_a_verifier()');
  exception when insufficient_privilege then
    null;  -- comportement attendu
  end;
end;
$$;

do $$
begin
  begin
    perform public.notification_reessayer(pg_temp.fid('notif_a_incomplete'));
    perform pg_temp.assert(false, 'anon ne doit pas pouvoir executer notification_reessayer()');
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;

-- =====================================================================
-- 7. Garage propriétaire : voit uniquement SES notifications incomplètes
-- =====================================================================

select set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid('user_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

select pg_temp.assert(
  (select count(*) from public.notifications_devis) = 0,
  'authenticated ne doit pas lire la table en direct (RLS active sans policy)');

select pg_temp.assert(
  (select count(*) from public.notifications_a_verifier()) = 1,
  'garage A doit voir exactement 1 notification incomplete');

select pg_temp.assert(
  (select id from public.notifications_a_verifier()) = pg_temp.fid('notif_a_incomplete'),
  'garage A doit voir SA notification incomplete, pas une autre');

select pg_temp.assert(
  (select motif from public.notifications_a_verifier()) = 'vehicule_absent',
  'le motif doit etre remonte tel quel (code court)');

reset role;

-- =====================================================================
-- 8. Garage tiers : ne voit rien du garage A, et ne peut pas agir dessus
-- =====================================================================

select set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid('user_b')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

select pg_temp.assert(
  (select count(*) from public.notifications_a_verifier()) = 1,
  'garage B doit voir exactement sa propre notification incomplete');

select pg_temp.assert(
  (select id from public.notifications_a_verifier()) = pg_temp.fid('notif_b_incomplete'),
  'garage B ne doit jamais voir la notification du garage A');

do $$
begin
  begin
    perform public.notification_reessayer(pg_temp.fid('notif_a_incomplete'));
    perform pg_temp.assert(false, 'garage B ne doit pas pouvoir reessayer une notification du garage A');
  exception when others then
    perform pg_temp.assert(sqlerrm like '%hors perimetre%' or sqlerrm like '%introuvable%',
      'le refus inter-garage doit venir du controle de perimetre (constate: ' || sqlerrm || ')');
  end;
end;
$$;

do $$
begin
  begin
    perform public.notification_abandonner(pg_temp.fid('notif_a_incomplete'));
    perform pg_temp.assert(false, 'garage B ne doit pas pouvoir abandonner une notification du garage A');
  exception when others then
    perform pg_temp.assert(sqlerrm like '%hors perimetre%' or sqlerrm like '%introuvable%',
      'le refus inter-garage doit venir du controle de perimetre (constate: ' || sqlerrm || ')');
  end;
end;
$$;

reset role;

select pg_temp.assert(
  (select statut_traitement from notifications_devis where id = pg_temp.fid('notif_a_incomplete')) = 'incomplet',
  'la notification du garage A doit etre restee intacte apres les tentatives du garage B');

-- =====================================================================
-- 9. Compte authentifié SANS garage : refus explicite
-- =====================================================================

select set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid('user_c')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

select pg_temp.assert(
  (select count(*) from public.notifications_a_verifier()) = 0,
  'un compte sans garage ne doit rien voir');

do $$
begin
  begin
    perform public.notification_reessayer(pg_temp.fid('notif_a_incomplete'));
    perform pg_temp.assert(false, 'un compte sans garage ne doit pas pouvoir agir');
  exception when others then
    perform pg_temp.assert(sqlerrm like '%Aucun garage%',
      'le refus doit etre explicite sur absence de garage (constate: ' || sqlerrm || ')');
  end;
end;
$$;

reset role;

-- =====================================================================
-- 10. Réessayer : remet en file et efface le motif
-- =====================================================================

select set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid('user_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

select public.notification_reessayer(pg_temp.fid('notif_a_incomplete'));

reset role;

select pg_temp.assert(
  (select statut_traitement from notifications_devis where id = pg_temp.fid('notif_a_incomplete')) = 'en_attente',
  'reessayer doit remettre la notification en attente');
select pg_temp.assert(
  (select incomplet_motif from notifications_devis where id = pg_temp.fid('notif_a_incomplete')) is null,
  'reessayer doit effacer le motif');
select pg_temp.assert(
  (select envoye from notifications_devis where id = pg_temp.fid('notif_a_incomplete')) is false,
  'reessayer ne doit jamais toucher a envoye');

-- Réessayer une notification qui n'est plus incomplète doit échouer
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid('user_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  begin
    perform public.notification_reessayer(pg_temp.fid('notif_a_incomplete'));
    perform pg_temp.assert(false, 'reessayer deux fois de suite doit echouer');
  exception when others then
    perform pg_temp.assert(sqlerrm like '%deja traitee%' or sqlerrm like '%introuvable%',
      'le second reessai doit etre refuse (constate: ' || sqlerrm || ')');
  end;
end;
$$;

reset role;

-- =====================================================================
-- 11. Abandonner : sortie définitive, sans suppression
-- =====================================================================

update notifications_devis
set statut_traitement = 'incomplet', incomplet_motif = 'garage_absent'
where id = pg_temp.fid('notif_a_incomplete');

select set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid('user_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

select public.notification_abandonner(pg_temp.fid('notif_a_incomplete'));

select pg_temp.assert(
  (select count(*) from public.notifications_a_verifier()) = 0,
  'une notification abandonnee doit disparaitre de la liste a verifier');

reset role;

select pg_temp.assert(
  (select statut_traitement from notifications_devis where id = pg_temp.fid('notif_a_incomplete')) = 'abandonne',
  'abandonner doit poser le statut abandonne');
select pg_temp.assert(
  (select count(*) from notifications_devis where id = pg_temp.fid('notif_a_incomplete')) = 1,
  'abandonner ne doit jamais supprimer la ligne');

-- =====================================================================
-- 12. Annulation intégrale
-- =====================================================================

rollback;

-- =====================================================================
-- 13. Vérification post-rollback : aucun résidu (hors transaction)
-- =====================================================================

do $$
declare
  v_residus integer := 0;
  v_n integer;
begin
  select count(*) into v_n from public.garages where nom_garage like 'RECETTE NOTIF DEVIS V1%';
  v_residus := v_residus + v_n;
  select count(*) into v_n from public.clients where nom like 'RECETTE NOTIF DEVIS V1%';
  v_residus := v_residus + v_n;
  select count(*) into v_n from public.vehicules where marque = 'MarqueTestNotifV1';
  v_residus := v_residus + v_n;
  select count(*) into v_n from public.prestations where nom like 'RECETTE NOTIF DEVIS V1%';
  v_residus := v_residus + v_n;
  select count(*) into v_n from public.devis where message_garage = 'RECETTE NOTIF DEVIS V1';
  v_residus := v_residus + v_n;
  select count(*) into v_n from public.notifications_devis where type = 'recette_notif_v1';
  v_residus := v_residus + v_n;
  select count(*) into v_n from auth.users where email like 'recette-notif-%@example.invalid';
  v_residus := v_residus + v_n;

  if v_residus <> 0 then
    raise exception 'RESIDU DETECTE APRES ROLLBACK : % ligne(s) synthetique(s) subsistent', v_residus;
  end if;

  raise notice 'Banc notifications_devis : OK, aucun residu.';
end;
$$;
