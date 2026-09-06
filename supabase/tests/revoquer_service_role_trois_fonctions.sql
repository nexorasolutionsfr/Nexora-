-- Révocation de `service_role` sur les trois fonctions durcies —
-- banc AUTONOME et RÉVERSIBLE.
--
-- Convention du dépôt (voir supabase/tests/ordres_reparation_v1.sql) :
-- transaction unique jamais validée, `_fixture_ids`, `pg_temp.fid()`,
-- `pg_temp.assert()`, impersonation par `request.jwt.claims`, vérification
-- post-rollback.
--
-- Ce fichier n'est PAS une migration. Il présuppose 20260908000100
-- appliquée. À exécuter uniquement sur l'environnement de test isolé,
-- jamais sur Production.
--
-- Aucun jeton ni aucune valeur de clé n'est affiché. La valeur écrite est une
-- chaîne de recette explicitement fausse, jamais relue.
--
-- Ce que ce banc prouve :
--   1. l'état des droits est exactement celui visé, rôle par rôle ;
--   2. `service_role` est refusé sur les trois fonctions, au niveau du
--      privilège et non par un contrôle applicatif ;
--   3. le tableau de bord authentifié garde ses deux fonctions Stripe, et
--      elles fonctionnent toujours ;
--   4. aucun rôle appelant ne peut plus émettre un jeton de confirmation ;
--   5. le chemin interne privilégié émet toujours, et le jeton produit
--      ouvre toujours le parcours client anonyme.

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
   'recette-revoc-srv-' || pg_temp.fid('user_a')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture', now(),
   '{}'::jsonb, '{}'::jsonb, now(), now());

insert into garages (id, owner_user_id, nom_garage, rappel_confirmation_actif, delai_confirmation_rdv_h)
values (pg_temp.fid('garage_a'), pg_temp.fid('user_a'),
        'RECETTE REVOC SRV — GARAGE A', true, 24);

insert into clients (id, garage_id, nom, email) values
  (pg_temp.fid('client_a'), pg_temp.fid('garage_a'),
   'RECETTE REVOC SRV — CLIENT A', 'recette-revoc-srv-client@example.invalid');

insert into vehicules (id, garage_id, client_id, marque, modele, immatriculation) values
  (pg_temp.fid('vehicule_a'), pg_temp.fid('garage_a'), pg_temp.fid('client_a'),
   'MarqueTestRevocSrv', 'ModeleTest', 'RS-001-RS');

insert into rendez_vous
  (id, garage_id, client_id, vehicule_id, date_debut, date_fin, statut, source, notes)
values
  (pg_temp.fid('rdv_a'), pg_temp.fid('garage_a'), pg_temp.fid('client_a'), pg_temp.fid('vehicule_a'),
   now() + interval '2 hours', now() + interval '3 hours', 'confirme', 'test', 'RECETTE REVOC SRV');

-- =====================================================================
-- 1. L'état des droits est exactement celui visé
-- =====================================================================

do $$
declare
  v_fn text;
begin
  -- Les trois fonctions : fermées à anon et à service_role.
  foreach v_fn in array array[
    'public.set_stripe_secret_key(text)',
    'public.stripe_configure_pour_mon_garage()',
    'public.creer_jeton_confirmation(uuid)'
  ] loop
    perform pg_temp.assert(
      not has_function_privilege('anon', v_fn::regprocedure, 'EXECUTE'),
      v_fn || ' doit rester fermée à anon');
    perform pg_temp.assert(
      not has_function_privilege('service_role', v_fn::regprocedure, 'EXECUTE'),
      v_fn || ' doit être fermée à service_role');
  end loop;

  -- Les deux fonctions Stripe restent ouvertes au tableau de bord.
  perform pg_temp.assert(
    has_function_privilege('authenticated', 'public.set_stripe_secret_key(text)', 'EXECUTE'),
    'authenticated doit conserver l''enregistrement de la clé Stripe');
  perform pg_temp.assert(
    has_function_privilege('authenticated', 'public.stripe_configure_pour_mon_garage()', 'EXECUTE'),
    'authenticated doit conserver la lecture d''état Stripe');

  -- L'émission de jeton n'est ouverte à aucun rôle appelant.
  perform pg_temp.assert(
    not has_function_privilege('authenticated', 'public.creer_jeton_confirmation(uuid)', 'EXECUTE'),
    'aucun rôle appelant ne doit pouvoir émettre un jeton');

  -- Le chemin interne et le parcours client ne bougent pas.
  perform pg_temp.assert(
    has_function_privilege('postgres', 'public.preparer_rappels_confirmation()', 'EXECUTE'),
    'la tâche planifiée doit rester déclenchable par postgres');
  perform pg_temp.assert(
    has_function_privilege('anon', 'public.lire_confirmation_par_jeton(text)', 'EXECUTE'),
    'le parcours client de confirmation doit rester ouvert');
