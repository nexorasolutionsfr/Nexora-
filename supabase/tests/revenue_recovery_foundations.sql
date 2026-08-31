-- Revenue Recovery V1 — vérifications manuelles des fondations.
--
-- Ce fichier N'EST PAS une migration : il n'est jamais appliqué
-- automatiquement. Aucun outil Postgres/Supabase local n'existe sur la
-- machine où ces migrations ont été écrites (pas de psql, pas de CLI
-- Supabase, pas de docker) — ces requêtes n'ont donc PAS été exécutées.
-- Elles sont écrites pour être rejouées à la main, section par section,
-- dans le SQL Editor d'une branche Supabase isolée ou d'un environnement
-- de recette autorisé — jamais directement sur le projet de production.
--
-- Remplacer <GARAGE_A>, <GARAGE_B>, <USER_A>, <USER_B>, <CLIENT_A> par des
-- id réels de l'environnement de test avant exécution.

-- =====================================================================
-- 1. Isolation stricte entre garages
-- =====================================================================
-- Attendu : en tant que USER_A (propriétaire de GARAGE_A), une requête sur
-- les données de GARAGE_B ne retourne jamais de ligne (RLS), même si la
-- ligne existe réellement.

-- set role authenticated; set request.jwt.claims...  -- (selon méthode
-- d'impersonation choisie dans l'environnement de test)

select * from public.revenue_recovery_garages_autorises where garage_id = '<GARAGE_B>';
-- Attendu : 0 ligne (que la ligne existe ou non côté GARAGE_B).

select * from public.revenue_recovery_permissions where garage_id = '<GARAGE_B>';
-- Attendu : 0 ligne.

insert into public.revenue_recovery_permissions
  (garage_id, client_id, canal, statut, origine)
values ('<GARAGE_B>', '<CLIENT_DE_GARAGE_B>', 'email', 'inconnu', 'test isolation');
-- Attendu : rejet par la policy RLS (with check), pas d'insertion silencieuse.

-- =====================================================================
-- 2. Un utilisateur standard ne peut pas s'auto-activer
-- =====================================================================
insert into public.revenue_recovery_garages_autorises (garage_id, autorise)
values ('<GARAGE_A>', true);
-- Attendu : rejet — aucun GRANT insert n'existe pour `authenticated` sur
-- cette table (vérifié statiquement dans la migration
-- 20260831000100 : seul `grant select` est présent).

update public.revenue_recovery_garages_autorises set autorise = true where garage_id = '<GARAGE_A>';
-- Attendu : rejet — aucun GRANT update n'existe non plus.

-- =====================================================================
-- 3. Opposition prioritaire sur une autorisation antérieure
-- =====================================================================
insert into public.revenue_recovery_permissions
  (garage_id, client_id, canal, statut, origine, base_eligibilite, preuve_reference)
values ('<GARAGE_A>', '<CLIENT_A>', 'email', 'autorise', 'devis accepté', 'prestation réalisée', 'devis:<id>');

select statut from public.revenue_recovery_permissions_courant
where garage_id = '<GARAGE_A>' and client_id = '<CLIENT_A>' and canal = 'email';
-- Attendu : 'autorise'.

insert into public.revenue_recovery_permissions
  (garage_id, client_id, canal, statut, origine)
values ('<GARAGE_A>', '<CLIENT_A>', 'email', 'oppose', 'demande client par téléphone');

