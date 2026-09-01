-- Sécurité (audit 2026-09-01) : confine l'accès à 5 fonctions SECURITY
-- DEFINER qui n'ont jamais eu d'autre autorisation qu'un UUID brut passé en
-- paramètre par des pages publiques non authentifiées :
--   - public.lire_etape_atelier(rdv_id)
--   - public.avancer_etape_atelier(rdv_id, nouveau_statut)
--   - public.lire_devis_public(p_devis_id)
--   - public.repondre_devis_public(p_devis_id, p_reponse)
--   - public.lire_facture_publique(p_facture_id)
--
-- Constat (lecture pg_catalog en lecture seule sur la production,
-- omphppsmhmyllapdqevn) : les 5 fonctions accordaient EXECUTE à anon
-- (les deux fonctions devis l'accordaient aussi à authenticated), sans
-- aucune vérification d'appartenance dans leur corps — n'importe qui
-- connaissant ou devinant un UUID de rendez-vous/devis/facture pouvait lire
-- (les 5) et, pour avancer_etape_atelier / repondre_devis_public, modifier
-- l'état correspondant.
--
-- Recherche des autres appelants dans le dépôt (grep exhaustif sur
-- app/, components/, lib/) : chacune de ces 5 fonctions n'est appelée que
-- depuis exactement une page, elle-même parmi les trois désactivées dans ce
-- même lot (app/atelier/[id], app/devis/[id], app/facture/[id]). Aucun
-- parcours interne authentifié n'en dépend : le dashboard modifie
-- statut_atelier par un update direct sur rendez_vous, scopé par garage_id
-- et protégé par RLS (components/NexoraDashboard.jsx), jamais via
-- avancer_etape_atelier. Aucune trace d'appel service_role non plus.
--
-- Ce correctif ne touche ni le corps, ni le propriétaire, ni le search_path
-- des fonctions, et ne révoque rien pour service_role au-delà de ce qui
-- était déjà en place (aucun GRANT service_role constaté sur ces objets).
-- Il ferme uniquement l'exposition anonyme/authentifiée, en attendant le
-- remplacement de ces trois parcours par un accès à jeton opaque expirable
-- (même mécanisme que /c/[token] et /i/[token]).

begin;

revoke execute
on function public.lire_etape_atelier(uuid)
from public, anon, authenticated;

revoke execute
on function public.avancer_etape_atelier(uuid, text)
from public, anon, authenticated;

revoke execute
on function public.lire_devis_public(uuid)
from public, anon, authenticated;

revoke execute
on function public.repondre_devis_public(uuid, text)
from public, anon, authenticated;

revoke execute
on function public.lire_facture_publique(uuid)
from public, anon, authenticated;

commit;
