-- Lot sécurité anon V1 — banc AUTONOME et RÉVERSIBLE.
--
-- Convention du dépôt (voir supabase/tests/ordres_reparation_v1.sql) :
-- transaction unique jamais validée, `_fixture_ids`, `pg_temp.fid()`,
-- `pg_temp.assert()`, impersonation par `request.jwt.claims`, vérification
-- post-rollback.
--
-- Ce fichier n'est PAS une migration. Il présuppose 20260906000100 à
-- 20260906000300 appliquées. À exécuter uniquement sur l'environnement de
-- test isolé, jamais sur Production.
--
-- AUCUN SECRET RÉEL. La valeur écrite dans garages_secrets est une chaîne de
-- recette explicitement fausse, et le banc ne la relit jamais : il n'assure
-- que le booléen renvoyé par stripe_configure_pour_mon_garage(). Toutes les
-- fixtures portent « RECETTE SECU V1 » ou l'adresse
-- recette-secu-v1-...@example.invalid, et la vérification finale échoue si la
-- moindre ligne subsiste après annulation.
--
-- Couverture : droits d'exécution après fermeture, search_path effectif,
-- logique fonctionnelle inchangée pour le propriétaire, refus pour un compte
-- sans garage, étanchéité entre deux garages, absence de TRUNCATE, et
-- non-régression des neuf points d'entrée publics par jeton.

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
  ('user_b', gen_random_uuid()),
  ('user_sans_garage', gen_random_uuid()),
  ('garage_a', gen_random_uuid()),
  ('garage_b', gen_random_uuid());

insert into auth.users
  (id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select v.id, 'authenticated', 'authenticated',
       'recette-secu-v1-' || v.id::text || '@example.invalid',
       'not-a-real-credential-synthetic-test-fixture', now(),
       '{}'::jsonb, '{}'::jsonb, now(), now()
from (values
  (pg_temp.fid('user_a')),
  (pg_temp.fid('user_b')),
  (pg_temp.fid('user_sans_garage'))
) as v(id);

insert into garages (id, owner_user_id, nom_garage) values
  (pg_temp.fid('garage_a'), pg_temp.fid('user_a'), 'RECETTE SECU V1 — GARAGE A'),
  (pg_temp.fid('garage_b'), pg_temp.fid('user_b'), 'RECETTE SECU V1 — GARAGE B');

-- =====================================================================
-- 1. Les privilèges sont bien ceux annoncés
-- =====================================================================

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.set_stripe_secret_key(text)',
    'public.stripe_configure_pour_mon_garage()'
  ] loop
    perform pg_temp.assert(
      not has_function_privilege('anon', v_fn::regprocedure, 'EXECUTE'),
      v_fn || ' ne doit plus être exécutable par anon');
    -- service_role est conservé volontairement, en attendant l'audit n8n :
    -- le banc vérifie qu'il n'a PAS été perdu au passage, la fermeture de
    -- PUBLIC le lui aurait retiré en Production sans regrant explicite.
    perform pg_temp.assert(
      has_function_privilege('service_role', v_fn::regprocedure, 'EXECUTE'),
      v_fn || ' doit conserver service_role');
    perform pg_temp.assert(
      has_function_privilege('authenticated', v_fn::regprocedure, 'EXECUTE'),
      v_fn || ' doit rester exécutable par authenticated');
    perform pg_temp.assert(
      exists (select 1 from pg_proc p
              where p.oid = v_fn::regprocedure
                and p.proconfig @> array['search_path=""']),
      v_fn || ' doit avoir un search_path vide');
    perform pg_temp.assert(
      exists (select 1 from pg_proc p
              where p.oid = v_fn::regprocedure and p.prosecdef),
      v_fn || ' doit rester SECURITY DEFINER');
  end loop;
end;
$$;

