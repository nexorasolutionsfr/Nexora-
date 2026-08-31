-- Revenue Recovery V1 — vérifications manuelles des fondations.
--
-- Ce fichier N'EST PAS une migration : il n'est jamais appliqué
-- automatiquement. Aucun outil Postgres/Supabase local n'existe sur la
-- machine où ces migrations ont été écrites (pas de psql, pas de CLI
-- Supabase, pas de docker) — ces requêtes n'ont donc PAS été exécutées, ici
-- ni dans la session précédente malgré ce que la version précédente de ce
-- fichier laissait entendre par un simple équilibrage de parenthèses.
--
-- MÉTHODE D'IMPERSONATION CORRECTE (la version précédente de ce fichier
-- était fausse sur ce point : le SQL Editor Supabase s'exécute par défaut
-- en tant que rôle `postgres`, qui CONTOURNE le RLS — tester en SQL Editor
-- sans changer explicitement de rôle ne teste RIEN du RLS, même si les
-- requêtes semblent se comporter correctement).
--
-- Deux méthodes valables, à privilégier dans cet ordre :
--
--   A. Depuis un client applicatif réel (recommandé) : utiliser
--      @supabase/supabase-js avec un vrai JWT utilisateur (connexion via
--      email/mot de passe ou magic link sur un compte de test), jamais la
--      clé service_role. C'est la seule méthode qui exerce le chemin
--      RLS + PostgREST tel qu'il sera réellement utilisé en production.
--
--   B. Dans le SQL Editor, en simulant explicitement un utilisateur, DANS
--      UNE TRANSACTION (pour ne rien laisser en place après le test) :
--
--        begin;
--        select set_config('request.jwt.claims',
--          json_build_object('sub', '<USER_A_UUID>', 'role', 'authenticated')::text,
--          true);
--        set local role authenticated;
--        -- ... requêtes de test ici ...
--        rollback;
--
--      Sans le `set local role authenticated`, `auth.uid()` peut renvoyer
--      la bonne valeur mais les GRANT/RLS réellement appliqués restent
--      ceux de `postgres` — les deux réglages sont nécessaires ensemble.
--
-- Remplacer <GARAGE_A>, <GARAGE_B>, <USER_A_UUID>, <CLIENT_A>,
-- <TRAVAIL_DIFFERE_A> par des id réels d'un environnement de test avant
-- exécution. Chaque section suppose le contexte impersonné de <USER_A_UUID>
-- (propriétaire de <GARAGE_A>) sauf mention contraire.

-- =====================================================================
-- 1. Isolation stricte entre garages
-- =====================================================================
select * from public.revenue_recovery_garages_autorises where garage_id = '<GARAGE_B>';
-- Attendu : 0 ligne (que la ligne existe ou non côté GARAGE_B).

select * from public.revenue_recovery_permissions where garage_id = '<GARAGE_B>';
-- Attendu : 0 ligne.

select * from public.revenue_recovery_tentatives where garage_id = '<GARAGE_B>';
-- Attendu : 0 ligne.

select public.revenue_recovery_enregistrer_permission(
  '<GARAGE_B>', '<CLIENT_DE_GARAGE_B>', 'email', 'inconnu', 'test isolation'
);
-- Attendu : exception "Accès refusé au garage ..." — la fonction vérifie
-- explicitement garages.owner_user_id = auth.uid() (SECURITY DEFINER
-- contourne le RLS, la vérification est donc refaite dans la fonction
-- elle-même, pas seulement déléguée au RLS).

-- =====================================================================
-- 2. Un utilisateur standard ne peut pas s'auto-activer
-- =====================================================================
insert into public.revenue_recovery_garages_autorises (garage_id, autorise)
values ('<GARAGE_A>', true);
-- Attendu : rejet — aucun GRANT insert n'existe pour `authenticated`
-- (vérifié statiquement : seul `grant select` dans 20260831000100).

update public.revenue_recovery_garages_autorises set autorise = true where garage_id = '<GARAGE_A>';
-- Attendu : rejet — aucun GRANT update.

delete from public.revenue_recovery_garages_autorises where garage_id = '<GARAGE_A>';
-- Attendu : rejet — aucun GRANT delete.

