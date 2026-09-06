-- Réconciliation accès salariés / verrou d'accès — banc de test AUTONOME et
-- RÉVERSIBLE.
--
-- Convention reprise à l'identique de supabase/tests/acces_salaries_v1.sql :
-- une transaction unique jamais validée, une table temporaire `_fixture_ids`
-- pour tous les identifiants, `pg_temp.fid()` et `pg_temp.assert()`, une
-- impersonation par `set_config('request.jwt.claims', ...)` suivie de
-- `set local role authenticated`, et un `reset role;` après chaque bloc.
--
-- Ce fichier n'est PAS une migration. Il présuppose appliquées les
-- migrations du lot accès salariés (20260905000100 à 20260905001000), le
-- verrou d'accès (20260909000900) et la réconciliation (20260910000100).
-- À exécuter uniquement sur l'environnement de test isolé, jamais sur
-- Production.
--
-- Marqueur de nettoyage : toutes les fixtures portent « RECETTE RECONC »
-- ou l'adresse `recette-reconc-...@example.invalid`. La vérification
-- post-rollback en fin de fichier échoue si la moindre ligne subsiste.
--
-- CE QUE CE BANC PROUVE
--
-- Le lot accès salariés (daté 09-05) et le verrou d'accès (daté 09-09) sont
-- corrects séparément et faux ensemble : le premier s'applique après le
-- second en Production malgré son numéro plus ancien, et le défait sans
-- qu'aucune migration n'échoue. Les deux régressions visées :
--
--   1. `a_acces_garage()` ne testait que le rôle. Les policies `_accueil`
--      étant permissives et `for all`, elles rouvraient en OU ce que le
--      verrou avait fermé : un garage échu redevenait lisible ET modifiable
--      dès qu'un membre portait le rôle `accueil`.
--
--   2. `current_garage_id()` était refaite sans contrôle d'accès, rouvrant
--      les 15 policies de la « famille 1 ».
--
-- Le banc vérifie les deux, DANS LES DEUX SENS : un garage échu est refoulé,
-- et un garage à l'accès ouvert continue de fonctionner normalement. Sans ce
-- second volet, une réconciliation qui bloquerait tout le monde passerait
-- pour un succès.

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
  ('user_prop_ouvert', gen_random_uuid()),
  ('user_prop_echu', gen_random_uuid()),
  ('user_accueil_ouvert', gen_random_uuid()),
  ('user_accueil_echu', gen_random_uuid()),
  ('user_dirigeant_membre_echu', gen_random_uuid()),
  ('garage_ouvert', gen_random_uuid()),
  ('garage_echu', gen_random_uuid()),
  ('client_ouvert', gen_random_uuid()),
  ('client_echu', gen_random_uuid());

-- =====================================================================
-- 1. Comptes synthétiques
-- =====================================================================

