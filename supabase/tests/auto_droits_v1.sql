-- Nexora Auto — droits exacts sur tous les objets `auto_*` — banc en LECTURE SEULE.
--
-- Présuppose 20260922000100 → 20260922001500 appliquées. N'écrit rien.
--
-- Compare, pour `anon` et `authenticated`, les privilèges effectifs de chaque
-- table et séquence `auto_*` à la liste attendue ci-dessous. Une table `auto_*`
-- absente de la liste fait échouer le banc : toute nouvelle table doit
-- déclarer ses droits ici.

begin;

create temporary table _droits_attendus (objet text primary key, anon text not null, authenticated text not null) on commit drop;

insert into _droits_attendus (objet, anon, authenticated) values
  ('auto_vehicules',             '', 'DELETE,INSERT,SELECT,UPDATE'),
  ('auto_releves_km',            '', 'DELETE,INSERT,SELECT,UPDATE'),
  ('auto_historique',            '', 'DELETE,INSERT,SELECT,UPDATE'),
  ('auto_documents',             '', 'DELETE,INSERT,SELECT,UPDATE'),
  ('auto_taches',                '', 'DELETE,INSERT,SELECT,UPDATE'),
  ('auto_rappels_reports',       '', 'DELETE,INSERT,SELECT,UPDATE'),
  ('auto_preferences',           '', 'INSERT,SELECT,UPDATE'),
  ('auto_rappels_envois',        '', ''),
  ('auto_rappels_envois_id_seq', '', ''),
  ('auto_services',              '', 'SELECT'),
  ('auto_services_modes',        '', 'SELECT'),
  ('auto_offres',                '', 'SELECT'),
  ('auto_partenaires',           '', 'SELECT'),
  -- Accès (20260922001100) : rôle de service seulement.
  ('auto_acces_parametres',      '', ''),
  ('auto_acces_beta',            '', ''),
  -- Droits par colonne seulement (contrôlés plus bas) : aucun droit de table.
  ('auto_lectures',              '', ''),
  -- Rappels (20260922001200) : la personne LIT son abonnement et ses
  -- décisions ; elle n'écrit que par auto_activer_rappel / auto_desactiver_rappel.
  ('auto_rappels_abonnements',      '', 'SELECT'),
  ('auto_rappels_decisions',        '', 'SELECT'),
  ('auto_rappels_decisions_id_seq', '', '');

-- Les fonctions du SERVEUR : jamais exécutables par une personne connectée.
create function pg_temp.fonctions_serveur() returns text[]
language sql immutable as $$
  select array[
    'auto_lecture_reserver',
    'auto_empreinte_ct', 'auto_acces_autorise_pour', 'auto_rappel_neuf_heures',
    'auto_rappels_a_planifier', 'auto_planifier_rappels', 'auto_reserver_rappel', 'auto_terminer_rappel',
    'auto_confirmer_transmission'
  ]
$$;

create temporary view _droits_effectifs as
select c.relname as objet,
  coalesce((select string_agg(p, ',' order by p) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','USAGE']) p
            where case when c.relkind = 'S' then p in ('SELECT','UPDATE','USAGE') and has_sequence_privilege('anon', c.oid, p)
                       else p <> 'USAGE' and has_table_privilege('anon', c.oid, p) end), '') as anon,
  coalesce((select string_agg(p, ',' order by p) from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','USAGE']) p
            where case when c.relkind = 'S' then p in ('SELECT','UPDATE','USAGE') and has_sequence_privilege('authenticated', c.oid, p)
                       else p <> 'USAGE' and has_table_privilege('authenticated', c.oid, p) end), '') as authenticated
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relname like 'auto\_%' and c.relkind in ('r', 'S', 'v', 'm');

do $$
declare
  v_ligne record;
  v_ecarts text := '';
begin
  for v_ligne in
    select coalesce(e.objet, a.objet) as objet, e.anon as anon_effectif, a.anon as anon_attendu,
           e.authenticated as auth_effectif, a.authenticated as auth_attendu
    from _droits_effectifs e
    full join _droits_attendus a on a.objet = e.objet
    order by 1
  loop
    if v_ligne.anon_attendu is null then
      v_ecarts := v_ecarts || format(E'\n  %s : objet sans droits déclarés dans ce banc', v_ligne.objet);
    elsif v_ligne.anon_effectif is null then
      v_ecarts := v_ecarts || format(E'\n  %s : attendu mais absent de la base', v_ligne.objet);
    else
      if v_ligne.anon_effectif <> v_ligne.anon_attendu then
        v_ecarts := v_ecarts || format(E'\n  %s anon : « %s » au lieu de « %s »', v_ligne.objet, v_ligne.anon_effectif, v_ligne.anon_attendu);
      end if;
      if v_ligne.auth_effectif <> v_ligne.auth_attendu then
        v_ecarts := v_ecarts || format(E'\n  %s authenticated : « %s » au lieu de « %s »', v_ligne.objet, v_ligne.auth_effectif, v_ligne.auth_attendu);
      end if;
    end if;
  end loop;
  if v_ecarts <> '' then
    raise exception 'ASSERTION FAILED: droits inattendus :%', v_ecarts;
  end if;
end;
$$;

-- Journal des lectures : la personne lit statut et dates, jamais les coûts ;
-- elle n'écrit que la confirmation.
do $$
declare
  v_lecture text;
  v_ecriture text;
begin
  select string_agg(column_name, ',' order by column_name) filter (where privilege_type = 'SELECT'),
         string_agg(column_name, ',' order by column_name) filter (where privilege_type = 'UPDATE')
  into v_lecture, v_ecriture
  from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'auto_lectures' and grantee = 'authenticated';
  if v_lecture is distinct from 'confirmee_le,created_at,document_id,erreur,id,statut' or v_ecriture is distinct from 'confirmee_le,corrections' then
    raise exception 'ASSERTION FAILED: auto_lectures par colonne : lecture « % », écriture « % »', v_lecture, v_ecriture;
  end if;
  if has_any_column_privilege('anon', 'public.auto_lectures', 'SELECT') then
    raise exception 'ASSERTION FAILED: auto_lectures lisible par anon';
  end if;
end;
$$;

-- Fonctions : les déclencheurs ne s'appellent pas directement ; les fonctions
-- métier sont réservées aux personnes connectées, sauf celles du serveur
-- (lecture de facture, et le service d'envoi des rappels, 20260922001200).
do $$
declare
  v_ecarts text;
begin
  select string_agg(format('%s (anon %s, authenticated %s)', p.proname,
           has_function_privilege('anon', p.oid, 'EXECUTE'), has_function_privilege('authenticated', p.oid, 'EXECUTE')), ', ')
  into v_ecarts
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.proname like 'auto\_%'
    and (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      or (p.prorettype = 'trigger'::regtype and has_function_privilege('authenticated', p.oid, 'EXECUTE'))
      or (p.proname = any(pg_temp.fonctions_serveur()) and has_function_privilege('authenticated', p.oid, 'EXECUTE'))
      or (p.proname <> all(pg_temp.fonctions_serveur()) and p.prorettype <> 'trigger'::regtype and not has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    );
  if v_ecarts is not null then
    raise exception 'ASSERTION FAILED: droits d''exécution inattendus : %', v_ecarts;
  end if;
end;
$$;

do $$ begin raise notice 'RECETTE AUTO DROITS : tous les contrôles sont passés'; end; $$;

rollback;
