-- Import pilote clients et véhicules V1 — banc AUTONOME et RÉVERSIBLE.
--
-- Même convention que supabase/tests/acces_salaries_v1.sql : transaction
-- unique jamais validée, `_fixture_ids`, `pg_temp.fid()`, `pg_temp.assert()`,
-- impersonation par `request.jwt.claims`, vérification post-rollback.
--
-- Présuppose les migrations 20260905000100 à 20260905001000. À exécuter
-- uniquement sur l'environnement de test isolé, jamais sur Production.
--
-- Couverture : refus du mécanicien côté serveur, aperçu sans écriture,
-- égalité stricte entre aperçu et import, doublons intra-fichier et en base,
-- non-écrasement, rejets ligne par ligne, immatriculation prise par un autre
-- garage, fichier vide, fichier sans aucune ligne valide, et atomicité.

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
  ('user_prop_a', gen_random_uuid()),
  ('user_accueil_a', gen_random_uuid()),
  ('user_meca_a', gen_random_uuid()),
  ('user_prop_b', gen_random_uuid()),
  ('garage_a', gen_random_uuid()),
  ('garage_b', gen_random_uuid()),
  ('mecanicien_a', gen_random_uuid()),
  ('client_existant', gen_random_uuid()),
  ('vehicule_b', gen_random_uuid());

