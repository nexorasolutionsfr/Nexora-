-- Durcissement : un garage authentifié ne doit pas pouvoir écrire directement
-- decision_client/decision_le sur inspections_points via l'API de données
-- (ou tout appel non prévu — console navigateur, script). Ces deux colonnes
-- ne doivent être modifiées QUE par repondre_point_inspection_par_jeton,
-- appelée uniquement depuis le parcours client sécurisé par jeton, avec ses
-- contrôles d'expiration, de révocation et d'unicité (décision immuable une
-- fois posée). Le trigger de verrouillage (20260830000900) empêchait déjà
-- toute AUTRE colonne de changer une fois verrouillée, mais le grant "update"
-- large accordé à authenticated dans 20260830000500 laissait ces deux
-- colonnes précises accessibles en écriture directe, y compris avant
-- verrouillage. Idempotent, non destructif.

revoke update on public.inspections_points from authenticated;
grant update (categorie, libelle, etat, commentaire, soumis_client) on public.inspections_points to authenticated;

-- repondre_point_inspection_par_jeton est security definer : elle s'exécute
-- avec les privilèges de son propriétaire (postgres), pas ceux de l'appelant
-- anonyme. Ce retrait de privilège à authenticated ne l'affecte donc pas.
-- Le dashboard garage n'écrit jamais ces deux colonnes (lecture seule côté
-- fiche inspection) : aucune régression fonctionnelle.
--
-- Seule action garage capable d'affecter une décision déjà posée : la
-- réouverture explicite (motif obligatoire, jetons révoqués, décisions
-- réinitialisées, tracée en historique — jamais une écriture silencieuse).
comment on column public.inspections_points.decision_client is
  'Écrit uniquement par repondre_point_inspection_par_jeton (security definer, parcours client par jeton). authenticated n''a plus le privilège UPDATE sur cette colonne.';
comment on column public.inspections_points.decision_le is
  'Écrit uniquement par repondre_point_inspection_par_jeton (security definer, parcours client par jeton). authenticated n''a plus le privilège UPDATE sur cette colonne.';
