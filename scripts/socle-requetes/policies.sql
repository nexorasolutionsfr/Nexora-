select
  tablename as table_name,
  policyname as policy_name,
  permissive,
  roles::text as roles,
  cmd,
  coalesce(qual, '') as qual,
  coalesce(with_check, '') as with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
