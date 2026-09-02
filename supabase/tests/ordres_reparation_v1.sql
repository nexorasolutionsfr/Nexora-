-- Ordre de Réparation V1 — banc de test AUTONOME et RÉVERSIBLE.
--
-- Convention reprise à l'identique de
-- supabase/tests/liens_publics_atelier_devis_facture.sql (réécriture du
-- 2026-09-01, seule convention de ce dépôt qui soit transactionnelle et
-- totalement auto-suffisante — l'autre fichier de ce dossier,
-- revenue_recovery_foundations.sql, dépend de placeholders <GARAGE_A> etc.
-- à remplacer par des id réels préexistants : incompatible avec
-- l'exigence « aucune donnée réelle, aucune dépendance à des données
-- existantes » de cette mission, donc non repris ici).
--
-- Ce fichier N'EST PAS une migration : il n'est jamais appliqué
-- automatiquement, et n'a PAS été exécuté dans cette session (interdiction
-- explicite de toute écriture ou requête distante pour cette session —
-- préparation locale uniquement). Il présuppose que
-- supabase/migrations/20260902000100_ordres_reparation_v1.sql a déjà été
-- appliquée sur l'environnement où on l'exécute (jamais Production —
-- l'environnement de test isolé identifié pour ce projet). SQL PostgreSQL
-- standard exécutable tel quel depuis l'éditeur SQL Supabase (aucune
-- commande psql : pas de `\gset`, pas de `\set`) — tous les identifiants
-- dont ce script a besoin plus tard (y compris ceux de lignes insérées)
-- sont donc prédéterminés dans `_fixture_ids` dès la section 0, jamais
-- capturés depuis un `RETURNING`.
--
-- MÉTHODE (identique à liens_publics_atelier_devis_facture.sql) :
--   - une table temporaire `_fixture_ids` (clé texte -> UUID), `on commit
--     drop` ;
--   - une fonction `pg_temp.fid(cle)` (SECURITY DEFINER, accès à la table
--     temporaire malgré les changements de rôle), `search_path = ''`
--     fermé, EXECUTE révoqué de PUBLIC puis regrant explicite et minimal
--     au seul rôle qui l'appelle réellement dans ce script (authenticated
--     — aucun scénario anon : l'OR est un objet strictement interne au
--     dashboard garage, sans lien public, voir contrat D) ;
--   - une fonction `pg_temp.assert(condition, message)` (pas de SECURITY
--     DEFINER : ne touche aucune table), lève `ASSERTION FAILED: <message>`
--     si la condition est fausse ;
--   - pour les scénarios dont l'attendu est une exception Postgres, un
--     bloc `do $$ begin begin ... exception when others then ... end;
--     end; $$;` capture l'exception réellement levée (le bloc interne
--     `begin ... exception` est un savepoint implicite PL/pgSQL) ; si
--     l'appel réussit alors qu'il aurait dû échouer, le bloc lève lui-même
--     `ASSERTION FAILED` (jamais avalée par erreur : re-levée
--     explicitement) ;
--   - deux contextes authentifiés distincts simulés via
--     `set_config('request.jwt.claims', ...)` + `set local role
--     authenticated`, exactement le motif déjà utilisé dans ce dépôt ;
--   - `reset role;` après chaque bloc impersonné.
--
-- Utilisateurs synthétiques dans auth.users : INSERT SQL direct (jamais
-- l'API Auth, aucun email envoyé), adresses sous `example.invalid`
-- (RFC 2606, garanti ne jamais correspondre à un domaine réel), UUID
-- synthétique embarqué dans l'adresse pour l'unicité.
-- `garages.owner_user_id` référence auth.users(id) : la création de ces
-- utilisateurs synthétiques est indispensable, pas une simplification de
-- confort.
--
-- FIXTURES NEUVES UNIQUEMENT : aucune ligne préexistante n'est lue,
-- modifiée ni supposée présente. Tout ce dont ce script a besoin — deux
-- garages, deux utilisateurs propriétaires, clients, véhicules,
-- prestations, mécaniciens, rendez-vous, devis — est créé par ce script
-- lui-même, dans la transaction ouverte par le premier `begin;`.
--
-- RÉVERSIBILITÉ : tout le script se déroule DANS la transaction ouverte
-- par le premier `begin;` ci-dessous, jamais validée. Le `rollback;`
-- (avant-dernier bloc du fichier) défait tout d'un bloc. Un bloc PL/pgSQL
-- exécuté juste APRÈS ce `rollback;` (donc hors transaction, en lecture
-- seule) VÉRIFIE réellement l'absence de résidu par comptage sur des
-- marqueurs déterministes propres à ce fichier (distincts des marqueurs
-- "RECETTE SYNTHÉTIQUE"/"MarqueTest" utilisés par
-- liens_publics_atelier_devis_facture.sql : ici "RECETTE OR V1" /
-- "MarqueTestORV1", pour qu'aucune confusion ne soit possible si les deux
-- fichiers étaient un jour rejoués dans la même session) et lève une
-- exception bloquante si le moindre résidu subsiste.
--
-- ordres_reparation / ordres_reparation_lignes / ordres_reparation_historique
-- n'ont aucune colonne texte propice à un marqueur déterministe : la
-- vérification post-rollback porte donc sur leurs 7 tables parentes
-- (garages, clients, vehicules, prestations, mecaniciens, rendez_vous,
-- devis) + auth.users. C'est une preuve suffisante et non une simple
-- supposition : garage_id sur les trois tables OR référence
-- garages(id) — un OR (ou une ligne, ou une entrée d'historique) ne peut
-- structurellement pas survivre à la disparition de son garage.

begin;

-- =====================================================================
-- 0. Échafaudage : identifiants synthétiques + assertions bloquantes
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
  ('user_a', gen_random_uuid()),
  ('user_b', gen_random_uuid()),
  ('garage_a', gen_random_uuid()),
  ('garage_b', gen_random_uuid()),
  ('client_a', gen_random_uuid()),
  ('client_b', gen_random_uuid()),
  ('vehicule_a', gen_random_uuid()),
  ('vehicule_b', gen_random_uuid()),
  ('prestation_a', gen_random_uuid()),
  ('prestation_b', gen_random_uuid()),
  ('mecanicien_a', gen_random_uuid()),
  ('mecanicien_b', gen_random_uuid()),
  ('rdv_a1', gen_random_uuid()),
  ('rdv_a2', gen_random_uuid()),
  ('rdv_b', gen_random_uuid()),
  ('devis_a_accepte', gen_random_uuid()),
  ('devis_a_accepte2', gen_random_uuid()),
  ('devis_a_en_attente', gen_random_uuid()),
  ('devis_b', gen_random_uuid()),
  ('or_a1', gen_random_uuid()),
  ('or_a2', gen_random_uuid()),
  ('ligne_mo_a1', gen_random_uuid()),
  ('ligne_piece_a1', gen_random_uuid()),
  ('ligne_a2', gen_random_uuid());

-- =====================================================================
-- 1. Utilisateurs synthétiques (rôle opérateur — superutilisateur de
--    l'éditeur SQL, seul capable d'écrire directement dans auth.users)
-- =====================================================================

insert into auth.users
  (id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (pg_temp.fid('user_a'), 'authenticated', 'authenticated',
   'recette-or-v1-a-' || pg_temp.fid('user_a')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture', now(),
   '{}'::jsonb, '{}'::jsonb, now(), now()),
  (pg_temp.fid('user_b'), 'authenticated', 'authenticated',
   'recette-or-v1-b-' || pg_temp.fid('user_b')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture', now(),
   '{}'::jsonb, '{}'::jsonb, now(), now());

-- =====================================================================
-- 2. Fixtures métier synthétiques (rôle opérateur, contourne RLS comme
--    tout superutilisateur — comportement normal, pas une faille).
--    Marqueurs déterministes pour la vérification post-rollback :
--    nom_garage/nom "RECETTE OR V1 ...", marque "MarqueTestORV1",
--    rendez_vous.notes = "RECETTE OR V1", devis.message_garage =
--    "RECETTE OR V1".
-- =====================================================================

insert into garages (id, owner_user_id, nom_garage) values
  (pg_temp.fid('garage_a'), pg_temp.fid('user_a'), 'RECETTE OR V1 — GARAGE A'),
  (pg_temp.fid('garage_b'), pg_temp.fid('user_b'), 'RECETTE OR V1 — GARAGE B');

insert into clients (id, garage_id, nom) values
  (pg_temp.fid('client_a'), pg_temp.fid('garage_a'), 'RECETTE OR V1 — CLIENT A'),
  (pg_temp.fid('client_b'), pg_temp.fid('garage_b'), 'RECETTE OR V1 — CLIENT B');

insert into vehicules (id, garage_id, client_id, marque, modele) values
  (pg_temp.fid('vehicule_a'), pg_temp.fid('garage_a'), pg_temp.fid('client_a'), 'MarqueTestORV1', 'ModeleTest-A'),
  (pg_temp.fid('vehicule_b'), pg_temp.fid('garage_b'), pg_temp.fid('client_b'), 'MarqueTestORV1', 'ModeleTest-B');

insert into prestations (id, garage_id, nom, duree_minutes) values
  (pg_temp.fid('prestation_a'), pg_temp.fid('garage_a'), 'RECETTE OR V1 — PRESTATION A', 30),
  (pg_temp.fid('prestation_b'), pg_temp.fid('garage_b'), 'RECETTE OR V1 — PRESTATION B', 30);

insert into mecaniciens (id, garage_id, nom) values
  (pg_temp.fid('mecanicien_a'), pg_temp.fid('garage_a'), 'RECETTE OR V1 — MECANICIEN A'),
  (pg_temp.fid('mecanicien_b'), pg_temp.fid('garage_b'), 'RECETTE OR V1 — MECANICIEN B');

-- rendez_vous.demande_id est NOT NULL mais sans contrainte de clé
-- étrangère (déjà vérifié en lecture seule dans une session précédente) :
-- un UUID synthétique suffit.
insert into rendez_vous (id, garage_id, client_id, vehicule_id, prestation_id, demande_id, date_debut, date_fin, notes) values
  (pg_temp.fid('rdv_a1'), pg_temp.fid('garage_a'), pg_temp.fid('client_a'), pg_temp.fid('vehicule_a'), pg_temp.fid('prestation_a'), gen_random_uuid(), now() + interval '1 day', now() + interval '1 day 1 hour', 'RECETTE OR V1'),
  (pg_temp.fid('rdv_a2'), pg_temp.fid('garage_a'), pg_temp.fid('client_a'), pg_temp.fid('vehicule_a'), pg_temp.fid('prestation_a'), gen_random_uuid(), now() + interval '2 day', now() + interval '2 day 1 hour', 'RECETTE OR V1'),
  (pg_temp.fid('rdv_b'), pg_temp.fid('garage_b'), pg_temp.fid('client_b'), pg_temp.fid('vehicule_b'), pg_temp.fid('prestation_b'), gen_random_uuid(), now() + interval '1 day', now() + interval '1 day 1 hour', 'RECETTE OR V1');

-- Quatre devis : deux acceptés pour garage A (le second sert au scénario
-- d'annulation après dérive, section 14), un en attente pour garage A, un
-- accepté pour garage B (isolation inter-garage, section 7).
insert into devis (id, garage_id, client_id, vehicule_id, prestation_id, montant_ht, montant_ttc, statut, message_garage) values
  (pg_temp.fid('devis_a_accepte'), pg_temp.fid('garage_a'), pg_temp.fid('client_a'), pg_temp.fid('vehicule_a'), pg_temp.fid('prestation_a'), 100, 120, 'accepte', 'RECETTE OR V1'),
  (pg_temp.fid('devis_a_accepte2'), pg_temp.fid('garage_a'), pg_temp.fid('client_a'), pg_temp.fid('vehicule_a'), pg_temp.fid('prestation_a'), 100, 120, 'accepte', 'RECETTE OR V1'),
  (pg_temp.fid('devis_a_en_attente'), pg_temp.fid('garage_a'), pg_temp.fid('client_a'), pg_temp.fid('vehicule_a'), pg_temp.fid('prestation_a'), 100, 120, 'en_attente', 'RECETTE OR V1'),
  (pg_temp.fid('devis_b'), pg_temp.fid('garage_b'), pg_temp.fid('client_b'), pg_temp.fid('vehicule_b'), pg_temp.fid('prestation_b'), 100, 120, 'accepte', 'RECETTE OR V1');

-- =====================================================================
-- 3. Création OR autorisée depuis un RDV cohérent + historique 'creation'
--    automatique + created_by imposé côté base (l'appel tente
--    explicitement de se faire passer pour user_b : la base doit
--    l'ignorer et retenir l'auteur réel de la session, user_a).
-- =====================================================================

select set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid('user_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

insert into ordres_reparation (id, garage_id, rendez_vous_id, vehicule_id, client_id, devis_id, created_by)
values (pg_temp.fid('or_a1'), pg_temp.fid('garage_a'), pg_temp.fid('rdv_a1'), pg_temp.fid('vehicule_a'), pg_temp.fid('client_a'), pg_temp.fid('devis_a_accepte'), pg_temp.fid('user_b'));

select pg_temp.assert(
  (select created_by from public.ordres_reparation where id = pg_temp.fid('or_a1')) = pg_temp.fid('user_a'),
  'created_by doit etre impose a auth.uid() (user_a), jamais a la valeur fournie par le client (user_b)'
);
select pg_temp.assert(
  (select statut from public.ordres_reparation where id = pg_temp.fid('or_a1')) = 'brouillon',
  'un OR nouvellement cree doit etre au statut brouillon par defaut'
);
select pg_temp.assert(
  (select count(*) from public.ordres_reparation_historique
     where ordre_reparation_id = pg_temp.fid('or_a1') and action = 'creation') = 1,
  'la creation d''un OR doit generer automatiquement exactement un evenement historique action=creation'
);

-- =====================================================================
-- 4. Lignes : ajout, modification, suppression — et absence d'événement
--    historique détaillé pour ces opérations de ligne (portée V1, contrat
--    C.3).
-- =====================================================================

insert into ordres_reparation_lignes (id, ordre_reparation_id, garage_id, type, libelle, quantite, duree_minutes)
values (pg_temp.fid('ligne_mo_a1'), pg_temp.fid('or_a1'), pg_temp.fid('garage_a'), 'main_oeuvre', 'RECETTE OR V1 — Diagnostic', 1, 30);

insert into ordres_reparation_lignes (id, ordre_reparation_id, garage_id, type, libelle, quantite, prix_unitaire_ht)
values (pg_temp.fid('ligne_piece_a1'), pg_temp.fid('or_a1'), pg_temp.fid('garage_a'), 'piece', 'RECETTE OR V1 — Filtre', 2, 15.5);

select pg_temp.assert(
  (select count(*) from public.ordres_reparation_lignes where ordre_reparation_id = pg_temp.fid('or_a1')) = 2,
  'deux lignes doivent etre visibles apres ajout'
);

update ordres_reparation_lignes set quantite = 3, prix_unitaire_ht = 12 where id = pg_temp.fid('ligne_piece_a1');
select pg_temp.assert(
  (select quantite from public.ordres_reparation_lignes where id = pg_temp.fid('ligne_piece_a1')) = 3
  and (select prix_unitaire_ht from public.ordres_reparation_lignes where id = pg_temp.fid('ligne_piece_a1')) = 12,
  'la modification de la ligne piece doit etre persistee'
);

delete from ordres_reparation_lignes where id = pg_temp.fid('ligne_mo_a1');
select pg_temp.assert(
  (select count(*) from public.ordres_reparation_lignes where ordre_reparation_id = pg_temp.fid('or_a1')) = 1,
  'apres suppression de la ligne main_oeuvre, une seule ligne doit rester'
);

select pg_temp.assert(
  (select count(*) from public.ordres_reparation_historique where ordre_reparation_id = pg_temp.fid('or_a1')) = 1,
  'ajout/modification/suppression de lignes ne doit generer AUCUN evenement historique detaille — seul l''evenement creation initial doit exister'
);

-- 4b. Ligne — prestation d'un autre garage refusée.
do $$
begin
  begin
    insert into public.ordres_reparation_lignes (id, ordre_reparation_id, garage_id, type, libelle, quantite, duree_minutes, prestation_id)
    values (gen_random_uuid(), pg_temp.fid('or_a1'), pg_temp.fid('garage_a'), 'main_oeuvre', 'tentative prestation hors garage', 1, 15, pg_temp.fid('prestation_b'));
    perform pg_temp.assert(false, 'une ligne referencant une prestation d''un autre garage aurait du etre refusee');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlerrm ilike '%prestation hors garage%', 'exception inattendue pour prestation hors garage : ' || sqlerrm);
  end;
end;
$$;

-- =====================================================================
-- 5. Unicité : un second OR sur le même rendez-vous est refusé.
-- =====================================================================

do $$
begin
  begin
    insert into public.ordres_reparation (id, garage_id, rendez_vous_id, vehicule_id, client_id)
    values (gen_random_uuid(), pg_temp.fid('garage_a'), pg_temp.fid('rdv_a1'), pg_temp.fid('vehicule_a'), pg_temp.fid('client_a'));
    perform pg_temp.assert(false, 'un second OR sur le rendez-vous rdv_a1 aurait du etre refuse (contrainte d''unicite)');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlstate = '23505', 'un second OR sur le meme RDV doit echouer par violation de contrainte unique (23505), recu : ' || sqlstate);
  end;
end;
$$;

-- =====================================================================
-- 6. Devis non accepté refusé à la création d'un OR.
-- =====================================================================

do $$
begin
  begin
    insert into public.ordres_reparation (id, garage_id, rendez_vous_id, vehicule_id, client_id, devis_id)
    values (gen_random_uuid(), pg_temp.fid('garage_a'), pg_temp.fid('rdv_a2'), pg_temp.fid('vehicule_a'), pg_temp.fid('client_a'), pg_temp.fid('devis_a_en_attente'));
    perform pg_temp.assert(false, 'un OR rattache a un devis non accepte aurait du etre refuse');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlerrm ilike '%doit etre accepte%', 'exception inattendue pour devis non accepte : ' || sqlerrm);
  end;
end;
$$;

-- =====================================================================
-- 7. Intégrité inter-garage à la création d'un OR : rendez-vous, devis et
--    mécanicien hors garage refusés ; incohérence client/rendez-vous
--    refusée même au sein du même garage.
-- =====================================================================

-- 7a. Rendez-vous d'un autre garage (rdv_b, garage B) : invisible via RLS
-- sous user_a, donc "introuvable ou hors garage".
do $$
begin
  begin
    insert into public.ordres_reparation (id, garage_id, rendez_vous_id, vehicule_id, client_id)
    values (gen_random_uuid(), pg_temp.fid('garage_a'), pg_temp.fid('rdv_b'), pg_temp.fid('vehicule_a'), pg_temp.fid('client_a'));
    perform pg_temp.assert(false, 'un OR sur le RDV d''un autre garage aurait du etre refuse');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlerrm ilike '%rendez_vous introuvable%' or sqlerrm ilike '%rendez_vous ne correspond pas%', 'exception inattendue pour RDV hors garage : ' || sqlerrm);
  end;
end;
$$;

-- 7b. Devis d'un autre garage (devis_b, garage B).
do $$
begin
  begin
    insert into public.ordres_reparation (id, garage_id, rendez_vous_id, vehicule_id, client_id, devis_id)
    values (gen_random_uuid(), pg_temp.fid('garage_a'), pg_temp.fid('rdv_a2'), pg_temp.fid('vehicule_a'), pg_temp.fid('client_a'), pg_temp.fid('devis_b'));
    perform pg_temp.assert(false, 'un OR rattache au devis d''un autre garage aurait du etre refuse');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlerrm ilike '%devis introuvable%' or sqlerrm ilike '%devis ne correspond pas%', 'exception inattendue pour devis hors garage : ' || sqlerrm);
  end;
