-- Lever le verrou de déploiement — en dernier, une fois le lot complet.
--
-- `20260913000050` interdisait toute adhésion active pendant l'application du
-- lot, parce que la policy permissive de `20260913000100` vit quelques
-- secondes avant que `20260913000300` ne la retire. Ce fichier rouvre le
-- rattachement des salariés, et **vérifie d'abord que la raison du verrou a
-- bien disparu** : si la policy trop large était encore là, lever le verrou
-- rouvrirait l'exposition. La migration échoue alors, et le verrou reste posé.

do $$
declare
  v_pb text := '';
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'garages'
      and policyname = 'garages_membre_select'
  ) then
    v_pb := v_pb || E'\n- la policy permissive de 000100 est toujours en place';
  end if;

  -- La porte de remplacement doit être là, sinon le lot est incomplet et
  -- rouvrir les adhésions donnerait des salariés sans espace utilisable.
  if to_regprocedure('public.mes_adhesions()') is null then
    v_pb := v_pb || E'\n- mes_adhesions() est absente';
  end if;
  if to_regprocedure('public.mon_garage_operationnel(uuid)') is null then
    v_pb := v_pb || E'\n- mon_garage_operationnel(uuid) est absente';
  end if;

  -- Le type qui a mordu sur Test : une fonction installée mais inutilisable.
  if exists (
    select 1 from information_schema.parameters
    where specific_schema = 'public' and parameter_mode = 'OUT'
      and parameter_name = 'profil_activite'
      and specific_name like 'mon_garage_operationnel%'
      and data_type <> 'ARRAY'
  ) then
    v_pb := v_pb || E'\n- mon_garage_operationnel() annonce un profil_activite non tableau';
  end if;

  if v_pb <> '' then
    raise exception 'Refus de lever le verrou : %', v_pb;
  end if;
end;
$$;

drop trigger if exists garage_membres_verrou_deploiement on public.garage_membres;
drop function if exists public.garage_membres_verrou_deploiement();

do $$
begin
  if exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'garage_membres'
      and t.tgname = 'garage_membres_verrou_deploiement' and not t.tgisinternal
  ) then
    raise exception 'Migration 20260913000600 incomplete : le verrou est toujours pose';
  end if;
  raise notice 'Verrou de deploiement leve : le rattachement des salaries est rouvert';
end;
$$;
