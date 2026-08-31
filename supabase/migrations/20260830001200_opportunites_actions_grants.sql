-- Cockpit Opportunités — privilèges Data API.
-- "Automatically expose new tables" est désactivé sur ce projet : sans ce
-- GRANT explicite, RLS seule ne suffit pas (même piège déjà rencontré sur
-- travaux_differes et inspections). Idempotent, non destructif.

grant select, insert on public.opportunites_actions to authenticated;

-- Volontairement AUCUN grant update/delete, même au propriétaire du garage :
-- l'historique des actions (traiter/reporter/réactiver) ne doit jamais être
-- modifié ni supprimé, seulement complété par de nouvelles lignes (ex. une
-- "réactivation" ajoute une trace, elle n'efface pas la précédente).
-- Aucun droit à anon : jamais lu ni écrit publiquement.
