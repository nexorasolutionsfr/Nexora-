-- Accès salariés V1 — banc de test AUTONOME et RÉVERSIBLE.
--
-- Convention reprise à l'identique de supabase/tests/ordres_reparation_v1.sql :
-- une transaction unique jamais validée, une table temporaire `_fixture_ids`
-- pour tous les identifiants, `pg_temp.fid()` et `pg_temp.assert()`, une
-- impersonation par `set_config('request.jwt.claims', ...)` suivie de
-- `set local role authenticated`, et un `reset role;` après chaque bloc.
--
-- Ce fichier n'est PAS une migration. Il présuppose que les migrations
-- 20260905000100 à 20260905000700 sont appliquées. À exécuter uniquement sur
-- l'environnement de test isolé, jamais sur Production.
--
-- Marqueur de nettoyage : toutes les fixtures portent « RECETTE ACCES V1 »
-- ou l'adresse `recette-acces-v1-...@example.invalid`. La vérification
-- post-rollback en fin de fichier échoue si la moindre ligne subsiste.
--
-- Couverture : deux garages étanches, quatre comptes (propriétaire A,
-- accueil A, mécanicien A, propriétaire B), ordre affecté contre non
-- affecté, révocation, refus sur factures / réglages / statistiques /
-- membres, et absence d'escalade par RPC.

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
  ('user_prop_a', gen_random_uuid()),
  ('user_accueil_a', gen_random_uuid()),
  ('user_meca_a', gen_random_uuid()),
  ('user_meca_a2', gen_random_uuid()),
  ('user_prop_b', gen_random_uuid()),
  ('garage_a', gen_random_uuid()),
  ('garage_b', gen_random_uuid()),
  ('client_a', gen_random_uuid()),
  ('client_b', gen_random_uuid()),
  ('vehicule_a', gen_random_uuid()),
  ('vehicule_b', gen_random_uuid()),
  ('mecanicien_a', gen_random_uuid()),
  ('mecanicien_a2', gen_random_uuid()),
  ('mecanicien_b', gen_random_uuid()),
  ('rdv_a1', gen_random_uuid()),
  ('rdv_a2', gen_random_uuid()),
  ('rdv_b', gen_random_uuid()),
  ('devis_a', gen_random_uuid()),
  ('devis_b', gen_random_uuid()),
  ('or_a_affecte', gen_random_uuid()),
  ('or_a_autre', gen_random_uuid()),
  ('or_b', gen_random_uuid()),
  ('ligne_affectee', gen_random_uuid()),
  ('ligne_autre', gen_random_uuid()),
  ('facture_a', gen_random_uuid()),
  ('membre_accueil', gen_random_uuid()),
  ('membre_meca', gen_random_uuid());

-- =====================================================================
-- 1. Comptes synthétiques
-- =====================================================================

