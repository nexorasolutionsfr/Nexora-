-- Restauration sécurisée des liens publics atelier/devis/facture — banc de
-- test AUTONOME et RÉVERSIBLE.
--
-- Réécriture du 2026-09-01 (après revue) : la version précédente dépendait
-- de placeholders (<RDV_A>, <DEVIS_A>...) à remplacer par des id réels
-- déjà présents en base, et utilisait `\gset`, une commande psql qui ne
-- fonctionne pas dans l'éditeur SQL Supabase. Ce fichier ne dépend plus
-- d'AUCUNE donnée préexistante : il crée lui-même, dans une seule
-- transaction, deux garages isolés (A et B), leurs utilisateurs
-- propriétaires synthétiques, leurs ressources (client, véhicule,
-- prestation, rendez-vous, devis, facture), exécute les scénarios, PUIS
-- exécute un `rollback` global unique — rien n'est jamais conservé, que
-- les tables métier soient initialement vides ou déjà peuplées.
--
-- SQL PostgreSQL standard exécutable tel quel depuis l'éditeur SQL
-- Supabase (aucune commande psql : pas de `\gset`, pas de `\set`). Ce
-- fichier N'EST PAS une migration : il n'est jamais appliqué
-- automatiquement, et n'a PAS été exécuté dans cette session (aucun outil
-- Postgres/Supabase local sur cette machine, et surtout : interdiction
-- explicite de toute écriture distante pour cette session — préparation
-- locale uniquement). À exécuter par le porteur du projet, dans l'éditeur
-- SQL du projet Supabase de TEST isolé (slawilafseganlbghgwx) — jamais
-- Production —, en collant le script dans son intégralité.
--
-- MÉTHODE (remplace \gset par des mécanismes PostgreSQL standard) :
--   - une table temporaire `_fixture_ids` retient les UUID synthétiques
--     (une clé texte -> un UUID), créée `on commit drop` : même si le
--     `rollback` final ne s'exécutait pas pour une raison quelconque, la
--     table temporaire disparaîtrait de toute façon à la fin de la session ;
--   - une table temporaire `_captured_tokens` retient les jetons en clair
--     renvoyés par les fonctions creer_jeton_* (capturés une seule fois,
--     jamais rejouables, exactement comme l'exige la conception réelle) ;
--   - quatre fonctions dans le schéma `pg_temp` (donc invisibles et
--     supprimées avec la session, jamais des objets permanents) servent
--     d'accesseurs à ces deux tables temporaires malgré les changements de
--     rôle : `pg_temp.fid(cle)`, `pg_temp.capturer_jeton(cle, jeton)`,
--     `pg_temp.jeton_de(cle)` (SECURITY DEFINER, les 3 touchent les tables
--     temporaires) et `pg_temp.assert(condition, message)` (pas besoin de
--     SECURITY DEFINER, ne touche aucune table). Durci après revue : les 4
--     fixent `search_path = ''` et qualifient explicitement
--     `pg_temp._fixture_ids`/`pg_temp._captured_tokens` (jamais de
--     référence nue résolue par un search_path ambiant) ; chacune révoque
--     EXECUTE de PUBLIC juste après sa création (ne dépend jamais des
--     privilèges par défaut du projet) et ne reçoit qu'un GRANT explicite
--     et minimal vers les seuls rôles qui l'appellent réellement dans ce
--     script précis — vérifié par un parcours programmatique du fichier,
--     pas par supposition (voir le commentaire au-dessus de chaque
--     fonction). SECURITY DEFINER est utilisé ICI uniquement pour ce rôle
--     d'échafaudage de test (accès aux tables temporaires de préparation),
--     jamais pour contourner l'ACL des fonctions réellement testées
--     (public.creer_jeton_*, public.lire_*_par_jeton, etc.), qui sont
--     TOUJOURS appelées directement, sous le rôle courant (anon/
--     authenticated), sans intermédiaire — c'est exactement ce que ce banc
--     de test vérifie ;
--   - `pg_temp.assert(condition, message)` lève une exception
--     (`ASSERTION FAILED: <message>`) si la condition est fausse — chaque
--     scénario échoue donc explicitement et bloque l'exécution du script
--     s'il observe un résultat incorrect, au lieu de se contenter d'un
--     commentaire "Attendu : ...".
--   - pour les scénarios dont l'attendu est une EXCEPTION Postgres (ex.
--     génération refusée à un mauvais garage, accès direct aux tables de
--     jetons refusé), un bloc `do $$ begin begin ... exception when others
--     then ... end; end; $$;` capture l'exception réellement levée : si
--     l'appel réussit alors qu'il aurait dû échouer, le bloc lève lui-même
--     `ASSERTION FAILED` (qui n'est jamais avalé par erreur : il est
--     explicitement re-levé après détection). Le bloc `begin ... exception`
--     interne à chaque `do $$ ... $$;` EST le mécanisme de savepoint requis
--     ici : PostgreSQL implémente chaque bloc PL/pgSQL avec gestionnaire
--     d'exception comme une sous-transaction (savepoint implicite) — c'est
--     la méthode standard pour absorber une erreur attendue sans utiliser
--     `SAVEPOINT`/`ROLLBACK TO SAVEPOINT` en SQL nu, et sans jamais faire
--     échouer ni clore prématurément la transaction englobante.
--
-- Utilisateurs synthétiques dans auth.users : INSERT SQL direct (jamais
-- l'API Auth, aucun email envoyé), avec des adresses exclusivement sous
-- `example.invalid` (domaine réservé par la RFC 2606, garanti ne jamais
-- correspondre à un domaine réel), embarquant l'UUID synthétique dans
-- l'adresse pour garantir l'unicité. Vérifié en lecture seule au
-- préalable (session du 2026-09-01) : aucun trigger utilisateur sur
-- auth.users sur ce projet Test, donc aucun effet de bord à la création ;
-- `confirmed_at` est une colonne générée (STORED) et n'est donc jamais
-- renseignée explicitement ici (Postgres refuserait l'INSERT sinon).
-- `garages.owner_user_id` porte une FOREIGN KEY vers auth.users(id)
-- (vérifié en lecture seule) : la création de ces deux utilisateurs
-- synthétiques est donc indispensable, pas une simplification de confort.
--
-- RÉVERSIBILITÉ : tout le script — création des utilisateurs synthétiques,
-- des garages, de leurs ressources, exécution des scénarios, y compris les
-- fabrications directes de jetons expirés — se déroule DANS la transaction
-- ouverte par le premier `begin;` ci-dessous, jamais validée. Le
-- `rollback;` (avant-dernier bloc du fichier, scénario 15) défait tout
-- d'un bloc : aucune ligne de auth.users, garages, clients, vehicules,
-- prestations, rendez_vous, devis, factures, atelier_jetons, devis_jetons
-- ou factures_jetons créée par ce script ne devrait survivre à son
-- exécution — et un bloc PL/pgSQL exécuté juste APRÈS ce `rollback;`
-- (donc en lecture seule, hors transaction) le VÉRIFIE réellement par
-- comptage sur des marqueurs déterministes, et lève une exception
-- bloquante si le moindre résidu subsiste (voir scénario 15 en fin de
-- fichier) — ce n'est plus une garantie seulement structurelle présentée
-- comme preuve. Les blocs `begin ... exception` internes aux `do $$ ...
-- $$;` (mécanisme de savepoint implicite, voir plus haut) ne servent
-- qu'à poursuivre les assertions suivantes après une exception attendue
-- pendant les scénarios — jamais à valider quoi que ce soit prématurément.

begin;

-- =====================================================================
-- 0. Échafaudage : identifiants synthétiques + capture de jetons sans
--    \gset + assertions bloquantes
-- =====================================================================

create temporary table _fixture_ids (
  cle text primary key,
  valeur uuid not null
) on commit drop;

create temporary table _captured_tokens (
  cle text primary key,
  jeton text not null
) on commit drop;

-- Durcissement (après revue) : les 4 fonctions d'échafaudage ci-dessous ne
-- doivent jamais dépendre des privilèges par défaut du projet (EXECUTE
-- accordé à PUBLIC par défaut sur toute nouvelle fonction Postgres) ni
-- d'un search_path ambiant. Chacune fixe `search_path = ''` et qualifie
-- explicitement `pg_temp._fixture_ids`/`pg_temp._captured_tokens` — jamais
-- de référence nue. Juste après chaque `create function`, `revoke execute
-- ... from public` supprime le privilège par défaut, puis un `grant
-- execute` explicite et minimal n'accorde qu'aux rôles qui appellent
-- réellement cette fonction dans ce script précis (vérifié scénario par
-- scénario ci-dessous, pas accordé "au cas où").

create function pg_temp.fid(p_cle text) returns uuid
language sql security definer set search_path = '' as $$
  select valeur from pg_temp._fixture_ids where cle = p_cle;
$$;
revoke execute on function pg_temp.fid(text) from public;
grant execute on function pg_temp.fid(text) to anon, authenticated;
-- Vérifié par un parcours programmatique du script (pas une supposition) :
-- pg_temp.fid est appelée sous authenticated (ex. génération de jeton par
-- son propriétaire) ET sous anon (ex. tentative de génération par anon en
-- 5d, qui doit échouer AVANT même d'évaluer l'id — mais l'id doit d'abord
-- être résolu pour construire l'appel). Les deux grants sont donc
-- réellement nécessaires ici, aucun n'est accordé "par précaution".

create function pg_temp.capturer_jeton(p_cle text, p_jeton text) returns void
language sql security definer set search_path = '' as $$
  insert into pg_temp._captured_tokens (cle, jeton) values (p_cle, p_jeton)
  on conflict (cle) do update set jeton = excluded.jeton;
$$;
revoke execute on function pg_temp.capturer_jeton(text, text) from public;
grant execute on function pg_temp.capturer_jeton(text, text) to authenticated;
-- Seul authenticated capture un jeton dans ce script (les fonctions
-- creer_jeton_* ne sont exécutables que par authenticated) : aucun grant
-- à anon.

create function pg_temp.jeton_de(p_cle text) returns text
language sql security definer set search_path = '' as $$
  select jeton from pg_temp._captured_tokens where cle = p_cle;
$$;
revoke execute on function pg_temp.jeton_de(text) from public;
grant execute on function pg_temp.jeton_de(text) to anon, authenticated;
-- Vérifié de la même façon : appelée sous anon (relecture publique d'un
-- jeton déjà capturé) ET sous authenticated (assertion immédiatement après
-- capture, en 5a, avant tout changement de rôle) — les deux grants sont
-- réellement exercés par le script, pas accordés par défaut.

create function pg_temp.assert(p_condition boolean, p_message text) returns void
language plpgsql set search_path = '' as $$
begin
  if p_condition is not true then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
end;
$$;
revoke execute on function pg_temp.assert(boolean, text) from public;
grant execute on function pg_temp.assert(boolean, text) to anon, authenticated;
-- pg_temp.assert est appelée sous les trois rôles (opérateur, authenticated,
-- anon) tout au long du script : les deux rôles applicatifs ont besoin du
-- grant explicite (l'opérateur/postgres, propriétaire de la fonction, n'en
-- a jamais besoin).

insert into _fixture_ids (cle, valeur) values
  ('user_a', gen_random_uuid()),
  ('user_b', gen_random_uuid()),
  ('garage_a', gen_random_uuid()),
  ('garage_b', gen_random_uuid()),
  ('client_a', gen_random_uuid()),
  ('vehicule_a', gen_random_uuid()),
  ('prestation_a', gen_random_uuid()),
  ('rdv_a', gen_random_uuid()),
  ('devis_a', gen_random_uuid()),
  ('facture_a', gen_random_uuid()),
  ('client_b', gen_random_uuid()),
  ('vehicule_b', gen_random_uuid()),
  ('prestation_b', gen_random_uuid()),
  ('rdv_b', gen_random_uuid());

-- =====================================================================
-- 1. Utilisateurs synthétiques (rôle opérateur — superutilisateur de
--    l'éditeur SQL, seul capable d'écrire directement dans auth.users)
-- =====================================================================

insert into auth.users
  (id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (pg_temp.fid('user_a'), 'authenticated', 'authenticated',
   'recette-liens-publics-a-' || pg_temp.fid('user_a')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture', now(),
   '{}'::jsonb, '{}'::jsonb, now(), now()),
  (pg_temp.fid('user_b'), 'authenticated', 'authenticated',
   'recette-liens-publics-b-' || pg_temp.fid('user_b')::text || '@example.invalid',
   'not-a-real-credential-synthetic-test-fixture', now(),
   '{}'::jsonb, '{}'::jsonb, now(), now());

-- =====================================================================
-- 2. Fixtures métier synthétiques (rôle opérateur, contourne RLS comme
--    tout superutilisateur — comportement normal, pas une faille)
-- =====================================================================

insert into garages (id, owner_user_id, nom_garage) values
  (pg_temp.fid('garage_a'), pg_temp.fid('user_a'), 'RECETTE SYNTHÉTIQUE — GARAGE A'),
  (pg_temp.fid('garage_b'), pg_temp.fid('user_b'), 'RECETTE SYNTHÉTIQUE — GARAGE B');

insert into clients (id, garage_id, nom) values
  (pg_temp.fid('client_a'), pg_temp.fid('garage_a'), 'RECETTE SYNTHÉTIQUE — CLIENT A'),
  (pg_temp.fid('client_b'), pg_temp.fid('garage_b'), 'RECETTE SYNTHÉTIQUE — CLIENT B');

insert into vehicules (id, garage_id, client_id, marque, modele) values
  (pg_temp.fid('vehicule_a'), pg_temp.fid('garage_a'), pg_temp.fid('client_a'), 'MarqueTest', 'ModeleTest-A'),
  (pg_temp.fid('vehicule_b'), pg_temp.fid('garage_b'), pg_temp.fid('client_b'), 'MarqueTest', 'ModeleTest-B');

insert into prestations (id, garage_id, nom, duree_minutes) values
  (pg_temp.fid('prestation_a'), pg_temp.fid('garage_a'), 'RECETTE SYNTHÉTIQUE — PRESTATION A', 30),
  (pg_temp.fid('prestation_b'), pg_temp.fid('garage_b'), 'RECETTE SYNTHÉTIQUE — PRESTATION B', 30);

-- rendez_vous.demande_id est NOT NULL mais SANS contrainte de clé
-- étrangère (vérifié en lecture seule) : un UUID synthétique suffit, sans
-- avoir besoin d'une ligne réelle dans la table `demandes`.
insert into rendez_vous (id, garage_id, client_id, vehicule_id, prestation_id, demande_id, date_debut, date_fin) values
  (pg_temp.fid('rdv_a'), pg_temp.fid('garage_a'), pg_temp.fid('client_a'), pg_temp.fid('vehicule_a'), pg_temp.fid('prestation_a'), gen_random_uuid(), now() + interval '1 day', now() + interval '1 day 1 hour'),
  (pg_temp.fid('rdv_b'), pg_temp.fid('garage_b'), pg_temp.fid('client_b'), pg_temp.fid('vehicule_b'), pg_temp.fid('prestation_b'), gen_random_uuid(), now() + interval '1 day', now() + interval '1 day 1 hour');

insert into devis (id, garage_id, client_id, vehicule_id, prestation_id, montant_ht, montant_ttc, statut) values
  (pg_temp.fid('devis_a'), pg_temp.fid('garage_a'), pg_temp.fid('client_a'), pg_temp.fid('vehicule_a'), pg_temp.fid('prestation_a'), 100, 120, 'en_attente');

insert into factures (id, garage_id, client_id, vehicule_id, numero, motif, montant_ht, montant_ttc, lignes) values
  (pg_temp.fid('facture_a'), pg_temp.fid('garage_a'), pg_temp.fid('client_a'), pg_temp.fid('vehicule_a'), 'RECETTE-SYNTH-A', 'RECETTE SYNTHÉTIQUE', 100, 120, '[]'::jsonb);

-- =====================================================================
-- 3. Anciennes RPC UUID toujours fermées (ACL, pas de fixture nécessaire)
-- =====================================================================

select pg_temp.assert(
  not has_function_privilege('anon', 'public.lire_etape_atelier(uuid)', 'EXECUTE'),
  'lire_etape_atelier(uuid) ne doit jamais être exécutable par anon'
);
select pg_temp.assert(
  not has_function_privilege('authenticated', 'public.lire_etape_atelier(uuid)', 'EXECUTE'),
  'lire_etape_atelier(uuid) ne doit jamais être exécutable par authenticated'
);
select pg_temp.assert(
  not has_function_privilege('anon', 'public.avancer_etape_atelier(uuid, text)', 'EXECUTE'),
  'avancer_etape_atelier(uuid,text) ne doit jamais être exécutable par anon'
);
select pg_temp.assert(
  not has_function_privilege('anon', 'public.lire_devis_public(uuid)', 'EXECUTE'),
  'lire_devis_public(uuid) ne doit jamais être exécutable par anon'
);
select pg_temp.assert(
  not has_function_privilege('authenticated', 'public.repondre_devis_public(uuid, text)', 'EXECUTE'),
  'repondre_devis_public(uuid,text) ne doit jamais être exécutable par authenticated'
);
select pg_temp.assert(
  not has_function_privilege('anon', 'public.lire_facture_publique(uuid)', 'EXECUTE'),
  'lire_facture_publique(uuid) ne doit jamais être exécutable par anon'
);

-- =====================================================================
-- 3b. service_role sans EXECUTE effectif sur les 11 fonctions (contrôle
--     structurel — has_function_privilege, aucun appel réel nécessaire ;
--     accès admin exclusivement via des voies dédiées, jamais via ces RPC
--     publiques, ajouté le 2026-09-01 avec la normalisation ACL de
--     20260901000500).
-- =====================================================================

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.creer_jeton_atelier(uuid)',
    'public.revoquer_jeton_atelier(uuid)',
    'public.lire_atelier_par_jeton(text)',
    'public.avancer_etape_atelier_par_jeton(text, text)',
    'public.creer_jeton_devis(uuid)',
    'public.revoquer_jeton_devis(uuid)',
    'public.lire_devis_par_jeton(text)',
    'public.repondre_devis_par_jeton(text, text)',
    'public.creer_jeton_facture(uuid)',
    'public.revoquer_jeton_facture(uuid)',
    'public.lire_facture_par_jeton(text)'
  ]
  loop
    perform pg_temp.assert(
      not has_function_privilege('service_role', v_signature, 'EXECUTE'),
      v_signature || ' ne doit jamais être exécutable par service_role'
    );
  end loop;
end;
$$;

-- =====================================================================
-- 4. UUID brut inutilisable comme jeton — même un UUID réel (celui du
--    RDV A qui vient d'être créé) ne matche structurellement aucune
--    ligne *_jetons (hash SHA-256 d'un UUID ≠ hash d'un jeton 256 bits
--    aléatoire, indépendamment de toute donnée).
-- =====================================================================

select pg_temp.assert(
  (public.lire_atelier_par_jeton(pg_temp.fid('rdv_a')::text)->>'raison') = 'inconnu',
  'un UUID de RDV brut ne doit jamais être accepté comme jeton atelier'
);
select pg_temp.assert(
  (public.lire_devis_par_jeton(pg_temp.fid('devis_a')::text)->>'raison') = 'inconnu',
  'un UUID de devis brut ne doit jamais être accepté comme jeton devis'
);
select pg_temp.assert(
  (public.lire_facture_par_jeton(pg_temp.fid('facture_a')::text)->>'raison') = 'inconnu',
  'un UUID de facture brut ne doit jamais être accepté comme jeton facture'
);

-- =====================================================================
-- 5. Génération réservée au garage propriétaire + isolation garage A/B
-- =====================================================================

-- 5a. USER_A (propriétaire de GARAGE_A) génère un jeton atelier pour son
--     propre RDV : doit réussir.
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid('user_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.capturer_jeton('atelier_a', public.creer_jeton_atelier(pg_temp.fid('rdv_a')));
select pg_temp.assert(pg_temp.jeton_de('atelier_a') is not null and length(pg_temp.jeton_de('atelier_a')) = 64, 'creer_jeton_atelier doit renvoyer un jeton hex de 64 caractères');

-- 5b. USER_A tente de générer un jeton pour le RDV de GARAGE_B : doit
--     échouer (isolation garage A/B).
do $$
begin
  begin
    perform public.creer_jeton_atelier(pg_temp.fid('rdv_b'));
    perform pg_temp.assert(false, 'creer_jeton_atelier(rdv_b) par USER_A (propriétaire de GARAGE_A) aurait dû échouer — isolation violée');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlerrm ilike '%introuvable%' or sqlerrm ilike '%refus%', 'exception inattendue pour mauvais garage : ' || sqlerrm);
  end;
end;
$$;

reset role;

-- 5c. USER_B (propriétaire de GARAGE_B) tente de révoquer le jeton
--     atelier de GARAGE_A : doit échouer (isolation, sens inverse).
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid('user_b')::text, 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin
    perform public.revoquer_jeton_atelier(pg_temp.fid('rdv_a'));
    perform pg_temp.assert(false, 'revoquer_jeton_atelier(rdv_a) par USER_B aurait dû échouer — isolation violée');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlerrm ilike '%introuvable%' or sqlerrm ilike '%refus%', 'exception inattendue pour mauvais garage : ' || sqlerrm);
  end;
end;
$$;

reset role;

-- 5d. anon (aucune session) tente de générer un jeton atelier : doit
--     échouer par absence de privilège EXECUTE (jamais atteindre la
--     vérification de propriété).
set local role anon;
do $$
begin
  begin
    perform public.creer_jeton_atelier(pg_temp.fid('rdv_a'));
    perform pg_temp.assert(false, 'creer_jeton_atelier par anon aurait dû échouer — aucun GRANT execute ne doit exister pour anon');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlstate = '42501', 'anon appelant creer_jeton_atelier doit échouer par permission denied (42501), reçu : ' || sqlstate);
  end;
end;
$$;
reset role;

-- =====================================================================
-- 6. Accès direct aux tables de jetons refusé (RLS + privilèges)
-- =====================================================================

set local role anon;
do $$
begin
  begin
    perform count(*) from public.atelier_jetons;
    perform pg_temp.assert(false, 'anon ne doit jamais pouvoir lire directement atelier_jetons');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlstate = '42501', 'accès direct à atelier_jetons par anon doit échouer en 42501, reçu : ' || sqlstate);
  end;
end;
$$;
do $$
begin
  begin
    perform count(*) from public.devis_jetons;
    perform pg_temp.assert(false, 'anon ne doit jamais pouvoir lire directement devis_jetons');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlstate = '42501', 'accès direct à devis_jetons par anon doit échouer en 42501, reçu : ' || sqlstate);
  end;
