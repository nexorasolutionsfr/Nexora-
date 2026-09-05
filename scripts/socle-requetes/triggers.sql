select
  rel.relname as table_name,
  tg.tgname as trigger_name,
  pg_get_triggerdef(tg.oid) as ddl
from pg_trigger tg
join pg_class rel on rel.oid = tg.tgrelid
join pg_namespace ns on ns.oid = rel.relnamespace
where ns.nspname = 'public' and not tg.tgisinternal
order by rel.relname, tg.tgname;
