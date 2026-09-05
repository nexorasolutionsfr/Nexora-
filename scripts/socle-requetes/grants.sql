select 'table' as genre, c.relname as objet, '' as args, g.grantee, g.privilege_type
from information_schema.role_table_grants g
join pg_class c on c.relname = g.table_name
join pg_namespace n on n.oid = c.relnamespace and n.nspname = g.table_schema
where g.table_schema = 'public' and c.relkind = 'r'
  and g.grantee in ('anon','authenticated','service_role','PUBLIC')
union all
select 'fonction', p.proname, pg_get_function_identity_arguments(p.oid), r.rolname, 'EXECUTE'
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
join pg_language l on l.oid = p.prolang and l.lanname in ('sql','plpgsql')
cross join (select unnest(array['anon','authenticated','service_role']) as rolname) r
where has_function_privilege(r.rolname, p.oid, 'EXECUTE')
order by 1, 2, 3, 4, 5;
