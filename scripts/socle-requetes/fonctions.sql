select
  p.proname as nom,
  pg_get_function_identity_arguments(p.oid) as args,
  pg_get_functiondef(p.oid) as ddl,
  p.prosecdef as security_definer,
  l.lanname as langage
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'public' and l.lanname in ('sql','plpgsql')
order by p.proname, args;
