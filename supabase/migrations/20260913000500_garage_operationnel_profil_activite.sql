-- Corriger le type de `profil_activite` dans la projection du salarié.
--
-- 20260913000400 déclare `profil_activite text`. La colonne est un `text[]`.
-- PostgreSQL ne s'en aperçoit qu'à l'exécution : la fonction s'installe sans
-- broncher, puis tout appel abouti échoue sur
-- « structure of query does not match function result type ». Constaté sur
-- Test le 2026-09-13, dès la première lecture par un compte accueil.
--
-- Le bloc de contrôle de la 000400 vérifiait ce que la fonction *ne rend pas*
-- — les colonnes sensibles — mais jamais que ce qu'elle rend est typé comme
-- la table. C'est ce contrôle-là qui manquait, et qui est ajouté ici : chaque
-- paramètre de sortie est comparé au type réel de la colonne de `garages`.
--
-- Le type de retour change : `create or replace` refuserait (42P13). La
-- fonction est donc supprimée puis recréée, droits reposés dans le même
-- fichier. Rien d'autre ne la référence.

drop function if exists public.mon_garage_operationnel(uuid);

create function public.mon_garage_operationnel(p_garage_id uuid)
returns table (
  id uuid,
  nom_garage text,
  adresse text,
  telephone text,
  email text,
  horaires jsonb,
  theme text,
  modules_actifs jsonb,
  profil_activite text[],
  canaux_notifications jsonb,
  rappel_confirmation_actif boolean,
  delai_confirmation_rdv_h integer,
  automatisation_active boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Prédicat unique : rôle **et** accès ouvert. Le mécanicien reste dehors,
  -- ses écrans ne lisant aucun de ces champs. Voir 20260913000400.
  if not public.a_acces_garage(p_garage_id, 'dirigeant', 'accueil') then
    return;
  end if;

  return query
    select g.id,
           g.nom_garage,
           g.adresse,
           g.telephone,
           g.email,
           g.horaires,
           g.theme,
           g.modules_actifs,
           g.profil_activite,
           g.canaux_notifications,
           g.rappel_confirmation_actif,
           g.delai_confirmation_rdv_h,
           g.automatisation_active
    from public.garages g
    where g.id = p_garage_id;
end;
$$;

comment on function public.mon_garage_operationnel(uuid) is
  'Les réglages du garage qu''un salarié voit à l''écran : identité affichée, horaires, notifications. Réservée au dirigeant et à l''accueil, et soumise au verrou d''accès par a_acces_garage() — un garage échu ne sert plus rien. Projection explicite : ni identifiants de facturation, ni SIREN, ni objectif de chiffre d''affaires, ni propriétaire. Types alignés sur la table le 2026-09-13.';

revoke execute on function public.mon_garage_operationnel(uuid) from public, anon, service_role;
grant execute on function public.mon_garage_operationnel(uuid) to authenticated;

do $$
declare
  v_pb text := '';
  v_corps text;
  r record;
begin
  select p.prosrc into v_corps
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'mon_garage_operationnel';

  if v_corps is null then
    v_pb := v_pb || E'\n- la fonction est absente';
  else
    if position('a_acces_garage' in v_corps) = 0 then
      v_pb := v_pb || E'\n- le corps n''appelle pas a_acces_garage()';
    end if;
    if position('mecanicien' in v_corps) > 0 then
      v_pb := v_pb || E'\n- le role mecanicien est admis';
    end if;
  end if;

  -- Le contrôle qui manquait : chaque paramètre de sortie doit porter le type
  -- de la colonne homonyme de `garages`. Une divergence ne se voit pas à
  -- l'installation, seulement au premier appel abouti.
  for r in
    select p.parameter_name, p.data_type as type_fonction, c.data_type as type_table
    from information_schema.parameters p
    join information_schema.columns c
      on c.table_schema = 'public' and c.table_name = 'garages'
     and c.column_name = p.parameter_name
    where p.specific_schema = 'public'
      and p.parameter_mode = 'OUT'
      and p.specific_name like 'mon_garage_operationnel%'
  loop
    if r.type_fonction is distinct from r.type_table then
      v_pb := v_pb || E'\n- ' || r.parameter_name || ' : la fonction annonce '
              || r.type_fonction || ', la table porte ' || r.type_table;
    end if;
  end loop;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'garages'
      and policyname = 'garages_membre_select'
  ) then
    v_pb := v_pb || E'\n- la policy trop large est reapparue';
  end if;

  if v_pb <> '' then
    raise exception 'Migration 20260913000500 incomplete : %', v_pb;
  end if;
  raise notice 'Projection operationnelle alignee sur les types de garages';
end;
$$;