end;
$$;
do $$
begin
  begin
    perform count(*) from public.factures_jetons;
    perform pg_temp.assert(false, 'anon ne doit jamais pouvoir lire directement factures_jetons');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlstate = '42501', 'accès direct à factures_jetons par anon doit échouer en 42501, reçu : ' || sqlstate);
  end;
end;
$$;
reset role;

-- =====================================================================
-- 7. Jeton valide — lecture publique par anon du jeton atelier capturé
--    en 5a (encore vivant : rien n'a été validé, tout reste dans cette
--    transaction).
-- =====================================================================

set local role anon;
select pg_temp.assert(
  (public.lire_atelier_par_jeton(pg_temp.jeton_de('atelier_a'))->>'ok') = 'true',
  'lire_atelier_par_jeton doit réussir pour un jeton valide non expiré non révoqué'
);
select pg_temp.assert(
  (public.lire_atelier_par_jeton(pg_temp.jeton_de('atelier_a'))->>'statut_atelier') = 'a_venir',
  'statut_atelier initial attendu : a_venir'
);
reset role;

-- =====================================================================
-- 8. Jeton inconnu
-- =====================================================================

set local role anon;
select pg_temp.assert(
  (public.lire_facture_par_jeton('0000000000000000000000000000000000000000000000000000000000000000')->>'raison') = 'inconnu',
  'un jeton facture inconnu doit renvoyer raison=inconnu'
);
select pg_temp.assert(
  (public.repondre_devis_par_jeton('0000000000000000000000000000000000000000000000000000000000000000', 'accepte')->>'raison') = 'invalide',
  'répondre avec un jeton devis inconnu doit renvoyer raison=invalide'
);
reset role;