end;
$$;

-- 7c. Mécanicien d'un autre garage (mecanicien_b, garage B).
do $$
begin
  begin
    insert into public.ordres_reparation (id, garage_id, rendez_vous_id, vehicule_id, client_id, mecanicien_id)
    values (gen_random_uuid(), pg_temp.fid('garage_a'), pg_temp.fid('rdv_a2'), pg_temp.fid('vehicule_a'), pg_temp.fid('client_a'), pg_temp.fid('mecanicien_b'));
    perform pg_temp.assert(false, 'un OR avec mecanicien d''un autre garage aurait du etre refuse');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlerrm ilike '%mecanicien hors garage%', 'exception inattendue pour mecanicien hors garage : ' || sqlerrm);
  end;
end;
$$;

-- 7d. Rendez-vous et garage cohérents, mais client_id incohérent avec le
-- client réel du rendez-vous choisi (client_b n'appartient pas à rdv_a2,
-- même s'il existe réellement en base) — teste la comparaison explicite,
-- distincte de la simple invisibilité RLS.
do $$
begin
  begin
    insert into public.ordres_reparation (id, garage_id, rendez_vous_id, vehicule_id, client_id)
    values (gen_random_uuid(), pg_temp.fid('garage_a'), pg_temp.fid('rdv_a2'), pg_temp.fid('vehicule_a'), pg_temp.fid('client_b'));
    perform pg_temp.assert(false, 'un client incoherent avec le rendez-vous choisi aurait du etre refuse');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlerrm ilike '%ne correspond pas au garage, client ou vehicule%', 'exception inattendue pour client incoherent : ' || sqlerrm);
  end;