-- Le privilège TRUNCATE a bien disparu de la table des secrets.
do $$
begin
  perform pg_temp.assert(
    not has_table_privilege('anon', 'public.garages_secrets', 'TRUNCATE'),
    'anon ne doit plus avoir TRUNCATE sur garages_secrets');
  perform pg_temp.assert(
    not has_table_privilege('authenticated', 'public.garages_secrets', 'TRUNCATE'),
    'authenticated ne doit plus avoir TRUNCATE sur garages_secrets');
end;
$$;

-- =====================================================================
-- 2. Un appel réellement anonyme est refusé par le moteur
-- =====================================================================

-- La section qui suit s'exécute sous le rôle anon. Elle n'utilise
-- volontairement AUCUNE fonction du schéma temporaire : l'accès d'un rôle
-- autre que le propriétaire de session à `pg_temp` dépend de privilèges de
-- schéma qu'on ne veut pas supposer ici. Un banc doit échouer pour la raison
-- qu'il teste, jamais pour son échafaudage.
set local role anon;

do $$
declare v_err text;
begin
  begin
    perform stripe_configure_pour_mon_garage();
    v_err := 'AUCUNE';
  exception when others then v_err := sqlstate;
  end;
  -- 42501 = insufficient_privilege : le refus vient bien du droit
  -- d'exécution, et non d'un contrôle applicatif interne à la fonction.
  if v_err <> '42501' then
    raise exception
      'ASSERTION FAILED: anon doit se voir refuser stripe_configure_pour_mon_garage au niveau du privilege, obtenu : %',
      v_err;
  end if;
end;
$$;

do $$
declare v_err text;
begin
  begin
    perform set_stripe_secret_key('RECETTE-SECU-V1-VALEUR-FACTICE');
    v_err := 'AUCUNE';
  exception when others then v_err := sqlstate;
  end;
  if v_err <> '42501' then
    raise exception
      'ASSERTION FAILED: anon doit se voir refuser set_stripe_secret_key au niveau du privilege, obtenu : %',
      v_err;
  end if;
end;
$$;

reset role;

-- =====================================================================
-- 3. La logique fonctionnelle est inchangée pour le propriétaire
-- =====================================================================

select set_config('request.jwt.claims',
  json_build_object('sub', pg_temp.fid('user_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  perform pg_temp.assert(
    stripe_configure_pour_mon_garage() = false,
    'Avant enregistrement, le garage A n''est pas configuré');

  -- Valeur de recette explicitement fausse ; jamais relue par ce banc.
  perform set_stripe_secret_key('RECETTE-SECU-V1-VALEUR-FACTICE');

  perform pg_temp.assert(
    stripe_configure_pour_mon_garage() = true,
    'Après enregistrement, le garage A est configuré');

  -- Le remplacement d'une valeur existante fonctionne toujours (on conflict).
  perform set_stripe_secret_key('RECETTE-SECU-V1-VALEUR-FACTICE-2');
  perform pg_temp.assert(
    stripe_configure_pour_mon_garage() = true,
    'Le remplacement d''une clé existante reste possible');

end;
$$;

reset role;

-- Hors impersonation : la table des secrets n'a aucune policy, donc même le
-- propriétaire ne la lit pas en tant qu'authenticated. Ce comptage doit donc
-- se faire avec le rôle de session, qui n'est pas soumis à RLS.
do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.garages_secrets where garage_id = pg_temp.fid('garage_a')) = 1,
    'Une seule ligne de secret par garage, quel que soit le nombre d''enregistrements');
end;
$$;

-- =====================================================================
-- 4. Étanchéité et refus
-- =====================================================================