-- =====================================================================
-- 9. Jeton expiré — fabrication directe (rôle opérateur, hors chemin
--    applicatif normal, uniquement pour préparer ce scénario), lu ensuite
--    par anon.
-- =====================================================================

insert into public.devis_jetons (devis_id, garage_id, jeton_hash, expires_at)
values (pg_temp.fid('devis_a'), pg_temp.fid('garage_a'), encode(extensions.digest('jeton-synthetique-expire', 'sha256'), 'hex'), now() - interval '1 hour');

set local role anon;
select pg_temp.assert(
  (public.lire_devis_par_jeton('jeton-synthetique-expire')->>'raison') = 'expire',
  'un jeton expiré doit renvoyer raison=expire'
);
reset role;

-- =====================================================================
-- 10. Jeton révoqué
-- =====================================================================

select set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid('user_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.capturer_jeton('facture_a', public.creer_jeton_facture(pg_temp.fid('facture_a')));
select pg_temp.assert(public.revoquer_jeton_facture(pg_temp.fid('facture_a')) is true, 'revoquer_jeton_facture doit renvoyer true pour le propriétaire');
reset role;

set local role anon;
select pg_temp.assert(
  (public.lire_facture_par_jeton(pg_temp.jeton_de('facture_a'))->>'raison') = 'revoque',
  'un jeton révoqué doit renvoyer raison=revoque'
);
reset role;

-- =====================================================================
-- 11. Réponse devis unique + réponse devis invalide
-- =====================================================================

select set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid('user_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.capturer_jeton('devis_a', public.creer_jeton_devis(pg_temp.fid('devis_a')));
reset role;

set local role anon;
select pg_temp.assert(
  (public.repondre_devis_par_jeton(pg_temp.jeton_de('devis_a'), 'valeur_invalide')->>'raison') = 'reponse_invalide',
  'une réponse hors accepte/refuse doit renvoyer raison=reponse_invalide'
);
select pg_temp.assert(
  (public.repondre_devis_par_jeton(pg_temp.jeton_de('devis_a'), 'accepte')->>'ok') = 'true',
  'la première réponse (accepte) doit réussir'
);
select pg_temp.assert(
  (public.repondre_devis_par_jeton(pg_temp.jeton_de('devis_a'), 'refuse')->>'raison') = 'deja_repondu',
  'une seconde réponse (même contradictoire) doit être refusée avec raison=deja_repondu'
);
reset role;
select pg_temp.assert(
  (select statut from public.devis where id = pg_temp.fid('devis_a')) = 'accepte',
  'devis.statut doit rester accepte après la tentative de seconde réponse'
);

-- =====================================================================
-- 12. Transition atelier adjacente autorisée + saut d'étape interdit
-- =====================================================================

set local role anon;
select pg_temp.assert(
  (public.avancer_etape_atelier_par_jeton(pg_temp.jeton_de('atelier_a'), 'restitue')->>'raison') = 'transition_invalide',
  'un saut direct a_venir -> restitue doit être refusé (transition_invalide)'
);
select pg_temp.assert(
  (public.avancer_etape_atelier_par_jeton(pg_temp.jeton_de('atelier_a'), 'depose')->>'ok') = 'true',
  'la transition adjacente a_venir -> depose doit être acceptée'
);
reset role;
select pg_temp.assert(
  (select statut_atelier from public.rendez_vous where id = pg_temp.fid('rdv_a')) = 'depose',
  'rendez_vous.statut_atelier doit être depose après la transition adjacente autorisée'
);

-- =====================================================================
-- 13. Facture en lecture seule — aucune fonction de réponse n'existe
-- =====================================================================

select pg_temp.assert(
  (select count(*) from pg_proc where proname ilike '%repondre%facture%') = 0,
  'aucune fonction "répondre" ne doit exister pour les factures (lecture seule uniquement)'
);

-- =====================================================================
-- 14. Un seul jeton actif par ressource — régénération révoque
--     explicitement l'ancien jeton, et un seul reste actif en base.
-- =====================================================================

select set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid('user_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.capturer_jeton('atelier_a_v2', public.creer_jeton_atelier(pg_temp.fid('rdv_a')));
reset role;

set local role anon;
select pg_temp.assert(
  (public.lire_atelier_par_jeton(pg_temp.jeton_de('atelier_a'))->>'raison') = 'revoque',
  'régénérer un jeton atelier doit révoquer explicitement le précédent'
);
select pg_temp.assert(
  (public.lire_atelier_par_jeton(pg_temp.jeton_de('atelier_a_v2'))->>'ok') = 'true',
  'le nouveau jeton atelier doit être valide'
);
reset role;

select pg_temp.assert(
  (select count(*) from public.atelier_jetons where rendez_vous_id = pg_temp.fid('rdv_a') and revoked_at is null) = 1,
  'il ne doit exister qu''une seule ligne active (revoked_at is null) pour ce RDV — garanti par l''index unique partiel'
);

-- =====================================================================
-- 15. Décision d'architecture 2026-09-01 — anon ET authenticated sur les
--     5 fonctions publiques par jeton (jeton = unique capacité, un lien
--     doit fonctionner même ouvert dans un navigateur ayant déjà une
--     session Nexora) ; rejet d'un jeton inconnu sous les deux rôles ;
--     anon toujours interdit sur les 6 fonctions créer/révoquer (seule
--     creer_jeton_atelier était couverte en 5d) ; authenticated toujours
--     interdit d'accès direct aux 3 tables de jetons (seul anon était
--     couvert en 6). Couvre la normalisation ACL ajoutée dans
--     20260901000500 suite à l'échec constaté lors du premier push Test.
-- =====================================================================

-- 15a. anon toujours interdit sur les 5 fonctions créer/révoquer restantes
--      (creer_jeton_atelier déjà couvert en 5d).
set local role anon;
do $$
begin
  begin
    perform public.revoquer_jeton_atelier(pg_temp.fid('rdv_a'));
    perform pg_temp.assert(false, 'revoquer_jeton_atelier par anon aurait dû échouer');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlstate = '42501', 'anon appelant revoquer_jeton_atelier doit échouer en 42501, reçu : ' || sqlstate);
  end;
end;
$$;
do $$
begin
  begin
    perform public.creer_jeton_devis(pg_temp.fid('devis_a'));
    perform pg_temp.assert(false, 'creer_jeton_devis par anon aurait dû échouer');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlstate = '42501', 'anon appelant creer_jeton_devis doit échouer en 42501, reçu : ' || sqlstate);
  end;
