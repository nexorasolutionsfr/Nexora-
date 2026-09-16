-- Nexora Auto — lot A (garage virtuel) — banc de test AUTONOME et RÉVERSIBLE.
--
-- Convention reprise de supabase/tests/onboarding_garage_v1.sql :
-- transactionnel, auto-suffisant, aucune dépendance à une donnée existante,
-- exécutable tel quel depuis l'éditeur SQL Supabase. Marqueur propre à ce
-- fichier : « recette-auto-a- ».
--
-- Ce fichier N'EST PAS une migration. Il présuppose que
-- supabase/migrations/20260922000100_auto_mon_vehicule.sql et
-- 20260922000200_auto_controle_technique_proces_verbal.sql sont appliquées sur
-- l'environnement où on l'exécute — jamais Production.
--
-- RÉVERSIBILITÉ : tout se passe dans la transaction ouverte par `begin;`,
-- jamais validée. Le bloc placé APRÈS le `rollback;` prouve l'absence de
-- résidu.

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

-- Échec attendu : vérifié sur le SQLSTATE ET sur un motif du message, pour
-- qu'un « permission denied » ne valide pas un test par accident.
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
grant execute on function pg_temp.assert_echec(text, text, text, text, text) to authenticated, anon;

-- Se mettre dans la peau d'une personne connectée, jusqu'au `reset role`.
-- Sans clause SET : une fonction qui en porte une rétablit à sa sortie les
-- réglages qu'elle a modifiés, et la session simulée disparaîtrait. Les deux
-- réglages sont posés : `request.jwt.claims` est lu par le auth.uid() de
-- Supabase en ligne, `request.jwt.claim.sub` par celui de l'image locale.
create function pg_temp.connecter(p_cle text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', pg_temp.fid(p_cle)::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.fid(p_cle)::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

insert into _fixture_ids (cle, valeur) values
  ('alice', gen_random_uuid()),
  ('bruno', gen_random_uuid()),
  ('voiture_alice', gen_random_uuid());

-- =====================================================================
-- 1. Fixtures
-- =====================================================================

insert into auth.users
  -- Colonnes communes au schéma GoTrue réel et à l'image Supabase locale :
  -- ni email_confirmed_at (absente de l'image) ni confirmed_at (générée en
  -- ligne). La confirmation d'adresse ne joue aucun rôle dans ces droits.
  (id, aud, role, email, encrypted_password,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (pg_temp.fid('alice'), 'authenticated', 'authenticated',
   'recette-auto-a-alice-' || pg_temp.fid('alice')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture',
   '{}'::jsonb, '{"espace": "auto"}'::jsonb, now(), now()),
  (pg_temp.fid('bruno'), 'authenticated', 'authenticated',
   'recette-auto-a-bruno-' || pg_temp.fid('bruno')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture',
   '{}'::jsonb, '{"espace": "auto"}'::jsonb, now(), now());

-- =====================================================================
-- 2. Cas nominal — Alice enregistre sa voiture, son kilométrage, son CT
-- =====================================================================

do $$
declare
  v_proprietaire uuid;
  v_n integer;
begin
  perform pg_temp.connecter('alice');

  -- proprietaire_id n'est pas fourni : il vient de la session.
  insert into public.auto_vehicules (id, immatriculation, marque, modele, annee, energie, date_mise_en_circulation)
  values (pg_temp.fid('voiture_alice'), 'AB123CD', 'Peugeot', '308', 2019, 'essence', date '2019-03-12');

  insert into public.auto_releves_km (vehicule_id, kilometrage, releve_le)
  values (pg_temp.fid('voiture_alice'), 61400, current_date);

  insert into public.auto_historique (vehicule_id, type, realise_le, kilometrage, prestataire, montant_ttc)
  values (pg_temp.fid('voiture_alice'), 'controle_technique', date '2025-03-01', 55000, 'Centre CT', 79.00);

  select proprietaire_id into v_proprietaire from public.auto_vehicules where id = pg_temp.fid('voiture_alice');
  perform pg_temp.assert(v_proprietaire = pg_temp.fid('alice'),
    'nominal : proprietaire_id doit valoir auth.uid()');

  select count(*) into v_n from public.auto_releves_km where vehicule_id = pg_temp.fid('voiture_alice');
  perform pg_temp.assert(v_n = 1, 'nominal : Alice doit lire son relevé');

  select count(*) into v_n from public.auto_historique where vehicule_id = pg_temp.fid('voiture_alice');
  perform pg_temp.assert(v_n = 1, 'nominal : Alice doit lire son historique');

  reset role;
end;
$$;
reset role;

-- =====================================================================
-- 3. Isolation — Bruno ne voit ni ne touche la voiture d'Alice
-- =====================================================================

do $$
declare
  v_n integer;
  v_state text;
  v_msg text;
begin
  perform pg_temp.connecter('bruno');

  select count(*) into v_n from public.auto_vehicules;
  perform pg_temp.assert(v_n = 0, 'isolation : Bruno ne doit voir aucune voiture');

  select count(*) into v_n from public.auto_historique;
  perform pg_temp.assert(v_n = 0, 'isolation : Bruno ne doit voir aucun historique');

  update public.auto_vehicules set modele = 'pirate' where id = pg_temp.fid('voiture_alice');
  get diagnostics v_n = row_count;
  perform pg_temp.assert(v_n = 0, 'isolation : Bruno ne doit modifier aucune voiture');

  delete from public.auto_vehicules where id = pg_temp.fid('voiture_alice');
  get diagnostics v_n = row_count;
  perform pg_temp.assert(v_n = 0, 'isolation : Bruno ne doit supprimer aucune voiture');

  v_state := null;
  begin
    insert into public.auto_releves_km (vehicule_id, kilometrage) values (pg_temp.fid('voiture_alice'), 1);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('isolation : relevé sur la voiture d''Alice', v_state, v_msg,
    '42501', 'row-level security');

  v_state := null;
  begin
    insert into public.auto_historique (vehicule_id, type, realise_le)
    values (pg_temp.fid('voiture_alice'), 'vidange', current_date);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('isolation : historique sur la voiture d''Alice', v_state, v_msg,
    '42501', 'row-level security');

  -- Se déclarer propriétaire à la place d'Alice : refusé.
  v_state := null;
  begin
    insert into public.auto_vehicules (proprietaire_id, marque, modele)
    values (pg_temp.fid('alice'), 'Renault', 'Clio');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('isolation : voiture au nom d''Alice', v_state, v_msg,
    '42501', 'row-level security');

  -- La même plaque chez une autre personne est permise : rien ne doit
  -- révéler qu'Alice la possède.
  insert into public.auto_vehicules (immatriculation, marque, modele) values ('AB123CD', 'Peugeot', '308');

  reset role;
end;
$$;
reset role;

-- =====================================================================
-- 4. Provenance — ce qu'une prestation a produit ne se retouche pas
-- =====================================================================

-- Écrit par le système (plus tard : une réservation Nexora terminée).
insert into public.auto_historique (vehicule_id, type, realise_le, kilometrage, libelle, source)
values (pg_temp.fid('voiture_alice'), 'vidange', current_date, 61400, 'recette-auto-a prestation', 'prestation');

do $$
declare
  v_n integer;
  v_state text;
  v_msg text;
begin
  perform pg_temp.connecter('alice');

  select count(*) into v_n from public.auto_historique
  where vehicule_id = pg_temp.fid('voiture_alice') and source = 'prestation';
  perform pg_temp.assert(v_n = 1, 'provenance : Alice doit lire l''intervention produite par une prestation');

  update public.auto_historique set montant_ttc = 1 where source = 'prestation';
  get diagnostics v_n = row_count;
  perform pg_temp.assert(v_n = 0, 'provenance : Alice ne doit pas modifier une intervention de prestation');

  delete from public.auto_historique where source = 'prestation';
  get diagnostics v_n = row_count;
  perform pg_temp.assert(v_n = 0, 'provenance : Alice ne doit pas supprimer une intervention de prestation');

  v_state := null;
  begin
    insert into public.auto_historique (vehicule_id, type, realise_le, source)
    values (pg_temp.fid('voiture_alice'), 'revision', current_date, 'prestation');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('provenance : se faire passer pour une prestation', v_state, v_msg,
    '42501', 'row-level security');

  v_state := null;
  begin
    update public.auto_historique set source = 'prestation' where source = 'proprietaire';
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('provenance : requalifier sa saisie en prestation', v_state, v_msg,
    '42501', 'row-level security');

  -- Sa propre saisie, elle, se corrige.
  update public.auto_historique set montant_ttc = 82.50 where source = 'proprietaire';
  get diagnostics v_n = row_count;
  perform pg_temp.assert(v_n = 1, 'provenance : Alice doit pouvoir corriger sa propre saisie');

  reset role;
end;
$$;
reset role;

-- =====================================================================
-- 5. Garde-fous de saisie
-- =====================================================================

do $$
declare
  v_state text;
  v_msg text;
begin
  perform pg_temp.connecter('alice');

  v_state := null;
  begin
    insert into public.auto_releves_km (vehicule_id, kilometrage, releve_le)
    values (pg_temp.fid('voiture_alice'), 62000, current_date + 5);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('saisie : relevé daté dans le futur', v_state, v_msg,
    '23514', 'auto_date_future');

  v_state := null;
  begin
    insert into public.auto_historique (vehicule_id, type, realise_le)
    values (pg_temp.fid('voiture_alice'), 'vidange', current_date + 30);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('saisie : intervention datée dans le futur', v_state, v_msg,
    '23514', 'auto_date_future');

  v_state := null;
  begin
    insert into public.auto_vehicules (immatriculation, marque, modele) values ('ab-123-cd', 'Peugeot', '208');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('saisie : plaque non normalisée', v_state, v_msg,
    '23514', 'auto_vehicules_immatriculation_normalisee');

  v_state := null;
  begin
    insert into public.auto_vehicules (immatriculation, marque, modele) values ('AB123CD', 'Peugeot', '308');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('saisie : même plaque deux fois pour Alice', v_state, v_msg,
    '23505', 'auto_vehicules_plaque_par_proprietaire');

  v_state := null;
  begin
    insert into public.auto_vehicules (marque, modele) values ('   ', '308');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('saisie : marque vide', v_state, v_msg,
    '23514', 'auto_vehicules_marque_non_vide');

  v_state := null;
  begin
    update public.auto_vehicules set intervalle_entretien_km = 50 where id = pg_temp.fid('voiture_alice');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('saisie : intervalle d''entretien absurde', v_state, v_msg,
    '23514', 'auto_vehicules_intervalle_km_borne');

  reset role;
end;
$$;
reset role;

-- =====================================================================
-- 6. Anonyme — aucun accès
-- =====================================================================

do $$
declare
  v_state text;
  v_msg text;
  v_n integer;
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);

  v_state := null;
  begin
    select count(*) into v_n from public.auto_vehicules;
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('anon : lecture des voitures', v_state, v_msg,
    '42501', 'permission denied');

  v_state := null;
  begin
    select count(*) into v_n from public.auto_historique;
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('anon : lecture de l''historique', v_state, v_msg,
    '42501', 'permission denied');

  reset role;
end;
$$;
reset role;

-- =====================================================================
-- 7. Suppression — la voiture part avec tout son dossier
-- =====================================================================

do $$
declare
  v_n integer;
begin
  perform pg_temp.connecter('alice');

  delete from public.auto_vehicules where id = pg_temp.fid('voiture_alice');
  get diagnostics v_n = row_count;
  perform pg_temp.assert(v_n = 1, 'suppression : Alice doit pouvoir supprimer sa voiture');

  reset role;
end;
$$;
reset role;

do $$
declare
  v_n integer;
begin
  select count(*) into v_n from public.auto_historique where vehicule_id = pg_temp.fid('voiture_alice');
  perform pg_temp.assert(v_n = 0, 'suppression : l''historique, y compris de prestation, doit suivre la voiture');
  select count(*) into v_n from public.auto_releves_km where vehicule_id = pg_temp.fid('voiture_alice');
  perform pg_temp.assert(v_n = 0, 'suppression : les relevés doivent suivre la voiture');
end;
$$;

-- =====================================================================
-- 7 bis. auto_ajouter_vehicule — tout ou rien
-- =====================================================================

do $$
declare
  v_id uuid;
  v_n integer;
  v_state text;
  v_msg text;
begin
  perform pg_temp.connecter('bruno');

  v_id := public.auto_ajouter_vehicule('  Renault ', ' Clio ', 2021, 'diesel', 'GH456JK', date '2021-05-02', 38200, date '2025-04-30');

  select count(*) into v_n from public.auto_vehicules
  where id = v_id and marque = 'Renault' and modele = 'Clio' and proprietaire_id = pg_temp.fid('bruno');
  perform pg_temp.assert(v_n = 1, 'ajout : la voiture doit être créée, détourée, au nom de Bruno');
  select count(*) into v_n from public.auto_releves_km where vehicule_id = v_id and kilometrage = 38200;
  perform pg_temp.assert(v_n = 1, 'ajout : le kilométrage doit être relevé');
  select count(*) into v_n from public.auto_historique
  where vehicule_id = v_id and type = 'controle_technique' and realise_le = date '2025-04-30' and source = 'proprietaire';
  perform pg_temp.assert(v_n = 1, 'ajout : le dernier contrôle technique doit être inscrit');

  -- Un contrôle daté dans le futur fait échouer l'ensemble : aucune voiture
  -- orpheline ne reste.
  v_state := null;
  begin
    perform public.auto_ajouter_vehicule('Dacia', 'Sandero', null, null, 'LM789NP', null, 1000, current_date + 40);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('ajout : contrôle dans le futur', v_state, v_msg, '23514', 'auto_date_future');
  select count(*) into v_n from public.auto_vehicules where immatriculation = 'LM789NP';
  perform pg_temp.assert(v_n = 0, 'ajout : un échec ne doit laisser aucune voiture à moitié créée');

  reset role;
end;
$$;
reset role;

do $$
declare
  v_state text;
  v_msg text;
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
  v_state := null;
  begin
    perform public.auto_ajouter_vehicule('Peugeot', '208');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('anon : ajout de voiture', v_state, v_msg, '42501', 'permission denied');
  reset role;
end;
$$;
reset role;

-- =====================================================================
-- 7 ter. Contrôle technique : procès-verbal et contre-visite
-- =====================================================================

do $$
declare
  v_id uuid;
  v_n integer;
  v_state text;
  v_msg text;
begin
  perform pg_temp.connecter('bruno');

  v_id := public.auto_ajouter_vehicule('Toyota', 'Yaris', 2018, 'hybride', 'QR321ST', date '2018-04-10', 72000, date '2026-03-02', date '2028-03-02');
  select count(*) into v_n from public.auto_historique
  where vehicule_id = v_id and type = 'controle_technique' and controle_valable_jusqu_au = date '2028-03-02';
  perform pg_temp.assert(v_n = 1, 'PV : la date du procès-verbal doit accompagner le contrôle');

  v_state := null;
  begin
    perform public.auto_ajouter_vehicule('Toyota', 'Aygo', null, null, 'UV654WX', null, null, null, date '2028-01-01');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('PV : date officielle sans contrôle', v_state, v_msg, '22023', 'auto_controle_incomplet');

  insert into public.auto_historique (vehicule_id, type, realise_le, resultat_controle)
  values (v_id, 'controle_technique', current_date, 'contre_visite');

  v_state := null;
  begin
    insert into public.auto_historique (vehicule_id, type, realise_le, resultat_controle)
    values (v_id, 'vidange', current_date, 'favorable');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('PV : résultat de contrôle sur une vidange', v_state, v_msg, '23514', 'auto_historique_controle_seulement');

  v_state := null;
  begin
    insert into public.auto_historique (vehicule_id, type, realise_le, controle_valable_jusqu_au)
    values (v_id, 'controle_technique', date '2026-03-02', date '2026-01-01');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('PV : validité antérieure au contrôle', v_state, v_msg, '23514', 'auto_historique_validite_apres_controle');

  v_state := null;
  begin
    insert into public.auto_historique (vehicule_id, type, realise_le, resultat_controle)
    values (v_id, 'controle_technique', current_date, 'peut-etre');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('PV : résultat inconnu', v_state, v_msg, '23514', 'auto_historique_resultat_controle_valide');

  reset role;
end;
$$;
reset role;

do $$ begin raise notice 'RECETTE AUTO LOT A : tous les contrôles sont passés'; end; $$;

rollback;

-- =====================================================================
-- 8. Preuve d'absence de résidu, APRÈS le rollback
-- =====================================================================

do $$
declare
  v_n integer;
begin
  select count(*) into v_n from auth.users where email like 'recette-auto-a-%@example.invalid';
  if v_n > 0 then
    raise exception 'NETTOYAGE ECHOUE apres rollback — % compte(s) de recette encore present(s)', v_n;
  end if;
end;
$$;