-- Le garage B ne voit pas la configuration du garage A.
select set_config('request.jwt.claims',
  json_build_object('sub', pg_temp.fid('user_b')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  perform pg_temp.assert(
    stripe_configure_pour_mon_garage() = false,
    'Le garage B ne doit pas hériter de la configuration du garage A');
  perform pg_temp.assert(
    (select count(*) from garages_secrets) = 0,
    'La table des secrets reste illisible ligne à ligne, faute de policy');
end;
$$;

reset role;

-- Un compte authentifié sans garage est refusé, avec le message d'origine.
select set_config('request.jwt.claims',
  json_build_object('sub', pg_temp.fid('user_sans_garage')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare v_err text;
begin
  begin
    perform set_stripe_secret_key('RECETTE-SECU-V1-VALEUR-FACTICE');
    v_err := 'AUCUNE';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.assert(v_err = 'Aucun garage associe a cet utilisateur',
    'Le message de refus d''origine est conservé, obtenu : ' || v_err);

  perform pg_temp.assert(
    stripe_configure_pour_mon_garage() = false,
    'Un compte sans garage n''est jamais configuré');
end;
$$;

reset role;

-- =====================================================================
-- 5. Non-régression : les neuf points d'entrée publics restent ouverts
-- =====================================================================

do $$
declare
  v_attendues text[] := array[
    'lire_devis_par_jeton', 'repondre_devis_par_jeton',
    'lire_facture_par_jeton',
    'lire_atelier_par_jeton', 'avancer_etape_atelier_par_jeton',
    'lire_inspection_par_jeton', 'repondre_point_inspection_par_jeton',
    'lire_confirmation_par_jeton', 'repondre_confirmation_par_jeton'
  ];
  v_nom text;
  v_fermees text := '';
  v_absentes text := '';
  v_oid oid;
begin
  -- Recherche par nom, sans jamais supposer une signature : une signature
  -- devinée fausse ferait échouer le banc pour une raison qui n'est pas
  -- celle qu'il teste.
  foreach v_nom in array v_attendues loop
    select p.oid into v_oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.proname = v_nom
    limit 1;

    if v_oid is null then
      v_absentes := v_absentes || v_nom || ' ';
    elsif not has_function_privilege('anon', v_oid, 'EXECUTE') then
      v_fermees := v_fermees || v_nom || ' ';
    end if;
    v_oid := null;
  end loop;

  perform pg_temp.assert(v_absentes = '',
    'Points d''entrée publics introuvables : ' || v_absentes);
  perform pg_temp.assert(v_fermees = '',
    'Ce lot ne doit fermer aucun point d''entrée public par jeton. Fermés à tort : ' || v_fermees);
end;
$$;

-- Le déclencheur ensure_rls n'a pas été touché par ce lot : on constate son
-- état sans le modifier ni exiger une valeur, Test et Production divergeant
-- volontairement sur ce point.
do $$
declare v_present boolean;
begin
  select exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') into v_present;
  raise notice 'ensure_rls present sur cet environnement : %', v_present;
end;
$$;

rollback;

-- =====================================================================
-- 6. Vérification post-rollback (hors transaction, lecture seule)
-- =====================================================================

do $$
declare
  v_residus text[] := array[]::text[];
  v_n int;
begin
  select count(*) into v_n from auth.users where email like 'recette-secu-v1-%@example.invalid';
  if v_n > 0 then v_residus := v_residus || ('auth.users : ' || v_n); end if;

  select count(*) into v_n from public.garages where nom_garage like 'RECETTE SECU V1%';
  if v_n > 0 then v_residus := v_residus || ('garages : ' || v_n); end if;

  select count(*) into v_n from public.garages_secrets gs
    join public.garages g on g.id = gs.garage_id
    where g.nom_garage like 'RECETTE SECU V1%';
  if v_n > 0 then v_residus := v_residus || ('garages_secrets : ' || v_n); end if;

  if array_length(v_residus, 1) > 0 then
    raise exception 'NETTOYAGE ÉCHOUÉ après rollback : %', array_to_string(v_residus, '; ');
  end if;

  raise notice 'LOT SECURITE ANON V1 : banc passé, aucune fixture résiduelle.';
end;
$$;
