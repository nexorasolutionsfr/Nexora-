-- Confinement de `creer_jeton_confirmation` — banc AUTONOME et RÉVERSIBLE.
--
-- Convention du dépôt (voir supabase/tests/ordres_reparation_v1.sql) :
-- transaction unique jamais validée, `_fixture_ids`, `pg_temp.fid()`,
-- `pg_temp.assert()`, impersonation par `request.jwt.claims`, vérification
-- post-rollback.
--
-- Ce fichier n'est PAS une migration. Il présuppose 20260907000100
-- appliquée. À exécuter uniquement sur l'environnement de test isolé,
-- jamais sur Production.
--
-- Aucun jeton n'est affiché : le banc en manipule un, mais ne l'imprime
-- jamais et n'en conserve rien après annulation.
--
-- Ce que ce banc prouve, dans cet ordre :
--   1. l'émission légitime fonctionne toujours, de bout en bout ;
--   2. le jeton produit ouvre bien le parcours client anonyme ;
--   3. un appel direct anonyme est refusé au niveau du privilège ;
--   4. un appel direct authentifié l'est aussi ;
--   5. rien d'autre du parcours de confirmation n'a été fermé.

begin;

create temporary table _fixture_ids (
  cle text primary key,
  valeur uuid not null
) on commit drop;

create function pg_temp.fid(p_cle text) returns uuid
language sql security definer set search_path = '' as $$
  select valeur from pg_temp._fixture_ids where cle = p_cle;
$$;
revoke execute on function pg_temp.fid(text) from public;
grant execute on function pg_temp.fid(text) to authenticated;

create function pg_temp.assert(p_condition boolean, p_message text) returns void
language plpgsql set search_path = '' as $$
begin
  if p_condition is not true then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
end;
$$;
revoke execute on function pg_temp.assert(boolean, text) from public;
grant execute on function pg_temp.assert(boolean, text) to authenticated;

insert into _fixture_ids (cle, valeur) values
  ('user_a', gen_random_uuid()),
  ('garage_a', gen_random_uuid()),
  ('client_a', gen_random_uuid()),
  ('vehicule_a', gen_random_uuid()),
  ('rdv_a', gen_random_uuid());