end;
$$;
do $$
begin
  begin
    perform public.revoquer_jeton_devis(pg_temp.fid('devis_a'));
    perform pg_temp.assert(false, 'revoquer_jeton_devis par anon aurait dû échouer');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlstate = '42501', 'anon appelant revoquer_jeton_devis doit échouer en 42501, reçu : ' || sqlstate);
  end;
end;
$$;
do $$
begin
  begin
    perform public.creer_jeton_facture(pg_temp.fid('facture_a'));
    perform pg_temp.assert(false, 'creer_jeton_facture par anon aurait dû échouer');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlstate = '42501', 'anon appelant creer_jeton_facture doit échouer en 42501, reçu : ' || sqlstate);
  end;
end;
$$;
do $$
begin
  begin
    perform public.revoquer_jeton_facture(pg_temp.fid('facture_a'));
    perform pg_temp.assert(false, 'revoquer_jeton_facture par anon aurait dû échouer');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlstate = '42501', 'anon appelant revoquer_jeton_facture doit échouer en 42501, reçu : ' || sqlstate);
  end;
end;
$$;
reset role;

-- 15b. authenticated toujours interdit d'accès direct aux 3 tables de
--      jetons (accès exclusivement via les fonctions SECURITY DEFINER,
--      même règle que anon en section 6 — l'accès élargi décidé ici porte
--      uniquement sur les 5 RPC de lecture par jeton, jamais sur les
--      tables sous-jacentes).
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid('user_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin
    perform count(*) from public.atelier_jetons;
    perform pg_temp.assert(false, 'authenticated ne doit jamais pouvoir lire directement atelier_jetons');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlstate = '42501', 'accès direct à atelier_jetons par authenticated doit échouer en 42501, reçu : ' || sqlstate);
  end;