end;
$$;

-- =====================================================================
-- 8. Contraintes de lignes : quantité, prix, durée.
-- =====================================================================

-- 8a. quantite <= 0
do $$
begin
  begin
    insert into public.ordres_reparation_lignes (id, ordre_reparation_id, garage_id, type, libelle, quantite)
    values (gen_random_uuid(), pg_temp.fid('or_a1'), pg_temp.fid('garage_a'), 'piece', 'quantite invalide', 0);
    perform pg_temp.assert(false, 'une ligne avec quantite = 0 aurait du etre refusee');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlstate = '23514', 'quantite <= 0 doit violer une contrainte CHECK (23514), recu : ' || sqlstate);
  end;
end;
$$;

-- 8b. prix_unitaire_ht négatif
do $$
begin
  begin
    insert into public.ordres_reparation_lignes (id, ordre_reparation_id, garage_id, type, libelle, quantite, prix_unitaire_ht)
    values (gen_random_uuid(), pg_temp.fid('or_a1'), pg_temp.fid('garage_a'), 'piece', 'prix invalide', 1, -1);
    perform pg_temp.assert(false, 'une ligne avec prix_unitaire_ht negatif aurait du etre refusee');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlstate = '23514', 'prix_unitaire_ht negatif doit violer une contrainte CHECK (23514), recu : ' || sqlstate);
  end;
