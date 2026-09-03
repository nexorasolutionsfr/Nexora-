-- Correctif ciblé : fiabiliser public.current_garage_id() en fixant son
-- search_path et en qualifiant sa référence de schéma.
--
-- Contexte : fonction historique non versionnée jusqu'ici (absente de
-- toute migration du dépôt, seulement présente en base), utilisée par 15
-- policies RLS sur 12 tables cœur (actions_ia, clients, demandes, devis,
-- factures, liste_attente, mecaniciens, notifications_atelier,
-- prestations, propositions_rdv, rendez_vous, vehicules) sous la forme
-- `garage_id = current_garage_id()`. Définition avant correctif,
-- identique et vérifiée sur Test (slawilafseganlbghgwx) et Production
-- (omphppsmhmyllapdqevn) :
--
--   create or replace function public.current_garage_id()
--   returns uuid
--   language sql security definer
--   as $$ select id from garages where owner_user_id = auth.uid() $$;
--
-- Aucun SET search_path, et `garages` non qualifié par son schéma. Cause
-- racine confirmée de l'échec du banc Ordre de Réparation V1 : tout
-- appelant s'exécutant avec un search_path vide (cas des triggers OR,
-- volontairement `set search_path = ''` et non-SECURITY DEFINER) fait
-- échouer la résolution de `garages` avec `42P01 relation "garages" does
-- not exist` dès qu'une policy appelant cette fonction est évaluée.
--
-- Portée strictement ciblée sur cette unique fonction — seule exception
-- volontaire à l'interdiction habituelle de `CREATE OR REPLACE`, justifiée
-- ici par la correction explicite d'une fonction historique existante non
-- versionnée. Ne crée, ne modifie et ne supprime aucune table, aucune
-- donnée, aucune policy RLS, aucun trigger, aucun rôle et aucune autre
-- fonction. Sémantique préservée à l'identique : retourne l'id du garage
-- dont `owner_user_id = auth.uid()`. Signature, `STABLE` et
-- `SECURITY DEFINER` conservés à l'identique — `CREATE OR REPLACE`
-- préserve automatiquement les privilèges EXECUTE déjà accordés sur cette
-- fonction (Postgres ne réinitialise l'ACL d'un objet que sur DROP puis
-- CREATE, jamais sur un simple remplacement) : aucun `grant`/`revoke`
-- n'est donc nécessaire ni présent dans cette migration.

create or replace function public.current_garage_id()
returns uuid
language sql
stable security definer
set search_path = ''
as $$
  select id from public.garages where owner_user_id = auth.uid()
$$;