select public.revenue_recovery_definir_autorisation_garage('<GARAGE_A>', true, 'auto-activation test');
-- Attendu : rejet — aucun GRANT execute vers authenticated sur cette
-- fonction (vérifié statiquement : 20260831000900 ne grant qu'à personne).
-- Doit échouer avec une erreur de permission PostgreSQL générique
-- ("permission denied for function ..."), pas une exception applicative.

-- =====================================================================
-- 3. Machine à états des permissions — l'opposition ne se lève pas
--    silencieusement
-- =====================================================================
select public.revenue_recovery_enregistrer_permission(
  '<GARAGE_A>', '<CLIENT_A>', 'email', 'autorise', 'devis accepté',
  null, 'prestation réalisée', 'devis:<id-devis-1>'
);
select statut from public.revenue_recovery_permissions_courant
where garage_id = '<GARAGE_A>' and client_id = '<CLIENT_A>' and canal = 'email';
-- Attendu : 'autorise'.

select public.revenue_recovery_enregistrer_permission(
  '<GARAGE_A>', '<CLIENT_A>', 'email', 'oppose', 'demande client par téléphone'
);
select statut from public.revenue_recovery_permissions_courant
where garage_id = '<GARAGE_A>' and client_id = '<CLIENT_A>' and canal = 'email';
-- Attendu : 'oppose'.

select public.revenue_recovery_enregistrer_permission(
  '<GARAGE_A>', '<CLIENT_A>', 'email', 'autorise', 'test',
  null, 'x', 'devis:<id-devis-1>'  -- même preuve que la toute première autorisation
);
-- Attendu : exception "une nouvelle autorisation après oppose exige une
-- preuve distincte de la précédente" — contrairement à la version
-- précédente de ce test, cette insertion échoue désormais réellement,
-- elle ne se contente plus de réussir silencieusement.

select public.revenue_recovery_enregistrer_permission(
  '<GARAGE_A>', '<CLIENT_A>', 'email', 'autorise', 'nouvelle demande explicite du client',
  null, 'reconsentement téléphonique', 'devis:<id-devis-2>'  -- preuve différente
);
-- Attendu : accepté (preuve distincte fournie).

select public.revenue_recovery_enregistrer_permission(
  '<GARAGE_A>', '<CLIENT_A>', 'email', 'inconnu', 'tentative de reset'
);
-- Attendu : exception "impossible de revenir à inconnu depuis autorise".

insert into public.revenue_recovery_permissions
  (garage_id, client_id, canal, statut, origine)
values ('<GARAGE_A>', '<CLIENT_A>', 'email', 'oppose', 'contournement direct');
-- Attendu : rejet — INSERT direct révoqué à authenticated depuis
-- 20260831000700 ; seule la fonction ci-dessus peut écrire.

-- =====================================================================
-- 4. Écritures directes fermées au navigateur (contexte : <USER_A_UUID>,
--    authenticated)
-- =====================================================================
insert into public.revenue_recovery_tentatives
  (garage_id, travail_differe_id, canal, destinataire, contenu_fige, cle_idempotence)
values ('<GARAGE_A>', '<TRAVAIL_DIFFERE_A>', 'email', 'client@example.fr', 'Contenu figé de test', 'test-cle-1');
-- Attendu : rejet — aucun GRANT insert (révoqué par 20260831001000).
-- Aucune fonction de création de tentative n'existe encore : cette table
-- est entièrement en lecture seule pour authenticated tant que le lot
-- d'envoi n'a pas défini le RPC de création (garage activé + permission
-- autorisée + absence d'opposition + idempotence, dans la même transaction).

insert into public.revenue_recovery_evenements
  (garage_id, travail_differe_id, type_evenement)
values ('<GARAGE_A>', '<TRAVAIL_DIFFERE_A>', 'brouillon_cree');
-- Attendu : rejet — aucun GRANT insert (révoqué par 20260831001000). Les
-- événements ne sont désormais créés que par des fonctions SECURITY
-- DEFINER (ex. revenue_recovery_marquer_tentative), jamais directement.

select public.revenue_recovery_marquer_tentative('<UNE_TENTATIVE_QUELCONQUE>', 'envoyee');
-- Attendu : rejet ("permission denied for function ...") — EXECUTE révoqué
-- à authenticated par 20260831001000. Un utilisateur connecté ne peut plus
-- déclarer lui-même un envoi réussi ou échoué.

-- =====================================================================
-- 5. Transition de tentative et idempotence — nécessite un contexte
--    privilégié (service_role / postgres), plus authenticated
-- =====================================================================
-- Les sections 4 et 5 de la version précédente de ce fichier testaient la
-- transition et l'idempotence en tant que garage impersonné : ce n'est
-- plus possible depuis 20260831001000 (ni la création de la tentative, ni
-- l'appel à marquer_tentative ne sont accessibles à authenticated). Pour
-- vérifier la machine à états et l'idempotence elles-mêmes, rejouer les
-- requêtes suivantes HORS impersonation (rôle service_role / postgres, le
-- seul qui pourra insérer une tentative tant que le RPC de création
-- n'existe pas) :

-- reset role; -- ou toute méthode équivalente pour sortir du contexte authenticated impersonné

insert into public.revenue_recovery_tentatives
  (garage_id, travail_differe_id, canal, destinataire, contenu_fige, cle_idempotence)
values ('<GARAGE_A>', '<TRAVAIL_DIFFERE_A>', 'email', 'client@example.fr', 'Contenu figé de test', 'test-cle-1')
returning id;
-- Noter l'id retourné comme <TENTATIVE_A>.

insert into public.revenue_recovery_tentatives
  (garage_id, travail_differe_id, canal, destinataire, contenu_fige, cle_idempotence)
values ('<GARAGE_A>', '<TRAVAIL_DIFFERE_A>', 'email', 'client@example.fr', 'Deuxième tentative', 'test-cle-2');
-- Attendu : rejet par l'index unique partiel
-- revenue_recovery_tentatives_actif_unique (une tentative 'en_preparation'
-- existe déjà pour ce travail différé).

insert into public.revenue_recovery_tentatives
  (garage_id, travail_differe_id, canal, destinataire, contenu_fige, cle_idempotence)
values ('<GARAGE_A>', '<AUTRE_TRAVAIL_DIFFERE_A>', 'email', 'client@example.fr', 'Autre contenu', 'test-cle-1');
-- Attendu : rejet par l'index unique (garage_id, cle_idempotence).

select public.revenue_recovery_marquer_tentative('<TENTATIVE_A>', 'envoyee');
-- Attendu : accepté (service_role/postgres n'est pas soumis au GRANT
-- execute) — statut passe à 'envoyee', un événement 'envoi_reussi' apparaît
-- dans revenue_recovery_evenements pour cette tentative.

select public.revenue_recovery_marquer_tentative('<TENTATIVE_A>', 'echec', 'test double transition');
-- Attendu : exception "tentative ... déjà au statut définitif envoyee".

-- =====================================================================
-- 6. Incohérence garage / travail différé / client
-- =====================================================================
insert into public.revenue_recovery_brouillons (garage_id, travail_differe_id, canal, contenu)
values ('<GARAGE_A>', '<TRAVAIL_DIFFERE_DE_GARAGE_B>', 'email', 'test incohérence');
-- Attendu : rejet explicite ("travail_differe_id ... n'appartient pas au
-- garage ...") via le trigger de cohérence dédié.

select public.revenue_recovery_enregistrer_permission(
  '<GARAGE_A>', '<CLIENT_DE_GARAGE_B>', 'email', 'inconnu', 'test incohérence client'
);
-- Attendu : exception "Client ... n'appartient pas au garage ...".

-- =====================================================================
-- 7. Comportement quand la permission est inconnue
-- =====================================================================
select statut from public.revenue_recovery_permissions_courant
where garage_id = '<GARAGE_A>' and client_id = '<CLIENT_JAMAIS_TRAITE>' and canal = 'email';
-- Attendu : 0 ligne renvoyée (pas une ligne avec statut='inconnu' stockée)
-- — l'absence de ligne DOIT être interprétée côté application comme
-- "inconnu", jamais comme "autorise" par défaut.

-- =====================================================================
-- 8. Suppression : ne doit jamais échouer, doit détacher proprement
-- =====================================================================
-- Préalable : garantir qu'au moins une ligne revenue_recovery_permissions
-- et une ligne revenue_recovery_tentatives référencent <CLIENT_A> /
-- <TRAVAIL_DIFFERE_A> (déjà le cas après les sections 3 et 4 ci-dessus).

delete from public.clients where id = '<CLIENT_A>';
-- Attendu (en tant que rôle disposant du droit de suppression, ex.
-- postgres/service_role — le RLS de `clients` lui-même est hors périmètre
-- Revenue Recovery) : succès, PAS d'erreur de contrainte de clé étrangère.

select client_id from public.revenue_recovery_permissions where id in (
  select id from public.revenue_recovery_permissions
  where garage_id = '<GARAGE_A>' order by created_at desc limit 1
);
-- Attendu : client_id est maintenant NULL sur les lignes qui référençaient
-- <CLIENT_A> — la preuve de la décision survit, détachée.

-- =====================================================================
-- 9. Vérification statique des contraintes ON DELETE (à défaut d'exécution)
-- =====================================================================
select conrelid::regclass as table_name, conname, confdeltype
from pg_constraint
where conname in (
  'revenue_recovery_permissions_client_id_fkey',
  'revenue_recovery_permissions_travail_differe_id_fkey',
  'revenue_recovery_tentatives_travail_differe_id_fkey',
  'revenue_recovery_evenements_travail_differe_id_fkey'
);
-- Attendu : confdeltype = 'n' (SET NULL) pour les 4 lignes — c'est
-- exactement ce que vérifie déjà, de façon bloquante, le bloc DO $$ en fin
-- de migration 20260831000800 : si cette requête ne renvoie pas 'n' pour
-- les 4, la migration elle-même aurait déjà échoué à l'application.