insert into auth.users
  (id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select v.id, 'authenticated', 'authenticated',
       'recette-acces-v1-' || v.id::text || '@example.invalid',
       'not-a-real-credential-synthetic-test-fixture', now(),
       '{}'::jsonb, '{}'::jsonb, now(), now()
from (values
  (pg_temp.fid('user_prop_a')),
  (pg_temp.fid('user_accueil_a')),
  (pg_temp.fid('user_meca_a')),
  (pg_temp.fid('user_meca_a2')),
  (pg_temp.fid('user_prop_b'))
) as v(id);

-- =====================================================================
-- 2. Fixtures métier (rôle opérateur : contourne RLS, comportement normal)
-- =====================================================================

-- `abonnement_actif` vaut `false` par défaut depuis 20260909000300. Sans le
-- poser ici, les deux garages seraient à l'accès échu et le verrou
-- 20260909000900 ferait renvoyer NULL à `current_garage_id()` : ce banc
-- échouerait sur des assertions qui ne parlent pas d'accès. Le garage B est
-- ouvert lui aussi, sinon l'étanchéité entre garages passerait pour la
-- mauvaise raison — refusé parce qu'échu, et non parce qu'il appartient à
-- quelqu'un d'autre.
insert into garages (id, owner_user_id, nom_garage, objectif_ca_mensuel, abonnement_actif, acces_motif) values
  (pg_temp.fid('garage_a'), pg_temp.fid('user_prop_a'), 'RECETTE ACCES V1 — GARAGE A', 12345, true, 'abonnement'),
  (pg_temp.fid('garage_b'), pg_temp.fid('user_prop_b'), 'RECETTE ACCES V1 — GARAGE B', 999, true, 'abonnement');

insert into clients (id, garage_id, nom, email, telephone) values
  (pg_temp.fid('client_a'), pg_temp.fid('garage_a'), 'RECETTE ACCES V1 — CLIENT A',
   'recette-acces-v1-client@example.invalid', '0600000000'),
  (pg_temp.fid('client_b'), pg_temp.fid('garage_b'), 'RECETTE ACCES V1 — CLIENT B',
   'recette-acces-v1-client-b@example.invalid', '0600000001');

insert into vehicules (id, garage_id, client_id, marque, modele, immatriculation) values
  (pg_temp.fid('vehicule_a'), pg_temp.fid('garage_a'), pg_temp.fid('client_a'),
   'MarqueTestAccesV1', 'ModeleTest-A', 'AA-001-AA'),
  (pg_temp.fid('vehicule_b'), pg_temp.fid('garage_b'), pg_temp.fid('client_b'),
   'MarqueTestAccesV1', 'ModeleTest-B', 'BB-001-BB');

insert into mecaniciens (id, garage_id, nom) values
  (pg_temp.fid('mecanicien_a'), pg_temp.fid('garage_a'), 'RECETTE ACCES V1 — MECA A'),
  (pg_temp.fid('mecanicien_a2'), pg_temp.fid('garage_a'), 'RECETTE ACCES V1 — MECA A2'),
  (pg_temp.fid('mecanicien_b'), pg_temp.fid('garage_b'), 'RECETTE ACCES V1 — MECA B');

insert into rendez_vous (id, garage_id, client_id, vehicule_id, date_debut, date_fin, statut, notes) values
  (pg_temp.fid('rdv_a1'), pg_temp.fid('garage_a'), pg_temp.fid('client_a'), pg_temp.fid('vehicule_a'),
   now() + interval '1 day', now() + interval '1 day 2 hours', 'confirme', 'RECETTE ACCES V1'),
  (pg_temp.fid('rdv_a2'), pg_temp.fid('garage_a'), pg_temp.fid('client_a'), pg_temp.fid('vehicule_a'),
   now() + interval '2 day', now() + interval '2 day 2 hours', 'confirme', 'RECETTE ACCES V1'),
  (pg_temp.fid('rdv_b'), pg_temp.fid('garage_b'), pg_temp.fid('client_b'), pg_temp.fid('vehicule_b'),
   now() + interval '1 day', now() + interval '1 day 2 hours', 'confirme', 'RECETTE ACCES V1');

insert into devis (id, garage_id, client_id, vehicule_id, montant_ht, montant_ttc, statut, message_garage) values
  (pg_temp.fid('devis_a'), pg_temp.fid('garage_a'), pg_temp.fid('client_a'), pg_temp.fid('vehicule_a'),
   100, 120, 'en_attente', 'RECETTE ACCES V1'),
  (pg_temp.fid('devis_b'), pg_temp.fid('garage_b'), pg_temp.fid('client_b'), pg_temp.fid('vehicule_b'),
   100, 120, 'en_attente', 'RECETTE ACCES V1');

insert into factures (id, garage_id, client_id, vehicule_id, numero, montant_ht, montant_ttc, statut, motif) values
  (pg_temp.fid('facture_a'), pg_temp.fid('garage_a'), pg_temp.fid('client_a'), pg_temp.fid('vehicule_a'),
   'RECETTE-ACCES-V1-0001', 100, 120, 'brouillon', 'RECETTE ACCES V1');

-- OR affecté au mécanicien A, OR du même garage affecté à un autre
-- mécanicien, OR du garage B.
insert into ordres_reparation (id, garage_id, rendez_vous_id, vehicule_id, client_id, mecanicien_id, statut, notes_internes) values
  (pg_temp.fid('or_a_affecte'), pg_temp.fid('garage_a'), pg_temp.fid('rdv_a1'), pg_temp.fid('vehicule_a'),
   pg_temp.fid('client_a'), pg_temp.fid('mecanicien_a'), 'confirme', 'RECETTE ACCES V1 — NOTE INTERNE'),
  (pg_temp.fid('or_a_autre'), pg_temp.fid('garage_a'), pg_temp.fid('rdv_a2'), pg_temp.fid('vehicule_a'),
   pg_temp.fid('client_a'), pg_temp.fid('mecanicien_a2'), 'confirme', 'RECETTE ACCES V1 — NOTE INTERNE'),
  (pg_temp.fid('or_b'), pg_temp.fid('garage_b'), pg_temp.fid('rdv_b'), pg_temp.fid('vehicule_b'),
   pg_temp.fid('client_b'), pg_temp.fid('mecanicien_b'), 'confirme', 'RECETTE ACCES V1 — NOTE INTERNE');

insert into ordres_reparation_lignes (id, ordre_reparation_id, garage_id, type, libelle, quantite, prix_unitaire_ht, duree_minutes) values
  (pg_temp.fid('ligne_affectee'), pg_temp.fid('or_a_affecte'), pg_temp.fid('garage_a'),
   'main_oeuvre', 'RECETTE ACCES V1 — MO', 1, 60, 60),
  (pg_temp.fid('ligne_autre'), pg_temp.fid('or_a_autre'), pg_temp.fid('garage_a'),
   'main_oeuvre', 'RECETTE ACCES V1 — MO AUTRE', 1, 60, 60);

-- Adhésions : un accueil et un mécanicien sur le garage A.
insert into garage_membres (id, garage_id, user_id, role, mecanicien_id) values
  (pg_temp.fid('membre_accueil'), pg_temp.fid('garage_a'), pg_temp.fid('user_accueil_a'), 'accueil', null),
  (pg_temp.fid('membre_meca'), pg_temp.fid('garage_a'), pg_temp.fid('user_meca_a'), 'mecanicien', pg_temp.fid('mecanicien_a'));

-- =====================================================================
-- 3. Le propriétaire ne perd rien (compatibilité)
-- =====================================================================

select set_config('request.jwt.claims',
  json_build_object('sub', pg_temp.fid('user_prop_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  perform pg_temp.assert(
    current_garage_id() = pg_temp.fid('garage_a'),
    'Le propriétaire A doit toujours résoudre son garage');
  perform pg_temp.assert(
    mon_role_garage(pg_temp.fid('garage_a')) = 'dirigeant',
    'Le propriétaire est dirigeant de son garage');
  perform pg_temp.assert(
    mon_role_garage(pg_temp.fid('garage_b')) is null,
    'Le propriétaire A n''a aucun rôle sur le garage B');
  perform pg_temp.assert(
    (select count(*) from clients where garage_id = pg_temp.fid('garage_a')) = 1,
    'Le propriétaire A lit ses clients');
  perform pg_temp.assert(
    (select count(*) from clients where garage_id = pg_temp.fid('garage_b')) = 0,
    'Le propriétaire A ne lit pas les clients du garage B');
  perform pg_temp.assert(
    (select count(*) from factures where garage_id = pg_temp.fid('garage_a')) = 1,
    'Le propriétaire A lit ses factures');
  perform pg_temp.assert(
    (select count(*) from ordres_reparation where garage_id = pg_temp.fid('garage_a')) = 2,
    'Le propriétaire A lit ses deux ordres de réparation');
end;
$$;

reset role;

-- =====================================================================
-- 4. Rôle accueil : ce qu'il peut, et surtout ce qu'il ne peut pas
-- =====================================================================

select set_config('request.jwt.claims',
  json_build_object('sub', pg_temp.fid('user_accueil_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  perform pg_temp.assert(
    mon_role_garage(pg_temp.fid('garage_a')) = 'accueil',
    'L''accueil A est reconnu comme accueil');
  perform pg_temp.assert(
    current_garage_id() is null,
    'L''accueil ne doit JAMAIS être résolu par current_garage_id()');

  -- Autorisé
  perform pg_temp.assert(
    (select count(*) from clients where garage_id = pg_temp.fid('garage_a')) = 1,
    'L''accueil lit les clients de son garage');
  perform pg_temp.assert(
    (select count(*) from rendez_vous where garage_id = pg_temp.fid('garage_a')) = 2,
    'L''accueil lit les rendez-vous de son garage');
  perform pg_temp.assert(
    (select count(*) from devis where garage_id = pg_temp.fid('garage_a')) = 1,
    'L''accueil lit les devis de son garage');
  perform pg_temp.assert(
    (select count(*) from ordres_reparation where garage_id = pg_temp.fid('garage_a')) = 2,
    'L''accueil lit les ordres de réparation de son garage');
  perform pg_temp.assert(
    (select count(*) from mecaniciens where garage_id = pg_temp.fid('garage_a')) = 2,
    'L''accueil lit la liste des mécaniciens');

  -- Refusé
  perform pg_temp.assert(
    (select count(*) from factures) = 0,
    'L''accueil ne doit voir AUCUNE facture');
  perform pg_temp.assert(
    (select count(*) from garages) = 0,
    'L''accueil ne doit voir AUCUNE ligne garages (réglages, objectif de CA)');
  perform pg_temp.assert(
    (select count(*) from garage_membres where garage_id = pg_temp.fid('garage_a')) = 1,
    'L''accueil ne voit que sa propre adhésion, jamais les autres membres');
  perform pg_temp.assert(
    (select count(*) from clients where garage_id = pg_temp.fid('garage_b')) = 0,
    'L''accueil du garage A ne voit rien du garage B');
end;
$$;

-- Écriture autorisée sur un client de son garage.
update clients set telephone = '0611111111' where id = pg_temp.fid('client_a');
do $$
begin
  perform pg_temp.assert(
    (select telephone from clients where id = pg_temp.fid('client_a')) = '0611111111',
    'L''accueil met à jour un client de son garage');
end;
$$;

-- Escalade refusée : la gestion des accès.
do $$
declare v_err text;
begin
  begin
    perform inviter_membre_garage(pg_temp.fid('garage_a'), pg_temp.fid('user_meca_a2'), 'accueil');
    v_err := 'AUCUNE';
  exception when others then
    v_err := sqlerrm;
  end;
  perform pg_temp.assert(v_err <> 'AUCUNE',
    'L''accueil ne doit pas pouvoir inviter un membre');
end;
$$;

do $$
declare v_err text;
begin
  begin
    perform lister_membres_garage(pg_temp.fid('garage_a'));
    v_err := 'AUCUNE';
  exception when others then
    v_err := sqlerrm;
  end;
  perform pg_temp.assert(v_err <> 'AUCUNE',
    'L''accueil ne doit pas pouvoir lister les membres');
end;
$$;

-- Escalade refusée : le lien de facture reste au dirigeant.
do $$
declare v_err text;
begin
  begin
    perform creer_jeton_facture(pg_temp.fid('facture_a'));
    v_err := 'AUCUNE';
  exception when others then
    v_err := sqlerrm;
  end;
  perform pg_temp.assert(v_err <> 'AUCUNE',
    'L''accueil ne doit pas pouvoir créer un lien de facture');
end;
$$;

-- Autorisé : le lien de devis, geste normal de l'accueil.
do $$
declare v_token text;
begin
  v_token := creer_jeton_devis(pg_temp.fid('devis_a'));
  perform pg_temp.assert(v_token is not null and length(v_token) = 64,
    'L''accueil doit pouvoir créer un lien de devis');
end;
$$;

-- Refusé : un devis d'un autre garage.
do $$
declare v_err text;
begin
  begin
    perform creer_jeton_devis(pg_temp.fid('devis_b'));
    v_err := 'AUCUNE';
  exception when others then
    v_err := sqlerrm;
  end;
  perform pg_temp.assert(v_err <> 'AUCUNE',
    'L''accueil ne doit pas créer de lien sur un objet hors de son garage');
end;
$$;

reset role;

-- =====================================================================
-- 5. Rôle mécanicien : aucune lecture directe, RPC bornées à l'affectation
-- =====================================================================

select set_config('request.jwt.claims',
  json_build_object('sub', pg_temp.fid('user_meca_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  perform pg_temp.assert(
    mon_role_garage(pg_temp.fid('garage_a')) = 'mecanicien',
    'Le mécanicien A est reconnu comme mécanicien');
  perform pg_temp.assert(
    current_garage_id() is null,
    'Le mécanicien ne doit JAMAIS être résolu par current_garage_id()');

  -- Refus par défaut sur toutes les tables sensibles.
  perform pg_temp.assert((select count(*) from clients) = 0,
    'Le mécanicien ne lit aucun client en direct');
  perform pg_temp.assert((select count(*) from vehicules) = 0,
    'Le mécanicien ne lit aucun véhicule en direct');
  perform pg_temp.assert((select count(*) from rendez_vous) = 0,
    'Le mécanicien ne lit aucun rendez-vous en direct');
  perform pg_temp.assert((select count(*) from devis) = 0,
    'Le mécanicien ne lit aucun devis');
  perform pg_temp.assert((select count(*) from factures) = 0,
    'Le mécanicien ne lit aucune facture');
  perform pg_temp.assert((select count(*) from garages) = 0,
    'Le mécanicien ne lit aucun réglage de garage');
  perform pg_temp.assert((select count(*) from demandes) = 0,
    'Le mécanicien ne lit aucune demande client');
  perform pg_temp.assert((select count(*) from ordres_reparation) = 0,
    'Le mécanicien ne lit aucun ordre de réparation en direct, même le sien');
  perform pg_temp.assert((select count(*) from ordres_reparation_lignes) = 0,
    'Le mécanicien ne lit aucune ligne en direct (prix)');
  perform pg_temp.assert((select count(*) from mecaniciens) = 0,
    'Le mécanicien ne lit pas la liste des mécaniciens');
  perform pg_temp.assert(
    (select count(*) from garage_membres) = 1,
    'Le mécanicien ne voit que sa propre adhésion');
end;
$$;

-- La liste de travail ne contient que l'ordre affecté.
do $$
declare v_n int; v_id uuid; v_client text;
begin
  select count(*) into v_n from atelier_mes_ordres();
  perform pg_temp.assert(v_n = 1,
    'atelier_mes_ordres ne renvoie que l''ordre affecté au mécanicien');

  select ordre_id, client_nom into v_id, v_client from atelier_mes_ordres();
  perform pg_temp.assert(v_id = pg_temp.fid('or_a_affecte'),
    'atelier_mes_ordres renvoie bien l''ordre affecté');
  perform pg_temp.assert(v_client = 'RECETTE ACCES V1 — CLIENT A',
    'atelier_mes_ordres renvoie le nom du client');
end;
$$;

-- Le détail d'un ordre non affecté est refusé, et indiscernable d'un
-- identifiant inexistant.
do $$
declare v_err_autre text; v_err_inconnu text;
begin
  begin
    perform atelier_mon_ordre(pg_temp.fid('or_a_autre'));
    v_err_autre := 'AUCUNE';
  exception when others then v_err_autre := sqlerrm;
  end;
  begin
    perform atelier_mon_ordre(gen_random_uuid());
    v_err_inconnu := 'AUCUNE';
  exception when others then v_err_inconnu := sqlerrm;
  end;

  perform pg_temp.assert(v_err_autre <> 'AUCUNE',
    'Un ordre non affecté doit être refusé');
  perform pg_temp.assert(v_err_autre = v_err_inconnu,
    'Un ordre non affecté doit être indiscernable d''un ordre inexistant');
end;
$$;

-- Un ordre du garage B est refusé lui aussi.
do $$
declare v_err text;
begin
  begin
    perform atelier_mon_ordre(pg_temp.fid('or_b'));
    v_err := 'AUCUNE';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.assert(v_err <> 'AUCUNE',
    'Un ordre d''un autre garage doit être refusé');
end;
$$;

-- Le détail de son propre ordre fonctionne, et ne porte aucun prix : la
-- fonction ne renvoie que six colonnes, dont aucune n'est un montant.
do $$
declare v_n int;
begin
  select count(*) into v_n from atelier_mon_ordre(pg_temp.fid('or_a_affecte'));
  perform pg_temp.assert(v_n = 1,
    'Le mécanicien lit les lignes de son ordre affecté');
end;
$$;

do $$
declare v_cols int;
begin
  -- Le type de retour déclaré ne comporte aucune colonne de montant.
  select count(*) into v_cols
  from unnest(string_to_array(
    pg_get_function_result('public.atelier_mon_ordre(uuid)'::regprocedure), ',')) as c
  where c ilike '%prix%' or c ilike '%montant%' or c ilike '%ht%' or c ilike '%ttc%';
  perform pg_temp.assert(v_cols = 0,
    'atelier_mon_ordre ne doit exposer aucune colonne de montant');
end;
$$;

-- Écriture autorisée sur sa ligne, refusée sur celle d'un autre ordre.
do $$
declare v_err text;
begin
  perform atelier_marquer_ligne(pg_temp.fid('ligne_affectee'), 'fait');

  begin
    perform atelier_marquer_ligne(pg_temp.fid('ligne_autre'), 'fait');
    v_err := 'AUCUNE';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.assert(v_err <> 'AUCUNE',
    'Le mécanicien ne marque pas une ligne d''un ordre non affecté');
end;
$$;

-- Étape atelier : autorisée sur son rendez-vous, jamais jusqu'à restitue.
do $$
declare v_err text;
begin
  perform atelier_avancer_etape(pg_temp.fid('rdv_a1'), 'intervention');

  begin
    perform atelier_avancer_etape(pg_temp.fid('rdv_a1'), 'restitue');
    v_err := 'AUCUNE';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.assert(v_err <> 'AUCUNE',
    'Le mécanicien ne doit pas pouvoir restituer le véhicule');

  begin
    perform atelier_avancer_etape(pg_temp.fid('rdv_a2'), 'intervention');
    v_err := 'AUCUNE';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.assert(v_err <> 'AUCUNE',
    'Le mécanicien ne change pas l''étape d''un rendez-vous non affecté');
end;
$$;

-- Notes techniques : autorisées sur son ordre, refusées ailleurs.
do $$
declare v_err text;
begin
  perform atelier_ajouter_note(pg_temp.fid('or_a_affecte'), 'RECETTE ACCES V1 — constat');
  perform pg_temp.assert(
    (select count(*) from atelier_mes_notes(pg_temp.fid('or_a_affecte'))) = 1,
    'Le mécanicien relit sa note');

  begin
    perform atelier_ajouter_note(pg_temp.fid('or_a_autre'), 'RECETTE ACCES V1 — interdit');
    v_err := 'AUCUNE';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.assert(v_err <> 'AUCUNE',
    'Le mécanicien n''écrit pas de note sur un ordre non affecté');
end;
$$;

-- Escalade par RPC : toutes refusées.
do $$
declare v_err text;
begin
  begin
    perform creer_jeton_devis(pg_temp.fid('devis_a'));
    v_err := 'AUCUNE';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.assert(v_err <> 'AUCUNE', 'Le mécanicien ne crée aucun lien de devis');

  begin
    perform creer_jeton_facture(pg_temp.fid('facture_a'));
    v_err := 'AUCUNE';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.assert(v_err <> 'AUCUNE', 'Le mécanicien ne crée aucun lien de facture');

  begin
    perform inviter_membre_garage(pg_temp.fid('garage_a'), pg_temp.fid('user_meca_a2'), 'dirigeant');
    v_err := 'AUCUNE';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.assert(v_err <> 'AUCUNE', 'Le mécanicien ne s''accorde aucun accès');

  perform pg_temp.assert(
    mon_mecanicien_id(pg_temp.fid('garage_b')) is null,
    'Le mécanicien A n''a aucune fiche sur le garage B');
end;
$$;

reset role;

-- =====================================================================
-- 6. Révocation : effet immédiat
-- =====================================================================

update garage_membres
  set actif = false, revoked_at = now()
  where id = pg_temp.fid('membre_meca');

select set_config('request.jwt.claims',
  json_build_object('sub', pg_temp.fid('user_meca_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare v_err text;
begin
  perform pg_temp.assert(
    mon_role_garage(pg_temp.fid('garage_a')) is null,
    'Un membre révoqué n''a plus aucun rôle');
  perform pg_temp.assert(
    (select count(*) from atelier_mes_ordres()) = 0,
    'Un mécanicien révoqué ne voit plus aucun ordre');

  begin
    perform atelier_marquer_ligne(pg_temp.fid('ligne_affectee'), 'prevu');
    v_err := 'AUCUNE';
  exception when others then v_err := sqlerrm;
  end;
  perform pg_temp.assert(v_err <> 'AUCUNE',
    'Un mécanicien révoqué n''écrit plus rien');
end;
$$;

reset role;

-- Idem pour l'accueil.
update garage_membres
  set actif = false, revoked_at = now()
  where id = pg_temp.fid('membre_accueil');

select set_config('request.jwt.claims',
  json_build_object('sub', pg_temp.fid('user_accueil_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  perform pg_temp.assert((select count(*) from clients) = 0,
    'Un accueil révoqué ne lit plus aucun client');
  perform pg_temp.assert((select count(*) from rendez_vous) = 0,
    'Un accueil révoqué ne lit plus aucun rendez-vous');
end;
$$;

reset role;

-- =====================================================================
-- 7. Le journal des accès a bien tout tracé
-- =====================================================================

do $$
begin
  perform pg_temp.assert(
    (select count(*) from garage_membres_historique
      where garage_id = pg_temp.fid('garage_a') and action = 'ajout') = 2,
    'Les deux adhésions ont été journalisées à la création');
  perform pg_temp.assert(
    (select count(*) from garage_membres_historique
      where garage_id = pg_temp.fid('garage_a') and action = 'revocation') = 2,
    'Les deux révocations ont été journalisées');
end;
$$;

-- =====================================================================
-- 8. Étanchéité vue du garage B
-- =====================================================================

select set_config('request.jwt.claims',
  json_build_object('sub', pg_temp.fid('user_prop_b')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  perform pg_temp.assert(current_garage_id() = pg_temp.fid('garage_b'),
    'Le propriétaire B résout son garage');
  perform pg_temp.assert(
    (select count(*) from clients where garage_id = pg_temp.fid('garage_a')) = 0,
    'Le garage B ne voit aucun client du garage A');
  perform pg_temp.assert(
    (select count(*) from ordres_reparation where garage_id = pg_temp.fid('garage_a')) = 0,
    'Le garage B ne voit aucun ordre du garage A');
  perform pg_temp.assert(
    (select count(*) from garage_membres where garage_id = pg_temp.fid('garage_a')) = 0,
    'Le garage B ne voit aucun membre du garage A');
end;
$$;

reset role;

-- =====================================================================
-- 9. Un dirigeant nommé obtient la parité avec le propriétaire
-- =====================================================================

insert into garage_membres (garage_id, user_id, role)
values (pg_temp.fid('garage_a'), pg_temp.fid('user_meca_a2'), 'dirigeant');

select set_config('request.jwt.claims',
  json_build_object('sub', pg_temp.fid('user_meca_a2')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  perform pg_temp.assert(current_garage_id() = pg_temp.fid('garage_a'),
    'Un dirigeant nommé résout le garage');
  perform pg_temp.assert(
    (select count(*) from factures where garage_id = pg_temp.fid('garage_a')) = 1,
    'Un dirigeant lit les factures');
  perform pg_temp.assert(
    (select count(*) from lister_membres_garage(pg_temp.fid('garage_a'))) = 3,
    'Un dirigeant liste les membres');
end;
$$;

reset role;

rollback;

-- =====================================================================
-- 10. Vérification post-rollback (hors transaction, lecture seule)
-- =====================================================================

do $$
declare
  v_residus text[] := array[]::text[];
  v_n int;
begin
  select count(*) into v_n from auth.users where email like 'recette-acces-v1-%@example.invalid';
  if v_n > 0 then v_residus := v_residus || ('auth.users : ' || v_n); end if;

  select count(*) into v_n from public.garages where nom_garage like 'RECETTE ACCES V1%';
  if v_n > 0 then v_residus := v_residus || ('garages : ' || v_n); end if;

  select count(*) into v_n from public.clients where nom like 'RECETTE ACCES V1%';
  if v_n > 0 then v_residus := v_residus || ('clients : ' || v_n); end if;

  select count(*) into v_n from public.vehicules where marque = 'MarqueTestAccesV1';
  if v_n > 0 then v_residus := v_residus || ('vehicules : ' || v_n); end if;

  select count(*) into v_n from public.mecaniciens where nom like 'RECETTE ACCES V1%';
  if v_n > 0 then v_residus := v_residus || ('mecaniciens : ' || v_n); end if;

  select count(*) into v_n from public.rendez_vous where notes = 'RECETTE ACCES V1';
  if v_n > 0 then v_residus := v_residus || ('rendez_vous : ' || v_n); end if;

  select count(*) into v_n from public.devis where message_garage = 'RECETTE ACCES V1';
  if v_n > 0 then v_residus := v_residus || ('devis : ' || v_n); end if;

  select count(*) into v_n from public.factures where motif = 'RECETTE ACCES V1';
  if v_n > 0 then v_residus := v_residus || ('factures : ' || v_n); end if;

  select count(*) into v_n from public.ordres_reparation_notes where note like 'RECETTE ACCES V1%';
  if v_n > 0 then v_residus := v_residus || ('ordres_reparation_notes : ' || v_n); end if;

  if array_length(v_residus, 1) > 0 then
    raise exception 'NETTOYAGE ÉCHOUÉ après rollback — fixtures encore présentes : %',
      array_to_string(v_residus, '; ');
  end if;

  raise notice 'ACCES SALARIES V1 : banc passé, aucune fixture résiduelle.';
end;
$$;