insert into auth.users
  (id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select v.id, 'authenticated', 'authenticated',
       'recette-import-v1-' || v.id::text || '@example.invalid',
       'not-a-real-credential-synthetic-test-fixture', now(),
       '{}'::jsonb, '{}'::jsonb, now(), now()
from (values
  (pg_temp.fid('user_prop_a')),
  (pg_temp.fid('user_accueil_a')),
  (pg_temp.fid('user_meca_a')),
  (pg_temp.fid('user_prop_b'))
) as v(id);

-- Accès posé explicitement : `abonnement_actif` vaut `false` par défaut
-- depuis 20260909000300, et le verrou 20260909000900 refuse alors tout. Voir
-- la note plus détaillée dans supabase/tests/acces_salaries_v1.sql.
insert into garages (id, owner_user_id, nom_garage, abonnement_actif, acces_motif) values
  (pg_temp.fid('garage_a'), pg_temp.fid('user_prop_a'), 'RECETTE IMPORT V1 — GARAGE A', true, 'abonnement'),
  (pg_temp.fid('garage_b'), pg_temp.fid('user_prop_b'), 'RECETTE IMPORT V1 — GARAGE B', true, 'abonnement');

insert into mecaniciens (id, garage_id, nom) values
  (pg_temp.fid('mecanicien_a'), pg_temp.fid('garage_a'), 'RECETTE IMPORT V1 — MECA A');

insert into garage_membres (garage_id, user_id, role, mecanicien_id) values
  (pg_temp.fid('garage_a'), pg_temp.fid('user_accueil_a'), 'accueil', null),
  (pg_temp.fid('garage_a'), pg_temp.fid('user_meca_a'), 'mecanicien', pg_temp.fid('mecanicien_a'));

-- Un client déjà présent chez A, pour tester la détection de doublon.
insert into clients (id, garage_id, nom, email, telephone) values
  (pg_temp.fid('client_existant'), pg_temp.fid('garage_a'),
   'RECETTE IMPORT V1 — DEJA LA', 'deja.la.import.v1@example.invalid', '06 11 22 33 44');

-- Une immatriculation détenue par le garage B : l'index unique est global.
-- `client_id` est explicitement nul : la colonne est nullable mais porte un
-- défaut `gen_random_uuid()` qui violerait sa propre clé étrangère.
insert into vehicules (id, garage_id, client_id, marque, modele, immatriculation) values
  (pg_temp.fid('vehicule_b'), pg_temp.fid('garage_b'), null,
   'MarqueTestImportV1', 'ModeleB', 'ZZ-999-ZZ');

-- =====================================================================
-- 1. Le mécanicien est refusé côté serveur
-- =====================================================================

select set_config('request.jwt.claims',
  json_build_object('sub', pg_temp.fid('user_meca_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare v_err text;
begin
  begin
    perform importer_clients_vehicules(
      pg_temp.fid('garage_a'),
      '[{"nom":"X","immatriculation":"AA-111-AA"}]'::jsonb,
      false);
    v_err := 'AUCUNE';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.assert(v_err <> 'AUCUNE',
    'Le mécanicien ne doit pas pouvoir importer, même en aperçu');
end;
$$;

reset role;

-- =====================================================================
-- 2. L'accueil : aperçu, puis import, avec des compteurs identiques
-- =====================================================================

select set_config('request.jwt.claims',
  json_build_object('sub', pg_temp.fid('user_accueil_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_lignes jsonb;
  v_apercu jsonb;
  v_import jsonb;
  v_clients_avant int;
  v_vehicules_avant int;
begin
  -- Ligne 1 : nouvelle, complète.
  -- Ligne 2 : même client que la ligne 1 (même téléphone écrit autrement)
  --           avec un second véhicule.
  -- Ligne 3 : client déjà en base (même e-mail, casse différente).
  -- Ligne 4 : nom vide -> rejet.
  -- Ligne 5 : kilométrage non numérique -> rejet.
  -- Ligne 6 : immatriculation détenue par le garage B -> rejet.
  -- Ligne 7 : même plaque que la ligne 1 -> véhicule doublon.
  -- Ligne 8 : client seul, sans véhicule.
  v_lignes := $j$[
    {"nom":"Import Un","email":"un.import.v1@example.invalid","telephone":"0700000001",
     "immatriculation":"AA-111-AA","marque":"Peugeot","modele":"208","kilometrage":"120000"},
    {"nom":"Import Un","telephone":"07 00 00 00 01",
     "immatriculation":"AA-222-AA","marque":"Renault","modele":"Clio"},
    {"nom":"Deja La","email":"DEJA.LA.IMPORT.V1@EXAMPLE.INVALID","telephone":"0699999999",
     "immatriculation":"AA-333-AA","marque":"Citroen","modele":"C3"},
    {"nom":"   ","email":"vide.import.v1@example.invalid","immatriculation":"AA-444-AA"},
    {"nom":"Import Km","email":"km.import.v1@example.invalid","immatriculation":"AA-555-AA",
     "kilometrage":"beaucoup"},
    {"nom":"Import Plaque","email":"plaque.import.v1@example.invalid","immatriculation":"zz999zz"},
    {"nom":"Import Un","telephone":"0700000001","immatriculation":"aa111aa"},
    {"nom":"Import Seul","email":"seul.import.v1@example.invalid","telephone":"0700000009"}
  ]$j$::jsonb;

  select count(*) into v_clients_avant from clients where garage_id = pg_temp.fid('garage_a');
  select count(*) into v_vehicules_avant from vehicules where garage_id = pg_temp.fid('garage_a');

  -- --- Aperçu : aucune écriture ---------------------------------
  v_apercu := importer_clients_vehicules(pg_temp.fid('garage_a'), v_lignes, false);

  perform pg_temp.assert((v_apercu->>'confirme')::boolean = false,
    'L''aperçu se déclare non confirmé');
  perform pg_temp.assert(
    (select count(*) from clients where garage_id = pg_temp.fid('garage_a')) = v_clients_avant,
    'L''aperçu ne crée aucun client');
  perform pg_temp.assert(
    (select count(*) from vehicules where garage_id = pg_temp.fid('garage_a')) = v_vehicules_avant,
    'L''aperçu ne crée aucun véhicule');

  perform pg_temp.assert((v_apercu->>'lignes_lues')::int = 8, 'Huit lignes lues');
  perform pg_temp.assert((v_apercu->>'lignes_rejetees')::int = 3,
    'Trois lignes rejetées : nom vide, kilométrage, immatriculation prise');
  perform pg_temp.assert((v_apercu->>'clients_crees')::int = 2,
    'Deux clients à créer : Import Un et Import Seul');
  -- Lignes 2, 3 et 7 : le même téléphone repris deux fois dans le fichier,
  -- et le client déjà présent en base.
  perform pg_temp.assert((v_apercu->>'clients_ignores_doublon')::int = 3,
    'Trois doublons client');
  perform pg_temp.assert((v_apercu->>'lignes_valides')::int = 5,
    'Cinq lignes valides sur huit');
  perform pg_temp.assert((v_apercu->>'vehicules_crees')::int = 3,
    'Trois véhicules à créer');
  perform pg_temp.assert((v_apercu->>'vehicules_ignores_doublon')::int = 1,
    'Un véhicule doublon : la plaque répétée dans le fichier');

  -- Les motifs restent génériques : aucune mention d'un autre garage.
  perform pg_temp.assert(
    v_apercu->'rejets' @> '[{"ligne": 6, "motif": "immatriculation non disponible"}]'::jsonb,
    'La plaque détenue ailleurs est refusée sans rien divulguer');
  perform pg_temp.assert(
    v_apercu->'rejets' @> '[{"ligne": 4, "motif": "nom du client manquant"}]'::jsonb,
    'Le nom vide est rejeté avec un motif générique');

  -- --- Import : mêmes compteurs, cette fois avec écriture -------
  v_import := importer_clients_vehicules(pg_temp.fid('garage_a'), v_lignes, true);

  perform pg_temp.assert((v_import->>'confirme')::boolean = true,
    'L''import se déclare confirmé');
  perform pg_temp.assert(
    (v_import - 'confirme') = (v_apercu - 'confirme'),
    'L''import doit produire exactement le rapport annoncé par l''aperçu');

  perform pg_temp.assert(
    (select count(*) from clients where garage_id = pg_temp.fid('garage_a')) = v_clients_avant + 2,
    'Deux clients réellement créés');
  perform pg_temp.assert(
    (select count(*) from vehicules where garage_id = pg_temp.fid('garage_a')) = v_vehicules_avant + 3,
    'Trois véhicules réellement créés');
end;
$$;

-- Le client déjà présent n'a été ni écrasé ni complété.
do $$
begin
  perform pg_temp.assert(
    (select nom from clients where id = pg_temp.fid('client_existant'))
      = 'RECETTE IMPORT V1 — DEJA LA',
    'Un doublon ne doit jamais écraser le nom existant');
  perform pg_temp.assert(
    (select telephone from clients where id = pg_temp.fid('client_existant')) = '06 11 22 33 44',
    'Un doublon ne doit jamais écraser le téléphone existant');
end;
$$;

-- Le véhicule de la ligne 3 est rattaché au client déjà présent.
do $$
begin
  perform pg_temp.assert(
    (select client_id from vehicules
      where garage_id = pg_temp.fid('garage_a') and immatriculation = 'AA-333-AA')
      = pg_temp.fid('client_existant'),
    'Le véhicule d''un client déjà connu est rattaché à ce client');
end;
$$;

-- Le second véhicule de la ligne 2 est rattaché au client créé en ligne 1.
do $$
declare v_c1 uuid; v_c2 uuid;
begin
  select client_id into v_c1 from vehicules
    where garage_id = pg_temp.fid('garage_a') and immatriculation = 'AA-111-AA';
  select client_id into v_c2 from vehicules
    where garage_id = pg_temp.fid('garage_a') and immatriculation = 'AA-222-AA';
  perform pg_temp.assert(v_c1 is not null and v_c1 = v_c2,
    'Deux lignes du même client dans un fichier ne créent qu''un client');
end;
$$;

-- Rejouer le même fichier ne crée plus rien : tout est doublon.
do $$
declare v_rejeu jsonb;
begin
  v_rejeu := importer_clients_vehicules(pg_temp.fid('garage_a'),
    $j$[{"nom":"Import Un","telephone":"0700000001","immatriculation":"AA-111-AA"}]$j$::jsonb,
    true);
  perform pg_temp.assert((v_rejeu->>'clients_crees')::int = 0,
    'Un second import du même fichier ne crée aucun client');
  perform pg_temp.assert((v_rejeu->>'vehicules_crees')::int = 0,
    'Un second import du même fichier ne crée aucun véhicule');
end;
$$;

-- =====================================================================
-- 3. Fichiers invalides : rien n'est écrit
-- =====================================================================

do $$
declare
  v_err text;
  v_avant int;
begin
  select count(*) into v_avant from clients where garage_id = pg_temp.fid('garage_a');

  begin
    perform importer_clients_vehicules(pg_temp.fid('garage_a'), '[]'::jsonb, true);
    v_err := 'AUCUNE';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.assert(v_err <> 'AUCUNE', 'Un fichier vide est refusé');

  begin
    perform importer_clients_vehicules(pg_temp.fid('garage_a'),
      $j$[{"nom":""},{"nom":"  "}]$j$::jsonb, true);
    v_err := 'AUCUNE';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.assert(v_err <> 'AUCUNE',
    'Un fichier sans aucune ligne valide est refusé');

  perform pg_temp.assert(
    (select count(*) from clients where garage_id = pg_temp.fid('garage_a')) = v_avant,
    'Un fichier invalide ne crée rien, même partiellement');
end;
$$;

-- =====================================================================
-- 4. Étanchéité : on n'importe pas dans le garage d'un autre
-- =====================================================================

do $$
declare v_err text;
begin
  begin
    perform importer_clients_vehicules(pg_temp.fid('garage_b'),
      $j$[{"nom":"Intrus","immatriculation":"AA-777-AA"}]$j$::jsonb, true);
    v_err := 'AUCUNE';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.assert(v_err <> 'AUCUNE',
    'L''accueil du garage A ne peut pas importer dans le garage B');
end;
$$;

reset role;

-- Le dirigeant y a droit lui aussi.
select set_config('request.jwt.claims',
  json_build_object('sub', pg_temp.fid('user_prop_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare v_r jsonb;
begin
  v_r := importer_clients_vehicules(pg_temp.fid('garage_a'),
    $j$[{"nom":"Import Dirigeant","email":"dir.import.v1@example.invalid"}]$j$::jsonb, true);
  perform pg_temp.assert((v_r->>'clients_crees')::int = 1,
    'Le dirigeant peut importer');
end;
$$;

reset role;

rollback;

-- =====================================================================
-- 5. Vérification post-rollback
-- =====================================================================

do $$
declare
  v_residus text[] := array[]::text[];
  v_n int;
begin
  select count(*) into v_n from auth.users where email like 'recette-import-v1-%@example.invalid';
  if v_n > 0 then v_residus := v_residus || ('auth.users : ' || v_n); end if;

  select count(*) into v_n from public.garages where nom_garage like 'RECETTE IMPORT V1%';
  if v_n > 0 then v_residus := v_residus || ('garages : ' || v_n); end if;

  select count(*) into v_n from public.clients where email like '%import.v1@example.invalid';
  if v_n > 0 then v_residus := v_residus || ('clients : ' || v_n); end if;

  select count(*) into v_n from public.vehicules where marque = 'MarqueTestImportV1'
    or immatriculation in ('AA-111-AA','AA-222-AA','AA-333-AA','ZZ-999-ZZ');
  if v_n > 0 then v_residus := v_residus || ('vehicules : ' || v_n); end if;

  if array_length(v_residus, 1) > 0 then
    raise exception 'NETTOYAGE ÉCHOUÉ après rollback : %', array_to_string(v_residus, '; ');
  end if;

  raise notice 'IMPORT PILOTE V1 : banc passé, aucune fixture résiduelle.';
end;
$$;
