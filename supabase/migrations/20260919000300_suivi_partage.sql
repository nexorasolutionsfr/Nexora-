-- Le suivi « traité / reporté » devient celui de l'équipe, pas du seul propriétaire.
--
-- ================================================================
-- 1. CE QUI ÉTAIT FAUX
-- ================================================================
--
-- `opportunites_actions` — le journal des gestes « Marquer traité »,
-- « Reporter », « Réactiver » de l'écran Aujourd'hui — n'était lisible et
-- inscriptible que par le PROPRIÉTAIRE du garage (`mes_garages_ouverts()`).
-- Conséquence, notée le 14 septembre 2026 (docs/architecture/aujourdhui-a-traiter.md) :
-- après un « Marquer traité » du dirigeant, l'accueil continuait de voir la
-- ligne, et pouvait refaire le geste ; et ses propres gestes échouaient en
-- silence. Deux personnes, deux listes, un seul comptoir.
--
-- ================================================================
-- 2. CE QUE FAIT CETTE MIGRATION
-- ================================================================
--
-- La politique s'appuie désormais sur `a_acces_garage(garage_id, 'dirigeant',
-- 'accueil')` : une adhésion ACTIVE et un rôle, jamais la simple connaissance
-- d'un `garage_id`. Une révocation prend effet à la requête suivante — la
-- fonction relit `garage_membres` à chaque appel.
--
-- Le sens des lignes ne change pas. Le journal était déjà un journal du
-- GARAGE (une ligne par geste, rattachée au garage et à la source), lu comme
-- tel par `deriveOpportunites` — il n'y a pas de « préférence personnelle »
-- à convertir. L'auteur reste dans `effectue_par`, posé par le trigger
-- `opportunites_actions_forcer_identite` (auth.uid()), et l'écran continue de
-- l'afficher. Aucune ligne existante n'est modifiée.
--
-- Le mécanicien n'y accède toujours pas : il ne lit aucune table.
--
-- Retour arrière : recréer `opportunites_actions_isolation` telle qu'en
-- 20260830001100.

drop policy if exists opportunites_actions_isolation on public.opportunites_actions;
drop policy if exists opportunites_actions_equipe_select on public.opportunites_actions;
drop policy if exists opportunites_actions_equipe_insert on public.opportunites_actions;

create policy opportunites_actions_equipe_select on public.opportunites_actions
  for select to authenticated
  using (public.a_acces_garage(garage_id, 'dirigeant', 'accueil'));

-- Le journal est en ajout seul : un geste ne se réécrit pas, il s'annule par
-- un autre geste (« Réactiver »). Pas de politique update/delete.
create policy opportunites_actions_equipe_insert on public.opportunites_actions
  for insert to authenticated
  with check (public.a_acces_garage(garage_id, 'dirigeant', 'accueil'));

comment on table public.opportunites_actions is
  'Journal des gestes de suivi de l''écran Aujourd''hui (traité / reporté / réactivé), partagé par le dirigeant et l''accueil du garage depuis le 2026-09-19. Ajout seul ; l''auteur est effectue_par (trigger).';
