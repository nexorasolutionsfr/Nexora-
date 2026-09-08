-- Les fonctions d'empreinte ne doivent pas être appelables par tout le monde.
--
-- Relevé à la revue : `empreinte_devis` et `empreinte_facture` avaient été
-- créées sans `revoke`. Or Postgres accorde EXECUTE à PUBLIC par défaut :
-- n'importe quel appelant anonyme pouvait les invoquer. Elles ne rendent
-- qu'une empreinte, mais elles distinguent un identifiant qui existe (une
-- valeur) d'un identifiant qui n'existe pas (null) — une façon de sonder la
-- base sans y avoir accès.
--
-- Elles ne servent qu'au traitement interne et aux fonctions d'autorisation,
-- qui sont SECURITY DEFINER et les appellent en leur propre nom. Personne
-- d'autre n'a besoin de les exécuter.

revoke execute on function public.empreinte_devis(uuid) from public, anon, authenticated;
revoke execute on function public.empreinte_facture(uuid) from public, anon, authenticated;
grant execute on function public.empreinte_devis(uuid) to service_role;
grant execute on function public.empreinte_facture(uuid) to service_role;
