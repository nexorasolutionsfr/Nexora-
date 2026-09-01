-- Restauration sécurisée des liens publics atelier/devis/facture —
-- vérifications manuelles.
--
-- Ce fichier N'EST PAS une migration : il n'est jamais appliqué
-- automatiquement, et n'a PAS été exécuté ici (aucun outil Postgres/
-- Supabase local sur cette machine — pas de psql, pas de CLI Supabase, pas
-- de docker ; voir supabase/tests/revenue_recovery_foundations.sql pour le
-- même constat). Interdiction explicite pour cette session : aucune
-- écriture Supabase test ou Production. Ces requêtes sont à exécuter par
-- le porteur du projet, sur un projet Supabase de test isolé — jamais
-- Production — avant tout merge.
--
-- MÉTHODE D'IMPERSONATION (voir explication complète dans
-- revenue_recovery_foundations.sql) : les fonctions creer_jeton_*/
-- revoquer_jeton_* vérifient `garages.owner_user_id = auth.uid()`, donc
-- tout appel de test doit se faire dans le contexte impersonné du bon
-- utilisateur :
--
--   begin;
--   select set_config('request.jwt.claims',
--     json_build_object('sub', '<USER_A_UUID>', 'role', 'authenticated')::text,
--     true);
--   set local role authenticated;
--   -- ... requêtes ici ...
--   rollback;
--
-- Les fonctions lire_*_par_jeton / repondre_*_par_jeton / avancer_*_par_jeton
-- sont conçues pour anon (aucune session) : les tester directement en SQL
-- Editor sans impersonation, OU `set local role anon;` sans claims JWT,
-- reproduit fidèlement le chemin réel.
--
-- Remplacer <GARAGE_A>/<GARAGE_B>, <USER_A_UUID>/<USER_B_UUID>, <RDV_A>,
-- <DEVIS_A>, <FACTURE_A> par des id réels d'un environnement de test avant
-- exécution. <GARAGE_B>/<USER_B_UUID> doivent être un garage/compte
-- totalement différent de <GARAGE_A>, pour les tests d'isolation.

-- =====================================================================
-- 0. Anciennes RPC UUID toujours révoquées (rappel, déjà vérifié de façon
--    bloquante par la migration 20260901000500 elle-même — ceci est un
--    contrôle manuel complémentaire, pas la seule ligne de défense)
-- =====================================================================
select has_function_privilege('anon', 'public.lire_etape_atelier(uuid)', 'EXECUTE');
-- Attendu : false.
select has_function_privilege('anon', 'public.avancer_etape_atelier(uuid, text)', 'EXECUTE');
-- Attendu : false.
select has_function_privilege('anon', 'public.lire_devis_public(uuid)', 'EXECUTE');
-- Attendu : false.
select has_function_privilege('anon', 'public.repondre_devis_public(uuid, text)', 'EXECUTE');
-- Attendu : false.
select has_function_privilege('anon', 'public.lire_facture_publique(uuid)', 'EXECUTE');
-- Attendu : false.

-- Impossibilité de réutiliser un UUID brut comme "jeton" : passer l'UUID
-- réel d'un RDV/devis/facture (converti en texte) à la nouvelle fonction
-- par jeton ne doit JAMAIS matcher (le hash SHA-256 d'un UUID ne
-- correspond à aucune ligne *_jetons — structurellement impossible,
-- indépendamment de toute donnée réelle).
select public.lire_atelier_par_jeton('<RDV_A>'::text);
-- Attendu : {"ok": false, "raison": "inconnu"} — jamais les données du RDV.
select public.lire_devis_par_jeton('<DEVIS_A>'::text);
-- Attendu : {"ok": false, "raison": "inconnu"}.
select public.lire_facture_par_jeton('<FACTURE_A>'::text);
-- Attendu : {"ok": false, "raison": "inconnu"}.