insert into auth.users
  (id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (pg_temp.fid('user_a'), 'authenticated', 'authenticated',
   'recette-jeton-conf-' || pg_temp.fid('user_a')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture', now(),
   '{}'::jsonb, '{}'::jsonb, now(), now());

-- Le garage doit avoir les rappels actifs pour que la chaîne se déclenche.
insert into garages (id, owner_user_id, nom_garage, rappel_confirmation_actif, delai_confirmation_rdv_h)
values (pg_temp.fid('garage_a'), pg_temp.fid('user_a'),
        'RECETTE JETON CONF — GARAGE A', true, 24);

insert into clients (id, garage_id, nom, email) values
  (pg_temp.fid('client_a'), pg_temp.fid('garage_a'),
   'RECETTE JETON CONF — CLIENT A', 'recette-jeton-conf-client@example.invalid');

insert into vehicules (id, garage_id, client_id, marque, modele, immatriculation) values
  (pg_temp.fid('vehicule_a'), pg_temp.fid('garage_a'), pg_temp.fid('client_a'),
   'MarqueTestJetonConf', 'ModeleTest', 'JC-001-JC');

-- Rendez-vous éligible : confirmé, source « test », dans la fenêtre de
-- rappel (à venir, et à moins de 24 heures).
insert into rendez_vous
  (id, garage_id, client_id, vehicule_id, date_debut, date_fin, statut, source, notes)
values
  (pg_temp.fid('rdv_a'), pg_temp.fid('garage_a'), pg_temp.fid('client_a'), pg_temp.fid('vehicule_a'),
   now() + interval '2 hours', now() + interval '3 hours', 'confirme', 'test', 'RECETTE JETON CONF');

-- =====================================================================
-- 1. Les privilèges sont bien ceux annoncés
-- =====================================================================

do $$
begin
  perform pg_temp.assert(
    not has_function_privilege('anon', 'public.creer_jeton_confirmation(uuid)', 'EXECUTE'),
    'anon ne doit plus pouvoir émettre un jeton de confirmation');
  perform pg_temp.assert(
    not has_function_privilege('authenticated', 'public.creer_jeton_confirmation(uuid)', 'EXECUTE'),
    'authenticated ne doit plus pouvoir émettre un jeton de confirmation');
  perform pg_temp.assert(
    has_function_privilege('service_role', 'public.creer_jeton_confirmation(uuid)', 'EXECUTE'),
    'service_role est conservé temporairement, en attendant l''audit n8n');

  -- Le corps n'a pas été touché.
  perform pg_temp.assert(
    exists (select 1 from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
            where p.proname = 'creer_jeton_confirmation' and p.prosecdef),
    'la fonction reste SECURITY DEFINER');
end;
$$;

-- =====================================================================
-- 2. L'émission légitime fonctionne toujours, de bout en bout
-- =====================================================================
--
-- On déclenche exactement ce que déclenche la tâche planifiée : un appel à
-- `preparer_rappels_confirmation()` sous le rôle de session, qui est celui
-- du job `pg_cron`. Si le confinement avait cassé l'appel interne, aucune
-- ligne ne serait produite.

do $$
declare
  v_prepares int;
  v_lien text;
begin
  v_prepares := preparer_rappels_confirmation();
  perform pg_temp.assert(v_prepares >= 1,
    'La préparation des rappels doit produire au moins une ligne');

  select lien_public into v_lien
  from confirmations_rappels_file
  where rendez_vous_id = pg_temp.fid('rdv_a');

  perform pg_temp.assert(v_lien is not null,
    'Le rendez-vous de recette doit avoir sa ligne de rappel');
  -- On vérifie la forme du lien, jamais sa valeur.
  perform pg_temp.assert(v_lien like 'https://%/c/%',
    'Le lien de confirmation doit pointer vers le parcours client');
  perform pg_temp.assert(length(split_part(v_lien, '/c/', 2)) = 64,
    'Le jeton émis doit faire 64 caractères hexadécimaux');

  perform pg_temp.assert(
    (select count(*) from confirmations_jetons
      where rendez_vous_id = pg_temp.fid('rdv_a') and revoked_at is null) = 1,
    'Un jeton actif, et un seul, doit exister pour ce rendez-vous');
end;
$$;

-- =====================================================================
-- 3. Le jeton émis ouvre bien le parcours client anonyme
-- =====================================================================
--
-- Le jeton est relu depuis la file, jamais imprimé. Lui et l'identifiant du
-- rendez-vous transitent par des paramètres de session transactionnels, lisibles par n'importe quel rôle : aucune table
-- ni fonction du schéma temporaire n'est sollicitée sous le rôle anon, dont
-- l'accès à `pg_temp` dépend de privilèges qu'on ne veut pas supposer.
do $$
declare
  v_token text;
begin
  select split_part(lien_public, '/c/', 2) into v_token
  from confirmations_rappels_file
  where rendez_vous_id = pg_temp.fid('rdv_a');

  perform set_config('recette.jeton_confirmation', v_token, true);
  perform set_config('recette.rdv_id', pg_temp.fid('rdv_a')::text, true);
end;
$$;

set local role anon;

do $$
declare
  v_lignes int;
  v_err text;
begin
  begin
    select count(*) into v_lignes
    from lire_confirmation_par_jeton(current_setting('recette.jeton_confirmation'));
    v_err := 'AUCUNE';
  exception when others then
    v_err := sqlerrm;
  end;

  if v_err <> 'AUCUNE' then
    raise exception 'ASSERTION FAILED: le parcours client anonyme doit rester ouvert, obtenu : %', v_err;
  end if;
  if v_lignes <> 1 then
    raise exception 'ASSERTION FAILED: le jeton emis doit ouvrir exactement une confirmation, obtenu : %', v_lignes;
  end if;
end;
$$;

-- =====================================================================
-- 4. Un appel direct anonyme est refusé au niveau du privilège
-- =====================================================================
--
-- L'identifiant passé est celui d'un rendez-vous réel et éligible : le
-- refus ne peut donc pas venir d'un identifiant introuvable.

do $$
declare v_err text;
begin
  begin
    perform creer_jeton_confirmation(current_setting('recette.rdv_id')::uuid);
    v_err := 'AUCUNE';
  exception when others then v_err := sqlstate;
  end;
  -- 42501 = insufficient_privilege : le refus vient du droit d'exécution,
  -- et non d'un contrôle applicatif — la fonction n'en a aucun.
  if v_err <> '42501' then
    raise exception
      'ASSERTION FAILED: anon doit se voir refuser l''emission au niveau du privilege, obtenu : %', v_err;
  end if;
end;
$$;

reset role;

-- =====================================================================
-- 5. Un appel direct authentifié est refusé lui aussi
-- =====================================================================

select set_config('request.jwt.claims',
  json_build_object('sub', pg_temp.fid('user_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare v_err text;
begin
  begin
    perform creer_jeton_confirmation(pg_temp.fid('rdv_a'));
    v_err := 'AUCUNE';
  exception when others then v_err := sqlstate;
  end;
  perform pg_temp.assert(v_err = '42501',
    'Même le propriétaire du garage ne doit plus émettre un jeton en direct, obtenu : ' || v_err);
end;
$$;

reset role;

-- =====================================================================
-- 6. Non-régression du reste du parcours de confirmation
-- =====================================================================

do $$
declare
  v_nom text;
  v_fermees text := '';
begin
  foreach v_nom in array array[
    'lire_confirmation_par_jeton',
    'repondre_confirmation_par_jeton'
  ] loop
    if not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
      where p.proname = v_nom and has_function_privilege('anon', p.oid, 'EXECUTE')
    ) then
      v_fermees := v_fermees || v_nom || ' ';
    end if;
  end loop;

  perform pg_temp.assert(v_fermees = '',
    'Ce lot ne doit fermer aucune étape du parcours client : ' || v_fermees);

  perform pg_temp.assert(
    has_function_privilege('postgres', 'public.preparer_rappels_confirmation()', 'EXECUTE'),
    'La tâche planifiée doit rester déclenchable par postgres');
end;
$$;

rollback;

-- =====================================================================
-- 7. Vérification post-rollback (hors transaction, lecture seule)
-- =====================================================================

do $$
declare
  v_residus text[] := array[]::text[];
  v_n int;
begin
  select count(*) into v_n from auth.users where email like 'recette-jeton-conf-%@example.invalid';
  if v_n > 0 then v_residus := v_residus || ('auth.users : ' || v_n); end if;

  select count(*) into v_n from public.garages where nom_garage like 'RECETTE JETON CONF%';
  if v_n > 0 then v_residus := v_residus || ('garages : ' || v_n); end if;

  select count(*) into v_n from public.clients where nom like 'RECETTE JETON CONF%';
  if v_n > 0 then v_residus := v_residus || ('clients : ' || v_n); end if;

  select count(*) into v_n from public.vehicules where marque = 'MarqueTestJetonConf';
  if v_n > 0 then v_residus := v_residus || ('vehicules : ' || v_n); end if;

  select count(*) into v_n from public.rendez_vous where notes = 'RECETTE JETON CONF';
  if v_n > 0 then v_residus := v_residus || ('rendez_vous : ' || v_n); end if;

  select count(*) into v_n from public.confirmations_rappels_file
    where destinataire_email = 'recette-jeton-conf-client@example.invalid';
  if v_n > 0 then v_residus := v_residus || ('confirmations_rappels_file : ' || v_n); end if;

  if array_length(v_residus, 1) > 0 then
    raise exception 'NETTOYAGE ÉCHOUÉ après rollback : %', array_to_string(v_residus, '; ');
  end if;

  raise notice 'CONFINEMENT CREER_JETON_CONFIRMATION : banc passé, aucune fixture résiduelle.';
end;
$$;