end;
$$;

-- 8c. duree_minutes = 0 pour type = main_oeuvre (doit etre > 0 ou NULL)
do $$
begin
  begin
    insert into public.ordres_reparation_lignes (id, ordre_reparation_id, garage_id, type, libelle, quantite, duree_minutes)
    values (gen_random_uuid(), pg_temp.fid('or_a1'), pg_temp.fid('garage_a'), 'main_oeuvre', 'duree invalide', 1, 0);
    perform pg_temp.assert(false, 'une ligne main_oeuvre avec duree_minutes = 0 aurait du etre refusee');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlstate = '23514', 'duree_minutes = 0 sur main_oeuvre doit violer une contrainte CHECK (23514), recu : ' || sqlstate);
  end;
end;
$$;

-- 8d. duree_minutes renseignée pour type = piece (doit rester NULL)
do $$
begin
  begin
    insert into public.ordres_reparation_lignes (id, ordre_reparation_id, garage_id, type, libelle, quantite, duree_minutes)
    values (gen_random_uuid(), pg_temp.fid('or_a1'), pg_temp.fid('garage_a'), 'piece', 'duree sur piece', 1, 10);
    perform pg_temp.assert(false, 'une ligne piece avec duree_minutes renseignee aurait du etre refusee');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlstate = '23514', 'duree_minutes renseignee sur piece doit violer une contrainte CHECK (23514), recu : ' || sqlstate);
  end;