end;
$$;
do $$
begin
  begin
    perform count(*) from public.devis_jetons;
    perform pg_temp.assert(false, 'authenticated ne doit jamais pouvoir lire directement devis_jetons');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlstate = '42501', 'accès direct à devis_jetons par authenticated doit échouer en 42501, reçu : ' || sqlstate);
  end;
end;
$$;
do $$
begin
  begin
    perform count(*) from public.factures_jetons;
    perform pg_temp.assert(false, 'authenticated ne doit jamais pouvoir lire directement factures_jetons');
  exception when others then
    if sqlerrm like 'ASSERTION FAILED:%' then raise; end if;
    perform pg_temp.assert(sqlstate = '42501', 'accès direct à factures_jetons par authenticated doit échouer en 42501, reçu : ' || sqlstate);
  end;
end;
$$;
reset role;

-- 15c. Jeton inconnu toujours refusé, sous anon ET sous authenticated,
--      pour les 5 fonctions (déjà couvert sous anon seul en sections 4/8).
set local role anon;
select pg_temp.assert(
  (public.lire_atelier_par_jeton('0000000000000000000000000000000000000000000000000000000000000000')->>'raison') = 'inconnu',
  'lire_atelier_par_jeton avec un jeton inconnu doit renvoyer raison=inconnu sous anon'
);
select pg_temp.assert(
  (public.avancer_etape_atelier_par_jeton('0000000000000000000000000000000000000000000000000000000000000000', 'depose')->>'raison') = 'invalide',
  'avancer_etape_atelier_par_jeton avec un jeton inconnu doit renvoyer raison=invalide sous anon'
);
reset role;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid('user_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.assert(
  (public.lire_atelier_par_jeton('0000000000000000000000000000000000000000000000000000000000000000')->>'raison') = 'inconnu',
  'lire_atelier_par_jeton avec un jeton inconnu doit renvoyer raison=inconnu sous authenticated'
);
select pg_temp.assert(
  (public.avancer_etape_atelier_par_jeton('0000000000000000000000000000000000000000000000000000000000000000', 'depose')->>'raison') = 'invalide',
  'avancer_etape_atelier_par_jeton avec un jeton inconnu doit renvoyer raison=invalide sous authenticated'
);
select pg_temp.assert(
  (public.lire_devis_par_jeton('0000000000000000000000000000000000000000000000000000000000000000')->>'raison') = 'inconnu',
  'lire_devis_par_jeton avec un jeton inconnu doit renvoyer raison=inconnu sous authenticated'
);
select pg_temp.assert(
  (public.repondre_devis_par_jeton('0000000000000000000000000000000000000000000000000000000000000000', 'accepte')->>'raison') = 'invalide',
  'repondre_devis_par_jeton avec un jeton inconnu doit renvoyer raison=invalide sous authenticated'
);
select pg_temp.assert(
  (public.lire_facture_par_jeton('0000000000000000000000000000000000000000000000000000000000000000')->>'raison') = 'inconnu',
  'lire_facture_par_jeton avec un jeton inconnu doit renvoyer raison=inconnu sous authenticated'
);
reset role;