select statut from public.revenue_recovery_permissions_courant
where garage_id = '<GARAGE_A>' and client_id = '<CLIENT_A>' and canal = 'email';
-- Attendu : 'oppose' (la ligne la plus récente l'emporte).

insert into public.revenue_recovery_permissions
  (garage_id, client_id, canal, statut, origine, base_eligibilite, preuve_reference)
values ('<GARAGE_A>', '<CLIENT_A>', 'email', 'autorise', 'test', 'x', 'x');
-- Cette insertion réussit techniquement (le journal est append-only, on
-- n'empêche jamais l'ajout d'une ligne) : c'est la DÉRIVATION qui doit
-- refléter "autorise" à nouveau, pas un blocage d'écriture. Si l'intention
-- produit est qu'une opposition ne doit JAMAIS être re-couverte
-- silencieusement par un nouvel événement "autorise" sans procédure
-- explicite, ceci est un point ouvert à trancher avant le lot d'envoi —
-- non résolu par cette migration (voir compte rendu).

-- =====================================================================
-- 4. Une tentative figée ne peut pas être modifiée
-- =====================================================================
insert into public.revenue_recovery_tentatives
  (garage_id, travail_differe_id, canal, destinataire, contenu_fige, cle_idempotence)
values ('<GARAGE_A>', '<TRAVAIL_DIFFERE_A>', 'email', 'client@example.fr', 'Contenu figé de test', 'test-cle-1');

update public.revenue_recovery_tentatives set contenu_fige = 'modifié' where cle_idempotence = 'test-cle-1';
-- Attendu : rejet — aucun GRANT update n'existe sur cette table
-- (vérifié statiquement : seul `grant select, insert` dans la migration
-- 20260831000400).

-- =====================================================================
-- 5. Idempotence : impossible de créer deux tentatives actives
-- =====================================================================
insert into public.revenue_recovery_tentatives
  (garage_id, travail_differe_id, canal, destinataire, contenu_fige, cle_idempotence)
values ('<GARAGE_A>', '<TRAVAIL_DIFFERE_A>', 'email', 'client@example.fr', 'Deuxième tentative', 'test-cle-2');
-- Attendu : rejet par l'index unique partiel
-- revenue_recovery_tentatives_actif_unique — une tentative
-- 'en_preparation' existe déjà pour ce travail_differe_id (créée à l'étape
-- 4 ci-dessus).

insert into public.revenue_recovery_tentatives
  (garage_id, travail_differe_id, canal, destinataire, contenu_fige, cle_idempotence)
values ('<GARAGE_A>', '<AUTRE_TRAVAIL_DIFFERE_A>', 'email', 'client@example.fr', 'Autre contenu', 'test-cle-1');
-- Attendu : rejet par l'index unique (garage_id, cle_idempotence) — même
-- clé déjà utilisée pour ce garage, même si le travail différé diffère.

-- =====================================================================
-- 6. Incohérence garage / travail différé / client
-- =====================================================================
insert into public.revenue_recovery_brouillons (garage_id, travail_differe_id, canal, contenu)
values ('<GARAGE_A>', '<TRAVAIL_DIFFERE_DE_GARAGE_B>', 'email', 'test incohérence');
-- Attendu : rejet explicite ("travail_differe_id ... n'appartient pas au
-- garage ...") — le RLS seul ne suffirait pas ici (il vérifie seulement
-- garage_id = <GARAGE_A>, pas la cohérence du travail différé référencé),
-- d'où le trigger dédié ajouté dans
-- revenue_recovery_brouillons_identite_insert() (et son équivalent sur
-- permissions/tentatives/evenements) qui revérifie explicitement que
-- travaux_differes.garage_id correspond à new.garage_id.

-- =====================================================================
-- 7. Comportement quand la permission est inconnue
-- =====================================================================
select statut from public.revenue_recovery_permissions_courant
where garage_id = '<GARAGE_A>' and client_id = '<CLIENT_JAMAIS_TRAITE>' and canal = 'email';
-- Attendu : 0 ligne renvoyée (pas une ligne avec statut='inconnu' stockée)
-- — l'absence de ligne DOIT être interprétée côté application comme
-- "inconnu", jamais comme "autorise" par défaut. À vérifier explicitement
-- dans le futur code de lecture (lot suivant) : ne jamais traiter un
-- résultat vide comme une autorisation implicite.
