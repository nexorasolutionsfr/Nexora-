-- Nexora Auto — lot D (univers des services) — banc AUTONOME et RÉVERSIBLE.
--
-- Présuppose 20260922000100 → 20260922000600 appliquées. Jamais Production.
-- Marqueur « recette-auto-d- ». Transaction jamais validée.

begin;

create temporary table _fixture_ids (cle text primary key, valeur uuid not null) on commit drop;

create function pg_temp.fid(p_cle text) returns uuid
language sql security definer set search_path = '' as $$
  select valeur from pg_temp._fixture_ids where cle = p_cle;
$$;
revoke execute on function pg_temp.fid(text) from public;
grant execute on function pg_temp.fid(text) to authenticated, anon;

create function pg_temp.memoriser(p_cle text, p_valeur uuid) returns void
language sql security definer set search_path = '' as $$
  insert into pg_temp._fixture_ids (cle, valeur) values (p_cle, p_valeur);
$$;
revoke execute on function pg_temp.memoriser(text, uuid) from public;
grant execute on function pg_temp.memoriser(text, uuid) to authenticated;

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

create function pg_temp.assert_echec(
  p_cas text, p_state text, p_message text, p_state_attendu text, p_motif_attendu text
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
grant execute on function pg_temp.assert_echec(text, text, text, text, text) to authenticated, anon;

create function pg_temp.connecter(p_cle text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid(p_cle)::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.fid(p_cle)::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

insert into _fixture_ids (cle, valeur) values ('alice', gen_random_uuid()), ('bruno', gen_random_uuid());

insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (pg_temp.fid('alice'), 'authenticated', 'authenticated', 'recette-auto-d-alice-' || pg_temp.fid('alice')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture', '{}'::jsonb, '{"espace": "auto"}'::jsonb, now(), now()),
  (pg_temp.fid('bruno'), 'authenticated', 'authenticated', 'recette-auto-d-bruno-' || pg_temp.fid('bruno')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture', '{}'::jsonb, '{"espace": "auto"}'::jsonb, now(), now());

-- =====================================================================
-- 1. Référentiel : une ligne par prestation, des modes qui n'en créent pas
-- =====================================================================

do $$
declare
  v_n integer;
  v_state text;
  v_msg text;
begin
  perform pg_temp.assert((select count(*) from public.auto_services) = 13, 'référentiel : 13 prestations');
  perform pg_temp.assert((select count(distinct code) from public.auto_services) = (select count(*) from public.auto_services), 'référentiel : une ligne par prestation');
  perform pg_temp.assert((select array_agg(code order by code) from public.auto_services where suivi = 'echeance') = array['controle_technique', 'revision'], 'référentiel : révision et CT suivis en échéance');
  perform pg_temp.assert(not exists (select 1 from public.auto_services_modes where service_code = 'controle_technique' and mode = 'a_domicile'), 'modes : pas de contrôle technique à domicile');
  perform pg_temp.assert(not exists (select 1 from public.auto_services_modes where service_code = 'assistance_panne'), 'modes : l''assistance n''en a aucun');

  v_state := null;
  begin
    insert into public.auto_services_modes (service_code, mode) values ('revision', 'drive');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('modes : mode inconnu', v_state, v_msg, '23514', 'auto_services_modes_mode_valide');

  perform pg_temp.connecter('alice');
  select count(*) into v_n from public.auto_services;
  perform pg_temp.assert(v_n = 13, 'référentiel : lisible par une personne connectée');

  v_state := null;
  begin
    insert into public.auto_services (code, univers, nom, suivi, ordre) values ('revision_a_domicile', 'entretien', 'Révision à domicile', 'tache', 999);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('référentiel : écriture par une personne connectée', v_state, v_msg, '42501', 'permission denied');
  reset role;

  perform set_config('role', 'anon', true);
  v_state := null;
  begin
    select count(*) into v_n from public.auto_services;
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('référentiel : lecture anonyme', v_state, v_msg, '42501', 'permission denied');
  reset role;
end;
$$;
reset role;

-- =====================================================================
-- 2. « Ajouter à mes prochaines actions » : sans doublon, pas pour tout
-- =====================================================================

do $$
declare
  v_clio uuid;
  v_zoe uuid;
  v_freins uuid;
  v_libre uuid;
  v_state text;
  v_msg text;
begin
  perform pg_temp.connecter('alice');
  v_clio := public.auto_ajouter_vehicule('Renault', 'Clio', 2019);
  v_zoe := public.auto_ajouter_vehicule('Renault', 'Zoe', 2021, 'electrique');
  perform pg_temp.memoriser('clio', v_clio);

  insert into public.auto_taches (vehicule_id, service_code, titre) values (v_clio, 'freinage', 'Freinage') returning id into v_freins;

  v_state := null;
  begin
    insert into public.auto_taches (vehicule_id, service_code, titre, echeance) values (v_clio, 'freinage', 'Freinage', date '2026-11-02');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('tâches : même prestation ouverte deux fois sur la même voiture', v_state, v_msg, '23505', 'auto_taches_service_une_ouverte');

  insert into public.auto_taches (vehicule_id, service_code, titre) values (v_zoe, 'freinage', 'Freinage');

  update public.auto_taches set statut = 'terminee', terminee_le = now() where id = v_freins;
  insert into public.auto_taches (vehicule_id, service_code, titre) values (v_clio, 'freinage', 'Freinage');
  perform pg_temp.assert((select count(*) from public.auto_taches where vehicule_id = v_clio and service_code = 'freinage') = 2, 'tâches : une tâche terminée ne bloque pas un nouvel ajout');

  v_state := null;
  begin
    update public.auto_taches set statut = 'a_faire', terminee_le = null where id = v_freins;
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('tâches : rouvrir crée un doublon ouvert', v_state, v_msg, '23505', 'auto_taches_service_une_ouverte');

  foreach v_msg in array array['revision', 'controle_technique', 'assistance_panne', 'teleportation'] loop
    v_state := null;
    declare
      v_code text := v_msg;
      v_erreur text;
    begin
      begin
        insert into public.auto_taches (vehicule_id, service_code, titre) values (v_clio, v_code, 'Essai');
      exception when others then v_state := sqlstate; v_erreur := sqlerrm;
      end;
      perform pg_temp.assert_echec('tâches : prestation non ajoutable ' || v_code, v_state, v_erreur, '23514', 'auto_service_non_ajoutable');
    end;
  end loop;

  insert into public.auto_taches (vehicule_id, titre) values (v_clio, 'Laver les tapis') returning id into v_libre;
  insert into public.auto_taches (vehicule_id, titre) values (v_clio, 'Laver les tapis');
  v_state := null;
  begin
    update public.auto_taches set service_code = 'revision' where id = v_libre;
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('tâches : rattacher une tâche libre à la révision', v_state, v_msg, '23514', 'auto_service_non_ajoutable');
  update public.auto_taches set service_code = 'lavage_complet' where id = v_libre;
  reset role;

  perform pg_temp.connecter('bruno');
  v_state := null;
  begin
    insert into public.auto_taches (vehicule_id, service_code, titre) values (v_clio, 'batterie', 'Batterie');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('tâches : prestation sur la voiture d''une autre personne', v_state, v_msg, '42501', 'row-level security');
  perform pg_temp.assert((select count(*) from public.auto_taches) = 0, 'tâches : Bruno ne voit rien d''Alice');
  reset role;

  perform pg_temp.assert(not has_function_privilege('authenticated', 'public.auto_taches_service_ajoutable()', 'execute'), 'déclencheur : non exécutable directement');
end;
$$;
reset role;

-- =====================================================================
-- 3. Offres réelles : impossibles à inventer, invisibles tant qu'inactives
-- =====================================================================

do $$
declare
  v_garage uuid;
  v_n integer;
  v_state text;
  v_msg text;
begin
  perform pg_temp.assert((select count(*) from public.auto_offres) = 0, 'offres : la table est livrée vide');

  insert into public.garages (nom_garage) values ('recette-auto-d-garage') returning id into v_garage;

  v_state := null;
  begin
    insert into public.auto_offres (garage_id, service_code, mode, codes_postaux) values (v_garage, 'controle_technique', 'a_domicile', array['75011']);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('offres : mode qui n''existe pas pour la prestation', v_state, v_msg, '23503', 'auto_offres_service_mode_existant');

  v_state := null;
  begin
    insert into public.auto_offres (garage_id, service_code, mode, codes_postaux) values (v_garage, 'assistance_panne', 'collecte', array['75011']);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('offres : assistance', v_state, v_msg, '23503', 'auto_offres_service_mode_existant');

  v_state := null;
  begin
    insert into public.auto_offres (service_code, mode, codes_postaux) values ('freinage', 'chez_un_professionnel', array['75011']);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('offres : sans professionnel', v_state, v_msg, '23502', 'garage_id');

  foreach v_msg in array array['{}', '{7501}', '{75011,NULL}', '{75011,2A004}'] loop
    declare
      v_zone text[] := v_msg::text[];
      v_erreur text;
    begin
      v_state := null;
      begin
        insert into public.auto_offres (garage_id, service_code, mode, codes_postaux) values (v_garage, 'freinage', 'chez_un_professionnel', v_zone);
      exception when others then v_state := sqlstate; v_erreur := sqlerrm;
      end;
      perform pg_temp.assert_echec('offres : zone invalide ' || v_zone::text, v_state, v_erreur, '23514', 'auto_offres_zone_valide');
    end;
  end loop;

  v_state := null;
  begin
    insert into public.auto_offres (garage_id, service_code, mode, codes_postaux, energies) values (v_garage, 'freinage', 'chez_un_professionnel', array['75011'], array['nucleaire']);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('offres : énergie inconnue', v_state, v_msg, '23514', 'auto_offres_energies_valides');

  v_state := null;
  begin
    insert into public.auto_offres (garage_id, service_code, mode, codes_postaux, valable_du, valable_jusqu_au) values (v_garage, 'freinage', 'chez_un_professionnel', array['75011'], date '2026-10-01', date '2026-09-01');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('offres : période à l''envers', v_state, v_msg, '23514', 'auto_offres_periode_valide');

  -- Trois offres : inactive (par défaut), active et valable, active mais échue.
  insert into public.auto_offres (garage_id, service_code, mode, codes_postaux) values (v_garage, 'freinage', 'chez_un_professionnel', array['75011']);
  insert into public.auto_offres (garage_id, service_code, mode, codes_postaux, energies, actif) values (v_garage, 'revision', 'a_domicile', array['75011', '75012'], array['essence', 'diesel'], true);
  insert into public.auto_offres (garage_id, service_code, mode, codes_postaux, valable_du, valable_jusqu_au, actif) values (v_garage, 'batterie', 'collecte', array['75011'], current_date - 60, current_date - 1, true);
  perform pg_temp.assert((select bool_and(not actif) from public.auto_offres where service_code = 'freinage'), 'offres : inactive par défaut');

  perform pg_temp.connecter('alice');
  select count(*) into v_n from public.auto_offres;
  perform pg_temp.assert(v_n = 1, 'offres : seule l''offre active et valable est lisible (' || v_n || ')');
  perform pg_temp.assert((select service_code from public.auto_offres) = 'revision', 'offres : c''est la révision à domicile');

  v_state := null;
  begin
    insert into public.auto_offres (garage_id, service_code, mode, codes_postaux, actif) values (v_garage, 'freinage', 'a_domicile', array['75011'], true);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('offres : création par une personne connectée', v_state, v_msg, '42501', 'permission denied');

  v_state := null;
  begin
    update public.auto_offres set actif = true;
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('offres : activation par une personne connectée', v_state, v_msg, '42501', 'permission denied');
  reset role;

  perform set_config('role', 'anon', true);
  v_state := null;
  begin
    select count(*) into v_n from public.auto_offres;
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('offres : lecture anonyme', v_state, v_msg, '42501', 'permission denied');
  reset role;

  perform set_config('role', 'service_role', true);
  insert into public.auto_offres (garage_id, service_code, mode, codes_postaux) values (v_garage, 'pneus_saisonniers', 'a_domicile', array['75011']);
  reset role;
end;
$$;
reset role;

-- =====================================================================
-- 4. Motorisation modifiable, bornée
-- =====================================================================

do $$
declare
  v_n integer;
  v_state text;
  v_msg text;
begin
  perform pg_temp.connecter('alice');
  update public.auto_vehicules set motorisation = '1.0 TCe 90' where id = pg_temp.fid('clio');
  get diagnostics v_n = row_count;
  perform pg_temp.assert(v_n = 1, 'motorisation : Alice la renseigne');

  v_state := null;
  begin
    update public.auto_vehicules set motorisation = repeat('x', 81) where id = pg_temp.fid('clio');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('motorisation : trop longue', v_state, v_msg, '23514', 'auto_vehicules_motorisation_courte');

  v_state := null;
  begin
    update public.auto_vehicules set motorisation = '   ' where id = pg_temp.fid('clio');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('motorisation : vide', v_state, v_msg, '23514', 'auto_vehicules_motorisation_courte');
  reset role;
end;
$$;
reset role;

do $$ begin raise notice 'RECETTE AUTO LOT D : tous les contrôles sont passés'; end; $$;

rollback;

do $$
declare
  v_n integer;
begin
  select count(*) into v_n from auth.users where email like 'recette-auto-d-%@example.invalid';
  if v_n > 0 then
    raise exception 'NETTOYAGE ECHOUE apres rollback — % compte(s) de recette encore present(s)', v_n;
  end if;
  select count(*) into v_n from public.garages where nom_garage = 'recette-auto-d-garage';
  if v_n > 0 then
    raise exception 'NETTOYAGE ECHOUE apres rollback — garage de recette encore present';
  end if;
end;
$$;