-- 15d. Les 5 fonctions publiques par jeton fonctionnent identiquement sous
--      anon ET sous authenticated pour un jeton valide. Jetons dédiés
--      (v3/v2) : leur génération révoque les jetons précédents de la même
--      ressource (index unique partiel), sans effet sur les assertions
--      déjà exécutées dans les sections précédentes.
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid('user_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.capturer_jeton('atelier_a_v3', public.creer_jeton_atelier(pg_temp.fid('rdv_a')));
select pg_temp.capturer_jeton('devis_a_v2', public.creer_jeton_devis(pg_temp.fid('devis_a')));
select pg_temp.capturer_jeton('facture_a_v2', public.creer_jeton_facture(pg_temp.fid('facture_a')));
reset role;

-- lire_atelier_par_jeton : anon puis authenticated, même jeton.
set local role anon;
select pg_temp.assert(
  (public.lire_atelier_par_jeton(pg_temp.jeton_de('atelier_a_v3'))->>'ok') = 'true',
  'lire_atelier_par_jeton doit réussir pour anon avec un jeton valide'
);
reset role;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid('user_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.assert(
  (public.lire_atelier_par_jeton(pg_temp.jeton_de('atelier_a_v3'))->>'ok') = 'true',
  'lire_atelier_par_jeton doit aussi réussir pour authenticated avec le même jeton valide'
);
reset role;

-- lire_devis_par_jeton : anon puis authenticated, même jeton.
set local role anon;
select pg_temp.assert(
  (public.lire_devis_par_jeton(pg_temp.jeton_de('devis_a_v2'))->>'ok') = 'true',
  'lire_devis_par_jeton doit réussir pour anon avec un jeton valide'
);
reset role;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid('user_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.assert(
  (public.lire_devis_par_jeton(pg_temp.jeton_de('devis_a_v2'))->>'ok') = 'true',
  'lire_devis_par_jeton doit aussi réussir pour authenticated avec le même jeton valide'
);
reset role;

-- lire_facture_par_jeton : anon puis authenticated, même jeton.
set local role anon;
select pg_temp.assert(
  (public.lire_facture_par_jeton(pg_temp.jeton_de('facture_a_v2'))->>'ok') = 'true',
  'lire_facture_par_jeton doit réussir pour anon avec un jeton valide'
);
reset role;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid('user_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.assert(
  (public.lire_facture_par_jeton(pg_temp.jeton_de('facture_a_v2'))->>'ok') = 'true',
  'lire_facture_par_jeton doit aussi réussir pour authenticated avec le même jeton valide'
);
reset role;

-- avancer_etape_atelier_par_jeton : anon puis authenticated, transitions
-- adjacentes distinctes (rdv_a est à 'depose' depuis la section 12 ;
-- depose -> diagnostic sous anon, puis diagnostic -> attente_client sous
-- authenticated, sur le même jeton atelier_a_v3).
set local role anon;
select pg_temp.assert(
  (public.avancer_etape_atelier_par_jeton(pg_temp.jeton_de('atelier_a_v3'), 'diagnostic')->>'ok') = 'true',
  'avancer_etape_atelier_par_jeton doit réussir pour anon (transition adjacente)'
);
reset role;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.fid('user_a')::text, 'role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.assert(
  (public.avancer_etape_atelier_par_jeton(pg_temp.jeton_de('atelier_a_v3'), 'attente_client')->>'ok') = 'true',
  'avancer_etape_atelier_par_jeton doit aussi réussir pour authenticated (transition adjacente)'
);