end;
$$;

-- =====================================================================
-- 9. Modification des champs figés à la création refusée.
-- =====================================================================

do $$
begin
  begin
    update public.ordres_reparation set rendez_vous_id = pg_temp.fid('rdv_a2') where id = pg_temp.fid('or_a1');
    perform pg_temp.assert(false, 'la modification de rendez_vous_id apres creation aurait du etre refusee');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlerrm ilike '%figes a la creation%', 'exception inattendue pour rendez_vous_id modifie : ' || sqlerrm);
  end;
end;
$$;

do $$
begin
  begin
    update public.ordres_reparation set vehicule_id = pg_temp.fid('vehicule_b') where id = pg_temp.fid('or_a1');
    perform pg_temp.assert(false, 'la modification de vehicule_id apres creation aurait du etre refusee');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlerrm ilike '%figes a la creation%', 'exception inattendue pour vehicule_id modifie : ' || sqlerrm);
  end;
end;
$$;

do $$
begin
  begin
    update public.ordres_reparation set client_id = pg_temp.fid('client_b') where id = pg_temp.fid('or_a1');
    perform pg_temp.assert(false, 'la modification de client_id apres creation aurait du etre refusee');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlerrm ilike '%figes a la creation%', 'exception inattendue pour client_id modifie : ' || sqlerrm);
  end;
end;
$$;

do $$
begin
  begin
    update public.ordres_reparation set created_by = pg_temp.fid('user_b') where id = pg_temp.fid('or_a1');
    perform pg_temp.assert(false, 'la modification de created_by apres creation aurait du etre refusee');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlerrm ilike '%figes a la creation%', 'exception inattendue pour created_by modifie : ' || sqlerrm);
  end;
end;
$$;

