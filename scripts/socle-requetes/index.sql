select tablename as table_name, indexname as index_name, indexdef as ddl
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;
