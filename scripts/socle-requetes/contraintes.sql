select
  rel.relname as table_name,
  con.conname as constraint_name,
  con.contype::text as contype,
  pg_get_constraintdef(con.oid) as ddl
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace ns on ns.oid = rel.relnamespace
where ns.nspname = 'public' and rel.relkind = 'r'
order by rel.relname, con.contype, con.conname;
