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
-- delete/truncate/references/trigger) à anon, authenticated ET
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
-- Vérification post-migration bloquante
-- ---------------------------------------------------------------------
-- Comme pour 20260831000800 (vérification des contraintes ON DELETE), ce
-- correctif n'a pas pu être exécuté sur un moteur réel avant écriture au
-- moment où ce fichier a été rédigé : ce bloc échoue bruyamment à
-- l'application si l'état final ne correspond pas exactement à l'intention
-- ci-dessus, plutôt que de supposer silencieusement que chaque REVOKE/GRANT
-- a produit l'effet attendu.
do $$
declare
  v_probleme text;
begin
  select string_agg(table_name || ':' || grantee || ':' || privilege_type, ', ') into v_probleme
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in (
      'revenue_recovery_garages_autorises',
      'revenue_recovery_permissions',
      'revenue_recovery_permissions_courant',
      'revenue_recovery_brouillons',
      'revenue_recovery_tentatives',
      'revenue_recovery_evenements'
    )
    and (
      grantee in ('anon', 'service_role', 'PUBLIC')
      or (grantee = 'authenticated' and table_name = 'revenue_recovery_garages_autorises' and privilege_type <> 'SELECT')
      or (grantee = 'authenticated' and table_name = 'revenue_recovery_permissions' and privilege_type <> 'SELECT')
      or (grantee = 'authenticated' and table_name = 'revenue_recovery_permissions_courant' and privilege_type <> 'SELECT')
      or (grantee = 'authenticated' and table_name = 'revenue_recovery_brouillons' and privilege_type not in ('SELECT', 'INSERT', 'UPDATE'))
      or (grantee = 'authenticated' and table_name = 'revenue_recovery_tentatives' and privilege_type <> 'SELECT')
      or (grantee = 'authenticated' and table_name = 'revenue_recovery_evenements' and privilege_type <> 'SELECT')
    );

  if v_probleme is not null then
    raise exception 'Vérification post-migration échouée : privilège(s) résiduel(s) inattendu(s) : %', v_probleme;
  end if;
end
$$;
