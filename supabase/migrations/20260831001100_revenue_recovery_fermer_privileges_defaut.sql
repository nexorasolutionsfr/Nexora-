-- Revenue Recovery V1 — correctif : privilèges par défaut du schéma sur
-- les TABLES (pas seulement les fonctions, déjà traitées en 20260831000600/
-- 000700/000900).
-- Migration additive côté schéma (uniquement REVOKE puis GRANT ciblés),
-- non destructive : aucune donnée touchée, aucun objet hors périmètre
-- Revenue Recovery modifié, aucune modification de
-- `ALTER DEFAULT PRIVILEGES` (la règle par défaut du schéma `public`
-- elle-même n'est pas touchée : seuls les 6 objets RR déjà créés reçoivent
-- un REVOKE/GRANT explicite, objet par objet).
--
-- Vulnérabilité confirmée sur le projet de test isolé slawilafseganlbghgwx
-- (jamais sur Production) : `pg_default_acl` de ce projet accorde
-- automatiquement TOUS les privilèges (arwdDxtm : select/insert/update/
-- delete/truncate/references/trigger/maintain) à anon, authenticated ET
-- service_role sur toute TABLE créée par `postgres` dans `public` — la
-- même règle déjà identifiée pour les fonctions (EXECUTE), jamais
-- généralisée aux tables lors des correctifs précédents. Confirmé par :
--   select grantee, privilege_type from information_schema.role_table_grants
--   where table_schema='public' and table_name='revenue_recovery_permissions';
-- Aucune des 5 migrations de table (20260831000100/000200/000300/000400/
-- 000500) ni la migration de vue (000200) ne révoquait quoi que ce soit
-- pour anon ou service_role — seules 2 migrations (000700, 001000)
-- révoquaient INSERT pour authenticated sur 3 des 6 objets, jamais les
-- 3 autres privilèges par défaut (update/delete/truncate), jamais sur les
-- 2 objets restants (garages_autorises, brouillons).
--
-- Cette migration ferme les 6 objets un par un : REVOKE ALL explicite pour
-- PUBLIC, anon, authenticated, service_role d'abord (efface l'état hérité
-- des privilèges par défaut, quel qu'il soit), puis un GRANT minimal
-- ré-accordé objet par objet, cohérent avec le RLS et les fonctions RPC
-- déjà en place.

-- ---------------------------------------------------------------------
-- revenue_recovery_garages_autorises
-- ---------------------------------------------------------------------
-- Intention déjà documentée en 20260831000100 : lecture seule pour le
-- garage propriétaire (RLS), aucune écriture applicative — l'activation
-- passe uniquement par revenue_recovery_definir_autorisation_garage(),
-- elle-même fermée à tout rôle applicatif.
revoke all on table public.revenue_recovery_garages_autorises from public;
revoke all on table public.revenue_recovery_garages_autorises from anon;
revoke all on table public.revenue_recovery_garages_autorises from authenticated;
revoke all on table public.revenue_recovery_garages_autorises from service_role;
grant select on table public.revenue_recovery_garages_autorises to authenticated;
-- anon, service_role : aucun droit. Aucun besoin fonctionnel identifié —
-- service_role n'est appelé par aucun code applicatif de ce module.

-- ---------------------------------------------------------------------
-- revenue_recovery_permissions (journal append-only)
-- ---------------------------------------------------------------------
-- Intention déjà documentée en 20260831000700 : lecture du journal complet
-- par le garage (RLS), toute écriture passe par
-- revenue_recovery_enregistrer_permission() (SECURITY DEFINER). authenticated
-- garde SELECT direct pour permettre l'affichage de l'historique complet
-- côté Cockpit, décision de sécurité assumée : le contenu du journal
-- (motifs, preuves, origines) n'est pas plus sensible que ce que le garage
-- peut déjà lire ailleurs sur ses propres clients, et RLS le scope
-- strictement à son propre garage_id.
revoke all on table public.revenue_recovery_permissions from public;
revoke all on table public.revenue_recovery_permissions from anon;
revoke all on table public.revenue_recovery_permissions from authenticated;
revoke all on table public.revenue_recovery_permissions from service_role;
grant select on table public.revenue_recovery_permissions to authenticated;
-- Volontairement AUCUN insert/update/delete réaccordé à authenticated :
-- la fonction RPC est le seul chemin d'écriture (elle est SECURITY DEFINER
-- et n'a pas besoin d'un GRANT sur la table pour y écrire).

-- ---------------------------------------------------------------------
-- revenue_recovery_permissions_courant (vue security_invoker)
-- ---------------------------------------------------------------------
-- security_invoker fait porter le contrôle RLS réel par la table
-- sous-jacente, mais la vue elle-même reste un objet distinct soumis à
-- ses propres GRANT — un SELECT direct sur la vue est nécessaire pour
-- que authenticated puisse la lire du tout.
revoke all on table public.revenue_recovery_permissions_courant from public;
revoke all on table public.revenue_recovery_permissions_courant from anon;
revoke all on table public.revenue_recovery_permissions_courant from authenticated;
revoke all on table public.revenue_recovery_permissions_courant from service_role;
grant select on table public.revenue_recovery_permissions_courant to authenticated;