select pg_temp.assert(
  (select rendez_vous_id from public.ordres_reparation where id = pg_temp.fid('or_a1')) = pg_temp.fid('rdv_a1')
  and (select client_id from public.ordres_reparation where id = pg_temp.fid('or_a1')) = pg_temp.fid('client_a')
  and (select created_by from public.ordres_reparation where id = pg_temp.fid('or_a1')) = pg_temp.fid('user_a'),
  'or_a1 doit rester totalement inchange apres les quatre tentatives de modification refusees'
);

reset role;

-- =====================================================================
-- 10. Accès croisé garage A/B refusé, en lecture et en écriture, sous
--     user_b (propriétaire de garage_b) sur or_a1 (garage_a).
-- =====================================================================

select set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid('user_b')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

select pg_temp.assert(
  (select count(*) from public.ordres_reparation where id = pg_temp.fid('or_a1')) = 0,
  'user_b ne doit voir aucune ligne pour or_a1 (garage A) — lecture croisee refusee par RLS'
);

do $$
declare
  v_rows bigint;
begin
  update public.ordres_reparation set notes_internes = 'tentative croisee garage B' where id = pg_temp.fid('or_a1');
  get diagnostics v_rows = row_count;
  perform pg_temp.assert(v_rows = 0, 'l''UPDATE de or_a1 par user_b doit affecter 0 ligne (RLS) — recu ' || v_rows || ' ligne(s)');
end;
$$;

-- Tentative d'ajouter une ligne à or_a1 depuis le contexte garage B, avec
-- un garage_id valide pour user_b (passe l'ACL/RLS de la table lignes)
-- mais un ordre_reparation_id appartenant à garage_a — isole le test sur
-- la vérification d'intégrité du trigger, indépendamment du WITH CHECK
-- RLS de la table elle-même.
do $$
begin
  begin
    insert into public.ordres_reparation_lignes (id, ordre_reparation_id, garage_id, type, libelle, quantite)
    values (gen_random_uuid(), pg_temp.fid('or_a1'), pg_temp.fid('garage_b'), 'piece', 'tentative croisee', 1);
    perform pg_temp.assert(false, 'une ligne rattachee a un OR d''un autre garage aurait du etre refusee');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlerrm ilike '%ordre de reparation introuvable%', 'exception inattendue pour ligne croisee garage : ' || sqlerrm);
  end;
end;
$$;

reset role;

-- =====================================================================
-- 11. Historique : INSERT / UPDATE / DELETE directs refusés (aucun droit
--     ACL, sous le propriétaire lui-même — user_a).
-- =====================================================================

select set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid('user_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  begin
    insert into public.ordres_reparation_historique (id, ordre_reparation_id, garage_id, action)
    values (gen_random_uuid(), pg_temp.fid('or_a1'), pg_temp.fid('garage_a'), 'creation');
    perform pg_temp.assert(false, 'un INSERT direct dans ordres_reparation_historique aurait du etre refuse');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlstate = '42501', 'INSERT direct dans l''historique doit echouer en 42501 (aucun droit ACL), recu : ' || sqlstate);
  end;
end;
$$;

do $$
begin
  begin
    update public.ordres_reparation_historique set motif = 'falsification' where ordre_reparation_id = pg_temp.fid('or_a1');
    perform pg_temp.assert(false, 'un UPDATE direct de ordres_reparation_historique aurait du etre refuse');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlstate = '42501', 'UPDATE direct de l''historique doit echouer en 42501, recu : ' || sqlstate);
  end;
end;
$$;

do $$
begin
  begin
    delete from public.ordres_reparation_historique where ordre_reparation_id = pg_temp.fid('or_a1');
    perform pg_temp.assert(false, 'un DELETE direct dans ordres_reparation_historique aurait du etre refuse');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlstate = '42501', 'DELETE direct dans l''historique doit echouer en 42501, recu : ' || sqlstate);
  end;
end;
$$;

-- =====================================================================
-- 12. DELETE d'un OR refusé, même par son propriétaire (user_a) — aucune
--     suppression n'est prévue en V1, seule l'annulation par statut.
-- =====================================================================

do $$
begin
  begin
    delete from public.ordres_reparation where id = pg_temp.fid('or_a1');
    perform pg_temp.assert(false, 'un DELETE de or_a1 par son propre proprietaire aurait du etre refuse');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlstate = '42501', 'DELETE d''un OR doit echouer en 42501 (aucun droit ACL), recu : ' || sqlstate);
  end;
end;
$$;

reset role;

-- =====================================================================
-- 13. Absence du droit TRUNCATE — vérification par métadonnée de
--     privilège uniquement, aucun TRUNCATE jamais exécuté.
-- =====================================================================

select pg_temp.assert(not has_table_privilege('authenticated', 'public.ordres_reparation', 'TRUNCATE'), 'authenticated ne doit pas avoir TRUNCATE sur ordres_reparation');
select pg_temp.assert(not has_table_privilege('service_role', 'public.ordres_reparation', 'TRUNCATE'), 'service_role ne doit pas avoir TRUNCATE sur ordres_reparation');
select pg_temp.assert(not has_table_privilege('authenticated', 'public.ordres_reparation_lignes', 'TRUNCATE'), 'authenticated ne doit pas avoir TRUNCATE sur ordres_reparation_lignes');
select pg_temp.assert(not has_table_privilege('service_role', 'public.ordres_reparation_lignes', 'TRUNCATE'), 'service_role ne doit pas avoir TRUNCATE sur ordres_reparation_lignes');
select pg_temp.assert(not has_table_privilege('authenticated', 'public.ordres_reparation_historique', 'TRUNCATE'), 'authenticated ne doit pas avoir TRUNCATE sur ordres_reparation_historique');
select pg_temp.assert(not has_table_privilege('service_role', 'public.ordres_reparation_historique', 'TRUNCATE'), 'service_role ne doit pas avoir TRUNCATE sur ordres_reparation_historique');

