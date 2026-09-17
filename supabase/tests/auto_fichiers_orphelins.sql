-- Nexora Auto — relevé des fichiers orphelins (lecture seule).
--
-- Un fichier du compartiment privé `auto-documents` sans fiche
-- `auto_documents` (dépôt interrompu entre l'envoi et l'enregistrement,
-- retrait du fichier en échec après une suppression), ou l'inverse.
-- Ne modifie rien. À passer sur Test après une recette, et avant toute
-- opération de nettoyage décidée à part.
--
--   supabase db query --linked -f supabase/tests/auto_fichiers_orphelins.sql

select
  (select count(*) from storage.objects o
    where o.bucket_id = 'auto-documents'
      and not exists (select 1 from public.auto_documents d where d.chemin = o.name)) as fichiers_sans_fiche,
  (select count(*) from public.auto_documents d
    where not exists (select 1 from storage.objects o where o.bucket_id = 'auto-documents' and o.name = d.chemin)) as fiches_sans_fichier,
  (select count(*) from storage.objects o where o.bucket_id = 'auto-documents') as fichiers,
  (select count(*) from public.auto_documents) as fiches;