-- ---------------------------------------------------------------------
-- revenue_recovery_brouillons (état mutable tant qu'ouvert)
-- ---------------------------------------------------------------------
-- Seul objet RR où authenticated a légitimement besoin d'écrire en direct
-- (rédiger/modifier un brouillon avant tout envoi) — décision de sécurité
-- assumée : le trigger de verrouillage (revenue_recovery_brouillons_
-- verrouiller, migration 000300) empêche déjà toute modification une fois
-- le brouillon fermé, et RLS scope chaque ligne au garage propriétaire.
-- Aucun delete : même un brouillon abandonné reste traçable par son statut.
revoke all on table public.revenue_recovery_brouillons from public;
revoke all on table public.revenue_recovery_brouillons from anon;
revoke all on table public.revenue_recovery_brouillons from authenticated;
revoke all on table public.revenue_recovery_brouillons from service_role;
grant select, insert, update on table public.revenue_recovery_brouillons to authenticated;

-- ---------------------------------------------------------------------
-- revenue_recovery_tentatives (contenu figé)
-- ---------------------------------------------------------------------
-- Intention déjà documentée en 20260831001000 : lecture seule pour
-- authenticated, aucune création tant que le lot d'envoi n'existe pas (la
-- future fonction de création sera elle-même SECURITY DEFINER, sans besoin
-- d'un GRANT insert sur la table).
revoke all on table public.revenue_recovery_tentatives from public;
revoke all on table public.revenue_recovery_tentatives from anon;
revoke all on table public.revenue_recovery_tentatives from authenticated;
revoke all on table public.revenue_recovery_tentatives from service_role;
grant select on table public.revenue_recovery_tentatives to authenticated;

-- ---------------------------------------------------------------------
-- revenue_recovery_evenements (journal append-only)
-- ---------------------------------------------------------------------
-- Même intention que ci-dessus : lecture seule pour authenticated, écriture
-- réservée aux fonctions SECURITY DEFINER (revenue_recovery_marquer_
-- tentative aujourd'hui, d'autres plus tard).
revoke all on table public.revenue_recovery_evenements from public;
revoke all on table public.revenue_recovery_evenements from anon;
revoke all on table public.revenue_recovery_evenements from authenticated;
revoke all on table public.revenue_recovery_evenements from service_role;
grant select on table public.revenue_recovery_evenements to authenticated;

-- ---------------------------------------------------------------------
-- Vérification post-migration bloquante — privilège effectif, pas déclaratif
-- ---------------------------------------------------------------------
-- Revue sécurité du 2026-08-31 : la première version de ce bloc lisait
-- information_schema.role_table_grants, qui liste les lignes d'ACL
-- déclarées mais ne calcule pas le privilège EFFECTIF d'un rôle — elle
-- peut manquer un droit hérité (le rôle est membre d'un autre rôle qui,
-- lui, a un GRANT) ou un droit accordé à PUBLIC qui s'applique
-- implicitement à tous les rôles sans apparaître sous leur propre nom de
-- grantee. Elle ne prouvait par ailleurs jamais qu'un droit ATTENDU était
-- bien présent, seulement l'absence de lignes inattendues.
--
-- Remplacé par has_table_privilege(role, table, privilege) : fonction
-- Postgres canonique qui calcule le privilège réellement effectif pour un
-- rôle sur un objet, en tenant compte de l'appartenance de rôle et des
-- GRANT à PUBLIC — exactement ce que role_table_grants ne garantissait
-- pas. Vérifie à la fois la présence des droits attendus et l'absence de
-- tout droit inattendu, sur les 8 privilèges qu'une table/vue peut porter
-- sur ce projet (Postgres 17 : select/insert/update/delete/truncate/
-- references/trigger/maintain — le même octuplet que pg_default_acl
-- accorde par défaut, confirmé arwdDxtm+m lors de l'audit).
do $$
declare
  v_objets text[] := array[
    'revenue_recovery_garages_autorises',
    'revenue_recovery_permissions',
    'revenue_recovery_permissions_courant',
    'revenue_recovery_brouillons',
    'revenue_recovery_tentatives',
    'revenue_recovery_evenements'
  ];
  v_privileges text[] := array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'];
  v_roles text[] := array['anon', 'authenticated', 'service_role'];
  v_objet text;
  v_privilege text;
  v_role text;
  v_attendu boolean;
  v_effectif boolean;
  v_violations text[] := array[]::text[];
begin
  foreach v_role in array v_roles loop
    foreach v_objet in array v_objets loop
      foreach v_privilege in array v_privileges loop
        -- Matrice des droits attendus : anon et service_role n'ont jamais
        -- rien ; authenticated a select seul partout, sauf sur
        -- revenue_recovery_brouillons (select+insert+update — seul objet
        -- où une écriture directe est légitime, voir commentaire plus haut
        -- dans ce fichier).
        if v_role in ('anon', 'service_role') then
          v_attendu := false;
        elsif v_objet = 'revenue_recovery_brouillons' then
          v_attendu := v_privilege in ('SELECT', 'INSERT', 'UPDATE');
        else
          v_attendu := (v_privilege = 'SELECT');
        end if;

        v_effectif := has_table_privilege(v_role, 'public.' || v_objet, v_privilege);

        if v_effectif is distinct from v_attendu then
          v_violations := v_violations || (
            v_objet || ':' || v_role || ':' || v_privilege ||
            ' (attendu=' || v_attendu::text || ', effectif=' || v_effectif::text || ')'
          );
        end if;
      end loop;
    end loop;
  end loop;

  if array_length(v_violations, 1) > 0 then
    raise exception 'Vérification post-migration échouée (privilège effectif via has_table_privilege) : %', array_to_string(v_violations, ', ');
  end if;
end
$$;