-- repondre_devis_par_jeton sous authenticated : devis_a a déjà reçu sa
-- réponse définitive en section 11 (statut='accepte' — état métier, pas
-- lié au jeton). Le token 'devis_a' original a été révoqué par la
-- régénération plus haut (devis_a_v2, un seul jeton actif par ressource) :
-- on réutilise donc devis_a_v2 (actif) pour atteindre la fonction. Un
-- retour métier 'deja_repondu' (au lieu d'un refus de privilège 42501)
-- prouve que authenticated atteint bien la fonction — exactement ce qui
-- manquait lors du premier push Test.
select pg_temp.assert(
  (public.repondre_devis_par_jeton(pg_temp.jeton_de('devis_a_v2'), 'accepte')->>'raison') = 'deja_repondu',
  'repondre_devis_par_jeton doit être exécutable par authenticated (retour métier deja_repondu, pas un refus de privilège)'
);
reset role;

-- =====================================================================
-- 16. Aucune donnée synthétique conservée après la transaction
-- =====================================================================
-- Ne peut pas être assertée DEPUIS l'intérieur de cette transaction (les
-- données créées ci-dessus sont, par construction, visibles tant que la
-- transaction reste ouverte). La garantie structurelle — un seul `begin`,
-- un seul `rollback`, zéro `commit` dans tout le fichier — reste vraie,
-- mais N'EST PAS EN ELLE-MÊME UNE PREUVE : une erreur de script ailleurs
-- (ex. `commit` oublié dans un futur correctif) la rendrait fausse sans
-- avertissement. Le bloc ci-dessous, exécuté APRÈS le `rollback;` qui
-- suit (donc hors de toute transaction ouverte par ce script, en lecture
-- seule), est la preuve réelle : il recompte chaque fixture synthétique
-- par un marqueur déterministe (domaine e-mail, préfixe de nom, valeurs
-- littérales utilisées plus haut) et lève une exception bloquante si le
-- compte n'est pas nul.

