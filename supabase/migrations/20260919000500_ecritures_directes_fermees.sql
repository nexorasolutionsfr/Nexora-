-- Fermer les écritures directes sur les trois tables alimentées par fonction.
--
-- ================================================================
-- CE QUI A ÉTÉ TROUVÉ (base jetable du 14 septembre 2026)
-- ================================================================
--
-- `devis_reprises` (20260919000100), `devis_insertions_modeles`
-- (20260919000200) et `relances_travaux` (20260919000400) ne s'écrivent QUE
-- par leurs fonctions SECURITY DEFINER. Les migrations révoquaient `public` et
-- `anon`, puis accordaient `select` à `authenticated` — mais Supabase accorde
-- par défaut TOUS les privilèges de table à `authenticated` à la création.
-- `authenticated` gardait donc insert / update / delete.
--
-- Ce n'était pas une écriture possible : la RLS est active sur les trois
-- tables et seule une politique de LECTURE existe, donc toute écriture
-- directe est refusée. Mais une seule barrière tenait là où le commentaire en
-- annonçait deux. On ferme aussi le privilège.
--
-- Le contrôle qui l'a vu : docs/recette/controles-base-jetable-2026-09-14.sql.
--
-- Retour arrière : sans objet (aucun code n'écrit directement ces tables).

revoke insert, update, delete, truncate, references, trigger
  on table public.devis_reprises, public.devis_insertions_modeles, public.relances_travaux
  from authenticated;

grant select on table public.devis_reprises, public.devis_insertions_modeles, public.relances_travaux
  to authenticated;
