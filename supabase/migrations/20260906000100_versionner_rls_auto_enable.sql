-- Lot sécurité anon — 1/3 : verser `rls_auto_enable()` dans l'historique
-- versionné, sans rien changer.
--
-- Cette fonction n'a jamais été créée par une migration : elle n'existait
-- qu'en base, comme `current_garage_id()` avant sa reprise du 2026-09-02.
-- Une reconstruction du schéma depuis les seules migrations l'aurait donc
-- perdue. Le corps ci-dessous est repris **à l'identique** de la définition
-- relevée le 2026-09-05 sur Test et sur Production, vérifiée octet pour
-- octet comme étant la même sur les deux projets.
--
-- `create or replace` préserve les privilèges EXECUTE existants : cette
-- migration ne modifie aucun droit. Le droit accordé à `anon` est sans
-- effet — une fonction qui renvoie `event_trigger` ne peut être invoquée
-- que par le moteur de déclencheurs d'événements, jamais par un appel SQL
-- direct ni par PostgREST. Il n'est donc pas refermé ici, pour garder ce lot
-- limité à ce qui a un effet réel.
--
-- **Le déclencheur d'événement `ensure_rls` n'est ni créé, ni modifié, ni
-- supprimé par cette migration.** Il existe en Production et est absent de
-- Test ; cette divergence est documentée dans
-- docs/architecture/lot-securite-anon-v1.md et volontairement laissée en
-- l'état.

create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

comment on function public.rls_auto_enable() is
  'Active automatiquement RLS sur toute table créée dans public. Versionnée le 2026-09-05 sans modification. Le déclencheur qui l''appelle (ensure_rls) est enregistré en Production et absent de Test : voir docs/architecture/lot-securite-anon-v1.md.';