-- =====================================================================
-- 1. Génération réservée au garage propriétaire authentifié
-- =====================================================================
-- Contexte : impersonation <USER_A_UUID> (propriétaire de <GARAGE_A>).
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<USER_A_UUID>', 'role', 'authenticated')::text, true);
set local role authenticated;

select public.creer_jeton_atelier('<RDV_A>');
-- Attendu : un token hex de 64 caractères (32 octets), retourné une seule fois.

select public.creer_jeton_atelier('<RDV_DE_GARAGE_B>');
-- Attendu : exception "Rendez-vous introuvable ou accès refusé" — <RDV_DE_GARAGE_B>
-- appartient à <GARAGE_B>, pas à <GARAGE_A> ; mauvais garage refusé même
-- authentifié.

rollback;

-- Contexte : anon (pas de session).
set local role anon;
select public.creer_jeton_atelier('<RDV_A>');
-- Attendu : erreur de permission PostgreSQL générique ("permission denied
-- for function creer_jeton_atelier") — aucun GRANT execute vers anon.
reset role;

-- =====================================================================
-- 2. Jeton valide — atelier
-- =====================================================================
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<USER_A_UUID>', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.creer_jeton_atelier('<RDV_A>') as v_token \gset
rollback;

-- Hors transaction, en tant qu'anon (ou sans rôle particulier, comme le
-- ferait la page publique) :
select public.lire_atelier_par_jeton(:'v_token');
-- Attendu : {"ok": true, "statut_atelier": "a_venir", ...} avec les bonnes
-- infos du RDV <RDV_A> (client, véhicule, prestation, garage_nom).

-- =====================================================================
-- 3. Jeton expiré
-- =====================================================================
-- Fabriquer un jeton déjà expiré directement (en tant que postgres/service_role,
-- hors chemin applicatif normal — uniquement pour préparer ce scénario de test) :
insert into public.atelier_jetons (rendez_vous_id, garage_id, jeton_hash, expires_at)
values ('<RDV_A>', '<GARAGE_A>', encode(extensions.digest('jeton-test-expire', 'sha256'), 'hex'), now() - interval '1 hour');

select public.lire_atelier_par_jeton('jeton-test-expire');
-- Attendu : {"ok": false, "raison": "expire"}.

delete from public.atelier_jetons where jeton_hash = encode(extensions.digest('jeton-test-expire', 'sha256'), 'hex');
-- Nettoyage du jeton de test.

-- =====================================================================
-- 4. Jeton révoqué
-- =====================================================================
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<USER_A_UUID>', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.creer_jeton_devis('<DEVIS_A>') as v_token \gset
select public.revoquer_jeton_devis('<DEVIS_A>');
-- Attendu : true.
rollback;

select public.lire_devis_par_jeton(:'v_token');
-- Attendu : {"ok": false, "raison": "revoque"}.

-- =====================================================================
-- 5. Mauvais garage — un jeton valide d'un garage n'expose jamais les
--    données d'un autre garage (structurellement impossible : le jeton est
--    lié à une seule ligne, elle-même liée à un seul garage_id, mais on
--    vérifie ici qu'aucun paramètre supplémentaire ne permet de forcer
--    un autre garage_id)
-- =====================================================================
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<USER_B_UUID>', 'role', 'authenticated')::text, true);
set local role authenticated;
-- <USER_B_UUID> est propriétaire de <GARAGE_B>, pas <GARAGE_A>.
select public.revoquer_jeton_atelier('<RDV_A>');
-- Attendu : exception "Rendez-vous introuvable ou accès refusé" — <RDV_A>
-- appartient à <GARAGE_A>, <USER_B_UUID> ne peut ni le lire ni le révoquer.
rollback;

-- =====================================================================
-- 6. Mauvaise ressource — un jeton devis ne doit jamais fonctionner sur
--    une fonction facture, et réciproquement (types de paramètres distincts,
--    mais on vérifie aussi qu'un hash de jeton devis ne matche jamais une
--    ligne factures_jetons)
-- =====================================================================
select count(*) from public.factures_jetons where jeton_hash in (
  select jeton_hash from public.devis_jetons
);
-- Attendu : 0 — les jetons sont générés indépendamment (32 octets aléatoires
-- distincts par table), aucune collision structurelle possible.

