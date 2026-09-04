-- Devis multi-lignes V1 — banc de test AUTONOME et RÉVERSIBLE.
--
-- Convention reprise à l'identique de supabase/tests/ordres_reparation_v1.sql :
-- transactionnel, auto-suffisant, aucun placeholder, aucune dépendance à une
-- donnée préexistante, exécutable tel quel depuis l'éditeur SQL Supabase
-- (aucune commande psql). Marqueur déterministe propre à ce fichier :
-- « RECETTE DEVIS LIGNES V1 ».
--
-- Ce fichier N'EST PAS une migration. Il présuppose que
-- supabase/migrations/20260904000100_devis_lignes_v1.sql a déjà été appliquée
-- sur l'environnement où on l'exécute — jamais Production.
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
    raise exception 'ASSERTION FAILED: % : aucune erreur levee, alors que SQLSTATE % etait attendu', p_cas, p_state_attendu;
  end if;
  if p_state <> p_state_attendu then
    raise exception 'ASSERTION FAILED: % : SQLSTATE attendu %, obtenu % (message : %)', p_cas, p_state_attendu, p_state, p_message;
  end if;
  if position(lower(p_motif_attendu) in lower(p_message)) = 0 then
    raise exception 'ASSERTION FAILED: % : message attendu contenant "%", obtenu "%"', p_cas, p_motif_attendu, p_message;
  end if;
end;
$$;
revoke execute on function pg_temp.assert_echec(text, text, text, text, text) from public;
grant execute on function pg_temp.assert_echec(text, text, text, text, text) to authenticated;

insert into _fixture_ids (cle, valeur) values
  ('user_a', gen_random_uuid()),
  ('user_b', gen_random_uuid()),
  ('garage_a', gen_random_uuid()),
  ('garage_b', gen_random_uuid()),
  ('client_a', gen_random_uuid()),
  ('vehicule_a', gen_random_uuid()),
  ('prestation_a', gen_random_uuid()),
  ('prestation_b', gen_random_uuid()),
  ('devis_attente', gen_random_uuid()),
  ('devis_brouillon', gen_random_uuid()),
  ('devis_accepte', gen_random_uuid()),
  ('devis_refuse', gen_random_uuid()),
  ('devis_inconnu', gen_random_uuid()),
  ('devis_statut_null', gen_random_uuid()),
  ('devis_historique', gen_random_uuid()),
  ('devis_b', gen_random_uuid()),
  ('devis_suppr', gen_random_uuid()),
  ('ligne_1', gen_random_uuid()),
  ('ligne_2', gen_random_uuid()),
  ('ligne_suppr', gen_random_uuid()),
  ('devis_nominal', gen_random_uuid()),
  ('devis_notif', gen_random_uuid());

-- =====================================================================
-- 1. Fixtures : deux garages, deux propriétaires
-- =====================================================================

