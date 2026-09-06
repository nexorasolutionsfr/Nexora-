select
  c.relname as table_name,
  c.relrowsecurity as rls_active,
  c.relforcerowsecurity as rls_forcee,
  (select count(*) from pg_policy p where p.polrelid = c.oid) as nb_policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