-- =====================================================================
-- 13b. Absence du droit EXECUTE sur les quatre fonctions trigger — pour
--     PUBLIC, anon, authenticated et service_role. Vérification par
--     métadonnée de privilège uniquement (has_function_privilege) : les
--     fonctions trigger ne sont jamais appelées directement ici, ce test
--     ne fait que lire l'ACL. Corrige l'écart constaté après application
--     de 20260902000100 sur Test : ce projet accorde EXECUTE par défaut
--     directement aux rôles nommés, pas seulement à PUBLIC — voir
--     20260902000200_fermer_execute_fonctions_ordre_reparation.sql.
-- =====================================================================

select pg_temp.assert(not has_function_privilege('public', 'public.ordres_reparation_set_updated_at()', 'EXECUTE'), 'PUBLIC ne doit pas avoir EXECUTE sur ordres_reparation_set_updated_at');
select pg_temp.assert(not has_function_privilege('anon', 'public.ordres_reparation_set_updated_at()', 'EXECUTE'), 'anon ne doit pas avoir EXECUTE sur ordres_reparation_set_updated_at');
select pg_temp.assert(not has_function_privilege('authenticated', 'public.ordres_reparation_set_updated_at()', 'EXECUTE'), 'authenticated ne doit pas avoir EXECUTE sur ordres_reparation_set_updated_at');
select pg_temp.assert(not has_function_privilege('service_role', 'public.ordres_reparation_set_updated_at()', 'EXECUTE'), 'service_role ne doit pas avoir EXECUTE sur ordres_reparation_set_updated_at');

select pg_temp.assert(not has_function_privilege('public', 'public.ordres_reparation_check_integrite()', 'EXECUTE'), 'PUBLIC ne doit pas avoir EXECUTE sur ordres_reparation_check_integrite');
select pg_temp.assert(not has_function_privilege('anon', 'public.ordres_reparation_check_integrite()', 'EXECUTE'), 'anon ne doit pas avoir EXECUTE sur ordres_reparation_check_integrite');
select pg_temp.assert(not has_function_privilege('authenticated', 'public.ordres_reparation_check_integrite()', 'EXECUTE'), 'authenticated ne doit pas avoir EXECUTE sur ordres_reparation_check_integrite');
select pg_temp.assert(not has_function_privilege('service_role', 'public.ordres_reparation_check_integrite()', 'EXECUTE'), 'service_role ne doit pas avoir EXECUTE sur ordres_reparation_check_integrite');

select pg_temp.assert(not has_function_privilege('public', 'public.ordres_reparation_lignes_check_integrite()', 'EXECUTE'), 'PUBLIC ne doit pas avoir EXECUTE sur ordres_reparation_lignes_check_integrite');
select pg_temp.assert(not has_function_privilege('anon', 'public.ordres_reparation_lignes_check_integrite()', 'EXECUTE'), 'anon ne doit pas avoir EXECUTE sur ordres_reparation_lignes_check_integrite');
select pg_temp.assert(not has_function_privilege('authenticated', 'public.ordres_reparation_lignes_check_integrite()', 'EXECUTE'), 'authenticated ne doit pas avoir EXECUTE sur ordres_reparation_lignes_check_integrite');
select pg_temp.assert(not has_function_privilege('service_role', 'public.ordres_reparation_lignes_check_integrite()', 'EXECUTE'), 'service_role ne doit pas avoir EXECUTE sur ordres_reparation_lignes_check_integrite');

select pg_temp.assert(not has_function_privilege('public', 'public.ordres_reparation_log_historique()', 'EXECUTE'), 'PUBLIC ne doit pas avoir EXECUTE sur ordres_reparation_log_historique');
select pg_temp.assert(not has_function_privilege('anon', 'public.ordres_reparation_log_historique()', 'EXECUTE'), 'anon ne doit pas avoir EXECUTE sur ordres_reparation_log_historique');
select pg_temp.assert(not has_function_privilege('authenticated', 'public.ordres_reparation_log_historique()', 'EXECUTE'), 'authenticated ne doit pas avoir EXECUTE sur ordres_reparation_log_historique');
select pg_temp.assert(not has_function_privilege('service_role', 'public.ordres_reparation_log_historique()', 'EXECUTE'), 'service_role ne doit pas avoir EXECUTE sur ordres_reparation_log_historique');

-- =====================================================================
-- 14. Annulation d'un OR après que le devis rattaché a changé de statut
--     APRÈS la création : doit réussir, conserver lignes et historique,
--     et écrire l'événement 'annulation' — jamais revalider un devis dont
--     le lien (devis_id) n'a pas changé.
-- =====================================================================