insert into auth.users
  (id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (pg_temp.fid('user_a'), 'authenticated', 'authenticated',
   'recette-devis-lignes-a-' || pg_temp.fid('user_a')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture', now(),
   '{}'::jsonb, '{}'::jsonb, now(), now()),
  (pg_temp.fid('user_b'), 'authenticated', 'authenticated',
   'recette-devis-lignes-b-' || pg_temp.fid('user_b')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture', now(),
   '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.garages (id, owner_user_id, nom_garage) values
  (pg_temp.fid('garage_a'), pg_temp.fid('user_a'), 'RECETTE DEVIS LIGNES V1 — GARAGE A'),
  (pg_temp.fid('garage_b'), pg_temp.fid('user_b'), 'RECETTE DEVIS LIGNES V1 — GARAGE B');

insert into public.clients (id, garage_id, nom) values
  (pg_temp.fid('client_a'), pg_temp.fid('garage_a'), 'RECETTE DEVIS LIGNES V1');

insert into public.vehicules (id, garage_id, client_id, marque, modele) values
  (pg_temp.fid('vehicule_a'), pg_temp.fid('garage_a'), pg_temp.fid('client_a'), 'MarqueTestDevisLignesV1', 'ModeleTest-A');

insert into public.prestations (id, garage_id, nom, duree_minutes) values
  (pg_temp.fid('prestation_a'), pg_temp.fid('garage_a'), 'RECETTE DEVIS LIGNES V1 — PRESTATION A', 30),
  (pg_temp.fid('prestation_b'), pg_temp.fid('garage_b'), 'RECETTE DEVIS LIGNES V1 — PRESTATION B', 30);

insert into public.devis (id, garage_id, client_id, vehicule_id, statut, message_garage) values
  (pg_temp.fid('devis_attente'),   pg_temp.fid('garage_a'), pg_temp.fid('client_a'), pg_temp.fid('vehicule_a'), 'en_attente', 'RECETTE DEVIS LIGNES V1'),
  (pg_temp.fid('devis_brouillon'), pg_temp.fid('garage_a'), pg_temp.fid('client_a'), pg_temp.fid('vehicule_a'), 'brouillon',  'RECETTE DEVIS LIGNES V1'),
  (pg_temp.fid('devis_accepte'),   pg_temp.fid('garage_a'), pg_temp.fid('client_a'), pg_temp.fid('vehicule_a'), 'en_attente', 'RECETTE DEVIS LIGNES V1'),
  (pg_temp.fid('devis_refuse'),    pg_temp.fid('garage_a'), pg_temp.fid('client_a'), pg_temp.fid('vehicule_a'), 'en_attente', 'RECETTE DEVIS LIGNES V1'),
  (pg_temp.fid('devis_inconnu'),   pg_temp.fid('garage_a'), pg_temp.fid('client_a'), pg_temp.fid('vehicule_a'), 'en_attente', 'RECETTE DEVIS LIGNES V1'),
  (pg_temp.fid('devis_statut_null'), pg_temp.fid('garage_a'), pg_temp.fid('client_a'), pg_temp.fid('vehicule_a'), 'en_attente', 'RECETTE DEVIS LIGNES V1'),
  (pg_temp.fid('devis_suppr'),     pg_temp.fid('garage_a'), pg_temp.fid('client_a'), pg_temp.fid('vehicule_a'), 'en_attente', 'RECETTE DEVIS LIGNES V1'),
  (pg_temp.fid('devis_b'),         pg_temp.fid('garage_b'), null, null, 'en_attente', 'RECETTE DEVIS LIGNES V1'),
  (pg_temp.fid('devis_nominal'),   pg_temp.fid('garage_a'), pg_temp.fid('client_a'), pg_temp.fid('vehicule_a'), 'en_attente', 'RECETTE DEVIS LIGNES V1'),
  (pg_temp.fid('devis_notif'),     pg_temp.fid('garage_a'), pg_temp.fid('client_a'), pg_temp.fid('vehicule_a'), 'en_attente', 'RECETTE DEVIS LIGNES V1');

-- Devis historique : sans ligne, montant_ht NULL — reproduit le cas relevé en
-- Production par l'audit (contrat B.7). Il ne doit JAMAIS être recalculé.
insert into public.devis (id, garage_id, statut, montant_ht, montant_ttc, message_garage) values
  (pg_temp.fid('devis_historique'), pg_temp.fid('garage_a'), 'en_attente', null, null, 'RECETTE DEVIS LIGNES V1');

-- Les statuts verrouillés sont posés APRÈS insertion : le trigger
-- d'immuabilité interdirait de les modifier ensuite.
update public.devis set statut = 'accepte'      where id = pg_temp.fid('devis_accepte');
update public.devis set statut = 'refuse'       where id = pg_temp.fid('devis_refuse');
update public.devis set statut = 'statut_exotique' where id = pg_temp.fid('devis_inconnu');
update public.devis set statut = null           where id = pg_temp.fid('devis_statut_null');

-- =====================================================================
-- 2. Calcul par ligne, arrondi et totaux (contrat D.2, D.3, E)
-- =====================================================================

do $$
declare
  v_ht numeric;
  v_tva numeric;
  v_devis_ht numeric;
  v_devis_ttc numeric;
begin
  insert into public.devis_lignes (id, devis_id, garage_id, type, libelle, quantite, prix_unitaire_ht, taux_tva, position)
  values (pg_temp.fid('ligne_1'), pg_temp.fid('devis_attente'), pg_temp.fid('garage_a'),
          'main_oeuvre', 'Main d''oeuvre', 1.5, 80.00, 20.00, 1);

  select montant_ht, montant_tva into v_ht, v_tva
    from public.devis_lignes where id = pg_temp.fid('ligne_1');
  perform pg_temp.assert(v_ht = 120.00, 'ligne 1 : montant_ht attendu 120.00, obtenu ' || v_ht);
  perform pg_temp.assert(v_tva = 24.00, 'ligne 1 : montant_tva attendu 24.00, obtenu ' || v_tva);

  -- Taux différent sur la même facture : la TVA se calcule par ligne.
  insert into public.devis_lignes (id, devis_id, garage_id, type, libelle, quantite, prix_unitaire_ht, taux_tva, position)
  values (pg_temp.fid('ligne_2'), pg_temp.fid('devis_attente'), pg_temp.fid('garage_a'),
          'piece', 'Filtre a huile', 3, 12.35, 10.00, 2);

  select montant_ht, montant_tva into v_ht, v_tva
    from public.devis_lignes where id = pg_temp.fid('ligne_2');
  perform pg_temp.assert(v_ht = 37.05, 'ligne 2 : montant_ht attendu 37.05, obtenu ' || v_ht);
  perform pg_temp.assert(v_tva = 3.71,  'ligne 2 : montant_tva attendu 3.71 (arrondi par ligne), obtenu ' || v_tva);

  select montant_ht, montant_ttc into v_devis_ht, v_devis_ttc
    from public.devis where id = pg_temp.fid('devis_attente');
  perform pg_temp.assert(v_devis_ht = 157.05, 'total HT attendu 157.05, obtenu ' || v_devis_ht);
  perform pg_temp.assert(v_devis_ttc = 184.76, 'total TTC attendu 184.76, obtenu ' || v_devis_ttc);

  -- Modification d'une ligne : les totaux suivent.
  update public.devis_lignes set quantite = 2 where id = pg_temp.fid('ligne_1');
  select montant_ht into v_devis_ht from public.devis where id = pg_temp.fid('devis_attente');
  perform pg_temp.assert(v_devis_ht = 197.05, 'total HT apres modification attendu 197.05, obtenu ' || v_devis_ht);

  -- Suppression d'une ligne : les totaux suivent.
  delete from public.devis_lignes where id = pg_temp.fid('ligne_2');
  select montant_ht into v_devis_ht from public.devis where id = pg_temp.fid('devis_attente');
  perform pg_temp.assert(v_devis_ht = 160.00, 'total HT apres suppression attendu 160.00, obtenu ' || v_devis_ht);

  -- Suppression de la DERNIÈRE ligne : 0, jamais NULL (contrat E.3).
  delete from public.devis_lignes where id = pg_temp.fid('ligne_1');
  select montant_ht, montant_ttc into v_devis_ht, v_devis_ttc
    from public.devis where id = pg_temp.fid('devis_attente');
  perform pg_temp.assert(v_devis_ht = 0, 'devis vide : montant_ht attendu 0, obtenu ' || coalesce(v_devis_ht::text, 'NULL'));
  perform pg_temp.assert(v_devis_ttc = 0, 'devis vide : montant_ttc attendu 0, obtenu ' || coalesce(v_devis_ttc::text, 'NULL'));
end;
$$;

-- =====================================================================
-- 3. Devis historique jamais recalculé (contrat B.7, E.3)
-- =====================================================================

do $$
declare v_ht numeric; v_ttc numeric;
begin
  select montant_ht, montant_ttc into v_ht, v_ttc
    from public.devis where id = pg_temp.fid('devis_historique');
  perform pg_temp.assert(v_ht is null, 'devis historique : montant_ht doit rester NULL');
  perform pg_temp.assert(v_ttc is null, 'devis historique : montant_ttc doit rester NULL');
end;
$$;

-- =====================================================================
-- 4. Contraintes de ligne (contrat D) — SQLSTATE et contrainte nommee
-- =====================================================================

do $$
declare v_cas record; v_state text; v_msg text;
begin
  for v_cas in
    select * from (values
      ('quantite_zero',     'devis_lignes_quantite_positive'),
      ('quantite_negative', 'devis_lignes_quantite_positive'),
      ('prix_negatif',      'devis_lignes_prix_positif'),
      ('tva_negative',      'devis_lignes_taux_tva_borne'),
      ('tva_sup_100',       'devis_lignes_taux_tva_borne'),
      ('libelle_vide',      'devis_lignes_libelle_non_vide'),
      ('type_inconnu',      'devis_lignes_type_valide')
    ) as t(cas, contrainte)
  loop
    v_state := null; v_msg := null;
    begin
      insert into public.devis_lignes (devis_id, garage_id, type, libelle, quantite, prix_unitaire_ht, taux_tva)
      values (
        pg_temp.fid('devis_attente'), pg_temp.fid('garage_a'),
        case when v_cas.cas = 'type_inconnu' then 'remise' else 'piece' end,
        case when v_cas.cas = 'libelle_vide' then '   ' else 'Libelle' end,
        case when v_cas.cas = 'quantite_zero' then 0 when v_cas.cas = 'quantite_negative' then -1 else 1 end,
        case when v_cas.cas = 'prix_negatif' then -10 else 10 end,
        case when v_cas.cas = 'tva_negative' then -1 when v_cas.cas = 'tva_sup_100' then 101 else 20 end
      );
    exception when others then v_state := sqlstate; v_msg := sqlerrm;
    end;
    -- 23514 = check_violation
    perform pg_temp.assert_echec(v_cas.cas, v_state, v_msg, '23514', v_cas.contrainte);
  end loop;
end;
$$;

-- =====================================================================
-- 5. Intégrité inter-garage (contrat F.3) — motif exact
-- =====================================================================

do $$
declare v_state text; v_msg text;
begin
  v_state := null;
  begin
    insert into public.devis_lignes (devis_id, garage_id, type, libelle, quantite, prix_unitaire_ht, taux_tva)
    values (pg_temp.fid('devis_attente'), pg_temp.fid('garage_b'), 'piece', 'Garage incoherent', 1, 10, 20);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('garage_id incoherent', v_state, v_msg, 'P0001', 'garage_id incoherent');

  v_state := null;
  begin
    insert into public.devis_lignes (devis_id, garage_id, type, libelle, quantite, prix_unitaire_ht, taux_tva, prestation_id)
    values (pg_temp.fid('devis_attente'), pg_temp.fid('garage_a'), 'piece', 'Prestation hors garage', 1, 10, 20, pg_temp.fid('prestation_b'));
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('prestation hors garage', v_state, v_msg, 'P0001', 'prestation hors garage');
end;
$$;

-- =====================================================================
-- 6. Statuts modifiables : lignes autorisées (contrat G.4)
-- =====================================================================

do $$
declare v_n integer;
begin
  insert into public.devis_lignes (devis_id, garage_id, type, libelle, quantite, prix_unitaire_ht, taux_tva)
  values (pg_temp.fid('devis_brouillon'), pg_temp.fid('garage_a'), 'main_oeuvre', 'Sur brouillon', 1, 50, 20);
  select count(*) into v_n from public.devis_lignes where devis_id = pg_temp.fid('devis_brouillon');
  perform pg_temp.assert(v_n = 1, 'devis brouillon : l''ajout de ligne doit etre autorise');

  update public.devis_lignes set quantite = 2 where devis_id = pg_temp.fid('devis_brouillon');
  delete from public.devis_lignes where devis_id = pg_temp.fid('devis_brouillon');
  select count(*) into v_n from public.devis_lignes where devis_id = pg_temp.fid('devis_brouillon');
  perform pg_temp.assert(v_n = 0, 'devis brouillon : modification et suppression de ligne doivent etre autorisees');
end;
$$;

-- =====================================================================
-- 7. Statuts verrouillés : aucune écriture de ligne (contrat G.1, G.4)
-- =====================================================================

do $$
declare v_cle text; v_state text; v_msg text;
begin
  foreach v_cle in array array['devis_accepte','devis_refuse','devis_inconnu','devis_statut_null']
  loop
    v_state := null;
    begin
      insert into public.devis_lignes (devis_id, garage_id, type, libelle, quantite, prix_unitaire_ht, taux_tva)
      values (pg_temp.fid(v_cle), pg_temp.fid('garage_a'), 'piece', 'Interdite', 1, 10, 20);
    exception when others then v_state := sqlstate; v_msg := sqlerrm;
    end;
    perform pg_temp.assert_echec('ajout de ligne sur ' || v_cle, v_state, v_msg, 'P0001', 'le devis est verrouille');
  end loop;
end;
$$;

do $$
declare v_state text; v_msg text; v_n integer;
begin
  insert into public.devis_lignes (id, devis_id, garage_id, type, libelle, quantite, prix_unitaire_ht, taux_tva)
  values (pg_temp.fid('ligne_suppr'), pg_temp.fid('devis_suppr'), pg_temp.fid('garage_a'), 'piece', 'Avant verrouillage', 1, 10, 20);

  update public.devis set statut = 'accepte' where id = pg_temp.fid('devis_suppr');

  v_state := null;
  begin
    update public.devis_lignes set quantite = 5 where id = pg_temp.fid('ligne_suppr');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('modification de ligne sur devis verrouille', v_state, v_msg, 'P0001', 'le devis est verrouille');

  v_state := null;
  begin
    delete from public.devis_lignes where id = pg_temp.fid('ligne_suppr');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('suppression de ligne sur devis verrouille', v_state, v_msg, 'P0001', 'le devis est verrouille');

  select count(*) into v_n from public.devis_lignes where id = pg_temp.fid('ligne_suppr');
  perform pg_temp.assert(v_n = 1, 'devis verrouille : la ligne doit toujours exister');
end;
$$;

-- =====================================================================
-- 8. Immuabilité du devis verrouillé — TOUS les champs (contrat G.2)
-- =====================================================================

do $$
declare v_champ text; v_state text; v_msg text; v_statut_apres text;
begin
  foreach v_champ in array array['montant_ht','montant_ttc','prestation_id','client_id','vehicule_id','garage_id','demande_id','message_garage','statut','date_validation']
  loop
    v_state := null;
    begin
      case v_champ
        when 'montant_ht'      then update public.devis set montant_ht = 999 where id = pg_temp.fid('devis_accepte');
        when 'montant_ttc'     then update public.devis set montant_ttc = 999 where id = pg_temp.fid('devis_accepte');
        when 'prestation_id'   then update public.devis set prestation_id = pg_temp.fid('prestation_a') where id = pg_temp.fid('devis_accepte');
        when 'client_id'       then update public.devis set client_id = null where id = pg_temp.fid('devis_accepte');
        when 'vehicule_id'     then update public.devis set vehicule_id = null where id = pg_temp.fid('devis_accepte');
        when 'garage_id'       then update public.devis set garage_id = pg_temp.fid('garage_b') where id = pg_temp.fid('devis_accepte');
        when 'demande_id'      then update public.devis set demande_id = null where id = pg_temp.fid('devis_accepte');
        when 'message_garage'  then update public.devis set message_garage = 'reecrit' where id = pg_temp.fid('devis_accepte');
        when 'statut'          then update public.devis set statut = 'refuse' where id = pg_temp.fid('devis_accepte');
        when 'date_validation' then update public.devis set date_validation = now() where id = pg_temp.fid('devis_accepte');
      end case;
    exception when others then v_state := sqlstate; v_msg := sqlerrm;
    end;
    perform pg_temp.assert_echec('modification de devis.' || v_champ, v_state, v_msg, 'P0001', 'ne peut plus etre modifie');
  end loop;

  select statut into v_statut_apres from public.devis where id = pg_temp.fid('devis_accepte');
  perform pg_temp.assert(v_statut_apres = 'accepte', 'devis accepte : le statut doit etre intact');
end;
$$;

do $$
declare v_state text; v_msg text; v_n integer;
begin
  v_state := null;
  begin
    delete from public.devis where id = pg_temp.fid('devis_suppr');
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('suppression d''un devis verrouille', v_state, v_msg, 'P0001', 'ne peut pas etre supprime');

  select count(*) into v_n from public.devis where id = pg_temp.fid('devis_suppr');
  perform pg_temp.assert(v_n = 1, 'devis verrouille : le devis doit toujours exister');

  select count(*) into v_n from public.devis_lignes where devis_id = pg_temp.fid('devis_suppr');
  perform pg_temp.assert(v_n = 1, 'devis verrouille : ses lignes doivent toujours exister');
end;
$$;

-- =====================================================================
-- 9. Transition permise + cascade (contrat G.2, G.1)
-- =====================================================================

do $$
declare v_n integer; v_statut text; v_date timestamptz;
begin
  -- en_attente -> accepte avec date_validation : doit passer.
  update public.devis set statut = 'accepte', date_validation = now()
    where id = pg_temp.fid('devis_brouillon');
  select statut, date_validation into v_statut, v_date
    from public.devis where id = pg_temp.fid('devis_brouillon');
  perform pg_temp.assert(v_statut = 'accepte', 'transition vers accepte : doit etre permise');
  perform pg_temp.assert(v_date is not null, 'transition : date_validation doit etre posee');

  -- Cascade : un devis modifiable portant des lignes est supprimable, et ses
  -- lignes partent avec lui sans que le trigger G.1 ne bloque.
  insert into public.devis_lignes (devis_id, garage_id, type, libelle, quantite, prix_unitaire_ht, taux_tva)
  values (pg_temp.fid('devis_attente'), pg_temp.fid('garage_a'), 'piece', 'Cascade', 2, 15, 20);
  select count(*) into v_n from public.devis_lignes where devis_id = pg_temp.fid('devis_attente');
  perform pg_temp.assert(v_n = 1, 'preparation cascade : une ligne doit exister');

  delete from public.devis where id = pg_temp.fid('devis_attente');

  select count(*) into v_n from public.devis where id = pg_temp.fid('devis_attente');
  perform pg_temp.assert(v_n = 0, 'cascade : le devis modifiable doit etre supprime');
  select count(*) into v_n from public.devis_lignes where devis_id = pg_temp.fid('devis_attente');
  perform pg_temp.assert(v_n = 0, 'cascade : ses lignes doivent etre supprimees');
end;
$$;

-- =====================================================================
-- 10. CHEMIN NOMINAL COMPLET SOUS RÔLE `authenticated` (regression P0)
-- =====================================================================
-- Les sections precedentes s'executent avec le role de session, qui contourne
-- RLS et privileges : elles ne prouvent RIEN sur ce qu'un garagiste reel peut
-- faire. Cette section rejoue le parcours nominal ENTIER sous `authenticated`.
--
-- `discard plans` est INDISPENSABLE ici, et ce n'est pas une precaution de
-- confort. PL/pgSQL met en cache les plans de ses requetes, et le privilege
-- EXECUTE d'une fonction est verifie a la PLANIFICATION, pas a l'execution.
-- Les sections 2 a 9 ayant deja fait passer les memes triggers sous le role de
-- session (superutilisateur), leurs plans sont caches : sans purge, l'insertion
-- ci-dessous reutiliserait ces plans et ne revaliderait AUCUN privilege. Le
-- test passerait alors meme si `authenticated` n'avait aucun droit — c'est
-- exactement le faux negatif constate lors du controle negatif du 2026-09-04.
-- Les sections precedentes s'executent avec le role de session, qui contourne
-- RLS et privileges : elles ne prouvent RIEN sur ce qu'un garagiste reel peut
-- faire. Cette section rejoue le parcours nominal ENTIER sous `authenticated`.
-- C'est elle qui aurait attrape le « permission denied for function
-- devis_statut_modifiable » passe inapercu a la premiere redaction.

discard plans;

do $$
declare v_n integer; v_ht numeric; v_ttc numeric;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid('user_a')::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.devis_lignes (devis_id, garage_id, type, libelle, quantite, prix_unitaire_ht, taux_tva)
  values (pg_temp.fid('devis_nominal'), pg_temp.fid('garage_a'), 'main_oeuvre', 'Nominal MO', 2, 50.00, 20.00);
  insert into public.devis_lignes (devis_id, garage_id, type, libelle, quantite, prix_unitaire_ht, taux_tva)
  values (pg_temp.fid('devis_nominal'), pg_temp.fid('garage_a'), 'piece', 'Nominal piece', 1, 20.00, 10.00);

  select count(*) into v_n from public.devis_lignes where devis_id = pg_temp.fid('devis_nominal');
  perform pg_temp.assert(v_n = 2, 'nominal authenticated : deux lignes attendues, obtenu ' || v_n);

  select montant_ht, montant_ttc into v_ht, v_ttc from public.devis where id = pg_temp.fid('devis_nominal');
  perform pg_temp.assert(v_ht = 120.00, 'nominal authenticated : HT attendu 120.00, obtenu ' || v_ht);
  perform pg_temp.assert(v_ttc = 142.00, 'nominal authenticated : TTC attendu 142.00, obtenu ' || v_ttc);

  update public.devis_lignes set quantite = 3
   where devis_id = pg_temp.fid('devis_nominal') and type = 'main_oeuvre';
  select montant_ht into v_ht from public.devis where id = pg_temp.fid('devis_nominal');
  perform pg_temp.assert(v_ht = 170.00, 'nominal authenticated : HT apres modification attendu 170.00, obtenu ' || v_ht);

  delete from public.devis_lignes where devis_id = pg_temp.fid('devis_nominal') and type = 'piece';
  select montant_ht into v_ht from public.devis where id = pg_temp.fid('devis_nominal');
  perform pg_temp.assert(v_ht = 150.00, 'nominal authenticated : HT apres suppression attendu 150.00, obtenu ' || v_ht);

  update public.devis set statut = 'accepte', date_validation = now()
   where id = pg_temp.fid('devis_nominal');

  reset role;
end;
$$;

-- =====================================================================
-- 11. Isolation par garage, sous rôle `authenticated` (contrat F.2)
-- =====================================================================
-- Meme raison qu'en section 10 : les plans caches sous le role de session
-- masqueraient les controles de privileges et de RLS.

discard plans;

do $$
declare v_n integer; v_state text; v_msg text;
begin
  insert into public.devis_lignes (devis_id, garage_id, type, libelle, quantite, prix_unitaire_ht, taux_tva)
  values (pg_temp.fid('devis_b'), pg_temp.fid('garage_b'), 'piece', 'Garage B', 1, 10, 20);

  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid('user_a')::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_n from public.devis_lignes where garage_id = pg_temp.fid('garage_b');
  perform pg_temp.assert(v_n = 0, 'isolation : A ne doit voir aucune ligne de B, vu ' || v_n);

  v_state := null;
  begin
    insert into public.devis_lignes (devis_id, garage_id, type, libelle, quantite, prix_unitaire_ht, taux_tva)
    values (pg_temp.fid('devis_b'), pg_temp.fid('garage_b'), 'piece', 'Injection', 1, 10, 20);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  perform pg_temp.assert_echec('ecriture croisee A vers B', v_state, v_msg, 'P0001', 'devis introuvable ou hors garage');

  update public.devis_lignes set prix_unitaire_ht = 1 where garage_id = pg_temp.fid('garage_b');
  get diagnostics v_n = row_count;
  perform pg_temp.assert(v_n = 0, 'isolation : A ne doit modifier aucune ligne de B, touchees ' || v_n);

  delete from public.devis_lignes where garage_id = pg_temp.fid('garage_b');
  get diagnostics v_n = row_count;
  perform pg_temp.assert(v_n = 0, 'isolation : A ne doit supprimer aucune ligne de B, touchees ' || v_n);

  reset role;

  select count(*) into v_n from public.devis_lignes where garage_id = pg_temp.fid('garage_b');
  perform pg_temp.assert(v_n = 1, 'isolation : la ligne du garage B doit etre intacte');
end;
$$;

do $$
declare v_state text; v_msg text;
begin
  v_state := null;
  begin
    set local role anon;
    perform 1 from public.devis_lignes;
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  reset role;
  perform pg_temp.assert_echec('lecture anon', v_state, v_msg, '42501', 'devis_lignes');

  v_state := null;
  begin
    set local role anon;
    insert into public.devis_lignes (devis_id, garage_id, type, libelle, quantite, prix_unitaire_ht, taux_tva)
    values (pg_temp.fid('devis_b'), pg_temp.fid('garage_b'), 'piece', 'Anon', 1, 10, 20);
  exception when others then v_state := sqlstate; v_msg := sqlerrm;
  end;
  reset role;
  perform pg_temp.assert_echec('ecriture anon', v_state, v_msg, '42501', 'devis_lignes');
end;
$$;

-- =====================================================================
-- 12. ZÉRO NOTIFICATION sur écriture de ligne (règle produit)
-- =====================================================================
-- Ajouter, modifier ou supprimer une ligne ne doit JAMAIS alimenter
-- notifications_devis. Seul un geste metier explicite — la transition vers
-- accepte ou refuse — a le droit d'y ecrire. Ce test verrouille la regle cote
-- base : si notifier_devis_maj se mettait un jour a reagir a autre chose qu'une
-- transition de statut, il echouerait ici plutot qu'en production.

do $$
declare v_avant integer; v_apres integer; v_id uuid;
begin
  v_id := pg_temp.fid('devis_notif');
  select count(*) into v_avant from public.notifications_devis where devis_id = v_id;

  insert into public.devis_lignes (devis_id, garage_id, type, libelle, quantite, prix_unitaire_ht, taux_tva)
  values (v_id, pg_temp.fid('garage_a'), 'piece', 'Notif ajout', 1, 10, 20);
  select count(*) into v_apres from public.notifications_devis where devis_id = v_id;
  perform pg_temp.assert(v_apres = v_avant, 'AJOUT de ligne : aucune notification attendue (avant ' || v_avant || ', apres ' || v_apres || ')');

  update public.devis_lignes set quantite = 4 where devis_id = v_id;
  select count(*) into v_apres from public.notifications_devis where devis_id = v_id;
  perform pg_temp.assert(v_apres = v_avant, 'MODIFICATION de ligne : aucune notification attendue (avant ' || v_avant || ', apres ' || v_apres || ')');

  delete from public.devis_lignes where devis_id = v_id;
  select count(*) into v_apres from public.notifications_devis where devis_id = v_id;
  perform pg_temp.assert(v_apres = v_avant, 'SUPPRESSION de ligne : aucune notification attendue (avant ' || v_avant || ', apres ' || v_apres || ')');

  -- Contre-epreuve indispensable : le geste metier explicite, lui, DOIT
  -- notifier. Sans elle, ce test passerait aussi si les notifications etaient
  -- completement cassees.
  update public.devis set statut = 'accepte', date_validation = now() where id = v_id;
  select count(*) into v_apres from public.notifications_devis where devis_id = v_id;
  perform pg_temp.assert(v_apres = v_avant + 1, 'TRANSITION vers accepte : une notification attendue (avant ' || v_avant || ', apres ' || v_apres || ')');
end;
$$;

rollback;

-- =====================================================================
-- 13. Preuve d'absence de résidu, APRÈS rollback (hors transaction)
-- =====================================================================

do $$
declare
  v_n integer;
  v_residus text[] := array[]::text[];
begin
  select count(*) into v_n from public.garages where nom_garage like 'RECETTE DEVIS LIGNES V1%';
  if v_n > 0 then v_residus := v_residus || ('garages : ' || v_n); end if;

  select count(*) into v_n from public.clients where nom = 'RECETTE DEVIS LIGNES V1';
  if v_n > 0 then v_residus := v_residus || ('clients : ' || v_n); end if;

  select count(*) into v_n from public.vehicules where marque = 'MarqueTestDevisLignesV1';
  if v_n > 0 then v_residus := v_residus || ('vehicules : ' || v_n); end if;

  select count(*) into v_n from public.prestations where nom like 'RECETTE DEVIS LIGNES V1%';
  if v_n > 0 then v_residus := v_residus || ('prestations : ' || v_n); end if;

  select count(*) into v_n from auth.users where email like 'recette-devis-lignes-%@example.invalid';
  if v_n > 0 then v_residus := v_residus || ('auth.users : ' || v_n); end if;

  select count(*) into v_n from public.devis where message_garage = 'RECETTE DEVIS LIGNES V1';
  if v_n > 0 then v_residus := v_residus || ('devis : ' || v_n); end if;

  -- devis_lignes n'a pas de marqueur propre, mais référence garages(id) en
  -- ON DELETE RESTRICT et devis(id) en CASCADE : une ligne ne peut pas
  -- survivre à la disparition de son garage, déjà prouvée ci-dessus.

  if array_length(v_residus, 1) > 0 then
    raise exception 'NETTOYAGE ECHOUE apres rollback — fixtures encore presentes : %', array_to_string(v_residus, '; ');
  end if;
end;
$$;