end;
$$;

-- =====================================================================
-- 2. Le chemin interne privilégié émet toujours
-- =====================================================================
--
-- On déclenche ce que déclenche la tâche planifiée. Si la révocation avait
-- cassé l'appel interne, aucune ligne ne serait produite.

do $$
declare
  v_prepares int;
  v_lien text;
  v_token text;
begin
  v_prepares := preparer_rappels_confirmation();
  perform pg_temp.assert(v_prepares >= 1,
    'La préparation des rappels doit produire au moins une ligne');

  select lien_public into v_lien
  from confirmations_rappels_file
  where rendez_vous_id = pg_temp.fid('rdv_a');

  perform pg_temp.assert(v_lien is not null,
    'Le rendez-vous de recette doit avoir sa ligne de rappel');
  perform pg_temp.assert(length(split_part(v_lien, '/c/', 2)) = 64,
    'Le jeton émis doit faire 64 caractères hexadécimaux');
  perform pg_temp.assert(
    (select count(*) from confirmations_jetons
      where rendez_vous_id = pg_temp.fid('rdv_a') and revoked_at is null) = 1,
    'Un jeton actif, et un seul, doit exister pour ce rendez-vous');

  -- Transmis par paramètres de session : aucune table temporaire n'est
  -- sollicitée sous les rôles anon et service_role, dont l'accès à
  -- `pg_temp` dépend de privilèges qu'on ne veut pas supposer.
  perform set_config('recette.jeton', split_part(v_lien, '/c/', 2), true);
  perform set_config('recette.rdv_id', pg_temp.fid('rdv_a')::text, true);
end;
$$;

-- =====================================================================
-- 3. service_role est refusé sur les trois fonctions
-- =====================================================================

set local role service_role;

do $$
declare
  v_err text;
  v_echecs text := '';
begin
  begin
    perform set_stripe_secret_key('RECETTE-REVOC-SRV-VALEUR-FACTICE');
    v_err := 'AUCUNE';
  exception when others then v_err := sqlstate;
  end;
  if v_err <> '42501' then
    v_echecs := v_echecs || 'set_stripe_secret_key=' || v_err || ' ';
  end if;

  begin
    perform stripe_configure_pour_mon_garage();
    v_err := 'AUCUNE';
  exception when others then v_err := sqlstate;
  end;
  if v_err <> '42501' then
    v_echecs := v_echecs || 'stripe_configure_pour_mon_garage=' || v_err || ' ';
  end if;

  begin
    perform creer_jeton_confirmation(current_setting('recette.rdv_id')::uuid);
    v_err := 'AUCUNE';
  exception when others then v_err := sqlstate;
  end;
  if v_err <> '42501' then
    v_echecs := v_echecs || 'creer_jeton_confirmation=' || v_err || ' ';
  end if;

  -- 42501 = insufficient_privilege : le refus vient du droit d'exécution.
  if v_echecs <> '' then
    raise exception
      'ASSERTION FAILED: service_role doit etre refuse au niveau du privilege sur les trois. Ecarts : %',
      v_echecs;
  end if;