rollback;

do $$
declare
  v_residus text[] := array[]::text[];
  v_n bigint;
begin
  select count(*) into v_n from auth.users where email like '%@example.invalid';
  if v_n > 0 then v_residus := v_residus || ('auth.users (example.invalid) : ' || v_n); end if;

  select count(*) into v_n from public.garages where nom_garage like 'RECETTE SYNTHÉTIQUE%';
  if v_n > 0 then v_residus := v_residus || ('garages (RECETTE SYNTHÉTIQUE) : ' || v_n); end if;

  select count(*) into v_n from public.clients where nom like 'RECETTE SYNTHÉTIQUE%';
  if v_n > 0 then v_residus := v_residus || ('clients (RECETTE SYNTHÉTIQUE) : ' || v_n); end if;

  select count(*) into v_n from public.prestations where nom like 'RECETTE SYNTHÉTIQUE%';
  if v_n > 0 then v_residus := v_residus || ('prestations (RECETTE SYNTHÉTIQUE) : ' || v_n); end if;

  select count(*) into v_n from public.vehicules where marque = 'MarqueTest';
  if v_n > 0 then v_residus := v_residus || ('vehicules (MarqueTest) : ' || v_n); end if;

  select count(*) into v_n from public.factures where numero = 'RECETTE-SYNTH-A';
  if v_n > 0 then v_residus := v_residus || ('factures (RECETTE-SYNTH-A) : ' || v_n); end if;

  -- Le jeton devis expiré du scénario 9 a été inséré directement (hors
  -- RPC) : son jeton_hash littéral, déterministe, permet de le retrouver
  -- explicitement même si toute autre fixture liée a bien disparu.
  select count(*) into v_n from public.devis_jetons
    where jeton_hash = encode(extensions.digest('jeton-synthetique-expire', 'sha256'), 'hex');
  if v_n > 0 then v_residus := v_residus || ('devis_jetons (jeton expiré fabriqué en scénario 9) : ' || v_n); end if;

  if array_length(v_residus, 1) > 0 then
    raise exception 'NETTOYAGE ÉCHOUÉ après rollback — fixtures synthétiques encore présentes : %', array_to_string(v_residus, '; ');
  end if;
end;
$$;

-- Si ce bloc s'exécute sans lever d'exception, le nettoyage est prouvé,
-- pas seulement supposé.
