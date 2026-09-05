-- Onboarding garage V1 — banc de test AUTONOME et RÉVERSIBLE.
--
-- Convention reprise à l'identique de supabase/tests/devis_lignes_v1.sql :
-- transactionnel, auto-suffisant, aucun placeholder, aucune dépendance à une
-- donnée préexistante, exécutable tel quel depuis l'éditeur SQL Supabase
-- (aucune commande psql). Marqueur déterministe propre à ce fichier :
-- « RECETTE ONBOARDING V1 ».
--
-- Ce fichier N'EST PAS une migration. Il présuppose que
-- supabase/migrations/20260909000100_onboarding_garage_v1.sql a déjà été
-- appliquée sur l'environnement où on l'exécute — jamais Production.
--
-- RÉVERSIBILITÉ : tout se déroule dans la transaction ouverte par le `begin;`
-- ci-dessous, jamais validée ; le `rollback;` défait tout. Un bloc exécuté
-- APRÈS le rollback prouve l'absence de résidu par comptage sur le marqueur.

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

-- Assertion d'ECHEC STRICTE. Un `exception when others` qui constate qu'« une »
-- erreur est survenue valide le test pour n'importe quelle raison — y compris un
-- « permission denied » masquant une fonctionnalite cassee. Chaque echec attendu
-- est donc verifie sur son SQLSTATE ET sur un motif de son message.
create function pg_temp.assert_echec(
  p_cas text, p_state text, p_message text,
  p_state_attendu text, p_motif_attendu text
) returns void
language plpgsql set search_path = '' as $$
begin
  if p_state is null then
    raise exception 'ASSERTION FAILED: % — aucune erreur levee, une erreur % etait attendue', p_cas, p_state_attendu;
  end if;
  if p_state <> p_state_attendu then
    raise exception 'ASSERTION FAILED: % — SQLSTATE % attendu, obtenu % (%)', p_cas, p_state_attendu, p_state, p_message;
  end if;
  if position(lower(p_motif_attendu) in lower(p_message)) = 0 then
    raise exception 'ASSERTION FAILED: % — message attendu contenant "%", obtenu "%"', p_cas, p_motif_attendu, p_message;
  end if;
end;
$$;
revoke execute on function pg_temp.assert_echec(text, text, text, text, text) from public;
grant execute on function pg_temp.assert_echec(text, text, text, text, text) to authenticated;

insert into _fixture_ids (cle, valeur) values
  ('user_neuf',    gen_random_uuid()),
  ('user_occupe',  gen_random_uuid()),
  ('user_tiers',   gen_random_uuid()),
  ('garage_occupe', gen_random_uuid());

-- =====================================================================
-- 1. Fixtures
-- =====================================================================

