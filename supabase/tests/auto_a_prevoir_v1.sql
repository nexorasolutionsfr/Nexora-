-- Nexora Auto — lot C (« À prévoir ») — banc AUTONOME et RÉVERSIBLE.
--
-- Présuppose 20260922000100 → 20260922000500 appliquées. Jamais Production.
-- Marqueur « recette-auto-c- ». Transaction jamais validée.

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
  (pg_temp.fid('alice'), 'authenticated', 'authenticated', 'recette-auto-c-alice-' || pg_temp.fid('alice')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture', '{}'::jsonb, '{"espace": "auto"}'::jsonb, now(), now()),
  (pg_temp.fid('bruno'), 'authenticated', 'authenticated', 'recette-auto-c-bruno-' || pg_temp.fid('bruno')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture', '{}'::jsonb, '{"espace": "auto"}'::jsonb, now(), now());

-- =====================================================================
-- 1. Contrôle technique : nature et résultats (20260922000400)
-- =====================================================================

do $$
declare
  v_clio uuid;
  v_state text;
  v_msg text;
begin
  perform pg_temp.connecter('alice');
  v_clio := public.auto_ajouter_vehicule('Renault', 'Clio', 2019);
  perform pg_temp.memoriser('clio', v_clio);

  -- Défaillance critique : validité le jour même, acceptée.
  insert into public.auto_historique (vehicule_id, type, realise_le, nature_controle, resultat_controle, controle_valable_jusqu_au)
  values (v_clio, 'controle_technique', date '2026-05-14', 'periodique', 'defavorable_critique', date '2026-05-14');
  insert into public.auto_historique (vehicule_id, type, realise_le, nature_controle, resultat_controle)
  values (v_clio, 'controle_technique', date '2026-06-20', 'contre_visite', 'favorable');

  v_state := null;
  begin
    insert into public.auto_historique (vehicule_id, type, realise_le, resultat_controle) values (v_clio, 'controle_technique', date '2026-06-01', 'contre_visite');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('CT : ancienne valeur contre_visite comme résultat', v_state, v_msg, '23514', 'auto_historique_resultat_controle_valide');

  v_state := null;
  begin
    insert into public.auto_historique (vehicule_id, type, realise_le, nature_controle) values (v_clio, 'vidange', date '2026-06-01', 'periodique');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('CT : nature de contrôle sur une vidange', v_state, v_msg, '23514', 'auto_historique_controle_seulement');

  v_state := null;
  begin
    insert into public.auto_historique (vehicule_id, type, realise_le, nature_controle) values (v_clio, 'controle_technique', date '2026-06-01', 'rattrapage');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('CT : nature inconnue', v_state, v_msg, '23514', 'auto_historique_nature_controle_valide');

  reset role;
end;
$$;
reset role;

-- =====================================================================
-- 2. Tâches personnelles
-- =====================================================================

do $$
declare
  v_tache uuid;
  v_n integer;
  v_state text;
  v_msg text;
begin
  perform pg_temp.connecter('alice');

  insert into public.auto_taches (vehicule_id, titre, echeance) values (pg_temp.fid('clio'), 'Pneus hiver', date '2026-10-15')
  returning id into v_tache;
  perform pg_temp.memoriser('tache', v_tache);

  update public.auto_taches set statut = 'terminee', terminee_le = now() where id = v_tache;
  get diagnostics v_n = row_count;
  perform pg_temp.assert(v_n = 1, 'tâches : Alice termine sa tâche');

  v_state := null;
  begin
    update public.auto_taches set statut = 'a_faire' where id = v_tache;
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('tâches : rouverte sans effacer la date de fin', v_state, v_msg, '23514', 'auto_taches_terminee_datee');

  v_state := null;
  begin
    insert into public.auto_taches (vehicule_id, titre) values (pg_temp.fid('clio'), '   ');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('tâches : titre vide', v_state, v_msg, '23514', 'auto_taches_titre_valide');

  -- Une intervention enregistrée ne clôt aucune tâche.
  insert into public.auto_taches (vehicule_id, titre) values (pg_temp.fid('clio'), 'Nettoyer l''intérieur');
  insert into public.auto_historique (vehicule_id, type, realise_le, kilometrage) values (pg_temp.fid('clio'), 'revision', current_date, 61000);
  select count(*) into v_n from public.auto_taches where vehicule_id = pg_temp.fid('clio') and statut = 'a_faire';
  perform pg_temp.assert(v_n = 1, 'tâches : une révision enregistrée laisse la tâche ouverte');

  reset role;
end;
$$;
reset role;

do $$
declare
  v_n integer;
  v_state text;
  v_msg text;
begin
  perform pg_temp.connecter('bruno');

  select count(*) into v_n from public.auto_taches;
  perform pg_temp.assert(v_n = 0, 'isolation : Bruno ne voit aucune tâche');

  update public.auto_taches set titre = 'pirate';
  get diagnostics v_n = row_count;
  perform pg_temp.assert(v_n = 0, 'isolation : Bruno ne modifie aucune tâche');

  v_state := null;
  begin
    insert into public.auto_taches (vehicule_id, titre) values (pg_temp.fid('clio'), 'Intrus');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('isolation : tâche sur la voiture d''Alice', v_state, v_msg, '42501', 'row-level security');

  reset role;
end;
$$;
reset role;

-- =====================================================================
-- 3. Préférences et reports
-- =====================================================================

do $$
declare
  v_n integer;
  v_state text;
  v_msg text;
begin
  perform pg_temp.connecter('alice');

  insert into public.auto_preferences (horizon_jours) values (90);
  perform pg_temp.assert((select proprietaire_id = pg_temp.fid('alice') and horizon_jours = 90 and not rappels_externes from public.auto_preferences),
    'préférences : ligne d''Alice, horizon 90, pas d''envoi externe');

  v_state := null;
  begin
    update public.auto_preferences set horizon_jours = 45;
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('préférences : horizon hors choix', v_state, v_msg, '23514', 'auto_preferences_horizon_valide');

  insert into public.auto_rappels_reports (cle, reporte_jusqu_au) values ('revision:x:2025-10-01', current_date + 7);
  insert into public.auto_rappels_reports (cle, reporte_jusqu_au) values ('revision:x:2025-10-01', current_date + 30)
  on conflict (proprietaire_id, cle) do update set reporte_jusqu_au = excluded.reporte_jusqu_au;
  select count(*) into v_n from public.auto_rappels_reports where reporte_jusqu_au = current_date + 30;
  perform pg_temp.assert(v_n = 1, 'reports : un seul report par échéance, le plus récent');

  v_state := null;
  begin
    insert into public.auto_rappels_reports (proprietaire_id, cle, reporte_jusqu_au) values (pg_temp.fid('bruno'), 'tache:y', current_date + 1);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('reports : au nom de Bruno', v_state, v_msg, '42501', 'row-level security');

  reset role;
end;
$$;
reset role;

do $$
declare
  v_n integer;
begin
  perform pg_temp.connecter('bruno');
  select count(*) into v_n from public.auto_preferences;
  perform pg_temp.assert(v_n = 0, 'isolation : Bruno ne voit pas les préférences d''Alice');
  select count(*) into v_n from public.auto_rappels_reports;
  perform pg_temp.assert(v_n = 0, 'isolation : Bruno ne voit pas les reports d''Alice');
  reset role;
end;
$$;
reset role;

-- =====================================================================
-- 4. Journal des envois : fermé aux personnes, une fois par palier
-- =====================================================================

do $$
declare
  v_state text;
  v_msg text;
  v_n integer;
begin
  perform pg_temp.connecter('alice');
  v_state := null;
  begin
    select count(*) into v_n from public.auto_rappels_envois;
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('envois : lecture par une personne connectée', v_state, v_msg, '42501', 'permission denied');
  reset role;

  insert into public.auto_rappels_envois (proprietaire_id, cle, palier, canal) values (pg_temp.fid('alice'), 'controle_technique:x:2027-04-29', 'j30', 'email');
  v_state := null;
  begin
    insert into public.auto_rappels_envois (proprietaire_id, cle, palier, canal) values (pg_temp.fid('alice'), 'controle_technique:x:2027-04-29', 'j30', 'email');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('envois : même palier deux fois', v_state, v_msg, '23505', 'auto_rappels_envois_une_fois');
end;
$$;

do $$ begin raise notice 'RECETTE AUTO LOT C : tous les contrôles sont passés'; end; $$;

rollback;

do $$
declare
  v_n integer;
begin
  select count(*) into v_n from auth.users where email like 'recette-auto-c-%@example.invalid';
  if v_n > 0 then
    raise exception 'NETTOYAGE ECHOUE apres rollback — % compte(s) de recette encore present(s)', v_n;
  end if;
end;
$$;
