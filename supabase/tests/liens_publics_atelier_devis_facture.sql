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
-- utilisateur.
--
-- MÉTHODE TRANSACTIONNELLE (corrigée le 2026-09-01 après revue) — chaque
-- scénario ci-dessous est UN SEUL bloc `begin; ... rollback;` :
--   - un jeton créé puis lu APRÈS un `rollback` n'existe plus : la ligne
--     insérée par creer_jeton_* a été défaite avant la lecture, donc un
--     scénario structuré en "begin; créer; rollback;" PUIS "lire" en dehors
--     ne prouve RIEN — il ne peut renvoyer que raison="inconnu", quel que
--     soit le vrai comportement testé. Toute création, tout changement de
--     rôle et toute assertion doivent donc rester DANS la même transaction
--     que la création, et le `rollback` final n'intervient qu'une fois
--     toutes les assertions faites (il sert uniquement à ne rien laisser
--     en base après le test, jamais à "fermer" une étape intermédiaire) ;
--   - `set local role X;` hors de toute transaction ouverte ne survit pas
--     à l'instruction suivante (en autocommit, chaque instruction est sa
--     propre transaction implicite) : un `set local role anon;` isolé,
--     suivi d'un appel sur la ligne suivante, s'exécute en réalité avec le
--     rôle par défaut de la session (typiquement `postgres`, superutilisateur
--     qui contourne les vérifications de privilège) — ça ne prouve jamais
--     le comportement réel de `anon`. Tout `set local role` doit donc être
--     à l'intérieur du même `begin; ... rollback;` que l'appel qu'il est
--     censé contraindre ;
--   - changer de rôle en cours de transaction : un rôle non superutilisateur
--     (ex. `authenticated`) ne peut pas forcément `SET ROLE` vers un autre
--     rôle non-membre (ex. `anon`). Toujours passer par `reset role;`
--     (retour au rôle de session, `postgres`, superutilisateur) avant tout
--     nouveau `set local role ...;` dans un même bloc ;
--   - une erreur (exception applicative "raise exception", ou
--     "permission denied") interrompt la transaction Postgres en cours
--     (état "aborted") : toute instruction suivante échouerait avec
--     "current transaction is aborted" tant qu'on ne revient pas en
--     arrière. Chaque appel dont l'attendu est une exception est donc
--     entouré d'un `savepoint ...; ... rollback to savepoint ...;` pour
--     pouvoir continuer les assertions suivantes dans la même transaction
--     — jamais un `rollback` complet à cet endroit, qui terminerait le
--     scénario prématurément.
--
-- Remplacer <GARAGE_A>/<GARAGE_B>, <USER_A_UUID>/<USER_B_UUID>, <RDV_A>,
-- <RDV_DE_GARAGE_B>, <DEVIS_A>, <FACTURE_A> par des id réels d'un
-- environnement de test avant exécution. <GARAGE_B>/<USER_B_UUID> doivent
-- être un garage/compte totalement différent de <GARAGE_A>, pour les tests
-- d'isolation. <RDV_A> doit être en `statut_atelier` initial 'a_venir' (ou
-- nul) et <DEVIS_A> en `statut` 'en_attente' avant exécution — chaque
-- scénario les remet dans cet état via son `rollback` final, donc le
-- fichier est rejouable sans préparation supplémentaire entre deux
-- exécutions complètes.

-- =====================================================================
-- 0. Anciennes RPC UUID toujours révoquées + non-réutilisation d'un UUID
--    brut comme jeton (lecture seule, aucune écriture — le rollback est
--    un no-op ici, gardé pour l'uniformité du fichier)
-- =====================================================================
begin;

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
-- indépendamment de toute donnée réelle, donc valable même hors transaction
-- dédiée).
select public.lire_atelier_par_jeton('<RDV_A>'::text);
-- Attendu : {"ok": false, "raison": "inconnu"} — jamais les données du RDV.
select public.lire_devis_par_jeton('<DEVIS_A>'::text);
-- Attendu : {"ok": false, "raison": "inconnu"}.
select public.lire_facture_par_jeton('<FACTURE_A>'::text);
-- Attendu : {"ok": false, "raison": "inconnu"}.