select set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid('user_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;

insert into ordres_reparation (id, garage_id, rendez_vous_id, vehicule_id, client_id, devis_id)
values (pg_temp.fid('or_a2'), pg_temp.fid('garage_a'), pg_temp.fid('rdv_a2'), pg_temp.fid('vehicule_a'), pg_temp.fid('client_a'), pg_temp.fid('devis_a_accepte2'));

insert into ordres_reparation_lignes (id, ordre_reparation_id, garage_id, type, libelle, quantite, duree_minutes)
values (pg_temp.fid('ligne_a2'), pg_temp.fid('or_a2'), pg_temp.fid('garage_a'), 'main_oeuvre', 'RECETTE OR V1 — Controle', 1, 20);

-- Le devis change de statut APRÈS la création de l'OR (dérive), sans
-- toucher à or_a2.devis_id : autorisé côté ACL (authenticated a UPDATE sur
-- devis) et côté RLS (devis_a_accepte2 appartient à garage_a).
update devis set statut = 'refuse' where id = pg_temp.fid('devis_a_accepte2');
select pg_temp.assert(
  (select statut from public.devis where id = pg_temp.fid('devis_a_accepte2')) = 'refuse',
  'le devis rattache doit reellement avoir change de statut avant le test d''annulation'
);

update ordres_reparation set statut = 'annule' where id = pg_temp.fid('or_a2');

select pg_temp.assert(
  (select statut from public.ordres_reparation where id = pg_temp.fid('or_a2')) = 'annule',
  'l''annulation doit reussir meme si le devis rattache n''est plus accepte'
);
select pg_temp.assert(
  (select count(*) from public.ordres_reparation_lignes where ordre_reparation_id = pg_temp.fid('or_a2')) = 1,
  'les lignes de or_a2 doivent etre integralement conservees apres annulation'
);
select pg_temp.assert(
  (select count(*) from public.ordres_reparation_historique
     where ordre_reparation_id = pg_temp.fid('or_a2') and action = 'annulation'
       and ancien_statut = 'brouillon' and nouveau_statut = 'annule') = 1,
  'l''annulation doit ecrire exactement un evenement historique action=annulation (brouillon -> annule)'
);
select pg_temp.assert(
  (select count(*) from public.ordres_reparation_historique where ordre_reparation_id = pg_temp.fid('or_a2')) = 2,
  'or_a2 doit avoir exactement deux evenements historique : creation puis annulation'
);

reset role;

-- =====================================================================
-- 15. Aucune donnée synthétique conservée après la transaction.
-- =====================================================================
-- Ne peut pas être assertée DEPUIS l'intérieur de cette transaction (les
-- données créées ci-dessus sont, par construction, visibles tant que la
-- transaction reste ouverte). Le bloc ci-dessous, exécuté APRÈS le
-- `rollback;` qui suit (donc hors de toute transaction ouverte par ce
-- script, en lecture seule), recompte chaque fixture synthétique par un
-- marqueur déterministe et lève une exception bloquante si le compte
-- n'est pas nul.

rollback;

do $$
declare
  v_residus text[] := array[]::text[];
  v_n bigint;
begin
  select count(*) into v_n from auth.users where email like 'recette-or-v1-%@example.invalid';
  if v_n > 0 then v_residus := v_residus || ('auth.users (recette-or-v1) : ' || v_n); end if;

  select count(*) into v_n from public.garages where nom_garage like 'RECETTE OR V1%';
  if v_n > 0 then v_residus := v_residus || ('garages (RECETTE OR V1) : ' || v_n); end if;

  select count(*) into v_n from public.clients where nom like 'RECETTE OR V1%';
  if v_n > 0 then v_residus := v_residus || ('clients (RECETTE OR V1) : ' || v_n); end if;

  select count(*) into v_n from public.vehicules where marque = 'MarqueTestORV1';
  if v_n > 0 then v_residus := v_residus || ('vehicules (MarqueTestORV1) : ' || v_n); end if;

  select count(*) into v_n from public.prestations where nom like 'RECETTE OR V1%';
  if v_n > 0 then v_residus := v_residus || ('prestations (RECETTE OR V1) : ' || v_n); end if;

  select count(*) into v_n from public.mecaniciens where nom like 'RECETTE OR V1%';
  if v_n > 0 then v_residus := v_residus || ('mecaniciens (RECETTE OR V1) : ' || v_n); end if;

  select count(*) into v_n from public.rendez_vous where notes = 'RECETTE OR V1';
  if v_n > 0 then v_residus := v_residus || ('rendez_vous (RECETTE OR V1) : ' || v_n); end if;

  select count(*) into v_n from public.devis where message_garage = 'RECETTE OR V1';
  if v_n > 0 then v_residus := v_residus || ('devis (RECETTE OR V1) : ' || v_n); end if;

  -- ordres_reparation / ordres_reparation_lignes / ordres_reparation_historique
  -- n'ont pas de marqueur texte propre, mais référencent garages(id) —
  -- structurellement impossibles à persister sans leur garage parent,
  -- déjà prouvé absent ci-dessus.

  if array_length(v_residus, 1) > 0 then
    raise exception 'NETTOYAGE ÉCHOUÉ après rollback — fixtures synthétiques encore présentes : %', array_to_string(v_residus, '; ');
  end if;
end;
$$;

-- Si ce bloc s'exécute sans lever d'exception, le nettoyage est prouvé,
-- pas seulement supposé.