-- =====================================================================
-- 7. Jeton inconnu
-- =====================================================================
select public.lire_facture_par_jeton('0000000000000000000000000000000000000000000000000000000000000000');
-- Attendu : {"ok": false, "raison": "inconnu"}.
select public.repondre_devis_par_jeton('0000000000000000000000000000000000000000000000000000000000000000', 'accepte');
-- Attendu : {"ok": false, "raison": "invalide"}.
select public.avancer_etape_atelier_par_jeton('0000000000000000000000000000000000000000000000000000000000000000', 'depose');
-- Attendu : {"ok": false, "raison": "invalide"}.

-- =====================================================================
-- 8. Réponse devis répétée ou invalide
-- =====================================================================
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<USER_A_UUID>', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.creer_jeton_devis('<DEVIS_A>') as v_token \gset
rollback;

-- <DEVIS_A> doit être en statut 'en_attente' avant ce bloc.
select public.repondre_devis_par_jeton(:'v_token', 'valeur_invalide');
-- Attendu : {"ok": false, "raison": "reponse_invalide"} — devis.statut inchangé.

select public.repondre_devis_par_jeton(:'v_token', 'accepte');
-- Attendu : {"ok": true, "statut": "accepte"}.

select public.repondre_devis_par_jeton(:'v_token', 'refuse');
-- Attendu : {"ok": false, "raison": "deja_repondu"} — la première réponse
-- ('accepte') n'est jamais écrasée par une seconde réponse, même
-- contradictoire.

select statut from public.devis where id = '<DEVIS_A>';
-- Attendu : 'accepte' (pas 'refuse').

-- =====================================================================
-- 9. Transition atelier invalide (saut non adjacent)
-- =====================================================================
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<USER_A_UUID>', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.creer_jeton_atelier('<RDV_A>') as v_token \gset
rollback;

-- <RDV_A> doit être en statut_atelier initial 'a_venir' (ou nul) avant ce bloc.
select public.avancer_etape_atelier_par_jeton(:'v_token', 'restitue');
-- Attendu : {"ok": false, "raison": "transition_invalide"} — saut direct
-- "a_venir" -> "restitue" refusé (non adjacent dans l'ordre des étapes).

select public.avancer_etape_atelier_par_jeton(:'v_token', 'etape_qui_nexiste_pas');
-- Attendu : {"ok": false, "raison": "transition_invalide"} — valeur hors
-- de la liste fixe des étapes.

select public.avancer_etape_atelier_par_jeton(:'v_token', 'depose');
-- Attendu : {"ok": true, "statut_atelier": "depose"} — transition adjacente
-- valide.

select statut_atelier from public.rendez_vous where id = '<RDV_A>';
-- Attendu : 'depose'.

-- =====================================================================
-- 10. Absence d'accès direct anonyme (RLS + privilèges de table)
-- =====================================================================
set local role anon;
select * from public.atelier_jetons limit 1;
-- Attendu : erreur de permission ("permission denied for table atelier_jetons")
-- — aucun GRANT, RLS activée sans policy.
select * from public.devis_jetons limit 1;
-- Attendu : idem.
select * from public.factures_jetons limit 1;
-- Attendu : idem.
reset role;

-- =====================================================================
-- 11. Facture — lecture seule, aucune fonction de réponse n'existe
-- =====================================================================
select proname from pg_proc where proname ilike '%facture%jeton%' or proname ilike '%repondre_facture%';
-- Attendu : uniquement creer_jeton_facture, revoquer_jeton_facture,
-- lire_facture_par_jeton — aucune fonction de "réponse" (cohérent avec
-- "consultation en lecture seule" du cahier des charges).