rollback;

-- =====================================================================
-- 1. Génération réservée au garage propriétaire authentifié
-- =====================================================================
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<USER_A_UUID>', 'role', 'authenticated')::text, true);
set local role authenticated;

select public.creer_jeton_atelier('<RDV_A>');
-- Attendu : succès, un token hex de 64 caractères (32 octets), retourné
-- une seule fois. (Cette ligne crée un vrai jeton actif pour <RDV_A> —
-- sans effet persistant, il sera défait par le `rollback` final.)

savepoint sp_mauvais_garage;
select public.creer_jeton_atelier('<RDV_DE_GARAGE_B>');
-- Attendu : exception "Rendez-vous introuvable ou accès refusé" —
-- <RDV_DE_GARAGE_B> appartient à <GARAGE_B>, pas à <GARAGE_A> ; mauvais
-- garage refusé même authentifié.
rollback to savepoint sp_mauvais_garage;

reset role;
set local role anon;
savepoint sp_anon_refuse;
select public.creer_jeton_atelier('<RDV_A>');
-- Attendu : erreur de permission PostgreSQL générique ("permission denied
-- for function creer_jeton_atelier") — aucun GRANT execute vers anon.
rollback to savepoint sp_anon_refuse;

rollback;

-- =====================================================================
-- 2. Jeton valide — atelier
-- =====================================================================
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<USER_A_UUID>', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.creer_jeton_atelier('<RDV_A>') as v_token \gset

reset role;
set local role anon;
select public.lire_atelier_par_jeton(:'v_token');
-- Attendu : {"ok": true, "statut_atelier": "a_venir", ...} avec les bonnes
-- infos du RDV <RDV_A> (client, véhicule, prestation, garage_nom) — le
-- jeton créé ci-dessus, encore visible dans cette même transaction non
-- validée, est lu ici par le rôle anon exactement comme le ferait la page
-- publique.

rollback;

-- =====================================================================
-- 3. Jeton expiré
-- =====================================================================
begin;
-- Fabrication directe d'un jeton déjà expiré, au rôle par défaut de la
-- session (superutilisateur, hors chemin applicatif normal) — uniquement
-- pour préparer ce scénario de test.
insert into public.atelier_jetons (rendez_vous_id, garage_id, jeton_hash, expires_at)
values ('<RDV_A>', '<GARAGE_A>', encode(extensions.digest('jeton-test-expire', 'sha256'), 'hex'), now() - interval '1 hour');

reset role;
set local role anon;
select public.lire_atelier_par_jeton('jeton-test-expire');
-- Attendu : {"ok": false, "raison": "expire"}.

rollback;
-- Le `rollback` défait l'insert ci-dessus : aucun DELETE manuel requis,
-- aucune donnée de test conservée.

-- =====================================================================
-- 4. Jeton révoqué
-- =====================================================================
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<USER_A_UUID>', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.creer_jeton_devis('<DEVIS_A>') as v_token \gset
select public.revoquer_jeton_devis('<DEVIS_A>');
-- Attendu : true.

reset role;
set local role anon;
select public.lire_devis_par_jeton(:'v_token');
-- Attendu : {"ok": false, "raison": "revoque"}.

rollback;

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
-- (Dernière instruction du bloc : pas besoin de savepoint, le `rollback`
-- ci-dessous referme tout le scénario.)
rollback;

-- =====================================================================
-- 6. Mauvaise ressource — un jeton devis ne doit jamais fonctionner sur
--    une fonction facture, et réciproquement (types de paramètres distincts,
--    mais on vérifie aussi qu'un hash de jeton devis ne matche jamais une
--    ligne factures_jetons)
-- =====================================================================
begin;
select count(*) from public.factures_jetons where jeton_hash in (
  select jeton_hash from public.devis_jetons
);
-- Attendu : 0 — les jetons sont générés indépendamment (32 octets aléatoires
-- distincts par table), aucune collision structurelle possible.
rollback;

-- =====================================================================
-- 7. Jeton inconnu
-- =====================================================================
begin;
set local role anon;

select public.lire_facture_par_jeton('0000000000000000000000000000000000000000000000000000000000000000');
-- Attendu : {"ok": false, "raison": "inconnu"}.
select public.repondre_devis_par_jeton('0000000000000000000000000000000000000000000000000000000000000000', 'accepte');
-- Attendu : {"ok": false, "raison": "invalide"}.
select public.avancer_etape_atelier_par_jeton('0000000000000000000000000000000000000000000000000000000000000000', 'depose');
-- Attendu : {"ok": false, "raison": "invalide"}.

rollback;

-- =====================================================================
-- 8. Réponse devis répétée ou invalide
-- =====================================================================
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<USER_A_UUID>', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.creer_jeton_devis('<DEVIS_A>') as v_token \gset
-- <DEVIS_A> doit être en statut 'en_attente' avant ce bloc.

reset role;
set local role anon;

select public.repondre_devis_par_jeton(:'v_token', 'valeur_invalide');
-- Attendu : {"ok": false, "raison": "reponse_invalide"} — devis.statut inchangé.

select public.repondre_devis_par_jeton(:'v_token', 'accepte');
-- Attendu : {"ok": true, "statut": "accepte"}.

select public.repondre_devis_par_jeton(:'v_token', 'refuse');
-- Attendu : {"ok": false, "raison": "deja_repondu"} — la première réponse
-- ('accepte') n'est jamais écrasée par une seconde réponse, même
-- contradictoire.

select statut from public.devis where id = '<DEVIS_A>';
-- Attendu : 'accepte' (pas 'refuse'), visible dans cette même transaction.

rollback;
-- Le `rollback` défait la réponse 'accepte' écrite ci-dessus : <DEVIS_A>
-- reste 'en_attente' après ce script, réutilisable pour un prochain test.

-- =====================================================================
-- 9. Transition atelier autorisée et transition interdite
-- =====================================================================
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<USER_A_UUID>', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.creer_jeton_atelier('<RDV_A>') as v_token \gset
-- <RDV_A> doit être en statut_atelier initial 'a_venir' (ou nul) avant ce bloc.

reset role;
set local role anon;

select public.avancer_etape_atelier_par_jeton(:'v_token', 'restitue');
-- Attendu : {"ok": false, "raison": "transition_invalide"} — saut direct
-- "a_venir" -> "restitue" refusé (non adjacent dans l'ordre des étapes).

select public.avancer_etape_atelier_par_jeton(:'v_token', 'etape_qui_nexiste_pas');
-- Attendu : {"ok": false, "raison": "transition_invalide"} — valeur hors
-- de la liste fixe des étapes.

select public.avancer_etape_atelier_par_jeton(:'v_token', 'depose');
-- Attendu : {"ok": true, "statut_atelier": "depose"} — transition adjacente
-- valide, AUTORISÉE.

select statut_atelier from public.rendez_vous where id = '<RDV_A>';
-- Attendu : 'depose', visible dans cette même transaction.

rollback;
-- Le `rollback` remet <RDV_A> à son statut_atelier d'origine après ce script.

-- =====================================================================
-- 10. Absence d'accès direct anonyme (RLS + privilèges de table)
-- =====================================================================
begin;
set local role anon;

savepoint sp_atelier_jetons;
select * from public.atelier_jetons limit 1;
-- Attendu : erreur de permission ("permission denied for table atelier_jetons")
-- — aucun GRANT, RLS activée sans policy.
rollback to savepoint sp_atelier_jetons;

savepoint sp_devis_jetons;
select * from public.devis_jetons limit 1;
-- Attendu : idem.
rollback to savepoint sp_devis_jetons;

savepoint sp_factures_jetons;
select * from public.factures_jetons limit 1;
-- Attendu : idem.
rollback to savepoint sp_factures_jetons;

rollback;

-- =====================================================================
-- 11. Facture — lecture seule, aucune fonction de réponse n'existe
-- =====================================================================
begin;
select proname from pg_proc where proname ilike '%facture%jeton%' or proname ilike '%repondre_facture%';
-- Attendu : uniquement creer_jeton_facture, revoquer_jeton_facture,
-- lire_facture_par_jeton — aucune fonction de "réponse" (cohérent avec
-- "consultation en lecture seule" du cahier des charges).
rollback;