insert into auth.users
  (id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (pg_temp.fid('user_neuf'), 'authenticated', 'authenticated',
   'recette-onboarding-neuf-' || pg_temp.fid('user_neuf')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture', now(),
   '{}'::jsonb, '{}'::jsonb, now(), now()),
  (pg_temp.fid('user_occupe'), 'authenticated', 'authenticated',
   'recette-onboarding-occupe-' || pg_temp.fid('user_occupe')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture', now(),
   '{}'::jsonb, '{}'::jsonb, now(), now()),
  (pg_temp.fid('user_tiers'), 'authenticated', 'authenticated',
   'recette-onboarding-tiers-' || pg_temp.fid('user_tiers')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture', now(),
   '{}'::jsonb, '{}'::jsonb, now(), now());

-- Un garage déjà existant, rattaché à user_occupe : sert au cas « ce compte
-- possede deja un garage » et au cas d'isolation.
insert into public.garages (id, owner_user_id, nom_garage)
values (pg_temp.fid('garage_occupe'), pg_temp.fid('user_occupe'), 'RECETTE ONBOARDING V1 — garage occupe');

-- =====================================================================
-- 2. Vocabulaire des profils — la règle est bien fermée par défaut
-- =====================================================================

do $$
begin
  perform pg_temp.assert(
    public.profil_activite_valide(array['mecanique']) is true,
    'profil : une valeur du vocabulaire doit etre acceptee');
  perform pg_temp.assert(
    public.profil_activite_valide(array['mecanique','carrosserie','pneus']) is true,
    'profil : plusieurs valeurs du vocabulaire doivent etre acceptees');

  perform pg_temp.assert(
    public.profil_activite_valide(null) is false,
    'profil : NULL doit etre refuse');
  perform pg_temp.assert(
    public.profil_activite_valide(array[]::text[]) is false,
    'profil : le tableau vide doit etre refuse');
  perform pg_temp.assert(
    public.profil_activite_valide(array['mecanique', null]) is false,
    'profil : un NULL parmi les valeurs doit etre refuse');
  perform pg_temp.assert(
    public.profil_activite_valide(array['plomberie']) is false,
    'profil : une valeur hors vocabulaire doit etre refusee');
  perform pg_temp.assert(
    public.profil_activite_valide(array['Mecanique']) is false,
    'profil : la casse doit etre significative, Mecanique est hors vocabulaire');
end;
$$;

-- =====================================================================
-- 3. Cas nominal — un compte neuf crée son garage
-- =====================================================================

do $$
declare
  v_garage_id uuid;
  v_proprietaire uuid;
  v_nom text;
  v_adresse text;
  v_telephone text;
  v_profil text[];
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid('user_neuf')::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_garage_id := public.creer_mon_garage(
    '  RECETTE ONBOARDING V1 — garage neuf  ',
    '  12 rue des Ateliers, Saint-Dizier  ',
    '  03 25 00 00 00  ',
    '   ',
    array['mecanique', 'carrosserie']
  );

  reset role;

  perform pg_temp.assert(v_garage_id is not null, 'nominal : un identifiant de garage doit etre renvoye');

  select owner_user_id, nom_garage, adresse, telephone, profil_activite
    into v_proprietaire, v_nom, v_adresse, v_telephone, v_profil
  from public.garages where id = v_garage_id;

  -- Le propriétaire vient de la session, jamais d'un paramètre.
  perform pg_temp.assert(v_proprietaire = pg_temp.fid('user_neuf'),
    'nominal : owner_user_id doit valoir auth.uid()');

  -- Les espaces de bordure sont retirés, un champ vide devient NULL.
  perform pg_temp.assert(v_nom = 'RECETTE ONBOARDING V1 — garage neuf',
    'nominal : le nom doit etre detoure, obtenu "' || coalesce(v_nom, '<null>') || '"');
  perform pg_temp.assert(v_adresse = '12 rue des Ateliers, Saint-Dizier',
    'nominal : l''adresse doit etre detouree');
  perform pg_temp.assert(v_telephone = '03 25 00 00 00',
    'nominal : le telephone doit etre detoure');
  perform pg_temp.assert(v_profil = array['mecanique', 'carrosserie'],
    'nominal : le profil doit etre enregistre tel quel');
end;
$$;

-- L'e-mail n'était qu'une suite d'espaces : il doit être NULL, pas une chaîne
-- vide. Vérifié hors du bloc précédent pour que l'assertion porte sur l'état
-- réellement persisté.
do $$
declare v_n integer;
begin
  select count(*) into v_n
  from public.garages
  where owner_user_id = pg_temp.fid('user_neuf') and email is not null;
  perform pg_temp.assert(v_n = 0, 'nominal : un e-mail vide doit etre stocke NULL, pas ""');
end;
$$;

-- =====================================================================
-- 4. Refus — un compte qui possède déjà un garage
-- =====================================================================

do $$
declare
  v_state text; v_msg text; v_n integer;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid('user_occupe')::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    perform public.creer_mon_garage('RECETTE ONBOARDING V1 — second garage', null, null, null, array['pneus']);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;

  reset role;

  perform pg_temp.assert_echec('second garage pour un meme compte', v_state, v_msg,
    '23505', 'possede deja un garage');

  select count(*) into v_n from public.garages where owner_user_id = pg_temp.fid('user_occupe');
  perform pg_temp.assert(v_n = 1, 'refus : user_occupe doit toujours avoir exactement un garage, vu ' || v_n);
end;
$$;

-- =====================================================================
-- 5. Refus — entrées invalides
-- =====================================================================

do $$
declare v_state text; v_msg text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid('user_tiers')::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 5.1 Nom vide.
  v_state := null;
  begin
    perform public.creer_mon_garage('   ', null, null, null, array['mecanique']);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('nom vide', v_state, v_msg, '22023', 'nom du garage est obligatoire');

  -- 5.2 Profil hors vocabulaire.
  v_state := null;
  begin
    perform public.creer_mon_garage('RECETTE ONBOARDING V1 — profil invalide', null, null, null, array['plomberie']);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('profil hors vocabulaire', v_state, v_msg, '22023', 'profil d''activite invalide');

  -- 5.3 Profil vide.
  v_state := null;
  begin
    perform public.creer_mon_garage('RECETTE ONBOARDING V1 — profil vide', null, null, null, array[]::text[]);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('profil vide', v_state, v_msg, '22023', 'profil d''activite invalide');

  -- 5.4 Profil NULL.
  v_state := null;
  begin
    perform public.creer_mon_garage('RECETTE ONBOARDING V1 — profil null', null, null, null, null);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('profil null', v_state, v_msg, '22023', 'profil d''activite invalide');

  reset role;
end;
$$;

-- Aucun de ces quatre refus ne doit avoir laissé de garage à user_tiers.
do $$
declare v_n integer;
begin
  select count(*) into v_n from public.garages where owner_user_id = pg_temp.fid('user_tiers');
  perform pg_temp.assert(v_n = 0, 'refus : user_tiers ne doit posseder aucun garage, vu ' || v_n);
end;
$$;

-- =====================================================================
-- 6. Fermeture aux rôles non authentifiés
-- =====================================================================

do $$
declare v_state text; v_msg text;
begin
  -- 6.1 anon n'a pas le droit d'executer la fonction, du tout.
  v_state := null;
  begin
    set local role anon;
    perform public.creer_mon_garage('RECETTE ONBOARDING V1 — anon', null, null, null, array['mecanique']);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  reset role;
  perform pg_temp.assert_echec('appel anon', v_state, v_msg, '42501', 'creer_mon_garage');

  -- 6.2 Un role authenticated SANS session (claims absents) est refuse par la
  -- garde interne, et non par le systeme de privileges : c'est ce qui prouve
  -- que la fonction ne se repose pas uniquement sur les GRANT.
  v_state := null;
  begin
    perform set_config('request.jwt.claims', '', true);
    set local role authenticated;
    perform public.creer_mon_garage('RECETTE ONBOARDING V1 — sans session', null, null, null, array['mecanique']);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  reset role;
  perform pg_temp.assert_echec('authenticated sans session', v_state, v_msg, '28000', 'sans session authentifiee');
end;
$$;

-- =====================================================================
-- 7. La contrainte de table tient aussi hors de la RPC
-- =====================================================================
-- La RPC valide le profil, mais elle n'est pas le seul chemin d'ecriture
-- possible (un futur import, une correction manuelle). La contrainte CHECK
-- doit donc refuser une valeur hors vocabulaire par elle-meme.

do $$
declare v_state text; v_msg text;
begin
  v_state := null;
  begin
    update public.garages
       set profil_activite = array['plomberie']
     where id = pg_temp.fid('garage_occupe');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('update hors vocabulaire', v_state, v_msg,
    '23514', 'garages_profil_activite_valide');

  -- NULL reste autorise : c'est l'etat des garages anterieurs au lot.
  update public.garages set profil_activite = null where id = pg_temp.fid('garage_occupe');
  perform pg_temp.assert(
    (select profil_activite is null from public.garages where id = pg_temp.fid('garage_occupe')),
    'NULL doit rester une valeur acceptee pour profil_activite');
end;
$$;

rollback;

-- =====================================================================
-- 8. Preuve d'absence de résidu, APRÈS le rollback
-- =====================================================================

do $$
declare
  v_n integer;
  v_residus text[] := array[]::text[];
begin
  select count(*) into v_n from public.garages where nom_garage like 'RECETTE ONBOARDING V1%';
  if v_n > 0 then v_residus := v_residus || ('garages : ' || v_n); end if;

  select count(*) into v_n from auth.users where email like 'recette-onboarding-%@example.invalid';
  if v_n > 0 then v_residus := v_residus || ('auth.users : ' || v_n); end if;

  if array_length(v_residus, 1) > 0 then
    raise exception 'NETTOYAGE ECHOUE apres rollback — fixtures encore presentes : %', array_to_string(v_residus, '; ');
  end if;
end;
$$;