end;
$$;

reset role;

-- =====================================================================
-- 4. anon reste refusé, et le parcours client reste ouvert
-- =====================================================================

set local role anon;

do $$
declare
  v_err text;
  v_lignes int;
begin
  begin
    perform creer_jeton_confirmation(current_setting('recette.rdv_id')::uuid);
    v_err := 'AUCUNE';
  exception when others then v_err := sqlstate;
  end;
  if v_err <> '42501' then
    raise exception 'ASSERTION FAILED: anon doit rester refuse sur l''emission, obtenu : %', v_err;
  end if;

  begin
    select count(*) into v_lignes
    from lire_confirmation_par_jeton(current_setting('recette.jeton'));
    v_err := 'AUCUNE';
  exception when others then v_err := sqlerrm;
  end;
  if v_err <> 'AUCUNE' then
    raise exception 'ASSERTION FAILED: le parcours client doit rester ouvert, obtenu : %', v_err;
  end if;
  if v_lignes <> 1 then
    raise exception 'ASSERTION FAILED: le jeton emis doit ouvrir une confirmation, obtenu : %', v_lignes;
  end if;
end;
$$;

reset role;

-- =====================================================================
-- 5. Le tableau de bord authentifié n'a rien perdu
-- =====================================================================

select set_config('request.jwt.claims',
  json_build_object('sub', pg_temp.fid('user_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare v_err text;
begin
  perform pg_temp.assert(
    stripe_configure_pour_mon_garage() = false,
    'Avant enregistrement, le garage n''est pas configuré');

  perform set_stripe_secret_key('RECETTE-REVOC-SRV-VALEUR-FACTICE');

  perform pg_temp.assert(
    stripe_configure_pour_mon_garage() = true,
    'Après enregistrement, le garage est configuré : les deux fonctions Stripe marchent toujours');

  -- Mais il ne peut toujours pas émettre un jeton de confirmation.
  begin
    perform creer_jeton_confirmation(pg_temp.fid('rdv_a'));
    v_err := 'AUCUNE';
  exception when others then v_err := sqlstate;
  end;
  perform pg_temp.assert(v_err = '42501',
    'Un compte authentifié ne doit pas émettre de jeton, obtenu : ' || v_err);
end;
$$;

reset role;

rollback;

-- =====================================================================
-- 6. Vérification post-rollback (hors transaction, lecture seule)
-- =====================================================================

do $$
declare
  v_residus text[] := array[]::text[];
  v_n int;
begin
  select count(*) into v_n from auth.users where email like 'recette-revoc-srv-%@example.invalid';
  if v_n > 0 then v_residus := v_residus || ('auth.users : ' || v_n); end if;

  select count(*) into v_n from public.garages where nom_garage like 'RECETTE REVOC SRV%';
  if v_n > 0 then v_residus := v_residus || ('garages : ' || v_n); end if;

  select count(*) into v_n from public.clients where nom like 'RECETTE REVOC SRV%';
  if v_n > 0 then v_residus := v_residus || ('clients : ' || v_n); end if;

  select count(*) into v_n from public.vehicules where marque = 'MarqueTestRevocSrv';
  if v_n > 0 then v_residus := v_residus || ('vehicules : ' || v_n); end if;

  select count(*) into v_n from public.rendez_vous where notes = 'RECETTE REVOC SRV';
  if v_n > 0 then v_residus := v_residus || ('rendez_vous : ' || v_n); end if;

  select count(*) into v_n from public.confirmations_rappels_file
    where destinataire_email = 'recette-revoc-srv-client@example.invalid';
  if v_n > 0 then v_residus := v_residus || ('confirmations_rappels_file : ' || v_n); end if;

  if array_length(v_residus, 1) > 0 then
    raise exception 'NETTOYAGE ÉCHOUÉ après rollback : %', array_to_string(v_residus, '; ');
  end if;

  raise notice 'REVOCATION SERVICE_ROLE : banc passé, aucune fixture résiduelle.';
end;
$$;