insert into auth.users
  (id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select v.id, 'authenticated', 'authenticated',
       'recette-reconc-' || v.id::text || '@example.invalid',
       'not-a-real-credential-synthetic-test-fixture', now(),
       '{}'::jsonb, '{}'::jsonb, now(), now()
from (values
  (pg_temp.fid('user_prop_ouvert')),
  (pg_temp.fid('user_prop_echu')),
  (pg_temp.fid('user_accueil_ouvert')),
  (pg_temp.fid('user_accueil_echu')),
  (pg_temp.fid('user_dirigeant_membre_echu'))
) as v(id);

-- =====================================================================
-- 2. Fixtures métier (rôle opérateur : contourne RLS, comportement normal)
-- =====================================================================

-- L'accès est explicite des deux côtés. `abonnement_actif` vaut `false` par
-- défaut : sans cette colonne posée à la main, les DEUX garages seraient
-- échus et le banc passerait pour de mauvaises raisons.
insert into garages (id, owner_user_id, nom_garage, abonnement_actif, acces_motif, acces_fin) values
  (pg_temp.fid('garage_ouvert'), pg_temp.fid('user_prop_ouvert'),
   'RECETTE RECONC — GARAGE OUVERT', true, 'abonnement', null),
  (pg_temp.fid('garage_echu'), pg_temp.fid('user_prop_echu'),
   'RECETTE RECONC — GARAGE ECHU', false, 'essai', now() - interval '1 day');

insert into clients (id, garage_id, nom, email, telephone) values
  (pg_temp.fid('client_ouvert'), pg_temp.fid('garage_ouvert'), 'RECETTE RECONC — CLIENT OUVERT',
   'recette-reconc-client-ouvert@example.invalid', '0600000000'),
  (pg_temp.fid('client_echu'), pg_temp.fid('garage_echu'), 'RECETTE RECONC — CLIENT ECHU',
   'recette-reconc-client-echu@example.invalid', '0600000001');

insert into garage_membres (garage_id, user_id, role) values
  (pg_temp.fid('garage_ouvert'), pg_temp.fid('user_accueil_ouvert'), 'accueil'),
  (pg_temp.fid('garage_echu'), pg_temp.fid('user_accueil_echu'), 'accueil'),
  (pg_temp.fid('garage_echu'), pg_temp.fid('user_dirigeant_membre_echu'), 'dirigeant');

-- Garde-fou du banc lui-même : si la règle d'accès ne voyait pas ces deux
-- garages comme opposés, tout ce qui suit ne prouverait rien.
do $$
begin
  perform pg_temp.assert(
    acces_garage_ouvert(pg_temp.fid('garage_ouvert')),
    'Fixture incohérente : le garage ouvert doit avoir un accès ouvert');
  perform pg_temp.assert(
    not acces_garage_ouvert(pg_temp.fid('garage_echu')),
    'Fixture incohérente : le garage échu doit avoir un accès fermé');
end;
$$;

-- =====================================================================
-- 3. Régression 1 — le rôle `accueil` ne contourne plus le verrou
-- =====================================================================

select set_config('request.jwt.claims',
  json_build_object('sub', pg_temp.fid('user_accueil_echu')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_n int;
begin
  -- Le rôle est bien porté : ce n'est pas l'adhésion qui manque, c'est
  -- l'accès du garage qui est fermé. Sans cette assertion, un banc où
  -- l'adhésion n'aurait pas été créée passerait tout aussi bien.
  perform pg_temp.assert(
    mon_role_garage(pg_temp.fid('garage_echu')) = 'accueil',
    'Le membre porte bien le rôle accueil sur le garage échu');

  perform pg_temp.assert(
    not a_acces_garage(pg_temp.fid('garage_echu'), 'accueil'),
    'RÉGRESSION 1 : a_acces_garage doit refuser un garage à l''accès échu');

  select count(*) into v_n from clients where garage_id = pg_temp.fid('garage_echu');
  perform pg_temp.assert(v_n = 0,
    'RÉGRESSION 1 : la policy clients_accueil ne doit rien laisser lire sur un garage échu');
end;
$$;

-- L'écriture est refoulée elle aussi : la policy est `for all`, un `with
-- check` qui laisserait passer l'insertion serait aussi grave qu'une lecture.
do $$
declare
  v_refuse boolean := false;
begin
  begin
    insert into clients (garage_id, nom, email)
    values (pg_temp.fid('garage_echu'), 'RECETTE RECONC — INTRUS',
            'recette-reconc-intrus@example.invalid');
  exception when insufficient_privilege or check_violation then
    v_refuse := true;
  end;

  perform pg_temp.assert(v_refuse,
    'RÉGRESSION 1 : l''écriture sur un garage échu doit être refusée');
end;
$$;

reset role;

-- =====================================================================
-- 4. Contre-épreuve — le rôle `accueil` fonctionne toujours si l'accès est ouvert
-- =====================================================================

select set_config('request.jwt.claims',
  json_build_object('sub', pg_temp.fid('user_accueil_ouvert')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_n int;
begin
  perform pg_temp.assert(
    a_acces_garage(pg_temp.fid('garage_ouvert'), 'accueil'),
    'CONTRE-ÉPREUVE : a_acces_garage doit accepter un garage à l''accès ouvert');

  select count(*) into v_n from clients where garage_id = pg_temp.fid('garage_ouvert');
  perform pg_temp.assert(v_n = 1,
    'CONTRE-ÉPREUVE : le rôle accueil doit toujours lire les clients d''un garage ouvert');

  -- Un garage ouvert ne donne toujours aucun droit sur le garage d'à côté :
  -- la réconciliation ajoute une condition, elle n'en retire aucune.
  perform pg_temp.assert(
    not a_acces_garage(pg_temp.fid('garage_echu'), 'accueil'),
    'CONTRE-ÉPREUVE : l''étanchéité entre garages reste entière');
end;
$$;

reset role;

-- =====================================================================
-- 5. Régression 2 — current_garage_id() reste soumise au verrou
-- =====================================================================

select set_config('request.jwt.claims',
  json_build_object('sub', pg_temp.fid('user_prop_echu')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  perform pg_temp.assert(
    current_garage_id() is null,
    'RÉGRESSION 2 : le propriétaire d''un garage échu ne doit résoudre aucun garage');
end;
$$;

reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', pg_temp.fid('user_prop_ouvert')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  perform pg_temp.assert(
    current_garage_id() = pg_temp.fid('garage_ouvert'),
    'CONTRE-ÉPREUVE : le propriétaire d''un garage ouvert résout toujours son garage');
end;
$$;

reset role;

-- =====================================================================
-- 6. L'extension légitime du lot est conservée, mais filtrée
-- =====================================================================
--
-- Le lot accès salariés a introduit une vraie nouveauté : un dirigeant peut
-- l'être par adhésion, sans posséder la ligne `garages`. La réconciliation
-- garde cette retombée — elle la soumet seulement à la même règle d'accès.

select set_config('request.jwt.claims',
  json_build_object('sub', pg_temp.fid('user_dirigeant_membre_echu')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  perform pg_temp.assert(
    mon_role_garage(pg_temp.fid('garage_echu')) = 'dirigeant',
    'Le membre est bien dirigeant par adhésion');
  perform pg_temp.assert(
    current_garage_id() is null,
    'Un dirigeant par adhésion sur un garage échu ne résout aucun garage');
end;
$$;

reset role;

-- La même adhésion, sur un garage dont l'accès est ouvert, résout bien : la
-- retombée n'a pas été supprimée, seulement conditionnée.
insert into garage_membres (garage_id, user_id, role)
values (pg_temp.fid('garage_ouvert'), pg_temp.fid('user_dirigeant_membre_echu'), 'dirigeant');

select set_config('request.jwt.claims',
  json_build_object('sub', pg_temp.fid('user_dirigeant_membre_echu')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  perform pg_temp.assert(
    current_garage_id() = pg_temp.fid('garage_ouvert'),
    'La retombée « dirigeant par adhésion » doit résoudre un garage à l''accès ouvert');
end;
$$;

reset role;

rollback;

-- =====================================================================
-- 7. Vérification post-rollback : aucune fixture ne subsiste
-- =====================================================================

do $$
declare
  v_residus text[] := array[]::text[];
  v_n int;
begin
  select count(*) into v_n from auth.users where email like 'recette-reconc-%@example.invalid';
  if v_n > 0 then v_residus := v_residus || ('auth.users : ' || v_n); end if;

  select count(*) into v_n from public.garages where nom_garage like 'RECETTE RECONC%';
  if v_n > 0 then v_residus := v_residus || ('garages : ' || v_n); end if;

  select count(*) into v_n from public.clients where nom like 'RECETTE RECONC%';
  if v_n > 0 then v_residus := v_residus || ('clients : ' || v_n); end if;

  if array_length(v_residus, 1) > 0 then
    raise exception 'NETTOYAGE ÉCHOUÉ après rollback — fixtures encore présentes : %',
      array_to_string(v_residus, '; ');
  end if;

  raise notice 'RECONCILIATION ACCES SALARIES / VERROU : banc passé, aucune fixture résiduelle.';
end;
$$;
